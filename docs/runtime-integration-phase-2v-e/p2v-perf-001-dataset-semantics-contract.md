# P2V-PERF-001B Dataset-Generation Semantics Clarification

Status: **candidate for independent review; not Frozen; P2V-PERF-001B-B1 remains blocked**

The normative machine authority is
[`p2v-perf-001-dataset-semantics-authority.json`](./p2v-perf-001-dataset-semantics-authority.json),
schema `tastkind.p2v-perf.dataset-semantics`, version 1, language
`P2V_DATASET_DSL_1`.

This is an additive clarification of the Frozen representative-scale authority
at commit `26035d2b7a18c974ab76ba0a79565eab803a2199`. It resolves only the A–F
dataset-generator operands listed by the machine authority. It changes no
dataset count, relationship, workload case, classification, threshold, plan
metric, authorization rule, lifecycle, or evidence obligation. Any conflict
outside those operands fails closed.

## Counter vocabulary and loop order

All counters below are finite, non-negative, zero-based integers.

- `tenantOrdinal` is dataset-scoped, ascending from 0 through 49.
- `menuOrdinal` is tenant-scoped and ascending: 0–7 for tenant 0 and 0–1 for
  every noise tenant.
- `itemWithinMenu` is menu-scoped and ascending: 0–199 for tenant 0 and 0–39
  for every noise tenant.
- `tenantLocalItemOrdinal` is tenant-scoped and equals
  `menuOrdinal × itemsPerMenu + itemWithinMenu`.
- `itemOrdinal5` is exactly `tenantLocalItemOrdinal` left-padded to five decimal
  digits. The undefined base identifier `tenantOrdinal5` is not used.
- `nutritionVersion` is item-scoped and enumerated in ascending order: version
  0 (current), then version 1 (history).

`menu_items` loop order is tenant → menu → item. `menu_item_nutrition` loop
order is tenant → menu → item → version. Every level is ascending.

## A. Item name and allergens

The item name is `perf-item-${itemOrdinal5}`. Allergens use the same
`tenantLocalItemOrdinal`: remainder 0 modulo 2 produces an empty `text[]`, and
remainder 1 produces `ARRAY['soy']::text[]`.

This fixes the counter scope and prevents an implementation from applying
tenant, menu, global-table, or one-based parity.

## B–D. Nutrition source and verified status

For version 0 active items, both fields share the identical
`tenantLocalItemOrdinal` parity source:

| Remainder modulo 2 | `source` | `verified_status` |
| --- | --- | --- |
| 0 | `restaurant_verified` | `verified` |
| 1 | `ai_estimated` | `ai_estimated` |

For version 0 draft or archived items, `source` is always `pending`.
`verified_status` still uses `tenantLocalItemOrdinal`: remainder 0 produces
`pending_review`, remainder 1 produces `rejected`.

For version 1, the Frozen fixed values remain `source=admin_verified`,
`verified_status=rejected`, and `is_current=false`.

`pending` is intentionally not replaced with `pending_review`: the formal
baseline check constraint admits `pending` for `source`, while
`pending_review` belongs to the separate `verified_status` domain.

## E. Restaurant timestamp

`restaurants.created_at` uses the restaurants-table zero-based row ordinal,
which is exactly `tenantOrdinal` under ascending tenant enumeration.

`created_at = 2026-01-01T00:00:00.000Z + rowOrdinal × 1 second`

Thus tenant 0 is `2026-01-01T00:00:00.000Z`, and tenant 49 is
`2026-01-01T00:00:49.000Z`.

## F. Nutrition timestamp

All 11,040 nutrition rows use one table-scoped zero-based ordinal. Within a
tenant, item rows have stride 2 because versions are emitted 0 then 1.

- Tenant 0:
  `rowOrdinal = tenantLocalItemOrdinal × 2 + nutritionVersion`
- Tenant 1–49:
  `rowOrdinal = 3200 + (tenantOrdinal - 1) × 160 + tenantLocalItemOrdinal × 2 + nutritionVersion`

`updated_at = 2026-01-01T00:00:00.000Z + rowOrdinal × 1 second`

Boundary values are:

| Boundary | Row ordinal | Timestamp |
| --- | ---: | --- |
| first row, tenant 0/item 0/version 0 | 0 | `2026-01-01T00:00:00.000Z` |
| next item, tenant 0/item 1/version 0 | 2 | `2026-01-01T00:00:02.000Z` |
| last tenant-0 row | 3199 | `2026-01-01T00:53:19.000Z` |
| first tenant-1 row | 3200 | `2026-01-01T00:53:20.000Z` |
| final tenant-49 row | 11039 | `2026-01-01T03:03:59.000Z` |

## Compatibility and lifecycle

The formal baseline allows exactly the source and status literals declared in
the machine authority. The guard validates those domains directly from the
migration, enumerates all 5,520 items and 11,040 nutrition rows, checks every
ordinal is unique and contiguous, and rejects missing, extra, unknown, or
unreferenced DSL operands.

This candidate starts no PostgreSQL process and produces no representative
dataset or B1 evidence. B1 may resume only after an independent review and
Freeze of this clarification.
