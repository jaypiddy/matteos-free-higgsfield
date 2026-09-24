"use client";

import PromptBar from "./PromptBar";
import ResultGrid from "./ResultGrid";
import { useJobs } from "./useJobs";

/** Image and Video pages are the same surface over a different model set. */
export default function Studio({ kind }: { kind: "image" | "video" }) {
  const { jobs, loaded, refresh } = useJobs(kind);

  return (
    <div className="flex h-full flex-col">
      {/* The composer is docked rather than floating, so the results column
          scrolls behind nothing and needs no padding cut for it. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1560px] px-5 pt-12 pb-14 sm:px-10">
          <header className="mb-9 flex items-end justify-between gap-5 border-b border-edge-soft pb-7">
            <div>
              <span className="tag overline text-muted">Studio</span>
              <h1 className="mt-4 text-xl capitalize">{kind}</h1>
            </div>
            <p className="shrink-0 pb-2 text-sm text-faint">
              <span className="figure text-lg text-text">{jobs.length}</span>{" "}
              {jobs.length === 1 ? "generation" : "generations"}
            </p>
          </header>

          <ResultGrid
            jobs={jobs}
            loaded={loaded}
            onChanged={refresh}
            emptyTitle={kind === "image" ? "No images yet" : "No videos yet"}
            emptyHint={
              kind === "image"
                ? "Describe an image below and pick a model to get started."
                : "Describe a shot below, or attach an image to animate it."
            }
          />
        </div>
      </div>

      <PromptBar kind={kind} onSubmitted={refresh} />
    </div>
  );
}
