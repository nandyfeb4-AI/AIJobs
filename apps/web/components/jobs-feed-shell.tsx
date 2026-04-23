"use client";

import { useCallback, useState } from "react";

import type { AggregatedJob } from "@aijobs/types";

import { LiveJobsExplorer } from "./live-jobs-explorer";
import { SourceOverview } from "./source-overview";

export function JobsFeedShell() {
  const [jobs, setJobs] = useState<AggregatedJob[]>([]);

  const handleJobsChange = useCallback((nextJobs: AggregatedJob[]) => {
    setJobs(nextJobs);
  }, []);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
      <section>
        <LiveJobsExplorer onJobsChange={handleJobsChange} />
      </section>

      <aside className="space-y-6">
        <SourceOverview jobs={jobs} />

        <section className="bg-card rounded-2xl p-6 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
          <h2 className="text-ink text-sm font-semibold tracking-tight mb-2">Why These Jobs</h2>
          <p className="text-sage text-xs leading-6 mb-4">
            This screen now talks to the live aggregation endpoint. It is intentionally a preview
            layer first: fetch, inspect, and validate source quality before we add persistence,
            dedupe, scoring, and user-specific matching.
          </p>
          <ul className="space-y-2 text-xs text-sage">
            <li>Fetching runs across the seeded board catalog for the supported ATS sources</li>
            <li>Cards now use live company branding when a logo URL is available</li>
            <li>Next step is enrichment, persistence, and real match scoring</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
