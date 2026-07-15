# Phase 2V-B Development Catalog Audit Runbook

Status: **Prepared handoff — execution requires separate approval**

Audit file: [`development-catalog-audit-queries.sql`](./development-catalog-audit-queries.sql)

## 1. Operator Boundary

Claude is the intended audit operator in a later explicitly approved task.

The operator must:

- target Development only;
- prove the target is not Production before any catalog query;
- perform no migration deployment;
- perform no schema or data modification;
- create no user, membership, restaurant, branch, role, fixture or test data;
- execute no credential-backed write or application/runtime smoke;
- query catalog metadata only;
- execute no inspected application function/RPC;
- output no secret, credential, token, session, project identifier or connection value;
- output no `auth.users` row, email, phone or other user/restaurant PII;
- not use a browser `service_role` client;
- preserve the complete non-secret query output for ChatGPT review;
- confirm remote migration history/count is unchanged before and after the audit.

If the available execution method cannot preserve these boundaries, stop.

## 2. Environment Verification

Before connecting:

1. Confirm the approved repository commit is `d3cfbaa1606a8d72853c67abf0d84a2238e987e4` and the expected preflight artifact diff is understood.
2. Confirm the linked/selected target by a non-secret Development label. Do not print URL, project reference, database host, credentials or environment values.
3. Independently confirm the target is not Production.
4. Confirm no deployment, push, write smoke or schema editor session is active.
5. Confirm the command/query runner will execute only explicit read-only statements from the audit file.
6. Confirm output storage is local/controlled and will not include secrets or row data.

Stop if target identity is ambiguous, any environment value would need to be printed, or only a Production target is available.

## 3. Remote Migration Alignment — Before Audit

Use the already approved read-only migration-history method for Development. Do not deploy or repair history.

Record only:

- migration list available: yes/no;
- local count: expected 25;
- remote count: expected 25;
- local/remote aligned: yes/no;
- latest aligned version: expected `20260715040000`;
- unknown/local-only/remote-only versions: count only, with non-secret version identifiers if review requires them.

If history is unavailable or differs, stop before catalog queries and report the non-secret error/difference.

## 4. Query Execution Order

Execute the SQL file section by section, without editing statements or adding exploratory row queries:

1. Audit identity and safe catalog context.
2. Target object existence and relation type.
3. Target columns and exact structural metadata.
4. Primary, foreign, unique and check constraints.
5. Indexes.
6. RLS flags.
7. RLS policies and policy roles.
8. Table/view privileges.
9. Public and owner/internal view inventory.
10. View definitions, owners and security options.
11. Restaurant/membership function inventory.
12. Function definitions/configuration/owners/security mode.
13. Function execute privileges and `PUBLIC` exposure.
14. Enum/status vocabularies.
15. Migration metadata object discovery.
16. Final no-write transaction/context proof.

Do not execute a function merely because it appears in catalog output. Do not replace an `UNKNOWN` with dynamic SQL or a row query.

## 5. Expected Output Sections

Preserve output under these exact headings:

1. `ENVIRONMENT_AND_MIGRATION_BASELINE`
2. `OBJECT_EXISTENCE_AND_TYPE`
3. `COLUMN_METADATA`
4. `CONSTRAINTS`
5. `INDEXES`
6. `RLS_FLAGS`
7. `RLS_POLICIES`
8. `TABLE_AND_VIEW_GRANTS`
9. `VIEW_INVENTORY`
10. `VIEW_DEFINITIONS_AND_SECURITY`
11. `FUNCTION_INVENTORY`
12. `FUNCTION_DEFINITIONS_AND_SECURITY`
13. `FUNCTION_EXECUTE_PRIVILEGES`
14. `ENUM_AND_STATUS_VOCABULARIES`
15. `MIGRATION_METADATA_DISCOVERY`
16. `NO_WRITE_PROOF`
17. `POST_AUDIT_MIGRATION_ALIGNMENT`

For an empty result, preserve the heading and record `EMPTY`. For a query that cannot be run safely or lacks permission, record `UNKNOWN` plus the non-secret error class/message. Do not improvise a broader query.

## 6. Output Handling

- Preserve full column names, types, constraints, policy expressions, view/function definitions, owners, security options and grants needed for review.
- Do not include row-level restaurant, user, membership, employee or Auth data.
- Do not include credentials or connection metadata.
- If a stored definition unexpectedly contains a credential-like literal, stop distribution, redact the literal without transforming the surrounding definition, and report `POTENTIAL_SECRET_REDACTED` for human security review.
- Do not summarize away conflicts; retain exact non-secret catalog evidence.

## 7. Stop Conditions

Stop immediately if:

- the target is or may be Production;
- local/remote migration history is not aligned at 25 through `20260715040000`;
- any statement requests a write, deployment, role switch, dynamic block, function execution or test data;
- a query would read `auth.users` rows, application rows, PII or secrets;
- the SQL file differs from the reviewed repository artifact;
- a required catalog object/permission is unavailable and safe catalog evidence cannot be obtained;
- query output reveals a likely secret;
- the audit changes migration count, schema state, privileges, functions, policies or data;
- an operator is asked to resolve a conflict by modifying Development.

On stop, run no compensating operation. Report the exact non-secret blocker.

## 8. No-Write Proof

No-write proof requires all of:

- the reviewed SQL contains only catalog `SELECT` statements and transaction/context inspection;
- no migration command ran;
- no function/RPC under inspection was called;
- no schema editor or dashboard mutation occurred;
- no test data or Auth identity was created;
- remote migration count/latest version are identical before and after;
- catalog object counts/definitions were observed only, not changed;
- Production was not contacted.

The audit SQL's final context section is supporting evidence, not sufficient by itself; command history and unchanged migration alignment are also required.

## Managed Auth Privilege and Failed Attempt Supplement

A later separately authorized Development deployment attempt of local-only migration `20260715050000` failed atomically with the non-secret error `SQLSTATE 42501: permission denied for schema auth`. The failure occurred because the draft attempted to grant managed `auth` schema usage from deployment role `postgres`, which has usage but no grant option. The transaction fully rolled back: remote migration history remains 25 through `20260715040000`, all five membership tables remain absent, `restaurant_membership_context_reader` remains absent, all four new functions remain absent, and Production was untouched.

The follow-up read-only privilege evidence established:

- current/session/current role was `postgres`;
- `postgres` is `NOSUPERUSER`, `CREATEROLE`, and `BYPASSRLS`;
- `createrole_self_grant` is empty;
- schema `auth` is owned by `supabase_admin` and has no `PUBLIC` usage;
- `postgres` has `auth` usage without grant option;
- `auth.uid()` is owned by `supabase_auth_admin`, is `SECURITY INVOKER`, and has `PUBLIC EXECUTE`;
- a custom function owner would still lack `auth` schema usage;
- PostgreSQL 17 creator administration permits a separately explicit, transaction-local SET membership for ownership transfer.

The approved local correction removes all managed `auth` schema/function re-grants, replaces `auth.uid()` with the equivalent verified PostgREST request JWT GUC derivation, and adds a matching temporary role-membership grant/revoke around the three ownership transfers. Deployment attempt 2 is not authorized by this supplement. No new migration version, roadmap change, Phase 2V-C work, or N4 work is authorized.

### Deployment attempt 2 and ACL corrective supplement

A later separately authorized operator successfully deployed the corrected `20260715050000` foundation. Development remote history is now 26 through that version, and the membership tables, owner role, and functions exist. Catalog validation then found effective `PUBLIC EXECUTE` on all three strict read RPCs, which also gives `anon` execute through `PUBLIC`. Claude stopped before credential-backed live smoke and did not roll back or apply an unversioned ACL change.

The deployed `20260715050000` file is now immutable. The approved local-only resolution is new versioned migration `20260715060000_fix_restaurant_membership_rpc_execute_grants.sql`, limited to exact execute ACL resets plus temporary SET-only owner-role membership. Its deployment, remote validation, and live smoke remain separate gates. Phase 2V-B cannot Freeze, and Phase 2V-C and N4 cannot begin, until those gates pass. Production remains excluded.

### Deployment attempt 3 and owner-context corrective supplement

A separately authorized operator deployed `20260715060000`, bringing Development remote history to 27. The migration removed its temporary SET membership correctly; catalog evidence shows the remaining creator relationship has `admin_option=true`, `set_option=false`, and `inherit_option=false`. The ACL commands did not execute as the function owner, however, so PostgreSQL warnings left all three strict RPCs with effective `PUBLIC EXECUTE` and without the required explicit authenticated grant. Claude stopped before live smoke and performed no rollback, repair, unversioned hotfix, staging, commit, push, or Production operation.

Both deployed migrations are now immutable. The initial Attempt 4 form of local-only `20260716010000_fix_restaurant_membership_rpc_execute_grants_as_owner.sql` temporarily granted SET, entered owner context, applied the ACL reset, returned with `SET LOCAL ROLE NONE`, and attempted to revoke membership. That final design was superseded after the rollback evidence below. The role-switch remains a migration-time transaction-local exception only; no other audit, rollback, runtime, RPC, or migration file may gain a role-switch statement.

### Deployment attempt 4 rollback and Option D supplement

Attempt 4 used the still-local `20260716010000` migration and reached its final membership `REVOKE`, which failed with SQLSTATE `XX000`. The transaction rolled back completely. Development remains 27 through `20260715060000`, all three RPC ACL defects remain, and no live smoke ran.

The follow-up catalog audit found exactly one membership row: OID 18850, granted role `restaurant_membership_context_reader`, member `postgres`, grantor `supabase_admin`, `admin_option=true`, `inherit_option=false`, and `set_option=false`. This evidence does not support a two-row same-triple model and does not establish any platform interception explanation.

Option A is rejected because its self-admin assumption does not hold. Option B is rejected because membership deletion can remove the creator relationship. Option C is rejected because it leaves SET enabled across transaction boundaries. The approved local-only Option D revises `20260716010000` in place: update the existing membership to ADMIN=true/INHERIT=false/SET=true, enter owner context, apply ACLs, return with `SET LOCAL ROLE NONE`, then restore ADMIN=true/INHERIT=false/SET=false with another `GRANT` option update. It contains no membership revoke or `GRANTED BY` clause. Deployment remains a separate gate; Phase 2V-B remains unfrozen, Phase 2V-C/N4 remain blocked, and Production remains excluded.

### Deployment attempt 5 and Option E supplement

Attempt 5 failed at the first Option D membership grant with SQLSTATE `0LP01`. The explicit `ADMIN TRUE` request triggered the own-grantor restriction, and the transaction rolled back completely. Development remains 27 through `20260715060000`; `20260716010000` remains local-only and the ACL defect remains.

Option D is superseded. Explicit ADMIN false is not used because specified membership options may update the existing value. For an existing membership, specified options are updated and omitted options retain their current state. Option E therefore omits ADMIN from both grants: first `INHERIT FALSE, SET TRUE`, then—after owner ACL work and `SET LOCAL ROLE NONE`—`INHERIT FALSE, SET FALSE`. Claude must first reconfirm the unique existing membership row. Expected final state remains one row, OID 18850, grantor `supabase_admin`, ADMIN=true, INHERIT=false, SET=false, with no effective SET or INHERIT path. Phase 2V-B remains unfrozen, Phase 2V-C/N4 remain blocked, and Production remains excluded.

### Attempt 6 and two-migration split supplement

Attempt 6 omitted ADMIN but failed with SQLSTATE `XX000` when it tried to restore SET in the same transaction after `SET LOCAL ROLE`. The transaction rolled back completely. Development remains 27 and no live smoke ran.

The approved Development resolution uses two versioned migrations. `010000` performs SET=true and owner-context ACL correction only. `020000` restores SET=false in a fresh transaction with no role-switch history. The temporary interval affects only the `postgres` deployment role, not browser actors, and cannot be accepted as final state. Detailed constraints, retry limits, escalation rules, and the future Production managed-role review gate are authoritative in `P2V-B-KI-001`.

If `010000` fails, stop at remote=27 and run nothing else. If `010000` succeeds but `020000` fails, remote is 28; inspect actual ACL and membership state, allow Claude one retry of `020000` only, prohibit manual hotfixes, and escalate after a second failure. Only remote=29 plus final SET=false may proceed to live smoke and Freeze gates.

## 9. Remote Migration Alignment — After Audit

Repeat the same approved read-only migration-history method and record:

- remote count;
- latest version;
- aligned yes/no;
- change from pre-audit count/version: expected none.

Any change is a blocker and must be escalated; do not repair or continue.

## 10. Final Reporting Format

Return exactly these non-secret sections:

1. Development target verified: yes/no
2. Production touched: no/unknown
3. Pre-audit local migration count
4. Pre-audit remote migration count
5. Pre-audit alignment/latest
6. Catalog query sections completed
7. Catalog query sections `EMPTY`
8. Catalog query sections `UNKNOWN` and exact non-secret reasons
9. Complete catalog output attachment/reference for ChatGPT review
10. Potential secret/PII encountered: no/yes-redacted
11. Schema/data write executed: no/unknown
12. Migration deployed/history changed: no/unknown
13. Test data/Auth user created: no/unknown
14. Function/RPC executed: no/unknown
15. Post-audit remote migration count/latest
16. Pre/post migration state unchanged: yes/no
17. Safe for ChatGPT compatibility review: yes/no
18. Blockers

This report does not authorize migration drafting. ChatGPT review and explicit human approval remain separate gates.
