export type ApplyMode = "individual" | "batch";

export type JobMatch = {
  id: string;
  title: string;
  company: string;
  score: number;
  applyMode?: ApplyMode;
};

