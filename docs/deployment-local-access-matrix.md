# Deployment and local access matrix — ADMIN-E2R transition

**ADMIN-E2 PARTIAL — WAITING_FOR_DEPLOYMENT_ENABLEMENT_AND_PRIMARY_RECOVERY.** These are accepted E2 discovery and live-test facts, not a claim that ADMIN-E1 is deployed. The three fixed public Demos auto-deploy from `main` and currently serve `d88d1000a26810dfca0f70586f11e594b3a2e44a`. The one ADMIN-E local freeze commit remains unpushed. **PUSH_REQUIRED_FOR_FIXED_DEMO.** A Vercel Production deployment target does not designate the TastKind Production backend; that backend is untouched.

| Surface | Exact fixed public Demo URL | Current remote source | Development evidence and remaining gate |
| --- | --- | --- | --- |
| Consumer | `https://haocu-demo.vercel.app` | `d88d1000a26810dfca0f70586f11e594b3a2e44a` | Development `tastkind-development` (`msbgnnoorsoefuiwluye`), environment marker `development`; CORS and in-origin E2E accepted below. Fixed Demo still needs the E1 push and post-push checks. |
| Restaurant | `https://ai-nutrition-social-app-restaurant.vercel.app` | `d88d1000a26810dfca0f70586f11e594b3a2e44a` | Unauthenticated request returned `307 → /login?reason=session`; client assets exposed no Supabase ref or server secret. Development backend linkage is **NOT YET LIVE-PROVEN** because configuration is server-side; verify after the E1 push. |
| Admin | `https://tastkind-admin-demo.vercel.app` | `d88d1000a26810dfca0f70586f11e594b3a2e44a` | `/admin → /admin/login?error=configuration`. Required Supabase runtime configuration is missing or invalid in this Vercel deployment; client bundles showed no secret leakage. Configure the environment and refresh the deployment before login acceptance. |

These are the only three known fixed Demo URLs. Do not substitute a new host or report E1 as remotely deployed before the deployment-enabling push and refreshed deployments.

## Consumer E2 accepted evidence and remaining visual check

The Development `meal-photo-analysis` CORS allowlist matched `https://haocu-demo.vercel.app` before deployment. The Development function advanced **v44 → v45** with `verify_jwt = true`; CORS live acceptance was **11/11 PASS**. Consumer in-origin E2E passed: browser traffic contacted only the fixed Demo and Development Supabase, with zero direct browser requests to `api.openai.com` and no observed secret leakage. Temporary Consumer fixtures were cleaned. The live configuration uses `MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS=https://haocu-demo.vercel.app`; the origin remains configuration, never Edge source. No wildcard is allowed: `Access-Control-Allow-Origin: *` is rejected.

Full Consumer UI visual acceptance is **PENDING**: the test environment could not render the UI because four approximately 7.1 MB Noto Sans TC web fonts (about 28 MB total) blocked initial render on a slow connection. This is non-blocking `GLOBAL_QA_PERFORMANCE_DEBT`; no font optimization is part of E2R.

## Admin deployment configuration and authority target

The required Admin Vercel variable **names** are `TASTKIND_SUPABASE_URL`, `TASTKIND_SUPABASE_PUBLISHABLE_KEY`, and `TASTKIND_ADMIN_AUTHORITY_MODE`. The required authority mode is **staff**, targeting Development `tastkind-development` (`msbgnnoorsoefuiwluye`). Record and configure their values only in the appropriate private environment, never in tracked documents. The AAL2 broker's separate server configuration and live behavior still require post-deployment verification.

**Current founder status: NOT PRIMARY READY.** The existing founder account has an active Platform Admin compatibility membership and only these effective permissions: `admin_context.read`, `admin_audit.read`, `admin_restaurant_branch.status.write`. It has **no MFA factor**. This is not a completed highest-privilege account, and no grant or enrollment is performed in E2R.

The final E2 target is the **existing founder account**, made `PRIMARY READY` through the existing [authority SOP](admin-authority-sop-zh-tw.md), normal canonical grant paths, and the eight-step wizard contract:

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

After `PRIMARY READY`, final E2 must verify and, where appropriate, grant CURRENT operational permissions for this highest management account through canonical privileged-permission flows. Select only from the **live permission catalogue** where `readiness_status = current`, `lifecycle_status = active`, and `deferred = false`. Never grant PLANNED or deferred permissions. No hidden bypass and no direct table `INSERT`/`UPDATE` are authorized.

If Development has **ZERO usable PRIMARY READY accounts**, the already documented canonical Break-glass recovery procedure may be used **solely to recover or create the first normal Primary**. Break-glass must then be fully closed; the founder must operate independently through normal Primary authority. It must not persist as ordinary authority or become a new bootstrap route. In lower-privilege recovery/base contexts, `/admin/management/staff` may legitimately show an empty/no-data read surface without read permission; its RPC does not leak staff rows. Do not change that behavior in E2R.

## Old ADMIN-A fixture cleanup and remote boundary

Five obsolete `admin-a.acceptance.*` fixtures were verified and canonically revoked on Development. Active staff changed **7 → 2**, management audit count **470 → 475**, and founder authority hashes were unchanged during cleanup. This is accepted prior E2 evidence, not an action by E2R.

E2R changes repository documentation and guards only. Development, Production, Vercel configuration, the three fixed Demos, and the founder account are untouched in this round. Final Restaurant linkage, Admin configuration/login/authority, direct-refresh and full visual checks remain live post-push acceptance work.
