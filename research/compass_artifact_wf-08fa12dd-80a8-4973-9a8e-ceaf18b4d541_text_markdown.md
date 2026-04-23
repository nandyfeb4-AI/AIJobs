# Build the MVP on Greenhouse, Lever, and Ashby

**For a US-focused AI job platform targeting Product, Software Engineering, Design, and QA/SDET roles, the MVP should ingest from three officially-public ATS APIs first — Greenhouse, Lever, and Ashby — which together cover the overwhelming majority of US tech hiring with documented, auth-free JSON endpoints and low legal risk.** SmartRecruiters and Workable add useful enterprise and SMB breadth in a second wave. Workday coverage (NVIDIA, Salesforce, Adobe, Intel, Cisco, ServiceNow) is valuable but carries both higher technical brittleness and the single most restrictive ToS in the category, so it belongs behind the initial launch. Proprietary systems at Meta, Google, Microsoft, Amazon, Apple, and Uber collectively host tens of thousands of roles but require custom per-site scrapers and should be a dedicated post-MVP track. The hiQ v. LinkedIn (9th Cir. 2022) and Meta v. Bright Data (N.D. Cal. 2024) precedents make logged-off ingestion of documented public APIs a defensible posture, provided the startup avoids fake accounts, technical circumvention, and verbatim republication of long descriptions.

## ATS platform summary

The table below captures the practical landscape. "Public API" means an endpoint that returns structured JSON without authentication; "Brittleness" is a 1 (stable) to 5 (fragile) scale covering URL churn, anti-bot measures, and schema volatility; "US tech prevalence" is a 1–5 scale for concentration among US product/engineering employers.

| Platform | Public JSON API | Auth required | Data quality | Brittleness | US tech prevalence | MVP recommendation |
|---|---|---|---|---|---|---|
| **Greenhouse** | Yes — `boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | No | 5 | 1 | 5 | **Include (core)** |
| **Lever** | Yes — `api.lever.co/v0/postings/{site}?mode=json` | No | 4 | 2 | 4 | **Include (core)** |
| **Ashby** | Yes — `api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` | No | 5 | 1 | 4 (fast-growing) | **Include (core)** |
| **SmartRecruiters** | Yes — `api.smartrecruiters.com/v1/companies/{id}/postings` | No | 4 | 2 | 3 (enterprise) | Second wave |
| **Workable** | Partial — `apply.workable.com/api/v1/widget/accounts/{subdomain}` (undocumented but stable) | No for widget | 3 | 3 | 3 (SMB) | Second wave |
| **Workday** | None documented; internal CXS endpoint (`{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`, POST) | No but Cloudflare-protected | 3 | 4 | 4 (enterprise only) | Later — ToS risk |
| **Rippling ATS** | Yes — `api.rippling.com/platform/api/ats/v1/board/{slug}/jobs` | No | 4 | 2 | 2 (growing) | Later |
| **Recruitee** | Yes — `{company}.recruitee.com/api/offers/` | No | 4 | 2 | 2 | Later |
| **iCIMS** | No public API; HTML scrape of `careers-{company}.icims.com` only | API gated by integration contract | 2 | 5 | 2 | Exclude from MVP |
| **BambooHR** | No public JSON API; HTML scrape of `{company}.bamboohr.com/jobs/` | Auth required for dev API | 3 | 4 | 2 (SMB) | Exclude |
| **Teamtailor, Jobvite, Paylocity, SuccessFactors, Taleo, Gem, Eightfold, Breezy** | None practical without auth/partner status | Various | 2–3 | 3–5 | 1–2 | Exclude |

Three structural observations dominate this table. First, the top four platforms (Greenhouse, Lever, Ashby, SmartRecruiters) **publish their public posting endpoints as supported integration surfaces** — they exist specifically so third parties can build career widgets and aggregators, which is the strongest possible legal footing for ingestion. Second, Ashby has the best-in-class schema: first-class `workplaceType` (Remote/OnSite/Hybrid), ISO-structured `address.postalAddress`, standardized `employmentType` enum, and optional structured `compensation` blocks — all others require normalization work. Third, Workday is an enterprise-coverage necessity but an engineering liability: it requires POST bodies, per-tenant `wd{N}` discovery (not predictable), detail calls per job, and frequently sits behind Cloudflare bot detection.

## Top three platforms for the MVP and why

**Greenhouse is non-negotiable.** It is the dominant ATS in US venture-backed tech — an estimated 7,500–10,000+ customers, including Stripe, Airbnb, Anthropic, Databricks, Figma, Notion, Coinbase, DoorDash, Cloudflare, MongoDB, GitLab, and Roblox. The Job Board API is officially documented, stable for years, returns `updated_at` for clean incremental sync, and emits `content=true` HTML descriptions plus structured `departments`, `offices`, and `metadata` arrays. Pay-transparency salary data flows through `pay_input_ranges` when customers opt in.

**Lever covers the second-largest slice of US tech startups and scale-ups**, with Netflix and Atlassian as anchor marquee customers. Its `categories` object already separates team/department/location/commitment — cleaner out-of-the-box than Greenhouse — and `workplaceType` plus a structured `salaryRange` reduce downstream parsing. The one must-remember detail: **always send `?mode=json` or an `Accept: application/json` header**, or the endpoint returns HTML.

**Ashby is the fastest-growing premium ATS** and has captured a disproportionate share of the AI cohort and top-tier startups: OpenAI, Linear, Vercel, Cursor (Anysphere), Harvey AI, Ramp, Deel, Snowflake, Clay, PostHog, Supabase, Raycast, Modern Treasury, and Runway ML. Its data model is the richest of any ATS, and supporting it early means the MVP will look credible to the exact AI-native, design-forward employer brands engineers care about.

Together these three platforms deliver ~70% of the target companies with a single ingestion pattern per platform, minimal brittleness, and the lowest legal-risk profile in the category.

## Company board catalog grouped by platform

Below is a catalog of ~75 US tech/product-focused companies verified (or flagged unverified) against each ATS's public endpoint. Unverified slugs are educated lowercase-brand guesses and should be probed at ingestion time — a `GET` returning HTTP 200 with a populated `jobs[]` array confirms validity.

### Greenhouse — 40 boards (public URL: `https://job-boards.greenhouse.io/{slug}`; API: `https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true`)

| Company | Slug | Roles | Tier |
|---|---|---|---|
| Stripe | `stripe` | SWE, PM, Design, Data | P1 |
| Airbnb | `airbnb` | SWE, PM, Design, Data, ML | P1 |
| Anthropic | `anthropic` | Research, SWE, PM, Design | P1 |
| Databricks | `databricks` | SWE, PM, Design, Data, ML | P1 |
| Figma | `figma` | SWE, PM, Design, Data | P1 |
| Notion | `notion` | SWE, PM, Design | P1 |
| Discord | `discord` | SWE, PM, Design, Data | P1 |
| Coinbase | `coinbase` | SWE, PM, Design, Data | P1 |
| DoorDash | `doordash` | SWE, PM, Design, Data | P1 |
| Lyft | `lyft` | SWE, PM, Design, Data | P1 |
| Instacart | `instacart` | SWE, PM, Design, Data | P1 |
| Pinterest | `pinterest` [unverified] | SWE, PM, Design, Data | P1 |
| Dropbox | `dropbox` [unverified] | SWE, PM, Design, QA | P1 |
| Robinhood | `robinhood` [unverified] | SWE, PM, Design, Data | P1 |
| Reddit | `reddit` [cross-check Ashby] | SWE, PM, Design, Data | P1 |
| Scale AI | `scaleai` | SWE, ML, PM, Design | P1 |
| Perplexity AI | `perplexityai` | SWE, ML, PM, Design | P1 |
| Roblox | `roblox` | SWE, PM, Design, Data, ML | P1 |
| Epic Games | `epicgames` | SWE, Design, QA, Data | P1 |
| Brex | `brex` [unverified] | SWE, PM, Design, Data | P1 |
| Ramp | `ramp` [cross-check Ashby] | SWE, PM, Design | P1 |
| Plaid | `plaid` [unverified] | SWE, PM, Design, Data | P1 |
| Gusto | `gusto` [unverified] | SWE, PM, Design, Data | P1 |
| Rippling | `rippling` [unverified] | SWE, PM, Design | P1 |
| Airtable | `airtable` | SWE, PM, Design | P1 |
| MongoDB | `mongodb` | SWE, PM, Design, Data | P1 |
| Cloudflare | `cloudflare` | SWE, PM, Design, Data | P1 |
| GitLab | `gitlab` | SWE, PM, Design, Data, ML | P1 |
| Hugging Face | `huggingface` [unverified] | SWE, ML, PM | P1 |
| Affirm | `affirm` | SWE, PM, Design, Data | P2 |
| Asana | `asana` | SWE, PM, Design, Data | P2 |
| Canva | `canva` [unverified] | SWE, PM, Design | P2 |
| Twilio | `twilio` [unverified] | SWE, PM, Design | P2 |
| HashiCorp | `hashicorp` [unverified] | SWE, PM, Design | P2 |
| Chime | `chime` [unverified] | SWE, PM, Design, Data | P2 |
| Benchling | `benchling` [unverified] | SWE, PM, Design | P2 |
| Webflow | `webflow` | SWE, PM, Design | P2 |
| Mercury | `mercury` [unverified] | SWE, PM, Design | P2 |
| Zapier | `zapier` [unverified] | SWE, PM, Design | P2 |
| Mixpanel | `mixpanel` | SWE, PM, Design, Data | P2 |
| GitHub | `github` [unverified; may sit under Microsoft Workday] | SWE, PM, Design | P2 |

### Ashby — 21 boards (public URL: `https://jobs.ashbyhq.com/{slug}`; API: `https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true`)

| Company | Slug | Roles | Tier |
|---|---|---|---|
| OpenAI | `openai` | Research, SWE, PM, Design | P1 |
| Linear | `linear` | SWE, PM, Design | P1 |
| Cursor (Anysphere) | `cursor` | SWE, ML, PM, Design | P1 |
| Ramp | `ramp` | SWE, PM, Design | P1 |
| Deel | `deel` [unverified] | SWE, PM, Design | P1 |
| Vercel | `vercel` [unverified] | SWE, PM, Design | P1 |
| Snowflake | `snowflake` [unverified] | SWE, PM, Design, Data | P1 |
| Harvey AI | `harvey` | SWE, ML, PM, Design | P1 |
| Clay (Clay Labs) | `claylabs` | SWE, PM, Design | P1 |
| Shopify | `shopify` [verify — migrated from Greenhouse] | SWE, PM, Design | P1 |
| Reddit | `reddit` [cross-check Greenhouse] | SWE, PM, Design, Data | P1 |
| PostHog | `posthog` | SWE, PM, Design | P2 |
| Supabase | `supabase` | SWE, PM, Design | P2 |
| Raycast | `raycast` | SWE, Design | P2 |
| Render | `render` | SWE, PM, Design | P2 |
| Modern Treasury | `moderntreasury` | SWE, PM, Design | P2 |
| Runway ML | `runway-ml` | SWE, ML, PM, Design | P2 |
| Baseten | `baseten` | SWE, ML, PM, Design | P2 |
| Retool | `retool` [unverified] | SWE, PM, Design | P2 |
| Braintrust | `Braintrust` (case-sensitive) | SWE, PM, Design | P2 |
| Sourcegraph / Hex | `sourcegraph`, `hex` [both unverified] | SWE, PM, Design, Data | P3 |

Additional Ashby customers worth probing: Opendoor, Duolingo, Ironclad, Quora, Flock Safety, Pave, Cal.com, Warp, Replicate, Loom, Glean, Multiverse.

### Lever — 8 boards (public URL: `https://jobs.lever.co/{slug}`; API: `https://api.lever.co/v0/postings/{slug}?mode=json`)

| Company | Slug | Roles | Tier |
|---|---|---|---|
| Netflix | `netflix` | SWE, PM, Design, Data, ML | P1 |
| Atlassian | `atlassian` | SWE, PM, Design, QA, Data | P1 |
| Attentive | `attentive` | SWE, PM, Design, Data | P2 |
| Yelp | `yelp` [unverified] | SWE, PM, Design, Data | P2 |
| Eventbrite | `eventbrite` [unverified] | SWE, PM, Design | P3 |
| Quora | `quora` [likely migrated to Ashby] | SWE, PM, Design | P3 |
| Lattice | `lattice` [unverified] | SWE, PM, Design | P3 |
| KPMG | `kpmg` [unverified] | Various | P3 |

A real caveat: many classic Lever customers (Shopify, Reddit, Quora, Mixpanel, Eventbrite, Box) have migrated to Greenhouse or Ashby since 2023. **At ingest time, probe all three public endpoints for each company and accept whichever returns 200.**

### Workday — 10 boards (pattern: `https://{tenant}.wd{N}.myworkdayjobs.com/{site}`; CXS endpoint via POST to `/wday/cxs/{tenant}/{site}/jobs`)

| Company | Tenant / WD# / Site | Tier |
|---|---|---|
| NVIDIA | `nvidia` / wd5 / `NVIDIAExternalCareerSite` | P1 |
| Salesforce | `salesforce` / wd12 / `External_Career_Site` | P1 |
| Adobe | `adobe` / wd5 / `external_experienced` | P1 |
| Intel | `intel` / wd1 / `External` | P1 |
| Cisco | `cisco` / wd5 / `Cisco_Careers` | P1 |
| Broadcom/VMware | `broadcom` / wd1 / `External_Career` | P2 |
| Workday | `workday` / wd5 / `Workday` | P2 |
| eBay | `ebay` / wd1 / [verify] | P2 |
| Salesforce Internships | `salesforce` / wd12 / `Futureforce_Internships` | P2 |
| Epic/Psyonix | `epicgames` / wd5 / `Psyonix_Careers` | P3 |

### SmartRecruiters — 2 verified (API: `https://api.smartrecruiters.com/v1/companies/{id}/postings`)

| Company | Slug | Tier |
|---|---|---|
| ServiceNow | `servicenow` | P1 |
| Palo Alto Networks | `paloaltonetworks2` | P2 |

### Proprietary systems — custom scrapers required (separate post-MVP track)

Meta, Google/Alphabet, Microsoft, Amazon, Apple, Uber, Character.AI, Mistral, xAI, Inflection, and Glean all operate custom careers systems with no standard ATS API. Each needs its own scraper against an internal search/HTML endpoint. These are high-value (tens of thousands of roles) but should not block MVP launch.

## Recommended starter batch — 30 boards for day one

The fastest path to a compelling MVP is the following 30-board batch, which exercises all three core APIs, front-loads the strongest brand recognition, and covers the exact Product/SWE/Design/QA surface the platform targets. This order roughly reflects hiring volume and brand pull.

| # | Company | ATS | Endpoint |
|---|---|---|---|
| 1 | Stripe | Greenhouse | `boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true` |
| 2 | Anthropic | Greenhouse | `.../anthropic/jobs?content=true` |
| 3 | OpenAI | Ashby | `api.ashbyhq.com/posting-api/job-board/openai?includeCompensation=true` |
| 4 | Airbnb | Greenhouse | `.../airbnb/jobs?content=true` |
| 5 | Figma | Greenhouse | `.../figma/jobs?content=true` |
| 6 | Databricks | Greenhouse | `.../databricks/jobs?content=true` |
| 7 | Notion | Greenhouse | `.../notion/jobs?content=true` |
| 8 | Netflix | Lever | `api.lever.co/v0/postings/netflix?mode=json` |
| 9 | Coinbase | Greenhouse | `.../coinbase/jobs?content=true` |
| 10 | DoorDash | Greenhouse | `.../doordash/jobs?content=true` |
| 11 | Scale AI | Greenhouse | `.../scaleai/jobs?content=true` |
| 12 | Perplexity | Greenhouse | `.../perplexityai/jobs?content=true` |
| 13 | Cursor | Ashby | `.../posting-api/job-board/cursor?includeCompensation=true` |
| 14 | Linear | Ashby | `.../posting-api/job-board/linear?includeCompensation=true` |
| 15 | Vercel | Ashby | `.../posting-api/job-board/vercel?includeCompensation=true` |
| 16 | Ramp | Ashby | `.../posting-api/job-board/ramp?includeCompensation=true` |
| 17 | Discord | Greenhouse | `.../discord/jobs?content=true` |
| 18 | Atlassian | Lever | `api.lever.co/v0/postings/atlassian?mode=json` |
| 19 | Instacart | Greenhouse | `.../instacart/jobs?content=true` |
| 20 | Roblox | Greenhouse | `.../roblox/jobs?content=true` |
| 21 | Snowflake | Ashby | `.../posting-api/job-board/snowflake?includeCompensation=true` |
| 22 | MongoDB | Greenhouse | `.../mongodb/jobs?content=true` |
| 23 | Cloudflare | Greenhouse | `.../cloudflare/jobs?content=true` |
| 24 | GitLab | Greenhouse | `.../gitlab/jobs?content=true` |
| 25 | Harvey AI | Ashby | `.../posting-api/job-board/harvey?includeCompensation=true` |
| 26 | Airtable | Greenhouse | `.../airtable/jobs?content=true` |
| 27 | Lyft | Greenhouse | `.../lyft/jobs?content=true` |
| 28 | Epic Games | Greenhouse | `.../epicgames/jobs?content=true` |
| 29 | Hugging Face | Greenhouse | `.../huggingface/jobs?content=true` |
| 30 | PostHog | Ashby | `.../posting-api/job-board/posthog?includeCompensation=true` |

This batch touches 22 Greenhouse boards, 6 Ashby boards, and 2 Lever boards — meaning the entire MVP ships with three ingestion adapters. Second-wave expansion adds the remaining Greenhouse P2s (Affirm, Asana, Webflow, Mixpanel, Canva, Twilio, HashiCorp, Chime), the remaining Ashby P2s (Deel, Supabase, Raycast, Render, Modern Treasury, Runway, Baseten, Retool, Shopify), SmartRecruiters (ServiceNow, Palo Alto Networks), and opens the Workday track with NVIDIA, Salesforce, Adobe, Intel, and Cisco.

## Technical ingestion patterns, distilled

For a build-ready reference, the five API patterns the MVP needs are:

- **Greenhouse:** `GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` — returns `id`, `title`, `updated_at`, `location.name`, `content` (HTML-encoded), `absolute_url`, `departments[]`, `offices[]`, `metadata[]`, optional `pay_input_ranges`. Use `updated_at` for incremental sync; decode HTML entities in `content`; normalize free-text `location.name`.
- **Lever:** `GET https://api.lever.co/v0/postings/{site}?mode=json` — returns `id`, `text`, `hostedUrl`, `applyUrl`, `categories{team,department,location,commitment,allLocations}`, `workplaceType`, `description`, `descriptionPlain`, `createdAt` (epoch ms), `salaryRange{currency,interval,min,max}`, `country`. Always send `?mode=json` or `Accept: application/json` — otherwise returns HTML.
- **Ashby:** `GET https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` — returns rich `jobs[]` with `id`, `title`, `location`, `secondaryLocations[]`, `department`, `team`, `isRemote`, `workplaceType` (Remote/OnSite/Hybrid), `descriptionHtml`, `descriptionPlain`, `publishedAt` (ISO 8601), `employmentType` enum, `address.postalAddress`, `jobUrl`, `applyUrl`, optional `compensation{compensationTiers[...min,max,currency,interval]}`. The `api.ashbyhq.com/posting-api/...` form is the current official endpoint; the legacy `jobs.ashbyhq.com/api/non-user-facing/...` still works but is deprecated.
- **SmartRecruiters:** `GET https://api.smartrecruiters.com/v1/companies/{id}/postings?limit=100&offset=0` — returns `content[]` with `id`, `name`, `releasedDate`, `location{city,region,country,remote,latitude,longitude}`, `department`, `function`, `typeOfEmployment`, `experienceLevel`, `ref`, `postingUrl`, `applyUrl`. Full job-ad body requires a second `GET` to the `ref` URL. Paginate against `totalFound`.
- **Workday (second wave):** `POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` with body `{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}`. Response is sparse; a detail `GET` per job is required for the full description. Per-tenant `wd{N}` number must be discovered manually; some tenants sit behind Cloudflare.

Practical data-quality notes across platforms: location strings are almost always free text that requires NLP normalization; remote/hybrid status is first-class only in Lever and Ashby; salary data appears reliably only when customers opt into California/NY/Washington pay-transparency settings; and incremental sync should key off `updated_at` (Greenhouse), `createdAt` (Lever — remember milliseconds), or `publishedAt` (Ashby).

## Risks and caveats

**Legal risk is moderate and manageable if the MVP stays disciplined about three things.** The hiQ Labs v. LinkedIn ruling (9th Cir., April 18, 2022), reinforced by Van Buren v. United States (2021) and Meta v. Bright Data (N.D. Cal., January 2024), establishes that scraping publicly-available data without authentication, fake accounts, or technical circumvention does not violate the CFAA and typically does not breach ToS clauses that bind only logged-in users. Crucially, however, hiQ still lost on contract grounds and paid a $500K consent judgment before going defunct — the CFAA shield is narrower than headlines suggest. The Bright Data outcome matters because Judge Chen explicitly accepted that logged-off scraping falls outside Meta's "user"-scoped ToS, a pattern that maps directly onto the ATS public-API model.

**Workday is the one platform where the legal calculus flips.** Its August 2024 Terms explicitly prohibit scraping, data mining, automated access, and bypassing robots.txt instructions — and the ToS incorporates the per-tenant robots.txt by reference, meaning any Disallow line becomes contractually binding. Treat Workday as "license-or-partner-later," not "scrape-now." iCIMS sits in a similar gated posture; its Job Portal API requires an integration agreement.

**Copyright is the other non-trivial exposure.** Under Feist Publications v. Rural Telephone (1991), factual elements of a job posting (company, title, location, salary, apply URL) are not copyrightable. But the prose description is almost always original enough to attract copyright, owned by the employer. The safest display pattern for MVP: store full descriptions internally for AI matching, but on the user-facing product show structured facts plus a short AI-generated summary and an explicit "Apply on [ATS]" link to the original URL. Register a DMCA agent with the Copyright Office ($6/3 years) for §512(c) safe harbor. Maintain a 24–48 hour takedown SLA and an employer opt-out list keyed by domain and board slug. **Never destroy data after receiving a complaint** — hiQ's spoliation sanctions illustrate how catastrophic that can be.

**Technical caveats worth planning for.** ATS migrations between Greenhouse, Lever, and Ashby have been frequent in 2023–2025; at ingest time, probe all three endpoints per company and accept whichever returns 200. Greenhouse's public URL migrated from `boards.greenhouse.io/{slug}` to `job-boards.greenhouse.io/{slug}` in 2024, though the API endpoint (`boards-api.greenhouse.io/...`) is stable. Ashby slugs can be case-sensitive (`Braintrust` vs. `braintrust`). Lever returns HTML if `?mode=json` is malformed. Workday tenants vary in `wd{N}` number unpredictably and can deploy Cloudflare without notice. None of these platforms provide a master list of all customer boards, so the MVP team must maintain its own company-to-ATS mapping and validate it periodically.

**Operational posture recommendations.** Use a transparent, identifying User-Agent (e.g., `YourStartupBot/1.0 (+https://yourstartup.com/bot; ops@yourstartup.com)`) rather than a spoofed Chrome string. Cap requests at ~1/second per tenant and honor every 429 with exponential backoff. Respect robots.txt even where not strictly required — it is free risk reduction. Do not create fake accounts anywhere, ever. Do not attempt LinkedIn scraping; LinkedIn's general counsel is the most litigious actor in the category (the July 2025 permanent injunction against Proxycurl/Nubela cost them a $10M ARR business). Incorporate in the US, host in the US, and avoid EU infrastructure if the product ever touches EU postings because GDPR applies to personal data that routinely appears in hiring-manager byline fields.

## Final recommendation

**Ship the MVP on three adapters — Greenhouse, Lever, Ashby — ingesting the 30-board starter batch.** That single sprint yields coverage of the highest-signal US tech, fintech, AI, and design-forward employers — Stripe, Anthropic, OpenAI, Airbnb, Figma, Notion, Databricks, Netflix, Coinbase, DoorDash, Linear, Cursor, Vercel, Snowflake, Harvey, Roblox, GitLab — with three JSON endpoints, no authentication, and the strongest possible legal posture (documented public APIs intended for third-party consumption).

**Second wave (weeks 4–8) should add SmartRecruiters and Workable**, bringing ServiceNow, Palo Alto Networks, and a long tail of growth-stage startups, plus the remaining P2 Greenhouse and Ashby boards. This pushes the catalog past 60 active ingestion targets.

**Third wave (post-product-market-fit) should take on Workday and the proprietary systems.** Workday's enterprise coverage (NVIDIA, Salesforce, Adobe, Intel, Cisco) is high-value but should either be licensed through a commercial data feed (Bright Data, Fantastic.jobs, Coresignal) or built with an explicit scraping playbook that keeps the startup away from robots.txt violations. Meta, Google, Microsoft, Amazon, Apple, and Uber each need custom HTML adapters; the combined hiring volume justifies a dedicated engineer per quarter for several quarters.

**Run a brief tech-transactions counsel engagement before commercial launch** — primarily to review the user-facing display of job content (facts vs. verbatim description), the DMCA agent registration, and the forum-selection posture of your own ToS. The documented-public-API approach is the best legal posture available for a jobs-aggregation MVP in 2026, but disciplined execution — transparent UA, rate limiting, no fake accounts, prompt takedowns, link-through-to-source — is what converts a good posture into a durable one.