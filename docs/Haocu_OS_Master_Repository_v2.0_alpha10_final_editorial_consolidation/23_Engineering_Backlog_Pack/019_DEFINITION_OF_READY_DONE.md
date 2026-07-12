# 019 Definition of Ready and Done

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Definition of Ready

A task is ready for engineering when:

- The relevant PRD or backlog item exists.
- Priority is assigned: P0, P1, or P2.
- Scope is narrow enough for one engineer/coding-agent session or one pull request.
- Acceptance criteria are observable.
- Out-of-scope items are stated.
- Required product decision is already made.
- If the task touches privacy, data, AI, health, legal, or finance claims, review boundary is stated.

## Not Ready Examples

- “Improve AI” without specifying candidate selection, correction, recommendation, or feedback.
- “Fix Meal Buddy” without naming card creation, matching, invitation, chat, or group table.
- “Make UI better” without naming the screen and intended hierarchy.
- “Connect Supabase” without specifying schema, service adapter, RLS, and migration path.

## Definition of Done — Engineering

A task is done when:

- Code compiles/typechecks or remaining errors are unrelated and documented.
- Acceptance criteria pass.
- Regression checks pass.
- Demo mode still works.
- No product rule was changed without approval.
- User-facing copy is Traditional Chinese and centralized where practical.
- UI remains clean and non-duplicative.
- Data writes use service/repository layer where applicable.
- Errors/loading/empty states are handled where applicable.

## Definition of Done — Backend / Supabase

A backend task is done when:

- Migration runs from empty state.
- RLS is enabled where required.
- DTO/types are documented or generated.
- Local/demo adapter compatibility is preserved.
- Storage/security assumptions are documented.
- No production secrets are committed.

## Definition of Done — AI / Recommendation

An AI/recommendation task is done when:

- Inputs and outputs are structured.
- Demo/mock provider exists if live provider is not ready.
- Output includes source/confidence/reason labels where relevant.
- Recommendation avoids medical diagnosis/treatment language.
- Correction/feedback is captured if the task affects analysis.

## Definition of Done — QA / Demo

A QA/demo task is done when:

- Manual test steps are documented.
- Expected results are clear.
- Known regressions are covered.
- Demo seed reset is tested where relevant.
- External-facing claims are not overstated.

## Merge Gate for P0/P1 Work

Before merging P0/P1 work:

- [ ] Typecheck or relevant validation run.
- [ ] Manual regression path run.
- [ ] Screenshot/recording or text proof attached if UI changed.
- [ ] Product owner review requested if user-facing flow changed.
- [ ] Security/privacy review requested if user data access changed.
