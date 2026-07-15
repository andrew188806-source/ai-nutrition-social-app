# Phase 2V Read Surface Contract

Status: **Frozen read-boundary design for Phase 2V-A; no projection is deployed by this document**
Authorization authority: [`tenant-authorization-contract.md`](./tenant-authorization-contract.md)

## 1. Surface Classes

Phase 2V recognizes exactly three read-surface classes.

### Public-safe

Allowlisted published data safe for the stated public or Consumer actor. Public-safe means both row-safe and column-safe. Client filters alone do not make a raw table public-safe.

Existing frozen paths:

- `restaurant_public_published_nutrition_v1`: public-safe published nutrition; readable by `anon` and `authenticated`.
- `consumer_public_next_meal_candidates_v1`: Consumer recommendation candidate projection; readable by `authenticated` only.

### Owner/internal

Allowlisted Restaurant Web operational read data. Every row is restricted by active database membership and, when applicable, branch assignment and role. Owner/internal projections must not be widened public views and must not contain admin/governance-only fields.

### Admin/governance-only

Platform review, cross-tenant governance, security, audit, moderation, role administration, internal verification, anomaly, or sensitive staff data. This class is excluded from Restaurant Web Phase 2V and belongs to the Admin Governance Runtime Track or later Restaurant Runtime work.

## 2. Global Rules

- Authentication is not membership.
- Route or client `restaurant_id` values are filters intersected with DB-authorized scope, never authorization.
- Owner/internal rows require active DB membership; branch rows may additionally require active branch assignment.
- An authenticated Consumer without restaurant membership receives zero owner/internal rows.
- A Restaurant A actor receives zero Restaurant B owner/internal rows.
- Public-safe views cannot be expanded with owner/internal fields for convenience.
- Admin/governance fields cannot be added to owner/internal projections.
- Raw tables are not column-safe merely because RLS filters rows.
- Raw and legacy grants remain until their replacement surface is deployed, cut over, validated, and dependency-free; then N4 may revoke only the approved obsolete grants.

## 3. Object Classification Matrix

Proposed names below are contract identifiers reserved for later approved implementation. They are not deployed objects and may be adjusted only if Development collision inspection requires a non-semantic naming correction.

### `restaurants`

| Field | Contract |
| --- | --- |
| Actor | Public/Consumer for published identity; active Restaurant member for internal operational identity |
| Authentication | Public subset: none or Consumer path rules; owner subset: required |
| Membership | None for public subset; active restaurant membership for owner subset |
| Row scope | Public: active/published restaurants only; owner: membership restaurants only |
| Field scope | Public presentation fields only; owner allowlist may add operational status/contact/config fields but excludes governance/security/audit |
| Proposed boundary | Existing public restaurant projection where compatible; `restaurant_owner_restaurants_v1` for owner/internal |
| Current dependency | Mobile public recommendation data; Restaurant Web mock and prepared raw-read repository |
| Cleanup prerequisite | Owner projection deployed; Restaurant Web cut over; public parity; zero raw dependency |
| Negative expectation | Non-member sees zero owner rows; Restaurant A actor cannot read Restaurant B; public actor cannot read internal fields |

### `restaurant_branches`

| Field | Contract |
| --- | --- |
| Actor | Public/Consumer for published branch presentation; active Restaurant member for internal branch operations |
| Authentication | Owner/internal required |
| Membership | Active restaurant membership plus role/branch scope where required |
| Row scope | Public active branches; owner rows limited to authorized restaurant and assigned branches for scoped roles |
| Field scope | Public location/presentation subset; owner operational subset; no governance/audit fields |
| Proposed boundary | Existing public branch projection where compatible; `restaurant_owner_branches_v1` |
| Current dependency | Mobile restaurant context; Restaurant Web mock/prepared repository |
| Cleanup prerequisite | Cross-branch negative tests and branch ownership constraints pass |
| Negative expectation | Unassigned staff sees zero branch rows; Restaurant A assignment cannot select Restaurant B branch |

### `menus`

| Field | Contract |
| --- | --- |
| Actor | Public/Consumer for published menus; active Restaurant member for internal menus |
| Authentication | Owner/internal required |
| Membership | Active membership; branch limitation when menu visibility is branch-scoped |
| Row scope | Public published menus only; owner menus for authorized restaurant/branch scope |
| Field scope | Public display fields; owner operational status/timing fields; no audit/governance fields |
| Proposed boundary | Public published-menu projection; `restaurant_owner_menus_v1` |
| Current dependency | Consumer restaurant/menu candidate chain; Restaurant Web prepared raw menu read |
| Cleanup prerequisite | Public and owner parity plus zero direct `menus` dependency |
| Negative expectation | No draft/internal menu rows through public view; no cross-restaurant owner rows |

### `menu_categories`

| Field | Contract |
| --- | --- |
| Actor | Public/Consumer for categories attached to published menus; active Restaurant member internally |
| Authentication | Owner/internal required |
| Membership | Derived through the category's menu and restaurant scope |
| Row scope | Categories whose parent menu is public or authorized |
| Field scope | Public label/order subset; owner operational subset; no audit metadata |
| Proposed boundary | Public published-category projection; `restaurant_owner_menu_categories_v1` |
| Current dependency | Restaurant/menu presentation and prepared raw repository |
| Cleanup prerequisite | Parent menu/restaurant consistency constraints and parity pass |
| Negative expectation | Caller cannot use a category ID to escape its parent restaurant scope |

### `menu_items`

| Field | Contract |
| --- | --- |
| Actor | Public/Consumer for active published items; active Restaurant member internally |
| Authentication | Owner/internal required |
| Membership | Active membership; branch scope when availability is branch-specific |
| Row scope | Public active/published items; owner items for authorized restaurant/branch |
| Field scope | Public display, description, media and published tags; owner operational fields; no internal nutrition review/governance fields |
| Proposed boundary | Existing public candidate/menu projections; `restaurant_owner_menu_items_v1` |
| Current dependency | `consumer_public_next_meal_candidates_v1`; Restaurant Web mock/prepared raw read |
| Cleanup prerequisite | Consumer/public parity, owner parity, zero raw `menu_items` dependency |
| Negative expectation | Public cannot read drafts/deleted/internal fields; owner cannot cross tenant |

### `branch_menu_items`

| Field | Contract |
| --- | --- |
| Actor | Public/Consumer for published availability; active Restaurant member for branch operations |
| Authentication | Owner/internal required |
| Membership | Active membership and role/branch assignment |
| Row scope | Public available/published associations; owner associations limited to authorized branches |
| Field scope | Public price/availability subset; owner operational availability subset; no audit fields |
| Proposed boundary | Public published availability projection; `restaurant_owner_branch_menu_items_v1` |
| Current dependency | Consumer candidate chain; Restaurant Web branch/menu reads |
| Cleanup prerequisite | Composite restaurant/branch/item consistency and cross-branch negative tests pass |
| Negative expectation | Staff assigned to Branch A cannot read Branch B owner rows; mismatched restaurant relations fail closed |

### `menu_item_nutrition`

| Field | Contract |
| --- | --- |
| Actor | No direct browser actor |
| Authentication | Not sufficient for raw access |
| Membership | Raw table remains unavailable even to ordinary members |
| Row scope | Accessed only through approved public-safe or owner/internal projection/RPC |
| Field scope | Raw history, internal source/confidence, review and lifecycle data are not public; owner subset must be explicitly allowlisted |
| Proposed boundary | Existing `restaurant_public_published_nutrition_v1`; Consumer candidates view; future `restaurant_owner_published_nutrition_v1` if owner/internal fields are required |
| Current dependency | Direct client grants already revoked by N3; upstream dependency remains for safe projections |
| Cleanup prerequisite | N4 must preserve safe owner-executed dependency chains; no direct raw grant restoration |
| Negative expectation | `anon`, authenticated Consumer, and ordinary Restaurant member cannot directly select raw rows |

### Current published nutrition

| Field | Contract |
| --- | --- |
| Actor | Public/Consumer only through safe projections; Restaurant member only through owner projection if needed |
| Authentication | Existing Restaurant public nutrition supports none; Consumer candidate path requires authenticated |
| Membership | Required only for owner/internal projection |
| Row scope | Current published nutrition only |
| Field scope | Public 13-field contract remains fixed; internal source/confidence/review fields excluded |
| Proposed boundary | Preserve `restaurant_public_published_nutrition_v1`; preserve `consumer_public_next_meal_candidates_v1`; separate `restaurant_owner_published_nutrition_v1` if approved |
| Current dependency | Both Phase 2U public-safe views depend on the internal published layer |
| Cleanup prerequisite | Dependency/owner execution validation before any upstream privilege change |
| Negative expectation | Public projection cannot be widened to expose owner/internal or governance metadata |

### Analytics summaries

| Field | Contract |
| --- | --- |
| Actor | Active owner/manager; staff only when role and branch scope explicitly allow |
| Authentication | Required |
| Membership | Active membership and applicable branch scope |
| Row scope | Aggregates for authorized restaurant/branches only; never raw cross-tenant events |
| Field scope | Allowlisted aggregate metrics with privacy thresholds; no raw Consumer identity, meal, rating, favorite, feedback, or event payload |
| Proposed boundary | `restaurant_owner_analytics_summaries_v1` or a strict read-only aggregate RPC |
| Current dependency | Restaurant Web active UI uses mock analytics; private raw analytics is not an approved browser source |
| Cleanup prerequisite | Privacy threshold, tenant derivation, aggregate source, and negative tests approved before cutover |
| Negative expectation | Non-member/cross-tenant returns zero; browser cannot read raw analytics events or Consumer rows |

### Staff, users, memberships, roles, assignments

| Field | Contract |
| --- | --- |
| Actor | Current active Restaurant member for minimal self/access context; broader administration deferred |
| Authentication | Required |
| Membership | Active membership required to receive current access context |
| Row scope | Current actor's authorized restaurant/branch/role presentation only |
| Field scope | Stable presentation IDs/names and effective role/scope only; exclude login security, full membership graph, disabled users, invitations, audit fields, created-by metadata |
| Proposed boundary | `restaurant_current_access_context_v1` security-invoker view or strict self-scope RPC |
| Current dependency | Needed for Restaurant Web tenant/session composition; active UI currently uses mock staff data |
| Cleanup prerequisite | Membership foundation, membership-table RLS, anti-enumeration and self-scope tests pass |
| Negative expectation | No raw table enumeration; no cross-restaurant staff discovery; no staff write/admin capability |

### Reviews and governance

| Field | Contract |
| --- | --- |
| Actor | Platform reviewer/admin in a later Admin Governance Runtime Track |
| Authentication | Required under separate admin identity/claim architecture |
| Membership | Restaurant membership does not grant governance access |
| Row scope | Outside Phase 2V |
| Field scope | Review decisions, anomalies, audit, merge candidates, quality issues and governance metadata remain admin-only |
| Proposed boundary | No Phase 2V Restaurant Web projection; future admin-governance boundary |
| Current dependency | Admin Web mock services only |
| Cleanup prerequisite | None for Phase 2V; N4 must not accidentally expose or break future governance dependencies |
| Negative expectation | Public and Restaurant members receive zero governance-only rows/fields |

### Ratings encountered during inspection

| Field | Contract |
| --- | --- |
| Actor | Authenticated Consumer for personal rating runtime in Phase 2W; only privacy-reviewed aggregate output may later reach restaurants |
| Authentication | Consumer rating path required; Restaurant Web direct raw access prohibited |
| Membership | Restaurant membership never grants access to individual Consumer rating rows |
| Row scope | Consumer-owned rows or separately approved aggregate only |
| Field scope | No raw Consumer identity, personal feedback, meal linkage, or private preference in Restaurant Web |
| Proposed boundary | Phase 2W Consumer runtime; future privacy-thresholded restaurant aggregate if explicitly approved |
| Current dependency | No Phase 2V runtime dependency |
| Cleanup prerequisite | Not part of N4 replacement scope |
| Negative expectation | Restaurant actors cannot read raw Consumer ratings or infer individual feedback |

## 4. N4 Raw-Grant Cleanup Coverage

N4 may consider only objects explicitly approved after dependency inspection, including raw restaurant/menu tables and obsolete activation-pack helper views recorded by the Phase 2U plan. The final migration must use the actual Development catalog inventory rather than copying a stale list blindly.

For every object proposed for revoke, evidence must identify:

- current grants by role;
- public-safe replacement;
- owner/internal replacement;
- runtime and manual-tool dependencies;
- view/function dependency chain and execution mode;
- rollback requirement;
- post-revoke positive and negative assertions.

Objects cannot be revoked merely because a similarly named replacement exists. The replacement must be deployed, cut over, and validated.

## 5. Prohibited Boundary Collapses

- Do not add owner/internal fields to `restaurant_public_published_nutrition_v1`.
- Do not make `consumer_public_next_meal_candidates_v1` an owner projection.
- Do not expose raw tables with a client-side `restaurant_id` filter.
- Do not expose admin/governance fields through owner projections.
- Do not give Restaurant members raw Consumer ratings, favorites, recommendation feedback, meal, profile, or analytics-event rows.
- Do not use mock authorization state to claim live tenant isolation.
- Do not restore raw nutrition grants to support a view.
- Do not revoke raw objects before Restaurant Web cutover and multi-actor validation.
