# Candidate Sourcing Follow-Ups

This note captures a known long-term issue in the current automated candidate-company sourcing flow.

## Problem

Right now the sourcing flow can ask the LLM for `N` companies and then deduplicate only after the response is returned.

Example:

- request `25`
- model returns `25`
- backend filters against:
  - duplicates within the response
  - existing `CandidateCompany`
  - existing `SourceBoard`
- if `5` are duplicates, only `20` survive

This is acceptable for an early version, but it becomes inefficient as the database grows.

Long-term failure mode:

- request `100`
- model returns `100`
- all `100` are already known or recently sourced
- backend drops all of them
- result is `0` new companies even though the model call was already spent

## Why This Matters

As the known-company registry grows, post-filtering alone becomes wasteful:

- repeated model spend on already-known companies
- more duplicate-heavy outputs for broad prompts like `top companies`
- weaker scaling when we try to expand toward hundreds of companies/boards

## Current Safe Behavior

The current behavior should remain:

1. source candidate companies
2. normalize the result
3. deterministically deduplicate against DB state
4. insert only genuinely new companies

This keeps correctness high even if efficiency is not optimal yet.

## Follow-Up Improvements

### 1. Small Avoid Lists In Prompt

Before sourcing, pass only a compact exclusion list to the LLM:

- most recently sourced companies
- most obvious already-known companies in the requested tier/category
- heavily covered company domains

Important:
- do not pass the full DB
- keep this short and targeted

### 2. Segment Sourcing Prompts

Avoid broad prompts like:

- `give me 100 top companies`

Prefer slices such as:

- top AI companies
- top developer tools companies
- top fintech/product companies
- top design-forward SaaS companies

This reduces repeated obvious results.

### 3. Track Sourcing History

Persist sourcing metadata such as:

- company was suggested before
- prompt/tier/focus area used
- last sourced timestamp

This allows future calls to exclude recently suggested companies.

### 4. Backfill Only The Shortfall

If `25` were requested and only `14` survive deduplication:

- run another sourcing call only for the missing `11`
- use an updated avoid list

### 5. Search-First, LLM-Second

Longer term, a better architecture is:

1. collect raw candidates from search/scraping
2. deduplicate them deterministically against DB/history
3. use the LLM only for ranking/structuring the remaining candidates

This is likely the most scalable path.

## Recommended Direction

Short term:

- keep deterministic DB dedup
- add better visibility into how many candidates were dropped

Next:

- add compact avoid lists
- add sourcing history
- add shortfall backfill

Later:

- move toward search-first candidate collection and LLM-assisted ranking/structuring
