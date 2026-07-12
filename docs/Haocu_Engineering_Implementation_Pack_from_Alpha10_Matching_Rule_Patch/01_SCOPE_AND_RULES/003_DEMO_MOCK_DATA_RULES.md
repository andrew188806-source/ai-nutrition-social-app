# 003 Demo and Mock Data Rules

## Rule

Mock/demo data is allowed for UI demonstration, QA, investor walkthroughs, restaurant pilot explanation, and user-flow validation. It must not be represented as live usage, revenue, restaurant partnership, nutrition verification, AI accuracy, or market traction.

## Required Label

Use this label in screenshots, demo pages, videos, and walkthroughs:

> Demo data shown for product walkthrough only. Not live user, restaurant, revenue, nutrition-verification, or traction data unless separately marked as verified evidence.

## Engineering Requirements

- Demo mode and production mode must be clearly separated.
- Seed data must be deterministic for repeatable demos.
- Mock users, meal records, restaurant menus, chats, matches, and group tables must share one identity model.
- Do not mix fake chat/match records with real pilot data.

Source: `07_SOURCE_REFERENCES/DEMO_MOCK_DATA_DISCLOSURE.md`
