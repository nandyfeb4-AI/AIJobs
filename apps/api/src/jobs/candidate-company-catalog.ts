export type CandidateCompanySeed = {
  company: string;
  homepage: string;
  companyDomain?: string;
  segments: string[];
  tier: "top" | "priority" | "growth";
  origin: string;
};

type CandidateSeedGroup = {
  id: string;
  label: string;
  description: string;
  companies: CandidateCompanySeed[];
};

const TOP_TIER_COMPANIES: CandidateCompanySeed[] = [
  { company: "Apple", homepage: "https://www.apple.com", companyDomain: "apple.com", segments: ["consumer", "software engineering", "product", "design", "qa"], tier: "top", origin: "bootstrap:top-companies" },
  { company: "Amazon", homepage: "https://www.amazon.com", companyDomain: "amazon.com", segments: ["consumer", "cloud", "software engineering", "product", "design", "qa"], tier: "top", origin: "bootstrap:top-companies" },
  { company: "Google", homepage: "https://about.google", companyDomain: "google.com", segments: ["consumer", "ai", "software engineering", "product", "design", "qa"], tier: "top", origin: "bootstrap:top-companies" },
  { company: "Meta", homepage: "https://www.meta.com", companyDomain: "meta.com", segments: ["consumer", "ai", "software engineering", "product", "design", "qa"], tier: "top", origin: "bootstrap:top-companies" },
  { company: "Netflix", homepage: "https://www.netflix.com", companyDomain: "netflix.com", segments: ["consumer", "software engineering", "product", "design", "qa"], tier: "top", origin: "bootstrap:top-companies" },
  { company: "Microsoft", homepage: "https://www.microsoft.com", companyDomain: "microsoft.com", segments: ["cloud", "developer tools", "software engineering", "product", "design", "qa"], tier: "top", origin: "bootstrap:top-companies" },
  { company: "NVIDIA", homepage: "https://www.nvidia.com", companyDomain: "nvidia.com", segments: ["ai", "hardware", "software engineering", "product", "design", "qa"], tier: "top", origin: "bootstrap:top-companies" },
  { company: "Salesforce", homepage: "https://www.salesforce.com", companyDomain: "salesforce.com", segments: ["enterprise", "software engineering", "product", "design", "qa"], tier: "top", origin: "bootstrap:top-companies" },
  { company: "Adobe", homepage: "https://www.adobe.com", companyDomain: "adobe.com", segments: ["design", "enterprise", "software engineering", "product", "qa"], tier: "top", origin: "bootstrap:top-companies" },
  { company: "Uber", homepage: "https://www.uber.com", companyDomain: "uber.com", segments: ["marketplace", "software engineering", "product", "design", "qa"], tier: "top", origin: "bootstrap:top-companies" },
  { company: "Airbnb", homepage: "https://www.airbnb.com", companyDomain: "airbnb.com", segments: ["marketplace", "software engineering", "product", "design", "qa"], tier: "top", origin: "bootstrap:top-companies" },
  { company: "Stripe", homepage: "https://stripe.com", companyDomain: "stripe.com", segments: ["fintech", "software engineering", "product", "design", "qa"], tier: "top", origin: "bootstrap:top-companies" },
];

const AI_AND_DEVTOOLS_COMPANIES: CandidateCompanySeed[] = [
  { company: "OpenAI", homepage: "https://openai.com", companyDomain: "openai.com", segments: ["ai", "software engineering", "product", "design"], tier: "priority", origin: "bootstrap:ai-devtools" },
  { company: "Anthropic", homepage: "https://www.anthropic.com", companyDomain: "anthropic.com", segments: ["ai", "software engineering", "product", "design"], tier: "priority", origin: "bootstrap:ai-devtools" },
  { company: "Databricks", homepage: "https://www.databricks.com", companyDomain: "databricks.com", segments: ["data", "software engineering", "product", "design"], tier: "priority", origin: "bootstrap:ai-devtools" },
  { company: "Snowflake", homepage: "https://www.snowflake.com", companyDomain: "snowflake.com", segments: ["data", "software engineering", "product", "design"], tier: "priority", origin: "bootstrap:ai-devtools" },
  { company: "Cloudflare", homepage: "https://www.cloudflare.com", companyDomain: "cloudflare.com", segments: ["security", "software engineering", "product", "design", "qa"], tier: "priority", origin: "bootstrap:ai-devtools" },
  { company: "MongoDB", homepage: "https://www.mongodb.com", companyDomain: "mongodb.com", segments: ["developer tools", "software engineering", "product", "design"], tier: "priority", origin: "bootstrap:ai-devtools" },
  { company: "GitLab", homepage: "https://about.gitlab.com", companyDomain: "gitlab.com", segments: ["developer tools", "software engineering", "product", "design", "qa"], tier: "priority", origin: "bootstrap:ai-devtools" },
  { company: "Vercel", homepage: "https://vercel.com", companyDomain: "vercel.com", segments: ["developer tools", "software engineering", "product", "design"], tier: "priority", origin: "bootstrap:ai-devtools" },
  { company: "Render", homepage: "https://render.com", companyDomain: "render.com", segments: ["cloud", "software engineering", "product", "design"], tier: "priority", origin: "bootstrap:ai-devtools" },
  { company: "Supabase", homepage: "https://supabase.com", companyDomain: "supabase.com", segments: ["developer tools", "software engineering", "product", "design"], tier: "priority", origin: "bootstrap:ai-devtools" },
  { company: "PostHog", homepage: "https://posthog.com", companyDomain: "posthog.com", segments: ["developer tools", "product", "software engineering", "design"], tier: "priority", origin: "bootstrap:ai-devtools" },
  { company: "Figma", homepage: "https://www.figma.com", companyDomain: "figma.com", segments: ["design", "software engineering", "product"], tier: "priority", origin: "bootstrap:ai-devtools" },
];

const PRODUCT_AND_DESIGN_COMPANIES: CandidateCompanySeed[] = [
  { company: "Notion", homepage: "https://www.notion.so", companyDomain: "notion.so", segments: ["productivity", "product", "design", "software engineering"], tier: "growth", origin: "bootstrap:product-design" },
  { company: "Airtable", homepage: "https://www.airtable.com", companyDomain: "airtable.com", segments: ["productivity", "product", "design", "software engineering"], tier: "growth", origin: "bootstrap:product-design" },
  { company: "Asana", homepage: "https://asana.com", companyDomain: "asana.com", segments: ["productivity", "product", "design", "software engineering"], tier: "growth", origin: "bootstrap:product-design" },
  { company: "Miro", homepage: "https://miro.com", companyDomain: "miro.com", segments: ["collaboration", "product", "design", "software engineering"], tier: "growth", origin: "bootstrap:product-design" },
  { company: "Canva", homepage: "https://www.canva.com", companyDomain: "canva.com", segments: ["design", "product", "software engineering"], tier: "growth", origin: "bootstrap:product-design" },
  { company: "Webflow", homepage: "https://webflow.com", companyDomain: "webflow.com", segments: ["design", "product", "software engineering"], tier: "growth", origin: "bootstrap:product-design" },
  { company: "Linear", homepage: "https://linear.app", companyDomain: "linear.app", segments: ["productivity", "product", "design", "software engineering"], tier: "growth", origin: "bootstrap:product-design" },
  { company: "Atlassian", homepage: "https://www.atlassian.com", companyDomain: "atlassian.com", segments: ["productivity", "product", "design", "software engineering", "qa"], tier: "growth", origin: "bootstrap:product-design" },
  { company: "Shopify", homepage: "https://www.shopify.com", companyDomain: "shopify.com", segments: ["commerce", "product", "design", "software engineering", "qa"], tier: "growth", origin: "bootstrap:product-design" },
  { company: "HubSpot", homepage: "https://www.hubspot.com", companyDomain: "hubspot.com", segments: ["product", "design", "software engineering"], tier: "growth", origin: "bootstrap:product-design" },
];

const CANDIDATE_SEED_GROUPS: CandidateSeedGroup[] = [
  {
    id: "top-companies",
    label: "Top Companies",
    description: "FAANG-plus and other globally recognized companies to seed first.",
    companies: TOP_TIER_COMPANIES,
  },
  {
    id: "ai-devtools",
    label: "AI & Devtools",
    description: "High-signal AI, cloud, and developer tooling companies.",
    companies: AI_AND_DEVTOOLS_COMPANIES,
  },
  {
    id: "product-design",
    label: "Product & Design",
    description: "Product-led and design-forward companies across the target role families.",
    companies: PRODUCT_AND_DESIGN_COMPANIES,
  },
];

export function getCandidateSeedGroups() {
  return CANDIDATE_SEED_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    description: group.description,
    count: group.companies.length,
  }));
}

export function getCandidateSeedCompanies(groupId?: string) {
  const groups = groupId
    ? CANDIDATE_SEED_GROUPS.filter((group) => group.id === groupId)
    : CANDIDATE_SEED_GROUPS;

  return groups.flatMap((group) => group.companies);
}
