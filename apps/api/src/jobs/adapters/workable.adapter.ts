import { Injectable } from "@nestjs/common";

import type { AggregatedJob } from "@aijobs/types";

import { resolveCompanyBranding } from "../company-branding";
import { formatBoardToken } from "../source-formatters";
import { buildSalaryLabel, stripHtml, toIsoDate } from "../jobs.utils";
import type { SourceAdapter } from "../jobs.types";

type WorkableLocation = {
  location_str?: string | null;
  country?: string | null;
  country_code?: string | null;
  countryCode?: string | null;
  region?: string | null;
  region_code?: string | null;
  regionCode?: string | null;
  city?: string | null;
  telecommuting?: boolean | null;
  workplace_type?: string | null;
};

type WorkableJob = {
  id?: string | number;
  shortcode?: string | null;
  title?: string | null;
  full_title?: string | null;
  state?: string | null;
  department?: string | null;
  url?: string | null;
  application_url?: string | null;
  shortlink?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  country_code?: string | null;
  countryCode?: string | null;
  location?: WorkableLocation | string | null;
  locations?: WorkableLocation[];
  telecommuting?: boolean | null;
  workplace_type?: string | null;
  salary?: {
    salary_from?: number | null;
    salary_to?: number | null;
    salary_currency?: string | null;
  } | null;
  description?: string | null;
  description_html?: string | null;
  requirements?: string | null;
  benefits?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  employment_type?: string | null;
};

type WorkableResponse = {
  name?: string | null;
  company?: string | null;
  jobs?: WorkableJob[];
};

type WorkableSearchResponse = {
  results?: WorkableJob[];
  total?: number;
  nextPage?: string | null;
};

function locationLabel(location?: WorkableLocation | string | null, locations?: WorkableLocation[]) {
  const locationParts =
    locations
      ?.map((item) =>
        [
          item.location_str,
          item.city,
          item.region ?? item.region_code ?? item.regionCode,
          item.country ?? item.country_code ?? item.countryCode,
        ]
          .filter(Boolean)
          .join(", "),
      )
      .filter(Boolean) ?? [];

  if (typeof location === "string") {
    return [location, ...locationParts].filter(Boolean).join(" · ");
  }

  if (location?.location_str) {
    return [location.location_str, ...locationParts].filter(Boolean).join(" · ");
  }

  if (location?.city || location?.region || location?.country || location?.countryCode) {
    const primaryLocation = [
      location.city,
      location.region ?? location.region_code ?? location.regionCode,
      location.country ?? location.country_code ?? location.countryCode,
    ].filter(Boolean).join(", ");

    return [primaryLocation, ...locationParts].filter(Boolean).join(" · ");
  }

  return locationParts.join(" · ") || null;
}

function salaryLabel(job: WorkableJob) {
  if (!job.salary) return null;
  const currency = job.salary.salary_currency?.toUpperCase() ?? "USD";
  const from = job.salary.salary_from;
  const to = job.salary.salary_to;

  if (from && to) return `${currency} ${from} - ${to}`;
  if (from) return `${currency} ${from}+`;
  if (to) return `Up to ${currency} ${to}`;
  return null;
}

@Injectable()
export class WorkableAdapter implements SourceAdapter {
  readonly source = "workable" as const;

  async fetchJobs(boardToken: string): Promise<AggregatedJob[]> {
    const accountPayload = await this.fetchAccountJobs(boardToken);
    let fetchedJobs = accountPayload.jobs ?? [];

    if (!fetchedJobs.length) {
      fetchedJobs = await this.fetchPaginatedJobs(boardToken);
    }

    fetchedJobs = fetchedJobs.filter(isPublishedWorkableJob);
    const companyName = accountPayload?.company ?? accountPayload?.name ?? formatBoardToken(boardToken);

    return fetchedJobs.map((job, index) => {
      const applyUrl =
        job.application_url ??
        job.url ??
        job.shortlink ??
        `https://apply.workable.com/${boardToken}/j/${job.shortcode ?? job.id ?? ""}`;
      const branding = resolveCompanyBranding({
        source: this.source,
        boardToken,
        companyFallback: companyName,
        applyUrl,
      });
      const location = typeof job.location === "object" ? job.location : null;
      const workMode =
        job.workplace_type ??
        location?.workplace_type ??
        (job.telecommuting || location?.telecommuting ? "remote" : null);

      return {
        id: `workable:${boardToken}:${job.shortcode ?? job.id ?? index}`,
        source: this.source,
        boardToken,
        title: job.title ?? job.full_title ?? "Untitled role",
        company: branding.company,
        companyLogoUrl: branding.companyLogoUrl,
        location: locationLabel(job.location ?? topLevelLocation(job), job.locations),
        workMode,
        employmentType: job.employment_type ?? null,
        salary: buildSalaryLabel([salaryLabel(job)]),
        description: stripHtml(
          [job.description_html ?? job.description, job.requirements, job.benefits]
            .filter(Boolean)
            .join("\n\n"),
        ),
        applyUrl,
        postedAt: toIsoDate(job.created_at ?? job.updated_at),
        department: job.department ?? null,
        team: null,
      } satisfies AggregatedJob;
    });
  }

  private async fetchPaginatedJobs(boardToken: string) {
    const jobs: WorkableJob[] = [];
    let nextPage: string | null | undefined;
    const seenPages = new Set<string>();

    for (let page = 0; page < 30; page += 1) {
      const response = await fetch(
        `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(boardToken)}/jobs`,
        {
          method: "POST",
          redirect: "follow",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(nextPage ? { token: nextPage } : {}),
        },
      );

      if (!response.ok) {
        throw new Error(`Workable request failed with ${response.status}`);
      }

      const payload = (await response.json()) as WorkableSearchResponse;
      jobs.push(...(payload.results ?? []));

      if (!payload.nextPage || seenPages.has(payload.nextPage)) {
        break;
      }

      seenPages.add(payload.nextPage);
      nextPage = payload.nextPage;
    }

    return jobs;
  }

  private async fetchAccountJobs(boardToken: string) {
    const fallbackResponse = await fetch(
      `https://www.workable.com/api/accounts/${encodeURIComponent(boardToken)}?details=true`,
      { redirect: "follow" },
    );

    if (!fallbackResponse.ok) {
      throw new Error(`Workable fallback request failed with ${fallbackResponse.status}`);
    }

    return (await fallbackResponse.json()) as WorkableResponse;
  }

  private isRecoverableWorkableApiError(error: unknown) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return message.includes("403") || message.includes("429") || message.includes("rate");
  }
}

function topLevelLocation(job: WorkableJob) {
  if (!job.city && !job.region && !job.country && !job.country_code && !job.countryCode) {
    return null;
  }

  return {
    city: job.city,
    region: job.region,
    country: job.country,
    country_code: job.country_code,
    countryCode: job.countryCode,
  } satisfies WorkableLocation;
}

function isPublishedWorkableJob(job: WorkableJob) {
  const state = job.state?.trim().toLowerCase();
  if (!state || state === "published") {
    return true;
  }

  return !["archived", "closed", "draft", "unpublished"].includes(state);
}
