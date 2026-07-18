# Consumer Runtime Phase 2X-D-A — Atomic Favorites Write Preparation

Status: local implementation candidate. The migration is authored but not deployed; Development validation and Freeze have not started.

## Scope

Phase 2X-D-A extends the existing Consumer Favorites runtime with authenticated atomic/idempotent writes. It does not create another service, alter Mobile UI, change read defaults, access Supabase, or deploy a migration.

The four versioned RPCs are:

```sql
public.add_authenticated_restaurant_favorite(p_restaurant_id text) returns jsonb
public.remove_authenticated_restaurant_favorite(p_restaurant_id text) returns jsonb
public.add_authenticated_menu_item_favorite(p_restaurant_id text, p_menu_item_id text) returns jsonb
public.remove_authenticated_menu_item_favorite(p_restaurant_id text, p_menu_item_id text) returns jsonb
```

No signature accepts `user_id`, `userId`, an owner, table name, SQL identifier, session, JWT, or arbitrary payload.

## Canonical lifecycle

- First active add returns `added`.
- Duplicate active add returns `already_present` without changing the row.
- A removed historical row is never reactivated or rewritten; re-add inserts a new active row.
- Removing an active row sets only its `removed_at` and returns `removed`.
- Missing or already-removed targets return `already_absent`.
- There is no `saved` or `replaced` Favorites result because neither exists in the Frozen vocabulary.
- Hard delete and collection-label/sort-order mutation remain absent.

Each target obtains a transaction-scoped advisory lock using the active unique-index identity. Insert also uses the existing partial unique index through an inferred `ON CONFLICT ... WHERE removed_at IS NULL DO NOTHING` path. If another writer wins the conflict, the function re-reads the active row and returns `already_present`; a missing conflict winner fails with a serialization error rather than guessing.

## Target existence and parent consistency

Restaurant add locks and validates `public.restaurants.id`. Menu-item add locks and validates both the restaurant and the exact `public.menu_items(id, restaurant_id)` pair. Removal does not require the catalog row to remain present, so a user can soft-remove stale history; it still requires exact canonical target input and never touches a different parent.

The existing active indexes are:

- restaurant: `(user_id, restaurant_id) WHERE removed_at IS NULL`;
- menu item: `(user_id, menu_item_id) WHERE removed_at IS NULL`.

The Frozen canonical menu-item target remains `(restaurantId, menuItemId)`. The Repository contains a unique catalog constraint on `(menu_items.id, menu_items.restaurant_id)`, but the local migration history inspected in this phase does not by itself prove structural global uniqueness of `menu_items.id`. A zero-row or zero-duplicate observation is not permanent proof.

Therefore Phase 2X-D-B must verify a primary/unique catalog constraint on `menu_items(id)` and no conflicting parent data before deployment. The menu RPC lock and conflict lookup use `(current user, menu_item_id)` to match the active index, then fail closed if an active row's restaurant differs. If Development cannot prove global menu-item ID uniqueness, the migration must not deploy; the existing index is not modified in this candidate.

## Runtime composition

Read sources remain `disabled`, `mock`, or `supabase`. Write sources become `disabled`, `mock`, or `supabase`; the default remains `disabled`. Supabase write requires an explicit flag, an authenticated `ConsumerAuthPort`, and an injected RPC-capable client. Invalid flags or missing dependencies fail closed without mock fallback.

The new adapter calls only the four approved functions. It maps snake_case arguments and runtime-validates an exact allowlisted JSON response before returning the Frozen `added`, `already_present`, `removed`, or `already_absent` result. No table DML method exists in the adapter.

## Phase boundary

Development identity verification, catalog uniqueness proof, deployment, controlled two-actor write smoke, exceptional synthetic-data cleanup, and Freeze belong to Phase 2X-D-B. Production, privileged browser credentials, N4, Phase 2X-E, and Phase 2Y remain outside this candidate.
