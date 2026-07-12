# 002 Restaurant Frontend

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines restaurant web frontend.

## Technology

- Next.js.
- TypeScript.
- Tailwind.
- Supabase Auth.

## Main Routes

- `/restaurant/login`
- `/restaurant/dashboard`
- `/restaurant/profile`
- `/restaurant/menu`
- `/restaurant/menu/new`
- `/restaurant/menu/[id]`
- `/restaurant/nutrition-disclosure`
- `/restaurant/group-tables`
- `/restaurant/verification`

## Core Features

### Restaurant Profile

- Basic restaurant information.
- Location.
- Opening hours.
- Cuisine tags.
- Verification status.

### Menu Management

- Add/edit menu item.
- Ingredients.
- Portion.
- Cooking method.
- Price.
- Nutrition estimate/disclosure.
- Photos.

### Nutrition Disclosure

- Submit nutrition data.
- View review status.
- See approved/rejected reasons.

### Group Table

- View active tables related to restaurant.
- See table status.
- Avoid exposing private user nutrition records.

## UI Rules

- Restaurant console should feel operational and simple.
- Avoid consumer playful visuals except brand accents.
- Show verification/review status clearly.
- Make save/submit states explicit.
