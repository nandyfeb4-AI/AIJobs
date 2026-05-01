import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsIn,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class CandidateCompanyInputDto {
  @IsString()
  company!: string;

  @IsUrl()
  homepage!: string;

  @IsOptional()
  @IsUrl()
  careersUrl?: string;

  @IsOptional()
  @IsString()
  companyDomain?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  segments?: string[];

  @IsOptional()
  @IsString()
  sourceHint?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpsertCandidateCompaniesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CandidateCompanyInputDto)
  companies!: CandidateCompanyInputDto[];
}

export class CandidateBoardImportInputDto {
  @IsString()
  company!: string;

  @IsOptional()
  @IsUrl()
  homepage?: string;

  @IsOptional()
  @IsString()
  companyDomain?: string;

  @IsOptional()
  @IsString()
  ats?: string;

  @IsOptional()
  @IsString()
  sourceName?: string;

  @IsString()
  boardToken!: string;

  @IsOptional()
  @IsUrl()
  boardUrl?: string;

  @IsOptional()
  @IsUrl()
  evidenceUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  segments?: string[];

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpsertCandidateBoardsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CandidateBoardImportInputDto)
  boards!: CandidateBoardImportInputDto[];
}

export class CandidateBoardValidateDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsString()
  sourceName?: string;
}

export class CandidateBootstrapDto {
  @IsOptional()
  @IsString()
  groupId?: string;
}

export class CandidateEnrichDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class CandidateDiscoverDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class CandidatePipelineDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @IsOptional()
  @IsBoolean()
  includeNoSupported?: boolean;
}

export class CandidateSourceDto {
  @IsOptional()
  @IsIn(["top", "priority", "growth"])
  tier?: "top" | "priority" | "growth";

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  focusAreas?: string[];

  @IsOptional()
  @IsString()
  customQuery?: string;
}

export class CandidateBoardSourceDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  focusAreas?: string[];

  @IsOptional()
  @IsString()
  customQuery?: string;
}

export class WorkableXmlFeedIngestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(500000)
  maxRecords?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  freshDays?: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
