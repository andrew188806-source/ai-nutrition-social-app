# Unit Economics Framework

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

Define the unit economics for Premium, AI analysis, restaurant partners, and crowdfunding tiers.

## Operating Principles

- Before MVP, present unit economics as assumptions.
- After pilot, replace assumptions with cohort data.
- Variable AI and support costs must be visible.
- Goods margin must include fees, shipping, failure buffer.

## Requirements

| Area | Decision / Requirement | Review / Acceptance |
|---|---|---|
| Consumer Premium | Price, conversion, churn, app/payment fees, AI/storage/support cost. | ARPU/ARPPU/LTV/CAC hypotheses. |
| AI cost | Image storage, model inference, retries, correction, DB lookup/cache. | Cost per analysis monitored. |
| Restaurant | Setup fee, monthly fee, support hours, menu setup effort. | Pilot P&L visible. |
| Crowdfunding | Pledge, platform/payment fees, COGS, shipping, tax, support. | Contribution margin by tier. |


## Review Checklist

- [ ] Cost per analysis available.
- [ ] Reward margins modeled.
- [ ] Restaurant setup cost estimated.
- [ ] Premium hypothesis documented.

## Implementation / Action Backlog

| Priority | Task | Acceptance Criteria |
|---|---|---|
| P0 | Define formulas | ARPU, ARPPU, CAC, LTV, gross margin, payback. |
| P0 | Model AI cost | Free/Premium limits reflect variable cost. |
| P1 | Track pilot economics | Use actual data. |




## Dependencies

- 01_Product for product boundaries and MVP scope.
- 02_PRD for feature requirements and acceptance criteria.
- 03_AI and 04_Data for AI/data boundaries.
- 14_Compliance and 17_Legal_IP for public claims, privacy, and professional review.
- 18_Finance for cost, runway, pricing, and fundraising assumptions.
