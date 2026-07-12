# Personalization Engine

## Purpose
The personalization engine converts user behavior into practical product improvements: better recommendations, more relevant restaurants, and more compatible Meal Buddy suggestions.

Personalization should be gradual, transparent enough to feel trustworthy, and privacy-aware.

## Personalization Inputs

| Input | MVP | Usage |
|---|---:|---|
| Meal records | Yes | Nutrition summary and recommendation. |
| Food ratings | Yes | Taste memory. |
| Restaurant interactions | Yes | Restaurant ranking. |
| Corrections | Yes | Improve candidate ranking. |
| Health goals | Partial | Premium mode; professional review boundary. |
| Meal Buddy interactions | Yes | Social compatibility. |
| Chat content | No for MVP | Avoid using private chat content for ranking unless explicit consent and review. |
| Similar-user behavior | Post-MVP | Recommendation network. |

## Taste Memory

Taste memory stores user preferences inferred from explicit and implicit signals.

### Explicit Signals

- Dish rating.
- Restaurant rating.
- Favorite/save.
- Dislike/hide.
- Diet preference selection.
- Budget preference.
- Cuisine preference.

### Implicit Signals

- Clicks on recommendation.
- Meal record frequency.
- Repeat restaurant visits.
- Meal Buddy card creation from a dish.
- Correction patterns.
- Search queries.

## Preference Dimensions

- cuisine type
- protein preference
- carb preference
- vegetable preference
- spice level
- price sensitivity
- distance tolerance
- health orientation
- novelty vs familiarity
- social dining comfort
- meal time pattern

## Personalization Outputs

- Next meal suggestion reason.
- Restaurant ranking score.
- Candidate dish ranking.
- Meal Buddy compatibility score.
- Premium insight cards.
- Future “people with similar taste liked this” recommendation.

## MVP Scoring Approach

Use interpretable weighted scoring before complex models.

Example restaurant score:

```text
score =
  taste_match * 0.30 +
  nutrition_fit * 0.20 +
  distance_fit * 0.15 +
  current_meal_context * 0.15 +
  rating_history * 0.10 +
  novelty_bonus * 0.05 +
  availability * 0.05
```

This is easier to debug and explain than a black-box model in MVP.

## Cold Start Strategy

New users should receive useful recommendations from:

1. Onboarding preferences.
2. Current location or selected area.
3. Meal time.
4. Popular local dishes.
5. Demo-friendly restaurant seed data.
6. Early ratings.

## Privacy Boundaries

- Do not expose one user’s private meal history to another user.
- Similar-user recommendations should be aggregate and anonymized.
- Health goal data should not be used for social matching unless explicitly designed and consented.
- Anonymous/free social cards must not reveal real identity.

## Acceptance Criteria

1. Recommendations can be generated for users with no history.
2. Recommendations improve after ratings and saved meals.
3. User can correct or hide bad recommendations.
4. Social matching does not expose private health data.
5. Ranking logic is inspectable for debugging in MVP.
