# Restaurant Business

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

Define how restaurants participate in Haocu as data/discovery partners, including onboarding, menu data, verification, pilot offers, and future paid packages.

## Operating Principles

- Restaurant data improves the user recommendation loop.
- Verification must mean a real review workflow.
- Sponsored discovery must be labeled.
- Restaurant owners should not access personal user health/social data.

## Requirements

| Area | Decision / Requirement | Review / Acceptance |
|---|---|---|
| Target partners | Restaurants with stable menu, clear dishes, office/student locations, health/light-meal fit. | Pilot list prioritized. |
| Data intake | Dish name, price, ingredients, portion, cooking method, photos, nutrition where available. | Structured enough for database-first AI. |
| Pilot offer | Profile setup, menu intake, restaurant card preview, QR/nutrition concept, feedback report. | No guaranteed traffic claim. |
| Commercial path | Free pilot → setup fee → monthly partner → sponsored discovery later. | Support cost and compliance reviewed. |


## Review Checklist

- [ ] Restaurant one-pager exists.
- [ ] Data intake sheet exists.
- [ ] Verified status definition exists.
- [ ] No hidden sponsored ranking.

## Implementation / Action Backlog

| Priority | Task | Acceptance Criteria |
|---|---|---|
| P0 | Create restaurant one-pager | Can be shown to a restaurant owner. |
| P0 | Create menu data intake sheet | Required/optional fields are clear. |
| P1 | Define paid pilot pricing hypothesis | Finance reviews cost and support load. |
| P1 | Define sponsored discovery policy | Compliance and UI labels are ready. |


## Restaurant Pilot Does Not Promise

- Guaranteed sales increase.
- Medical-grade nutrition certification.
- Permanent free listing.
- Exclusive ranking.
- Hidden ad placement.


## Dependencies

- 01_Product for product boundaries and MVP scope.
- 02_PRD for feature requirements and acceptance criteria.
- 03_AI and 04_Data for AI/data boundaries.
- 14_Compliance and 17_Legal_IP for public claims, privacy, and professional review.
- 18_Finance for cost, runway, pricing, and fundraising assumptions.
