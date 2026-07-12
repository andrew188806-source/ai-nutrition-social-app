# 009 Database / Supabase Task Breakdown

Version: v2.0 Alpha 7A  
Updated: 2026-07-08

## Purpose

This document translates the Data and Backend folders into Supabase implementation tasks.

## Supabase MVP Modules

- Auth users.
- Profiles and preference settings.
- Meal records and nutrition values.
- Meal photos and storage metadata.
- AI analysis results and correction feedback.
- Restaurants and menu items.
- Social cards.
- Meal Buddy cards.
- Matches and invitations.
- Chats and messages.
- Group tables and participants.
- Premium capability flags.
- Consent/audit logs.
- Analytics events.

## Migration Order

### Migration 001 — Extensions and Types

Tasks:

- Enable UUID generation if needed.
- Define enums for meal period, source type, verification status, invitation status, chat type, table status, review status, subscription tier.
- Keep enum names stable and lowercase/snake_case.

### Migration 002 — Users and Profiles

Tables:

- `profiles`
- `user_preferences`
- `health_goal_settings`
- `subscription_entitlements`
- `verification_statuses`

Important fields:

- `user_id`
- display name / nickname
- avatar type: mascot / real photo
- premium tier
- verification state
- taste preference placeholders
- consent timestamps

### Migration 003 — Meals and Nutrition

Tables:

- `meal_records`
- `meal_nutrition`
- `planned_meals`
- `meal_ratings`
- `meal_photos`

Important fields:

- `meal_id`
- `user_id`
- `meal_date`
- `meal_period`
- `source_type`: ai / manual / restaurant / planned
- `dish_name`
- `restaurant_id` optional
- `menu_item_id` optional
- calories/macros/fiber
- `pre_meal_photo_ids` and `post_meal_photo_ids` fields reserved for MVP+ multi-photo flow

### Migration 004 — AI Analysis

Tables:

- `ai_analysis_results`
- `ai_analysis_candidates`
- `ai_correction_feedback`

Important fields:

- model/provider metadata if used
- confidence/source labels
- selected candidate ID
- correction diff
- cost/latency metadata if available

### Migration 005 — Restaurants and Menu

Tables:

- `restaurants`
- `restaurant_locations`
- `menu_items`
- `menu_item_nutrition`
- `restaurant_admin_users`
- `restaurant_review_statuses`

Important fields:

- restaurant verified state
- menu item status: draft/submitted/approved/rejected
- AI-estimated vs restaurant-confirmed nutrition source
- price, tags, portion, ingredients, cooking method

### Migration 006 — Social / Meal Buddy

Tables:

- `social_cards`
- `meal_buddy_cards`
- `meal_buddy_card_sources`
- `buddy_candidates`
- `invitations`
- `matches`

Important fields:

- `social_card_id`
- `user_id`
- source meal/restaurant/menu item
- desired date/time
- invitation mode: chat / eat / locked
- payment preference
- free/premium limit metadata

### Migration 007 — Chat / Group Table

Tables:

- `chat_threads`
- `chat_messages`
- `group_tables`
- `group_table_participants`
- `group_table_events`

Important fields:

- `chat_type`: one_to_one / group_table
- latest message timestamp
- table status
- cancellation reason
- system message flag

### Migration 008 — Consent / Audit / Analytics

Tables:

- `user_consents`
- `audit_logs`
- `analytics_events`

Important fields:

- event name
- actor ID
- entity type/entity ID
- timestamp
- safe JSON metadata

## RLS Policy Baseline

### User-Owned Data

- Users can read/write their own profiles, preferences, meals, planned meals, ratings, photos metadata, AI results, correction feedback, social card, and own meal buddy cards.
- Users cannot read private fields of other users unless exposed through social card or match context.

### Social Discovery Data

- Public/discoverable social-card fields should be separated from private profile fields.
- Meal Buddy candidate queries should return only fields needed for discovery.
- Real profile photos require premium/verification rules.

### Restaurant-Owned Data

- Restaurant admins can manage their own restaurant/menu records.
- Public users can read approved restaurant/menu data.
- Draft/submitted/rejected review data remains restaurant/admin scoped.

### Admin Data

- Admin review and audit logs require admin role.
- Audit logs are append-only from app perspective.

## Storage Buckets

| Bucket | Use | Access Rule |
|---|---|---|
| `meal-photos` | user meal photos | user-owned, signed/read-limited |
| `restaurant-assets` | restaurant images/menu assets | public approved assets; restricted drafts |
| `profile-avatars` | mascot/real profile assets | real photos gated by profile/privacy rules |
| `review-attachments` | admin/legal/compliance evidence | admin/reviewer restricted |

## Seed Data Requirements

Seed data must include:

- Demo user.
- At least five mock users/social cards.
- Three saved meal records for one day.
- One planned dinner.
- Restaurant list with menu items and nutrition values.
- Meal Buddy cards from AI and restaurant sources.
- Matches/invitations/chats.
- One group table with participants.
- Free and premium capability examples.

## Validation Checklist

- Migrations run on empty database.
- RLS enabled on all user-sensitive tables.
- Local adapter and Supabase adapter share DTOs.
- Seed data can be reset.
- Storage paths do not leak private user IDs in public URLs unnecessarily.
- Analytics metadata avoids sensitive free-text where possible.
