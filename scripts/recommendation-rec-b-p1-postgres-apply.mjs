#!/usr/bin/env node
// REC-B-P1 disposable PostgreSQL apply gate. It applies every repository migration through COMMIT
// as a non-superuser runner, then exercises synthetic local vocabulary rows only. It never connects
// to Development or Production.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "recommendation-rec-b-p1-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260828010000_candidate_taste_data_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;
const argument = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const PG_BIN = (argument("--pg-bin") ?? process.env.RECBP1_PG_BIN ?? process.env.RECBP0_PG_BIN)?.trim();
const PG_MODULES = (argument("--pg-modules") ?? process.env.RECBP1_PG_MODULES ?? process.env.RECBP0_PG_MODULES)?.trim();

if (!PG_BIN || !PG_MODULES
  || !fs.existsSync(path.join(PG_BIN, process.platform === "win32" ? "initdb.exe" : "initdb"))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RECBP1_PG_BIN and RECBP1_PG_MODULES to PostgreSQL 17.x binaries and node_modules containing pg",
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
    try { fs.rmSync(directory, { recursive: true, force: true }); return; } catch { /* closing */ }
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
  const dataDir = path.join(workDir, `recbp1-data-${process.pid}-${Date.now()}`);
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
const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? ROOT, "recbp1-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith("recbp1-data-")) removeDir(path.join(workDir, entry.name));
}
const watchdog = setTimeout(() => { teardown(); process.exit(1); }, WATCHDOG_MS);
watchdog.unref?.();

let cluster; let client; let runner; let applied = 0; let candidateMigrations = []; let unexpectedError = null;
try {
  cluster = await startCluster(workDir);
  client = new Client({ host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres" });
  await client.connect();
  const q = async (sql, params) => (await client.query(sql, params)).rows;
  await client.query(BOOTSTRAP);
  runner = new Client({ host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres" });
  await runner.connect();
  const identity = (await runner.query("select current_user, current_setting('is_superuser') as superuser")).rows[0];
  check("migrations run as postgres without superuser bypass",
    identity.current_user === "postgres" && identity.superuser === "off", identity);
  const files = fs.readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
      applied += 1;
      if (file > BASELINE_LAST) candidateMigrations.push(file);
    } catch (error) {
      check(`migration applies through COMMIT: ${file}`, false, { code: error.code, message: error.message });
      throw error;
    }
  }
  check("the frozen schema and REC-B-P1 apply through COMMIT", applied === files.length, { applied, total: files.length });
  check("the round contributes exactly one normalization migration",
    candidateMigrations.length === 1
      && candidateMigrations[0] === "20260829010000_private_taste_normalization_authority.sql",
    candidateMigrations);

  const targetCounts = await q(`select facet_key, count(*)::integer as count
    from public.candidate_taste_values
    where taxonomy_version='candidate-taste-v1' and facet_key in ('cuisine','flavor','spice')
    group by facet_key order by facet_key`);
  check("candidate taxonomy has exactly 16 cuisine, 8 flavor, and 4 spice values",
    JSON.stringify(targetCounts) === JSON.stringify([
      { facet_key: "cuisine", count: 16 }, { facet_key: "flavor", count: 8 }, { facet_key: "spice", count: 4 }
    ]), targetCounts);
  const sourceCounts = await q(`select source_facet, count(*)::integer as count
    from public.private_taste_source_values group by source_facet order by source_facet`);
  check("private source authority has exactly 16 cuisine, 8 flavor, and 4 spice values",
    JSON.stringify(sourceCounts) === JSON.stringify([
      { source_facet: "cuisine", count: 16 }, { source_facet: "flavor", count: 8 }, { source_facet: "spice", count: 4 }
    ]), sourceCounts);
  const labels = await q(`select
      (select label from public.private_taste_source_value_labels
        where source_facet='spice' and source_value_key='hot' and locale='zh-TW') as private_hot,
      (select label from public.candidate_taste_value_labels
        where taxonomy_version='candidate-taste-v1' and facet_key='spice' and value_key='hot' and locale='zh-TW') as candidate_hot`);
  check("stable identity is separate from private and candidate display labels",
    labels[0]?.private_hot === "愛吃辣" && labels[0]?.candidate_hot === "重辣", labels[0]);
  const aliasCounts = await q(`select alias_kind, count(*)::integer as count
    from public.private_taste_normalization_mappings group by alias_kind order by alias_kind`);
  check("exact stable-key and zh-TW label aliases total fifty-six",
    JSON.stringify(aliasCounts) === JSON.stringify([
      { alias_kind: "localized_label", count: 28 }, { alias_kind: "stable_key", count: 28 }
    ]), aliasCounts);
  const dictionary = await q(`select * from public.consumer_private_taste_normalization_dictionary_v1
    order by source_facet,source_value_key,alias_kind`);
  check("active dictionary exposes fifty-six deterministic vocabulary mappings",
    dictionary.length === 56 && dictionary.every((row) => row.source_facet === row.target_facet
      && row.provenance === "canonical_mapping" && row.audit_reference), dictionary.length);
  check("exact aliases resolve and unauthorized synonyms are absent",
    dictionary.some((row) => row.source_facet === "cuisine" && row.normalized_source_value === "japanese" && row.target_value_key === "japanese")
    && dictionary.some((row) => row.source_facet === "cuisine" && row.normalized_source_value === "日本料理" && row.target_value_key === "japanese")
    && dictionary.some((row) => row.source_facet === "flavor" && row.normalized_source_value === "甜味" && row.target_value_key === "sweet")
    && dictionary.some((row) => row.source_facet === "spice" && row.normalized_source_value === "微辣" && row.target_value_key === "mild")
    && !dictionary.some((row) => ["日式","日本菜","小辣","辣一點","奶味重"].includes(row.normalized_source_value)));
  const order = await q(`select value_key,semantic_ordinal from public.candidate_taste_spice_order
    where taxonomy_version='candidate-taste-v1' order by semantic_ordinal`);
  check("spice order is exact explicit metadata",
    JSON.stringify(order) === JSON.stringify([
      { value_key: "none", semantic_ordinal: 0 }, { value_key: "mild", semantic_ordinal: 1 },
      { value_key: "medium", semantic_ordinal: 2 }, { value_key: "hot", semantic_ordinal: 3 }
    ]), order);

  for (const [name, statement] of [
    ["cross-facet mapping", `insert into public.private_taste_normalization_mappings
      (normalization_policy_id,normalization_policy_version,source_vocabulary_id,source_vocabulary_version,
       source_facet,source_value_key,normalized_source_value,alias_kind,target_taxonomy_version,
       target_facet,target_value_key,provenance,audit_reference)
      values ('private-taste-normalization',1,'private-taste-cuisine-v1',1,'cuisine','japanese',
       'rec-b-p1-cross','governed_alias','candidate-taste-v1','flavor','sweet','canonical_mapping','fixture')`],
    ["duplicate active alias", `insert into public.private_taste_normalization_mappings
      (normalization_policy_id,normalization_policy_version,source_vocabulary_id,source_vocabulary_version,
       source_facet,source_value_key,normalized_source_value,alias_kind,target_taxonomy_version,
       target_facet,target_value_key,provenance,audit_reference)
      values ('private-taste-normalization',1,'private-taste-cuisine-v1',1,'cuisine','japanese',
       'japanese','stable_key','candidate-taste-v1','cuisine','japanese','canonical_mapping','fixture')`],
    ["missing provenance", `insert into public.private_taste_normalization_mappings
      (normalization_policy_id,normalization_policy_version,source_vocabulary_id,source_vocabulary_version,
       source_facet,source_value_key,normalized_source_value,alias_kind,target_taxonomy_version,
       target_facet,target_value_key,audit_reference)
      values ('private-taste-normalization',1,'private-taste-cuisine-v1',1,'cuisine','japanese',
       'rec-b-p1-no-provenance','governed_alias','candidate-taste-v1','cuisine','japanese','fixture')`],
    ["missing audit reference", `insert into public.private_taste_normalization_mappings
      (normalization_policy_id,normalization_policy_version,source_vocabulary_id,source_vocabulary_version,
       source_facet,source_value_key,normalized_source_value,alias_kind,target_taxonomy_version,
       target_facet,target_value_key,provenance)
      values ('private-taste-normalization',1,'private-taste-cuisine-v1',1,'cuisine','japanese',
       'rec-b-p1-no-audit','governed_alias','candidate-taste-v1','cuisine','japanese','canonical_mapping')`]
  ]) {
    let refused = false;
    try { await client.query("begin"); await client.query(statement); }
    catch { refused = true; } finally { await client.query("rollback"); }
    check(`${name} is rejected`, refused);
  }

  // The view intentionally does not expose mapping IDs; retire through the unique active identity.
  await q(`update public.private_taste_normalization_mappings
    set active=false,retired_at=clock_timestamp(),updated_at=clock_timestamp()
    where source_facet='cuisine' and normalized_source_value='日本料理' and active`);
  const retiredLookup = await q(`select target_value_key from public.consumer_private_taste_normalization_dictionary_v1
    where source_facet='cuisine' and normalized_source_value='日本料理'`);
  const sourceStillKnown = await q(`select source_value_key from public.consumer_private_taste_source_values_v1
    where source_facet='cuisine' and source_value_key='japanese'`);
  check("retired mapping does not resolve while its source value remains known",
    retiredLookup.length === 0 && sourceStillKnown.length === 1, { retiredLookup, sourceStillKnown });

  const privilege = (await q(`select
    has_table_privilege('anon','public.private_taste_normalization_mappings','INSERT') as anon_write,
    has_table_privilege('authenticated','public.private_taste_normalization_mappings','INSERT') as auth_write,
    has_table_privilege('service_role','public.private_taste_normalization_mappings','INSERT') as service_write,
    has_table_privilege('authenticated','public.consumer_private_taste_normalization_dictionary_v1','SELECT') as auth_read,
    has_table_privilege('anon','public.consumer_private_taste_normalization_dictionary_v1','SELECT') as anon_read`))[0];
  check("client/service roles cannot mutate authority while authenticated may read vocabulary",
    !privilege.anon_write && !privilege.auth_write && !privilege.service_write
      && privilege.auth_read && !privilege.anon_read, privilege);
  const roles = await q(`select rolname,rolcanlogin,rolinherit,rolbypassrls,rolsuper from pg_roles
    where rolname in ('private_taste_normalization_write_authority','candidate_taste_write_authority')
    order by rolname`);
  check("both write authorities are sealed from login, inheritance, RLS bypass, and superuser",
    roles.length === 2 && roles.every((role) => !role.rolcanlogin && !role.rolinherit
      && !role.rolbypassrls && !role.rolsuper), roles);
  const leaks = await q(`select table_name,column_name from information_schema.columns
    where table_schema='public'
      and table_name in ('consumer_private_taste_source_values_v1','consumer_private_taste_normalization_dictionary_v1')
      and (column_name like '%user%' or column_name like '%profile%' or column_name like '%candidate%'
        or column_name like '%score%' or column_name like '%rank%' or column_name like '%favorite%'
        or column_name like '%rating%' or column_name like '%location%')`);
  check("authenticated normalization views expose no user, profile, candidate, score, or behavioral column",
    leaks.length === 0, leaks);
  const candidateMappings = (await q(`select count(*)::integer as count from public.candidate_taste_mappings`))[0].count;
  check("P1 creates zero restaurant/menu candidate mappings", candidateMappings === 0, candidateMappings);

  await q(`insert into public.restaurants (id,name,status) values ('recbp1-r','REC-B-P1 fixture','active')`);
  await q(`insert into public.restaurant_branches (id,restaurant_id,name,status)
    values ('recbp1-b','recbp1-r','Fixture','active')`);
  await q(`insert into public.menus (id,restaurant_id,name,status) values ('recbp1-menu','recbp1-r','Fixture','published')`);
  await q(`insert into public.menu_categories (id,menu_id,name) values ('recbp1-cat','recbp1-menu','Fixture')`);
  await q(`insert into public.menu_items (id,restaurant_id,menu_category_id,name,status)
    values ('recbp1-item','recbp1-r','recbp1-cat','Fixture','active')`);
  await q(`insert into public.branch_menu_items (id,restaurant_id,branch_id,menu_item_id,price,availability)
    values ('recbp1-offer','recbp1-r','recbp1-b','recbp1-item',100,'available')`);
  await q(`insert into public.menu_item_nutrition
    (id,menu_item_id,calories,protein,carbohydrates,fat,fiber,source,confidence_score,verified_status,is_current)
    values ('recbp1-n','recbp1-item',500,30,50,20,5,'restaurant_verified',1,'verified',true)`);
  const state = (await q(`select mapping_state,known_facet_keys,unknown_facet_keys
    from public.consumer_public_next_meal_candidate_taste_state_v1 where candidate_id='recbp1-offer'`))[0];
  check("taxonomy availability does not promote an unmapped candidate to known",
    state?.mapping_state === "unknown" && state.known_facet_keys.length === 0
      && JSON.stringify(state.unknown_facet_keys) === JSON.stringify(["cuisine","flavor","meal_type","spice"]), state);
} catch (error) {
  unexpectedError = { code: error?.code ?? null, message: String(error?.message ?? error).slice(0, 1000) };
  if (failures.length === 0) check("harness completed without unexpected error", false, unexpectedError);
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
    candidateMigrations,
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
