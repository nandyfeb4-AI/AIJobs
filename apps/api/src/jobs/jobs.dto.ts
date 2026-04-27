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
