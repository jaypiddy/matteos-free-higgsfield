#!/usr/bin/env node
/**
 * Probes every endpoint in the model registry against the live API.
 *
 * Higgsfield checks auth before routing, so an unauthenticated request returns
 * 401 for real and fake paths alike — only an authenticated call can tell a
 * live endpoint from a dead one. This uses /estimate, which prices a request
 * without generating anything, so running it costs nothing.
 *
 *   HF_API_KEY_ID=... HF_API_KEY_SECRET=... npm run verify
 *
 * Status meanings, learned from the live API:
 *   200  endpoint works and was priced
 *   400  endpoint exists; our probe body was wrong (e.g. missing image_url).
 *        The error text enumerates the valid values, which is how the
 *        registry's enums were derived.
 *   404  {"detail":"model_not_found"} — not offered on this plan
 *   423  {"detail":"model_blocked"}   — withheld from this account
 */

import { readFileSync } from "node:fs";

const ID = process.env.HF_API_KEY_ID;
const SECRET = process.env.HF_API_KEY_SECRET;

if (!ID || !SECRET) {
  console.error("Set HF_API_KEY_ID and HF_API_KEY_SECRET first.");
  process.exit(1);
}

// Pull endpoints straight out of the registry so this can't drift from it.
const source = readFileSync(new URL("../lib/models.ts", import.meta.url), "utf8");
const endpoints = [
  ...new Set([...source.matchAll(/(?:endpoint|imageEndpoint):\s*"([^"]+)"/g)].map((m) => m[1])),
];

const headers = {
  Authorization: `Key ${ID}:${SECRET}`,
  "Content-Type": "application/json",
  // Cloudflare rejects some default client user-agents with error 1010.
  "User-Agent": "higgsfield-studio/1.0",
};

// A placeholder is enough: /estimate validates the body but never fetches it.
const PLACEHOLDER = "https://example.com/reference.jpg";

const results = [];

for (const path of endpoints) {
  const body = { prompt: "a quiet alpine lake at sunrise" };
  if (path.includes("image-to-video")) body.image_url = PLACEHOLDER;
  if (path.includes("/reference")) body.image_reference_url = PLACEHOLDER;

  let row;
  try {
    const res = await fetch(`https://api.higgsfield.ai/estimate${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();

    if (res.ok) {
      const { usd, credits } = JSON.parse(text);
      row = { path, state: "ok", note: `$${usd} · ${credits} credits` };
    } else if (res.status === 404) {
      row = { path, state: "missing", note: "not offered on this plan" };
    } else if (res.status === 423) {
      row = { path, state: "blocked", note: "blocked for this account" };
    } else if (res.status === 400 || res.status === 422) {
      // The path resolved; only the probe body was rejected.
      let detail = text;
      try {
        detail = JSON.parse(text).detail ?? text;
      } catch {
        /* keep raw */
      }
      row = { path, state: "exists", note: String(detail).slice(0, 80) };
    } else {
      row = { path, state: "error", note: `${res.status} ${text.slice(0, 80)}` };
    }
  } catch (err) {
    row = { path, state: "error", note: `network error: ${err.message}` };
  }

  results.push(row);
  const mark = { ok: "✓", exists: "•", blocked: "⊘", missing: "✗", error: "!" }[row.state];
  console.log(`${mark} ${row.path.padEnd(48)} ${row.note}`);

  // Stay well clear of Cloudflare's rate limiting.
  await new Promise((r) => setTimeout(r, 120));
}

const broken = results.filter((r) => r.state === "missing" || r.state === "error");
const blocked = results.filter((r) => r.state === "blocked");

console.log(
  `\n${results.filter((r) => r.state !== "missing" && r.state !== "error").length}/${results.length} endpoints reachable.`,
);
if (blocked.length) console.log(`${blocked.length} blocked for this account.`);
if (broken.length) {
  console.log(`\nRemove or repath these in lib/models.ts:`);
  for (const r of broken) console.log(`  ${r.path} — ${r.note}`);
  process.exitCode = 1;
}
