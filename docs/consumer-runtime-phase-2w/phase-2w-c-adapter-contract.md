# Phase 2W-C Ratings Supabase Adapter Contract

## Reads

The adapter supports current-user restaurant lookup, current-user menu-item lookup, and a combined current-ratings list. It selects only canonical fields from `user_restaurant_ratings` and `user_menu_item_ratings`, always filters `is_current=true`, and never supplies a user or owner filter. Authenticated session context plus the Phase 2W-B RLS policies remain the complete ownership boundary.

Rows are treated as untrusted input. Required opaque IDs must be trimmed and non-empty; ratings must be finite numbers from 0 through 5; visibility must be `private`; current rows must report `is_current=true`; timestamps, nullable linkage, booleans, string arrays, and structured feedback fields are validated before snake_case-to-camelCase mapping. A null single-row result maps to `missing`; malformed data fails closed.

## Writes

The only write calls are:

- `save_authenticated_restaurant_rating`
- `save_authenticated_menu_item_rating`

The RPC arguments exactly mirror the Phase 2W-B signatures and contain no `user_id`, `userId`, owner, JWT, session, or token field. Optional meal linkage, nullable branch/finished values, dislike reasons, and structured feedback are mapped explicitly. RPC JSON is runtime-validated and must match the submitted target and linkage before it becomes a canonical record. `replaced_previous` maps to `saved` or `replaced`.

The adapter has no table insert, update, delete, or upsert path. Ownership and atomic current-row replacement remain the responsibility of the Frozen Phase 2W-B authenticated RPC contract.

## Typed failures

- Authentication failures map to `unauthenticated` with `rating_authentication_required`.
- Permission denial maps to `read_failed` or `write_failed` with `rating_permission_denied`.
- Structured database failures map to `rating_database_failed`.
- Rejected or malformed rows/RPC JSON map to `rating_response_malformed`.
- Thrown transport failures map to retryable `rating_transport_failed` without exposing the underlying error text.

No operation logs credentials, session material, complete payloads, or private feedback.
