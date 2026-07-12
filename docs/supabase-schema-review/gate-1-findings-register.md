# Gate 1 Findings Register

Status legend: Blocking, Security Condition, Non-blocking, Deferred.

| ID | Severity | Area | Finding | Evidence | Required action | Blocks Restaurant Web read-only integration? |
| --- | --- | --- | --- | --- | --- | --- |
| G1-001 | Security Condition | RLS/Auth | RLS draft depends on Supabase `auth.uid()` and `auth.jwt()` helpers, but no executable Supabase test harness is configured locally. | `scripts/validate-supabase-schema.mjs` warnings for `001_extensions.sql` and `013_rls_policy_drafts.sql`. | External Supabase/PostgreSQL security review and RLS simulation before write-enabled runtime. | No, if read-only integration remains feature-flagged with mock fallback. |
| G1-002 | Security Condition | Analytics | Production analytics should not use unrestricted direct client insert. | Decision Register DB-020 and RLS draft comments. | Implement RPC/Edge Function/ingestion service before analytics writes. | No. |
| G1-003 | Security Condition | Admin writes | Admin and restaurant high-risk updates require server/RPC flow and audit trail. | Decision Register DB-021. | Review controlled write path before any write integration. | No. |
| G1-004 | Non-blocking | Local SQL execution | `psql` and Supabase CLI are not available in the local environment, so clean DB apply and RLS execution were not run. | Tool discovery returned no command source. | Run clean DB apply in disposable environment during external DB review. | No. |
| G1-005 | Non-blocking | Import | No seed import / rollback script exists. | Freeze Manifest known limitation. | Build idempotent import tooling before seed import. | No. |
| G1-006 | Non-blocking | Materialized views | Refresh cadence and scheduler are deferred. | Decision Register DB-011. | Define operations refresh plan before production dashboards rely on materialized views. | No. |
| G1-007 | Non-blocking | Consumer profiles | Consumer profile production schema is deferred. | Decision Register DB-014. | Resolve before consumer-profile runtime integration. | No. |

## Gate Finding Summary

- Blocking schema findings: 0.
- Security conditions: 3.
- Non-blocking/deferred findings: 4.
- Recommended gate result: Passed with Security Conditions.
