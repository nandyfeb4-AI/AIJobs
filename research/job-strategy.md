You’re describing the exact real bottleneck. The ATS APIs are clean once a board is known; the product moat is the discovery, validation, scoring, and refresh system around board identities. I’ll ground this in the ATS docs, then outline a practical discovery architecture that avoids garbage tokens.


You are exactly right: the real moat is not “call the ATS API.” The real moat is a board-discovery and board-quality system.

Greenhouse’s public API needs a board_token in endpoints like GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs, and the list endpoint returns jobs plus meta.total, title, location, absolute_url, updated_at, and optional full content when content=true is passed. Greenhouse Job Board API

Lever’s public postings API namespaces jobs under a unique SITE, usually the company name without spaces, and returns published job postings with fields such as id, text, categories, descriptionPlain, hostedUrl, applyUrl, workplaceType, and optional salary fields. Lever Postings API

Ashby’s public job API requires the organization’s Ashby jobs page name in GET https://api.ashbyhq.com/posting-api/job-board/{JOB_BOARD_NAME}, and Ashby says the board name is the final path segment of the hosted board URL, such as https://jobs.ashbyhq.com/Ashby → Ashby. Ashby Job Postings API

The right mental model
Think of the system as two products:

Board intelligence layer:
Find companies, discover ATS provider, extract candidate tokens, validate, score, refresh, and blacklist bad candidates.

Job ingestion layer:
Fetch jobs from validated boards, normalize them, dedupe them, classify them, and filter to US target roles.

Most people overbuild layer 2 and underbuild layer 1. Your point is correct: layer 1 is where the hard part is.

Recommended pipeline
1. Start from companies, not jobs
Do not primarily search for individual job posts first. Individual posting URLs are useful evidence, but they are noisy.

Better seed sources:

Seed type	Why it helps
Company domains	Lets you crawl /careers, /jobs, /company/careers, sitemap, footer links
Curated startup/company lists	Higher signal than web-wide search
Existing job URLs	Good for token inference once deduped
ATS-hosted URL search	Good for expansion, but needs strict validation
User-saved/imported jobs	High-intent source and useful for discovering long-tail boards
The key shift: a company-centric crawler can answer “what ATS does this employer use?” before trying to collect every posting.

2. Discover careers pages first
For each company domain, try:

text
https://company.com/careers
https://company.com/jobs
https://company.com/careers/jobs
https://company.com/about/careers
https://company.com/company/careers
https://company.com/join-us
https://company.com/work-with-us
Also parse:

text
/sitemap.xml
/robots.txt
homepage footer links
About page links
LinkedIn company website URL
Then classify the careers page by signals.

3. Use ATS fingerprints
Once you fetch a careers page, extract outbound links and scripts matching ATS patterns.

Good token-bearing patterns:

text
Greenhouse
boards.greenhouse.io/{token}
job-boards.greenhouse.io/{token}
job-boards.greenhouse.io/{token}/jobs/{jobId}
boards-api.greenhouse.io/v1/boards/{token}/jobs
boards.greenhouse.io/embed/job_board?for={token}

Lever
jobs.lever.co/{handle}
jobs.lever.co/{handle}/{postingId}
api.lever.co/v0/postings/{handle}

Ashby
jobs.ashbyhq.com/{boardName}
jobs.ashbyhq.com/{boardName}/{jobId}
api.ashbyhq.com/posting-api/job-board/{boardName}
Bad candidate tokens should be rejected before API validation:

text
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
4. Extract multiple candidates, not one
For each company, store all token candidates with evidence:

json
{
  "company_domain": "scale.com",
  "ats": "greenhouse",
  "candidate_token": "scaleai",
  "evidence_url": "https://job-boards.greenhouse.io/scaleai/jobs/4281519005",
  "evidence_type": "job_url",
  "confidence": 0.82
}
You should not immediately treat a token as valid just because a regex matched it.

5. Validate through ATS API
Validation should call the official public endpoint and inspect both status and body shape.

For Greenhouse:

text
GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
A strong Greenhouse validation requires:

text
HTTP 200
JSON object
jobs is array
meta.total exists
absolute_url host matches greenhouse/job-board pattern
at least one job has id + title + location or content
Greenhouse’s list endpoint returns a jobs array and meta.total, and content=true includes the full post description, departments, and offices. Greenhouse Job Board API

For Lever:

text
GET https://api.lever.co/v0/postings/{handle}?mode=json
A strong Lever validation requires:

text
HTTP 200
JSON array
at least one object has id + text + hostedUrl/applyUrl
hostedUrl contains jobs.lever.co/{handle}
Lever’s list endpoint returns published job postings and includes fields like id, text, hostedUrl, applyUrl, descriptionPlain, and categories. Lever Postings API

For Ashby:

text
GET https://api.ashbyhq.com/posting-api/job-board/{boardName}?includeCompensation=true
A strong Ashby validation requires:

text
HTTP 200
JSON object
apiVersion exists
jobs is array
jobs have title + jobUrl/applyUrl
jobUrl contains jobs.ashbyhq.com/{boardName}
Ashby’s API returns apiVersion and a jobs list with fields such as title, location, department, team, workplace type, description, publishedAt, jobUrl, and applyUrl. Ashby Job Postings API

6. Score board quality
Do not persist every valid board as equally useful. Persist it with a quality score.

Example scoring:

text
+40 valid API response
+20 board maps to known company domain
+15 has at least one US job
+10 has target-role job
+10 has jobs updated/published recently
+5 has salary/location fields
-20 token came only from generic search result
-30 token is suspicious/generic
-30 no US jobs
-50 zero jobs
A board can be technically valid but commercially useless for your target users.

7. Separate token validity from job usefulness
You need these states:

text
DISCOVERED
VALID_ATS_BOARD
VALID_EMPTY_BOARD
VALID_NON_US_BOARD
VALID_NO_TARGET_ROLES
ACTIVE_USEFUL_BOARD
STALE_BOARD
INVALID_TOKEN
BLACKLISTED_TOKEN
This avoids repeatedly rediscovering the same useless boards.

Discovery tactics that work
Tactic A: Company-domain crawler
Input:

text
company name
company domain
target countries
target roles
Process:

text
Fetch homepage
Find career links
Fetch career pages
Extract ATS links/scripts
Extract JobPosting schema
Extract outbound apply links
Generate candidate tokens
Validate candidates
Persist board + jobs
This is the most reliable long-term path.

Tactic B: Search-query expansion
Use search APIs with queries like:

text
site:boards.greenhouse.io "Software Engineer" "United States"
site:job-boards.greenhouse.io "Product Manager" "United States"
site:jobs.lever.co "Data Scientist" "United States"
site:jobs.ashbyhq.com "Machine Learning" "United States"
But search should produce candidates, not accepted boards.

Your extractor should score a candidate higher if the same token appears in multiple URLs or if the page title/company name matches the inferred company.

Tactic C: Public posting URL to board expansion
If you find:

text
https://job-boards.greenhouse.io/scaleai/jobs/4281519005
Then infer:

text
ats = greenhouse
token = scaleai
Then call the board API and ingest all jobs from that employer.

This is powerful because a single discovered job expands into an entire board.

Tactic D: JobPosting schema
Many company career pages include structured job metadata because Google recommends JobPosting structured data for eligibility in Google’s job search experience. Google Search Central

Google’s JobPosting guidance includes fields such as title, description, hiring organization, job location, employment type, identifier, salary, education requirements, and experience requirements. Google Search Central

If you crawl a company page and find applicationContact, url, sameAs, or apply URLs inside structured data, those URLs can lead to ATS tokens.

Tactic E: User imports as discovery
Every time a user pastes a job URL or saves a job through your app/extension:

text
parse ATS
extract board token
validate board
fetch all jobs
add board to discovery graph
This creates a data flywheel. Users are not just tracking jobs; they are helping discover fresh boards.

Avoiding garbage tokens
Use a candidate-token validator before making network calls.

Greenhouse token rules
Accept tokens if they match:

text
^[a-z0-9][a-z0-9_-]{2,80}$
Reject if:

text
contains slash
contains query chars
is numeric only
is in generic denylist
length < 3
token equals ATS vendor word
token equals route segment like jobs/apply/embed
Lever handle rules
Accept handles if:

text
^[a-z0-9][a-z0-9-]{1,80}$
Reject if:

text
generic segment
posting UUID
route word
contains uppercase-normalization mismatch unless known
Ashby board rules
Ashby is case-sensitive in practice often enough that you should preserve the extracted path segment exactly and also try normalized variants only as fallback.

Try order:

text
OriginalCase
lowercase
slugified-company-name
Ashby’s docs say the board name is the final URL path segment of the hosted Ashby jobs page. Ashby Job Postings API

Data model
I’d store boards separately from jobs.

sql
companies
- id
- name
- domain
- linkedin_url
- country
- industry
- source
- created_at

ats_boards
- id
- company_id
- ats_provider
- board_token
- canonical_board_url
- api_url
- status
- confidence_score
- quality_score
- first_seen_at
- last_validated_at
- last_successful_fetch_at
- last_error
- source_evidence_count

board_evidence
- id
- board_id
- evidence_url
- evidence_type
- extracted_token
- discovered_at
- confidence_score

jobs
- id
- board_id
- ats_provider
- external_job_id
- title
- company_name
- location_raw
- country
- state
- city
- workplace_type
- department
- team
- description_plain
- description_html
- apply_url
- job_url
- posted_at
- updated_at
- salary_min
- salary_max
- currency
- is_us
- is_target_role
- is_active
- content_hash
- first_seen_at
- last_seen_at
The board_evidence table is important because it lets you explain why you believe a board token belongs to a company.

Token confidence algorithm
A practical initial version:

text
0.95: token found on company-owned careers page and API validates
0.90: token found in careers page script/embed and API validates
0.85: token found in job URL where hiring company matches target company
0.75: token found via search result and API validates with matching company name
0.60: token validates but company mapping is unclear
0.30: token only regex-extracted, not yet validated
0.00: validation failed or token denylisted
For company mapping, compare:

text
company domain
hiring organization name
job board page title
ATS hosted URL slug
job descriptions mentioning company name
LinkedIn/company website URL
Freshness strategy
Do not crawl everything equally.

Suggested cadence:

text
Tier A: useful boards with target US jobs → refresh every 6-12 hours
Tier B: valid boards but no current target jobs → refresh every 2-7 days
Tier C: valid empty boards → refresh every 14-30 days
Tier D: invalid tokens → retry only if new evidence appears
Tier E: stale/closed boards → monthly or suppress
The big win is making refresh adaptive. If a board has never produced target jobs, do not spend your budget refreshing it hourly.

Target-role filtering
After fetching all jobs, classify each job by:

text
country/location: US, remote-US, Americas, global
role family: software, data, product, design, sales, marketing, etc.
seniority: intern, entry, mid, senior, staff, manager
employment type: full-time, intern, contract
visa friendliness: explicit H1B/OPT/CPT/sponsorship language
freshness: posted/updated within X days
Greenhouse exposes location.name, departments, offices, updated_at, content, and metadata through the public job endpoint. Greenhouse Job Board API

Lever exposes structured categories such as location, team, department, commitment, country, workplace type, and descriptions. Lever Postings API

Ashby exposes location, secondary locations, department, team, remote status, workplace type, employment type, descriptions, published date, job URL, apply URL, and compensation when requested. Ashby Job Postings API

Practical MVP approach
For your first version, I would build this in stages:

Stage 1: Known-board ingestion
Seed 500-2,000 known boards manually or from curated company lists.

Build:

text
ATS API fetchers
normalizer
US/target-role classifier
deduper
board refresh scheduler
admin UI for board status
This proves the bottom half.

Stage 2: Company-domain discovery
Add a crawler that starts from company domains and finds ATS links from careers pages.

This is your highest-signal discovery engine.

Stage 3: Search-based discovery
Use search results only as candidate evidence, never as truth.

Every discovered token must pass:

text
regex validation
denylist
ATS API validation
company matching
job usefulness scoring
Stage 4: User/import flywheel
Let users paste jobs or install a save-job extension.

Every saved job becomes a potential new board discovery event.

Stage 5: Board graph
Build a graph like:

text
company → career page → ATS board → jobs → apply URLs → inferred domains
This makes discovery compound over time.

The key insight
You should treat ATS token discovery as an entity-resolution problem, not a scraping problem.

The entity you are resolving is:

text
Company X uses ATS Y with board token Z, and that board currently produces useful target jobs.
Once you frame it that way, the solution becomes:

text
evidence collection
candidate extraction
API validation
company matching
quality scoring
refresh scheduling
feedback loop
That is exactly the system Jobright-like products need before the AI matching/resume layer even matters.

