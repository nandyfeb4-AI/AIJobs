"use client";

import { useEffect, useMemo, useState } from "react";

type BoardStatus = "unverified" | "working" | "empty" | "failed";
type AtsSource = "greenhouse" | "ashby" | "lever" | "adzuna";

type SourceBoard = {
  id: string;
  sourceName: AtsSource;
  boardToken: string;
  company: string;
  companyDomain: string | null;
  tier: string | null;
  status: BoardStatus;
  active: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  lastSeenJobCount: number | null;
  lastTargetJobCount: number | null;
  totalPersistedJobs: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type PipelineJob = {
  id: string;
  name: string;
  state: string;
  data: {
    companyId?: string;
    source?: AtsSource;
    boardToken?: string;
  };
  progress:
    | {
        stage?: string;
        message?: string;
        company?: string;
        currentUrl?: string;
        checkedUrls?: number;
        totalUrls?: number;
        discoveredBoards?: number;
        persisted?: number;
      }
    | number
    | null;
  failedReason: string | null;
  returnValue:
    | {
        companyId?: string;
        discovered?: number;
        persisted?: number;
      }
    | null;
  attemptsMade: number;
  processedOn: number | null;
  finishedOn: number | null;
  timestamp: number | null;
};

type QueueSnapshot = {
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };
  trackedCounts: {
    total: number;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  };
  hasActiveWork: boolean;
  trackedJobs: PipelineJob[];
  recentJobs: PipelineJob[];
};

type PipelineSnapshot = {
  discovery: QueueSnapshot;
  ingest: QueueSnapshot;
};

type ActionResponse = {
  enqueued: number;
  targetCompanies?: number;
  candidates?: number;
  jobs?: Array<{ id: string }>;
};

function apiBase() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
}

function formatSource(source: AtsSource) {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function formatRelativeish(timestamp?: string | null) {
  if (!timestamp) return "Not checked yet";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatJobTimestamp(value?: number | null) {
  if (!value) return "Not started";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusTone(status: BoardStatus) {
  switch (status) {
    case "working":
      return {
        bg: "rgba(37,104,73,0.08)",
        color: "#256849",
        label: "Working",
      };
    case "empty":
      return {
        bg: "rgba(201,100,40,0.08)",
        color: "#c96428",
        label: "Empty",
      };
    case "failed":
      return {
        bg: "rgba(190,24,93,0.08)",
        color: "#be185d",
        label: "Failed",
      };
    default:
      return {
        bg: "rgba(26,32,24,0.06)",
        color: "#5a6455",
        label: "Unverified",
      };
  }
}

function pipelineStateTone(state: string) {
  switch (state) {
    case "completed":
      return {
        bg: "rgba(37,104,73,0.08)",
        color: "#256849",
        label: "Completed",
      };
    case "failed":
      return {
        bg: "rgba(190,24,93,0.08)",
        color: "#be185d",
        label: "Failed",
      };
    case "active":
      return {
        bg: "rgba(201,100,40,0.08)",
        color: "#c96428",
        label: "Active",
      };
    default:
      return {
        bg: "rgba(26,32,24,0.06)",
        color: "#5a6455",
        label: "Queued",
      };
  }
}

function trackedLabel(job: PipelineJob, kind: "discover" | "ingest") {
  if (kind === "discover") {
    return job.progress && typeof job.progress !== "number" && job.progress.company
      ? job.progress.company
      : job.data.companyId ?? job.name;
  }

  if (job.data.source && job.data.boardToken) {
    return `${formatSource(job.data.source)} / ${job.data.boardToken}`;
  }

  return job.name;
}

function progressMessage(job: PipelineJob, kind: "discover" | "ingest") {
  if (job.progress && typeof job.progress !== "number") {
    if (kind === "discover" && job.progress.checkedUrls && job.progress.totalUrls) {
      return `${job.progress.message ?? "Running"} · ${job.progress.checkedUrls}/${job.progress.totalUrls} pages checked`;
    }

    if (job.progress.message) {
      return job.progress.message;
    }
  }

  if (job.state === "completed") {
    if (kind === "discover") {
      return `${job.returnValue?.discovered ?? 0} board candidates discovered`;
    }

    return `${job.returnValue?.persisted ?? 0} jobs persisted`;
  }

  if (job.failedReason) {
    return job.failedReason;
  }

  return kind === "discover" ? "Waiting to start discovery" : "Waiting to start ingest";
}

function discoveryFoundCount(job: PipelineJob) {
  if (typeof job.returnValue?.discovered === "number") {
    return job.returnValue.discovered;
  }

  if (job.progress && typeof job.progress !== "number" && typeof job.progress.discoveredBoards === "number") {
    return job.progress.discoveredBoards;
  }

  return 0;
}

function isCurrentRunJob(job: PipelineJob) {
  return ["waiting", "active", "failed", "completed"].includes(job.state);
}

export function BoardCoverageShell() {
  const [boards, setBoards] = useState<SourceBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineSnapshot | null>(null);
  const [trackedDiscoveryJobIds, setTrackedDiscoveryJobIds] = useState<string[]>([]);
  const [trackedVerifyJobIds, setTrackedVerifyJobIds] = useState<string[]>([]);
  const [actionState, setActionState] = useState<{
    kind: "discover" | "verify" | null;
    pending: boolean;
    message: string | null;
  }>({
    kind: null,
    pending: false,
    message: null,
  });

  async function loadBoards(cancelled = false, silent = false) {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError(null);

      const response = await fetch(`${apiBase()}/jobs/boards`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const payload = (await response.json()) as SourceBoard[];

      if (!cancelled) {
        setBoards(payload);
      }
    } catch (nextError) {
      if (!cancelled) {
        setError(nextError instanceof Error ? nextError.message : "Unknown error");
        if (!silent) {
          setBoards([]);
        }
      }
    } finally {
      if (!cancelled && !silent) {
        setLoading(false);
      }
    }
  }

  async function loadPipeline(cancelled = false) {
    try {
      const url = new URL(`${apiBase()}/jobs/pipeline`);

      if (trackedDiscoveryJobIds.length) {
        url.searchParams.set("discoveryJobIds", trackedDiscoveryJobIds.join(","));
      }

      if (trackedVerifyJobIds.length) {
        url.searchParams.set("ingestJobIds", trackedVerifyJobIds.join(","));
      }

      const response = await fetch(url.toString(), {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Pipeline request failed with ${response.status}`);
      }

      const payload = (await response.json()) as PipelineSnapshot;

      if (!cancelled) {
        setPipeline(payload);
      }
    } catch {
      if (!cancelled) {
        setPipeline(null);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    void loadBoards(cancelled);
    void loadPipeline(cancelled);

    const interval = window.setInterval(() => {
      void loadPipeline(cancelled);
      void loadBoards(cancelled, true);
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [trackedDiscoveryJobIds, trackedVerifyJobIds]);

  const sourceCards = useMemo(() => {
    const grouped = new Map<AtsSource, SourceBoard[]>();

    for (const board of boards) {
      const current = grouped.get(board.sourceName) ?? [];
      current.push(board);
      grouped.set(board.sourceName, current);
    }

    return Array.from(grouped.entries()).map(([source, sourceBoards]) => {
      const working = sourceBoards.filter((board) => board.status === "working").length;
      const failed = sourceBoards.filter((board) => board.status === "failed").length;
      const empty = sourceBoards.filter((board) => board.status === "empty").length;
      const targetJobs = sourceBoards.reduce((sum, board) => sum + (board.lastTargetJobCount ?? 0), 0);

      return {
        source,
        totalBoards: sourceBoards.length,
        working,
        failed,
        empty,
        targetJobs,
      };
    });
  }, [boards]);

  const sortedBoards = useMemo(
    () =>
      [...boards].sort((left, right) => {
        const sourceOrder = left.sourceName.localeCompare(right.sourceName);
        if (sourceOrder !== 0) return sourceOrder;

        const targetDiff = (right.lastTargetJobCount ?? 0) - (left.lastTargetJobCount ?? 0);
        if (targetDiff !== 0) return targetDiff;

        return left.company.localeCompare(right.company);
      }),
    [boards],
  );

  const unverifiedCount = useMemo(
    () => boards.filter((board) => board.status === "unverified").length,
    [boards],
  );

  async function runAction(kind: "discover" | "verify", endpoint: string) {
    try {
      const startingMessage =
        kind === "discover"
          ? "Starting discovery run..."
          : "Starting verification run...";

      setActionState({
        kind,
        pending: true,
        message: startingMessage,
      });

      const response = await fetch(`${apiBase()}${endpoint}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const payload = (await response.json()) as ActionResponse;
      const enqueuedJobIds = (payload.jobs ?? []).map((job) => job.id);
      const message =
        kind === "discover"
          ? `Discovery queued for ${payload.targetCompanies ?? payload.enqueued ?? 0} target companies.`
          : `Verification queued for ${payload.candidates ?? payload.enqueued ?? 0} unverified boards.`;

      if (kind === "discover") {
        setTrackedDiscoveryJobIds(enqueuedJobIds);
      } else {
        setTrackedVerifyJobIds(enqueuedJobIds);
      }

      setActionState({
        kind,
        pending: false,
        message,
      });

      await Promise.all([loadBoards(false, true), loadPipeline()]);
    } catch (nextError) {
      setActionState({
        kind,
        pending: false,
        message: nextError instanceof Error ? nextError.message : "Unknown action error",
      });
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
      <section className="space-y-6">
        {error ? (
          <section className="bg-card rounded-2xl p-6 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
            <p className="text-sm text-red-700">Could not load board coverage: {error}</p>
          </section>
        ) : null}

        <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-ink text-sm font-semibold tracking-tight">Admin Actions</h2>
              <p className="text-sage text-xs mt-1 leading-6">
                Use discovery to scout new ATS boards from the target-company pool, then verify any
                newly discovered boards through the existing ingest queue.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void runAction("discover", "/jobs/discover")}
                aria-busy={actionState.pending && actionState.kind === "discover"}
                disabled={actionState.pending && actionState.kind === "discover"}
                className="inline-flex min-w-[164px] items-center justify-center rounded-full bg-[#1a2018] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#242b21] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
              >
                {actionState.pending && actionState.kind === "discover" ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Finding Boards...
                  </span>
                ) : (
                  "Find New Boards"
                )}
              </button>
              <button
                type="button"
                onClick={() => void runAction("verify", "/jobs/verify-unverified")}
                aria-busy={actionState.pending && actionState.kind === "verify"}
                disabled={(actionState.pending && actionState.kind === "verify") || unverifiedCount === 0}
                className="inline-flex min-w-[184px] items-center justify-center rounded-full border border-line px-4 py-2 text-sm font-medium text-ink transition-all hover:bg-parchment active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionState.pending && actionState.kind === "verify"
                  ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
                      Queueing Verification...
                    </span>
                  )
                  : `Verify Unverified (${unverifiedCount})`}
              </button>
            </div>
          </div>
          {actionState.message ? (
            <p className="text-xs text-sage mt-3" aria-live="polite">{actionState.message}</p>
          ) : null}
        </section>

        <section className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-ink text-sm font-semibold tracking-tight">Live Worker Pipeline</h2>
              <p className="text-sage text-xs mt-1 leading-6">
                Polling the BullMQ queues every few seconds so you can see discovery and verification
                progress without checking logs.
              </p>
            </div>
            <span className="rounded-full bg-parchment px-3 py-1 text-[11px] text-sage">
              Refreshing every 4s
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PipelineCard
              title="Discovery Queue"
              description="Company-level scouting jobs from Find New Boards."
              snapshot={pipeline?.discovery ?? null}
              trackedJobIds={trackedDiscoveryJobIds}
              kind="discover"
            />
            <PipelineCard
              title="Verification Queue"
              description="Board verification and ingest jobs for unverified boards."
              snapshot={pipeline?.ingest ?? null}
              trackedJobIds={trackedVerifyJobIds}
              kind="ingest"
            />
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {sourceCards.map((card) => (
            <div
              key={card.source}
              className="bg-card rounded-2xl p-5 shadow-[0_2px_12px_rgba(26,32,24,0.06)]"
            >
              <p className="text-sage text-[11px] uppercase tracking-[0.14em] mb-2">
                {formatSource(card.source)}
              </p>
              <p className="text-ink text-3xl font-semibold tabular-nums mb-3">{card.totalBoards}</p>
              <p className="text-sage text-sm leading-6 mb-4">
                {card.targetJobs} target-role jobs found across the latest synced boards.
              </p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <MetricPill label="Working" value={card.working} tone="positive" />
                <MetricPill label="Empty" value={card.empty} tone="warning" />
                <MetricPill label="Failed" value={card.failed} tone="danger" />
              </div>
            </div>
          ))}
        </section>

        <section className="bg-card rounded-2xl shadow-[0_2px_12px_rgba(26,32,24,0.06)] overflow-hidden">
          <div className="px-6 py-5 border-b border-line flex items-center justify-between">
            <div>
              <h2 className="text-ink text-sm font-semibold tracking-tight">Tracked Boards</h2>
              <p className="text-sage text-xs mt-1">
                {loading ? "Loading board sync health..." : `${sortedBoards.length} boards currently seeded`}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-sage">
                  <th className="px-6 py-4 font-medium">Company</th>
                  <th className="px-4 py-4 font-medium">ATS</th>
                  <th className="px-4 py-4 font-medium">Tier</th>
                  <th className="px-4 py-4 font-medium">Status</th>
                  <th className="px-4 py-4 font-medium">Target Jobs</th>
                  <th className="px-4 py-4 font-medium">Persisted</th>
                  <th className="px-4 py-4 font-medium">Last Checked</th>
                  <th className="px-4 py-4 font-medium">Failure</th>
                </tr>
              </thead>
              <tbody>
                {sortedBoards.map((board) => {
                  const tone = statusTone(board.status);

                  return (
                    <tr key={board.id} className="border-t border-line/70 align-top">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-ink text-sm font-medium">{board.company}</p>
                          <p className="text-sage text-xs mt-1">{board.boardToken}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-ink">{formatSource(board.sourceName)}</td>
                      <td className="px-4 py-4 text-sm text-sage">{board.tier ?? "—"}</td>
                      <td className="px-4 py-4">
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium"
                          style={{ background: tone.bg, color: tone.color }}
                        >
                          {tone.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-ink tabular-nums">{board.lastTargetJobCount ?? 0}</td>
                      <td className="px-4 py-4 text-sm text-ink tabular-nums">{board.totalPersistedJobs}</td>
                      <td className="px-4 py-4 text-sm text-sage">{formatRelativeish(board.lastCheckedAt)}</td>
                      <td className="px-4 py-4 text-xs text-sage max-w-[220px]">
                        {board.lastFailureReason ? board.lastFailureReason : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <aside className="space-y-6">
        <section className="bg-card rounded-2xl p-6 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
          <h2 className="text-ink text-sm font-semibold tracking-tight mb-2">Why Track Boards</h2>
          <p className="text-sage text-xs leading-6 mb-4">
            This is the internal coverage dashboard for our ATS seed registry. It helps us see
            whether we have enough healthy boards and enough target-role depth before we rely on
            these sources for real user-facing filters.
          </p>
          <ul className="space-y-2 text-xs text-sage">
            <li>Working boards are currently returning target product, engineering, design, or QA roles.</li>
            <li>Failed boards usually mean stale tokens or companies that moved ATS platforms.</li>
            <li>Empty boards are valid boards that just didn&apos;t return target roles on the latest sync.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

function PipelineCard({
  title,
  description,
  snapshot,
  trackedJobIds,
  kind,
}: {
  title: string;
  description: string;
  snapshot: QueueSnapshot | null;
  trackedJobIds: string[];
  kind: "discover" | "ingest";
}) {
  const trackedJobs = snapshot?.trackedJobs ?? [];
  const jobs =
    kind === "discover"
      ? trackedJobs.filter((job) => {
          const found = discoveryFoundCount(job);
          return found > 0 || job.state === "active" || job.state === "waiting" || job.state === "failed";
        })
      : trackedJobs.filter(isCurrentRunJob);
  const runSummary =
    kind === "discover"
      ? {
          total: trackedJobs.length,
          running: trackedJobs.filter((job) => job.state === "active" || job.state === "waiting").length,
          completed: trackedJobs.filter((job) => job.state === "completed").length,
          found: trackedJobs.reduce((sum, job) => sum + discoveryFoundCount(job), 0),
          failed: trackedJobs.filter((job) => job.state === "failed").length,
        }
      : null;

  return (
    <section className="rounded-2xl border border-line bg-white px-5 py-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-ink text-sm font-semibold tracking-tight">{title}</h3>
          <p className="text-sage text-xs mt-1 leading-5">{description}</p>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[11px]"
          style={{
            background:
              trackedJobIds.length > 0 && snapshot?.hasActiveWork
                ? "rgba(201,100,40,0.08)"
                : "rgba(26,32,24,0.06)",
            color:
              trackedJobIds.length > 0 && snapshot?.hasActiveWork
                ? "#c96428"
                : "#5a6455",
          }}
        >
          {trackedJobIds.length > 0 ? (snapshot?.hasActiveWork ? "Current Run Active" : "Current Run Complete") : "No Active Run"}
        </span>
      </div>

      <p className="text-[11px] uppercase tracking-[0.14em] text-sage mb-3">Queue Totals</p>
      <div className="grid grid-cols-4 gap-2 mb-4">
        <MetricPill label="Waiting" value={snapshot?.counts.waiting ?? 0} tone="neutral" />
        <MetricPill label="Active" value={snapshot?.counts.active ?? 0} tone="warning" />
        <MetricPill label="Done" value={snapshot?.counts.completed ?? 0} tone="positive" />
        <MetricPill label="Failed" value={snapshot?.counts.failed ?? 0} tone="danger" />
      </div>

      {trackedJobIds.length > 0 ? (
        <div className="mb-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-sage">
            Current Run
          </p>
          <p className="text-xs text-sage mt-1 leading-5">
            Tracking {trackedJobIds.length} latest job{trackedJobIds.length === 1 ? "" : "s"} from the most recent action.
            {runSummary
              ? ` ${runSummary.completed}/${runSummary.total} completed, ${runSummary.running} still running, ${runSummary.failed} failed, ${runSummary.found} new board candidate${runSummary.found === 1 ? "" : "s"} found.`
              : ""}
          </p>
        </div>
      ) : (
        <div className="mb-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-sage">Current Run</p>
          <p className="text-xs text-sage mt-1 leading-5">
            No current run selected yet. Start a new discovery or verification run to see only fresh results here.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {trackedJobIds.length === 0 ? (
          <p className="text-xs text-sage leading-6">
            Old queue history is intentionally hidden here. This section now shows only the current run.
          </p>
        ) : jobs.length ? (
          jobs.map((job) => {
            const tone = pipelineStateTone(job.state);

            return (
              <article key={job.id} className="rounded-xl border border-line bg-card px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{trackedLabel(job, kind)}</p>
                    <p className="text-xs text-sage mt-1 leading-5">{progressMessage(job, kind)}</p>
                    {kind === "discover" ? (
                      <p className="text-xs text-sage/80 mt-1">
                        {discoveryFoundCount(job) === 0
                          ? "No new boards found yet"
                          : `${discoveryFoundCount(job)} new board candidate${discoveryFoundCount(job) === 1 ? "" : "s"} found`}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: tone.bg, color: tone.color }}
                  >
                    {tone.label}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-sage">
                  <span>Queued: {formatJobTimestamp(job.timestamp)}</span>
                  <span>Started: {formatJobTimestamp(job.processedOn)}</span>
                  <span>Finished: {formatJobTimestamp(job.finishedOn)}</span>
                </div>
              </article>
            );
          })
        ) : (
          <p className="text-xs text-sage leading-6">
            {kind === "discover"
              ? "This run has not identified any new boards yet. Completed jobs with 0 discoveries are hidden to keep the panel focused on new findings."
              : "No boards from the current verification run are being shown yet."}
          </p>
        )}
      </div>
    </section>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "warning" | "danger" | "neutral";
}) {
  const colorMap = {
    positive: { bg: "rgba(37,104,73,0.08)", color: "#256849" },
    warning: { bg: "rgba(201,100,40,0.08)", color: "#c96428" },
    danger: { bg: "rgba(190,24,93,0.08)", color: "#be185d" },
    neutral: { bg: "rgba(26,32,24,0.06)", color: "#5a6455" },
  } as const;

  const colors = colorMap[tone];

  return (
    <div className="rounded-xl px-3 py-2" style={{ background: colors.bg, color: colors.color }}>
      <p className="text-[10px] uppercase tracking-[0.12em]">{label}</p>
      <p className="text-sm font-semibold tabular-nums mt-1">{value}</p>
    </div>
  );
}
