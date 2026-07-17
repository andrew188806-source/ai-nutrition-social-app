# Phase 2X-A Favorites Security and Target Identity

## Ownership boundary

- Ownership derives exclusively from the authenticated session and database `auth.uid()`.
- Client contracts never accept `user_id`, `userId`, owner filters, or arbitrary actor identifiers.
- Reads and writes are current-user only and private by default.
- Cross-user rows, raw favorite payloads, public favorite counts, and Restaurant-owner favorite analytics are outside Phase 2X.
- Privileged server/job credentials are never a Mobile runtime dependency.

## Canonical target identity

The favorite table target columns are `text`, have no foreign keys, and do not themselves prove target existence or target type. Repository mocks currently use readable slug IDs, while canonical catalog database drafts use UUID primary keys. Therefore Phase 2X-A does not claim that any route-local string is a database UUID.

The runtime target mapper must accept only IDs delivered by an approved canonical restaurant/menu projection and preserve them as opaque canonical catalog identifiers. If the linked catalog's canonical identifiers are UUIDs, the Supabase activation adapter/RPC must validate and map those UUID values explicitly. No conversion may be inferred from display data.

Forbidden identity sources include:

- restaurant or dish name;
- `fav-*` presentation IDs;
- local analysis/meal IDs;
- array index or route position;
- photo, address, geolocation, label, alias, or fuzzy similarity;
- rating ID or rating-row state.

A restaurant target requires a non-empty verified canonical restaurant ID. A menu-item target requires both verified canonical restaurant and menu-item IDs. The parent relationship must be validated because the Favorites table has no foreign key and menu-item active uniqueness excludes `restaurant_id`. Missing, malformed, unknown, cross-parent, or unsupported target data fails closed before repository mutation.

## Read activation decision

Phase 2X-C should prefer the repository's established owner-RLS table-read pattern only after explicit migration/security review. The minimum candidate is authenticated `SELECT` on both Favorites tables, with all anon/PUBLIC privileges revoked and active/current-user filters enforced. A read RPC is required instead if Development catalog inspection shows raw table ACLs cannot be constrained safely. Phase 2X-A does not grant either path.

## Atomic write security contract

Phase 2X-D must introduce versioned authenticated functions for restaurant add/remove and menu-item add/remove. Exact names/signatures remain a migration-review output, but every function must:

- be `SECURITY DEFINER` with a fixed safe `search_path`;
- reject missing `auth.uid()`;
- accept no owner identity;
- trim and validate target identifiers;
- validate target existence and menu-item/restaurant consistency against canonical catalog data;
- implement add/remove idempotently in one transaction/function call;
- preserve removed history and the active partial-unique invariant;
- revoke execute from PUBLIC and anon and grant only to authenticated;
- leave authenticated direct table DML denied;
- return an allowlisted shape that the adapter validates at runtime.

No unversioned hotfix, browser privileged credential, Production operation, public aggregate, or Restaurant analytics path is permitted.

## Security findings carried forward

- Effective Development ACLs are unknown from static migrations because Favorites-specific grants/revokes do not exist. Catalog verification is a hard gate before read activation.
- Target columns have no foreign keys. Target existence and parent consistency are hard write-activation gates.
- `taste_profiles` contains favorite ID arrays. They are preference hints, not canonical Favorites state, and must not be dual-written.
- Retention/anonymization of removed favorite history remains a privacy/legal decision and is not resolved by Phase 2X.
