#!/usr/bin/env node
/**
 * Turns lib/catalog.generated.json into lib/catalog.ts — the model registry.
 *
 * Run `npm run discover` first. This step is pure transformation: no network,
 * no guessing. It merges a model's text-to-X and image-to-X endpoints into one
 * entry (so "Kling 3.0 Pro" is one model that swaps endpoint when you attach an
 * image, rather than two near-identical rows), derives display names from
 * slugs, and maps discovered field types onto the UI's control types.
 */

import { readFileSync, writeFileSync } from "node:fs";

const rows = JSON.parse(readFileSync(new URL("../lib/catalog.generated.json", import.meta.url)));

/** Trailing segments that describe the operation rather than the model. */
const OPS = [
  "text-to-video", "image-to-video", "text-to-image", "image-to-image",
  "reference-to-video", "first-last-frame", "video-reference", "image-reference",
  "video-edit", "video-extend", "edit", "remix",
];

const FAMILY = {
  "kling-video": "Kling", bytedance: "Seedance", alibaba: "Alibaba", wan: "Wan",
  minimax: "MiniMax", lightricks: "LTX", recraft: "Recraft", "higgsfield-ai": "Higgsfield",
  pixverse: "PixVerse", xai: "Grok", ideogram: "Ideogram", "marketing-studio": "Higgsfield",
  "soul-id": "Higgsfield", "z-image": "Z-Image",
};

const LABEL = {
  aspect_ratio: "Ratio", resolution: "Quality", duration: "Length", cfg_scale: "CFG",
  generate_audio: "Audio", prompt_optimizer: "Optimise", enhance_prompt: "Enhance",
  output_format: "Format", quality: "Effort", rendering_speed: "Render", seed: "Seed",
  negative_prompt: "Avoid", style_strength: "Strength", custom_reference_strength: "Likeness",
  camera_fixed: "Lock camera", motion_id: "Motion",
};

const title = (s) =>
  s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bV(\d)/g, "V$1");

function split(slug) {
  const parts = slug.split("/");
  let op = null;
  if (OPS.includes(parts.at(-1))) op = parts.pop();
  else if (parts.length > 1 && OPS.includes(parts.slice(-2).join("/"))) {
    op = parts.splice(-2).join("/");
  }
  return { base: parts.join("/"), op, vendor: slug.split("/")[0] };
}

/** Pick a sensible default from a set of options. */
function pickDefault(key, values, numeric) {
  const v = values.map((x) => (numeric ? Number(x) : x));
  if (key === "resolution") {
    for (const want of ["720p", "1k", "2k", "1080p"]) if (v.includes(want)) return want;
  }
  if (key === "aspect_ratio") {
    for (const want of ["16:9", "1:1", "4:3"]) if (v.includes(want)) return want;
  }
  if (key === "quality") {
    for (const want of ["medium", "low"]) if (v.includes(want)) return want;
  }
  if (key === "rendering_speed") return v.includes("DEFAULT") ? "DEFAULT" : v[0];
  if (numeric) return v.includes(5) ? 5 : v.includes(6) ? 6 : v[0];
  return v[0];
}

function toParam(key, info) {
  const label = LABEL[key] ?? title(key);
  if (info.kind === "range") {
    // Contiguous, so a slider covers every valid value with none in between
    // that the API would reject.
    const mid = Math.min(Math.max(5, info.min), info.max);
    return { key, label, type: "int", min: info.min, max: info.max, default: mid };
  }
  if (info.kind === "enum") {
    const options = info.numeric ? info.values.map(Number) : info.values;
    return { key, label, type: "enum", options, default: pickDefault(key, info.values, info.numeric) };
  }
  if (info.type === "boolean") return { key, label, type: "bool", default: key === "enhance_prompt" || key === "prompt_optimizer" };
  if (key === "seed") return { key, label, type: "seed" };
  if (info.type === "integer") return { key, label, type: "int", min: 1, max: 12, default: 5 };
  if (info.type === "number") {
    return { key, label, type: "float", min: 0, max: 1, step: 0.01, default: 0.5 };
  }
  if (info.type === "string") return { key, label, type: "text" };
  return null;
}

// --------------------------------------------------------------- assemble
const groups = new Map();
for (const r of rows) {
  if (r.status !== "ok") continue;
  // Advertised in the catalogue and priced by /estimate, but the generate
  // endpoint rejects every body shape with the same server-side error
  // ("type_ is non nullable field, but null was passed") — including an empty
  // one. It cannot be called successfully, so shipping it would put a $2.50
  // model in the picker that always fails.
  if (r.slug === "soul-id") continue;

  // Skip anything needing an input the composer can't supply: a source video,
  // a second keyframe, or an audio track. Shipping these would put models in
  // the picker that fail the moment you press Generate.
  const UNSUPPORTED = ["video_url", "video_urls", "first_frame_url", "last_frame_url", "audio_urls"];
  if (r.required.some((f) => UNSUPPORTED.includes(f))) continue;
  const { base, op, vendor } = split(r.slug);
  if (!groups.has(base)) groups.set(base, { base, vendor, variants: [] });
  groups.get(base).variants.push({ ...r, op });
}

const models = [];
for (const { base, vendor, variants } of groups.values()) {
  const text = variants.find((v) => v.op === "text-to-video" || v.op === "text-to-image") ?? null;
  const image =
    variants.find((v) => v.op === "image-to-video" || v.op === "edit" || v.op === "image-to-image") ?? null;
  const primary = text ?? variants[0];
  const rest = variants.filter((v) => v !== primary && v !== image);

  const emit = (main, second, suffix) => {
    const needsRef = !!main.required.find((f) => f === "image_url" || f === "image_urls");
    const refKey =
      main.required.find((f) => f === "image_url" || f === "image_urls") ??
      (second?.required.includes("image_urls") ? "image_urls" : second ? "image_url" : undefined);

    const params = Object.entries(main.params)
      .map(([k, info]) => toParam(k, info))
      .filter(Boolean);

    const batchInfo = main.params.num_images ?? main.params.batch_size;
    const batchKey = main.params.num_images ? "num_images" : main.params.batch_size ? "batch_size" : undefined;
    const batchOptions =
      batchInfo?.kind === "enum" ? batchInfo.values.map(Number) : batchKey ? [1, 2, 3, 4] : undefined;

    // A short capability summary reads better in the picker than a generic
    // marketing line, and it is derived from what the API actually accepts.
    const bits = [];
    const res = main.params.resolution;
    if (res?.kind === "enum") bits.push(`up to ${res.values.at(-1)}`);
    const dur = main.params.duration;
    if (dur?.kind === "range") bits.push(`${dur.min}\u2013${dur.max}s`);
    else if (dur?.kind === "enum" && dur.values.length > 1) {
      bits.push(`${dur.values.join("/")}s`);
    }
    if (main.params.generate_audio) bits.push("optional audio");
    if (needsRef) bits.push("needs an image");
    else if (second) bits.push("text or image input");
    if (main.metered) bits.push("billed per token");
    const blurb = bits.length
      ? bits.join(" \u00b7 ").replace(/^./, (c) => c.toUpperCase()) + "."
      : `${title(vendor)} model.`;

    models.push({
      id: (main.slug + (suffix ?? "")).replace(/[^a-z0-9]+/gi, "-").toLowerCase(),
      name: [title(base.split("/").slice(1).join(" ") || base), suffix].filter(Boolean).join(" ").trim() || title(base),
      family: FAMILY[vendor] ?? title(vendor),
      vendor,
      kind: main.output === "image" ? "image" : "video",
      endpoint: main.path,
      imageEndpoint: second?.path,
      refImageKey: refKey,
      refArray: refKey === "image_urls",
      refRequired: needsRef,
      batchKey,
      batchOptions,
      metered: main.metered,
      meteredNote: main.metered ? "Billed per token, not per generation." : undefined,
      fromUsd: main.price ?? 0,
      blurb,
      params: params.filter((p) => p.key !== "num_images" && p.key !== "batch_size"),
      slug: main.slug,
      op: main.op,
    });
  };

  emit(primary, image);
  for (const extra of rest) emit(extra, null, title(extra.op ?? ""));
}

models.sort((a, b) =>
  a.family.localeCompare(b.family) || a.name.localeCompare(b.name) || a.fromUsd - b.fromUsd);

const body = models
  .map((m) => {
    const keys = Object.entries(m)
      .filter(([k, v]) => v !== undefined && v !== false && k !== "slug" && k !== "op")
      .map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`)
      .join("\n");
    return `  {\n${keys}\n  },`;
  })
  .join("\n");

writeFileSync(
  new URL("../lib/catalog.ts", import.meta.url),
  `// GENERATED by scripts/build-registry.mjs from lib/catalog.generated.json.
// Do not edit by hand — run \`npm run discover && npm run build:registry\`.
// Every endpoint, parameter and enum here was probed against the live API.
import type { ModelDef } from "./models";

export const CATALOG: ModelDef[] = [
${body}
];
`,
);
console.log(`wrote lib/catalog.ts — ${models.length} models`);
const fams = {};
for (const m of models) fams[m.family] = (fams[m.family] ?? 0) + 1;
console.log(Object.entries(fams).map(([f, n]) => `  ${f}: ${n}`).join("\n"));
