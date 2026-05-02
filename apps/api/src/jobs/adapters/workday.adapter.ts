import { Injectable } from "@nestjs/common";

import type { AggregatedJob } from "@aijobs/types";

import { resolveCompanyBranding } from "../company-branding";
import { formatBoardToken } from "../source-formatters";
import { buildSalaryLabel, stripHtml, toIsoDate } from "../jobs.utils";
import type { SourceAdapter } from "../jobs.types";

type WorkdayBoard = {
  host: string;
  tenant: string;
  site: string;
  locale: string | null;
};

type WorkdayJobSummary = {
  title?: string | null;
  externalPath?: string | null;
  locationsText?: string | null;
  location?: string | null;
  locations?: Array<{ descriptor?: string | null }> | null;
  postedOn?: string | null;
  timeType?: string | null;
  jobType?: string | null;
  remoteType?: string | null;
  bulletFields?: string[] | null;
};

type WorkdayJobDetail = WorkdayJobSummary & {
  jobPostingInfo?: {
    title?: string | null;
    jobDescription?: string | null;
    jobDescriptionText?: string | null;
    externalUrl?: string | null;
    location?: string | null;
    locationsText?: string | null;
    timeType?: string | null;
    jobType?: string | null;
    postedOn?: string | null;
  } | null;
};

type WorkdayJobsResponse = {
  jobPostings?: WorkdayJobSummary[];
  total?: number;
};

function normalizeLocale(segment: string) {
  return /^[a-z]{2}(?:-[A-Z]{2})?$/.test(segment) ? segment : null;
}

function parseWorkdayBoardToken(boardToken: string): WorkdayBoard {
  const raw = boardToken.trim();

  if (!raw) {
    throw new Error("Workday board token is empty");
  }

  const parsed = raw.includes("://")
    ? new URL(raw)
    : new URL(`https://${raw}`);
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();

  if (!host.endsWith(".myworkdayjobs.com")) {
    throw new Error("Workday board token must be a myworkdayjobs.com URL");
  }

  const tenant = host.split(".")[0];
  const segments = parsed.pathname.split("/").filter(Boolean);
  const locale = segments[0] ? normalizeLocale(segments[0]) : null;
  const site = locale ? segments[1] : segments[0];

  if (!tenant || !site) {
    throw new Error("Workday board token must include a tenant and career site path");
  }

  return { host, tenant, site, locale };
}

function workdayPublicUrl(board: WorkdayBoard, externalPath?: string | null) {
  const path = externalPath?.startsWith("/") ? externalPath : externalPath ? `/job/${externalPath}` : "";
  return `https://${board.host}/${board.locale ?? "en-US"}/${board.site}${path}`;
}

function workdayJobApiPath(externalPath?: string | null) {
  if (!externalPath) return null;
  return externalPath.startsWith("/job/") ? externalPath : `/job/${externalPath}`;
}

function parsePostedOn(value?: string | null) {
  if (!value) return null;
  const direct = toIsoDate(value);
  if (direct) return direct;

  const normalized = value.toLowerCase();
  const now = Date.now();
  if (normalized.includes("today")) return new Date(now).toISOString();
  if (normalized.includes("yesterday")) {
    return new Date(now - 24 * 60 * 60 * 1000).toISOString();
  }

  const days = normalized.match(/(\d+)\s+day/);
  if (days?.[1]) {
    return new Date(now - Number(days[1]) * 24 * 60 * 60 * 1000).toISOString();
  }

  const weeks = normalized.match(/(\d+)\s+week/);
  if (weeks?.[1]) {
    return new Date(now - Number(weeks[1]) * 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  return null;
}

function locationLabel(job: WorkdayJobSummary | WorkdayJobDetail) {
  const postingInfo = "jobPostingInfo" in job ? job.jobPostingInfo : null;
  const locations = job.locations
    ?.map((location) => location.descriptor)
    .filter(Boolean);

  return (
    postingInfo?.locationsText ??
    postingInfo?.location ??
    job.locationsText ??
    job.location ??
    locations?.join(" · ") ??
    null
  );
}

function workModeFromJob(job: WorkdayJobSummary | WorkdayJobDetail) {
  const text = [job.remoteType, locationLabel(job), job.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (text.includes("remote")) return "remote";
  if (text.includes("hybrid")) return "hybrid";
  if (text.includes("on-site") || text.includes("onsite")) return "onsite";
  return null;
}

@Injectable()
export class WorkdayAdapter implements SourceAdapter {
  readonly source = "workday" as const;

  async fetchJobs(boardToken: string): Promise<AggregatedJob[]> {
    const board = parseWorkdayBoardToken(boardToken);
    const limit = 100;
    const summaries: WorkdayJobSummary[] = [];

    for (let offset = 0; offset < 500; offset += limit) {
      const response = await fetch(
        `https://${board.host}/wday/cxs/${board.tenant}/${board.site}/jobs`,
        {
          method: "POST",
          redirect: "follow",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            appliedFacets: {},
            limit,
            offset,
            searchText: "",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Workday request failed with ${response.status}`);
      }

      const payload = (await response.json()) as WorkdayJobsResponse;
      const page = payload.jobPostings ?? [];
      summaries.push(...page);

      if (page.length < limit || summaries.length >= (payload.total ?? 0)) {
        break;
      }
    }

    const details = await Promise.all(
      summaries.map(async (job) => {
        const apiPath = workdayJobApiPath(job.externalPath);
        if (!apiPath) return job;

        try {
          const response = await fetch(
            `https://${board.host}/wday/cxs/${board.tenant}/${board.site}${apiPath}`,
            {
              redirect: "follow",
              headers: { accept: "application/json" },
            },
          );
          return response.ok
            ? { ...job, ...((await response.json()) as WorkdayJobDetail) }
            : job;
        } catch {
          return job;
        }
      }),
    );

    return details.map((job, index) => {
      const detail = job as WorkdayJobDetail;
      const postingInfo = detail.jobPostingInfo ?? null;
      const title = postingInfo?.title ?? job.title ?? "Untitled role";
      const applyUrl = postingInfo?.externalUrl ?? workdayPublicUrl(board, job.externalPath);
      const companyFallback = formatBoardToken(board.tenant);
      const branding = resolveCompanyBranding({
        source: this.source,
        boardToken,
        companyFallback,
        applyUrl,
      });

      return {
        id: `workday:${board.tenant}:${board.site}:${job.externalPath ?? index}`,
        source: this.source,
        boardToken,
        title,
        company: branding.company,
        companyLogoUrl: branding.companyLogoUrl,
        location: locationLabel(job),
        workMode: workModeFromJob(job),
        employmentType: postingInfo?.timeType ?? job.timeType ?? job.jobType ?? null,
        salary: buildSalaryLabel([]),
        description: stripHtml(postingInfo?.jobDescription ?? postingInfo?.jobDescriptionText),
        applyUrl,
        postedAt: parsePostedOn(postingInfo?.postedOn ?? job.postedOn),
        department: job.bulletFields?.[0] ?? null,
        team: null,
      } satisfies AggregatedJob;
    });
  }
}
