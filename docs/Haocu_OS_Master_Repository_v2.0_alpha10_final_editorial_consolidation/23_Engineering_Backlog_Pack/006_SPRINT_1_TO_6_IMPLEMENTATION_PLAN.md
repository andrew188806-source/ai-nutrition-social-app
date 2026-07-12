# 006 Sprint 1–6 Implementation Plan

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Assumptions

- Sprint length can be one or two weeks depending on engineering capacity.
- If only one engineer is available, treat each sprint as a milestone, not a fixed calendar week.
- Demo stability is more important than breadth.
- Supabase migration should be started early but must not break local/demo mode.

## Sprint 1 — Stabilize the Build and Data Spine

### Goal

Make the repository safe to develop and replace fragile single-object/demo state with a stable data foundation.

### Primary Issues

- HOC-E0-001 Fix mobile TypeScript errors.
- HOC-E0-002 Confirm Expo Web demo path.
- HOC-E0-003 Create deterministic demo seed reset.
- HOC-E1-001 Replace `latestCorrectedMealRecord` with meal collection.
- HOC-E1-002 Unify Meal Buddy and Group Table identities.
- HOC-E1-003 Create cross-platform storage adapter.
- HOC-E2-001 Implement analysis result type and candidate selection.

### Sprint Exit Criteria

- App typechecks.
- Demo route opens.
- Meal records collection exists.
- Social identity source is unified.
- Demo seed reset exists.

## Sprint 2 — AI Save Loop and Intake Sync

### Goal

Complete the core user value loop: analyze meal -> correct -> save -> intake/report/recommendation context updates.

### Primary Issues

- HOC-E2-002 Manual correction form and recalculation.
- HOC-E2-003 Save confirmed analysis to meal records.
- HOC-E2-004 AI analysis page state retention.
- HOC-E3-001 Fix Today Intake / full report sync.
- HOC-E4-001 Build intake-aware next-meal rule engine.
- HOC-E5-004 Fix chat sorting and return routing.
- HOC-E9-001 Create core Postgres migrations.
- HOC-E10-001 Manual regression suite.

### Sprint Exit Criteria

- Saved meals update all nutrition surfaces.
- No “3 meals but report 0” regression.
- Next-meal recommendation changes after saved meal.
- Chat sorting and return regression cases pass.
- First Supabase schema draft exists.

## Sprint 3 — Meal Buddy Core and Restaurant Entry

### Goal

Make the core social dining loop work from both AI analysis and restaurant cards.

### Primary Issues

- HOC-E5-001 Create Meal Buddy card from AI analysis.
- HOC-E5-002 Create Meal Buddy card from restaurant card.
- HOC-E5-003 Enforce free/premium card and invite limits.
- HOC-E5-005 Accept invitation updates friend/match list.
- HOC-E4-002 Restaurant recommendation filter flow.
- HOC-E7-001 Restaurant card UI cleanup.
- HOC-E9-002 Implement RLS policy baseline.
- HOC-E9-003 Storage buckets and photo metadata.

### Sprint Exit Criteria

- Analysis-based card creation works.
- Restaurant-based card creation works and navigates correctly.
- Date selector placement is correct.
- Accepting invite updates match/friend state.
- RLS baseline draft exists.

## Sprint 4 — Restaurant, Group Table, and Investor Demo Hardening

### Goal

Strengthen the demo surface around restaurant discovery, group dining, and fundraising presentation.

### Primary Issues

- HOC-E6-001 Separate group table state from one-to-one chat.
- HOC-E6-002 Group participant social-card display.
- HOC-E7-002 Menu item nutrition card integration.
- HOC-E8-001 Menu CRUD demo surface.
- HOC-E9-004 Edge Function contract stubs.
- HOC-E10-002 Core analytics event map implementation.
- HOC-E11-001 3-minute demo route hardening.

### Sprint Exit Criteria

- `多人飯局` opens correct group flow.
- Restaurant menu nutrition appears in consumer surface.
- Menu CRUD demo can feed restaurant menu data.
- Core analytics debug events exist.
- Founder can run the 3-minute demo.

## Sprint 5 — Release Readiness and MVP+ Placeholders

### Goal

Prepare closed beta/demo release while safely adding post-MVP placeholders.

### Primary Issues

- HOC-E6-003 Cancellation reason system message.
- HOC-E8-002 Nutrition disclosure review status.
- HOC-E10-003 Release checklist and feature flags.
- HOC-E3-002 Implement food rating placeholder.
- HOC-E4-003 Taste similarity placeholder.

### Sprint Exit Criteria

- Feature flags distinguish demo/prod/backend modes.
- Group cancellation state is understandable.
- Rating and taste placeholders do not block core flow.
- Admin review status supports verified badge demo.

## Sprint 6 — Alpha/Beta Candidate Polish

### Goal

Polish and package the MVP for external review, closed beta, and fundraising support.

### Primary Issues

- HOC-E3-003 Implement free/premium diary windows.
- HOC-E11-002 Investor web demo content alignment.
- UI cleanup from QA findings.
- Regression pass across AI -> intake -> restaurant -> buddy -> chat -> table.
- Documentation update for engineering handoff.

### Sprint Exit Criteria

- Closed-beta candidate demo can be shown repeatedly.
- Major P0/P1 regressions are closed or explicitly deferred.
- Investor demo language aligns with review boundaries.
- Engineering handoff docs reflect actual implementation status.

## Sprint Review Checklist

At the end of each sprint, record:

- Completed issue IDs.
- Remaining P0 blockers.
- Demo route status.
- Typecheck/test status.
- Major product decisions made.
- Screens or recordings if available.
- Next sprint scope cuts if capacity is low.
