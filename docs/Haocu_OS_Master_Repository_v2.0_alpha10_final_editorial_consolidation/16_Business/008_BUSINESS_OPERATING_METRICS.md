# Business Operating Metrics

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

Define the metrics Haocu needs before and after MVP launch to validate product, revenue, restaurant supply, AI quality, and social safety.

## Operating Principles

- Measure repeat behavior before scale.
- Track correction as a data-quality signal.
- Separate vanity metrics from activation and retention.
- Social safety metrics are business metrics, not only support metrics.

## Requirements

| Area | Decision / Requirement | Review / Acceptance |
|---|---|---|
| North Star | Weekly users who complete a meal record and take a recommended next action. | Tracked by analytics events. |
| Activation | First meal analyzed, first correction, first recommendation, first restaurant card, first Meal Buddy card. | Dashboardable. |
| Retention | D1/D7 return, weekly meal records, repeat recommendation use, diary revisit. | Cohorts defined. |
| Safety/AI cost | Reports, blocks, cancellation reasons, cost per analysis, DB hit rate. | Ops and engineering review. |


## Review Checklist

- [ ] Analytics names match PRD.
- [ ] Free/Premium segmentation exists.
- [ ] Restaurant-origin actions are trackable.
- [ ] AI correction and cost are monitored.

## Implementation / Action Backlog

| Priority | Task | Acceptance Criteria |
|---|---|---|
| P0 | Define event list | Analytics PRD and dashboard align. |
| P0 | Create pilot dashboard | Activation, retention, correction, safety, restaurant metrics. |
| P1 | Create investor update template | Metrics, burn, risks, asks included. |




## Dependencies

- 01_Product for product boundaries and MVP scope.
- 02_PRD for feature requirements and acceptance criteria.
- 03_AI and 04_Data for AI/data boundaries.
- 14_Compliance and 17_Legal_IP for public claims, privacy, and professional review.
- 18_Finance for cost, runway, pricing, and fundraising assumptions.
