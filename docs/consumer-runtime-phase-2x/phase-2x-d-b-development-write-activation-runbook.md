# Consumer Runtime Phase 2X-D-B — Development Favorites Write Activation Runbook

Status: operator handoff only. Phase 2X-D-A does not execute this runbook.

## Fixed target and migration

- Project name: `tastkind-development`.
- Project ref: `msbgnnoorsoefuiwluye`.
- Region: `ap-southeast-1`.
- Production: `false`.
- Pre-deployment local/remote migrations: `36/35`.
- Pre-deployment latest remote migration: `20260718010000_consumer_favorites_authenticated_read.sql`.
- Only pending migration: `20260718020000_consumer_favorites_atomic_write.sql`.

Claude must compute and compare the Frozen Phase 2X-D-A migration SHA before every deployment attempt. No credential, actor identity, controlled target value, token, session, or favorite content belongs in Repository evidence.

## Gate A — Fresh Development identity

Freshly confirm the exact name, ref, region, and Production=false through the approved management channel. Missing authentication, identity ambiguity, another project, or any Production indication is an immediate stop. Do not inspect or print an access token and do not use a privileged browser credential.

## Gate B — 35/36 migration alignment

Confirm all 35 deployed versions align byte-semantically with the first 35 local migrations, remote does not record `20260718020000`, and exactly one local migration is pending. If remote already records the version, stop and verify version/content/checksum rather than executing it again. Do not reset, repair history, or deploy another migration.

## Gate C — Menu-item identity and existing-data hard gate

Catalog evidence must establish all of the following before deployment:

1. `menu_items.id` has a primary or unique structural constraint independent of row count.
2. No duplicate `menu_items.id` group exists.
3. Every menu item has one canonical restaurant parent.
4. Existing active `favorite_menu_items` rows do not associate one `menu_item_id` with conflicting restaurants.
5. The existing `favorite_menu_items_one_active(user_id, menu_item_id) WHERE removed_at IS NULL` index is present and valid.
6. The `(menu_items.id, menu_items.restaurant_id)` parent constraint is present.

Zero rows or zero duplicate groups alone is insufficient permanent proof. If structural global uniqueness cannot be proven, stop: do not deploy, do not modify the existing index, and escalate the target-identity/index contract for review.

## Gate D — Pre-deployment catalog and aggregate baseline

Record sanitized metadata and aggregate counts for both Favorites tables. Confirm RLS and owner policies remain intact, authenticated has SELECT-only table access, direct DML is denied, and none of the four new RPCs exists remotely. Record no raw row, owner, or target value.

## Gate E — Single migration deployment

Only after Gates A–D pass may Claude deploy exactly `20260718020000`. After deployment, local and remote histories must align at `36` with that migration latest. A failure is a hard stop; no manual function replacement or remote hotfix is authorized.

## Gate F — Function and ACL verification

Verify all four exact function signatures, one overload each, owner, `SECURITY DEFINER=true`, fixed `pg_catalog, public, pg_temp` search path, and function definitions matching the Frozen migration. Verify:

- authenticated execute=true on all four functions;
- anon and PUBLIC execute=false;
- authenticated table SELECT=true and direct INSERT/UPDATE/DELETE=false;
- anon/PUBLIC have no Favorites table privilege;
- RLS and owner policies remain unchanged;
- no generic Favorites writer, view, public aggregate, or owner analytics object was added;
- aggregate row counts still equal Gate D.

## Gate G — Controlled two-actor write smoke

Use two approved Development test actors and controlled canonical restaurant/menu-item targets supplied outside the Repository. Before executing, verify the targets exist, the menu item belongs to the restaurant, neither actor has conflicting pre-existing active/history rows for those targets, and exact operator cleanup is authorized.

Through the formal Consumer Auth and Consumer Favorites factory/runtime path, with `readSource=supabase` and `writeSource=supabase`, verify for both entity kinds:

1. add returns `added` and read returns active;
2. duplicate add returns `already_present` with one active row;
3. remove returns `removed` and read returns missing;
4. second remove returns `already_absent`;
5. re-add returns `added`, creates a new active row, and preserves removed history;
6. simultaneous duplicate adds converge to one `added` plus one `already_present` and one active row;
7. simultaneous removes converge to one `removed` plus one `already_absent`;
8. actor A cannot read or mutate actor B's rows, while the same canonical target remains owner-isolated;
9. direct authenticated table INSERT/UPDATE/DELETE remains denied.

Do not print actor IDs, credentials, target values, favorite IDs, rows, or payloads.

## Gate H — Exceptional Development cleanup and final proof

The public lifecycle deliberately retains removed history, so the application RPC cannot restore aggregate counts after a full add/remove/re-add smoke. Cleanup must therefore be an explicitly authorized Development-only operator action, limited to the exact synthetic actors and controlled targets created for this smoke. It must not be exposed as an RPC, use a browser privileged credential, touch unrelated rows, or become a normal lifecycle precedent.

In `finally`, sign out both actors, verify sessions cleared, remove only the exact synthetic smoke rows through the approved database-operator cleanup channel, and delete local scratch artifacts. Then repeat the aggregate catalog queries and require exact equality with Gate D. Verify no active/history smoke row remains and record `persistent test data=false`.

If exact cleanup authorization is unavailable, do not start Gate G. If cleanup fails or aggregate counts differ, stop and do not Freeze.

## Freeze conditions

Phase 2X-D may Freeze only after Gates A–H pass with sanitized evidence, native runner exit zero, exact migration alignment at 36, verified cleanup, and no persistent test data. Production, N4, Phase 2X-E, and Phase 2Y remain not started. No push belongs to this runbook unless separately authorized.
