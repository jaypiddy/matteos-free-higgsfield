"use client";

import { useMemo, useState } from "react";
import { Button, Column, ContentSwitcher, Dropdown, Grid, Search, Switch } from "@carbon/react";
import { TrashCan } from "@carbon/icons-react";
import ResultGrid from "@/components/ResultGrid";
import { useJobs } from "@/components/useJobs";

const KINDS = ["all", "image", "video"] as const;
type Kind = (typeof KINDS)[number];

const ALL_MODELS = "All models";

export default function LibraryPage() {
  const { jobs, loaded, refresh } = useJobs();
  const [kind, setKind] = useState<Kind>("all");
  const [model, setModel] = useState(ALL_MODELS);
  const [query, setQuery] = useState("");
  const [clearing, setClearing] = useState(false);

  // Failed, blocked and cancelled jobs hold nothing worth keeping — Higgsfield
  // doesn't charge for them — so clearing is offered as a single action.
  const failedCount = useMemo(
    () => jobs.filter((j) => ["failed", "nsfw", "canceled"].includes(j.status)).length,
    [jobs],
  );

  async function clearFailed() {
    setClearing(true);
    try {
      await fetch("/api/jobs/failed", { method: "DELETE" });
      await refresh();
    } finally {
      setClearing(false);
    }
  }

  const models = useMemo(
    () => [ALL_MODELS, ...Array.from(new Set(jobs.map((j) => j.model_name))).sort()],
    [jobs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        (kind === "all" || j.kind === kind) &&
        (model === ALL_MODELS || j.model_name === model) &&
        (!q || j.prompt.toLowerCase().includes(q)),
    );
  }, [jobs, kind, model, query]);

  return (
    <div className="cds-page">
      <Grid>
        <Column sm={4} md={8} lg={16}>
          <header className="page-header page-header--split">
            <div>
              <p className="page-overline">Archive</p>
              <h1 className="page-title">Library</h1>
            </div>
            <p className="page-count">
              <span className="page-count__figure">{filtered.length}</span> shown
            </p>
          </header>

          {/* Title on its own line, filters on the next — a single row ran out
              of width the moment a model name got long. */}
          <div className="toolbar">
            <div className="toolbar__search">
              <Search
                labelText="Search prompts"
                placeholder="Search prompts"
                size="md"
                value={query}
                onChange={(e) => setQuery(typeof e === "string" ? e : e.target.value)}
              />
            </div>

            <ContentSwitcher
              size="md"
              selectedIndex={KINDS.indexOf(kind)}
              onChange={({ index }) => setKind(KINDS[index ?? 0])}
              className="toolbar__kind"
            >
              <Switch name="all" text="All" />
              <Switch name="image" text="Image" />
              <Switch name="video" text="Video" />
            </ContentSwitcher>

            <div className="toolbar__model">
              <Dropdown
                id="library-model"
                titleText="Model"
                hideLabel
                label={ALL_MODELS}
                size="md"
                items={models}
                selectedItem={model}
                onChange={({ selectedItem }) => setModel(selectedItem ?? ALL_MODELS)}
              />
            </div>

            {failedCount > 0 && (
              <Button
                kind="danger--tertiary"
                size="md"
                renderIcon={TrashCan}
                onClick={clearFailed}
                disabled={clearing}
                className="toolbar__end"
              >
                {clearing ? "Clearing…" : `Clear ${failedCount} failed`}
              </Button>
            )}
          </div>

          <ResultGrid
            jobs={filtered}
            loaded={loaded}
            onChanged={refresh}
            emptyHint="Everything you generate is saved here, including a local copy of the file."
          />
        </Column>
      </Grid>
    </div>
  );
}
