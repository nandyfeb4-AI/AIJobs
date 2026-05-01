import type { ExternalJobSource } from "@aijobs/types";

import { getStarterBoardMetadata } from "./board-catalog";
import { getTargetCompanies } from "./target-company-catalog";

const ATS_HOSTS = [
  "boards.greenhouse.io",
  "boards-api.greenhouse.io",
  "api.ashbyhq.com",
  "jobs.ashbyhq.com",
  "api.lever.co",
  "jobs.lever.co",
  "apply.workable.com",
  "www.workable.com",
  "api.smartrecruiters.com",
  "careers.smartrecruiters.com",
  "jobs.smartrecruiters.com",
  "recruitee.com",
];

function normalizeDomain(hostname: string) {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
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

function targetMetadataForBoard(source: ExternalJobSource, boardToken: string, companyFallback: string) {
  const normalizedToken = normalizeText(boardToken);
  const normalizedCompany = normalizeText(companyFallback);

  return getTargetCompanies().find((candidate) => {
    if (candidate.expectedSource !== source) {
      return false;
    }

    const candidateToken = normalizeText(candidate.careersUrl.split("/").pop() ?? "");
    if (candidateToken && candidateToken === normalizedToken) {
      return true;
    }

    return normalizeText(candidate.company) === normalizedCompany;
  });
}

export function resolveCompanyBranding(input: {
  source: ExternalJobSource;
  boardToken: string;
  companyFallback: string;
  applyUrl?: string | null;
}) {
  const starterMetadata = getStarterBoardMetadata(input.source, input.boardToken);
  const targetMetadata = targetMetadataForBoard(
    input.source,
    input.boardToken,
    input.companyFallback,
  );
  const domain = starterMetadata?.domain ?? targetMetadata?.domain ?? domainFromUrl(input.applyUrl);
  const company = starterMetadata?.company ?? targetMetadata?.company ?? input.companyFallback;

  return {
    company,
    companyDomain: domain,
    companyLogoUrl: logoUrlForDomain(domain),
  };
}
