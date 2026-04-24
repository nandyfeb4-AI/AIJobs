export function cn(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

export { compareJobsByPostedAt, interleaveBoardJobs, isTargetRole, isUsRelevantJob } from "./job-ingestion";
