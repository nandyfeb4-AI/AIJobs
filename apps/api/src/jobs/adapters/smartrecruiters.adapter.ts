import { Injectable } from "@nestjs/common";

import type { AggregatedJob } from "@aijobs/types";

import { resolveCompanyBranding } from "../company-branding";
import { formatBoardToken } from "../source-formatters";
import { buildSalaryLabel, stripHtml, toIsoDate } from "../jobs.utils";
import type { SourceAdapter } from "../jobs.types";

type SmartRecruitersPosting = {
  id: string;
  uuid?: string | null;
  name?: string | null;
  company?: { identifier?: string | null; name?: string | null } | null;
  releasedDate?: string | null;
  location?: {
    city?: string | null;
    region?: string | null;
    country?: string | null;
    remote?: boolean | null;
  } | null;
  department?: { label?: string | null } | null;
  function?: { label?: string | null } | null;
  typeOfEmployment?: { label?: string | null } | null;
  postingUrl?: string | null;
  applyUrl?: string | null;
  jobAd?: {
    sections?: Record<string, { title?: string | null; text?: string | null } | undefined>;
  } | null;
};

type SmartRecruitersResponse = {
  content?: SmartRecruitersPosting[];
  totalFound?: number;
};

function locationLabel(location?: SmartRecruitersPosting["location"]) {
  if (!location) return null;
  const parts = [location.city, location.region, location.country].filter(Boolean);
  const label = parts.join(", ");
  return location.remote ? [label, "Remote"].filter(Boolean).join(" · ") : label || null;
}

function descriptionFromPosting(posting: SmartRecruitersPosting) {
  const sections = posting.jobAd?.sections;
  if (!sections) return null;

  return stripHtml(
    Object.values(sections)
      .map((section) => section?.text)
      .filter(Boolean)
      .join("\n\n"),
  );
}

@Injectable()
export class SmartRecruitersAdapter implements SourceAdapter {
  readonly source = "smartrecruiters" as const;

  async fetchJobs(boardToken: string): Promise<AggregatedJob[]> {
    const jobs: SmartRecruitersPosting[] = [];
    const limit = 100;

    for (let offset = 0; offset < 500; offset += limit) {
      const response = await fetch(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(boardToken)}/postings?limit=${limit}&offset=${offset}`,
        { redirect: "follow" },
      );

      if (!response.ok) {
        throw new Error(`SmartRecruiters request failed with ${response.status}`);
      }

      const payload = (await response.json()) as SmartRecruitersResponse;
      const page = payload.content ?? [];
      jobs.push(...page);

      if (page.length < limit || jobs.length >= (payload.totalFound ?? 0)) {
        break;
      }
    }

    const details = await Promise.all(
      jobs.map(async (job) => {
        try {
          const response = await fetch(
            `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(boardToken)}/postings/${encodeURIComponent(job.id)}`,
            { redirect: "follow" },
          );
          return response.ok ? ({ ...job, ...((await response.json()) as SmartRecruitersPosting) }) : job;
        } catch {
          return job;
        }
      }),
    );

    return details.map((job) => {
      const companyName = job.company?.name ?? formatBoardToken(boardToken);
      const applyUrl =
        job.applyUrl ?? job.postingUrl ?? `https://jobs.smartrecruiters.com/${boardToken}/${job.id}`;
      const branding = resolveCompanyBranding({
        source: this.source,
        boardToken,
        companyFallback: companyName,
        applyUrl,
      });

      return {
        id: `smartrecruiters:${boardToken}:${job.uuid ?? job.id}`,
        source: this.source,
        boardToken,
        title: job.name ?? "Untitled role",
        company: branding.company,
        companyLogoUrl: branding.companyLogoUrl,
        location: locationLabel(job.location),
        workMode: job.location?.remote ? "remote" : null,
        employmentType: job.typeOfEmployment?.label ?? null,
        salary: buildSalaryLabel([]),
        description: descriptionFromPosting(job),
        applyUrl,
        postedAt: toIsoDate(job.releasedDate),
        department: job.department?.label ?? null,
        team: job.function?.label ?? null,
      } satisfies AggregatedJob;
    });
  }
}
