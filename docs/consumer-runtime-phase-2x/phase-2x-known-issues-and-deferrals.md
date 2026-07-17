# Phase 2X Known Issues and Deferrals

Status: Phase 2X-A local Freeze candidate only. Later subphases have not started.

## Hard gates for later activation

- Favorites target columns are text and have no foreign keys. Development must verify the canonical catalog identifier representation and atomic writes must validate target existence/parent consistency.
- Static migrations contain owner RLS but no Favorites-specific table ACL or RPC. Effective Development ACL catalog evidence is required before Phase 2X-C.
- `favorite_menu_items` active uniqueness is `(user_id, menu_item_id)` and excludes `restaurant_id`; the canonical contract treats menu item identity as global while still validating its restaurant parent.
- The restore decision is resolved for this contract: an add after removal inserts a new active row and preserves prior removed history. It does not reactivate an arbitrary removed row.
- Existing `collection_label` and `sort_order` values are readable, but Phase 2X does not expose metadata mutation.

## Mobile cutover gaps

- Meal Log currently favorites local meal IDs and static `fav-*` cards, including a self-made dish unsupported by schema.
- Restaurants currently keys saved state by restaurant name rather than canonical ID.
- Local state has no persistence, cross-route reconciliation, async race protection, or stale-response control.
- Quota copy describes Food Memory limits but there is no approved Favorites runtime quota contract. Quota enforcement is deferred and must not be inferred from UI text.

## Privacy and lifecycle deferrals

- Deletion/anonymization of active and removed Favorites history requires the existing privacy/legal closure work.
- Public/aggregate counts and Restaurant-owner analytics are explicitly excluded, not merely unfinished.
- Denormalized `taste_profiles` favorite arrays are not canonical persistence; reconciliation/migration of any legacy values needs separate evidence and approval.

## Preserved phase boundaries

Phase 2W remains Frozen and unchanged. Recommendation Feedback remains Phase 2Y NOT STARTED. Phase 2Z is NOT STARTED. N4 and Phase 2V-F remain BLOCKED / NOT EXECUTED. Production remains untouched, and no privileged browser credential is permitted.

The pre-existing dependency issue `P2W-A-DEP-001` remains OPEN / ACCEPTED / DEFERRED. `P2V-PERF-001` remains OPEN / DEFERRED. Neither is expanded in Phase 2X-A.
