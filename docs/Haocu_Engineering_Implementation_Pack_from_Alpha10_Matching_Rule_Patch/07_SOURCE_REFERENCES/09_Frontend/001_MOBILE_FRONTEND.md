# 001 Mobile Frontend

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines mobile frontend implementation for Haocu.

## Technology

- Expo React Native.
- TypeScript.
- Expo Router.
- Shared UI primitives.
- Centralized zh-TW i18n.
- Storage adapter for web/native persistence.

## Main Screens

### Home

Should show:

- Friendly greeting.
- Today nutrition summary card only, not full report.
- Primary shortcuts: AI analysis, Meal Buddy, restaurant recommendation.
- Scheduled dinner summary if present.

### AI Analysis

Should support:

- Camera/upload entry.
- Meal timing selection only where needed.
- Candidate result display.
- Manual correction expansion.
- Save to Today Intake.
- Create Meal Buddy card after analysis.

### Today Intake

Should show:

- Full nutrition report.
- Meals from durable meal record collection.
- Scheduled meal markers.
- Macro summary.
- Recommendation link.

### Food Diary

Should show:

- Saved meal cards.
- Ratings.
- Monthly summary.
- Top10 premium retention.

### Meal Buddy

Should show:

- My Meal Buddy cards.
- Matched users.
- Invitations.
- Chat list.
- Group Table entry.
- Search only where useful.

### Restaurants

Should show:

- Search/location/filter.
- Restaurant cards.
- Menu items.
- Create Meal Buddy card from restaurant card.
- Group Table entry that is not visually overwhelming.

### Profile

Should show:

- Anonymous/real profile mode.
- Mascot identity.
- Premium state.
- Health goals.
- Verification placeholder.

## UI Requirements

- Avoid green-heavy palette.
- Use warm, clean, high-contrast layout.
- Keep important actions near related cards.
- Avoid hiding date selectors at bottom.
- Keep mascot and real profile distinction visible.
