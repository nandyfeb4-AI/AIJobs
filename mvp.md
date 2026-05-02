# MVP Definition

**Document type:** Minimum Viable Product Scope  
**Last updated:** 2026-05-01  
**Status:** Draft v2.0  
**Reference:** See `vision.md`, `source-strategy.md`, `AGENTS.md`, and `research/ats-source-prioritization.md`

---

## MVP Goal

Prove that US-based immigrants and high-urgency job seekers can use AIJobs to find relevant jobs faster, tailor stronger applications, apply with less friction, and track outcomes in one place.

The MVP is not just a job board and not just a resume tool. The value is the full loop:

```
profile -> relevant fresh jobs -> tailored resume -> apply/autofill -> tracker -> outcome learning
```

## MVP Success Criteria

The MVP is successful when:

- 100 active users complete the full application loop.
- Users receive relevant daily job recommendations from a trusted inventory.
- Average interview rate is meaningfully above baseline, target >= 20%, stretch >= 25%.
- At least 40% of users return within 7 days.
- Users can apply to jobs with less manual effort than existing job boards.

## Inventory Goal

For MVP launch readiness, target `100k-150k` relevant jobs.

This does not mean any 100k jobs. The inventory must be:

- US or Remote-US
- fresh enough to apply to
- relevant to tech and business-tech roles
- deduped across sources
- categorized well enough to filter and match
- connected to a usable apply URL

Inventory quality is part of the MVP. A large stale database is not success.

## Target User

Primary launch audience:

- immigrants already in the US
- candidates with work urgency
- H-1B, H-4 EAD, L-2 EAD/L-2S, F-1 OPT/STEM OPT, GC, citizens, and similar work-authorized candidates
- tech and IT-adjacent professionals who need more application throughput and better targeting

The product should eventually support visa-friendliness signals, but MVP should first make the job inventory, matching, application flow, and tracker work.

## Target Role Scope

Do not overfit only to `software engineer`, `product manager`, and `data engineer`.

MVP role inventory should cover:

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

## Non-Negotiable Core Loop

Everything in the MVP should support this loop:

1. User creates a profile.
2. System recommends relevant jobs.
3. User selects a job.
4. System checks fit and resume gaps.
5. User tailors resume.
6. User applies manually or with autofill help.
7. Application is tracked.
8. Outcomes improve matching and prioritization.

If a feature does not support this loop, it belongs after MVP.

---

## MVP Pillars

### 1. Job Inventory and Source Health

**What it does:** Maintains a large enough pool of fresh, US/Remote-US, target-role jobs from direct ATS sources, selected feeds, and possibly a paid aggregator bridge.

**Why it matters:** Matching and alerts are only valuable if the underlying jobs are fresh, real, and relevant.

**In scope:**

- Direct ATS ingestion for existing sources:
  - Greenhouse
  - Lever
  - Ashby
  - SmartRecruiters
  - Recruitee
- Continue SmartRecruiters expansion because it is currently producing useful job volume.
- Pause Workable bulk sourcing unless rate-limit/yield issues are solved.
- Add source health analytics:
  - total jobs
  - jobs added per sync
  - source distribution
  - freshness buckets
  - role category distribution
  - location/country scope distribution
  - unknown/other counts
- Deduplicate jobs across all sources.
- Track `firstSeenAt`, `lastSeenAt`, `postedAt`, and source metadata where possible.

**Next source work:**

1. JSON-LD `JobPosting` universal crawler.
2. Public-feed ATS bundle:
   - JazzHR
   - BambooHR
   - Pinpoint
   - JobScore
   - Breezy
   - Teamtailor
3. Evaluate one commercial bridge such as JSearch/RapidAPI or Fantastic.jobs for temporary volume.
4. Start design/research for enterprise connectors:
   - Workday CXS
   - iCIMS
   - SuccessFactors
   - Oracle Cloud HCM/Taleo

**Out of scope for MVP:**

- LinkedIn or Indeed direct crawling.
- Trying to support every ATS from Teal.
- Counting non-US or stale jobs as inventory wins.
- Fully automated web scraping of fragile career pages without source health monitoring.

### 2. Profile and Preference Capture

**What it does:** Builds a structured job-search profile from resume upload and onboarding questions.

**Why it matters:** Matching quality depends on understanding the user, not just the job.

**In scope:**

- Resume upload and parsing.
- Profile review/edit screen.
- Target roles.
- Work authorization and sponsorship preferences.
- Location and remote/hybrid/on-site preference.
- Seniority.
- Skills.
- Experience summary.
- Equal employment / voluntary demographic details only where the user explicitly provides them for autofill.

**Out of scope for MVP:**

- Video profile.
- Personality tests.
- Deep skills assessments.

### 3. Job Matching Feed

**What it does:** Shows users a focused list of jobs that match their profile, preferences, and urgency.

**Why it matters:** Users do not need another place to browse thousands of jobs. They need a high-confidence shortlist.

**In scope:**

- Daily recommended jobs.
- Match score and plain-language match reason.
- Filters for role, location, remote mode, seniority, freshness, and source.
- Save, skip, and apply actions.
- Freshness filter:
  - past 24 hours
  - past 3 days
  - past week
  - past month
- Early-applicant signal where source data supports it.

**Out of scope for MVP:**

- Perfect company ranking.
- Full ghost-job detection.
- Social/networking intelligence.

### 4. Resume Checker and Tailoring

**What it does:** Checks the user's resume against a selected job and generates a tailored version the user can review.

**Why it matters:** This is one of the main conversion levers. A tailored resume should improve response rate more than generic mass apply.

**In scope:**

- ATS-style resume score.
- Gap analysis against job description.
- Keyword and skills alignment.
- Tailored resume generation.
- Diff view explaining what changed.
- Editable tailored resume.
- Download/export.
- Store a tailored resume per job/application.

**Out of scope for MVP:**

- Cover letter generation.
- LinkedIn profile rewriting.
- Fully autonomous resume changes without review.

### 5. Chrome Extension Autofill

**What it does:** Helps the user apply on external ATS/company job forms by filling known profile details.

**Why it matters:** Autofill is the main lever for reducing application friction. This can become a major differentiator even before full auto-apply.

**In scope:**

- Chrome extension local/dev install.
- User profile fields available to extension.
- Autofill for common form inputs:
  - name
  - email
  - phone
  - address
  - LinkedIn
  - resume upload where technically feasible
  - work authorization questions
  - sponsorship questions
  - voluntary equal employment fields when user opts in
- Add job to portal from current job page.
- ATS-specific mapping where needed, but with a generic fallback for direct career sites.

**Out of scope for MVP:**

- Full hands-free auto-submit.
- Automated CAPTCHA bypass.
- Cover letter generation inside extension.
- Complex multi-page application automation without user review.

### 6. Application Tracker

**What it does:** Tracks every saved/applied job and helps the user understand their pipeline.

**Why it matters:** Users lose track when applying across many ATS systems. The tracker makes the workflow sticky and measurable.

**In scope:**

- Saved -> Applied -> Screening -> Interview -> Offer -> Rejected stages.
- Manual add/edit.
- Auto-create application when applying through AIJobs.
- Notes.
- Resume version associated with each application.
- Basic source/outcome metrics.

**Out of scope for MVP:**

- Full CRM-style networking tracker.
- Recruiter relationship graph.

### 7. Gmail Sync

**What it does:** Reads job-search emails to update application status and detect responses.

**Why it matters:** Manual trackers fail because users do not update them. Gmail sync can make the tracker automatic enough to be useful.

**In scope:**

- Google OAuth with read-only Gmail scope.
- Detect:
  - application confirmations
  - recruiter replies
  - interview invites
  - rejection emails
- Update tracker where a match can be found.
- User-visible privacy controls.

**Out of scope for MVP:**

- Email composition.
- Full inbox UI.
- Outlook/Microsoft sync.

### 8. User Analytics

**What it does:** Shows the user whether their job search is improving.

**Why it matters:** Outcome visibility is the proof that AIJobs works.

**In scope:**

- Applications sent.
- Response rate.
- Interview rate.
- Applications by stage.
- Source performance.
- Match score vs. outcome.
- Resume score trend.

**Out of scope for MVP:**

- Cohort analytics.
- Team dashboards.
- Export-heavy reporting.

---

## Internal Admin / Supply Analytics

This is not user-facing MVP polish, but it is required to operate the product.

Admin/source analytics should show:

- total active jobs
- total active boards/sources
- jobs added per sync
- sync freshness by board/source
- posted-date freshness buckets
- location scope distribution
- role category distribution
- source distribution
- top companies by active jobs
- duplicate counts
- unknown/other classification counts

Any ingestion change that increases volume should be judged against these metrics.

---

## Current Next Steps

The current next work should be:

1. **Tighten data quality and analytics**
   Add/verify `countryScope`, `locationType`, `roleCategory`, freshness buckets, and unknown/other counts.

2. **Continue SmartRecruiters expansion**
   Use exclusion-aware research batches and validate through the app.

3. **Fix non-US leakage**
   Recent SmartRecruiters jobs showed France/non-US locations in analytics. Before scaling further, verify location filtering and normalization.

4. **Build JSON-LD universal crawler**
   This is the best reusable fallback for company career pages and custom sources.

5. **Add quick public-feed ATS adapters**
   Start with JazzHR, BambooHR, Pinpoint, JobScore, Breezy, and Teamtailor.

6. **Evaluate a paid aggregator bridge**
   Test one source for quick MVP volume, but keep it separate and deduped.

7. **Start core workflow implementation in parallel**
   Profile, resume tailoring, tracker, and Chrome autofill should not wait until inventory is perfect.

---

## Explicitly Out Of Scope For MVP

| Feature | Why |
| --- | --- |
| LinkedIn/Indeed direct crawling | Legal/TOS and blocking risk. |
| Fully autonomous auto-apply | Too risky before quality gates and user trust are proven. |
| Cover letter generation | Useful, but resume tailoring and autofill matter more first. |
| Interview coaching | Valuable later, not needed to prove the core application loop. |
| Mobile app | Web + Chrome extension first. |
| Outlook sync | Gmail first. |
| Recruiter/employer product | Different product. |
| Full enterprise ATS coverage | Start with selected high-yield connectors. |
| Ghost job detection | Phase 2 after freshness and source quality are stable. |
| Payment/subscription | Prove usage and outcomes first. |

---

## Technical Principles

- Prefer direct ATS APIs/feeds and structured data over brittle scraping.
- Use paid aggregators only as bridge inventory, not the long-term moat.
- Normalize every job into a consistent internal schema.
- Deduplicate before showing jobs to users.
- Store both source-native IDs and unified fingerprints.
- Keep user-facing matching explainable.
- Do not hide data quality problems behind aggregate job counts.

## Definition Of Done For MVP

- [ ] User can onboard and create a structured profile.
- [ ] User sees at least 8 relevant job matches on first login.
- [ ] Job feed supports freshness and location filters.
- [ ] Job inventory has source/freshness/category analytics.
- [ ] Resume checker identifies gaps against a selected job.
- [ ] Tailored resume can be generated, reviewed, edited, and downloaded.
- [ ] Chrome extension can add a job to AIJobs and autofill common application fields.
- [ ] Application tracker records saved/applied jobs and stages.
- [ ] Gmail sync updates tracker for common email signals.
- [ ] Dashboard shows applications, response rate, and interview rate.
- [ ] 10 beta users complete the full loop and provide feedback.
- [ ] 100 active users complete the full loop during MVP validation.

---

This document is a working reference. Update it when the strategy changes, especially around source quality, application workflow, and user outcome learning.
