"use client";

import { useEffect, useState } from "react";
import JustifiedRows, { type RowItem } from "./JustifiedRows";
import { defaultAspect } from "@/lib/models";
import {
  STATUS_LABEL,
  aspectValue,
  formatBytes,
  formatUsd,
  isActive,
  mediaUrl,
  ratioLabel,
  timeAgo,
  type Generation,
  type Job,
} from "@/lib/shared";

/**
 * Column masonry of results.
 *
 * Tiles keep the aspect ratio they were generated at rather than being cropped
 * to squares, and reserve that shape up front — so an in-progress job shows the
 * silhouette of what's coming, and nothing shifts when the image lands.
 */
export default function ResultGrid({
  jobs,
  loaded,
  emptyTitle = "Nothing here yet",
  emptyHint,
  onChanged,
}: {
  jobs: Job[];
  loaded: boolean;
  emptyTitle?: string;
  emptyHint: string;
  onChanged?: () => void;
}) {
  // The lightbox tracks an index into the flat list of viewable results, so
  // the arrow keys can step through them in the order they appear on screen.
  const [previewAt, setPreviewAt] = useState<number | null>(null);

  if (!loaded) {
    return (
      <JustifiedRows
        items={[4 / 3, 9 / 16, 1, 16 / 9, 3 / 4, 1, 16 / 9, 2 / 3, 1, 4 / 3].map((r, i) => ({
          key: String(i),
          ratio: r,
          render: (style: React.CSSProperties) => (
            <div key={i} className="skeleton rounded-xl" style={style} />
          ),
        }))}
      />
    );
  }

  if (!jobs.length) {
    return (
      <div className="fade-in flex min-h-[46vh] flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-9 grid place-items-center">
          {/* Thin concentric linework. Decorative only, so it is hidden from
              the accessibility tree and carries no meaning. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 200 200"
            className="orbit pointer-events-none absolute size-48 text-accent-line"
          >
            <circle cx="100" cy="100" r="97" fill="none" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 10" />
            <circle cx="100" cy="100" r="76" fill="none" stroke="currentColor" strokeWidth="0.75" />
          </svg>
          <div className="relative grid size-20 place-items-center rounded-full border border-edge bg-white shadow-[var(--shade)]">
            <svg viewBox="0 0 24 24" className="size-9 text-accent" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <circle cx="8.5" cy="9.5" r="1.4" />
              <path d="m4 17 4.5-4.5 3.5 3.5 3-2.5L20 17" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <p className="display text-lg font-extrabold">{emptyTitle}</p>
        <p className="mt-3 max-w-md text-base leading-relaxed text-muted">{emptyHint}</p>
      </div>
    );
  }

  // Flatten to one list of tiles first: a finished job contributes one tile per
  // output, an in-flight or empty one contributes a single status tile.
  let index = 0;
  const items: RowItem[] = [];

  // Prefer the ratio the job was submitted with; fall back to the model's own
  // default, since a job that never set one had the API apply that default.
  const viewable: Array<{ job: Job; gen: Generation }> = [];

  const ratioOf = (job: Job) => {
    const fromParams = aspectValue(job);
    if (fromParams !== 1) return fromParams;
    return defaultAspect(job.model_id) ?? 1;
  };
  for (const job of jobs) {
    if (isActive(job) || !job.outputs.length) {
      const i = index++;
      items.push({
        key: job.id,
        ratio: ratioOf(job),
        render: (style) => (
          <StatusTile key={job.id} job={job} i={i} style={style} onChanged={onChanged} />
        ),
      });
    } else {
      for (const gen of job.outputs) {
        const i = index++;
        const at = viewable.length;
        viewable.push({ job, gen });
        items.push({
          key: gen.id,
          ratio: ratioOf(job),
          render: (style) => (
            <OutputTile
              key={gen.id}
              job={job}
              gen={gen}
              i={i}
              style={style}
              onOpen={() => setPreviewAt(at)}
              onChanged={onChanged}
            />
          ),
        });
      }
    }
  }

  return (
    <>
      <JustifiedRows items={items} />

      {previewAt !== null && viewable[previewAt] && (
        <Lightbox
          items={viewable}
          at={previewAt}
          onMove={setPreviewAt}
          onClose={() => setPreviewAt(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function StatusTile({
  job, i, style, onChanged,
}: { job: Job; i: number; style: React.CSSProperties; onChanged?: () => void }) {
  const running = isActive(job);
  const blocked = job.status === "nsfw";
  const failed = job.status === "failed";
  const bad = failed || blocked;

  // The same endpoint cancels a running job and removes a finished one; the
  // server decides which from the job's actual state.
  async function dismiss() {
    await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    onChanged?.();
  }

  return (
    <div
      style={{ ...style, "--i": i } as React.CSSProperties}
      className={`rise group relative flex flex-col justify-end overflow-hidden rounded-xl border p-4 transition-colors duration-200 ${
        bad ? "border-danger/40 bg-danger/[0.04]" : "border-edge-soft"
      } ${running ? "skeleton" : "bg-white/85 backdrop-blur"}`}
    >
      {!running && (
        <button
          onClick={dismiss}
          aria-label="Remove"
          className="press absolute top-3 right-3 z-10 grid size-7 place-items-center rounded-full border border-edge bg-white text-muted opacity-0 group-hover:opacity-100 hover:border-danger hover:text-danger"
        >
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {running && (
        <span className="absolute top-4 left-4 flex items-center gap-2">
          <span className="size-2 animate-pulse rounded-full bg-accent" />
          <span className="overline text-muted">{STATUS_LABEL[job.status]}</span>
        </span>
      )}
      <div className="relative z-10">
        {bad && (
          <p className={`overline ${failed ? "text-danger" : "text-warn"}`}>
            {STATUS_LABEL[job.status]}
          </p>
        )}
        <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-muted">
          {job.error ?? job.prompt}
        </p>
        <div className="mt-3 flex items-center gap-2 text-2xs text-faint">
          <span className="truncate">{job.model_name}</span>
          <button
            onClick={dismiss}
            className="ml-auto shrink-0 rounded-xs px-2 py-1 font-semibold underline decoration-dotted transition-colors duration-200 hover:bg-panel-2 hover:text-text"
          >
            {running ? "Cancel" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OutputTile({
  job, gen, i, style, onOpen, onChanged,
}: {
  job: Job;
  gen: Generation;
  i: number;
  style: React.CSSProperties;
  onOpen: () => void;
  onChanged?: () => void;
}) {
  const src = mediaUrl(gen);
  const isVideo = gen.kind === "video";
  const [ready, setReady] = useState(false);
  const ratio = ratioLabel(job);

  async function remove() {
    await fetch(`/api/generations/${gen.id}`, { method: "DELETE" });
    onChanged?.();
  }

  // A cached image can finish loading before React attaches onLoad, so the
  // event never fires and the tile would stay faded out behind its placeholder.
  const markIfLoaded = (el: HTMLImageElement | HTMLVideoElement | null) => {
    if (!el) return;
    const done = el instanceof HTMLImageElement ? el.complete : el.readyState >= 2;
    if (done) setReady(true);
  };

  return (
    <div
      style={{ ...style, "--i": i } as React.CSSProperties}
      className="rise lift group relative block overflow-hidden rounded-xl border border-edge-soft bg-white text-left hover:border-accent-line"
    >
      <span
        className={`absolute inset-0 transition-opacity duration-500 ${
          ready ? "opacity-0" : "skeleton opacity-100"
        }`}
      />
      {src && isVideo && (
        <video
          src={src}
          muted loop playsInline preload="metadata"
          ref={markIfLoaded}
          onLoadedData={() => setReady(true)}
          onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
          onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
          className={`size-full object-cover transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {src && !isVideo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src} alt={job.prompt} loading="lazy"
          ref={markIfLoaded}
          onLoad={() => setReady(true)}
          onError={() => setReady(true)}
          className={`size-full object-cover transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`}
        />
      )}

      <span className="absolute top-3 right-3 z-10 flex items-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {ratio && <Badge>{ratio}</Badge>}
        {isVideo && <Badge tone="video">video</Badge>}
        <button
          aria-label="Delete this result"
          title="Delete this result"
          onClick={() => void remove()}
          className="press grid size-7 place-items-center rounded-full bg-[#1a2238]/65 text-white/90 backdrop-blur-md hover:bg-danger hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </span>

      <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 translate-y-full bg-gradient-to-t from-[#1a2238]/92 via-[#1a2238]/70 to-transparent p-4 pt-12 transition-transform duration-300 ease-out group-hover:translate-y-0">
        <span className="line-clamp-2 text-sm leading-snug font-medium text-white/90">{job.prompt}</span>
        <span className="mt-2 flex items-center gap-2 text-2xs text-white/60">
          <span className="truncate">{job.model_name}</span>
          <span className="text-white/25">·</span>
          <span className="font-mono">{job.est_usd === null ? "metered" : formatUsd(job.est_usd)}</span>
          <span className="text-white/25">·</span>
          <span>{timeAgo(job.created_at)}</span>
        </span>
      </span>

      {/* Sits behind the badges and the delete control, so those stay clickable. */}
      <button
        onClick={onOpen}
        aria-label="Open result"
        className="absolute inset-0 z-0 cursor-zoom-in"
      />
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "video" }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 font-mono text-2xs backdrop-blur-md ${
        tone === "video" ? "bg-video text-white" : "bg-[#1a2238]/65 text-white/90"
      }`}
    >
      {children}
    </span>
  );
}

function Lightbox({
  items, at, onMove, onClose, onChanged,
}: {
  items: Array<{ job: Job; gen: Generation }>;
  at: number;
  onMove: (i: number) => void;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { job, gen } = items[at];
  const src = mediaUrl(gen);
  const hasPrev = at > 0;
  const hasNext = at < items.length - 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return onClose();
      // Clamped rather than wrapping, so holding an arrow stops at the end
      // instead of silently looping back to the start.
      if (e.key === "ArrowLeft" && at > 0) {
        e.preventDefault();
        onMove(at - 1);
      }
      if (e.key === "ArrowRight" && at < items.length - 1) {
        e.preventDefault();
        onMove(at + 1);
      }
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, onMove, at, items.length]);

  const settings = Object.entries(job.params).filter(
    ([k, v]) => k !== "prompt" && typeof v !== "object",
  );

  return (
    <div
      className="fade-in fixed inset-0 z-60 flex items-center justify-center bg-[#1a2238]/80 p-4 backdrop-blur-lg sm:p-8"
      onClick={onClose}
    >
      <div className="pop flex max-h-full w-full max-w-6xl flex-col gap-4 lg:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {src && gen.kind === "video" ? (
            <video src={src} controls autoPlay loop className="max-h-[82vh] rounded-2xl shadow-2xl shadow-[#1a2238]/50" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            src && <img src={src} alt={job.prompt} className="max-h-[82vh] rounded-2xl object-contain shadow-2xl shadow-[#1a2238]/50" />
          )}
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-7 overflow-y-auto rounded-3xl border border-edge-soft bg-white p-7 lg:w-96">
          <div>
            <h3 className="tag overline text-muted">Prompt</h3>
            <p className="mt-3 text-base leading-relaxed text-text-2">{job.prompt}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Chip label={job.model_name} accent />
            <Chip label={job.est_usd === null ? "metered" : formatUsd(job.est_usd)} mono />
            {gen.bytes ? <Chip label={formatBytes(gen.bytes)} mono /> : null}
            <Chip label={timeAgo(job.created_at)} />
          </div>

          {settings.length > 0 && (
            <div>
              <h3 className="tag overline text-muted">Settings</h3>
              <dl className="mt-3 space-y-2.5 text-sm">
                {settings.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="shrink-0 text-muted capitalize">{k.replace(/_/g, " ")}</dt>
                    <dd className="truncate text-right font-mono text-xs text-text">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}


          {src && (
            <a
              href={src} download
              className="press brand-gradient sheen mt-auto flex items-center justify-center gap-2.5 rounded-full py-4 text-sm font-extrabold tracking-wide text-accent-ink uppercase shadow-[var(--shade-accent)] hover:shadow-[var(--shade-accent-hover)]"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Download
            </a>
          )}

          <button
            onClick={async () => {
              await fetch(`/api/generations/${gen.id}`, { method: "DELETE" });
              onChanged?.();
              // Step back when the last item goes, otherwise stay put and let
              // the next result slide into this position.
              if (items.length <= 1) onClose();
              else onMove(at >= items.length - 1 ? at - 1 : at);
            }}
            className="press flex items-center justify-center gap-2.5 rounded-full border border-danger/40 py-4 text-sm font-bold text-danger hover:border-danger hover:bg-danger/5"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Delete
          </button>
        </aside>
      </div>

      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onMove(at - 1); }}
          aria-label="Previous result"
          className="absolute top-1/2 left-5 grid size-14 -translate-y-1/2 place-items-center rounded-full border border-edge bg-white text-muted transition-all duration-200 hover:scale-105 hover:border-accent hover:text-accent active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onMove(at + 1); }}
          aria-label="Next result"
          className="absolute top-1/2 right-5 grid size-14 -translate-y-1/2 place-items-center rounded-full border border-edge bg-white text-muted transition-all duration-200 hover:scale-105 hover:border-accent hover:text-accent active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <span className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-edge bg-white px-4 py-2 font-mono text-2xs text-muted">
        {at + 1} / {items.length}
        <span className="ml-2 text-faint">← →</span>
      </span>

      <button
        onClick={onClose} aria-label="Close"
        className="absolute top-6 right-6 grid size-12 place-items-center rounded-full border border-edge bg-white text-muted transition-all duration-200 hover:scale-105 hover:border-danger hover:text-danger active:scale-95"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function Chip({ label, mono, accent }: { label: string; mono?: boolean; accent?: boolean }) {
  return (
    <span
      className={`rounded-full border px-3 py-1.5 text-2xs ${
        accent
          ? "brand-gradient border-transparent font-bold text-accent-ink"
          : "border-edge-soft bg-panel-2 font-semibold text-muted"
      } ${mono ? "font-mono" : ""}`}
    >
      {label}
    </span>
  );
}
