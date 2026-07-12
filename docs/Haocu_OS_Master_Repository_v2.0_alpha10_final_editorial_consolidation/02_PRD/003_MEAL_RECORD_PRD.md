# Meal Record PRD

## Objective

Create a reliable meal record collection that powers today intake, full nutrition report, food diary, recommendation, and future personalization.

## Problem

A single `latestCorrectedMealRecord` style state is insufficient. It causes inconsistency between home, today intake, and nutrition report.

## Required Model Shift

Move from one latest corrected object to a real collection:

```text
meal_records[]
```

Each record must be independently identifiable, editable, and traceable.

## Record Types

- analyzed meal;
- corrected meal;
- manual meal;
- planned dinner;
- shared/guilt-distribution entry;
- restaurant dish save;
- future imported restaurant order.

## Required Fields

| Field | Description |
|---|---|
| `mealId` | Stable unique ID. |
| `userId` | Owner. |
| `sourceType` | analysis, corrected, manual, planned, shared. |
| `mealDate` | Local date. |
| `mealTime` | breakfast/lunch/dinner/snack/custom. |
| `dishName` | User-facing dish name. |
| `restaurantId` | Optional. |
| `nutrition` | Calories/macros/fiber/etc. |
| `confidence` | Estimate confidence. |
| `analysisId` | Optional source analysis. |
| `correctionHistory` | Original and edited assumptions. |
| `completionState` | finished/not_finished/did_not_eat. |
| `plannedState` | planned/consumed/cancelled. |
| `createdAt` | Timestamp. |
| `updatedAt` | Timestamp. |

## Primary Flow

```text
Analysis result
  -> User confirms/corrects
  -> Save meal record
  -> Update today intake
  -> Update food diary
  -> Feed recommendation
```

## Planned Dinner Rules

Planned dinner can be shown in today intake but must be visually distinct from consumed food.

- planned meals count as “planned estimate,” not consumed total unless user confirms;
- planned meal can be converted to consumed;
- planned meal can be cancelled;
- recommendation can use planned meal to avoid over-recommending similar items.

## Completion State

After meal or diary rating, user can mark:

- finished;
- not finished;
- did not eat.

This supports food diary quality and calorie/guilt sharing context.

## Functional Requirements

1. Create meal record from analysis.
2. Create meal record manually.
3. Create planned meal.
4. Update/correct meal record.
5. Delete/archive meal record where policy allows.
6. Read daily records by local date.
7. Compute daily nutrition summary from records.
8. Use same records for home and full report.
9. Support ratings and completion state.
10. Preserve source metadata.

## Data Dependencies

- `meal_records`
- `meal_analysis_results`
- `meal_corrections`
- `restaurants`
- `restaurant_dishes`
- `meal_ratings`

## API Dependencies

- `POST /meal-records`
- `GET /meal-records?date=YYYY-MM-DD`
- `PATCH /meal-records/{mealId}`
- `DELETE /meal-records/{mealId}` or archive equivalent
- `GET /nutrition/daily-summary?date=YYYY-MM-DD`

## Acceptance Criteria

1. User can save multiple meals per day.
2. Home summary and detail page show the same totals.
3. Planned dinner is visually distinct from consumed meals.
4. Corrected meal updates computed totals.
5. Food diary reads from stored records, not temporary UI state.
6. Meal record supports future multi-photo IDs without requiring UI now.

## MVP+ Enhancements

- Monthly trends.
- Advanced nutrient targets.
- Export/report.
- Restaurant order import.
- Family/household meal aggregation.
