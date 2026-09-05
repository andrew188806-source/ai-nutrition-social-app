#!/usr/bin/env node
// RA-2B-P1 REAL PostgreSQL 17.6 non-superuser apply and authority gate.
//
// Static SQL checks cannot prove a migration compiles, and a SUPERUSER apply cannot prove it
// deploys: SR-2K-B passed 23/23 on a superuser cluster and was then refused by Development, because
// ownership checks, role-membership options and RLS all behave differently for a superuser. This
// harness therefore applies the EXACT frozen predecessor schema and then the EXACT RA-2B-P1 migration
// to a disposable real cluster THROUGH A NON-SUPERUSER RUNNER, through COMMIT, and exercises the
// resulting authority with real queries.
//
// It is opt-in because it needs PostgreSQL binaries that are not part of this repository:
//   RA2BP1_PG_BIN      directory containing initdb/postgres executables (PostgreSQL 17.x)
//   RA2BP1_PG_MODULES  directory containing a node_modules with the `pg` client
// Provision both with `npm install embedded-postgres@17.6.0-beta.15` into a scratch directory; that
// build matches Development's PostgreSQL 17.6 exactly. Without them the harness reports `skipped`
// rather than pretending to have proven anything.
//
// LIFECYCLE. `process.kill` on Windows leaves the postmaster's backends alive holding the data
// directory and any inherited handle, which is how a FINISHED proof can sit "Running" forever. The
// whole process tree is killed, teardown is registered on every exit path rather than only in a
// `finally`, strays from a previous run are reaped on start-up, and a watchdog fails closed.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "restaurant-owner-availability-ra-2b-p1-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260904040000_restaurant_owner_branch_menu_item_sold_out_preview.sql";
const CANDIDATE = "20260905010000_restaurant_owner_branch_menu_item_availability_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;

const PG_BIN = process.env.RA2BP1_PG_BIN?.trim();
const PG_MODULES = process.env.RA2BP1_PG_MODULES?.trim();
if (!PG_BIN || !PG_MODULES || !fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb"))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RA2BP1_PG_BIN and RA2BP1_PG_MODULES to a PostgreSQL 17.x binary directory and a node_modules containing `pg`"
  }, null, 2));
  process.exit(0);
}
const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");

// --- Supabase platform surface the repository's migrations assume but never create ---------------
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
  -- THE MIGRATION RUNNER IS NOT A SUPERUSER. On a real Supabase project the cluster superuser is
  -- \`supabase_admin\` and migrations run as \`postgres\`, which is merely privileged. A superuser
  -- bypasses every ownership check, every role-membership option and RLS, so applying migrations as
  -- one proves far less than it appears to.
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

// --- disposable cluster ---------------------------------------------------------------------------
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
    if (entry.isDirectory() && entry.name.startsWith("ra2bp1-data-")) {
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
  const dataDir = path.join(workDir, `ra2bp1-data-${process.pid}-${Date.now()}`);
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

  // An open port is not readiness: the postmaster answers 57P03 while still starting up.
  const deadline = Date.now() + 90_000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    const probe = new Client({ host: "127.0.0.1", port, user: "supabase_admin", database: "postgres" });
    try { await probe.connect(); await probe.query("select 1"); ready = true; } catch { /* starting */ }
    try { await probe.end(); } catch { /* never connected */ }
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) { cluster.stop(); throw new Error(`postgres did not become ready\n${fs.readFileSync(logFile, "utf8").slice(-1500)}`); }
  return cluster;
}


// --- assertions ------------------------------------------------------------------------------------
const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
};

const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ra2bp1-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
reapStrays(workDir);
const watchdog = setTimeout(() => {
  console.error("watchdog: harness exceeded its budget; failing closed");
  for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } }
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref?.();

const AV_ROLE = "restaurant_owner_branch_menu_item_availability_write_authority";
const SO_ROLE = "restaurant_owner_branch_menu_item_write_authority";
const AV_PREVIEW = "public.restaurant_owner_preview_branch_menu_item_availability_v1(text,text,text)";
const AV_MUTATE = "public.restaurant_owner_set_branch_menu_item_availability_v1(text,text,text,bigint)";
const AV_AUDIT = "restaurant_internal.branch_menu_item_availability_audit_log";
const SO_AUDIT = "restaurant_internal.branch_menu_item_sold_out_audit_log";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const MANAGER = "33333333-3333-4333-8333-333333333333";
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
  check("all frozen predecessors and RA-2B-P1 apply through COMMIT", applied === files.length,
    { applied, total: files.length });
  check("the round contributes exactly one successor migration",
    candidates.length === 1 && candidates[0] === CANDIDATE, candidates);

  // ------------------------------------------------- permission seed without BYPASSRLS
  const perms = await q(`select role.role_key, permission.permission_key, permission.permission_scope
    from public.role_permissions permission join public.restaurant_roles role on role.id=permission.role_id
    where permission.permission_key like 'branch_menu_item.%' order by 2,1`);
  check("the FORCE-RLS seed landed exactly one owner/restaurant availability permission",
    perms.filter((p) => p.permission_key === "branch_menu_item.availability.write").length === 1
    && perms.find((p) => p.permission_key === "branch_menu_item.availability.write").role_key === "owner"
    && perms.find((p) => p.permission_key === "branch_menu_item.availability.write").permission_scope === "restaurant",
    perms);
  check("RA-2A's sold-out permission row is preserved untouched",
    perms.filter((p) => p.permission_key === "branch_menu_item.sold_out.write").length === 1
    && perms.find((p) => p.permission_key === "branch_menu_item.sold_out.write").role_key === "owner", perms);
  check("manager and staff hold neither write permission",
    perms.every((p) => p.role_key === "owner"), perms);
  check("FORCE row level security was restored on both seeded tables",
    (await q(`select count(*)::int as n from pg_class c join pg_namespace s on s.oid=c.relnamespace
      where s.nspname='public' and c.relname in ('role_permissions','restaurant_roles')
        and c.relforcerowsecurity`))[0].n === 2);

  // ------------------------------------------------- version token
  const col = (await q(`select data_type, is_nullable, column_default from information_schema.columns
    where table_schema='public' and table_name='branch_menu_items' and column_name='availability_version'`))[0];
  check("availability_version is bigint not null default 0",
    col && col.data_type === "bigint" && col.is_nullable === "NO" && col.column_default === "0", col);
  check("both version triggers coexist on the table",
    (await q(`select count(*)::int as n from pg_trigger where tgrelid='public.branch_menu_items'::regclass
      and not tgisinternal and tgname in ('branch_menu_items_availability_version_maintain',
        'branch_menu_items_sold_out_version_maintain')`))[0].n === 2);

  // ------------------------------------------------- sealed role
  const role = (await q(`select rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreatedb,rolcreaterole,rolreplication
    from pg_roles where rolname=$1`, [AV_ROLE]))[0];
  check("the new availability writer exists and is sealed in every attribute",
    role && !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls && !role.rolsuper
    && !role.rolcreatedb && !role.rolcreaterole && !role.rolreplication, role);
  check("the round created exactly one new role",
    (await q(`select count(*)::int as n from pg_roles`))[0].n === rolesBefore + 1,
    { before: rolesBefore, after: (await q(`select count(*)::int as n from pg_roles`))[0].n });
  check("no client or runtime role is a member of the availability writer",
    (await q(`select count(*)::int as n from pg_auth_members a join pg_roles r on r.oid=a.roleid
      join pg_roles g on g.oid=a.member where r.rolname=$1
        and g.rolname in ('anon','authenticated','authenticator','service_role')`, [AV_ROLE]))[0].n === 0);
  check("the migration released its own transient sealed-role membership",
    (await q(`select count(*)::int as n from pg_auth_members a join pg_roles r on r.oid=a.roleid
      join pg_roles g on g.oid=a.member
      where r.rolname=$1 and g.rolname='postgres'
        and a.grantor=(select oid from pg_roles where rolname='postgres')`, [AV_ROLE]))[0].n === 0);

  // ------------------------------------------------- column authority independence (both ways)
  const cp = async (r, c, p) => (await q(
    `select has_column_privilege($1,'public.branch_menu_items',$2,$3) as v`, [r, c, p]))[0].v;
  const avMatrix = {
    availability: await cp(AV_ROLE, "availability", "UPDATE"),
    availability_version: await cp(AV_ROLE, "availability_version", "UPDATE"),
    sold_out: await cp(AV_ROLE, "sold_out", "UPDATE"),
    sold_out_version: await cp(AV_ROLE, "sold_out_version", "UPDATE"),
    price: await cp(AV_ROLE, "price", "UPDATE"),
    branch_specific_status: await cp(AV_ROLE, "branch_specific_status", "UPDATE"),
    restaurant_id: await cp(AV_ROLE, "restaurant_id", "UPDATE")
  };
  check("the availability writer may write availability and nothing else",
    avMatrix.availability && !avMatrix.availability_version && !avMatrix.sold_out
    && !avMatrix.sold_out_version && !avMatrix.price && !avMatrix.branch_specific_status
    && !avMatrix.restaurant_id, avMatrix);
  const soMatrix = {
    sold_out: await cp(SO_ROLE, "sold_out", "UPDATE"),
    availability: await cp(SO_ROLE, "availability", "UPDATE"),
    availability_version: await cp(SO_ROLE, "availability_version", "UPDATE")
  };
  check("the frozen sold-out writer was NOT widened to availability",
    soMatrix.sold_out && !soMatrix.availability && !soMatrix.availability_version, soMatrix);
  check("neither writer holds broad table UPDATE",
    (await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') a,
      has_table_privilege($2,'public.branch_menu_items','UPDATE') b`, [AV_ROLE, SO_ROLE]))[0].a === false
    && (await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') b`, [SO_ROLE]))[0].b === false);

  // ------------------------------------------------- RESTRICTIVE policy: catalogue AND behaviour
  const pol = await q(`select polname, polcmd, polpermissive from pg_policy
    where polrelid='public.branch_menu_items'::regclass and polname like '%owner_availability%' order by 1`);
  check("the two tenant policies are RESTRICTIVE and the two visibility policies are permissive",
    pol.length === 4
    && pol.filter((p) => /tenant/.test(p.polname)).every((p) => p.polpermissive === false)
    && pol.filter((p) => !/tenant/.test(p.polname)).every((p) => p.polpermissive === true), pol);
  check("a PUBLIC permissive read policy still exists, which is why RESTRICTIVE was required",
    (await q(`select count(*)::int as n from pg_policy where polrelid='public.branch_menu_items'::regclass
      and polname='branch_items_public_read_dev' and polpermissive`))[0].n === 1);

  // ------------------------------------------------- ACL
  const acl = (await q(`select
    has_function_privilege('authenticated','${AV_PREVIEW}','EXECUTE') p_authed,
    has_function_privilege('anon','${AV_PREVIEW}','EXECUTE') p_anon,
    has_function_privilege('service_role','${AV_PREVIEW}','EXECUTE') p_service,
    has_function_privilege('authenticator','${AV_PREVIEW}','EXECUTE') p_authr,
    has_function_privilege('authenticated','${AV_MUTATE}','EXECUTE') m_authed,
    has_function_privilege('anon','${AV_MUTATE}','EXECUTE') m_anon,
    has_function_privilege('service_role','${AV_MUTATE}','EXECUTE') m_service,
    has_function_privilege('authenticator','${AV_MUTATE}','EXECUTE') m_authr,
    has_table_privilege('authenticated','${AV_AUDIT}','SELECT') audit_client,
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
      ('restaurant_owner_preview_branch_menu_item_availability_v1',
       'restaurant_owner_set_branch_menu_item_availability_v1') order by 1`);
  check("both RPCs are SECURITY DEFINER, owned by the new writer, with pinned config; preview is STABLE",
    meta.length === 2 && meta.every((m) => m.owner === AV_ROLE && m.prosecdef
      && /search_path=/.test(m.config) && /row_security=on/.test(m.config))
    && meta[0].provolatile === "s" && meta[1].provolatile === "v", meta);
  const auditAcl = (await q(`select has_table_privilege($1,'${AV_AUDIT}','SELECT') s,
    has_table_privilege($1,'${AV_AUDIT}','INSERT') i, has_table_privilege($1,'${AV_AUDIT}','UPDATE') u,
    has_table_privilege($1,'${AV_AUDIT}','DELETE') d,
    (select relforcerowsecurity from pg_class where oid='${AV_AUDIT}'::regclass) forced`, [AV_ROLE]))[0];
  check("the audit relation is append-only for its writer under FORCE row level security",
    auditAcl.s && auditAcl.i && !auditAcl.u && !auditAcl.d && auditAcl.forced, auditAcl);

  // ------------------------------------------------- fixtures
  await q(`insert into auth.users(id,email) values ($1,'a@t.invalid'),($2,'b@t.invalid'),($3,'m@t.invalid'),($4,'s@t.invalid')`,
    [OWNER_A, OWNER_B, MANAGER, STRANGER]);
  await q(`insert into public.restaurants(id,name,status) values ('b1-rest-a','A','active'),('b1-rest-b','B','active')`);
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status) values
    ('b1-branch-a','b1-rest-a','A branch','active'),('b1-branch-b','b1-rest-b','B branch','active')`);
  await q(`insert into public.menus(id,restaurant_id,name,status) values
    ('b1-menu-a','b1-rest-a','A menu','published'),('b1-menu-b','b1-rest-b','B menu','published')`);
  await q(`insert into public.menu_categories(id,menu_id,name) values ('b1-cat-a','b1-menu-a','A'),('b1-cat-b','b1-menu-b','B')`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values
    ('b1-item-a','b1-rest-a','b1-cat-a','A item','active'),('b1-item-b','b1-rest-b','b1-cat-b','B item','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability)
    values ('b1-bmi-a','b1-rest-a','b1-branch-a','b1-item-a',10,'available'),
           ('b1-bmi-b','b1-rest-b','b1-branch-b','b1-item-b',20,'available')`);
  const users = await q(`insert into public.restaurant_users(auth_user_id,login_status) values
    ($1,'enabled'),($2,'enabled'),($3,'enabled') returning id, auth_user_id`, [OWNER_A, OWNER_B, MANAGER]);
  const uid = (a) => users.find((u) => u.auth_user_id === a).id;
  const roleId = async (k) => (await q(`select id from public.restaurant_roles where role_key=$1`, [k]))[0].id;
  await q(`insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values
    ($1,'b1-rest-a',$4,'active'),($2,'b1-rest-b',$4,'active'),($3,'b1-rest-a',$5,'active')`,
    [uid(OWNER_A), uid(OWNER_B), uid(MANAGER), await roleId("owner"), await roleId("manager")]);
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
    } catch (e) { try { await c.query("rollback"); } catch {} return { thrown: e.code + " " + String(e.message).slice(0, 140) }; }
    finally { await c.end(); }
  };
  const preview = (a, args) => asClient(a, `select public.restaurant_owner_preview_branch_menu_item_availability_v1($1,$2,$3) as out`, args);
  const setAv = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_availability_v1($1,$2,$3,$4::bigint) as out`, args);
  const setSold = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_sold_out_v1($1,$2,$3,$4::bigint) as out`, args);
  const row = async (id) => (await q(`select availability, availability_version, sold_out, sold_out_version, price
    from public.branch_menu_items where id=$1`, [id]))[0];
  const avAudit = async () => (await q(`select count(*)::int as n from ${AV_AUDIT}`))[0].n;
  const soAudit = async () => (await q(`select count(*)::int as n from ${SO_AUDIT}`))[0].n;

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
    } catch (e) { try { await c.query("rollback"); } catch {} return [{ thrown: e.code }]; }
    finally { await c.end(); }
  };
  const ownSeen = await asWriterRole(AV_ROLE, OWNER_A, `select id from public.branch_menu_items where id='b1-bmi-a'`);
  const foreignSeen = await asWriterRole(AV_ROLE, OWNER_B, `select id from public.branch_menu_items where id='b1-bmi-a'`);
  check("RESTRICTIVE tenant policy REALLY narrows: the writer sees its own row and not a foreign one",
    ownSeen.length === 1 && foreignSeen.length === 0, { ownSeen, foreignSeen });
  const soForeign = await asWriterRole(SO_ROLE, OWNER_B, `select id from public.branch_menu_items where id='b1-bmi-a'`);
  check("the contrast is real: RA-2A's permissive-only writer still sees the foreign row through the PUBLIC policy "
    + "(its RPC joins the tenant chain, so the operation stays safe)", soForeign.length === 1, soForeign);

  // ------------------------------------------------- preview
  const ok = await preview(OWNER_A, ["b1-rest-a", "b1-branch-a", "b1-bmi-a"]);
  check("an authorised owner previews the exact state and version",
    ok.ok === true && ok.state === "ready" && ok.availability === "available"
    && ok.availabilityVersion === "0" && ok.branchId === "b1-branch-a" && ok.menuItemId === "b1-item-a", ok);
  check("the version is TEXT, never a JSON number", typeof ok.availabilityVersion === "string");
  check("the preview projects exactly the approved fields",
    JSON.stringify(Object.keys(ok).sort()) === JSON.stringify(
      ["availability","availabilityVersion","branchId","branchMenuItemId","menuItemId","ok","state"]), Object.keys(ok));
  check("an unauthenticated preview is refused",
    (await preview(null, ["b1-rest-a","b1-branch-a","b1-bmi-a"])).errorCode === "unauthenticated");
  check("a non-member preview is permission_denied",
    (await preview(STRANGER, ["b1-rest-a","b1-branch-a","b1-bmi-a"])).errorCode === "permission_denied");
  check("a manager preview is permission_denied",
    (await preview(MANAGER, ["b1-rest-a","b1-branch-a","b1-bmi-a"])).errorCode === "permission_denied");
  const xCross = await preview(OWNER_B, ["b1-rest-a","b1-branch-a","b1-bmi-a"]);
  const xGhost = await preview(OWNER_B, ["b1-rest-b","b1-branch-b","b1-bmi-none"]);
  check("cross-tenant and nonexistent previews are byte-identical target_not_found",
    xCross.errorCode === "target_not_found" && JSON.stringify(xCross) === JSON.stringify(xGhost), { xCross, xGhost });
  check("a malformed preview is invalid_request",
    (await preview(OWNER_A, ["b1-rest-a","","b1-bmi-a"])).errorCode === "invalid_request");
  const beforePreviewRow = await row("b1-bmi-a");
  for (let i = 0; i < 3; i += 1) await preview(OWNER_A, ["b1-rest-a","b1-branch-a","b1-bmi-a"]);
  check("repeated preview mutates nothing and audits nothing",
    JSON.stringify(await row("b1-bmi-a")) === JSON.stringify(beforePreviewRow) && (await avAudit()) === 0);

  // ------------------------------------------------- mutation, stale, no-change, ABA
  const soldBefore = await row("b1-bmi-a");
  const m1 = await setAv(OWNER_A, ["b1-bmi-a", "available", "limited", "0"]);
  const r1 = await row("b1-bmi-a");
  check("the owner applies available -> limited and the version advances exactly once",
    m1.ok === true && m1.availability === "limited" && m1.availabilityVersion === "1"
    && r1.availability === "limited" && r1.availability_version === "1", { m1, r1 });
  check("INDEPENDENCE: the availability write left sold_out and sold_out_version byte-identical",
    r1.sold_out === soldBefore.sold_out && r1.sold_out_version === soldBefore.sold_out_version
    && r1.price === soldBefore.price, { soldBefore, r1 });
  check("INDEPENDENCE: the availability write wrote no sold-out audit row", (await soAudit()) === 0);
  check("exactly one availability audit row with server-derived actor and membership",
    (await avAudit()) === 1
    && (await q(`select actor_auth_user_id, restaurant_id, branch_id, branch_menu_item_id,
        previous_availability, next_availability, previous_availability_version, next_availability_version
      from ${AV_AUDIT}`))[0].actor_auth_user_id === OWNER_A);
  check("cross-tenant mutation is target_not_found",
    (await setAv(OWNER_B, ["b1-bmi-a","limited","available","1"])).errorCode === "target_not_found");
  check("a manager mutation is permission_denied",
    (await setAv(MANAGER, ["b1-bmi-a","limited","available","1"])).errorCode === "permission_denied");
  check("replaying the original version is stale",
    (await setAv(OWNER_A, ["b1-bmi-a","available","limited","0"])).errorCode === "stale_state");
  check("a mismatched expected state is stale",
    (await setAv(OWNER_A, ["b1-bmi-a","available","unavailable","1"])).errorCode === "stale_state");
  check("requesting the value that already holds is no_change",
    (await setAv(OWNER_A, ["b1-bmi-a","limited","limited","1"])).errorCode === "no_change");
  check("an out-of-vocabulary value is invalid_request",
    (await setAv(OWNER_A, ["b1-bmi-a","limited","discontinued","1"])).errorCode === "invalid_request");
  check("refusals wrote no further audit row", (await avAudit()) === 1);
  const m2 = await setAv(OWNER_A, ["b1-bmi-a", "limited", "available", "1"]);
  const r2 = await row("b1-bmi-a");
  check("recovery limited -> available advances the version again",
    m2.ok === true && m2.availabilityVersion === "2" && r2.availability === "available"
    && r2.availability_version === "2", { m2, r2 });
  check("the recovery is audited as a second applied transition", (await avAudit()) === 2);
  check("ABA: the original available/0 precondition is stale even though availability is available again",
    (await setAv(OWNER_A, ["b1-bmi-a","available","limited","0"])).errorCode === "stale_state");

  // ------------------------------------------------- reverse independence: sold-out op
  const avBefore = await row("b1-bmi-a");
  const s1 = await setSold(OWNER_A, ["b1-bmi-a", false, true, "0"]);
  const r3 = await row("b1-bmi-a");
  check("the frozen sold-out operation still applies unchanged",
    s1.ok === true && s1.soldOutVersion === "1" && r3.sold_out === true, { s1, r3 });
  check("INDEPENDENCE: the sold-out write left availability and availability_version byte-identical",
    r3.availability === avBefore.availability
    && r3.availability_version === avBefore.availability_version, { avBefore, r3 });
  check("INDEPENDENCE: the sold-out write wrote no availability audit row", (await avAudit()) === 2);
  check("INDEPENDENCE: the sold-out write wrote its own audit row", (await soAudit()) === 1);
  await setSold(OWNER_A, ["b1-bmi-a", true, false, "1"]);

  // ------------------------------------------------- version tamper resistance
  const forced = await q(`update public.branch_menu_items set availability_version = 99 where id='b1-bmi-a'
    returning availability_version`);
  check("a direct attempt to set availability_version is discarded by the trigger",
    forced[0].availability_version === "2", forced);
  const unrelated = await q(`update public.branch_menu_items set price = 11 where id='b1-bmi-a'
    returning availability_version, sold_out_version`);
  check("an unrelated column write advances neither version",
    unrelated[0].availability_version === "2" && unrelated[0].sold_out_version === "2", unrelated);
  await q(`update public.branch_menu_items set price = 10 where id='b1-bmi-a'`);

  // ------------------------------------------------- audit atomicity
  await q(`create function restaurant_internal.b1_fail() returns trigger language plpgsql as $f$
    begin raise exception 'injected audit failure'; end $f$;
    create trigger b1_fail before insert on ${AV_AUDIT} for each row execute function restaurant_internal.b1_fail();`);
  const beforeAtomic = await row("b1-bmi-a");
  const atomic = await setAv(OWNER_A, ["b1-bmi-a", "available", "limited", "2"]);
  const afterAtomic = await row("b1-bmi-a");
  check("a failing audit insert rolls the availability change back",
    atomic.thrown !== undefined && JSON.stringify(afterAtomic) === JSON.stringify(beforeAtomic),
    { atomic, beforeAtomic, afterAtomic });
  check("the failed attempt left the audit relation unchanged", (await avAudit()) === 2);
  await q(`drop trigger b1_fail on ${AV_AUDIT}; drop function restaurant_internal.b1_fail();`);

  // ------------------------------------------------- downstream catalogue semantics (verify, not redesign)
  const catalogFor = async (v) => {
    await q(`update public.branch_menu_items set availability=$1 where id='b1-bmi-a'`, [v]);
    return (await q(`select count(*)::int as n from public.consumer_public_restaurant_catalog_v1
      where branch_menu_item_id='b1-bmi-a'`))[0].n;
  };
  const eligibility = { available: await catalogFor("available"), limited: await catalogFor("limited"),
    unavailable: await catalogFor("unavailable") };
  check("existing catalogue semantics are unchanged: available and limited are eligible, unavailable is not",
    eligibility.available === 1 && eligibility.limited === 1 && eligibility.unavailable === 0, eligibility);
  await q(`update public.branch_menu_items set availability='available' where id='b1-bmi-a'`);

  const final = await row("b1-bmi-a");
  check("the other tenant's row was never touched",
    (await row("b1-bmi-b")).availability === "available"
    && (await row("b1-bmi-b")).availability_version === "0");
  check("the fixture ends coherent", final.availability === "available" && final.sold_out === false, final);
} catch (error) {
  if (failures.length === 0) check("harness executed without an unexpected error", false, String(error.message).slice(0, 400));
} finally {
  try { await runner?.end(); } catch { /* closed */ }
  try { await client?.end(); } catch { /* closed */ }
  try { cluster?.stop(); } catch { /* best effort */ }
  clearTimeout(watchdog);
}

console.log("\n" + JSON.stringify({
  suite: SUITE, status: failures.length === 0 ? "passed" : "failed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name), migrationsApplied: applied, candidates
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
