#!/usr/bin/env node
// RA-2D-P1 REAL PostgreSQL 17.6 non-superuser apply and authority gate.
//
// The centre of this round is PUBLICATION SAFETY: hidden -> available is a potential publication
// action, and the Owner must never be able to use it to bypass a parent gate (Restaurant draft,
// branch inactive, menu unpublished, menu item inactive, availability unavailable, sold_out true).
// This harness proves that against public.consumer_public_restaurant_catalog_v1 directly, on a real
// cluster, rather than trusting the migration's own reasoning about it.
//
// It also proves the DISCONTINUED boundary: every transition that names or targets 'discontinued'
// is refused, discontinued rows stay valid, and every predecessor writer (sold_out/availability/
// price) keeps working on a discontinued row exactly as before.
//
// Opt-in: needs PostgreSQL binaries not part of this repository.
//   RA2DP1_PG_BIN      directory containing initdb/postgres executables (PostgreSQL 17.x)
//   RA2DP1_PG_MODULES  directory containing a node_modules with the `pg` client
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "restaurant-owner-visibility-ra-2d-p1-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260905020000_restaurant_owner_branch_menu_item_price_authority.sql";
const CANDIDATE = "20260905030000_restaurant_owner_branch_menu_item_visibility_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;

const PG_BIN = process.env.RA2DP1_PG_BIN?.trim();
const PG_MODULES = process.env.RA2DP1_PG_MODULES?.trim();
if (!PG_BIN || !PG_MODULES
  || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RA2DP1_PG_BIN and RA2DP1_PG_MODULES to a PostgreSQL 17.x binary directory and a node_modules containing `pg`"
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
    if (entry.isDirectory() && entry.name.startsWith("ra2dp1-data-")) {
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
  const dataDir = path.join(workDir, `ra2dp1-data-${process.pid}-${Date.now()}`);
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

const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ra2dp1-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
reapStrays(workDir);
const watchdog = setTimeout(() => {
  console.error("watchdog: harness exceeded its budget; failing closed");
  for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } }
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref?.();

const VIS_ROLE = "restaurant_owner_branch_menu_item_visibility_write_authority";
const SO_ROLE = "restaurant_owner_branch_menu_item_write_authority";
const AV_ROLE = "restaurant_owner_branch_menu_item_availability_write_authority";
const PR_ROLE = "restaurant_owner_branch_menu_item_price_write_authority";
const PREVIEW = "public.restaurant_owner_preview_branch_menu_item_visibility_v1(text,text,text)";
const MUTATE = "public.restaurant_owner_set_branch_menu_item_visibility_v1(text,text,text,bigint)";
const VIS_AUDIT = "restaurant_internal.branch_menu_item_visibility_audit_log";
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
  check("all frozen predecessors and RA-2D-P1 apply through COMMIT", applied === files.length,
    { applied, total: files.length });
  check("the round contributes exactly one successor migration",
    candidates.length === 1 && candidates[0] === CANDIDATE, candidates);

  // ------------------------------------------------- permission seed
  const perms = await q(`select role.role_key, permission.permission_key, permission.permission_scope
    from public.role_permissions permission join public.restaurant_roles role on role.id=permission.role_id
    where permission.permission_key like 'branch_menu_item.%' order by 2,1`);
  const visRows = perms.filter((p) => p.permission_key === "branch_menu_item.visibility.write");
  check("the FORCE-RLS seed landed exactly one owner/restaurant visibility permission",
    visRows.length === 1 && visRows[0].role_key === "owner" && visRows[0].permission_scope === "restaurant", perms);
  check("every predecessor permission row is preserved untouched",
    perms.filter((p) => p.permission_key === "branch_menu_item.sold_out.write").length === 1
    && perms.filter((p) => p.permission_key === "branch_menu_item.availability.write").length === 1
    && perms.filter((p) => p.permission_key === "branch_menu_item.price.write").length === 1, perms);
  check("manager and staff hold no branch-menu write permission",
    perms.every((p) => p.role_key === "owner"), perms);
  check("FORCE row level security was restored on both seeded tables",
    (await q(`select count(*)::int as n from pg_class c join pg_namespace s on s.oid=c.relnamespace
      where s.nspname='public' and c.relname in ('role_permissions','restaurant_roles')
        and c.relforcerowsecurity`))[0].n === 2);

  // ------------------------------------------------- version token and the constraint census
  const col = (await q(`select data_type, is_nullable, column_default from information_schema.columns
    where table_schema='public' and table_name='branch_menu_items' and column_name='branch_specific_status_version'`))[0];
  check("branch_specific_status_version is bigint not null default 0",
    col && col.data_type === "bigint" && col.is_nullable === "NO" && col.column_default === "0", col);
  check("all four version triggers coexist",
    (await q(`select count(*)::int as n from pg_trigger where tgrelid='public.branch_menu_items'::regclass
      and not tgisinternal and tgname in ('branch_menu_items_branch_specific_status_version_maintain',
        'branch_menu_items_availability_version_maintain','branch_menu_items_sold_out_version_maintain',
        'branch_menu_items_price_version_maintain')`))[0].n === 4);
  const statusConstraints = await q(`select conname, pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid='public.branch_menu_items'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%branch_specific_status%'
      and pg_get_constraintdef(oid) not like '%branch_specific_status_version%'`);
  check("exactly the pre-existing enum CHECK constrains branch_specific_status (no new restriction)",
    statusConstraints.length === 1 && /discontinued/.test(statusConstraints[0].def), statusConstraints);

  // ------------------------------------------------- sealed role
  const role = (await q(`select rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreatedb,rolcreaterole,rolreplication
    from pg_roles where rolname=$1`, [VIS_ROLE]))[0];
  check("the new visibility writer exists and is sealed in every attribute",
    role && !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls && !role.rolsuper
    && !role.rolcreatedb && !role.rolcreaterole && !role.rolreplication, role);
  const rolesAfter = (await q(`select count(*)::int as n from pg_roles`))[0].n;
  check("the round created exactly one new role", rolesAfter === rolesBefore + 1,
    { before: rolesBefore, after: rolesAfter });
  check("no client or runtime role is a member of the visibility writer",
    (await q(`select count(*)::int as n from pg_auth_members a join pg_roles r on r.oid=a.roleid
      join pg_roles g on g.oid=a.member where r.rolname=$1
        and g.rolname in ('anon','authenticated','authenticator','service_role')`, [VIS_ROLE]))[0].n === 0);
  check("the migration released its own transient sealed-role membership",
    (await q(`select count(*)::int as n from pg_auth_members a join pg_roles r on r.oid=a.roleid
      join pg_roles g on g.oid=a.member
      where r.rolname=$1 and g.rolname='postgres'
        and a.grantor=(select oid from pg_roles where rolname='postgres')`, [VIS_ROLE]))[0].n === 0);
  check("the control-plane creator row matches the accepted PostgreSQL 17 shape",
    (await q(`select admin_option, inherit_option, set_option from pg_auth_members a
      join pg_roles r on r.oid=a.roleid join pg_roles g on g.oid=a.member
      join pg_roles grantor on grantor.oid=a.grantor
      where r.rolname=$1 and g.rolname='postgres' and grantor.rolname='supabase_admin'`, [VIS_ROLE]))[0]
      ?.admin_option === true);
  check("the migration released its transient CREATE on schema public",
    (await q(`select has_schema_privilege($1,'public','CREATE') v`, [VIS_ROLE]))[0].v === false);

  // ------------------------------------------------- four-way column authority independence
  const cp = async (r, c, p) => (await q(
    `select has_column_privilege($1,'public.branch_menu_items',$2,$3) as v`, [r, c, p]))[0].v;
  const visMatrix = {
    branch_specific_status: await cp(VIS_ROLE, "branch_specific_status", "UPDATE"),
    branch_specific_status_version: await cp(VIS_ROLE, "branch_specific_status_version", "UPDATE"),
    sold_out: await cp(VIS_ROLE, "sold_out", "UPDATE"),
    sold_out_version: await cp(VIS_ROLE, "sold_out_version", "UPDATE"),
    availability: await cp(VIS_ROLE, "availability", "UPDATE"),
    availability_version: await cp(VIS_ROLE, "availability_version", "UPDATE"),
    price: await cp(VIS_ROLE, "price", "UPDATE"),
    price_version: await cp(VIS_ROLE, "price_version", "UPDATE"),
    restaurant_id: await cp(VIS_ROLE, "restaurant_id", "UPDATE")
  };
  check("the visibility writer may write branch_specific_status and nothing else",
    visMatrix.branch_specific_status
    && Object.entries(visMatrix).every(([k, v]) => k === "branch_specific_status" || v === false),
    visMatrix);
  const predecessorMatrix = {
    so_status: await cp(SO_ROLE, "branch_specific_status", "UPDATE"),
    av_status: await cp(AV_ROLE, "branch_specific_status", "UPDATE"),
    pr_status: await cp(PR_ROLE, "branch_specific_status", "UPDATE"),
    so_sold_out: await cp(SO_ROLE, "sold_out", "UPDATE"),
    av_availability: await cp(AV_ROLE, "availability", "UPDATE"),
    pr_price: await cp(PR_ROLE, "price", "UPDATE")
  };
  check("no frozen predecessor writer was widened to branch_specific_status",
    !predecessorMatrix.so_status && !predecessorMatrix.av_status && !predecessorMatrix.pr_status
    && predecessorMatrix.so_sold_out && predecessorMatrix.av_availability && predecessorMatrix.pr_price,
    predecessorMatrix);
  check("no writer holds broad table UPDATE on branch_menu_items",
    !(await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') v`, [VIS_ROLE]))[0].v
    && !(await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') v`, [SO_ROLE]))[0].v
    && !(await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') v`, [AV_ROLE]))[0].v
    && !(await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') v`, [PR_ROLE]))[0].v);

  // ------------------------------------------------- policy catalogue
  const pol = await q(`select polname, polcmd, polpermissive from pg_policy
    where polrelid='public.branch_menu_items'::regclass and polname like '%owner_visibility%' order by 1`);
  check("the two tenant policies are RESTRICTIVE and the two visibility policies are permissive",
    pol.length === 4
    && pol.filter((p) => /tenant/.test(p.polname)).every((p) => p.polpermissive === false)
    && pol.filter((p) => !/tenant/.test(p.polname)).every((p) => p.polpermissive === true), pol);
  check("a PUBLIC permissive read policy still exists, which is why RESTRICTIVE was required",
    (await q(`select count(*)::int as n from pg_policy where polrelid='public.branch_menu_items'::regclass
      and polname='branch_items_public_read_dev' and polpermissive`))[0].n === 1);

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
    has_table_privilege('authenticated','${VIS_AUDIT}','SELECT') audit_client,
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
      ('restaurant_owner_preview_branch_menu_item_visibility_v1',
       'restaurant_owner_set_branch_menu_item_visibility_v1') order by 1`);
  check("both RPCs are SECURITY DEFINER, owned by the new writer, with pinned config; preview is STABLE",
    meta.length === 2 && meta.every((m) => m.owner === VIS_ROLE && m.prosecdef
      && /search_path=/.test(m.config) && /row_security=on/.test(m.config))
    && meta[0].provolatile === "s" && meta[1].provolatile === "v", meta);
  check("neither RPC accepts a caller-supplied actor argument",
    (await q(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'restaurant_owner_%branch_menu_item_visibility%'
        and pg_get_function_arguments(p.oid) ~* '(actor|auth_user|user_id|membership|owner_id)'`))[0].n === 0);
  const auditAcl = (await q(`select has_table_privilege($1,'${VIS_AUDIT}','SELECT') s,
    has_table_privilege($1,'${VIS_AUDIT}','INSERT') i, has_table_privilege($1,'${VIS_AUDIT}','UPDATE') u,
    has_table_privilege($1,'${VIS_AUDIT}','DELETE') d,
    (select relforcerowsecurity from pg_class where oid='${VIS_AUDIT}'::regclass) forced`, [VIS_ROLE]))[0];
  check("the audit relation is append-only for its writer under FORCE row level security",
    auditAcl.s && auditAcl.i && !auditAcl.u && !auditAcl.d && auditAcl.forced, auditAcl);
  check("no UPDATE or DELETE policy exists on the audit relation for any role",
    (await q(`select count(*)::int as n from pg_policy
      where polrelid='${VIS_AUDIT}'::regclass and polcmd in ('w','d')`))[0].n === 0);

  // ------------------------------------------------- fixtures
  // d2-rest-a / d2-branch-a / d2-item-a: ALL other predicates satisfied, for the positive proof.
  // d2-rest-b / d2-branch-b: draft/foreign tenant fixture.
  // Discontinued fixtures and each individual negative-gate fixture are built per-scenario below.
  await q(`insert into auth.users(id,email) values ($1,'a@t.invalid'),($2,'b@t.invalid'),($3,'m@t.invalid'),($4,'s@t.invalid'),($5,'x@t.invalid')`,
    [OWNER_A, OWNER_B, MANAGER, STAFF, STRANGER]);
  await q(`insert into public.restaurants(id,name,status) values
    ('d2-rest-a','A','active'),('d2-rest-b','B','active'),('d2-rest-draft','Draft','draft')`);
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status) values
    ('d2-branch-a','d2-rest-a','A branch','active'),
    ('d2-branch-b','d2-rest-b','B branch','active'),
    ('d2-branch-inactive','d2-rest-a','Inactive branch','inactive')`);
  await q(`insert into public.menus(id,restaurant_id,name,status) values
    ('d2-menu-a','d2-rest-a','A menu','published'),('d2-menu-b','d2-rest-b','B menu','published'),
    ('d2-menu-draft','d2-rest-a','Draft menu','draft')`);
  await q(`insert into public.menu_categories(id,menu_id,name) values
    ('d2-cat-a','d2-menu-a','A'),('d2-cat-b','d2-menu-b','B'),('d2-cat-draft','d2-menu-draft','Draft')`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values
    ('d2-item-a','d2-rest-a','d2-cat-a','A item','active'),
    ('d2-item-b','d2-rest-b','d2-cat-b','B item','active'),
    ('d2-item-inactive','d2-rest-a','d2-cat-a','Inactive item','draft')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('d2-bmi-a','d2-rest-a','d2-branch-a','d2-item-a',10,'available','available'),
           ('d2-bmi-b','d2-rest-b','d2-branch-b','d2-item-b',20,'available','available')`);
  const users = await q(`insert into public.restaurant_users(auth_user_id,login_status) values
    ($1,'enabled'),($2,'enabled'),($3,'enabled'),($4,'enabled') returning id, auth_user_id`,
    [OWNER_A, OWNER_B, MANAGER, STAFF]);
  const uid = (a) => users.find((u) => u.auth_user_id === a).id;
  const roleId = async (k) => (await q(`select id from public.restaurant_roles where role_key=$1`, [k]))[0].id;
  await q(`insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values
    ($1,'d2-rest-a',$5,'active'),($2,'d2-rest-b',$5,'active'),($3,'d2-rest-a',$6,'active'),($4,'d2-rest-a',$7,'active')`,
    [uid(OWNER_A), uid(OWNER_B), uid(MANAGER), uid(STAFF), await roleId("owner"), await roleId("manager"), await roleId("staff")]);
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
  const preview = (a, args) => asClient(a, `select public.restaurant_owner_preview_branch_menu_item_visibility_v1($1,$2,$3) as out`, args);
  const setVis = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_visibility_v1($1,$2,$3,$4::bigint) as out`, args);
  const setSold = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_sold_out_v1($1,$2,$3,$4::bigint) as out`, args);
  const setAv = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_availability_v1($1,$2,$3,$4::bigint) as out`, args);
  const setPrice = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_price_v1($1,$2,$3,$4::bigint) as out`, args);
  const row = async (id) => (await q(`select branch_specific_status, branch_specific_status_version,
    sold_out, sold_out_version, availability, availability_version, price
    from public.branch_menu_items where id=$1`, [id]))[0];
  const visAudit = async () => (await q(`select count(*)::int as n from ${VIS_AUDIT}`))[0].n;
  const inCatalogue = async (id) => (await q(
    `select count(*)::int as n from public.consumer_public_restaurant_catalog_v1 where branch_menu_item_id=$1`,
    [id]))[0].n > 0;

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
  const ownSeen = await asWriterRole(VIS_ROLE, OWNER_A, `select id from public.branch_menu_items where id='d2-bmi-a'`);
  const foreignSeen = await asWriterRole(VIS_ROLE, OWNER_B, `select id from public.branch_menu_items where id='d2-bmi-a'`);
  check("RESTRICTIVE tenant policy REALLY narrows: the writer sees its own row and not a foreign one",
    ownSeen.length === 1 && foreignSeen.length === 0, { ownSeen, foreignSeen });
  const forcedWrite = await asWriterRole(VIS_ROLE, OWNER_B,
    `update public.branch_menu_items set branch_specific_status = 'hidden' where id='d2-bmi-a' returning id`);
  check("RESTRICTIVE tenant policy blocks a direct cross-tenant UPDATE by the sealed role itself",
    forcedWrite.length === 0 || forcedWrite[0].thrown !== undefined, forcedWrite);

  // ------------------------------------------------- preview: authorised, denied, cross-tenant
  const ok = await preview(OWNER_A, ["d2-rest-a", "d2-branch-a", "d2-bmi-a"]);
  check("an authorised owner previews the exact status and version",
    ok.ok === true && ok.state === "ready" && ok.branchSpecificStatus === "available"
    && ok.branchSpecificStatusVersion === "0", ok);
  check("the version is TEXT, never a JSON number", typeof ok.branchSpecificStatusVersion === "string");
  check("the preview projects exactly the approved fields",
    JSON.stringify(Object.keys(ok).sort()) === JSON.stringify(
      ["branchId", "branchMenuItemId", "branchSpecificStatus", "branchSpecificStatusVersion",
       "menuItemId", "ok", "state"].sort()), Object.keys(ok));
  check("an unauthenticated preview is refused",
    (await preview(null, ["d2-rest-a", "d2-branch-a", "d2-bmi-a"])).errorCode === "unauthenticated");
  check("a non-member preview is permission_denied",
    (await preview(STRANGER, ["d2-rest-a", "d2-branch-a", "d2-bmi-a"])).errorCode === "permission_denied");
  check("a manager preview is permission_denied",
    (await preview(MANAGER, ["d2-rest-a", "d2-branch-a", "d2-bmi-a"])).errorCode === "permission_denied");
  check("a staff preview is permission_denied",
    (await preview(STAFF, ["d2-rest-a", "d2-branch-a", "d2-bmi-a"])).errorCode === "permission_denied");
  const xCross = await preview(OWNER_B, ["d2-rest-a", "d2-branch-a", "d2-bmi-a"]);
  const xGhost = await preview(OWNER_B, ["d2-rest-b", "d2-branch-b", "d2-bmi-none"]);
  check("cross-tenant and nonexistent previews are byte-identical target_not_found",
    xCross.errorCode === "target_not_found" && JSON.stringify(xCross) === JSON.stringify(xGhost), { xCross, xGhost });
  check("a malformed preview is invalid_request",
    (await preview(OWNER_A, ["d2-rest-a", "", "d2-bmi-a"])).errorCode === "invalid_request");

  // ------------------------------------------------- discontinued preview and mutation refusal
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('d2-item-disc','d2-rest-a','d2-cat-a','Discontinued item','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('d2-bmi-disc','d2-rest-a','d2-branch-a','d2-item-disc',10,'available','discontinued')`);
  const discPreview = await preview(OWNER_A, ["d2-rest-a", "d2-branch-a", "d2-bmi-disc"]);
  check("preview may truthfully report a discontinued row",
    discPreview.ok === true && discPreview.branchSpecificStatus === "discontinued", discPreview);

  const discToAvailable = await setVis(OWNER_A, ["d2-bmi-disc", "discontinued", "available", "0"]);
  check("discontinued -> available is refused as invalid_transition, not applied",
    discToAvailable.errorCode === "invalid_transition", discToAvailable);
  const discToHidden = await setVis(OWNER_A, ["d2-bmi-disc", "discontinued", "hidden", "0"]);
  check("discontinued -> hidden is refused as invalid_transition, not applied",
    discToHidden.errorCode === "invalid_transition", discToHidden);
  const availToDisc = await setVis(OWNER_A, ["d2-bmi-a", "available", "discontinued", "0"]);
  check("available -> discontinued is refused as invalid_request (discontinued is out of next's vocabulary)",
    availToDisc.errorCode === "invalid_request", availToDisc);
  await q(`update public.branch_menu_items set branch_specific_status='hidden' where id='d2-bmi-a'`);
  const hiddenToDisc = await setVis(OWNER_A, ["d2-bmi-a", "hidden", "discontinued", "1"]);
  check("hidden -> discontinued is refused as invalid_request",
    hiddenToDisc.errorCode === "invalid_request", hiddenToDisc);
  await q(`update public.branch_menu_items set branch_specific_status='available' where id='d2-bmi-a'`);
  check("no discontinued-touching attempt wrote a visibility audit row", await visAudit() === 0);
  const discRowUnchanged = await row("d2-bmi-disc");
  check("the discontinued row itself was never mutated by any of those attempts",
    discRowUnchanged.branch_specific_status === "discontinued"
    && discRowUnchanged.branch_specific_status_version === "0", discRowUnchanged);

  // ------------------------------------------------- discontinued compatibility: predecessors still work
  const discBefore = await row("d2-bmi-disc");
  const discSold = await setSold(OWNER_A, ["d2-bmi-disc", false, true, "0"]);
  check("LEGACY COMPAT: RA-2A's sold-out mutation still succeeds on a discontinued row",
    discSold.ok === true, discSold);
  const discAfterSold = await row("d2-bmi-disc");
  check("the sold-out write preserved branch_specific_status and its version byte-identically",
    discAfterSold.branch_specific_status === "discontinued"
    && discAfterSold.branch_specific_status_version === "0", discAfterSold);
  const discAv = await setAv(OWNER_A, ["d2-bmi-disc", "available", "limited", "0"]);
  check("LEGACY COMPAT: RA-2B's availability mutation still succeeds on a discontinued row",
    discAv.ok === true, discAv);
  const discPrice = await setPrice(OWNER_A, ["d2-bmi-disc", "10.00", "20", "0"]);
  check("LEGACY COMPAT: RA-2C's price mutation still succeeds on a discontinued row",
    discPrice.ok === true, discPrice);
  const discFinal = await row("d2-bmi-disc");
  check("the discontinued row's visibility status and version are untouched by all three predecessor writes",
    discFinal.branch_specific_status === "discontinued"
    && discFinal.branch_specific_status_version === "0", { discBefore, discFinal });

  // ------------------------------------------------- mutation: applied, stale, no-change, ABA
  // d2-bmi-a already passed through direct-SQL status flips during the discontinued rehearsal above
  // (each of which fires the same table-wide version trigger a real caller would), so its starting
  // version here is whatever that rehearsal left it at -- read it, never assume it is zero.
  const auditBaseline = await visAudit();
  const beforeMutation = await row("d2-bmi-a");
  const v0 = beforeMutation.branch_specific_status_version;
  const v1 = String(Number(v0) + 1);
  const v2 = String(Number(v0) + 2);
  const m1 = await setVis(OWNER_A, ["d2-bmi-a", "available", "hidden", v0]);
  const r1 = await row("d2-bmi-a");
  check("the owner applies available -> hidden and the version advances exactly once",
    m1.ok === true && m1.state === "applied" && m1.branchSpecificStatus === "hidden"
    && m1.branchSpecificStatusVersion === v1
    && r1.branch_specific_status === "hidden" && r1.branch_specific_status_version === v1,
    { m1, r1, v0, v1 });
  check("INDEPENDENCE: the visibility write left sold_out, availability and price byte-identical",
    r1.sold_out === beforeMutation.sold_out && r1.sold_out_version === beforeMutation.sold_out_version
    && r1.availability === beforeMutation.availability
    && r1.availability_version === beforeMutation.availability_version
    && r1.price === beforeMutation.price, { beforeMutation, r1 });
  check("exactly one new visibility audit row with server-derived actor and membership",
    await visAudit() === auditBaseline + 1
    && (await q(`select actor_auth_user_id, restaurant_id, branch_id, branch_menu_item_id, menu_item_id,
        previous_status, next_status, previous_version, next_version
      from ${VIS_AUDIT} order by created_at desc limit 1`))[0].actor_auth_user_id === OWNER_A);
  check("cross-tenant mutation is target_not_found",
    (await setVis(OWNER_B, ["d2-bmi-a", "hidden", "available", v1])).errorCode === "target_not_found");
  check("a manager mutation is permission_denied",
    (await setVis(MANAGER, ["d2-bmi-a", "hidden", "available", v1])).errorCode === "permission_denied");
  check("a staff mutation is permission_denied",
    (await setVis(STAFF, ["d2-bmi-a", "hidden", "available", v1])).errorCode === "permission_denied");
  check("replaying a superseded version is stale",
    (await setVis(OWNER_A, ["d2-bmi-a", "available", "hidden", v0])).errorCode === "stale_state");
  check("a mismatched expected status at the right version is stale",
    (await setVis(OWNER_A, ["d2-bmi-a", "available", "available", v1])).errorCode === "stale_state");
  check("requesting the status that already holds is no_change",
    (await setVis(OWNER_A, ["d2-bmi-a", "hidden", "hidden", v1])).errorCode === "no_change");
  check("refusals wrote no further audit row", await visAudit() === auditBaseline + 1);
  const m2 = await setVis(OWNER_A, ["d2-bmi-a", "hidden", "available", v1]);
  const r2 = await row("d2-bmi-a");
  check("recovery hidden -> available advances the version again",
    m2.ok === true && m2.branchSpecificStatusVersion === v2 && r2.branch_specific_status === "available"
    && r2.branch_specific_status_version === v2, { m2, r2 });
  check("the recovery is audited as a second applied transition", await visAudit() === auditBaseline + 2);
  check("ABA: the row's original available precondition is stale even though the status is available again",
    (await setVis(OWNER_A, ["d2-bmi-a", "available", "hidden", v0])).errorCode === "stale_state");

  // ------------------------------------------------- reverse independence
  const visBefore = await row("d2-bmi-a");
  const s1 = await setSold(OWNER_A, ["d2-bmi-a", false, true, "0"]);
  const r3 = await row("d2-bmi-a");
  check("the frozen sold-out operation still applies unchanged",
    s1.ok === true && r3.sold_out === true, { s1, r3 });
  check("INDEPENDENCE: the sold-out write left branch_specific_status and its version byte-identical",
    r3.branch_specific_status === visBefore.branch_specific_status
    && r3.branch_specific_status_version === visBefore.branch_specific_status_version, { visBefore, r3 });
  check("INDEPENDENCE: the sold-out write wrote no visibility audit row", await visAudit() === auditBaseline + 2);
  const a1 = await setAv(OWNER_A, ["d2-bmi-a", "available", "limited", "0"]);
  const r4 = await row("d2-bmi-a");
  check("the frozen availability operation still applies unchanged", a1.ok === true, a1);
  check("INDEPENDENCE: the availability write left branch_specific_status and its version byte-identical",
    r4.branch_specific_status === visBefore.branch_specific_status
    && r4.branch_specific_status_version === visBefore.branch_specific_status_version, { visBefore, r4 });
  const p1 = await setPrice(OWNER_A, ["d2-bmi-a", "10.00", "20", "0"]);
  const r5 = await row("d2-bmi-a");
  check("the frozen price operation still applies unchanged", p1.ok === true, p1);
  check("INDEPENDENCE: the price write left branch_specific_status and its version byte-identical",
    r5.branch_specific_status === visBefore.branch_specific_status
    && r5.branch_specific_status_version === visBefore.branch_specific_status_version, { visBefore, r5 });
  check("INDEPENDENCE: none of the three predecessor writes wrote a visibility audit row", await visAudit() === auditBaseline + 2);

  // ------------------------------------------------- version tamper resistance
  const forced = await q(`update public.branch_menu_items set branch_specific_status_version = 99
    where id='d2-bmi-a' returning branch_specific_status_version`);
  check("a direct attempt to set the version is discarded by the trigger",
    forced[0].branch_specific_status_version === v2, { forced, expected: v2 });
  const unrelated = await q(`update public.branch_menu_items set price = 15 where id='d2-bmi-a'
    returning branch_specific_status_version`);
  check("an unrelated column write advances no visibility version",
    unrelated[0].branch_specific_status_version === v2, { unrelated, expected: v2 });

  // ------------------------------------------------- audit atomicity
  await q(`create function restaurant_internal.d2_fail() returns trigger language plpgsql as $f$
    begin raise exception 'injected audit failure'; end $f$;
    create trigger d2_fail before insert on ${VIS_AUDIT} for each row execute function restaurant_internal.d2_fail();`);
  const beforeAtomic = await row("d2-bmi-a");
  const atomicCount = await visAudit();
  const atomic = await setVis(OWNER_A,
    ["d2-bmi-a", beforeAtomic.branch_specific_status, "hidden", beforeAtomic.branch_specific_status_version]);
  const afterAtomic = await row("d2-bmi-a");
  check("a failing audit insert rolls the visibility change back",
    atomic.thrown !== undefined && JSON.stringify(afterAtomic) === JSON.stringify(beforeAtomic),
    { atomic, beforeAtomic, afterAtomic });
  check("the failed attempt left the audit relation unchanged", await visAudit() === atomicCount);
  await q(`drop trigger d2_fail on ${VIS_AUDIT}; drop function restaurant_internal.d2_fail();`);

  // ------------------------------------------------- audit is unwritable by its own writer
  const auditTamper = await asWriterRole(VIS_ROLE, OWNER_A,
    `update ${VIS_AUDIT} set next_status = 'available' where true returning id`);
  check("the sealed writer cannot rewrite its own audit history",
    auditTamper.length === 1 && auditTamper[0].thrown !== undefined, auditTamper);
  const auditDelete = await asWriterRole(VIS_ROLE, OWNER_A, `delete from ${VIS_AUDIT} where true returning id`);
  check("the sealed writer cannot delete its own audit history",
    auditDelete.length === 1 && auditDelete[0].thrown !== undefined, auditDelete);

  // =================================================================================================
  // PUBLICATION SAFETY -- the core proof of this round.
  // =================================================================================================
  // Force d2-bmi-a to a known clean baseline (hidden, available availability, not sold out),
  // whatever version that direct write lands on, and read it back rather than assuming a literal.
  await q(`update public.branch_menu_items
    set branch_specific_status='hidden', availability='available', sold_out=false
    where id='d2-bmi-a'`);
  const publicationBase = await row("d2-bmi-a");
  check("SETUP: the positive fixture is hidden, all other predicates satisfied, before the restore proof",
    !(await inCatalogue("d2-bmi-a")) && publicationBase.branch_specific_status === "hidden",
    { hint: "hidden alone already excludes it", publicationBase });

  const restoreOk = await setVis(OWNER_A,
    ["d2-bmi-a", "hidden", "available", publicationBase.branch_specific_status_version]);
  check("POSITIVE PROOF: hidden -> available succeeds when every other gate is satisfied",
    restoreOk.ok === true, restoreOk);
  check("POSITIVE PROOF: restoring naturally republishes the offering (no new publication SQL was written)",
    await inCatalogue("d2-bmi-a"), { row: await row("d2-bmi-a") });

  const afterRestore = await row("d2-bmi-a");
  const hideOk = await setVis(OWNER_A,
    ["d2-bmi-a", "available", "hidden", afterRestore.branch_specific_status_version]);
  check("hiding a published offering succeeds", hideOk.ok === true, hideOk);
  check("hiding naturally excludes the offering from the public catalogue",
    !(await inCatalogue("d2-bmi-a")), { row: await row("d2-bmi-a") });

  // ---- negative gates: hidden -> available must NEVER create catalogue eligibility when a parent
  // gate is blocking, proving Owner restore cannot override Admin/parent authority.
  const negativeCase = async (label, setup, id, restaurantId, branchId, menuItemId) => {
    await setup();
    const before = await row(id);
    const result = await setVis(OWNER_A, [id, before.branch_specific_status, "available",
      before.branch_specific_status_version]);
    const eligible = await inCatalogue(id);
    check(`PUBLICATION SAFETY: ${label} -- restore does not create catalogue eligibility`,
      !eligible, { result, restaurantId, branchId, menuItemId, eligible });
  };

  await q(`insert into public.menus(id,restaurant_id,name,status)
    values ('d2-menu-draftparent','d2-rest-draft','x','published')`);
  await q(`insert into public.menu_categories(id,menu_id,name)
    values ('d2-cat-draftparent','d2-menu-draftparent','x')`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('d2-item-draftparent','d2-rest-draft','d2-cat-draftparent','x','active')`);
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status)
    values ('d2-branch-draftparent','d2-rest-draft','x','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('d2-bmi-draftparent','d2-rest-draft','d2-branch-draftparent','d2-item-draftparent',10,'available','hidden')`);
  await q(`insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status)
    values ($1,'d2-rest-draft',$2,'active')`, [uid(OWNER_A), await roleId("owner")]);
  await negativeCase("Restaurant is draft", async () => {}, "d2-bmi-draftparent");

  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('d2-bmi-branchinactive','d2-rest-a','d2-branch-inactive','d2-item-a',10,'available','hidden')`);
  await negativeCase("Branch is inactive", async () => {}, "d2-bmi-branchinactive");

  // A menu item belonging to the DRAFT menu's own category -- (branch_id, menu_item_id) must stay
  // globally unique, so this cannot reuse d2-item-a, which is already paired with d2-branch-a.
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('d2-item-menudraft','d2-rest-a','d2-cat-draft','x','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('d2-bmi-menudraft','d2-rest-a','d2-branch-a','d2-item-menudraft',10,'available','hidden')`);
  await negativeCase("Menu is unpublished", async () => {}, "d2-bmi-menudraft");

  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('d2-bmi-itemInactive','d2-rest-a','d2-branch-a','d2-item-inactive',10,'available','hidden')`);
  await negativeCase("Menu item is inactive", async () => {}, "d2-bmi-itemInactive");

  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('d2-item-unavail','d2-rest-a','d2-cat-a','x','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('d2-bmi-unavail','d2-rest-a','d2-branch-a','d2-item-unavail',10,'unavailable','hidden')`);
  await negativeCase("availability is unavailable", async () => {}, "d2-bmi-unavail");

  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('d2-item-soldout','d2-rest-a','d2-cat-a','x','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,sold_out,branch_specific_status)
    values ('d2-bmi-soldout','d2-rest-a','d2-branch-a','d2-item-soldout',10,'available',true,'hidden')`);
  await negativeCase("sold_out is true", async () => {}, "d2-bmi-soldout");

  check("every negative-gate restore still advanced the visibility version (Owner authority itself succeeded)",
    (await row("d2-bmi-draftparent")).branch_specific_status === "available"
    && (await row("d2-bmi-branchinactive")).branch_specific_status === "available"
    && (await row("d2-bmi-menudraft")).branch_specific_status === "available"
    && (await row("d2-bmi-itemInactive")).branch_specific_status === "available"
    && (await row("d2-bmi-unavail")).branch_specific_status === "available"
    && (await row("d2-bmi-soldout")).branch_specific_status === "available",
    "Owner's OWN authority (branch_specific_status) is fully exercised; only PUBLICATION remains blocked by the parent gate, proving this is a real ceiling and not a broken RPC");

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
