# Consumer Schema Validation Plan

Date: 2026-07-12
Status: Draft validation plan. Queries are review-only.

## Static Validation

Use:

```text
node scripts/validate-consumer-schema.mjs
```

The validator checks draft SQL shape, table/index/policy targets, required tables, required indexes, required views, RLS drafts, and forbidden active migration language.

## Disposable DB Validation Queries

The review-only SQL draft includes checks for:

- orphan profile/private profile rows.
- orphan meal record items.
- invalid Restaurant canonical references.
- duplicate current ratings.
- duplicate active favorites.
- invalid consumed ratios.
- invalid sharing allocations.
- duplicate daily summaries by user/date/timezone.
- recommendation feedback without session.
- user ownership mismatch between parent/child rows.
- deleted account remaining private rows.
- private columns exposed by public profile view.
- restaurant aggregate rows below privacy threshold.
- duplicate legacy mappings.
- invalid timezone/date summary relations.

## Runtime Validation Before Mobile Cutover

Before Mobile runtime reads/writes move to Supabase:

- owner can read own private profile and meal records.
- owner cannot read another user's private profile or meal records.
- owner cannot write another `user_id`.
- restaurant role cannot read raw consumer meal/rating/favorite rows.
- aggregate restaurant view hides cohorts below threshold.
- service role is unavailable to browser runtimes.
- malformed client writes fail constraints.
- deletion/anonymization workflow is tested.

## Current Phase Result Expectation

Phase 1 only needs static validation to pass. It must not run SQL, migrations, seeds, or live Supabase writes.
## Phase 1 Static Validation Result

Last run: 2026-07-12

Command:

```text
node scripts/validate-consumer-schema.mjs
```

Result:

- files reviewed: 15
- required files: 15
- tables: 24
- views: 3
- indexes: 25
- policies: 23
- issues: 0
- warnings: 1 expected Supabase auth-helper warning for draft RLS `auth.uid()` usage

The warning is intentional: RLS drafts require a Supabase environment or auth test stub before execution review.

## Phase 1.1 Static Validation Result

Last run: 2026-07-12

Command:

```text
node scripts/validate-consumer-schema.mjs
```

Result:

- files reviewed: 15
- required files: 15
- tables: 24
- views: 3
- functions: 1
- indexes: 25
- policies: 23
- issues: 0
- warnings: 1 expected `auth.uid()` RLS draft warning

Phase 1.1 also requires the review package documents:

- `docs/consumer-schema-status-enum-mapping.md`
- `docs/consumer-schema-phase-1-1-freeze-review.md`

The validator checks that both are present.

## Phase 1.1 Full Validation Result

Last run: 2026-07-12

Executed checks:

- `node scripts/validate-consumer-schema.mjs` - passed, 0 issues, 1 expected `auth.uid()` warning.
- root, Mobile, Restaurant Web, and Admin Web typechecks - passed.
- `node scripts/audit-canonical-data.mjs` - passed.
- Restaurant schema static validator - passed with existing auth-helper warnings only.
- Restaurant Phase 1A and 1B-R guards - passed.
- Restaurant Phase 1C and 1D GET-only live guards - passed after network approval; fallback remained false and no credentials or writes were used.
- Restaurant Web production build - passed.
- Runtime import scan - passed; Consumer schema docs are not imported by runtime apps/packages.
- Active migration/write scan - no Consumer data writes found. The only match is an RLS `for update` policy, not data mutation SQL.
- Secret scan - no credentials found. Matches are documentation statements forbidding service-role exposure.
- `package-lock.json` diff scan - no changes.
