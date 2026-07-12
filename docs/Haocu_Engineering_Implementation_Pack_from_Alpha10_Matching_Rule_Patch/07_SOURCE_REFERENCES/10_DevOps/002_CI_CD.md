# CI CD Pipeline

> Repository Status: Haocu OS Master Repository v2.0 Alpha 5.
> Scope: DevOps, Infrastructure, QA, Security, Compliance, and Operations.
> Audience: CTO, engineers, QA, security reviewers, compliance/legal/nutrition reviewers, operators, and investors.

## Cross-Repository Boundaries

- **MVP first**: AI meal analysis, meal records, restaurant discovery, Meal Buddy cards, chat/invitation, group tables, premium limits, and admin review come before MVP+ expansion.
- **Database-first AI**: verified restaurant/menu/nutrition data is used before free-form inference; AI output must show confidence and correction paths.
- **Nutrition safety**: Haocu provides food information and meal guidance, not medical diagnosis, treatment, or prescription diet advice.
- **Social safety**: Meal Buddy and group dining features must protect against spam, harassment, stalking, unwanted identity exposure, and unsafe meetups.
- **Premium clarity**: free and premium limits must remain consistent with Product, PRD, Data, Backend, and Frontend documentation.
- **Taiwan-first**: Traditional Chinese UX, Taiwan restaurants, Taiwan MVP launch, and local professional review are the baseline.


## Objective

Define automated checks and deployment stages for Haocu.

## Why This Matters for Haocu

- Prevents TypeScript and route regressions.
- Catches secret leaks and RLS policy gaps.
- Gives engineers and coding agents a safe merge path.

## MVP Requirements

- Run typecheck/lint/test on every PR.
- Run secret scan before merge.
- Validate Supabase migrations and RLS policies when changed.
- Create preview builds for UI-heavy changes.

## Operating Rules

- Client UI may guide users, but server-side policy must enforce identity, ownership, role, quota, and safety.
- Changes affecting privacy, nutrition/health claims, premium limits, social identity, restaurant verification, or admin access require stricter review than visual-only changes.
- Demo/staging data must never be confused with production data.
- Every release must preserve the clean, uncluttered, demo-friendly UI direction already defined for Haocu.
- Known limitations should be documented honestly instead of hidden.

## Review Checklist

- [ ] PR cannot merge with type errors.
- [ ] Secret scan blocks leaked keys.
- [ ] Preview exists for demo-critical UI.

## Implementation Backlog

| # | Task | Priority | Acceptance Criteria |
|---:|---|---|---|
| 1 | GitHub Actions validate job | P0 | Owner assigned, acceptance criteria written, and linked to relevant PRD/Data/API/UI docs. |
| 2 | Secret scanning job | P0 | Owner assigned, acceptance criteria written, and linked to relevant PRD/Data/API/UI docs. |
| 3 | Migration validation job | P0 | Owner assigned, acceptance criteria written, and linked to relevant PRD/Data/API/UI docs. |
| 4 | Preview deployment job | P1 | Owner assigned, acceptance criteria written, and linked to relevant PRD/Data/API/UI docs. |

## Required CI Stages

| Stage | Purpose |
|---|---|
| Typecheck | Prevent broken TypeScript across Expo/Next/shared packages. |
| Unit tests | Validate domain logic: limits, matching, nutrition transformations. |
| Migration validation | Prevent broken schema/RLS changes. |
| Secret scan | Block exposed service keys and AI keys. |
| Preview build | Validate demo-critical UI before merge. |


## Dependencies

- `01_Product` for product boundaries and MVP scope.
- `02_PRD` for feature requirements and acceptance criteria.
- `03_AI` for database-first AI, correction loop, and safety boundaries.
- `04_Data` for schema, identity references, audit logs, and retention.
- `05_UI` for clean layout, route behavior, empty/loading/error states.
- `06_Architecture` through `09_Frontend` for engineering implementation.
