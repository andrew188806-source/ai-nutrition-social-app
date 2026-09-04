# RA-2A-P2 — Restaurant Owner sold-out application activation

Baseline R1: `9f40604784ee419d583dc43c454da284618c7f15`. P1 and R1 are frozen. This
round adds no migration or privileged PostgreSQL object. Production remains untouched.

## Application boundary

The Restaurant browser calls one fixed same-origin resource:

`/api/restaurant/branches/[branchId]/menu-items/[branchMenuItemId]/sold-out`

GET invokes only `restaurant_owner_preview_branch_menu_item_sold_out_v1`. It takes the restaurant
selector from the server-validated selected-Restaurant context and sends the branch and offering
selectors from the fixed route. Those values narrow the query; R1 derives the actor and proves the
active Owner permission against the target restaurant. A foreign target and a nonexistent target
remain indistinguishable.

POST accepts exactly `expectedSoldOut`, `nextSoldOut`, and the decimal-string `expectedVersion`.
It invokes only `restaurant_owner_set_branch_menu_item_sold_out_v1` under the authenticated session.
The path branch is never sent as authority; P1 derives the target restaurant and branch from the
offering. No actor, Owner, role, permission, restaurant, price, availability, generic patch, request
ID, or database operation is accepted from the browser.

Both handlers return private, no-store JSON with bounded status vocabulary. Raw database errors,
schema names, sealed-role details, and audit identities never cross the route.

## Canonical preview and version

The ordinary menu read remains presentation data. It cannot enable the control and does not supply
the concurrency token. Every control starts disabled and issues the fixed R1 preview. Only an exact
`ready` response enables an explicit action.

`soldOutVersion` remains a canonical decimal string through PostgreSQL, the server, the browser, and
the next POST. Application code neither converts nor increments it. On `stale_state`, the control
fetches a fresh preview and requires the Owner to confirm a new action.

P1 has no durable request receipt. If the POST result is uncertain, the browser does not repeat it.
It fetches the canonical preview: if the intended state already holds, it reports reconciliation;
otherwise it presents the fresh state and requires an explicit retry.

## Reference UI

The live `/restaurant/menu` view shows a minimal control for each governed branch offering. The
control uses `標記售完` and `恢復供應` and requires confirmation showing the item, branch, current
state, resulting state, and the consequence that sold-out offerings may leave available and
recommended choices. This is a reference authority integration, not final menu-management UX.

Mock and deferred surfaces never render this control. A missing runtime, failed preview, denial, or
malformed response keeps it disabled; no live failure becomes local-state success.

## Development harness

The harness is inert unless separately authorized. It is pinned through the successor manifest to
the existing hidden Restaurant B offering at `false / "2"` with two retained audit rows. A later
authorized run uses the actual GET and POST routes for `false/2 → true/3`, stale rejection, fresh
preview, and canonical `true/3 → false/4` recovery. It contains no direct-table repair path and never
names a public demo target.
