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
      posted24h: number;
      posted7d: number;
      posted14d: number;
      posted30d: number;
      unknownPostedAt: number;
    };
    bySource: CountRow[];
    byCategory: CountRow[];
    byWorkMode: CountRow[];
    byLocation: CountRow[];
    topCompanies: CountRow[];
    recent: Array<{
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

  const activeJobs = stats?.jobs.active ?? 0;
  const synced7d = stats?.jobs.freshness.synced7d ?? 0;
  const posted30d = stats?.jobs.freshness.posted30d ?? 0;
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
          label="Posted 30D"
          value={loading && !stats ? "..." : formatNumber(posted30d)}
          caption={`${formatPercent(posted30d, activeJobs)} with recent posting dates`}
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
                  <tr key={`${job.sourceName}:${job.boardToken}:${job.title}:${job.company}`} className="border-t border-line/70">
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
