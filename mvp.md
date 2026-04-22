# MVP Definition
**Document type:** Minimum Viable Product Scope  
**Last updated:** April 22, 2026  
**Status:** Draft v1.0  
**Reference:** See vision.md for full product context

---

## MVP Goal

Prove that users who go through our full loop — profile extraction → job matching → ATS checking and resume tailoring → application tracking — get a meaningfully higher interview rate than the industry average.

The MVP is not about scale. It is about proving the core loop works and that users find it valuable enough to come back and recommend it.

**MVP success condition:** 100 active users complete the full loop. Average interview rate ≥ 25%. At least 40% return within 7 days without prompting.

---

## The Core Loop (Non-Negotiable)

Everything in the MVP exists to close this loop:

```
1. User onboards → profile extracted
          ↓
2. AI matches user to relevant jobs
          ↓
3. User selects a match → resume checked, edited, and auto-tailored
          ↓
4. User reviews & applies individually or in a quality-gated batch
          ↓
5. Tracker auto-updates (via Gmail sync)
          ↓
6. Outcome recorded → feeds back into matching
```

If a feature does not serve one of these six steps, it is not in the MVP.

---

## MVP Features (In Scope)

### 1. Onboarding & Profile Extraction

**What it does:** Extracts the user's professional profile from their CV/resume upload and/or LinkedIn URL. Structures their skills, experience, role preferences, location, salary expectations, and work style.

**Why it matters:** This is the foundation of matching quality. The richer the profile, the better the matches.

**Specifics:**
- Upload resume (PDF or DOCX) → AI parses and structures it
- Optional: paste LinkedIn URL for supplementary extraction
- Short follow-up questions for things the resume can't tell us: target roles, preferred industries, must-have/nice-to-have filters, salary floor, remote/hybrid/on-site preference
- Profile review screen where user can correct or supplement AI-extracted data
- Profile completeness indicator (nudges users to fill gaps that affect match quality)

**Out of scope for MVP:** Video profile, skills assessments, personality/work style quizzes.

---

### 2. AI Job Matching Feed

**What it does:** Shows the user a curated daily shortlist of 8–15 job matches based on their profile. Each match includes a score and plain-language explanation of why it was suggested.

**Why it matters:** This is the core value delivery — the moment users see "these are your jobs" instead of browsing 10,000 listings.

**Specifics:**
- Aggregate jobs from at least 3 major sources (LinkedIn, Indeed, and one specialist board for target verticals)
- Deduplicate and normalise listings into a consistent format
- Semantic matching engine: goes beyond keyword matching to understand role context, seniority fit, skills adjacency
- Each job card shows: title, company, location, salary range (if listed), remote/hybrid/on-site, match score (%), match reason ("Matched on: React, API design, startup experience")
- User can save, skip, apply individually, or add jobs to a batch-apply queue
- Daily email digest of new top matches (simple, not spammy)
- Preference filters: role type, location, salary range, company size, remote preference

**Out of scope for MVP:** Real-time job alerts, mobile push notifications, ghost job detection, company credibility scoring.

---

### 3. Per-Role Resume Tailoring

**What it does:** When a user selects a job to apply to, the AI checks their resume against the role, generates a tailored version optimised for that specific role and its ATS expectations, and lets the user edit before submission.

**Why it matters:** One generic resume sent to 50 jobs converts worse than 10 tailored resumes. This is the output quality differentiator.

**Specifics:**
- One-click tailoring from any job card in the feed
- Built-in ATS checker on the user's base resume and each tailored version
- AI rewrites bullet points to incorporate role-relevant keywords naturally (no keyword stuffing)
- Diff view: shows exactly what changed vs. the user's base resume and why ("Added 'cross-functional stakeholder management' — appears 3 times in job description")
- ATS score shown before and after tailoring (0–100, with breakdown: keywords, formatting, action verbs, quantified impact)
- In-product resume editor with role-aware suggestions before downloading/applying
- Multiple tailored versions stored — one per job applied to
- PDF download of tailored resume

**Out of scope for MVP:** Cover letter generation (Phase 2), ATS system detection by employer ATS vendor (Phase 2), LinkedIn profile tailoring.

---

### 4. Quality-Gated Apply Flow

**What it does:** Lets users choose how to execute applications: one by one for higher control, or in a guided batch for higher speed.

**Why it matters:** Some users want precision, some need throughput. The product should support both without falling into low-quality automation.

**Specifics:**
- Two modes: `Review each` and `Batch apply qualified jobs`
- Batch apply is only available for jobs above a configurable match threshold and minimum ATS score
- User selects which resume version or tailoring strategy to use for the batch
- Before submission, user sees a queue summary with match score, ATS score, and missing requirements
- Every batch-applied job still creates its own tracker record and stored resume version
- Outcome analytics compare individually reviewed applications vs. batch-applied applications

**Out of scope for MVP:** Fully hands-free autopilot mode with zero review, LinkedIn/Indeed direct one-click mass submission across every source, recruiter outreach automation.

---

### 5. Application Tracker

**What it does:** A Kanban-style pipeline that tracks every application the user sends, automatically updated where possible via Gmail sync.

**Why it matters:** Users currently lose track of where they've applied. An auto-updating tracker removes the cognitive burden and surfaces follow-up opportunities.

**Specifics:**
- Pipeline stages: Saved → Applied → Screening → Interview → Offer → Rejected
- Auto-create a card when user applies through the platform
- Manual add for applications made outside the platform
- Gmail sync (OAuth): detects recruiter replies, interview invites, and rejections → auto-updates card stage
- In-app nudges: "No response from Stripe in 14 days — follow up?" 
- Basic notes field on each card
- Colour-coded status indicators

**Out of scope for MVP:** Full email composition from tracker, networking/contact tracker, calendar integration (Phase 2).

---

### 6. Gmail Integration (Sync Only)

**What it does:** Reads the user's job-related inbox to auto-update the application tracker and surface important signals.

**Why it matters:** Manual tracker updating is the reason trackers don't get used. Auto-sync makes the tracker genuinely useful without the user having to think about it.

**Specifics:**
- Google OAuth connection (explicit, user-initiated)
- Scoped read-only access to inbox
- Detection of: recruiter replies, interview invitations, rejection emails, application confirmations
- Auto-update corresponding tracker card when email detected
- In-app notification: "We detected a reply from Stripe and updated your tracker"
- Privacy controls: user can disconnect at any time, view what we've read, clear synced data
- Optional: offer to help user set up a dedicated job-search email address for cleaner sync

**Out of scope for MVP:** Outlook/Microsoft integration (Phase 2), composing emails from the platform, full inbox display.

---

### 7. Basic Analytics Dashboard

**What it does:** Shows the user a simple view of their job search performance — not vanity metrics, but metrics that tell them if they're on track.

**Why it matters:** Users need to know their interview rate. It's our north star metric and it's the number that proves the product is working.

**Specifics:**
- Interview rate (applications sent vs. interviews secured)
- Comparison to industry average (contextualises their performance)
- Applications by stage (pipeline overview)
- Interview rate by apply mode (reviewed vs. batch-applied)
- Response rate by job source (which boards are working for them)
- Weekly activity summary
- ATS score trend over time (is their resume getting stronger?)

**Out of scope for MVP:** Detailed funnel analytics, export to CSV, cohort analysis.

---

## Out of Scope for MVP (Explicitly)

These are Phase 2 or later. Do not be tempted to build them for MVP — they will dilute focus and delay learning.

| Feature | Why it's out of scope |
|---|---|
| Cover letter generation | Valuable but not core to the loop; Phase 2 |
| Interview prep / mock interviews | Post-match; Phase 2 after proving match quality |
| Networking / recruiter outreach | Complex; Phase 2 |
| LinkedIn profile optimisation | Adjacent; Phase 2 |
| Mobile app | Build web first; mobile Phase 2 |
| Outlook/Microsoft integration | Gmail first; Phase 2 |
| Employer / recruiter tools | Different product entirely |
| Job posting (own job board) | Aggregation is faster to validate |
| Payments / premium tier | Free during MVP; monetise after PMF |
| Team / referral features | Phase 3 |
| ATS system detection by vendor | Valuable but complex; Phase 2 |

---

## Tech Considerations

These are decisions to make early because they're expensive to reverse.

**Matching engine:** Start with a semantic embedding model (OpenAI embeddings or open-source equivalent like sentence-transformers) to match user profiles against job descriptions. Do not start with keyword matching — it's what every competitor does and it produces poor results.

**Job aggregation:** Use a third-party job data API (e.g., Adzuna, JSearch via RapidAPI, or The Muse) for initial job sourcing rather than building scrapers. Scrapers are brittle and expensive to maintain. Switch to direct sourcing once you have volume and know which sources convert best.

**Resume parsing:** Use an established resume parsing library or API (Affinda, Sovren, or similar) for initial profile extraction. Do not build a custom parser for MVP — it's a solved problem and parsing edge cases will consume disproportionate engineering time.

**Gmail OAuth:** Use Google's official OAuth2 flow with read-only Gmail scope (`gmail.readonly`). Be explicit in the OAuth consent screen about what you read and why. Do not request more permissions than you need.

**Resume storage:** Store both the user's base resume and each tailored version. Design the data model to support multiple resume versions per user from day one — retrofitting this is painful.

**AI tailoring:** GPT-4o or Claude Sonnet for resume bullet rewriting. Keep prompts modular — one prompt for keyword extraction, one for ATS scoring/gap detection, one for rewriting, one for the diff explanation. This makes it easier to improve each step independently.

**Apply automation:** Start with guided batch apply, not blind full automation. The system should enforce thresholds for match quality and ATS score before a role becomes eligible for batch submission.

**Infrastructure:** Start simple. A monolith is fine for MVP. Optimise for speed of iteration, not scalability. You can split services when you have real load.

---

## Phased Roadmap

### Phase 1 — MVP (Now → Month 3)
The core loop. Prove it works.
- Onboarding + profile extraction
- Job matching feed (3 sources, semantic matching)
- Per-role resume tailoring with diff view and built-in ATS checker
- Guided batch apply with quality gates
- Application tracker with Gmail sync
- Basic analytics dashboard (interview rate)
- Web app only

**Exit criteria:** 100 users complete the full loop. Interview rate ≥ 25%. 40%+ 7-day retention.

---

### Phase 2 — Deepen (Month 4 → Month 8)
Make the loop stronger. Add the obvious next-step features users ask for.
- Cover letter generation (per role, tailored)
- ATS system detection (identify which ATS a company uses)
- Interview prep module (role-specific questions, company research)
- Calendar integration (auto-log interview slots from Gmail)
- Outlook/Microsoft inbox sync
- LinkedIn profile optimisation
- Mobile-responsive web (not native app yet)
- Dedicated job email provisioning
- Freemium pricing launch

**Exit criteria:** 1,000 active paying users. Interview rate holds at 25%+ at scale.

---

### Phase 3 — Scale (Month 9 → Month 18)
Grow and extend.
- Precision auto-apply and broader bulk apply automation (gated: only fires on high-match + ATS-ready tailored resumes)
- Networking intelligence (alumni and recruiter suggestions at target companies)
- Vertical depth (software engineering specialisation first)
- Native mobile app (iOS first)
- Referral / sharing features
- Advanced analytics (cohort analysis, source attribution)
- API / integrations for career coaches and bootcamps (B2B seed)

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Job data quality is poor (stale, duplicate, ghost jobs) | High | High | Use established job data APIs with freshness filters; add ghost job detection in Phase 2 |
| Gmail OAuth trust barrier — users won't connect inbox | Medium | High | Make it optional; show clear value before asking; offer dedicated job email alternative |
| AI tailoring produces generic or inaccurate output | Medium | High | Human review during beta; show diff view so user catches errors; iterate on prompts |
| Batch apply lowers quality if thresholds are too loose | Medium | High | Require fit and ATS minimums; default to review-first; track interview rate by apply mode |
| Match quality is low — users don't find matches relevant | Medium | High | Over-invest in profile extraction depth during onboarding; measure match acceptance rate from day one |
| LinkedIn / Indeed block job scraping or API access | Medium | Medium | Use licensed job data APIs from the start; don't rely on scraping |
| Competitor (Jobright) improves tailoring depth | Low | High | Move fast; launch MVP before they close the gap; build outcome feedback loop as a moat |
| EU AI Act compliance for automated matching | Low | Medium | Include match reasoning/explainability from day one; document matching logic |

---

## Definition of Done (MVP)

The MVP is complete when:

- [ ] A new user can sign up, upload a resume, and have a profile extracted in under 5 minutes
- [ ] The user sees a curated feed of ≥ 8 relevant job matches on first login
- [ ] The user can generate a tailored resume for any match in one click, see what changed, edit it, and download it
- [ ] The ATS checker shows a before/after score with actionable fixes on the base and tailored resume
- [ ] The user can submit applications individually or via a quality-gated batch flow
- [ ] Every application is tracked automatically in the pipeline
- [ ] Gmail sync detects at least recruiter replies and interview invites and updates the tracker correctly
- [ ] The dashboard shows the user their interview rate vs. industry average
- [ ] 10 beta users have gone through the full loop and been interviewed for feedback
- [ ] Average interview rate across beta users is ≥ 20% (stretch: 25%)

---

*This document is a working reference. Update it as you learn. When a feature moves from "out of scope" to "in scope," document why — that decision history is valuable context for the team.*
