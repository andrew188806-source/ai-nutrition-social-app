# Meal Buddy UI

## Purpose
Define the Meal Buddy page, social card display, friend/match/chat tabs, and card creation flow.

## Page Top Layout

Keep:

- Title: `飯友列表`
- Short description under title.
- My Meal Buddy Card section.

Search input should live inside the `我的飯友卡` section and only show under `我的飯友 / 已配對` view. It should not appear on chat or group table views.

## Section Order

Inside `我的飯友卡`:

1. Primary action buttons:
   - 我的飯友
   - 多人飯局
   - 建立飯友卡
2. Quota/status chip.
3. Active cards.
4. Contextual search or filter when applicable.

## Tabs / Views

Recommended views:

- 我的飯友 / 已配對
- 邀請中
- 聊天
- 多人飯局

Remove unnecessary blue tag/chip if it duplicates the selected tab state.

## Meal Buddy Card Fields

Display:

- social identity: mascot or real avatar
- restaurant/food intent
- date/time
- chat preference
- payment preference
- note
- compatibility reason
- quota state

## Anonymous vs Premium Real Identity

Visual distinction must be clear:

- Free anonymous: mascot avatar and anonymous display.
- Premium real-person: real avatar/photo and verification badge.

Do not let different screens show inconsistent avatars for the same user.

## Create Card Flow

Sources:

- AI analysis result.
- Restaurant card.
- Manual Meal Buddy page.

After creation, route user to the page where the created card is visible.

## Invitation Actions

Actions should be clear:

- 先聊聊
- 邀請吃飯

If a product decision says these should be locked on a certain demo page, lock visually without navigating to wrong invite state.

## Acceptance Criteria

1. Search appears only in relevant friend/matched view.
2. Chat list uses latest message sorting.
3. Accepted invite creates friend relationship.
4. Anonymous/Premium identity difference is visually obvious.
5. Meal Buddy card creation routes to visible card state.
6. Duplicate actions are removed.
