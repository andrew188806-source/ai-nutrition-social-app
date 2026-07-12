# 004 Component Library

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines the component system direction.

## Component Principles

- Warm and clean.
- Consistent spacing.
- Clear hierarchy.
- Reusable cards.
- Minimal visual clutter.
- Friendly but not childish for core utility flows.

## Core Components

### Cards

- `MealSummaryCard`
- `AIResultCard`
- `MealBuddyCard`
- `SocialCard`
- `RestaurantCard`
- `GroupTableCard`
- `ChatThreadCard`
- `PremiumGateCard`

### Inputs

- `SearchInput`
- `FilterChips`
- `MealTimeSelector`
- `DateSelector`
- `PortionInput`
- `PaymentPreferenceSelector`

### States

- `LoadingState`
- `EmptyState`
- `ErrorState`
- `LimitReachedState`
- `VerificationBadge`

### Actions

- `PrimaryButton`
- `SecondaryButton`
- `GhostButton`
- `InlineAction`
- `CardActionRow`

## Styling Rules

- Do not use too many competing accent colors on one screen.
- Avoid green as the dominant brand color.
- Use high contrast for primary actions.
- Keep action buttons close to the content they act on.
- Use icons only when they clarify meaning.

## Accessibility

- Buttons must have clear labels.
- Text contrast must be readable.
- Touch targets must be large enough.
- Do not rely on color alone for status.
