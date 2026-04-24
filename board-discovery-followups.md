# Board Discovery Follow-Ups

This note captures the next improvements for ATS board discovery and verification so we can revisit them after the current MVP iteration.

## Current State

The current flow is good enough for MVP exploration:

- seed known boards in `apps/api/src/jobs/board-catalog.ts`
- expand via target companies in `apps/api/src/jobs/target-company-catalog.ts`
- discover ATS board candidates by scanning career/homepage HTML in `apps/api/src/jobs/board-discovery.ts`
- insert discovered boards as `unverified`
- verify them later through the existing ingest queue

This is a sensible first version, but it is still fairly heuristic and will miss or misclassify some cases.

## Follow-Up Improvements

### 1. Add discovery evidence and confidence scoring

Store more context for every discovered board:

- which URL produced the match
- which ATS pattern matched
- whether the match came from a canonical careers page, redirect, script blob, or generic page
- a confidence score such as `high`, `medium`, `low`

Why:

- helps us trust some discoveries more than others
- makes the UI more explainable
- gives us better debugging when false positives show up

### 2. Improve verification result classification

Right now verification mostly collapses into `working`, `empty`, or `failed`.

Later we should distinguish cases like:

- valid board but zero target roles
- board exists but returns no jobs
- invalid token / moved ATS
- blocked / rate limited
- temporary network failure
- suspected migration to another ATS

Why:

- better automation
- better operator visibility
- easier follow-up decisions

### 3. Add direct ATS probing beyond regex-on-HTML discovery

Current discovery is mostly regex matching on fetched page content. We should later add selective ATS endpoint probing where appropriate.

Examples:

- try likely Greenhouse, Lever, or Ashby board endpoints from company metadata
- validate candidate slugs directly when we have a strong hypothesis

Why:

- catches boards hidden behind sparse or JS-heavy pages
- reduces dependence on homepage HTML structure

### 4. Expand discovery inputs

Right now we only check a small set of likely career URLs.

Later we should consider:

- following obvious careers links from the homepage
- checking sitemap entries when available
- probing additional likely career subpaths

Why:

- some companies bury jobs behind nonstandard career paths
- improves discovery recall without requiring a full crawler

### 5. Add migration-aware logic

When a known board repeatedly fails, the system should do more than mark it failed.

Later behavior:

- detect repeated failures on a tracked board
- automatically trigger rediscovery for that company
- suggest likely platform migration in the UI

Why:

- ATS migrations are common
- prevents stale seeds from silently decaying

### 6. Make role filtering more robust

Current target-role filtering in `packages/utils/src/job-ingestion.ts` is a reasonable MVP regex layer, but it is still brittle.

Later we should improve it with:

- stronger taxonomy mapping
- department/title combination rules
- maybe lightweight AI-assisted classification if needed

Why:

- better relevance
- fewer false positives and false negatives

## Recommended Build Order

When we return to this, the suggested order is:

1. discovery evidence + confidence scoring
2. verification outcome classification
3. migration-aware rediscovery
4. expanded discovery inputs
5. selective direct ATS probing
6. stronger role classification

## Summary

For now, the current logic is acceptable for MVP discovery and internal tooling.

For broader, more reliable ATS board expansion, the next major goal is to make discovery:

- more explainable
- more confidence-aware
- more resilient to ATS migrations
- better at distinguishing failure modes
