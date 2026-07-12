# 009 Event and Notification Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines product events and notification triggers used by meal recording, Meal Buddy, Group Table, chat, premium, and restaurant review flows.

## Event Types

### Product Analytics Events

Used to understand funnel and product health.

Examples:

- `ai_analysis_started`
- `ai_analysis_candidate_selected`
- `ai_analysis_manual_correction_opened`
- `meal_record_created`
- `restaurant_card_opened`
- `meal_buddy_card_created`
- `meal_buddy_candidate_viewed`
- `invitation_sent`
- `chat_started`
- `group_table_created`
- `premium_gate_viewed`

### Domain Events

Used to trigger product behavior.

Examples:

- `meal_record.confirmed`
- `meal_rating.due`
- `meal_buddy_card.created`
- `invitation.accepted`
- `group_table.full`
- `group_table.cancelled`
- `restaurant_review.approved`

### Audit Events

Used for compliance and operational accountability.

Examples:

- `admin.restaurant.approved`
- `admin.nutrition_disclosure.rejected`
- `admin.user_report.resolved`
- `privacy_request.completed`

## Notification Channels

MVP priority:

1. In-app notification center or inline state update.
2. Push notification post-MVP.
3. Email notification only for account/admin workflows.

## Notification Rules

- Do not send sensitive meal details in push preview.
- Chat notification should not expose private message content in logs beyond product necessity.
- Rating reminder should be time-bounded and dismissible.
- Group table cancellation must include reason as system message, but not expose unnecessary personal details.

## Event Storage

Events should be stored in `analytics_events` or domain-specific tables depending on use:

- Product funnel event → `analytics_events`.
- Chat message → `chat_messages`.
- Admin decision → `audit_logs` and review table.
- Usage limit change → `usage_limit_counters`.

## MVP Implementation

MVP can implement events as database inserts from service functions. A separate event bus is not required until volume or async workflows justify it.
