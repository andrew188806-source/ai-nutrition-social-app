# RA-2E-P1 — Governed Restaurant Owner branch display-name authority

## What this round governs

The **public-facing display name of one branch**: `public.restaurant_branches.name`. Presentation
authority only. It does not touch `restaurants.name`, `restaurants.legal_name`, branch address/
district/GEO data, branch status, or any menu-item identity — each of those is a separate governed
authority (or has none yet), and this round widens none of them.

A successful rename takes effect **immediately** — there is no review or moderation workflow in
RA-2E. Where every other publication predicate already permits a branch to be visible, a rename may
immediately change what the public sees. That is accepted product behaviour, and this round proves
both halves of it: a rename naturally changes public display text when nothing else is blocking, and
a rename can never create eligibility a parent gate is withholding.

## Structural independence, by construction

`public.restaurant_branches` already carries two triggers scoped to specific columns:

```sql
-- pre-existing, unrelated to this round
create trigger restaurant_branches_geocode_invalidate
  before insert or update of address, district, restaurant_id ...
create trigger restaurant_branches_status_version_trigger
  before update of status ... when (old.status is distinct from new.status) ...
```

PostgreSQL's `UPDATE OF <columns>` firing rule means a statement that never assigns those columns in
its `SET` list never fires those triggers — regardless of what else the statement touches. This
round's mutation RPC issues `update restaurant_branches set name = ... where id = ...`; it never
assigns `status`, `address`, `district` or `restaurant_id`, so GEO invalidation and the status-version
bump are **structurally unreachable** from this authority, not merely avoided by convention.

This round's own trigger is built the identical way:

```sql
create trigger restaurant_branches_display_name_version_trigger
  before update of name on public.restaurant_branches
  for each row
  when (old.name is distinct from new.name)
  execute function public.bump_restaurant_branch_display_name_version_v1();
```

— which is why the reverse also holds: RA-1C's status writer and the GEO writers, which never assign
`name`, can never fire this round's version trigger either. Both directions are additionally proven
behaviourally on a real PostgreSQL 17.6 cluster.

## The plain-text canonical contract

| Rule | Value |
| --- | --- |
| Length (after outer trim) | 1 to 80 Unicode characters, `char_length` semantics |
| Canonicalization | outer whitespace trimmed only — interior whitespace preserved |
| Case folding | none |
| Unicode normalization | none |
| Control characters | `[\x00-\x1F\x7F-\x9F]` refused (C0, DEL, C1); NUL is refused unconditionally by PostgreSQL's `text` type itself |
| Uniqueness | none — multiple branches under the same restaurant may share a name |
| Rich text / HTML / Markdown | never — plain text only |

`expectedDisplayName` (concurrency evidence) is compared with **exact** equality and is never
trimmed or normalized — it must be able to name a legacy, non-canonical stored value precisely.
`nextDisplayName` (the proposed destination) is canonicalized (outer-trim only) **before** validation
and **before** the no-change comparison, so outer whitespace alone is never a business change.

### Where the guard lives, and why not a table CHECK

Canonical validation is enforced in the same `BEFORE UPDATE OF name ... WHEN (name changed)` trigger
that maintains the version — a value-domain invariant (what a canonical name *is*), so it belongs
here as defense-in-depth exactly as RA-2C-P1 enforced its canonical price range in its own trigger.
It is deliberately **not** a table CHECK: a CHECK evaluates on every row regardless of which column
changed, and Development already holds legacy branch names that predate this contract. Because the
trigger is scoped to real name changes only, those legacy rows stay fully writable by every other
existing operation, and can be governed-renamed to a canonical value whenever the Owner chooses.

## Authority topology

| Concern | Value |
| --- | --- |
| Permission key | `branch.profile.display_name.write`, scope `restaurant`, Owner only |
| Sealed role | `restaurant_owner_branch_display_name_write_authority` (`NOLOGIN NOINHERIT NOBYPASSRLS`) |
| Column privilege | `UPDATE(name)` **only** |
| Concurrency token | `display_name_version bigint not null default 0`, DB-maintained |
| Audit | `restaurant_internal.branch_display_name_audit_log`, append-only, FORCE RLS |
| Preview RPC | `restaurant_owner_preview_branch_display_name_v1(text, text)` — STABLE |
| Mutation RPC | `restaurant_owner_set_branch_display_name_v1(text, text, text, bigint)` |
| Result vocabulary | `unauthenticated`, `permission_denied`, `target_not_found`, `invalid_request`, `stale_state`, `no_change` |

### Why the tenant policies are RESTRICTIVE

`restaurant_branches` carries a permissive `PUBLIC` read policy (`branches_public_read_dev`), and
PostgreSQL ORs permissive policies together — a permissive owner-scoped policy alone would narrow
nothing (the RA-2A-P1-R1 lesson). This round ships a permissive pair that grants and a RESTRICTIVE
pair that narrows, and both RPCs additionally join the caller's membership chain themselves.

## Sealed-role successor manifest

`restaurant_branches` already carried **three** governed writers that predate the `branch_menu_items`
lineage entirely: `platform_admin_branch_status_authority` (RA-1C), `geo_authority` and
`geo_geocode_authority` (the GEO rounds). This round is the first to bring both lineages together for
its own independence proofs, while adding **exactly one** new role:

| Inventory | Count |
| --- | --- |
| RA-1C-R1 governed roles | 17 |
| RA-2D-P1 governed roles (branch_menu_items lineage) | 21 |
| **RA-2E-P1 governed roles** | **22** |
| Repository `CREATE ROLE` definitions, before this round | 23 |
| Repository `CREATE ROLE` definitions, after this round | 24 |

## Independence, proven both directions on real PostgreSQL 17.6

| Operation | Effect on the OTHER authority |
| --- | --- |
| Branch rename | leaves `status`, `status_version`, `address`, `district`, `latitude`, `longitude`, every `geocode_*` column byte-identical |
| RA-1C status change | leaves `name` and `display_name_version` byte-identical; writes no display-name audit row |
| GEO/address write | leaves `name` and `display_name_version` byte-identical; writes no display-name audit row |

No currently governed role holds `UPDATE(address)`/`UPDATE(district)` — `geo_geocode_authority`
records the *result* of an external geocoding attempt (coordinates, status, provider), not the
address itself. The GEO-independence proof exercises the real trigger through the same path any
future address-writing authority would ultimately run under.

## Publication safety

No new publication SQL was written. The existing `consumer_public_restaurant_catalog_v1` view already
selects `rb.name as branch_name`, so:

- On a **fully public** fixture (Restaurant active, branch active, menu published, item active,
  offering available), a rename **naturally** changes the displayed name — proven positive.
- On a **draft Restaurant**, the rename itself succeeds but creates no catalogue eligibility.
- On an **inactive branch**, the rename itself succeeds without activating the branch, and creates no
  catalogue eligibility.

## Gates

| Command | What it proves |
| --- | --- |
| `npm run test:restaurant-owner-branch-display-name-ra-2e-p1` | repository topology, freeze and scope |
| `npm run test:restaurant-owner-branch-display-name-ra-2e-p1-smoke` | every contract claim against the frozen source |
| `npm run test:restaurant-owner-branch-display-name-ra-2e-p1-mutations` | each claim actually kills a corruption |
| `npm run test:restaurant-owner-branch-display-name-ra-2e-p1-postgres` | real PostgreSQL 17.6, non-superuser runner, both-direction independence |

The PostgreSQL gate needs `RA2EP1_PG_BIN` (a PostgreSQL 17.x `native/bin` directory) and
`RA2EP1_PG_MODULES` (a directory whose `node_modules` contains `pg`). Without them it reports
`skipped` rather than pretending to have proven anything.
