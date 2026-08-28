#!/usr/bin/env node
// REC-C-P0 disposable PostgreSQL apply gate. Every migration is applied through COMMIT by the
// repository's non-superuser runner. Fixtures exist only inside the disposable local cluster.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "recommendation-rec-c-p0-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260829010000_private_taste_normalization_authority.sql";
const TARGET = "20260830010000_candidate_allergen_data_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;
const argument = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const PG_BIN = (argument("--pg-bin") ?? process.env.RECCP0_PG_BIN ?? process.env.RECBP1_PG_BIN ?? process.env.RECBP0_PG_BIN)?.trim();
const PG_MODULES = (argument("--pg-modules") ?? process.env.RECCP0_PG_MODULES ?? process.env.RECBP1_PG_MODULES ?? process.env.RECBP0_PG_MODULES)?.trim();

if (!PG_BIN || !PG_MODULES || !fs.existsSync(path.join(PG_BIN, process.platform === "win32" ? "initdb.exe" : "initdb"))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RECCP0_PG_BIN and RECCP0_PG_MODULES to PostgreSQL 17.x binaries and node_modules containing pg",
    networkUsed: false,
    developmentTouched: false,
    productionTouched: false
  }, null, 2));
  process.exit(0);
}

const exe = (name) => path.join(PG_BIN, process.platform === "win32" ? `${name}.exe` : name);
const { Client } = createRequire(path.join(PG_MODULES, "package.json"))("pg");
const predecessorHarness = fs.readFileSync(path.join(ROOT, "scripts/recommendation-rec-b-p1-postgres-apply.mjs"), "utf8");
const bootstrapMatch = predecessorHarness.match(/const BOOTSTRAP = `([\s\S]*?)`;\r?\n\r?\nconst ACTIVE/);
if (!bootstrapMatch) throw new Error("REC-B-P1 bootstrap authority not found");
const BOOTSTRAP = bootstrapMatch[1];

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
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
  server.on("error", reject);
});
async function startCluster(workDir) {
  const dataDir = path.join(workDir, `reccp0-data-${process.pid}-${Date.now()}`);
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
const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? ROOT, "reccp0-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith("reccp0-data-")) removeDir(path.join(workDir, entry.name));
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
  check("all frozen migrations and REC-C-P0 apply through COMMIT", applied === files.length, { applied, total: files.length });
  check("the round contributes exactly one additive migration",
    JSON.stringify(candidateMigrations) === JSON.stringify([TARGET]), candidateMigrations);

  const taxonomy = await q(`select taxonomy_id,taxonomy_version,fact_domain,active
    from public.candidate_allergen_taxonomies`);
  const values = await q(`select allergen_key from public.candidate_allergen_values
    where taxonomy_id='tastkind-allergen-tw-v1' and taxonomy_version=1 order by created_at,allergen_key`);
  check("one active allergen_content v1 taxonomy is installed",
    taxonomy.length === 1 && taxonomy[0].taxonomy_id === "tastkind-allergen-tw-v1"
      && taxonomy[0].taxonomy_version === 1 && taxonomy[0].fact_domain === "allergen_content" && taxonomy[0].active,
    taxonomy);
  check("the taxonomy contains exactly eleven distinct keys", values.length === 11
    && new Set(values.map((row) => row.allergen_key)).size === 11, values);
  const labels = await q(`select allergen_key,label from public.candidate_allergen_value_labels
    where taxonomy_id='tastkind-allergen-tw-v1' and taxonomy_version=1 and locale='zh-TW'`);
  check("each stable key has one separate zh-TW label", labels.length === 11
    && labels.every((row) => row.allergen_key !== row.label), labels);
  const privateAliases = await q(`select alias_kind,count(*)::integer as count
    from public.private_restriction_allergen_normalization_mappings group by alias_kind order by alias_kind`);
  check("private normalization has eleven stable-key and eleven localized-label aliases",
    JSON.stringify(privateAliases) === JSON.stringify([
      { alias_kind: "localized_label", count: 11 }, { alias_kind: "stable_key", count: 11 }
    ]), privateAliases);
  const rawAliases = await q(`select normalized_source_value,target_allergen_key
    from public.legacy_candidate_allergen_normalization_mappings where active order by normalized_source_value`);
  check("legacy raw normalization contains only five authorized exact aliases",
    JSON.stringify(rawAliases) === JSON.stringify([
      { normalized_source_value: "egg", target_allergen_key: "egg" },
      { normalized_source_value: "fish", target_allergen_key: "fish" },
      { normalized_source_value: "peanut", target_allergen_key: "peanut" },
      { normalized_source_value: "soy", target_allergen_key: "soy" },
      { normalized_source_value: "wheat", target_allergen_key: "gluten_containing_cereal" }
    ]) && !rawAliases.some((row) => ["nuts", "shellfish", "不吃海鮮"].includes(row.normalized_source_value)), rawAliases);

  await q(`insert into public.restaurants (id,name,status) values
    ('reccp0-r','REC-C-P0 fixture','active')`);
  await q(`insert into public.restaurant_branches (id,restaurant_id,name,status) values
    ('reccp0-b1','reccp0-r','Fixture one','active'),
    ('reccp0-b2','reccp0-r','Fixture two','active')`);
  await q(`insert into public.menus (id,restaurant_id,name,status) values
    ('reccp0-menu','reccp0-r','Fixture','published')`);
  await q(`insert into public.menu_categories (id,menu_id,name) values
    ('reccp0-cat','reccp0-menu','Fixture')`);
  await q(`insert into public.menu_items (id,restaurant_id,menu_category_id,name,allergens,status) values
    ('reccp0-item','reccp0-r','reccp0-cat','Shared fixture','{}','active')`);
  await q(`insert into public.branch_menu_items
    (id,restaurant_id,branch_id,menu_item_id,price,availability) values
    ('reccp0-offer-1','reccp0-r','reccp0-b1','reccp0-item',100,'available'),
    ('reccp0-offer-2','reccp0-r','reccp0-b2','reccp0-item',100,'available')`);
  await q(`insert into public.menu_item_nutrition
    (id,menu_item_id,calories,protein,carbohydrates,fat,fiber,source,confidence_score,verified_status,is_current)
    values ('reccp0-n','reccp0-item',500,30,50,20,5,'restaurant_verified',1,'verified',true)`);

  await client.query("begin");
  await client.query("set local role candidate_allergen_write_authority");
  await client.query(`insert into public.candidate_allergen_facts
    (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,allergen_key,provenance,source_reference,established_at)
    values
    ('reccp0-offer-1','reccp0-item','tastkind-allergen-tw-v1',1,'crustacean','restaurant_verified','fixture:crustacean','2026-08-28T00:00:00Z'),
    ('reccp0-offer-1','reccp0-item','tastkind-allergen-tw-v1',1,'peanut','admin_verified','fixture:peanut','2026-08-28T00:00:00Z')`);
  await client.query(`insert into public.candidate_allergen_coverage
    (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,coverage_state,provenance,source_reference,established_at)
    values ('reccp0-offer-1','reccp0-item','tastkind-allergen-tw-v1',1,'complete','restaurant_verified','fixture:complete','2026-08-28T00:00:00Z')`);
  await client.query("commit");
  check("sealed authority performs authorized fact and coverage writes", true);

  const projectedFacts = await q(`select candidate_id,menu_item_id,allergen_key
    from public.consumer_authenticated_next_meal_candidate_allergen_facts_v1 order by candidate_id,allergen_key`);
  check("known-present projection is deterministic and isolated to its branch offer",
    JSON.stringify(projectedFacts) === JSON.stringify([
      { candidate_id: "reccp0-offer-1", menu_item_id: "reccp0-item", allergen_key: "crustacean" },
      { candidate_id: "reccp0-offer-1", menu_item_id: "reccp0-item", allergen_key: "peanut" }
    ]), projectedFacts);
  const coverage = await q(`select candidate_id,coverage_state
    from public.consumer_authenticated_next_meal_candidate_allergen_coverage_v1
    where candidate_id like 'reccp0-offer-%' order by candidate_id`);
  check("coverage projects complete for the assessed offer and unknown for the same menu at another branch",
    JSON.stringify(coverage) === JSON.stringify([
      { candidate_id: "reccp0-offer-1", coverage_state: "complete" },
      { candidate_id: "reccp0-offer-2", coverage_state: "unknown" }
    ]), coverage);

  for (const [name, statement] of [
    ["provider cannot declare complete", `insert into public.candidate_allergen_coverage
      (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,coverage_state,provenance,source_reference,established_at)
      values ('reccp0-offer-2','reccp0-item','tastkind-allergen-tw-v1',1,'complete','provider_verified','fixture','2026-08-28T00:00:00Z')`],
    ["missing fact audit reference", `insert into public.candidate_allergen_facts
      (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,allergen_key,provenance,established_at)
      values ('reccp0-offer-2','reccp0-item','tastkind-allergen-tw-v1',1,'fish','provider_verified','2026-08-28T00:00:00Z')`],
    ["invalid provenance", `insert into public.candidate_allergen_facts
      (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,allergen_key,provenance,source_reference,established_at)
      values ('reccp0-offer-2','reccp0-item','tastkind-allergen-tw-v1',1,'fish','ai_inferred','fixture','2026-08-28T00:00:00Z')`],
    ["candidate/menu mismatch", `insert into public.candidate_allergen_facts
      (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,allergen_key,provenance,source_reference,established_at)
      values ('reccp0-offer-2','dish-haochu-1','tastkind-allergen-tw-v1',1,'fish','admin_verified','fixture','2026-08-28T00:00:00Z')`]
  ]) {
    let refused = false;
    try { await client.query("begin"); await client.query(statement); }
    catch { refused = true; } finally { await client.query("rollback"); }
    check(`${name} is rejected`, refused);
  }

  await q(`insert into public.candidate_allergen_coverage
    (candidate_id,menu_item_id,taxonomy_id,taxonomy_version,coverage_state,provenance,source_reference,established_at)
    values ('reccp0-offer-2','reccp0-item','tastkind-allergen-tw-v1',1,'partial','provider_verified','fixture:partial','2026-08-28T00:00:00Z')`);
  const partial = (await q(`select coverage_state from public.consumer_authenticated_next_meal_candidate_allergen_coverage_v1
    where candidate_id='reccp0-offer-2'`))[0];
  check("provider evidence may remain partial without proving missing-key absence", partial?.coverage_state === "partial", partial);

  const privileges = (await q(`select
    has_table_privilege('anon','public.candidate_allergen_facts','INSERT') as anon_fact_write,
    has_table_privilege('authenticated','public.candidate_allergen_facts','INSERT') as auth_fact_write,
    has_table_privilege('anon','public.candidate_allergen_coverage','INSERT') as anon_coverage_write,
    has_table_privilege('authenticated','public.candidate_allergen_coverage','INSERT') as auth_coverage_write,
    has_table_privilege('authenticated','public.consumer_authenticated_next_meal_candidate_allergen_facts_v1','SELECT') as auth_fact_read,
    has_table_privilege('anon','public.consumer_authenticated_next_meal_candidate_allergen_facts_v1','SELECT') as anon_fact_read`))[0];
  check("anon/authenticated cannot mutate facts or coverage while authenticated has narrow projection read",
    !privileges.anon_fact_write && !privileges.auth_fact_write
      && !privileges.anon_coverage_write && !privileges.auth_coverage_write
      && privileges.auth_fact_read && !privileges.anon_fact_read, privileges);
  const role = (await q(`select rolcanlogin,rolinherit,rolbypassrls,rolsuper
    from pg_roles where rolname='candidate_allergen_write_authority'`))[0];
  check("write authority is NOLOGIN, NOINHERIT, NOBYPASSRLS, and non-superuser",
    role && !role.rolcanlogin && !role.rolinherit && !role.rolbypassrls && !role.rolsuper, role);
  const projectionLeaks = await q(`select table_name,column_name from information_schema.columns
    where table_schema='public'
      and table_name in ('consumer_authenticated_next_meal_candidate_allergen_facts_v1',
        'consumer_authenticated_next_meal_candidate_allergen_coverage_v1')
      and (column_name like '%user%' or column_name like '%restriction%' or column_name like '%severity%'
        or column_name like '%audit%' or column_name like '%source_reference%' or column_name like '%safe%'
        or column_name like '%score%' or column_name like '%rank%')`);
  check("candidate projections contain no private, audit, safety, score, or rank columns",
    projectionLeaks.length === 0, projectionLeaks);
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
