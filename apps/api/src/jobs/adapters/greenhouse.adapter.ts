import { Injectable } from "@nestjs/common";

import type { AggregatedJob } from "@aijobs/types";

import { resolveCompanyBranding } from "../company-branding";
import { formatBoardToken } from "../source-formatters";
import { buildSalaryLabel, stripHtml, toIsoDate } from "../jobs.utils";
import type { SourceAdapter } from "../jobs.types";

type GreenhouseBoard = {
  name?: string;
};

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string | null;
  location?: { name?: string | null } | null;
  departments?: Array<{ name?: string | null }>;
  offices?: Array<{ name?: string | null; location?: string | null }>;
  content?: string | null;
  metadata?: Array<{
    name?: string | null;
    value?: string | number | null;
    value_type?: string | null;
  }>;
};

type GreenhouseResponse = {
  jobs?: GreenhouseJob[];
};

@Injectable()
export class GreenhouseAdapter implements SourceAdapter {
  readonly source = "greenhouse" as const;

  async fetchJobs(boardToken: string): Promise<AggregatedJob[]> {
    const [jobsResponse, boardResponse] = await Promise.all([
      fetch(`https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`),
      fetch(`https://boards-api.greenhouse.io/v1/boards/${boardToken}`),
    ]);

    if (!jobsResponse.ok) {
      throw new Error(`Greenhouse request failed with ${jobsResponse.status}`);
    }

    const payload = (await jobsResponse.json()) as GreenhouseResponse;
    const board = boardResponse.ok ? ((await boardResponse.json()) as GreenhouseBoard) : null;
    const jobs = payload.jobs ?? [];
    const companyName = board?.name ?? formatBoardToken(boardToken);

    return jobs.map((job) => {
      const metadata = job.metadata ?? [];
      const salaryCandidates = metadata
        .filter((item) => item.name?.toLowerCase().includes("salary"))
        .map((item) => String(item.value ?? ""));
      const branding = resolveCompanyBranding({
        source: this.source,
        boardToken,
        companyFallback: companyName,
        applyUrl: job.absolute_url,
      });

      return {
        id: `greenhouse:${boardToken}:${job.id}`,
        source: this.source,
        boardToken,
        title: job.title,
        company: branding.company,
        companyLogoUrl: branding.companyLogoUrl,
        location:
          job.location?.name ??
          job.offices?.map((office) => office.location ?? office.name).filter(Boolean).join(" · ") ??
          null,
        workMode: null,
        employmentType: null,
        salary: buildSalaryLabel(salaryCandidates),
        description: stripHtml(job.content),
        applyUrl: job.absolute_url,
        postedAt: toIsoDate(job.updated_at),
        department: job.departments?.[0]?.name ?? null,
        team: null,
      } satisfies AggregatedJob;
    });
  }
}
