# 008 Testing Strategy

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines testing strategy for Haocu MVP.

## Test Levels

### Typecheck

Required for every meaningful code change.

### Unit Tests

Useful for:

- Limit calculations.
- Nutrition summary derivation.
- Chat sorting.
- Recommendation scoring helpers.
- Storage adapter behavior.
- Date/default meal card logic.

### Integration Tests

Useful for:

- AI analysis confirm → meal record created.
- Restaurant card → Meal Buddy card created.
- Invitation accepted → match/chat state updated.
- Group table join/leave.
- Premium entitlement enforcement.

### Manual Smoke Tests

Required before demo/release:

1. Home → AI analysis → confirm meal → Today Intake updates.
2. AI result → create Meal Buddy card → visible on Meal Buddy page.
3. Restaurant card → create Meal Buddy card → visible card context.
4. Chat message sent → chat list moves thread to top.
5. Group Table created/joined → group chat separate from one-to-one chat.
6. Free/Premium toggle changes limits and social identity visibility.
7. Food Diary shows saved meal/rating data.

## AI Testing

Track:

- Candidate correctness.
- Manual correction rate.
- Nutrition estimate reasonableness.
- Failure fallback.
- Cost per analysis.

## RLS Testing

At minimum:

- User cannot read another user's private meal records.
- Non-participant cannot read chat messages.
- Restaurant cannot update another restaurant's menu.
- Admin-only review tables are blocked from consumers.

## Demo Test Data

Demo data must be realistic enough to show product logic, but clearly separated from production data.
