# Engineer Handoff README

## Purpose

This file gives engineers, CTOs, technical leads, coding agents, and implementation partners a clean starting point for building from the Alpha 10 frozen repository.

## Engineering Rule

Build from the frozen MVP baseline. Do not expand scope from fundraising language, mascot ideas, future restaurant/ESG concepts, or investor imagination unless the founder explicitly creates a new build decision.

## Engineering Reading Order

1. `ENGINEER_READ_FIRST.md`
2. `00_Repository_Core/PROJECT_STATUS.md`
3. `01_Product/005_MVP_SCOPE.md`
4. `02_PRD/README.md`
5. `04_Data/001_DATA_MODEL_OVERVIEW.md`
6. `05_UI/README.md`
7. `06_Architecture/README.md`
8. `07_Engineering/README.md`
9. `08_Backend/README.md`
10. `09_Frontend/README.md`
11. `12_QA/README.md`
12. `23_Engineering_Backlog_Pack/README.md`
13. `23_Engineering_Backlog_Pack/006_SPRINT_1_TO_6_IMPLEMENTATION_PLAN.md`
14. `23_Engineering_Backlog_Pack/016_FIRST_14_DAYS_BUILD_PLAN.md`
15. `23_Engineering_Backlog_Pack/017_CODEX_CLAUDE_CODE_EXECUTION_PROMPTS.md`

## Build Priorities

| Priority | Build Area | Source |
|---|---|---|
| P0 | Repo setup, routing, shared types, storage adapter, i18n | `07_Engineering`, `09_Frontend`, `23_Engineering_Backlog_Pack` |
| P0 | Meal analysis flow, meal record persistence, correction path | `02_PRD`, `03_AI`, `04_Data` |
| P0 | Today intake and food diary data consistency | `02_PRD`, `04_Data`, `05_UI` |
| P1 | Restaurant recommendation and restaurant-card flow | `01_Product`, `02_PRD`, `08_Backend`, `09_Frontend` |
| P1 | Meal Buddy card, match, chat, invitation, and group table model consistency | `02_PRD`, `04_Data`, `23_Engineering_Backlog_Pack` |
| P1 | QA, demo test script, regression checklist | `12_QA`, `23_Engineering_Backlog_Pack` |
| P2 | Restaurant/admin portal foundations | `08_Backend`, `09_Frontend`, `15_Operations` |

## Engineering Source-of-Truth Hierarchy

1. `SOURCE_OF_TRUTH.md`
2. `01_Product/005_MVP_SCOPE.md`
3. `02_PRD/*`
4. `04_Data/*`
5. `06_Architecture/*`
6. `07_Engineering/*`
7. `23_Engineering_Backlog_Pack/*`
8. UI polish and demo-readability guidance from `05_UI/*`

If pitch or investor material conflicts with PRD, engineers should follow PRD and ask the founder to resolve the conflict.

## Non-Negotiable Engineering Boundaries

- Use one consistent fake/mock data model for demo until real backend persistence exists.
- Keep demo/mock data clearly separated from live data.
- Do not hardcode English user-facing text in JSX if the repository expects Traditional Chinese i18n.
- Preserve clean UI hierarchy and avoid duplicate controls.
- Social and chat safety flows must not be skipped when moving from demo to live.
- Nutrition/health outputs must include uncertainty, correction, and non-medical boundaries.

## Handoff Output Expected From Engineers

- A working build plan by sprint.
- A confirmed architecture decision record for any deviations.
- A data model implementation map.
- A QA checklist mapped to PRD acceptance criteria.
- A demo-readiness checklist before investor or partner walkthroughs.

## Meal Buddy Matching Patch Note

Before implementing candidate ranking, apply the final deduplication rule: accepted matches and active one-on-one chats are hard exclusions from new-candidate discovery. Prior unaccepted invitations and no-action impressions are not hard exclusions, but must reduce future ranking probability through configurable penalties. See `02_PRD/005_MEAL_BUDDY_PRD.md` and `23_Engineering_Backlog_Pack/010_AI_RECOMMENDATION_TASK_BREAKDOWN.md`.
