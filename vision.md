# Product Vision
**Document type:** Vision & Strategy  
**Last updated:** April 22, 2026  
**Status:** Draft v1.0

---

## The Problem

Job seeking is broken — but not in the way most people think.

The problem isn't that job seekers apply to too few companies. It's that they apply to the wrong ones, with the wrong resume, and have no idea why they're not hearing back. The average job seeker today sends 50–200 applications and lands 1–2 interviews. They spend hours rewriting the same resume for every role, copying and pasting into forms, and manually tracking their progress in spreadsheets.

On the other side, over 90% of companies use Applicant Tracking Systems (ATS) to filter resumes before a human ever reads them. Most job seekers don't know what an ATS is, let alone how to write for one. So highly qualified people get filtered out before they ever get a chance.

The tools that exist today make things worse in different ways. ATS optimizers like Jobscan help you write better resumes but make you find jobs yourself. Auto-apply bots like LazyApply send hundreds of generic applications that recruiters ignore. Nobody has solved the full problem: **getting the right person in front of the right role, with a resume that converts.**

---

## The Vision

> **Help every job seeker get more interviews with fewer, smarter applications.**

We are building a precision-first AI job search platform. One that deeply understands who you are, matches you to roles that genuinely fit, tailors your resume for each one, checks ATS readiness before you apply, and works in the background — so every application you send has a real chance of getting a response.

For users who need speed as well as quality, the platform also supports controlled bulk apply. But bulk apply is an execution mode, not the product philosophy: we still gate by match quality, ATS readiness, and user control.

We believe job searching should feel less like sending messages into a void and more like being represented by someone who knows your work inside out. That's what we're building.

---

## Mission

To give every job seeker an unfair advantage — not by gaming the system, but by helping them present their best, most relevant self to the right opportunities.

---

## Target User

**Primary:** Active job seekers in knowledge-work roles (software engineers, product managers, designers, marketers, finance, operations) who are frustrated by low response rates and wasting time on applications that go nowhere.

**Secondary:** Passive job seekers who are open to the right opportunity but don't have time to actively search — they want to be matched, not to browse.

**Not our user (for now):** Blue-collar and shift-work job seekers (different ATS landscape), executive-level candidates (concierge market), and employers/recruiters (B2B is a separate product).

### User Profile (Primary)
- Has 2–10 years of experience
- Applying to 10–100 roles per month
- Frustrated by low or no responses despite being qualified
- Currently stitches together 3–5 tools: job boards, ATS checkers, resume builders, spreadsheet trackers
- Aware that ATS is a problem but doesn't know how to solve it
- Has a Gmail or Outlook account they use for job correspondence

---

## Positioning

**Category:** AI-powered job search platform  
**Differentiator:** Precision matching + ATS-safe per-role resume tailoring + optional guarded bulk apply in one closed loop  
**Value promise:** More interviews, fewer wasted applications  

### Positioning Statement
For job seekers who are tired of applying to hundreds of roles and hearing nothing back, [Product] is the AI job search platform that matches you to the right roles, tailors your resume to pass ATS filters, and lets you apply either precisely or in quality-gated batches. Unlike Jobscan or Teal — which make you find jobs yourself — and unlike LazyApply or Sonara — which blast generic applications — [Product] does the intelligent work: finding your matches, improving each resume, checking ATS readiness, and tracking every response automatically.

### What We Are Not
- We are not a blind mass auto-apply bot. We do not optimise for raw application volume at the expense of interview rate.
- We are not a standalone resume builder. Resume tailoring only has value in context of a matched job.
- We are not a job board. We aggregate and match from existing sources.
- We are not an employer tool. We are 100% on the job seeker's side.

---

## Core Principles

### 1. Precision over volume
Every feature we build should improve the interview rate, not just the application count. Bulk apply is acceptable only when it is quality-gated by fit, ATS readiness, and user intent.

### 2. The loop is the product
Profile extraction → job matching → resume tailoring → application tracking → outcome feedback. This full loop, closed and working well, is the product. Any feature that doesn't serve the loop is a distraction.

### 3. Ambient intelligence
The product should work in the background. Users shouldn't have to remember to update their tracker, check for new matches, or log a recruiter reply. We sync with Gmail, we detect status changes, we surface nudges at the right moment.

### 4. Transparency builds trust
When we match a job, we show why. When we tailor a resume, we show what changed and why. When an ATS score changes, we explain what to fix. When we batch-apply, we show what rules were used and which jobs qualified. Users who understand what the AI is doing trust it more and get better outcomes.

### 5. Emotional awareness
Job searching is stressful and often demoralising. The product's tone, feedback, and design should reduce anxiety — not amplify it. We celebrate progress. We frame problems as opportunities to improve. We never make users feel like they're failing.

### 6. Privacy by design
We access user data (inbox, profile, resume) only to serve them — never to train models on their private information without consent, never to sell data, never to share with employers. Users control what we can see at all times.

---

## North Star Metric

**Interview rate:** The percentage of applications sent through our platform that result in at least one interview.

Industry average interview rate: ~10–12%. Our goal is to consistently deliver 3× that — 30%+ — for active users who complete their profile and use our matching.

Secondary metrics that feed the north star:
- Profile completeness score at onboarding
- Match acceptance rate (how often users apply to suggested matches)
- Resume ATS score improvement over time
- Time to first interview from signup
- Retention at 30/60/90 days

---

## Competitive Differentiation

| What we do | No one else does this end-to-end |
|---|---|
| Extract user profile deeply (skills, tone, career trajectory) | Most tools ask you to fill a form |
| Match to jobs using semantic AI (not just keyword search) | Jobright does matching but shallow tailoring |
| Tailor resume per role with diff view + built-in ATS checker | Competitors split these into separate tools or shallow features |
| Resume editor with role-aware suggestions before submission | Most tools either rewrite or score, but don't provide an integrated edit loop |
| Auto-update tracker via Gmail sync | All trackers are manual today |
| Quality-gated bulk apply from a matched shortlist | Volume tools batch-apply without enough quality controls |
| Dedicated job email provisioning (optional) | No tool offers this |
| Report interview rate as the core metric | Competitors report application count |

---

## Long-Term Product Themes

These are not MVP features — they are directions the product grows into over time.

**Theme 1 — Deeper intelligence**  
As users get interviews and (eventually) offers, feed outcomes back into the matching model. The platform learns which types of roles, companies, and resume framings convert for each user profile. Over time, match quality improves per user.

**Theme 2 — Interview readiness**  
Once a user lands an interview, the product should help them prepare — company research, likely questions based on the role and their resume, mock interview coaching. A natural extension of the "get the interview" mission into "get the offer."

**Theme 3 — Networking intelligence**  
Suggest alumni, second-degree connections, and warm paths into target companies. Careerflow has a basic version of this; Jobright has "Insider Connections." The opportunity is to make this genuinely useful — not just "here's a list of people" but "here's who to reach out to and what to say."

**Theme 4 — Vertical depth**  
Build industry-specific matching intelligence for high-value verticals: software engineering (most technically complex ATS landscape), healthcare, finance. Vertical tools can out-compete horizontal ones by understanding role-specific signals.

**Theme 5 — Precision and bulk apply**  
Offer one-click submission for a user's curated shortlist and controlled bulk apply for users who want speed. This should never degrade into spray-and-pray automation: only verified high-match roles with ATS-ready resumes should qualify.

**Theme 6 — Mobile-first experience**  
Job seeking happens everywhere. A native mobile experience for match browsing, interview prep, and tracker updates is a long-term differentiator given every competitor's weak mobile presence.

---

## Market Context

- AI adoption across HR tasks: 43% in 2026 (up from 26% in 2024)
- 90%+ of companies use ATS to filter resumes
- 48% of companies already use AI in their screening process
- Field research shows AI-assisted resume users get hired 8% more often
- EU AI Act compliance for hiring automation tools now active (August 2026) — build explainability in from the start

---

## What Success Looks Like

**Year 1:** 10,000 active users. Average interview rate of 28%+. Clear product-market fit signal: users recommending to friends who are job seeking.

**Year 2:** 100,000 users. Interview rate consistently 3× industry average. Vertical depth in at least one industry (software engineering). Precision auto-apply in beta.

**Year 3:** Recognised as the go-to platform for quality-first job searching. Partnership discussions with career coaches, bootcamps, and universities. Exploring B2B angle (outplacement services, career transition programs).

---

*This document is a living reference. Revisit and update after every major user research round, significant competitor move, or product pivot.*
