"use client";

import { useEffect, useState } from "react";
import {
  Button,
  ComposedModal,
  IconButton,
  InlineLoading,
  ModalBody,
  ModalHeader,
  SkeletonPlaceholder,
  Tag,
} from "@carbon/react";
import { ChevronLeft, ChevronRight, Download, Image as ImageIcon, TrashCan } from "@carbon/icons-react";
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
 * Results laid out as justified rows.
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
  // The viewer tracks an index into the flat list of viewable results, so the
  // arrow keys can step through them in the order they appear on screen.
  const [previewAt, setPreviewAt] = useState<number | null>(null);

  if (!loaded) {
    return (
      <JustifiedRows
        gap={16}
        items={[4 / 3, 9 / 16, 1, 16 / 9, 3 / 4, 1, 16 / 9, 2 / 3, 1, 4 / 3].map((r, i) => ({
          key: String(i),
          ratio: r,
          render: (style: React.CSSProperties) => (
            <div key={i} style={style}>
              <SkeletonPlaceholder className="fill" />
            </div>
          ),
        }))}
      />
    );
  }

  if (!jobs.length) {
    return (
      <div className="empty-state">
        <ImageIcon size={48} className="empty-state__icon" aria-hidden="true" />
        <h2 className="empty-state__title">{emptyTitle}</h2>
        <p className="empty-state__body">{emptyHint}</p>
      </div>
    );
  }

  // Flatten to one list of tiles first: a finished job contributes one tile per
  // output, an in-flight or empty one contributes a single status tile.
  const items: RowItem[] = [];
  const viewable: Array<{ job: Job; gen: Generation }> = [];

  // Prefer the ratio the job was submitted with; fall back to the model's own
  // default, since a job that never set one had the API apply that default.
  const ratioOf = (job: Job) => {
    const fromParams = aspectValue(job);
    if (fromParams !== 1) return fromParams;
    return defaultAspect(job.model_id) ?? 1;
  };

  for (const job of jobs) {
    if (isActive(job) || !job.outputs.length) {
      items.push({
        key: job.id,
        ratio: ratioOf(job),
        render: (style) => <StatusTile key={job.id} job={job} style={style} onChanged={onChanged} />,
      });
    } else {
      for (const gen of job.outputs) {
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
      <JustifiedRows items={items} gap={16} />

      {previewAt !== null && viewable[previewAt] && (
        <Viewer
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
  job, style, onChanged,
}: { job: Job; style: React.CSSProperties; onChanged?: () => void }) {
  const running = isActive(job);
  const failed = job.status === "failed";
  const blocked = job.status === "nsfw";

  // The same endpoint cancels a running job and removes a finished one; the
  // server decides which from the job's actual state.
  async function dismiss() {
    await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    onChanged?.();
  }

  return (
    <div style={style} className={`status-tile${failed || blocked ? " status-tile--bad" : ""}`}>
      <div className="status-tile__top">
        {running ? (
          <InlineLoading description={STATUS_LABEL[job.status]} />
        ) : (
          <Tag type={failed ? "red" : blocked ? "magenta" : "gray"} size="sm">
            {STATUS_LABEL[job.status]}
          </Tag>
        )}
      </div>
      <p className="status-tile__text">{job.error ?? job.prompt}</p>
      <div className="status-tile__footer">
        <span className="status-tile__model">{job.model_name}</span>
        <Button kind="ghost" size="sm" onClick={dismiss}>
          {running ? "Cancel" : "Remove"}
        </Button>
      </div>
    </div>
  );
}

function OutputTile({
  job, gen, style, onOpen, onChanged,
}: {
  job: Job;
  gen: Generation;
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
  // event never fires and the tile would stay hidden behind its placeholder.
  const markIfLoaded = (el: HTMLImageElement | HTMLVideoElement | null) => {
    if (!el) return;
    const done = el instanceof HTMLImageElement ? el.complete : el.readyState >= 2;
    if (done) setReady(true);
  };

  return (
    <div style={style} className="result-tile">
      {!ready && <SkeletonPlaceholder className="result-tile__placeholder" />}
      {src && isVideo && (
        <video
          src={src}
          muted loop playsInline preload="metadata"
          ref={markIfLoaded}
          onLoadedData={() => setReady(true)}
          onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
          onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
          className="result-tile__media"
          data-ready={ready}
        />
      )}
      {src && !isVideo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src} alt={job.prompt} loading="lazy"
          ref={markIfLoaded}
          onLoad={() => setReady(true)}
          onError={() => setReady(true)}
          className="result-tile__media"
          data-ready={ready}
        />
      )}

      {/* Sits behind the tags and the delete control, so those stay clickable. */}
      <button type="button" onClick={onOpen} aria-label="Open result" className="result-tile__open" />

      <span className="result-tile__actions">
        {ratio && <Tag type="high-contrast" size="sm">{ratio}</Tag>}
        {isVideo && <Tag type="gray" size="sm">video</Tag>}
        <IconButton
          kind="secondary"
          size="sm"
          label="Delete this result"
          align="bottom-end"
          onClick={() => void remove()}
        >
          <TrashCan />
        </IconButton>
      </span>

      <span className="result-tile__caption">
        <span className="result-tile__prompt">{job.prompt}</span>
        <span className="result-tile__meta">
          {job.model_name} · {job.est_usd === null ? "metered" : formatUsd(job.est_usd)} · {timeAgo(job.created_at)}
        </span>
      </span>
    </div>
  );
}

/** Full-size viewer: Carbon modal with the media beside its details. */
function Viewer({
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

  // Escape is handled by the modal itself. The arrows clamp rather than wrap,
  // so holding one stops at the end instead of silently looping to the start.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA"].includes(t.tagName)) return;
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
    return () => document.removeEventListener("keydown", onKey);
  }, [onMove, at, items.length]);

  async function remove() {
    await fetch(`/api/generations/${gen.id}`, { method: "DELETE" });
    onChanged?.();
    // Step back when the last item goes, otherwise stay put and let the next
    // result slide into this position.
    if (items.length <= 1) onClose();
    else onMove(at >= items.length - 1 ? at - 1 : at);
  }

  const settings = Object.entries(job.params).filter(
    ([k, v]) => k !== "prompt" && typeof v !== "object",
  );

  return (
    <ComposedModal open size="lg" onClose={() => { onClose(); return true; }} className="viewer">
      <ModalHeader label={`${at + 1} of ${items.length}`} title={job.model_name} />
      <ModalBody className="viewer__body">
        <div className="viewer__media">
          {src && gen.kind === "video" ? (
            <video key={gen.id} src={src} controls autoPlay loop playsInline />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            src && <img key={gen.id} src={src} alt={job.prompt} />
          )}
        </div>

        <aside className="viewer__details">
          <section>
            <h3 className="viewer__heading">Prompt</h3>
            <p className="viewer__prompt">{job.prompt}</p>
          </section>

          <div className="viewer__tags">
            <Tag type="high-contrast" size="sm">{job.est_usd === null ? "metered" : formatUsd(job.est_usd)}</Tag>
            {gen.bytes ? <Tag type="gray" size="sm">{formatBytes(gen.bytes)}</Tag> : null}
            <Tag type="gray" size="sm">{timeAgo(job.created_at)}</Tag>
          </div>

          {settings.length > 0 && (
            <section>
              <h3 className="viewer__heading">Settings</h3>
              <dl className="viewer__settings">
                {settings.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k.replace(/_/g, " ")}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <div className="viewer__actions">
            {src && (
              // Button renders an <a> for href and forwards the rest, but its
              // types omit `download`, hence the spread.
              <Button href={src} renderIcon={Download} {...{ download: "" }}>
                Download
              </Button>
            )}
            <Button kind="danger--tertiary" renderIcon={TrashCan} onClick={() => void remove()}>
              Delete
            </Button>
          </div>

          <div className="viewer__nav">
            <IconButton kind="ghost" label="Previous result" disabled={!hasPrev} onClick={() => onMove(at - 1)}>
              <ChevronLeft />
            </IconButton>
            <span className="viewer__position">{at + 1} / {items.length}</span>
            <IconButton kind="ghost" label="Next result" disabled={!hasNext} onClick={() => onMove(at + 1)}>
              <ChevronRight />
            </IconButton>
          </div>
        </aside>
      </ModalBody>
    </ComposedModal>
  );
}
