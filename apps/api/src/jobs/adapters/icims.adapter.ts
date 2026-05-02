import { Injectable } from "@nestjs/common";

import type { AggregatedJob } from "@aijobs/types";

import { resolveCompanyBranding } from "../company-branding";
import { formatBoardToken } from "../source-formatters";
import { buildSalaryLabel, stripHtml, toIsoDate } from "../jobs.utils";
import type { SourceAdapter } from "../jobs.types";

type JsonLdJobPosting = {
  "@type"?: string | string[];
  title?: string | null;
  description?: string | null;
  datePosted?: string | null;
  employmentType?: string | string[] | null;
  hiringOrganization?: { name?: string | null } | null;
  jobLocation?: JsonLdLocation | JsonLdLocation[] | null;
  jobLocationType?: string | null;
  applicantLocationRequirements?: JsonLdLocation | JsonLdLocation[] | null;
  directApply?: boolean | null;
};

type JsonLdLocation = {
  address?: {
    addressLocality?: string | null;
    addressRegion?: string | null;
    addressCountry?: string | { name?: string | null } | null;
  } | null;
  name?: string | null;
};

function normalizeBoardUrl(boardToken: string) {
  const raw = boardToken.trim();
  if (!raw) throw new Error("iCIMS board token is empty");

  const parsed = raw.includes("://")
    ? new URL(raw)
    : new URL(`https://${raw}`);
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();

  if (!host.endsWith(".icims.com")) {
    throw new Error("iCIMS board token must be an icims.com URL");
  }

  const searchPath = parsed.pathname.includes("/jobs/search")
    ? parsed.pathname
    : "/jobs/search";
  return new URL(`${parsed.protocol}//${parsed.hostname}${searchPath}`);
}

function htmlDecode(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function extractJobLinks(html: string, baseUrl: string) {
  const links = new Set<string>();
  const patterns = [
    /href=["']([^"']*\/jobs\/\d+\/[^"']*\/job[^"']*)["']/gi,
    /data-url=["']([^"']*\/jobs\/\d+\/[^"']*\/job[^"']*)["']/gi,
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const href = match[1];
      if (!href) continue;

      try {
        links.add(new URL(htmlDecode(href), baseUrl).toString());
      } catch {
        continue;
      }
    }
  }

  return Array.from(links);
}

function parseJsonLdJobPosting(html: string) {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const script of scripts) {
    const raw = script[1]?.trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(htmlDecode(raw));
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const flattened = candidates.flatMap((candidate) => {
        if (candidate?.["@graph"] && Array.isArray(candidate["@graph"])) {
          return candidate["@graph"];
        }
        return [candidate];
      });
      const job = flattened.find((candidate) => {
        const type = candidate?.["@type"];
        return Array.isArray(type)
          ? type.includes("JobPosting")
          : type === "JobPosting";
      });
      if (job) return job as JsonLdJobPosting;
    } catch {
      continue;
    }
  }

  return null;
}

function firstTagText(html: string, tag: string) {
  const pattern = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const value = html.match(pattern)?.[1];
  return stripHtml(value) ?? null;
}

function locationParts(location?: JsonLdLocation | null) {
  if (!location) return null;
  const country = location.address?.addressCountry;
  const countryName = typeof country === "string" ? country : country?.name;
  return [
    location.name,
    location.address?.addressLocality,
    location.address?.addressRegion,
    countryName,
  ]
    .filter(Boolean)
    .join(", ");
}

function locationLabel(job: JsonLdJobPosting | null) {
  const jobLocations = Array.isArray(job?.jobLocation)
    ? job?.jobLocation
    : job?.jobLocation
      ? [job.jobLocation]
      : [];
  const applicantLocations = Array.isArray(job?.applicantLocationRequirements)
    ? job?.applicantLocationRequirements
    : job?.applicantLocationRequirements
      ? [job.applicantLocationRequirements]
      : [];
  const locations = [...jobLocations, ...applicantLocations]
    .map((location) => locationParts(location))
    .filter(Boolean);

  return locations.join(" · ") || null;
}

function employmentTypeLabel(value?: string | string[] | null) {
  if (Array.isArray(value)) return value.join(" · ") || null;
  return value ?? null;
}

function workModeFromJob(job: JsonLdJobPosting | null, html: string) {
  const text = [
    job?.jobLocationType,
    locationLabel(job),
    job?.title,
    html.slice(0, 5000),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (text.includes("telecommute") || text.includes("remote")) return "remote";
  if (text.includes("hybrid")) return "hybrid";
  return null;
}

@Injectable()
export class IcimsAdapter implements SourceAdapter {
  readonly source = "icims" as const;

  async fetchJobs(boardToken: string): Promise<AggregatedJob[]> {
    const searchUrl = normalizeBoardUrl(boardToken);
    const links: string[] = [];
    const seenLinks = new Set<string>();

    for (let page = 0; page < 5; page += 1) {
      searchUrl.searchParams.set("ss", "1");
      searchUrl.searchParams.set("pr", String(page));

      const response = await fetch(searchUrl.toString(), {
        redirect: "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; AIJobsIcimsBot/0.1; +https://aijobs.local/ingest)",
        },
      });

      if (!response.ok) {
        throw new Error(`iCIMS request failed with ${response.status}`);
      }

      const html = await response.text();
      const pageLinks = extractJobLinks(html, searchUrl.toString()).filter(
        (link) => !seenLinks.has(link),
      );

      for (const link of pageLinks) {
        seenLinks.add(link);
        links.push(link);
      }

      if (pageLinks.length === 0 || links.length >= 500) {
        break;
      }
    }

    const details = await Promise.all(
      links.map(async (url) => {
        try {
          const response = await fetch(url, { redirect: "follow" });
          return response.ok
            ? { url: response.url, html: await response.text() }
            : { url, html: "" };
        } catch {
          return { url, html: "" };
        }
      }),
    );

    return details
      .filter((detail) => detail.html)
      .map((detail, index) => {
        const jsonLd = parseJsonLdJobPosting(detail.html);
        const title =
          jsonLd?.title ??
          firstTagText(detail.html, "h1") ??
          firstTagText(detail.html, "title") ??
          "Untitled role";
        const companyFallback =
          jsonLd?.hiringOrganization?.name ??
          formatBoardToken(searchUrl.hostname.split(".")[0] ?? boardToken);
        const branding = resolveCompanyBranding({
          source: this.source,
          boardToken,
          companyFallback,
          applyUrl: detail.url,
        });

        return {
          id: `icims:${searchUrl.hostname}:${detail.url.match(/\/jobs\/(\d+)\//)?.[1] ?? index}`,
          source: this.source,
          boardToken,
          title,
          company: branding.company,
          companyLogoUrl: branding.companyLogoUrl,
          location: locationLabel(jsonLd),
          workMode: workModeFromJob(jsonLd, detail.html),
          employmentType: employmentTypeLabel(jsonLd?.employmentType),
          salary: buildSalaryLabel([]),
          description: stripHtml(jsonLd?.description),
          applyUrl: detail.url,
          postedAt: toIsoDate(jsonLd?.datePosted),
          department: null,
          team: null,
        } satisfies AggregatedJob;
      });
  }
}
