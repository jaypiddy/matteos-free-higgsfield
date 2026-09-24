/** Types and helpers shared by client components. Must not import server-only
 *  modules — `lib/db` pulls in a native binary. */

export type JobStatus =
  | "pending"
  | "queued"
  | "in_progress"
  | "downloading"
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled";

export const ACTIVE_STATUSES: JobStatus[] = ["pending", "queued", "in_progress", "downloading"];

export interface Generation {
  id: string;
  job_id: string;
  kind: string;
  remote_url: string | null;
  local_path: string | null;
  mime: string | null;
  bytes: number | null;
  created_at: number;
}

export interface Job {
  id: string;
  request_id: string | null;
  model_id: string;
  model_name: string;
  endpoint: string;
  kind: "image" | "video";
  prompt: string;
  params: Record<string, unknown>;
  batch: number;
  status: JobStatus;
  error: string | null;
  est_usd: number | null;
  est_credits: number | null;
  created_at: number;
  updated_at: number;
  outputs: Generation[];
}

export function isActive(job: Job): boolean {
  return ACTIVE_STATUSES.includes(job.status);
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  pending: "Waiting for a slot",
  queued: "Queued",
  in_progress: "Generating",
  downloading: "Saving",
  completed: "Done",
  failed: "Failed",
  nsfw: "Blocked",
  canceled: "Canceled",
};

export function mediaUrl(gen: Generation): string | null {
  // Always prefer our own copy — Higgsfield's URL dies after about a week.
  if (gen.local_path) return `/api/media/${encodeURIComponent(gen.local_path)}`;
  return gen.remote_url;
}

export function formatUsd(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return "—";
  if (usd === 0) return "$0.00";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/**
 * CSS `aspect-ratio` for a job's output.
 *
 * Taken from the parameters the job was submitted with, so a tile reserves
 * exactly the right shape before its image loads — no measuring, no layout
 * shift, and an in-progress skeleton that already shows the shape of what's
 * coming. Falls back to square when a model exposes no ratio.
 */
export function aspectRatio(job: Job): string {
  const raw = job.params?.aspect_ratio;
  if (typeof raw === "string") {
    const [w, h] = raw.split(":").map(Number);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return `${w} / ${h}`;
  }
  return "1 / 1";
}

/** Short label for a tile badge, e.g. "16:9". */
export function ratioLabel(job: Job): string | null {
  const raw = job.params?.aspect_ratio;
  return typeof raw === "string" && raw.includes(":") ? raw : null;
}

/** Numeric width/height for layout maths. Falls back to square. */
export function aspectValue(job: Job): number {
  const raw = job.params?.aspect_ratio;
  if (typeof raw === "string") {
    const [w, h] = raw.split(":").map(Number);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return w / h;
  }
  return 1;
}
