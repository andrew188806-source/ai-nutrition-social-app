# Restaurant UI

## Purpose
Define restaurant search/list/detail UI and its connection to recommendations, AI analysis, and Meal Buddy card creation.

## Restaurant List

Elements:

- Search input.
- Location/area selector.
- Meal time/type filter.
- Cuisine/type chips including “都可以”.
- Recommended restaurant cards.

List updates on the same page after filter change.

## Restaurant Card

Display:

- restaurant name
- category tags
- recommended dish
- distance/area
- nutrition-friendly badge if applicable
- rating/personal fit copy
- CTA: view detail
- CTA: use this restaurant/dish to create Meal Buddy card

## Date/Time Selector Placement

When creating a Meal Buddy card from restaurant detail, date/time selector should appear near the restaurant/card context, not hidden at the bottom of the screen.

## Restaurant Detail

Should look like a clean restaurant profile:

- hero/name/category
- recommended dishes
- menu items
- personal fit reason
- nutrition labels if available
- map/opening info
- Meal Buddy actions
- group table entry if applicable

## Recommended Dish Action

When user taps recommended dish:

Prompt:

“要用這餐建立飯友卡並尋找飯友嗎？”

Options:

- 建立飯友卡
- 先看餐點
- 取消

Remove duplicate “用這餐選飯友” option if it repeats the same function.

## New User-Uploaded Dishes

If AI identifies a new dish at a restaurant, UI may show it as user-uploaded/estimated until verified.

## Acceptance Criteria

1. Restaurant filters update list in place.
2. Date selector appears near relevant card/detail context.
3. Recommended dish can create Meal Buddy card.
4. Duplicate actions are removed.
5. User-created restaurant dish is not visually treated as verified official item.
