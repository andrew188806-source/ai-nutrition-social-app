# Phase 2W-A Architecture and Source Modes

## Data flow

`ConsumerAuthPort -> ConsumerRatingService -> read/write repository ports -> mock or disabled adapter`

The service and contracts are presentation-neutral. Screens do not import this package in Phase 2W-A.

## Feature flags

- `EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_READ_SOURCE`
  - default: `mock`
  - accepted: `mock`, `disabled`
- `EXPO_PUBLIC_TASTKIND_CONSUMER_RATINGS_WRITE_SOURCE`
  - default: `disabled`
  - accepted: `mock`, `disabled`

An unknown value resolves to `disabled` and records a configuration issue. The factory rejects any configuration containing issues; it never converts the invalid configuration into mock behavior.

## Mock mode

- Fixtures are constructor-injected and cloned.
- Defaults are deterministic and do not use wall-clock time or randomness.
- Restaurant and menu-item keys use separate namespaces.
- Replacement retires the prior current row and creates one deterministic replacement row.
- Current-user list output is sorted by stable target key.
- State is instance-local and is not shared with UI mock stores.

## Disabled mode

Read and write adapters return typed disabled errors. They do not call another source. A signed-out service call remains unauthenticated; a signed-in call reaches the explicit disabled result.

## Future modes

No prepared or live mode is accepted in Phase 2W-A. Adding either requires a later approved phase and cannot reuse the mock adapter as a failure fallback.
