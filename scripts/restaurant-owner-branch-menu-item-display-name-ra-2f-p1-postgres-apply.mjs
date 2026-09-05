#!/usr/bin/env node
// RA-2F-P1 REAL PostgreSQL 17.6 non-superuser apply and authority gate.
//
// The centre of this round is the SET/CLEAR/NULL contract: branch_specific_name is genuinely
// nullable business state (NULL means "use the canonical menu_items.name"), and this harness proves
// nullable-safe concurrency (IS NOT DISTINCT FROM, never `=`), that whitespace-only/empty `set` input
// is invalid_request rather than being silently reinterpreted as `clear`, that `clear` stores real
// SQL NULL rather than copying the canonical name, and that the public catalogue's existing
// COALESCE(branch_specific_name, menu_items.name) fallback keeps working through a full
// NULL -> override -> NULL cycle with zero new publication SQL.
//
// It also proves canonical-identity independence: menu_item_id, menu_items.name, nutrition and
// allergen data are all untouched, and independence in both directions against the four frozen
// branch_menu_items writers (sold_out/availability/price/visibility).
//
// Opt-in: needs PostgreSQL binaries not part of this repository.
//   RA2FP1_PG_BIN      directory containing initdb/postgres executables (PostgreSQL 17.x)
//   RA2FP1_PG_MODULES  directory containing a node_modules with the `pg` client
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "restaurant-owner-branch-menu-item-display-name-ra-2f-p1-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260906010000_restaurant_owner_branch_display_name_authority.sql";
const CANDIDATE = "20260906020000_restaurant_owner_branch_menu_item_display_name_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;

const PG_BIN = process.env.RA2FP1_PG_BIN?.trim();
const PG_MODULES = process.env.RA2FP1_PG_MODULES?.trim();
if (!PG_BIN || !PG_MODULES
  || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RA2FP1_PG_BIN and RA2FP1_PG_MODULES to a PostgreSQL 17.x binary directory and a node_modules containing `pg`"
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
    if (entry.isDirectory() && entry.name.startsWith("ra2fp1-data-")) {
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
  const dataDir = path.join(workDir, `ra2fp1-data-${process.pid}-${Date.now()}`);
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

const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ra2fp1-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
reapStrays(workDir);
const watchdog = setTimeout(() => {
  console.error("watchdog: harness exceeded its budget; failing closed");
  for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } }
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref?.();

const DN_ROLE = "restaurant_owner_branch_menu_item_display_name_write_authority";
const SO_ROLE = "restaurant_owner_branch_menu_item_write_authority";
const AV_ROLE = "restaurant_owner_branch_menu_item_availability_write_authority";
const PR_ROLE = "restaurant_owner_branch_menu_item_price_write_authority";
const VIS_ROLE = "restaurant_owner_branch_menu_item_visibility_write_authority";
const PREVIEW = "public.restaurant_owner_preview_branch_menu_item_display_name_v1(text,text,text)";
const MUTATE = "public.restaurant_owner_set_branch_menu_item_display_name_v1(text,text,text,text,bigint)";
const DN_AUDIT = "restaurant_internal.branch_menu_item_display_name_audit_log";
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
  check("all frozen predecessors and RA-2F-P1 apply through COMMIT", applied === files.length,
    { applied, total: files.length });
  check("the round contributes exactly one successor migration",
    candidates.length === 1 && candidates[0] === CANDIDATE, candidates);

  // ------------------------------------------------- permission seed
  const perms = await q(`select role.role_key, permission.permission_key, permission.permission_scope
    from public.role_permissions permission join public.restaurant_roles role on role.id=permission.role_id
    where permission.permission_key like 'branch%.write' order by 2,1`);
  const dnRows = perms.filter((p) => p.permission_key === "branch_menu_item.display_name.write");
  check("the FORCE-RLS seed landed exactly one owner/restaurant display-name-override permission",
    dnRows.length === 1 && dnRows[0].role_key === "owner" && dnRows[0].permission_scope === "restaurant", perms);
  check("every predecessor permission row is preserved untouched",
    perms.filter((p) => p.permission_key === "branch_menu_item.sold_out.write").length === 1
    && perms.filter((p) => p.permission_key === "branch_menu_item.availability.write").length === 1
    && perms.filter((p) => p.permission_key === "branch_menu_item.price.write").length === 1
    && perms.filter((p) => p.permission_key === "branch_menu_item.visibility.write").length === 1
    && perms.filter((p) => p.permission_key === "branch.profile.display_name.write").length === 1, perms);
  check("manager and staff hold no display-name-override permission",
    perms.every((p) => p.role_key === "owner"), perms);
  check("FORCE row level security was restored on both seeded tables",
    (await q(`select count(*)::int as n from pg_class c join pg_namespace s on s.oid=c.relnamespace
      where s.nspname='public' and c.relname in ('role_permissions','restaurant_roles')
        and c.relforcerowsecurity`))[0].n === 2);

  // ------------------------------------------------- version token and no naive CHECK
  const col = (await q(`select data_type, is_nullable, column_default from information_schema.columns
    where table_schema='public' and table_name='branch_menu_items' and column_name='branch_specific_name_version'`))[0];
  check("branch_specific_name_version is bigint not null default 0",
    col && col.data_type === "bigint" && col.is_nullable === "NO" && col.column_default === "0", col);
  check("all five version triggers coexist",
    (await q(`select count(*)::int as n from pg_trigger where tgrelid='public.branch_menu_items'::regclass
      and not tgisinternal and tgname in ('branch_menu_items_display_name_version_maintain',
        'branch_menu_items_price_version_maintain','branch_menu_items_availability_version_maintain',
        'branch_menu_items_sold_out_version_maintain','branch_menu_items_branch_specific_status_version_maintain')`))[0].n === 5);
  const nameConstraints = await q(`select conname, pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid='public.branch_menu_items'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%branch_specific_name%'
      and pg_get_constraintdef(oid) not like '%branch_specific_name_version%'`);
  check("NO table CHECK constrains branch_specific_name itself",
    nameConstraints.length === 0, nameConstraints);

  // ------------------------------------------------- sealed role
  const role = (await q(`select rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreatedb,rolcreaterole,rolreplication
    from pg_roles where rolname=$1`, [DN_ROLE]))[0];
  check("the new display-name-override writer exists and is sealed in every attribute",
    role && !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls && !role.rolsuper
    && !role.rolcreatedb && !role.rolcreaterole && !role.rolreplication, role);
  const rolesAfter = (await q(`select count(*)::int as n from pg_roles`))[0].n;
  check("the round created exactly one new role", rolesAfter === rolesBefore + 1,
    { before: rolesBefore, after: rolesAfter });
  check("no client or runtime role is a member of the display-name-override writer",
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

  // ------------------------------------------------- five-way column authority independence
  const cp = async (r, c, p) => (await q(
    `select has_column_privilege($1,'public.branch_menu_items',$2,$3) as v`, [r, c, p]))[0].v;
  const dnMatrix = {
    branch_specific_name: await cp(DN_ROLE, "branch_specific_name", "UPDATE"),
    branch_specific_name_version: await cp(DN_ROLE, "branch_specific_name_version", "UPDATE"),
    branch_specific_description: await cp(DN_ROLE, "branch_specific_description", "UPDATE"),
    sold_out: await cp(DN_ROLE, "sold_out", "UPDATE"),
    sold_out_version: await cp(DN_ROLE, "sold_out_version", "UPDATE"),
    availability: await cp(DN_ROLE, "availability", "UPDATE"),
    availability_version: await cp(DN_ROLE, "availability_version", "UPDATE"),
    price: await cp(DN_ROLE, "price", "UPDATE"),
    price_version: await cp(DN_ROLE, "price_version", "UPDATE"),
    branch_specific_status: await cp(DN_ROLE, "branch_specific_status", "UPDATE"),
    branch_specific_status_version: await cp(DN_ROLE, "branch_specific_status_version", "UPDATE"),
    menu_item_id: await cp(DN_ROLE, "menu_item_id", "UPDATE")
  };
  check("the display-name-override writer may write branch_specific_name and nothing else",
    dnMatrix.branch_specific_name
    && Object.entries(dnMatrix).every(([k, v]) => k === "branch_specific_name" || v === false),
    dnMatrix);
  check("the writer has NO privilege at all (select or update) on branch_specific_description",
    !(await cp(DN_ROLE, "branch_specific_description", "SELECT"))
    && !(await cp(DN_ROLE, "branch_specific_description", "UPDATE")));
  check("the writer cannot update menu_items.name (canonical identity)",
    !(await q(`select has_column_privilege($1,'public.menu_items','name','UPDATE') v`, [DN_ROLE]))[0].v);
  const predecessorMatrix = {
    so_name: await cp(SO_ROLE, "branch_specific_name", "UPDATE"),
    av_name: await cp(AV_ROLE, "branch_specific_name", "UPDATE"),
    pr_name: await cp(PR_ROLE, "branch_specific_name", "UPDATE"),
    vis_name: await cp(VIS_ROLE, "branch_specific_name", "UPDATE"),
    so_sold_out: await cp(SO_ROLE, "sold_out", "UPDATE"),
    av_availability: await cp(AV_ROLE, "availability", "UPDATE"),
    pr_price: await cp(PR_ROLE, "price", "UPDATE"),
    vis_status: await cp(VIS_ROLE, "branch_specific_status", "UPDATE")
  };
  check("no frozen predecessor writer was widened to branch_specific_name",
    !predecessorMatrix.so_name && !predecessorMatrix.av_name && !predecessorMatrix.pr_name
    && !predecessorMatrix.vis_name
    && predecessorMatrix.so_sold_out && predecessorMatrix.av_availability
    && predecessorMatrix.pr_price && predecessorMatrix.vis_status, predecessorMatrix);
  check("no writer holds broad table UPDATE on branch_menu_items",
    !(await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') v`, [DN_ROLE]))[0].v
    && !(await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') v`, [SO_ROLE]))[0].v
    && !(await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') v`, [AV_ROLE]))[0].v
    && !(await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') v`, [PR_ROLE]))[0].v
    && !(await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') v`, [VIS_ROLE]))[0].v);

  // ------------------------------------------------- policy catalogue
  const pol = await q(`select polname, polcmd, polpermissive from pg_policy
    where polrelid='public.branch_menu_items'::regclass and polname like '%owner_display_name%' order by 1`);
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
      ('restaurant_owner_preview_branch_menu_item_display_name_v1',
       'restaurant_owner_set_branch_menu_item_display_name_v1') order by 1`);
  check("both RPCs are SECURITY DEFINER, owned by the new writer, with pinned config; preview is STABLE",
    meta.length === 2 && meta.every((m) => m.owner === DN_ROLE && m.prosecdef
      && /search_path=/.test(m.config) && /row_security=on/.test(m.config))
    && meta[0].provolatile === "s" && meta[1].provolatile === "v", meta);
  check("neither RPC accepts a caller-supplied actor argument",
    (await q(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'restaurant_owner_%branch_menu_item_display_name%'
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
  const auditCol = await q(`select is_nullable from information_schema.columns
    where table_schema='restaurant_internal' and table_name='branch_menu_item_display_name_audit_log'
      and column_name in ('previous_display_name','next_display_name')`);
  check("previous_display_name and next_display_name are nullable in the audit relation",
    auditCol.length === 2 && auditCol.every((c) => c.is_nullable === "YES"), auditCol);

  // ------------------------------------------------- fixtures
  await q(`insert into auth.users(id,email) values ($1,'a@t.invalid'),($2,'b@t.invalid'),($3,'m@t.invalid'),($4,'s@t.invalid'),($5,'x@t.invalid')`,
    [OWNER_A, OWNER_B, MANAGER, STAFF, STRANGER]);
  await q(`insert into public.restaurants(id,name,status) values ('f1-rest-a','A','active'),('f1-rest-b','B','active')`);
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status) values
    ('f1-branch-a','f1-rest-a','A Branch','active'),('f1-branch-b','f1-rest-b','B Branch','active')`);
  await q(`insert into public.menus(id,restaurant_id,name,status) values
    ('f1-menu-a','f1-rest-a','A menu','published'),('f1-menu-b','f1-rest-b','B menu','published')`);
  await q(`insert into public.menu_categories(id,menu_id,name) values ('f1-cat-a','f1-menu-a','A'),('f1-cat-b','f1-menu-b','B')`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values
    ('f1-item-a','f1-rest-a','f1-cat-a','Canonical Item A','active'),
    ('f1-item-b','f1-rest-b','f1-cat-b','Canonical Item B','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('f1-bmi-a','f1-rest-a','f1-branch-a','f1-item-a',10,'available','available'),
           ('f1-bmi-b','f1-rest-b','f1-branch-b','f1-item-b',20,'available','available')`);
  const users = await q(`insert into public.restaurant_users(auth_user_id,login_status) values
    ($1,'enabled'),($2,'enabled'),($3,'enabled'),($4,'enabled') returning id, auth_user_id`,
    [OWNER_A, OWNER_B, MANAGER, STAFF]);
  const uid = (a) => users.find((u) => u.auth_user_id === a).id;
  const roleId = async (k) => (await q(`select id from public.restaurant_roles where role_key=$1`, [k]))[0].id;
  await q(`insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values
    ($1,'f1-rest-a',$5,'active'),($2,'f1-rest-b',$5,'active'),($3,'f1-rest-a',$6,'active'),($4,'f1-rest-a',$7,'active')`,
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
  const preview = (a, args) => asClient(a, `select public.restaurant_owner_preview_branch_menu_item_display_name_v1($1,$2,$3) as out`, args);
  const mutate = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_display_name_v1($1,$2,$3,$4,$5::bigint) as out`, args);
  const setName = (a, id, expected, next, version) => mutate(a, [id, "set", expected, next, version]);
  const clearName = (a, id, expected, version) => mutate(a, [id, "clear", expected, null, version]);
  const setSold = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_sold_out_v1($1,$2,$3,$4::bigint) as out`, args);
  const setAv = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_availability_v1($1,$2,$3,$4::bigint) as out`, args);
  const setPrice = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_price_v1($1,$2,$3,$4::bigint) as out`, args);
  const setVis = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_visibility_v1($1,$2,$3,$4::bigint) as out`, args);
  const row = async (id) => (await q(`select branch_specific_name, branch_specific_name_version,
    branch_specific_description, sold_out, sold_out_version, availability, availability_version,
    price, branch_specific_status, branch_specific_status_version, menu_item_id
    from public.branch_menu_items where id=$1`, [id]))[0];
  const dnAudit = async () => (await q(`select count(*)::int as n from ${DN_AUDIT}`))[0].n;
  const canonicalName = async (menuItemId) => (await q(
    `select name from public.menu_items where id=$1`, [menuItemId]))[0].name;
  const inCatalogue = async (id) => (await q(
    `select menu_item_name from public.consumer_public_restaurant_catalog_v1 where branch_menu_item_id=$1`,
    [id]))[0]?.menu_item_name ?? null;

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
  const ownSeen = await asWriterRole(DN_ROLE, OWNER_A, `select id from public.branch_menu_items where id='f1-bmi-a'`);
  const foreignSeen = await asWriterRole(DN_ROLE, OWNER_B, `select id from public.branch_menu_items where id='f1-bmi-a'`);
  check("RESTRICTIVE tenant policy REALLY narrows: the writer sees its own target and not a foreign one",
    ownSeen.length === 1 && foreignSeen.length === 0, { ownSeen, foreignSeen });
  const forcedWrite = await asWriterRole(DN_ROLE, OWNER_B,
    `update public.branch_menu_items set branch_specific_name = 'hacked' where id='f1-bmi-a' returning id`);
  check("RESTRICTIVE tenant policy blocks a direct cross-tenant UPDATE by the sealed role itself",
    forcedWrite.length === 0 || forcedWrite[0].thrown !== undefined, forcedWrite);

  // ------------------------------------------------- preview: NULL override vs canonical name
  const ok = await preview(OWNER_A, ["f1-rest-a", "f1-branch-a", "f1-bmi-a"]);
  check("an authorised owner previews NULL override alongside the canonical menu name",
    ok.ok === true && ok.state === "ready" && ok.branchSpecificDisplayName === null
    && ok.branchSpecificDisplayNameVersion === "0" && ok.canonicalDisplayName === "Canonical Item A",
    ok);
  check("the version is TEXT, never a JSON number", typeof ok.branchSpecificDisplayNameVersion === "string");
  check("the preview projects exactly the approved fields",
    JSON.stringify(Object.keys(ok).sort()) === JSON.stringify(
      ["branchId", "branchMenuItemId", "branchSpecificDisplayName", "branchSpecificDisplayNameVersion",
       "canonicalDisplayName", "menuItemId", "ok", "state"].sort()), Object.keys(ok));
  check("an unauthenticated preview is refused",
    (await preview(null, ["f1-rest-a", "f1-branch-a", "f1-bmi-a"])).errorCode === "unauthenticated");
  check("a non-member preview is permission_denied",
    (await preview(STRANGER, ["f1-rest-a", "f1-branch-a", "f1-bmi-a"])).errorCode === "permission_denied");
  check("a manager preview is permission_denied",
    (await preview(MANAGER, ["f1-rest-a", "f1-branch-a", "f1-bmi-a"])).errorCode === "permission_denied");
  check("a staff preview is permission_denied",
    (await preview(STAFF, ["f1-rest-a", "f1-branch-a", "f1-bmi-a"])).errorCode === "permission_denied");
  const xCross = await preview(OWNER_B, ["f1-rest-a", "f1-branch-a", "f1-bmi-a"]);
  const xGhost = await preview(OWNER_B, ["f1-rest-b", "f1-branch-b", "f1-bmi-none"]);
  check("cross-tenant and nonexistent previews are byte-identical target_not_found",
    xCross.errorCode === "target_not_found" && JSON.stringify(xCross) === JSON.stringify(xGhost), { xCross, xGhost });
  check("a malformed preview is invalid_request",
    (await preview(OWNER_A, ["f1-rest-a", "", "f1-bmi-a"])).errorCode === "invalid_request");

  // ------------------------------------------------- operation vocabulary and whitespace/empty rule
  const opCases = [
    ["set with null next is invalid_request", ["f1-bmi-a", "set", null, null, "0"]],
    ["clear with a non-null next is invalid_request", ["f1-bmi-a", "clear", null, "x", "0"]],
    ["unknown operation is invalid_request", ["f1-bmi-a", "rename", null, "x", "0"]],
    ["null operation is invalid_request", ["f1-bmi-a", null, null, "x", "0"]],
    ["negative expected version is invalid_request", ["f1-bmi-a", "set", null, "x", "-1"]]
  ];
  const opResults = [];
  for (const [label, args] of opCases) {
    const r = await mutate(OWNER_A, args);
    opResults.push({ label, errorCode: r.errorCode });
  }
  check("the operation vocabulary is exactly {set, clear}, and next/operation consistency is enforced",
    opResults.every((r) => r.errorCode === "invalid_request"), opResults);
  const wsCases = ["", "   ", "\t", "\n"];
  const wsResults = [];
  for (const v of wsCases) {
    const r = await setName(OWNER_A, "f1-bmi-a", null, v, "0");
    wsResults.push({ input: JSON.stringify(v), errorCode: r.errorCode });
  }
  check("whitespace-only/empty SET input is invalid_request -- never reinterpreted as clear, never no_change",
    wsResults.every((r) => r.errorCode === "invalid_request"), wsResults);
  check("none of the vocabulary/whitespace probes wrote a row or an audit row",
    (await row("f1-bmi-a")).branch_specific_name === null && await dnAudit() === 0);

  // ------------------------------------------------- canonicalization and validation vocabulary
  const cases = [
    ["CJK label", "招牌雞胸沙拉", true],
    ["Latin label", "Chef's Special Salad", true],
    ["emoji/symbol label", "🍜 Noodle Special ★", true],
    ["exactly 80 chars", "x".repeat(80), true],
    ["81 chars rejected", "x".repeat(81), false],
    ["newline rejected", "line1\nline2", false],
    ["CR rejected", "line1\rline2", false],
    ["tab rejected", "a\tb", false],
    ["DEL control rejected", `a${String.fromCharCode(127)}b`, false],
    ["C1 control rejected", `a${String.fromCharCode(0x85)}b`, false]
  ];
  const caseResults = [];
  for (const [label, next, expectOk] of cases) {
    const before = await row("f1-bmi-a");
    const r = await setName(OWNER_A, "f1-bmi-a", before.branch_specific_name, next, before.branch_specific_name_version);
    caseResults.push({ label, ok: r.ok === true, expectOk, errorCode: r.errorCode });
    if (r.ok) await clearName(OWNER_A, "f1-bmi-a", next, r.branchSpecificDisplayNameVersion);
  }
  check("the SET canonical vocabulary is exactly as specified", caseResults.every((r) => r.ok === r.expectOk), caseResults);
  const afterCases = await row("f1-bmi-a");
  check("the vocabulary rehearsal ended back at NULL via the governed path only",
    afterCases.branch_specific_name === null, afterCases);

  const preTrim = await row("f1-bmi-a");
  const trimBefore = await setName(OWNER_A, "f1-bmi-a", preTrim.branch_specific_name, "  Trimmed Label  ",
    preTrim.branch_specific_name_version);
  check("outer whitespace is trimmed on SET", trimBefore.ok === true && trimBefore.branchSpecificDisplayName === "Trimmed Label", trimBefore);
  const trimAgain = await setName(OWNER_A, "f1-bmi-a", "Trimmed Label", "  Trimmed Label  ", trimBefore.branchSpecificDisplayNameVersion);
  check("outer whitespace alone canonicalizes to the same value: no_change", trimAgain.errorCode === "no_change", trimAgain);
  const interior = await setName(OWNER_A, "f1-bmi-a", "Trimmed Label", "Trimmed   Label", trimBefore.branchSpecificDisplayNameVersion);
  check("interior whitespace is preserved exactly and IS a real business change",
    interior.ok === true && interior.branchSpecificDisplayName === "Trimmed   Label", interior);
  await clearName(OWNER_A, "f1-bmi-a", "Trimmed   Label", interior.branchSpecificDisplayNameVersion);

  // ------------------------------------------------- duplicates allowed
  const dupA = await setName(OWNER_A, "f1-bmi-a", (await row("f1-bmi-a")).branch_specific_name,
    "Shared Label", (await row("f1-bmi-a")).branch_specific_name_version);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('f1-item-dup','f1-rest-a','f1-cat-a','Canonical Dup','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('f1-bmi-dup','f1-rest-a','f1-branch-a','f1-item-dup',10,'available','available')`);
  const dupB = await setName(OWNER_A, "f1-bmi-dup", null, "Shared Label", "0");
  check("two branch-menu items may share the same override label; no uniqueness enforced",
    dupA.ok === true && dupB.ok === true
    && (await row("f1-bmi-a")).branch_specific_name === "Shared Label"
    && (await row("f1-bmi-dup")).branch_specific_name === "Shared Label", { dupA, dupB });
  await clearName(OWNER_A, "f1-bmi-a", "Shared Label", dupA.branchSpecificDisplayNameVersion);
  await clearName(OWNER_A, "f1-bmi-dup", "Shared Label", dupB.branchSpecificDisplayNameVersion);

  // ------------------------------------------------- mutation: applied, stale, ABA, no-change-on-null
  const auditBaseline = await dnAudit();
  const beforeMutation = await row("f1-bmi-a");
  const v0 = beforeMutation.branch_specific_name_version;
  const v1 = String(Number(v0) + 1);
  const v2 = String(Number(v0) + 2);
  const clearOnNull = await clearName(OWNER_A, "f1-bmi-a", null, v0);
  check("CLEAR when already NULL is no_change, not applied", clearOnNull.errorCode === "no_change", clearOnNull);
  const m1 = await setName(OWNER_A, "f1-bmi-a", null, "Override One", v0);
  const r1 = await row("f1-bmi-a");
  check("NULL -> string: the owner applies a SET and the version advances exactly once",
    m1.ok === true && m1.state === "applied" && m1.branchSpecificDisplayName === "Override One"
    && m1.branchSpecificDisplayNameVersion === v1
    && r1.branch_specific_name === "Override One" && r1.branch_specific_name_version === v1, { m1, r1, v0, v1 });
  check("INDEPENDENCE: the SET left description/sold_out/availability/price/status byte-identical",
    r1.branch_specific_description === beforeMutation.branch_specific_description
    && r1.sold_out === beforeMutation.sold_out && r1.sold_out_version === beforeMutation.sold_out_version
    && r1.availability === beforeMutation.availability && r1.availability_version === beforeMutation.availability_version
    && r1.price === beforeMutation.price
    && r1.branch_specific_status === beforeMutation.branch_specific_status
    && r1.branch_specific_status_version === beforeMutation.branch_specific_status_version
    && r1.menu_item_id === beforeMutation.menu_item_id, { beforeMutation, r1 });
  check("exactly one new display-name-override audit row, attributed to the owner",
    await dnAudit() === auditBaseline + 1
    && (await q(`select actor_auth_user_id, previous_display_name, next_display_name from ${DN_AUDIT}
      order by created_at desc limit 1`))[0].actor_auth_user_id === OWNER_A);
  check("cross-tenant mutation is target_not_found",
    (await setName(OWNER_B, "f1-bmi-a", "Override One", "x", v1)).errorCode === "target_not_found");
  check("a manager mutation is permission_denied",
    (await setName(MANAGER, "f1-bmi-a", "Override One", "x", v1)).errorCode === "permission_denied");
  check("a staff mutation is permission_denied",
    (await setName(STAFF, "f1-bmi-a", "Override One", "x", v1)).errorCode === "permission_denied");
  check("replaying the original NULL/v0 precondition is stale",
    (await setName(OWNER_A, "f1-bmi-a", null, "x", v0)).errorCode === "stale_state");
  check("a mismatched expected override at the right version is stale",
    (await setName(OWNER_A, "f1-bmi-a", "Wrong", "x", v1)).errorCode === "stale_state");
  check("SET the exact override that already holds is no_change",
    (await setName(OWNER_A, "f1-bmi-a", "Override One", "Override One", v1)).errorCode === "no_change");
  check("refusals wrote no further audit row", await dnAudit() === auditBaseline + 1);
  const m2 = await clearName(OWNER_A, "f1-bmi-a", "Override One", v1);
  const r2 = await row("f1-bmi-a");
  check("string -> NULL: CLEAR advances the version again and stores real NULL",
    m2.ok === true && m2.branchSpecificDisplayNameVersion === v2 && r2.branch_specific_name === null
    && r2.branch_specific_name_version === v2, { m2, r2 });
  check("the CLEAR is audited as a second applied transition", await dnAudit() === auditBaseline + 2);
  check("ABA: the row's original NULL/v0 precondition is stale even though the override is NULL again",
    (await setName(OWNER_A, "f1-bmi-a", null, "x", v0)).errorCode === "stale_state");

  // ------------------------------------------------- reverse independence
  const dnBefore = await row("f1-bmi-a");
  const s1 = await setSold(OWNER_A, ["f1-bmi-a", false, true, "0"]);
  const r3 = await row("f1-bmi-a");
  check("the frozen sold-out operation still applies unchanged", s1.ok === true && r3.sold_out === true, { s1, r3 });
  check("INDEPENDENCE: the sold-out write left the override and its version byte-identical",
    r3.branch_specific_name === dnBefore.branch_specific_name
    && r3.branch_specific_name_version === dnBefore.branch_specific_name_version, { dnBefore, r3 });
  const a1 = await setAv(OWNER_A, ["f1-bmi-a", "available", "limited", "0"]);
  const r4 = await row("f1-bmi-a");
  check("the frozen availability operation still applies unchanged", a1.ok === true, a1);
  check("INDEPENDENCE: the availability write left the override and its version byte-identical",
    r4.branch_specific_name === dnBefore.branch_specific_name
    && r4.branch_specific_name_version === dnBefore.branch_specific_name_version, { dnBefore, r4 });
  const p1 = await setPrice(OWNER_A, ["f1-bmi-a", "10.00", "20", "0"]);
  const r5 = await row("f1-bmi-a");
  check("the frozen price operation still applies unchanged", p1.ok === true, p1);
  check("INDEPENDENCE: the price write left the override and its version byte-identical",
    r5.branch_specific_name === dnBefore.branch_specific_name
    && r5.branch_specific_name_version === dnBefore.branch_specific_name_version, { dnBefore, r5 });
  const vi1 = await setVis(OWNER_A, ["f1-bmi-a", "available", "hidden", "0"]);
  const r6 = await row("f1-bmi-a");
  check("the frozen visibility operation still applies unchanged", vi1.ok === true, vi1);
  check("INDEPENDENCE: the visibility write left the override and its version byte-identical",
    r6.branch_specific_name === dnBefore.branch_specific_name
    && r6.branch_specific_name_version === dnBefore.branch_specific_name_version, { dnBefore, r6 });
  await setVis(OWNER_A, ["f1-bmi-a", "hidden", "available", vi1.branchSpecificStatusVersion]);
  check("INDEPENDENCE: none of the four predecessor writes wrote a display-name-override audit row",
    await dnAudit() === auditBaseline + 2);

  // ------------------------------------------------- version tamper resistance
  const forced = await q(`update public.branch_menu_items set branch_specific_name_version = 99
    where id='f1-bmi-a' returning branch_specific_name_version`);
  check("a direct attempt to set the version is discarded by the trigger",
    forced[0].branch_specific_name_version === v2, { forced, expected: v2 });
  const unrelated = await q(`update public.branch_menu_items set price = 15 where id='f1-bmi-a'
    returning branch_specific_name_version`);
  check("an unrelated column write advances no display-name-override version",
    unrelated[0].branch_specific_name_version === v2, { unrelated, expected: v2 });

  // ------------------------------------------------- audit atomicity
  await q(`create function restaurant_internal.f1_fail() returns trigger language plpgsql as $f$
    begin raise exception 'injected audit failure'; end $f$;
    create trigger f1_fail before insert on ${DN_AUDIT} for each row execute function restaurant_internal.f1_fail();`);
  const beforeAtomic = await row("f1-bmi-a");
  const atomicCount = await dnAudit();
  const atomic = await setName(OWNER_A, "f1-bmi-a", beforeAtomic.branch_specific_name, "Should Not Apply",
    beforeAtomic.branch_specific_name_version);
  const afterAtomic = await row("f1-bmi-a");
  check("a failing audit insert rolls the override change back",
    atomic.thrown !== undefined && JSON.stringify(afterAtomic) === JSON.stringify(beforeAtomic),
    { atomic, beforeAtomic, afterAtomic });
  check("the failed attempt left the audit relation unchanged", await dnAudit() === atomicCount);
  await q(`drop trigger f1_fail on ${DN_AUDIT}; drop function restaurant_internal.f1_fail();`);

  const auditTamper = await asWriterRole(DN_ROLE, OWNER_A,
    `update ${DN_AUDIT} set next_display_name = 'x' where true returning id`);
  check("the sealed writer cannot rewrite its own audit history",
    auditTamper.length === 1 && auditTamper[0].thrown !== undefined, auditTamper);
  const auditDelete = await asWriterRole(DN_ROLE, OWNER_A, `delete from ${DN_AUDIT} where true returning id`);
  check("the sealed writer cannot delete its own audit history",
    auditDelete.length === 1 && auditDelete[0].thrown !== undefined, auditDelete);

  // ------------------------------------------------- canonical identity independence
  // (Nutrition/allergen data for f1-item-a is untouched trivially: this round's writer holds no
  // privilege on any nutrition/allergen relation at all, proven structurally by the column-privilege
  // matrix above rather than by seeding a nutrition fixture here.)
  const canonicalBefore = await q(`select name, description from public.menu_items where id='f1-item-a';`);
  const preIdentity = await row("f1-bmi-a");
  const setForIdentity = await setName(OWNER_A, "f1-bmi-a", preIdentity.branch_specific_name,
    "Identity Check Label", preIdentity.branch_specific_name_version);
  check("setup: the identity-check SET applied", setForIdentity.ok === true, setForIdentity);
  const canonicalAfter = await q(`select name, description from public.menu_items where id='f1-item-a';`);
  check("CANONICAL IDENTITY: menu_items.name and description are byte-identical after the override",
    JSON.stringify(canonicalBefore) === JSON.stringify(canonicalAfter), { canonicalBefore, canonicalAfter });
  check("CANONICAL IDENTITY: menu_item_id on the branch-menu row is unchanged",
    (await row("f1-bmi-a")).menu_item_id === "f1-item-a");
  await clearName(OWNER_A, "f1-bmi-a", "Identity Check Label", setForIdentity.branchSpecificDisplayNameVersion);

  // ------------------------------------------------- legacy compatibility
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('f1-item-legacy','f1-rest-a','f1-cat-a','Canonical Legacy','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,
    availability,branch_specific_status,branch_specific_name)
    values ('f1-bmi-legacy','f1-rest-a','f1-branch-a','f1-item-legacy',10,'available','available','')`);
  const legacyBefore = await row("f1-bmi-legacy");
  check("LEGACY: a pre-existing empty-string override can still be INSERTed (the guard is change-scoped)",
    legacyBefore.branch_specific_name === "", legacyBefore);
  const legacySold = await setSold(OWNER_A, ["f1-bmi-legacy", false, true, "0"]);
  check("LEGACY COMPAT: sold-out mutation succeeds on a legacy empty-string override",
    legacySold.ok === true && (await row("f1-bmi-legacy")).branch_specific_name === ""
    && (await row("f1-bmi-legacy")).branch_specific_name_version === "0", legacySold);
  const legacyAv = await setAv(OWNER_A, ["f1-bmi-legacy", "available", "limited", "0"]);
  check("LEGACY COMPAT: availability mutation succeeds on a legacy empty-string override",
    legacyAv.ok === true, legacyAv);
  const legacyPrice = await setPrice(OWNER_A, ["f1-bmi-legacy", "10.00", "20", "0"]);
  check("LEGACY COMPAT: price mutation succeeds on a legacy empty-string override", legacyPrice.ok === true, legacyPrice);
  const legacyVis = await setVis(OWNER_A, ["f1-bmi-legacy", "available", "hidden", "0"]);
  check("LEGACY COMPAT: visibility mutation succeeds on a legacy empty-string override", legacyVis.ok === true, legacyVis);
  const legacyRepairSet = await setName(OWNER_A, "f1-bmi-legacy", "", "Legacy Repaired", "0");
  check("LEGACY REPAIR: SET repairs the legacy empty-string override to a canonical value",
    legacyRepairSet.ok === true && legacyRepairSet.branchSpecificDisplayName === "Legacy Repaired", legacyRepairSet);
  const legacyRepairClear = await clearName(OWNER_A, "f1-bmi-legacy", "Legacy Repaired",
    legacyRepairSet.branchSpecificDisplayNameVersion);
  check("LEGACY REPAIR: CLEAR repairs it further to real NULL",
    legacyRepairClear.ok === true && (await row("f1-bmi-legacy")).branch_specific_name === null, legacyRepairClear);

  // =================================================================================================
  // FALLBACK PROOF -- the core proof of this round.
  //
  // Uses a DEDICATED fresh fixture rather than f1-bmi-a: the reverse-independence section above
  // deliberately left f1-bmi-a's own sold_out=true (proving independence, not restoring state), which
  // would make it publication-ineligible for reasons that have nothing to do with this proof.
  // =================================================================================================
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('f1-item-fallback','f1-rest-a','f1-cat-a','Canonical Fallback Item','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('f1-bmi-fallback','f1-rest-a','f1-branch-a','f1-item-fallback',10,'available','available')`);
  const fallbackBefore = await row("f1-bmi-fallback");
  check("SETUP: the fallback fixture's override is NULL and it is fully publication-eligible",
    fallbackBefore.branch_specific_name === null && fallbackBefore.sold_out === false
    && fallbackBefore.availability === "available" && fallbackBefore.branch_specific_status === "available",
    fallbackBefore);
  check("FALLBACK: NULL override -> catalogue shows canonical menu name",
    await inCatalogue("f1-bmi-fallback") === "Canonical Fallback Item");
  const fallbackSet = await setName(OWNER_A, "f1-bmi-fallback", null, "Fallback Override",
    fallbackBefore.branch_specific_name_version);
  check("FALLBACK: SET succeeds", fallbackSet.ok === true, fallbackSet);
  check("FALLBACK: override set -> catalogue shows the override, not the canonical name",
    await inCatalogue("f1-bmi-fallback") === "Fallback Override");
  const fallbackClear = await clearName(OWNER_A, "f1-bmi-fallback", "Fallback Override", fallbackSet.branchSpecificDisplayNameVersion);
  check("FALLBACK: CLEAR succeeds", fallbackClear.ok === true, fallbackClear);
  check("FALLBACK: after CLEAR, catalogue shows the canonical menu name again",
    await inCatalogue("f1-bmi-fallback") === "Canonical Fallback Item");
  check("FALLBACK: menu_item_id and eligibility predicates were never touched by the cycle",
    (await row("f1-bmi-fallback")).menu_item_id === "f1-item-fallback"
    && (await row("f1-bmi-fallback")).sold_out === false
    && (await row("f1-bmi-fallback")).availability === "available"
    && (await row("f1-bmi-fallback")).branch_specific_status === "available");

  // ------------------------------------------------- publication safety
  await q(`insert into public.restaurants(id,name,status) values ('f1-rest-draft','Draft','draft')`);
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status) values ('f1-branch-draft','f1-rest-draft','x','active')`);
  await q(`insert into public.menus(id,restaurant_id,name,status) values ('f1-menu-draft','f1-rest-draft','x','published')`);
  await q(`insert into public.menu_categories(id,menu_id,name) values ('f1-cat-draft','f1-menu-draft','x')`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('f1-item-draft','f1-rest-draft','f1-cat-draft','Draft Canonical','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,branch_specific_status)
    values ('f1-bmi-draft','f1-rest-draft','f1-branch-draft','f1-item-draft',10,'available','available')`);
  await q(`insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status)
    values ($1,'f1-rest-draft',$2,'active')`, [uid(OWNER_A), await roleId("owner")]);
  const draftSet = await setName(OWNER_A, "f1-bmi-draft", null, "Draft Override", "0");
  check("on a draft Restaurant, SET succeeds", draftSet.ok === true, draftSet);
  check("PUBLICATION SAFETY: SET on a draft-Restaurant item creates no catalogue eligibility",
    await inCatalogue("f1-bmi-draft") === null);
  check("PUBLICATION SAFETY: the draft Restaurant's own status is untouched",
    (await q(`select status from public.restaurants where id='f1-rest-draft';`))[0].status === "draft");

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
