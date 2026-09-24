import { NextResponse } from "next/server";
import { deleteJob, getJob, updateJob } from "@/lib/db";
import { cancel } from "@/lib/higgsfield";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "No such job." }, { status: 404 });
  return NextResponse.json({ job });
}

const TERMINAL = ["completed", "failed", "nsfw", "canceled"];

/**
 * Cancels a job that's still running, or removes one that's already finished.
 *
 * The two cases are deliberately the same button: on a running tile it reads
 * "Cancel", on a finished one "Remove", and which happens is decided here from
 * the job's actual state rather than trusted from the client.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "No such job." }, { status: 404 });

  if (TERMINAL.includes(job.status)) {
    const { removedFiles } = deleteJob(id);
    return NextResponse.json({ ok: true, removed: true, removedFiles });
  }

  // Still running: stop it upstream first, then mark it locally.
  if (job.request_id) {
    try {
      await cancel(job.request_id);
    } catch {
      // Already finished or already gone — fall through and mark it locally.
    }
  }
  updateJob(id, { status: "canceled", error: "Canceled." });
  return NextResponse.json({ ok: true, removed: false });
}
