# AIJobs Board Intelligence: Current Implementation vs `job-strategy.md`

Last updated: April 24, 2026

## Purpose

This document explains how the current AIJobs implementation works for ATS board discovery, validation, ingestion, and persistence, then compares it against the desired architecture described in `research/job-strategy.md`.

The short version: our implementation follows the same overall mental model, but it is still a simpler version. We have a working job ingestion layer and a useful first board intelligence layer, but we do not yet have the full evidence, scoring, blacklisting, adaptive refresh, and company-domain discovery system described in the strategy document.

## Current System Summary

The current platform is a TypeScript monorepo with:

- `apps/api`: NestJS API
- `apps/worker`: BullMQ workers for background discovery and ingest
- `apps/web`: Next.js admin/dashboard UI
- `packages/utils`: shared role/location filtering helpers
- `prisma/schema.prisma`: Postgres data model

The job pipeline currently focuses on three public ATS systems:

- Greenhouse
- Lever
- Ashby

Adzuna exists in shared types, but its adapter is not configured.

## Current Data Model

The relevant Prisma models are:

### `Job`

Stores normalized persisted jobs from ATS boards.

Important fields:

- `sourceKey`
- `sourceName`
- `boardToken`
- `title`
- `company`
- `companyDomain`
- `companyLogoUrl`
- `location`
- `employmentType`
- `remoteType`
- `description`
- `applyUrl`
- `postedAt`
- `status`
- `contentHash`
- `firstSeenAt`
- `lastSeenAt`
- `lastSyncedAt`
- `syncCount`

Current statuses:

- `active`
- `stale`
- `inactive`

### `SourceBoard`

Stores main tracked boards that can be ingested repeatedly.

Important fields:

- `sourceName`
- `boardToken`
- `company`
- `companyDomain`
- `tier`
- `status`
- `active`
- `lastCheckedAt`
- `lastSuccessAt`
- `lastFailureAt`
- `lastFailureReason`
- `lastSeenJobCount`
- `lastTargetJobCount`
- `totalPersistedJobs`

Current statuses:

- `unverified`
- `working`
- `empty`
- `failed`

### `CandidateCompany`

Stores company candidates before they become tracked boards.

Important fields:

- `company`
- `companyDomain`
- `homepage`
- `careersUrl`
- `segments`
- `sourceHint`
- `confidence`
- `origin`
- `notes`
- `status`
- `lastDiscoveredAt`
- `lastDiscoveryError`

Current statuses:

- `candidate`
- `discovering`
- `discovered`
- `no_supported_board`
- `failed`
- `promoted`

### `CandidateBoard`

Stores candidate ATS boards before promotion into `SourceBoard`.

Important fields:

- `candidateCompanyId`
- `sourceName`
- `boardToken`
- `evidenceUrl`
- `status`
- `validationError`
- `validatedAt`
- `promotedAt`
- `promotedBoardId`

Current statuses:

- `discovered`
- `validating`
- `validated`
- `rejected`
- `promoted`

## Current Ingestion Layer

The ingestion layer is strong enough for MVP inventory.

### Source Adapters

The API has adapters for:

- `GreenhouseAdapter`
- `LeverAdapter`
- `AshbyAdapter`

Each adapter fetches jobs from the public ATS endpoint and normalizes them into `AggregatedJob`.

The shared normalized shape includes:

- `id`
- `source`
- `boardToken`
- `title`
- `company`
- `companyLogoUrl`
- `location`
- `workMode`
- `employmentType`
- `salary`
- `description`
- `applyUrl`
- `postedAt`
- `department`
- `team`

### ATS API Endpoints Used

Greenhouse:

```text
https://boards-api.greenhouse.io/v1/boards/{boardToken}/jobs?content=true
https://boards-api.greenhouse.io/v1/boards/{boardToken}
```

Lever:

```text
https://api.lever.co/v0/postings/{boardToken}?mode=json
```

Ashby:

```text
https://api.ashbyhq.com/posting-api/job-board/{boardToken}?includeCompensation=true
```

### Role and Location Filtering

Filtering lives in `packages/utils/src/job-ingestion.ts`.

Current role target families include:

- product manager / product owner / product lead
- software engineer / backend / frontend / full-stack
- mobile engineer
- platform / infrastructure / security
- analytics / data / ML
- designer / product designer / UX / UI
- QA / SDET / test automation

Current explicit exclusions include:

- sales
- marketing
- finance
- legal
- recruiting / talent / HR / people
- operations
- customer support / customer success
- business development
- partnerships
- analyst
- administrative / office manager

US filtering currently checks title, location, and work mode against:

- United States / USA / U.S.
- US-only / US-based / remote US
- major US cities
- US states and state abbreviations

It rejects obvious non-US locations such as:

- Canada
- UK
- India
- Singapore
- Europe
- Australia

### Worker Ingestion Flow

The worker consumes the `jobs-ingest` queue.

For each `{ source, boardToken }`:

1. Fetch all jobs from the ATS adapter.
2. Filter to US-relevant jobs.
3. Filter to target-role jobs.
4. Sort by posted date.
5. Resolve company domain/logo from:
   - ATS logo URL
   - existing board metadata
   - starter catalog metadata
   - target-company metadata
6. Upsert jobs into `Job`.
7. Mark missing previously active jobs from that board as `stale`.
8. Upsert/update `SourceBoard` health:
   - `working` if US jobs were seen
   - `empty` if no US jobs were seen
   - `failed` if fetch failed

### Current Main Board Health

Recent database inspection showed:

- Greenhouse: `23/23` active boards working
- Ashby: `68/70` active boards working after removing stale `ashby/shopify`
- Lever: `25/29` active boards working
- Active persisted jobs: roughly `3,200+`

The final ingestion path is therefore working well once a valid board is known.

## Current Board Intelligence Layer

The board intelligence layer exists, but it is not as mature as the strategy document recommends.

### Current Seed Sources

The system currently uses:

- starter board catalog
- target-company catalog
- environment-configured boards
- candidate companies
- board-first search results
- candidate board staging

### Current Board-First Sourcing

The `sourceCandidateBoards` flow:

1. Accepts a requested limit, focus areas, and optional custom query.
2. Splits the requested limit across Greenhouse, Lever, and Ashby.
3. Builds search queries per ATS host.
4. Uses DuckDuckGo HTML results to find candidate ATS URLs.
5. Optionally falls back to OpenAI web search when too few candidates are found.
6. Extracts board tokens from ATS URLs.
7. Dedupes candidates against existing source boards and active candidate boards.
8. Validates candidates through ATS adapters.
9. Creates `CandidateCompany` and `CandidateBoard` records.
10. Returns source breakdown and validation failures to the UI.

Current query examples are similar to:

```text
site:job-boards.greenhouse.io ("software engineer" OR "product manager") ("United States" OR "Remote US")
site:jobs.lever.co jobs ("backend engineer" OR "product designer")
site:jobs.ashbyhq.com careers ("qa engineer" OR "sdet") ("United States" OR "San Francisco")
```

### Current Company Discovery

The system can also discover boards from company targets.

For each target company, it checks:

- company careers URL
- homepage
- `/careers`
- `/jobs`
- `/company/careers`
- `/careers/jobs`

It extracts ATS URLs from fetched pages and validates discovered boards.

This exists, but it is not yet the main high-signal discovery engine.

### Current ATS URL Patterns

Current extraction recognizes:

Greenhouse:

```text
https://job-boards.greenhouse.io/{token}
https://boards.greenhouse.io/{token}
https://boards-api.greenhouse.io/v1/boards/{token}
```

Lever:

```text
https://jobs.lever.co/{token}
https://api.lever.co/v0/postings/{token}
```

Ashby:

```text
https://jobs.ashbyhq.com/{token}
https://api.ashbyhq.com/posting-api/job-board/{token}
```

### Current Candidate Validation

There are two similar validation paths:

1. `sourceCandidateBoards` validates candidates immediately.
2. `validateCandidateBoards` validates previously discovered candidate boards.

Validation currently calls the ATS adapter, then checks jobs.

The intended high-quality conversion target is:

```text
valid board with US target-role jobs
```

Recent database errors show the validation has already moved in this direction in practice, with rejection reasons such as:

```text
validated but returned no US target-role jobs
```

This is aligned with our actual product goal because a board that has no US target-role jobs may be technically valid but not useful for our current users.

## Current Web/Admin UI

The web app has useful operator screens.

### Jobs Feed

`/jobs` loads persisted active jobs from:

```text
GET /api/jobs/feed
```

If no jobs exist, the UI can trigger:

```text
POST /api/jobs/ingest
```

### Board Coverage

`/boards` shows:

- source counts
- working/empty/failed/unverified boards
- target jobs per board
- persisted jobs per board
- last checked timestamp
- failure reason
- discovery queue status
- verification/ingest queue status

It can trigger:

```text
POST /api/jobs/discover
POST /api/jobs/verify-unverified
```

### Candidate Pipeline

`/boards?tab=candidates` supports:

- candidate companies
- candidate boards
- company-first sourcing
- board-first sourcing
- import candidates
- enrich candidates
- run discovery
- validate candidate boards
- promote validated boards

This gives us an operational loop for discovering and promoting boards.

## What Matches `job-strategy.md`

The implementation and strategy document agree on the biggest point:

```text
The hard part is not calling ATS APIs.
The hard part is discovering, validating, scoring, refreshing, and suppressing board identities.
```

### Same Mental Model

Both the code and strategy split the system into:

1. Board intelligence layer
2. Job ingestion layer

### Same ATS API Assumption

Both assume public APIs are easy once the board token is known:

- Greenhouse needs `boardToken`.
- Lever needs company handle/site.
- Ashby needs board name.

### Same Expansion Concept

Both systems use discovered job URLs as evidence for board tokens.

For example:

```text
https://job-boards.greenhouse.io/scaleai/jobs/4281519005
```

can expand into:

```text
greenhouse / scaleai
```

Then the system can fetch all jobs from that board.

### Same Need For Validation

Both require candidate tokens to pass ATS API validation before being treated as real.

### Same Need For US/Target Filtering

Both classify jobs after fetch by:

- country/location
- role family
- employment type
- freshness

The current code implements a first version of this through `isUsRelevantJob` and `isTargetRole`.

### Same MVP Stage 1

The strategy says Stage 1 should be known-board ingestion with:

- ATS API fetchers
- normalizer
- US/target-role classifier
- deduper
- board refresh/admin UI

Our implementation largely has this.

## Where Current Implementation Differs

The strategy document is more mature than the current implementation in several places.

## Gap 1: Company-First Discovery Is Not Primary Yet

### Strategy

The strategy says to start from companies, not job posts.

Recommended input:

- company name
- company domain
- target countries
- target roles

Then:

- fetch homepage
- find careers links
- fetch careers pages
- extract ATS links/scripts
- extract JobPosting schema
- validate candidates
- persist board and jobs

### Current Implementation

We have company discovery, but the stronger implemented flow is currently board-first search.

The company discovery path checks a small set of common career URLs and extracts ATS links. It does not yet deeply crawl:

- sitemap
- robots.txt
- footer links
- About page links
- LinkedIn company website URL
- structured JobPosting schema

### Impact

Search-based discovery produces more noisy candidates. Company-domain discovery would likely produce fewer but higher-quality candidates.

## Gap 2: Garbage Token Filtering Is Too Weak

### Strategy

The strategy recommends rejecting generic tokens before network calls.

Examples:

```text
embed
app
apply
job
jobs
posting
postings
boards
greenhouse
lever
ashby
job_board
iframe
p-1
api
v1
v0
```

### Current Implementation

Current extraction rejects only a small subset.

Known observed bad tokens include:

- `greenhouse/embed`
- `ashby/p-1`

### Impact

We waste validation calls on garbage tokens and create noisy rejected records.

## Gap 3: Evidence Model Is Too Thin

### Strategy

The strategy recommends a `board_evidence` table with:

- board ID
- evidence URL
- evidence type
- extracted token
- discovered timestamp
- confidence score

This lets us explain why we believe a token belongs to a company.

### Current Implementation

`CandidateBoard` has only one `evidenceUrl`.

We do not store:

- multiple evidence sources
- evidence type
- token confidence
- number of times a token was found
- whether evidence came from company-owned page, search, user import, or ATS job URL

### Impact

We cannot distinguish:

- high-confidence company-owned evidence
- weak search-result evidence
- repeated evidence from multiple pages

This limits both automation and debugging.

## Gap 4: No Confidence Or Quality Score

### Strategy

The strategy recommends token confidence and board quality scores.

Example scoring:

```text
+40 valid API response
+20 board maps to known company domain
+15 has at least one US job
+10 has target-role job
+10 has recent jobs
-20 token came only from generic search result
-30 token is suspicious/generic
-30 no US jobs
-50 zero jobs
```

### Current Implementation

The current system mostly uses categorical statuses:

- `discovered`
- `validated`
- `rejected`
- `promoted`
- `working`
- `empty`
- `failed`

It does not compute a persistent numeric confidence or quality score.

### Impact

All validated boards are treated similarly even if some are much more useful than others.

## Gap 5: States Are Too Coarse

### Strategy

The strategy recommends more expressive states:

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

### Current Implementation

Current `SourceBoard` statuses:

```text
unverified
working
empty
failed
```

Current `CandidateBoard` statuses:

```text
discovered
validating
validated
rejected
promoted
```

### Impact

Different failure modes are collapsed into one state.

For example:

- invalid token
- valid board with no jobs
- valid board with no US jobs
- valid board with no target roles

may all become `rejected`, `empty`, or `failed` depending on where they are in the pipeline.

This makes it harder to tune retries and promotion rules.

## Gap 6: Rejected Board Memory Is Not Strong Enough

### Strategy

Invalid tokens should be retried only if new evidence appears.

### Current Implementation

Rejected candidate boards are not listed in the Candidate Boards UI and are not always used as a durable suppression list.

The dedupe code primarily filters existing candidate boards with statuses:

```text
discovered
validating
validated
```

It also filters active source boards.

Rejected boards can therefore be rediscovered and revalidated in later runs.

### Impact

The system may repeatedly spend work on known-bad tokens.

This contributes to low perceived conversion when running `limit=100`.

## Gap 7: Adaptive Refresh Scheduling Is Not Implemented

### Strategy

The strategy recommends different refresh cadences:

```text
Tier A: useful boards with target US jobs -> refresh every 6-12 hours
Tier B: valid boards but no current target jobs -> refresh every 2-7 days
Tier C: valid empty boards -> refresh every 14-30 days
Tier D: invalid tokens -> retry only if new evidence appears
Tier E: stale/closed boards -> monthly or suppress
```

### Current Implementation

We can enqueue ingestion for:

- configured boards
- working boards
- empty boards
- unverified boards

But there is no mature adaptive scheduler yet.

### Impact

All active boards can be treated too similarly. Empty boards are worth keeping, but they should not consume the same refresh budget as high-yield working boards.

## Gap 8: Company Matching Is Basic

### Strategy

The strategy recommends matching board tokens back to companies using:

- company domain
- hiring organization name
- job board page title
- ATS hosted URL slug
- job descriptions mentioning company name
- LinkedIn/company website URL

### Current Implementation

Current company mapping is mostly based on:

- starter catalog metadata
- target company catalog metadata
- candidate company record
- company name from first job
- company domain inferred from logo/apply URL when possible

### Impact

Search-discovered boards with unclear company mapping can be promoted with lower confidence than ideal.

## Gap 9: JobPosting Schema Extraction Is Not Implemented

### Strategy

The strategy recommends extracting structured `JobPosting` metadata from company pages.

### Current Implementation

The current crawler is primarily URL/HTML regex based. It does not parse structured job schema as a first-class source.

### Impact

We may miss board/application URLs on company sites that expose jobs through structured data instead of obvious ATS links.

## Gap 10: User Import / Extension Flywheel Is Not Built Yet

### Strategy

Every saved/imported job should become discovery evidence:

```text
parse ATS
extract board token
validate board
fetch all jobs
add board to discovery graph
```

### Current Implementation

The Chrome extension and job import flywheel are not built yet.

### Impact

We do not yet have a high-intent discovery channel from user-saved jobs.

This should become important once we build:

- Add job to portal
- Chrome extension autofill
- job tracker

## Important Current Observation

The current main board registry performs well once a board is known.

Recent active board counts:

```text
Greenhouse: 23 working / 23 active
Ashby: 68 working / 70 active
Lever: 25 working / 29 active
```

The remaining non-working active boards are mostly `empty`, which is acceptable because a valid empty board can produce jobs later.

One failed board, `ashby/shopify`, was removed because it returned a persistent 404.

This means the biggest weakness is not fetching jobs from known boards. The biggest weakness is discovering high-quality new boards and suppressing low-quality repeated candidates.

## Conversion Funnel Today

Current board-first funnel:

```text
requested limit
  -> split across greenhouse / lever / ashby
  -> search queries
  -> ATS URLs found
  -> candidate tokens extracted
  -> duplicate candidates removed
  -> ATS adapter validation
  -> candidate board created as validated or rejected
  -> validated boards promoted to SourceBoard
  -> SourceBoard ingested
  -> US target-role jobs persisted
```

The main failure points are:

1. Search results return noisy or stale URLs.
2. Token extraction captures generic path segments.
3. Valid ATS boards do not contain US target-role jobs.
4. Rejected boards may be rediscovered in future runs.
5. Lack of quality scoring makes all valid boards look too similar.

## Recommended Next Steps

These are ordered by practical impact.

### 1. Add Token Denylist And Per-ATS Token Validation

Implement before making network calls.

For all ATS systems, reject:

```text
embed
app
apply
job
jobs
posting
postings
boards
greenhouse
lever
ashby
job_board
iframe
p-1
api
v1
v0
```

Greenhouse token rule:

```text
^[a-z0-9][a-z0-9_-]{2,80}$
```

Lever token rule:

```text
^[a-z0-9][a-z0-9-]{1,80}$
```

Ashby:

- preserve original case
- try lowercase as fallback only
- reject generic path segments

### 2. Preserve Rejected Board Memory

Rejected boards should suppress future rediscovery unless new evidence appears.

Options:

- include `rejected` in dedupe with a cooldown
- add `blacklisted` status
- add `rejectionCount`
- add `lastEvidenceUrl`
- add `lastRejectedAt`

### 3. Align Candidate Validation With Persistence Goal

For our current product, a board is useful if it can produce US target-role jobs.

Validation should explicitly compute:

- total jobs
- US jobs
- target-role jobs
- US target-role jobs

Then store these counts.

Do not collapse all non-useful boards into one vague rejection reason.

### 4. Add Board Quality Fields

Add fields to `CandidateBoard` and/or `SourceBoard`:

- `confidenceScore`
- `qualityScore`
- `evidenceType`
- `evidenceCount`
- `lastValidationJobCount`
- `lastValidationUsJobCount`
- `lastValidationTargetJobCount`
- `lastValidationUsTargetJobCount`

### 5. Add Board Evidence Table

Add a table like:

```prisma
model BoardEvidence {
  id             String   @id @default(uuid()) @db.Uuid
  sourceName     String
  boardToken     String
  evidenceUrl    String
  evidenceType   String
  extractedToken String
  confidence     Float?
  createdAt      DateTime @default(now())
}
```

Eventually link it to `SourceBoard` or `CandidateBoard`.

### 6. Make Company-Domain Discovery The High-Signal Path

Improve company discovery to crawl:

- homepage links
- footer links
- `/careers`
- `/jobs`
- `/join-us`
- `/work-with-us`
- `/sitemap.xml`
- structured `JobPosting` JSON-LD

Use search as expansion, not truth.

### 7. Add Adaptive Refresh

Refresh boards differently by usefulness:

- useful working boards: frequent
- empty valid boards: slower
- failed 404 boards: deactivate or suppress
- rejected tokens: do not retry without new evidence

### 8. Add Extension/User Import Flywheel

When the Chrome extension adds a job to AIJobs:

1. Parse ATS provider if known.
2. Extract board token.
3. Store evidence.
4. Validate token.
5. Add or update board intelligence.
6. Fetch all jobs from that board if useful.

This will give us high-intent board discovery from real user behavior.

## Final Assessment

Our implementation is aligned with `job-strategy.md`, but it currently implements the simpler practical MVP version:

- We have working ATS API fetchers.
- We have normalized job ingestion.
- We have US/target-role filtering.
- We have source board health.
- We have candidate board staging.
- We have an admin UI for discovery and validation.

The biggest differences are:

- weak garbage-token filtering
- thin evidence model
- no confidence/quality scoring
- coarse statuses
- insufficient rejected-token memory
- no adaptive refresh scheduler
- company-domain discovery not yet primary
- no user/import extension flywheel

The next major hardening step should be to turn board discovery from "search, extract, validate" into a real board intelligence system:

```text
evidence collection
  -> token extraction
  -> denylist/regex validation
  -> ATS API validation
  -> company matching
  -> quality scoring
  -> adaptive refresh
  -> suppression/blacklist memory
```

That is the system described in `job-strategy.md`, and it is the right long-term direction.
