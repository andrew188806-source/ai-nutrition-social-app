# PC-2 Development inactive deployment — 2026-10-10

Target: tastkind-development (msbgnnoorsoefuiwluye), PostgreSQL 17. Demo: https://haocu-demo.vercel.app/.

Only these accepted sources were installed through the Supabase migration API:

| Source | SHA256 | Remote history version |
|---|---|---|
| 20260930174028_consumer_pc2_onboarding_consent_foundation.sql | 79fb7610b5e1d5428e2bd986eb6e8388c9d521e1dae9780436e21a283f61a313 | 20261009160308 |
| 20260930174030_consumer_pc2_core_social_eligibility.sql | 242ed04e5d948727c8f26ef187e1cb0ea1803ab4eb7db5a4c709f80f19f7ce8d | 20261009160530 |

Source bytes match independently accepted commit 8e749f60e4e76ac09bb57195af1793575f5ed0cf. Final reacceptance report SHA256: faa8cf15a64ef0647210db2105e1fd59455c2308a8493f4e825d23f6d169a53b. The accepted local PG17 95-control evidence is reused with source/tool bindings; it was not rerun as fresh remote end-to-end acceptance.

The API generated the remote timestamps above; original local filenames are unchanged. Never run a blanket db push to reconcile these timestamps or install unrelated pending migrations. Exact request SQL and receipts are preserved externally.

Native pgcrypto is in extensions, while the accepted foundation calls public.digest(bytea,text). Foundation includes this narrow dependency supplement (the existing extension is not moved):

```sql
create function public.digest(bytea,text) returns bytea
language sql immutable strict security invoker set search_path=''
as $digest$ select extensions.digest($1,$2) $digest$;
revoke all on function public.digest(bytea,text)
 from public,anon,authenticated,authenticator,service_role;
grant execute on function public.digest(bytea,text) to postgres;
```

Preflight verifies operator, dependencies, unique profile ownership, source identities and predecessor function behavior. Each application has a transaction, 5-second lock timeout, row snapshots for consumer_profiles/consumer_data_consents/meal_records/social_participation, role-edge snapshots and unrelated function definition/owner/ACL checks. The gates add only the accepted three helper EXECUTE grants: require_social(uuid) to meal_buddy_card_write_authority; core_eligible(uuid) and social_qualified(uuid) to social_authority. Their ACL checks preserve existing edges and permit only those exact postgres-issued, non-grantable additions. Temporary builder role grants/schema CREATE are cleaned up.

Post-apply: documents, approvals, bundles and consents all 0; rollout enforcing=false and bundle_version=NULL; existing cohort/profiles 24, meals 16, Social rows 23; 19 restrictive core policies and 19 core-write triggers. Private tables use FORCE RLS. Anonymous/authenticated callers can read the document RPC but cannot call the digest wrapper. Row/role/unrelated-function assertions passed inside successful application transactions.

Legal files remain v1-draft-r3 / NOT ACTIVE. No document, approval, consent or training grant was created. Existing members retain the accepted inactive preparation-cohort behavior; new members still require documents and explicit required consents. Full real-account onboarding/consent/re-login acceptance remains BLOCKED until approved clean publication bytes and activation prerequisites exist.
