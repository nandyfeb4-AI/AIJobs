import { Controller, Get, Inject, Post, Query } from "@nestjs/common";

import type { ExternalJobSource } from "@aijobs/types";

import { JobsQueueService } from "./jobs-queue.service";
import { JobsService } from "./jobs.service";

@Controller("jobs")
export class JobsController {
  constructor(
    @Inject(JobsService) private readonly jobsService: JobsService,
    @Inject(JobsQueueService) private readonly jobsQueueService: JobsQueueService,
  ) {}

  @Get("sources")
  sources() {
    return this.jobsService.listConfiguredSources();
  }

  @Get("aggregate")
  async aggregate(
    @Query("source") source?: ExternalJobSource,
    @Query("limit") limit?: string,
  ) {
    return this.jobsService.aggregateJobs(source, Number(limit ?? 50));
  }

  @Post("ingest")
  async ingest(
    @Query("source") source?: ExternalJobSource,
  ) {
    const requestedSources = [
      ...this.jobsService.listConfiguredSources().configured
        .filter((item) => (source ? item.source === source : true)),
      ...(await this.jobsService.getBoardsByStatus("working", source)),
      ...(await this.jobsService.getBoardsByStatus("empty", source)),
    ].filter(
      (item, index, array) =>
        array.findIndex(
          (candidate) =>
            candidate.source === item.source && candidate.boardToken === item.boardToken,
        ) === index,
    );

    const jobs = await this.jobsQueueService.enqueueBoardIngests(requestedSources);

    return {
      enqueued: jobs.length,
      jobs,
    };
  }

  @Post("discover")
  async discover() {
    const targets = await this.jobsService.getDiscoveryTargets();
    const jobs = await this.jobsQueueService.enqueueBoardDiscoveries(
      targets.map((company) => ({ companyId: company.id })),
    );

    return {
      targetCompanies: targets.length,
      enqueued: jobs.length,
      jobs,
    };
  }

  @Post("verify-unverified")
  async verifyUnverified(
    @Query("source") source?: ExternalJobSource,
  ) {
    const unverifiedBoards = await this.jobsService.getBoardsByStatus("unverified", source);
    const jobs = await this.jobsQueueService.enqueueBoardIngests(unverifiedBoards);

    return {
      candidates: unverifiedBoards.length,
      enqueued: jobs.length,
      jobs,
    };
  }

  @Get("ingest/status")
  async ingestStatus(
    @Query("jobId") jobId?: string,
  ) {
    if (!jobId) {
      return { status: "missing_job_id" };
    }

    return this.jobsQueueService.getJobStatus(jobId);
  }

  @Get("feed")
  async feed(
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.jobsService.getPersistedJobs({
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("boards")
  async boards(
    @Query("source") source?: ExternalJobSource,
  ) {
    return this.jobsService.getBoardHealth(source);
  }
}
