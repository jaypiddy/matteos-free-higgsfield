"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptFor,
  attachmentFallback,
  refKindOf,
  familiesByKind,
  modelsInFamily,
  defaultParams,
  getModel,
  maxRefs,
  modelsByKind,
  supportsAttachment,
  type ModelDef,
} from "@/lib/models";
import { formatUsd } from "@/lib/shared";
import ParamPill from "./ParamPill";
import Popover from "./Popover";

/**
 * The docked bottom composer.
 *
 * Read top to bottom: what you are generating with (model and its settings),
 * then what you are asking for (the prompt), then the act of sending it
 * (attach, and the priced Generate button on the far right). The settings sit
 * above the input rather than under it because they decide what the input even
 * means — a duration slider is context for the sentence you are about to
 * write, not an afterthought to it.
 *
 * This is where all the time goes, so it is the largest thing on the page:
 * the prompt is set at display size, and Generate is the only gradient
 * surface in the studio.
 *
 * Controls are derived from the model registry rather than hardcoded, because
 * Higgsfield's models disagree about nearly everything — Soul takes
 * `num_images` and 2K/4K, Soul Reference takes `batch_size` and 720p/1080p.
 */

interface Ref {
  url: string;
  name: string;
  preview: string;
  kind: "image" | "video" | "audio";
}

export default function PromptBar({
  kind,
  onSubmitted,
}: {
  kind: "image" | "video";
  onSubmitted: () => void;
}) {
  const available = useMemo(() => modelsByKind(kind), [kind]);
  const [modelId, setModelId] = useState(available[0].id);
  const model = getModel(modelId) ?? available[0];

  const [prompt, setPrompt] = useState("");
  const [params, setParams] = useState<Record<string, unknown>>(() => defaultParams(model));
  const [batch, setBatch] = useState(1);
  const [refs, setRefs] = useState<Ref[]>([]);

  const [estimate, setEstimate] = useState<number | null>(null);
  // Model id -> why it can't be used. Filled in as estimates come back, so the
  // picker reflects whatever plan this particular key is on.
  const [unavailable, setUnavailable] = useState<Record<string, string>>({});
  const [estimating, setEstimating] = useState(false);
  // Token-metered models (Seedance 2.5) quote prose, not a figure.
  const [metered, setMetered] = useState<string | null>(null);
  // Set when attaching forces a model change, so the switch is explained
  // rather than silently happening under the user.
  const [switchedNote, setSwitchedNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Reset per-model state when the model changes; parameters are not portable
  // between models (a 2K value is meaningless to a model expecting 720p).
  useEffect(() => {
    setParams(defaultParams(model));
    setBatch(model.batchOptions?.[0] ?? 1);
    if (!supportsAttachment(model)) setRefs([]);
    setEstimate(null);
  }, [model]);

  // Grow the textarea with its content, up to a few lines.
  //
  // Re-fitted whenever the box's width changes, not just on input: at first
  // paint the textarea is still at its default ~20-column width, so the
  // placeholder wraps over many lines and measures far too tall. Watching for
  // the width to settle is deterministic, where waiting on fonts or a frame is
  // not.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;

    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
    };
    fit();

    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return; // ignore our own height change
      lastWidth = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [prompt]);

  const blocked = unavailable[model.id];

  // Params flagged required with no default (a character ID, say) must be
  // filled before the request is worth sending.
  const missing = model.params.filter(
    (d) => d.required && d.default === undefined && !params[d.key],
  );

  const canSubmit =
    prompt.trim().length > 0 &&
    !busy &&
    !uploading &&
    !blocked &&
    missing.length === 0 &&
    (!model.refRequired || refs.length > 0);

  const payload = useCallback(
    () => ({
      modelId: model.id,
      prompt: prompt.trim() || "placeholder",
      params,
      batch,
      refUrls: refs.map((r) => r.url),
    }),
    [model.id, prompt, params, batch, refs],
  );

  // Debounced pricing. Deliberately keyed off everything except prompt text —
  // cost depends on the model and its settings, not on what you typed.
  const estimateKey = JSON.stringify({
    m: model.id,
    p: params,
    b: batch,
    r: refs.length,
  });

  useEffect(() => {
    if (model.refRequired && refs.length === 0) return;
    let cancelled = false;
    setEstimating(true);

    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload()),
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data.available === false) {
            setEstimate(null);
            setMetered(null);
            setUnavailable((prev) => ({ ...prev, [model.id]: data.reason }));
          } else if (data.metered) {
            setEstimate(null);
            setMetered(data.note ?? "Token-metered pricing.");
            setUnavailable((prev) => {
              if (!(model.id in prev)) return prev;
              const next = { ...prev };
              delete next[model.id];
              return next;
            });
          } else {
            setMetered(null);
            setEstimate(Number.isFinite(data.usd) ? data.usd : null);
            setUnavailable((prev) => {
              if (!(model.id in prev)) return prev;
              const next = { ...prev };
              delete next[model.id];
              return next;
            });
          }
        } else {
          setEstimate(null);
          setMetered(null);
        }
      } catch {
        if (!cancelled) setEstimate(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(t);
      setEstimating(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateKey]);

  /**
   * Take images from the file picker, a drop, or a paste.
   *
   * If the current model can't use a reference image, this switches to one that
   * can rather than refusing — attaching a picture is a clear statement of
   * intent, and silently doing nothing was what people read as "attachments
   * aren't supported".
   */
  async function attach(files: FileList | File[] | null) {
    const all = Array.from(files ?? []);
    // Pick the kind from the first usable file, then keep only files of that
    // kind — mixing an image and a clip in one drop has no sensible meaning.
    const first = all.find((f) => /^(image|video|audio)\//.test(f.type));
    if (!first) return;
    const dropped = (first.type.split("/")[0] as "image" | "video" | "audio");
    const incoming = all.filter((f) => f.type.startsWith(dropped + "/"));
    setError(null);

    let target = model;
    if (!supportsAttachment(target) || refKindOf(target) !== dropped) {
      const fallback = attachmentFallback(kind, dropped);
      if (!fallback) {
        setError(`No ${kind} model accepts a ${dropped} attachment.`);
        return;
      }
      target = fallback;
      setModelId(fallback.id);
      setSwitchedNote(
        `${model.name} can't take ${dropped === "audio" ? "an" : "a"} ${dropped} attachment, so this switched to ${fallback.name}.`,
      );
    } else {
      setSwitchedNote(null);
    }

    const limit = maxRefs(target);
    const room = limit === 1 ? 1 : Math.max(0, limit - refs.length);
    const chosen = incoming.slice(0, room || 1);
    if (incoming.length > chosen.length) {
      setError(`${target.name} takes at most ${limit} image${limit === 1 ? "" : "s"}.`);
    }

    setUploading(true);
    try {
      for (const file of chosen) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed.");
        const added = {
          url: data.url,
          name: file.name,
          preview: URL.createObjectURL(file),
          kind: (data.kind ?? dropped) as "image" | "video" | "audio",
        };
        setRefs((prev) => (limit === 1 ? [added] : [...prev, added].slice(0, limit)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function generate() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start the generation.");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the generation.");
    } finally {
      setBusy(false);
    }
  }

  // Images can arrive by drop or paste anywhere on the page, not just through
  // the file picker — the picker alone made attachments easy to miss entirely.
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => { if (hasFiles(e)) { depth += 1; setDragging(true); } };
    const onOver = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth -= 1;
      if (depth <= 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      void attach(e.dataTransfer?.files ?? null);
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.some((f) => /^(image|video|audio)\//.test(f.type))) {
        e.preventDefault();
        void attach(files);
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, refs.length, kind]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;

    // While an IME candidate window is open, Enter is confirming a character,
    // not submitting. Ignoring this would make the composer unusable for
    // anyone typing Japanese, Chinese or Korean.
    if (e.nativeEvent.isComposing) return;

    // Shift+Enter inserts a line break; plain Enter sends. Cmd/Ctrl+Enter also
    // sends, since that was the old binding and the muscle memory is harmless.
    if (e.shiftKey) return;

    e.preventDefault();
    void generate();
  }

  // The endpoint silently changes when a reference image is attached; say so,
  // rather than letting the user wonder why the cost jumped.
  const switched = refs.length > 0 && model.imageEndpoint;

  return (
    <div className="glass relative z-40 shrink-0 border-t border-edge-soft shadow-[var(--shade-lg)]">
      {dragging && (
        <div className="fade-in pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-md">
          <div className="rounded-3xl border-2 border-dashed border-accent-line bg-white px-14 py-11 text-center shadow-[var(--shade-lg)]">
            <p className="display text-lg font-extrabold">Drop to attach</p>
            <p className="mt-2 text-base text-muted">
              {supportsAttachment(model)
                ? `${model.name} takes ${refKindOf(model) === "audio" ? "a WAV" : refKindOf(model) === "video" ? "an MP4" : "an image"}`
                : "Drop an image, MP4 or WAV — the model switches to match"}
            </p>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-[1560px] px-5 sm:px-10">
        {error && (
          <div className="flex items-start gap-2.5 border-b border-edge-soft py-3.5 text-sm font-medium text-danger">
            <span className="mt-px">⚠</span>
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="press rounded-full px-2 text-faint hover:text-text"
            >
              ✕
            </button>
          </div>
        )}

        {switchedNote && (
          <div className="flex items-start gap-2.5 border-b border-edge-soft py-3.5 text-sm text-warn">
            <span className="flex-1">{switchedNote}</span>
            <button
              onClick={() => setSwitchedNote(null)}
              className="press rounded-full px-2 text-faint hover:text-text"
            >
              ✕
            </button>
          </div>
        )}

        {blocked && (
          <div className="border-b border-edge-soft py-3.5 text-sm text-warn">
            {model.name} is not available to your API key — {blocked.toLowerCase()}. Pick another
            model, or check your plan in Higgsfield Cloud.
          </div>
        )}

        {!blocked && metered && (
          <p className="border-b border-edge-soft py-3.5 text-sm leading-relaxed text-muted">
            {model.meteredNote ??
              `${model.name} bills per token rather than per generation, so there is no fixed price up front.`}{" "}
            Higgsfield reconciles the exact charge after the request runs.
          </p>
        )}

        {!blocked && missing.length > 0 && prompt.trim().length > 0 && (
          <div className="border-b border-edge-soft py-3.5 text-sm text-warn">
            {model.name} needs {missing.map((d) => d.label.toLowerCase()).join(" and ")} set before
            it can run.
          </div>
        )}

        {refs.length > 0 && (
          <div className="flex flex-wrap gap-3 border-b border-edge-soft py-4">
            {refs.map((r, i) => (
              <div
                key={r.url}
                className="group relative size-16 overflow-hidden rounded-xl border border-edge bg-white shadow-[var(--shade-sm)]"
              >
                {r.kind === "video" ? (
                  <video src={r.preview} muted playsInline className="size-full object-cover" />
                ) : r.kind === "audio" ? (
                  <span className="flex size-full flex-col items-center justify-center gap-1 bg-panel-2 px-1">
                    <svg viewBox="0 0 24 24" className="size-6 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18V6l10-2v12" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="6.5" cy="18" r="2.5" />
                      <circle cx="16.5" cy="16" r="2.5" />
                    </svg>
                    <span className="w-full truncate text-center text-2xs text-faint">{r.name}</span>
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.preview} alt={r.name} className="size-full object-cover" />
                )}
                <button
                  onClick={() => setRefs((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute inset-0 grid place-items-center bg-text/70 text-xs font-bold text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                >
                  Remove
                </button>
              </div>
            ))}
            {switched && (
              <p className="self-center pl-1 text-sm text-muted">
                Using {model.name}&apos;s image-to-{kind === "video" ? "video" : "image"} endpoint.
              </p>
            )}
          </div>
        )}

        {/* 1 — what it runs on. Model card first, its settings trailing off to
            the right, all above the prompt they apply to. */}
        <div className="flex flex-wrap items-stretch gap-2.5 pt-5">
          <ModelPicker
            models={available}
            current={model}
            onPick={setModelId}
            unavailable={unavailable}
            kind={kind}
          />

          <span className="hidden w-px shrink-0 self-stretch bg-edge-soft sm:block" />

          {model.params.map((def) => (
            <ParamPill
              key={def.key}
              def={def}
              value={params[def.key]}
              onChange={(v) => setParams((p) => ({ ...p, [def.key]: v }))}
            />
          ))}

          {model.batchOptions && model.batchOptions.length > 1 && (
            <BatchStepper options={model.batchOptions} value={batch} onChange={setBatch} />
          )}
        </div>

        {/* 2 — what you are asking for. Set at display size: it is the one
            thing on screen you actually author. */}
        <textarea
          ref={textarea}
          rows={1}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe the scene you imagine"
          className="mt-5 max-h-[168px] min-h-9 w-full resize-none bg-transparent text-lg leading-9 font-medium text-text outline-none placeholder:font-normal placeholder:text-faint"
        />

        {/* 3 — sending it. */}
        <div className="mt-3 flex items-center gap-4 pb-6">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            title={
              supportsAttachment(model)
                ? "Attach an image — or drop one anywhere, or paste"
                : `Attach an image (switches away from ${model.name}, which can't use one)`
            }
            className="press flex shrink-0 items-center gap-2.5 rounded-full border border-edge-soft bg-white/80 px-5 py-3 text-sm font-bold text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploading ? (
              <span className="size-4 animate-spin rounded-full border-2 border-edge border-t-accent" />
            ) : (
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
            )}
            <span className="hidden sm:block">Attach</span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={acceptFor(refKindOf(model))}
            multiple={maxRefs(model) > 1}
            className="hidden"
            onChange={(e) => attach(e.target.files)}
          />

          <span className="hidden items-center gap-2 text-2xs text-faint lg:flex">
            <kbd className="rounded-full border border-edge-soft bg-white/80 px-2.5 py-1 font-sans font-semibold">
              ↵
            </kbd>
            <span>send</span>
            <span className="text-edge">·</span>
            <kbd className="rounded-full border border-edge-soft bg-white/80 px-2.5 py-1 font-sans font-semibold">
              ⇧↵
            </kbd>
            <span>new line</span>
          </span>

          {/* The one gradient in the studio, and the biggest control on the
              page. The price rides inside it in a pill, because the number is
              what people check before committing. */}
          <button
            onClick={generate}
            disabled={!canSubmit}
            className={`press ml-auto flex shrink-0 items-center gap-3.5 rounded-full px-7 py-4 text-sm font-extrabold tracking-wide uppercase sm:px-9 ${
              canSubmit
                ? "brand-gradient sheen text-accent-ink shadow-[var(--shade-accent)] hover:shadow-[var(--shade-accent-hover)]"
                : "cursor-not-allowed bg-panel-3 text-faint"
            }`}
          >
            {busy ? (
              "Starting…"
            ) : blocked ? (
              "Unavailable"
            ) : (
              <>
                Generate
                <span
                  className={`rounded-full px-3 py-1 font-mono text-xs tracking-normal normal-case ${
                    canSubmit ? "bg-white/25 text-white" : "bg-white/70 text-faint"
                  }`}
                >
                  {estimating ? "···" : metered ? "metered" : formatUsd(estimate)}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModelPicker({
  models,
  current,
  onPick,
  unavailable,
  kind,
}: {
  models: ModelDef[];
  current: ModelDef;
  onPick: (id: string) => void;
  unavailable: Record<string, string>;
  kind: "image" | "video";
}) {
  // Two levels: pick a family, then a variant. With ~57 models a flat list is
  // unusable, and the families map onto how people actually think about them
  // ("I want Kling" long before "I want Kling 3.0 Pro at 1080p").
  const [family, setFamily] = useState<string | null>(null);
  const families = useMemo(() => familiesByKind(kind), [kind]);
  const currentFamily = current.family ?? current.vendor;

  function price(m: ModelDef) {
    if (unavailable[m.id]) return "unavailable";
    if (m.metered) return "metered";
    return m.fromUsd ? `from ${formatUsd(m.fromUsd)}` : "—";
  }

  return (
    <Popover
      label=""
      value={`${currentFamily} · ${current.name}`}
      trigger={(open) => (
        // The model is the single most consequential choice in the bar, so it
        // gets a card with its family spelled out above the variant rather
        // than one more chip in the row.
        <span
          className={`press flex min-w-[17rem] items-center gap-3.5 rounded-full border px-3 py-2.5 ${
            open
              ? "border-accent-line bg-accent-soft shadow-[var(--shade-sm)]"
              : "border-edge bg-white/80 hover:border-accent-line hover:bg-accent-soft"
          }`}
        >
          <span className="brand-gradient sheen grid size-10 shrink-0 place-items-center rounded-full text-accent-ink">
            <span className="display text-base font-bold">
              {currentFamily.slice(0, 1).toUpperCase()}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="overline block text-faint">{currentFamily}</span>
            <span className="mt-0.5 block truncate text-sm font-bold text-text">
              {current.name}
            </span>
          </span>
          <svg
            viewBox="0 0 24 24"
            className={`size-4 shrink-0 text-muted transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    >
      {(close) => (
        <div className="w-[21rem]">
          {family === null ? (
            <>
              <p className="overline px-3.5 pt-2 pb-2.5 text-faint">
                {models.length} {kind} models
              </p>
              <div className="max-h-[24rem] overflow-y-auto">
                {families.map((f) => {
                  const inFamily = modelsInFamily(kind, f);
                  const cheapest = inFamily.reduce(
                    (a, b) => ((b.fromUsd || Infinity) < (a.fromUsd || Infinity) ? b : a),
                    inFamily[0],
                  );
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFamily(f)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors duration-150 ${
                        f === currentFamily ? "bg-accent-soft" : "hover:bg-panel-2"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-text">{f}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {inFamily.length} {inFamily.length === 1 ? "option" : "options"}
                          {cheapest?.fromUsd ? ` · from ${formatUsd(cheapest.fromUsd)}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-faint">›</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setFamily(null)}
                className="flex w-full items-center gap-2 rounded-full px-3.5 py-2.5 text-left text-sm text-muted transition-colors duration-150 hover:bg-panel-2 hover:text-text"
              >
                <span>‹</span>
                <span className="font-bold">{family}</span>
                <span className="text-faint">— all models</span>
              </button>
              <div className="max-h-[24rem] overflow-y-auto border-t border-edge-soft pt-1.5">
                {modelsInFamily(kind, family).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onPick(m.id);
                      setFamily(null);
                      close();
                    }}
                    className={`w-full rounded-xl px-3.5 py-3 text-left transition-colors duration-150 ${
                      m.id === current.id ? "bg-accent-soft" : "hover:bg-panel-2"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <span
                        className={`text-sm font-bold ${
                          unavailable[m.id] ? "text-faint line-through" : "text-text"
                        }`}
                      >
                        {m.name}
                      </span>
                      <span className="shrink-0 font-mono text-2xs text-muted">{price(m)}</span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted">
                      {unavailable[m.id] ?? m.blurb}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

function BatchStepper({
  options,
  value,
  onChange,
}: {
  options: number[];
  value: number;
  onChange: (n: number) => void;
}) {
  const index = Math.max(0, options.indexOf(value));
  const max = options[options.length - 1];

  return (
    <div className="flex items-stretch overflow-hidden rounded-full border border-edge-soft bg-white/80">
      <button
        type="button"
        onClick={() => onChange(options[Math.max(0, index - 1)])}
        disabled={index === 0}
        aria-label="Fewer"
        className="grid w-10 place-items-center border-r border-edge-soft text-base text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-accent active:bg-panel-3 disabled:text-faint/40 disabled:hover:bg-transparent"
      >
        −
      </button>
      <span className="grid min-w-16 place-items-center px-1.5">
        <span className="overline text-faint">count</span>
        <span className="mt-0.5 font-mono text-sm text-text">
          {value}/{max}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onChange(options[Math.min(options.length - 1, index + 1)])}
        disabled={index === options.length - 1}
        aria-label="More"
        className="grid w-10 place-items-center border-l border-edge-soft text-base text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-accent active:bg-panel-3 disabled:text-faint/40 disabled:hover:bg-transparent"
      >
        +
      </button>
    </div>
  );
}
