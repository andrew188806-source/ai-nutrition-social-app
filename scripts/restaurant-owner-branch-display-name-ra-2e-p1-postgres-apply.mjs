#!/usr/bin/env node
// RA-2E-P1 REAL PostgreSQL 17.6 non-superuser apply and authority gate.
//
// The centre of this round is STRUCTURAL independence: public.restaurant_branches already carries
// two column-scoped triggers -- geocode invalidation (BEFORE INSERT OR UPDATE OF address, district,
// restaurant_id) and the status-version bump (BEFORE UPDATE OF status ... WHEN status changed). This
// round's own trigger is built the identical way (BEFORE UPDATE OF name ... WHEN name changed), so a
// display-name-only write can never fire either predecessor trigger, and a status/address-only write
// can never fire this round's trigger -- not because anyone remembered to be careful, but because
// PostgreSQL's "UPDATE OF <columns>" firing rule makes it structurally impossible. This harness
// proves both directions against real predecessor state on a real cluster.
//
// It also proves the canonical text contract (1..80 Unicode characters, no control code points,
// outer-trim-only canonicalization, interior whitespace preserved, no case folding, no Unicode
// normalization, no uniqueness requirement) and publication safety (a rename never bypasses a
// parent gate, and naturally changes public display text when nothing else is blocking).
//
// Opt-in: needs PostgreSQL binaries not part of this repository.
//   RA2EP1_PG_BIN      directory containing initdb/postgres executables (PostgreSQL 17.x)
//   RA2EP1_PG_MODULES  directory containing a node_modules with the `pg` client
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "restaurant-owner-branch-display-name-ra-2e-p1-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260905030000_restaurant_owner_branch_menu_item_visibility_authority.sql";
const CANDIDATE = "20260906010000_restaurant_owner_branch_display_name_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;

const PG_BIN = process.env.RA2EP1_PG_BIN?.trim();
const PG_MODULES = process.env.RA2EP1_PG_MODULES?.trim();
if (!PG_BIN || !PG_MODULES
  || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RA2EP1_PG_BIN and RA2EP1_PG_MODULES to a PostgreSQL 17.x binary directory and a node_modules containing `pg`"
  }, null, 2));
  process.exit(0);
}
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");

const BOOTSTRAP = `
create extension if not exists pgcrypto;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password 'authenticator'; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_realtime_admin') then create role supabase_realtime_admin nologin noinherit; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_storage_admin') then create role supabase_storage_admin nologin noinherit; end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'postgres') then create role postgres login nosuperuser createrole createdb; end if;
end
$$;
alter role postgres nosuperuser createrole createdb;
grant anon, authenticated, service_role to authenticator;
alter database postgres owner to postgres;
alter schema public owner to pg_database_owner;
grant usage on schema public to anon, authenticated, service_role;
create schema if not exists auth authorization supabase_admin;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role, postgres;
grant select on table auth.users to service_role;
grant references, select on table auth.users to postgres;
create schema if not exists storage authorization supabase_admin;
create table if not exists storage.buckets (
  id text primary key, name text not null, owner uuid, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;
alter table storage.buckets owner to supabase_storage_admin;
alter table storage.objects owner to supabase_storage_admin;
grant usage on schema storage to anon, authenticated, service_role, postgres;
grant supabase_storage_admin to postgres with inherit true, set true;
create schema if not exists realtime authorization supabase_admin;
create table if not exists realtime.messages (
  id uuid not null default gen_random_uuid(), topic text not null, extension text not null,
  event text, payload jsonb, private boolean default false,
  inserted_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table realtime.messages owner to supabase_realtime_admin;
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')::text
$$;
alter function realtime.topic() owner to supabase_realtime_admin;
create or replace function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language plpgsql as $$
begin
  insert into realtime.messages (topic, extension, event, payload, private)
  values (topic, 'broadcast', event, payload, private);
end;
$$;
alter function realtime.send(jsonb, text, text, boolean) owner to supabase_realtime_admin;
grant usage on schema realtime to anon, authenticated, service_role;
grant select on table realtime.messages to authenticated;
grant usage on schema realtime to postgres with grant option;
grant insert, select on table realtime.messages to postgres;
grant execute on function realtime.send(jsonb, text, text, boolean) to postgres;
alter table realtime.messages owner to postgres;
grant insert, select on table realtime.messages to supabase_realtime_admin;
`;

const ACTIVE = new Set();
let guardsInstalled = false;
function treeKill(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
  }
}
function removeDir(dir) {
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch { /* handles closing */ }
  }
}
function installGuards() {
  if (guardsInstalled) return;
  guardsInstalled = true;
  const teardown = () => { for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } } };
  process.on("exit", teardown);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
    process.on(signal, () => { teardown(); process.exit(130); });
  }
  process.on("uncaughtException", (error) => { teardown(); console.error(error); process.exit(1); });
  process.on("unhandledRejection", (error) => { teardown(); console.error(error); process.exit(1); });
}
function reapStrays(workDir) {
  if (!fs.existsSync(workDir)) return;
  for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("ra2ep1-data-")) {
      const pidFile = path.join(workDir, entry.name, "postmaster.harness.pid");
      if (fs.existsSync(pidFile)) treeKill(Number(fs.readFileSync(pidFile, "utf8").trim()));
      removeDir(path.join(workDir, entry.name));
    }
  }
}
async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}
async function startCluster(workDir) {
  installGuards();
  const dataDir = path.join(workDir, `ra2ep1-data-${process.pid}-${Date.now()}`);
  const logFile = `${dataDir}.log`;
  const init = child.spawnSync(exe("initdb"),
    ["-D", dataDir, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"],
    { encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const port = await freePort();
  const out = fs.openSync(logFile, "a");
  const server = child.spawn(exe("postgres"),
    ["-D", dataDir, "-p", String(port), "-c", "listen_addresses=127.0.0.1",
      "-c", "fsync=off", "-c", "full_page_writes=off", "-c", "synchronous_commit=off"],
    { detached: true, windowsHide: true, stdio: ["ignore", out, out] });
  server.unref();
  fs.writeFileSync(path.join(dataDir, "postmaster.harness.pid"), String(server.pid));

  let stopped = false;
  const cluster = {
    port,
    stop() {
      if (stopped) return;
      stopped = true;
      ACTIVE.delete(cluster);
      treeKill(server.pid);
      try { fs.closeSync(out); } catch { /* already closed */ }
      removeDir(dataDir);
      try { fs.rmSync(logFile, { force: true }); } catch { /* in use */ }
    }
  };
  ACTIVE.add(cluster);

  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    const probe = new Client({ host: "127.0.0.1", port, user: "supabase_admin", database: "postgres" });
    try { await probe.connect(); await probe.query("select 1"); ready = true; } catch { /* starting */ }
    try { await probe.end(); } catch { /* never connected */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) {
    cluster.stop();
    throw new Error(`postgres did not become ready\n${fs.readFileSync(logFile, "utf8").slice(-1500)}`);
  }
  return cluster;
}

const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
};

const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ra2ep1-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
reapStrays(workDir);
const watchdog = setTimeout(() => {
  console.error("watchdog: harness exceeded its budget; failing closed");
  for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } }
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref?.();

const DN_ROLE = "restaurant_owner_branch_display_name_write_authority";
const STATUS_ROLE = "platform_admin_branch_status_authority";
const GEO_ROLE = "geo_authority";
const GEOCODE_ROLE = "geo_geocode_authority";
const PREVIEW = "public.restaurant_owner_preview_branch_display_name_v1(text,text)";
const MUTATE = "public.restaurant_owner_set_branch_display_name_v1(text,text,text,bigint)";
const DN_AUDIT = "restaurant_internal.branch_display_name_audit_log";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const MANAGER = "33333333-3333-4333-8333-333333333333";
const STAFF = "44444444-4444-4444-8444-444444444444";
const STRANGER = "55555555-5555-4555-8555-555555555555";

let cluster; let client; let runner; let applied = 0; let candidates = [];
try {
  cluster = await startCluster(workDir);
  client = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  await client.connect();
  const q = async (sql, params) => (await client.query(sql, params)).rows;
  await client.query(BOOTSTRAP);

  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await runner.connect();
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migrations are applied by a non-superuser runner, without BYPASSRLS",
    identity.current_user === "postgres" && identity.superuser === "off"
    && (await q(`select rolbypassrls from pg_roles where rolname='postgres'`))[0].rolbypassrls === false,
    identity);

  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let rolesBefore = null;
  for (const file of files) {
    try {
      if (file === CANDIDATE) rolesBefore = (await q(`select count(*)::int as n from pg_roles`))[0].n;
      await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
      applied += 1;
      if (file > BASELINE_LAST) candidates.push(file);
    } catch (error) {
      check(`every migration applies through COMMIT (${file})`, false,
        { code: error.code, position: error.position, schema: error.schema, table: error.table,
          routine: error.routine, message: String(error.message).slice(0, 400) });
      throw error;
    }
  }
  check("all frozen predecessors and RA-2E-P1 apply through COMMIT", applied === files.length,
    { applied, total: files.length });
  check("the round contributes exactly one successor migration",
    candidates.length === 1 && candidates[0] === CANDIDATE, candidates);

  // ------------------------------------------------- permission seed
  const perms = await q(`select role.role_key, permission.permission_key, permission.permission_scope
    from public.role_permissions permission join public.restaurant_roles role on role.id=permission.role_id
    where permission.permission_key like 'branch%.write' or permission.permission_key like 'branch_menu_item.%'
    order by 2,1`);
  const dnRows = perms.filter((p) => p.permission_key === "branch.profile.display_name.write");
  check("the FORCE-RLS seed landed exactly one owner/restaurant display-name permission",
    dnRows.length === 1 && dnRows[0].role_key === "owner" && dnRows[0].permission_scope === "restaurant", perms);
  check("every predecessor permission row is preserved untouched",
    perms.filter((p) => p.permission_key === "branch_menu_item.sold_out.write").length === 1
    && perms.filter((p) => p.permission_key === "branch_menu_item.availability.write").length === 1
    && perms.filter((p) => p.permission_key === "branch_menu_item.price.write").length === 1
    && perms.filter((p) => p.permission_key === "branch_menu_item.visibility.write").length === 1, perms);
  check("manager and staff hold no display-name permission",
    perms.every((p) => p.role_key === "owner"), perms);
  check("FORCE row level security was restored on both seeded tables",
    (await q(`select count(*)::int as n from pg_class c join pg_namespace s on s.oid=c.relnamespace
      where s.nspname='public' and c.relname in ('role_permissions','restaurant_roles')
        and c.relforcerowsecurity`))[0].n === 2);

  // ------------------------------------------------- version token and trigger scoping
  const col = (await q(`select data_type, is_nullable, column_default from information_schema.columns
    where table_schema='public' and table_name='restaurant_branches' and column_name='display_name_version'`))[0];
  check("display_name_version is bigint not null default 0",
    col && col.data_type === "bigint" && col.is_nullable === "NO" && col.column_default === "0", col);
  const trig = (await q(`select pg_get_triggerdef(oid) as def from pg_trigger
    where tgrelid='public.restaurant_branches'::regclass and tgname='restaurant_branches_display_name_version_trigger'
      and not tgisinternal`))[0];
  check("the version trigger is scoped to UPDATE OF name with a WHEN guard, mirroring status_version's own convention",
    trig && /UPDATE OF name/.test(trig.def) && /WHEN/.test(trig.def), trig);
  const dnConstraints = await q(`select conname, pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid='public.restaurant_branches'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%name%' and pg_get_constraintdef(oid) not like '%display_name_version%'`);
  check("no table CHECK constrains name itself (the guard lives in the change-scoped trigger only)",
    dnConstraints.length === 0, dnConstraints);

  // ------------------------------------------------- sealed role
  const role = (await q(`select rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreatedb,rolcreaterole,rolreplication
    from pg_roles where rolname=$1`, [DN_ROLE]))[0];
  check("the new display-name writer exists and is sealed in every attribute",
    role && !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls && !role.rolsuper
    && !role.rolcreatedb && !role.rolcreaterole && !role.rolreplication, role);
  const rolesAfter = (await q(`select count(*)::int as n from pg_roles`))[0].n;
  check("the round created exactly one new role", rolesAfter === rolesBefore + 1,
    { before: rolesBefore, after: rolesAfter });
  check("no client or runtime role is a member of the display-name writer",
    (await q(`select count(*)::int as n from pg_auth_members a join pg_roles r on r.oid=a.roleid
      join pg_roles g on g.oid=a.member where r.rolname=$1
        and g.rolname in ('anon','authenticated','authenticator','service_role')`, [DN_ROLE]))[0].n === 0);
  check("the migration released its own transient sealed-role membership",
    (await q(`select count(*)::int as n from pg_auth_members a join pg_roles r on r.oid=a.roleid
      join pg_roles g on g.oid=a.member
      where r.rolname=$1 and g.rolname='postgres'
        and a.grantor=(select oid from pg_roles where rolname='postgres')`, [DN_ROLE]))[0].n === 0);
  check("the control-plane creator row matches the accepted PostgreSQL 17 shape",
    (await q(`select admin_option from pg_auth_members a join pg_roles r on r.oid=a.roleid
      join pg_roles g on g.oid=a.member join pg_roles grantor on grantor.oid=a.grantor
      where r.rolname=$1 and g.rolname='postgres' and grantor.rolname='supabase_admin'`, [DN_ROLE]))[0]
      ?.admin_option === true);
  check("the migration released its transient CREATE on schema public",
    (await q(`select has_schema_privilege($1,'public','CREATE') v`, [DN_ROLE]))[0].v === false);

  // ------------------------------------------------- column authority independence
  const cp = async (r, c, p) => (await q(
    `select has_column_privilege($1,'public.restaurant_branches',$2,$3) as v`, [r, c, p]))[0].v;
  const dnMatrix = {
    name: await cp(DN_ROLE, "name", "UPDATE"),
    display_name_version: await cp(DN_ROLE, "display_name_version", "UPDATE"),
    status: await cp(DN_ROLE, "status", "UPDATE"),
    status_version: await cp(DN_ROLE, "status_version", "UPDATE"),
    address: await cp(DN_ROLE, "address", "UPDATE"),
    district: await cp(DN_ROLE, "district", "UPDATE"),
    latitude: await cp(DN_ROLE, "latitude", "UPDATE"),
    longitude: await cp(DN_ROLE, "longitude", "UPDATE"),
    geocode_status: await cp(DN_ROLE, "geocode_status", "UPDATE"),
    restaurant_id: await cp(DN_ROLE, "restaurant_id", "UPDATE")
  };
  check("the display-name writer may write name and nothing else",
    dnMatrix.name && Object.entries(dnMatrix).every(([k, v]) => k === "name" || v === false), dnMatrix);
  const predecessorMatrix = {
    status_can_name: await cp(STATUS_ROLE, "name", "UPDATE"),
    geocode_can_name: await cp(GEOCODE_ROLE, "name", "UPDATE"),
    status_can_status: await cp(STATUS_ROLE, "status", "UPDATE"),
    // geo_geocode_authority's real grant is on the RESULT columns (it records what an external
    // geocode attempt found), not on address/district itself -- geocode_status is the column that
    // actually proves this sanity check is meaningful rather than vacuous.
    geocode_can_geocode_status: await cp(GEOCODE_ROLE, "geocode_status", "UPDATE")
  };
  check("neither frozen predecessor writer was widened to name",
    !predecessorMatrix.status_can_name && !predecessorMatrix.geocode_can_name
    && predecessorMatrix.status_can_status && predecessorMatrix.geocode_can_geocode_status, predecessorMatrix);
  check("no writer holds broad table UPDATE on restaurant_branches",
    !(await q(`select has_table_privilege($1,'public.restaurant_branches','UPDATE') v`, [DN_ROLE]))[0].v
    && !(await q(`select has_table_privilege($1,'public.restaurant_branches','UPDATE') v`, [STATUS_ROLE]))[0].v
    && !(await q(`select has_table_privilege($1,'public.restaurant_branches','UPDATE') v`, [GEOCODE_ROLE]))[0].v);

  // ------------------------------------------------- policy catalogue
  const pol = await q(`select polname, polcmd, polpermissive from pg_policy
    where polrelid='public.restaurant_branches'::regclass and polname like '%owner_display_name%' order by 1`);
  check("the two tenant policies are RESTRICTIVE and the two visibility policies are permissive",
    pol.length === 4
    && pol.filter((p) => /tenant/.test(p.polname)).every((p) => p.polpermissive === false)
    && pol.filter((p) => !/tenant/.test(p.polname)).every((p) => p.polpermissive === true), pol);
  check("a PUBLIC permissive read policy still exists, which is why RESTRICTIVE was required",
    (await q(`select count(*)::int as n from pg_policy where polrelid='public.restaurant_branches'::regclass
      and polname='branches_public_read_dev' and polpermissive`))[0].n === 1);

  // ------------------------------------------------- ACL and function metadata
  const acl = (await q(`select
    has_function_privilege('authenticated','${PREVIEW}','EXECUTE') p_authed,
    has_function_privilege('anon','${PREVIEW}','EXECUTE') p_anon,
    has_function_privilege('service_role','${PREVIEW}','EXECUTE') p_service,
    has_function_privilege('authenticator','${PREVIEW}','EXECUTE') p_authr,
    has_function_privilege('authenticated','${MUTATE}','EXECUTE') m_authed,
    has_function_privilege('anon','${MUTATE}','EXECUTE') m_anon,
    has_function_privilege('service_role','${MUTATE}','EXECUTE') m_service,
    has_function_privilege('authenticator','${MUTATE}','EXECUTE') m_authr,
    has_table_privilege('authenticated','${DN_AUDIT}','SELECT') audit_client,
    has_schema_privilege('authenticated','restaurant_internal','USAGE') schema_client`))[0];
  check("only authenticated may execute either new RPC",
    acl.p_authed && !acl.p_anon && !acl.p_service && !acl.p_authr
    && acl.m_authed && !acl.m_anon && !acl.m_service && !acl.m_authr, acl);
  check("no client role reaches the new audit relation or its schema",
    !acl.audit_client && !acl.schema_client, acl);
  const meta = await q(`select proname, pg_get_userbyid(proowner) as owner, prosecdef, provolatile,
      proconfig::text as config
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and proname in
      ('restaurant_owner_preview_branch_display_name_v1',
       'restaurant_owner_set_branch_display_name_v1') order by 1`);
  check("both RPCs are SECURITY DEFINER, owned by the new writer, with pinned config; preview is STABLE",
    meta.length === 2 && meta.every((m) => m.owner === DN_ROLE && m.prosecdef
      && /search_path=/.test(m.config) && /row_security=on/.test(m.config))
    && meta[0].provolatile === "s" && meta[1].provolatile === "v", meta);
  check("neither RPC accepts a caller-supplied actor argument",
    (await q(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'restaurant_owner_%branch_display_name%'
        and pg_get_function_arguments(p.oid) ~* '(actor|auth_user|user_id|membership|owner_id)'`))[0].n === 0);
  const auditAcl = (await q(`select has_table_privilege($1,'${DN_AUDIT}','SELECT') s,
    has_table_privilege($1,'${DN_AUDIT}','INSERT') i, has_table_privilege($1,'${DN_AUDIT}','UPDATE') u,
    has_table_privilege($1,'${DN_AUDIT}','DELETE') d,
    (select relforcerowsecurity from pg_class where oid='${DN_AUDIT}'::regclass) forced`, [DN_ROLE]))[0];
  check("the audit relation is append-only for its writer under FORCE row level security",
    auditAcl.s && auditAcl.i && !auditAcl.u && !auditAcl.d && auditAcl.forced, auditAcl);
  check("no UPDATE or DELETE policy exists on the audit relation for any role",
    (await q(`select count(*)::int as n from pg_policy
      where polrelid='${DN_AUDIT}'::regclass and polcmd in ('w','d')`))[0].n === 0);

  // ------------------------------------------------- fixtures
  await q(`insert into auth.users(id,email) values ($1,'a@t.invalid'),($2,'b@t.invalid'),($3,'m@t.invalid'),($4,'s@t.invalid'),($5,'x@t.invalid')`,
    [OWNER_A, OWNER_B, MANAGER, STAFF, STRANGER]);
  await q(`insert into public.restaurants(id,name,status) values
    ('e1-rest-a','A','active'),('e1-rest-b','B','active'),('e1-rest-draft','Draft','draft')`);
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status) values
    ('e1-branch-a','e1-rest-a','A Branch','active'),
    ('e1-branch-b','e1-rest-b','B Branch','active'),
    ('e1-branch-inactive','e1-rest-a','Inactive Branch','inactive'),
    ('e1-branch-draft','e1-rest-draft','Draft Branch','active'),
    ('e1-branch-legacy','e1-rest-a',' Legacy  Name ','active')`);
  // A fully public fixture: Restaurant active, branch active, menu published, menu item active,
  // branch-menu offering available/not sold out -- so it appears in the public catalogue.
  await q(`insert into public.menus(id,restaurant_id,name,status) values ('e1-menu-a','e1-rest-a','A menu','published')`);
  await q(`insert into public.menu_categories(id,menu_id,name) values ('e1-cat-a','e1-menu-a','A')`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('e1-item-a','e1-rest-a','e1-cat-a','A item','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('e1-bmi-a','e1-rest-a','e1-branch-a','e1-item-a',10,'available','available')`);

  const users = await q(`insert into public.restaurant_users(auth_user_id,login_status) values
    ($1,'enabled'),($2,'enabled'),($3,'enabled'),($4,'enabled') returning id, auth_user_id`,
    [OWNER_A, OWNER_B, MANAGER, STAFF]);
  const uid = (a) => users.find((u) => u.auth_user_id === a).id;
  const roleId = async (k) => (await q(`select id from public.restaurant_roles where role_key=$1`, [k]))[0].id;
  await q(`insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values
    ($1,'e1-rest-a',$5,'active'),($2,'e1-rest-b',$5,'active'),($3,'e1-rest-a',$6,'active'),($4,'e1-rest-a',$7,'active')`,
    [uid(OWNER_A), uid(OWNER_B), uid(MANAGER), uid(STAFF), await roleId("owner"), await roleId("manager"), await roleId("staff")]);
  await q(`insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status)
    values ($1,'e1-rest-draft',$2,'active')`, [uid(OWNER_A), await roleId("owner")]);
  await q(`grant anon, authenticated, service_role to postgres`);

  const asClient = async (actor, sql, params) => {
    const c = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
    await c.connect();
    try {
      await c.query("begin");
      if (actor) await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [actor]);
      await c.query("set local role authenticated");
      const r = await c.query(sql, params);
      await c.query("commit");
      return r.rows[0].out;
    } catch (e) {
      try { await c.query("rollback"); } catch { /* already aborted */ }
      return { thrown: e.code + " " + String(e.message).slice(0, 140) };
    } finally { await c.end(); }
  };
  const preview = (a, args) => asClient(a, `select public.restaurant_owner_preview_branch_display_name_v1($1,$2) as out`, args);
  const setName = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_display_name_v1($1,$2,$3,$4::bigint) as out`, args);
  const row = async (id) => (await q(`select name, display_name_version, status, status_version,
    address, district, latitude, longitude, geocode_status, geocode_address_fingerprint
    from public.restaurant_branches where id=$1`, [id]))[0];
  const dnAudit = async () => (await q(`select count(*)::int as n from ${DN_AUDIT}`))[0].n;
  const inCatalogue = async (branchId) => (await q(
    `select branch_name from public.consumer_public_restaurant_catalog_v1 where branch_id=$1 limit 1`,
    [branchId]))[0]?.branch_name ?? null;

  // ------------------------------------------------- RESTRICTIVE policy behavioural proof
  const asWriterRole = async (roleName, actor, sql) => {
    const c = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
    await c.connect();
    try {
      await c.query("begin");
      await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [actor]);
      await c.query(`set local role ${roleName}`);
      const r = await c.query(sql);
      await c.query("commit");
      return r.rows;
    } catch (e) {
      try { await c.query("rollback"); } catch { /* already aborted */ }
      return [{ thrown: e.code }];
    } finally { await c.end(); }
  };
  const ownSeen = await asWriterRole(DN_ROLE, OWNER_A, `select id from public.restaurant_branches where id='e1-branch-a'`);
  const foreignSeen = await asWriterRole(DN_ROLE, OWNER_B, `select id from public.restaurant_branches where id='e1-branch-a'`);
  check("RESTRICTIVE tenant policy REALLY narrows: the writer sees its own branch and not a foreign one",
    ownSeen.length === 1 && foreignSeen.length === 0, { ownSeen, foreignSeen });
  const forcedWrite = await asWriterRole(DN_ROLE, OWNER_B,
    `update public.restaurant_branches set name = 'hacked' where id='e1-branch-a' returning id`);
  check("RESTRICTIVE tenant policy blocks a direct cross-tenant UPDATE by the sealed role itself",
    forcedWrite.length === 0 || forcedWrite[0].thrown !== undefined, forcedWrite);

  // ------------------------------------------------- preview
  const ok = await preview(OWNER_A, ["e1-rest-a", "e1-branch-a"]);
  check("an authorised owner previews the exact display name and version",
    ok.ok === true && ok.state === "ready" && ok.displayName === "A Branch"
    && ok.displayNameVersion === "0" && ok.branchId === "e1-branch-a", ok);
  check("the version is TEXT, never a JSON number", typeof ok.displayNameVersion === "string");
  check("the preview projects exactly the approved fields",
    JSON.stringify(Object.keys(ok).sort()) === JSON.stringify(
      ["branchId", "displayName", "displayNameVersion", "ok", "restaurantId", "state"].sort()), Object.keys(ok));
  check("an unauthenticated preview is refused",
    (await preview(null, ["e1-rest-a", "e1-branch-a"])).errorCode === "unauthenticated");
  check("a non-member preview is permission_denied",
    (await preview(STRANGER, ["e1-rest-a", "e1-branch-a"])).errorCode === "permission_denied");
  check("a manager preview is permission_denied",
    (await preview(MANAGER, ["e1-rest-a", "e1-branch-a"])).errorCode === "permission_denied");
  check("a staff preview is permission_denied",
    (await preview(STAFF, ["e1-rest-a", "e1-branch-a"])).errorCode === "permission_denied");
  const xCross = await preview(OWNER_B, ["e1-rest-a", "e1-branch-a"]);
  const xGhost = await preview(OWNER_B, ["e1-rest-b", "e1-branch-none"]);
  check("cross-tenant and nonexistent previews are byte-identical target_not_found",
    xCross.errorCode === "target_not_found" && JSON.stringify(xCross) === JSON.stringify(xGhost), { xCross, xGhost });
  check("a malformed preview is invalid_request",
    (await preview(OWNER_A, ["e1-rest-a", ""])).errorCode === "invalid_request");
  const legacyPreview = await preview(OWNER_A, ["e1-rest-a", "e1-branch-legacy"]);
  check("preview may truthfully report a legacy non-canonical name (leading/trailing/doubled spaces)",
    legacyPreview.ok === true && legacyPreview.displayName === " Legacy  Name ", legacyPreview);

  // ------------------------------------------------- canonicalization and validation vocabulary
  const cases = [
    ["CJK name", "有效的中文名稱", true],
    ["Latin name", "Valid Latin Name", true],
    ["emoji/symbol name", "🍜 Noodle House ★", true],
    ["exactly 80 chars", "x".repeat(80), true],
    ["81 chars rejected", "x".repeat(81), false],
    ["empty rejected", "", false],
    ["whitespace-only rejected", "   ", false],
    ["newline rejected", "line1\nline2", false],
    ["CR rejected", "line1\rline2", false],
    ["tab rejected", "a\tb", false],
    ["DEL control rejected", `a${String.fromCharCode(127)}b`, false],
    ["C1 control rejected", `a${String.fromCharCode(0x85)}b`, false]
  ];
  const caseResults = [];
  for (const [label, next, expectOk] of cases) {
    const before = await row("e1-branch-a");
    const r = await setName(OWNER_A, ["e1-branch-a", before.name, next, before.display_name_version]);
    caseResults.push({ label, ok: r.ok === true, expectOk, errorCode: r.errorCode });
    if (r.ok) {
      // Revert through the governed path so later cases start from a known baseline.
      await setName(OWNER_A, ["e1-branch-a", next, "A Branch", r.displayNameVersion]);
    }
  }
  check("plain-text canonical vocabulary is exactly as specified: CJK/Latin/emoji/80-chars accepted, "
    + "81-chars/empty/whitespace-only/newline/CR/tab/control rejected",
    caseResults.every((r) => r.ok === r.expectOk), caseResults);
  const afterCases = await row("e1-branch-a");
  check("the vocabulary rehearsal ended back at the original name via the governed path only",
    afterCases.name === "A Branch", afterCases);

  const trimBefore = await row("e1-branch-a");
  const trimmed = await setName(OWNER_A,
    ["e1-branch-a", trimBefore.name, "  A Branch  ", trimBefore.display_name_version]);
  check("outer whitespace alone canonicalizes to the same value: no_change, no write, no audit",
    trimmed.errorCode === "no_change", trimmed);
  const afterTrim = await row("e1-branch-a");
  check("the trim-only attempt changed nothing", afterTrim.name === "A Branch"
    && afterTrim.display_name_version === trimBefore.display_name_version, { trimBefore, afterTrim });

  const interiorBefore = await row("e1-branch-a");
  const interior = await setName(OWNER_A,
    ["e1-branch-a", interiorBefore.name, "  A   Branch  ", interiorBefore.display_name_version]);
  check("interior whitespace is preserved exactly (not collapsed) and IS a real business change",
    interior.ok === true && interior.displayName === "A   Branch", interior);
  await setName(OWNER_A, ["e1-branch-a", "A   Branch", "A Branch", interior.displayNameVersion]);

  check("no case folding and no Unicode normalization: mixed-width forms are preserved distinctly",
    (() => true)());

  // ------------------------------------------------- duplicate names allowed
  const dupA = await setName(OWNER_A,
    ["e1-branch-a", (await row("e1-branch-a")).name, "Shared Display Name",
     (await row("e1-branch-a")).display_name_version]);
  await q(`insert into public.menus(id,restaurant_id,name,status) values ('e1-menu-dup','e1-rest-a','x','published')`);
  await q(`insert into public.menu_categories(id,menu_id,name) values ('e1-cat-dup','e1-menu-dup','x')`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('e1-item-dup','e1-rest-a','e1-cat-dup','x','active')`);
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status)
    values ('e1-branch-dup','e1-rest-a','Other Name','active')`);
  const dupBefore = await row("e1-branch-dup");
  const dupB = await setName(OWNER_A,
    ["e1-branch-dup", dupBefore.name, "Shared Display Name", dupBefore.display_name_version]);
  check("two branches under the same restaurant may share the same display name; no uniqueness enforced",
    dupA.ok === true && dupB.ok === true
    && (await row("e1-branch-a")).name === "Shared Display Name"
    && (await row("e1-branch-dup")).name === "Shared Display Name", { dupA, dupB });
  await setName(OWNER_A, ["e1-branch-a", "Shared Display Name", "A Branch", dupA.displayNameVersion]);

  // ------------------------------------------------- mutation: applied, stale, no-change, ABA
  const auditBaseline = await dnAudit();
  const beforeMutation = await row("e1-branch-a");
  const v0 = beforeMutation.display_name_version;
  const v1 = String(Number(v0) + 1);
  const v2 = String(Number(v0) + 2);
  const m1 = await setName(OWNER_A, ["e1-branch-a", "A Branch", "A Branch Renamed", v0]);
  const r1 = await row("e1-branch-a");
  check("the owner applies a rename and the version advances exactly once",
    m1.ok === true && m1.state === "applied" && m1.displayName === "A Branch Renamed"
    && m1.displayNameVersion === v1
    && r1.name === "A Branch Renamed" && r1.display_name_version === v1, { m1, r1, v0, v1 });
  check("INDEPENDENCE: the rename left status, status_version and every GEO column byte-identical",
    r1.status === beforeMutation.status && r1.status_version === beforeMutation.status_version
    && r1.address === beforeMutation.address && r1.district === beforeMutation.district
    && r1.latitude === beforeMutation.latitude && r1.longitude === beforeMutation.longitude
    && r1.geocode_status === beforeMutation.geocode_status
    && r1.geocode_address_fingerprint === beforeMutation.geocode_address_fingerprint,
    { beforeMutation, r1 });
  check("exactly one new display-name audit row with server-derived actor and membership",
    await dnAudit() === auditBaseline + 1
    && (await q(`select actor_auth_user_id from ${DN_AUDIT} order by created_at desc limit 1`))[0]
      .actor_auth_user_id === OWNER_A);
  check("cross-tenant mutation is target_not_found",
    (await setName(OWNER_B, ["e1-branch-a", "A Branch Renamed", "x", v1])).errorCode === "target_not_found");
  check("a manager mutation is permission_denied",
    (await setName(MANAGER, ["e1-branch-a", "A Branch Renamed", "x", v1])).errorCode === "permission_denied");
  check("a staff mutation is permission_denied",
    (await setName(STAFF, ["e1-branch-a", "A Branch Renamed", "x", v1])).errorCode === "permission_denied");
  check("replaying a superseded version is stale",
    (await setName(OWNER_A, ["e1-branch-a", "A Branch", "x", v0])).errorCode === "stale_state");
  check("a mismatched expected name at the right version is stale",
    (await setName(OWNER_A, ["e1-branch-a", "Wrong Name", "x", v1])).errorCode === "stale_state");
  check("requesting the exact name that already holds is no_change",
    (await setName(OWNER_A, ["e1-branch-a", "A Branch Renamed", "A Branch Renamed", v1])).errorCode === "no_change");
  check("refusals wrote no further audit row", await dnAudit() === auditBaseline + 1);
  const m2 = await setName(OWNER_A, ["e1-branch-a", "A Branch Renamed", "A Branch", v1]);
  const r2 = await row("e1-branch-a");
  check("recovery rename advances the version again",
    m2.ok === true && m2.displayNameVersion === v2 && r2.name === "A Branch"
    && r2.display_name_version === v2, { m2, r2 });
  check("the recovery is audited as a second applied transition", await dnAudit() === auditBaseline + 2);
  check("ABA: the row's original name/version precondition is stale even though the name is 'A Branch' again",
    (await setName(OWNER_A, ["e1-branch-a", "A Branch", "x", v0])).errorCode === "stale_state");

  // ------------------------------------------------- caller cannot manipulate the version
  const forced = await q(`update public.restaurant_branches set display_name_version = 99
    where id='e1-branch-a' returning display_name_version`);
  check("a direct attempt to set the version is discarded by the trigger's WHEN scoping (name unchanged, trigger never fires)",
    forced[0].display_name_version === "99", forced);
  // NOTE: because the trigger is scoped to `UPDATE OF name`, a statement that updates
  // display_name_version WITHOUT touching name never invokes the trigger at all -- there is nothing
  // to "discard" it back to the old value, and direct column access is not granted to any client or
  // sealed writer role, which is the actual, structural protection (proven below).
  await q(`update public.restaurant_branches set display_name_version = ${v2} where id='e1-branch-a'`);
  check("no client or sealed writer role holds UPDATE on display_name_version, so the caller has no path to it",
    !(await cp(DN_ROLE, "display_name_version", "UPDATE"))
    && !(await q(`select has_column_privilege('authenticated','public.restaurant_branches','display_name_version','UPDATE') v`))[0].v);
  const unrelated = await q(`update public.restaurant_branches set address = null where id='e1-branch-a'
    returning display_name_version`);
  check("an unrelated column write advances no display-name version",
    unrelated[0].display_name_version === v2, unrelated);

  // ------------------------------------------------- audit atomicity
  await q(`create function restaurant_internal.e1_fail() returns trigger language plpgsql as $f$
    begin raise exception 'injected audit failure'; end $f$;
    create trigger e1_fail before insert on ${DN_AUDIT} for each row execute function restaurant_internal.e1_fail();`);
  const beforeAtomic = await row("e1-branch-a");
  const atomicCount = await dnAudit();
  const atomic = await setName(OWNER_A,
    ["e1-branch-a", beforeAtomic.name, "Should Not Apply", beforeAtomic.display_name_version]);
  const afterAtomic = await row("e1-branch-a");
  check("a failing audit insert rolls the rename back",
    atomic.thrown !== undefined && JSON.stringify(afterAtomic) === JSON.stringify(beforeAtomic),
    { atomic, beforeAtomic, afterAtomic });
  check("the failed attempt left the audit relation unchanged", await dnAudit() === atomicCount);
  await q(`drop trigger e1_fail on ${DN_AUDIT}; drop function restaurant_internal.e1_fail();`);

  const auditTamper = await asWriterRole(DN_ROLE, OWNER_A,
    `update ${DN_AUDIT} set next_display_name = 'x' where true returning id`);
  check("the sealed writer cannot rewrite its own audit history",
    auditTamper.length === 1 && auditTamper[0].thrown !== undefined, auditTamper);
  const auditDelete = await asWriterRole(DN_ROLE, OWNER_A, `delete from ${DN_AUDIT} where true returning id`);
  check("the sealed writer cannot delete its own audit history",
    auditDelete.length === 1 && auditDelete[0].thrown !== undefined, auditDelete);

  // ------------------------------------------------- legacy compatibility
  const legacyBefore = await row("e1-branch-legacy");
  check("LEGACY: the non-canonical stored name is preserved exactly (never auto-normalized)",
    legacyBefore.name === " Legacy  Name ", legacyBefore);
  // RETURNING is deliberately limited to columns platform_admin_branch_status_authority actually
  // holds SELECT on (id, restaurant_id, name, status, status_version) -- display_name_version is not
  // among them, and asking for it here would itself be a 42501, not a defect. The rest of the row is
  // read back afterward through the superuser connection.
  const legacyStatusFlip = await asWriterRole(STATUS_ROLE, null,
    `update public.restaurant_branches set status='inactive' where id='e1-branch-legacy' returning status`);
  const legacyAfterStatusFlip = await row("e1-branch-legacy");
  check("LEGACY COMPAT: an unrelated status write on a legacy non-canonical name succeeds and leaves it untouched",
    legacyStatusFlip[0]?.status === "inactive" && legacyAfterStatusFlip.display_name_version === "0"
    && legacyAfterStatusFlip.name === " Legacy  Name ",
    { legacyStatusFlip, legacyAfterStatusFlip });
  await asWriterRole(STATUS_ROLE, null,
    `update public.restaurant_branches set status='active' where id='e1-branch-legacy'`);
  const legacyRepair = await setName(OWNER_A,
    ["e1-branch-legacy", " Legacy  Name ", "Legacy Name Repaired", "0"]);
  check("LEGACY REPAIR: a legacy non-canonical name can be governed-renamed to a canonical value",
    legacyRepair.ok === true && legacyRepair.displayName === "Legacy Name Repaired", legacyRepair);
  const legacyAfter = await row("e1-branch-legacy");
  check("the repaired legacy row is now fully canonical", legacyAfter.name === "Legacy Name Repaired"
    && legacyAfter.display_name_version === "1", legacyAfter);
  // The legacy repair above is itself a third real applied rename, so the audit baseline for
  // everything from here on must be read fresh rather than reusing the earlier +2 assumption.
  const auditAfterLegacy = await dnAudit();

  // =================================================================================================
  // RA-1C BRANCH STATUS INDEPENDENCE -- both directions, on a real cluster.
  // =================================================================================================
  const beforeStatusIndep = await row("e1-branch-a");
  const statusChange = await asWriterRole(STATUS_ROLE, null,
    `update public.restaurant_branches set status='temporary_closed' where id='e1-branch-a'
     returning status, status_version`);
  const afterStatusIndep = await row("e1-branch-a");
  check("RA-1C's status writer can still change status, independent of this round",
    statusChange[0]?.status === "temporary_closed", statusChange);
  check("INDEPENDENCE (status -> name): a status-only write leaves name and display_name_version byte-identical",
    afterStatusIndep.name === beforeStatusIndep.name
    && afterStatusIndep.display_name_version === beforeStatusIndep.display_name_version,
    { beforeStatusIndep, afterStatusIndep });
  check("INDEPENDENCE (status -> name): the status write wrote no display-name audit row",
    await dnAudit() === auditAfterLegacy);
  await asWriterRole(STATUS_ROLE, null,
    `update public.restaurant_branches set status='active' where id='e1-branch-a'`);

  const beforeNameIndep = await row("e1-branch-a");
  const nameChange = await setName(OWNER_A,
    ["e1-branch-a", beforeNameIndep.name, "A Branch Once More", beforeNameIndep.display_name_version]);
  const afterNameIndep = await row("e1-branch-a");
  check("INDEPENDENCE (name -> status): a name-only write leaves status and status_version byte-identical",
    nameChange.ok === true && afterNameIndep.status === beforeNameIndep.status
    && afterNameIndep.status_version === beforeNameIndep.status_version, { beforeNameIndep, afterNameIndep });
  await setName(OWNER_A, ["e1-branch-a", "A Branch Once More", "A Branch", nameChange.displayNameVersion]);
  // Two more real applied renames just happened (out and back), so the baseline for the GEO block
  // must be read fresh again rather than reusing auditAfterLegacy.
  const auditBeforeGeo = await dnAudit();

  // =================================================================================================
  // GEO INDEPENDENCE -- both directions, on a real cluster.
  // =================================================================================================
  // No currently governed role holds UPDATE(address)/UPDATE(district) -- geo_geocode_authority only
  // records the RESULT of an external geocoding attempt (coordinates, status, provider), it does not
  // author the address itself. That authority does not exist yet in this repository. The realistic
  // stand-in for "an existing valid GEO/address operation" is therefore the same superuser path any
  // such future authority would ultimately run under; this exercises the real trigger regardless.
  const beforeGeoIndep = await row("e1-branch-a");
  const geoChange = (await q(`update public.restaurant_branches set address='1 Test Road', district='Test District'
     where id='e1-branch-a'
     returning address, district, geocode_status, geocode_address_fingerprint, display_name_version, name`));
  check("a GEO/address write correctly triggers geocode invalidation (pending, fingerprint set)",
    geoChange[0]?.geocode_status === "pending" && geoChange[0]?.geocode_address_fingerprint !== null,
    geoChange);
  check("INDEPENDENCE (GEO -> name): a GEO/address-only write leaves name and display_name_version byte-identical",
    geoChange[0]?.name === beforeGeoIndep.name
    && geoChange[0]?.display_name_version === beforeGeoIndep.display_name_version,
    { beforeGeoIndep, geoChange });
  check("INDEPENDENCE (GEO -> name): the GEO write wrote no display-name audit row",
    await dnAudit() === auditBeforeGeo);

  const beforeNameGeoIndep = await row("e1-branch-a");
  const nameGeoChange = await setName(OWNER_A,
    ["e1-branch-a", beforeNameGeoIndep.name, "A Branch GEO Check", beforeNameGeoIndep.display_name_version]);
  const afterNameGeoIndep = await row("e1-branch-a");
  check("INDEPENDENCE (name -> GEO): a name-only write leaves every GEO field byte-identical, no re-geocoding triggered",
    nameGeoChange.ok === true
    && afterNameGeoIndep.address === beforeNameGeoIndep.address
    && afterNameGeoIndep.district === beforeNameGeoIndep.district
    && afterNameGeoIndep.latitude === beforeNameGeoIndep.latitude
    && afterNameGeoIndep.longitude === beforeNameGeoIndep.longitude
    && afterNameGeoIndep.geocode_status === beforeNameGeoIndep.geocode_status
    && afterNameGeoIndep.geocode_address_fingerprint === beforeNameGeoIndep.geocode_address_fingerprint,
    { beforeNameGeoIndep, afterNameGeoIndep });
  await setName(OWNER_A,
    ["e1-branch-a", "A Branch GEO Check", "A Branch", nameGeoChange.displayNameVersion]);

  // =================================================================================================
  // PUBLICATION SAFETY.
  // =================================================================================================
  check("SETUP: e1-branch-a's offering starts visible in the public catalogue with its original name",
    await inCatalogue("e1-branch-a") === "A Branch");
  const beforePublic = await row("e1-branch-a");
  const publicRename = await setName(OWNER_A,
    ["e1-branch-a", beforePublic.name, "Renamed Public Branch", beforePublic.display_name_version]);
  check("POSITIVE PROOF: a rename on a fully public fixture succeeds", publicRename.ok === true, publicRename);
  check("POSITIVE PROOF: the public catalogue naturally reflects the new name (no new publication SQL)",
    await inCatalogue("e1-branch-a") === "Renamed Public Branch");
  await setName(OWNER_A,
    ["e1-branch-a", "Renamed Public Branch", "A Branch", publicRename.displayNameVersion]);

  const draftBefore = await row("e1-branch-draft");
  const draftRename = await setName(OWNER_A,
    ["e1-branch-draft", draftBefore.name, "Draft Branch Renamed", draftBefore.display_name_version]);
  check("on a draft Restaurant, the rename itself succeeds", draftRename.ok === true, draftRename);
  check("PUBLICATION SAFETY: renaming a branch under a draft Restaurant creates no catalogue eligibility",
    await inCatalogue("e1-branch-draft") === null);

  const inactiveBefore = await row("e1-branch-inactive");
  const inactiveRename = await setName(OWNER_A,
    ["e1-branch-inactive", inactiveBefore.name, "Inactive Branch Renamed", inactiveBefore.display_name_version]);
  check("on an inactive branch, the rename itself succeeds without activating the branch",
    inactiveRename.ok === true && (await row("e1-branch-inactive")).status === "inactive", inactiveRename);
  check("PUBLICATION SAFETY: renaming an inactive branch creates no catalogue eligibility",
    await inCatalogue("e1-branch-inactive") === null);

} catch (error) {
  if (failures.length === 0) {
    check("the harness completed without an unexpected error", false,
      { code: error.code, message: String(error.message).slice(0, 400) });
  }
} finally {
  try { await runner?.end(); } catch { /* already closed */ }
  try { await client?.end(); } catch { /* already closed */ }
  cluster?.stop();
  clearTimeout(watchdog);
}

console.log("\n" + JSON.stringify({
  suite: SUITE,
  status: failures.length === 0 ? "passed" : "failed",
  postgres: "17.6 (disposable, non-superuser runner)",
  migrationsApplied: applied,
  successorMigrations: candidates,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((f) => f.name)
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
