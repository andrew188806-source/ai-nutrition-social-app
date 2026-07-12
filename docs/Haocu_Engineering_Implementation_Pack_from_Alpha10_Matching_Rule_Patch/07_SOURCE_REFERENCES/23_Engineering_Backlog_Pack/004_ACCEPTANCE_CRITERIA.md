# 004 Acceptance Criteria

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This document defines observable acceptance criteria for MVP features. Engineering issues should reference the relevant criteria by feature.

## Global Acceptance Criteria

Applicable to every feature:

- TypeScript passes without feature-breaking errors.
- No visible English placeholder appears in Traditional Chinese UI unless intentionally branded.
- Loading, empty, and error states exist for user-facing async flows.
- Demo mode remains deterministic and can be reset.
- No feature introduces medical diagnosis, treatment, or guaranteed outcome language.
- Navigation returns to the expected previous context.
- UI remains clean, spacious, readable, and not overloaded with duplicate CTAs.

## AI Meal Analysis

### AC-AI-01 Capture / Upload Entry

- User can enter meal analysis from Home and AI Analysis pages.
- Capture/upload state is distinguishable from analysis result state.
- Meal timing selection is not redundantly shown after photo capture if it was already selected.
- User can return safely without losing the previous valid state.

### AC-AI-02 Candidate Result

- Result includes at least one primary candidate and up to three alternatives in demo mode.
- Each candidate has dish name, estimated calories, protein, carbs, fat, fiber, balance indicator, confidence/quality note, and ingredient breakdown.
- Selecting a candidate changes the previewed final meal payload.

### AC-AI-03 Manual Correction

- “以上皆非 / 手動輸入” opens correction fields.
- Correction fields include restaurant/source, dish name, ingredients, portion, cooking method, and nutrition values.
- Nutrition summary recalculates or updates after correction.
- Saving correction records a correction feedback event or local debug log.

### AC-AI-04 Save Meal Record

- Confirmed analysis saves exactly one meal record unless user performs a new save action.
- Saved record has stable ID, date/time, meal period, source type, nutrition values, display name, and optional photo reference.
- Today Intake, full report, Food Diary, recommendation, and Meal Buddy creation read the saved record.

## Meal Records / Today Intake / Food Diary

### AC-MEAL-01 Real Collection

- `mealRecords` or equivalent collection replaces any single latest-record state.
- Multiple meals can exist on the same day.
- Aggregation is computed from records, not hardcoded display cards.

### AC-MEAL-02 Summary Sync

- Home nutrition summary and Today Intake detail show matching totals.
- Full report does not show zero if saved meals exist.
- Planned dinner appears as planned and does not count as eaten until confirmed.

### AC-MEAL-03 Diary

- Food Diary lists recent daily cards.
- Rating can be attached to a meal record in demo mode.
- Free/premium view differences are visually clear but not disruptive.

## Recommendation Engine v1

### AC-REC-01 Next Meal

- Recommendation uses current daily intake in demo or real data mode.
- Recommendation includes a short explanation such as protein gap, fiber gap, lighter dinner, balanced choice, or taste match.
- Recommendation updates after saving or removing a meal.

### AC-REC-02 Restaurant Search

- Location/search/type/meal-period filters update the restaurant list.
- “都可以” behaves as a broad filter rather than an empty result.
- Restaurant result card can lead to menu/detail and Meal Buddy creation.

### AC-REC-03 Safety Boundary

- Recommendation does not claim to treat disease or prescribe medical care.
- Health goal mode is clearly framed as estimation/goal support.

## Meal Buddy

### AC-BUDDY-01 Create from AI Result

- After saving an analyzed meal, user can create a Meal Buddy card.
- Card references the saved meal record or normalized dish/restaurant data.
- Created card is visible in `我的飯友卡` without requiring the user to search the entire page.

### AC-BUDDY-02 Create from Restaurant

- Restaurant card provides a clear CTA to create a Meal Buddy card.
- Date selector appears close to the relevant restaurant card, not at the page bottom.
- Created restaurant-based card uses selected date and restaurant/dish data.

### AC-BUDDY-03 Limits

- Free mode allows the agreed MVP limits.
- Premium mode allows expanded limits.
- Limit reached state explains what happened and, in demo mode, applies overwrite-oldest behavior where specified.

### AC-BUDDY-04 Matching and Chat

- Candidate list is generated from unified social-card data.
- Invite action creates invitation/match state.
- Accepting invitation adds the user to matched/friend list.
- Chat list sorts by latest message.
- Returning from chat goes to chat tab/list, not the wrong tab.

## Group Table

### AC-GROUP-01 Entry and Separation

- `多人飯局` entry opens group-table surface, not a one-to-one chat route.
- Group table state is separate from one-to-one match/chat state.

### AC-GROUP-02 Participants

- Participants reference the same user/social-card data model as Meal Buddy.
- Participant cards open the correct social/community card.

### AC-GROUP-03 Cancel / Completion

- Cancellation requires reason in MVP demo flow.
- Cancellation posts a visible system message or state change.
- Meal completion / calorie sharing placeholder is reachable but does not block core table flow.

## Restaurant Surface

### AC-REST-01 Card and Detail

- Restaurant card is visually clean and readable.
- Detail page shows restaurant info, menu/recommended dishes, nutrition tags, and relevant CTAs.
- Recommended dish CTA asks whether to use this meal to create a Meal Buddy card.
- Duplicate “用這餐選飯友” style option is removed.

### AC-REST-02 Menu Item

- Menu item includes name, price if available, portion, nutrition estimate, tags, and verification/source status.
- New user-uploaded or AI-recognized dish can be associated with restaurant record in demo/placeholder form.

## Restaurant Admin / Admin Review

### AC-ADMIN-01 Menu CRUD

- Restaurant admin can create/edit menu item in demo or backend-backed state.
- Required fields are validated.
- Created item can appear in consumer restaurant surface.

### AC-ADMIN-02 Review State

- Menu/nutrition item can have draft/submitted/approved/rejected status.
- Verified badge display depends on approved state.
- Admin action creates audit log or local debug audit record.

## Supabase / Backend

### AC-BE-01 Migration

- Migration can run on an empty Supabase project.
- Tables match MVP data requirements.
- Backward compatibility with demo adapter remains possible.

### AC-BE-02 RLS

- User-owned data cannot be read or written by other users by default.
- Restaurant-owned data is scoped to restaurant role/account.
- Admin review data is admin-gated.

### AC-BE-03 Storage

- Meal and restaurant photo metadata is linked to records.
- Storage bucket access policy follows privacy boundaries.

## Investor Demo

### AC-DEMO-01 Repeatability

- Demo seed can be reset.
- Demo route can be executed twice without broken state.
- Demo cards do not claim fake traction as real metrics.

### AC-DEMO-02 Pitch Alignment

- App demo matches pitch narrative: AI nutrition first, restaurant recommendation second, social dining as retention/growth loop.
- External-facing copy is review-ready and not legally overclaiming.
