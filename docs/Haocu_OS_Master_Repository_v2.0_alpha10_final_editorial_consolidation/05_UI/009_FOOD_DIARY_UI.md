# Food Diary UI

## Purpose
Define today intake, food diary, ratings, saved records, and history visibility.

## Today Intake Page

Shows full daily report:

- meal list
- calories/macros summary
- nutrition balance
- planned dinner
- saved AI analyses
- edit/remove meal
- next meal recommendation

Home only shows compact summary; full details belong here.

## Food Diary Page

Recommended layout:

- daily cards for recent days
- expandable month view
- favorite/saved meals
- monthly rating cards
- highest-rated categories
- Premium Top10 history if unlocked

## Meal Card

Each meal card should show:

- dish name
- restaurant if any
- meal time/type
- nutrition summary
- rating status
- completion status
- AI/corrected indicator if useful internally

## Rating Flow

After meal completion, user can rate:

- taste
- fullness/satisfaction
- would eat again
- not finished / not eaten

This supports future recommendation and food diary insights.

## Free/Premium History

- Free: limited visible window such as 14 days.
- Premium: extended history, Top10 by region/type/date, saved favorites.

## Sharing

Potential sharing targets:

- IG/story style card
- friend wall
- saved diary card

Sharing should not expose private nutrition details unless user chooses.

## Acceptance Criteria

1. Today intake reads from meal records collection.
2. Planned dinner is labeled as planned.
3. Meal rating is stored and reflected in diary.
4. Free/Premium history boundaries are visible.
5. Diary supports future recommendation personalization.
