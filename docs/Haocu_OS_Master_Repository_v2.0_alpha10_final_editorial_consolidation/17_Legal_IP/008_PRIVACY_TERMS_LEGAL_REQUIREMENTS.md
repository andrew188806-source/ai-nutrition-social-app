# Privacy and Terms Legal Requirements

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

Map data categories and user-facing legal documents needed before public user collection.

## Operating Principles

- Meal/nutrition/social/location data is sensitive-adjacent and needs careful notice.
- Consent must be versioned and auditable.
- AI/nutrition and offline meetup risks must be clear.
- Users need deletion/report/block paths.

## Requirements

| Area | Decision / Requirement | Review / Acceptance |
|---|---|---|
| Data categories | Account, meal photos, nutrition estimates, health goals, location, social cards, verification, chat, analytics, restaurant data. | Privacy policy covers each purpose. |
| Documents | Privacy policy, terms, community guidelines, AI/nutrition disclaimer, social safety terms, Premium terms, restaurant terms. | Drafted before pilot/public use. |
| Consent points | Account, photo upload, health goal mode, location, real-person card, chat/social, restaurant admin, sponsorship. | UI and audit schema support them. |


## Review Checklist

- [ ] Consent records stored.
- [ ] Retention policy exists.
- [ ] Report/block flow exists.
- [ ] Terms cover AI, nutrition, social, moderation, billing.

## Implementation / Action Backlog

| Priority | Task | Acceptance Criteria |
|---|---|---|
| P0 | Draft privacy/terms requirements | Send to counsel. |
| P0 | Map consent to data schema | Version and timestamp fields defined. |
| P1 | Draft community guidelines | Moderation policies aligned. |




## Dependencies

- 01_Product for product boundaries and MVP scope.
- 02_PRD for feature requirements and acceptance criteria.
- 03_AI and 04_Data for AI/data boundaries.
- 14_Compliance and 17_Legal_IP for public claims, privacy, and professional review.
- 18_Finance for cost, runway, pricing, and fundraising assumptions.
