# 004 Backend Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document describes the backend architecture that supports Haocu MVP and future scaling.

## Backend Baseline

Haocu uses Supabase as the initial backend platform:

- Postgres for structured data.
- Row Level Security for data access protection.
- Supabase Auth for account/session identity.
- Supabase Storage for meal photos, restaurant photos, menu photos, and profile images.
- Edge Functions for business logic that should not live in the client.

## Service Layer

The backend should expose service-level operations, even when implemented as Edge Functions or server actions.

Core services:

- `ProfileService`
- `MealService`
- `AIAnalysisService`
- `RecommendationService`
- `RestaurantService`
- `MealBuddyService`
- `GroupTableService`
- `ChatService`
- `PremiumService`
- `AdminReviewService`
- `AnalyticsService`
- `NotificationService`

## Backend Operation Categories

### Safe Client Reads

May use Supabase client directly with RLS:

- Own profile.
- Own meal records.
- Public restaurant list.
- Own social card.
- Available group tables with public visibility.

### Service-mediated Writes

Must use service functions:

- Creating AI analysis jobs.
- Confirming AI analysis into meal records.
- Creating Meal Buddy cards.
- Sending invitations.
- Joining/leaving Group Table.
- Writing chat messages.
- Updating usage limit counters.
- Creating audit records.
- Admin approval/rejection.

## RLS Policy Direction

RLS is required for all user-facing tables. Policies should be designed around:

- Owner can read/write own private records.
- Public restaurant data is readable but controlled for writes.
- Social card visibility depends on free/premium and verification state.
- Chat messages are visible only to participants.
- Group table data is visible based on table status and participant relationship.
- Admin review data is visible only to admin roles.

## Error Strategy

Backend errors should be structured:

```json
{
  "code": "LIMIT_EXCEEDED",
  "message": "Daily Meal Buddy card limit reached.",
  "details": {
    "limit": 2,
    "plan": "free"
  }
}
```

Do not expose model prompts, internal embeddings, storage paths that are not meant to be public, or admin-only fields.

## MVP Backend Non-goals

- Microservices.
- Multi-cloud architecture.
- Fully custom auth implementation.
- Real-time analytics warehouse.
- Full POS integration.


## Cross-document Traceability

This document must remain aligned with:

- `01_Product/005_MVP_SCOPE.md`
- `02_PRD/001_MOBILE_APP_PRD.md`
- `02_PRD/002_AI_ANALYSIS_PRD.md`
- `02_PRD/005_MEAL_BUDDY_PRD.md`
- `03_AI/008_DATABASE_FIRST_AI_POLICY.md`
- `04_Data/001_DATA_MODEL_OVERVIEW.md`
- `05_UI/001_UI_PRINCIPLES.md`

When implementation changes, update PRD, data model, UI state, API contract, and acceptance criteria together.


## Acceptance Criteria

- Engineers can identify the responsible app, service, table, and route before coding.
- The MVP boundary is explicit and does not silently include post-MVP features.
- Free/Premium behavior is testable without reading product chat history.
- AI outputs are treated as estimates and can be corrected by the user.
- Privacy, consent, and RLS constraints are visible at the implementation layer.

