# 001 First 14 Days Command Center

## Goal

第一個 14 天不是做最大功能，而是把 demo/codebase 變成可穩定延伸的工程骨架。

## Day 0 — Setup

- Unzip this pack and Alpha 10 source if needed.
- Locate actual code repository separately from documentation repository.
- Run install / typecheck / route smoke test.
- Record initial error list.

## Days 1–2 — Build Stabilization

Deliverables:

- Typecheck report
- Route smoke report
- Blocking file list
- First PR: build stabilization only

Do not redesign UI or change product limits.

## Days 3–4 — Data Spine

Deliverables:

- `MealRecord` type
- `mealRepository` local adapter
- `computeDailyNutrition` utility
- web/native storage abstraction

Regression:

- Multiple same-day meals aggregate correctly.
- Refresh preserves demo state where expected.

## Days 5–6 — Social Identity Spine

Deliverables:

- Unified seed data file
- Shared `userId/cardId/matchId/chatId/tableId` references
- Chat list latest-message sort
- Accept invitation updates match state

Regression:

- Existing mock social cases reference the same users/cards.
- Group table participants use the same social cards.

## Day 7 — Checkpoint

Review:

- Typecheck status
- Demo route status
- Meal data model status
- Social data model status
- P0 blockers

## Days 8–9 — AI Analysis Save Loop

Deliverables:

- Analysis result DTO
- Candidate selection
- Manual correction flow
- Save creates stable meal record

Regression:

- Leaving/returning to analysis result preserves state.
- Save does not duplicate records.

## Days 10–11 — Intake and Recommendation Sync

Deliverables:

- Home summary, Today Intake detail, full report, Food Diary read same meal records.
- Recommendation reason tags.
- Zero-report bug fixed.

## Days 12–13 — Meal Buddy Creation Flow

Deliverables:

- Create Meal Buddy card from AI result.
- Create Meal Buddy card from restaurant card.
- Navigate to created card area.
- Enforce demo limits.

## Day 14 — Engineering Checkpoint

Produce:

- P0 completion report
- screenshots or demo recording if possible
- updated backlog with done/deferred statuses
- QA regression report
- next 14-day plan

Source: `07_SOURCE_REFERENCES/23_Engineering_Backlog_Pack/016_FIRST_14_DAYS_BUILD_PLAN.md`
