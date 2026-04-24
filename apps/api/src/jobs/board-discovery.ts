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

const ATS_PATTERNS: Array<{
  source: ExternalJobSource;
  pattern: RegExp;
}> = [
  {
    source: "greenhouse",
    pattern: /https?:\/\/(?:job-boards|boards)\.greenhouse\.io\/([a-zA-Z0-9_-]+)/g,
  },
  {
    source: "greenhouse",
    pattern: /https?:\/\/boards-api\.greenhouse\.io\/v1\/boards\/([a-zA-Z0-9_-]+)/g,
  },
  {
    source: "ashby",
    pattern: /https?:\/\/jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/g,
  },
  {
    source: "ashby",
    pattern: /https?:\/\/api\.ashbyhq\.com\/posting-api\/job-board\/([a-zA-Z0-9_-]+)/g,
  },
  {
    source: "lever",
    pattern: /https?:\/\/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/g,
  },
  {
    source: "lever",
    pattern: /https?:\/\/api\.lever\.co\/v0\/postings\/([a-zA-Z0-9_-]+)/g,
  },
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
  if (source === "ashby" && token === "app") {
    return null;
  }

  return token.trim();
}

export function extractBoardsFromText(text: string, evidenceUrl: string) {
  const boards = new Map<string, DiscoveredBoard>();

  for (const item of ATS_PATTERNS) {
    const matches = text.matchAll(item.pattern);

    for (const match of matches) {
      const rawToken = match[1];
      if (!rawToken) continue;

      const boardToken = normalizeToken(item.source, rawToken);
      if (!boardToken) continue;

      const key = `${item.source}:${boardToken}`;

      if (!boards.has(key)) {
        boards.set(key, {
          source: item.source,
          boardToken,
          evidenceUrl,
        });
      }
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
    (candidate) => candidate.source === company.expectedSource,
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
