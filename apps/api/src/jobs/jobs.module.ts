import { Module } from "@nestjs/common";

import { AshbyAdapter } from "./adapters/ashby.adapter";
import { GreenhouseAdapter } from "./adapters/greenhouse.adapter";
import { IcimsAdapter } from "./adapters/icims.adapter";
import { LeverAdapter } from "./adapters/lever.adapter";
import { RecruiteeAdapter } from "./adapters/recruitee.adapter";
import { SmartRecruitersAdapter } from "./adapters/smartrecruiters.adapter";
import { WorkableAdapter } from "./adapters/workable.adapter";
import { WorkdayAdapter } from "./adapters/workday.adapter";
import { JobsController } from "./jobs.controller";
import { JobsQueueService } from "./jobs-queue.service";
import { JobsService } from "./jobs.service";

@Module({
  controllers: [JobsController],
  providers: [
    JobsService,
    JobsQueueService,
    GreenhouseAdapter,
    LeverAdapter,
    AshbyAdapter,
    WorkableAdapter,
    SmartRecruitersAdapter,
    RecruiteeAdapter,
    IcimsAdapter,
    WorkdayAdapter,
  ],
  exports: [JobsService],
})
export class JobsModule {}
