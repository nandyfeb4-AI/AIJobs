# ATS Job Source Expansion Strategy (Final – Board-First Architecture)

## 🎯 Goal

Automate expansion of job-source inventory while constrained to:

* Greenhouse
* Lever
* Ashby

We want:

* More unique boards
* More unique companies
* No duplicates in DB
* Minimal manual sourcing

---

# 🧠 Core Framing

We are **not building a generic web scraper**.

We are building a:

```text
Targeted ATS Discovery + Ingestion System
```

Where:

* Boards = entry points
* Jobs = dynamic data
* Companies = derived entities

---

# 🧭 Strategy Overview

**Primary:** Board-first automation
**Secondary:** Company-first fallback
**Deferred:** Token probing (advanced phase only)

---

# ✅ Core Loop (Canonical Flow)

```text
Board → Validate → Dedup → Stage → Derive Company → Ingest Jobs
```

NOT:

```text
Company → Guess → Scrape → Hope
```

---

# 🔍 Board-First Strategy (Primary Path)

## 1. Discover ATS-hosted board URLs

Target patterns:

* `jobs.ashbyhq.com/...`
* `boards.greenhouse.io/...`
* `job-boards.greenhouse.io/...`
* `jobs.lever.co/...`

### Example queries

```text
site:jobs.ashbyhq.com
site:boards.greenhouse.io
site:job-boards.greenhouse.io
site:jobs.lever.co
```

### Narrow queries

```text
site:jobs.ashbyhq.com engineer
site:boards.greenhouse.io "product manager"
site:jobs.lever.co designer
```

---

## 2. Extract Board Candidates

From each discovered URL:

* source (greenhouse / lever / ashby)
* boardToken
* evidenceUrl

---

## 3. Validate Boards (Deterministic)

### APIs

Greenhouse:

```text
https://boards-api.greenhouse.io/v1/boards/{token}
```

Lever:

```text
https://api.lever.co/v0/postings/{token}?mode=json
```

Ashby:

```text
https://api.ashbyhq.com/posting-api/job-board/{token}
```

If validation fails → discard

---

## 4. Dedup Against DB

### Board-level (Primary Key)

```text
source + boardToken
```

### Company-level

* normalized name
* normalized domain

Rules:

* same board → skip
* same company + no new board → skip
* same company + new board → keep

---

## 5. Stage (Mandatory)

All validated, non-duplicate boards:

```text
→ CandidateBoard (staging)
```

Hard rule:

```text
Nothing goes to SourceBoard directly
```

---

## 6. Derive Company Identity

From ATS payload:

* company name
* domain (if available)
* board linkage

---

## 7. Ingest Jobs

Only after:

* validation
* dedup
* staging

---

# 🧩 Company-First Strategy (Fallback Only)

Use only when:

* strong company leads exist
* validating specific companies

## Flow

```text
Company → Careers Page → Detect ATS → Validate → Stage
```

If no ATS evidence → mark unsupported

---

# ⚠️ Explicit Board State Model

```text
DISCOVERED
  ↓
VALIDATED
  ↓
DEDUPED
  ↓
STAGED (CandidateBoard)
  ↓
ACTIVE (SourceBoard)
```

---

## Board Types

### 1. Direct ATS Evidence (High Confidence)

* Found via ATS-hosted URLs
* Immediately validatable

### 2. Inferred Candidates (Lower Confidence)

* Found via company pages
* Require validation

---

# ⚠️ Critical Constraints & Decisions

## 1. No Direct Inserts

```text
All discoveries → staging first
```

---

## 2. No Early Token Probing

Token probing is:

* noisy
* risky
* rate-limit prone

### Allowed Order

```text
1. Search discovery
2. Crawl expansion
3. (Optional later) conservative probing
```

---

## 3. Dedup is Mandatory

At minimum:

```text
No duplicate (source + boardToken)
No duplicate company unless new board adds value
```

---

# 🚀 Discovery Strategy (Production-Ready)

## Primary

```text
- Search-based ATS URL discovery
- Crawl expansion:
    - sitemaps
    - internal links
```

## Secondary

```text
- Company-first fallback
```

## Deferred

```text
- Token probing (advanced only)
```

---

# 🔧 Required System Enhancements

## 1. Company Identity Resolution

```text
CompanyIdentity:
  - canonical_name
  - normalized_name
  - domains[]
  - board_tokens[]
```

Matching methods:

* fuzzy name matching
* domain matching
* board linkage

---

## 2. Board Lifecycle Tracking

Track:

```text
last_seen_at
last_job_count
status: active | inactive | dead
```

---

## 3. Validation Layer Controls

Must include:

```text
- rate limiting per ATS
- retry logic
- caching failed tokens
```

---

## 4. Prioritization Layer

Score boards by:

* job volume
* freshness
* relevance (product / engineering / design / QA)

---

# 🧩 Final Architecture

```text
[Discovery Layer]
    ↓
[Board Candidate Pool]
    ↓
[ATS Validation Layer]
    ↓
[Dedup + Identity Resolution]
    ↓
[CandidateBoard (Staging)]
    ↓
[SourceBoard (Active)]
    ↓
[Job Ingestion Pipeline]
    ↓
[Company Enrichment Layer]
```

---

# 👍 Why This Works

* Deterministic (board-first)
* Scalable (ATS APIs)
* Low-noise discovery
* Clean dedup boundaries
* Supports future enrichment

---

# 👎 What We Avoid

* Generic scraping
* Company guessing
* Early brute-force probing
* Direct DB pollution
* Unvalidated data ingestion

---

# 🧠 Final Verdict

This architecture is:

* ✅ Correct
* ✅ Scalable
* ✅ Production-ready with enhancements

---

# 💡 Key Takeaway

```text
Board-first is the foundation.
Everything else is optimization.
```

---

# 🚀 Future Expansion (Post-MVP)

* Controlled token probing
* ATS coverage expansion (Workday, SmartRecruiters, etc.)
* Graph-based company-board relationships
* Job relevance ranking

---
