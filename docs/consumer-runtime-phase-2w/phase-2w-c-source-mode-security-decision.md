# Phase 2W-C Source-Mode and Security Decision

## Decision

`supabase` is the explicit prepared/live-capable repository source name for ratings reads and writes. It is neutral about deployment state: locally it means the adapter has been prepared; it does not mean Development live validation has occurred.

Selection requires both an explicit source flag and an explicitly injected `SupabaseConsumerRatingClientLike`. The factory never discovers or creates a global client. Selecting `supabase` without the dependency throws the typed `rating_configuration_invalid` error. An unknown source records a configuration issue, resolves fail-closed to `disabled`, and is rejected by composition; it never falls back to mock.

## Defaults and boundaries

- Default read source: `mock`.
- Default write source: `disabled`.
- UI and app routes do not select the new source in Phase 2W-C.
- Auth gating remains in `ConsumerRatingService`; database ownership remains `auth.uid()` plus owner RLS and the approved RPCs.
- The client boundary exposes only table SELECT query composition and the two named RPCs. It does not expose privileged credentials or direct DML methods.

The separately authorized credential-backed Development smoke has passed. This validates the injected adapter against Development but does not switch runtime defaults or UI routes. Production, privileged browser state, and a UI default-source switch remain outside this phase.
