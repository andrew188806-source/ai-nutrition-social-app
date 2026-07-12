# Home Screen UI

## Purpose
Home should communicate Haocu’s value quickly: understand your meal, see today’s nutrition, get next meal suggestions, and optionally find Meal Buddies.

## Layout Order

1. Greeting and mascot/brand moment.
2. Primary AI analysis CTA.
3. Today nutrition summary card.
4. Next meal recommendation card.
5. Meal Buddy shortcut card.
6. Restaurant recommendation shortcut.
7. Premium teaser if relevant.

## Today Nutrition Summary

Home shows a compact summary only:

- calories consumed/estimated
- protein status
- balance signal
- planned dinner indicator if any
- link to full report

Full nutrition report belongs in `today-intake` detail page.

## Primary CTA

Primary CTA examples:

- “拍照分析這餐”
- “上傳餐點照片”

CTA routes directly to capture/upload.

## Next Meal Recommendation Card

Card contents:

- recommended dish/restaurant
- short reason
- nutrition fit badge
- CTA: view restaurant / use this meal to find buddy

## Meal Buddy Shortcut

Should show:

- remaining card quota
- active Meal Buddy card status if any
- CTA: “查看我的飯友卡” or “用這餐找飯友”

## Avoid on Home

- Full macro/micro nutrition tables.
- Long diary history.
- All friend list entries.
- Too many buttons with overlapping functions.

## Empty State

New user empty state should guide:

1. Take/upload first meal photo.
2. Choose preference basics.
3. See recommendation.
4. Create first Meal Buddy card.

## Acceptance Criteria

1. Home primary CTA enters photo capture/upload directly.
2. Home nutrition card is compact.
3. Full report link is available.
4. Home does not duplicate Meal Buddy full page.
5. Planned dinner is clearly labeled as planned.
