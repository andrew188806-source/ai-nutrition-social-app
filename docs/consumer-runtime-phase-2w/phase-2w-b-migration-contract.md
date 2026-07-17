# Phase 2W-B Ratings Migration Contract

Migration draft: `20260717010000_consumer_ratings_authenticated_read_and_atomic_write.sql`.

## Read path decision

Authenticated table `SELECT` with the existing owner RLS policies is the smallest mechanism that satisfies the Phase 2W-A lookup/list ports. Both policies compare `auth.uid()` with `user_id`. The migration first revokes all table privileges from `PUBLIC`, `anon`, and `authenticated`, then grants only `SELECT` to `authenticated`.

A read RPC would duplicate simple owner-scoped lookup/list behavior without strengthening ownership. Direct table writes remain closed, so this choice does not broaden the write surface.

## Write RPC signatures

```sql
public.save_authenticated_restaurant_rating(
  p_restaurant_id text,
  p_private_rating numeric,
  p_meal_record_id uuid default null,
  p_taste_feeling text default null,
  p_portion_feeling text default null,
  p_price_feeling text default null,
  p_repurchase_intent text default null
) returns jsonb
```

```sql
public.save_authenticated_menu_item_rating(
  p_restaurant_id text,
  p_menu_item_id text,
  p_private_rating numeric,
  p_branch_id text default null,
  p_meal_record_item_id uuid default null,
  p_finished boolean default null,
  p_dislike_reasons text[] default '{}',
  p_taste_feeling text default null,
  p_portion_feeling text default null,
  p_price_feeling text default null,
  p_repurchase_intent text default null
) returns jsonb
```

Neither signature accepts `user_id`, `userId`, or another ownership value. Returned JSON omits ownership identifiers.

## Current/history behavior

Each function obtains a transaction-scoped advisory lock using the same owner/target key as the relevant partial unique index. It retires only the previous current row by setting `is_current=false`, then inserts one new private current row. Prior history is neither deleted nor rewritten beyond the expected current marker and `updated_at` transition.

The menu-item lock and replacement key intentionally use `(current user, menu_item_id)` because the frozen unique index excludes restaurant and branch.

## Deployment status

The migration was deployed and validated on Development, bringing remote history from 33 to 34 migrations. Catalog/RLS/ACL verification, negative rollback smoke, atomic replacement, and cross-actor isolation passed. Production remains untouched, and this repository task did not reconnect or execute the migration.
