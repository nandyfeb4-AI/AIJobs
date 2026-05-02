import type { ExternalJobSource } from "@aijobs/types";

import type { TargetCompany } from "./target-company-catalog";

type DiscoveredBoard = {
  source: ExternalJobSource;
  boardToken: string;
  evidenceUrl: string;
};

export type BoardDiscoveryProgress = {
  stage:
    | "starting"
    | "probing_expected_board"
    | "fetching_page"
    | "boards_detected"
    | "completed";
  message: string;
  checkedUrls: number;
  totalUrls: number;
  currentUrl?: string;
  discoveredBoards: number;
};

const DISCOVERY_FETCH_TIMEOUT_MS = 8000;

const URL_PATTERN = /https?:\/\/[^\s"'<>\\)]+/gi;

const GENERIC_TOKEN_DENYLIST = new Set([
  "api",
  "app",
  "application",
  "applications",
  "apply",
  "ashby",
  "board",
  "boards",
  "careers",
  "companies",
  "company",
  "department",
  "departments",
  "embed",
  "greenhouse",
  "iframe",
  "icims",
  "job",
  "job_app",
  "job_board",
  "jobs",
  "lever",
  "office",
  "offices",
  "p-1",
  "posting",
  "postings",
  "recruitee",
  "search",
  "smartrecruiters",
  "v0",
  "v1",
  "workable",
  "workday",
]);

const GENERIC_TOKEN_DENYLIST_PATTERNS = [
  /^company-[a-z0-9]+$/i,
  /^example(?:-[a-z0-9]+)?$/i,
  /^sample(?:-[a-z0-9]+)?$/i,
  /^test(?:-[a-z0-9]+)?$/i,
];

function commonCareerPaths(homepage: string) {
  return [
    homepage,
    `${homepage.replace(/\/$/, "")}/careers`,
    `${homepage.replace(/\/$/, "")}/jobs`,
    `${homepage.replace(/\/$/, "")}/company/careers`,
    `${homepage.replace(/\/$/, "")}/careers/jobs`,
  ];
}

function normalizeToken(source: ExternalJobSource, token: string) {
  const normalizedToken = token.trim();
  const lowerToken = normalizedToken.toLowerCase();

  if (
    !normalizedToken ||
    GENERIC_TOKEN_DENYLIST.has(lowerToken) ||
    GENERIC_TOKEN_DENYLIST_PATTERNS.some((pattern) => pattern.test(normalizedToken))
  ) {
    return null;
  }

  if (source === "greenhouse") {
    return /^[a-z0-9][a-z0-9_-]{2,80}$/i.test(normalizedToken) ? normalizedToken : null;
  }

  if (source === "lever") {
    return /^[a-z0-9][a-z0-9-]{1,80}$/i.test(normalizedToken) ? normalizedToken : null;
  }

  if (source === "ashby") {
    return /^[a-z0-9][a-z0-9_-]{1,100}$/i.test(normalizedToken) ? normalizedToken : null;
  }

  if (source === "workable") {
    return /^[a-z0-9][a-z0-9-]{1,100}$/i.test(normalizedToken) ? normalizedToken : null;
  }

  if (source === "smartrecruiters") {
    return /^[a-z0-9][a-z0-9_-]{1,120}$/i.test(normalizedToken) ? normalizedToken : null;
  }

  if (source === "recruitee") {
    return /^[a-z0-9][a-z0-9-]{1,100}$/i.test(normalizedToken) ? normalizedToken : null;
  }

  if (source === "icims") {
    try {
      const parsed = normalizedToken.includes("://")
        ? new URL(normalizedToken)
        : new URL(`https://${normalizedToken}`);
      const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
      if (!hostname.endsWith(".icims.com")) return null;
      const searchPath = parsed.pathname.includes("/jobs/search")
        ? parsed.pathname
        : "/jobs/search";
      return `https://${hostname}${searchPath}`;
    } catch {
      return null;
    }
  }

  if (source === "workday") {
    try {
      const parsed = normalizedToken.includes("://")
        ? new URL(normalizedToken)
        : new URL(`https://${normalizedToken}`);
      const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
      if (!hostname.endsWith(".myworkdayjobs.com")) return null;
      const segments = parsed.pathname.split("/").filter(Boolean);
      const firstSegment = segments[0] ?? "";
      const hasLocale = /^[a-z]{2}(?:-[A-Z]{2})?$/i.test(firstSegment);
      const locale = hasLocale ? firstSegment : "en-US";
      const site = hasLocale ? segments[1] : firstSegment;
      if (!site) return null;
      return `https://${hostname}/${locale}/${site}`;
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeText(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isPlausibleCompanyBoard(candidate: DiscoveredBoard, company: TargetCompany) {
  const normalizedCompany = normalizeText(company.company);
  const normalizedDomain = normalizeText(company.domain.replace(/\.[a-z]{2,}$/i, ""));
  const normalizedToken = normalizeText(candidate.boardToken);

  if (!normalizedToken) {
    return false;
  }

  return (
    normalizedToken.includes(normalizedCompany) ||
    normalizedCompany.includes(normalizedToken) ||
    normalizedToken.includes(normalizedDomain) ||
    normalizedDomain.includes(normalizedToken)
  );
}

function addDiscoveredBoard(
  boards: Map<string, DiscoveredBoard>,
  source: ExternalJobSource,
  token: string | null,
  evidenceUrl: string,
) {
  if (!token) return;

  const boardToken = normalizeToken(source, token);
  if (!boardToken) return;

  const key = `${source}:${boardToken}`;

  if (!boards.has(key)) {
    boards.set(key, {
      source,
      boardToken,
      evidenceUrl,
    });
  }
}

function pathSegment(url: URL, index: number) {
  return url.pathname.split("/").filter(Boolean)[index] ?? null;
}

function workdayBoardUrl(parsed: URL) {
  const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  const segments = parsed.pathname.split("/").filter(Boolean);
  const firstSegment = segments[0] ?? "";
  const hasLocale = /^[a-z]{2}(?:-[A-Z]{2})?$/i.test(firstSegment);
  const locale = hasLocale ? firstSegment : "en-US";
  const site = hasLocale ? segments[1] : firstSegment;

  return site ? `https://${hostname}/${locale}/${site}` : null;
}

function extractBoardFromUrl(rawUrl: string, evidenceUrl: string) {
  const boards = new Map<string, DiscoveredBoard>();

  try {
    const parsed = new URL(rawUrl.replace(/&amp;/g, "&"));
    const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();

    if (hostname === "job-boards.greenhouse.io" || hostname === "boards.greenhouse.io") {
      const firstSegment = pathSegment(parsed, 0);
      const embedToken = firstSegment === "embed" ? parsed.searchParams.get("for") : null;
      addDiscoveredBoard(boards, "greenhouse", embedToken ?? firstSegment, rawUrl);
    }

    if (hostname === "boards-api.greenhouse.io") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      const boardsIndex = segments.findIndex((segment) => segment === "boards");
      addDiscoveredBoard(boards, "greenhouse", boardsIndex >= 0 ? segments[boardsIndex + 1] : null, rawUrl);
    }

    if (hostname === "jobs.lever.co") {
      addDiscoveredBoard(boards, "lever", pathSegment(parsed, 0), rawUrl);
    }

    if (hostname === "api.lever.co") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      const postingsIndex = segments.findIndex((segment) => segment === "postings");
      addDiscoveredBoard(boards, "lever", postingsIndex >= 0 ? segments[postingsIndex + 1] : null, rawUrl);
    }

    if (hostname === "jobs.ashbyhq.com") {
      addDiscoveredBoard(boards, "ashby", pathSegment(parsed, 0), rawUrl);
    }

    if (hostname === "api.ashbyhq.com") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      const boardIndex = segments.findIndex((segment) => segment === "job-board");
      addDiscoveredBoard(boards, "ashby", boardIndex >= 0 ? segments[boardIndex + 1] : null, rawUrl);
    }

    if (hostname === "apply.workable.com") {
      addDiscoveredBoard(boards, "workable", pathSegment(parsed, 0), rawUrl);
    }

    if (hostname === "www.workable.com") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      const accountsIndex = segments.findIndex((segment) => segment === "accounts");
      addDiscoveredBoard(boards, "workable", accountsIndex >= 0 ? segments[accountsIndex + 1] : null, rawUrl);
    }

    if (hostname === "careers.smartrecruiters.com" || hostname === "jobs.smartrecruiters.com") {
      addDiscoveredBoard(boards, "smartrecruiters", pathSegment(parsed, 0), rawUrl);
    }

    if (hostname === "api.smartrecruiters.com") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      const companiesIndex = segments.findIndex((segment) => segment === "companies");
      addDiscoveredBoard(boards, "smartrecruiters", companiesIndex >= 0 ? segments[companiesIndex + 1] : null, rawUrl);
    }

    if (hostname.endsWith(".recruitee.com") && hostname !== "www.recruitee.com") {
      addDiscoveredBoard(boards, "recruitee", hostname.split(".")[0] ?? null, rawUrl);
    }

    if (hostname.endsWith(".icims.com")) {
      addDiscoveredBoard(boards, "icims", `${parsed.origin}/jobs/search`, rawUrl);
    }

    if (hostname.endsWith(".myworkdayjobs.com")) {
      addDiscoveredBoard(boards, "workday", workdayBoardUrl(parsed), rawUrl);
    }
  } catch {
    return [];
  }

  return Array.from(boards.values()).map((board) => ({
    ...board,
    evidenceUrl,
  }));
}

export function extractBoardsFromText(text: string, evidenceUrl: string) {
  const boards = new Map<string, DiscoveredBoard>();

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    if (!rawUrl) continue;

    for (const board of extractBoardFromUrl(rawUrl, rawUrl)) {
      addDiscoveredBoard(boards, board.source, board.boardToken, board.evidenceUrl);
    }
  }

  return Array.from(boards.values());
}

async function fetchHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; AIJobsDiscoveryBot/0.1; +https://aijobs.local/discovery)",
      },
    });

    if (!response.ok) {
      throw new Error(`Discovery request failed with ${response.status}`);
    }

    const finalUrl = response.url;
    const html = await response.text();

    return {
      url: finalUrl,
      html,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function probeBoardCandidate(candidate: DiscoveredBoard) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_FETCH_TIMEOUT_MS);

  try {
    let response: Response;

    switch (candidate.source) {
      case "greenhouse":
        response = await fetch(
          `https://boards-api.greenhouse.io/v1/boards/${candidate.boardToken}`,
          {
            redirect: "follow",
            signal: controller.signal,
          },
        );
        break;
      case "lever":
        response = await fetch(
          `https://api.lever.co/v0/postings/${candidate.boardToken}?mode=json`,
          {
            redirect: "follow",
            signal: controller.signal,
          },
        );
        break;
      case "ashby":
        response = await fetch(
          `https://api.ashbyhq.com/posting-api/job-board/${candidate.boardToken}`,
          {
            redirect: "follow",
            signal: controller.signal,
          },
        );
        break;
      case "workable":
        response = await fetch(
          `https://www.workable.com/api/accounts/${candidate.boardToken}`,
          {
            redirect: "follow",
            signal: controller.signal,
          },
        );
        break;
      case "smartrecruiters":
        response = await fetch(
          `https://api.smartrecruiters.com/v1/companies/${candidate.boardToken}/postings?limit=1`,
          {
            redirect: "follow",
            signal: controller.signal,
          },
        );
        break;
      case "recruitee":
        response = await fetch(
          `https://${candidate.boardToken}.recruitee.com/api/offers/`,
          {
            redirect: "follow",
            signal: controller.signal,
          },
        );
        break;
      case "icims":
        response = await fetch(candidate.boardToken, {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "user-agent":
              "Mozilla/5.0 (compatible; AIJobsDiscoveryBot/0.1; +https://aijobs.local/discovery)",
          },
        });
        break;
      case "workday": {
        const parsed = new URL(candidate.boardToken);
        const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
        const tenant = host.split(".")[0];
        const segments = parsed.pathname.split("/").filter(Boolean);
        const firstSegment = segments[0] ?? "";
        const site = /^[a-z]{2}(?:-[A-Z]{2})?$/i.test(firstSegment)
          ? segments[1]
          : firstSegment;
        if (!tenant || !site) return false;
        response = await fetch(
          `https://${host}/wday/cxs/${tenant}/${site}/jobs`,
          {
            method: "POST",
            redirect: "follow",
            signal: controller.signal,
            headers: {
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify({
              appliedFacets: {},
              limit: 1,
              offset: 0,
              searchText: "",
            }),
          },
        );
        break;
      }
      default:
        return false;
    }

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function discoverBoardsForCompany(
  company: TargetCompany,
  onProgress?: (progress: BoardDiscoveryProgress) => Promise<void> | void,
) {
  const checkedUrls = Array.from(
    new Set<string>([company.careersUrl, ...commonCareerPaths(company.homepage)]),
  );
  const discovered = new Map<string, DiscoveredBoard>();
  const errors: Array<{ url: string; message: string }> = [];

  await onProgress?.({
    stage: "starting",
    message: `Preparing discovery for ${company.company}`,
    checkedUrls: 0,
    totalUrls: checkedUrls.length,
    discoveredBoards: 0,
  });

  const directCandidates = extractBoardsFromText(company.careersUrl, company.careersUrl).filter(
    (candidate) => candidate.source === company.expectedSource && isPlausibleCompanyBoard(candidate, company),
  );

  if (directCandidates.length) {
    await onProgress?.({
      stage: "probing_expected_board",
      message: `Validating expected ${company.expectedSource} board from careers URL`,
      checkedUrls: 0,
      totalUrls: checkedUrls.length,
      currentUrl: company.careersUrl,
      discoveredBoards: 0,
    });

    for (const candidate of directCandidates) {
      const isValid = await probeBoardCandidate(candidate);
      if (!isValid) continue;

      discovered.set(`${candidate.source}:${candidate.boardToken}`, candidate);
    }

    if (discovered.size > 0) {
      await onProgress?.({
        stage: "completed",
        message: `Validated ${discovered.size} board candidate${discovered.size === 1 ? "" : "s"} from the expected ATS URL`,
        checkedUrls: 1,
        totalUrls: checkedUrls.length,
        currentUrl: company.careersUrl,
        discoveredBoards: discovered.size,
      });

      return {
        company,
        discovered: Array.from(discovered.values()),
        errors,
      };
    }
  }

  for (const [index, url] of checkedUrls.entries()) {
    await onProgress?.({
      stage: "fetching_page",
      message: `Checking ${url}`,
      checkedUrls: index,
      totalUrls: checkedUrls.length,
      currentUrl: url,
      discoveredBoards: discovered.size,
    });

    try {
      const page = await fetchHtml(url);
      const matches = extractBoardsFromText(`${page.url}\n${page.html}`, page.url);

      for (const match of matches) {
        if (!isPlausibleCompanyBoard(match, company)) {
          continue;
        }

        discovered.set(`${match.source}:${match.boardToken}`, match);
      }

      if (matches.length > 0) {
        await onProgress?.({
          stage: "boards_detected",
          message: `Found ${matches.length} board candidate${matches.length === 1 ? "" : "s"} on ${page.url}`,
          checkedUrls: index + 1,
          totalUrls: checkedUrls.length,
          currentUrl: page.url,
          discoveredBoards: discovered.size,
        });
      }

      if (matches.length > 0) {
        break;
      }
    } catch (error) {
      errors.push({
        url,
        message: error instanceof Error ? error.message : "Unknown discovery error",
      });
    }
  }

  await onProgress?.({
    stage: "completed",
    message: `Discovery finished for ${company.company}`,
    checkedUrls: checkedUrls.length,
    totalUrls: checkedUrls.length,
    discoveredBoards: discovered.size,
  });

  return {
    company,
    discovered: Array.from(discovered.values()),
    errors,
  };
}
