# 016 First 14 Days Build Plan

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This is the practical first two-week plan for an engineer, CTO, or coding agent team starting from the Alpha 7A repository.

## Day 0 Setup

- Unzip repository.
- Read:
  - `00_Repository_Core/README.md`
  - `00_Repository_Core/PROJECT_STATUS.md`
  - `02_PRD/README.md`
  - `04_Data/README.md`
  - `07_Engineering/README.md`
  - `23_Engineering_Backlog_Pack/README.md`
- Confirm actual code repo location separately from this documentation repository.
- Run install/typecheck in code repo.
- Record initial errors.

## Days 1–2 — Build Stabilization

Goals:

- Fix TypeScript errors.
- Confirm app boots.
- Identify demo route crashes.
- Add or confirm seed reset.

Deliverables:

- Typecheck report.
- Route smoke report.
- List of blocking files.
- First PR: build stabilization only.

Do not:

- Redesign UI.
- Add new feature behavior.
- Change product limits.

## Days 3–4 — Data Spine

Goals:

- Replace `latestCorrectedMealRecord` pattern.
- Create meal collection service.
- Create daily aggregation function.
- Create storage adapter.

Deliverables:

- `MealRecord` type.
- `mealRepository` local adapter.
- `computeDailyNutrition` utility.
- Web/native storage abstraction.

Regression:

- Multiple same-day meals aggregate correctly.
- Refresh preserves demo state where expected.

## Days 5–6 — Social Identity Spine

Goals:

- Centralize mock users/social cards.
- Normalize Meal Buddy cards, matches, chats, group tables.
- Fix chat sort and return routing.

Deliverables:

- Unified seed data file.
- Shared ID references.
- Chat list latest-message sort.
- Accept invitation updates match state.

Regression:

- BO/LEO/Ivy cases pass.
- Group table participants reference same cards.

## Day 7 — Checkpoint Review

Review:

- Typecheck status.
- Demo route status.
- Meal data model status.
- Social data model status.
- Remaining P0 blockers.

Decision:

- Continue to AI/intake save loop if data spine stable.
- If not stable, spend Day 8 on stabilization instead of feature work.

## Days 8–9 — AI Analysis Save Loop

Goals:

- Define analysis result DTO.
- Candidate selection.
- Manual correction form.
- Save to meal collection.

Deliverables:

- Candidate selection controls saved payload.
- Correction flow updates payload.
- Save creates stable meal record.

Regression:

- Leaving/returning to analysis result preserves state.
- Save does not duplicate records.

## Days 10–11 — Intake and Recommendation Sync

Goals:

- Home summary, Today Intake detail, full report, Food Diary read same meal records.
- Next-meal recommendation reads same records.

Deliverables:

- Aggregation service wired to UI.
- Recommendation reason tags.
- Zero-report bug fixed.

Regression:

- Three meals show correct totals everywhere.
- Recommendation changes after saved meal.

## Days 12–13 — Meal Buddy Creation Flow

Goals:

- Create Meal Buddy card from AI result.
- Create Meal Buddy card from restaurant card.
- Navigate to created card area.
- Enforce demo limits.

Deliverables:

- Shared card creation service.
- Correct restaurant date selector placement.
- Card visibility after creation.

Regression:

- Created card appears under `我的飯友卡`.
- Restaurant card does not hide date selector at bottom.

## Day 14 — Alpha 7A Engineering Checkpoint

Produce:

- P0 completion report.
- Demo recording or screenshots if possible.
- Updated backlog with done/deferred statuses.
- QA regression report.
- Next 14-day plan.

## Founder Review Questions

- Is the core demo now clear enough to show advisors?
- Are any product rules accidentally changed?
- Are free/premium limits represented correctly?
- Does the UI still feel clean and non-cluttered?
- Is the next engineering step backend migration or social/restaurant polish?
