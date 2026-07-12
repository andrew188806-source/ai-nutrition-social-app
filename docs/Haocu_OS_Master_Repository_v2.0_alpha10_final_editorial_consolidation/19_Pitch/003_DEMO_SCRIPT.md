# Demo Script

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

Define a 3-minute demo that shows the loop without clutter.

## Operating Principles

- Show the shortest coherent path.
- Do not explain every feature.
- Use consistent demo data and avatars.
- If AI is wrong, show correction as a strength.

## Requirements

| Area | Decision / Requirement | Review / Acceptance |
|---|---|---|
| Opening | What should I eat next? Haocu learns from real meals. | 20 sec. |
| AI analysis | Upload/take photo, candidate result, nutrition estimate. | 35 sec. |
| Correction/memory | Correct dish/portion/cooking, save to diary. | 30 sec. |
| Recommendation | Show next meal/restaurant recommendation. | 35 sec. |
| Meal Buddy | Create card, show anonymous/Premium identity and invite/chat. | 35 sec. |
| Restaurant/admin | Structured menu data improves recommendation. | 20 sec. |


## Review Checklist

- [ ] Demo under 3 minutes.
- [ ] Fallback lines exist.
- [ ] No broken navigation.
- [ ] Screens match repository flow.

## Implementation / Action Backlog

| Priority | Task | Acceptance Criteria |
|---|---|---|
| P0 | Record demo path | Stable version for investors/campaign. |
| P0 | Create fallback script | AI wrong, social questioned, nutrition challenged. |
| P1 | Create 60-sec version | For quick meetings. |




## Dependencies

- 01_Product for product boundaries and MVP scope.
- 02_PRD for feature requirements and acceptance criteria.
- 03_AI and 04_Data for AI/data boundaries.
- 14_Compliance and 17_Legal_IP for public claims, privacy, and professional review.
- 18_Finance for cost, runway, pricing, and fundraising assumptions.
