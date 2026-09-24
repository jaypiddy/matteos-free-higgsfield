import { NextResponse } from "next/server";
import { deleteFailedJobs } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Clears every failed, blocked and cancelled job.
 *
 * Safe to offer as one click: Higgsfield doesn't charge for `failed` or `nsfw`
 * requests, so nothing here contributes to the spend history, and a failed job
 * has no output to lose.
 *
 * This sits at a static path, which Next matches ahead of the sibling `[id]`
 * route, so it can't be confused with deleting a job called "failed".
 */
export async function DELETE() {
  const removed = deleteFailedJobs();
  return NextResponse.json({ ok: true, removed });
}
