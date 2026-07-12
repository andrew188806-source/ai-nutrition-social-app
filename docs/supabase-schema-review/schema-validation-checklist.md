# Gate 1 Schema Validation Checklist

## Authority and Boundary

- [x] Draft SQL files 001-015 exist.
- [x] `supabase/schema.sql` is a deprecated redirect stub with no executable schema SQL.
- [x] Historical skeleton archived in `docs/supabase-historical-schema-skeleton.md`.
- [x] Runtime import scan found no app/package/script references to schema review artifacts.
- [x] No app runtime code was modified for Gate 1.

## Static SQL Dependency Review

- [x] Draft headers present.
- [x] FK targets statically resolve.
- [x] Index targets statically resolve.
- [x] View/query relation targets statically resolve.
- [x] RLS policy targets statically resolve.
- [x] Validation query relation targets statically resolve.
- [x] `nutrition_badge_status` has a dedicated enum.
- [x] Current nutrition partial unique index exists.
- [x] Analytics actor context constraint exists.
- [x] Analytics idempotency key exists.
- [x] Legacy mapping dataset/checksum/import/rollback fields exist.

## Not Executed Locally

- [ ] Clean PostgreSQL apply test.
- [ ] Supabase CLI apply test.
- [ ] RLS role simulation.
- [ ] Validation queries against live disposable DB.
- [ ] Schema teardown/recreate test.

Reason: no local `psql` or Supabase CLI environment is configured in this workspace.
