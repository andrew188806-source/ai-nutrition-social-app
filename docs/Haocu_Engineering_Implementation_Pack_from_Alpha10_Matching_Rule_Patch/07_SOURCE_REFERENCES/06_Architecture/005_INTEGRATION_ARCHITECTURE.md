# 005 Integration Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines how Haocu integrates AI models, storage, notifications, analytics, external restaurant/location services, and future payment systems.

## Integration Principles

- Integrations must be replaceable behind service boundaries.
- Client apps should not call AI providers directly.
- Sensitive keys stay server-side.
- Integration failure should degrade gracefully.
- All state-changing integration results should be traceable through logs or database records.

## AI Integration

AI model calls are orchestrated through backend functions.

Flow:

1. Client uploads image.
2. Backend creates job.
3. Backend performs database lookup.
4. Backend calls AI model only if structured data is insufficient.
5. Backend stores candidates and confidence.
6. Client presents editable result.
7. User correction updates training/evaluation data.

## Storage Integration

Storage buckets:

- `meal-photos`
- `restaurant-photos`
- `menu-photos`
- `profile-images`
- `admin-evidence`

Access strategy:

- Private buckets for user meal photos.
- Public or signed URLs for restaurant/menu display images.
- Admin evidence private by default.
- User deletion requests must include storage cleanup policy.

## Notification Integration

MVP notifications can begin as in-app events and later expand to push/email.

Notification types:

- Meal rating reminder after meal completion window.
- Invitation received.
- Invitation accepted/declined.
- Group table status change.
- Premium limit reached.
- Restaurant review status update.

## Analytics Integration

Analytics should log product events without storing unnecessary private content.

Core events:

- `ai_analysis_started`
- `ai_analysis_confirmed`
- `meal_record_created`
- `meal_buddy_card_created`
- `invitation_sent`
- `chat_message_sent`
- `group_table_joined`
- `premium_gate_viewed`
- `restaurant_card_opened`

## External APIs

Potential future external APIs:

- Maps/geocoding.
- Payment/subscription platform.
- Email delivery.
- Push notification service.
- Restaurant POS integration.
- Nutrition reference database.

MVP should not hard-depend on external services where mock/demo fallback is sufficient.


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

