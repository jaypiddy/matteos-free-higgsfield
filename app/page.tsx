"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useJobs } from "@/components/useJobs";
import JustifiedRows from "@/components/JustifiedRows";
import { aspectValue, formatBytes, formatUsd, isActive, mediaUrl, timeAgo } from "@/lib/shared";
import { CONSOLE, BRAND } from "@/lib/brand";
import { LogoTile } from "@/components/Logo";

interface Stats {
  today: { usd: number; count: number };
  month: { usd: number; count: number };
  allTime: { usd: number; count: number };
  outputs: number;
  diskBytes: number;
  active: number;
  spendCap: string;
}

/**
 * Home is split down the middle rather than stacked.
 *
 * The left column is work — the two things you can start, then everything you
 * have made. The right rail is account: what it has cost, where to get a key,
 * and what is running right now. Spend used to sit across the top as four
 * equal tiles, which gave a number nobody reads first the most valuable strip
 * on the page; as a ledger in the rail it is glanceable and out of the way.
 *
 * Inside the ledger the label sits above the figure rather than beside it, so
 * the number gets the full width of the rail and can be set large enough to
 * read without stopping to look.
 */
export default function HomePage() {
  const { jobs, loaded } = useJobs();
  const [stats, setStats] = useState<Stats | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    async function load() {
      const [s, c] = await Promise.all([
        fetch("/api/stats", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      setStats(s);
      setConfigured(c?.configured ?? false);
    }
    void load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  const running = jobs.filter(isActive);
  const recent = jobs.filter((j) => j.outputs.length).slice(0, 12);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1560px] px-5 pt-12 pb-20 sm:px-10">
        <header className="mb-10 flex items-end justify-between gap-5 border-b border-edge-soft pb-7">
          <div>
            <span className="tag overline text-muted">{BRAND.short}</span>
            <h1 className="mt-4 text-xl">Home</h1>
          </div>
          <p className="hidden shrink-0 pb-2 text-sm text-faint sm:block">{BRAND.tagline}</p>
        </header>

        {configured === false && (
          <Link
            href="/settings"
            className="press mb-10 flex items-center gap-4 rounded-2xl border border-accent-line bg-accent-soft/80 px-6 py-5 backdrop-blur hover:bg-accent-soft"
          >
            <span className="brand-gradient sheen grid size-11 shrink-0 place-items-center rounded-full text-lg text-accent-ink shadow-[var(--shade-accent)]">
              →
            </span>
            <div>
              <p className="display text-base font-bold">Add your Higgsfield API key</p>
              <p className="mt-0.5 text-sm text-muted">
                Nothing can generate until the key ID and secret are set.
              </p>
            </div>
          </Link>
        )}

        <div className="flex flex-col gap-10 lg:flex-row lg:gap-12">
          {/* ------------------------------------------------ work column */}
          <div className="min-w-0 flex-1 space-y-12">
            <section className="grid gap-5 sm:grid-cols-2">
              <Tile
                href="/image"
                label="Image"
                title="Generate an image"
                body="Soul, Soul Cinema, Recraft V4.1, Popcorn, Soul Reference, Soul Character."
              />
              <Tile
                href="/video"
                label="Video"
                title="Generate a video"
                body="Kling 2.5 Turbo Pro, Hailuo 02, Seedance 2.5, Wan 2.5, and more."
              />
            </section>

            <section>
              <div className="mb-5 flex items-center justify-between gap-4 border-b border-edge-soft pb-3.5">
                <h2 className="tag overline text-muted">Recent</h2>
                <Link
                  href="/library"
                  className="text-sm font-semibold text-accent transition-colors hover:text-accent-dim"
                >
                  View library →
                </Link>
              </div>

              {loaded && !recent.length ? (
                <p className="rounded-2xl border border-dashed border-edge bg-white/55 px-6 py-16 text-center text-base text-muted backdrop-blur">
                  Your generations will show up here.
                </p>
              ) : (
                <JustifiedRows
                  targetHeight={158}
                  gap={14}
                  items={recent.map((job, i) => {
                    const gen = job.outputs[0];
                    const src = mediaUrl(gen);
                    return {
                      key: job.id,
                      ratio: aspectValue(job),
                      render: (style: React.CSSProperties) => (
                        <Link
                          key={job.id}
                          href="/library"
                          title={job.prompt}
                          style={{ ...style, "--i": i } as React.CSSProperties}
                          className="rise lift group relative block overflow-hidden rounded-xl border border-edge-soft bg-white hover:border-accent-line"
                        >
                          {src && gen.kind === "video" ? (
                            <video src={src} muted playsInline preload="metadata" className="size-full object-cover" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            src && <img src={src} alt={job.prompt} loading="lazy" className="size-full object-cover" />
                          )}
                          <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-[#1a2238]/80 to-transparent px-3 pt-8 pb-2 text-2xs font-semibold text-white/90">
                            {timeAgo(job.created_at)}
                          </span>
                        </Link>
                      ),
                    };
                  })}
                />
              )}
            </section>
          </div>

          {/* ------------------------------------------------ account rail */}
          <aside className="w-full shrink-0 space-y-5 lg:sticky lg:top-0 lg:w-[22rem] lg:self-start">
            <section className="overflow-hidden rounded-2xl border border-edge-soft bg-white/85 shadow-[var(--shade)] backdrop-blur-xl">
              <div className="border-b border-edge-soft px-6 py-4">
                <h2 className="tag overline text-muted">Spend</h2>
              </div>
              <dl className="divide-y divide-edge-soft">
                <Row
                  label="Today"
                  value={formatUsd(stats?.today.usd ?? 0)}
                  sub={`${stats?.today.count ?? 0} generations`}
                  lead
                />
                <Row
                  label="This month"
                  value={formatUsd(stats?.month.usd ?? 0)}
                  sub={stats?.spendCap ? `cap ${formatUsd(Number(stats.spendCap))}` : "no cap set"}
                />
                <Row
                  label="All time"
                  value={formatUsd(stats?.allTime.usd ?? 0)}
                  sub={`${stats?.allTime.count ?? 0} jobs`}
                />
                <Row
                  label="Stored locally"
                  value={formatBytes(stats?.diskBytes ?? 0)}
                  sub={`${stats?.outputs ?? 0} files`}
                />
              </dl>
            </section>

            <a
              href={CONSOLE.href}
              target="_blank"
              rel="noopener noreferrer"
              className="press group flex items-center gap-4 rounded-2xl border border-edge-soft bg-white/85 px-5 py-5 text-left shadow-[var(--shade-sm)] backdrop-blur-xl hover:border-accent-line hover:bg-accent-soft"
            >
              <LogoTile className="size-11" />
              <span className="min-w-0">
                <span className="display block text-base font-bold text-text">
                  {CONSOLE.label}
                  <span className="ml-2 inline-block text-accent transition-transform duration-200 group-hover:translate-x-1">
                    &rarr;
                  </span>
                </span>
                <span className="mt-1 block truncate font-mono text-xs text-muted">
                  {CONSOLE.display}
                </span>
              </span>
            </a>

            {running.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-edge-soft bg-white/85 shadow-[var(--shade)] backdrop-blur-xl">
                <div className="border-b border-edge-soft px-6 py-4">
                  <h2 className="tag overline text-muted">
                    <span className="sr-only">Status: </span>In progress
                  </h2>
                </div>
                <div className="divide-y divide-edge-soft">
                  {running.map((job) => (
                    <div key={job.id} className="px-6 py-4">
                      <p className="line-clamp-2 text-sm leading-snug text-text-2">{job.prompt}</p>
                      <p className="mt-1.5 truncate text-2xs font-semibold text-faint">
                        {job.model_name}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/**
 * One line of the spend ledger. The first row is the one people check, so it
 * runs at the headline size and the rest step down from it.
 */
function Row({
  label,
  value,
  sub,
  lead,
}: {
  label: string;
  value: string;
  sub: string;
  lead?: boolean;
}) {
  return (
    <div className={`px-6 ${lead ? "py-5" : "py-4"}`}>
      <dt className="flex items-baseline justify-between gap-3">
        <span className="overline text-faint">{label}</span>
        <span className="shrink-0 text-2xs text-faint">{sub}</span>
      </dt>
      {/* min-w-0 + a break-all fallback: a five-figure total in a narrow rail
          should wrap rather than push the card wider than the column. */}
      <dd className={`figure mt-2 min-w-0 break-all text-text ${lead ? "text-2xl" : "text-lg"}`}>
        {value}
      </dd>
    </div>
  );
}

function Tile({
  href,
  label,
  title,
  body,
}: {
  href: string;
  label: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="lift group rounded-2xl border border-edge-soft bg-white/85 px-7 py-7 shadow-[var(--shade-sm)] backdrop-blur-xl hover:border-accent-line hover:bg-white"
    >
      <span className="tag overline text-accent">{label}</span>
      <p className="display mt-4 text-lg font-bold text-text">
        {title}
        <span className="ml-2 inline-block text-accent transition-transform duration-200 group-hover:translate-x-1.5">
          →
        </span>
      </p>
      <p className="mt-2.5 text-sm leading-relaxed text-muted">{body}</p>
    </Link>
  );
}
