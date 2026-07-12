# 001 System Overview

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document describes the complete Haocu MVP system architecture from client apps to backend, AI services, database, and operational tooling.

## System Boundary

Haocu v2.0 is composed of four primary surfaces:

1. **Mobile App** — consumer-facing app for AI meal analysis, meal records, recommendations, Meal Buddy, Group Table, chat, profile, and premium experience.
2. **Restaurant Web Console** — restaurant-facing web app for menu, ingredients, nutrition disclosure, blue-check verification workflow, and group table participation.
3. **Admin Console** — internal review surface for restaurant verification, nutrition disclosure review, abuse review, premium/support operations, and audit records.
4. **Backend Platform** — Supabase-backed data, auth, storage, edge functions, API orchestration, AI analysis, event logging, and notification triggers.

## High-level Topology

```text
Expo Mobile App
  ├─ AI meal analysis flow
  ├─ Today intake / Food diary
  ├─ Meal Buddy / Group Table / Chat
  ├─ Restaurant recommendation
  └─ Premium profile and limits
        │
        ▼
Supabase API Gateway / Edge Functions
  ├─ Auth and profile context
  ├─ Meal service
  ├─ AI orchestration service
  ├─ Recommendation service
  ├─ Social matching service
  ├─ Chat / invitation service
  ├─ Premium limit service
  └─ Admin review service
        │
        ▼
Supabase Postgres + RLS + Storage
  ├─ users / profiles
  ├─ meals / meal_items / nutrition_estimates
  ├─ restaurants / menu_items / ingredients
  ├─ ai_analysis_jobs / corrections
  ├─ social_cards / meal_buddy_cards / matches
  ├─ group_tables / chat_threads / messages
  ├─ subscriptions / usage_limits
  ├─ consent_records / audit_logs
  └─ analytics_events
```

## Core Data Flow

### AI Meal Analysis

1. User selects or captures a meal photo.
2. Client uploads image to controlled storage bucket.
3. Backend creates `ai_analysis_jobs` record.
4. AI service checks known restaurant/menu data first.
5. AI returns candidate meal items and estimated nutrition.
6. User confirms or corrects the result.
7. Confirmed result becomes a meal record and can support future recommendation/personalization.

### Meal Buddy

1. User analyzes meal or selects restaurant/menu item.
2. App creates Meal Buddy card subject to daily usage limits.
3. Matching service ranks compatible users based on meal intent, location/time, nutrition preference, and social constraints.
4. User sends invitation to chat or dine.
5. Accepted invitation creates or updates match and chat state.

### Group Table

1. Premium user can open a group table.
2. Participants join from restaurant context or Meal Buddy context.
3. Group table uses its own chat thread, independent of one-to-one chat.
4. After meal completion, completion and calorie sharing feedback can be recorded.

## MVP Architecture Constraint

MVP must avoid unnecessary distributed complexity. Use Supabase and Edge Functions as the primary backend. Introduce queues, vector database, specialized search infrastructure, or external event buses only when load or data complexity requires it.

## Non-goals for MVP

- Full production-grade multi-region architecture.
- Automated medical/nutritional diagnosis.
- Fully automatic user nutrition record modification from group calorie sharing.
- Multi-photo capture UI for a single meal; data model may support it, UI is post-MVP.
- Complex restaurant POS integration.


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

