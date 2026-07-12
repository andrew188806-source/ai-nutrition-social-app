# Gate 1.1 Disposable DB Setup Notes

Scope: Review-only setup guidance for executing the frozen Supabase schema candidate in a disposable PostgreSQL/Supabase environment.

This document must not be used against production or shared development databases.

## Local Tool Check Result

On this workstation, the following tools are not configured:

- `psql`
- `supabase` CLI
- `docker`

Because no disposable database runner is available locally, Gate 1.1 execution is blocked in this environment.

## Allowed Disposable Options

Preferred options for an external reviewer:

1. Supabase CLI local project with disposable local database.
2. Docker PostgreSQL disposable container.
3. A temporary PostgreSQL database created solely for schema review.

Do not use:

- production Supabase project refs.
- production database URLs.
- service-role keys committed to the repository.
- shared staging databases with real user data.

## Review-only SQL Bundle

Generated bundle:

- `docs/supabase-schema-review/generated/schema-review-baseline.sql`
- `docs/supabase-schema-review/generated/schema-review-baseline-manifest.json`

Source files:

- `docs/supabase-schema-drafts/001_extensions.sql` through `015_validation_queries.sql`

The generated bundle is for disposable review only and is not an active migration.

## Suggested External Review Steps

1. Create a disposable database.
2. Apply `docs/supabase-schema-review/generated/schema-review-baseline.sql` in a transaction if possible.
3. Record any failing statement, SQLSTATE code, and database error message.
4. Drop/recreate the disposable schema/database.
5. Apply the same SQL again to test recreate behavior.
6. Run fixture tests from `docs/supabase-schema-review/review-only-validation-fixtures.sql` after replacing placeholder UUIDs with inserted fixture IDs.
7. Run validation queries from `docs/supabase-schema-drafts/015_validation_queries.sql`.
8. Run RLS role simulation if Supabase auth/JWT harness is available.
9. Record all findings in `docs/supabase-schema-review/gate-1-1-disposable-db-rls-verification.md` or an external review report.

## Required Isolation Proof

External reviewer should record:

- Tool versions.
- Database host and database name.
- Confirmation that no production project ref was used.
- Confirmation that no production database URL was used.
- Confirmation that no service-role key or database password was committed.
- Teardown method and result.
