# Canonical Admin Information Architecture — RA-3-IA-P1

This document defines Admin IA metadata. It creates no route, redirect, role,
permission grant, database authority, session, API, or live-data connection.
The executable source of truth is
`apps/admin-web/auth/admin-route-registry.ts`.

## Canonical sitemap

The UI root is `/admin`. Ordinary top-level workspaces appear in this order:

1. 總覽 / Dashboard — `/admin`
2. 平台營運 / Platform Operations — `/admin/operations`
3. 餐廳營運 / Restaurant Operations — `/admin/restaurants`
4. 會員支援 / Member Support — `/admin/members`
5. 社交安全 / Social Safety — `/admin/social`
6. 營養與內容品質 / Nutrition & Content Quality — `/admin/nutrition` and `/admin/data-quality`
7. 稽核與資安 / Audit & Security — `/admin/audit`
8. 平台管理 / Platform Management — `/admin/management`
9. 工程維運 / Engineering & Maintenance — `/admin/engineering`

The registry contains 55 canonical locations, including contextual detail
routes, the future `/admin/login`, and the hidden reservation
`/admin/break-glass`. Existing pages and APIs remain at their current paths in
P1. Legacy route metadata records `ONE_TO_ONE`, `SPLIT`, `REPLACE`, or `DEFER`;
it does not activate redirects.

## Typed work and data boundaries

Staff-domain metadata distinguishes Platform Operations, Restaurant
Operations, Member Support, Social Operations, Nutrition Operations, Data and
Content Quality, Audit/Security, Platform Management, Engineering/Maintainer,
and Highest-Privilege/Break-glass work. These are IA classifications, not
database roles. Data Quality starts as a permission bundle. One person may
later receive Member Support and Social permissions, but those permissions
remain independently grantable.

Every location has one bounded sensitivity classification: `PUBLIC`,
`RESTAURANT_OPERATIONAL`, `RESTAURANT_PRIVATE`, `MEMBER_ACCOUNT`,
`USER_PRIVATE`, `HEALTH_PERSONAL_NUTRITION`, `PRIVATE_SOCIAL`,
`SECURITY_AUTH`, `AUDIT`, `ENGINEERING_DIAGNOSTIC`, or `BREAK_GLASS_ONLY`.
The role/workspace matrix describes intended least-privilege access. `FULL`
means full use of a future bounded governed feature, never raw-table access.

## Current and planned permissions

Only these repository-backed permission keys are `CURRENT`:

- `admin_context.read`
- `admin_audit.read`
- `admin_restaurant_branch.status.write`

Every other permission requirement is `PLANNED`. Planned metadata is not an
authorization result and creates no role-permission row. Wildcards are neither
declared nor executable. The only canonical capabilities marked `LIVE` are the
Platform Admin membership lifecycle audit and the governed branch-status
operation. Their UI composition remains at legacy/mixed routes until IA-P4A.

## Availability and failure behavior

Stored availability is `LIVE` (正式資料), `DEMO` (示範資料), or `NOT_ENABLED`
(尚未啟用). Runtime failure is not stored availability and uses
`正式資料暫時無法使用`. Production may never fall from a failed live source to
demo data. Demo mode must be explicit and visibly labelled. `NOT_ENABLED`
never implies backend authority.

## Semantic boundaries

Restaurant Verification means restaurant identity and operator-legitimacy
verification. It does not certify nutrition, food safety, allergens, platform
recommendation, or general quality.

Restaurant About is restaurant-provided prose and is not platform
certification. Nutrition certification belongs to a separate governed
nutrition authority. Nutritionist remains a future separate identity/role with
purpose- and consent-scoped personal-data access.

Engineering is a separate workspace for sanitized health, version and
migration/deployment posture, jobs/outboxes, aggregate push and GEO diagnostics,
feature modes, sanitized errors, and future bounded repairs. Engineering does
not grant access to meal photos, health data, private Social messages, precise
user GEO, push or auth tokens, passwords, service-role credentials, or
unrestricted SQL.

Platform Management locations for roles, permissions, and settings remain
`NOT_ENABLED`. Existing trusted-operator grant/revoke functions are not UI
authority. Break-glass is hidden from ordinary navigation, has no permission
key or page implementation, and requires a separate approved activation,
audit, and security phase.
