import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  MEDIA_DIR,
  activeJobs,
  countInFlight,
  db,
  getSetting,
  insertGeneration,
  updateJob,
  type JobRow,
  type JobStatus,
} from "./db";
import {
  HiggsfieldError,
  MissingCredentialsError,
  extractOutputs,
  getStatus,
  hasCredentials,
  submit,
} from "./higgsfield";

/**
 * Server-side job engine.
 *
 * The browser never polls Higgsfield directly — it polls our database. This
 * module owns the upstream conversation, which means a generation survives the
 * user closing the tab, and (because state lives in SQLite) a dev-server
 * restart too.
 */

const TICK_MS = 1000;
const POLL_START_MS = 2000; // docs: "start with a two-second interval"
const POLL_MAX_MS = 10_000; // docs: "increase the interval gradually up to ten seconds"
const POLL_FACTOR = 1.5;
const DEFAULT_MAX_CONCURRENT = 4;
/** Used when the API says to retry but doesn't say when. */
const RETRY_FALLBACK_MS = 30_000;

/** Give up on a job that never reaches a terminal state. */
const TIMEOUT_MS: Record<string, number> = {
  image: 15 * 60_000,
  video: 45 * 60_000,
};

function maxConcurrent(): number {
  const raw = getSetting("max_concurrent");
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_CONCURRENT;
}

/**
 * Map Higgsfield's status strings onto ours. Anything unrecognised and
 * non-terminal is treated as still running rather than as an error.
 */
function mapStatus(remote: string): JobStatus {
  switch (remote) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "nsfw":
      return "nsfw";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "queued":
      return "queued";
    default:
      return "in_progress";
  }
}

// Next.js hot-reloads modules in dev; without this the interval would be
// installed several times over and every job would be polled in duplicate.
const globalForWorker = globalThis as unknown as {
  __hfWorker?: { timer: NodeJS.Timeout; busy: Set<string> };
};

export function ensureWorker(): void {
  if (globalForWorker.__hfWorker) return;
  const state = { timer: setInterval(tick, TICK_MS), busy: new Set<string>() };
  globalForWorker.__hfWorker = state;
  // Unref so the interval never holds a process open on its own.
  state.timer.unref?.();
}

function busy(): Set<string> {
  ensureWorker();
  return globalForWorker.__hfWorker!.busy;
}

let ticking = false;

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    if (!hasCredentials()) return;

    const jobs = activeJobs();
    const inFlight = busy();
    const now = Date.now();
    let slots = maxConcurrent() - countInFlight();

    for (const job of jobs) {
      if (inFlight.has(job.id)) continue;

      if (job.status === "pending") {
        // A job told to back off carries its wait in next_poll_at.
        if (job.next_poll_at > now) continue;
        if (slots <= 0) continue;
        slots -= 1;
        inFlight.add(job.id);
        void submitJob(job).finally(() => inFlight.delete(job.id));
        continue;
      }

      if (job.status === "downloading") {
        // Interrupted mid-download by a restart; redo it from scratch.
        inFlight.add(job.id);
        void finish(job).finally(() => inFlight.delete(job.id));
        continue;
      }

      if (job.next_poll_at <= now) {
        inFlight.add(job.id);
        void pollJob(job).finally(() => inFlight.delete(job.id));
      }
    }
  } catch (err) {
    console.error("[worker] tick failed:", err);
  } finally {
    ticking = false;
  }
}

async function submitJob(job: JobRow): Promise<void> {
  try {
    const body = JSON.parse(job.params) as Record<string, unknown>;
    const res = await submit(job.endpoint, body);
    updateJob(job.id, {
      request_id: res.request_id,
      submitted_at: Date.now(),
      status: mapStatus(res.status ?? "queued"),
      poll_interval: POLL_START_MS,
      next_poll_at: Date.now() + POLL_START_MS,
    });
  } catch (err) {
    if (err instanceof HiggsfieldError && err.retryable) {
      // Back-pressure, not a failure: the account queue is full or too many
      // requests are in flight. Stay `pending` and wait out the delay the API
      // asked for before trying again.
      const wait = err.retryAfterMs || RETRY_FALLBACK_MS;
      updateJob(job.id, { next_poll_at: Date.now() + wait });
      return;
    }
    if (err instanceof MissingCredentialsError) return;
    if (err instanceof HiggsfieldError && err.status === 404) {
      updateJob(job.id, {
        status: "failed",
        error: "This model is not offered on your Higgsfield plan.",
      });
      return;
    }
    if (err instanceof HiggsfieldError && err.status === 503) {
      // Higgsfield switches models off from time to time — Veo 3.1 worked in
      // August and is off now. Say so rather than surfacing "model_disabled".
      updateJob(job.id, {
        status: "failed",
        error: "Higgsfield has this model temporarily disabled.",
      });
      return;
    }
    if (err instanceof HiggsfieldError && err.status === 423) {
      updateJob(job.id, {
        status: "failed",
        error: "This model is blocked for your account.",
      });
      return;
    }
    updateJob(job.id, { status: "failed", error: describe(err) });
  }
}

async function pollJob(job: JobRow): Promise<void> {
  if (!job.request_id) {
    updateJob(job.id, { status: "failed", error: "Job has no upstream request id." });
    return;
  }

  // Measured from when the job actually reached Higgsfield. Using created_at
  // meant time spent waiting locally for a slot — which can be many minutes
  // when the account queue is full — counted against the timeout, and killed
  // jobs that had never been submitted.
  const age = Date.now() - (job.submitted_at ?? job.created_at);
  if (age > (TIMEOUT_MS[job.kind] ?? TIMEOUT_MS.video)) {
    updateJob(job.id, {
      status: "failed",
      error: `Timed out after ${Math.round(age / 60_000)} minutes with no result.`,
    });
    return;
  }

  try {
    const res = await getStatus(job.request_id);
    const status = mapStatus(res.status);

    if (status === "completed") {
      updateJob(job.id, { status: "downloading" });
      await finish({ ...job, status: "downloading" });
      return;
    }

    if (status === "failed" || status === "nsfw" || status === "canceled") {
      updateJob(job.id, {
        status,
        error:
          status === "nsfw"
            ? "Blocked by content moderation. You were not charged."
            : describeRemote(res.error) ?? "The request failed upstream. You were not charged.",
      });
      return;
    }

    // Still running — back off gradually, as the docs recommend.
    const next = Math.min(job.poll_interval * POLL_FACTOR, POLL_MAX_MS);
    updateJob(job.id, { status, poll_interval: next, next_poll_at: Date.now() + next });
  } catch (err) {
    if (err instanceof MissingCredentialsError) return;
    // A transient network blip shouldn't kill a job that may still be running;
    // only a definitive 404 from Higgsfield means it's gone.
    if (err instanceof HiggsfieldError && err.status === 404) {
      updateJob(job.id, { status: "failed", error: "Upstream request no longer exists." });
      return;
    }
    const next = Math.min(job.poll_interval * POLL_FACTOR, POLL_MAX_MS);
    updateJob(job.id, { poll_interval: next, next_poll_at: Date.now() + next });
  }
}

/**
 * Download every output to disk and mark the job complete.
 *
 * Higgsfield removes generated files after about a week, so this is what makes
 * the library durable. Generation rows are rewritten from scratch to stay
 * idempotent if a restart interrupted an earlier attempt.
 */
async function finish(job: JobRow): Promise<void> {
  try {
    const res = await getStatus(job.request_id!);
    const outputs = extractOutputs(res);

    if (!outputs.length) {
      updateJob(job.id, { status: "failed", error: "Completed upstream but returned no output." });
      return;
    }

    db().prepare("DELETE FROM generations WHERE job_id = ?").run(job.id);
    fs.mkdirSync(MEDIA_DIR, { recursive: true });

    for (const [i, out] of outputs.entries()) {
      const saved = await download(out.url, `${job.id}-${i}`);
      insertGeneration({
        id: randomUUID(),
        job_id: job.id,
        kind: out.kind,
        remote_url: out.url,
        local_path: saved?.file ?? null,
        mime: saved?.mime ?? null,
        bytes: saved?.bytes ?? null,
      });
    }

    updateJob(job.id, { status: "completed", error: null });
  } catch (err) {
    updateJob(job.id, { status: "failed", error: describe(err) });
  }
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
};

async function download(
  url: string,
  basename: string,
): Promise<{ file: string; mime: string; bytes: number } | null> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download output: ${res.status} ${res.statusText}`);

  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "application/octet-stream";
  const fromUrl = new URL(url).pathname.split(".").pop()?.toLowerCase();
  const ext =
    EXT_BY_MIME[mime] ?? (fromUrl && /^[a-z0-9]{2,5}$/.test(fromUrl) ? fromUrl : "bin");

  const filename = `${basename}.${ext}`;
  const buf = Buffer.from(await res.arrayBuffer());
  // turbopackIgnore: MEDIA_DIR is a runtime storage path, not a bundled asset.
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ MEDIA_DIR, filename), buf);

  return { file: filename, mime, bytes: buf.byteLength };
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function describeRemote(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return JSON.stringify(error);
}
