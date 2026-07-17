# Phase 2X Consumer Favorites Implementation Plan

The canonical roadmap order remains Phase 2W → Phase 2X → Phase 2Y → Phase 2Z.

## Phase 2X-A — Consumer Favorites Discovery & Contract Freeze

- Inventory schema, RLS/ACL, existing runtime, and Mobile state.
- Freeze current-user/private target, read/write, source-mode, and security contracts.
- Add documentation and a local static guard only.
- No runtime, UI, migration, Development smoke, deployment, or data write.

## Phase 2X-B — Local Disabled/Mock Favorites Architecture

- Add isolated canonical types, errors, validation, ports, service, source flags, factory, disabled adapter, deterministic mock adapter, Supabase-prepared boundary, target mapper, and contract smoke.
- Default read remains mock; default write remains disabled.
- No network, migration, live source, UI cutover, or database write.

## Phase 2X-C — Development Authenticated Favorites Read Activation

- Perform Development catalog/RLS/ACL preflight.
- Add the minimum versioned authenticated read ACL or a safer read RPC if catalog evidence requires it.
- Implement injected Supabase read adapter with explicit column allowlists, active-row filtering, deterministic cursor pagination, runtime row validation, and typed errors.
- Run two-actor owner/cross-owner/anon negative read validation. No write activation or UI cutover.

## Phase 2X-D — Development Atomic/Idempotent Favorites Write Activation

- Add reviewed atomic add/remove functions with authenticated-only execute ACLs and direct-DML denial.
- Validate target existence and restaurant/menu-item parent consistency.
- Implement Supabase write adapter through approved functions only.
- Verify duplicate add, concurrent add, remove missing, removed-history preservation, cross-owner denial, rollback, and cleanup in Development.

## Phase 2X-E — Mobile Favorites Cutover, Credential-Backed Validation & Final Freeze

- Map only safe canonical restaurant/menu-item IDs from approved Mobile projections.
- Replace route-local restaurant/menu-item favorite state while preserving unsupported meal/self-made display behavior as explicit non-canonical UI or removing its write affordance by product approval.
- Add hydration, per-target in-flight/duplicate-tap guards, optimistic rollback or server-confirmed reconciliation, stale-response isolation, signed-out/disabled/error states, and cross-route consistency.
- Complete credential-backed Development smoke, sanitized evidence, regression validation, and Freeze review.

## Excluded work

Phase 2X does not implement Ratings changes, Recommendation Feedback, public favorite counts, Restaurant-owner analytics, Social/Meal Buddy persistence, quota/premium policy, Admin UI, Production activation, N4, or Phase 2Z final closure.
