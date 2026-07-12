# 002 Domain Architecture

Version: v2.0 Alpha 4  
Updated: 2026-07-08

## Purpose

This document defines Haocu's bounded contexts so product, engineering, data, and AI work can be separated without creating inconsistent models.

## Bounded Contexts

### 1. Identity and Profile

Responsible for:

- Authentication account.
- Public profile and social card profile.
- Health goal preferences.
- Avatar mode: anonymous mascot vs premium real profile.
- Verification state: unverified, pending, verified, rejected.

Primary tables:

- `users`
- `profiles`
- `user_health_goals`
- `profile_verifications`
- `consent_records`

### 2. Meal and Nutrition

Responsible for:

- AI analysis jobs.
- Meal records.
- Food items and portions.
- Corrected nutrition estimates.
- Today intake and Food Diary views.

Primary tables:

- `meal_records`
- `meal_items`
- `nutrition_estimates`
- `ai_analysis_jobs`
- `ai_corrections`

### 3. Restaurant and Menu

Responsible for:

- Restaurant listing.
- Menu items.
- Ingredients.
- Restaurant nutrition disclosure.
- Blue-check verification.
- Restaurant-side group table participation.

Primary tables:

- `restaurants`
- `restaurant_locations`
- `menu_items`
- `menu_item_ingredients`
- `nutrition_disclosures`
- `restaurant_verification_reviews`

### 4. Recommendation and Personalization

Responsible for:

- Next meal recommendations.
- Taste memory.
- Similar-user signals.
- Restaurant ranking.
- Nutrition gap scoring.

Primary tables:

- `user_taste_profiles`
- `recommendation_logs`
- `menu_item_scores`
- `restaurant_scores`

### 5. Social Matching

Responsible for:

- Social card discovery.
- Meal Buddy cards.
- Invite-to-chat and invite-to-eat workflows.
- Free/Premium matching limits.

Primary tables:

- `social_cards`
- `meal_buddy_cards`
- `meal_buddy_matches`
- `invitations`
- `usage_limits`

### 6. Group Table

Responsible for:

- Four-person table creation.
- Premium upgrade to 6/8 seats in post-MVP.
- Participant lifecycle.
- Group chat.
- Meal completion and cancellation reason.

Primary tables:

- `group_tables`
- `group_table_participants`
- `chat_threads`
- `chat_messages`
- `meal_completion_feedback`

### 7. Premium and Monetization

Responsible for:

- Subscription plan.
- Daily limits.
- Premium unlocks.
- Real profile unlock.
- Top10 diary retention.

Primary tables:

- `subscriptions`
- `usage_limit_counters`
- `premium_entitlements`

### 8. Admin, Compliance, and Audit

Responsible for:

- Review workflows.
- Audit trail.
- Abuse handling.
- Privacy support.
- Compliance evidence.

Primary tables:

- `admin_reviews`
- `audit_logs`
- `abuse_reports`
- `privacy_requests`

## Domain Rule

A domain owns its core state. Other domains reference it by ID and should not duplicate ownership. For example, Group Table participants reference users and social cards, but Group Table does not redefine social identity.

## Integration Rule

Domain integration should happen through service functions and documented API contracts, not through direct client-side writes to unrelated tables.


## Cross-document Traceability

This document must remain aligned with:

- `01_Product/005_MVP_SCOPE.md`
- `02_PRD/001_MOBILE_APP_PRD.md`
- `02_PRD/002_AI_ANALYSIS_PRD.md`
- `02_PRD/005_MEAL_BUDDY_PRD.md`
- `03_AI/008_DATABASE_FIRST_AI_POLICY.md`
- `04_Data/001_DATA_MODEL_OVERVIEW.md`
- `05_UI/001_UI_PRINCIPLES.md`

When implementation changes, update PRD, data model, UI state, API contract, and acceptance criteria together.


## Acceptance Criteria

- Engineers can identify the responsible app, service, table, and route before coding.
- The MVP boundary is explicit and does not silently include post-MVP features.
- Free/Premium behavior is testable without reading product chat history.
- AI outputs are treated as estimates and can be corrected by the user.
- Privacy, consent, and RLS constraints are visible at the implementation layer.

