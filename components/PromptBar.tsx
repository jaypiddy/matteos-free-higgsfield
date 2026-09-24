"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Dropdown, IconButton, InlineLoading, InlineNotification, TextArea } from "@carbon/react";
import { Add, Close, Music } from "@carbon/icons-react";
import {
  acceptFor,
  attachmentFallback,
  refKindOf,
  defaultParams,
  getModel,
  maxRefs,
  modelsByKind,
  supportsAttachment,
} from "@/lib/models";
import { formatUsd } from "@/lib/shared";
import ModelPicker from "./ModelPicker";
import ParamControl from "./ParamControl";

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
 * This is where all the time goes, so it is the largest thing on the page,
 * and Generate — carrying the live price — is the one primary button in it.
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


  const hasBatch = Boolean(model.batchOptions && model.batchOptions.length > 1);
  const refNoun = refKindOf(model) === "audio" ? "a WAV" : refKindOf(model) === "video" ? "an MP4" : "an image";

  return (
    <div className="composer">
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay__panel">
            <p className="drop-overlay__title">Drop to attach</p>
            <p className="drop-overlay__body">
              {supportsAttachment(model)
                ? `${model.name} takes ${refNoun}`
                : "Drop an image, MP4 or WAV — the model switches to match"}
            </p>
          </div>
        </div>
      )}

      <div className="composer__inner">
        <div className="composer__notices">
          {error && (
            <InlineNotification kind="error" lowContrast title="Couldn't do that" subtitle={error} onClose={() => { setError(null); return true; }} />
          )}
          {switchedNote && (
            <InlineNotification kind="warning" lowContrast title="Model switched" subtitle={switchedNote} onClose={() => { setSwitchedNote(null); return true; }} />
          )}
          {blocked && (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title={`${model.name} isn't available to your API key`}
              subtitle={`${blocked}. Pick another model, or check your plan in the Higgsfield console.`}
            />
          )}
          {!blocked && metered && (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="Metered pricing"
              subtitle={`${model.meteredNote ?? `${model.name} bills per token rather than per generation, so there is no fixed price up front.`} Higgsfield reconciles the exact charge after the request runs.`}
            />
          )}
          {!blocked && missing.length > 0 && prompt.trim().length > 0 && (
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title="Needs more settings"
              subtitle={`${model.name} needs ${missing.map((d) => d.label.toLowerCase()).join(" and ")} set before it can run.`}
            />
          )}
        </div>

        {refs.length > 0 && (
          <div className="composer__refs">
            {refs.map((r, i) => (
              <div key={r.url} className="ref-thumb">
                {r.kind === "video" ? (
                  <video src={r.preview} muted playsInline />
                ) : r.kind === "audio" ? (
                  <span className="ref-thumb__audio">
                    <Music size={20} aria-hidden="true" />
                    <span>{r.name}</span>
                  </span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.preview} alt={r.name} />
                )}
                <IconButton
                  kind="secondary"
                  size="sm"
                  label={`Remove ${r.name}`}
                  align="top"
                  className="ref-thumb__remove"
                  onClick={() => setRefs((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Close />
                </IconButton>
              </div>
            ))}
            {switched && (
              <p className="composer__hint">
                Using {model.name}&apos;s image-to-{kind === "video" ? "video" : "image"} endpoint.
              </p>
            )}
          </div>
        )}

        {/* 1 — what it runs on: the model, then its settings, above the prompt
            they apply to. */}
        <div className="composer__settings">
          <ModelPicker current={model} onPick={setModelId} unavailable={unavailable} kind={kind} />

          {model.params.map((def) => (
            <ParamControl
              key={def.key}
              def={def}
              value={params[def.key]}
              onChange={(v) => setParams((p) => ({ ...p, [def.key]: v }))}
            />
          ))}

          {hasBatch && (
            <div className="param param--enum">
              <Dropdown
                id="param-batch"
                size="sm"
                titleText="Count"
                label="Count"
                items={model.batchOptions!}
                itemToString={(n) => (n === null || n === undefined ? "" : String(n))}
                selectedItem={batch}
                onChange={({ selectedItem }) => setBatch(selectedItem ?? 1)}
              />
            </div>
          )}
        </div>

        {/* 2 — what you are asking for. */}
        <TextArea
          ref={textarea}
          id={`prompt-${kind}`}
          labelText="Prompt"
          hideLabel
          rows={1}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={kind === "image" ? "Describe the image you imagine" : "Describe the shot you imagine"}
          className="composer__prompt"
        />

        {/* 3 — sending it. */}
        <div className="composer__actions">
          <Button
            kind="tertiary"
            size="md"
            renderIcon={uploading ? undefined : Add}
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            title={
              supportsAttachment(model)
                ? `Attach ${refNoun} — or drop one anywhere, or paste`
                : `Attach a file (switches away from ${model.name}, which can't use one)`
            }
          >
            {uploading ? <InlineLoading description="Uploading…" /> : "Attach"}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept={acceptFor(refKindOf(model))}
            multiple={maxRefs(model) > 1}
            hidden
            onChange={(e) => attach(e.target.files)}
          />

          <span className="composer__keys">
            <kbd>↵</kbd> send <span aria-hidden="true">·</span> <kbd>⇧↵</kbd> new line
          </span>

          {/* The price rides inside the button, because the number is what
              people check before committing. */}
          <Button kind="primary" size="lg" onClick={generate} disabled={!canSubmit} className="composer__generate">
            {busy ? (
              <InlineLoading description="Starting…" />
            ) : blocked ? (
              "Unavailable"
            ) : (
              <>
                Generate
                <span className="composer__price">
                  {estimating ? "···" : metered ? "metered" : formatUsd(estimate)}
                </span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
