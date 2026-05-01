export type ApplyMode = "individual" | "batch";

export type JobMatch = {
  id: string;
  title: string;
  company: string;
  score: number;
  applyMode?: ApplyMode;
};

export type ExternalJobSource =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "smartrecruiters"
  | "recruitee"
  | "adzuna";

export type SourceBoardConfig = {
  source: ExternalJobSource;
  boardToken: string;
};

export type AggregatedJob = {
  id: string;
  source: ExternalJobSource;
  boardToken: string;
  title: string;
  company: string;
  companyLogoUrl?: string | null;
  location: string | null;
  workMode: string | null;
  employmentType: string | null;
  salary: string | null;
  description: string | null;
  applyUrl: string;
  postedAt: string | null;
  department: string | null;
  team: string | null;
};
