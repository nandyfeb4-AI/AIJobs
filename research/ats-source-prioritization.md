# ATS and Job Source Prioritization

Date: 2026-05-01

This is a working reference for deciding which ATS/job sources are worth building into AIJobs. The goal is not to support every ATS name we see in Teal or competitors. The goal is to add sources that can materially increase fresh, US/Remote-US, tech and business-tech jobs without creating too much manual review or crawler fragility.

## Current Position

We already have meaningful direct ATS coverage:

| Source | Current Status | Notes |
| --- | --- | --- |
| Greenhouse | Implemented | Strong board volume. Board discovery has worked well after tuning. |
| Lever | Implemented | Useful, but lower board discovery yield than Greenhouse. |
| Ashby | Implemented | High quality, smaller public universe. |
| SmartRecruiters | Implemented | Strong recent result. Added 2k+ jobs from one validated batch. Continue research here. |
| Recruitee | Implemented | Useful, but rate limiting exists. Run in controlled batches. |
| Workable | Implemented, but pause for sourcing | Public board/API validation throttles heavily. XML feed had very poor target yield in dry run. Use only selectively. |

## Decision Framework

When evaluating a new ATS/source, score it on these dimensions:

| Dimension | Why It Matters |
| --- | --- |
| US/Remote-US density | We do not want volume that mostly becomes non-US noise. |
| Tech/business-tech role density | Software, data, product, design, QA, security, cloud, IT, systems, analytics, and related roles. |
| Public job access | Prefer unauthenticated JSON/API feeds or stable public pages. |
| Board discovery feasibility | Can we find many customer tokens/boards without expensive manual work? |
| Sync reliability | Can we refresh jobs daily without getting blocked? |
| Dedupability | Can jobs be uniquely identified by source job id, URL, title/company/location, or canonical apply URL? |
| Freshness support | Posted date or first-seen/last-seen tracking must be possible. |

## Priority Tiers

### Tier 1: Build Next

These are the best next ATS/source families after SmartRecruiters because they are likely to produce usable US tech/business-tech inventory and are more practical than enterprise suites.

| Source | Type | US Relevance | Why It Is Worth Doing | Suggested Approach |
| --- | --- | --- | --- | --- |
| Jobvite | ATS | High | Common in US mid-market and enterprise tech. Good chance of US professional roles. | Build adapter and research tokens. |
| Teamtailor | ATS/careers platform | Medium-high | Strong public careers pages. Global, but many US companies use it. | Build adapter; validate US/Remote-US density. |
| JazzHR | ATS | High | US SMB/mid-market. Good breadth, likely easier than Workday/iCIMS. | Build adapter; company-first research. |
| Breezy | ATS | High | US SMB and startup usage. Public boards are common. | Build adapter; company-first research. |
| BambooHR | HRIS/careers pages | High | Large SMB footprint in the US. Some boards may expose structured public listings. | Research feasibility first, then adapter if stable. |
| Comeet | ATS | Medium-high | Tech/startup-friendly, often has structured public pages. | Build small adapter if public endpoints are stable. |
| Pinpoint | ATS | Medium | Useful but likely more UK/EU-heavy. Still relevant for tech companies with US roles. | Research tokens first. |
| JobScore | ATS | Medium-high | US SMB/startup footprint. Could add incremental boards. | Research feasibility. |

Recommendation: implement in this order: `Jobvite`, `Teamtailor`, `JazzHR`, then `Breezy` or `BambooHR`.

### Tier 2: High Volume, But Harder

These are important long-term, but they are not ideal for quick board-first scaling. Many are enterprise systems with customer-specific domains, redirects, tenant IDs, bot protections, or inconsistent page structures.

| Source | Type | US Relevance | Why Not First |
| --- | --- | --- | --- |
| Workday | Enterprise ATS | Very high | Huge US volume, but each tenant is different and public access is more complex. |
| iCIMS | Enterprise ATS | Very high | Strong US enterprise volume, but board discovery and parsing are less uniform. |
| Oracle / Taleo | Enterprise ATS | High | Enterprise-heavy, older flows, inconsistent URLs. |
| SuccessFactors | Enterprise ATS | High | Large company footprint, but tenant/page complexity is high. |
| ADP Workforce Now | HRIS/ATS | High | Many US employers, but not clean board-token ingestion. |
| UKG Pro | HRIS/ATS | High | Large US footprint, but harder public discovery. |
| Dayforce | HRIS/ATS | High | Similar to UKG/ADP. High value later. |
| Paycom | HRIS/ATS | High | US-heavy, but likely fragmented. |
| Paycor | HRIS/ATS | High | US-heavy, SMB/mid-market. Research later. |
| Paylocity | HRIS/ATS | High | US-heavy, but not first-line for tech roles. |
| Phenom Pro | Talent experience/careers | High | Often wraps enterprise careers pages. Useful later. |
| Eightfold | Talent platform | High | Enterprise, but access patterns vary. |
| Avature | Enterprise ATS/CRM | High | Large companies, but complex. |
| BrassRing | Enterprise ATS | High | Legacy enterprise. Harder to normalize. |
| PeopleFluent | Enterprise HR/ATS | Medium-high | Enterprise, but lower immediate tech sourcing confidence. |
| SilkRoad | Enterprise ATS | Medium-high | Legacy enterprise, inconsistent. |
| PageUp | ATS | Medium-high | Strong in education/public sector; mixed relevance. |
| CSOD | Talent suite | Medium-high | Enterprise and public-sector mixed. |

Recommendation: do not spend today on these unless we decide to build a dedicated enterprise career-page crawler. They are valuable, but slower.

### Tier 3: Good For Later, But Not Immediate

These may have some useful US jobs, but either the role fit is mixed, the source is smaller, or the crawling model needs more research.

| Source | Notes |
| --- | --- |
| ApplicantPro | US SMB, but mixed job types. |
| CareerPlug | US local services and SMB. Some professional roles, but many hourly. |
| Hireology | US SMB, but automotive/local services heavy. |
| ApplicantStack | US SMB, mixed roles. |
| Efficient Apply | Unknown implementation details. Research only. |
| ExactHire | US SMB, mixed. |
| CATS | Recruiting/staffing-heavy risk. |
| 100Hires | Smaller ATS, research only. |
| Hirebridge | Older ATS, possible US roles. |
| Trakstar Hire | SMB ATS, some US relevance. |
| Manatal | Global recruiting platform, likely staffing-heavy. |
| Zoho Recruit | Global, often staffing/recruiting-heavy. |
| Freshteam | SMB/global, mixed. |
| GoHire | SMB/global, likely small volume. |
| Recooty | SMB/global, likely small volume. |
| VIVAHR | US SMB, local/hospitality mix. |
| Recruiterflow | Recruiting CRM/staffing-heavy. |
| KulaAI | Recruiting automation, not a broad ATS source yet. |
| Gem | Recruiting CRM, not a job board source. |

### Tier 4: Low Fit For Our MVP

These are likely to create more noise than useful inventory for immigrant-focused US tech/business-tech job search.

| Source | Why Low Fit |
| --- | --- |
| TenStreet | Trucking/logistics. |
| Workstream | Hourly/local hiring. |
| Homebase | Hourly/local SMB. |
| Harri | Hospitality. |
| Fountain | High-volume hourly/frontline. |
| OnShift | Healthcare/frontline. |
| HealthcareSource | Healthcare. |
| SchoolSpring | Education. |
| SchoolRecruiter | Education. |
| AppliTrack | Education/public schools. |
| PeopleAdmin | Education/government/public sector. |
| Interfolio | Higher education. |
| Jobs Go Public | UK/public sector. |
| Jobinfo | Unclear/general; likely low value. |
| CareerBeacon | Canada-heavy. |
| Welcome To The Jungle | Europe-heavy. |
| Personio | Europe-heavy HRIS. |
| Softgarden | Europe-heavy. |
| Varbi | Europe/Nordics-heavy. |
| Gupy | Brazil/LatAm-heavy. |
| ELMO Talent | Australia/New Zealand-heavy. |
| PeopleStrong | India/APAC-heavy. |
| CVWarehouse | Europe-heavy. |
| Jobylon | Europe-heavy. |
| TeamWork Online | Sports/entertainment niche. |
| TalentAdore | Europe-heavy. |
| eRecruiter | Region-specific, likely low US value. |
| iSmartRecruit | Global recruiting/staffing, likely low precision. |
| Jobsoid | SMB/global, small volume. |
| Networx | UK-heavy. |
| Red Rover | Education/substitute staffing. |
| AllianceHCM | HR/payroll, not high tech-fit. |
| PeopleForce | Europe/HRIS, mixed. |
| Changeworknow | UK-heavy. |
| Placement Partner | Staffing-heavy. |
| Simplicant | Smaller/unclear. |
| Trac RMS | Staffing/recruiting-heavy. |
| MyRecruitmentPlus | Australia-heavy. |
| ApplyNow | Generic/unclear. |
| Polymer | Small startup ATS, low volume. |
| Humi | Canada-heavy. |
| Rezoomo | Ireland/UK-heavy. |
| TalentLyft | Europe/global, smaller. |
| StaffedUp | Hospitality/hourly. |
| GR8 People | Enterprise/talent platform, unclear board access. |
| ATS OnDemand | Smaller/legacy. |
| TriNet Hire | SMB, but likely not enough tech volume. |
| Zippy | Unclear/low confidence. |
| Eploy | UK-heavy. |
| Peopleclick | Legacy enterprise. |
| HireHive | Ireland/UK-heavy. |
| Quickin | Brazil/LatAm-heavy. |
| PyjamaHR | India-heavy. |
| Discovered ATS | Not a specific ATS source. |
| Vincere | Staffing/recruiting-heavy. |
| Braums | Company-specific, not ATS. |
| Recruit CRM | Staffing/recruiting CRM. |
| TallNet | Staffing/recruiting. |
| TempWorks | Staffing/temp workforce. |
| Crelate | Staffing/recruiting-heavy. |
| Njoyn | Canada/public sector-heavy. |
| Workbright | Onboarding/compliance, not job inventory. |
| Kwantek | Staffing/franchise/local mix. |
| HCTSPortals | Healthcare/talent system, low fit. |
| SelectMinds | CRM/community, not direct jobs. |
| AutomotoHR | Automotive. |
| Insperity Talent Connect | PEO/SMB, mixed and likely low tech density. |
| GetHired | General/older. |
| HiringThing | SMB, mixed. |
| Paychex | HR/payroll, mixed. |
| Hireclick | SMB, mixed. |
| LaborEdge | Staffing/healthcare staffing. |
| TeamTailor | See Tier 1 as Teamtailor. |
| In-House | Not a specific source. |
| Paradox | Conversational hiring/frontline-heavy. |
| Rippling | HRIS with jobs possible, but not broad ATS inventory. |

### Company-Specific Sources

These are valuable, but they should not be treated as generic ATS adapters.

| Source | Suggested Treatment |
| --- | --- |
| Amazon Jobs | Build as a company-specific source later. Huge volume, strong US relevance. |
| Microsoft Jobs | Build as a company-specific source later. High US tech relevance. |
| Google Jobs | Build as a company-specific source later. High US tech relevance. |

## Source Strategy

### Short Term: Scale With SmartRecruiters

SmartRecruiters is currently the best incremental source:

- Public API is practical.
- It produced meaningful job volume.
- It appears less painful than Workable.
- Research can continue in batches of 50-100 validated tokens.

Recommended next action:

1. Keep sourcing SmartRecruiters boards in smaller batches.
2. Keep an exclusion file for already imported/validated SmartRecruiters tokens.
3. Import only boards with at least one US or Remote-US tech/business-tech posting.
4. Run validation/import in controlled batches.
5. Watch non-US leakage in analytics and tighten location normalization if needed.

### Medium Term: Add 2-3 More Practical ATS Adapters

Build adapters in this order:

1. Jobvite
2. Teamtailor
3. JazzHR
4. Breezy or BambooHR

This gives us a better path than trying to brute-force Workday/iCIMS first.

### Later: Enterprise Crawlers

Workday, iCIMS, Oracle/Taleo, SuccessFactors, ADP, UKG, Dayforce, Paycom, Paycor, and similar systems should be treated as a separate "enterprise careers crawler" project. They are important, but they need a different implementation style:

- company-first discovery
- tenant/domain detection
- page-specific parsing
- heavier dedupe
- slower sync cadence
- more robust monitoring

## Data Quality Requirements

Every source should eventually normalize these fields:

| Field | Values |
| --- | --- |
| `sourceType` | direct_ats, company_careers, aggregator, xml_feed, manual_research |
| `ats` | greenhouse, lever, ashby, smartrecruiters, jobvite, teamtailor, jazzhr, etc. |
| `countryScope` | us, remote_us, north_america, global, non_us, unknown |
| `locationType` | remote, hybrid, onsite, unknown |
| `roleCategory` | software, data, product, design, qa, security, cloud_infra, it_support, business_systems, analytics, other |
| `freshnessBucket` | 0_7_days, 8_14_days, 15_30_days, 31_60_days, older, unknown |
| `postedAtQuality` | exact, inferred, first_seen, unknown |

This matters because the job count alone is not enough. We need to know how many jobs are fresh, US-relevant, target-role relevant, and deduped.

## Practical Recommendation

Do not chase all 100 ATS names.

Use this order:

1. Continue SmartRecruiters research because it is producing jobs now.
2. Pause Workable bulk sourcing until we have a better low-throttle path.
3. Add Jobvite, Teamtailor, and JazzHR/Breezy adapters next.
4. Add analytics for `countryScope`, `locationType`, `roleCategory`, and freshness buckets.
5. Revisit enterprise systems as a dedicated crawler track after the core workflow and inventory quality are stable.

## 2026-05-01 Source Expansion Update

Perplexity's newer sourcing research reframes the roadmap around two tracks:

### Track A: Native Ingestion

This is the durable moat. It is slower, but gives us first-party control over freshness, dedupe, quality scoring, and sync cadence.

| Priority | Source / Strategy | Why It Matters | Difficulty | Recommendation |
| --- | --- | --- | --- | --- |
| 1 | Workday CXS public boards | Largest potential US enterprise job unlock. Strong for large employers and sponsor-friendly companies. | Medium | Start research/design, but expect tenant discovery complexity. |
| 2 | iCIMS sitemaps + JSON-LD | Large US enterprise footprint. Sitemap + JobPosting parsing can be stable enough. | Medium | Good native connector candidate. |
| 3 | SuccessFactors sitemaps + JSON-LD | Major Fortune 500 coverage. | Medium | Good enterprise connector after iCIMS. |
| 4 | Oracle Cloud HCM / Taleo | Large banks, airlines, manufacturers, and enterprise employers. | Medium-high | Important, but more variant-heavy. |
| 5 | JSON-LD JobPosting universal crawler | Catches custom career sites and long-tail pages without needing one ATS adapter per source. | Medium | Foundational fallback. Build this early. |
| 6 | Paylocity public feeds | Easier mid-market quick win. | Low | Worth testing soon. |
| 7 | Public-feed ATS bundle | JazzHR, BambooHR, Pinpoint, JobScore, Breezy, Teamtailor. | Low-medium | Quick-win batch after SmartRecruiters. |
| 8 | Phenom / Eightfold / Avature | Enterprise career frameworks. | Medium-high | Later, after simpler enterprise crawlers are stable. |

Native ingestion should be seeded from:

- current boards and companies already in our database
- sponsor-friendly company lists such as MyVisaJobs/H1BGrader style research
- validated company domains from manual/Perplexity research
- known ATS customer patterns

### Track B: Commercial Bridge

This is not a moat, but it may get us to MVP inventory faster.

| Source | Role | Why Use It | Caveat |
| --- | --- | --- | --- |
| JSearch / RapidAPI | Paid aggregator bridge | Fastest path to a large pool of fresh US jobs. Useful while native ingestion matures. | Duplicates, cost, and aggregator apply URLs need careful dedupe. |
| Fantastic.jobs or similar unified ATS APIs | Paid/unified ATS bridge | Could reduce connector work if quality is good. | Must validate coverage, freshness, terms, and pricing before relying on it. |
| Adzuna / other aggregator APIs | Secondary bridge | Broad coverage and easy API access. | Quality can be stale or duplicate-heavy. |

Commercial APIs should be treated as a temporary accelerator:

1. import into a separate source type
2. dedupe against native jobs
3. measure freshness and apply-url quality
4. downsize later as native ingestion matures

## Revised Implementation Order

The best path from roughly 22k jobs toward 100k-150k relevant jobs is:

1. **Fix analytics/data quality first**
   Add or tighten `countryScope`, `locationType`, `roleCategory`, `freshnessBucket`, and `postedAtQuality`. This prevents inflated volume from hiding bad inventory.

2. **Continue SmartRecruiters, but in smaller high-quality batches**
   It is currently producing real job volume and is easier than Workable.

3. **Build a JSON-LD JobPosting universal crawler**
   This is the most reusable fallback for company career pages, long-tail ATS pages, and future research lists.

4. **Build one quick public-feed ATS bundle**
   Prioritize `JazzHR`, `BambooHR`, `Pinpoint`, `JobScore`, `Breezy`, and `Teamtailor`.

5. **Evaluate one paid aggregator bridge**
   Test JSearch or a similar API with a strict 30/60-day freshness filter, US/Remote-US filter, and target-role query set. Do not mix it blindly with native jobs.

6. **Start enterprise connector design**
   Workday CXS, iCIMS, SuccessFactors, and Oracle/Taleo are likely necessary for real scale, but they need a dedicated crawler architecture.

## Dedupe Standard

All new sources should store both source-native identity and unified identity:

| Key | Purpose |
| --- | --- |
| `sourceJobId` | Stable native source id where available. |
| `sourceJobUrl` | Canonical apply/detail URL. |
| `companyCanonical` | Normalized employer name/domain. |
| `titleCanonical` | Normalized title. |
| `locationCanonical` | Normalized US/Remote-US location. |
| `jobFingerprint` | Fuzzy dedupe hash from company, title, location, and apply URL host. |

Preferred dedupe order:

1. exact `source + sourceJobId`
2. exact canonical job URL
3. fuzzy `companyCanonical + titleCanonical + locationCanonical + apply_url_host`
4. source confidence tie-breaker based on posted date quality and direct apply URL quality

