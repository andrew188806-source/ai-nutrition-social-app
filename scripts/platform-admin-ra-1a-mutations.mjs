#!/usr/bin/env node
// RA-1A mutation suite.
//
// Every mutant flips one security property of the round and must be KILLED by the shared source
// audit. Mutants are applied to an IN-MEMORY copy of the source only: no repository file is ever
// written, so a killed or interrupted run can never strand a mutant on disk.
import fs from "node:fs";
import path from "node:path";
import {
  RA1A_MIGRATION, RA1A_PATHS, auditRa1aSources
} from "./platform-admin-ra-1a-successor-manifest.mjs";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const AUTHORITY = "apps/admin-web/server/platformAdminAuthority.ts";
const baseline = Object.fromEntries(RA1A_PATHS.map((file) => [file, read(file)]));

const results = []; const survivors = []; const stale = [];

function mutate(name, file, from, to) {
  const original = baseline[file];
  const occurrences = original.split(from).length - 1;
  if (occurrences === 0) { stale.push({ name, reason: "anchor absent" }); return; }
  const sources = { ...baseline, [file]: original.split(from).join(to) };
  if (sources[file] === original) { stale.push({ name, reason: "no change" }); return; }
  const violations = auditRa1aSources(sources);
  const killed = violations.length > 0;
  results.push({ name, killed, violations });
  if (!killed) survivors.push(name);
  console.log(`${killed ? "KILLED " : "SURVIVED"} ${name}${killed ? ` -> ${violations[0]}` : ""}`);
}

// --- role sealing ------------------------------------------------------------------------------
mutate("context reader gains LOGIN", RA1A_MIGRATION,
  "create role platform_admin_context_reader\n  nologin", "create role platform_admin_context_reader\n  login");
mutate("write authority gains LOGIN", RA1A_MIGRATION,
  "create role platform_admin_write_authority\n  nologin", "create role platform_admin_write_authority\n  login");
mutate("write authority gains BYPASSRLS", RA1A_MIGRATION,
  "create role platform_admin_write_authority\n  nologin\n  noinherit\n  nobypassrls;",
  "create role platform_admin_write_authority\n  nologin\n  noinherit\n  bypassrls;");
mutate("write authority gains SUPERUSER", RA1A_MIGRATION,
  "create role platform_admin_write_authority\n  nologin\n  noinherit\n  nobypassrls;",
  "create role platform_admin_write_authority\n  nologin\n  superuser\n  nobypassrls;");
mutate("write authority gains CREATEROLE", RA1A_MIGRATION,
  "create role platform_admin_write_authority\n  nologin\n  noinherit\n  nobypassrls;",
  "create role platform_admin_write_authority\n  nologin\n  createrole\n  nobypassrls;");
mutate("reader inherits privilege implicitly", RA1A_MIGRATION,
  "create role platform_admin_context_reader\n  nologin\n  noinherit",
  "create role platform_admin_context_reader\n  nologin\n  inherit");

// --- definer boundary --------------------------------------------------------------------------
mutate("a definer stops pinning search_path", RA1A_MIGRATION,
  "security definer\nset search_path = ''\nset row_security = 'on'\nas $$\n  with request_actor as (",
  "security definer\nset row_security = 'on'\nas $$\n  with request_actor as (");
mutate("a definer disables row security", RA1A_MIGRATION,
  "set row_security = 'on'\nas $$\n  with request_actor as (",
  "set row_security = 'off'\nas $$\n  with request_actor as (");
mutate("the read boundary accepts a caller-supplied actor", RA1A_MIGRATION,
  "create function public.platform_admin_current_context_v1()",
  "create function public.platform_admin_current_context_v1(p_actor_auth_user_id uuid)");

// --- grant surface -----------------------------------------------------------------------------
mutate("provisioning becomes client-callable", RA1A_MIGRATION,
  "revoke all on function admin_internal.grant_platform_admin(uuid, text, uuid, text)\n  from public, anon, authenticated, authenticator, service_role;",
  "grant execute on function admin_internal.grant_platform_admin(uuid, text, uuid, text) to authenticated;");
mutate("a client read function is exposed to anon", RA1A_MIGRATION,
  "grant execute on function public.platform_admin_current_context_v1() to authenticated;",
  "grant execute on function public.platform_admin_current_context_v1() to anon;");
mutate("PUBLIC execution is left in place on a client function", RA1A_MIGRATION,
  "revoke all on function public.platform_admin_audit_log_v1(integer)\n  from public, anon, authenticated, authenticator, service_role;", "");
mutate("a private table is exposed to authenticated", RA1A_MIGRATION,
  "revoke all on table admin_internal.platform_admin_memberships\n  from public, anon, authenticated, authenticator, service_role;",
  "grant select on table admin_internal.platform_admin_memberships to authenticated;");
mutate("the private schema stays open to PUBLIC", RA1A_MIGRATION,
  "revoke all on schema admin_internal from public;", "");

// --- role graph: membership must never be introduced --------------------------------------------
// `GRANT reader TO authenticated` makes authenticated a MEMBER of the reader — it could then SET
// ROLE to it and read the authority tables directly. Every one of these must be killed.
mutate("authenticated is granted membership of the reader role", RA1A_MIGRATION,
  "grant execute on function public.platform_admin_current_context_v1() to authenticated;",
  "grant platform_admin_context_reader to authenticated;\ngrant execute on function public.platform_admin_current_context_v1() to authenticated;");
mutate("authenticated is granted membership of the write authority", RA1A_MIGRATION,
  "grant execute on function public.platform_admin_current_context_v1() to authenticated;",
  "grant platform_admin_write_authority to authenticated;\ngrant execute on function public.platform_admin_current_context_v1() to authenticated;");
mutate("anon is granted membership of the reader role", RA1A_MIGRATION,
  "grant usage on schema admin_internal to platform_admin_context_reader;",
  "grant usage on schema admin_internal to platform_admin_context_reader;\ngrant platform_admin_context_reader to anon;");
mutate("service_role is granted membership of the write authority", RA1A_MIGRATION,
  "grant usage on schema admin_internal to platform_admin_write_authority;",
  "grant usage on schema admin_internal to platform_admin_write_authority;\ngrant platform_admin_write_authority to service_role;");
mutate("authenticator is granted membership of the reader role", RA1A_MIGRATION,
  "grant usage on schema admin_internal to platform_admin_context_reader;",
  "grant usage on schema admin_internal to platform_admin_context_reader;\ngrant platform_admin_context_reader to authenticator;");
mutate("membership is hidden behind INHERIT FALSE instead of being absent", RA1A_MIGRATION,
  "grant execute on function public.platform_admin_current_context_v1() to authenticated;",
  "grant platform_admin_context_reader to authenticated with inherit false, set true;\ngrant execute on function public.platform_admin_current_context_v1() to authenticated;");
mutate("the sealed reader is made a member of authenticated", RA1A_MIGRATION,
  "grant usage on schema admin_internal to platform_admin_context_reader;",
  "grant usage on schema admin_internal to platform_admin_context_reader;\ngrant authenticated to platform_admin_context_reader;");
mutate("a SET ROLE seam to the write authority is created", RA1A_MIGRATION,
  "revoke platform_admin_write_authority from postgres granted by postgres;",
  "set role platform_admin_write_authority;");
mutate("the transient postgres membership is left in place as a standing seam", RA1A_MIGRATION,
  "revoke platform_admin_context_reader from postgres granted by postgres;\nrevoke platform_admin_write_authority from postgres granted by postgres;",
  "");

// --- RLS and policy scope ----------------------------------------------------------------------
mutate("a table stops forcing RLS", RA1A_MIGRATION,
  "alter table admin_internal.platform_admin_memberships force row level security;", "");
mutate("membership writes are opened to authenticated", RA1A_MIGRATION,
  "for insert to platform_admin_write_authority with check (true)",
  "for insert to authenticated with check (true)");
mutate("a delete policy appears", RA1A_MIGRATION,
  "create policy platform_admin_memberships_writer_update\n  on admin_internal.platform_admin_memberships\n  for update to platform_admin_write_authority using (true) with check (true);",
  "create policy platform_admin_memberships_writer_delete\n  on admin_internal.platform_admin_memberships\n  for delete to platform_admin_write_authority using (true);");

// --- vocabulary --------------------------------------------------------------------------------
mutate("a write permission enters the vocabulary", RA1A_MIGRATION,
  "check (permission_key in ('admin_context.read', 'admin_audit.read'))",
  "check (permission_key in ('admin_context.read', 'admin_audit.read', 'restaurant.approve'))");
mutate("an extra platform role is admitted", RA1A_MIGRATION,
  "check (role_key = 'platform_admin')", "check (role_key in ('platform_admin', 'super_admin'))");

// --- foreign-schema authority ----------------------------------------------------------------------
// The third defect real Development caught: the sealed writer preflighted the target against
// auth.users, a schema it holds no USAGE on, so the body raised 42501 the first time it executed.
// These mutants reproduce that read and every shortcut that would "fix" it by widening the sealed
// role instead, plus the two ways the replacement FK handler could be made unsafe.
mutate("a direct auth.users existence check is reintroduced", RA1A_MIGRATION,
  "  begin\n    insert into admin_internal.platform_admin_memberships",
  "  if not exists (select 1 from auth.users as target where target.id = p_target_auth_user_id) then\n"
  + "    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'unknown_identity');\n"
  + "  end if;\n\n  begin\n    insert into admin_internal.platform_admin_memberships");
mutate("the sealed writer is granted USAGE on the auth schema", RA1A_MIGRATION,
  "revoke create on schema admin_internal from platform_admin_write_authority;",
  "grant usage on schema auth to platform_admin_write_authority;\n"
  + "revoke create on schema admin_internal from platform_admin_write_authority;");
mutate("the sealed writer is granted SELECT on auth.users", RA1A_MIGRATION,
  "revoke create on schema admin_internal from platform_admin_write_authority;",
  "grant select on auth.users to platform_admin_write_authority;\n"
  + "revoke create on schema admin_internal from platform_admin_write_authority;");
mutate("the sealed writer is made a member of a Supabase auth role", RA1A_MIGRATION,
  "revoke create on schema admin_internal from platform_admin_write_authority;",
  "grant supabase_auth_admin to platform_admin_write_authority;\n"
  + "revoke create on schema admin_internal from platform_admin_write_authority;");
mutate("every foreign-key violation is swallowed as unknown_identity", RA1A_MIGRATION,
  "      get stacked diagnostics v_constraint_name = constraint_name;\n"
  + "      if v_constraint_name <> 'platform_admin_memberships_auth_user_id_fkey' then\n"
  + "        raise;\n      end if;\n", "");
mutate("the diagnostics item name reverts to the spelling PL/pgSQL rejects", RA1A_MIGRATION,
  "get stacked diagnostics v_constraint_name = constraint_name;",
  "get stacked diagnostics v_constraint_name = pg_constraint_name;");
mutate("the constraint-name comparison is inverted so an unrelated FK is swallowed", RA1A_MIGRATION,
  "if v_constraint_name <> 'platform_admin_memberships_auth_user_id_fkey' then\n        raise;",
  "if v_constraint_name = 'platform_admin_memberships_auth_user_id_fkey' then\n        raise;");
mutate("the constraint-name comparison targets the wrong constraint", RA1A_MIGRATION,
  "v_constraint_name <> 'platform_admin_memberships_auth_user_id_fkey'",
  "v_constraint_name <> 'platform_admin_memberships_role_id_fkey'");
mutate("the re-raise is dropped so an unrelated FK silently becomes a rejection", RA1A_MIGRATION,
  "        raise;\n      end if;", "        null;\n      end if;");
mutate("the exception block is widened to cover unrelated provisioning logic", RA1A_MIGRATION,
  "  select role.id into v_role_id",
  "  begin\n  select role.id into v_role_id");

// --- privilege / ownership statement order -------------------------------------------------------
// The second defect real Development caught: privilege statements issued after ownership had moved
// to a sealed role silently no-opped, leaving PUBLIC with EXECUTE on all five functions. Each of
// these reproduces that shape — reordering, a dropped revoke, a missing grant, a leaked grant — and
// every one must die locally.
mutate("ownership transfer is moved ahead of the privilege block", RA1A_MIGRATION,
  "revoke all on function public.platform_admin_current_context_v1()\n"
  + "  from public, anon, authenticated, authenticator, service_role;",
  "alter function public.platform_admin_current_context_v1()\n"
  + "  owner to platform_admin_context_reader;\n"
  + "revoke all on function public.platform_admin_current_context_v1()\n"
  + "  from public, anon, authenticated, authenticator, service_role;");
mutate("an operator function is re-owned before its revoke", RA1A_MIGRATION,
  "revoke all on function admin_internal.grant_platform_admin(uuid, text, uuid, text)\n"
  + "  from public, anon, authenticated, authenticator, service_role;",
  "alter function admin_internal.grant_platform_admin(uuid, text, uuid, text)\n"
  + "  owner to platform_admin_write_authority;\n"
  + "revoke all on function admin_internal.grant_platform_admin(uuid, text, uuid, text)\n"
  + "  from public, anon, authenticated, authenticator, service_role;");
mutate("a reader function loses its authenticated EXECUTE grant", RA1A_MIGRATION,
  "grant execute on function public.platform_admin_has_permission_v1(text) to authenticated;", "");
mutate("a privilege statement is appended after the ownership transfers", RA1A_MIGRATION,
  "revoke create on schema public from platform_admin_context_reader;",
  "grant execute on function public.platform_admin_audit_log_v1(integer) to authenticated;\n"
  + "revoke create on schema public from platform_admin_context_reader;");
mutate("an operator function is granted to authenticated", RA1A_MIGRATION,
  "grant execute on function public.platform_admin_current_context_v1() to authenticated;",
  "grant execute on function public.platform_admin_current_context_v1() to authenticated;\n"
  + "grant execute on function admin_internal.grant_platform_admin(uuid, text, uuid, text) to authenticated;");
mutate("a reader function's client revoke narrows back to PUBLIC only", RA1A_MIGRATION,
  "revoke all on function public.platform_admin_current_context_v1()\n"
  + "  from public, anon, authenticated, authenticator, service_role;",
  "revoke all on function public.platform_admin_current_context_v1()\n  from public;");

// --- SQL construct qualification -----------------------------------------------------------------
// The defect real PostgreSQL caught on the first Development apply: qualifying an SQL construct as
// though it were a catalogue function raises 42883 when the body is parsed. These mutants reproduce
// it in every shape and must all be killed locally, so the class can never reach a remote apply again.
mutate("least is schema-qualified as a catalogue function", RA1A_MIGRATION,
  "limit least(", "limit pg_catalog.least(");
mutate("greatest is schema-qualified as a catalogue function", RA1A_MIGRATION,
  "least(greatest(", "least(pg_catalog.greatest(");
mutate("both clamp constructs are schema-qualified", RA1A_MIGRATION,
  "limit least(greatest(coalesce(requested_limit, 100), 1), 500);",
  "limit pg_catalog.least(pg_catalog.greatest(coalesce(requested_limit, 100), 1), 500);");
mutate("coalesce is schema-qualified as a catalogue function", RA1A_MIGRATION,
  "coalesce(requested_limit, 100)", "pg_catalog.coalesce(requested_limit, 100)");
mutate("nullif is schema-qualified as a catalogue function", RA1A_MIGRATION,
  "nullif(pg_catalog.current_setting(", "pg_catalog.nullif(pg_catalog.current_setting(");
mutate("a construct is qualified against a non-catalogue schema", RA1A_MIGRATION,
  "limit least(", "limit admin_internal.least(");
mutate("a qualified call names a function that does not exist in the catalogue", RA1A_MIGRATION,
  "pg_catalog.clock_timestamp()", "pg_catalog.clock_timestamp_utc()");

// --- audit foundation --------------------------------------------------------------------------
mutate("revocation deletes the membership instead of auditing it", RA1A_MIGRATION,
  "update admin_internal.platform_admin_memberships as membership\n  set status = 'revoked',",
  "delete from admin_internal.platform_admin_memberships as membership\n  where false; update admin_internal.platform_admin_memberships as membership\n  set status = 'x',");
mutate("refusals stop being audited", RA1A_MIGRATION, "'rejected'", "'ignored'");
mutate("the migration stops being one transaction", RA1A_MIGRATION, "\nbegin;\n", "\n");

// --- transient privilege release -----------------------------------------------------------------
mutate("the bootstrap membership is never released", RA1A_MIGRATION,
  "revoke platform_admin_write_authority from postgres granted by postgres;", "");
mutate("the transient CREATE privilege is never released", RA1A_MIGRATION,
  "revoke create on schema admin_internal from platform_admin_write_authority;", "");

// --- server-only authority module ------------------------------------------------------------------
mutate("the authority module stops being server-only", AUTHORITY, 'import "server-only";', "");
mutate("the authority module reaches for a transport", AUTHORITY,
  "export function platformAdminHasPermission(",
  "export const client = createClient;\nexport function platformAdminHasPermission(");
mutate("an unrecognised role is treated as admin", AUTHORITY, "unrecognized_role", "recognised_role");
mutate("an unrecognised permission is treated as admin", AUTHORITY, "unrecognized_permission", "recognised_permission");
mutate("authority failure collapses into not_admin", AUTHORITY, '"unavailable"', '"degraded"');
mutate("a write permission enters the module vocabulary", AUTHORITY,
  '"admin_audit.read"\n] as const);', '"admin_audit.read",\n  "restaurant.approve"\n] as const);');

const output = {
  suite: "platform-admin-ra-1a-mutations",
  total: results.length,
  killed: results.filter((entry) => entry.killed).length,
  survivors,
  stale,
  repositoryFilesWritten: 0,
  databaseUsed: false,
  productionTouched: false
};
console.log("\n" + JSON.stringify(output, null, 2));
process.exitCode = survivors.length === 0 && stale.length === 0 ? 0 : 1;
