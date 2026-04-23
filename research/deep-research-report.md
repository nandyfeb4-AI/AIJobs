# ATS and Public Company Board Ingestion Research for a US AI Job Platform

This report is scoped to the entity["country","United States","north america"] market and only to knowledge-work roles in product, software engineering, design, and QA/SDET. The clearest low-cost MVP path is to ingest directly from three ATS platforms first: entity["company","Greenhouse","recruiting software"], entity["company","Ashby","recruiting software"], and entity["company","Lever","recruiting software"]. Those three have the strongest combination of officially documented or clearly exposed public job interfaces, stable board identifiers, and concentration in US tech/startup hiring. By contrast, entity["company","Indeed","job site"], entity["company","LinkedIn","professional network"], and entity["company","Google","search company"] are better understood as distribution/discovery layers, not open market-wide public-ingestion sources for your product. citeturn17view0turn18view1turn19view0turn44view1turn44view0turn44view2turn44view3

## Executive answer

If the goal is a practical MVP that you can implement quickly, the best approach is not “ingest everything.” It is “ingest a narrow set of high-yield ATS platforms whose public boards are clean, stable, and relevant.” For that reason, Greenhouse, Ashby, and Lever are the best starting stack. Greenhouse exposes a public Job Board API keyed by `board_token`; Lever exposes a public postings API keyed by `site`; Ashby exposes a public Job Postings API keyed by `job-board name`. All three are well-suited to company-by-company ingestion and normalization. citeturn17view0turn18view1turn19view0

For a first product, I would **not** make entity["company","Workday","enterprise software"] the core of the MVP, even though it covers many large employers. In practice, Workday public boards are visible and indexable, but the public access pattern is much more tenant-specific and brittle than Greenhouse/Lever/Ashby, and I did not find comparable publicly documented open third-party job-board read APIs in public Workday docs during this research. Similarly, entity["company","Workable","recruiting software"] and entity["company","iCIMS","recruiting software"] are more attractive as later-stage additions than first-wave MVP sources because their official APIs are oriented toward authenticated account/vendor access, not anonymous public-market reads. citeturn11view0turn9view6turn15search3turn12search6turn14search2

## ATS platform summary table

| platform | category | public board access available? | technical ease | relevance to target roles | MVP recommendation | notes |
|---|---|---:|---|---|---|---|
| entity["company","Greenhouse","recruiting software"] | ATS | yes | high | very high | include | Official Job Board API supports `GET /v1/boards/{board_token}/jobs`; docs state read access does not require authentication. Strong concentration in US tech/product/design hiring. citeturn17view0turn33view0turn38search3 |
| entity["company","Ashby","recruiting software"] | ATS | yes | high | very high | include | Official public Job Postings API uses `job-board name`; docs show public retrieval of currently published jobs and optional compensation fields. Very strong adoption among AI/startup/growth boards. citeturn19view0turn30search0turn26search2 |
| entity["company","Lever","ats software"] | ATS | yes | high | high | include | Official Postings API supports public access by site slug; Lever also states published postings are publicly viewable via its hosted job site and can be scraped by third parties. Strong growth-stage tech coverage. citeturn18view1turn25view0turn24view0 |
| entity["company","SmartRecruiters","recruiting software"] | ATS | partial | medium | medium | later | Official docs describe a `companies/{companyIdentifier}/postings` path, but SmartRecruiters’ public docs are inconsistent on whether public posting access is unauthenticated or API-key gated. Enterprise-heavy and worth phase 2, not phase 1. citeturn20view1turn20view0turn20view3turn42search17 |
| entity["company","Workable","recruiting software"] | ATS | partial | medium | medium | later | Hosted public boards on `apply.workable.com/{slug}` are easy to discover, but the official API requires account scopes such as `r_jobs`, which makes third-party public ingestion less straightforward. citeturn11view0turn9view5turn40search0turn40search1turn40search2 |
| entity["company","Workday","enterprise software"] | ATS | partial | low | high | later / mostly defer | Public boards are common on `myworkdayjobs.com` and tenant-specific career pages, but patterns vary by tenant/site and are materially more brittle than Greenhouse/Ashby/Lever. Good later if you need enterprise coverage. citeturn15search3turn12search6turn14search2 |
| entity["company","iCIMS","recruiting software"] | ATS | partial | medium-low | medium | later | Official Job Portal API exists, but it is vendor-oriented and uses Basic auth rather than anonymous public read access. Better as a negotiated/partnered expansion. citeturn9view6 |
| entity["company","Indeed","job site"] | job board / aggregator | no | low for your use case | high reach, low direct-ingestion fit | exclude as core source | Official APIs are for partners to create/manage postings on Indeed, and employer-scoped listing access is tied to the employer associated with the access token. That is not an open public-market ingestion model. citeturn44view1turn44view0 |
| entity["company","LinkedIn","professional network"] | job board / aggregator | no | low for your use case | high reach, low direct-ingestion fit | exclude as core source | LinkedIn’s official Job Posting API is for ATS partners to post/manage job lifecycle on LinkedIn. It is not a public read API for harvesting broad public jobs. citeturn44view2 |
| entity["company","Google","search company"] | aggregator / discovery | no | low for your use case | useful discovery layer | exclude as source of truth | Google’s job search experience is driven by `JobPosting` structured data and third-party integration; it is a discovery surface, not a canonical public jobs feed. citeturn44view3 |

## Prioritized platform recommendation

The top three ATS platforms for the MVP should be **Greenhouse, Ashby, and Lever**. They win for the same reason: each supports company-level public board ingestion with a stable identifier that you can persist in your own source registry, and each is heavily represented in tech-forward boards hiring for engineering, product, and design. Greenhouse has the cleanest official public board model; Ashby has the strongest current concentration of AI/startup boards; Lever remains excellent for growth-stage and mid-market tech companies. citeturn17view0turn19view0turn18view1turn30search0turn33view0turn25view0

I would **defer** SmartRecruiters, Workable, Workday, and iCIMS. SmartRecruiters looks workable but lower-ROI than the top three for a first build because of doc ambiguity and more enterprise/generalist board mix. Workable is easy to discover but weaker for anonymous public API ingestion. Workday will matter eventually if you want breadth, but it adds tenant-specific parsing and breakage risk too early. iCIMS is a better partner/vendor integration than a scrappy public-board MVP source. citeturn20view1turn20view0turn11view0turn9view6turn15search3

If you want an even more focused “super-MVP,” do **Greenhouse + Ashby first**, then add Lever immediately after you have your source registry, normalization, and change detection working. That would maximize quality per engineering hour spent. citeturn17view0turn19view0

## Company board catalog for MVP

**Priority tiers**: P1 = ingest immediately, P2 = ingest in the first month, P3 = optional/later within the MVP window.

### Greenhouse boards

| company name | platform | public board token / slug | likely role types | priority tier | evidence |
|---|---|---|---|---|---|
| entity["company","Stripe","payments company"] | Greenhouse | `stripe` | product, software engineering | P1 | Public board token and live roles including product/engineering. citeturn8view0turn7search8 |
| entity["company","Airbnb","lodging marketplace"] | Greenhouse | `airbnb` | software engineering, quality engineering | P1 | Public board with live engineering roles, including Quality Platform. citeturn36view2turn7search5 |
| entity["company","Figma","design software"] | Greenhouse | `figma` | design, product, software engineering | P1 | Careers page explicitly surfaces design, engineering, and product-manager role groupings; search results also show UX/content roles. citeturn36view0turn7search26 |
| entity["company","Brex","fintech company"] | Greenhouse | `brex` | software engineering | P1 | Public board confirmed; live engineering-manager results visible. citeturn36view1turn7search27 |
| entity["company","Reddit","social platform"] | Greenhouse | `reddit` | software engineering, data/ML engineering | P1 | Public board lists engineering, ads engineering, platform engineering, and multiple US remote engineering roles. citeturn33view0 |
| entity["company","Webflow","website builder"] | Greenhouse | `webflow` | product, product design, software engineering | P1 | Public board shows engineering, product, and product design roles, including US remote PM and design roles. citeturn38search0turn38search3turn38search10 |
| entity["company","Runpod","gpu cloud"] | Greenhouse | `runpod` | product, software engineering, infrastructure engineering | P1 | Public board shows engineering and product categories with multiple US remote roles. citeturn36view4turn35search12 |
| entity["company","Chainguard","software security"] | Greenhouse | `chainguard` | software/security engineering | P2 | Public board shows security engineering and technical-support engineering; strong tech brand, but weaker current product/design mix. citeturn36view3 |
| entity["company","Smartsheet","enterprise software"] | Greenhouse | `smartsheet` | software engineering, product design | P2 | Public board shows broad engineering/design coverage, including product-design and software-engineering roles. citeturn39search3turn39search11turn39search15 |
| entity["company","Ocrolus","fintech ai"] | Greenhouse | `ocrolusinc` | software engineering | P2 | Public board shows engineering roles and is a good fintech/AI signal, though current design/product-manager volume is lighter. citeturn36view5 |

### Ashby boards

| company name | platform | public board token / slug | likely role types | priority tier | evidence |
|---|---|---|---|---|---|
| entity["company","OpenAI","ai company"] | Ashby | `openai` | product, software engineering | P1 | Root board shows large current volume; live results include Product Manager and Engineering Manager roles. citeturn30search0turn30search3turn30search18 |
| entity["company","Notion","productivity software"] | Ashby | `notion` | product, design/research, software engineering | P1 | Public board/root snippets and live results show product manager, user research, and engineering roles. citeturn26search2turn26search14turn26search18 |
| entity["company","Ramp","fintech company"] | Ashby | `ramp` | product, design | P1 | Live public results show product-manager and design-engineer roles; very relevant startup board. citeturn26search5turn31search32 |
| entity["company","Flock Safety","public safety tech"] | Ashby | `flock safety` | software engineering, product operations | P1 | Root/public results show significant volume and active engineering/product-ops roles. citeturn27search2turn27search18turn27search30 |
| entity["company","Zip","procurement software"] | Ashby | `zip` | product, software engineering, QA | P1 | Public results show product-manager, software-engineering, and QA-management roles. citeturn27search11turn27search31turn26search31 |
| entity["company","TRM Labs","blockchain analytics"] | Ashby | `trm-labs` | software engineering, product-adjacent technical roles | P2 | Public board root/search results show technical and trust & safety-style hiring. citeturn28view5turn26search8 |
| entity["company","Cognition","ai company"] | Ashby | `cognition` | software engineering / research engineering | P2 | Public board root and live engineering roles visible. citeturn26search3turn31search12 |
| entity["company","Graphite","developer tools company"] | Ashby | `graphite` | software engineering | P2 | Public engineering role visible on Ashby board. citeturn31search20 |
| entity["company","Pulley","permitting software"] | Ashby | `withpulley` | product | P2 | Root board and live PM results are public; valuable if you want more startup PM coverage. citeturn31search2turn31search6 |
| entity["company","Reflection AI","ai company"] | Ashby | `reflectionai` | software engineering / ML engineering | P3 | Public board root and live engineer roles visible, but narrower role mix than the P1 boards. citeturn27search1turn27search13 |

### Lever boards

| company name | platform | public board token / slug | likely role types | priority tier | evidence |
|---|---|---|---|---|---|
| entity["company","WHOOP","wearables company"] | Lever | `whoop` | product, product design, software engineering, QA | P1 | Lever board explicitly shows product, product design, engineering, and QA/quality roles. citeturn25view0turn25view1 |
| entity["company","Quantcast","adtech company"] | Lever | `quantcast` | software engineering, design | P1 | Public board and job results show engineering roles and product-designer coverage. citeturn24view0turn21search18 |
| entity["company","Veeva Systems","cloud software"] | Lever | `veeva` | software engineering | P1 | Public Lever job results show live software-engineering roles from the Veeva board. citeturn6search18 |
| entity["company","Aircall","communications software"] | Lever | `aircall` | product, design, QA, software engineering | P1 | Public board shows product-manager, product-designer, QA, and engineering roles; not US-headquartered, but strong US-market fit. citeturn24view2turn25view2turn25view3turn25view5 |
| entity["company","Everbridge","critical events software"] | Lever | `everbridge` | software engineering | P2 | Public board/root confirms active engineering hiring. citeturn24view1 |
| entity["company","Best Egg","consumer fintech"] | Lever | `BestEgg` | software engineering | P2 | Public Lever results show active software-engineering hiring. citeturn6search6 |
| entity["company","CesiumAstro","space technology"] | Lever | `CesiumAstro` | software engineering, validation/QA-adjacent engineering | P2 | Public results show software and validation-oriented engineering roles. citeturn6search12 |
| entity["company","ZeroTier","networking company"] | Lever | `zerotier` | software engineering, product design | P2 | Public board/root shows engineering, design, and product-adjacent technical roles. citeturn24view3 |

## Suggested starter ingestion list

For a low-cost but high-signal first batch, I would start with **15 boards** and then expand to the full 27-board catalog after your normalization and change-detection stack is stable. That gives you enough diversity across fintech, developer tools, AI, productivity, security, and consumer/social tech without spreading your early engineering effort too thin. The first batch should skew toward boards that currently show obvious engineering/product/design activity and have clean public board mechanics. citeturn17view0turn19view0turn18view1

**Recommended first 15 boards**

Greenhouse wave: Stripe, Airbnb, Figma, Brex, Reddit, and Webflow. citeturn8view0turn36view2turn36view0turn7search27turn33view0turn38search3

Ashby wave: OpenAI, Notion, Ramp, Flock Safety, and Zip. citeturn30search0turn26search2turn26search5turn27search2turn27search11

Lever wave: WHOOP, Quantcast, Veeva Systems, and Aircall. citeturn25view0turn24view0turn6search18turn24view2

If you want a slightly larger first batch, add **Runpod, Smartsheet, Ocrolus, TRM Labs, Graphite, Everbridge, Best Egg, CesiumAstro, and ZeroTier** next. That expands you to 24 boards while still staying inside the top-three ATS strategy. citeturn36view4turn39search3turn36view5turn26search8turn31search20turn24view1turn6search6turn6search12turn24view3

One practical nuance: **QA/SDET is the narrowest of your four target categories** on public company boards right now. For early QA density, keep WHOOP, Aircall, and Zip near the front of the queue; those boards visibly surface quality roles today. citeturn25view1turn25view3turn27search31

## Risks and caveats

From a **legal/practical** standpoint, the safest MVP posture is to ingest only public job-listing data from official board endpoints or official hosted board pages, store the canonical apply URL back to the company source, respect platform terms/rate limits/robots guidance, and avoid scraping application forms, candidate flows, or authenticated endpoints. This is especially important because the “easier” aggregator APIs you might be tempted to use are often official posting/distribution APIs for partners, not free public-market data sources for your product. citeturn44view1turn44view0turn44view2

From a **technical** standpoint, Greenhouse and Lever are straightforward adapter problems. Ashby is also strong, but its hosted job pages may render as JS-heavy front ends, so you should integrate against the documented posting API rather than the HTML page itself whenever possible. SmartRecruiters deserves explicit pre-commit testing because its docs are internally inconsistent on public posting auth. Workday should be isolated behind its own adapter if you ever add it, because tenant/site naming and public endpoint behavior are much more brittle. citeturn19view0turn20view0turn20view1turn20view3turn15search3

From a **quality** standpoint, boards are not static. Role mix changes every day, and board tokens/paths can redirect or be branded. You should expect to maintain a source registry with fields such as `platform`, `board_token`, `canonical_board_url`, `fetch_method`, `parser_version`, `last_success_at`, and `last_seen_job_count`. You should also normalize on a stable composite key such as `{platform, board_token, external_job_id}` and preserve the raw payload for re-parsing as your taxonomy improves. That is a recommendation rather than a sourced fact, but it follows directly from the variability visible across the public boards in this research.

### Open questions and limitations

I did **not** fully validate live programmatic reads for every deferred platform-company combination. The highest-confidence findings are on Greenhouse, Ashby, and Lever because those are backed by both platform documentation and observed public company boards. SmartRecruiters, Workable, Workday, and iCIMS assessments are solid enough for prioritization, but if you later decide to add them, I would run a small live adapter spike per platform before committing roadmap time.

## Final recommendation

If you want the **lowest-cost, most implementation-ready MVP**, start with **Greenhouse + Ashby + Lever only**, and within those, launch first on the 15-board batch called out above. That gives you the best balance of legal clarity, engineering simplicity, public-board accessibility, and relevance to US product/software/design/QA hiring. citeturn17view0turn19view0turn18view1

In practical roadmap terms:

Build **three adapters** first: one for Greenhouse `board_token`, one for Ashby `job-board name`, and one for Lever `site slug`.

Seed the source registry with the **15-board starter list**, then expand to the full **27-board catalog** once ingestion, deduplication, and taxonomy classification are stable.

Treat **direct ATS board ingestion as your source of truth**. Use aggregator-style platforms later only for discovery, paid distribution, or partnership-based coverage expansion, not as the backbone of the MVP. citeturn44view1turn44view0turn44view2turn44view3

If I were building this product myself, my exact first wave would be:

**Greenhouse**: Stripe, Airbnb, Figma, Brex, Reddit, Webflow  
**Ashby**: OpenAI, Notion, Ramp, Flock Safety, Zip  
**Lever**: WHOOP, Quantcast, Veeva Systems, Aircall

That is the sharpest starting set for a focused US knowledge-work job platform.