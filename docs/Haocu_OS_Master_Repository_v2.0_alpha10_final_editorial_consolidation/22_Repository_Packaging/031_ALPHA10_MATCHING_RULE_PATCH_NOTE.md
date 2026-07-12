# Alpha 10 Matching Rule Patch Note

## Purpose

Record a final-rule clarification applied after Alpha 10 freeze: Meal Buddy candidate deduplication and history-based ranking penalties.

## Final Rule

- Users with accepted Meal Buddy matches, active Meal Buddy relationships, or active one-on-one chats are hard-excluded from new Meal Buddy candidate discovery.
- A person already visible in the user's chat list must not appear again as a new Meal Buddy candidate.
- Candidates who received an invitation but did not accept may reappear, but at a lower ranking probability and optionally after cooldown.
- Candidates shown without any action may reappear, but with a lighter repeat-exposure penalty.
- Hidden ranking penalties must not be shown as negative user-facing labels.

## Updated Files

- `02_PRD/005_MEAL_BUDDY_PRD.md`
- `02_PRD/013_CHAT_INVITATION_PRD.md`
- `03_AI/005_RECOMMENDATION_AI.md`
- `04_Data/005_SOCIAL_SCHEMA.md`
- `04_Data/011_CHAT_AND_INVITATION_SCHEMA.md`
- `23_Engineering_Backlog_Pack/010_AI_RECOMMENDATION_TASK_BREAKDOWN.md`
- `SOURCE_OF_TRUTH.md`
- `ENGINEER_READ_FIRST.md`
- `ENGINEER_HANDOFF_README.md`
- `CLAIMS_AND_RISK_REVIEW.md`
- `ALPHA_10_FINAL_RELEASE_NOTES.md`
- `CHANGELOG.md`
- `00_Repository_Core/CHANGELOG.md`
- `00_Repository_Core/PROJECT_STATUS.md`

## Scope Boundary

This patch clarifies an existing Meal Buddy rule. It does not add a new product module, does not create `28_*`, and does not expand MVP scope.
