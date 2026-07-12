# Demo Test Script

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

Provide repeatable script to verify Haocu before external demos.

## Why This Matters for Haocu

- Investors and partners judge the product by the demo path.
- Demo bugs waste credibility.
- Stable mock data and clear UI are key.

## MVP Requirements

- Test home, AI capture/result/correction/save, recommendation, Meal Buddy, chat sorting, group table, premium difference, restaurant card creation.

## Operating Rules

- Client UI may guide users, but server-side policy must enforce identity, ownership, role, quota, and safety.
- Changes affecting privacy, nutrition/health claims, premium limits, social identity, restaurant verification, or admin access require stricter review than visual-only changes.
- Demo/staging data must never be confused with production data.
- Every release must preserve the clean, uncluttered, demo-friendly UI direction already defined for Haocu.
- Known limitations should be documented honestly instead of hidden.

## Review Checklist

- [ ] 3-minute path passes.
- [ ] No broken images/routes.
- [ ] Demo uses stable environment.

## Implementation Backlog

| # | Task | Priority | Acceptance Criteria |
|---:|---|---|---|
| 1 | Write demo script | P0 | Owner assigned, acceptance criteria written, and linked to relevant PRD/Data/API/UI docs. |
| 2 | Seed demo data | P0 | Owner assigned, acceptance criteria written, and linked to relevant PRD/Data/API/UI docs. |
| 3 | Run before external meetings | P0 | Owner assigned, acceptance criteria written, and linked to relevant PRD/Data/API/UI docs. |
| 4 | Record demo blockers | P1 | Owner assigned, acceptance criteria written, and linked to relevant PRD/Data/API/UI docs. |

## 3-Minute Demo Path

1. Home opens with clean nutrition summary.
2. AI analysis routes directly to capture/upload.
3. AI result shows candidates, confidence, correction path, and nutrition estimate.
4. Meal saves to today's intake and full report is not zero.
5. Recommendation appears with understandable reason.
6. Meal Buddy card is created with correct date and quota state.
7. Chat sends message and list reorders by latest activity.
8. Group table and premium differences are visible without visual clutter.


## Dependencies

- `01_Product` for product boundaries and MVP scope.
- `02_PRD` for feature requirements and acceptance criteria.
- `03_AI` for database-first AI, correction loop, and safety boundaries.
- `04_Data` for schema, identity references, audit logs, and retention.
- `05_UI` for clean layout, route behavior, empty/loading/error states.
- `06_Architecture` through `09_Frontend` for engineering implementation.
