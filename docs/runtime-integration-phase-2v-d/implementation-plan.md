# Phase 2V-D Local Implementation Plan

Status: **Local implementation only — no remote operation and no N4**

## Scope

Phase 2V-D composes Restaurant Web identity sessions with the seven frozen Phase 2V-C owner/internal read RPCs. It cuts over only dashboard, locations, menu, item and current nutrition reads. It creates no migration and performs no Restaurant write.

## Sequence

1. Pin `@supabase/supabase-js` 2.110.6 and beta `@supabase/ssr` 0.12.3.
2. Parse the explicit `mock | supabase | disabled` server data source.
3. Establish cookie-backed SSR sign-in, refresh, verified claims and sign-out.
4. Load active restaurant access through `restaurant_internal_restaurants_v1()`.
5. Require deterministic restaurant selection and validate branch filters.
6. Map only the seven narrow RPC projections.
7. Cut over the six authorized route surfaces.
8. Render deferred modules as explicitly unavailable.
9. Prove fail-closed, no raw internal reads, no mixed mock/live response and query budgets.

Phase 2V-E owns N4 after DV-001, Production dependency review and performance gates pass.
