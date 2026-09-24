import { NextResponse } from "next/server";
import { BadRequest, parseGenerationRequest } from "@/lib/payload";
import { HiggsfieldError, MissingCredentialsError, estimate, isMetered } from "@/lib/higgsfield";

export const runtime = "nodejs";

/**
 * Prices a request without running it.
 *
 * Doubles as the availability probe. Which models a key can reach depends on
 * the plan behind it, and Higgsfield disables models from time to time — Veo
 * 3.1 worked in August and is off now. Those are reported as "unavailable"
 * rather than as errors, so the composer can grey the model out with a reason
 * instead of failing at generation time.
 */
export async function POST(req: Request) {
  try {
    const { endpoint, body } = parseGenerationRequest(await req.json());
    const result = await estimate(endpoint, body);

    if (isMetered(result)) {
      return NextResponse.json({
        available: true,
        metered: true,
        note: result.pricing_description,
      });
    }

    return NextResponse.json({
      available: true,
      credits: Number(result.credits),
      usd: Number(result.usd),
    });
  } catch (err) {
    if (err instanceof BadRequest) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err instanceof MissingCredentialsError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof HiggsfieldError) {
      const reason = unavailableReason(err);
      if (reason) return NextResponse.json({ available: false, reason });
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not estimate cost." }, { status: 500 });
  }
}

/** Higgsfield's three "you can't use this model right now" signals. */
export function unavailableReason(err: HiggsfieldError): string | null {
  if (err.status === 404) return "Not offered on your Higgsfield plan";
  if (err.status === 423) return "Blocked for your account";
  if (err.status === 503) return "Temporarily disabled by Higgsfield";
  return null;
}
