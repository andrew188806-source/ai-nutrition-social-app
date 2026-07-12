# Privacy, Consent, and Audit Schema

## Purpose
Define consent records, privacy controls, and audit trails for sensitive workflows.

## `consent_records`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| user_id | uuid | FK. |
| consent_type | text | privacy_policy, terms, ai_analysis, marketing, real_identity, health_goal. |
| version | text | Document version. |
| granted | boolean |  |
| granted_at | timestamptz |  |
| revoked_at | timestamptz |  |
| source | text | onboarding, settings, paywall, etc. |

## `audit_logs`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| actor_user_id | uuid | Admin/user/system actor. |
| actor_role | text | user, admin, restaurant_admin, system. |
| action | text | e.g. verify_social_card, edit_menu_item. |
| entity_type | text | Target entity. |
| entity_id | uuid | Target id. |
| before_value | jsonb | Optional. |
| after_value | jsonb | Optional. |
| reason | text | Required for sensitive actions. |
| created_at | timestamptz |  |

## Consent Types

| Consent | Required For |
|---|---|
| privacy_policy | Account usage. |
| terms | Account usage. |
| ai_analysis | AI photo/nutrition analysis. |
| marketing | Promotional communication. |
| real_identity | Verified real-person social card. |
| health_goal | Premium health goal mode. |
| data_training | Future model training beyond service operation. |

## Audit-Required Actions

- Admin reviewing real-person verification.
- Admin approving restaurant nutrition disclosure.
- Support accessing user-sensitive data.
- User deleting account/data.
- Updating sponsored ranking settings.
- Changing health-goal logic or copy.

## Acceptance Criteria

1. Consent version is stored.
2. Revoked consent is tracked.
3. Sensitive admin actions create audit logs.
4. Real-person and health-goal features have explicit consent boundary.
5. Professional review can inspect audit-relevant workflows.
