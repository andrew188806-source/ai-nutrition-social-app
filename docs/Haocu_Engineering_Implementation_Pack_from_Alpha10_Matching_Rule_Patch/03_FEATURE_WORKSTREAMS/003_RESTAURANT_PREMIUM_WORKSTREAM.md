# 003 Restaurant / Premium Workstream

## Goal

Keep restaurant discovery and premium limits useful for the MVP without expanding into full restaurant operations or payment.

## Source Docs

- `07_SOURCE_REFERENCES/02_PRD/004_RECOMMENDATION_PRD.md`
- `07_SOURCE_REFERENCES/02_PRD/008_RESTAURANT_PRD.md`
- `07_SOURCE_REFERENCES/02_PRD/009_PREMIUM_PRD.md`
- `07_SOURCE_REFERENCES/04_Data/004_RESTAURANT_MENU_SCHEMA.md`
- `07_SOURCE_REFERENCES/04_Data/010_PREMIUM_AND_LIMITS_SCHEMA.md`
- `07_SOURCE_REFERENCES/05_UI/006_RESTAURANT_UI.md`
- `07_SOURCE_REFERENCES/09_Frontend/013_RESTAURANT_FLOW_FRONTEND.md`

## Build Order

1. Restaurant list search/filter.
2. Restaurant card detail.
3. Menu item relation to Meal Buddy card.
4. Premium/free candidate and card limits.
5. Restaurant admin/menu demo surface only if core flow is stable.

## Acceptance

- Restaurant filters update list on the same page.
- Restaurant card can create a Meal Buddy card.
- Date selector appears near restaurant card context, not hidden at the bottom.
- Premium rules are visible but production payment remains out of scope.
