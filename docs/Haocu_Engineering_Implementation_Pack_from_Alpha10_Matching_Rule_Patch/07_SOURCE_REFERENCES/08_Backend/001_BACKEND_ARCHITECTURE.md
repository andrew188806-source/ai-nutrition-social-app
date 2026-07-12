# 001 Backend Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines the backend architecture for Haocu MVP.

## Platform

Backend platform:

- Supabase Postgres.
- Supabase Auth.
- Supabase Storage.
- Supabase Row Level Security.
- Supabase Edge Functions.

## Backend Layers

```text
Client Apps
  ↓
API / Edge Function Layer
  ↓
Service Layer
  ↓
Domain Logic
  ↓
Repository / Supabase Queries
  ↓
Postgres + Storage + RLS
```

## Core Services

- `ProfileService`
- `MealService`
- `AIAnalysisService`
- `RestaurantService`
- `RecommendationService`
- `MealBuddyService`
- `InvitationService`
- `ChatService`
- `GroupTableService`
- `PremiumService`
- `AdminReviewService`
- `AnalyticsService`
- `AuditService`

## Backend Responsibilities

### Must own

- Premium and usage limit checks.
- AI job lifecycle.
- Meal record persistence.
- Invitation state transitions.
- Group Table participant changes.
- Chat participant authorization.
- Admin review decisions.
- Audit log creation.

### May delegate to client for MVP demo

- Local UI filtering.
- Non-sensitive sort order.
- Draft state.
- Mock-only simulation.

## Database Transaction Rule

Operations that update multiple related records must be atomic where possible.

Examples:

- Accept invitation → update invitation + match + chat thread.
- Create Meal Buddy card → check limit + create card + update counter.
- Join Group Table → check capacity + insert participant + create system message.

## Security Rule

Do not use service role keys in client apps. Service role operations belong in server-side/Edge Function context only.
