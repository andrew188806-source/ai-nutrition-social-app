# RA-2C-P1 — Governed Restaurant Owner branch-menu price authority

## What this round governs

The **listed menu price of one menu item at one restaurant branch**, in whole New Taiwan Dollars.

It governs nothing else. In particular it has no relationship to TastKind subscription pricing,
Restaurant Basic/Standard plan pricing, add-on pricing, crowdfunding, early-bird or founder pricing,
or any future billing, payment or entitlement product. Those belong to a later Billing / Subscription
/ Payment / Entitlement phase, and none of them is evidence or authority for
`public.branch_menu_items.price`.

`price` here is the restaurant's listed menu price for that branch. It is **not** a checkout total:
service charges, optional add-ons, customisation surcharges and delivery fees are outside this
field's guarantee, and this round adds no calculation for any of them. Pricing authority is per
branch-menu item, so two branches of the same restaurant may legitimately price one menu item
differently.

## The canonical contract

A new governed price is a whole TWD amount from **1 through 999999 inclusive**.

- Zero is **not** a canonical price. It does not mean free, unknown, unpublished or "market price".
  A later product decision that needs any of those must give them their own semantics rather than
  overload this column.
- Fractional amounts are **refused, not rounded**. `150.5` is an error, not `150` or `151`.
- Values are compared and stored as exact `numeric`. Nothing is ever cast to `float`,
  `double precision` or `real`, at any point in the path.
- Prices cross every boundary as **decimal text**, never as a JSON number.

## The legacy-zero problem, and why there is no CHECK constraint

Development holds a branch-menu row priced `0.00` that predates this contract.

The obvious implementation — `CHECK (price >= 1 AND price = trunc(price))` on the table — would have
been a real outage. A table CHECK is evaluated on **every** write to the row, so it would have made
RA-2A's sold-out mutation and RA-2B's availability mutation start failing on that row, even though
neither touches `price` at all. This round governs price **changes**, not the shape of every
existing row.

Canonical enforcement is therefore **change-scoped**, and lives in the version trigger:

```sql
if new.price is distinct from old.price then
  -- canonical range and whole-TWD check here
  new.price_version := old.price_version + 1;
else
  new.price_version := old.price_version;
end if;
```

The consequences, all proven against a real cluster:

| Operation on a `price = 0.00` row | Result |
| --- | --- |
| RA-2A sold-out mutation | succeeds; `price` and `price_version` byte-identical |
| RA-2B availability mutation | succeeds; `price` and `price_version` byte-identical |
| any unrelated column write | succeeds |
| preview | reports `"0.00"` losslessly — not hidden, not normalised |
| repair `0.00 → 150` | succeeds; `price_version` advances 0 → 1 |
| push back `150 → 0` | `invalid_request` — the repair is one-way |
| ask a legacy zero to stay `0` | `invalid_request`, **not** `no_change` |

That last row is a deliberate ordering decision: canonical validation of the destination runs
**before** the no-change comparison, so zero is never a canonical price even when it is the current
one.

The legacy Development row is left exactly as it is — not normalised, not reinterpreted, not
deleted. Repairing it is a separate, explicitly authorised act.

## Validation order

1. authentication
2. **canonical destination price**
3. permission
4. tenant / target resolution
5. expected price **and** expected version
6. no-change
7. update

## Authority topology

| Concern | Value |
| --- | --- |
| Permission key | `branch_menu_item.price.write`, scope `restaurant`, Owner only |
| Sealed role | `restaurant_owner_branch_menu_item_price_write_authority` (`NOLOGIN NOINHERIT NOBYPASSRLS`) |
| Column privilege | `UPDATE(price)` **only** — no table-level UPDATE anywhere |
| Concurrency token | `price_version bigint not null default 0`, maintained solely by the trigger |
| Audit | `restaurant_internal.branch_menu_item_price_audit_log`, append-only, FORCE RLS |
| Preview RPC | `restaurant_owner_preview_branch_menu_item_price_v1(text, text, text)` — STABLE |
| Mutation RPC | `restaurant_owner_set_branch_menu_item_price_v1(text, text, text, bigint)` |
| Result vocabulary | `unauthenticated`, `permission_denied`, `target_not_found`, `stale_state`, `no_change`, `invalid_request` |

### Three independent writers

`sold_out`, `availability` and `price` are three separate governed operations with three separate
sealed roles, three separate version counters and three separate audit relations. One role holding
all three would mean a defect in any one operation could write the others' columns. The migration
asserts the independence in both directions before it commits, and the PostgreSQL gate proves it
behaviourally.

### Why the tenant policies are RESTRICTIVE

`public.branch_menu_items` carries a **permissive** read policy granted to `PUBLIC`, and PostgreSQL
ORs permissive policies together. A permissive owner-scoped policy would therefore narrow nothing —
RA-2A-P1-R1 discovered exactly this as a live cross-tenant read leak. This round ships a permissive
pair that grants and a **RESTRICTIVE** pair that narrows, and the RPCs additionally join the caller's
membership chain rather than delegating tenancy to row level security. Neither mechanism alone is
the authority.

## Sealed-role successor manifest

Repository evidence, not assumption:

| Inventory | Count |
| --- | --- |
| RA-1C-R1 governed roles | 17 |
| RA-1C-R1 reconciled exclusions | 2 |
| RA-2A-P1 governed roles | 18 |
| **RA-2C-P1 governed roles** | **20** |
| Repository `CREATE ROLE` definitions | 22 |
| — of which Restaurant Owner writers | 3 |
| — remainder, matching RA-1C-R1's adjudication | 19 |

RA-2B-P1 created its sealed writer but did **not** publish a governed-role manifest of its own — it
pinned only its own role name — so the last explicit inventory (RA-2A's 18) omits a role that
genuinely exists in the migrations. RA-2C closes that inherited gap and adds exactly one role of its
own. **RA-2C's own successor addition is the price writer and nothing else.**

## Gates

| Command | What it proves |
| --- | --- |
| `npm run test:restaurant-owner-price-ra-2c-p1` | repository topology, freeze and scope |
| `npm run test:restaurant-owner-price-ra-2c-p1-smoke` | every contract claim against the frozen source |
| `npm run test:restaurant-owner-price-ra-2c-p1-mutations` | each claim actually kills a corruption |
| `npm run test:restaurant-owner-price-ra-2c-p1-postgres` | real PostgreSQL 17.6, non-superuser runner |

The PostgreSQL gate is opt-in and needs binaries that are not in this repository:

```bash
npm install embedded-postgres@17.6.0-beta.15
```

then set `RA2CP1_PG_BIN` to the `native/bin` directory and `RA2CP1_PG_MODULES` to a directory whose
`node_modules` contains `pg`. Without them the harness reports `skipped` rather than pretending to
have proven anything.

A superuser apply proves far less than it appears to: it bypasses ownership checks, role-membership
options and RLS. The harness therefore initialises the cluster as `supabase_admin` and applies every
migration as a **non-superuser** `postgres` without `BYPASSRLS`, exactly as Development does.

## Development status

**No safe positive Development price target exists.** The §39 read-only discovery found:

| Candidate | Price | Blocker |
| --- | --- | --- |
| `dev-bmi-b-main` | `0.00` | legacy non-canonical; excluded as a positive target |
| `dev-bmi-chicken-nanjing`, `dev-bmi-salmon-nanjing`, `dev-bmi-tofu-xinyi`, `dev-bmi-draft-xinyi` | canonical | parent restaurant is active/public; Nanjing and Xinyi are forbidden targets |
| `synthetic-fixture-bmi-*` | canonical | `synthetic-fixture-restaurant` has **no owner membership at all** |

The migration is applied to Development and verified read-only, but no Development price mutation is
performed. Live acceptance is blocked pending an authorised safe fixture:
`RA-2C-P1_NEEDS_SAFE_DEVELOPMENT_PRICE_FIXTURE`.
