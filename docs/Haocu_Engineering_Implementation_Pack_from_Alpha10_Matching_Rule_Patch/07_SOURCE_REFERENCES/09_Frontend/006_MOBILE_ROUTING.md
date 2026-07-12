# 006 Mobile Routing

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines mobile routing and navigation rules.

## Route Principles

- Minimize unnecessary intermediate pages.
- Preserve user context after actions.
- Route directly to the screen where the outcome is visible.
- Avoid surprising tab changes.

## Route Map

```text
/                       Home
/ai-analysis             AI analysis entry/result
/today-intake            Full nutrition report
/food-diary              Diary and ratings
/meal-buddies            Meal Buddy cards, matches, chat, group table entry
/restaurants             Restaurant recommendation/list/detail context
/profile                 Profile, premium, verification
```

## Required Direct Paths

### Home → AI Analysis

Home shortcut should go directly into the same path as:

```text
AI分析 → 開始AI分析 → 拍攝/上傳餐點
```

### Home → Meal Buddy

Home shortcut should enter existing Meal Buddy card context, not a separate empty landing page.

### Restaurant Card → Meal Buddy Card

After creating a Meal Buddy card from a restaurant card, navigate to Meal Buddy page with the created card visible or highlighted.

### Chat Return

Returning from a chat thread should return to the chat list/tab, not matched users.

## Route Params

Potential params:

- `mealRecordId`
- `restaurantId`
- `menuItemId`
- `mealBuddyCardId`
- `chatThreadId`
- `groupTableId`
- `initialTab`

## Navigation State Rule

Do not use route params as the only source of durable domain state. They should point to stored data.
