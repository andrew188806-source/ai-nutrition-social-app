# Premium and Limits Schema

## Purpose
Define plan, entitlement, and quota data for free and Premium users.

## `subscription_plans`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| plan_code | text | free, premium_monthly, premium_yearly. |
| display_name | text |  |
| price_twd | numeric | Optional. |
| active | boolean |  |
| entitlements | jsonb | Feature flags and limits. |

## `user_subscriptions`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| user_id | uuid | FK. |
| plan_id | uuid | FK subscription_plans.id. |
| status | enum | active, trialing, cancelled, expired, past_due. |
| started_at | timestamptz |  |
| ends_at | timestamptz |  |
| provider | text | App store/payment provider later. |

## `feature_usage_counters`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| user_id | uuid | FK. |
| feature_key | text | e.g. meal_buddy_card_create. |
| period_type | enum | daily, monthly, lifetime. |
| period_start | date |  |
| count | int |  |
| reset_at | timestamptz |  |

## MVP Entitlement Examples

| Feature | Free | Premium |
|---|---:|---:|
| Meal Buddy card creation | 2/day | 5/day |
| AI-analysis/list combined card quota | 1/day | 3/day |
| Restaurant card quota | 1/day | 2/day |
| Meal Buddy candidates per search | 3 | 5 |
| Multi-select candidate invite | No | Yes |
| Friend list visible count | 5 | 10 |
| Anonymous card | Yes | Yes |
| Real-person card | No | Yes after verification |
| Food diary visible window | 14 days | Extended/Top10 |
| Group table hosting | Limited/No | Yes depending policy |

## Limit Enforcement Rule

Limits must be enforced server-side. UI may display remaining quota but cannot be the source of truth.

## Replacement Rule

When product policy says newest card replaces oldest active card:

1. Check active card count.
2. If over limit, set oldest card status to `replaced`.
3. Create new card.
4. Return updated quota state.

## Acceptance Criteria

1. Free/Premium feature differences are data-driven.
2. Server enforces daily quota.
3. UI can display remaining quota.
4. Real-person social card is Premium-gated and verification-gated.
5. Quota events are auditable for support.
