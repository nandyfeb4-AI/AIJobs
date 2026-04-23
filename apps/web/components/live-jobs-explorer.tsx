"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AggregatedJob } from "@aijobs/types";

import { mapAggregatedJobToMatchJob } from "@/lib/matches";

import { MatchCard } from "./match-card";

type FeedResponse = {
  jobs: AggregatedJob[];
  nextCursor: string | null;
  hasMore: boolean;
};

function apiBase() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
}

export function LiveJobsExplorer({
  onJobsChange,
}: {
  onJobsChange?: (jobs: AggregatedJob[]) => void;
}) {
  const [jobs, setJobs] = useState<AggregatedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const loadNextPage = useCallback(
    async (cursor: string) => {
      if (loadingMore) return;

      try {
        setLoadingMore(true);
        const url = new URL(`${apiBase()}/jobs/feed`);
        url.searchParams.set("limit", "24");
        url.searchParams.set("cursor", cursor);

        const response = await fetch(url.toString(), {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        const payload = (await response.json()) as FeedResponse;

        setNextCursor(payload.nextCursor ?? null);
        setHasMore(Boolean(payload.hasMore));
        setJobs((current) => {
          const seen = new Set(current.map((job) => job.id));
          const appended = (payload.jobs ?? []).filter((job) => !seen.has(job.id));
          return [...current, ...appended];
        });
      } catch (error) {
        setRequestError(error instanceof Error ? error.message : "Unknown request error");
      } finally {
        setLoadingMore(false);
      }
    },
    [loadingMore],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadJobs(cursor?: string | null) {
      try {
        if (!cursor) {
          setLoading(true);
          setRequestError(null);
        } else {
          setLoadingMore(true);
        }

        const url = new URL(`${apiBase()}/jobs/feed`);
        url.searchParams.set("limit", "24");
        if (cursor) {
          url.searchParams.set("cursor", cursor);
        }

        let response = await fetch(url.toString(), {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`);
        }

        let payload = (await response.json()) as FeedResponse;

        if (!payload.jobs?.length && !cursor) {
          const ingestResponse = await fetch(`${apiBase()}/jobs/ingest`, {
            method: "POST",
          });

          if (!ingestResponse.ok) {
            throw new Error(`Bootstrap ingest failed with ${ingestResponse.status}`);
          }

          for (let attempt = 0; attempt < 15; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 2000));

            response = await fetch(url.toString(), {
              cache: "no-store",
            });

            if (!response.ok) {
              throw new Error(`Feed request failed with ${response.status}`);
            }

            payload = (await response.json()) as FeedResponse;
            if (payload.jobs?.length) {
              break;
            }
          }
        }

        if (cancelled) return;

        setNextCursor(payload.nextCursor ?? null);
        setHasMore(Boolean(payload.hasMore));

        if (cursor) {
          setJobs((current) => {
            const seen = new Set(current.map((job) => job.id));
            const appended = (payload.jobs ?? []).filter((job) => !seen.has(job.id));
            return [...current, ...appended];
          });
        } else {
          setJobs(payload.jobs ?? []);
        }
      } catch (error) {
        if (cancelled) return;
        if (!cursor) {
          setJobs([]);
        }
        setRequestError(error instanceof Error ? error.message : "Unknown request error");
      } finally {
        if (!cancelled && !cursor) {
          setLoading(false);
        }
        if (!cancelled && cursor) {
          setLoadingMore(false);
        }
      }
    }

    void loadJobs();

    return () => {
      cancelled = true;
    };
  }, [onJobsChange]);

  useEffect(() => {
    onJobsChange?.(jobs);
  }, [jobs, onJobsChange]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore || loading || loadingMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || !nextCursor || loadingMore) {
          return;
        }

        void loadNextPage(nextCursor);
      },
      {
        rootMargin: "300px 0px",
      },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, nextCursor, loading, loadingMore, loadNextPage]);

  const matches = useMemo(() => jobs.map(mapAggregatedJobToMatchJob), [jobs]);

  if (requestError) {
    return (
      <section className="bg-card rounded-2xl p-6 shadow-[0_2px_12px_rgba(26,32,24,0.06)]">
        <p className="text-sm text-red-700">Could not load live jobs: {requestError}</p>
      </section>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sage text-sm">
          <span className="text-ink font-semibold">
            {loading ? "Loading..." : `${matches.length} matches`}
          </span>{" "}
          {!loading ? "loaded so far from the persisted feed" : "loading your persisted job feed"}
        </p>
        <div className="rounded-xl border border-line bg-card px-3.5 py-2 text-xs text-sage">
          Sort: Relevance
        </div>
      </div>

      <div className="space-y-4">
        {matches.map((job) => (
          <MatchCard key={job.id} job={job} compact={false} />
        ))}
      </div>

      <div ref={loadMoreRef} className="h-8" />

      {loadingMore ? (
        <p className="text-center text-xs text-sage mt-4">Loading more jobs...</p>
      ) : null}

      {!hasMore && !loading && matches.length > 0 ? (
        <p className="text-center text-xs text-sage mt-4">You&apos;ve reached the end of the current feed.</p>
      ) : null}
    </div>
  );
}
