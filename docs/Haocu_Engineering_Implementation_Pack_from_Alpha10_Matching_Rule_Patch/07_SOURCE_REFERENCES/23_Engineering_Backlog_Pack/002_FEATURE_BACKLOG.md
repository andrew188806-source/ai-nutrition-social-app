# 002 Feature Backlog

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This document is the human-readable implementation backlog. The same backlog is also provided as `backlog_items.csv` and `backlog_items.json` for import into project management tools.

## Backlog Rules

- P0 items block MVP engineering stability or the core user loop.
- P1 items are needed for a strong MVP demo or first closed beta.
- P2 items are planned, but should not block the first reliable build unless already trivial.
- Every issue must preserve existing product decisions unless explicitly changed by the product owner.
- Every issue touching visible UI must preserve clean, uncluttered, Traditional Chinese-first presentation.
- Every issue touching health/nutrition must avoid medical diagnosis, treatment, or guaranteed outcome claims.

## P0 Backlog

| ID | Epic | Title | Owner | Sprint | Done Signal |
|---|---|---|---|---|---|
| HOC-E0-001 | E0 Repo & Demo Stabilization | Fix mobile TypeScript errors | Mobile | S1 | typecheck passes; no new any-heavy workaround; route smoke test passes |
| HOC-E0-002 | E0 Repo & Demo Stabilization | Confirm Expo Web demo path | Mobile | S1 | 3-minute demo can be performed twice after refresh |
| HOC-E0-003 | E0 Repo & Demo Stabilization | Create deterministic demo seed reset | Platform | S1 | Reset returns same mock users/meals/cards/chats/tables |
| HOC-E1-001 | E1 Core Data Foundation | Replace latestCorrectedMealRecord with meal collection | Mobile/Data | S1 | Today Intake and nutrition report read same records |
| HOC-E1-002 | E1 Core Data Foundation | Unify Meal Buddy and Group Table identities | Mobile/Data | S1 | Accept invite updates friend/match state; group participants link to same social cards |
| HOC-E1-003 | E1 Core Data Foundation | Create cross-platform storage adapter | Mobile | S1 | Adapter tests/smoke checks pass; demo data persists consistently |
| HOC-E2-001 | E2 AI Meal Analysis Loop | Implement analysis result type and candidate selection | AI/Mobile | S1 | Candidate selection controls final record payload |
| HOC-E2-002 | E2 AI Meal Analysis Loop | Manual correction form and recalculation | Mobile/AI | S2 | Corrected record shows updated nutrition and correction event |
| HOC-E2-003 | E2 AI Meal Analysis Loop | Save confirmed analysis to meal records | Mobile/Data | S2 | One save creates one record; no duplicate on navigation |
| HOC-E3-001 | E3 Today Intake & Food Diary | Fix Today Intake / full report sync | Mobile/Data | S2 | No zero-report bug when meals exist |
| HOC-E4-001 | E4 Recommendation Engine v1 | Build intake-aware next-meal rule engine | AI/Backend/Mobile | S2 | Changing current intake changes recommendation reason |
| HOC-E5-001 | E5 Meal Buddy Flow | Create Meal Buddy card from AI analysis | Mobile/Data | S3 | Created card is visible and references saved meal |
| HOC-E5-002 | E5 Meal Buddy Flow | Create Meal Buddy card from restaurant card | Mobile/Data | S3 | Card appears in correct page and created confirmation is obvious |
| HOC-E5-004 | E5 Meal Buddy Flow | Fix chat sorting and return routing | Mobile | S2 | BO/LEO/Ivy regression cases pass |
| HOC-E5-005 | E5 Meal Buddy Flow | Accept invitation updates friend/match list | Mobile/Data | S3 | Accepted user appears in friends/matches and chat remains available |
| HOC-E9-001 | E9 Supabase Backend Migration | Create core Postgres migrations | Backend/Data | S2 | Migration runs cleanly in empty Supabase project |
| HOC-E9-002 | E9 Supabase Backend Migration | Implement RLS policy baseline | Backend/Security | S3 | No table containing user data is public without explicit policy |
| HOC-E10-001 | E10 QA Analytics Release | Manual regression suite | QA | S2 | QA checklist can be run by non-engineer |


## P1 Backlog

| ID | Epic | Title | Owner | Sprint | Done Signal |
|---|---|---|---|---|---|
| HOC-E0-004 | E0 Repo & Demo Stabilization | Audit centralized i18n | Mobile/Web | S2 | No new hardcoded UI copy in touched files |
| HOC-E1-004 | E1 Core Data Foundation | Normalize planned dinner state | Mobile/Data | S2 | Planned dinner appears as planned, not eaten, and can be converted/cleared |
| HOC-E2-004 | E2 AI Meal Analysis Loop | AI analysis page state retention | Mobile | S2 | Tab away/back preserves current analysis state |
| HOC-E3-002 | E3 Today Intake & Food Diary | Implement food rating placeholder | Mobile | S3 | Rating can be saved/edited in demo state |
| HOC-E4-002 | E4 Recommendation Engine v1 | Restaurant recommendation filter flow | Mobile/Data | S3 | Filters update cards without route confusion |
| HOC-E5-003 | E5 Meal Buddy Flow | Enforce free/premium card and invite limits | Mobile/Data | S3 | Free=2/day, premium=5/day; clear disabled/limit states |
| HOC-E6-001 | E6 Group Table Flow | Separate group table state from one-to-one chat | Mobile/Data | S4 | 多人飯局 does not route to one-to-one chat incorrectly |
| HOC-E6-002 | E6 Group Table Flow | Group participant social-card display | Mobile | S4 | Participant card click opens correct community/social card |
| HOC-E7-001 | E7 Restaurant Surface | Restaurant card UI cleanup | Mobile/UI | S3 | Recommended dish CTA asks to create Meal Buddy card; no duplicate option |
| HOC-E7-002 | E7 Restaurant Surface | Menu item nutrition card integration | Mobile/Data | S4 | Menu card feeds AI/restaurant/meal-buddy flows consistently |
| HOC-E8-001 | E8 Restaurant Admin | Menu CRUD demo surface | Web/Backend | S4 | Admin-created item appears in restaurant menu demo data |
| HOC-E9-003 | E9 Supabase Backend Migration | Storage buckets and photo metadata | Backend/Data | S3 | Upload metadata can be associated with meal/restaurant item |
| HOC-E9-004 | E9 Supabase Backend Migration | Edge Function contract stubs | Backend/AI | S4 | Mobile can call typed client with mock response fallback |
| HOC-E10-002 | E10 QA Analytics Release | Core analytics event map implementation | Mobile/Backend | S4 | Events visible in debug logger or analytics sink |
| HOC-E10-003 | E10 QA Analytics Release | Release checklist and feature flags | Platform | S5 | Demo mode can be locked for investor presentation |
| HOC-E11-001 | E11 Investor Demo | 3-minute demo route hardening | Product/Engineering | S4 | Founder can run demo without engineering help |


## P2 Backlog

| ID | Epic | Title | Owner | Sprint | Done Signal |
|---|---|---|---|---|---|
| HOC-E3-003 | E3 Today Intake & Food Diary | Implement free/premium diary windows | Mobile | S4 | Free/premium toggle visibly changes history/toplist scope |
| HOC-E4-003 | E4 Recommendation Engine v1 | Taste similarity placeholder | AI/Data | S5 | Interface exists; fallback rules work when sparse data |
| HOC-E6-003 | E6 Group Table Flow | Cancellation reason system message | Mobile/Data | S5 | Cancellation updates table state and group chat system event |
| HOC-E8-002 | E8 Restaurant Admin | Nutrition disclosure review status | Web/Admin | S5 | Status controls consumer verified badge display |
| HOC-E11-002 | E11 Investor Demo | Investor web demo content alignment | Web/Product | S6 | Investor page labels projections/demo data clearly |


## Issue Detail Format

Each backlog item should be converted into a development issue with this structure:

```md
## Problem
What user/business/engineering problem is being solved?

## Scope
What files, routes, services, schema, or state are likely involved?

## Out of Scope
What should not be changed in this issue?

## Acceptance Criteria
- [ ] Observable criterion 1
- [ ] Observable criterion 2

## Regression Checks
- [ ] Existing flow still works
- [ ] Typecheck passes
- [ ] i18n strings are centralized
```

## Dependency Notes

- `HOC-E0-001`, `HOC-E1-001`, `HOC-E1-002`, and `HOC-E1-003` should happen before heavy feature expansion.
- Supabase migration should begin early, but demo mode should remain stable through a repository interface.
- Restaurant admin and investor web work should not block the core consumer loop unless investor demo requires it.
