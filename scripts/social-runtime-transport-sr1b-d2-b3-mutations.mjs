#!/usr/bin/env node
// SR-1B-D2-B3 mutation proof. Every temporary source rewrite is restored; no network, database,
// credential, Supabase or Production access.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const G = "scripts/social-runtime-transport-sr1b-d2-b3-guard.mjs";
const files = {
  core: "supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts",
  config: "supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts",
  deno: "supabase/functions/_shared/social-runtime-transport/denoPostgresExecutorTransport.ts",
  live: "scripts/social-runtime-transport-sr1b-d2-b3-development-live.ts",
  pkg: "package.json"
};
const originals = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), "utf8")]));
const results = [];
const restore = () => {
  for (const [key, file] of Object.entries(files)) fs.writeFileSync(path.join(root, file), originals[key], "utf8");
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    restore();
    process.exit(128 + ({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1 })[signal]);
  });
}

function mutation(id, name, target, from, to) {
  const original = originals[target];
  if (!original.includes(from)) {
    results.push({ id, name, applied: false, killed: false, status: "anchor_missing" });
    return;
  }
  const changed = original.replace(from, to);
  if (changed === original) {
    results.push({ id, name, applied: false, killed: false, status: "no_op" });
    return;
  }
  let killed = false;
  let crashed = false;
  try {
    fs.writeFileSync(path.join(root, files[target]), changed, "utf8");
    const run = spawnSync(process.execPath, [G], { cwd: root, encoding: "utf8", windowsHide: true });
    killed = run.status !== 0;
  } catch {
    crashed = true;
  } finally {
    restore();
  }
  results.push({ id, name, applied: true, killed,
    status: killed ? "killed" : crashed ? "harness_crash" : "survived" });
}

mutation(1, "hard-coded credential replaces environment boundary", "config",
  "const raw = readEnvironment(SOCIAL_RUNTIME_EXECUTOR_TRANSACTION_URL_ENV)?.trim();",
  "const raw = 'hard-coded-development-credential';");
mutation(2, "service_role substitute appears", "config",
  '  "SOCIAL_RUNTIME_EXECUTOR_SUPAVISOR_TRANSACTION_URL" as const;',
  '  "SUPABASE_SERVICE_ROLE_KEY" as const;');
mutation(3, "session-mode port 5432 replaces transaction mode", "config",
  'export const SOCIAL_RUNTIME_SUPAVISOR_TRANSACTION_PORT = "6543" as const;',
  'export const SOCIAL_RUNTIME_SUPAVISOR_TRANSACTION_PORT = "5432" as const;');
mutation(4, "prepared statements are enabled", "deno", "  prepare: false,", "  prepare: true,");
mutation(5, "generic SQL client is exported", "deno",
  "export function createDenoSocialRuntimeExecutorTransport()",
  "export const rawSqlClient = sql;\n\nexport function createDenoSocialRuntimeExecutorTransport()");
mutation(6, "authority membership grant is embedded", "core",
  "declare const executorStatementRows: unique symbol;",
  "const authorityGrant = 'grant social_authority to social_runtime_executor';\ndeclare const executorStatementRows: unique symbol;");
mutation(7, "protected table SELECT is embedded", "core",
  "declare const executorStatementRows: unique symbol;",
  "const protectedRead = 'select * from public.taste_profiles';\ndeclare const executorStatementRows: unique symbol;");
mutation(8, "D1 protected invocation is embedded", "core",
  "declare const executorStatementRows: unique symbol;",
  "const authorityCall = 'authorized_candidates';\ndeclare const executorStatementRows: unique symbol;");
mutation(9, "driver errors are no longer returned through the bounded callback", "core",
  "      return await this.#driver.withTransaction(async (driverTransaction) => {",
  "      await this.#driver.withTransaction(async (driverTransaction) => {");
mutation(10, "transaction scope cleanup is removed", "core",
  "          scopeActive = false;",
  "          void scopeActive;");
mutation(11, "connection URL is logged", "deno",
  "  const sql = postgres(config.connectionUrl, SOCIAL_RUNTIME_POSTGRES_OPTIONS);",
  "  console.log(config.connectionUrl);\n  const sql = postgres(config.connectionUrl, SOCIAL_RUNTIME_POSTGRES_OPTIONS);");
mutation(12, "Production project replaces Development", "config",
  'export const SOCIAL_RUNTIME_DEVELOPMENT_PROJECT_REF = "msbgnnoorsoefuiwluye" as const;',
  'export const SOCIAL_RUNTIME_DEVELOPMENT_PROJECT_REF = "productionprojectrefx" as const;');
mutation(13, "TLS requirement is disabled", "deno", '  ssl: "require" as const,', '  ssl: false as const,');
mutation(14, "transaction callback is removed", "deno",
  "      return await sql.begin(async (transactionSql) => {",
  "      return await (async (transactionSql) => {");

// ---- corrected live-command permission contract ------------------------------------------------
const ALLOW_ENV = "--allow-env=SOCIAL_RUNTIME_EXECUTOR_SUPAVISOR_TRANSACTION_URL,PGAPPNAME,PGBACKOFF,"
  + "PGDEBUG,PGFETCH_TYPES,PGKEEP_ALIVE,PGMAX_LIFETIME,PGMAX_PIPELINE,PGPUBLICATIONS,"
  + "PGTARGETSESSIONATTRS,PGTARGET_SESSION_ATTRS";

mutation(15, "a required postgres env read is dropped from the allowlist", "pkg",
  ",PGMAX_LIFETIME", "");
mutation(16, "the allowlist is replaced by unrestricted --allow-env", "pkg",
  ALLOW_ENV, "--allow-env");
mutation(17, "-A grants every permission", "pkg",
  "deno run --node-modules-dir=none", "deno run -A --node-modules-dir=none");
mutation(18, "--allow-all grants every permission", "pkg",
  "deno run --node-modules-dir=none", "deno run --allow-all --node-modules-dir=none");
mutation(19, "global npm cache resolution is removed", "pkg", "--node-modules-dir=none ", "");
mutation(20, "lockfile suppression is removed", "pkg", "--no-lock ", "");
mutation(21, "PGHOST becomes alternate connection authority", "pkg", ",PGAPPNAME", ",PGHOST,PGAPPNAME");
mutation(22, "PGPASSWORD becomes alternate connection authority", "pkg",
  ",PGAPPNAME", ",PGPASSWORD,PGAPPNAME");
mutation(23, "the ambient PG fail-closed check is removed", "live",
  "if (!ambientPgEnvironment.ok) {", "if (false) {");
mutation(24, "ambient PG failure degrades into ignore-and-continue", "live",
  "  }));\n  Deno.exit(1);\n}\n\nconst transport", "  }));\n}\n\nconst transport");
mutation(25, "the ambient PG allowlist silently gains a connection variable", "config",
  '  "PGAPPNAME",', '  "PGHOST",\n  "PGAPPNAME",');
mutation(26, "the ambient check treats present variables as absent", "config",
  ".trim().length > 0", ".trim().length < 0");

restore();
const survived = results.filter((entry) => entry.applied && !entry.killed);
const notApplied = results.filter((entry) => !entry.applied);
const crashes = results.filter((entry) => entry.status === "harness_crash");
console.log(JSON.stringify({
  suite: "social-runtime-transport-sr1b-d2-b3-mutations",
  status: survived.length || notApplied.length || crashes.length ? "failed" : "passed",
  totalMutations: results.length,
  applied: results.length - notApplied.length,
  killed: results.filter((entry) => entry.killed).length,
  survived: survived.length,
  noOp: results.filter((entry) => entry.status === "no_op").length,
  anchorMissing: results.filter((entry) => entry.status === "anchor_missing").length,
  harnessCrash: crashes.length,
  results,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
process.exit(survived.length || notApplied.length || crashes.length ? 1 : 0);
