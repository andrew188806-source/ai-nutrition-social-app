# AI Analysis PRD

## Objective

Provide quick, explainable meal estimates from photos while allowing user correction and preserving trust.

## Product Role

AI analysis is the main activation hook. It must feel fast and useful even when imperfect.

## Inputs

- Meal photo from camera.
- Uploaded meal image.
- Meal timing context when applicable.
- Optional restaurant context.
- Optional dish/menu context.
- Existing user taste/nutrition profile.

## Outputs

- Candidate dishes.
- Estimated calories.
- Protein, carbs, fat, fiber.
- Ingredient breakdown.
- Portion assumptions.
- Confidence indicators.
- Balance notes.
- Correction affordance.
- Save action.

## Primary Flow

```text
Start analysis
  -> Take/upload photo
  -> Upload/process image
  -> Generate candidates
  -> Display top candidates + nutrition estimate
  -> User confirms or corrects
  -> Recalculate if corrected
  -> Save meal record
  -> Optional next actions
```

## Candidate Logic

The result should show a small number of plausible candidates rather than a long list. For MVP:

- show top candidate;
- show up to two alternatives;
- provide “以上皆非／手動輸入”;
- allow user to edit fields.

## Correction Flow

Manual correction fields:

- restaurant name or restaurant selection;
- dish name;
- ingredients;
- portion size;
- cooking method;
- nutrition estimate override if needed;
- notes.

Correction must:

- preserve original AI result;
- create correction history;
- recalculate nutrition estimate;
- update saved meal record only after user confirms.

## Functional Requirements

1. User can start from home, analysis tab, or post-meal flow.
2. System supports camera and upload entry.
3. Result page shows nutrition estimate and assumptions.
4. User can accept a candidate.
5. User can choose none/manual.
6. User can correct and save.
7. Result state persists when user navigates away and returns.
8. AI-generated meal-buddy card date defaults to current day.
9. The same analysis result can feed meal record, recommendation, and meal-buddy card flow.

## Nutrition Estimate Requirements

Estimate must include:

- calories;
- protein;
- carbohydrates;
- fat;
- fiber;
- optional sodium/sugar where available;
- confidence/assumption metadata.

Language should say “estimate,” not “diagnosis” or “guaranteed.”

## Data Model Dependencies

- `meal_analysis_results`
- `meal_analysis_candidates`
- `meal_records`
- `meal_corrections`
- `restaurant_dishes`
- `food_items`
- `analysis_photos`

## API Dependencies

Suggested endpoints/functions:

- `POST /analysis/photo`
- `GET /analysis/{analysisId}`
- `POST /analysis/{analysisId}/correct`
- `POST /meal-records/from-analysis`

## Empty / Loading / Error States

### Loading

- Show progress text such as “正在分析餐點…”
- Do not show blank white screen.

### Low Confidence

- Show candidates with lower confidence language.
- Encourage correction.

### Upload Failure

- Let user retry or manually enter meal.

### No Candidate

- Open manual entry directly.

## Analytics Events

- `analysis_started`
- `photo_captured`
- `photo_uploaded`
- `analysis_completed`
- `analysis_candidate_selected`
- `analysis_manual_entry_opened`
- `analysis_corrected`
- `analysis_saved_to_meal`
- `analysis_failed`

## Acceptance Criteria

1. User can get an analysis result from photo/upload.
2. User can correct result without restarting.
3. Corrected result recalculates nutrition.
4. Saved record preserves original and corrected data.
5. Result does not reset when user leaves and returns.
6. UI states are understandable in Traditional Chinese.
7. Nutrition language remains non-medical and assumption-based.

## MVP+ Enhancements

- Better food recognition model.
- Restaurant-menu matching before generic recognition.
- Similar dish search.
- Multi-photo capture UI.
- User-specific portion learning.
