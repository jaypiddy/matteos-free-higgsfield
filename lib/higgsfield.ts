import { getSetting } from "./db";

/**
 * The only module that talks to api.higgsfield.ai.
 *
 * Auth is a two-part key sent as `Authorization: Key <id>:<secret>`. Credentials
 * come from the settings table, falling back to env vars so the app can also be
 * driven from a shell.
 */

const BASE = "https://api.higgsfield.ai";
const USER_AGENT = "higgsfield-studio/1.0";

export class HiggsfieldError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /**
     * Whether this is a back-pressure signal rather than a real failure, in
     * which case the job should wait and try again instead of being failed.
     *
     * Higgsfield expresses this two different ways:
     *   - a 400 whose text mentions "maximum number of concurrent requests"
     *   - a structured body: {"code":"account_queue_full","retryable":true,
     *     "limit":10,"retry_after_seconds":30}
     * The second shape has no `detail` field, so an earlier version of this
     * parser passed it straight through and the worker failed the job.
     */
    readonly retryable = false,
    /** How long to wait before retrying, when the API says. */
    readonly retryAfterMs = 0,
    /** Machine-readable code, when present (e.g. `account_queue_full`). */
    readonly code?: string,
  ) {
    super(message);
    this.name = "HiggsfieldError";
  }
}

export class MissingCredentialsError extends Error {
  constructor() {
    super("Higgsfield API key not set. Add it under Settings.");
    this.name = "MissingCredentialsError";
  }
}

export function credentials(): { id: string; secret: string } | null {
  const id = getSetting("hf_key_id") ?? process.env.HF_API_KEY_ID ?? "";
  const secret = getSetting("hf_key_secret") ?? process.env.HF_API_KEY_SECRET ?? "";
  if (!id || !secret) return null;
  return { id, secret };
}

export function hasCredentials(): boolean {
  return credentials() !== null;
}

function authHeaders(): Record<string, string> {
  const creds = credentials();
  if (!creds) throw new MissingCredentialsError();
  return {
    Authorization: `Key ${creds.id}:${creds.secret}`,
    "Content-Type": "application/json",
    // Higgsfield sits behind Cloudflare, which blocks some default client
    // user-agents outright (Cloudflare error 1010). Always send our own.
    "User-Agent": USER_AGENT,
  };
}

const CONCURRENCY_HINT = /maximum number of concurrent requests/i;

async function call<T>(pathname: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${pathname}`, { ...init, headers: authHeaders() });
  const text = await res.text();

  if (!res.ok) {
    // Two error shapes exist: {"detail": "..."} and a structured
    // {"code","message","retryable","retry_after_seconds"}. Handle both.
    let detail = text;
    let retryable = false;
    let retryAfterMs = 0;
    let code: string | undefined;

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.detail === "string") detail = parsed.detail;
      else if (parsed?.detail) detail = JSON.stringify(parsed.detail);
      else if (typeof parsed?.message === "string") detail = parsed.message;

      if (typeof parsed?.code === "string") code = parsed.code;
      if (parsed?.retryable === true) retryable = true;
      if (typeof parsed?.retry_after_seconds === "number") {
        retryAfterMs = parsed.retry_after_seconds * 1000;
      }
    } catch {
      /* keep raw body */
    }

    // The older concurrency rejection is plain text with no retryable flag.
    if (res.status === 400 && CONCURRENCY_HINT.test(detail)) retryable = true;

    // A Retry-After header would take precedence, if one is ever sent.
    const header = Number(res.headers.get("retry-after"));
    if (Number.isFinite(header) && header > 0) retryAfterMs = header * 1000;

    throw new HiggsfieldError(
      detail || `${res.status} ${res.statusText}`,
      res.status,
      retryable,
      retryAfterMs,
      code,
    );
  }

  return (text ? JSON.parse(text) : {}) as T;
}

// ------------------------------------------------------------------ requests

export interface SubmitResponse {
  status: string;
  request_id: string;
  status_url?: string;
  cancel_url?: string;
}

export interface OutputFile {
  url?: string;
  [k: string]: unknown;
}

export interface StatusResponse {
  status: string;
  request_id: string;
  error?: unknown;
  images?: OutputFile[];
  video?: OutputFile;
  audio?: OutputFile;
  audios?: OutputFile[];
}

export function submit(modelPath: string, body: unknown): Promise<SubmitResponse> {
  return call<SubmitResponse>(modelPath, { method: "POST", body: JSON.stringify(body) });
}

export function getStatus(requestId: string): Promise<StatusResponse> {
  return call<StatusResponse>(`/requests/${requestId}/status`, { method: "GET" });
}

export function cancel(requestId: string): Promise<unknown> {
  return call(`/requests/${requestId}/cancel`, { method: "POST" });
}

/**
 * Two shapes come back from /estimate. Fixed-price models return credits and
 * usd; token-metered ones (Seedance 2.5) return a prose pricing description
 * instead, because the charge isn't knowable until the request has run.
 */
export type Estimate =
  | { type?: "estimate"; credits: string; usd: string; discount?: unknown }
  | { type: "description"; pricing_description: string };

export function isMetered(e: Estimate): e is { type: "description"; pricing_description: string } {
  return (e as { type?: string }).type === "description";
}

/** Same body as the generation call, against the /estimate/ mirror of the path. */
export function estimate(modelPath: string, body: unknown): Promise<Estimate> {
  return call<Estimate>(`/estimate${modelPath}`, { method: "POST", body: JSON.stringify(body) });
}

/**
 * Pull the output URLs out of a completed status payload. The shape depends on
 * the model: image models return `images[]`, video models return a single
 * `video`, audio models return `audio`/`audios`.
 */
export function extractOutputs(s: StatusResponse): Array<{ kind: string; url: string }> {
  const out: Array<{ kind: string; url: string }> = [];
  for (const img of s.images ?? []) {
    if (img?.url) out.push({ kind: "image", url: img.url });
  }
  if (s.video?.url) out.push({ kind: "video", url: s.video.url });
  if (s.audio?.url) out.push({ kind: "audio", url: s.audio.url });
  for (const a of s.audios ?? []) {
    if (a?.url) out.push({ kind: "audio", url: a.url });
  }
  return out;
}

// ------------------------------------------------------------------- uploads

interface UploadTicket {
  upload_url: string;
  public_url: string;
  upload_headers?: Record<string, string>;
}

/**
 * Three-step upload: ask for a presigned URL, PUT the bytes straight to storage,
 * then hand the returned public URL to a model as `image_url` and friends.
 */
export async function uploadFile(bytes: ArrayBuffer, contentType: string): Promise<string> {
  const ticket = await call<UploadTicket>("/files/generate-upload-url", {
    method: "POST",
    body: JSON.stringify({ content_type: contentType }),
  });

  // Deliberately does NOT reuse authHeaders(): the presigned URL points at
  // object storage, and our Higgsfield key must never be sent there.
  const res = await fetch(ticket.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "User-Agent": USER_AGENT,
      ...(ticket.upload_headers ?? {}),
    },
    body: bytes,
  });

  if (!res.ok) {
    throw new HiggsfieldError(
      `Upload failed: ${res.status} ${res.statusText}`,
      res.status,
    );
  }

  return ticket.public_url;
}
