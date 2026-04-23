import type { AggregatedJob, ExternalJobSource, SourceBoardConfig } from "@aijobs/types";

export type SourceAdapter = {
  readonly source: ExternalJobSource;
  fetchJobs(boardToken: string): Promise<AggregatedJob[]>;
};

export type AggregateJobsResult = {
  jobs: AggregatedJob[];
  errors: Array<{
    source: ExternalJobSource;
    boardToken: string;
    message: string;
  }>;
  requestedSources: SourceBoardConfig[];
};

