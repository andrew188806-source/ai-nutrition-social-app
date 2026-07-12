# Supabase Foundation

This directory contains local Supabase migration packaging for reviewed schema work.

## Consumer Schema Phase 1.3

Consumer Schema Phase 1.3 adds a formal local migration package under `supabase/migrations/`.

Scope:

- Consumer schema only.
- No seed data.
- No fixture data.
- No Auth user creation or modification.
- No Restaurant schema/data changes.
- No remote Supabase execution.
- No production deployment.

Canonical Consumer profile table:

- `consumer_profiles`

Runtime API alignment:

- Consumer Runtime Phase 1D uses `getCurrentProfile()` and reads `consumer_profiles` with `user_id = current authenticated session userId`.

Review docs:

- `docs/consumer-schema-phase-1-3-formal-migrations.md`
- `docs/consumer-schema-freeze-manifest.md`

Future work:

- Apply the Phase 1.3 package to an approved development Supabase project after dry-run and target verification.
- Add Storage buckets for meal photos and restaurant menu assets in a later approved phase.
- Add Edge Functions for OpenAI meal analysis and menu nutrition estimation in a later approved phase.
- Add audited seed/import tooling only after explicit approval.
