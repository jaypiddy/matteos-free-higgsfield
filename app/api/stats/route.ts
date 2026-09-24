import { NextResponse } from "next/server";
import { db, getSetting, spendSince } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const totals = db()
    .prepare(
      `SELECT COUNT(*) AS jobs,
              COALESCE(SUM(CASE WHEN status = 'completed' THEN est_usd END), 0) AS usd
       FROM jobs`,
    )
    .get() as { jobs: number; usd: number };

  const outputs = db().prepare("SELECT COUNT(*) AS n FROM generations").get() as { n: number };
  const disk = db().prepare("SELECT COALESCE(SUM(bytes), 0) AS n FROM generations").get() as {
    n: number;
  };
  const active = db()
    .prepare(
      "SELECT COUNT(*) AS n FROM jobs WHERE status NOT IN ('completed','failed','nsfw','canceled')",
    )
    .get() as { n: number };

  return NextResponse.json({
    today: spendSince(startOfDay.getTime()),
    month: spendSince(startOfMonth.getTime()),
    allTime: { usd: totals.usd, count: totals.jobs },
    outputs: outputs.n,
    diskBytes: disk.n,
    active: active.n,
    spendCap: getSetting("spend_cap") ?? "",
  });
}
