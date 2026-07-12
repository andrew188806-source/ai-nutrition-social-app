# Database-First AI Policy

## Policy Statement
When structured restaurant or menu data exists, Haocu must prefer that data over image-only AI inference.

This is a core product decision because Haocu’s long-term moat depends on combining AI with proprietary restaurant/menu data, not treating every meal as a generic photo-recognition task.

## Why This Matters

Image-only food recognition is often uncertain because:

- Many dishes look visually similar.
- Portion sizes are hard to infer from photos.
- Sauces, oils, and hidden ingredients are not visible.
- Local restaurant recipes vary.
- Packaging may hide components.

Restaurant/menu data can provide:

- Actual dish name.
- Standard ingredients.
- Portion defaults.
- Cooking method.
- Price.
- Nutrition disclosure.
- Availability.

## Lookup Order

1. Explicit menu item selected by user.
2. Restaurant page context.
3. QR/menu context.
4. User search context.
5. Nearby restaurant candidates.
6. User’s recent corrected records.
7. Global food database.
8. Pure visual AI estimate.

## Decision Matrix

| Situation | Result |
|---|---|
| User selected menu item | Use menu item as primary, photo as validation. |
| Restaurant known, dish uncertain | Rank restaurant menu candidates first. |
| Restaurant unknown, dish visually obvious | Use visual candidate with generic database nutrition. |
| Low confidence and no database match | Show manual entry path. |
| User correction conflicts with database | Store correction; do not overwrite verified restaurant record automatically. |

## Data Integrity Rules

- User corrections improve personal and aggregate ranking, but verified restaurant data requires review before modification.
- AI-generated nutrition for restaurant menu items must be labeled as estimated until verified.
- Admin-approved nutrition disclosure is a separate status.

## Engineering Implications

The AI analysis service should call a candidate retrieval layer before model inference whenever context is available.

Required services:

- `restaurantCandidateService`
- `menuItemCandidateService`
- `foodDatabaseService`
- `aiVisionService`
- `nutritionEstimateService`
- `correctionService`

## Acceptance Criteria

1. Analysis launched from restaurant card uses restaurant menu candidates first.
2. User-selected dish does not get overwritten by image-only model result.
3. AI-generated restaurant nutrition is not marked verified by default.
4. Corrections are stored without corrupting master menu data.
5. Fallback path works when no structured data exists.
