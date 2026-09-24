"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isActive, type Job } from "@/lib/shared";

/**
 * Polls our own database, not Higgsfield — the server worker owns the upstream
 * conversation. Polls quickly while something is running and slowly when idle.
 */
export function useJobs(kind?: "image" | "video") {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Mirrored in a ref so the poll loop can read the latest jobs to pick its
  // next delay without re-running the effect on every update.
  const latest = useRef<Job[]>([]);

  const refresh = useCallback(async () => {
    try {
      const qs = kind ? `?kind=${kind}` : "";
      const res = await fetch(`/api/jobs${qs}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        latest.current = data.jobs ?? [];
        setJobs(latest.current);
      }
    } catch {
      // Dev server restarting, most likely — the next tick will catch up.
    } finally {
      setLoaded(true);
    }
  }, [kind]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function loop() {
      await refresh();
      if (cancelled) return;
      timer = setTimeout(loop, latest.current.some(isActive) ? 1500 : 8000);
    }

    void loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  return { jobs, loaded, refresh };
}
