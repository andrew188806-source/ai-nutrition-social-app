# RA-1C-R1: trusted sealed-role control-plane boundary

Status: accepted architecture-policy closure. This round changes no database object, role membership,
migration, application runtime, or Development business row.

## Decision

The accepted boundary is:

`supabase_admin → postgres → governed sealed authority role`

PostgreSQL 17 automatically grants a role created by a non-superuser `CREATEROLE` operator back to
that creator. The bootstrap superuser records the creator relationship, so Supabase Development shows
`member=postgres`, `grantor=supabase_admin`, `admin_option=true`, `inherit_option=false`, and
`set_option=false`. `MEMBER` is therefore true, while `USAGE` and `SET` are false.

The `supabase_admin`-granted row cannot be removed or changed from the approved non-superuser
`postgres` boundary. `REVOKE ... GRANTED BY postgres` deliberately addresses only the temporary row
created by a migration or operator action. Removing the platform row would require the bootstrap
superuser boundary that this repository does not use.

The canonical migrations and operator functions rely on `postgres` holding ADMIN OPTION. It lets the
trusted database operator create a separate, narrow, grantor-specific membership with `SET` or
`INHERIT` enabled for one transaction, transfer ownership or execute the governed operator function,
and revoke that temporary row before commit. Removing ADMIN OPTION without replacing that mechanism
would break the existing migration and operator architecture.

This creator-admin row is accepted as database control-plane administration. It provides no inherited
runtime privilege and no `SET ROLE` path. The sealed-role contract protects the application and its
client/runtime roles; it does not claim to protect the database from its trusted `postgres` operator.
Hardening against compromise of `postgres` requires a separate future control-plane redesign.

The exception is explicit and closed. It applies only to the seventeen roles in the successor
manifest. Role suffixes and catalog shape do not enroll another role automatically.

## Inventory reconciliation

A raw Development scan produced twenty custom-looking names. Repository migration source contains
nineteen actual `CREATE ROLE` definitions after SQL comments are removed. The twentieth name,
`sr1bd1_probe`, is a live-only historical probe with no repository definition or application object
ownership, so it is not an authority role and is not copied into the manifest.

Seventeen repository roles are governed sealed authorities:

- `candidate_allergen_write_authority`
- `candidate_ingredient_avoidance_write_authority`
- `candidate_taste_write_authority`
- `geo_authority`
- `geo_geocode_authority`
- `meal_buddy_candidate_pool_authority`
- `meal_buddy_card_write_authority`
- `meal_buddy_chat_authority`
- `meal_buddy_notification_authority`
- `meal_buddy_relationship_authority`
- `platform_admin_branch_status_authority`
- `platform_admin_context_reader`
- `platform_admin_write_authority`
- `private_taste_normalization_write_authority`
- `social_authority`
- `social_pair_read_authority`
- `social_profile_projection_authority`

Two repository roles have explicit non-manifest dispositions:

- `social_runtime_executor` is a LOGIN runtime role, not a sealed authority.
- `restaurant_membership_context_reader` remains governed by its older phase-specific Development
  membership contract, which includes a documented second inert row. RA-1C-R1 does not generalize
  that historical exception into this exact-one-row manifest.

The executable inventory gate requires all nineteen repository definitions to appear exactly once in
the governed or excluded list. A new or renamed repository role fails until architecture review adds
an explicit disposition.

## Gating contract

For each manifested role, Development must contain exactly one incoming membership row:

- member `postgres`
- grantor `supabase_admin`
- ADMIN true
- INHERIT false
- SET false

The role must be NOLOGIN, NOINHERIT, NOBYPASSRLS, NOSUPERUSER, NOCREATEDB, NOCREATEROLE and
NOREPLICATION. `postgres` must have `USAGE=false` and `SET=false`. `anon`, `authenticated`,
`authenticator`, and `service_role` must each have MEMBER, USAGE and SET false and no direct row.

The gate fails on any extra membership, grantor or member; any runtime path; any elevated role
attribute; any new repository authority without an explicit manifest entry; or any unmanifested role
with application object ownership that tries to use the platform creator exception.

The Development gate is read-only and inert unless
`TASTKIND_PLATFORM_ADMIN_RA1C_R1_DEVELOPMENT_SECURITY=1` is set.

## Preserved P1 acceptance evidence

The completed P1 live cycle is preserved and is not repeated: real HTTP unauthenticated and Owner
401/403 denials, active Admin preview, active → inactive apply, replay, idempotency conflict, stale
mapping, canonical active recovery, ABA stale proof, revoke, and same-session post-revoke 403 checks
all passed. The target finished active at version 6, with eleven receipts retained, zero active
Platform Admins, and `dev-branch-xinyi` untouched.
