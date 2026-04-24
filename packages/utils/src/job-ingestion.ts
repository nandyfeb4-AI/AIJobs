type JobLike = {
  title: string;
  department?: string | null;
  team?: string | null;
  postedAt?: string | null;
  location?: string | null;
  workMode?: string | null;
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
  /\bproduct engineer\b/i,
  /\bsoftware engineer\b/i,
  /\bsoftware developer\b/i,
  /\bbackend engineer\b/i,
  /\bback[- ]end engineer\b/i,
  /\bbackend developer\b/i,
  /\bback[- ]end developer\b/i,
  /\bfrontend engineer\b/i,
  /\bfront[- ]end engineer\b/i,
  /\bfrontend developer\b/i,
  /\bfront[- ]end developer\b/i,
  /\bfull[- ]stack engineer\b/i,
  /\bfull[- ]stack developer\b/i,
  /\bandroid engineer\b/i,
  /\bios engineer\b/i,
  /\bmobile engineer\b/i,
  /\bplatform engineer\b/i,
  /\binfrastructure engineer\b/i,
  /\bsecurity engineer\b/i,
  /\banalytics engineer\b/i,
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

const US_LOCATION_PATTERNS = [
  /\bunited states\b/i,
  /\busa\b/i,
  /\bu\.s\.a\.\b/i,
  /\bu\.s\.\b/i,
  /\bus-only\b/i,
  /\bus only\b/i,
  /\bus-based\b/i,
  /\bus based\b/i,
  /\bremote(?:\s|-)*(?:us|usa|united states)\b/i,
  /\banywhere in (?:the )?(?:us|usa|united states)\b/i,
  /\bwithin (?:the )?(?:us|usa|united states)\b/i,
  /\bnew york\b/i,
  /\bsan francisco\b/i,
  /\bseattle\b/i,
  /\baustin\b/i,
  /\bboston\b/i,
  /\bchicago\b/i,
  /\blos angeles\b/i,
  /\bdenver\b/i,
  /\batlanta\b/i,
  /\bwashington(?:,\s*d\.?c\.?)?\b/i,
];

const US_STATE_NAME_PATTERNS = [
  /\balabama\b/i,
  /\balaska\b/i,
  /\barizona\b/i,
  /\barkansas\b/i,
  /\bcalifornia\b/i,
  /\bcolorado\b/i,
  /\bconnecticut\b/i,
  /\bdelaware\b/i,
  /\bflorida\b/i,
  /\bgeorgia\b/i,
  /\bhawaii\b/i,
  /\bidaho\b/i,
  /\billinois\b/i,
  /\bindiana\b/i,
  /\biowa\b/i,
  /\bkansas\b/i,
  /\bkentucky\b/i,
  /\blouisiana\b/i,
  /\bmaine\b/i,
  /\bmaryland\b/i,
  /\bmassachusetts\b/i,
  /\bmichigan\b/i,
  /\bminnesota\b/i,
  /\bmississippi\b/i,
  /\bmissouri\b/i,
  /\bmontana\b/i,
  /\bnebraska\b/i,
  /\bnevada\b/i,
  /\bnew hampshire\b/i,
  /\bnew jersey\b/i,
  /\bnew mexico\b/i,
  /\bnew york\b/i,
  /\bnorth carolina\b/i,
  /\bnorth dakota\b/i,
  /\bohio\b/i,
  /\boklahoma\b/i,
  /\boregon\b/i,
  /\bpennsylvania\b/i,
  /\brhode island\b/i,
  /\bsouth carolina\b/i,
  /\bsouth dakota\b/i,
  /\btennessee\b/i,
  /\btexas\b/i,
  /\butah\b/i,
  /\bvermont\b/i,
  /\bvirginia\b/i,
  /\bwashington\b/i,
  /\bwest virginia\b/i,
  /\bwisconsin\b/i,
  /\bwyoming\b/i,
  /\bdistrict of columbia\b/i,
];

const US_STATE_ABBREVIATIONS = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA",
  "ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK",
  "OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

const NON_US_LOCATION_PATTERNS = [
  /\bcanada\b/i,
  /\bcanadian\b/i,
  /\buk\b/i,
  /\bunited kingdom\b/i,
  /\blondon\b/i,
  /\bindia\b/i,
  /\bsingapore\b/i,
  /\beurope\b/i,
  /\beu\b/i,
  /\baustralia\b/i,
];

export function isTargetRole(job: JobLike) {
  const searchable = [job.title, job.department, job.team].filter(Boolean).join(" ");

  if (!searchable.trim()) return false;
  if (EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(searchable))) {
    return false;
  }

  return TARGET_TITLE_PATTERNS.some((pattern) => pattern.test(searchable));
}

export function isUsRelevantJob(job: JobLike) {
  const searchable = [job.title, job.location, job.workMode].filter(Boolean).join(" ").trim();

  if (!searchable) {
    return false;
  }

  if (US_LOCATION_PATTERNS.some((pattern) => pattern.test(searchable))) {
    return true;
  }

  if (US_STATE_NAME_PATTERNS.some((pattern) => pattern.test(searchable))) {
    return true;
  }

  if (NON_US_LOCATION_PATTERNS.some((pattern) => pattern.test(searchable))) {
    return false;
  }

  const abbreviationPattern = new RegExp(
    `(?:,|\\b)(?:${US_STATE_ABBREVIATIONS.join("|")})(?:\\b|$)`,
    "i",
  );

  return abbreviationPattern.test(searchable);
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
