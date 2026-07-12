# Changelog

## v2.0 Alpha 10 Freeze Patch — Meal Buddy Candidate Deduplication (2026-07-08)

### Changed

- Clarified Meal Buddy candidate discovery rules across PRD, AI recommendation, data schema, chat/invitation schema, source-of-truth, and engineering backlog.
- Added hard exclusion for users who already have an accepted match, active Meal Buddy relationship, or active one-on-one chat with the current user.
- Added soft ranking penalties for candidates with prior unaccepted invitations and candidates previously shown without action.
- Removed the prior idea that existing matched/friend users could be boosted in new-candidate discovery; existing contacts belong in chat/friend flows.

### Boundary

- This is a final-rule clarification inside Alpha 10 and does not add a new product module or expand MVP scope.

## v2.0 Alpha 10 — Final Editorial Consolidation / Repository Freeze (2026-07-08)

### Added

- Added final root-level handoff layer: `FINAL_README.md`, `FOUNDER_README.md`, `INVESTOR_README.md`, `ENGINEER_HANDOFF_README.md`, `LEGAL_IP_README.md`, `RESTAURANT_PARTNER_README.md`, `DOCUMENT_MAP.md`, `SOURCE_OF_TRUTH.md`, `VERSION_FREEZE_NOTE.md`, `FINAL_REPOSITORY_INDEX.md`, role-specific read-first guides, terminology standardization, claims/risk review, demo/mock-data disclosure, final handoff checklist, and Alpha 10 release notes.
- Added Alpha 10 packaging reports and freeze notes under `22_Repository_Packaging`.
- Added top-level `CHANGELOG.md` mirror for easier package review.

### Changed

- Updated root `README.md`, root `FINAL_HANDOFF_README.md`, `repository_manifest.json`, `00_Repository_Core/PROJECT_STATUS.md`, `00_Repository_Core/README.md`, `00_Repository_Core/CHANGELOG.md`, and `22_Repository_Packaging` to mark the repository as Alpha 10.
- Reframed Alpha 10 as a freeze and handoff layer rather than a new product module.
- Updated source-of-truth, evidence-label, and mock-data disclosure rules for safer external sharing.

### Preservation

- Preserved all original repository sections from `00_Repository_Core` through `27_Investor_Memo_Diligence_QA_Pack`.
- Did not add a `28_*` product/content module and did not expand MVP scope.

### Result

The repository is now suitable as a formal final handoff baseline for engineers, investors, legal/IP reviewers, advisors, restaurant partners, and the internal team.

### Boundary

Alpha 10 is not legal, tax, accounting, securities, valuation, patent, trademark, privacy, medical, nutrition, food-safety, insurance, investment, or commercial-contract advice. Professional review remains required for external use.


## v2.0 Working Draft
- Repository Core expanded.

## v2.0-alpha2 — 2026-07-08

### Added
- Expanded `01_Product` into Professional Edition with product vision, target users, principles, feature map, MVP scope, user journeys, monetization, metrics, growth loops, roadmap, risk boundary, and restaurant product strategy.
- Expanded `02_PRD` into engineering-ready PRD layer with 20 PRDs covering mobile app, AI analysis, meal records, recommendations, meal buddy, social card, group table, restaurants, premium, food diary, calorie sharing, onboarding, chat/invitations, restaurant admin, admin review, analytics, notifications, health goal mode, mascot identity, and error/empty states.

### Changed
- Clarified MVP vs MVP+ boundaries across consumer, restaurant, social, premium, and health-goal features.
- Standardized product language around meal records, meal-buddy cards, social cards, group tables, and premium/free capability limits.

## v2.0 Alpha 3 - AI / Data / UI Professional Pass

### Added / Expanded
- Expanded `03_AI` into a professional AI specification package covering database-first AI, food recognition, nutrition estimation, personalization, recommendation, safety boundaries, evaluation, prompting/orchestration, feedback loops, monitoring, and AI backlog.
- Expanded `04_Data` into an implementation-oriented data model package covering user profile, meal records, restaurant/menu, social cards, group tables, nutrition, AI analysis, Premium limits, chat/invitations, analytics, storage, privacy/consent/audit, and migration planning.
- Expanded `05_UI` into a complete UI specification package covering mobile navigation, home, AI analysis, Meal Buddy, restaurant, profile/Premium, food diary, group tables, chat/invitations, restaurant/admin UI, reusable components, empty/loading/error states, demo readiness, accessibility, and UI backlog.

### Alignment
- Connected PRD flows from Alpha 2 to AI, data, and UI implementation details.
- Reinforced MVP/MVP+ boundary for multi-photo meal capture, Premium health goal mode, and similar-user taste embeddings.
- Documented key bug-prevention rules around chat sorting, back navigation, unified social identity, and collection-based meal records.## v2.0 Alpha 4 — Architecture / Engineering / Backend / Frontend Pass ({DATE})

Expanded implementation-facing repository layers:

- Upgraded `06_Architecture` into a full system, domain, deployment, auth, AI-data-flow, observability, scalability, ADR, and architecture backlog package.
- Upgraded `07_Engineering` into engineering standards, repository structure, implementation priorities, state management, coding-agent instructions, git workflow, review policy, testing, release, type safety, environment, feature flag, dependency, and engineering backlog package.
- Upgraded `08_Backend` into backend architecture, API architecture, tables, RLS, edge functions, service layer, domain layer, repository layer, authorization, API contracts, error handling, jobs/notifications, storage, analytics/audit, and backend backlog package.
- Upgraded `09_Frontend` into mobile, restaurant, admin, component, QA, routing, state/data fetching, forms, localization, state handling, premium gating, social/chat, restaurant flow, and frontend backlog package.

This alpha links PRD, AI, data, and UI decisions to concrete engineering implementation structure.

## v2.0 Alpha 5 - DevOps / Infrastructure / QA / Security / Compliance / Operations Pass

Completed folders:
- `10_DevOps`
- `11_Infrastructure`
- `12_QA`
- `13_Security`
- `14_Compliance`
- `15_Operations`

Major upgrades:
- Added deployment, rollback, CI/CD, secret management, and incident workflows.
- Added Supabase, RLS, Edge Function, storage, monitoring, analytics, backup, and cost planning documents.
- Added QA strategy, demo script, regression checklist, AI/data/security/compliance QA, and bug triage.
- Added security architecture for auth, RLS, private images, chat/social safety, AI security, and incident response.
- Added compliance boundaries for privacy, nutrition claims, consent, data retention, restaurant verification, ads/sponsorship, and ESG claims.
- Added operations playbooks for restaurant onboarding, support, admin review, moderation, metrics, pilot operations, and launch readiness.

## v2.0 Alpha 6 - Business / Legal-IP / Finance / Pitch / Investor / External / Packaging Pass

### Completed
- Expanded `16_Business` with business model, GTM, crowdfunding, restaurant business, market positioning, pricing/package logic, partnerships/channels, operating metrics, business risks, and business backlog.
- Expanded `17_Legal_IP` with patent strategy, invention disclosure draft, trademark and brand clearance, IP ownership, privacy/terms requirements, fundraising/securities boundary, external counsel brief, and legal backlog.
- Expanded `18_Finance` with finance overview, budget framework, unit economics, fundraising boundary, accounting queue, MVP cost model, runway plan, fundraising scenarios, cap table/equity boundary, and finance backlog.
- Expanded `19_Pitch` with pitch narrative, elevator pitches, demo script, founder story, deck outline, objection handling, tagline/copy bank, and pitch backlog.
- Expanded `20_Investor_Materials` with investor README, FAQ, due diligence index, risk boundary, investor memo, data room checklist, traction plan, term sheet boundary, and investor materials backlog.
- Expanded `21_External_Artifacts` with crowdfunding outline, mascot brief, restaurant one-pager, engineer handoff, professional review packet, press kit, demo day script, law firm patent brief, reward copy, and artifact backlog.
- Updated `22_Repository_Packaging` with Alpha 6 package manifest, completion reports, continuation prompt, audit checklist, master index, priority plan, and release notes.

### Boundary
- Alpha 6 is a complete repository handoff package. It still requires professional review and engineering implementation before public, legal, financial, or production use.

## v2.0 Alpha 7A — Engineering Backlog Pack

Date: 2026-07-08

### Added

- Added `23_Engineering_Backlog_Pack`.
- Added MVP Epic Map.
- Added Feature Backlog.
- Added User Stories.
- Added Acceptance Criteria.
- Added P0/P1/P2 Priority Matrix.
- Added Sprint 1–6 Implementation Plan.
- Added Mobile App Task Breakdown.
- Added Backend Task Breakdown.
- Added Database/Supabase Task Breakdown.
- Added AI/Recommendation Task Breakdown.
- Added Restaurant Admin Task Breakdown.
- Added Web/Investor Demo Task Breakdown.
- Added QA Test Plan by Feature.
- Added Engineering Risk Register.
- Added Technical Debt Register.
- Added First 14 Days Build Plan.
- Added Codex/Claude Code Execution Prompts.
- Added Issue Template and Labels.
- Added Definition of Ready and Done.
- Added importable `backlog_items.csv` and `backlog_items.json`.

### Updated

- Updated project status to Alpha 7A.
- Updated repository packaging manifest and master index.
- Added Alpha 7A completion report and release notes.

### Result

The repository can now be used as an engineering execution source for CTO onboarding, sprint planning, coding-agent delegation, QA planning, and MVP implementation sequencing.



## v2.0 Alpha 7B — Professional Review Pack

Date: 2026-07-08

### Added

- Added `24_Professional_Review_Pack`.
- Added Professional Review Overview.
- Added Legal / IP Review Brief.
- Added Patent Disclosure Review Queue.
- Added Privacy / Data Protection Review Brief.
- Added Terms / Consumer Platform Review Brief.
- Added AI / Nutrition / Health Claims Review.
- Added Security / Technical Review Brief.
- Added Finance / Accounting / Tax Review Brief.
- Added Fundraising / Securities Review Brief.
- Added Restaurant Partner Commercial Review.
- Added ESG / Supply Chain Review.
- Added Insurance / Liability Review.
- Added Cross-Border Taiwan / US Review.
- Added Professional Questionnaires.
- Added Reviewer Handoff Emails.
- Added Review Decision Log Template.
- Added Professional Review Red Flag Matrix.
- Added Alpha 7B Handoff Summary.
- Added importable `review_questions.csv` and `review_questions.json`.

### Updated

- Updated project status to Alpha 7B.
- Updated root README for Professional Review Pack usage.
- Updated repository packaging manifest and master index.
- Added Alpha 7B completion report and release notes.
- Added Alpha 7C continuation prompt.

### Result

The repository can now be used not only by engineering teams, but also by professional reviewers. Alpha 7B prepares targeted review packets for counsel and advisors without forcing them to read the full repository.

## v2.0 Alpha 7C — Fundraising / Investor Materials Pack

Date: 2026-07-08

### Added

- Added `25_Fundraising_Investor_Materials_Pack`.
- Added investor one-pager, elevator pitch, 3-minute pitch, 8-minute pitch, pitch deck text version, demo day script, investor FAQ, fundraising narrative, market opportunity summary, problem/solution/why-now, product differentiation, business model summary, GTM plan, use-of-funds, milestone funding plan, team/hiring plan, risk mitigation summary, restaurant partner pitch, accelerator draft, crowdfunding summary, investor data room index, outreach templates, intro templates, objection guide, metrics/traction plan, and Alpha 7C handoff summary.
- Added `investor_materials_index.csv` and `investor_materials_index.json`.

### Updated

- Updated root README for Alpha 7C.
- Updated project status to include section 25.
- Updated package manifest and repository manifest.
- Added Alpha 7C completion and release notes.
- Added Alpha 8 continuation prompt.

### Boundary

Alpha 7C is fundraising preparation material, not legal, securities, valuation, tax, accounting, nutrition, medical, patent, or investment advice.
## v2.0 Alpha 8 — Investor Clean Data Room (2026-07-08)

### Added
- Added `26_Investor_Clean_Data_Room` as a clean external-sharing layer for investors, accelerators, advisors, crowdfunding reviewers, and restaurant partners.
- Added clean summaries for founder brief, company overview, product overview, MVP scope, market opportunity, business model, GTM, fundraising, use of funds, milestone roadmap, product demo script, engineering readiness, legal/IP status, privacy/compliance status, finance status, risk mitigation, restaurant partner pitch, advisor/reviewer packet, investor FAQ, document access guide, sensitive information exclusion list, and next-step meeting checklist.
- Added `clean_data_room_index.csv` and `clean_data_room_index.json` for data room navigation.

### Changed
- Updated root README, final handoff README, project status, and repository manifest to mark the repository as Alpha 8.
- Clarified that the full internal repository remains intact and that Alpha 8 is a curated external version rather than a replacement.

### Boundary
- Sensitive internal drafts, unreviewed legal/patent details, private finance assumptions, security details, and raw brainstorming should not be shared externally unless properly reviewed and controlled.


## v2.0 Alpha 9 — Investor Memo / Diligence Q&A Pack (2026-07-08)

### Added

- Added `27_Investor_Memo_Diligence_QA_Pack` as the investor-process operating layer on top of the Alpha 8 clean data room.
- Added master investor memo and short investor memo.
- Added master diligence Q&A and topic-organized diligence Q&A.
- Added investor meeting agenda/notes template and follow-up email templates.
- Added investor pipeline tracker and investor response tracker templates.
- Added demo evidence index and demo session log template.
- Added pilot evidence plan, restaurant pilot Q&A, and restaurant/pilot LOI interest tracker.
- Added traction metrics evidence template and diligence request list.
- Added document evidence map, risk/red-flag responses, compliance claims Q&A, finance/fundraising Q&A, technical/AI/data Q&A, competition/market Q&A, founding team/hiring Q&A, data room update log, investor objection response bank, and board/advisor update template.
- Added importable CSV trackers and `investor_memo_diligence_pack_index.csv/json`.

### Changed

- Updated repository project status to Alpha 9.
- Updated repository core README to include section 27 and evidence-level discipline.
- Updated package manifest, master index, final handoff README, release notes, completion report, and Alpha 10 continuation prompt.

### Result

The repository can now support formal investor conversations after the clean data room stage: memo distribution, diligence response consistency, demo/pilot evidence capture, investor pipeline tracking, restaurant pilot proof collection, and update-log discipline.

### Boundary

Alpha 9 is not legal, securities, tax, accounting, valuation, investment, patent, privacy, medical, nutrition, food-safety, or insurance advice. It is a structured investor-process preparation package requiring professional review where marked.
