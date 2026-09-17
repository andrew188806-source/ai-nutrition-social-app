# RA-2G-P1 — Governed Restaurant Owner "about" authority

> Written retroactively during Restaurant Phase R1 (documentation closure). This describes the
> **current implemented contract**, derived directly from the migration and repository source —
> it does not claim any specific historical acceptance run took place; see "Current test evidence"
> below for exactly what exists to verify it.

## What this round governs

One restaurant-global "about" text (店家介紹): `public.restaurants.restaurant_about`. Presentation
prose only — never authoritative for nutrition/allergen/ingredient/recommendation/Taste/GEO/Meal
Buddy/temporal/identity authority, each governed by its own separate, already-frozen authority.
`NULL` means unpublished. There is no moderation/review lifecycle: SET publishes immediately, CLEAR
unpublishes immediately — the same pattern as RA-2I's public website and social links.

Migration: `supabase/migrations/20260910060000_restaurant_owner_about_authority.sql`.

## The plain-text canonical contract

| Rule | Value |
| --- | --- |
| Length (after outer trim) | 1 to 800 Unicode characters |
| Canonicalization | outer ASCII-space (U+0020) trim only — interior spaces, LF line breaks, and multiple lines are preserved verbatim |
| Control characters | all C0/C1 controls forbidden **except** LF (`\x0A`) |
| Whitespace-only | rejected — a value that is entirely spaces/newlines (even non-empty after the outer-space trim, e.g. a bare `"\n"`) is treated as invalid, never silently accepted as CLEAR |
| `restaurant_about_source` | pinned to `'RESTAURANT_PROVIDED'` on every write — no other provenance value is possible through this authority |

Validation lives in `restaurant_internal.restaurant_about_text_allowed_v1(text)`, called from both the
mutation RPC and re-asserted in the migration's own closing checks — the same defense-in-depth
pattern used by every other RA-2 field authority.

## Authority topology

| Concern | Value |
| --- | --- |
| Permission key | `restaurant.profile.about.write`, scope `restaurant`, Owner only |
| Sealed role | `restaurant_owner_about_write_authority` (`NOLOGIN NOINHERIT NOBYPASSRLS`) |
| Column privilege | `UPDATE` on `restaurants.restaurant_about` / `restaurant_about_source` (via the sealed role) — `restaurant_about_version` is DB-maintained by a `BEFORE UPDATE OF restaurant_about` trigger, never client-writable |
| Concurrency token | `restaurant_about_version bigint not null default 0` |
| Preview RPC | `restaurant_owner_preview_about_v1(p_restaurant_id text)` — `SECURITY DEFINER`, `authenticated`-callable |
| Mutation RPC | `restaurant_owner_set_about_v1(p_restaurant_id text, p_operation text, p_expected_restaurant_about text, p_next_restaurant_about text, p_expected_version bigint)` — `SECURITY DEFINER`, `authenticated`-callable directly (no server hop needed, unlike RA-2I's website/social-link `v2` RPCs) |
| `p_operation` | `'set' | 'clear'`, explicit — never inferred from the presence/absence of a value |

## UI call site

`apps/restaurant-web/components/settings/RestaurantOwnerAboutControl.tsx`, rendered on
`/restaurant/settings` via `repositories/supabase/restaurant-owner-about-repository.ts`.

## Current test evidence

Four scripts exist under `scripts/`, following the same family pattern as every other RA-2 round
(static source-freeze guard, contract-vs-source smoke, mutation-kill harness, and an opt-in
disposable-PostgreSQL apply gate), registered as:

```
npm run test:restaurant-owner-about-ra-2g-p1
npm run test:restaurant-owner-about-ra-2g-p1-smoke
npm run test:restaurant-owner-about-ra-2g-p1-mutations
npm run test:restaurant-owner-about-ra-2g-p1-postgres
```

The `-postgres` gate needs `RA2GP1_PG_BIN`/`RA2GP1_PG_MODULES` (or the round's own equivalent env
names — check the script) and reports `skipped` without them, exactly like every other RA-2x
postgres-apply gate. The `-guard` script is a **frozen single-round** check (pins an exact baseline
commit and migration-count delta) — it is expected to fail once later rounds have landed on top of
it; that is normal frozen-round behavior, not a regression, and the guard must never be loosened to
force it green.
