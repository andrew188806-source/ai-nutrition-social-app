# Patent Disclosure Draft

> Repository Status: Haocu OS Master Repository v2.0 Alpha 6.
> Scope: Business, Legal/IP, Finance, Pitch, Investor Materials, External Artifacts, and final Repository Packaging.
> Audience: founder, CTO, engineers, designers, legal counsel, accountants, advisors, crowdfunding partners, and investors.

## Cross-Repository Boundaries

- **Taiwan-first MVP**: consumer mobile app, AI meal analysis, meal records, restaurant discovery, Meal Buddy cards, chat/invitations, group tables, premium limits, restaurant/admin tools, and clean demo readiness are the baseline.
- **Database-first AI**: verified restaurant/menu/nutrition data is preferred before free-form AI inference; AI output must expose uncertainty and correction paths.
- **Nutrition boundary**: Haocu provides food information and meal guidance, not medical diagnosis, prescription dieting, disease treatment, or guaranteed health outcomes.
- **Social safety boundary**: Meal Buddy and group dining features must protect identity, consent, harassment prevention, meeting safety, moderation, and abuse reporting.
- **Professional review boundary**: legal, patent, trademark, securities, accounting, tax, nutrition claims, and valuation matters require qualified external review before external publication or execution.
- **Clean UI principle**: Haocu should remain tidy, readable, spacious, demo-friendly, and free from duplicate controls.


## Objective

Provide patent counsel with an invention disclosure draft for Haocu's meal intelligence and food-social recommendation workflows.

## Operating Principles

- Internal/private; not for public campaign.
- Explain problem, system, data inputs, outputs, flows, and possible novelty.
- Avoid claiming patentability; ask counsel to decide.
- Separate user benefit from technical implementation.

## Requirements

| Area | Decision / Requirement | Review / Acceptance |
|---|---|---|
| Problem | Fragmented food decisions: manual calorie apps, generic reviews, delivery rankings, social apps without meal context. | Counsel understands user/technical problem. |
| System | Photo analysis → candidates → correction → meal record → taste/nutrition memory → recommendation → Meal Buddy card. | Core flow described. |
| Inputs | Meal photos, corrections, menu data, nutrition estimates, ratings, social settings, location/meal timing. | Data categories listed. |
| Outputs | Corrected record, updated profile, next-meal ranking, restaurant/dish ranking, Meal Buddy candidates. | Outputs listed. |


## Review Checklist

- [ ] Counsel can identify claim targets.
- [ ] Public disclosure risks marked.
- [ ] Diagrams requested if needed.
- [ ] Ownership and filing route questions included.

## Implementation / Action Backlog

| Priority | Task | Acceptance Criteria |
|---|---|---|
| P0 | Send to patent counsel | Ask for patentability and filing timing. |
| P1 | Create private diagrams | Data flow, ranking, state machine. |
| P1 | Prior art search | Counsel/vendor scope. |


## Working Invention Title

Context-aware meal intelligence and food-social recommendation system using corrected meal records, restaurant menu data, and privacy-gated social dining intent.

## Candidate Novel Elements

- Database-first AI meal analysis before free-form inference.
- Correction loop that updates both personal taste/nutrition memory and restaurant/menu confidence.
- Recommendation combining nutrition balance, taste similarity, meal timing, restaurant graph, and social dining intent.
- Meal Buddy card state machine generated from food/restaurant context with identity, quota, and safety gates.


## Dependencies

- 01_Product for product boundaries and MVP scope.
- 02_PRD for feature requirements and acceptance criteria.
- 03_AI and 04_Data for AI/data boundaries.
- 14_Compliance and 17_Legal_IP for public claims, privacy, and professional review.
- 18_Finance for cost, runway, pricing, and fundraising assumptions.
