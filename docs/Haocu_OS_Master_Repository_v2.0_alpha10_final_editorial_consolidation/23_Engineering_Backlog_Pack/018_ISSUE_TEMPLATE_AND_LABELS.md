# 018 Issue Template and Labels

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

Use this template to convert Alpha 7A backlog items into GitHub Issues, Linear tickets, or Notion tasks.

## Issue Template

```md
# [HOC-XXX] Title

## Priority
P0 / P1 / P2

## Epic
E0 / E1 / E2 / E3 / E4 / E5 / E6 / E7 / E8 / E9 / E10 / E11

## Problem
Describe the user, engineering, or business problem.

## Scope
- Files/routes/services likely involved.
- Data model or API changes.
- UI states affected.

## Out of Scope
- Explicitly list what must not change.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Typecheck or relevant validation passes.

## Regression Checks
- [ ] Existing demo route still works.
- [ ] No duplicate CTA/clutter added.
- [ ] Traditional Chinese UI copy is correct.
- [ ] Free/premium rules preserved where relevant.
- [ ] Privacy/safety rules preserved where relevant.

## Notes
Reference repository docs and decisions.
```

## Label Taxonomy

### Priority Labels

- `priority:P0`
- `priority:P1`
- `priority:P2`

### Epic Labels

- `epic:repo-stability`
- `epic:data-foundation`
- `epic:ai-analysis`
- `epic:intake-diary`
- `epic:recommendation`
- `epic:meal-buddy`
- `epic:group-table`
- `epic:restaurant`
- `epic:restaurant-admin`
- `epic:supabase`
- `epic:qa-release`
- `epic:investor-demo`

### Surface Labels

- `surface:mobile`
- `surface:web`
- `surface:backend`
- `surface:database`
- `surface:ai`
- `surface:restaurant-admin`
- `surface:qa`
- `surface:docs`

### Risk Labels

- `risk:demo-blocker`
- `risk:data-consistency`
- `risk:privacy-security`
- `risk:scope-creep`
- `risk:ui-clutter`
- `risk:claim-review`

### Status Labels

- `status:ready`
- `status:blocked`
- `status:in-progress`
- `status:needs-review`
- `status:deferred`
- `status:done`

## Ticket Sizing Guidance

- 1 point: small copy/type/fix isolated to one file.
- 2 points: small component or utility change with limited regression risk.
- 3 points: one screen/service integration with tests/checks.
- 5 points: cross-screen data/state change.
- 8 points: schema/backend migration or major state refactor.

Break anything above 8 points into smaller tickets.
