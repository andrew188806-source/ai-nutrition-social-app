# Backup and Recovery

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

Define backup and recovery requirements for Haocu data.

## Why This Matters for Haocu

- Meal records and restaurant/menu data are core product assets.
- Audit logs and premium entitlements matter for trust and disputes.
- Demo data must be recoverable before high-stakes meetings.

## MVP Requirements

- Enable managed database backups.
- Keep migration history.
- Maintain seed scripts.
- Run restore rehearsal before public beta.
- Document deletion/retention edge cases.

## Operating Rules

- Client UI may guide users, but server-side policy must enforce identity, ownership, role, quota, and safety.
- Changes affecting privacy, nutrition/health claims, premium limits, social identity, restaurant verification, or admin access require stricter review than visual-only changes.
- Demo/staging data must never be confused with production data.
- Every release must preserve the clean, uncluttered, demo-friendly UI direction already defined for Haocu.
- Known limitations should be documented honestly instead of hidden.

## Review Checklist

- [ ] Backup strategy defined.
- [ ] Restore test planned.
- [ ] Critical data classified.

## Implementation Backlog

| # | Task | Priority | Acceptance Criteria |
|---:|---|---|---|
| 1 | Enable backups | P0 | Owner assigned, acceptance criteria written, and linked to relevant PRD/Data/API/UI docs. |
| 2 | Run restore test | P0 | Owner assigned, acceptance criteria written, and linked to relevant PRD/Data/API/UI docs. |
| 3 | Document deletion request flow | P0 | Owner assigned, acceptance criteria written, and linked to relevant PRD/Data/API/UI docs. |
| 4 | Back up seed data | P1 | Owner assigned, acceptance criteria written, and linked to relevant PRD/Data/API/UI docs. |



## Dependencies

- `01_Product` for product boundaries and MVP scope.
- `02_PRD` for feature requirements and acceptance criteria.
- `03_AI` for database-first AI, correction loop, and safety boundaries.
- `04_Data` for schema, identity references, audit logs, and retention.
- `05_UI` for clean layout, route behavior, empty/loading/error states.
- `06_Architecture` through `09_Frontend` for engineering implementation.
