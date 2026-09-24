# Deployment and local access matrix — ADMIN-E final live closure

**ADMIN-E FINAL LIVE CLOSURE — LIVE PASS.** The three fixed public Demos auto-deploy from `main` and now serve `31b55d3101c08a48f868b7988ce8ad6332e2f3fd`, which includes the ADMIN-E1 legacy-route closure and the database-clock AAL2 hardening. A Vercel Production deployment target does not designate the TastKind Production backend; that backend was never touched. Every backend below is Development `tastkind-development` (`msbgnnoorsoefuiwluye`). This document contains no credentials.

| Surface | Exact fixed public Demo URL | Current remote source | Development evidence |
| --- | --- | --- | --- |
| Consumer | `https://haocu-demo.vercel.app` | `31b55d3101c08a48f868b7988ce8ad6332e2f3fd` | Bundle references only `msbgnnoorsoefuiwluye`, environment marker `development`, zero `api.openai.com` occurrences, no server secret shape. CORS contract re-verified 11/11 PASS; `meal-photo-analysis` is ACTIVE with `verify_jwt = true`. |
| Restaurant | `https://ai-nutrition-social-app-restaurant.vercel.app` | `31b55d3101c08a48f868b7988ce8ad6332e2f3fd` | Unauthenticated `/restaurant` returns `307 → /login?reason=session`. A Development-issued session is accepted by the server, and a temporary owner membership read real Development data (restaurant `好廚健康碗 Development`, two branches, menu and item counts). No client Supabase ref or server secret. Function region `iad1`. |
| Admin | `https://tastkind-admin-demo.vercel.app` | `31b55d3101c08a48f868b7988ce8ad6332e2f3fd` | Function region `sin1` (`x-vercel-id` shows `sin1`). Founder login, Step-Up, dashboard, Restaurant pending, nutrition pending, Social Policies and platform-membership audit were accepted live; no client Supabase ref or server secret in the assets. |

These are the only three fixed Demo URLs. Do not substitute a new host.

## Admin Vercel Production configuration (names only)

The Admin project requires exactly these variable **names**: `TASTKIND_SUPABASE_URL`, `TASTKIND_SUPABASE_PUBLISHABLE_KEY`, `TASTKIND_ADMIN_AUTHORITY_MODE` (value **staff**), `TASTKIND_P3H_BROKER_DATABASE_URL`, and `TASTKIND_ADMIN_AUDIT_DATA_SOURCE` (value `supabase`; without it the platform-membership audit page has no data source). Record values only in the private Vercel environment, never in tracked documents. No `service_role` key and no owner/`postgres` database credential may exist in the Admin runtime. The Function Region is `sin1`, next to the Development database region, because the step-up broker has a 3 second connect timeout.

### Permanent P3H step-up broker

`tastkind_admin_step_up_broker` is **permanent, intended runtime infrastructure** on Development: `LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, connection limit 10, and its only membership is `staff_step_up_receipt_issuer_authority` (`inherit`, `set`, no admin). It can execute `staff_step_up_issue_receipt_v1`, `staff_step_up_receipt_status_v1` and `staff_step_up_revoke_receipt_v1` only; it cannot execute the validate/record functions, any staff mutation function, or `SET ROLE` into any sealed authority role. The receipt issuer still rejects `session_user = postgres`. The connection URL uses the Supabase Shared Transaction Pooler (port 6543); the first connection after a password rotation may fail once before the pooler accepts the new password. Do not delete this role during closure; rotate its password only through a controlled change.

## First Primary bootstrap is cross-principal

Break-glass does **not** let an actor grant itself Primary authority. P3B, P3C, P3D, P3E and P3F all keep `self_target_denied`, and that invariant is unchanged. The recovery actor uses a finite Break-glass activation only to link and equip a different, legitimate staff identity. That independent Primary then grants the original actor the same authority through the normal cross-account P3F/P3E operations, and the activation is closed. The founder must therefore never run the Primary Wizard on the founder's own account.

Live bootstrap on Development: the founder staff account was activated under Break-glass; a separately controlled staff account `N` (`fc83bf72…`) was linked and taken through the eight-step Primary Wizard; the activation was canonically closed (`first_primary_n_ready`); `N` enrolled its own TOTP, passed Step-Up and, with a fresh Step-Up, granted the founder (`24bed113…`) the Primary set and sixteen operational keys. The earlier self-target attempt was rejected and audited as designed.

| Step | Required effective authority |
| --- | --- |
| 1 | `admin.management.read` |
| 2 | `admin.management.staff.read` |
| 3 | `admin.management.permissions.read` |
| 4 | `admin.management.staff.account.write` |
| 5 | `admin.management.staff.delegation.write` |
| 6 | `admin.management.staff.console_admission.write` |
| 7 | `admin.management.staff.permission.write` — explicit high-privilege confirmation phrase required |
| 8 | `admin_context.read` through canonical console admission |

Development now has exactly **two** usable PRIMARY READY accounts (the founder and `N`), no live Break-glass activation, and no effective temporary Break-glass entitlement. The single enrolled Break-glass principal is the founder; closed activations remain as audit history. A first-Primary recovery may again use this route only when Development has **ZERO usable PRIMARY READY accounts**, and it must again be fully closed.

Founder operational permissions granted through the privileged-grant lane (all catalogue `readiness_status = current`, `lifecycle_status = active`, `deferred = false`; PLANNED and deferred keys were never granted): `admin.dashboard.counts.read`, `admin.nutrition.certification.pending.read`, `admin.restaurants.about.read`, `admin.restaurants.branches.read`, `admin.restaurants.contact.read`, `admin.restaurants.geo.read`, `admin.restaurants.hours.read`, `admin.restaurants.menu_item.read`, `admin.restaurants.menu_items.read`, `admin.restaurants.menu.read`, `admin.restaurants.menu_management.data_quality.read`, `admin.restaurants.menu_management.pending.read`, `admin.restaurants.menu_management.read`, `admin.restaurants.menus.read`, `admin.restaurants.read`, `admin.social.policies.read`; the founder already held `admin_audit.read`, `admin_context.read` and `admin_restaurant_branch.status.write`. No direct table `INSERT`/`UPDATE` and no `service_role` was used for any grant.

## Lower-privilege and legacy-route evidence

A base Admin (`admin_context.read` only) on the stable Admin Demo loads `/admin` without the protected count panel, is denied on management permissions, security log, Restaurant, menu-management, nutrition-pending and Social Policies pages, and a direct privileged-grant RPC and the Admin mutation endpoint both refuse. `/admin/management/staff` shows an empty roster for that identity and its RPC does not leak staff rows. Unauthenticated requests redirect to login. Temporary fixtures were revoked, banned and removed.

The 22 legacy roots on the deployed build: `/`, `/login`, `/pending-menu-items`, `/data-quality`, `/nutrition-review`, `/audit-trail` and `/settings` redirect to `/admin`, `/admin/login`, `/admin/restaurants/menu-management/pending`, `/admin/restaurants/menu-management/data-quality`, `/admin/nutrition/certification/pending`, `/admin/audit/platform-memberships` and `/admin/management/settings`; the three split routes are truthful gateways; the remaining twelve are explicit unavailable or no-data pages. None renders a mock operational record.

## Consumer CORS and accepted E2E

The Development `meal-photo-analysis` allowlist is exactly `MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS=https://haocu-demo.vercel.app`, verified before deployment; the origin remains configuration, never Edge source. The function was redeployed only after configuration was verified (config before deployment), and its CORS acceptance was 11/11 PASS; no wildcard is allowed and `Access-Control-Allow-Origin: *` is rejected. The Consumer in-origin E2E passed with zero direct browser requests to `api.openai.com` and no observed secret leakage. Full Consumer UI visual acceptance on a slow link remains **PENDING** because four approximately 7.1 MB Noto Sans TC web fonts (about 28 MB total) block initial render; this is non-blocking `GLOBAL_QA_PERFORMANCE_DEBT`.

## Old ADMIN-A fixture cleanup and remote boundary

Five obsolete `admin-a.acceptance.*` fixtures were verified and canonically revoked on Development. Active staff changed **7 → 2** at that time (now 3 with `N`), management audit count **470 → 475**, and founder authority hashes were unchanged during cleanup. Development `schema_migrations` stays at 66 and its documented drift is not repaired here. Production Supabase was never accessed.
