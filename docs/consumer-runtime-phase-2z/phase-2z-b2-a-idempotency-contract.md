# Phase 2Z-B2-A Meal Create Idempotency Contract

## Decision and boundary

The Owner approved Option C: one forward-only, Development-only corrective migration for Meal Create idempotency. The local candidate advances the migration inventory from 37 to 38; the remote handoff remains at 37 until a separately authorized Development deployment. Production is prohibited. Phase 2Z-B2 Mobile cutover, Analysis UI, Planned Meal, and N4 have not started.

The current V1 Meal Create RPC is atomic for a single attempt but has no client request identity. A transport-ambiguous retry can therefore create a duplicate. V1 is preserved byte-for-byte for historical callers. V2 is selected only when a caller supplies an optional `idempotencyKey`; future B2 Mobile operation ownership must create and retain that UUID v4 and must not rely on the repository to generate one.

## V2 database contract

`create_current_user_meal_record_v2` derives the actor from `auth.uid()` and accepts no actor or fingerprint parameter. `(user_id, client_request_id)` is protected by a partial unique index, so historical V1 rows retain null idempotency metadata and require no backfill.

The server builds a canonical JSONB fingerprint from the full normalized Meal Create payload: meal type, instant, local date, timezone, title, note, source, and ordered items. Each item includes its ordinal, identity references, display/name/portion snapshots, complete nutrition keys, nutrition source/schema version, source entity version, instant/timezone, confidence, consumed ratio, and correction status. JSONB supplies stable object-key and numeric equality without an extension dependency. The fingerprint contains only the authenticated user's canonical meal payload; it contains no credentials, tokens, auth metadata, or actor identifier and is absent from the RPC response.

An actor/request advisory transaction lock serializes lookup and creation. The partial unique index remains the authoritative storage invariant. Same actor + same request ID + equal fingerprint returns the existing allowlisted canonical record and inserts no rows. The same key with a different fingerprint raises `IDEMPOTENCY_KEY_CONFLICT` before mutation. The same key under a different actor is independent. New requests delegate validation and parent/item insertion to the unchanged V1 function, then attach the request metadata in the same transaction; any validation, item insertion, or metadata update exception rolls back the whole transaction.

V2 is `SECURITY DEFINER` with fixed `pg_catalog, public, pg_temp` search path. Execute is revoked from `PUBLIC`, `anon`, and `authenticated` before it is granted only to `authenticated`. Direct table mutations remain revoked for client roles. There is no dynamic SQL, client-provided ownership, direct Mobile table write, privileged runtime, second auth client, or fallback repository.

## Mobile and mock preparation

`ConsumerCreateMealRecordInput.idempotencyKey` is optional, preserving source compatibility. The validator accepts only UUID v4 values and normalizes letter case. No-key calls retain the V1 RPC route; keyed calls use V2. Same-key replay maps through the normal canonical success path, conflict maps to a stable safe domain rejection, and transport ambiguity is never treated as success.

The mock repository scopes a deterministic payload fingerprint by authenticated actor and key. It replays the same canonical record, rejects changed ordered payloads without mutation, permits another actor to use the same key, and preserves historical no-key behavior.

The shared `toDateKeyInTimeZone` helper derives the calendar date for an instant in an IANA timezone. Meal validation now compares that local date with `mealDate`, rejects invalid instants/timezones, preserves valid UTC cases, and correctly accepts UTC/local cross-day input. This helper is not connected to Analysis UI in B2-A.

## Deployment, validation, and containment

This repository state is preparation only: the migration is not deployed. After review, Claude may deploy only to the identified Development project under separate authorization, verify migration parity 38/38, RPC grants/search path, actor isolation, same-payload replay, different-payload conflict, concurrent retry behavior, and item-failure rollback. Local checks do not claim execution of SQL concurrency.

Containment before deployment is to discard the uncommitted candidate. If Development validation fails after deployment, stop Mobile opt-in and B2 cutover; do not modify migration history or deploy to Production. Any corrective action requires a new owner-approved forward migration. No Production rollback is applicable because Production deployment is prohibited.

No credential, actor data, live opt-in, N4 execution, commit, or push belongs to this phase.
