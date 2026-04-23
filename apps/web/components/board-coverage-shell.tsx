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
  createdAt: string;
  updatedAt: string;
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

export function BoardCoverageShell() {
  const [boards, setBoards] = useState<SourceBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<{
    kind: "discover" | "verify" | null;
    pending: boolean;
    message: string | null;
  }>({
    kind: null,
    pending: false,
    message: null,
  });

  async function loadBoards(cancelled = false) {
    try {
      setLoading(true);
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
        setBoards([]);
      }
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    void loadBoards(cancelled);
    return () => {
      cancelled = true;
    };
  }, []);

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
      setActionState({
        kind,
        pending: true,
        message: null,
      });

      const response = await fetch(`${apiBase()}${endpoint}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }

      const payload = (await response.json()) as Record<string, number>;
      const message =
        kind === "discover"
          ? `Discovery queued for ${payload.targetCompanies ?? payload.enqueued ?? 0} target companies.`
          : `Verification queued for ${payload.candidates ?? payload.enqueued ?? 0} unverified boards.`;

      setActionState({
        kind,
        pending: false,
        message,
      });

      await loadBoards();
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
                disabled={actionState.pending}
                className="inline-flex items-center rounded-full bg-[#1a2018] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {actionState.pending && actionState.kind === "discover" ? "Finding Boards..." : "Find New Boards"}
              </button>
              <button
                type="button"
                onClick={() => void runAction("verify", "/jobs/verify-unverified")}
                disabled={actionState.pending || unverifiedCount === 0}
                className="inline-flex items-center rounded-full border border-line px-4 py-2 text-sm font-medium text-ink disabled:opacity-60"
              >
                {actionState.pending && actionState.kind === "verify"
                  ? "Queueing Verification..."
                  : `Verify Unverified (${unverifiedCount})`}
              </button>
            </div>
          </div>
          {actionState.message ? (
            <p className="text-xs text-sage mt-3">{actionState.message}</p>
          ) : null}
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

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "warning" | "danger";
}) {
  const colorMap = {
    positive: { bg: "rgba(37,104,73,0.08)", color: "#256849" },
    warning: { bg: "rgba(201,100,40,0.08)", color: "#c96428" },
    danger: { bg: "rgba(190,24,93,0.08)", color: "#be185d" },
  } as const;

  const colors = colorMap[tone];

  return (
    <div className="rounded-xl px-3 py-2" style={{ background: colors.bg, color: colors.color }}>
      <p className="text-[10px] uppercase tracking-[0.12em]">{label}</p>
      <p className="text-sm font-semibold tabular-nums mt-1">{value}</p>
    </div>
  );
}
