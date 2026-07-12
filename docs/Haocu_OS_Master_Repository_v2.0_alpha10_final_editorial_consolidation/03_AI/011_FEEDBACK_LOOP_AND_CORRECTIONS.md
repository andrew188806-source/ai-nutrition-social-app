# Feedback Loop and Corrections

## Purpose
User corrections are the most important path from generic AI to Haocu-specific intelligence. This document defines how corrections should be captured and used.

## Correction Types

| Correction | Examples | Usage |
|---|---|---|
| Dish correction | AI says chicken rice; user selects pork bento. | Improve candidate ranking. |
| Ingredient correction | Add egg, remove sauce. | Improve nutrition estimate. |
| Portion correction | Rice half portion, protein large. | Improve portion templates. |
| Cooking method correction | Fried vs grilled. | Improve calories/fat estimate. |
| Restaurant correction | Wrong restaurant or branch. | Improve context lookup. |
| Nutrition correction | User manually edits calories/macros. | Use for diary and personal history. |

## Storage Rule
Store original AI output and corrected user-approved output separately.

Do not destructively overwrite the AI result. This allows evaluation, debugging, and model improvement.

## Correction-to-Learning Flow

1. User edits AI result.
2. App saves correction event.
3. Meal record uses corrected value.
4. AI evaluation compares original vs corrected.
5. Ranking rules are adjusted if repeated pattern appears.
6. Restaurant/menu master data is updated only after admin/professional review when appropriate.

## Personal vs Global Learning

### Personal Learning
Can be used quickly:

- User always halves rice.
- User frequently eats the same breakfast.
- User rates light meals higher.

### Global Learning
Requires governance:

- Many users correct the same restaurant dish.
- A menu item has repeated nutrition discrepancy.
- A dish category has systematic estimate bias.

## UI Requirements

Correction must feel easy, not punitive.

UI should support:

- “以上皆非” path.
- Manual dish input.
- Ingredient edit.
- Portion edit.
- Cooking method edit.
- Nutrition edit for advanced users.

## Analytics Events

- `ai_candidate_selected`
- `ai_candidate_rejected`
- `meal_correction_started`
- `meal_correction_saved`
- `nutrition_field_corrected`
- `manual_entry_used`
- `analysis_saved_to_diary`

## Acceptance Criteria

1. Corrections are linked to the original AI run.
2. Corrected values power diary and recommendations.
3. Restaurant master data is not automatically overwritten by user correction.
4. Correction events are available for evaluation dashboard.
5. The manual path remains available even when AI fails.
