import type { ExternalJobSource } from "@aijobs/types";

import { getStarterBoardMetadata } from "./board-catalog";

const ATS_HOSTS = [
  "boards.greenhouse.io",
  "boards-api.greenhouse.io",
  "api.ashbyhq.com",
  "jobs.ashbyhq.com",
  "api.lever.co",
  "jobs.lever.co",
];

function normalizeDomain(hostname: string) {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function domainFromUrl(url?: string | null) {
  if (!url) return null;

  try {
    const hostname = normalizeDomain(new URL(url).hostname);
    if (!hostname || ATS_HOSTS.includes(hostname)) {
      return null;
    }

    return hostname;
  } catch {
    return null;
  }
}

function logoUrlForDomain(domain: string | null) {
  if (!domain) return null;

  return `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(domain)}`;
}

export function resolveCompanyBranding(input: {
  source: ExternalJobSource;
  boardToken: string;
  companyFallback: string;
  applyUrl?: string | null;
}) {
  const starterMetadata = getStarterBoardMetadata(input.source, input.boardToken);
  const domain = starterMetadata?.domain ?? domainFromUrl(input.applyUrl);
  const company = starterMetadata?.company ?? input.companyFallback;

  return {
    company,
    companyDomain: domain,
    companyLogoUrl: logoUrlForDomain(domain),
  };
}
