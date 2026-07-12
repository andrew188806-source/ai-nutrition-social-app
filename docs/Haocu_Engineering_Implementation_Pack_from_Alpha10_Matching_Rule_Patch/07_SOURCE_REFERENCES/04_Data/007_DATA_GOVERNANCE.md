# Data Governance

## Purpose
Define ownership, retention, review, and privacy principles for Haocu data.

## Data Categories

| Category | Examples | Sensitivity |
|---|---|---:|
| Account data | email, phone, auth id | High |
| Profile data | display name, avatar, bio | Medium |
| Meal data | food records, nutrition estimates | Medium/High |
| Health goal data | weight target, timeline | High |
| Social data | matches, invitations, chats | High |
| Restaurant data | menus, prices, hours | Low/Medium |
| AI logs | model outputs, corrections | Medium/High |
| Analytics | app events | Medium |
| Audit logs | admin actions, review | High |

## Ownership Rules

- User owns their profile and meal records.
- Restaurant owns official restaurant/menu data they submit, subject to platform review.
- Haocu owns derived ranking logic, aggregate analytics, and non-personal system metadata.
- AI outputs are product-generated records and must be handled under privacy policy.

## Retention Principles

- Food diary retention differs by plan: free users may have limited visible history; backend retention must follow legal/privacy policy.
- Chat/group table retention should follow product policy and user expectations.
- Audit logs may need longer retention for compliance and abuse review.
- Deleted user data should be handled through a documented deletion workflow.

## Review Boundaries

Requires review by professional/legal/compliance before external claims:

- Nutrition accuracy claims.
- Health goal logic.
- Real-person identity verification.
- Sponsored recommendation ranking.
- Restaurant nutrition disclosure.
- Data use for AI training.

## Access Control

Implement role-based access:

- user
- premium_user
- restaurant_admin
- internal_admin
- reviewer
- support

Support access to sensitive records should be logged and limited.

## Data Quality Rules

- Verified restaurant data must be distinguished from AI-estimated data.
- User correction data should be stored as event history.
- Mock/demo data must be clearly separated from production data.
- Schema changes require migration notes.

## Acceptance Criteria

1. Sensitive data categories are identified.
2. AI-estimated and verified nutrition are distinguishable.
3. Admin/support access is auditable.
4. User deletion/export path is planned.
5. Professional review queue includes health, privacy, and sponsored ranking items.
