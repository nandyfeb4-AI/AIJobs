import { Body, Controller, Get, Inject, Post, Query } from "@nestjs/common";

import type { ExternalJobSource } from "@aijobs/types";

import {
  CandidateBoardSourceDto,
  CandidateBootstrapDto,
  CandidateEnrichDto,
  CandidateSourceDto,
  UpsertCandidateCompaniesDto,
} from "./jobs.dto";
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

  @Get("candidate-companies")
  async candidateCompanies() {
    return this.jobsService.listCandidateCompanies();
  }

  @Get("candidate-seed-groups")
  async candidateSeedGroups() {
    return this.jobsService.listCandidateSeedGroups();
  }

  @Post("candidate-companies/bootstrap")
  async bootstrapCandidateCompanies(
    @Body() body: CandidateBootstrapDto,
  ) {
    return this.jobsService.bootstrapCandidateCompanies(body.groupId);
  }

  @Post("candidate-companies/source")
  async sourceCandidateCompanies(
    @Body() body: CandidateSourceDto,
  ) {
    return this.jobsService.sourceCandidateCompanies({
      tier: body.tier,
      limit: body.limit,
      focusAreas: body.focusAreas,
      customQuery: body.customQuery,
    });
  }

  @Post("candidate-companies")
  async upsertCandidateCompanies(
    @Body() body: UpsertCandidateCompaniesDto,
  ) {
    return this.jobsService.upsertCandidateCompanies(body.companies);
  }

  @Post("candidate-companies/enrich")
  async enrichCandidateCompanies(
    @Body() body: CandidateEnrichDto,
  ) {
    return this.jobsService.enrichCandidateCompanies(body.limit);
  }

  @Post("candidate-discover")
  async candidateDiscover() {
    const targets = await this.jobsService.getCandidateDiscoveryTargets();
    const jobs = await this.jobsQueueService.enqueueBoardDiscoveries(
      targets.map((company: { id: string }) => ({ companyId: company.id, targetType: "candidate" })),
    );

    return {
      candidateCompanies: targets.length,
      enqueued: jobs.length,
      jobs,
    };
  }

  @Get("candidate-boards")
  async candidateBoards() {
    return this.jobsService.listCandidateBoards();
  }

  @Post("candidate-boards/validate")
  async validateCandidateBoards() {
    return this.jobsService.validateCandidateBoards();
  }

  @Post("candidate-boards/source")
  async sourceCandidateBoards(
    @Body() body: CandidateBoardSourceDto,
  ) {
    return this.jobsService.sourceCandidateBoards({
      limit: body.limit,
      focusAreas: body.focusAreas,
      customQuery: body.customQuery,
    });
  }

  @Post("candidate-boards/promote")
  async promoteCandidateBoards() {
    return this.jobsService.promoteValidatedCandidateBoards();
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

  @Get("pipeline")
  async pipeline(
    @Query("discoveryJobIds") discoveryJobIds?: string,
    @Query("ingestJobIds") ingestJobIds?: string,
  ) {
    return this.jobsQueueService.getPipelineSnapshot({
      discoveryJobIds: discoveryJobIds
        ?.split(",")
        .map((jobId) => jobId.trim())
        .filter(Boolean),
      ingestJobIds: ingestJobIds
        ?.split(",")
        .map((jobId) => jobId.trim())
        .filter(Boolean),
    });
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
