"use client";

import { useEffect, useMemo, useState } from "react";

type CountRow = {
  label: string;
  count: number;
};

type RegistryStats = {
  generatedAt: string;
  jobs: {
    total: number;
    active: number;
    stale: number;
    inactive: number;
    latestSyncAt: string | null;
    latestIncrease: {
      total: number;
      since: string | null;
      bySource: CountRow[];
    };
    freshness: {
      synced24h: number;
      synced7d: number;
      synced14d: number;
      synced30d: number;
      synced60d: number;
      posted24h: number;
      posted7d: number;
      posted14d: number;
      posted30d: number;
      posted60d: number;
      unknownPostedAt: number;
    };
    postedAgeBuckets: CountRow[];
    syncAgeBuckets: CountRow[];
    bySource: CountRow[];
    byCategory: CountRow[];
    byWorkMode: CountRow[];
    byLocation: CountRow[];
    topCompanies: CountRow[];
    recent: Array<{
      sourceKey: string;
      sourceName: string;
      boardToken: string | null;
      title: string;
      company: string;
      location: string | null;
      remoteType: string | null;
      postedAt: string | null;
      lastSyncedAt: string;
    }>;
  };
  boards: {
    total: number;
    latestCheckedAt: string | null;
    byStatus: CountRow[];
    bySource: CountRow[];
    freshness: {
      neverChecked: number;
      checked24h: number;
      checked7d: number;
      checked14d: number;
      olderThan14d: number;
    };
    totalTargetJobsLastRun: number;
    totalPersistedJobsReported: number;
  };
};

type WorkableXmlFeedResult = {
  sourceName: "workable_xml";
  feedUrl: string;
  dryRun: boolean;
  limit: number;
  maxRecords: number;
  freshDays: number;
  seen: number;
  parsed: number;
  fresh: number;
  usRelevant: number;
  targetRole: number;
  inserted: number;
  updated: number;
  persisted: number;
  skippedOld: number;
  skippedMissingRequired: number;
  skippedNonUs: number;
  skippedNonTarget: number;
  skippedDuplicate: number;
  skippedPersistError: number;
  persistErrors: Array<{
    sourceKey: string;
    title: string;
    company: string;
    message: string;
  }>;
  stoppedReason: "limit_reached" | "max_records_reached" | "feed_complete";
};

function apiBase() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatPercent(value: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function formatDate(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatTile({
  label,
  value,
  caption,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  caption: string;
  tone?: "neutral" | "positive" | "warning" | "info";
}) {
  const toneClass = {
    neutral: "bg-card",
    positive: "bg-[#edf7ef]",
    warning: "bg-[#fbf1e8]",
    info: "bg-[#eef3ff]",
  }[tone];

  return (
    <div className={`${toneClass} rounded-xl px-5 py-4 shadow-[0_1px_6px_rgba(26,32,24,0.06)]`}>
      <p className="text-sage text-[10px] uppercase tracking-[0.14em] mb-2">{label}</p>
      <p className="text-ink text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-sage text-xs mt-1">{caption}</p>
    </div>
  );
}

function Breakdown({
  title,
  rows,
  total,
  limit = 8,
}: {
  title: string;
  rows: CountRow[];
  total: number;
  limit?: number;
}) {
  const visibleRows = rows.slice(0, limit);

  return (
    <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
      <h2 className="text-ink text-sm font-semibold tracking-tight mb-4">{title}</h2>
      <div className="space-y-3">
        {visibleRows.length ? (
          visibleRows.map((row) => {
            const width = total ? Math.max(4, Math.round((row.count / total) * 100)) : 0;
            return (
              <div key={row.label}>
                <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                  <span className="text-ink truncate">{row.label}</span>
                  <span className="text-sage tabular-nums">
                    {formatNumber(row.count)} · {formatPercent(row.count, total)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-parchment overflow-hidden">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-sage">No data yet.</p>
        )}
      </div>
    </section>
  );
}

export function JobRegistryShell() {
  const [stats, setStats] = useState<RegistryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedLimit, setFeedLimit] = useState(1000);
  const [feedMaxRecords, setFeedMaxRecords] = useState(50000);
  const [feedFreshDays, setFeedFreshDays] = useState(30);
  const [feedRunning, setFeedRunning] = useState<"dry-run" | "ingest" | null>(null);
  const [feedResult, setFeedResult] = useState<WorkableXmlFeedResult | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);

  async function loadStats(silent = false) {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const response = await fetch(`${apiBase()}/jobs/registry`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      setStats((await response.json()) as RegistryStats);
    } catch (nextError) {
      if (!silent) {
        setError(nextError instanceof Error ? nextError.message : "Unknown error");
        setStats(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void loadStats();
    const interval = window.setInterval(() => {
      if (!cancelled) void loadStats(true);
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  async function runWorkableXmlFeed(dryRun: boolean) {
    try {
      setFeedRunning(dryRun ? "dry-run" : "ingest");
      setFeedError(null);
      setFeedResult(null);

      const response = await fetch(`${apiBase()}/jobs/feeds/workable-xml/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dryRun,
          limit: feedLimit,
          maxRecords: feedMaxRecords,
          freshDays: feedFreshDays,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const result = (await response.json()) as WorkableXmlFeedResult;
      setFeedResult(result);

      if (!dryRun) {
        await loadStats(true);
      }
    } catch (nextError) {
      setFeedError(nextError instanceof Error ? nextError.message : "Unknown error");
    } finally {
      setFeedRunning(null);
    }
  }

  const activeJobs = stats?.jobs.active ?? 0;
  const synced7d = stats?.jobs.freshness.synced7d ?? 0;
  const posted60d = stats?.jobs.freshness.posted60d ?? 0;
  const postedOlderThan60 =
    stats?.jobs.postedAgeBuckets.find((row) => row.label === "60+ days")?.count ?? 0;
  const latestIncrease = stats?.jobs.latestIncrease.total ?? 0;
  const latestIncreaseCaption = stats?.jobs.latestIncrease.bySource.length
    ? stats.jobs.latestIncrease.bySource
        .map((row) => `${row.label} +${formatNumber(row.count)}`)
        .join(" · ")
    : stats?.jobs.latestIncrease.since
      ? `Since ${formatDate(stats.jobs.latestIncrease.since)}`
      : "No recent increase";
  const workingBoards = useMemo(
    () => stats?.boards.byStatus.find((row) => row.label === "working")?.count ?? 0,
    [stats],
  );

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink mb-1">Job Registry</h1>
          <p className="text-sage text-sm">
            Inventory health for active jobs, freshness, categories, and board sync coverage.
          </p>
        </div>
        <div className="text-xs text-sage">
          {stats ? `Updated ${formatDate(stats.generatedAt)}` : loading ? "Loading registry..." : "Not loaded"}
        </div>
      </header>

      {error ? (
        <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
          <p className="text-sm text-red-700">Could not load job registry: {error}</p>
        </section>
      ) : null}

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
        <StatTile
          label="Active Jobs"
          value={loading && !stats ? "..." : formatNumber(activeJobs)}
          caption={`${formatNumber(stats?.jobs.stale ?? 0)} stale`}
          tone="positive"
        />
        <StatTile
          label="Latest Increase"
          value={loading && !stats ? "..." : `+${formatNumber(latestIncrease)}`}
          caption={latestIncreaseCaption}
          tone="positive"
        />
        <StatTile
          label="Synced 7D"
          value={loading && !stats ? "..." : formatNumber(synced7d)}
          caption={`${formatPercent(synced7d, activeJobs)} of active jobs`}
          tone="info"
        />
        <StatTile
          label="Posted 60D"
          value={loading && !stats ? "..." : formatNumber(posted60d)}
          caption={`${formatPercent(posted60d, activeJobs)} inventory window`}
        />
        <StatTile
          label="Working Boards"
          value={loading && !stats ? "..." : formatNumber(workingBoards)}
          caption={`${formatNumber(stats?.boards.total ?? 0)} active boards tracked`}
        />
        <StatTile
          label="Unchecked Boards"
          value={loading && !stats ? "..." : formatNumber(stats?.boards.freshness.neverChecked ?? 0)}
          caption="Need verification or sync"
          tone="warning"
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
        <Breakdown title="Jobs by ATS" rows={stats?.jobs.bySource ?? []} total={activeJobs} />
        <Breakdown title="Jobs by Category" rows={stats?.jobs.byCategory ?? []} total={activeJobs} />
        <Breakdown title="Work Mode" rows={stats?.jobs.byWorkMode ?? []} total={activeJobs} />
        <Breakdown title="Location Signal" rows={stats?.jobs.byLocation ?? []} total={activeJobs} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_260px] gap-4">
        <Breakdown title="Posted Age Buckets" rows={stats?.jobs.postedAgeBuckets ?? []} total={activeJobs} limit={6} />
        <Breakdown title="Last Sync Buckets" rows={stats?.jobs.syncAgeBuckets ?? []} total={activeJobs} limit={6} />
        <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
          <h2 className="text-ink text-sm font-semibold tracking-tight mb-4">Inventory Window</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sage text-[10px] uppercase tracking-[0.14em]">Core 30D</p>
              <p className="text-ink text-2xl font-semibold tabular-nums">
                {formatNumber(stats?.jobs.freshness.posted30d ?? 0)}
              </p>
              <p className="text-sage text-xs">{formatPercent(stats?.jobs.freshness.posted30d ?? 0, activeJobs)} active jobs</p>
            </div>
            <div className="border-t border-line pt-4">
              <p className="text-sage text-[10px] uppercase tracking-[0.14em]">Expansion 60D</p>
              <p className="text-ink text-2xl font-semibold tabular-nums">{formatNumber(posted60d)}</p>
              <p className="text-sage text-xs">{formatNumber(postedOlderThan60)} older than 60D</p>
            </div>
          </div>
        </section>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)] gap-4">
        <section className="bg-card rounded-2xl shadow-[0_2px_12px_rgba(26,32,24,0.06)] overflow-hidden">
          <div className="px-6 py-5 border-b border-line">
            <h2 className="text-ink text-sm font-semibold tracking-tight">Recent Synced Jobs</h2>
            <p className="text-sage text-xs mt-1">Latest active records refreshed by board ingestion.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-sage">
                  <th className="px-6 py-4 font-medium">Role</th>
                  <th className="px-4 py-4 font-medium">Company</th>
                  <th className="px-4 py-4 font-medium">ATS</th>
                  <th className="px-4 py-4 font-medium">Location</th>
                  <th className="px-4 py-4 font-medium">Synced</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.jobs.recent ?? []).map((job) => (
                  <tr key={job.sourceKey} className="border-t border-line/70">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-ink">{job.title}</p>
                      <p className="text-xs text-sage mt-1">{job.boardToken ?? "unknown board"}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-ink">{job.company}</td>
                    <td className="px-4 py-4 text-sm text-sage capitalize">{job.sourceName}</td>
                    <td className="px-4 py-4 text-sm text-sage">{job.location ?? job.remoteType ?? "Unknown"}</td>
                    <td className="px-4 py-4 text-sm text-sage">{formatDate(job.lastSyncedAt)}</td>
                  </tr>
                ))}
                {!loading && stats?.jobs.recent.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-sage">
                      No persisted jobs yet. Run board verification/ingest to populate this registry.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
            <div className="mb-4">
              <p className="text-sage text-[10px] uppercase tracking-[0.14em] mb-2">Feed Ingestion</p>
              <h2 className="text-ink text-sm font-semibold tracking-tight">Workable XML</h2>
              <p className="text-sage text-xs mt-1">
                Separate from board tracking. Streams the public Workable feed, then keeps only fresh US target-role jobs.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.12em] text-sage">Fresh Days</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={feedFreshDays}
                  onChange={(event) => setFeedFreshDays(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-line bg-parchment px-3 py-2 text-sm text-ink outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.12em] text-sage">Limit</span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={feedLimit}
                  onChange={(event) => setFeedLimit(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-line bg-parchment px-3 py-2 text-sm text-ink outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.12em] text-sage">Max Scan</span>
                <input
                  type="number"
                  min={100}
                  max={500000}
                  value={feedMaxRecords}
                  onChange={(event) => setFeedMaxRecords(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-line bg-parchment px-3 py-2 text-sm text-ink outline-none"
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void runWorkableXmlFeed(true)}
                disabled={feedRunning !== null}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
              >
                {feedRunning === "dry-run" ? "Checking..." : "Dry Run"}
              </button>
              <button
                type="button"
                onClick={() => void runWorkableXmlFeed(false)}
                disabled={feedRunning !== null}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-card disabled:opacity-50"
              >
                {feedRunning === "ingest" ? "Ingesting..." : "Ingest Jobs"}
              </button>
            </div>

            {feedError ? (
              <p className="mt-4 text-xs text-red-700">Workable XML failed: {feedError}</p>
            ) : null}

            {feedResult ? (
              <div className="mt-4 rounded-xl border border-line bg-parchment p-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-sage uppercase tracking-[0.12em]">Matched</p>
                    <p className="text-ink text-lg font-semibold tabular-nums">
                      {formatNumber(feedResult.persisted)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sage uppercase tracking-[0.12em]">Mode</p>
                    <p className="text-ink text-lg font-semibold">{feedResult.dryRun ? "Dry run" : "Saved"}</p>
                  </div>
                  <div>
                    <p className="text-sage uppercase tracking-[0.12em]">Inserted</p>
                    <p className="text-ink font-medium tabular-nums">{formatNumber(feedResult.inserted)}</p>
                  </div>
                  <div>
                    <p className="text-sage uppercase tracking-[0.12em]">Updated</p>
                    <p className="text-ink font-medium tabular-nums">{formatNumber(feedResult.updated)}</p>
                  </div>
                  <div>
                    <p className="text-sage uppercase tracking-[0.12em]">Duplicates</p>
                    <p className="text-ink font-medium tabular-nums">{formatNumber(feedResult.skippedDuplicate)}</p>
                  </div>
                  <div>
                    <p className="text-sage uppercase tracking-[0.12em]">Write Errors</p>
                    <p className="text-ink font-medium tabular-nums">{formatNumber(feedResult.skippedPersistError)}</p>
                  </div>
                </div>
                <p className="text-sage text-xs mt-3">
                  Scanned {formatNumber(feedResult.seen)} records. Skipped {formatNumber(feedResult.skippedOld)} old,{" "}
                  {formatNumber(feedResult.skippedNonUs)} non-US, and {formatNumber(feedResult.skippedNonTarget)} non-target.
                </p>
                {feedResult.persistErrors.length ? (
                  <p className="text-red-700 text-xs mt-3">
                    First write issue: {feedResult.persistErrors[0]?.company} / {feedResult.persistErrors[0]?.title} -{" "}
                    {feedResult.persistErrors[0]?.message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
            <h2 className="text-ink text-sm font-semibold tracking-tight mb-4">Board Sync Freshness</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Checked 24H" value={formatNumber(stats?.boards.freshness.checked24h ?? 0)} caption="boards" />
              <StatTile label="Checked 7D" value={formatNumber(stats?.boards.freshness.checked7d ?? 0)} caption="boards" />
              <StatTile label="Older 14D" value={formatNumber(stats?.boards.freshness.olderThan14d ?? 0)} caption="boards" tone="warning" />
              <StatTile label="Never" value={formatNumber(stats?.boards.freshness.neverChecked ?? 0)} caption="boards" tone="warning" />
            </div>
          </section>
          <Breakdown title="Top Companies by Active Jobs" rows={stats?.jobs.topCompanies ?? []} total={activeJobs} limit={10} />
        </section>
      </section>
    </div>
  );
}
