import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

/**
 * Local persistence.
 *
 * Higgsfield deletes generated output after roughly seven days, so anything we
 * want to keep has to live here. `generations.local_path` points at a file we
 * downloaded ourselves; `remote_url` is kept only for reference and will rot.
 */

export const STORAGE_DIR = path.join(process.cwd(), "storage");
export const MEDIA_DIR = path.join(STORAGE_DIR, "media");
const DB_PATH = path.join(STORAGE_DIR, "studio.db");

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const conn = new Database(DB_PATH);
  conn.pragma("journal_mode = WAL");
  conn.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id            TEXT PRIMARY KEY,
      request_id    TEXT,
      model_id      TEXT NOT NULL,
      model_name    TEXT NOT NULL,
      endpoint      TEXT NOT NULL,
      kind          TEXT NOT NULL,
      prompt        TEXT NOT NULL,
      params        TEXT NOT NULL,
      batch         INTEGER NOT NULL DEFAULT 1,
      status        TEXT NOT NULL,
      error         TEXT,
      est_usd       REAL,
      est_credits   REAL,
      submitted_at  INTEGER,
      poll_interval REAL NOT NULL DEFAULT 2000,
      next_poll_at  INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS generations (
      id         TEXT PRIMARY KEY,
      job_id     TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL,
      remote_url TEXT,
      local_path TEXT,
      mime       TEXT,
      bytes      INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status  ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gen_job      ON generations(job_id);
    CREATE INDEX IF NOT EXISTS idx_gen_created  ON generations(created_at DESC);
  `);

  // Migration for databases created before `submitted_at` existed. Cheap to
  // attempt every boot, and harmless once the column is there.
  try {
    conn.exec("ALTER TABLE jobs ADD COLUMN submitted_at INTEGER");
  } catch {
    /* already present */
  }

  _db = conn;
  return conn;
}

// ------------------------------------------------------------------ settings

export function getSetting(key: string): string | null {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

// --------------------------------------------------------------------- types

/**
 * `pending`     — accepted locally, waiting for a concurrency slot
 * `queued` / `in_progress` — Higgsfield's own non-terminal states
 * `downloading` — completed upstream, we're pulling the files down
 * `completed` / `failed` / `nsfw` / `canceled` — terminal
 */
export type JobStatus =
  | "pending"
  | "queued"
  | "in_progress"
  | "downloading"
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled";

export const TERMINAL: JobStatus[] = ["completed", "failed", "nsfw", "canceled"];

export interface JobRow {
  id: string;
  request_id: string | null;
  model_id: string;
  model_name: string;
  endpoint: string;
  kind: "image" | "video";
  prompt: string;
  params: string;
  batch: number;
  status: JobStatus;
  error: string | null;
  est_usd: number | null;
  est_credits: number | null;
  submitted_at: number | null;
  poll_interval: number;
  next_poll_at: number;
  created_at: number;
  updated_at: number;
}

export interface GenerationRow {
  id: string;
  job_id: string;
  kind: string;
  remote_url: string | null;
  local_path: string | null;
  mime: string | null;
  bytes: number | null;
  created_at: number;
}

export interface JobWithOutputs extends Omit<JobRow, "params"> {
  params: Record<string, unknown>;
  outputs: GenerationRow[];
}

// ----------------------------------------------------------------- job reads

function hydrate(row: JobRow, outputs: GenerationRow[]): JobWithOutputs {
  const { params, ...rest } = row;
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(params);
  } catch {
    parsed = {};
  }
  return { ...rest, params: parsed, outputs };
}

export function listJobs(opts: { kind?: "image" | "video"; limit?: number } = {}): JobWithOutputs[] {
  const limit = opts.limit ?? 100;
  const rows = (
    opts.kind
      ? db()
          .prepare("SELECT * FROM jobs WHERE kind = ? ORDER BY created_at DESC LIMIT ?")
          .all(opts.kind, limit)
      : db().prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?").all(limit)
  ) as JobRow[];

  if (!rows.length) return [];

  // One query for all outputs rather than N.
  const ids = rows.map((r) => r.id);
  const gens = db()
    .prepare(
      `SELECT * FROM generations WHERE job_id IN (${ids.map(() => "?").join(",")}) ORDER BY created_at ASC`,
    )
    .all(...ids) as GenerationRow[];

  const byJob = new Map<string, GenerationRow[]>();
  for (const g of gens) {
    const arr = byJob.get(g.job_id) ?? [];
    arr.push(g);
    byJob.set(g.job_id, arr);
  }

  return rows.map((r) => hydrate(r, byJob.get(r.id) ?? []));
}

export function getJob(id: string): JobWithOutputs | null {
  const row = db().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
  if (!row) return null;
  const gens = db()
    .prepare("SELECT * FROM generations WHERE job_id = ? ORDER BY created_at ASC")
    .all(id) as GenerationRow[];
  return hydrate(row, gens);
}

// ---------------------------------------------------------------- job writes

export function insertJob(job: {
  id: string;
  model_id: string;
  model_name: string;
  endpoint: string;
  kind: "image" | "video";
  prompt: string;
  params: Record<string, unknown>;
  batch: number;
  est_usd: number | null;
  est_credits: number | null;
}): void {
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO jobs (id, model_id, model_name, endpoint, kind, prompt, params, batch,
                         status, est_usd, est_credits, next_poll_at, created_at, updated_at)
       VALUES (@id, @model_id, @model_name, @endpoint, @kind, @prompt, @params, @batch,
               'pending', @est_usd, @est_credits, 0, @now, @now)`,
    )
    .run({ ...job, params: JSON.stringify(job.params), now });
}

export function updateJob(id: string, fields: Partial<JobRow>): void {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k) => `${k} = @${k}`).join(", ");
  db()
    .prepare(`UPDATE jobs SET ${set}, updated_at = @updated_at WHERE id = @id`)
    .run({ ...fields, id, updated_at: Date.now() });
}

export function insertGeneration(gen: Omit<GenerationRow, "created_at">): void {
  db()
    .prepare(
      `INSERT INTO generations (id, job_id, kind, remote_url, local_path, mime, bytes, created_at)
       VALUES (@id, @job_id, @kind, @remote_url, @local_path, @mime, @bytes, @created_at)`,
    )
    .run({ ...gen, created_at: Date.now() });
}

/**
 * Remove a job, its generation rows, and the files downloaded for it.
 *
 * Used to clear out failures, which hold nothing worth keeping — Higgsfield
 * doesn't charge for `failed` or `nsfw`, so there's no cost record to lose.
 */
export function deleteJob(id: string): { removedFiles: number } {
  const gens = db()
    .prepare("SELECT local_path FROM generations WHERE job_id = ?")
    .all(id) as Array<{ local_path: string | null }>;

  let removedFiles = 0;
  for (const g of gens) {
    if (!g.local_path) continue;
    const target = path.resolve(MEDIA_DIR, g.local_path);
    // Never follow a path that escapes the media directory.
    if (!target.startsWith(path.resolve(MEDIA_DIR) + path.sep)) continue;
    try {
      fs.unlinkSync(target);
      removedFiles += 1;
    } catch {
      /* already gone */
    }
  }

  db().prepare("DELETE FROM generations WHERE job_id = ?").run(id);
  db().prepare("DELETE FROM jobs WHERE id = ?").run(id);
  return { removedFiles };
}

/**
 * Remove a single generated file.
 *
 * Deleting by job would take a whole batch with it — a four-image Soul job
 * produces four tiles sharing one job row — so results are removed one at a
 * time. The parent job is dropped only once nothing is left of it.
 */
export function deleteGeneration(id: string): { removedJob: boolean } {
  const row = db()
    .prepare("SELECT job_id, local_path FROM generations WHERE id = ?")
    .get(id) as { job_id: string; local_path: string | null } | undefined;
  if (!row) return { removedJob: false };

  if (row.local_path) {
    const target = path.resolve(MEDIA_DIR, row.local_path);
    // Never follow a path that escapes the media directory.
    if (target.startsWith(path.resolve(MEDIA_DIR) + path.sep)) {
      try {
        fs.unlinkSync(target);
      } catch {
        /* already gone */
      }
    }
  }

  db().prepare("DELETE FROM generations WHERE id = ?").run(id);

  const left = db()
    .prepare("SELECT COUNT(*) AS n FROM generations WHERE job_id = ?")
    .get(row.job_id) as { n: number };
  if (left.n === 0) {
    db().prepare("DELETE FROM jobs WHERE id = ?").run(row.job_id);
    return { removedJob: true };
  }
  return { removedJob: false };
}

/** Clear every job in a terminal failure state. Returns how many went. */
export function deleteFailedJobs(): number {
  const ids = db()
    .prepare("SELECT id FROM jobs WHERE status IN ('failed','nsfw','canceled')")
    .all() as Array<{ id: string }>;
  for (const { id } of ids) deleteJob(id);
  return ids.length;
}

/** Jobs the worker still owns — used to resume after a restart. */
export function activeJobs(): JobRow[] {
  return db()
    .prepare(
      `SELECT * FROM jobs WHERE status NOT IN ('completed','failed','nsfw','canceled')
       ORDER BY created_at ASC`,
    )
    .all() as JobRow[];
}

export function countInFlight(): number {
  const row = db()
    .prepare(
      "SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','in_progress','downloading')",
    )
    .get() as { n: number };
  return row.n;
}

// --------------------------------------------------------------------- spend

/**
 * Only `completed` jobs are counted. Higgsfield does not charge for `failed` or
 * `nsfw` requests, and refunds any credits it reserved.
 */
export function spendSince(sinceMs: number): { usd: number; count: number } {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(est_usd), 0) AS usd, COUNT(*) AS count
       FROM jobs WHERE status = 'completed' AND created_at >= ?`,
    )
    .get(sinceMs) as { usd: number; count: number };
  return { usd: row.usd, count: row.count };
}
