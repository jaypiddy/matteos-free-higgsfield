"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  InlineNotification,
  Link,
  NumberInput,
  PasswordInput,
  Stack,
  TextInput,
  Tile,
} from "@carbon/react";
import { Save } from "@carbon/icons-react";
import { CONSOLE } from "@/lib/brand";
import { formatBytes, formatUsd } from "@/lib/shared";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function SettingsPage() {
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [maxConcurrent, setMaxConcurrent] = useState(4);
  const [spendCap, setSpendCap] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [splitNotice, setSplitNotice] = useState(false);
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

  /**
   * The Higgsfield console now hands out a single "API key" that is really
   * `KEY_ID:KEY_SECRET`. Pasting that whole string into Key ID splits it into
   * both fields, so nobody has to cut it in half by hand.
   */
  function onKeyIdChange(value: string) {
    const colon = value.indexOf(":");
    if (colon > 0 && colon < value.length - 1) {
      setKeyId(value.slice(0, colon).trim());
      setKeySecret(value.slice(colon + 1).trim());
      setSplitNotice(true);
      return;
    }
    setKeyId(value);
  }

  async function save() {
    setSaveState("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId, keySecret, maxConcurrent, spendCap }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      if (keySecret.trim()) {
        setHasSecret(true);
        setSource("database");
      }
      setKeySecret("");
      setSplitNotice(false);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2200);
    } catch {
      setSaveState("error");
    }
  }

  return (
    <div className="cds-page">
      <Grid>
        <Column sm={4} md={8} lg={16}>
          <header className="page-header">
            <p className="page-overline">Configuration</p>
            <h1 className="page-title">Settings</h1>
          </header>
        </Column>

        <Section
          title="Higgsfield API key"
          note={
            <>
              Create a key in the{" "}
              <Link href={CONSOLE.href} target="_blank" rel="noopener noreferrer" inline>
                Higgsfield Console
              </Link>{" "}
              and paste it into Key ID — a combined <code>id:secret</code> key is split
              automatically. Both parts are stored in this machine&apos;s local database, and the
              secret is never sent to the browser.
            </>
          }
        >
          {source === "environment" && (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="Key loaded from .env.local"
              subtitle="There is nothing to do here. Entering a key below overrides it for this machine."
            />
          )}
          {splitNotice && (
            <InlineNotification
              kind="success"
              lowContrast
              onClose={() => setSplitNotice(false)}
              title="Key split into ID and secret"
              subtitle="Save to store both."
            />
          )}

          <TextInput
            id="key-id"
            labelText="Key ID"
            value={keyId}
            onChange={(e) => onKeyIdChange(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            autoComplete="off"
            spellCheck={false}
          />

          <PasswordInput
            id="key-secret"
            labelText="Key secret"
            value={keySecret}
            onChange={(e) => setKeySecret(e.target.value)}
            placeholder={hasSecret ? "Saved — leave blank to keep" : "Key secret"}
            helperText={hasSecret ? "A secret is saved. Leave this blank to keep it." : undefined}
            autoComplete="off"
          />
        </Section>

        <Section title="Limits">
          <NumberInput
            id="max-concurrent"
            label="Concurrent requests"
            helperText="Higgsfield rejects requests beyond your account's limit — 4 by default. Extra jobs queue locally instead of failing."
            min={1}
            max={16}
            value={maxConcurrent}
            onChange={(_e, { value }) => setMaxConcurrent(Number(value) || 1)}
          />

          <NumberInput
            id="spend-cap"
            label="Spend cap (USD per 30 days)"
            helperText="Blocks new generations once estimated spend passes this. Leave empty for no cap."
            min={0}
            step={1}
            allowEmpty
            placeholder="No cap"
            value={spendCap === "" ? "" : Number(spendCap)}
            onChange={(_e, { value }) => setSpendCap(value === "" || value === undefined ? "" : String(value))}
          />
        </Section>

        <Section
          title="Storage"
          note="Higgsfield deletes generated files after about seven days, so every output is downloaded to storage/media in this project and served from there."
        >
          <div className="stat-row">
            <Stat label="Files" value={String(stats?.outputs ?? 0)} />
            <Stat label="On disk" value={formatBytes(stats?.diskBytes ?? 0)} />
            <Stat label="Spent all time" value={formatUsd(stats?.allTime.usd ?? 0)} />
          </div>
        </Section>

        <Column sm={4} md={8} lg={{ span: 12, offset: 4 }}>
          <div className="page-actions">
            <Button renderIcon={Save} onClick={save} disabled={saveState === "saving"}>
              Save
            </Button>
            {saveState === "saving" && <InlineLoading description="Saving…" />}
            {saveState === "saved" && <InlineLoading status="finished" description="Saved" />}
            {saveState === "error" && <InlineLoading status="error" description="Could not save" />}
          </div>
        </Column>
      </Grid>
    </div>
  );
}

/** A form section: title and note on the left four columns, controls beside. */
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
    <>
      <Column sm={4} md={8} lg={4} className="section-intro">
        <h2 className="section-title">{title}</h2>
        {note && <p className="section-note">{note}</p>}
      </Column>
      {/* 4 + 12 fills the 16-column row, so the next section starts on its own
          line; .section-body caps the controls' width instead. */}
      <Column sm={4} md={8} lg={12} className="section-body">
        <Stack gap={6}>{children}</Stack>
      </Column>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Tile className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
    </Tile>
  );
}
