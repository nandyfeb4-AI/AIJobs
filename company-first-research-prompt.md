# Claude Research Prompt: Company-First ATS Sourcing

Use this prompt when asking Claude to research companies for AIJobs.

## Goal

Find companies in our target role categories that are likely to use one of these ATS systems:

- Greenhouse
- Lever
- Ashby

This is a **company-first research pass**, not a final truth pass.

The output should be a high-quality candidate company list for our staging pipeline.

## Context

We are building a job-ingestion pipeline that currently supports only:

- Greenhouse
- Lever
- Ashby

We care about companies hiring across these role families:

- product
- software engineering
- design
- QA

Examples inside those families:

- Product Manager, Product Owner, Technical PM
- Software Engineer, Backend Engineer, Frontend Engineer, Full Stack Engineer, Java Developer, Python Developer, SRE, DevOps
- Product Designer, UX Designer, UI Designer, Design Engineer
- QA Engineer, SDET, Test Automation Engineer

Important:

- We do **not** want a generic “top companies” list.
- We want companies that are both:
  - relevant to these role families
  - likely to use public Greenhouse, Lever, or Ashby job boards

Very large companies with heavily custom career systems are usually less useful unless there is clear evidence they still use one of the supported ATS platforms.

## What To Avoid

Do not include:

- companies with obviously custom-only careers systems unless you find strong evidence of Greenhouse, Lever, or Ashby usage
- universities
- staffing firms / agencies
- governments / public sector orgs
- companies with unclear or missing official websites
- obvious duplicates

## What To Prioritize

Prioritize:

- startups
- growth-stage SaaS companies
- AI companies
- devtools companies
- fintech companies
- product-led software companies
- design-forward software companies
- companies likely to have public hosted ATS boards

## Research Method

For each company, try to find:

1. official company homepage
2. official careers page
3. evidence that the careers experience likely uses one of:
   - Greenhouse
   - Lever
   - Ashby

Good evidence includes:

- careers links or redirects containing:
  - `job-boards.greenhouse.io`
  - `boards.greenhouse.io`
  - `jobs.lever.co`
  - `jobs.ashbyhq.com`
- clear hosted ATS board URLs
- page source or links that strongly indicate one of these providers

If the ATS evidence is weak or uncertain, include that uncertainty clearly.

## Desired Output Format

Return a markdown table with these columns:

| company | homepage | careers_url | likely_ats | evidence | target_categories | confidence | notes |

Definitions:

- `likely_ats`: one of `greenhouse`, `lever`, `ashby`, or `unknown`
- `evidence`: short explanation of what was found
- `target_categories`: choose from `product`, `software_engineering`, `design`, `qa`
- `confidence`: `high`, `medium`, or `low`

Then, after the table, provide:

1. `High-confidence candidates`
2. `Medium-confidence candidates`
3. `Rejected / not useful`

For rejected items, explain briefly why they are not useful for our current pipeline.

## Quantity Guidance

Start with 25 candidates per pass.

Prefer:

- 10 high-confidence candidates
- 10 medium-confidence candidates
- up to 5 lower-confidence edge cases only if they still look promising

Quality matters more than quantity.

## Example Ask

Research 25 companies likely to hire for product, software engineering, design, and QA roles and likely to use Greenhouse, Lever, or Ashby. Focus on startups, growth-stage SaaS, AI, devtools, fintech, and product-led software companies. Return the result in the requested markdown table format with evidence and confidence.
