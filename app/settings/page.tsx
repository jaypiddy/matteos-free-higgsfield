"use client";

import { useEffect, useState } from "react";
import { AFFILIATE } from "@/lib/brand";
import { formatBytes, formatUsd } from "@/lib/shared";

export default function SettingsPage() {
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [maxConcurrent, setMaxConcurrent] = useState(4);
  const [spendCap, setSpendCap] = useState("");
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState<{ diskBytes: number; outputs: number; allTime: { usd: number } } | null>(null);

  useEffect(() => {
    void (async () => {
      const [s, st] = await Promise.all([
        fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/stats", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      setKeyId(s.keyId ?? "");
      setHasSecret(Boolean(s.hasSecret));
      setSource(s.source ?? null);
      setMaxConcurrent(s.maxConcurrent ?? 4);
      setSpendCap(s.spendCap ?? "");
      setStats(st);
    })();
  }, []);

  async function save() {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId, keySecret, maxConcurrent, spendCap }),
    });
    if (keySecret.trim()) {
      setHasSecret(true);
      setSource("database");
    }
    setKeySecret("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Each section is titled in a left-hand column with the controls beside
          it, so the page reads as a form rather than a stack of cards. */}
      <div className="mx-auto w-full max-w-4xl px-5 pt-12 pb-20 sm:px-10">
        <header className="mb-10 border-b border-edge-soft pb-7">
          <span className="tag overline text-muted">Configuration</span>
          <h1 className="mt-4 text-xl">Settings</h1>
        </header>

        <div className="divide-y divide-edge-soft">
          <Section
            title="Higgsfield API key"
            note={
              <>
                A key has two parts. Create one in the{" "}
                <a
                  href={AFFILIATE.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-accent underline decoration-dotted underline-offset-4 transition-colors hover:text-accent-dim"
                >
                  Higgsfield Console
                </a>
                , then paste both here. They are stored in this machine&apos;s local database,
                and the secret is never sent to the browser.
              </>
            }
          >
            {source === "environment" && (
              <p className="rounded-2xl border border-accent-line bg-accent-soft/80 px-5 py-4 text-sm leading-relaxed text-text-2">
                A key is already loaded from <code className="font-mono text-text">.env.local</code>,
                so there is nothing to do here. Entering one below overrides it for this machine.
              </p>
            )}

            <Field label="Key ID">
              <input
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
                className="w-full rounded-full border border-edge bg-white/85 px-5 py-3.5 font-mono text-sm backdrop-blur transition-colors duration-200 outline-none hover:border-accent-line focus:border-accent"
              />
            </Field>

            <Field label="Key secret">
              <input
                type="password"
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                placeholder={hasSecret ? "•••••••• (saved — leave blank to keep)" : "64-character secret"}
                className="w-full rounded-full border border-edge bg-white/85 px-5 py-3.5 font-mono text-sm backdrop-blur transition-colors duration-200 outline-none hover:border-accent-line focus:border-accent"
              />
            </Field>
          </Section>

          <Section title="Limits">
            <Field
              label="Concurrent requests"
              hint="Higgsfield rejects requests beyond your account's limit — 4 by default. Extra jobs queue locally instead of failing."
            >
              <input
                type="number"
                min={1}
                max={16}
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                className="w-32 rounded-full border border-edge bg-white/85 px-5 py-3.5 text-sm backdrop-blur transition-colors duration-200 outline-none hover:border-accent-line focus:border-accent"
              />
            </Field>

            <Field
              label="Spend cap (USD per 30 days)"
              hint="Blocks new generations once estimated spend passes this. Leave empty for no cap."
            >
              <input
                type="number"
                min={0}
                step="0.01"
                value={spendCap}
                onChange={(e) => setSpendCap(e.target.value)}
                placeholder="no cap"
                className="w-44 rounded-full border border-edge bg-white/85 px-5 py-3.5 text-sm backdrop-blur transition-colors duration-200 outline-none hover:border-accent-line focus:border-accent"
              />
            </Field>
          </Section>

          <Section
            title="Storage"
            note="Higgsfield deletes generated files after about seven days, so every output is downloaded to storage/media in this project and served from there."
          >
            <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-edge-soft bg-edge-soft sm:grid-cols-3">
              <Figure label="Files" value={String(stats?.outputs ?? 0)} />
              <Figure label="On disk" value={formatBytes(stats?.diskBytes ?? 0)} />
              <Figure label="Spent all time" value={formatUsd(stats?.allTime.usd ?? 0)} />
            </dl>
          </Section>
        </div>

        <div className="mt-10 flex items-center gap-4 border-t border-edge-soft pt-8">
          <button
            onClick={save}
            className="press brand-gradient sheen rounded-full px-10 py-4 text-sm font-extrabold tracking-wide text-accent-ink uppercase shadow-[var(--shade-accent)] hover:shadow-[var(--shade-accent-hover)]"
          >
            Save
          </button>
          {saved && <span className="fade-in text-sm font-bold text-accent-2">Saved</span>}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 py-10 first:pt-0 sm:grid-cols-[15rem_1fr] sm:gap-10">
      <div>
        <h2 className="display text-lg font-bold">{title}</h2>
        {note && <p className="mt-2.5 text-sm leading-relaxed text-muted">{note}</p>}
      </div>
      <div className="min-w-0 space-y-6">{children}</div>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/85 px-5 py-5 backdrop-blur">
      <dt className="overline text-faint">{label}</dt>
      <dd className="figure mt-2 break-all text-lg text-text">{value}</dd>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="overline mb-2.5 block text-faint">{label}</span>
      {children}
      {hint && <span className="mt-2.5 block text-xs leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}
