# Restaurant PRD

## Objective

Represent restaurants as structured places where dish data, nutrition estimates, recommendation, and social meal actions converge.

## User Problems

- Users want restaurant suggestions that fit personal taste, not just public popularity.
- Users need realistic dish options.
- Users may want to create a meal-buddy card from a restaurant.
- Restaurants need a path to contribute data without requiring full POS integration.

## Core Surfaces

1. Restaurant list.
2. Restaurant card/detail.
3. Dish/menu list.
4. Restaurant recommendation explanation.
5. Create meal-buddy card from restaurant.
6. Optional group table entry.

## Functional Requirements

### Restaurant List

- Supports location intent.
- Supports search.
- Supports meal type filter.
- Supports food type filter including “都可以”.
- Updates list on same page when filters change.

### Restaurant Card

- Shows restaurant name, type, distance/location text, short description.
- Shows representative dishes.
- Shows why recommended.
- Provides create meal-buddy card action.
- Avoids redundant “use this meal” actions.

### Dish List

- Dishes must be plausible for restaurant type.
- Dish may include nutrition estimate.
- Dish may include tags such as high protein, light, comfort food, spicy, etc.

### Restaurant-to-Meal-Buddy Flow

- Date/time selector appears near restaurant card context.
- User confirms food/restaurant/time/payment/chat preference.
- After creation, app navigates to visible meal-buddy card.

## Data Dependencies

- `restaurants`
- `restaurant_locations`
- `restaurant_dishes`
- `dish_nutrition_estimates`
- `restaurant_tags`
- `meal_buddy_cards`
- `user_restaurant_actions`

## API Dependencies

- `GET /restaurants`
- `GET /restaurants/{restaurantId}`
- `GET /restaurants/{restaurantId}/dishes`
- `POST /restaurants/{restaurantId}/meal-buddy-card`

## Empty / Error States

- No restaurants nearby: broaden filters or search manually.
- No dishes: show restaurant card without dish nutrition.
- Nutrition unreviewed: label as estimate.
- Create card failed: keep selected restaurant/time and allow retry.

## Analytics Events

- `restaurant_list_viewed`
- `restaurant_filter_changed`
- `restaurant_card_viewed`
- `restaurant_dish_viewed`
- `restaurant_meal_buddy_started`
- `restaurant_meal_buddy_created`
- `restaurant_map_opened`

## Acceptance Criteria

1. User can browse restaurant list.
2. User can understand why a restaurant appears.
3. User can open restaurant card and see plausible dishes.
4. User can create a meal-buddy card from restaurant card.
5. Date/time selection is not hidden at bottom.
6. Nutrition and review states are not misleading.

## Professional Review Boundary

Before production, review:

- restaurant data source legality;
- nutrition claim language;
- paid placement labeling;
- partner terms;
- restaurant dispute process.
