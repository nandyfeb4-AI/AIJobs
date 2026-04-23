type JobLike = {
  title: string;
  department?: string | null;
  team?: string | null;
  postedAt?: string | null;
};

const EXCLUDED_TITLE_PATTERNS = [
  /\baccount executive\b/i,
  /\baccount manager\b/i,
  /\bsales\b/i,
  /\bmarketing\b/i,
  /\bfinance\b/i,
  /\blegal\b/i,
  /\brecruit/i,
  /\btalent\b/i,
  /\bpeople\b/i,
  /\bhr\b/i,
  /\boperations\b/i,
  /\bcustomer support\b/i,
  /\bcustomer success\b/i,
  /\bbusiness development\b/i,
  /\bpartnerships?\b/i,
  /\banalyst\b/i,
  /\badministrative\b/i,
  /\boffice manager\b/i,
];

const TARGET_TITLE_PATTERNS = [
  /\bproduct manager\b/i,
  /\bgroup product manager\b/i,
  /\bsenior product manager\b/i,
  /\bprincipal product manager\b/i,
  /\bproduct lead\b/i,
  /\bproduct owner\b/i,
  /\bsoftware engineer\b/i,
  /\bbackend engineer\b/i,
  /\bback[- ]end engineer\b/i,
  /\bfrontend engineer\b/i,
  /\bfront[- ]end engineer\b/i,
  /\bfull[- ]stack engineer\b/i,
  /\bandroid engineer\b/i,
  /\bios engineer\b/i,
  /\bmobile engineer\b/i,
  /\bplatform engineer\b/i,
  /\binfrastructure engineer\b/i,
  /\bsecurity engineer\b/i,
  /\bsite reliability engineer\b/i,
  /\bsre\b/i,
  /\bdevops engineer\b/i,
  /\bdata engineer\b/i,
  /\bmachine learning engineer\b/i,
  /\bml engineer\b/i,
  /\bdesigner\b/i,
  /\bproduct designer\b/i,
  /\bux designer\b/i,
  /\bui designer\b/i,
  /\bdesign engineer\b/i,
  /\bqa engineer\b/i,
  /\bquality engineer\b/i,
  /\bsdet\b/i,
  /\btest automation\b/i,
];

export function isTargetRole(job: JobLike) {
  const searchable = [job.title, job.department, job.team].filter(Boolean).join(" ");

  if (!searchable.trim()) return false;
  if (EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(searchable))) {
    return false;
  }

  return TARGET_TITLE_PATTERNS.some((pattern) => pattern.test(searchable));
}

export function compareJobsByPostedAt(left: JobLike, right: JobLike) {
  const leftTime = left.postedAt ? new Date(left.postedAt).getTime() : 0;
  const rightTime = right.postedAt ? new Date(right.postedAt).getTime() : 0;

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.title.localeCompare(right.title);
}

export function interleaveBoardJobs<T>(boardJobs: T[][], limit: number) {
  const queues = boardJobs.map((jobs) => [...jobs]);
  const selected: T[] = [];

  while (selected.length < limit) {
    let addedInRound = false;

    for (const queue of queues) {
      const nextJob = queue.shift();
      if (!nextJob) continue;

      selected.push(nextJob);
      addedInRound = true;

      if (selected.length >= limit) {
        break;
      }
    }

    if (!addedInRound) {
      break;
    }
  }

  return selected;
}
