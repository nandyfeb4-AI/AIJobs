import { Injectable } from "@nestjs/common";

import type { AggregatedJob } from "@aijobs/types";

import { resolveCompanyBranding } from "../company-branding";
import { formatBoardToken } from "../source-formatters";
import { buildSalaryLabel, stripHtml } from "../jobs.utils";
import type { SourceAdapter } from "../jobs.types";

type AshbyJob = {
  id?: string;
  title: string;
  location?: string | null;
  department?: string | null;
  team?: string | null;
  isRemote?: boolean;
  descriptionHtml?: string | null;
  employmentType?: string | null;
  publishedDate?: string | null;
  jobUrl?: string | null;
  compensation?: {
    summary?: string | null;
  } | null;
};

type AshbyResponse = {
  jobs?: AshbyJob[];
};

@Injectable()
export class AshbyAdapter implements SourceAdapter {
  readonly source = "ashby" as const;

  async fetchJobs(boardToken: string): Promise<AggregatedJob[]> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${boardToken}?includeCompensation=true`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Ashby request failed with ${response.status}`);
    }

    const payload = (await response.json()) as AshbyResponse;
    const jobs = payload.jobs ?? [];

    return jobs.map((job, index) => {
      const applyUrl = job.jobUrl ?? "";
      const branding = resolveCompanyBranding({
        source: this.source,
        boardToken,
        companyFallback: formatBoardToken(boardToken),
        applyUrl,
      });

      return {
        id: `ashby:${boardToken}:${job.id ?? index}`,
        source: this.source,
        boardToken,
        title: job.title,
        company: branding.company,
        companyLogoUrl: branding.companyLogoUrl,
        location: job.location ?? null,
        workMode: job.isRemote ? "remote" : null,
        employmentType: job.employmentType ?? null,
        salary: buildSalaryLabel([job.compensation?.summary ?? null]),
        description: stripHtml(job.descriptionHtml),
        applyUrl,
        postedAt: job.publishedDate ?? null,
        department: job.department ?? null,
        team: job.team ?? null,
      } satisfies AggregatedJob;
    });
  }
}
