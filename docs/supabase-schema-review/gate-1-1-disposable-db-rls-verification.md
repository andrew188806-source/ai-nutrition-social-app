# Supabase Schema Gate 1.1 Disposable DB & RLS Verification

Review date: 2026-07-11
Freeze version reviewed: `supabase-schema-freeze-2026-07-11-phase-1.2`
Gate result: **Blocked by Missing Disposable DB Tooling**

This Gate 1.1 review attempted to prepare disposable DB execution and RLS verification for the frozen schema candidate. It did not connect app runtime to Supabase, execute production SQL, create active migrations, seed production data, deploy infrastructure, or modify Mobile/Restaurant Web/Admin Web runtime code.

## Retry Summary - 2026-07-11

Gate 1.1 was retried from this workstation after the disposable DB tooling gap was reported.

Retry result: **Still blocked by missing disposable DB tooling**.

Commands/checks completed:

- Tool discovery for `psql`, `supabase`, `docker`, and `node`.
- Review-only schema bundle regeneration via `node scripts/assemble-supabase-schema-review-sql.mjs`.
- Static schema validation via `node scripts/validate-supabase-schema.mjs`.
- Canonical data audit via `node scripts/audit-canonical-data.mjs`.
- Root, Mobile, Restaurant Web, and Admin Web TypeScript checks.
- Runtime import scan for schema review artifacts in `apps/` and `packages/`.

Retry findings:

- `psql`, Supabase CLI, and Docker are still unavailable on PATH.
- No disposable database was created.
- No SQL was executed.
- No Auth/JWT/RLS harness was executed.
- Static schema validation passed with 0 issues and Supabase auth-helper dependency warnings only.
- Canonical data audit passed with 0 orphan references and 0 duplicate IDs.
- Runtime import scan found no app/runtime imports of the review-only schema artifacts.

## 1. Environment and Isolation Proof

Local tool discovery result:

- `psql`: not found.
- `supabase` CLI: not found.
- `docker`: not found.

Isolation status:

- No production Supabase project ref was used.
- No production database URL was used.
- No service-role key, database password, or access token was used.
- No database connection was established.
- No SQL was executed against any database.

Because no local disposable DB runner is available, clean apply, recreate, constraint execution, validation-query execution, and RLS tenant escape tests could not be executed in this environment.

## 2. Tool Versions

Unavailable locally:

- PostgreSQL client / `psql`
- Supabase CLI
- Docker

Available and used:

- Node.js, via repository scripts.
- PowerShell, for local file and command orchestration.

## 3. Database Creation Method

No database was created.

Reason: no local `psql`, Supabase CLI, or Docker executable is available.

## 4. SQL Apply Log

Not executed.

Prepared review-only SQL bundle:

- `docs/supabase-schema-review/generated/schema-review-baseline.sql`
- `docs/supabase-schema-review/generated/schema-review-baseline-manifest.json`

The generated SQL bundle was assembled from `docs/supabase-schema-drafts/001_extensions.sql` through `015_validation_queries.sql` for external disposable DB review only. It is not an active migration.

## 5. Recreate Result

Not executed.

Reason: no disposable database environment is available locally.

## 6. Draft SQL Corrections

No draft SQL corrections were required during this Gate 1.1 run.

Existing frozen candidate status remains:

- `supabase/schema.sql` is a deprecated redirect stub with no executable schema SQL.
- `docs/supabase-schema-drafts/001-015` remains the review baseline.
- SQL drafts remain draft-only.

## 7. Constraint Execution Results

Not executed.

Prepared test plan:

- `docs/supabase-schema-review/gate-1-1-rls-constraint-test-plan.md`
- `docs/supabase-schema-review/review-only-validation-fixtures.sql`

The test plan covers restaurant/branch, menu/category/item, alias, pending item, nutrition, analytics, and legacy mapping constraints.

## 8. Nutrition Publication Test Results

Not executed against a database.

Static status from Gate 1 remains valid:

- Current nutrition partial unique index is present.
- `nutrition_estimates`, `nutrition_reviews`, `menu_item_nutrition`, and `nutrition_change_logs` are separated.
- AI estimates do not directly overwrite current published nutrition in the draft model.

External disposable DB test still required:

- duplicate current nutrition should fail.
- pending/rejected estimate should not appear in public current nutrition reads.
- change log should be append/history oriented.

## 9. Analytics Tests

Not executed against a database.

Static status from Gate 1 remains valid:

- `anonymous_id` exists.
- `event_idempotency_key` exists.
- actor context check exists.
- server-side `ingested_at` default exists.
- direct client analytics insert is not approved for production.

External disposable DB test still required:

- no actor context should fail.
- duplicate idempotency key should fail.
- invalid entity reference should fail.
- unsupported event type should fail through lookup FK.

## 10. Validation Query Results

Not executed against a database.

Static validator result:

- `node scripts/validate-supabase-schema.mjs` reviewed 15 files.
- Static issues: 0.
- Warnings: Supabase auth helper dependency warnings only.

Canonical data audit result remains clean:

- 0 orphan references.
- 0 duplicate IDs.

## 11. Auth / JWT Test Harness

Not executed.

Reason: no Supabase CLI or auth/JWT local harness is configured.

Required external actors for future test:

- anonymous consumer.
- authenticated consumer A/B.
- restaurant owner A/B.
- branch manager A1.
- restaurant employee A1.
- platform reviewer.
- platform admin.
- service role simulation.

## 12. RLS Access Test Matrix

Not executed.

Prepared matrix and test plan:

- `docs/supabase-schema-review/rls-policy-matrix.md`
- `docs/supabase-schema-review/gate-1-1-rls-constraint-test-plan.md`

Static security conclusion remains:

- Restaurant/branch tenancy must be resolved through membership and role-assignment tables.
- Production analytics ingestion should use RPC, Edge Function, or ingestion service.
- Direct client writes require security review.
- Service role must remain server-only.

## 13. Tenant / Branch Escape Tests

Not executed.

Gate 1.1 cannot assert tenant/branch escape safety without an executable Supabase/PostgreSQL RLS harness.

Future disposable environment must test:

- Restaurant A user cannot read/update Restaurant B data.
- Branch manager A1 cannot update Branch A2 unless assigned.
- Consumer cannot read pending/rejected nutrition or pending menu items.
- Restaurant user cannot promote self to platform admin.
- Client cannot write legacy mappings.
- Client cannot override `ingested_at` in an approved analytics ingestion path.

## 14. SECURITY DEFINER Database Inventory

Executable inventory not run.

Static scan from Gate 1 found no `SECURITY DEFINER` in draft SQL.

Future disposable DB reviewer should confirm:

- no unexpected SECURITY DEFINER functions exist after apply.
- all function owners and execute grants are reviewed.
- any future SECURITY DEFINER function has safe `search_path` and explicit membership/input validation.

## 15. View Exposure Tests

Not executed against a database.

Static view review remains:

- public-style reads should use active/published/current filters.
- analytics materialized views should not expose `user_id`, `anonymous_id`, or `session_id`.
- pending/rejected nutrition and review data should not be exposed to consumer public reads.

Future disposable DB test must verify view result sets with fixtures.

## 16. External Review Package Status

Prepared package:

- `docs/supabase-schema-review/generated/schema-review-baseline.sql`
- `docs/supabase-schema-review/generated/schema-review-baseline-manifest.json`
- `docs/supabase-schema-review/disposable-db-setup-notes.md`
- `docs/supabase-schema-review/gate-1-1-rls-constraint-test-plan.md`
- `docs/supabase-schema-review/review-only-validation-fixtures.sql`
- `docs/supabase-schema-review/rls-policy-matrix.md`
- `docs/supabase-schema-review/gate-1-findings-register.md`

No secrets are included.

## 17. Runtime Files Modified

None.

## 18. Active Migrations Created

None.

## 19. Production Environments Contacted

None.

## 20. Blocking Findings

Gate 1.1 blocking condition:

- No local disposable DB execution environment is available because `psql`, Supabase CLI, and Docker are not installed or not on PATH.

This blocks Gate 1.1 execution but does not invalidate the Gate 1 static review.

## 21. Security Conditions

Still required before runtime write integration or active migrations:

- clean disposable DB apply.
- recreate test.
- validation queries executed against disposable DB.
- RLS auth/JWT harness execution.
- tenant/branch escape tests.
- analytics ingestion security review.
- external Supabase/PostgreSQL security review.

## 22. Final Gate Result

Gate 1.1 result: **Blocked by Missing Disposable DB Tooling**.

Meaning:

- The repository has a prepared external review package.
- No production environment was contacted.
- No runtime code was changed.
- No active migration was created.
- No database tests were executed locally.

Next step: run the generated review package in a disposable Supabase/PostgreSQL environment with `psql`, Supabase CLI, or Docker available. Do not begin Runtime Integration Phase 1 yet.


