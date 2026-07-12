# 013 Restaurant Flow Frontend

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines restaurant-related frontend flows.

## Restaurant List

Features:

- Location/search.
- Meal type filter.
- Cuisine/type filter including “都可以”.
- Restaurant cards.
- Google Map or map link integration where available.

## Restaurant Card

Card should show:

- Restaurant name.
- Food/menu highlights.
- Nutrition-friendly tags where useful.
- Distance/location.
- Recommended dishes.
- Create Meal Buddy card action.
- Group Table entry if relevant.

## Create Meal Buddy Card from Restaurant

Flow:

1. User taps restaurant/menu action.
2. App asks whether to use this meal to create Meal Buddy card and find buddy.
3. User confirms or edits date/time/preferences.
4. Card is created in canonical Meal Buddy card collection.
5. User is taken to visible Meal Buddy context.

## Date Rule

Restaurant-created or AI-created Meal Buddy card defaults to today unless user changes it. Date selector should appear near the restaurant card/context, not hidden at the bottom.

## Recommended Dishes

Recommended dishes should be plausible for that restaurant. Do not show random food items that the restaurant would not serve unless explicitly marked as user-uploaded/new dish pending verification.

## Group Table Restaurant Entry

The four-person table entry should be visible but not visually overpower restaurant content.
