# Phase 2W-B Development Validation Record

Phase: Consumer Runtime Phase 2W-B — Ratings Schema / ACL Review and Migration Draft

Status: **Development deployment and validation complete; repository evidence recorded for Freeze-candidate review**.

## Sanitized Development identity

- Stable environment label: `TastKind / 好廚 Development`.
- Identity binding: the non-Production linked Development project whose migration history moved from 33 migrations through `20260716060000` to 34 migrations through `20260717010000`.
- The validating operator independently confirmed the target was Development and that Production was excluded.
- No project reference, URL, host, credential, token, session, actor identifier, or raw catalog row is stored in this record.

This repository-recording task accepts the sanitized Development evidence supplied after the separately authorized deployment and validation. Codex did not reconnect to Supabase or repeat any remote command.

## Migration identity

- Pre-deployment remote migration count: `33`.
- Post-deployment remote migration count: `34`.
- Version: `20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql`.
- SHA-256: `2ca5f0d1e26d7f39748e59df2d9e82da3455e48ce233b72566c43687c9ae432f`.
- Source review: PASS.

## Catalog, RLS, and ACL evidence

- RLS is enabled on `public.user_restaurant_ratings` and `public.user_menu_item_ratings`.
- Owner policies `ratings_owner_all` and `menu_item_ratings_owner_all` are present and bind rows to `auth.uid() = user_id`.
- `authenticated` has table `SELECT` only.
- Direct authenticated table `INSERT`, `UPDATE`, and `DELETE` are denied.
- `anon` and `PUBLIC` have no rating-table privileges.
- `anon` and `PUBLIC` cannot execute either rating write RPC.
- Each RPC has exactly one overload.
- Each RPC owner is `postgres`.
- Each RPC is `SECURITY DEFINER`.
- Each RPC has fixed `search_path=pg_catalog, public, pg_temp`.

Catalog/RLS/ACL verification: **PASS**.

## Transactional and actor validation

- Negative rollback smoke: **14/14 PASS**.
- D4 restaurant atomic replacement: **PASS**.
- D4 menu-item atomic replacement: **PASS**.
- D5 cross-actor RLS isolation: **PASS**.
- Every validation write was enclosed in `BEGIN` / `ROLLBACK`.
- Persistent test data created: `false`.

The evidence confirms one current row after replacement, retained non-current history, cross-actor denial, linkage ownership enforcement, target-consistency enforcement, and rollback of negative paths.

## Safety and exclusions

- Production touched: `false`.
- `service_role` used: `false`.
- N4 executed: `false`.
- Phase 2V HTTP smoke rerun: `false`.
- Persistent application or test write: `false`.
- Phase 2W-C started: `false`.

