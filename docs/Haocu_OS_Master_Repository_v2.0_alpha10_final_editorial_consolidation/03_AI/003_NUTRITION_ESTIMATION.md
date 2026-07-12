# Nutrition Estimation

## Purpose
Define how Haocu estimates calories, macronutrients, and selected micronutrients for outside-food meals.

Nutrition estimation must be useful for behavior guidance, not presented as laboratory-grade measurement.

## Estimation Hierarchy

Haocu uses the most reliable available source in this order:

1. Verified restaurant/menu nutrition data.
2. Restaurant-provided ingredient and portion data.
3. User-corrected prior records for the same dish.
4. Internal food/ingredient database.
5. AI-estimated dish composition from photo.
6. Manual user input.

## Nutrition Fields

### MVP Required

- calories_kcal
- protein_g
- carbs_g
- fat_g
- fiber_g
- sodium_mg if available
- sugar_g if available
- confidence_level
- estimation_source

### MVP+ / Professional Review Required

- saturated_fat_g
- cholesterol_mg
- potassium_mg
- calcium_mg
- iron_mg
- vitamin flags
- meal balance score
- diet pattern tags

## Portion Estimation

Portion estimation should combine visible plate/container signals, restaurant/menu default portion, user correction history, and common serving-size templates.

### Portion Fields

- `portion_label`: small, medium, large, custom
- `portion_multiplier`
- `estimated_weight_g`
- `component_weights`
- `portion_confidence`

Example:

```json
{
  "portion_label": "medium",
  "portion_multiplier": 1.0,
  "estimated_weight_g": 520,
  "component_weights": {
    "rice": 180,
    "chicken_breast": 140,
    "egg": 55,
    "vegetables": 120
  },
  "portion_confidence": "medium"
}
```

## Confidence Model

Nutrition confidence should be stored internally and may be simplified for UI.

| Level | Meaning | UI Treatment |
|---|---|---|
| High | Verified menu data or repeated corrected record. | Normal display. |
| Medium | Good dish match with reasonable portion estimate. | Display with editable assumption. |
| Low | Generic visual estimate or uncertain dish composition. | Encourage correction. |

## Correction Behavior

When users edit nutrition-related fields, the system must:

1. Preserve original AI estimate.
2. Store corrected values.
3. Store correction reason if available.
4. Use corrected result for diary and recommendation.
5. Feed aggregate correction patterns into future ranking after privacy review.

## Balance Score

The MVP may use a simple meal balance score for user understanding. It should be positioned as a product heuristic, not a medical score.

Candidate inputs:

- protein adequacy
- vegetable/fiber presence
- excessive calories relative to meal context
- sodium risk signal
- sugar signal
- fried/processed tag

Output should be copy-friendly:

- “蛋白質充足”
- “蔬菜偏少”
- “晚餐建議選清爽一點”

## Safety Copy

Avoid:

- “This is medically recommended.”
- “You must eat X.”
- “Guaranteed weight loss.”
- “Exact calorie certainty.”

Use:

- “估算”
- “可能偏高/偏低”
- “可作為日常參考”
- “若有疾病或特殊飲食需求，請諮詢專業人員”

## Acceptance Criteria

1. Every saved meal has calories, protein, carbs, fat, and fiber fields.
2. Every nutrition result includes source and confidence metadata.
3. User correction overwrites display values but preserves AI original values.
4. Recommendation engine uses corrected values when available.
5. Low-confidence estimates produce correction-friendly UI.
6. Health-sensitive copy avoids clinical claims.
