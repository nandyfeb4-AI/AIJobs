# Job Source Strategy
**Document type:** Product + Data Supply Strategy  
**Last updated:** April 22, 2026  
**Status:** Draft v1.0

---

## Objective

Define how AIJobs will source jobs for the `Today's Matches` experience without overcommitting to expensive data vendors too early.

The strategy should support:
- low-cost MVP development
- high-quality, fresh job inventory
- US-first launch
- a clear path to broader coverage later

---

## Geographic Strategy

### Phase 1: US-first
Launch with US jobs only.

Why:
- strongest early market for knowledge-work roles
- simpler salary, location, and work-authorization logic
- easier to evaluate match quality without international complexity
- aligns with our initial target user and competitive positioning

### Phase 2: English-speaking expansion
Expand only after the pipeline is stable and match quality is high.

Candidate markets:
- Canada
- United Kingdom
- selected remote-friendly EU roles

### Phase 3: Broader international support
Add wider markets only after we can handle:
- localized currencies
- location normalization
- work authorization nuances
- cross-region remote eligibility rules

---

## Source Strategy

We will use a mix of:
- direct ATS job board APIs for quality and freshness
- aggregators for breadth when needed

---

## Recommended V1 Sources

### 1. Greenhouse
Use as a primary direct source.

Why:
- public job board data for published roles
- widely used by startups and growth-stage companies
- high-quality direct company postings
- good fit for our target user segments

Role in v1:
- high-trust direct inventory
- strong source for product, engineering, design, and operations jobs

---

### 2. Lever
Use as a primary direct source.

Why:
- direct access to public company job postings
- strong overlap with modern tech employers
- good freshness and direct apply paths

Role in v1:
- high-quality direct inventory
- complements Greenhouse well

---

### 3. Ashby
Use as a primary direct source.

Why:
- increasingly common among newer startups and growth companies
- strong overlap with the types of companies our users want to target
- public job board API available

Role in v1:
- high-value startup and scale-up supply
- useful for more selective, premium-feeling job inventory

---

## Recommended Secondary Sources

### 4. Adzuna
Use only if we need broader inventory quickly.

Why:
- broad aggregator coverage
- useful for filling gaps in job volume
- helpful for geographic and category breadth

Tradeoff:
- likely registration, limits, or commercial constraints
- lower trust than direct ATS postings
- more duplicates and normalization work

Role in v1:
- optional breadth layer
- add after direct ATS sources if feed volume is too thin

---

### 5. USAJOBS
Optional later source.

Why:
- good official source for federal/public-sector jobs

Tradeoff:
- not aligned with the highest-priority launch audience

Role:
- later expansion, not core v1

---

### 6. Remotive
Optional later source.

Why:
- useful for remote-specific inventory

Tradeoff:
- too narrow to anchor the main product inventory

Role:
- supplemental remote source if needed

---

## What We Should Avoid Initially

- depending on LinkedIn or Indeed as primary first-party sources
- building brittle scrapers as the foundation of job supply
- chasing maximum volume before we have strong normalization and dedupe

---

## V1 Recommendation

Start with:
- `Greenhouse`
- `Lever`
- `Ashby`

Add only if needed:
- `Adzuna`

This gives us:
- lower early spend
- better job quality
- direct company postings
- fewer ghost or low-confidence listings than pure aggregator-first approaches

---

## Data Pipeline

### 1. Ingest
Pull jobs from source APIs on a schedule.

Collect at minimum:
- source job ID
- source name
- title
- company
- location
- remote type
- employment type
- salary data if available
- description
- apply URL
- posted date

### 2. Normalize
Map all source payloads into one internal schema.

Normalize:
- title
- company name
- location
- country
- seniority
- salary fields
- remote / hybrid / on-site
- job function

### 3. Deduplicate
Remove duplicates across sources.

Use signals such as:
- apply URL
- company + title + location
- posting freshness
- description similarity

### 4. Enrich
Infer structured metadata for matching.

Examples:
- function
- likely seniority
- skill signals
- role tags
- source quality

### 5. Match
Generate candidate matches against the user profile.

Store:
- match score
- match reasons
- freshness
- source confidence

---

## Source Priority Rules

When duplicates exist, prefer:

1. direct ATS posting
2. fresher posting
3. fuller description
4. richer salary/location metadata

This means a direct Greenhouse, Lever, or Ashby posting should usually win over an aggregator copy.

---

## Quality Rules

Do not optimize for raw inventory size.

We should favor:
- freshness
- direct apply URLs
- normalized metadata
- low duplicate rates
- strong fit for knowledge-work users

It is better to show fewer strong matches than a noisy list of hundreds.

---

## Implementation Order

### Step 1
Ship the product UI using mocked match data.

### Step 2
Build the ingestion contract around direct ATS sources first.

### Step 3
Add normalization and dedupe before broadening supply.

### Step 4
Add Adzuna only if we need more volume after evaluating direct-source coverage.

---

## Final Recommendation

For MVP:
- launch `US-first`
- use `Greenhouse + Lever + Ashby` as the initial source foundation
- add `Adzuna` only if direct-source volume is insufficient

This gives AIJobs the best balance of:
- quality
- speed
- cost control
- portability
- trustworthiness

