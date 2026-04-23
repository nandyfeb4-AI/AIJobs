import type { ExternalJobSource } from "@aijobs/types";

import type { TargetCompany } from "./target-company-catalog";

type DiscoveredBoard = {
  source: ExternalJobSource;
  boardToken: string;
  evidenceUrl: string;
};

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

function extractBoards(text: string, evidenceUrl: string) {
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
  const response = await fetch(url, {
    redirect: "follow",
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
}

export async function discoverBoardsForCompany(company: TargetCompany) {
  const checkedUrls = new Set<string>([company.careersUrl, ...commonCareerPaths(company.homepage)]);
  const discovered = new Map<string, DiscoveredBoard>();
  const errors: Array<{ url: string; message: string }> = [];

  for (const url of checkedUrls) {
    try {
      const page = await fetchHtml(url);
      const matches = extractBoards(`${page.url}\n${page.html}`, page.url);

      for (const match of matches) {
        discovered.set(`${match.source}:${match.boardToken}`, match);
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

  return {
    company,
    discovered: Array.from(discovered.values()),
    errors,
  };
}
