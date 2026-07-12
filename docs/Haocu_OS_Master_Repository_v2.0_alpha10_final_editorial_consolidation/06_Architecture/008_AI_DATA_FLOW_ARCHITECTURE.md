# 008 AI Data Flow Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document connects AI architecture to data persistence and product flows.

## Database-first Rule

AI meal analysis must attempt structured lookup before model inference:

1. Known restaurant/menu item.
2. Similar verified menu item.
3. User correction history.
4. General food recognition model.
5. Manual user correction.

This protects product quality and supports long-term defensibility.

## AI Analysis Flow

```text
Photo uploaded
  ↓
Storage object created
  ↓
ai_analysis_jobs.created
  ↓
Database lookup
  ↓
Model inference if needed
  ↓
Candidate meals generated
  ↓
User confirms/corrects
  ↓
meal_records + nutrition_estimates created
  ↓
ai_corrections stored
  ↓
Recommendation and taste memory updated
```

## Candidate Handling

The AI result can show multiple candidate dishes. The user may:

- Confirm the top candidate.
- Pick another candidate.
- Choose “以上皆非 / 手動輸入”.
- Edit ingredient, portion, cooking method, restaurant, and nutrition values.

Confirmed/corrected data is more valuable than raw AI output.

## Confidence Model

Each AI output should store:

- Dish confidence.
- Ingredient confidence.
- Portion confidence.
- Nutrition estimate range.
- Source type: known menu, similar menu, model inference, manual.

## Recommendation Data Flow

Recommendations should read:

- Today intake.
- Health goal preferences.
- User taste profile.
- Restaurant/menu availability.
- Prior ratings.
- Similar-user taste signals.
- Meal Buddy/social context if relevant.

## Safety Boundary

The system can provide dietary suggestions, but must not provide medical diagnosis or treatment. Health goal mode must communicate estimation and encourage professional advice for medical conditions.

## Cost Control

Avoid repeated model calls when:

- Image hash or job result already exists.
- Restaurant/menu item is known.
- User has selected a known menu item directly.
- Existing correction can support the estimate.
