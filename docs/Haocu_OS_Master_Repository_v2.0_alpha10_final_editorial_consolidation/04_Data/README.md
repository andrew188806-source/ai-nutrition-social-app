# 04_Data README

## Purpose
This section defines Haocu’s core data model for the consumer mobile app, AI analysis, meal records, restaurant/menu data, Meal Buddy social flows, group tables, Premium limits, analytics, and governance.

The data model should support MVP execution while preserving room for post-MVP extensions such as multi-photo meal capture, similar-user taste recommendations, restaurant ESG workflows, and household meal planning.

## Data Principles

| Principle | Meaning |
|---|---|
| Corrected result wins | Product display and recommendation use user-approved/corrected meal records. |
| Preserve originals | AI raw outputs are retained separately for evaluation and audit. |
| Shared identity model | Meal Buddy, chat, and group table reference the same user/card identity model. |
| MVP/MVP+ separation | Schema may prepare future fields, but UI can defer them. |
| Privacy by design | Sensitive health, identity, and social data require consent and access control. |
| Restaurant data integrity | User corrections do not automatically overwrite verified restaurant/menu data. |

## File Map

- `001_DATA_MODEL_OVERVIEW.md` — domain model and entity map.
- `002_USER_PROFILE_SCHEMA.md` — user, preference, identity, and Premium profile fields.
- `003_MEAL_RECORD_SCHEMA.md` — meal record, correction, diary, and daily intake fields.
- `004_RESTAURANT_MENU_SCHEMA.md` — restaurant, branch, menu, dish, and nutrition fields.
- `005_SOCIAL_SCHEMA.md` — social card, friend, match, invite, and identity model.
- `006_GROUP_TABLE_SCHEMA.md` — 4/6/8 person group table model.
- `007_DATA_GOVERNANCE.md` — ownership, privacy, retention, and review rules.
- `008_NUTRITION_SCHEMA.md` — nutrition estimate, source, and confidence model.
- `009_AI_ANALYSIS_SCHEMA.md` — AI run, candidates, photo, and model metadata.
- `010_PREMIUM_AND_LIMITS_SCHEMA.md` — plan, quota, and feature access data.
- `011_CHAT_AND_INVITATION_SCHEMA.md` — chat, message, invitation, and sorting behavior.
- `012_ANALYTICS_EVENT_SCHEMA.md` — product analytics event taxonomy.
- `013_STORAGE_AND_PHOTO_SCHEMA.md` — photo storage and asset lifecycle.
- `014_PRIVACY_CONSENT_AUDIT_SCHEMA.md` — consent and audit trail.
- `015_DATA_MIGRATION_PLAN.md` — migration and seed strategy.

## MVP Critical Data Flows

1. AI analysis → corrected meal record → today intake → recommendation.
2. AI analysis or restaurant card → Meal Buddy card → candidates → invite/chat.
3. Restaurant/menu data → database-first AI → verified/estimated nutrition.
4. Social card → Meal Buddy list/chat/group table → identity and status rules.
5. Premium plan → quota limits and unlocked features.
