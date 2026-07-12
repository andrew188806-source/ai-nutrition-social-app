# 017 Codex / Claude Code Execution Prompts

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

These prompts are designed for coding agents. Each prompt is scoped to reduce accidental broad rewrites.

## Universal Agent Guardrails

Use this at the top of every coding-agent session:

```text
You are working on the Haocu app codebase.
Follow the existing stack: Expo React Native + TypeScript + Expo Router for mobile, Next.js + TypeScript + Tailwind for web/admin if present, Supabase for backend path.
Do not change product rules unless explicitly requested.
Keep UI clean, spacious, Traditional Chinese-first, and avoid duplicate CTAs.
Do not introduce medical diagnosis/treatment claims.
Do not remove demo mode while adding backend support.
Before editing, inspect the relevant files and summarize the exact files you will touch.
After editing, run typecheck or the closest available validation and summarize remaining errors.
```

## Prompt 1 — TypeScript Stabilization

```text
Task: Fix all current mobile TypeScript errors without changing product behavior.

Scope:
- Inspect the mobile app TypeScript errors.
- Fix broken imports, route params, null/undefined handling, component props, and type mismatches.
- Avoid broad refactors.
- Do not change UI layout unless required to fix a type/runtime bug.
- Do not silence errors with `any` unless there is no safe alternative; explain every use of `any`.

Acceptance:
- Typecheck passes or remaining errors are listed with reasons.
- Core routes still render.
- No product rule changes.
```

## Prompt 2 — Replace latestCorrectedMealRecord

```text
Task: Replace any single latest meal state such as `latestCorrectedMealRecord` with a real meal record collection.

Scope:
- Search for latestCorrectedMealRecord and related single-record patterns.
- Define a `MealRecord` type if not already present.
- Implement add/update/list/getByDate functions through a meal repository or shared state module.
- Update Today Intake, full nutrition report, Food Diary, recommendation context, and Meal Buddy card creation to read from the same meal records.
- Preserve demo seed data.

Acceptance:
- Multiple meals can be saved on the same day.
- Home summary and full report show matching totals.
- The known bug where meal cards exist but full report shows 0 is fixed.
- Typecheck passes.
```

## Prompt 3 — Unified Social Data Model

```text
Task: Unify Meal Buddy, social card, match, chat, and group table mock data identities.

Scope:
- Identify mockUsers, communityCards/socialCards, mealBuddyCards, matches, chats, and groupTables.
- Ensure each surface references the same stable userId/socialCardId where appropriate.
- Fix accept-invitation logic so accepted users appear in matched/friend lists.
- Fix chat list sorting by latest message.
- Fix chat return navigation so it returns to the chat list/tab.
- Keep one-to-one chats and group table chats separate.

Acceptance:
- BO/LEO/Ivy regression cases pass.
- Accepting invitation updates friend/match state.
- Latest chat moves to top after message.
- 多人飯局 does not open the wrong one-to-one chat surface.
```

## Prompt 4 — Cross-Platform Storage Adapter

```text
Task: Create a cross-platform storage adapter for demo/local persistence.

Scope:
- Use localStorage on web.
- Use AsyncStorage on native Expo.
- Expose a shared async interface: getItem, setItem, removeItem, clear namespace if needed.
- Use adapter in demo state persistence for meal records and social demo state.
- Avoid direct localStorage access in UI components.

Acceptance:
- Web demo persists state after refresh where expected.
- Native code path does not reference browser-only localStorage.
- Typecheck passes.
```

## Prompt 5 — AI Analysis Save Loop

```text
Task: Implement the MVP AI analysis result -> correction -> save loop.

Scope:
- Define analysis result and candidate types.
- Allow selecting one of up to three candidates.
- Implement “以上皆非 / 手動輸入” correction form.
- Save confirmed/corrected result into mealRecords collection.
- Preserve result state when user leaves and returns before taking the next action.
- Record a correction feedback debug event when correction occurs.

Acceptance:
- Saved meal appears in Today Intake and Food Diary.
- Recommendation context updates after save.
- Save does not create duplicate records unless user intentionally saves a new meal.
```

## Prompt 6 — Restaurant Card to Meal Buddy Card

```text
Task: Fix restaurant card Meal Buddy creation flow.

Scope:
- Restaurant card/detail should have a clear CTA: “用這餐建立飯友卡並尋找飯友嗎？”
- Remove duplicate CTA such as “用這餐選飯友” if present.
- Move date selector so it appears near/under the relevant restaurant card, not at the page bottom.
- Create Meal Buddy card using restaurantId, menuItemId/dish, selected date/time, and user preferences.
- Navigate to the correct Meal Buddy card area after creation.

Acceptance:
- User can see the created card immediately.
- Date is correct.
- UI remains clean and not crowded.
```

## Prompt 7 — Supabase Schema Draft

```text
Task: Create initial Supabase migration files for Haocu MVP.

Scope:
- Create tables for profiles, meal_records, meal_nutrition, planned_meals, meal_ratings, meal_photos, ai_analysis_results, ai_candidates, ai_correction_feedback, restaurants, menu_items, menu_item_nutrition, social_cards, meal_buddy_cards, invitations, matches, chat_threads, chat_messages, group_tables, group_table_participants, analytics_events, audit_logs.
- Add UUID primary keys and timestamps.
- Add foreign keys where safe.
- Add RLS enabled statements and baseline policies for user-owned data.
- Do not connect production secrets.

Acceptance:
- Migration runs on empty Supabase project.
- User-owned tables have RLS enabled.
- Local/demo adapter remains available.
```

## Prompt 8 — Manual QA Checklist Implementation

```text
Task: Add or update manual QA documentation/checklist in the code repository.

Scope:
- Include smoke tests for Home, AI Analysis, Today Intake, Food Diary, Recommendation, Meal Buddy, Chat, Restaurant, Group Table, and Demo Reset.
- Include known regression cases: full report zero bug, chat sort, return tab, accepted invitation, restaurant card date selector, group table route.
- Keep checklist easy for non-engineers to run.

Acceptance:
- QA checklist exists in repo docs.
- Each item has clear expected result.
```

## Prompt 9 — Investor Demo Route

```text
Task: Harden the 3-minute investor demo route without adding fake claims.

Scope:
- Ensure demo path from Home -> AI Analysis -> Save Meal -> Today Intake -> Recommendation -> Meal Buddy -> Chat/Group Table -> Restaurant/Admin preview works.
- Add deterministic demo seed reset if not already present.
- Ensure sample/demo data is not presented as real traction.
- Keep Traditional Chinese UI polished and uncluttered.

Acceptance:
- Founder can run the route twice from reset without crash.
- No unreviewed medical/financial/legal claims appear.
```

## Prompt 10 — Post-Change Self Review

```text
Review your own changes.

Check:
- Did you alter any product rule not in scope?
- Did you keep demo mode working?
- Did you centralize visible UI copy where practical?
- Did you avoid duplicate CTAs and clutter?
- Did you preserve free/premium limits?
- Did you avoid medical diagnosis/treatment language?
- Did typecheck or available validation pass?

Return:
1. Files changed.
2. What was fixed.
3. What was intentionally not changed.
4. Remaining risks.
5. Suggested next issue.
```
