"use client";

import { Column, Grid } from "@carbon/react";
import PromptBar from "./PromptBar";
import ResultGrid from "./ResultGrid";
import { useJobs } from "./useJobs";

/** Image and Video pages are the same surface over a different model set. */
export default function Studio({ kind }: { kind: "image" | "video" }) {
  const { jobs, loaded, refresh } = useJobs(kind);

  return (
    <div className="studio">
      {/* The composer is docked rather than floating, so the results column
          scrolls behind nothing and needs no padding cut for it. */}
      <div className="studio__results">
        <Grid>
          <Column sm={4} md={8} lg={16}>
            <header className="page-header page-header--split">
              <div>
                <p className="page-overline">Studio</p>
                <h1 className="page-title">{kind === "image" ? "Image" : "Video"}</h1>
              </div>
              <p className="page-count">
                <span className="page-count__figure">{jobs.length}</span>{" "}
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
          </Column>
        </Grid>
      </div>

      <PromptBar kind={kind} onSubmitted={refresh} />
    </div>
  );
}
