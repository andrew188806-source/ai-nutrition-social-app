# 003 Database Tables

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document summarizes backend table responsibilities. Detailed schemas live in `04_Data`.

## Identity

- `profiles` — app profile tied to auth user.
- `user_health_goals` — nutrition and goal preferences.
- `profile_verifications` — real identity verification workflow.
- `consent_records` — privacy and product consent.

## Meal and AI

- `ai_analysis_jobs` — analysis lifecycle.
- `ai_analysis_candidates` — possible detected dishes/items.
- `ai_corrections` — user corrections.
- `meal_records` — durable user meal record.
- `meal_items` — item-level meal details.
- `nutrition_estimates` — macro/micro estimates and source.
- `meal_ratings` — post-meal rating and feedback.

## Restaurant

- `restaurants`
- `restaurant_locations`
- `menu_items`
- `menu_item_ingredients`
- `nutrition_disclosures`
- `restaurant_verification_reviews`

## Social

- `social_cards`
- `meal_buddy_cards`
- `meal_buddy_matches`
- `invitations`
- `chat_threads`
- `chat_participants`
- `chat_messages`

## Group Table

- `group_tables`
- `group_table_participants`
- `group_table_events`
- `meal_completion_feedback`

## Premium

- `subscriptions`
- `premium_entitlements`
- `usage_limit_counters`

## Admin and Audit

- `admin_reviews`
- `audit_logs`
- `abuse_reports`
- `privacy_requests`
- `analytics_events`

## Common Columns

Most tables should include:

- `id`
- `created_at`
- `updated_at`
- `created_by` where relevant.
- `deleted_at` for soft-delete where needed.
- `status` for lifecycle tables.

## Index Priorities

- `meal_records(user_id, eaten_at)`
- `meal_buddy_cards(user_id, date, status)`
- `chat_threads(last_message_at)`
- `chat_messages(thread_id, created_at)`
- `group_tables(restaurant_id, meal_time, status)`
- `menu_items(restaurant_id, status)`
- `analytics_events(user_id, event_name, created_at)`
