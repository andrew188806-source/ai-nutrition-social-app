# 008 Backend Task Breakdown

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This document defines backend/service-layer tasks for the MVP. The backend target is Supabase Auth, Postgres, Storage, RLS, and Edge Functions, with a local/demo adapter preserved for development and presentations.

## Backend Architecture Rule

All product flows should call service/repository interfaces. UI should not know whether the data source is mock/local storage or Supabase.

```text
Screen -> UI hook/controller -> service -> repository interface -> local adapter or Supabase adapter
```

## Core Services

### User / Profile Service

Responsibilities:

- Auth user mapping.
- Profile fields.
- Health goal settings.
- Free/premium capability flags.
- Verification status.

Tasks:

- Define profile DTO.
- Implement local adapter.
- Implement Supabase adapter.
- Add validation for safe profile fields.

### Meal Service

Responsibilities:

- Save AI-confirmed meals.
- Save manual meals.
- Update/correct meals.
- Aggregate daily nutrition.
- Attach ratings.
- Link photos.

Tasks:

- Define `MealRecord` and `MealNutrition` types.
- Implement add/update/delete/getByDate/listRecent.
- Implement `computeDailyNutrition(records)`.
- Implement planned meal state separately from eaten meal state.

### AI Analysis Service

Responsibilities:

- Accept photo metadata or demo input.
- Return candidates.
- Accept correction feedback.
- Create save-ready meal payload.

Tasks:

- Define request/response contract.
- Add mock response provider.
- Add Edge Function stub.
- Add correction feedback logging.

### Recommendation Service

Responsibilities:

- Next-meal suggestions.
- Restaurant suggestions.
- Meal Buddy candidate suggestions.
- Explanation labels.

Tasks:

- Implement rule-based engine first.
- Keep ML/personalization extension behind interface.
- Avoid medical claim language in generated explanations.

### Restaurant Service

Responsibilities:

- Restaurant list/search/filter.
- Restaurant detail.
- Menu item nutrition data.
- Recommended dish CTA data.

Tasks:

- Define restaurant/menu DTOs.
- Implement filter parameters.
- Add verified/AI-estimated/source status.

### Meal Buddy Service

Responsibilities:

- Create cards from AI meal or restaurant item.
- Enforce free/premium limits.
- Generate candidates.
- Create invitations.
- Accept/decline invitations.
- Link to chat/match state.

Tasks:

- Create one canonical `createMealBuddyCard(input)` entry.
- Implement daily limit calculation.
- Implement overwrite-oldest behavior if limit reached and product rule requires it.
- Implement accept invitation state transition.

### Chat Service

Responsibilities:

- One-to-one chat list.
- Latest-message sorting.
- Send message.
- System messages.
- Link match/invitation state.

Tasks:

- Define chat/thread/message DTOs.
- Implement latest-message sorting.
- Keep one-to-one and group chat types distinct.

### Group Table Service

Responsibilities:

- Table list/create/join/leave.
- Participant display.
- Cancellation reason.
- Optional group chat link.
- Completion/calorie sharing placeholder.

Tasks:

- Define `GroupTable` DTO.
- Implement participant reference to shared social-card model.
- Implement cancellation system event.

### Admin / Review Service

Responsibilities:

- Restaurant menu review status.
- Verification status.
- Audit logs.

Tasks:

- Define review status transitions.
- Add role checks in Supabase adapter.
- Add local debug audit log for demo.

## Edge Function Candidates

| Function | MVP Role | Input | Output |
|---|---|---|---|
| `analyzeMeal` | AI meal candidate generation | user ID, photo path/metadata, meal period, context | candidates, nutrition estimate, confidence |
| `saveCorrectionFeedback` | AI feedback loop | analysis ID, chosen candidate, corrections | status, feedback ID |
| `recommendNextMeal` | next-meal rule/AI recommendation | user profile, meal records, preferences | suggestions, explanation labels |
| `recommendBuddyCandidates` | social candidate ranking | meal buddy card, user profile, nearby cards | ranked candidates, reason tags |
| `estimateMenuNutrition` | restaurant menu support | dish name, ingredients, portion, cooking method | nutrition estimate, confidence/source |

## Backend Acceptance Gates

- Repository interface exists for each service.
- Local adapter remains usable.
- Supabase adapter has typed payloads.
- RLS policies are drafted before external testing.
- Errors are mapped to user-friendly UI states.
- Debug logs do not expose private user data in external demos.
