# Engineer Handoff Brief

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

Condense the repository into engineering priorities.

## Operating Principles

- Build the core loop first.
- Fix known P0 implementation risks.
- Preserve clean UI.
- Use unified social identity and meal record collection.
- Backend enforces ownership/quotas/safety.

## Requirements

| Area | Decision / Requirement | Review / Acceptance |
|---|---|---|
| Priority fixes | TS errors, real meal record collection, unified Meal Buddy/Group Table models, storage adapter, restaurant card navigation, AI card date. | Engineering P0. |
| Tech stack | Expo RN/TS/Router, Next.js/TS/Tailwind, Supabase Auth/DB/Storage/Edge/RLS. | Implementation baseline. |
| QA | AI→correction→save→recommendation, restaurant→Meal Buddy, invite/chat/table, Premium limits, avatar consistency. | Demo readiness. |


## Review Checklist

- [ ] Backlog can be created from brief.
- [ ] Acceptance criteria linked.
- [ ] No duplicate UI controls.
- [ ] Demo path stable.

## Implementation / Action Backlog

| Priority | Task | Acceptance Criteria |
|---|---|---|
| P0 | Convert to GitHub issues | Link source docs. |
| P0 | Create sprint plan | P0 fixes first. |




## Dependencies

- 01_Product for product boundaries and MVP scope.
- 02_PRD for feature requirements and acceptance criteria.
- 03_AI and 04_Data for AI/data boundaries.
- 14_Compliance and 17_Legal_IP for public claims, privacy, and professional review.
- 18_Finance for cost, runway, pricing, and fundraising assumptions.
