# Recommendation PRD

## Objective

Recommend meals, dishes, and restaurants based on personal taste, current nutrition state, location intent, and similar-user signals.

## Product Differentiation

Haocu should not simply show popular restaurants. It should answer:

> “What fits this user right now?”

## Recommendation Types

1. Next meal recommendation.
2. Restaurant recommendation.
3. Dish recommendation inside restaurant.
4. Meal-buddy compatible food/restaurant recommendation.
5. Premium health-goal recommendation.

## Input Signals

| Signal | Source | MVP Use |
|---|---|---|
| Today intake | meal_records | Balance next meal. |
| User ratings | meal_ratings | Taste personalization. |
| Similar users | taste graph | MVP+ or mock. |
| Restaurant dishes | restaurant_dishes | Candidate pool. |
| Location/search | user input | Restaurant filtering. |
| Meal type | user input/context | Relevance. |
| Premium health goal | profile | Premium mode. |
| Social intent | meal_buddy_cards | Candidate matching. |

## Primary Flow

```text
User opens recommendation
  -> System reads intake/profile/location intent
  -> Candidate meals/restaurants generated
  -> Ranking applies taste + nutrition + context
  -> UI shows clean recommendation cards
  -> User taps, saves, creates card, or dismisses
```

## Recommendation Explanation

Each recommendation should include a short explanation, such as:

- “今天蛋白質偏少，這餐可以補一點。”
- “你常給清爽便當高分。”
- “附近有符合你口味的低油餐盒。”
- “這間適合建立飯友卡，晚餐時段有人也想吃。”

## Functional Requirements

1. Generate recommendations from current user context.
2. Provide restaurant and dish candidates.
3. Explain why each item is recommended.
4. Allow user to take action: save, view restaurant, create meal-buddy card.
5. Respect free/premium candidate limits.
6. Avoid recommending unavailable or implausible dishes.
7. Use fallback when data is sparse.

## Ranking Principles

MVP ranking can use simple weighted rules:

```text
score = tasteFit + nutritionFit + locationFit + timeFit + socialFit + freshness
```

MVP+ can introduce embeddings and learned ranking.

## Empty States

- No location: ask for search/location input.
- No meal history: use onboarding preference and popular local seed data.
- No restaurants: show manual suggestion and broaden search.
- No social candidates: suggest creating card or changing time/location.

## Data Dependencies

- `meal_records`
- `meal_ratings`
- `user_preferences`
- `restaurants`
- `restaurant_dishes`
- `meal_buddy_cards`
- `taste_similarity_edges`

## API Dependencies

- `GET /recommendations/next-meal`
- `GET /recommendations/restaurants`
- `GET /recommendations/social-candidates`
- `POST /recommendations/{id}/feedback`

## Analytics Events

- `recommendation_viewed`
- `recommendation_clicked`
- `recommendation_saved`
- `recommendation_dismissed`
- `recommendation_explanation_viewed`
- `restaurant_from_recommendation_opened`
- `meal_buddy_from_recommendation_created`

## Acceptance Criteria

1. User sees at least one useful recommendation after saving a meal.
2. User understands why an item appears.
3. Recommendation action paths work.
4. Free/premium candidate limits are respected.
5. Sparse-data fallback does not look broken.
6. Recommendations do not imply medical treatment.

## MVP+ Enhancements

- Taste embeddings.
- Similar-user collaborative filtering.
- Seasonal/contextual food logic.
- Restaurant demand prediction.
- A/B testing of ranking formulas.
