# Food Recognition Pipeline

## Goal
Convert a meal photo into a useful, correctable meal analysis that can be saved as a meal record, used for daily nutrition summary, and optionally converted into a Meal Buddy card.

The pipeline must prioritize speed, correction, and structured data reuse over pretending to achieve perfect visual accuracy.

## Input Sources

| Source | MVP | Notes |
|---|---:|---|
| User photo | Yes | Camera or upload. |
| User-selected meal type | Yes | Breakfast, lunch, dinner, snack, or unspecified. |
| Restaurant context | Yes | If launched from restaurant page or selected manually. |
| Location context | Optional | Used for restaurant candidate ranking, not required. |
| User history | Yes | Recent foods and common corrections improve ranking. |
| Menu database | Yes | Used before image-only inference. |
| Multi-photo set | Deferred | Data model prepared; UI deferred. |

## Pipeline Stages

### Stage 1: Intake
The app receives the photo and context fields:

- `userId`
- `photoId`
- `mealType`
- `restaurantId` if known
- `menuItemId` if known
- `captureSource`: camera, upload, restaurant_card, recommendation
- timestamp

### Stage 2: Image Quality Check
The system performs lightweight checks before expensive AI calls.

Checks:

- Image exists and is readable.
- Food area is visible enough.
- Image is not too dark, blurry, or empty.
- File size and format are acceptable.
- No obvious prohibited content.

If quality is low, the UI should provide a retry or manual entry option rather than blocking the user completely.

### Stage 3: Database-First Candidate Lookup
If restaurant/menu context exists, the system retrieves candidate dishes from the structured database.

Priority order:

1. Exact `menuItemId` if user selected a dish.
2. Restaurant menu items matching visual/text signals.
3. User’s recent corrected dishes at the same restaurant.
4. Similar dishes from the global food database.
5. Generic photo-recognition candidates.

### Stage 4: Visual Recognition
The model identifies likely dish categories, visible ingredients, container size, and cooking style signals.

Expected output:

```json
{
  "dishCandidates": [
    {
      "name": "Chicken breast bento",
      "confidence": 0.82,
      "visibleIngredients": ["chicken breast", "rice", "egg", "greens"],
      "cookingSignals": ["grilled", "boxed meal"],
      "portionSignals": {
        "rice": "medium",
        "protein": "large",
        "vegetables": "medium"
      }
    }
  ]
}
```

### Stage 5: Candidate Ranking
Candidates are ranked using:

- Visual confidence.
- Restaurant/menu match.
- User history.
- Local food vocabulary.
- Meal time.
- Recent corrections.
- Dish availability at current restaurant.

The UI should show top candidates, not an uneditable result.

### Stage 6: User Confirmation and Correction
The user can:

- Accept top candidate.
- Select one of the other candidates.
- Choose “none of the above.”
- Edit restaurant, dish, ingredients, portion, cooking method, and nutrition.
- Save corrected result.

### Stage 7: Meal Record Creation
The accepted or corrected analysis becomes a structured meal record. The original AI result must be preserved separately from the corrected user-approved result.

## Candidate UI Rules

- Show top 3 candidates in MVP.
- Include a clear manual path.
- Avoid technical confidence percentages in user UI unless explicitly designed.
- Use friendly uncertainty copy such as “可能是” rather than “100% identified.”

## Error Handling

| Scenario | Expected Behavior |
|---|---|
| No food detected | Offer retake/upload/manual entry. |
| Low confidence | Show candidate list and ask user to confirm. |
| Restaurant mismatch | Allow changing restaurant. |
| Menu item unavailable | Fall back to generic food database. |
| AI timeout | Save photo as pending analysis and allow manual entry. |
| Network failure | Retry and preserve user input. |

## Data Outputs

- `ai_analysis_runs`
- `ai_candidates`
- `meal_records`
- `meal_record_corrections`
- `nutrition_estimates`
- `photo_assets`

## Acceptance Criteria

1. A user can upload or capture one meal photo.
2. The system returns up to 3 dish candidates.
3. Restaurant/menu data is used first when available.
4. User can correct the result before saving.
5. Saved result updates today’s nutrition summary.
6. Saved result can create a Meal Buddy card.
7. Original AI candidate and corrected user result are both stored.
