# Engineering Handoff

**DOC STATUS: CURRENT (living technical description) — reconciled 2026-09-19 against `HEAD = origin/main = 8af3fb7d108c4124bb29ab115ea00b411287b00d`.**
Sections are individually tagged where they are not current. Companion files: [engineering-state-registers.md](engineering-state-registers.md) (technical debt, deferred scope, modernization, vendor coupling, Admin inventory) and [DOCUMENT_STATUS_INDEX.md](DOCUMENT_STATUS_INDEX.md) (which documents are current, historical or superseded).

## What this system is today

TastKind／好廚 is an AI nutrition, next-meal recommendation and Meal Buddy social product with three surfaces — a consumer app (`apps/mobile`, Expo/React Native + Expo Web), a Restaurant Owner web console (`apps/restaurant-web`, Next.js 14) and a platform Admin web console (`apps/admin-web`, Next.js 14) — on a Supabase/PostgreSQL 17 backend (135 migrations, 15 Edge Functions). It is **no longer a mock-only frontend**: the Consumer, Social, Restaurant Owner and Admin Authority capabilities below run against a real Development database with real Auth. Demo/mock branches remain where marked. Nothing has been enabled in Production. The Development project's Supabase Security Advisor is not clean (summary and interpretation in [engineering-state-registers.md](engineering-state-registers.md) §9); no authority bypass was found, and the two findings about privileged/anonymous exposure (RLS-off Social lookup tables; anonymously executable privileged v2 RPCs) were closed by the pre-Admin hardening (H3, H4). Runtime configuration contracts (Consumer project URL/key; `meal-photo-analysis` origin allowlist) are recorded in registers §8.

| Area | Status | Where to read |
| --- | --- | --- |
| Consumer data runtime, AI meal analysis, Recommendation (GEO → Allergy → Ingredient Avoidance → temporal → Nutrition → Taste) | `FROZEN`, Development-accepted | Root `ENGINEER_HANDOFF.md` (historical audit at `9d68eab`), `docs/consumer-runtime-phase-2*`, `docs/recommendation/` |
| Social / Meal Buddy (cards, candidates, invite, relationship, chat, realtime, push backend) | `FROZEN` for source + Development E2E; physical-device Push acceptance not reconfirmed | Migrations `202608*`; registers TD-05 |
| IP Codex / mascot / scale system | `FROZEN`, pushed | `docs/ip-codex-scale-system.md`; section below |
| **Restaurant Owner console** (RA-2A–RA-2I, R1, R2A–R2E) | **`FROZEN` — closed and pushed** | Section "Restaurant Owner Console" |
| **Admin Authority** (staff/privileged governance) | **`FROZEN` — closed and pushed** | Section "Admin Authority"; `docs/admin-authority-sop-zh-tw.md` |
| Admin non-authority operational functionality | **Next major implementation phase — scope closed by A0 (ADMIN-A → AE1 → B → C → D → E; ADMIN-A unblocked; not started)** | Registers §7.6–7.8; `docs/admin-operational-surface-inventory.md` |
| Group Table; collectibles ownership/transfer/marketplace; platform points | `POST_MVP` | Registers §3; section "Product decisions that shape the system" |
| Production | Never enabled | Registers TD-03 |

Phase order as currently recognised: IP Codex (closed) → Restaurant (closed) → canonical reconciliation / modernization audit (this document set) → Admin non-authority operational functionality (next) → global QA / integration / handoff → Post-MVP: Group Table → Post-MVP: collectibles / ownership transfer / marketplace and platform points economics.

> **Legacy mock-era sections.** The sections from "Start And Check Commands" through "Recommended Backend Integration Order" were written when the Consumer app was mock-first. Tags: *Start And Check Commands* — `CURRENT`. *Main Mobile Routes* — `CURRENT` but incomplete (newer routes include `/recommendation`, `/social-candidates`, `/social-interest-settings`, `/allergy-settings`, `/ingredient-avoidance-settings`, `/community-card-settings`, `/codex/**`, `/meal-buddy-chat/[relationshipRef]`, `/meal-buddy-candidate-profile/[candidateRef]`). *Critical Identity Rules* and *Compatibility Fields* — `CURRENT`. *Canonical Data Sources Today*, *Mock/Demo Markers*, *Integration Boundaries*, *UI-Only*, *Social Architecture Map*, *Known Limitations*, *Recommended Backend Integration Order* — `HISTORICAL` (they describe mock stores that have since been joined by live Supabase-backed runtimes; consult `apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts` for the live composition).

## Start And Check Commands

From the repository root:

```powershell
npm.cmd run mobile
npm.cmd run typecheck
```

Other app surfaces:

```powershell
npm.cmd run restaurant
npm.cmd run admin
```

`npm run mobile` uses `scripts/start-mobile.mjs`, which starts Expo with dependency validation disabled to avoid the current Expo CLI doctor `Body is unusable` startup bug.

## Main Mobile Routes

- `/`: demo entry and reset actions.
- `/meal-photo`: meal photo / AI analysis entry.
- `/analysis`: AI analysis result, correction, meal save, guilt/calorie sharing entry.
- `/today-intake`: today nutrition from canonical meal records.
- `/meal-log`: Food Memory / diary from canonical meal records.
- `/restaurants`: canonical restaurant/menu browsing and restaurant-created Meal Buddy cards.
- `/meal-buddies`: Meal Buddy cards, candidates, invitations, matches, chats, meal sessions, group dining shell.
- `/group-tables`: compatibility redirect into `/meal-buddies?section=tables`.
- `/community-card`: current user's Community Card.
- `/community-profile/[profileId]`: Community Profile detail route.
- `/me`, `/permissions`, `/settings`: profile/settings/demo controls.

## Critical Identity Rules

- `profileId` is the only canonical person identity.
- Do not use `tableId`, `chatId`, `sessionId`, `buddyId`, `candidateUserId`, `friend.id`, `invite.id`, or `userName` as a Community Profile route id.
- `restaurantId` is the canonical restaurant identity.
- `menuItemId` is the canonical dish/menu item identity.
- `mealId` is the canonical meal-record identity.
- Free mode hides real avatar/photo and sensitive details only; it must not change the person's `displayName`.
- Paid mode shows `realAvatar` / fake human placeholder when available.
- Meal Buddy Cards are generated from Community Profiles plus canonical restaurant/menu data. They should not independently invent person identity.

## Canonical Data Sources Today

| Domain | Current mock source | Future backend |
| --- | --- | --- |
| Community Profile | `apps/mobile/features/meal-buddy-card/mealBuddyFlowMock.ts` | Supabase `users`, `community_profiles` |
| Community Profile display | `apps/mobile/features/display-resolvers/communityProfileDisplayResolver.ts` | profile display API/read model |
| Meal Buddy Card | `apps/mobile/features/meal-buddy-card/mealBuddyCardMock.ts`, `mealBuddyCardStore.ts` | `meal_buddy_cards` |
| Candidates / matches / chat seed | `mealBuddyFlowMock.ts`, `mealBuddySocialStore.ts` | `invitations`, `matches`, `chat_threads`, `chat_messages` |
| Group Dining | `apps/mobile/features/group-tables/groupTableStore.ts` for active table state; `mealBuddyFlowMock.ts` for table participant seed profiles; `mealBuddySocialStore.ts` for group chat/invite transitions | `group_tables`, `group_table_members`, `group_table_messages` |
| Restaurant/Menu | `apps/mobile/features/restaurants/restaurantBackendMock.ts` | `restaurants`, `menu_items`, `nutrition_estimates` |
| Meal Records | `apps/mobile/features/analysis/analysisMealRecordStore.ts` | `meal_records`, `meal_photos`, `meal_ratings`, `planned_meals` |
| AI Analysis Sample Data | `apps/mobile/features/analysis/analysisCorrectionData.ts` plus analysis copy | AI analysis jobs/results/corrections |
| Calorie/Guilt Sharing | `apps/mobile/features/calorie-sharing/calorieSharingMock.ts` | `meal_sharing_sessions`, `sharing_participants` |
| Demo clock | `apps/mobile/features/demo-time/demoTimeStore.ts` | server time / scheduled jobs |

## Mock/Demo Markers

Mock files are marked with one or more of:

- `DEMO_ONLY`
- `MOCK_DATA`
- `TODO_BACKEND_REPLACE`
- `TODO_SUPABASE_REPLACE`

Important marked files:

- `mealBuddyFlowMock.ts`: Community Profiles, matched buddies, social graph, group participants.
- `mealBuddyCardMock.ts`: generated Meal Buddy Card builder.
- `mealBuddyCardStore.ts`: mutable active card pool.
- `mealBuddySocialStore.ts`: invitations, chats, match/session transitions.
- `restaurantBackendMock.ts`: canonical restaurant/menu mock.
- `analysisMealRecordStore.ts`: canonical meal-record demo store.
- `analysisCorrectionData.ts`: AI analysis correction/sample data.
- `calorieSharingMock.ts`: calorie/guilt sharing mock state.
- `groupTableStore.ts`: active group dining table demo state.

## Integration Boundaries

### A. Community Profile

Current:

- `profileId` is canonical.
- `resolveCommunityProfileDisplay(profileId)` resolves display name/avatar/tags.

Future:

- Supabase `users` and `community_profiles`.
- Keep route `/community-profile/[profileId]` stable.

### B. Meal Buddy Card

Current:

- Cards generated by `buildMealBuddyCardFromProfile(profileId, restaurantId, menuItemId, options)`.
- Active demo cards stored in `mealBuddyCardStore.ts`.

Future:

- `meal_buddy_cards`.
- Store `profileId`, `restaurantId`, `menuItemId`, meal date/time, dining mode, payment preference, note, and status.

### C. Invitations / Matches / Chats

Current:

- `mealBuddySocialStore.ts` owns invitations, matched state, chat previews/messages, and local persistence.

Future:

- `invitations`, `matches`, `chat_threads`, `chat_messages`.
- Realtime delivery, moderation, notifications, and auth ownership checks.

### D. Group Dining

Current:

- Active table state in `groupTableStore.ts`.
- Group chat and table invites in `mealBuddySocialStore.ts`.
- Participants must use `participantProfileIds`.
- `participantIds` is accepted only as a legacy persisted-storage read shim inside `groupTableStore.ts`; new active table records must not write it.

Future:

- `group_tables`, `group_table_members`, `group_table_messages`.

### E. Restaurant/Menu

Current:

- `restaurantBackendMock.ts` is the canonical restaurant/menu mock.
- i18n is UI copy only, not restaurant database.

Future:

- `restaurants`, `menu_items`, `nutrition_estimates`.

### F. Meal Records

Current:

- `analysisMealRecordStore.ts` is canonical for visible meals, ratings, completion, planned dinner settlement, and sharing references.

Future:

- `meal_records`, `meal_photos`, `meal_ratings`, `planned_meals`.

### G. Calorie/Guilt Sharing

Current:

- `calorieSharingMock.ts` and meal-record fields.

Future:

- `meal_sharing_sessions`, `sharing_participants`.

## UI-Only / Presentation Areas

- `apps/mobile/app/*.tsx` route files compose screens and navigation.
- `apps/mobile/components/DemoUi.tsx` and `apps/mobile/theme` are presentation primitives.
- `MealBuddyCardComponents.tsx` is UI rendering for cards/candidates; keep data generation in stores/mocks.
- `lib/i18n/zh-TW.ts` should provide labels/copy only. Do not use its old social candidate copy as data.

## Compatibility Fields

Keep until screens and persistence are fully migrated:

- Meal Buddy Card: `userId`, `preferredFoodName`, `restaurantName`, `foodCategory`, `preferredTime`, `diningDate`, `visibilityStatus`.
- Social/chat: `buddyId`, `candidateUserId`, `userName`, `restaurantName`. In direct-chat/invite records these fields must carry canonical profile ids, not copied display names.
- Group dining: `participantIds` only for legacy persisted table hydration; active code should use `participantProfileIds`.

These fields are compatibility/persistence shims. Canonical references remain `profileId`, `restaurantId`, `menuItemId`, `mealId`, `tableId`, and `chatThreadId`.

## Social Architecture Map

```text
Community Profile
  apps/mobile/features/meal-buddy-card/mealBuddyFlowMock.ts
  apps/mobile/features/display-resolvers/communityProfileDisplayResolver.ts
    -> Meal Buddy Card
       apps/mobile/features/meal-buddy-card/mealBuddyCardMock.ts
       apps/mobile/features/meal-buddy-card/mealBuddyCardStore.ts
    -> Invitation
       apps/mobile/features/meal-buddy-card/mealBuddySocialStore.ts
    -> Match
       apps/mobile/features/meal-buddy-card/mealBuddyFlowMock.ts
       apps/mobile/app/meal-buddies.tsx
    -> Chat
       apps/mobile/features/meal-buddy-card/mealBuddySocialStore.ts
    -> Group Table
       apps/mobile/features/group-tables/groupTableStore.ts
       apps/mobile/features/meal-buddy-card/mealBuddyFlowMock.ts
       apps/mobile/app/group-tables.tsx
```

## Known Limitations

- Several route files are still large: `meal-buddies.tsx`, `group-tables.tsx`, `restaurants.tsx`, `meal-log.tsx`.
- Local storage is synchronous at the feature API boundary; native hydration needs a proper loading lifecycle before production.
- `/social` and `/group-tables` remain compatibility routes.
- The old `lib/i18n/zh-TW.ts` social candidate array has been emptied. Meal Buddy data now comes from feature-owned mock sources.
- Some strings in older restaurant/meal mocks have encoding damage from previous data imports; replace at backend integration time rather than patching unrelated UI copy.
- No lint script exists yet. Add linting only after the team agrees on rules to avoid whole-MVP churn.

## Recommended Backend Integration Order

1. Community Profile auth/read model: `users`, `community_profiles`.
2. Restaurant/Menu: `restaurants`, `menu_items`, `nutrition_estimates`.
3. Meal Records: `meal_records`, `meal_photos`, `meal_ratings`, `planned_meals`.
4. Meal Buddy Cards: `meal_buddy_cards` generated from profile + restaurant/menu.
5. Invitations/Matches/Chats: realtime social tables.
6. Group Dining: group tables, members, group messages.
7. Calorie/Guilt Sharing: sharing sessions and participants.
8. Remove legacy i18n social candidate copy and compatibility mirror fields after all screens use backend records.

## Admin Authority (Platform Management, `apps/admin-web`)

Staff/permission authority is a separate `admin_internal` schema authority stack (RA-3-IA-P3-P6, migrations `20260912010000`...`20260916040000`), independent of the consumer/mobile tables above. Operator-facing procedure lives in [docs/admin-authority-sop-zh-tw.md](admin-authority-sop-zh-tw.md) (《最高權限開啟 SOP》) — read that first for anything hands-on. This section is the engineering summary.

**Architecture, bottom to top:**
- **P1A-P1C / P2A-P2D**: foundation tables (`staff_accounts`, `staff_permission_entitlements`, `staff_permission_catalog`, `staff_permission_delegations`) and the effective-permission resolver (`staff_current_context_v1`, `staff_has_permission_v1`).
- **P3A-P3F**: staff lifecycle (P3B), ordinary delegated grants (P3C/P3D), console admission (P3E), privileged direct grants (P3F) — each a pair of a protected `_v1` function (owned by `staff_step_up_gate_authority`, EXECUTE granted only to that role) and, after P3H, a `_v2` wrapper that gates the `_v1` call behind a live Step-Up receipt.
- **P3G**: Break-glass — a separate, postgres-owner-only emergency control plane (`scripts/break-glass-control.mjs`, `npm run break-glass`). Completely independent of everything below; a compromised admin-web session cannot reach it.
- **P3H**: the Step-Up authority itself — TOTP + AAL2, a 15-minute non-sliding database receipt issued only through a narrowly-scoped Postgres broker LOGIN (`TASTKIND_P3H_BROKER_DATABASE_URL`, env name only, never the value), an HttpOnly cookie (`apps/admin-web/auth/admin-step-up-cookie.ts`), and the ten protected `_v1` functions closed to everyone except that gate role. `apps/admin-web/server/adminStepUpMutationRuntime.ts` is the only caller of any `_v2` wrapper; nothing in `admin-web` calls a protected `_v1` function directly (re-verified by grep this round — zero matches outside the broker's own receipt issue/revoke calls). **Outer ACL (H3, `20260919020000`):** the ten `_v2` wrappers are executable only by `authenticated` — the signed-in user session admin-web calls them with; `anon`, PUBLIC, `service_role` and `authenticator` have no EXECUTE. (The P3H migration's own revoke/grant on those functions ran as a non-owner and had no effect; H3 performs it as the sealed owner role.) No function body, contract, step-up, AAL2 or audit semantics changed.
- **P3I**: promotes `admin.management.read` / `.permissions.read` / `.staff.read` from PLANNED to CURRENT and adds a sealed read-only role (`staff_management_read_authority`) with four permission-gated RPCs for the roster/detail/authority-aggregate/catalog reads the UI needs. `admin.management.staff.bundle.write` stays PLANNED — role (Bundle) management is still out of scope.
- **P3J**: extends the same read role to the P3H evidence tables (`staff_step_up_receipt_uses`, `staff_security_notification_outbox`), gated by the pre-existing `admin_context.read` + `admin_audit.read` (not a new key), powering `/admin/management/security-log`.

**Primary Permission Manager** is not a database role. It is a *display-only* derivation (`PRIMARY_READY_KEYS` in `apps/admin-web/app/admin/management/staff/[staffAccountId]/page.tsx`) over whether a staff account holds all eight `admin_context.read`/`admin.management.*` keys as active entitlements. There is no `primary_admin` superuser anywhere in the schema; authority is exactly the sum of a staff account's entitlement rows, always.

**Live routes** (all under `/admin/management`, gated by the registry in `apps/admin-web/auth/admin-route-registry.ts`): `/` (hub), `/staff` (roster + the "新增管理人員" link-existing-Auth-account panel), `/staff/[staffAccountId]` (lifecycle detail, the eight-key `PRIMARY READY` derivation, the guided "建立 Primary Permission Manager" wizard, and the one unified action form covering all ten P3B/C/E/F operations), `/permissions` (catalog), `/settings` (TOTP + Step-Up + recovery-order note), `/security-log` (P3H evidence, read-only). `/roles` stays `NOT_ENABLED` (`admin.management.roles.read` has no database counterpart yet — Bundle/role management is a future round, not this one).

`management`, `management-staff`, `management-staff-detail`, and `management-settings` are gated by `admin_context.read` only (not the stronger P3I read keys) -- deliberately, discovered during the Break-glass rehearsal below. `management-permissions` and `management-security-log` still require their own P3I/P3J read keys. This is a page-navigation relaxation only: every RPC and mutation function independently re-checks its own real permission and returns empty data / a rejection regardless of what the page renders, so no security boundary actually moved -- see brief §16 ("no security boundary may depend only on hiding a UI action"). The staff detail page's action forms (the wizard and the operation panel) also do not depend on the read RPCs succeeding, for the same reason: an actor with write-only permissions (the exact Break-glass shape) can still act, just cannot see the read-only sections.

**Primary wizard resumability**: the wizard (`apps/admin-web/components/admin-shell/PrimaryWizard.tsx`) re-reads actual effective authority from a dedicated read route (`POST /api/admin/management/staff/authority`, added this round, same auth gate as every other `/api/admin` route -- must be POST, since a same-origin GET carries no `Origin` header under this app's same-origin check) before running and after every successful step, so it always resumes from real state rather than a stale local model; a mid-run Step-Up expiry stops cleanly with a resume prompt.

**MFA recovery rule**: no password-only path ever recovers Step-Up capability — this is intentional, not a gap. Recovery order is: another device holding the same TOTP secret → another Primary → Break-glass. A Break-glass principal completes an entirely ordinary self-service TOTP enrollment after activation -- Break-glass does not pre-provision or bypass Step-Up, confirmed by a live rehearsal (enroll -> activate -> the principal's own `/admin/management/settings` self-enrollment -> real Step-Up -> link a new staff account -> run the wizard to `PRIMARY READY` -> close the activation -> the four emergency entitlements flip to `revoked` and the principal is immediately locked out again, while the newly recovered Primary's entitlements and session are completely unaffected). Deleting *someone else's* TOTP factor still requires direct API/database access; see the SOP's "技術待辦" section.

**Secrets**: two connection strings gate this whole system and neither is ever committed or logged — only their env var *names* appear anywhere in the repo or docs: `TASTKIND_P3H_BROKER_DATABASE_URL` (a narrowly-scoped Postgres LOGIN, member only of `staff_step_up_receipt_issuer_authority`, created fresh per acceptance round and dropped after) and `TASTKIND_BREAK_GLASS_DEVELOPMENT_DATABASE_URL` / `TASTKIND_BREAK_GLASS_PRODUCTION_DATABASE_URL` (DB-owner-only; `service_role` credentials are rejected by the CLI itself). In practice the Break-glass functions only require `session_user = 'postgres'`, which the Supabase Management API SQL channel already satisfies -- so Development rehearsal of enroll/activate/close/revoke was done through that same channel (the identical authorized surface `scripts/break-glass-control.mjs` itself uses), not a separate raw connection.

**Known deferred items**: `admin.management.roles.read` / Bundle-role management; Passkey/WebAuthn (TOTP is the MVP authenticator by design, see P3H markers `TOTP_AAL2_MVP_AUTHENTICATOR_SELECTED` / `PASSKEY_NATIVE_AVAILABLE_BUT_DEFERRED`); destructive MFA-factor recovery (`MFA_FACTOR_DESTRUCTIVE_RECOVERY_DEFERRED`); a "delete another operator's TOTP factor" button in the UI (still requires direct API/database access, documented as such in the SOP rather than left silent). The add-new-staff button is done (see Live routes above).

**Development migration history**: `tastkind-development` (`msbgnnoorsoefuiwluye`) is on direct-apply migration history — every migration in this stack was applied via the Management API SQL channel, not `supabase db push`. `DEVELOPMENT_MIGRATION_HISTORY_DRIFT_OPEN` (state `NOT_MODIFIED`): the remote `supabase_migrations.schema_migrations` table (66 rows when last read on 2026-09-19) does not describe the schema, which contains objects from migrations that have no history row; the repository holds 133 migrations. This includes Restaurant R2B–R2E, which were applied to Development the same way with the history deliberately left untouched. Facts and risk are recorded in `docs/engineering-state-registers.md` TD-01.

**Production**: none of this has ever been applied to Production. Before it can be, Production needs its own `TASTKIND_P3H_BROKER_DATABASE_URL` and `TASTKIND_BREAK_GLASS_PRODUCTION_DATABASE_URL` provisioned (values only, by whoever owns Production credentials — never committed), and the admin-web deployment needs `TASTKIND_ADMIN_AUTHORITY_MODE=staff` set (it defaults to a legacy Platform-Admin-table mode otherwise, which predates and is unrelated to this whole stack).

## IP／吉祥物圖鑑＋比例尺系統 (Consumer, `apps/mobile`)

Series-first collectible codex domain, independent of every other section in this document (no Auth/DB/RLS/migration touched — see [docs/ip-codex-scale-system.md](ip-codex-scale-system.md) for the full contract). No formal TastKind product exists yet; this phase built the architecture, a DEMO dataset, and the Series Gallery → Series Detail → Series Entry Detail flow so a future real product batch needs only data and assets, not new architecture.

Domain: `packages/shared/src/domain/ip-codex/` (`IpCodexDomain` namespace export). `CodexIp` → `CodexSeries` → `CodexSeriesEntry`, with `CodexCharacter` identity kept deliberately separate from Series membership (no `Character.seriesId`) so the same Character can appear in multiple Series with its own artwork/scale/dimensions per appearance — proven, not just declared, by the DEMO dataset (6 of 8 demo Characters appear in 2 Series each) and asserted by `validateCodexCatalog`. Five size concepts stay separate types: relative scale (Series-scoped ratio), physical dimensions (real product size, `mm`/`cm`, absent until a real product exists), UI display size (a `CodexAssetImage` rendering-layer token, not in the domain model), asset pixel resolution, and normalized visual bounds (for future scale comparisons that need to ignore transparent padding).

Screens: `apps/mobile/app/codex/index.tsx` (Series Gallery), `codex/[seriesId]/index.tsx` (Series Detail + scale comparison), `codex/[seriesId]/[entryId].tsx` (Entry Detail). Entry point from `apps/mobile/app/me.tsx`. Shared renderer `apps/mobile/features/ip-codex/CodexAssetImage.tsx` never stretches (aspect-ratio container + `resizeMode="contain"`). DEMO art reuses `apps/mobile/assets/mascots/*` image bytes only — deliberately does **not** touch that directory's own `SystemMascot`/`mascotAvatarKey` system (a separate, frozen, already-shipped personality-avatar feature); "mascot" as a domain term was avoided for this reason.

Validation: `npm run test:ip-codex-catalog` (`scripts/ip-codex-catalog-validate.mjs`) runs the real domain validator against the real DEMO dataset plus an asset-path-resolvability check — not a static regex probe. Root `npm run typecheck` does **not** cover `apps/mobile`; use `npm --workspace @haocu/mobile run typecheck` (or `cd apps/mobile && npm run typecheck`) for the mobile-specific surface, which is where this feature's own type errors are caught.

No database change. Per the governing brief, this phase intentionally stays a local/static typed catalog registry (no new table, no migration) since no formal product exists to persist yet.

## Restaurant Owner Console (`apps/restaurant-web`)

Separate from the "Restaurant/Menu" section above, which describes the **Consumer mobile app's** read-only restaurant-browsing mock (`apps/mobile/features/restaurants/restaurantBackendMock.ts`). This section is the **Restaurant Owner-facing web console**, a distinct Next.js 14 App Router app (`apps/restaurant-web`, `TASTKIND_RESTAURANT_DATA_SOURCE=mock|supabase|disabled`). The two apps share the same underlying `restaurants`/`branch_menu_items` schema but are otherwise independent.

**LIVE OPERATIONAL today** (real Supabase Auth, real SECURITY DEFINER RPCs, owner-only RLS, version-concurrency on every write — the "RA-2" round family, `supabase/migrations/2026090[4-9]*` and `202609100*`):
- Auth/session (`/login`), restaurant access context + restaurant selection (persisted via an httpOnly cookie), branch list read.
- Branch profile writes: display name, public phone, weekly hours, special-date hours, operational closures (`/restaurant/locations`).
- Per-branch menu item writes: sold-out, availability, price (whole TWD, 1–999,999), visibility (available/hidden), and the **branch-specific display-name override** — `branch_menu_items.branch_specific_name`: NULL falls back to canonical `menu_items.name`; SET requires 1–80 Unicode code points after outer-trim only (interior whitespace preserved), rejects whitespace-only/control characters; `set`/`clear` are explicit, never inferred (`/restaurant/menu`, same component as `/restaurant/menu/items`).
- Restaurant "about" text, public website URL, public social links (`/restaurant/settings`) — website/social links route through a `service_role`-only `v2` RPC via a Next.js API route (`app/api/restaurant/settings/*`), by design, not a gap.
- Nutrition summary — read-only.

**CATALOG AUTHORING — LIVE-ACCEPTED IN DEVELOPMENT, CLOSED (R2B–R2E)** — R2B (`supabase/migrations/2026091801*`–`2026091805*`) added privileged Restaurant Owner **creation** authority for the catalog itself, closing the "UPDATE-only" gap the paragraph below used to describe. R2C wired that authority into `apps/restaurant-web`. See `docs/restaurant-owner-catalog-authoring-r2b.md` for the full RPC contract and the R2C integration notes at its end:
- Menu create/rename/lifecycle (`menu.write`) — `/restaurant/menu`'s new "菜單" panel (`components/menu/RestaurantOwnerMenuManagementPanel.tsx`). Draft/published/archived.
- Menu Category create/rename/reorder (`menu_category.write`) — the new "分類" panel (`components/menu/RestaurantOwnerCategoryManagementPanel.tsx`). Delete is `CATEGORY_DELETE_DEFERRED` (still not implemented; no delete button rendered).
- Menu Item create (`menu_item.write`) — `/restaurant/menu/items/new` is now a real form (`components/menu/RestaurantOwnerMenuItemCreateForm.tsx`, replacing the prior `DeferredPage` stub), reusing the restaurant's already-loaded `menus`/`categories` for its dropdowns (no new read RPC). Content edit + draft/active/archived lifecycle for existing items is inline in `LiveMenu` via `components/menu/RestaurantOwnerItemCatalogControls.tsx`. `nutrition_badge_status`/`badge_enabled`/`nutrition_id`/`tag_ids`/`image_url` are not exposed in any form field, matching the backend's structural exclusion.
- Branch Menu Item **linkage creation** (`branch_menu_item.create`) — `components/menu/RestaurantOwnerBranchLinkageStep.tsx`, offered both right after item creation and per-item inside `LiveMenu` for branches not yet linked. Multi-branch selection submits sequentially with per-branch result reporting; a failed linkage never rolls back a successful item creation (the item stays a valid draft).
- A DB-level trigger enforces that `menu_items.restaurant_id`/`branch_menu_items.restaurant_id` agree with their transitive menu/branch/item chain (previously unenforced redundant columns) — unchanged by R2C.
- All 12 new API routes (`app/api/restaurant/{menus,menu-categories,menu-items,branch-menu-items}*`) follow the exact same server-route → repository → RPC layering as every existing RA-2 control; the browser never calls Supabase directly and never performs a raw table write.
- Mock mode (`TASTKIND_RESTAURANT_DATA_SOURCE=mock`) intentionally has no write path for any of this — `/restaurant/menu/items/new` shows a plain "Demo 模式暫不支援此項寫入操作" explanation instead of a form; the existing mock `MenuListPanel` read view is untouched.
- **R2D/R2E CLOSED THIS**: R2D applied R2B to `tastkind-development` and proved the full flow live with a real Owner — self-service catalog authoring, cross-tenant denial, tenant-consistency triggers, stale-state, duplicate-linkage, Consumer visibility gating, and RA-2 interop all pass. R2D also found and fixed a pre-existing R1 defect (`SELECTED_RESTAURANT_COOKIE`/`SELECTED_BRANCH_COOKIE` needed `Path=/`, not `Path=/restaurant`, to reach `/api/restaurant/**` — invisible for single-restaurant owners, broke every owner-write API route for a multi-restaurant one). R2D also found a second, narrower defect in frozen RA-2F (its sealed role had no RLS visibility on a `draft`-status `menu_items` row, a state R2B-5 newly made reachable) and correctly deferred it rather than patching ad hoc; R2E closed it with one additive tenant-scoped RLS policy, no RPC/RLS-body changes to RA-2F itself. See `docs/restaurant-owner-catalog-authoring-r2b.md`'s R2D/R2E sections for full detail. `RESTAURANT_OWNER_MVP_OPERATIONAL` — Restaurant Owner catalog authoring is live-accepted end to end.

**NOT operational — `DEFERRED` product scope, not defects** (no DB-layer capability exists at all, not a UI gap; see registers §3, DF-02 to DF-05):
- Creating a branch, or provisioning a new `restaurant_users`/`restaurant_memberships` row (no self-serve owner onboarding exists at the DB layer) — explicitly out of R2B's scope by design, a separate future concern.
- **Restaurant name edit** — `RESTAURANT_NAME_WRITE_AUTHORITY_ABSENT`: no RPC, RLS policy, or migration anywhere writes `restaurants.name` (confirmed by exhaustive grep of every `update public.restaurants` in the migration set — only `public_website_url`, `restaurant_about`/`restaurant_about_source`, and social-link columns are ever written). Only the free-text "about" description is editable.
- Menu/restaurant-item **image upload** — no Storage bucket, no upload/delete RPC, no UI form anywhere. `menu_items.image_url` is a plain, unmanaged, display-only `text` column.
- Nutrition writes, staff/team write authority (roles `manager`/`staff` exist and are read-scoped by branch, but hold zero granted write permission in the entire migration history — this is deliberate, not partial).

**MOCK / DEMO MODE** (`TASTKIND_RESTAURANT_DATA_SOURCE=mock`, dev-only, forced off in production): a parallel read-mostly mock stack (`adapters/mock/`, `services/restaurantConsoleService.ts`) — note the mock-mode Menu screen is read-only cards with no edit controls at all, a real capability difference from live mode, not just a different data source.

**DEFERRED** (route/component intentionally preserved, hidden from primary navigation as of R1 — see `apps/restaurant-web/data/navigation.ts`'s `phaseTwo` flag): analytics (exposure/nutrition-badge/menu-performance), staff/team management (UI components exist in `components/staff/StaffPanels.tsx` but are unreachable and even their buttons have no handlers), the store assistant, media/image manager, pending-menu-items, and orders/table system (`orders-preview`, already self-flagged in-app).

**Branch context**: the selected branch persists across page navigation as a UX preference cookie (`tastkind_restaurant_selected_branch`, R1) — it is never an authorization token; every read/write path independently re-validates the branch against the caller's real access context on every request. A stale or cross-restaurant value is silently ignored (branch ids are globally unique, so a leftover preference from a previously-selected restaurant simply won't be found in the new restaurant's branch list).

**Test coverage**: ~150 Restaurant-scoped `scripts/*.mjs` files. The RA-2A–RA-2I family (~55 scripts: contract/guard/mutations/smoke/postgres-apply/development-acceptance per feature) is npm-registered at root; the `phase-2v` (tenant isolation/internal-read/performance) and `mi-e-c5-r7` (meal-identification restaurant-context) tracks are not registered anywhere and are runnable only via direct `node scripts/<file>.mjs`. No CI workflow exists in this repo. Each RA-2x round's `*-guard.mjs` is a **frozen single-round** check (pins an exact baseline commit and "exactly one migration ahead" at authoring time) — it will correctly report FAIL today purely because later rounds landed afterward; that is expected frozen-round behavior, not a regression. (The R2B guard is successor-aware for exactly one authorized successor, the R2E migration, by pinning the exact final six migration filenames.)

**Documentation note**: root `ENGINEER_HANDOFF.md`/`README.md` predate the RA-2 build-out (frozen at a 91/92-migration baseline) and the Restaurant/Admin closures; they are marked `HISTORICAL` in place (see [DOCUMENT_STATUS_INDEX.md](DOCUMENT_STATUS_INDEX.md)). This file and [engineering-state-registers.md](engineering-state-registers.md) are the current technical description.

## Product decisions that shape the system

These are product/domain decisions an engineer needs in order to understand *why* the system is shaped as it is. They describe intent and constraints, not working methods. Status tags: `CURRENT_PRODUCT_DECISION` = in force; `POST_MVP`/`DEFERRED` = not built.

**Consumer scope.** Main Consumer feature scope is frozen; no new major Consumer feature line is assumed. Adjustments that remain allowed *inside existing features*: nutrition calculation methodology, restaurant recommendation principles, Meal Buddy matching-score composition (algorithm/rule changes, not new product lines).

**Social / Meal Buddy.** Every formal social-matching entry point is mediated by a Meal Buddy Card; no parallel direct person-to-person matching ingress exists. Card meal context is derived from the selected/recommended meal — the user does not pick an internal context taxonomy. Context/scoring metadata is backend matching data.

**Restaurant.** Restaurants author their own catalog through the Owner console; platform staff are not the routine data-entry operator. `menu_items.name` is tenant-local canonical text (see registers §1.1). Nutrition enrichment is not a visibility gate but is a recommendation-eligibility input.

**Admin.** Three concerns stay conceptually separate — Restaurant operational administration, Platform administration, Engineering/maintenance — and authority never rests on UI hiding alone. Admin Authority is closed; the next Admin phase is non-authority operations (registers §7).

**IP Codex.** UX is series-first (Series → Series Entry → Entry detail). Identity model is IP → Series → Series Entry; a Character is independent of any Series and may appear in several with different assets/dimensions/scale/metadata. The codex is not monkey-specific. Scale supports `relativeScale`, `physicalDimensions`, `visualBounds` and scale comparison; the current dataset is intentional demo data because no real product dimensions exist yet.

**Collectibles — `POST_MVP`, nothing implemented.** The intended model keeps three things separate: (1) *style / catalog identity*, (2) *physical Product Instance*, (3) *current ownership*.
- Style identification is closed-set visual recognition/retrieval against the registered Codex catalog (multiple views/angles/lighting may be kept as references). First-generation identification does not require NFC or hidden AI codes.
- Each physical collectible has a unique permanent Product Instance ID and a unique permanent QR. The QR identifies the *instance*; it never encodes current ownership.
- An initial scan may bind an unowned instance to the collector. An already-owned instance cannot be re-bound by another user scanning the permanent QR. Transfer (second-hand/exchange) is owner-authorised through a one-time transfer credential (code/QR or equivalent); the permanent QR is unchanged by a transfer.
- Product constraint: the Product Instance model is meant to stay compatible with any later transaction/points system, i.e. it should not need to be reconciled against a conflicting instance model.

**TastKind Points and restaurant points — `POST_MVP` / `DEFERRED`, nothing implemented.** TastKind Points, if built, are a platform-controlled economic ledger, separate from restaurant-owned membership/promotion programmes. Restaurants are not initially part of a shared points ecosystem; restaurant-specific TastKind points are deferred. Product concepts recorded as design *inputs* (not commitments): three redemption tracks — points + cash; point-based limited/free item draw or redemption; high-point pure-point designated redemption. Each redeemable item conceptually carries its own inventory, so points deduction and inventory deduction must be atomic with respect to each other.

**Transactions, POS, receipts — `POS_DIRECTION_DECISION_DEFERRED`.** No choice has been made between integrating existing POS providers, a TastKind-native POS/transaction system, or a hybrid. The only standing constraint is to avoid a half-complete parallel checkout workflow that duplicates operational burden on restaurants. Any monetisation of restaurant transactions would apply only to transactions TastKind actually brings and completes through a TastKind transaction path. Receipt recognition is intended to prefer: identify restaurant → match receipt line to the existing restaurant catalog → map receipt alias / POS item code to the canonical `menu_item`/`branch_menu_item` → reuse known nutrition/catalog data, with OCR + AI estimation only as the fallback when catalog matching fails. Receipt and transaction architecture should stay compatible with either POS direction.

**Group Table — `POST_MVP`.** Design and specification remain; see registers DF-06.
