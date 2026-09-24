import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { hasCredentials } from "@/lib/higgsfield";

export const runtime = "nodejs";

/**
 * The secret is never sent back to the browser — only whether one is set.
 *
 * Credentials can come from the database or from `.env.local`, and `source`
 * says which. Without it a key supplied by the environment looks like no key
 * at all here, even though the app is working fine.
 */
export async function GET() {
  const dbKeyId = getSetting("hf_key_id");
  const dbSecret = getSetting("hf_key_secret");
  const envKeyId = process.env.HF_API_KEY_ID ?? "";
  const envSecret = process.env.HF_API_KEY_SECRET ?? "";

  const source = dbKeyId && dbSecret ? "database" : envKeyId && envSecret ? "environment" : null;

  return NextResponse.json({
    configured: hasCredentials(),
    source,
    keyId: dbKeyId ?? envKeyId,
    hasSecret: Boolean(dbSecret || envSecret),
    maxConcurrent: Number(getSetting("max_concurrent") ?? 4),
    spendCap: getSetting("spend_cap") ?? "",
  });
}

export async function POST(req: Request) {
  const body = await req.json();

  if (typeof body.keyId === "string") setSetting("hf_key_id", body.keyId.trim());
  // An empty secret means "leave the stored one alone", so the settings form can
  // be re-saved without retyping it.
  if (typeof body.keySecret === "string" && body.keySecret.trim()) {
    setSetting("hf_key_secret", body.keySecret.trim());
  }
  if (body.maxConcurrent !== undefined) {
    setSetting("max_concurrent", String(Math.max(1, Number(body.maxConcurrent) || 4)));
  }
  if (body.spendCap !== undefined) setSetting("spend_cap", String(body.spendCap ?? ""));

  return NextResponse.json({ ok: true, configured: hasCredentials() });
}
