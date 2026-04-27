# ATS-First AI Job Platform Strategy

Prepared for: Solo founder building an AI-powered job application platform  
Current state: 120+ validated ATS boards and 3,000+ jobs across Greenhouse, Lever, and Ashby  
Date: April 24, 2026

## Executive Summary

You have already proven the lower half of the system: once a Greenhouse, Lever, or Ashby board token is known, fetching and normalizing jobs works. The current bottleneck is the upper half of the system: discovering high-quality company boards, validating tokens, avoiding garbage candidates, and prioritizing boards that produce useful U.S. target-role jobs.

The recommendation is not to choose between manual curation and pipeline tuning. The right approach is a human-in-the-loop seed factory:

```text
manual curated company seeds
→ validated board corpus
→ failure analysis
→ pipeline tuning
→ automated expansion
→ user/import discovery flywheel
```

For the next 2-4 weeks, use manual and semi-manual curation to create a high-quality labeled dataset. Use that dataset to measure and improve your automated ingestion pipeline. Once you reach 1,000-2,000 validated boards, reduce manual curation and shift more effort into automation.

## Current Assessment

Your current metrics:

```text
Validated boards: 120+
Active jobs: 3,000+
Average jobs per board: ~25
New useful boards per run: ~10-20
ATS coverage: Greenhouse, Lever, Ashby
```

This is a good start. It proves that the API fetch, normalization, and persistence layers are working.

The problem is yield. If each run only produces 10-20 high-quality boards, it will take too long to reach a meaningful job corpus. The bottleneck is not ingestion; it is candidate generation and discovery quality.

## Why Discovery Is the Moat

Greenhouse, Lever, and Ashby expose public job APIs, but only after the board token or company handle is known.

Greenhouse uses a `board_token` in endpoints such as `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs`, and its list-jobs response includes a `jobs` array plus `meta.total`; passing `content=true` can include descriptions, departments, and offices. [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html)

Lever namespaces public postings under a unique `SITE`, usually a company handle, and returns published postings with fields such as `id`, `text`, `categories`, `descriptionPlain`, `hostedUrl`, `applyUrl`, and `workplaceType`. [Lever Postings API](https://github.com/lever/postings-api)

Ashby uses the organization’s Ashby jobs page name in `GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}`, and the board name is the final path segment of the hosted board URL, such as `https://jobs.ashbyhq.com/Ashby` → `Ashby`. [Ashby Job Postings API](https://developers.ashbyhq.com/docs/public-job-posting-api)

The APIs solve the bottom half of the problem. Discovery solves the top half.

## Recommended Work Allocation

For the next month:

| Workstream | Allocation | Purpose |
|---|---:|---|
| Manual/semi-manual board curation | 35% | Expand the seed set quickly and reveal patterns your crawler misses |
| Pipeline instrumentation and tuning | 45% | Convert manual findings into repeatable automation |
| New discovery sources | 20% | Avoid dependence on a single weak discovery source |

After reaching 1,000-2,000 validated boards:

| Workstream | Allocation |
|---|---:|
| Manual curation | 10-15% |
| Pipeline automation | 60-70% |
| Discovery source expansion | 20-25% |

Manual curation should be treated as a bootstrapping and labeling tool, not the long-term operating model.

## Near-Term Board and Job Targets

At your current average of about 25 jobs per board:

| Active job target | Approximate boards needed |
|---:|---:|
| 10,000 jobs | 400 boards |
| 25,000 jobs | 1,000 boards |
| 50,000 jobs | 2,000 boards |
| 100,000 jobs | 4,000 boards |
| 250,000 jobs | 10,000 boards |

Recommended next milestone:

```text
1,000 validated boards
20,000-30,000 active jobs
5,000-10,000 jobs in your target category
```

That is enough to start testing user value if your matching, resume tailoring, cover letter generation, and tracking workflows are operational.

## Do Not Compete on Raw Job Count

Large competitors may claim millions of jobs, but raw count is not the user’s real problem. The user’s problem is noise:

```text
stale jobs
duplicate jobs
irrelevant jobs
fake jobs
already-closed roles
roles with poor fit
roles buried across many job boards
```

Your wedge should be:

> Fresh direct-apply jobs from verified company ATS boards, ranked by fit, with tailored application materials generated automatically.

For a focused launch, 50,000-100,000 high-quality, fresh, direct ATS jobs can be more valuable than millions of noisy listings.

## Immediate Strategy

### 1. Build a Golden Board Dataset

Before more tuning, create a labeled dataset.

Target:

```text
500 manually reviewed companies
200-300 confirmed valid boards
100 invalid/bad token examples
100 companies with careers pages but no Greenhouse/Lever/Ashby match
```

Each record should include:

```text
company_name
company_domain
careers_url
ats_provider
board_token
board_url
api_url
validation_status
active_job_count
us_job_count
target_role_count
evidence_url
notes
```

This becomes your test suite. Every pipeline update should be measured against it:

```text
How many known valid boards did it rediscover?
How many bad tokens did it avoid?
How many companies did it classify correctly?
How many false positives did it create?
```

Without this, you are tuning blind.

### 2. Curate Companies, Not Individual Jobs

Do not manually add random jobs one by one. That does not scale.

Manual research should produce high-quality company targets. One company can produce an entire board.

Good seed categories:

```text
AI startups
YC companies
Series A-C SaaS companies
VC portfolio companies
H1B-friendly employers
new-grad-friendly tech companies
remote-first companies
companies hiring software/data/product roles
companies known to use Greenhouse, Lever, or Ashby
```

For each company, the pipeline should discover:

```text
domain → careers page → ATS provider → board token → all jobs
```

### 3. Track Source-Level Yield

You need to know which source produces useful boards.

Track every candidate by source:

```text
manual_curated_company
google_search
duckduckgo_search
ats_host_search
career_page_crawl
sitemap
user_import
github_list
vc_portfolio
linkedin_company
```

Measure:

```text
candidates_found
candidate_tokens_extracted
valid_boards
active_boards
boards_with_us_jobs
boards_with_target_jobs
jobs_per_valid_board
false_positive_rate
time_or_cost_per_valid_board
```

Your current “10-20 per run” is not actionable enough. You need to know where those 10-20 came from and why the others failed.

## Failure Taxonomy

Every failed candidate should land in a reason bucket:

```text
NO_CAREERS_PAGE_FOUND
CAREERS_PAGE_FETCH_FAILED
NO_ATS_SIGNAL
ATS_SIGNAL_FOUND_NO_TOKEN
TOKEN_DENYLISTED
TOKEN_API_404
TOKEN_API_EMPTY
VALID_BOARD_NO_JOBS
VALID_BOARD_NO_US_JOBS
VALID_BOARD_NO_TARGET_ROLES
DUPLICATE_BOARD
JS_RENDERED_PAGE_NEEDS_BROWSER
BLOCKED_OR_TIMEOUT
```

This is one of the highest-ROI systems to build now.

Examples:

| Failure pattern | Meaning | Fix |
|---|---|---|
| Most failures are `NO_CAREERS_PAGE_FOUND` | Company-domain discovery is weak | Improve careers URL resolver |
| Most failures are `TOKEN_API_404` | Token extraction is noisy | Improve regexes and denylist |
| Most failures are `VALID_BOARD_NO_TARGET_ROLES` | Discovery works, but seed companies are wrong | Improve company source selection |
| Most failures are `JS_RENDERED_PAGE_NEEDS_BROWSER` | Static fetch misses dynamic pages | Add selective browser fallback |

## Candidate Queue

Use a queue instead of treating each candidate as simply found or not found.

```text
P0: Valid board with target jobs
P1: Valid board, no current target jobs
P2: Likely board, needs validation
P3: Company likely uses ATS, token unknown
P4: Careers page found, ATS unknown
P5: Invalid or blacklisted
```

This lets you revisit promising leads without polluting production jobs.

## Board Quality Score

Not every valid board should become an active source.

Example scoring model:

```text
+40 API validates
+20 company domain matches evidence
+15 has US jobs
+15 has target roles
+10 has recently updated jobs
+5 has structured location/salary/department
-20 only found from generic search
-30 suspicious token
-30 no US jobs
-50 zero jobs
```

Suggested classifications:

```text
80+ = active high-quality
60-79 = active but monitor
40-59 = valid but low-priority
<40 = candidate only
```

## Board Status Model

Use explicit board states:

```text
DISCOVERED
VALID_ATS_BOARD
VALID_EMPTY_BOARD
VALID_NON_US_BOARD
VALID_NO_TARGET_ROLES
ACTIVE_USEFUL_BOARD
STALE_BOARD
INVALID_TOKEN
BLACKLISTED_TOKEN
```

This prevents valid-but-useless boards from being treated the same as active useful boards.

## Manual Curation Playbook

For the next 2 weeks, run a focused curation sprint.

Daily target:

```text
100 companies reviewed/day
30-60 likely ATS boards/day
15-30 validated useful boards/day
```

Workflow:

```text
1. Find company domain.
2. Try /careers, /jobs, /join-us, /work-with-us.
3. Search page HTML for ATS signatures.
4. Extract Greenhouse, Lever, or Ashby token.
5. Validate through API.
6. Save board, jobs, and evidence.
7. Mark failure reason if invalid.
```

Realistic 10-workday output:

```text
1,000 companies reviewed
200-400 new validated boards
5,000-12,000 new jobs
Clear understanding of crawler failure modes
```

This could triple or quadruple your current board count.

## Pipeline Tuning Priorities

### 1. Improve Company-Domain Discovery

Company-first discovery is more reliable than job-first discovery.

For each company domain, crawl:

```text
/
/careers
/jobs
/join-us
/company/careers
/about/careers
/work-with-us
/open-roles
/opportunities
/sitemap.xml
/robots.txt
```

Extract links with anchor text like:

```text
Careers
Jobs
Open roles
Join us
We're hiring
Work with us
Opportunities
```

### 2. Improve ATS Fingerprints

Look for more than obvious URLs.

Greenhouse signals:

```text
boards.greenhouse.io
job-boards.greenhouse.io
boards-api.greenhouse.io
greenhouse.io/embed
grnh.se
gh_jid
```

Lever signals:

```text
jobs.lever.co
api.lever.co
lever.co/embed
lever-recruiting
```

Ashby signals:

```text
jobs.ashbyhq.com
api.ashbyhq.com/posting-api
ashby_embed
ashbyhq
```

### 3. Add JS Fallback Selectively

Do not browser-render every page. It is too slow.

Use browser rendering only when:

```text
careers page exists
HTML is thin
page contains app root markers
page has script references suggesting ATS
static fetch found no jobs
company is high-priority
```

### 4. Expand from Job URL to Board

If you find one job URL, immediately expand to the whole board.

Example:

```text
https://job-boards.greenhouse.io/scaleai/jobs/4281519005
→ token = scaleai
→ validate API
→ ingest all Scale AI jobs
```

Never trust the token until validation passes.

### 5. Strengthen Bad-Token Denial

Keep an aggressive denylist:

```text
embed
app
apply
job
jobs
posting
postings
board
boards
greenhouse
lever
ashby
api
v0
v1
iframe
p-1
search
department
office
```

Every bad token you observe should become training data for the denylist or candidate scorer.

## Discovery Sources

Use these in priority order.

### 1. Curated Company Lists

Highest-signal sources:

```text
VC portfolio companies
startup directories
unicorn lists
YC batches
AI company lists
SaaS company lists
H1B sponsor lists
remote-first company lists
new-grad hiring lists
```

These are better than random search because you start from real companies.

### 2. ATS-Hosted URL Search

Useful, but noisy.

Search patterns:

```text
site:jobs.lever.co "Software Engineer" "United States"
site:job-boards.greenhouse.io "Data Scientist" "United States"
site:boards.greenhouse.io "Product Manager" "United States"
site:jobs.ashbyhq.com "Machine Learning" "United States"
```

Treat search results as candidate evidence, not truth.

### 3. Company Career Pages

This should become your core engine. A company-domain crawler is more scalable and cleaner than searching the open web for individual job posts.

### 4. Public Web Indexes

Public URL indexes or crawl datasets can help find historical ATS URLs. Expect many stale candidates, and let validation clean them.

### 5. User Imports

Eventually, this is powerful.

Every time a user pastes or saves a job URL:

```text
parse ATS URL
extract token
validate board
ingest all jobs
add board to corpus
```

This creates a discovery flywheel.

## Suggested Data Model

```sql
companies
- id
- name
- domain
- linkedin_url
- country
- industry
- source
- created_at

ats_boards
- id
- company_id
- ats_provider
- board_token
- canonical_board_url
- api_url
- status
- confidence_score
- quality_score
- first_seen_at
- last_validated_at
- last_successful_fetch_at
- last_error
- source_evidence_count

board_evidence
- id
- board_id
- evidence_url
- evidence_type
- extracted_token
- discovered_at
- confidence_score

jobs
- id
- board_id
- ats_provider
- external_job_id
- title
- company_name
- location_raw
- country
- state
- city
- workplace_type
- department
- team
- description_plain
- description_html
- apply_url
- job_url
- posted_at
- updated_at
- salary_min
- salary_max
- currency
- is_us
- is_target_role
- is_active
- content_hash
- first_seen_at
- last_seen_at
```

The `board_evidence` table is important. It lets you explain why you believe a board token belongs to a company.

## 30-Day Operating Plan

### Week 1: Instrument Everything

Build:

```text
source tracking
failure taxonomy
board status states
quality score
candidate queue
admin review table
```

Goal:

```text
Know exactly why each candidate failed.
```

### Week 2: Manual Curation Sprint

Review 500-1,000 companies in your target niche.

Goal:

```text
Add 150-300 validated boards.
Create a golden dataset.
Identify common missed patterns.
```

### Week 3: Tune Pipeline Against Golden Dataset

Improve:

```text
careers page resolver
ATS fingerprinting
token extraction
denylist
JS fallback
validation logic
company matching
```

Goal:

```text
Pipeline recovers 80%+ of manually known valid boards.
False positives drop meaningfully.
```

### Week 4: Scale Discovery Sources

Add:

```text
VC/company list ingestion
ATS-hosted search expansion
sitemap crawling
user/import parser if available
```

Goal:

```text
Reach 500-1,000 validated boards.
Reach 10,000-25,000 active jobs.
Know which source gives best yield.
```

## 90-Day Product and Data Milestones

| Month | Goal | Target Output |
|---|---|---|
| Month 1 | Discovery instrumentation and seed expansion | 500-1,000 validated boards, 10k-25k jobs |
| Month 2 | Automated company-domain discovery | 1,500-3,000 validated boards, 30k-75k jobs |
| Month 3 | Niche launch readiness | 3,000-5,000 boards, 75k-150k jobs, strong target-role filtering |

If your product is focused on tech, AI, data, product, new-grad, or visa-sensitive users, you do not need millions of jobs before launch. You need the first 20 recommendations to feel materially better than LinkedIn or Indeed.

## Product Positioning

Recommended wedge:

> Fresh direct ATS jobs for a specific high-pain job seeker segment, ranked by fit, with one-click tailored resumes and cover letters.

Best initial niche:

```text
International students, OPT candidates, H1B candidates, new-grad tech workers, and early-career software/data/AI candidates.
```

Why this niche works:

```text
They have painful filtering needs.
They apply at high volume.
They care about direct company postings.
They need sponsorship and visa signals.
They share tools in communities.
They are more likely to pay for time savings and better odds.
```

## GTM Strategy

### Free Wedge

Your free product should include:

```text
fresh direct ATS job search
saved jobs/tracker
daily matched-job alerts
basic fit score
manual job import
limited application packet generation
```

Teal offers free unlimited job tracking and a Chrome extension that can bookmark jobs from 50+ job boards, so charging for a basic tracker alone is not enough. [Teal Job Tracker](https://www.tealhq.com/tools/job-tracker)

### Paid Execution Layer

Paid features should include:

```text
unlimited tailored resumes
unlimited cover letters
AI application packets
advanced match explanations
auto-generated networking/referral messages
follow-up sequences
interview prep from job descriptions
high-intent alerts for newly posted direct jobs
bulk job shortlist review
```

Huntr’s Pro plan is priced at $40/month monthly, $30/month billed quarterly, or $26.66/month billed biannually, and includes unlimited AI resume generations, AI tailored resumes, cover letters, advanced matching, unlimited tracking, and unlimited AI credits. [Huntr Pricing](https://huntr.co/pricing)

### Suggested Pricing

| Plan | Price | Purpose |
|---|---:|---|
| Free | $0 | Search, tracker, limited fit score, limited imports |
| Pro Monthly | $19-$29/month | AI tailoring, cover letters, advanced matching, alerts |
| Pro 90-Day Pack | $49-$79 | Better aligned with the job-search cycle |
| Power Search | $99-$149 one-time | Resume rewrite, 100-job shortlist, application plan |
| Coach/Affiliate Tier | $20-$50/user/month | Career coaches, bootcamps, university groups |

Avoid annual-only pricing early. Job seekers often churn when they get a job, so a 90-day job search pack is psychologically cleaner.

### Acquisition Channels

| Channel | Tactic |
|---|---|
| Programmatic SEO | “Greenhouse companies hiring software engineers,” “H1B-friendly data jobs,” “new-grad AI jobs direct apply” |
| Daily job drops | “50 fresh direct-apply AI jobs posted today” |
| Community | International student groups, CS Discords, Reddit, Slack groups |
| Chrome extension | Save job → parse ATS → expand to full board |
| University ambassadors | International student associations and CS clubs |
| Career coaches | Affiliate dashboard and discount codes |
| Short-form video | “I found 27 direct apply jobs not showing on LinkedIn” |
| Email loop | Daily/weekly matched-job digest with fit score |

## Market and MRR Reality

The broad job-seeker market is large. In March 2026, the U.S. had 7.2 million unemployed people, 6.0 million people not in the labor force who wanted a job, and 1.8 million long-term unemployed people. [BLS Employment Situation](https://www.bls.gov/news.release/empsit.nr0.htm)

The U.S. had 6.9 million job openings in February 2026, with 4.8 million hires, according to BLS JOLTS data. [BLS JOLTS](https://www.bls.gov/news.release/jolts.nr0.htm)

LinkedIn reported that 58% of people globally planned to look for a job in 2025, half said job search had become harder, and 37% of job seekers were applying to more jobs but hearing back less. [LinkedIn Work Change Report](https://news.linkedin.com/2025/work-change-report)

However, your real market as a solo founder is not all job seekers. It is the reachable subset of active, online, white-collar job seekers in one painful niche.

Realistic MRR ranges if the product is good and marketed consistently:

| Timeline | Conservative | Good | Strong |
|---|---:|---:|---:|
| Month 3 | $0-$2k | $2k-$5k | $5k-$10k |
| Month 6 | $3k-$8k | $8k-$20k | $20k-$40k |
| Month 12 | $8k-$20k | $20k-$60k | $60k-$100k |
| Month 18-24 | $15k-$40k | $50k-$150k | $150k-$300k+ |

Realistic base case:

```text
$20k-$50k MRR in 12-18 months if execution and distribution are solid.
```

Stretch case:

```text
$100k+ MRR if one acquisition loop works: SEO, extension, community, affiliates, or daily job alerts.
```

## What Not To Do

Avoid:

```text
manually adding individual jobs
adding unvalidated boards to production
optimizing for raw job count before freshness and relevance
using search results as truth
overbuilding auto-apply before job supply is strong
tuning regexes without a labeled test set
browser-rendering every careers page
trying to beat LinkedIn/Indeed broadly on day one
```

## Final Recommendation

For the next month, prioritize getting to:

```text
500-1,000 high-quality validated ATS boards
10,000-25,000 fresh active jobs
a golden dataset of manually reviewed companies
a failure taxonomy with source-level yield metrics
a repeatable company-domain discovery engine
```

Your short-term goal is not to discover the maximum number of boards. Your goal is to build a measurable discovery machine.

Once that machine is measurable, improvements will compound. Once job quality is strong in one niche, GTM becomes much easier because your message becomes specific:

> We find fresh direct-apply jobs that match you, then generate the tailored application packet for each one.

