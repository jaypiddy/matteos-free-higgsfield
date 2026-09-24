"use client";

import { useMemo, useState } from "react";
import ResultGrid from "@/components/ResultGrid";
import { useJobs } from "@/components/useJobs";

export default function LibraryPage() {
  const { jobs, loaded, refresh } = useJobs();
  const [kind, setKind] = useState<"all" | "image" | "video">("all");
  const [model, setModel] = useState("all");
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
    () => Array.from(new Set(jobs.map((j) => j.model_name))).sort(),
    [jobs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        (kind === "all" || j.kind === kind) &&
        (model === "all" || j.model_name === model) &&
        (!q || j.prompt.toLowerCase().includes(q)),
    );
  }, [jobs, kind, model, query]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1560px] px-5 pt-12 pb-20 sm:px-10">
        {/* Title on its own line, filters on the next — the old single row ran
            out of width the moment a model name got long. */}
        <header className="mb-8 border-b border-edge-soft pb-7">
          <div className="flex items-end justify-between gap-5">
            <div>
              <span className="tag overline text-muted">Archive</span>
              <h1 className="mt-4 text-xl">Library</h1>
            </div>
            <p className="shrink-0 pb-2 text-sm text-faint">
              <span className="figure text-lg text-text">{filtered.length}</span> shown
            </p>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search prompts…"
              className="w-64 rounded-full border border-edge bg-white/85 px-5 py-3 text-sm backdrop-blur transition-colors duration-200 outline-none placeholder:text-faint focus:border-accent"
            />

            <div className="flex gap-1.5 rounded-full border border-edge-soft bg-white/85 p-1.5 backdrop-blur">
              {(["all", "image", "video"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`press rounded-full px-4 py-2 text-sm font-bold capitalize ${
                    kind === k
                      ? "brand-gradient sheen text-accent-ink shadow-[var(--shade-accent)]"
                      : "text-muted hover:bg-accent-soft hover:text-accent"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-full border border-edge bg-white/85 px-4 py-3 text-sm text-muted backdrop-blur transition-colors duration-200 outline-none hover:border-accent focus:border-accent"
            >
              <option value="all">All models</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {failedCount > 0 && (
              <button
                onClick={clearFailed}
                disabled={clearing}
                className="press ml-auto shrink-0 rounded-full border border-danger/40 bg-white/70 px-5 py-3 text-sm font-bold text-danger hover:border-danger hover:bg-danger/5 disabled:opacity-50"
              >
                {clearing ? "Clearing…" : `Clear ${failedCount} failed`}
              </button>
            )}
          </div>
        </header>

        <ResultGrid
          jobs={filtered}
          loaded={loaded}
          onChanged={refresh}
          emptyHint="Everything you generate is saved here, including a local copy of the file."
        />
      </div>
    </div>
  );
}
