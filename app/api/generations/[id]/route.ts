import { NextResponse } from "next/server";
import { deleteGeneration } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Deletes one generated result and the file behind it.
 *
 * Granular on purpose: a batch of four images is one job with four outputs, and
 * removing a single tile shouldn't take the other three. The parent job row is
 * cleaned up only when its last output goes.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { removedJob } = deleteGeneration(id);
  return NextResponse.json({ ok: true, removedJob });
}
