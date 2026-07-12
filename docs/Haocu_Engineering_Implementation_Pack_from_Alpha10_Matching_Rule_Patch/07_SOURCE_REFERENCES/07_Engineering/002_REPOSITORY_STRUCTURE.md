# 002 Repository Structure

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines the expected monorepo structure for Haocu engineering implementation.

## Target Monorepo

```text
haocu/
  apps/
    mobile/
      app/
      components/
      features/
      lib/
      theme/
      assets/
    restaurant-web/
      app/
      components/
      features/
      lib/
    admin-web/
      app/
      components/
      features/
      lib/
  packages/
    shared-types/
    shared-i18n/
    shared-utils/
    ui-tokens/
  supabase/
    migrations/
    functions/
    seed/
    policies/
  docs/
    repository/
    engineering/
  scripts/
```

## Mobile App Suggested Structure

```text
apps/mobile/
  app/
    index.tsx
    ai-analysis.tsx
    today-intake.tsx
    food-diary.tsx
    meal-buddies.tsx
    restaurants.tsx
    profile.tsx
  features/
    ai-analysis/
    meal-records/
    recommendations/
    meal-buddies/
    group-tables/
    chat/
    restaurants/
    premium/
  lib/
    supabase.ts
    storageAdapter.ts
    analytics.ts
    i18n/
  theme/
    components.tsx
    tokens.ts
```

## Shared Types

Shared types should include:

- `UserProfile`
- `MealRecord`
- `MealItem`
- `NutritionEstimate`
- `Restaurant`
- `MenuItem`
- `SocialCard`
- `MealBuddyCard`
- `MealBuddyMatch`
- `GroupTable`
- `ChatThread`
- `ChatMessage`
- `SubscriptionPlan`

## Rule

Do not define duplicate incompatible mock types inside individual pages. The same fake demo data should follow the same domain IDs as future real data.
