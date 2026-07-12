# Group Table UI

## Purpose
Define UI for four-person group dining and future 6/8-person upgrades.

## Entry Points

- Meal Buddy page primary action: 多人飯局
- Restaurant detail group table section
- Existing Meal Buddy/friend list invite flow

## Group Table List

Tabs/sections:

- 可參加的餐桌
- 我的餐桌
- 已成團 / 歷史 if needed

Card displays:

- host identity
- restaurant/meal intent
- time
- current participants / capacity
- compatibility tags
- join/invite action

## Create Table

Fields:

- restaurant/food
- time
- table size: 4 default
- note
- payment preference optional
- invite friends

Premium upgrade may allow 6/8-person table.

## Table Detail

Displays:

- title/restaurant/time
- participants as social cards
- empty seats
- invite/search friends
- group chat entry
- cancel/leave action with reason if required

## Cancellation UI

If user cancels participation:

- ask reason
- confirm
- show system message in group chat
- update table seat state

## Acceptance Criteria

1. Four-person table is the default mental model.
2. Participant identity matches social card identity.
3. Full table state is clear.
4. Premium upgrade to 6/8 does not clutter MVP UI.
5. Cancellation reason produces visible group update.
