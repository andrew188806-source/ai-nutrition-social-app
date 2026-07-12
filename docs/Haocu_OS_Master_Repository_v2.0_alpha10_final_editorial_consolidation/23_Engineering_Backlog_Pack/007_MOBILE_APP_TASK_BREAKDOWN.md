# 007 Mobile App Task Breakdown

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This document breaks the Expo React Native mobile app work into implementation units.

## Mobile Principles

- Keep UI clean, spacious, and demo-readable.
- Avoid duplicate CTAs.
- Use centralized Traditional Chinese i18n strings.
- Do not couple screen state directly to mock objects when repository/service interfaces should be used.
- Preserve demo mode even while Supabase migration is added.

## Routes / Surfaces

### Home

Tasks:

- Keep Home as the clean summary entry, not a dense dashboard.
- Show only concise Today Nutrition Summary.
- Route AI Analysis CTA directly to capture/upload flow.
- Route Meal Buddy CTA directly to `我的飯友卡` area, not an unnecessary intermediate page.
- Ensure planned dinner display does not count as eaten.

Done when:

- Home explains the app value in under 10 seconds.
- No full nutrition report clutter appears on Home.

### AI Analysis

Tasks:

- Define screen states: idle, selecting input, analyzing, result, correcting, saved.
- Preserve result when user leaves and returns before next action.
- Implement candidate selection and correction form.
- Save confirmed result to meal repository.
- After save, expose next actions: add to today, find meal buddy, see recommendations.

Done when:

- User can complete photo/mock analysis -> correction -> save without losing state.

### Today Intake / Nutrition Report

Tasks:

- Read mealRecords aggregation.
- Show daily calories/macros/fiber and meal list.
- Show planned dinner separately.
- Add rating placeholder.
- Link to Food Diary.

Done when:

- Full report never shows zero when records exist.

### Food Diary

Tasks:

- Group meal records by day.
- Display recent 3 days and expandable month placeholder.
- Add monthly rating card placeholder.
- Add free/premium display windows.

Done when:

- Diary is a read-only mirror of real saved records, not a separate fake list.

### Restaurant List / Detail

Tasks:

- Implement filters: location/search/type/meal period/都可以.
- Keep date selector close to restaurant card for Meal Buddy creation.
- Recommended dish CTA asks: “用這餐建立飯友卡並尋找飯友嗎？”
- Remove duplicated `用這餐選飯友`-style option.
- Navigate to created Meal Buddy card after creation.

Done when:

- Restaurant card creation flow is visible, not hidden at the bottom.

### Meal Buddy

Tasks:

- Section order: primary action buttons, my cards, tabbed lists.
- Search input lives inside `我的飯友卡` section and only shows under relevant view.
- Implement `我的飯友`, `多人飯局`, `建立飯友卡` entry row/grid.
- Card creation from AI and restaurant uses same repository function.
- Enforce free/premium limits.
- Ensure accepted invitations update matched/friend state.

Done when:

- Cards are not lost, duplicated, or disconnected from chats/matches.

### Chat

Tasks:

- Sort chat list by latest message.
- Return from chat to chat list.
- Keep one-to-one chat and group table chat separate.
- Lock unavailable actions instead of routing to wrong tab.
- Remove unnecessary blue tags in matched/inviting/chat detail screens if still present.

Done when:

- Known BO/LEO/Ivy regression cases pass.

### Group Table

Tasks:

- `多人飯局` entry opens group table list.
- Create/join four-person table.
- Participant cards use social card data.
- Cancellation reason posts system message.
- Completion/calorie sharing placeholder.

Done when:

- Group table no longer hijacks one-to-one chat pages.

### My Page / Premium / Profile

Tasks:

- Show free vs premium state clearly.
- Anonymous mascot profile for free, real profile option for paid/verified.
- Keep verification states: not_verified/pending/verified/rejected.
- Avoid inconsistent mascot/human avatar display.

Done when:

- Profile identity state is visually consistent across screens.

## Mobile State Tasks

| State Area | Required Work |
|---|---|
| Meal records | collection, add/update/remove, aggregate by day |
| AI analysis | current result, candidates, corrections, save status |
| Recommendations | computed from meal records and preferences |
| Meal Buddy | cards, limits, candidates, invitations |
| Social identity | user/social-card unified reference |
| Chat | thread list, messages, latest-message sort |
| Group tables | table list, participants, group chat link |
| Premium | free/paid toggle and capability flags |
| Demo reset | deterministic reset for all mock/local state |

## Mobile Regression Cases

- AI analysis save updates Today Intake and full report.
- Restaurant card Meal Buddy creation shows created card immediately.
- Chat return goes back to chat list.
- New chat message moves the thread to top.
- Accepting invitation adds user to friend/match list.
- `多人飯局` opens group table, not one-to-one chat.
- Premium toggle changes limits without corrupting data.
