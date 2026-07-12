# 005 Coding Agent Instructions

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document gives instructions for AI coding agents such as Codex or Claude Code working on Haocu.

## Operating Rules

1. Read the relevant PRD and data model before coding.
2. Do not invent new flows when the repository already defines one.
3. Keep Traditional Chinese copy centralized in i18n files.
4. Preserve clean UI hierarchy; do not add extra cards or tags unless required.
5. Do not change resolver or data-flow logic while performing UI-only restore tasks.
6. Do not create duplicate fake data sources.
7. Do not hard-code English strings in JSX.
8. Keep Meal Buddy, Group Table, Chat, and Restaurant card IDs consistent.
9. Run typecheck after implementation.
10. Summarize changed files and behavior.

## Priority Fix Instructions

When asked to fix social flows, check:

- Accepted invitation creates/updates friend/match relationship.
- Chat list sorts by latest message.
- Return from chat goes to chat tab/list.
- Group table chat is not confused with one-to-one chat.
- Mock users are referenced from a single source.

When asked to fix restaurant card Meal Buddy creation, check:

- The card uses current restaurant/menu context.
- Date defaults to today for AI-generated/restaurant-generated card.
- Date selector appears near the restaurant card, not hidden at the bottom.
- After creation, user lands in a visible Meal Buddy card context.

When asked to restore UI, check:

- Search input only appears under matched Meal Buddy view.
- Chat and group table views do not show irrelevant search.
- Top action area avoids oversized duplicate elements.
- Mascot/real avatar distinction remains visible.

## Forbidden Shortcuts

- Do not silence TypeScript errors with `any` unless temporary and documented.
- Do not patch UI by creating parallel fake state.
- Do not bypass premium limit logic only in UI.
- Do not remove user correction flow from AI analysis.
- Do not store sensitive data in logs.
