#!/usr/bin/env node
// REC-D-P1 disposable PostgreSQL 17 apply/runtime gate. Migrations run through COMMIT as the
// repository's non-superuser runner. Node pg is the only SQL transport.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";

const SUITE = "recommendation-rec-d-p1-postgres-apply";
const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const BASELINE_LAST = "20260901010000_candidate_ingredient_avoidance_data_authority.sql";
const TARGET = "20260902010000_user_ingredient_avoidance_setting_authority.sql";
const WATCHDOG_MS = 15 * 60 * 1000;
const argument = (name) => process.argv
  .find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const PG_BIN = (argument("--pg-bin") ?? process.env.RECDP1_PG_BIN
  ?? process.env.RECCP0_PG_BIN ?? process.env.RECBP1_PG_BIN)?.trim();
const PG_MODULES = (argument("--pg-modules") ?? process.env.RECDP1_PG_MODULES
  ?? process.env.RECCP0_PG_MODULES ?? process.env.RECBP1_PG_MODULES)?.trim();

if (!PG_BIN || !PG_MODULES
  || !fs.existsSync(path.join(PG_BIN, process.platform === "win32" ? "initdb.exe" : "initdb"))) {
  console.log(JSON.stringify({
    suite: SUITE,
    status: "skipped",
    reason: "set RECDP1_PG_BIN and RECDP1_PG_MODULES to PostgreSQL 17.x binaries and node_modules containing pg",
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
  const dataDir = path.join(workDir, `recdp1-data-${process.pid}-${Date.now()}`);
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
const workDir = path.join(process.env.TEMP ?? process.env.TMPDIR ?? ROOT, "recdp1-apply-gate");
fs.mkdirSync(workDir, { recursive: true });
for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.startsWith("recdp1-data-")) {
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
  check("all frozen migrations and REC-D-P1 apply through COMMIT",
    applied === files.length, { applied, total: files.length });
  check("round contributes exactly one additive migration",
    JSON.stringify(candidateMigrations) === JSON.stringify([TARGET]), candidateMigrations);

  await client.query("grant authenticated, anon to postgres");
  const asUser = async (userId, sql, allowFailure = false) => {
    try {
      await runner.query("begin");
      await runner.query("set local role authenticated");
      await runner.query("select pg_catalog.set_config('request.jwt.claim.sub',$1,true)", [userId]);
      const result = await runner.query(sql);
      await runner.query("commit");
      return { ok: true, rows: result.rows };
    } catch (error) {
      try { await runner.query("rollback"); } catch { /* best effort */ }
      if (!allowFailure) throw error;
      return { ok: false, code: error.code, message: error.message };
    }
  };
  const asRole = async (role, sql, allowFailure = false) => {
    try {
      await runner.query("begin"); await runner.query(`set local role ${role}`);
      const result = await runner.query(sql); await runner.query("commit");
      return { ok: true, rows: result.rows };
    } catch (error) {
      try { await runner.query("rollback"); } catch { /* best effort */ }
      if (!allowFailure) throw error;
      return { ok: false, code: error.code, message: error.message };
    }
  };
  const userA = "00000000-0000-4000-8000-0000000000a1";
  const userB = "00000000-0000-4000-8000-0000000000b2";
  await q(`insert into auth.users(id,email) values
    ('${userA}','recdp1-a@example.test'),('${userB}','recdp1-b@example.test')`);

  const columns = await q(`select column_name from information_schema.columns
    where table_schema='public' and table_name='private_user_ingredient_avoidance_settings'
    order by ordinal_position`);
  check("separate private settings table has exact governed columns",
    JSON.stringify(columns.map((row) => row.column_name)) === JSON.stringify([
      "setting_id", "user_id", "source_vocabulary_id", "source_vocabulary_version",
      "source_value_key", "created_at", "updated_at"
    ]), columns);
  await q(`insert into public.dietary_restrictions(user_id,restriction_type,label) values
    ('${userA}','allergy','pork'),('${userA}','avoidance','不吃豬')`);
  const legacyBefore = (await q(`select count(*)::integer as count from public.dietary_restrictions
    where user_id='${userA}'`))[0].count;
  const forged = await q(`insert into public.private_user_ingredient_avoidance_settings
    (user_id,source_vocabulary_id,source_vocabulary_version,source_value_key)
    values ('${userA}','private-ingredient-avoidance-v1',1,'fish')`).then(
    () => ({ ok: true }), (error) => ({ ok: false, code: error.code })
  );
  check("arbitrary source key is rejected by frozen P0 FK", !forged.ok && forged.code === "23503", forged);

  const initial = await asUser(userA,
    "select public.read_authenticated_ingredient_avoidance_settings_v1() as settings");
  check("initial reader returns exact governed empty state",
    initial.rows[0].settings.source_vocabulary_id === "private-ingredient-avoidance-v1"
    && initial.rows[0].settings.taxonomy_id === "tastkind-ingredient-avoidance-v1"
    && initial.rows[0].settings.ingredient_avoidance_keys.length === 0
    && initial.rows[0].settings.unresolved_selection_count === 0, initial.rows[0]);

  const pork = await asUser(userA,
    "select public.replace_authenticated_ingredient_avoidance_settings_v1(array['pork']) as settings");
  check("pork persists through canonical current-user writer",
    JSON.stringify(pork.rows[0].settings.ingredient_avoidance_keys) === JSON.stringify(["pork"]));
  const beef = await asUser(userA,
    "select public.replace_authenticated_ingredient_avoidance_settings_v1(array['beef']) as settings");
  check("beef replaces pork with exact deselect semantics",
    JSON.stringify(beef.rows[0].settings.ingredient_avoidance_keys) === JSON.stringify(["beef"])
    && (await q(`select count(*)::integer as count from public.private_user_ingredient_avoidance_settings
      where user_id='${userA}' and source_value_key='pork'`))[0].count === 0);
  const multi = await asUser(userA,
    "select public.replace_authenticated_ingredient_avoidance_settings_v1(array['pork','coriander']) as settings");
  check("pork plus coriander multi-select persists canonically",
    JSON.stringify(multi.rows[0].settings.ingredient_avoidance_keys)
      === JSON.stringify(["coriander", "pork"]));
  const duplicate = await asUser(userA,
    "select public.replace_authenticated_ingredient_avoidance_settings_v1(array['pork','pork'])", true);
  check("duplicate selection is rejected", !duplicate.ok
    && /INGREDIENT_AVOIDANCE_SOURCE_KEY_DUPLICATE/.test(duplicate.message), duplicate);
  const invalid = await asUser(userA,
    "select public.replace_authenticated_ingredient_avoidance_settings_v1(array['fish'])", true);
  check("invalid arbitrary key is rejected", !invalid.ok
    && /INGREDIENT_AVOIDANCE_SOURCE_KEY_NOT_ACTIVE/.test(invalid.message), invalid);
  const label = await asUser(userA,
    "select public.replace_authenticated_ingredient_avoidance_settings_v1(array['豬肉／豬來源成分'])", true);
  check("localized label is presentation-only and rejected as identity", !label.ok
    && /INGREDIENT_AVOIDANCE_SOURCE_KEY_NOT_ACTIVE/.test(label.message), label);

  const actorBInitial = await asUser(userB,
    "select public.read_authenticated_ingredient_avoidance_settings_v1() as settings");
  check("Actor B starts isolated and empty",
    actorBInitial.rows[0].settings.ingredient_avoidance_keys.length === 0);
  await asUser(userB,
    "select public.replace_authenticated_ingredient_avoidance_settings_v1(array['beef'])");
  const actors = await q(`select user_id::text,source_value_key
    from public.private_user_ingredient_avoidance_settings order by user_id,source_value_key`);
  check("Actor B write cannot replace Actor A settings", JSON.stringify(actors) === JSON.stringify([
    { user_id: userA, source_value_key: "coriander" },
    { user_id: userA, source_value_key: "pork" },
    { user_id: userB, source_value_key: "beef" }
  ]), actors);

  const crossWrite = await asUser(userB, `update public.private_user_ingredient_avoidance_settings
    set source_value_key='pork' where user_id='${userA}'`, true);
  check("authenticated actor cannot directly mutate another actor", !crossWrite.ok
    && crossWrite.code === "42501", crossWrite);
  const directOwn = await asUser(userA, `insert into public.private_user_ingredient_avoidance_settings
    (user_id,source_vocabulary_id,source_vocabulary_version,source_value_key)
    values ('${userA}','private-ingredient-avoidance-v1',1,'beef')`, true);
  check("authenticated actor cannot bypass canonical writer for self", !directOwn.ok
    && directOwn.code === "42501", directOwn);
  const anonRead = await asRole("anon",
    "select public.read_authenticated_ingredient_avoidance_settings_v1()", true);
  check("anonymous client cannot execute private reader", !anonRead.ok && anonRead.code === "42501", anonRead);
  const anonWrite = await asRole("anon",
    "select public.replace_authenticated_ingredient_avoidance_settings_v1(array['pork'])", true);
  check("anonymous client cannot execute private writer", !anonWrite.ok && anonWrite.code === "42501", anonWrite);
  const signedOut = await asRole("authenticated",
    "select public.read_authenticated_ingredient_avoidance_settings_v1()", true);
  check("authenticated role without actor fails closed", !signedOut.ok
    && /AUTHENTICATION_REQUIRED/.test(signedOut.message), signedOut);

  await asUser(userA,
    "select public.replace_authenticated_ingredient_avoidance_settings_v1(array['pork'])");
  await q(`update public.private_ingredient_avoidance_source_values
    set active=false,retired_at=pg_catalog.clock_timestamp()
    where source_vocabulary_id='private-ingredient-avoidance-v1'
      and source_vocabulary_version=1 and source_value_key='pork'`);
  const unresolved = await asUser(userA,
    "select public.read_authenticated_ingredient_avoidance_settings_v1() as settings");
  check("retired governed selection remains explicitly unresolved",
    unresolved.rows[0].settings.ingredient_avoidance_keys.length === 0
    && unresolved.rows[0].settings.unresolved_selection_count === 1, unresolved.rows[0]);
  await q(`update public.private_ingredient_avoidance_source_values set active=true,retired_at=null
    where source_vocabulary_id='private-ingredient-avoidance-v1'
      and source_vocabulary_version=1 and source_value_key='pork'`);
  const cleared = await asUser(userA,
    "select public.replace_authenticated_ingredient_avoidance_settings_v1('{}'::text[]) as settings");
  check("empty input clears only Actor A governed REC-D settings",
    cleared.rows[0].settings.ingredient_avoidance_keys.length === 0
    && (await q(`select count(*)::integer as count from public.private_user_ingredient_avoidance_settings
      where user_id='${userA}'`))[0].count === 0
    && (await q(`select count(*)::integer as count from public.private_user_ingredient_avoidance_settings
      where user_id='${userB}' and source_value_key='beef'`))[0].count === 1);
  check("legacy free text and REC-C Allergy rows remain untouched and unclassified",
    (await q(`select count(*)::integer as count from public.dietary_restrictions
      where user_id='${userA}'`))[0].count === legacyBefore
    && (await q(`select count(*)::integer as count from public.dietary_restrictions
      where user_id='${userA}' and source_vocabulary_id is not null`))[0].count === 0);

} catch (error) {
  unexpectedError = { name: error.name, code: error.code, message: error.message };
} finally {
  try { await runner?.end(); } catch { /* closing */ }
  try { await client?.end(); } catch { /* closing */ }
  cluster?.stop(); clearTimeout(watchdog);
}

if (unexpectedError) check("unexpected PostgreSQL harness error", false, unexpectedError);
const remainingDirs = fs.existsSync(workDir)
  ? fs.readdirSync(workDir).filter((entry) => entry.startsWith("recdp1-data-")) : [];
check("disposable PostgreSQL cluster leaves zero data-directory residue",
  remainingDirs.length === 0, remainingDirs);

console.log("\n" + JSON.stringify({
  suite: SUITE,
  status: failures.length ? "failed" : "passed",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  unexpectedError,
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
