import type { AggregatedJob } from "@aijobs/types";

export type MatchJob = {
  id: string;
  company: string;
  domain?: string;
  companyLogoUrl?: string | null;
  initial: string;
  industry: string;
  title: string;
  location: string;
  salary: string;
  score: number;
  reason: string;
  source: "Greenhouse" | "Lever" | "Ashby" | "Adzuna";
  postedLabel: string;
  workMode: "Remote" | "Hybrid" | "On-site";
  employmentType: string;
  experience: string;
  applicants: string;
  tags: string[];
  applyUrl?: string;
};

function titleCaseSource(source: AggregatedJob["source"]): MatchJob["source"] {
  return source.charAt(0).toUpperCase() + source.slice(1) as MatchJob["source"];
}

function companyInitial(company: string) {
  return company.trim().charAt(0).toUpperCase() || "J";
}

function postedLabel(value: string | null) {
  if (!value) return "Recently added";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently added";

  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours <= 0) return "Today";
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

function inferIndustry(job: AggregatedJob) {
  const label = [job.department, job.team].filter(Boolean).join(" · ");
  return label || "Direct ATS Posting";
}

function inferWorkMode(job: AggregatedJob): MatchJob["workMode"] {
  const label = `${job.workMode ?? ""} ${job.location ?? ""}`.toLowerCase();
  if (label.includes("remote")) return "Remote";
  if (label.includes("hybrid")) return "Hybrid";
  return "On-site";
}

function inferApplicants(job: AggregatedJob) {
  const label = postedLabel(job.postedAt).toLowerCase();
  if (label.includes("today") || label.includes("hour")) return "Less than 25 applicants";
  if (label.includes("1 day")) return "Less than 50 applicants";
  return "50+ applicants";
}

function inferReason(job: AggregatedJob) {
  return [job.department, job.team, job.workMode].filter(Boolean).slice(0, 3).join(", ") || "Direct company posting";
}

function extractDomainFromLogoUrl(logoUrl?: string | null) {
  if (!logoUrl) return undefined;

  try {
    const url = new URL(logoUrl);
    return url.searchParams.get("domain_url") ?? undefined;
  } catch {
    return undefined;
  }
}

function stableScore(job: AggregatedJob) {
  const seed = `${job.company}:${job.title}:${job.boardToken}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100000;
  }

  let score = 72 + (hash % 24);
  const title = job.title.toLowerCase();

  if (title.includes("senior") || title.includes("staff") || title.includes("lead")) {
    score += 2;
  }

  return Math.min(96, score);
}

export function scoreLabel(score: number) {
  if (score >= 90) return "Strong Match";
  if (score >= 75) return "Good Match";
  return "Fair Match";
}

export function scoreColor(score: number) {
  if (score >= 90) return "#c96428";
  return "rgba(255,255,255,0.80)";
}

export function mapAggregatedJobToMatchJob(job: AggregatedJob): MatchJob {
  return {
    id: job.id,
    company: job.company,
    domain: extractDomainFromLogoUrl(job.companyLogoUrl),
    companyLogoUrl: job.companyLogoUrl,
    initial: companyInitial(job.company),
    industry: inferIndustry(job),
    title: job.title,
    location: job.location ?? "Location not listed",
    salary: job.salary ?? "Compensation not listed",
    score: stableScore(job),
    reason: inferReason(job),
    source: titleCaseSource(job.source),
    postedLabel: postedLabel(job.postedAt),
    workMode: inferWorkMode(job),
    employmentType: job.employmentType ?? "Full-time",
    experience: "Experience varies",
    applicants: inferApplicants(job),
    tags: [job.department, job.team, job.workMode].filter(Boolean) as string[],
    applyUrl: job.applyUrl,
  };
}

export const todaysMatches: MatchJob[] = [
  {
    id: "stripe-senior-product-manager",
    company: "Stripe",
    domain: "stripe.com",
    companyLogoUrl: "https://www.google.com/s2/favicons?sz=128&domain_url=stripe.com",
    initial: "S",
    industry: "Financial Technology",
    title: "Senior Product Manager",
    location: "San Francisco, CA",
    salary: "$180k – $230k",
    score: 94,
    reason: "Payments, API products, fintech background",
    source: "Greenhouse",
    postedLabel: "18 hours ago",
    workMode: "Hybrid",
    employmentType: "Full-time",
    experience: "5+ years",
    applicants: "Less than 25 applicants",
    tags: ["Payments", "API Products", "Fintech"],
    applyUrl: "#",
  },
  {
    id: "notion-product-lead-collaboration",
    company: "Notion",
    domain: "notion.so",
    companyLogoUrl: "https://www.google.com/s2/favicons?sz=128&domain_url=notion.so",
    initial: "N",
    industry: "Productivity Software",
    title: "Product Lead, Collaboration",
    location: "United States",
    salary: "$160k – $200k",
    score: 87,
    reason: "PLG, B2B SaaS, collaboration tools",
    source: "Ashby",
    postedLabel: "7 hours ago",
    workMode: "Remote",
    employmentType: "Full-time",
    experience: "6+ years",
    applicants: "Less than 50 applicants",
    tags: ["PLG", "B2B SaaS", "Collaboration"],
    applyUrl: "#",
  },
  {
    id: "figma-group-product-manager",
    company: "Figma",
    domain: "figma.com",
    companyLogoUrl: "https://www.google.com/s2/favicons?sz=128&domain_url=figma.com",
    initial: "F",
    industry: "Design Tools",
    title: "Group Product Manager",
    location: "San Francisco, CA",
    salary: "$170k – $210k",
    score: 81,
    reason: "Platform, design tools, enterprise",
    source: "Lever",
    postedLabel: "1 day ago",
    workMode: "Hybrid",
    employmentType: "Full-time",
    experience: "7+ years",
    applicants: "67 applicants",
    tags: ["Platform", "Design Tools", "Enterprise"],
    applyUrl: "#",
  },
];
