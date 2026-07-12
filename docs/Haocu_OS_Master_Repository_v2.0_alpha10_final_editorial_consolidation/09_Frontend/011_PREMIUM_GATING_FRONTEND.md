# 011 Premium Gating Frontend

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines frontend premium gating.

## Premium Principles

- Show value before blocking.
- Do not make free experience feel broken.
- Display limits clearly.
- Backend/service must enforce actual limits.

## Gated Features

### Meal Buddy

Free:

- Lower daily card creation limit.
- Fewer candidate recommendations.
- Single invite behavior where defined.

Premium:

- Higher daily card creation limit.
- More candidates.
- Multi-select where defined.

### Social Identity

Free:

- Anonymous mascot card.

Premium:

- Real profile unlock.
- Verification pathway.

### Food Diary

Free:

- Shorter retention window.

Premium:

- Top10 saved views by area/type/date.

### Health Goal Mode

Premium can set more specific goal deadline/target calculations.

## UI Components

- `PremiumGateCard`
- `LimitChip`
- `UpgradeInlineHint`
- `PremiumBadge`
- `PlanComparisonModal`

## Copy Rule

Avoid fear/shame copy. Emphasize convenience, personalization, and richer matching.
