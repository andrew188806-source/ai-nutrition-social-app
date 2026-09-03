# RA-1A — Platform Admin authorization foundation

Round baseline: `101064dd4ab1c315d11e0a11f7acf1172033d8ab`.
Migration: `supabase/migrations/20260904010000_platform_admin_authority.sql` (the 92nd migration).

**Status: frozen locally and NOT APPLIED anywhere.** This migration has not been run against
Development or Production, no Edge Function was deployed, no remote configuration or secret was
changed, and no Platform Admin has been provisioned. RA-1A Development Acceptance is a separate,
later round.

## 1. What RA-1A is

The identity, membership, permission and audit authority that a future Admin console must pass
through. It answers exactly one question — *is the currently authenticated caller a Platform Admin,
and which Platform Admin permissions do they hold* — and records every grant or revocation of that
status.

**RA-1A grants no console capability.** No restaurant approval, no catalog write, no user support
surface, no moderation action, no private-data projection. It grants the right to *ask*; there is
nothing yet to *do*.

## 2. What Platform Admin is not

| Not | Why it matters |
| --- | --- |
| Restaurant Owner | Restaurant authority is per-restaurant and lives in `public.restaurant_memberships`. RA-1A shares no table, role, function or permission with it. |
| Consumer | No consumer capability is granted, removed or implied. |
| Nutritionist | A separate professional role with its own scope. The `role_key` CHECK admits `platform_admin` and nothing else, so a later round must add it deliberately. |
| Break-glass / highest-privilege management | There is no superuser path, no `BYPASSRLS`, and no blanket private-data access anywhere in this migration. |

## 3. Objects created

Private schema `admin_internal`, deliberately absent from the PostgREST exposed-schema list.

| Object | Purpose |
| --- | --- |
| `platform_admin_roles` | Role catalogue. `role_key` UNIQUE, CHECK = `platform_admin` only. |
| `platform_admin_role_permissions` | Closed permission vocabulary: `admin_context.read/self`, `admin_audit.read/platform`. |
| `platform_admin_memberships` | The auth identity ↔ platform role binding. One row per identity; revocation is a status change, never a delete. |
| `platform_admin_audit_log` | Append-only. No UPDATE and no DELETE policy exists for any role. |

There is no separate `platform_admins` identity table: Platform Admin has no tenant dimension, so
such a table would be strictly 1:1 with membership and carry no information. Membership `status`
covers the enable/disable need.

## 4. Roles — two sealed, both required

`platform_admin_context_reader` and `platform_admin_write_authority`, both
`NOLOGIN NOINHERIT NOBYPASSRLS`. No `SUPERUSER`, `CREATEDB`, `CREATEROLE` or `REPLICATION` is
requested anywhere, and no already-frozen authority required `BYPASSRLS`.

Two rather than one because the reader owns the functions every signed-in client may call, so it
must hold only column `SELECT`; the writer owns the tables and provisioning functions and is granted
to no client role. Collapsing them would put table ownership behind a function `authenticated` can
execute.

### 4.1 Role graph — EXECUTE, never membership

This distinction is the whole point of the sealed-role model, so it is stated exactly.

`authenticated` receives **`GRANT EXECUTE`** on the three `public.` functions that the sealed reader
*owns*. It is **never a member** of `platform_admin_context_reader`, and never a member of
`platform_admin_write_authority`. The same holds for `anon`, `authenticator` and `service_role`.

The migration contains exactly two role-membership grants, both to `postgres`, both transient, and
both revoked before it commits:

```sql
grant platform_admin_context_reader to postgres with admin false, inherit false, set true;
grant platform_admin_write_authority to postgres with admin false, inherit false, set true;
...
revoke platform_admin_context_reader from postgres granted by postgres;
revoke platform_admin_write_authority from postgres granted by postgres;
```

There is no other `GRANT <role> TO <role>` anywhere in RA-1A. Consequences:

- An ordinary user **cannot `SET ROLE`** to either sealed role — there is no membership to set.
- An ordinary user **cannot inherit** the reader's column privileges — again, no membership.
- The reader's `NOINHERIT` attribute is *defence in depth*, not the protection. The protection is
  that the membership does not exist at all.
- The only way a client reaches the authority tables is by executing a `SECURITY DEFINER` function
  the reader owns, which returns bounded rows and nothing else.

`GRANT reader TO authenticated` would make `authenticated` a **member** of the reader and is
forbidden. The guard, smoke and mutation suites all pin this in both grant directions, including the
disguised `WITH INHERIT FALSE, SET TRUE` form and any `SET ROLE` seam.

## 5. Authorization flow

```text
Admin Web (server-only)
  → verified Supabase session
  → public.platform_admin_current_context_v1()      -- no actor parameter
  → SECURITY DEFINER as platform_admin_context_reader, search_path = '', row_security = on
  → admin_internal membership + role + permissions
  → bounded rows: (role_key, permission_key, permission_scope)
  → resolvePlatformAdminContext() → admin | not_admin | unauthenticated | unavailable
```

No function takes an actor, user id or role parameter. The actor is resolved only from
`request.jwt.claim.sub` (with the repository's existing `request.jwt.claims ->> 'sub'` fallback), so
a caller can neither name somebody else nor assert a role.

`not_admin` and `unavailable` are deliberately distinct. A signed-in non-admin simply matches no
rows; an authority failure is a different fact and must never be reported as "not an admin" — both
deny, but a console has to be able to say which happened.

## 6. Provisioning and revocation

`admin_internal.grant_platform_admin(...)` and `admin_internal.revoke_platform_admin(...)` are
`SECURITY DEFINER`, owned by the sealed writer, and **granted to no role at all**. There is no
client-callable make-me-admin path: reaching them requires an operator to deliberately grant
themselves membership of `platform_admin_write_authority` with `SET`, then `SET ROLE` to it. The
migration revokes its own bootstrap membership at the end, so that action is always an explicit,
deliberate privileged step rather than an inherited capability.

`p_actor_auth_user_id` is **attribution for the audit row, never authorization**. Authorization is
the ability to execute the function at all; passing a different value escalates nothing.

Both functions write their audit row in the same statement flow as the membership change, including
on refusal (`invalid_request`, `unknown_role`, `unknown_identity`, `no_active_membership`). A granted
or revoked admin without a corresponding audit row is not a state this schema can reach.

## 7. Grants and RLS

- All four tables `ENABLE` + `FORCE ROW LEVEL SECURITY`, so policies apply to the owning role too.
- Reader: `SELECT` policy only. Writer: `SELECT`, `INSERT`, `UPDATE`. **No `DELETE` policy on any
  table, and no `UPDATE` policy on the audit log.**
- Schema and all four tables revoked from `PUBLIC, anon, authenticated, authenticator, service_role`.
- The reader holds column-level `SELECT` limited to exactly the columns the three public functions
  project.
- The three public functions have default `PUBLIC` execution revoked and are granted to
  `authenticated` only.

## 8. Validation

```sh
npm run test:platform-admin-ra-1a
npm run test:platform-admin-ra-1a-smoke
npm run test:platform-admin-ra-1a-mutations
```

A Development acceptance harness is **prepared but not run** during the freeze:

```sh
TASTKIND_PLATFORM_ADMIN_RA1A_DEVELOPMENT_ACCEPTANCE=1 \
  npm run test:platform-admin-ra-1a-development-acceptance
```

Without the opt-in it reports `skipped` and exits 0. Once the migration has been applied to
Development it proves, from PostgreSQL catalogues only, that no client role is a `MEMBER` or
`USAGE`-inheritor of either sealed role (`pg_has_role` in both modes, plus a direct `pg_auth_members`
sweep in both directions), that no client role holds schema, table or **column** privilege on the
four authority tables, that `authenticated` holds `EXECUTE` on exactly the three reader functions and
none on the operator functions, that `anon` and `PUBLIC` hold none, that every function is
`SECURITY DEFINER` with `search_path=` and `row_security=on` and the correct sealed owner, that RLS is
enabled and forced with no `DELETE` policy and no client-named policy, and that no Platform Admin has
been provisioned. It reads only: it creates, grants, provisions and mutates nothing.

The guard enforces the round lifecycle, the exact twelve-path manifest, the migration SHA-256 (computed
with line endings normalised to LF, so a `core.autocrlf` checkout cannot look like a modified frozen
file), that exactly one migration is added and no frozen migration byte changes, the full source
security contract, scope containment, and documentation truthfulness.

The smoke executes the real server-only authority module across every authorization state and
asserts the migration's security contract against its own text. It uses no database, network or
credential.

The mutation suite flips each security property — role sealing, definer pinning, grant surface, RLS,
policy scope, vocabulary, audit and transient-privilege release — and requires every mutant to be
killed. Mutants are applied to an in-memory copy of the source, so no repository file is ever
written and an interrupted run cannot strand a mutant on disk.

### 8.1 Privilege and ownership statement order

Every function's `REVOKE` and `GRANT` is issued **before** its `ALTER FUNCTION … OWNER TO`. This is
not stylistic. Once a function is owned by a sealed role — a role this migration deliberately cannot
`SET ROLE` to — a `REVOKE` by the previous owner is not an error: PostgreSQL emits a warning and
changes nothing. The first Development apply of this migration transferred ownership first, and all
eight privilege statements silently no-opped, leaving `PUBLIC` with `EXECUTE` on all five functions
and `authenticated` with no explicit grant at all. Nothing leaked — the definer resolves no actor for
a signed-out caller, and the operator functions stayed unreachable behind `admin_internal` schema
`USAGE` — but the frozen contract was not in force, and the operator protection rested on one control
instead of two.

`ALTER FUNCTION … OWNER TO` rewrites the grantor of each surviving ACL entry rather than resetting
the ACL, so privileges set before the transfer survive it intact. Guard and smoke assert the order
per function, and six mutants reproduce the failure shapes — reordering, a dropped revoke, a missing
grant, a leaked operator grant, a narrowed revoke, a privilege statement appended after the
transfers. Live Development acceptance then re-proves the result from `pg_proc.proacl` directly,
because `has_function_privilege()` cannot separate an explicit role grant from one reaching the role
through `PUBLIC`.

### 8.2 SQL construct qualification

Every genuine function call in the migration is schema-qualified, because a `SECURITY DEFINER` that
pins `search_path=` resolves nothing by name. `least`, `greatest`, `coalesce` and `nullif` are the
exception: they are grammar constructs with no `pg_catalog` entry, so qualifying one is not
hardening — it raises `42883` when PostgreSQL parses the function body. This is not a theoretical
rule. The first Development apply of this migration failed on exactly that error, and the guard,
smoke and mutation suites now pin both directions: no construct may be schema-qualified by any
schema, and every `pg_catalog.`-qualified name must appear in an allowlist resolved against a live
PostgreSQL 17.6 catalogue. Seven mutants reproduce the defect — including the exact expression that
failed — and all are killed locally.

### 8.3 Development reset utility

`scripts/platform-admin-ra-1a-development-reset.mjs` returns Development to a pre-RA-1A state so the
migration can be proven from a first-install position. It is acceptance infrastructure, not a
Production migration and not a runtime capability: no product path references it, and the guard
asserts that. It is inert without `TASTKIND_PLATFORM_ADMIN_RA1A_DEVELOPMENT_RESET=1`, hard-pinned to
the Development ref, and refuses to run if the credential can reach any other project. Before it
composes a single `DROP` it proves the installation is pristine — zero memberships, zero audit rows,
exactly the seeded role and two permissions, exactly four tables and five functions, no unexpected
object in `admin_internal`, and no dependency from an unrelated object onto an RA-1A object. Any
deviation aborts with nothing dropped. The drop itself is one transaction, so a failure part-way
leaves Development untouched.

It transiently widens `postgres`'s platform membership of the two sealed roles to `INHERIT TRUE,
SET TRUE` and hands it back in the same transaction, because the same wall that makes a
post-transfer `REVOKE` a no-op would otherwise block dropping sealed-role-owned functions.

### 8.4 The foreign key is the identity authority

`grant_platform_admin` does not read `auth.users`. It originally preflighted the target with
`select 1 from auth.users`, and that raised `42501 permission denied for schema auth` the first time
the body executed: the function is `SECURITY DEFINER` owned by `platform_admin_write_authority`, and
that sealed role holds no `USAGE` on the `auth` schema. Granting it would have been the wrong repair
twice over — it widens a sealed provisioning role into the auth schema, and it is not even possible
from a migration, because `auth` is owned by `supabase_admin` and `postgres` holds `USAGE` without
grant option.

`platform_admin_memberships_auth_user_id_fkey` already enforces exactly that invariant, and foreign
key enforcement needs no schema `USAGE`. The membership write is therefore attempted and the
constraint decides. A `foreign_key_violation` handler scoped to that one statement reads the violated
constraint name with `GET STACKED DIAGNOSTICS`; only
`platform_admin_memberships_auth_user_id_fkey` becomes the canonical `unknown_identity` rejection
with its audit row, and **any other foreign key re-raises the original exception unchanged** rather
than being misreported as an unknown identity. The block wraps the membership write alone, so the
subtransaction rollback reaches nothing else, the handler's audit row still commits, and the
surrounding operator transaction stays valid.

The migration names `auth.users` exactly once — in that foreign key. Guard, smoke and nine mutants
pin both halves: no function body reads the auth schema, and no grant widens a sealed role toward it.

### 8.5 Membership lifecycle acceptance and the audit actor

The Development acceptance harness carries a second, separate gate,
`TASTKIND_PLATFORM_ADMIN_RA1A_DEVELOPMENT_LIFECYCLE=1`. On the acceptance gate alone the harness is
read-only and provisions nothing; the guard asserts that split by position, so a mutating statement
cannot drift out of the gated region unnoticed. Only inside that gate does it grant and then revoke a
real Platform Admin membership, through the canonical operator functions — never by writing
`platform_admin_memberships` directly.

The operator boundary reuses the reset utility's pattern, tightened: membership of the sealed writer
is widened for exactly one transaction with `INHERIT TRUE, SET FALSE` and handed back inside it, so
the operator inherits the EXECUTE it needs and never gains the ability to `SET ROLE` to the sealed
writer at all. A failure anywhere rolls the membership back with the work.

`p_actor_auth_user_id` is passed as **NULL**. The migration documents it as attribution for the audit
row and never authorization; `platform_admin_audit_log.actor_auth_user_id`,
`granted_by_auth_user_id` and `revoked_by_auth_user_id` are all nullable with no foreign key to
`auth.users`; and neither operator function rejects a null actor. Provisioning is performed by a
database operator acting through the sealed writer, which is not an `auth.users` identity — recording
the target as the actor would assert that they granted admin to themselves, which is false. NULL is
the contract's canonical system attribution, and it keeps the audit record true.

### 8.6 Platform-owned role membership

Supabase grants every newly created role to `postgres` as `supabase_admin` at `CREATE ROLE` time.
That row is platform-owned; this migration does not write it and does not fight it. Every sealed
authority role already accepted in this database carries the identical shape. Development acceptance
admits it only in its bounded form — `inherit_option = false`, `set_option = false`, and
`pg_has_role('postgres', <sealed role>, 'USAGE') = false` — which leaves it unusable as an execution
path, and requires the migration's own transient bootstrap membership to be gone. Any other
membership row, from any grantor, or any membership naming a client role, is a failure.

## 9. Follow-up, explicitly not in RA-1A

- Applying this migration to Development, and RA-1A Development Acceptance.
- Provisioning the first Platform Admin (a deliberate privileged operator action).
- RA-1B: the Admin read API and the replacement of the mock snapshot root.
- Any Admin write beyond provisioning, which must extend both the permission CHECK and this document
  in its own reviewed round.
- The privacy decisions recorded in the RA-0 recon (meal photos, chat content, account suspension,
  moderation workflow). RA-1A deliberately adds no capability whose privacy policy is undecided.
