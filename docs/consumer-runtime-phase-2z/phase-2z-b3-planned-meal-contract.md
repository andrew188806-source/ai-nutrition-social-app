# Phase 2Z-B3 Planned Meal V2 Contract

## Boundary

Phase 2Z-B3-B prepares a local, single-entry Planned Meal database/domain contract. It does not deploy Migration 39, connect to Development, wire mobile routes or providers, persist summaries, run background work, or touch Production. The existing 38 migrations and V1 Planned Meal RPC/TypeScript write path remain byte-equivalent.

The contract supports one planned entry, optional local wall-clock time, required actor IANA timezone for new V2 writes, a meal period separate from an optional category, display-only restaurant name snapshot, and existing trusted restaurant/branch/menu-item identity. It does not add `menu_id`, multi-item planning, catalog validation, automatic expiry, hard delete, Social, Corrections, or settlement.

## Migration 39

Migration `20260720020000_consumer_planned_meal_contract_v2.sql` adds exactly eight nullable columns: `planned_local_time`, `planned_timezone`, `meal_category`, `restaurant_name_snapshot`, `create_client_request_id`, `create_request_fingerprint`, `conversion_request_fingerprint`, and `converted_at`.

It adds an actor-scoped partial unique create-key index and `(user_id, planned_for, planned_local_time, id)` ordering index. Constraints enforce create key/fingerprint pairing, time/timezone pairing, and complete V2 conversion metadata when a conversion fingerprint exists. The conversion constraint is one-way so legacy converted rows require no backfill.

## Temporal semantics

`planned_for` is the actor-timezone plan date. `planned_local_time` is an optional local wall-clock time; a timezone with null time is a date-only plan. Legacy null timezone/time rows remain readable. Planned date/time never represents actual consumption.

Explicit conversion captures one confirmation instant on first submit. Retry preserves that exact instant, timezone, key, expected version, and input. The canonical Meal Record uses the confirmation instant for `occurredAt`, derives `mealDate` in the actor timezone, and uses database transaction time for `converted_at`.

## V2 RPC inventory

Only these four authenticated product RPCs are added:

- `create_authenticated_planned_meal_v2`: validates and normalizes the canonical payload, derives `auth.uid()`, serializes actor/key access, creates a server fingerprint, and returns the same row on an identical replay.
- `update_authenticated_planned_meal_v2`: accepts ID, `expected_updated_at`, and an allowlisted JSON patch. Omission preserves a field, explicit null clears a nullable field, and a value replaces it. Unknown keys, non-planned rows, and stale versions are rejected.
- `cancel_authenticated_planned_meal_v2`: performs planned-to-cancelled only. Repeated cancellation is a stable replay before version comparison; converted and expired rows return stable lifecycle conflicts.
- `convert_authenticated_planned_meal_v2`: locks an actor-owned row, handles same-key replay before version comparison, fingerprints the locked snapshot and operation inputs, calls B2-A `create_current_user_meal_record_v2` in the same transaction, and retains the converted plan.

Two migration-private helpers normalize nutrition and build an allowlisted Planned Meal response. Execute is revoked from PUBLIC, anon, and authenticated. All four public RPCs are `SECURITY DEFINER`, have a fixed safe `search_path`, derive the actor only from `auth.uid()`, are explicitly owned by `postgres`, and grant execute only to authenticated. Direct Planned Meal DML remains revoked.

Clients never submit actor identity, fingerprints, nutrition for conversion, restaurant/menu conversion payload, or a Meal Record ID. Responses exclude fingerprints and provider/database payloads.

## Idempotency and lifecycle

Create requires a UUID v4. Same actor/key/canonical payload replays the same row; changed payload conflicts; another actor has an independent key scope.

Conversion requires a UUID v4, expected `updated_at`, confirmation timestamp, and actor timezone. Same key and same server-derived fingerprint returns the original Meal Record; changed inputs conflict. A different key cannot reconvert. Cancelled/expired plans cannot convert, and converted plans cannot update/cancel.

Conversion creates exactly one canonical Meal Record and one item using the locked plan snapshot. Mapping is: manual record source, `ai_estimated` nutrition source, consumed ratio 1, correction status none, null note/menu ID, planned title for record/item display, planned period for meal type, and trusted server-read identity. It calls no summary persistence RPC and produces no automatic/background side effect. Any failure rolls back both Meal Record creation and plan transition.

## Local runtime preparation

The V2 contracts include strict mappers, Supabase/mock/disabled repositories, service/factory exports, a local mapper/runtime, and actor-scoped create/conversion pending storage with a 24-hour TTL. Pending data is saved before transport. Repeated taps share one in-flight promise; ambiguous results retain the exact operation for explicit retry. Restore reads pending state without a network request. Expiry only removes state. Logout/actor generation changes clear old pending state, and stale responses cannot update the new actor state. Provider errors map to safe domain/runtime codes.

Mock behavior is deterministic and actor-isolated. Disabled mode fails closed. Misconfiguration has no mock fallback. The Supabase adapter is prepared to receive the existing shared client in a later cutover; B3-B constructs no second client and performs no remote call.

## Verification boundary

The local guard proves the exact 20-file post-correction candidate inventory, frozen history, immutable Migration 39, current Migration 40 definitions, RPC/security invariants, package/lockfile stability, no UI/provider wiring, and no Production/N4/Phase 2V-F scope. The deterministic smoke covers create replay/conflict/isolation, update clear/replace/version behavior, cancel replay, atomic-equivalent conversion, lifecycle conflicts, deterministic `P0001` version-conflict mapping, pending ambiguity/retry, and no credential/remote access.

## B3-C1 version-conflict SQLSTATE correction

Migration 39 has been deployed to Development and remains immutable. B3-C validation found that the update, cancel, and convert optimistic-version conflict paths used PostgreSQL SQLSTATE `40001`. Because `40001` is reserved for retryable serialization failures, the Development request path retried until approximately 125 seconds and returned HTTP 504 instead of immediately returning the stable `PLANNED_MEAL_VERSION_CONFLICT` business conflict.

Migration `20260721010000_consumer_planned_meal_version_conflict_sqlstate.sql` is the sole forward correction. It provides the three complete current RPC definitions with only the version-conflict SQLSTATE changed from `40001` to non-retryable user-defined SQLSTATE `P0001`. The stable message remains `PLANNED_MEAL_VERSION_CONFLICT`.

Migration 40 changes no schema, RPC signature, input/output shape, fingerprint, actor ownership, locking/replay order, lifecycle rule, B2-A atomic call, or transaction behavior. It explicitly restates security-definer status, safe search path, `postgres` ownership, authenticated-only execute grants, and direct-DML revocation.

Migration 40 has not yet been deployed to Development. Development latency and HTTP behavior must be revalidated after corrective deployment; local smoke proves only deterministic domain mapping and pending-state behavior. Phase B3-D remains blocked.
