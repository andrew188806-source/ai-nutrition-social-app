#!/usr/bin/env node
// REC-B-P0 disposable PostgreSQL apply gate. Applies every repository migration through COMMIT as
// the same kind of non-superuser runner used by Supabase, then exercises only synthetic local data.
// It never connects to Development or Production.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "recommendation-rec-b-p0-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260826010000_restaurant_geocode_source_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;
const argument = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const PG_BIN = (argument("--pg-bin") ?? process.env.RECBP0_PG_BIN ?? process.env.GEO1CP0_PG_BIN)?.trim();
const PG_MODULES = (argument("--pg-modules") ?? process.env.RECBP0_PG_MODULES ?? process.env.GEO1CP0_PG_MODULES)?.trim();

if (!PG_BIN || !PG_MODULES
  || !fs.existsSync(path.join(PG_BIN, process.platform === "win32" ? "initdb.exe" : "initdb"))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RECBP0_PG_BIN and RECBP0_PG_MODULES to PostgreSQL 17.x binaries and node_modules containing pg",
    networkUsed: false,
    developmentTouched: false,
    productionTouched: false
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
  id uuid primary key default gen_random_uuid(), email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
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
grant supabase_storage_admin to postgres with admin option;
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
const treeKill = (pid) => {
  if (!pid) return;
  if (process.platform === "win32") child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else { try { process.kill(-pid, "SIGKILL"); } catch { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } } }
};
const removeDir = (directory) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { fs.rmSync(directory, { recursive: true, force: true }); return; } catch { /* handles closing */ }
  }
};
const teardown = () => { for (const cluster of [...ACTIVE]) cluster.stop(); };
process.on("exit", teardown);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(signal, () => { teardown(); process.exit(130); });
}
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address(); server.close(() => resolve(port));
  });
  server.on("error", reject);
});
async function startCluster(workDir) {
  const dataDir = path.join(workDir, `recbp0-data-${process.pid}-${Date.now()}`);
  const logFile = `${dataDir}.log`;
  const init = child.spawnSync(exe("initdb"),
    ["-D", dataDir, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"],
    { encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const port = await freePort();
  const out = fs.openSync(logFile, "a");
  const server = child.spawn(exe("postgres"), ["-D", dataDir, "-p", String(port),
    "-c", "listen_addresses=127.0.0.1", "-c", "fsync=off", "-c", "full_page_writes=off",
    "-c", "synchronous_commit=off"], { detached: true, windowsHide: true, stdio: ["ignore", out, out] });
  server.unref();
  let stopped = false;
  const cluster = { port, stop() {
    if (stopped) return; stopped = true; ACTIVE.delete(cluster); treeKill(server.pid);
    try { fs.closeSync(out); } catch { /* closed */ } removeDir(dataDir);
    try { fs.rmSync(logFile, { force: true }); } catch { /* closing */ }
  } };
  ACTIVE.add(cluster);
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const probe = new Client({ host: "127.0.0.1", port, user: "supabase_admin", database: "postgres" });
    try { await probe.connect(); await probe.query("select 1"); await probe.end(); return cluster; }
    catch { try { await probe.end(); } catch { /* not connected */ } }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  cluster.stop(); throw new Error("postgres did not become ready");
}

const checks = []; const failures = [];
const check = (name, pass, detail) => {
  const item = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
};
const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? ROOT, "recbp0-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith("recbp0-data-")) removeDir(path.join(workDir, entry.name));
}
const watchdog = setTimeout(() => { teardown(); process.exit(1); }, WATCHDOG_MS);
watchdog.unref?.();

let cluster; let client; let runner; let applied = 0; let candidates = []; let unexpectedError = null;
try {
  cluster = await startCluster(workDir);
  client = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  await client.connect();
  const q = async (sql, params) => (await client.query(sql, params)).rows;
  await client.query(BOOTSTRAP);
  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await runner.connect();
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migrations run as postgres without superuser bypass", identity.current_user === "postgres" && identity.superuser === "off", identity);
  const files = fs.readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    try { await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8")); applied += 1; if (file > BASELINE_LAST) candidates.push(file); }
    catch (error) { check(`migration applies through COMMIT: ${file}`, false, { code: error.code, message: error.message }); throw error; }
  }
  check("the frozen schema and REC-B-P0 apply through COMMIT", applied === files.length, { applied, total: files.length });
  check("the round contributes exactly one candidate Taste migration",
    candidates.length === 1 && candidates[0] === "20260828010000_candidate_taste_data_authority.sql", candidates);

  await q(`insert into public.restaurants (id,name,status) values
    ('recbp0-r-a','REC-B fixture A','active'),('recbp0-r-b','REC-B fixture B','active')`);
  await q(`insert into public.restaurant_branches (id,restaurant_id,name,status) values
    ('recbp0-b-a1','recbp0-r-a','A1','active'),('recbp0-b-a2','recbp0-r-a','A2','active'),
    ('recbp0-b-b1','recbp0-r-b','B1','active')`);
  await q(`insert into public.menus (id,restaurant_id,name,status) values
    ('recbp0-menu-a','recbp0-r-a','A','published'),('recbp0-menu-b','recbp0-r-b','B','published')`);
  await q(`insert into public.menu_categories (id,menu_id,name) values
    ('recbp0-cat-a','recbp0-menu-a','Fixture'),('recbp0-cat-b','recbp0-menu-b','Fixture')`);
  await q(`insert into public.menu_items (id,restaurant_id,menu_category_id,name,status) values
    ('recbp0-item-full','recbp0-r-a','recbp0-cat-a','Full','active'),
    ('recbp0-item-partial','recbp0-r-a','recbp0-cat-a','Partial','active'),
    ('recbp0-item-unknown','recbp0-r-b','recbp0-cat-b','Unknown','active')`);
  await q(`insert into public.branch_menu_items (id,restaurant_id,branch_id,menu_item_id,price,availability) values
    ('recbp0-offer-full-a1','recbp0-r-a','recbp0-b-a1','recbp0-item-full',100,'available'),
    ('recbp0-offer-full-a2','recbp0-r-a','recbp0-b-a2','recbp0-item-full',100,'available'),
    ('recbp0-offer-partial','recbp0-r-a','recbp0-b-a1','recbp0-item-partial',100,'available'),
    ('recbp0-offer-unknown','recbp0-r-b','recbp0-b-b1','recbp0-item-unknown',100,'available')`);
  await q(`insert into public.menu_item_nutrition
    (id,menu_item_id,calories,protein,carbohydrates,fat,fiber,source,confidence_score,verified_status,is_current)
    values
    ('recbp0-n-full','recbp0-item-full',500,30,50,20,5,'restaurant_verified',1,'verified',true),
    ('recbp0-n-partial','recbp0-item-partial',510,20,55,18,4,'restaurant_verified',1,'verified',true),
    ('recbp0-n-unknown','recbp0-item-unknown',520,18,60,15,3,'restaurant_verified',1,'verified',true)`);
  const orderBefore = (await q(`select candidate_id from public.consumer_public_next_meal_candidates_v1
    where candidate_id like 'recbp0-%' order by candidate_id`)).map((row) => row.candidate_id);

  await q(`insert into public.candidate_taste_values (taxonomy_version,facet_key,value_key) values
    ('candidate-taste-v1','cuisine','cuisine.fixture'),
    ('candidate-taste-v1','cuisine','cuisine.fusion'),
    ('candidate-taste-v1','flavor','flavor.savory'),
    ('candidate-taste-v1','spice','spice.medium'),
    ('candidate-taste-v1','flavor','flavor.retired')`);
  await q(`update public.candidate_taste_values set active=false, retired_at=clock_timestamp()
    where taxonomy_version='candidate-taste-v1' and facet_key='flavor' and value_key='flavor.retired'`);
  await q(`insert into public.candidate_taste_mappings
    (restaurant_id,taxonomy_version,facet_key,value_key,provenance,source_reference) values
    ('recbp0-r-a','candidate-taste-v1','cuisine','cuisine.fixture','restaurant_verified','fixture:restaurant'),
    ('recbp0-r-a','candidate-taste-v1','spice','spice.medium','provider_imported','fixture:provider'),
    ('recbp0-r-a','candidate-taste-v1','meal_type','lunch','canonical_mapping','fixture:restaurant-meal')`);
  await q(`insert into public.candidate_taste_mappings
    (menu_item_id,taxonomy_version,facet_key,value_key,provenance,source_reference) values
    ('recbp0-item-full','candidate-taste-v1','cuisine','cuisine.fixture','admin_verified','fixture:override'),
    ('recbp0-item-full','candidate-taste-v1','cuisine','cuisine.fusion','admin_verified','fixture:multi'),
    ('recbp0-item-full','candidate-taste-v1','flavor','flavor.savory','canonical_mapping','fixture:canonical'),
    ('recbp0-item-full','candidate-taste-v1','meal_type','lunch','restaurant_verified','fixture:meal'),
    ('recbp0-item-partial','candidate-taste-v1','meal_type','dinner','restaurant_verified','fixture:partial'),
    ('recbp0-item-full','candidate-taste-v1','flavor','flavor.retired','admin_verified','fixture:retired')`);

  const facts = await q(`select * from public.consumer_public_next_meal_candidate_taste_facts_v1
    where candidate_id like 'recbp0-%' order by candidate_id,facet_key,value_key`);
  const states = await q(`select * from public.consumer_public_next_meal_candidate_taste_state_v1
    where candidate_id like 'recbp0-%' order by candidate_id`);
  const byState = new Map(states.map((row) => [row.candidate_id, row]));
  const facetsOf = (id) => [...new Set(facts.filter((r) => r.candidate_id === id).map((r) => r.facet_key))].sort();
  const valuesOf = (id, facet) => facts.filter((r) => r.candidate_id === id && r.facet_key === facet)
    .map((r) => r.value_key).sort();
  check("fully mapped offers know all four facets",
    ["recbp0-offer-full-a1", "recbp0-offer-full-a2"].every((id) =>
      JSON.stringify(facetsOf(id)) === JSON.stringify(["cuisine", "flavor", "meal_type", "spice"])));
  // FACET-LEVEL SPECIFICITY, proven three ways on real PostgreSQL.
  check("a menu facet fully replaces the restaurant facet, keeping BOTH menu values",
    JSON.stringify(valuesOf("recbp0-offer-full-a1", "cuisine")) === JSON.stringify(["cuisine.fixture", "cuisine.fusion"])
    && facts.filter((r) => r.candidate_id === "recbp0-offer-full-a1" && r.facet_key === "cuisine")
      .every((r) => r.mapping_scope === "menu_item"));
  check("a DIFFERING menu value suppresses the inherited restaurant value entirely",
    JSON.stringify(valuesOf("recbp0-offer-partial", "meal_type")) === JSON.stringify(["dinner"])
    && facts.find((r) => r.candidate_id === "recbp0-offer-partial" && r.facet_key === "meal_type")
      ?.mapping_scope === "menu_item");
  check("a facet the menu is silent about still inherits the restaurant fact",
    JSON.stringify(valuesOf("recbp0-offer-partial", "spice")) === JSON.stringify(["spice.medium"])
    && facts.find((r) => r.candidate_id === "recbp0-offer-partial" && r.facet_key === "spice")
      ?.mapping_scope === "restaurant");
  check("mapped, partial, and unmapped candidates remain distinct",
    byState.get("recbp0-offer-full-a1")?.mapping_state === "mapped"
    && byState.get("recbp0-offer-partial")?.mapping_state === "partial"
    && byState.get("recbp0-offer-unknown")?.mapping_state === "unknown", states);
  check("unknown facet arrays are deterministic and explicit",
    JSON.stringify(byState.get("recbp0-offer-unknown")?.unknown_facet_keys) === JSON.stringify(["cuisine","flavor","meal_type","spice"])
    && JSON.stringify(byState.get("recbp0-offer-partial")?.known_facet_keys) === JSON.stringify(["cuisine","meal_type","spice"]));
  check("same menu facts project to two distinct branch-offer identities",
    facts.some((row) => row.candidate_id === "recbp0-offer-full-a1" && row.branch_id === "recbp0-b-a1")
    && facts.some((row) => row.candidate_id === "recbp0-offer-full-a2" && row.branch_id === "recbp0-b-a2"));
  check("retired values cannot make a projected fact known",
    !facts.some((row) => row.value_key === "flavor.retired"));
  check("every projected fact has approved provenance and audit reference",
    facts.every((row) => ["restaurant_verified","admin_verified","provider_imported","canonical_mapping"].includes(row.provenance)
      && typeof row.source_reference === "string" && row.source_reference.length > 0));
  const repeat = await q(`select candidate_id,facet_key,value_key,mapping_scope,provenance from
    public.consumer_public_next_meal_candidate_taste_facts_v1 where candidate_id like 'recbp0-%'
    order by candidate_id,facet_key,value_key`);
  check("repeated projection reads are deterministic",
    JSON.stringify(repeat) === JSON.stringify(facts.map(({candidate_id,facet_key,value_key,mapping_scope,provenance}) =>
      ({candidate_id,facet_key,value_key,mapping_scope,provenance}))));
  const orderAfter = (await q(`select candidate_id from public.consumer_public_next_meal_candidates_v1
    where candidate_id like 'recbp0-%' order by candidate_id`)).map((row) => row.candidate_id);
  check("adding P0 facts changes no frozen candidate membership or order",
    JSON.stringify(orderAfter) === JSON.stringify(orderBefore) && orderAfter.length === 4, { orderBefore, orderAfter });

  for (const [name, statement] of [
    ["missing provenance", `insert into public.candidate_taste_mappings
      (menu_item_id,taxonomy_version,facet_key,value_key,source_reference)
      values ('recbp0-item-full','candidate-taste-v1','meal_type','dinner','fixture:x')`],
    ["missing source reference", `insert into public.candidate_taste_mappings
      (menu_item_id,taxonomy_version,facet_key,value_key,provenance)
      values ('recbp0-item-full','candidate-taste-v1','meal_type','dinner','admin_verified')`],
    ["unknown taxonomy value", `insert into public.candidate_taste_mappings
      (menu_item_id,taxonomy_version,facet_key,value_key,provenance,source_reference)
      values ('recbp0-item-full','candidate-taste-v1','flavor','free text','admin_verified','fixture:x')`],
    ["dual target scope", `insert into public.candidate_taste_mappings
      (restaurant_id,menu_item_id,taxonomy_version,facet_key,value_key,provenance,source_reference)
      values ('recbp0-r-a','recbp0-item-full','candidate-taste-v1','meal_type','dinner','admin_verified','fixture:x')`]
  ]) {
    let refused = false;
    try { await client.query("begin"); await client.query(statement); }
    catch { refused = true; } finally { await client.query("rollback"); }
    check(`${name} cannot create a known fact`, refused);
  }

  const privilege = (await q(`select
    has_table_privilege('anon','public.candidate_taste_mappings','INSERT') as anon_write,
    has_table_privilege('authenticated','public.candidate_taste_mappings','INSERT') as auth_write,
    has_table_privilege('service_role','public.candidate_taste_mappings','INSERT') as service_write,
    has_table_privilege('authenticated','public.consumer_public_next_meal_candidate_taste_facts_v1','SELECT') as auth_read,
    has_table_privilege('anon','public.consumer_public_next_meal_candidate_taste_facts_v1','SELECT') as anon_read`))[0];
  check("client/service roles cannot mutate canonical mappings while authenticated may read projection",
    !privilege.anon_write && !privilege.auth_write && !privilege.service_write && privilege.auth_read && !privilege.anon_read, privilege);
  const role = (await q(`select rolcanlogin,rolinherit,rolbypassrls,rolsuper from pg_roles
    where rolname='candidate_taste_write_authority'`))[0];
  check("future write authority cannot login, inherit, bypass RLS, or superuser",
    !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls && !role.rolsuper, role);
  const leaks = await q(`select column_name from information_schema.columns
    where table_schema='public' and table_name in
      ('consumer_public_next_meal_candidate_taste_facts_v1','consumer_public_next_meal_candidate_taste_state_v1')
      and (column_name like '%user%' or column_name like '%profile%' or column_name like '%score%'
        or column_name like '%rank%' or column_name like '%interest%')`);
  check("public candidate projections expose no user, profile, Social interest, score, or rank column", leaks.length === 0, leaks);
} catch (error) {
  unexpectedError = { code: error?.code ?? null, message: String(error?.message ?? error).slice(0, 1000) };
  if (failures.length === 0) check("harness completed without unexpected error", false, String(error?.message ?? error).slice(0, 500));
} finally {
  clearTimeout(watchdog);
  if (runner) await runner.end().catch(() => {});
  if (client) await client.end().catch(() => {});
  if (cluster) cluster.stop();
  console.log(JSON.stringify({
    suite: SUITE,
    status: failures.length ? "failed" : "passed",
    postgres: child.spawnSync(exe("postgres"), ["--version"], { encoding: "utf8", windowsHide: true }).stdout?.trim(),
    runnerIsSuperuser: false,
    migrationsApplied: applied,
    candidateMigrations: candidates,
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures: failures.map((item) => item.name),
    unexpectedError,
    networkUsed: false,
    credentialsUsed: false,
    developmentTouched: false,
    productionTouched: false
  }, null, 2));
}
if (failures.length) process.exitCode = 1;
