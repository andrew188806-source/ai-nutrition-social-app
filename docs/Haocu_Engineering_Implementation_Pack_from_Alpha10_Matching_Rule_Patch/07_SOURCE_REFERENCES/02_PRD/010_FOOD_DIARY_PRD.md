# Food Diary PRD

## Objective

Help users review meals, ratings, favorites, nutrition summaries, and food memories over time.

## Product Role

Food diary turns meal records into retained value. It also supplies taste data for recommendations.

## Core Features

- Recent day cards.
- Daily meal list.
- Meal rating.
- Completion state.
- Favorites/saved meals.
- Monthly summary card.
- Free/premium saved-window distinction.
- Optional social sharing surface.

## Home vs Diary Boundary

Home should show only a compact today nutrition summary.

Full details belong in:

- Today Intake detail page.
- Food Diary.
- Nutrition report page.

## Functional Requirements

1. Show recent days, default around last three days.
2. Allow user to open a day and see meals.
3. Show consumed and planned meals distinctly.
4. Support rating after meal.
5. Support completion state: finished, not finished, did not eat.
6. Support favorites/saved items.
7. Support free/premium saved-window differences.
8. Provide share-ready surfaces without exposing private data by default.

## Rating Model

Meal rating should capture:

- taste score;
- whether user finished meal;
- optional note;
- whether user would eat again;
- optional tags.

Ratings feed recommendation but do not need to be public.

## Data Dependencies

- `meal_records`
- `meal_ratings`
- `food_diary_days`
- `favorite_meals`
- `premium_entitlements`

## API Dependencies

- `GET /food-diary?range=`
- `GET /food-diary/{date}`
- `POST /meal-ratings`
- `POST /favorite-meals`
- `DELETE /favorite-meals/{id}`

## Analytics Events

- `food_diary_viewed`
- `food_diary_day_opened`
- `meal_rated`
- `meal_favorited`
- `diary_share_started`
- `premium_history_gate_viewed`

## Acceptance Criteria

1. Saved meals appear in diary.
2. Diary and today intake use same meal records.
3. Rating updates recommendation-relevant data.
4. Completion state can be saved.
5. Free/premium window is represented clearly.
6. Sharing does not expose private details without user intent.

## MVP+ Enhancements

- Full calendar expansion.
- Top 10 by region/type/date.
- Weekly/monthly nutrition trend.
- Friend wall.
- IG story templates.
