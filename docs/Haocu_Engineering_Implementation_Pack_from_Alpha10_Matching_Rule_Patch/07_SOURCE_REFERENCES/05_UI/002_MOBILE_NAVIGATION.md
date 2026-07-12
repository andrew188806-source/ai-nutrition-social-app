# Mobile Navigation

## Purpose
Define mobile route hierarchy and shortcut behavior.

## Primary Navigation

Recommended main tabs:

1. Home
2. AI Analysis
3. Meal Buddy
4. Restaurants
5. My/Profile

## Shortcut Decisions

### Home → AI Analysis
Home “拍照分析” should route directly to the photo capture/upload step, equivalent to:

```text
AI分析 → 開始AI分析 → 拍攝餐點
```

It should not stop at an intermediate marketing page once the user is in the active app experience.

### Home → Meal Buddy
Home Meal Buddy shortcut should route directly to the user’s Meal Buddy card/list area, not a redundant standalone intro page.

### Restaurant Card → Meal Buddy Card
Restaurant card create action should create or prepare a Meal Buddy card and route to the page where the newly created card is visible.

## Route Groups

### AI Analysis

- `/ai-analysis`
- `/ai-analysis/capture`
- `/ai-analysis/result`
- `/ai-analysis/correction`
- `/ai-analysis/manual-entry`

### Meal Buddy

- `/meal-buddies`
- `/meal-buddies/card/new`
- `/meal-buddies/candidates`
- `/meal-buddies/chat/[chatId]`
- `/meal-buddies/group-tables/[tableId]`

### Restaurants

- `/restaurants`
- `/restaurants/[restaurantId]`
- `/restaurants/[restaurantId]/menu/[menuItemId]`
- `/restaurants/[restaurantId]/create-meal-buddy-card`

### Diary

- `/today-intake`
- `/food-diary`
- `/food-diary/[date]`

## Back Navigation Rules

- From chat room → return to chat list tab.
- From group table detail → return to group table list.
- From restaurant-created Meal Buddy card → return to restaurant detail or Meal Buddy list depending source.
- From AI correction → return to result, not home.

## Acceptance Criteria

1. Home shortcuts reduce path length.
2. Chat back navigation returns to chat list.
3. Newly created Meal Buddy card is visible after creation.
4. Restaurant flows do not strand user without confirmation.
5. Routes are named consistently with frontend architecture.
