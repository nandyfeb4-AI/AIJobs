# Technical Architecture
**Document type:** Engineering Architecture  
**Last updated:** April 22, 2026  
**Status:** Draft v1.0  
**References:** `vision.md`, `mvp.md`, `competitive-brief-ai-job-search.md`

---

## Objective

Define a technical architecture that is:
- fast to build and iterate on
- low-cost during early development
- managed where possible
- scalable for meaningful growth
- portable enough to migrate away from Supabase later if needed

This architecture is designed for the current product strategy:
- precision-first AI job platform
- optional quality-gated batch apply
- ATS checking and per-role resume tailoring
- tracker and Gmail sync

---

## Recommended Stack

### Frontend
- `Next.js`
- `TypeScript`
- `Tailwind CSS`
- `shadcn/ui`
- `TanStack Query`
- `React Hook Form`
- `Zod`

### Backend
- `NestJS`
- `TypeScript`
- `REST API`

### Hosting
- `Vercel` for frontend
- `Railway` for backend API
- `Railway` for worker services

### Database
- `Supabase Postgres`
- `pgvector` extension for semantic matching

### Authentication
- `Supabase Auth`

### File Storage
- `Amazon S3`

### Queue / Background Processing
- `Redis`
- `BullMQ`

### AI Providers
- `OpenAI` as primary provider
- `Anthropic` as optional fallback / comparison provider

### Observability
- `Sentry`
- `PostHog`
- Railway logs and metrics

### Notifications
- `Resend`

### Integrations
- `Gmail API`
- third-party job aggregation APIs

---

## Why This Stack

This stack is optimized for current priorities:
- minimum spend while building
- managed services to reduce operational overhead
- strong product velocity
- enough architectural discipline to scale later

It avoids two common mistakes:
- overbuilding early with microservices and AWS-heavy infra
- locking critical product logic into Supabase-specific runtimes

---

## Core Architecture Principles

### 1. Supabase is infrastructure, not the application brain
Supabase is used for:
- Postgres
- Auth

Supabase is not where core business logic lives.

### 2. All important backend logic lives in our backend service
The backend service on Railway owns:
- business rules
- AI orchestration
- ATS checking
- resume tailoring
- job matching orchestration
- application tracking rules
- Gmail sync processing
- queue and worker coordination
- integrations

### 3. S3 owns files
All uploaded and generated files live in S3:
- base resumes
- tailored resumes
- generated PDFs
- imports and exports

This keeps file storage portable and independent of Supabase.

### 4. Use a modular monolith, not microservices
We will use:
- one monorepo
- one primary backend codebase
- one worker app for async processing

We will not begin with multiple independently owned microservices.

### 5. Async for expensive work
Anything costly or slow should happen asynchronously:
- profile extraction
- ATS scoring
- resume tailoring
- job ingestion
- deduplication
- Gmail event processing
- analytics aggregation

### 6. Design for migration even if we never migrate
We are intentionally using managed services to move fast, but we should preserve portability wherever reasonable.

---

## Monorepo Structure

Recommended repository layout:

```text
apps/
  web/        -> Next.js frontend
  api/        -> NestJS API
  worker/     -> BullMQ workers / background jobs

packages/
  ui/         -> shared UI components
  types/      -> shared TypeScript types / contracts
  config/     -> shared tsconfig, eslint, env helpers
  utils/      -> shared utilities
```

Optional later packages:

```text
packages/
  sdk/        -> typed API client for frontend/internal use
  prompts/    -> prompt templates and prompt versioning helpers
  domain/     -> shared domain logic and schemas
```

---

## Deployment Topology

### Frontend
- Deployed on `Vercel`
- Handles UI, routing, session-aware pages, and frontend state

### API
- Deployed on `Railway`
- Owns app business logic and all external orchestration

### Worker
- Deployed as separate `Railway` service
- Consumes Redis/BullMQ jobs
- Performs async and long-running tasks

### Database
- `Supabase Postgres`
- source of truth for application data

### Auth
- `Supabase Auth`
- frontend obtains session, backend validates identity and enforces app authorization

### Storage
- `Amazon S3`
- backend generates signed upload/download URLs when needed

### Queue
- `Redis + BullMQ`
- used for async workloads and retries

---

## System Boundaries

### Frontend Responsibilities
- onboarding UI
- profile review screens
- job feed and filters
- resume editor and diff view
- tracker UI
- analytics dashboard
- auth session handling

### Backend API Responsibilities
- user/profile management
- job retrieval and filtering
- resume metadata and versioning
- ATS scoring orchestration
- AI prompt orchestration
- match explanation generation
- tracker updates
- batch-apply eligibility logic
- signed S3 URL generation
- Gmail webhook/event handling

### Worker Responsibilities
- parse resumes
- compute embeddings
- run ATS checks
- generate tailored resume variants
- generate diff explanations
- ingest and normalize jobs
- deduplicate listings
- sync inbox events to tracker updates
- aggregate analytics snapshots

---

## Domain Modules

The backend should be organized into clear modules, even inside one service:

- `auth`
- `users`
- `profiles`
- `jobs`
- `matching`
- `resumes`
- `ats`
- `applications`
- `tracker`
- `gmail-sync`
- `analytics`
- `ai`
- `files`
- `admin`

This keeps the modular monolith maintainable and gives us a path to extract services later only if truly needed.

---

## Data Model Overview

Primary relational domains:

- `users`
- `profiles`
- `resumes`
- `resume_versions`
- `jobs`
- `job_sources`
- `job_matches`
- `applications`
- `application_events`
- `tracker_cards`
- `gmail_connections`
- `gmail_events`
- `ats_scores`
- `tailoring_runs`
- `analytics_snapshots`

Suggested data shape principles:

- Keep base resume separate from tailored versions
- Store every AI run as an auditable record
- Store derived scores instead of recomputing every request
- Keep jobs normalized and deduplicated
- Track which apply mode was used: individual vs batch

---

## AI Architecture

### Provider Strategy
- `OpenAI` is the primary provider
- `Anthropic` is optional fallback / A/B provider

### Important Rule
Do not scatter model calls throughout the codebase.

All AI usage should go through one internal AI gateway owned by the backend.

### AI Tasks
- `profile_extraction`
- `ats_scoring`
- `resume_tailoring`
- `diff_explanation`
- `email_classification`
- `match_reasoning`

### AI Design Rules
- prompts versioned by task
- low temperature for scoring/classification tasks
- stronger models only for higher-value tasks like tailoring
- retries and timeouts centrally configured
- cost, latency, and prompt version logged per run
- cache outputs where practical

---

## Async Job Design

Use BullMQ queues for:

- `resume-parse`
- `embedding-generate`
- `ats-score`
- `resume-tailor`
- `diff-explain`
- `job-ingest`
- `job-dedupe`
- `gmail-sync`
- `analytics-rollup`

Queue design rules:

- jobs must be idempotent
- retries must be safe
- store job result metadata in the database
- dead-letter or failure tracking must be visible
- user-facing APIs should never wait on long AI pipelines if avoidable

---

## Performance and Latency Strategy

### Synchronous paths should stay fast
The following should feel responsive:
- login and onboarding screens
- feed load
- tracker load
- dashboard load
- profile edits

### Expensive work should be precomputed or async
- job embeddings
- match candidate generation
- ATS analysis
- tailoring
- analytics snapshots

### Recommended performance tactics
- cache hot job feed queries
- precompute match candidates
- persist ATS scores and explanations
- persist tailored resume artifacts
- avoid recomputing AI results unnecessarily
- paginate job and tracker queries carefully

---

## Scalability Strategy

### What should scale independently first
- web frontend
- backend API
- worker concurrency
- Postgres compute/storage
- Redis throughput

### Early scaling path
1. Increase Railway service size for API and worker
2. Add more worker concurrency
3. Tune Redis and queue throughput
4. Scale Supabase Postgres compute
5. Add read replicas later if needed

### Later scaling path
If usage grows materially, likely migrations or upgrades include:
- move from Supabase Postgres to AWS RDS Postgres
- move from simple feed queries to dedicated search infrastructure if necessary
- split ingestion-heavy workloads into a separate service only when justified

---

## Security and Privacy

### Data sensitivity
We will handle:
- resumes
- work history
- contact details
- inbox-derived job communications

### Requirements
- least-privilege API access
- signed S3 access for file operations
- secrets stored in managed secret environments
- no training on user private data without explicit consent
- auditability for AI-generated changes
- clear user controls for Gmail access and disconnect

---

## Managed Service Decisions

### Use Supabase for now because
- low operational burden
- managed Postgres
- managed Auth
- good speed for development

### Use S3 instead of Supabase Storage because
- better portability
- standard object storage model
- stronger long-term flexibility

### Use Railway because
- faster deployment than AWS-heavy setup
- simple service management
- enough flexibility for API + workers

---

## What We Are Explicitly Avoiding

- microservices from day one
- core logic in Supabase Edge Functions
- tightly coupling backend business logic to Supabase client SDK patterns
- blind AI calls scattered across feature modules
- a separate vector database before needed
- OpenSearch before query scale actually requires it
- heavy AWS operational complexity during MVP

---

## Migration Readiness Rules

If we want the option to migrate away from Supabase later, we must follow these rules:

1. Keep core logic in the Railway backend, not in Supabase functions
2. Own all schema migrations in the repo
3. Use standard Postgres features where possible
4. Keep auth access behind app-level abstractions where practical
5. Keep file storage on S3, not Supabase Storage
6. Do not encode critical product behavior in Supabase-only runtime features
7. Keep queueing and workers outside Supabase

If we follow these rules, future migration to `AWS RDS + S3 + another auth provider` becomes very manageable.

---

## MVP Build Guidance

### Build now
- monorepo
- Next.js frontend
- NestJS API
- separate worker process
- Supabase Postgres
- Supabase Auth
- S3
- Redis/BullMQ once async load needs it
- OpenAI integration through one AI gateway

### Add soon after
- Anthropic fallback support
- stronger analytics rollups
- queue observability
- admin tooling for failed jobs and AI review

### Add later only when justified
- dedicated search engine
- dedicated ingestion service
- service extraction
- deeper AWS-native infra

---

## Final Recommendation

Use a `monorepo` with a `modular monolith` backend and a separate worker app.

Recommended stack:
- Frontend: `Next.js` on `Vercel`
- Backend: `NestJS` on `Railway`
- Worker: `Railway`
- DB: `Supabase Postgres`
- Auth: `Supabase Auth`
- Storage: `Amazon S3`
- Queue: `Redis + BullMQ`
- AI: `OpenAI` primary, `Anthropic` optional fallback
- Observability: `Sentry + PostHog`

This gives the team:
- low initial spend
- fast iteration
- managed infrastructure
- portability later
- enough structure to scale responsibly

---

*This document should evolve as implementation begins. Update it when infrastructure choices change, when scaling assumptions break, or when a portability constraint is intentionally relaxed.*
