#!/usr/bin/env node
// REC-D-P0 disposable PostgreSQL 17 apply/runtime gate. Migrations run through COMMIT as the
// repository's non-superuser runner. Node pg is the only SQL transport.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "recommendation-rec-d-p0-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260831010000_user_allergy_setting_authority.sql";
const TARGET = "20260901010000_candidate_ingredient_avoidance_data_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;
const argument = (name) => process.argv
  .find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const PG_BIN = (argument("--pg-bin") ?? process.env.RECDP0_PG_BIN
  ?? process.env.RECCP0_PG_BIN ?? process.env.RECBP1_PG_BIN)?.trim();
const PG_MODULES = (argument("--pg-modules") ?? process.env.RECDP0_PG_MODULES
  ?? process.env.RECCP0_PG_MODULES ?? process.env.RECBP1_PG_MODULES)?.trim();

if (!PG_BIN || !PG_MODULES
  || !fs.existsSync(path.join(PG_BIN, process.platform === "win32" ? "initdb.exe" : "initdb"))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RECDP0_PG_BIN and RECDP0_PG_MODULES to PostgreSQL 17.x binaries and node_modules containing pg",
    transport: "node-pg",
    networkUsed: false,
    developmentTouched: false,
    productionTouched: false
  }, null, 2));
  process.exit(0);
}

const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");
const predecessorHarness = fs.readFileSync(
  path.join(ROOT, "scripts/recommendation-rec-b-p1-postgres-apply.mjs"), "utf8"
);
const bootstrapMatch = predecessorHarness.match(/const BOOTSTRAP = `([\s\S]*?)`;\r?\n\r?\nconst ACTIVE/);
if (!bootstrapMatch) throw new Error("REC-B-P1 bootstrap authority not found");
const BOOTSTRAP = bootstrapMatch[1];

const ACTIVE = new Set();
const treeKill = (pid) => {
  if (!pid) return;
  if (process.platform === "win32") {
    child.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore", windowsHide: true
    });
  } else {
    try { process.kill(-pid, "SIGKILL"); }
    catch { try { process.kill(pid, "SIGKILL"); } catch { /* already stopped */ } }
  }
};
const removeDir = (directory) => {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try { fs.rmSync(directory, { recursive: true, force: true }); return; }
    catch { /* native handles are closing */ }
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
  const dataDir = path.join(workDir, `recdp0-data-${process.pid}-${Date.now()}`);
  const logFile = `${dataDir}.log`;
  const init = child.spawnSync(exe("initdb"),
    ["-D", dataDir, "-U", "supabase_admin", "--encoding=UTF8", "--locale=C", "-A", "trust"],
    { encoding: "utf8", windowsHide: true });
  if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  const port = await freePort();
  const out = fs.openSync(logFile, "a");
  const server = child.spawn(exe("postgres"), ["-D", dataDir, "-p", String(port),
    "-c", "listen_addresses=127.0.0.1", "-c", "fsync=off", "-c", "full_page_writes=off",
    "-c", "synchronous_commit=off"], {
    detached: true, windowsHide: true, stdio: ["ignore", out, out]
  });
  server.unref();
  let stopped = false;
  const cluster = { port, stop() {
    if (stopped) return;
    stopped = true; ACTIVE.delete(cluster); treeKill(server.pid);
    try { fs.closeSync(out); } catch { /* already closed */ }
    removeDir(dataDir);
    try { fs.rmSync(logFile, { force: true }); } catch { /* handle closing */ }
  } };
  ACTIVE.add(cluster);
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const probe = new Client({
      host: "127.0.0.1", port, user: "supabase_admin", database: "postgres"
    });
    try {
      await probe.connect(); await probe.query("select 1"); await probe.end(); return cluster;
    } catch {
      try { await probe.end(); } catch { /* not connected */ }
    }
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
const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? ROOT, "recdp0-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith("recdp0-data-")) {
    removeDir(path.join(workDir, entry.name));
  }
}
const watchdog = setTimeout(() => { teardown(); process.exit(1); }, WATCHDOG_MS);
watchdog.unref?.();

let cluster; let client; let runner; let applied = 0; let candidateMigrations = [];
let unexpectedError = null;
try {
  cluster = await startCluster(workDir);
  client = new Client({
    host: "127.0.0.1", port: cluster.port, user: "supabase_admin", database: "postgres"
  });
  await client.connect();
  const q = async (sql, params) => (await client.query(sql, params)).rows;
  await client.query(BOOTSTRAP);
  runner = new Client({
    host: "127.0.0.1", port: cluster.port, user: "postgres", database: "postgres"
  });
  await runner.connect();
  const identity = (await runner.query(
    "select current_user, current_setting('is_superuser') as superuser"
  )).rows[0];
  check("migrations run as postgres without superuser bypass",
    identity.current_user === "postgres" && identity.superuser === "off", identity);

  const files = fs.readdirSync(MIGRATIONS).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    try {
      await runner.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
      applied += 1;
      if (file > BASELINE_LAST) candidateMigrations.push(file);
    } catch (error) {
      check(`migration applies through COMMIT: ${file}`, false,
        { code: error.code, message: error.message });
      throw error;
    }
  }
  check("all frozen migrations and REC-D-P0 apply through COMMIT",
    applied === files.length, { applied, total: files.length });
  check("round contributes exactly one additive migration",
    JSON.stringify(candidateMigrations) === JSON.stringify([TARGET]), candidateMigrations);

  const taxonomy = await q(`select taxonomy_id,taxonomy_version,fact_domain,active
    from public.candidate_ingredient_avoidance_taxonomies`);
  check("one active ingredient_avoidance_content v1 taxonomy is installed",
    taxonomy.length === 1
      && taxonomy[0].taxonomy_id === "tastkind-ingredient-avoidance-v1"
      && taxonomy[0].taxonomy_version === 1
      && taxonomy[0].fact_domain === "ingredient_avoidance_content"
      && taxonomy[0].active, taxonomy);
  const values = await q(`select ingredient_avoidance_key
    from public.candidate_ingredient_avoidance_values
    where taxonomy_id='tastkind-ingredient-avoidance-v1' and taxonomy_version=1
    order by created_at,ingredient_avoidance_key`);
  check("taxonomy contains exactly pork, beef, coriander and no fourth key",
    JSON.stringify(values.map((row) => row.ingredient_avoidance_key))
      === JSON.stringify(["pork", "beef", "coriander"]), values);
  const mappings = await q(`select normalized_source_value,alias_kind,target_ingredient_avoidance_key
    from public.private_ingredient_avoidance_normalization_mappings
    order by normalized_source_value`);
  check("private source normalization contains three exact stable-key mappings only",
    mappings.length === 3
      && mappings.every((row) => row.alias_kind === "stable_key"
        && row.normalized_source_value === row.target_ingredient_avoidance_key)
      && JSON.stringify(mappings.map((row) => row.normalized_source_value))
        === JSON.stringify(["beef", "coriander", "pork"]), mappings);

  await q(`insert into public.restaurants (id,name,status) values
    ('recdp0-r','REC-D-P0 fixture','active')`);
  await q(`insert into public.restaurant_branches (id,restaurant_id,name,status) values
    ('recdp0-b1','recdp0-r','Fixture one','active'),
    ('recdp0-b2','recdp0-r','Fixture two','active')`);
  await q(`insert into public.menus (id,restaurant_id,name,status) values
    ('recdp0-menu','recdp0-r','Fixture','published')`);
  await q(`insert into public.menu_categories (id,menu_id,name) values
    ('recdp0-cat','recdp0-menu','Fixture')`);
  await q(`insert into public.menu_items
    (id,restaurant_id,menu_category_id,name,allergens,status) values
    ('recdp0-item','recdp0-r','recdp0-cat','Shared fixture','{}','active')`);
  await q(`insert into public.branch_menu_items
    (id,restaurant_id,branch_id,menu_item_id,price,availability) values
    ('recdp0-offer-1','recdp0-r','recdp0-b1','recdp0-item',100,'available'),
    ('recdp0-offer-2','recdp0-r','recdp0-b2','recdp0-item',100,'available')`);
  await q(`insert into public.menu_item_nutrition
    (id,menu_item_id,calories,protein,carbohydrates,fat,fiber,source,
     confidence_score,verified_status,is_current)
    values ('recdp0-n','recdp0-item',500,30,50,20,5,'restaurant_verified',1,'verified',true)`);

  await client.query("begin");
  await client.query("set local role candidate_ingredient_avoidance_write_authority");
  await client.query(`insert into public.candidate_ingredient_avoidance_facts
    (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,
     ingredient_avoidance_key,provenance,source_reference,established_at)
    values
    ('recdp0-offer-1','recdp0-item','tastkind-ingredient-avoidance-v1',1,
      'pork','restaurant_verified','fixture:pork','2026-08-30T00:00:00Z'),
    ('recdp0-offer-1','recdp0-item','tastkind-ingredient-avoidance-v1',1,
      'beef','admin_verified','fixture:beef','2026-08-30T00:00:00Z'),
    ('recdp0-offer-1','recdp0-item','tastkind-ingredient-avoidance-v1',1,
      'coriander','provider_verified','fixture:coriander','2026-08-30T00:00:00Z')`);
  await client.query(`insert into public.candidate_ingredient_avoidance_coverage
    (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,
     coverage_state,provenance,source_reference,established_at)
    values ('recdp0-offer-1','recdp0-item','tastkind-ingredient-avoidance-v1',1,
      'complete','restaurant_verified','fixture:complete','2026-08-30T00:00:00Z')`);
  await client.query("commit");
  check("sealed authority performs governed fact and coverage writes", true);

  const projectedFacts = await q(`select candidate_id,menu_item_id,ingredient_avoidance_key
    from public.consumer_authenticated_candidate_avoidance_facts_v1
    order by candidate_id,ingredient_avoidance_key`);
  check("all three known-present keys project only for their exact branch offer",
    projectedFacts.length === 3
      && projectedFacts.every((row) => row.candidate_id === "recdp0-offer-1"
        && row.menu_item_id === "recdp0-item")
      && JSON.stringify(projectedFacts.map((row) => row.ingredient_avoidance_key))
        === JSON.stringify(["beef", "coriander", "pork"]), projectedFacts);
  const coverage = await q(`select candidate_id,coverage_state
    from public.consumer_authenticated_candidate_avoidance_coverage_v1
    where candidate_id like 'recdp0-offer-%' order by candidate_id`);
  check("complete assessed offer and same-menu other branch remain distinct",
    JSON.stringify(coverage) === JSON.stringify([
      { candidate_id: "recdp0-offer-1", coverage_state: "complete" },
      { candidate_id: "recdp0-offer-2", coverage_state: "unknown" }
    ]), coverage);

  for (const [name, statement] of [
    ["provider cannot declare complete", `insert into public.candidate_ingredient_avoidance_coverage
      (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,
       coverage_state,provenance,source_reference,established_at)
      values ('recdp0-offer-2','recdp0-item','tastkind-ingredient-avoidance-v1',1,
       'complete','provider_verified','fixture','2026-08-30T00:00:00Z')`],
    ["missing fact audit reference", `insert into public.candidate_ingredient_avoidance_facts
      (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,
       ingredient_avoidance_key,provenance,established_at)
      values ('recdp0-offer-2','recdp0-item','tastkind-ingredient-avoidance-v1',1,
       'pork','provider_verified','2026-08-30T00:00:00Z')`],
    ["invalid provenance", `insert into public.candidate_ingredient_avoidance_facts
      (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,
       ingredient_avoidance_key,provenance,source_reference,established_at)
      values ('recdp0-offer-2','recdp0-item','tastkind-ingredient-avoidance-v1',1,
       'pork','ai_inferred','fixture','2026-08-30T00:00:00Z')`],
    ["candidate/menu mismatch", `insert into public.candidate_ingredient_avoidance_facts
      (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,
       ingredient_avoidance_key,provenance,source_reference,established_at)
      values ('recdp0-offer-2','dish-haochu-1','tastkind-ingredient-avoidance-v1',1,
       'pork','admin_verified','fixture','2026-08-30T00:00:00Z')`]
  ]) {
    let refused = false;
    try { await client.query("begin"); await client.query(statement); }
    catch { refused = true; }
    finally { await client.query("rollback"); }
    check(`${name} is rejected`, refused);
  }

  await q(`insert into public.candidate_ingredient_avoidance_coverage
    (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,
     coverage_state,provenance,source_reference,established_at)
    values ('recdp0-offer-2','recdp0-item','tastkind-ingredient-avoidance-v1',1,
      'partial','provider_verified','fixture:partial','2026-08-30T00:00:00Z')`);
  const partial = (await q(`select coverage_state
    from public.consumer_authenticated_candidate_avoidance_coverage_v1
    where candidate_id='recdp0-offer-2'`))[0];
  check("provider evidence may remain partial without proving missing-key absence",
    partial?.coverage_state === "partial", partial);

  await client.query("begin");
  await client.query("set local role candidate_allergen_write_authority");
  await client.query(`insert into public.candidate_allergen_coverage
    (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,
     coverage_state,provenance,source_reference,established_at)
    values ('recdp0-offer-2','recdp0-item','tastkind-allergen-tw-v1',1,
      'complete','admin_verified','fixture:allergen-complete','2026-08-30T00:00:00Z')`);
  await client.query("commit");
  const independent = (await q(`select
    (select coverage_state from public.consumer_authenticated_candidate_avoidance_coverage_v1
      where candidate_id='recdp0-offer-2') as ingredient_coverage,
    (select coverage_state from public.consumer_authenticated_next_meal_candidate_allergen_coverage_v1
      where candidate_id='recdp0-offer-2') as allergen_coverage`))[0];
  check("ingredient-avoidance and allergen completeness are independent",
    independent?.ingredient_coverage === "partial"
      && independent?.allergen_coverage === "complete", independent);

  const privileges = (await q(`select
    has_table_privilege('anon','public.candidate_ingredient_avoidance_facts','INSERT') as anon_fact_write,
    has_table_privilege('authenticated','public.candidate_ingredient_avoidance_facts','INSERT') as auth_fact_write,
    has_table_privilege('anon','public.candidate_ingredient_avoidance_coverage','INSERT') as anon_coverage_write,
    has_table_privilege('authenticated','public.candidate_ingredient_avoidance_coverage','INSERT') as auth_coverage_write,
    has_table_privilege('authenticated','public.consumer_authenticated_candidate_avoidance_facts_v1','SELECT') as auth_fact_read,
    has_table_privilege('anon','public.consumer_authenticated_candidate_avoidance_facts_v1','SELECT') as anon_fact_read`))[0];
  check("clients cannot mutate authority while authenticated receives narrow read",
    !privileges.anon_fact_write && !privileges.auth_fact_write
      && !privileges.anon_coverage_write && !privileges.auth_coverage_write
      && privileges.auth_fact_read && !privileges.anon_fact_read, privileges);
  const role = (await q(`select rolcanlogin,rolinherit,rolbypassrls,rolsuper
    from pg_roles where rolname='candidate_ingredient_avoidance_write_authority'`))[0];
  check("write role is NOLOGIN, NOINHERIT, NOBYPASSRLS, and non-superuser",
    role && !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls && !role.rolsuper, role);
  const leaks = await q(`select table_name,column_name from information_schema.columns
    where table_schema='public'
      and table_name in ('consumer_authenticated_candidate_avoidance_facts_v1',
        'consumer_authenticated_candidate_avoidance_coverage_v1')
      and (column_name like '%user%' or column_name like '%reason%'
        or column_name like '%religion%' or column_name like '%audit%'
        or column_name like '%source_reference%' or column_name like '%safe%'
        or column_name like '%score%' or column_name like '%rank%'
        or column_name like '%compatible%')`);
  check("candidate projections leak no user, reason, audit, compatibility, score, or rank fields",
    leaks.length === 0, leaks);

  await q("delete from public.candidate_ingredient_avoidance_facts where candidate_id like 'recdp0-%'");
  await q("delete from public.candidate_ingredient_avoidance_coverage where candidate_id like 'recdp0-%'");
  await q("delete from public.candidate_allergen_coverage where candidate_id like 'recdp0-%'");
  const residue = await q(`select
    (select count(*)::integer from public.candidate_ingredient_avoidance_facts
      where candidate_id like 'recdp0-%') as facts,
    (select count(*)::integer from public.candidate_ingredient_avoidance_coverage
      where candidate_id like 'recdp0-%') as coverage`);
  check("fixture authority rows clean to zero residue",
    residue[0]?.facts === 0 && residue[0]?.coverage === 0, residue[0]);
} catch (error) {
  unexpectedError = { name: error.name, code: error.code, message: error.message };
} finally {
  try { await runner?.end(); } catch { /* closing */ }
  try { await client?.end(); } catch { /* closing */ }
  cluster?.stop(); clearTimeout(watchdog);
}

if (unexpectedError) check("unexpected PostgreSQL harness error", false, unexpectedError);
const remainingDirs = fs.existsSync(workDir)
  ? fs.readdirSync(workDir).filter((entry) => entry.startsWith("recdp0-data-")) : [];
check("disposable PostgreSQL cluster leaves zero data-directory residue",
  remainingDirs.length === 0, remainingDirs);

console.log("\n" + JSON.stringify({
  suite: SUITE,
  status: failures.length ? "failed" : "passed",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  postgresMajor: 17,
  transport: "node-pg",
  migrationRunner: "postgres non-superuser",
  appliedMigrations: applied,
  candidateMigrations,
  networkUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exit(1);
