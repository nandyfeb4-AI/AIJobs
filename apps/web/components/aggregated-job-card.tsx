import {
  BriefcaseBusiness,
  Building2,
  Clock3,
  ExternalLink,
  Layers3,
  MapPin,
  Network,
} from "lucide-react";

import type { AggregatedJob } from "@aijobs/types";

import { CompanyMark } from "./company-mark";

function titleCaseSource(source: AggregatedJob["source"]) {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function formatPostedAt(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString();
}

function cleanLabel(value: string | null) {
  if (!value) return null;

  return value
    .replace(/\s+/g, " ")
    .replace(/^\d+\s*/, "")
    .replace(/\((?:na|emea|apac)\)$/i, "")
    .trim();
}

function compactLocation(value: string | null) {
  if (!value) return null;

  const parts = value
    .split("|")
    .flatMap((segment) => segment.split(","))
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return value;

  const uniqueParts = Array.from(new Set(parts));
  if (uniqueParts.length <= 2) {
    return uniqueParts.join(" · ");
  }

  return `${uniqueParts.slice(0, 2).join(" · ")} +${uniqueParts.length - 2} more`;
}

function descriptionPreview(job: AggregatedJob) {
  const cleaned = job.description?.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Description unavailable from this source preview.";

  if (cleaned.length <= 150) return cleaned;
  return `${cleaned.slice(0, 147).trimEnd()}...`;
}

function companyLine(job: AggregatedJob) {
  return [job.company, cleanLabel(job.department), cleanLabel(job.team)]
    .filter(Boolean)
    .join(" / ");
}

export function AggregatedJobCard({ job }: { job: AggregatedJob }) {
  const location = compactLocation(job.location);
  const postedAt = formatPostedAt(job.postedAt);
  const workMode = cleanLabel(job.workMode);
  const companyMeta = companyLine(job);

  const metadataColumns = [
    location
      ? {
          icon: MapPin,
          primary: location,
          secondary: workMode ?? null,
        }
      : workMode
        ? {
            icon: MapPin,
            primary: workMode,
            secondary: null,
          }
        : null,
    job.employmentType
      ? {
          icon: BriefcaseBusiness,
          primary: job.employmentType,
          secondary: cleanLabel(job.department),
        }
      : null,
    job.salary
      ? {
          icon: Layers3,
          primary: job.salary,
          secondary: cleanLabel(job.team),
        }
      : postedAt
        ? {
            icon: Clock3,
            primary: postedAt,
            secondary: null,
          }
        : null,
  ].filter(Boolean) as Array<{
    icon: typeof MapPin;
    primary: string;
    secondary: string | null;
  }>;

  return (
    <article className="bg-card rounded-[28px] border border-line overflow-hidden shadow-[0_10px_28px_rgba(26,32,24,0.06)]">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="px-6 py-5">
          <div className="flex items-start gap-4">
            <CompanyMark company={job.company} logoUrl={job.companyLogoUrl} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {postedAt ? (
                  <span className="rounded-full bg-parchment px-2.5 py-1 text-[11px] font-medium text-ink/80">
                    {postedAt}
                  </span>
                ) : null}
                <span className="rounded-full bg-parchment px-2.5 py-1 text-[11px] font-medium text-ink/80">
                  {titleCaseSource(job.source)}
                </span>
                {workMode ? (
                  <span className="rounded-full bg-parchment px-2.5 py-1 text-[11px] font-medium text-ink/80">
                    {workMode}
                  </span>
                ) : null}
              </div>

              <h3 className="text-[20px] leading-[1.2] font-semibold text-ink tracking-tight">
                {job.title}
              </h3>

              <p className="mt-1 text-sage text-sm leading-6">
                {companyMeta || job.company}
              </p>
            </div>
          </div>

          {metadataColumns.length ? (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-0 border-y border-line">
              {metadataColumns.map(({ icon: Icon, primary, secondary }) => (
                <div
                  key={`${primary}:${secondary ?? ""}`}
                  className="flex items-start gap-3 px-3 py-4 border-b md:border-b-0 md:[&:not(:last-child)]:border-r border-line"
                >
                  <Icon size={18} className="mt-0.5 text-sage shrink-0" strokeWidth={1.8} />
                  <div className="min-w-0">
                    <p className="text-ink text-sm font-medium leading-5 break-words">{primary}</p>
                    {secondary ? (
                      <p className="text-sage text-sm leading-5 mt-1 break-words">{secondary}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex items-start justify-between gap-4">
            <p className="text-sage text-sm leading-7 flex-1">{descriptionPreview(job)}</p>

            {!job.companyLogoUrl ? (
              <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-sage/70 shrink-0">
                <Building2 size={11} strokeWidth={1.5} />
                Monogram
              </span>
            ) : null}
          </div>
        </div>

        <aside className="border-t xl:border-t-0 xl:border-l border-line bg-parchment/35 px-5 py-5 flex flex-col justify-between gap-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-sage mb-3">Source Board</p>
            <div className="rounded-2xl border border-line bg-white px-4 py-4">
              <div className="inline-flex items-center gap-2 text-ink text-sm font-medium">
                <Network size={15} strokeWidth={1.8} />
                {job.boardToken}
              </div>
              <p className="text-sage text-xs leading-5 mt-2">
                ATS-hosted posting with direct apply link.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <a
              href={job.applyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-ink/85"
            >
              Apply
              <ExternalLink size={13} />
            </a>

            <p className="text-xs text-sage leading-5">
              Open the original posting to review the full description and company-specific details.
            </p>
          </div>
        </aside>
      </div>
    </article>
  );
}
