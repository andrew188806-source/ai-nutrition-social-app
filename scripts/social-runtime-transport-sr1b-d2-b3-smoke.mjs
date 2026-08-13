#!/usr/bin/env node
// SR-1B-D2-B3 local semantic smoke. Uses an in-memory driver contract only: no network, database,
// credential, Supabase or Production access.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const checks = [];
const expect = (pass, name, detail) => {
  const result = { name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) };
  checks.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
};

function loadTs(relativePath) {
  const absolute = path.join(root, relativePath);
  const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: absolute
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(require_, module, module.exports);
  return module.exports;
}

const core = loadTs("supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts");
const config = loadTs("supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts");
const {
  SocialRuntimeExecutorTransport,
  SocialRuntimeTransactionAbortedError,
  defineSocialRuntimeExecutorStatement
} = core;

const ONE = defineSocialRuntimeExecutorStatement`select 1 as value`;
const PARAMETER = defineSocialRuntimeExecutorStatement`select $1::text as value`;

function fakeDriver() {
  const events = [];
  let closeCount = 0;
  const driver = {
    async withTransaction(operation) {
      events.push("begin");
      try {
        const result = await operation({
          async queryObject(text, parameters) {
            events.push({ type: "query", text, parameters: [...parameters] });
            if (text.includes("forced_failure")) throw new Error("fixture_query_failure");
            return [{ value: parameters[0] ?? 1 }];
          }
        });
        events.push("commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      } finally {
        events.push("release");
      }
    },
    async close() {
      closeCount += 1;
      events.push("close");
    }
  };
  return { driver, events, closeCount: () => closeCount };
}

// ---- static statement boundary -----------------------------------------------------------------
expect(ONE.text === "select 1 as value", "1. a single static statement is accepted");
expect(Object.isFrozen(ONE), "2. statement descriptors are immutable");
let interpolationRejected = false;
try { defineSocialRuntimeExecutorStatement`select ${1}`; } catch { interpolationRejected = true; }
expect(interpolationRejected, "3. SQL template interpolation is rejected");
let multiRejected = false;
try { defineSocialRuntimeExecutorStatement(["select 1; select 2"]); } catch { multiRejected = true; }
expect(multiRejected, "4. multiple SQL statements are rejected");
let emptyRejected = false;
try { defineSocialRuntimeExecutorStatement(["   "]); } catch { emptyRejected = true; }
expect(emptyRejected, "5. empty SQL is rejected");
let nulRejected = false;
try { defineSocialRuntimeExecutorStatement(["select '\0'"]); } catch { nulRejected = true; }
expect(nulRejected, "6. NUL-containing SQL is rejected");
{
  const fake = fakeDriver();
  const transport = new SocialRuntimeExecutorTransport(fake.driver);
  let forgedRejected = false;
  try {
    await transport.withTransaction((transaction) => transaction.query({ text: "select 1 as value" }));
  } catch {
    forgedRejected = true;
  }
  expect(forgedRejected, "6a. a structurally forged generic SQL descriptor is rejected");
}

// ---- transaction success/error/cleanup ---------------------------------------------------------
{
  const fake = fakeDriver();
  const transport = new SocialRuntimeExecutorTransport(fake.driver);
  const rows = await transport.withTransaction((transaction) => transaction.query(PARAMETER, ["bounded-value"]));
  expect(rows[0].value === "bounded-value", "7. protocol parameters remain separate from SQL text");
  expect(JSON.stringify(fake.events.map((entry) => typeof entry === "string" ? entry : entry.type)) ===
    JSON.stringify(["begin", "query", "commit", "release"]),
  "8. success follows begin/query/commit/release lifecycle", fake.events);
  await transport.close();
  await transport.close();
  expect(fake.closeCount() === 1, "9. pool close is idempotent");
  let closedRejected = false;
  try { await transport.withTransaction(async () => 1); } catch { closedRejected = true; }
  expect(closedRejected, "10. a closed transport fails closed");
}

{
  const fake = fakeDriver();
  const transport = new SocialRuntimeExecutorTransport(fake.driver);
  let callbackFailure = false;
  try {
    await transport.withTransaction(async () => { throw new Error("fixture_callback_failure"); });
  } catch (error) {
    callbackFailure = error instanceof Error && error.message === "fixture_callback_failure";
  }
  expect(callbackFailure, "11. callback errors escape instead of becoming empty success");
  expect(fake.events.join(",") === "begin,rollback,release", "12. callback failure rolls back before release", fake.events);
  const next = await transport.withTransaction((transaction) => transaction.query(ONE));
  expect(next[0].value === 1, "13. transport remains usable after a rolled-back callback");
}

{
  const fake = fakeDriver();
  const transport = new SocialRuntimeExecutorTransport(fake.driver);
  const FAILURE = defineSocialRuntimeExecutorStatement`select forced_failure`;
  let queryFailure = false;
  try { await transport.withTransaction((transaction) => transaction.query(FAILURE)); }
  catch (error) { queryFailure = error instanceof Error && error.message === "fixture_query_failure"; }
  expect(queryFailure, "14. driver query errors escape unchanged");
  expect(fake.events.some((entry) => entry === "rollback"), "15. driver query error rolls back");
}

{
  const fake = fakeDriver();
  const transport = new SocialRuntimeExecutorTransport(fake.driver);
  let explicitAbort = false;
  try { await transport.withTransaction(async (transaction) => transaction.abort("fixture_abort")); }
  catch (error) { explicitAbort = error instanceof SocialRuntimeTransactionAbortedError && error.message === "fixture_abort"; }
  expect(explicitAbort, "16. explicit abort is a typed error, never a successful empty result");
  expect(fake.events.join(",") === "begin,rollback,release", "17. explicit abort rolls back and releases", fake.events);
}

{
  const fake = fakeDriver();
  const transport = new SocialRuntimeExecutorTransport(fake.driver);
  let captured;
  await transport.withTransaction(async (transaction) => { captured = transaction; return null; });
  let staleRejected = false;
  try { await captured.query(ONE); } catch { staleRejected = true; }
  expect(staleRejected, "18. a captured transaction scope cannot be reused after completion");
}

{
  const fake = fakeDriver();
  const transport = new SocialRuntimeExecutorTransport(fake.driver);
  let releaseOperation;
  const wait = new Promise((resolve) => { releaseOperation = resolve; });
  const running = transport.withTransaction(async () => { await wait; return 1; });
  await Promise.resolve();
  let busyRejected = false;
  try { await transport.close(); } catch { busyRejected = true; }
  expect(busyRejected, "19. closing while a transaction is active fails closed");
  releaseOperation();
  await running;
  await transport.close();
  expect(fake.closeCount() === 1, "20. pool can close after the active transaction finishes");
}

// ---- Development-only config -------------------------------------------------------------------
const projectRef = config.SOCIAL_RUNTIME_DEVELOPMENT_PROJECT_REF;
const user = `social_runtime_executor.${projectRef}`;
const credentialPlaceholder = ["runtime", "credential", "placeholder"].join("-");
const validUrl = `postgresql://${user}:${credentialPlaceholder}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
expect(config.loadSocialRuntimeExecutorTransportConfig(() => undefined).errorCode === "executor_transaction_url_missing",
  "21. missing runtime credential fails closed");
expect(config.loadSocialRuntimeExecutorTransportConfig(() => validUrl).ok,
  "22. exact Development Supavisor transaction URL shape is accepted");
expect(!config.loadSocialRuntimeExecutorTransportConfig(() => validUrl.replace(":6543/", ":5432/")).ok,
  "23. session-mode port 5432 is rejected");
expect(!config.loadSocialRuntimeExecutorTransportConfig(() => validUrl.replace("social_runtime_executor", "postgres")).ok,
  "24. a non-executor database identity is rejected");
expect(!config.loadSocialRuntimeExecutorTransportConfig(() => validUrl.replace(projectRef, "productionprojectrefx")).ok,
  "25. a different project ref is rejected");
expect(!config.loadSocialRuntimeExecutorTransportConfig(() => validUrl.replace(".pooler.supabase.com", ".example.com")).ok,
  "26. a non-Supavisor host is rejected");
expect(!config.loadSocialRuntimeExecutorTransportConfig(() => validUrl.replace(`:${credentialPlaceholder}@`, ":@")).ok,
  "27. an empty executor credential is rejected");
expect(!config.loadSocialRuntimeExecutorTransportConfig(() => `${validUrl}?prepare=true`).ok,
  "28. query-string transport overrides are rejected");

// ---- Ambient PG environment must never become connection authority ------------------------------
const ambientNames = config.SOCIAL_RUNTIME_POSTGRES_AMBIENT_ENV_NAMES;
const requiredPgEnv = ["PGAPPNAME", "PGBACKOFF", "PGDEBUG", "PGFETCH_TYPES", "PGKEEP_ALIVE",
  "PGMAX_LIFETIME", "PGMAX_PIPELINE", "PGPUBLICATIONS", "PGTARGETSESSIONATTRS",
  "PGTARGET_SESSION_ATTRS"];
expect(Array.isArray(ambientNames) && Object.isFrozen(ambientNames)
  && ambientNames.length === requiredPgEnv.length
  && requiredPgEnv.every((name) => ambientNames.includes(name)),
  "29. ambient PG allowlist is frozen and exactly the proven postgres@3.4.7 reads", ambientNames);
expect(["PGHOST", "PGPORT", "PGUSER", "PGUSERNAME", "PGPASSWORD", "PGDATABASE"]
  .every((name) => !ambientNames.includes(name)),
  "30. ambient PG allowlist carries no alternate connection-authority variable");
expect(config.assertNoAmbientPgEnvironment(() => undefined).ok,
  "31. a clean environment passes the ambient PG gate");
expect(config.assertNoAmbientPgEnvironment(() => "").ok
  && config.assertNoAmbientPgEnvironment(() => "   ").ok,
  "32. empty and whitespace-only ambient values are treated as absent");
for (const name of requiredPgEnv) {
  const outcome = config.assertNoAmbientPgEnvironment((probed) => probed === name ? "injected" : undefined);
  expect(outcome.ok === false && outcome.errorCode === "ambient_pg_environment_present"
    && outcome.presentNames.length === 1 && outcome.presentNames[0] === name,
    `33.${name} a present ambient ${name} fails closed`);
}
const everyPresent = config.assertNoAmbientPgEnvironment(() => "injected");
expect(everyPresent.ok === false
  && everyPresent.presentNames.length === requiredPgEnv.length,
  "34. every ambient PG variable is reported when all are present");
expect(!JSON.stringify(everyPresent).includes("injected"),
  "35. the ambient failure outcome reports names only and never leaks a value");

const failures = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  suite: "social-runtime-transport-sr1b-d2-b3-smoke",
  status: failures.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
process.exit(failures.length ? 1 : 0);
