import { Injectable } from "@nestjs/common";

import type { AggregatedJob } from "@aijobs/types";

import { resolveCompanyBranding } from "../company-branding";
import { formatBoardToken } from "../source-formatters";
import { buildSalaryLabel, stripHtml, toIsoDate } from "../jobs.utils";
import type { SourceAdapter } from "../jobs.types";

type LeverPosting = {
  id: string;
  text?: string;
  position?: string;
  createdAt?: number;
  categories?: {
    location?: string;
    commitment?: string;
    department?: string;
    team?: string;
  };
  content?: {
    description?: string;
    descriptionHtml?: string;
  };
  description?: string;
  apply?: string;
  applyUrl?: string;
  hostedUrl?: string;
  salaryDescription?: string | null;
  salaryRange?: {
    min?: number | null;
    max?: number | null;
    currency?: string | null;
    interval?: string | null;
  } | null;
  workplaceType?: string | null;
};

@Injectable()
export class LeverAdapter implements SourceAdapter {
  readonly source = "lever" as const;

  async fetchJobs(boardToken: string): Promise<AggregatedJob[]> {
    const url = `https://api.lever.co/v0/postings/${boardToken}?mode=json`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Lever request failed with ${response.status}`);
    }

    const jobs = (await response.json()) as LeverPosting[];

    return jobs.map((job) => {
      const salaryRange = job.salaryRange
        ? `${job.salaryRange.currency ?? "USD"} ${job.salaryRange.min ?? "?"} - ${job.salaryRange.max ?? "?"}${job.salaryRange.interval ? ` / ${job.salaryRange.interval}` : ""}`
        : null;
      const applyUrl = job.applyUrl ?? job.apply ?? job.hostedUrl ?? "";
      const branding = resolveCompanyBranding({
        source: this.source,
        boardToken,
        companyFallback: formatBoardToken(boardToken),
        applyUrl,
      });

      return {
        id: `lever:${boardToken}:${job.id}`,
        source: this.source,
        boardToken,
        title: job.text ?? job.position ?? "Untitled role",
        company: branding.company,
        companyLogoUrl: branding.companyLogoUrl,
        location: job.categories?.location ?? null,
        workMode: job.workplaceType ?? null,
        employmentType: job.categories?.commitment ?? null,
        salary: buildSalaryLabel([job.salaryDescription ?? null, salaryRange]),
        description: stripHtml(job.content?.descriptionHtml ?? job.content?.description ?? job.description),
        applyUrl,
        postedAt: toIsoDate(job.createdAt),
        department: job.categories?.department ?? null,
        team: job.categories?.team ?? null,
      } satisfies AggregatedJob;
    });
  }
}
