# AIJobs Agent Handoff

Last updated: 2026-05-01

This file is the quick-start context for future coding/research agents working in this repo. Read it first, then follow the linked strategy docs for depth.

## Product Direction

AIJobs is an AI job application platform for US-based immigrants and high-urgency job seekers. The core product loop is:

1. Build a structured user profile from resume/onboarding.
2. Match users to relevant US/Remote-US jobs.
3. Check/tailor resumes for each job.
4. Help users apply with quality controls.
5. Track applications and outcomes.
6. Use outcomes to improve matching.

Inventory matters, but volume alone is not the win. Jobs must be fresh, US/Remote-US, relevant to target role categories, deduped, and applyable.

## Current Inventory Goal

Current job inventory is roughly in the low tens of thousands. The target MVP inventory is about `100k-150k` relevant jobs.

Important: this should not be achieved by blindly adding stale or non-US jobs. Any scale-up work must preserve:

- US or Remote-US eligibility
- target role relevance
- freshness / posted-date awareness
- source-specific dedupe
- stable apply URLs

## Target Role Scope

Prioritize tech and business-tech roles:

- software engineering
- data engineering
- data science
- analytics
- product management
- product design
- UX/UI
- QA
- DevOps
- cloud infrastructure
- security
- IT support
- business systems
- solutions engineering
- implementation
- technical customer success
- adjacent business-tech roles

Do not overfit to only `software engineer`, `product manager`, and `data engineer`. The target immigrant/IT-worker audience is broader.

## Current Source Status

Implemented direct ATS/adapters:

- Greenhouse
- Lever
- Ashby
- SmartRecruiters
- Recruitee
- Workable

Current operating judgment:

- `SmartRecruiters` is the best recent incremental source. It produced meaningful job volume and should continue through controlled research batches.
- `Workable` should be paused for bulk sourcing. Public validation/API throttles heavily, and the XML feed dry run produced poor fresh US target yield.
- `Greenhouse`, `Lever`, and `Ashby` remain useful, but the easy high-yield manual/research expansion has started to taper.
- `Recruitee` can be useful, but watch rate limits and false negatives.

## Updated Source Strategy

Use a two-track strategy.

### Track A: Native Ingestion

Build durable connectors/crawlers we control:

1. JSON-LD `JobPosting` universal crawler for company career pages and long-tail ATS/custom sites.
2. Public-feed ATS bundle:
   - JazzHR
   - BambooHR
   - Pinpoint
   - JobScore
   - Breezy
   - Teamtailor
3. Enterprise connector research/design:
   - Workday CXS
   - iCIMS sitemaps + JSON-LD
   - SuccessFactors sitemaps + JSON-LD
   - Oracle Cloud HCM / Taleo
4. Later enterprise frameworks:
   - Phenom
   - Eightfold
   - Avature

### Track B: Commercial Bridge

Evaluate one paid aggregator as a temporary accelerator:

- JSearch / RapidAPI
- Fantastic.jobs or similar unified ATS API
- Adzuna or similar aggregator API

Treat paid/aggregator inventory as a bridge, not the moat. Keep it in a separate source type, dedupe aggressively, and measure quality before relying on it.

## What Not To Do

- Do not chase every ATS name from Teal.
- Do not use LinkedIn or Indeed direct crawling as a core source.
- Do not build more Workable bulk sourcing until rate-limit and yield issues are solved.
- Do not trust Perplexity/manual research outputs blindly. Import them into staging, validate, dedupe, and measure yield.
- Do not count inventory as success if it is stale, non-US, or irrelevant.

## Data Quality Requirements

Future ingestion work should normalize these fields where possible:

- `sourceType`: direct_ats, company_careers, aggregator, xml_feed, manual_research
- `ats`
- `countryScope`: us, remote_us, north_america, global, non_us, unknown
- `locationType`: remote, hybrid, onsite, unknown
- `roleCategory`: software, data, product, design, qa, security, cloud_infra, it_support, business_systems, analytics, other
- `freshnessBucket`: 0_7_days, 8_14_days, 15_30_days, 31_60_days, older, unknown
- `postedAtQuality`: exact, inferred, first_seen, unknown

Analytics should expose category/freshness/location quality so we can see whether inventory growth is real quality growth.

## Dedupe Standard

Store both source-native and unified identity:

- `sourceJobId`
- `sourceJobUrl`
- `companyCanonical`
- `titleCanonical`
- `locationCanonical`
- `jobFingerprint`

Preferred dedupe order:

1. exact `source + sourceJobId`
2. exact canonical job URL
3. fuzzy `companyCanonical + titleCanonical + locationCanonical + apply_url_host`
4. source confidence tie-breaker based on posted-date quality and direct apply URL quality

## Perplexity / Manual Research Guidance

Use Perplexity for source discovery and candidate lists, not production ingestion.

Good Perplexity tasks:

- find net-new SmartRecruiters boards, excluding known tokens
- identify public APIs/XML/JSON feeds for ATS/source families
- discover company lists for a specific connector
- compare source quality and feasibility

Always provide exclusion lists when asking for more research. If Teal/source lists are not attached, Perplexity will not know to avoid them.

## Important Reference Docs

- `research/ats-source-prioritization.md` - current source/ATS prioritization and updated roadmap.
- `source-strategy.md` - older source strategy baseline.
- `mvp.md` - MVP loop and product scope.
- `research/current-implementation-vs-job-strategy.md` - implementation comparison notes.
- `research/job-strategy.md` - earlier job strategy notes.
- `research/ats_job_platform_strategy.md` - ATS platform research notes.

## Operational Notes

- Prefer board/source validation through the app over manual trust.
- Candidate research CSVs must be deduped by normalized company/domain/token before enrichment/validation.
- If `npm run typecheck -w @aijobs/web` or the full workspace typecheck changes `apps/web/tsconfig.tsbuildinfo`, restore it before finishing unless the user explicitly wants that file changed.
- When making code changes, keep the repo's existing patterns and do not rewrite unrelated areas.

