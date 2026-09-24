"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ActionableNotification,
  ClickableTile,
  Column,
  Grid,
  InlineLoading,
  Link,
  Tile,
} from "@carbon/react";
import { ArrowRight, Launch } from "@carbon/icons-react";
import { useJobs } from "@/components/useJobs";
import JustifiedRows from "@/components/JustifiedRows";
import { aspectValue, formatBytes, formatUsd, isActive, mediaUrl, posterFrameUrl, timeAgo, STATUS_LABEL } from "@/lib/shared";
import { CONSOLE, BRAND } from "@/lib/brand";

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
 * Home is split rather than stacked.
 *
 * The wide column is work — the two things you can start, then everything you
 * have made. The narrow rail is account: what it has cost, where to get a key,
 * and what is running right now.
 */
export default function HomePage() {
  const router = useRouter();
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
    <div className="cds-page">
      <Grid>
        <Column sm={4} md={8} lg={16}>
          <header className="page-header page-header--split">
            <div>
              <p className="page-overline">{BRAND.short}</p>
              <h1 className="page-title">Home</h1>
            </div>
            <p className="page-tagline">{BRAND.tagline}</p>
          </header>

          {configured === false && (
            <ActionableNotification
              kind="warning"
              lowContrast
              inline
              hideCloseButton
              title="Add your Higgsfield API key"
              subtitle="Nothing can generate until the key ID and secret are set."
              actionButtonLabel="Open Settings"
              onActionButtonClick={() => router.push("/settings")}
              className="home-notice"
            />
          )}
        </Column>

        {/* ------------------------------------------------ work column */}
        <Column sm={4} md={8} lg={11}>
          <div className="home-starts">
            <StartTile
              href="/image"
              label="Image"
              title="Generate an image"
              body="Soul, Soul Cinema, Recraft V4.1, Popcorn, Soul Reference, Soul Character."
            />
            <StartTile
              href="/video"
              label="Video"
              title="Generate a video"
              body="Kling 2.5 Turbo Pro, Hailuo 02, Seedance 2.5, Wan 2.5, and more."
            />
          </div>

          <section className="home-section">
            <div className="home-section__head">
              <h2 className="section-title">Recent</h2>
              <Link as={NextLink} href="/library" renderIcon={ArrowRight}>
                View library
              </Link>
            </div>

            {loaded && !recent.length ? (
              <Tile className="home-empty">Your generations will show up here.</Tile>
            ) : (
              <JustifiedRows
                targetHeight={158}
                gap={16}
                items={recent.map((job) => {
                  const gen = job.outputs[0];
                  const src = mediaUrl(gen);
                  return {
                    key: job.id,
                    ratio: aspectValue(job),
                    render: (style: React.CSSProperties) => (
                      <NextLink key={job.id} href="/library" title={job.prompt} style={style} className="result-tile">
                        {src && gen.kind === "video" ? (
                          <video src={posterFrameUrl(src)} muted playsInline preload="metadata" className="result-tile__media" data-ready />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          src && <img src={src} alt={job.prompt} loading="lazy" className="result-tile__media" data-ready />
                        )}
                        <span className="result-tile__stamp">{timeAgo(job.created_at)}</span>
                      </NextLink>
                    ),
                  };
                })}
              />
            )}
          </section>
        </Column>

        {/* ------------------------------------------------ account rail */}
        <Column sm={4} md={8} lg={5}>
          <div className="home-rail">
            <Tile className="ledger">
              <h2 className="ledger__title">Spend</h2>
              <dl>
                <LedgerRow
                  label="Today"
                  value={formatUsd(stats?.today.usd ?? 0)}
                  sub={`${stats?.today.count ?? 0} generations`}
                  lead
                />
                <LedgerRow
                  label="This month"
                  value={formatUsd(stats?.month.usd ?? 0)}
                  sub={stats?.spendCap ? `cap ${formatUsd(Number(stats.spendCap))}` : "no cap set"}
                />
                <LedgerRow
                  label="All time"
                  value={formatUsd(stats?.allTime.usd ?? 0)}
                  sub={`${stats?.allTime.count ?? 0} jobs`}
                />
                <LedgerRow
                  label="Stored locally"
                  value={formatBytes(stats?.diskBytes ?? 0)}
                  sub={`${stats?.outputs ?? 0} files`}
                />
              </dl>
            </Tile>

            {/* ClickableTile forwards extra props to its <a>, but its types omit
                anchor attributes — spreading them in is what gets target through. */}
            <ClickableTile href={CONSOLE.href} renderIcon={Launch} {...NEW_TAB}>
              <p className="start-tile__title">{CONSOLE.label}</p>
              <p className="start-tile__mono">{CONSOLE.display}</p>
            </ClickableTile>

            {running.length > 0 && (
              <Tile className="ledger">
                <h2 className="ledger__title">In progress</h2>
                <ul className="running">
                  {running.map((job) => (
                    <li key={job.id}>
                      <InlineLoading description={STATUS_LABEL[job.status]} />
                      <p className="running__prompt">{job.prompt}</p>
                      <p className="running__model">{job.model_name}</p>
                    </li>
                  ))}
                </ul>
              </Tile>
            )}
          </div>
        </Column>
      </Grid>
    </div>
  );
}

/** One line of the spend ledger. The first row is the one people check, so it
 *  runs larger and the rest step down from it. */
function LedgerRow({ label, value, sub, lead }: { label: string; value: string; sub: string; lead?: boolean }) {
  return (
    <div className={`ledger__row${lead ? " ledger__row--lead" : ""}`}>
      <dt>
        <span>{label}</span>
        <span>{sub}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

const NEW_TAB: React.AnchorHTMLAttributes<HTMLAnchorElement> = {
  target: "_blank",
  rel: "noopener noreferrer",
};

/** A shortcut into a studio. Keeps a real href — so it can still be opened in a
 *  new tab — but routes client-side on a plain click. */
function StartTile({ href, label, title, body }: { href: string; label: string; title: string; body: string }) {
  const router = useRouter();
  return (
    <ClickableTile
      href={href}
      renderIcon={ArrowRight}
      className="start-tile"
      onClick={(e) => {
        // Carbon also fires this for Enter; only mouse clicks carry a button.
        if (e.metaKey || e.ctrlKey || e.shiftKey || ("button" in e && e.button !== 0)) return;
        e.preventDefault();
        router.push(href);
      }}
    >
      <p className="page-overline">{label}</p>
      <p className="start-tile__title">{title}</p>
      <p className="start-tile__body">{body}</p>
    </ClickableTile>
  );
}
