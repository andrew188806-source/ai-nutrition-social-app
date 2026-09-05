#!/usr/bin/env node
// RA-2C-P1 REAL PostgreSQL 17.6 non-superuser apply and authority gate.
//
// Static SQL review cannot prove a migration compiles, and a SUPERUSER apply cannot prove it
// deploys: a superuser bypasses ownership checks, role-membership options and row level security, so
// it silently "passes" migrations Development then refuses. This harness applies the EXACT frozen
// predecessor schema and then the EXACT RA-2C-P1 migration to a disposable real cluster THROUGH A
// NON-SUPERUSER RUNNER, through COMMIT, and exercises the resulting authority with real queries.
//
// The centre of this round is the LEGACY ZERO problem. Development holds a branch-menu row priced
// 0.00, which the canonical contract (whole TWD, 1..999999) does not admit. A table CHECK would have
// made every future write to that row fail, including RA-2A's sold-out mutation and RA-2B's
// availability mutation, which never touch price. This harness therefore proves, against a real
// cluster, that the legacy row stays writable by both predecessors, that it can be repaired forward
// to a canonical price, and that it can never be pushed back to zero.
//
// Opt-in, because it needs PostgreSQL binaries that are not part of this repository:
//   RA2CP1_PG_BIN      directory containing initdb/postgres executables (PostgreSQL 17.x)
//   RA2CP1_PG_MODULES  directory containing a node_modules with the `pg` client
// Provision both with `npm install embedded-postgres@17.6.0-beta.15` into a scratch directory; that
// build matches Development's PostgreSQL 17.6 exactly. Without them the harness reports `skipped`
// rather than pretending to have proven anything.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "restaurant-owner-price-ra-2c-p1-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260905010000_restaurant_owner_branch_menu_item_availability_authority.sql";
const CANDIDATE = "20260905020000_restaurant_owner_branch_menu_item_price_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;

const PG_BIN = process.env.RA2CP1_PG_BIN?.trim();
const PG_MODULES = process.env.RA2CP1_PG_MODULES?.trim();
if (!PG_BIN || !PG_MODULES
  || (!fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb")))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RA2CP1_PG_BIN and RA2CP1_PG_MODULES to a PostgreSQL 17.x binary directory and a node_modules containing `pg`"
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
  -- THE MIGRATION RUNNER IS NOT A SUPERUSER, exactly as on a real Supabase project.
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
// `process.kill` on Windows leaves the postmaster's backends alive holding the data directory, which
// is how a FINISHED proof sits "Running" forever. The whole tree is killed, teardown is registered on
// every exit path rather than only in a `finally`, strays are reaped on start-up, watchdog fails closed.
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
    if (entry.isDirectory() && entry.name.startsWith("ra2cp1-data-")) {
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
  const dataDir = path.join(workDir, `ra2cp1-data-${process.pid}-${Date.now()}`);
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
  if (!ready) {
    cluster.stop();
    throw new Error(`postgres did not become ready\n${fs.readFileSync(logFile, "utf8").slice(-1500)}`);
  }
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

const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ra2cp1-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
reapStrays(workDir);
const watchdog = setTimeout(() => {
  console.error("watchdog: harness exceeded its budget; failing closed");
  for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } }
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref?.();

const PRICE_ROLE = "restaurant_owner_branch_menu_item_price_write_authority";
const AV_ROLE = "restaurant_owner_branch_menu_item_availability_write_authority";
const SO_ROLE = "restaurant_owner_branch_menu_item_write_authority";
const PREVIEW = "public.restaurant_owner_preview_branch_menu_item_price_v1(text,text,text)";
const MUTATE = "public.restaurant_owner_set_branch_menu_item_price_v1(text,text,text,bigint)";
const PRICE_AUDIT = "restaurant_internal.branch_menu_item_price_audit_log";
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
  check("all frozen predecessors and RA-2C-P1 apply through COMMIT", applied === files.length,
    { applied, total: files.length });
  check("the round contributes exactly one successor migration",
    candidates.length === 1 && candidates[0] === CANDIDATE, candidates);

  // ------------------------------------------------- permission seed without BYPASSRLS
  const perms = await q(`select role.role_key, permission.permission_key, permission.permission_scope
    from public.role_permissions permission join public.restaurant_roles role on role.id=permission.role_id
    where permission.permission_key like 'branch_menu_item.%' order by 2,1`);
  const priceRows = perms.filter((p) => p.permission_key === "branch_menu_item.price.write");
  check("the FORCE-RLS seed landed exactly one owner/restaurant price permission",
    priceRows.length === 1 && priceRows[0].role_key === "owner"
    && priceRows[0].permission_scope === "restaurant", perms);
  check("RA-2A's and RA-2B's permission rows are preserved untouched",
    perms.filter((p) => p.permission_key === "branch_menu_item.sold_out.write").length === 1
    && perms.filter((p) => p.permission_key === "branch_menu_item.availability.write").length === 1, perms);
  check("manager and staff hold no branch-menu write permission",
    perms.every((p) => p.role_key === "owner"), perms);
  check("FORCE row level security was restored on both seeded tables",
    (await q(`select count(*)::int as n from pg_class c join pg_namespace s on s.oid=c.relnamespace
      where s.nspname='public' and c.relname in ('role_permissions','restaurant_roles')
        and c.relforcerowsecurity`))[0].n === 2);

  // ------------------------------------------------- version token and the ABSENCE of a price CHECK
  const col = (await q(`select data_type, is_nullable, column_default from information_schema.columns
    where table_schema='public' and table_name='branch_menu_items' and column_name='price_version'`))[0];
  check("price_version is bigint not null default 0",
    col && col.data_type === "bigint" && col.is_nullable === "NO" && col.column_default === "0", col);
  check("all three version triggers coexist on the table",
    (await q(`select count(*)::int as n from pg_trigger where tgrelid='public.branch_menu_items'::regclass
      and not tgisinternal and tgname in ('branch_menu_items_price_version_maintain',
        'branch_menu_items_availability_version_maintain',
        'branch_menu_items_sold_out_version_maintain')`))[0].n === 3);
  const priceChecks = await q(`select conname, pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid='public.branch_menu_items'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%price%'
      and pg_get_constraintdef(oid) not like '%price_version%'`);
  check("NO table CHECK constrains price itself, which is what keeps legacy rows writable",
    priceChecks.length === 0, priceChecks);

  // ------------------------------------------------- sealed role
  const role = (await q(`select rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreatedb,rolcreaterole,rolreplication
    from pg_roles where rolname=$1`, [PRICE_ROLE]))[0];
  check("the new price writer exists and is sealed in every attribute",
    role && !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls && !role.rolsuper
    && !role.rolcreatedb && !role.rolcreaterole && !role.rolreplication, role);
  const rolesAfter = (await q(`select count(*)::int as n from pg_roles`))[0].n;
  check("the round created exactly one new role", rolesAfter === rolesBefore + 1,
    { before: rolesBefore, after: rolesAfter });
  check("no client or runtime role is a member of the price writer",
    (await q(`select count(*)::int as n from pg_auth_members a join pg_roles r on r.oid=a.roleid
      join pg_roles g on g.oid=a.member where r.rolname=$1
        and g.rolname in ('anon','authenticated','authenticator','service_role')`, [PRICE_ROLE]))[0].n === 0);
  check("the migration released its own transient sealed-role membership",
    (await q(`select count(*)::int as n from pg_auth_members a join pg_roles r on r.oid=a.roleid
      join pg_roles g on g.oid=a.member
      where r.rolname=$1 and g.rolname='postgres'
        and a.grantor=(select oid from pg_roles where rolname='postgres')`, [PRICE_ROLE]))[0].n === 0);
  check("the migration released its transient CREATE on schema public",
    (await q(`select has_schema_privilege($1,'public','CREATE') v`, [PRICE_ROLE]))[0].v === false);

  // ------------------------------------------------- three-way column authority independence
  const cp = async (r, c, p) => (await q(
    `select has_column_privilege($1,'public.branch_menu_items',$2,$3) as v`, [r, c, p]))[0].v;
  const priceMatrix = {
    price: await cp(PRICE_ROLE, "price", "UPDATE"),
    price_version: await cp(PRICE_ROLE, "price_version", "UPDATE"),
    sold_out: await cp(PRICE_ROLE, "sold_out", "UPDATE"),
    sold_out_version: await cp(PRICE_ROLE, "sold_out_version", "UPDATE"),
    availability: await cp(PRICE_ROLE, "availability", "UPDATE"),
    availability_version: await cp(PRICE_ROLE, "availability_version", "UPDATE"),
    branch_specific_status: await cp(PRICE_ROLE, "branch_specific_status", "UPDATE"),
    restaurant_id: await cp(PRICE_ROLE, "restaurant_id", "UPDATE"),
    menu_item_id: await cp(PRICE_ROLE, "menu_item_id", "UPDATE")
  };
  check("the price writer may write price and nothing else",
    priceMatrix.price && Object.entries(priceMatrix).every(([k, v]) => k === "price" || v === false),
    priceMatrix);
  const predecessorMatrix = {
    so_price: await cp(SO_ROLE, "price", "UPDATE"),
    so_price_version: await cp(SO_ROLE, "price_version", "UPDATE"),
    av_price: await cp(AV_ROLE, "price", "UPDATE"),
    av_price_version: await cp(AV_ROLE, "price_version", "UPDATE"),
    so_sold_out: await cp(SO_ROLE, "sold_out", "UPDATE"),
    av_availability: await cp(AV_ROLE, "availability", "UPDATE")
  };
  check("neither frozen predecessor writer was widened to price",
    !predecessorMatrix.so_price && !predecessorMatrix.so_price_version
    && !predecessorMatrix.av_price && !predecessorMatrix.av_price_version
    && predecessorMatrix.so_sold_out && predecessorMatrix.av_availability, predecessorMatrix);
  check("no writer holds broad table UPDATE on branch_menu_items",
    (await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') a,
      has_table_privilege($2,'public.branch_menu_items','UPDATE') b,
      has_table_privilege($3,'public.branch_menu_items','UPDATE') c`,
      [PRICE_ROLE, AV_ROLE, SO_ROLE]))[0] &&
    !(await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') v`, [PRICE_ROLE]))[0].v
    && !(await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') v`, [AV_ROLE]))[0].v
    && !(await q(`select has_table_privilege($1,'public.branch_menu_items','UPDATE') v`, [SO_ROLE]))[0].v);

  // ------------------------------------------------- policy catalogue
  const pol = await q(`select polname, polcmd, polpermissive from pg_policy
    where polrelid='public.branch_menu_items'::regclass and polname like '%owner_price%' order by 1`);
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
    has_table_privilege('authenticated','${PRICE_AUDIT}','SELECT') audit_client,
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
      ('restaurant_owner_preview_branch_menu_item_price_v1',
       'restaurant_owner_set_branch_menu_item_price_v1') order by 1`);
  check("both RPCs are SECURITY DEFINER, owned by the new writer, with pinned config; preview is STABLE",
    meta.length === 2 && meta.every((m) => m.owner === PRICE_ROLE && m.prosecdef
      && /search_path=/.test(m.config) && /row_security=on/.test(m.config))
    && meta[0].provolatile === "s" && meta[1].provolatile === "v", meta);
  check("neither RPC accepts a caller-supplied actor argument",
    (await q(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'restaurant_owner_%branch_menu_item_price%'
        and pg_get_function_arguments(p.oid) ~* '(actor|auth_user|user_id|membership|owner_id)'`))[0].n === 0);
  const auditAcl = (await q(`select has_table_privilege($1,'${PRICE_AUDIT}','SELECT') s,
    has_table_privilege($1,'${PRICE_AUDIT}','INSERT') i, has_table_privilege($1,'${PRICE_AUDIT}','UPDATE') u,
    has_table_privilege($1,'${PRICE_AUDIT}','DELETE') d,
    (select relforcerowsecurity from pg_class where oid='${PRICE_AUDIT}'::regclass) forced`, [PRICE_ROLE]))[0];
  check("the audit relation is append-only for its writer under FORCE row level security",
    auditAcl.s && auditAcl.i && !auditAcl.u && !auditAcl.d && auditAcl.forced, auditAcl);
  check("the audit relation records menu_item_id",
    (await q(`select count(*)::int as n from information_schema.columns
      where table_schema='restaurant_internal' and table_name='branch_menu_item_price_audit_log'
        and column_name='menu_item_id'`))[0].n === 1);
  check("no UPDATE or DELETE policy exists on the audit relation for any role",
    (await q(`select count(*)::int as n from pg_policy
      where polrelid='${PRICE_AUDIT}'::regclass and polcmd in ('w','d')`))[0].n === 0);

  // ------------------------------------------------- fixtures, including a LEGACY ZERO row
  await q(`insert into auth.users(id,email) values ($1,'a@t.invalid'),($2,'b@t.invalid'),($3,'m@t.invalid'),($4,'s@t.invalid')`,
    [OWNER_A, OWNER_B, MANAGER, STRANGER]);
  await q(`insert into public.restaurants(id,name,status) values ('c1-rest-a','A','active'),('c1-rest-b','B','active')`);
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status) values
    ('c1-branch-a','c1-rest-a','A branch','active'),('c1-branch-b','c1-rest-b','B branch','active')`);
  await q(`insert into public.menus(id,restaurant_id,name,status) values
    ('c1-menu-a','c1-rest-a','A menu','published'),('c1-menu-b','c1-rest-b','B menu','published')`);
  await q(`insert into public.menu_categories(id,menu_id,name) values ('c1-cat-a','c1-menu-a','A'),('c1-cat-b','c1-menu-b','B')`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values
    ('c1-item-a','c1-rest-a','c1-cat-a','A item','active'),('c1-item-b','c1-rest-b','c1-cat-b','B item','active'),
    ('c1-item-z','c1-rest-a','c1-cat-a','Legacy item','active')`);
  // c1-bmi-zero reproduces Development's legacy 0.00 row, which the canonical contract excludes.
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability)
    values ('c1-bmi-a','c1-rest-a','c1-branch-a','c1-item-a',150,'available'),
           ('c1-bmi-b','c1-rest-b','c1-branch-b','c1-item-b',200,'available'),
           ('c1-bmi-zero','c1-rest-a','c1-branch-a','c1-item-z',0,'available')`);
  check("LEGACY: a pre-existing price=0.00 row can still be INSERTed, because the guard is change-scoped",
    (await q(`select price::text p, price_version::text v from public.branch_menu_items where id='c1-bmi-zero'`))[0].p === "0.00");

  const users = await q(`insert into public.restaurant_users(auth_user_id,login_status) values
    ($1,'enabled'),($2,'enabled'),($3,'enabled') returning id, auth_user_id`, [OWNER_A, OWNER_B, MANAGER]);
  const uid = (a) => users.find((u) => u.auth_user_id === a).id;
  const roleId = async (k) => (await q(`select id from public.restaurant_roles where role_key=$1`, [k]))[0].id;
  await q(`insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values
    ($1,'c1-rest-a',$4,'active'),($2,'c1-rest-b',$4,'active'),($3,'c1-rest-a',$5,'active')`,
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
    } catch (e) {
      try { await c.query("rollback"); } catch { /* already aborted */ }
      return { thrown: e.code + " " + String(e.message).slice(0, 140) };
    } finally { await c.end(); }
  };
  const preview = (a, args) => asClient(a, `select public.restaurant_owner_preview_branch_menu_item_price_v1($1,$2,$3) as out`, args);
  const setPrice = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_price_v1($1,$2,$3,$4::bigint) as out`, args);
  const setSold = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_sold_out_v1($1,$2,$3,$4::bigint) as out`, args);
  const setAv = (a, args) => asClient(a, `select public.restaurant_owner_set_branch_menu_item_availability_v1($1,$2,$3,$4::bigint) as out`, args);
  const row = async (id) => (await q(`select price::text as price, price_version, availability,
    availability_version, sold_out, sold_out_version from public.branch_menu_items where id=$1`, [id]))[0];
  const priceAudit = async () => (await q(`select count(*)::int as n from ${PRICE_AUDIT}`))[0].n;
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
    } catch (e) {
      try { await c.query("rollback"); } catch { /* already aborted */ }
      return [{ thrown: e.code }];
    } finally { await c.end(); }
  };
  const ownSeen = await asWriterRole(PRICE_ROLE, OWNER_A, `select id from public.branch_menu_items where id='c1-bmi-a'`);
  const foreignSeen = await asWriterRole(PRICE_ROLE, OWNER_B, `select id from public.branch_menu_items where id='c1-bmi-a'`);
  check("RESTRICTIVE tenant policy REALLY narrows: the writer sees its own row and not a foreign one",
    ownSeen.length === 1 && foreignSeen.length === 0, { ownSeen, foreignSeen });
  const forcedWrite = await asWriterRole(PRICE_ROLE, OWNER_B,
    `update public.branch_menu_items set price = 999 where id='c1-bmi-a' returning id`);
  check("RESTRICTIVE tenant policy blocks a direct cross-tenant UPDATE by the sealed role itself",
    forcedWrite.length === 0 || forcedWrite[0].thrown !== undefined, forcedWrite);

  // ------------------------------------------------- preview
  const ok = await preview(OWNER_A, ["c1-rest-a", "c1-branch-a", "c1-bmi-a"]);
  check("an authorised owner previews the exact price and version",
    ok.ok === true && ok.state === "ready" && ok.price === "150.00"
    && ok.priceVersion === "0" && ok.branchId === "c1-branch-a" && ok.menuItemId === "c1-item-a", ok);
  check("price and version are both TEXT, never JSON numbers",
    typeof ok.price === "string" && typeof ok.priceVersion === "string");
  check("the preview projects exactly the approved fields",
    JSON.stringify(Object.keys(ok).sort()) === JSON.stringify(
      ["branchId", "branchMenuItemId", "menuItemId", "ok", "price", "priceVersion", "state"]), Object.keys(ok));
  const zeroPreview = await preview(OWNER_A, ["c1-rest-a", "c1-branch-a", "c1-bmi-zero"]);
  check("LEGACY: the preview reports a legacy zero losslessly as \"0.00\", neither hidden nor normalised",
    zeroPreview.ok === true && zeroPreview.price === "0.00" && zeroPreview.priceVersion === "0", zeroPreview);
  check("an unauthenticated preview is refused",
    (await preview(null, ["c1-rest-a", "c1-branch-a", "c1-bmi-a"])).errorCode === "unauthenticated");
  check("a non-member preview is permission_denied",
    (await preview(STRANGER, ["c1-rest-a", "c1-branch-a", "c1-bmi-a"])).errorCode === "permission_denied");
  check("a manager preview is permission_denied",
    (await preview(MANAGER, ["c1-rest-a", "c1-branch-a", "c1-bmi-a"])).errorCode === "permission_denied");
  const xCross = await preview(OWNER_B, ["c1-rest-a", "c1-branch-a", "c1-bmi-a"]);
  const xGhost = await preview(OWNER_B, ["c1-rest-b", "c1-branch-b", "c1-bmi-none"]);
  check("cross-tenant and nonexistent previews are byte-identical target_not_found",
    xCross.errorCode === "target_not_found" && JSON.stringify(xCross) === JSON.stringify(xGhost), { xCross, xGhost });
  check("a mismatched branch selector is target_not_found, not a leak",
    (await preview(OWNER_A, ["c1-rest-a", "c1-branch-b", "c1-bmi-a"])).errorCode === "target_not_found");
  check("a malformed preview is invalid_request",
    (await preview(OWNER_A, ["c1-rest-a", "", "c1-bmi-a"])).errorCode === "invalid_request");
  const beforePreviewRow = await row("c1-bmi-a");
  for (let i = 0; i < 3; i += 1) await preview(OWNER_A, ["c1-rest-a", "c1-branch-a", "c1-bmi-a"]);
  check("repeated preview mutates nothing and audits nothing",
    JSON.stringify(await row("c1-bmi-a")) === JSON.stringify(beforePreviewRow) && (await priceAudit()) === 0);

  // ------------------------------------------------- canonical validation vocabulary
  const rejects = [
    ["zero", "150.00", "0", "0"],
    ["negative", "150.00", "-150", "0"],
    ["fractional", "150.00", "150.5", "0"],
    ["two-decimal", "150.00", "150.00", "0"],
    ["one million", "150.00", "1000000", "0"],
    ["seven digits", "150.00", "9999999", "0"],
    ["empty", "150.00", "", "0"],
    ["whitespace", "150.00", " 150 ", "0"],
    ["leading zero", "150.00", "0150", "0"],
    ["plus sign", "150.00", "+150", "0"],
    ["scientific notation", "150.00", "1.5e2", "0"],
    ["NaN", "150.00", "NaN", "0"],
    ["Infinity", "150.00", "Infinity", "0"],
    ["hex", "150.00", "0x96", "0"],
    ["comma grouping", "150.00", "1,500", "0"],
    ["currency symbol", "150.00", "NT$150", "0"],
    ["trailing newline", "150.00", "150\n", "0"],
    ["SQL fragment", "150.00", "150; drop table public.branch_menu_items", "0"],
    ["negative expected version", "150.00", "150", "-1"],
    ["malformed expected price", "one hundred", "150", "0"]
  ];
  const rejectResults = [];
  for (const [label, expected, next, version] of rejects) {
    const r = await setPrice(OWNER_A, ["c1-bmi-a", expected, next, version]);
    rejectResults.push({ label, errorCode: r.errorCode ?? r.thrown ?? JSON.stringify(r) });
  }
  check("every non-canonical destination is invalid_request, and none reaches PostgreSQL as a raw error",
    rejectResults.every((r) => r.errorCode === "invalid_request"), rejectResults);
  check("no rejected request changed business state or wrote an audit row",
    (await row("c1-bmi-a")).price === "150.00" && (await priceAudit()) === 0);
  const boundary = [
    ["1 is the canonical floor", "1", true],
    ["999999 is the canonical ceiling", "999999", true],
    ["1000000 is one past the ceiling", "1000000", false]
  ];
  // The rehearsal is driven from LIVE state rather than a rewound one on purpose: price_version is
  // maintained solely by the trigger and a direct attempt to reset it is discarded (proven below),
  // so any harness that assumed it could wind the counter back would be testing a fiction.
  const boundaryResults = [];
  for (const [label, next, expectOk] of boundary) {
    const before = await row("c1-bmi-a");
    const r = await setPrice(OWNER_A, ["c1-bmi-a", before.price, next, before.price_version]);
    boundaryResults.push({ label, ok: r.ok === true, expectOk, errorCode: r.errorCode });
  }
  check("the inclusive boundaries 1 and 999999 are accepted and 1000000 is not",
    boundaryResults.every((r) => r.ok === r.expectOk), boundaryResults);
  const restoreFrom = await row("c1-bmi-a");
  const restore = await setPrice(OWNER_A, ["c1-bmi-a", restoreFrom.price, "150", restoreFrom.price_version]);
  check("the rehearsal is reversible through the governed path alone, ending back at 150.00",
    restore.ok === true && (await row("c1-bmi-a")).price === "150.00", { restoreFrom, restore });
  check("the rehearsal audited exactly its three applied changes and neither refusal",
    (await priceAudit()) === 3, { auditRows: await priceAudit(), boundaryResults });

  // ------------------------------------------------- ordering: validation precedes no_change
  const zeroToZero = await setPrice(OWNER_A, ["c1-bmi-zero", "0.00", "0", "0"]);
  check("ORDERING: a legacy zero asked to stay zero is invalid_request, NOT no_change "
    + "(zero is never a canonical price, even when it is the current one)",
    zeroToZero.errorCode === "invalid_request", zeroToZero);

  // ------------------------------------------------- §36 legacy repair forward
  const repair = await setPrice(OWNER_A, ["c1-bmi-zero", "0.00", "150", "0"]);
  const repaired = await row("c1-bmi-zero");
  check("LEGACY REPAIR: 0.00/v0 -> 150 succeeds and the version advances exactly once",
    repair.ok === true && repair.price === "150.00" && repair.priceVersion === "1"
    && repaired.price === "150.00" && repaired.price_version === "1", { repair, repaired });
  const repairAudit = (await q(`select previous_price::text pp, next_price::text np,
    previous_price_version::text pv, next_price_version::text nv, menu_item_id, actor_auth_user_id
    from ${PRICE_AUDIT} order by created_at desc limit 1`))[0];
  check("the repair is audited with the legacy origin recorded exactly as it was",
    repairAudit.pp === "0.00" && repairAudit.np === "150.00" && repairAudit.pv === "0"
    && repairAudit.nv === "1" && repairAudit.menu_item_id === "c1-item-z"
    && repairAudit.actor_auth_user_id === OWNER_A, repairAudit);
  const backToZero = await setPrice(OWNER_A, ["c1-bmi-zero", "150.00", "0", "1"]);
  check("LEGACY IS ONE-WAY: a repaired row can never be pushed back to zero",
    backToZero.errorCode === "invalid_request" && (await row("c1-bmi-zero")).price === "150.00", backToZero);

  // ------------------------------------------------- §35 predecessors still work on a legacy zero
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status)
    values ('c1-item-z2','c1-rest-a','c1-cat-a','Legacy item 2','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability)
    values ('c1-bmi-zero2','c1-rest-a','c1-branch-a','c1-item-z2',0,'available')`);
  const legacyBefore = await row("c1-bmi-zero2");
  const legacySold = await setSold(OWNER_A, ["c1-bmi-zero2", false, true, "0"]);
  const afterSold = await row("c1-bmi-zero2");
  check("LEGACY COMPAT: RA-2A's sold-out mutation still succeeds on a price=0.00 row",
    legacySold.ok === true && afterSold.sold_out === true, { legacySold, afterSold });
  check("LEGACY COMPAT: the sold-out write preserved price and price_version byte-identically",
    afterSold.price === legacyBefore.price && afterSold.price_version === legacyBefore.price_version,
    { legacyBefore, afterSold });
  const legacyAv = await setAv(OWNER_A, ["c1-bmi-zero2", "available", "limited", "0"]);
  const afterAv = await row("c1-bmi-zero2");
  check("LEGACY COMPAT: RA-2B's availability mutation still succeeds on a price=0.00 row",
    legacyAv.ok === true && afterAv.availability === "limited", { legacyAv, afterAv });
  check("LEGACY COMPAT: the availability write preserved price and price_version byte-identically",
    afterAv.price === legacyBefore.price && afterAv.price_version === legacyBefore.price_version,
    { legacyBefore, afterAv });
  const rawLegacy = await q(`update public.branch_menu_items
    set branch_specific_name = 'renamed' where id='c1-bmi-zero2'
    returning price::text as price, price_version::text as v`);
  check("LEGACY COMPAT: an unrelated direct column write on a zero-priced row is not refused",
    rawLegacy.length === 1 && rawLegacy[0].price === "0.00" && rawLegacy[0].v === "0", rawLegacy);

  // ------------------------------------------------- mutation, stale, no-change, ABA
  const beforeMutation = await row("c1-bmi-a");
  const nextVersion = String(Number(beforeMutation.price_version) + 1);
  const m1 = await setPrice(OWNER_A, ["c1-bmi-a", beforeMutation.price, "180", beforeMutation.price_version]);
  const r1 = await row("c1-bmi-a");
  check("the owner applies 150 -> 180 and the version advances exactly once",
    m1.ok === true && m1.price === "180.00" && m1.priceVersion === nextVersion
    && r1.price === "180.00" && r1.price_version === nextVersion, { beforeMutation, m1, r1 });
  check("INDEPENDENCE: the price write left sold_out, availability and both their versions byte-identical",
    r1.sold_out === beforeMutation.sold_out && r1.sold_out_version === beforeMutation.sold_out_version
    && r1.availability === beforeMutation.availability
    && r1.availability_version === beforeMutation.availability_version, { beforeMutation, r1 });
  const auditCountAfterFirst = await priceAudit();
  check("INDEPENDENCE: the price write wrote no predecessor audit row",
    (await avAudit()) === 1 && (await soAudit()) === 1);
  check("cross-tenant mutation is target_not_found",
    (await setPrice(OWNER_B, ["c1-bmi-a", "180.00", "190", nextVersion])).errorCode === "target_not_found");
  check("a manager mutation is permission_denied",
    (await setPrice(MANAGER, ["c1-bmi-a", "180.00", "190", nextVersion])).errorCode === "permission_denied");
  check("an unauthenticated mutation is refused",
    (await setPrice(null, ["c1-bmi-a", "180.00", "190", nextVersion])).errorCode === "unauthenticated");
  check("replaying a superseded version is stale",
    (await setPrice(OWNER_A, ["c1-bmi-a", "150.00", "190", "0"])).errorCode === "stale_state");
  check("a mismatched expected price at the right version is stale",
    (await setPrice(OWNER_A, ["c1-bmi-a", "170.00", "190", nextVersion])).errorCode === "stale_state");
  check("the right price at a wrong version is stale",
    (await setPrice(OWNER_A, ["c1-bmi-a", "180.00", "190", "9999"])).errorCode === "stale_state");
  check("requesting the price that already holds is no_change",
    (await setPrice(OWNER_A, ["c1-bmi-a", "180.00", "180", nextVersion])).errorCode === "no_change");
  check("an equal price written differently is still no_change, by numeric comparison",
    (await setPrice(OWNER_A, ["c1-bmi-a", "180", "180", nextVersion])).errorCode === "no_change");
  check("refusals wrote no further audit row", (await priceAudit()) === auditCountAfterFirst);
  const m2 = await setPrice(OWNER_A, ["c1-bmi-a", "180.00", "150", nextVersion]);
  const r2 = await row("c1-bmi-a");
  const afterM2 = String(Number(nextVersion) + 1);
  check("a reduction 180 -> 150 advances the version again",
    m2.ok === true && m2.price === "150.00" && m2.priceVersion === afterM2
    && r2.price === "150.00" && r2.price_version === afterM2, { m2, r2 });
  check("ABA: the row's very first 150.00/v0 precondition is stale even though the price is 150.00 again",
    (await setPrice(OWNER_A, ["c1-bmi-a", "150.00", "180", "0"])).errorCode === "stale_state");

  // ------------------------------------------------- reverse independence
  const priceBefore = await row("c1-bmi-a");
  await setSold(OWNER_A, ["c1-bmi-a", false, true, "0"]);
  await setAv(OWNER_A, ["c1-bmi-a", "available", "limited", "0"]);
  const r3 = await row("c1-bmi-a");
  check("INDEPENDENCE: predecessor writes left price and price_version byte-identical",
    r3.price === priceBefore.price && r3.price_version === priceBefore.price_version, { priceBefore, r3 });
  check("INDEPENDENCE: predecessor writes wrote no price audit row",
    (await priceAudit()) === auditCountAfterFirst + 1);

  // ------------------------------------------------- trigger tamper resistance
  const forcedVersion = await q(`update public.branch_menu_items set price_version = 99
    where id='c1-bmi-a' returning price_version`);
  check("a direct attempt to set price_version is discarded by the trigger",
    forcedVersion[0].price_version === afterM2, { forcedVersion, expected: afterM2 });
  const unrelated = await q(`update public.branch_menu_items set branch_specific_name = 'x'
    where id='c1-bmi-a' returning price_version, availability_version, sold_out_version`);
  check("an unrelated column write advances no version counter",
    unrelated[0].price_version === afterM2, { unrelated, expected: afterM2 });
  const directBad = await q(`select (select count(*)::int from (
    select 1) t) as n`).then(async () => {
    try {
      await q(`update public.branch_menu_items set price = 0 where id='c1-bmi-a'`);
      return { refused: false };
    } catch (e) { return { refused: true, code: e.code }; }
  });
  check("DEFENCE IN DEPTH: even a direct superuser UPDATE to a non-canonical price is refused by the trigger",
    directBad.refused === true, directBad);
  const directFractional = await (async () => {
    try {
      await q(`update public.branch_menu_items set price = 150.55 where id='c1-bmi-a'`);
      return { refused: false };
    } catch (e) { return { refused: true, code: e.code }; }
  })();
  check("DEFENCE IN DEPTH: a direct fractional price change is refused rather than rounded",
    directFractional.refused === true, directFractional);
  check("the refused direct writes left the row untouched", (await row("c1-bmi-a")).price === "150.00");

  // ------------------------------------------------- audit atomicity
  await q(`create function restaurant_internal.c1_fail() returns trigger language plpgsql as $f$
    begin raise exception 'injected audit failure'; end $f$;
    create trigger c1_fail before insert on ${PRICE_AUDIT} for each row execute function restaurant_internal.c1_fail();`);
  const beforeAtomic = await row("c1-bmi-a");
  const atomicCount = await priceAudit();
  const atomic = await setPrice(OWNER_A,
    ["c1-bmi-a", beforeAtomic.price, "175", beforeAtomic.price_version]);
  const afterAtomic = await row("c1-bmi-a");
  check("a failing audit insert rolls the price change back",
    atomic.thrown !== undefined && JSON.stringify(afterAtomic) === JSON.stringify(beforeAtomic),
    { atomic, beforeAtomic, afterAtomic });
  check("the failed attempt left the audit relation unchanged", (await priceAudit()) === atomicCount);
  await q(`drop trigger c1_fail on ${PRICE_AUDIT}; drop function restaurant_internal.c1_fail();`);

  // ------------------------------------------------- the audit relation cannot be rewritten
  const auditTamper = await asWriterRole(PRICE_ROLE, OWNER_A,
    `update ${PRICE_AUDIT} set next_price = 1 where true returning id`);
  check("the sealed writer cannot rewrite its own audit history",
    auditTamper.length === 1 && auditTamper[0].thrown !== undefined, auditTamper);
  const auditDelete = await asWriterRole(PRICE_ROLE, OWNER_A, `delete from ${PRICE_AUDIT} where true returning id`);
  check("the sealed writer cannot delete its own audit history",
    auditDelete.length === 1 && auditDelete[0].thrown !== undefined, auditDelete);

  // ------------------------------------------------- no client path around the RPCs
  const clientDirect = await asClient(OWNER_A,
    `select (select count(*)::int from public.branch_menu_items) as out`);
  check("an authenticated client still has no direct table access to branch_menu_items",
    clientDirect.thrown !== undefined, clientDirect);
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
