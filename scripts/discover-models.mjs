#!/usr/bin/env node
/**
 * Discovers every model the API offers and writes lib/catalog.generated.ts.
 *
 *   HF_API_KEY_ID=... HF_API_KEY_SECRET=... node scripts/discover-models.mjs
 *
 * Why this exists: the published OpenAPI spec is wrong and incomplete, and
 * hand-guessing endpoint paths misses most of the catalogue. `GET /models` is
 * the real source of truth. For each model this then probes `/estimate` — which
 * costs nothing — to learn:
 *
 *   - whether the key can actually reach it (200 / 404 / 423 / 503)
 *   - its price, or that it is token-metered
 *   - which fields are REQUIRED, by submitting an empty body and following the
 *     errors one at a time
 *   - each optional field's real enum values or type, by submitting a
 *     deliberately invalid value and reading what the validator rejects
 *
 * That last part matters because the API ignores unknown fields rather than
 * rejecting them, so a guessed parameter name fails silently.
 */

import { writeFileSync } from "node:fs";

const ID = process.env.HF_API_KEY_ID;
const SECRET = process.env.HF_API_KEY_SECRET;
if (!ID || !SECRET) {
  console.error("Set HF_API_KEY_ID and HF_API_KEY_SECRET first.");
  process.exit(1);
}

const H = {
  Authorization: `Key ${ID}:${SECRET}`,
  "Content-Type": "application/json",
  // Cloudflare rejects some default client user-agents with error 1010.
  "User-Agent": "matteos-free-higgsfield/1.0",
};

// Long enough to clear the minimum-length check some models enforce.
const PROMPT = "a quiet alpine lake at sunrise, editorial photography";
const PLACEHOLDER = {
  image_url: "https://example.com/a.jpg",
  image_urls: ["https://example.com/a.jpg"],
  video_url: "https://example.com/a.mp4",
  video_urls: ["https://example.com/a.mp4"],
  audio_urls: ["https://example.com/a.wav"],
  first_frame_url: "https://example.com/a.jpg",
  last_frame_url: "https://example.com/b.jpg",
  end_image_url: "https://example.com/b.jpg",
  image_reference_url: "https://example.com/a.jpg",
  custom_reference_id: "00000000-0000-0000-0000-000000000000",
  prompt: PROMPT,
};

/** Fields worth probing. Anything outside this list is left to the API default. */
const FIELDS = [
  "aspect_ratio", "resolution", "quality", "duration", "seed", "output_format",
  "batch_size", "num_images", "negative_prompt", "cfg_scale", "generate_audio",
  "prompt_optimizer", "enhance_prompt", "style_strength", "rendering_speed",
  "custom_reference_strength", "camera_fixed", "motion_id",
];
// Probe every second from 1 to 16. A sparse list was the old bug: it sampled
// [3,4,5,6,8,10,12], never saw 7/9/11/13-16, and so reported a continuous
// range as a short discrete set — capping models well below their real limit.
const DURATIONS = Array.from({ length: 16 }, (_, i) => i + 1);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function estimate(path, body) {
  const res = await fetch(`https://api.higgsfield.ai/estimate${path}`, {
    method: "POST", headers: H, body: JSON.stringify(body),
  });
  const text = await res.text();
  await sleep(45);
  return { code: res.status, text };
}

/** Submit an empty body and follow "'x' is a required property" until it stops. */
async function findRequired(path) {
  const required = [];
  let body = {};
  for (let i = 0; i < 8; i++) {
    const { code, text } = await estimate(path, body);
    const m = text.match(/'([a-z_]+)' is a required property/);
    if (!m) return { required, final: body, code, text };
    const field = m[1];
    if (required.includes(field)) break;
    required.push(field);
    body = { ...body, [field]: PLACEHOLDER[field] ?? PROMPT };
  }
  const { code, text } = await estimate(path, body);
  return { required, final: body, code, text };
}

async function describeField(path, base, field) {
  const { text } = await estimate(path, { ...base, [field]: "__probe__" });
  const enumMatch = text.match(/is not one of \[([^\]]*)\]/);
  if (enumMatch) {
    const raw = enumMatch[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
    // The validator prints numeric enums unquoted; keep that distinction,
    // because the API rejects "8" where it wants 8.
    const numeric = enumMatch[1].split(",").every((v) => /^\s*\d+(\.\d+)?\s*$/.test(v));
    return { kind: "enum", values: raw, numeric };
  }
  const typeMatch = text.match(/is not of type '(\w+)'/);
  if (typeMatch) return { kind: "type", type: typeMatch[1] };
  return null;
}

async function main() {
  const listRes = await fetch("https://api.higgsfield.ai/models", { headers: H });
  const { items } = await listRes.json();
  console.log(`catalogue: ${items.length} models\n`);

  const out = [];
  for (const [i, m] of items.entries()) {
    const path = `/${m.slug}`;
    const { required, final, code, text } = await findRequired(path);

    let status = "ok", price = null, metered = false, note = null;
    if (code === 404) status = "missing";
    else if (code === 423) status = "blocked";
    else if (code === 503) status = "disabled";
    else if (code !== 200) status = "error";

    if (code === 200) {
      const d = JSON.parse(text);
      if (d.type === "description") { metered = true; note = d.pricing_description; }
      else price = Number(d.usd);
    }

    const params = {};
    if (status === "ok") {
      for (const f of FIELDS) {
        const info = await describeField(path, final, f);
        if (info) params[f] = info;
      }
      // `duration` is often a bare integer with undocumented bounds, so find
      // which values are actually accepted rather than guessing. A contiguous
      // run becomes a slider; anything gappy stays a discrete choice, because a
      // slider there would let you pick a value the API rejects.
      if (params.duration?.kind === "type") {
        const good = [];
        for (const d of DURATIONS) {
          const { code: c } = await estimate(path, { ...final, duration: d });
          if (c === 200) good.push(d);
        }
        if (good.length) {
          const contiguous =
            good.length > 2 && good.every((v, i) => i === 0 || v === good[i - 1] + 1);
          params.duration = contiguous
            ? { kind: "range", min: good[0], max: good.at(-1) }
            : { kind: "enum", values: good.map(String), numeric: true };
        }
      }
    }

    out.push({
      slug: m.slug, path, output: m.output_type, ops: m.operation_type ?? [],
      status, price, metered, note, required, params,
    });
    console.log(
      `[${String(i + 1).padStart(2)}/${items.length}] ${status.padEnd(8)} ` +
      `${(metered ? "metered" : price === null ? "" : `$${price}`).padStart(9)}  ${m.slug}`,
    );
  }

  writeFileSync(
    new URL("../lib/catalog.generated.json", import.meta.url),
    JSON.stringify(out, null, 1),
  );
  const ok = out.filter((r) => r.status === "ok").length;
  console.log(`\n${ok}/${out.length} reachable. Written to lib/catalog.generated.json`);
}

main();
