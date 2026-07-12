# AI Analysis UI

## Purpose
Define the user experience for food photo analysis, candidate selection, correction, and saving to diary.

## Flow

```text
Entry
  → Capture/Upload
  → Optional meal type/context
  → AI analyzing state
  → Candidate result
  → Accept or correct
  → Save to today intake
  → Next action: recommendation / find Meal Buddy / diary
```

## Capture Screen

Required elements:

- Camera/upload choice.
- Simple instruction copy.
- Optional meal type selector if not already known.
- Retake option.

Remove redundant “目前這餐是哪一餐？” after photo if the meal type can be selected before or inferred in the flow.

## Analyzing State

Should feel lightweight:

- mascot animation or simple progress indicator
- copy: “正在幫你估算這餐…”
- avoid fake technical complexity

## Result Screen

Show:

- dish candidate name
- calories/macros summary
- ingredient breakdown
- balance summary
- top 3 candidates
- correction/edit button
- save to today intake
- find Meal Buddy CTA

## Candidate Correction

Three-layer correction path:

1. Pick candidate.
2. “以上皆非 / 手動輸入.”
3. Manual detail fields:
   - restaurant
   - dish
   - ingredients
   - portion
   - cooking method
   - nutrition values

## Save Confirmation

After save:

- update today intake
- show saved state
- provide next actions:
  - “用這餐找飯友？”
  - “看下一餐建議”
  - “回今日飲食”

## Error States

| State | UI |
|---|---|
| Low confidence | Show candidates and encourage edit. |
| No food detected | Retake/upload/manual entry. |
| Network error | Retry/manual entry. |
| AI timeout | Pending/manual fallback. |
| Upload failed | Retry upload. |

## Acceptance Criteria

1. User can complete analysis and save meal within one flow.
2. Top 3 candidates are visible or accessible.
3. Manual entry is available.
4. Saved meal updates today intake.
5. Analysis result can create Meal Buddy card.
6. UI copy avoids false certainty.
