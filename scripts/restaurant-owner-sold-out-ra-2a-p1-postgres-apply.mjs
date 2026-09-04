#!/usr/bin/env node
// RA-2A-P1 REAL PostgreSQL 17.6 non-superuser apply and authority gate.
//
// Static SQL checks cannot prove a migration compiles, and a SUPERUSER apply cannot prove it
// deploys: SR-2K-B passed 23/23 on a superuser cluster and was then refused by Development, because
// ownership checks, role-membership options and RLS all behave differently for a superuser. This
// harness therefore applies the EXACT frozen predecessor schema and then the EXACT RA-2A-P1 migration
// to a disposable real cluster THROUGH A NON-SUPERUSER RUNNER, through COMMIT, and exercises the
// resulting authority with real queries.
//
// It is opt-in because it needs PostgreSQL binaries that are not part of this repository:
//   RA2AP1_PG_BIN      directory containing initdb/postgres executables (PostgreSQL 17.x)
//   RA2AP1_PG_MODULES  directory containing a node_modules with the `pg` client
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

const SUITE = "restaurant-owner-sold-out-ra-2a-p1-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260904020000_platform_admin_branch_status_authority.sql";
const CANDIDATE = "20260904030000_restaurant_owner_branch_menu_item_sold_out_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;

const PG_BIN = process.env.RA2AP1_PG_BIN?.trim();
const PG_MODULES = process.env.RA2AP1_PG_MODULES?.trim();
if (!PG_BIN || !PG_MODULES || !fs.existsSync(path.join(PG_BIN, "initdb.exe")) && !fs.existsSync(path.join(PG_BIN, "initdb"))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RA2AP1_PG_BIN and RA2AP1_PG_MODULES to a PostgreSQL 17.x binary directory and a node_modules containing `pg`"
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
    if (entry.isDirectory() && entry.name.startsWith("ra2ap1-data-")) {
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
  const dataDir = path.join(workDir, `ra2ap1-data-${process.pid}-${Date.now()}`);
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

const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? "/tmp", "ra2ap1-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
reapStrays(workDir);
const watchdog = setTimeout(() => {
  console.error("watchdog: harness exceeded its budget; failing closed");
  for (const cluster of [...ACTIVE]) { try { cluster.stop(); } catch { /* best effort */ } }
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref?.();

const FN = "public.restaurant_owner_set_branch_menu_item_sold_out_v1(text,boolean,boolean,bigint)";
const WRITER = "restaurant_owner_branch_menu_item_write_authority";
const AUDIT = "restaurant_internal.branch_menu_item_sold_out_audit_log";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const MANAGER = "33333333-3333-4333-8333-333333333333";
const STAFF = "44444444-4444-4444-8444-444444444444";
const STRANGER = "55555555-5555-4555-8555-555555555555";

let cluster;
let client;
let runner;
let applied = 0;
let candidates = [];
try {
  cluster = await startCluster(workDir);
  client = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  await client.connect();
  const q = async (sql, params) => (await client.query(sql, params)).rows;
  await client.query(BOOTSTRAP);

  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await runner.connect();
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migrations are applied by a non-superuser runner, as the platform applies them",
    identity.current_user === "postgres" && identity.superuser === "off", identity);

  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    try {
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
  check("all frozen predecessors and RA-2A-P1 apply through COMMIT", applied === files.length,
    { applied, total: files.length });
  check("the round contributes exactly one RA-2A-P1 migration",
    candidates.length === 1 && candidates[0] === CANDIDATE, candidates);

  // ---------------------------------------------------------------- permission catalogue
  const perms = await q(`select role.role_key, permission.permission_scope
    from public.role_permissions permission join public.restaurant_roles role on role.id = permission.role_id
    where permission.permission_key = 'branch_menu_item.sold_out.write' order by 1`);
  check("exactly one sold-out permission row exists, on owner, at restaurant scope",
    perms.length === 1 && perms[0].role_key === "owner" && perms[0].permission_scope === "restaurant", perms);
  const others = await q(`select role.role_key from public.role_permissions permission
    join public.restaurant_roles role on role.id = permission.role_id
    where permission.permission_key = 'branch_menu_item.sold_out.write'
      and role.role_key in ('manager','staff')`);
  check("manager and staff hold no sold-out permission", others.length === 0, others);
  const vocab = (await q(`select pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid='public.role_permissions'::regclass and conname='role_permissions_permission_key_check'`))[0];
  check("the permission vocabulary widened by exactly one key",
    vocab.def.includes("branch_menu_item.sold_out.write")
    && !/\.(write|create|update|delete|approve|manage)'/.test(vocab.def.replace("branch_menu_item.sold_out.write", "")), vocab);

  // ---------------------------------------------------------------- version column and trigger
  const col = (await q(`select data_type, is_nullable, column_default from information_schema.columns
    where table_schema='public' and table_name='branch_menu_items' and column_name='sold_out_version'`))[0];
  check("sold_out_version is bigint not null default 0",
    col && col.data_type === "bigint" && col.is_nullable === "NO" && col.column_default === "0", col);
  const nonneg = await q(`select 1 from pg_constraint where conrelid='public.branch_menu_items'::regclass
    and conname='branch_menu_items_sold_out_version_non_negative'`);
  check("a non-negative version invariant exists", nonneg.length === 1);
  const trg = (await q(`select pg_get_triggerdef(oid) as def from pg_trigger
    where tgrelid='public.branch_menu_items'::regclass and tgname='branch_menu_items_sold_out_version_maintain'`))[0];
  check("a before insert-or-update row trigger maintains the version",
    trg && /BEFORE INSERT OR UPDATE ON public\.branch_menu_items FOR EACH ROW/.test(trg.def), trg);

  // ---------------------------------------------------------------- sealed role
  const role = (await q(`select rolcanlogin,rolinherit,rolbypassrls,rolsuper,rolcreatedb,rolcreaterole,rolreplication
    from pg_roles where rolname=$1`, [WRITER]))[0];
  check("the sealed writer exists and is sealed in every attribute",
    role && !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls && !role.rolsuper
    && !role.rolcreatedb && !role.rolcreaterole && !role.rolreplication, role);
  const clientMembers = await q(`select g.rolname from pg_auth_members a
    join pg_roles r on r.oid=a.roleid join pg_roles g on g.oid=a.member
    where r.rolname=$1 and g.rolname in ('anon','authenticated','authenticator','service_role')`, [WRITER]);
  check("no client or runtime role is a member of the sealed writer", clientMembers.length === 0, clientMembers);
  const transient = await q(`select g.rolname, a.admin_option, a.inherit_option, a.set_option
    from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles g on g.oid=a.member
    where r.rolname=$1 and g.rolname='postgres' and a.grantor=(select oid from pg_roles where rolname='postgres')`, [WRITER]);
  check("the migration released its own transient sealed-role membership", transient.length === 0, transient);

  // ---------------------------------------------------------------- ACL surface
  const acl = (await q(`select
    has_function_privilege('authenticated','${FN}','EXECUTE') authed,
    has_function_privilege('anon','${FN}','EXECUTE') anon,
    has_function_privilege('service_role','${FN}','EXECUTE') service,
    has_function_privilege('authenticator','${FN}','EXECUTE') authr,
    has_table_privilege('authenticated','public.branch_menu_items','UPDATE') client_update,
    has_table_privilege('anon','public.branch_menu_items','UPDATE') anon_update,
    has_table_privilege('service_role','public.branch_menu_items','UPDATE') service_update,
    has_column_privilege('${WRITER}','public.branch_menu_items','sold_out','UPDATE') w_sold_out,
    has_column_privilege('${WRITER}','public.branch_menu_items','sold_out_version','UPDATE') w_version,
    has_column_privilege('${WRITER}','public.branch_menu_items','price','UPDATE') w_price,
    has_column_privilege('${WRITER}','public.branch_menu_items','availability','UPDATE') w_avail,
    has_column_privilege('${WRITER}','public.branch_menu_items','branch_specific_status','UPDATE') w_status,
    has_column_privilege('${WRITER}','public.branch_menu_items','restaurant_id','UPDATE') w_tenant,
    has_table_privilege('${WRITER}','public.branch_menu_items','UPDATE') w_table_update,
    has_table_privilege('${WRITER}','public.branch_menu_items','DELETE') w_delete,
    has_table_privilege('${WRITER}','public.branch_menu_items','INSERT') w_insert`))[0];
  check("only authenticated may execute the fixed RPC",
    acl.authed && !acl.anon && !acl.service && !acl.authr, acl);
  check("no client role holds table UPDATE on branch_menu_items",
    !acl.client_update && !acl.anon_update && !acl.service_update, acl);
  check("the sealed writer may write sold_out and nothing else",
    acl.w_sold_out && !acl.w_version && !acl.w_price && !acl.w_avail && !acl.w_status && !acl.w_tenant, acl);
  check("the sealed writer holds no broad table UPDATE, INSERT or DELETE",
    !acl.w_table_update && !acl.w_delete && !acl.w_insert, acl);
  const fnMeta = (await q(`select pg_get_userbyid(proowner) as owner, prosecdef, proconfig::text as config
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='restaurant_owner_set_branch_menu_item_sold_out_v1'`))[0];
  check("the RPC is SECURITY DEFINER, owned by the sealed writer, with pinned search_path and row_security",
    fnMeta.owner === WRITER && fnMeta.prosecdef
    && /search_path=/.test(fnMeta.config) && /row_security=on/.test(fnMeta.config), fnMeta);

  // ---------------------------------------------------------------- audit relation
  const auditAcl = (await q(`select
    has_table_privilege('authenticated','${AUDIT}','SELECT') a_sel,
    has_table_privilege('anon','${AUDIT}','SELECT') n_sel,
    has_table_privilege('service_role','${AUDIT}','SELECT') s_sel,
    has_schema_privilege('authenticated','restaurant_internal','USAGE') a_schema,
    has_table_privilege('${WRITER}','${AUDIT}','SELECT') w_sel,
    has_table_privilege('${WRITER}','${AUDIT}','INSERT') w_ins,
    has_table_privilege('${WRITER}','${AUDIT}','UPDATE') w_upd,
    has_table_privilege('${WRITER}','${AUDIT}','DELETE') w_del,
    (select relforcerowsecurity from pg_class where oid='${AUDIT}'::regclass) forced`))[0];
  check("no client role reaches the private audit relation or its schema",
    !auditAcl.a_sel && !auditAcl.n_sel && !auditAcl.s_sel && !auditAcl.a_schema, auditAcl);
  check("the audit relation is append-only for the sealed writer, under FORCE row level security",
    auditAcl.w_sel && auditAcl.w_ins && !auditAcl.w_upd && !auditAcl.w_del && auditAcl.forced, auditAcl);
  const auditPolicies = await q(`select polcmd from pg_policy where polrelid='${AUDIT}'::regclass`);
  check("the audit relation carries no UPDATE, DELETE or ALL policy",
    auditPolicies.every((p) => p.polcmd === "r" || p.polcmd === "a"), auditPolicies);

  // ---------------------------------------------------------------- live authority fixtures
  await q(`insert into auth.users(id,email) values
      ($1,'owner-a@test.invalid'),($2,'owner-b@test.invalid'),($3,'mgr@test.invalid'),
      ($4,'staff@test.invalid'),($5,'stranger@test.invalid')`,
    [OWNER_A, OWNER_B, MANAGER, STAFF, STRANGER]);
  await q(`insert into public.restaurants(id,name,status) values
      ('ra2a-rest-a','A','active'),('ra2a-rest-b','B','draft')`);
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status) values
      ('ra2a-branch-a','ra2a-rest-a','A branch','active'),
      ('ra2a-branch-b','ra2a-rest-b','B branch','active')`);
  await q(`insert into public.menus(id,restaurant_id,name,status) values
      ('ra2a-menu-a','ra2a-rest-a','A menu','published'),('ra2a-menu-b','ra2a-rest-b','B menu','published')`);
  await q(`insert into public.menu_categories(id,menu_id,name) values
      ('ra2a-cat-a','ra2a-menu-a','A cat'),('ra2a-cat-b','ra2a-menu-b','B cat')`);
  await q(`insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values
      ('ra2a-item-a','ra2a-rest-a','ra2a-cat-a','A item','active'),
      ('ra2a-item-b','ra2a-rest-b','ra2a-cat-b','B item','active')`);
  await q(`insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability)
      values ('ra2a-bmi-a','ra2a-rest-a','ra2a-branch-a','ra2a-item-a',10,'available'),
             ('ra2a-bmi-b','ra2a-rest-b','ra2a-branch-b','ra2a-item-b',20,'available')`);
  const users = await q(`insert into public.restaurant_users(auth_user_id,login_status) values
      ($1,'enabled'),($2,'enabled'),($3,'enabled'),($4,'enabled') returning id, auth_user_id`,
    [OWNER_A, OWNER_B, MANAGER, STAFF]);
  const uid = (a) => users.find((u) => u.auth_user_id === a).id;
  const roleId = async (key) => (await q(`select id from public.restaurant_roles where role_key=$1`, [key]))[0].id;
  await q(`insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values
      ($1,'ra2a-rest-a',$5,'active'),($2,'ra2a-rest-b',$5,'active'),
      ($3,'ra2a-rest-a',$6,'active'),($4,'ra2a-rest-a',$7,'active')`,
    [uid(OWNER_A), uid(OWNER_B), uid(MANAGER), uid(STAFF), await roleId("owner"), await roleId("manager"), await roleId("staff")]);

  const call = async (actor, args) => {
    const c = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
    await c.connect();
    try {
      await c.query("begin");
      if (actor) await c.query(`select set_config('request.jwt.claim.sub',$1,true)`, [actor]);
      await c.query("set local role authenticated");
      const r = await c.query(`select public.restaurant_owner_set_branch_menu_item_sold_out_v1($1,$2,$3,$4::bigint) as out`, args);
      await c.query("commit");
      return r.rows[0].out;
    } catch (e) { try { await c.query("rollback"); } catch {} return { thrown: e.code + " " + e.message.slice(0, 120) }; }
    finally { await c.end(); }
  };
  const target = async (id) => (await q(`select sold_out, sold_out_version, price, availability,
    branch_specific_status, restaurant_id, branch_id, menu_item_id from public.branch_menu_items where id=$1`, [id]))[0];
  const auditRows = async () => q(`select actor_auth_user_id, membership_id, restaurant_id, branch_id,
    branch_menu_item_id, previous_sold_out, next_sold_out, previous_sold_out_version, next_sold_out_version
    from ${AUDIT} order by created_at, id`);

  // Development's `postgres` holds these client memberships; the disposable bootstrap does not, and
  // the harness must be able to SET ROLE authenticated to call the RPC the way a client does.
  await q(`grant anon, authenticated, service_role to postgres`);

  const anon0 = await call(null, ["ra2a-bmi-a", false, true, "0"]);
  check("an unauthenticated caller is refused", anon0.errorCode === "unauthenticated", anon0);
  check("an authenticated non-member is refused with permission_denied",
    (await call(STRANGER, ["ra2a-bmi-a", false, true, "0"])).errorCode === "permission_denied");
  check("a manager is refused with permission_denied",
    (await call(MANAGER, ["ra2a-bmi-a", false, true, "0"])).errorCode === "permission_denied");
  check("staff are refused with permission_denied",
    (await call(STAFF, ["ra2a-bmi-a", false, true, "0"])).errorCode === "permission_denied");
  const cross = await call(OWNER_B, ["ra2a-bmi-a", false, true, "0"]);
  check("a wrong-restaurant owner cannot reach another tenant's row, and learns nothing about it",
    cross.errorCode === "target_not_found", cross);
  const ghost = await call(OWNER_B, ["ra2a-bmi-does-not-exist", false, true, "0"]);
  check("a nonexistent id is indistinguishable from a cross-tenant one",
    ghost.errorCode === "target_not_found" && ghost.errorCode === cross.errorCode, { ghost, cross });
  for (const [label, args] of [
    ["null id", [null, false, true, "0"]], ["empty id", ["", false, true, "0"]],
    ["null expected", ["ra2a-bmi-a", null, true, "0"]], ["null next", ["ra2a-bmi-a", false, null, "0"]],
    ["negative version", ["ra2a-bmi-a", false, true, "-1"]], ["null version", ["ra2a-bmi-a", false, true, null]]
  ]) check(`a malformed request (${label}) is bounded as invalid_request`,
    (await call(OWNER_A, args)).errorCode === "invalid_request");
  check("cross-tenant and malformed refusals wrote no audit row", (await auditRows()).length === 0);

  const first = await call(OWNER_A, ["ra2a-bmi-a", false, true, "0"]);
  const afterFirst = await target("ra2a-bmi-a");
  check("the authorised owner applies the transition and the version advances exactly once",
    first.ok === true && first.soldOut === true && first.soldOutVersion === "1"
    && afterFirst.sold_out === true && afterFirst.sold_out_version === "1", { first, afterFirst });
  check("the version crosses the boundary as a decimal string, never a JSON number",
    typeof first.soldOutVersion === "string");
  check("unrelated columns are untouched by the transition",
    afterFirst.price === "10.00" && afterFirst.availability === "available"
    && afterFirst.branch_specific_status === "available" && afterFirst.restaurant_id === "ra2a-rest-a"
    && afterFirst.branch_id === "ra2a-branch-a" && afterFirst.menu_item_id === "ra2a-item-a", afterFirst);
  const a1 = await auditRows();
  check("exactly one applied transition is audited, with server-derived actor and membership",
    a1.length === 1 && a1[0].actor_auth_user_id === OWNER_A && a1[0].membership_id
    && a1[0].restaurant_id === "ra2a-rest-a" && a1[0].branch_id === "ra2a-branch-a"
    && a1[0].branch_menu_item_id === "ra2a-bmi-a" && a1[0].previous_sold_out === false
    && a1[0].next_sold_out === true && a1[0].previous_sold_out_version === "0"
    && a1[0].next_sold_out_version === "1", a1);

  check("replaying the original expected version is stale, not a second write",
    (await call(OWNER_A, ["ra2a-bmi-a", false, true, "0"])).errorCode === "stale_state");
  check("a mismatched expected state is stale",
    (await call(OWNER_A, ["ra2a-bmi-a", false, false, "1"])).errorCode === "stale_state");
  check("requesting the state that already holds is no_change, not a write",
    (await call(OWNER_A, ["ra2a-bmi-a", true, true, "1"])).errorCode === "no_change");
  check("stale and no_change refusals wrote no audit row", (await auditRows()).length === 1);

  const second = await call(OWNER_A, ["ra2a-bmi-a", true, false, "1"]);
  const afterSecond = await target("ra2a-bmi-a");
  check("canonical recovery returns the business state and advances the version again",
    second.ok === true && second.soldOutVersion === "2"
    && afterSecond.sold_out === false && afterSecond.sold_out_version === "2", { second, afterSecond });
  check("the recovery is audited as a second applied transition", (await auditRows()).length === 2);
  const aba = await call(OWNER_A, ["ra2a-bmi-a", false, true, "0"]);
  check("ABA: the original false/version-0 precondition is stale even though sold_out is false again",
    aba.errorCode === "stale_state" && afterSecond.sold_out === false, { aba, afterSecond });

  // The counter is the database's, not the caller's.
  const forced = await q(`update public.branch_menu_items set sold_out_version = 99
    where id='ra2a-bmi-a' returning sold_out_version`);
  check("a direct attempt to set the version is discarded by the trigger",
    forced[0].sold_out_version === "2", forced);
  const unrelated = await q(`update public.branch_menu_items set price = 11
    where id='ra2a-bmi-a' returning sold_out_version, price`);
  check("writing an unrelated column does not advance the version",
    unrelated[0].sold_out_version === "2", unrelated);
  await q(`update public.branch_menu_items set price = 10 where id='ra2a-bmi-a'`);

  // Atomicity: make the audit insert fail and prove the business write rolls back with it.
  await q(`create function restaurant_internal.ra2a_audit_fail() returns trigger language plpgsql as $f$
    begin raise exception 'injected audit failure'; end $f$;
    create trigger ra2a_audit_fail before insert on ${AUDIT}
      for each row execute function restaurant_internal.ra2a_audit_fail();`);
  const beforeAtomic = await target("ra2a-bmi-a");
  const atomic = await call(OWNER_A, ["ra2a-bmi-a", false, true, "2"]);
  const afterAtomic = await target("ra2a-bmi-a");
  check("a failing audit insert rolls the business mutation back: no changed row without evidence",
    atomic.thrown !== undefined && afterAtomic.sold_out === beforeAtomic.sold_out
    && afterAtomic.sold_out_version === beforeAtomic.sold_out_version, { atomic, beforeAtomic, afterAtomic });
  check("the failed attempt left the audit relation unchanged", (await auditRows()).length === 2);
  await q(`drop trigger ra2a_audit_fail on ${AUDIT}; drop function restaurant_internal.ra2a_audit_fail();`);

  const finalTarget = await target("ra2a-bmi-a");
  check("the fixture ends at its original business state with the version intentionally advanced",
    finalTarget.sold_out === false && finalTarget.sold_out_version === "2", finalTarget);
  const untouched = await target("ra2a-bmi-b");
  check("the other tenant's row was never touched",
    untouched.sold_out === false && untouched.sold_out_version === "0", untouched);
} catch (error) {
  if (failures.length === 0) check("harness executed without an unexpected error", false, String(error.message).slice(0, 400));
} finally {
  try { await runner?.end(); } catch { /* already closed */ }
  try { await client?.end(); } catch { /* already closed */ }
  try { cluster?.stop(); } catch { /* best effort */ }
  clearTimeout(watchdog);
}

console.log("\n" + JSON.stringify({
  suite: SUITE, status: failures.length === 0 ? "passed" : "failed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name), migrationsApplied: applied, candidates
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
