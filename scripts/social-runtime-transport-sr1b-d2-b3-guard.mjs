#!/usr/bin/env node
// SR-1B-D2-B3 guard — Development Supavisor transaction transport substrate.
// Fully local: no network, database, credential, Supabase or Production access.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { SR1C_SUCCESSOR_PATHS } from "./social-ingress-sr1c-successor-manifest.mjs";
import { SR1D_SUCCESSOR_PATHS } from "./social-taste-sr1d-successor-manifest.mjs";

const root = process.cwd();
const baseline = "9e6dc426a9b8e6f6b01937f068abbdb5609caac3";
const freezeMessage = "Add Social runtime transaction transport substrate";
const TRANSPORT_ROOT = "supabase/functions/_shared/social-runtime-transport";
const CORE = `${TRANSPORT_ROOT}/executorTransactionTransport.ts`;
const CONFIG = `${TRANSPORT_ROOT}/executorTransportConfig.ts`;
const DENO = `${TRANSPORT_ROOT}/denoPostgresExecutorTransport.ts`;
const LIVE = "scripts/social-runtime-transport-sr1b-d2-b3-development-live.ts";
const GUARD = "scripts/social-runtime-transport-sr1b-d2-b3-guard.mjs";
const SMOKE = "scripts/social-runtime-transport-sr1b-d2-b3-smoke.mjs";
const MUTATIONS = "scripts/social-runtime-transport-sr1b-d2-b3-mutations.mjs";
const predecessorGuards = [
  "scripts/social-runtime-executor-sr1b-d2-b2-guard.mjs",
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-participation-sr1b-c-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts3-guard.mjs",
  "scripts/taste-similarity-ts3b-r1-guard.mjs",
  "scripts/taste-similarity-ts3c-guard.mjs",
  "scripts/taste-similarity-ts3d-guard.mjs",
  "scripts/taste-similarity-ts3e-guard.mjs",
  "scripts/taste-similarity-ts4-guard.mjs",
  "scripts/taste-similarity-ts5-guard.mjs",
  "scripts/taste-similarity-ts6-guard.mjs"
];
const manifest = ["package.json", CORE, CONFIG, DENO, LIVE, GUARD, SMOKE, MUTATIONS, ...predecessorGuards].sort();
const frozenMigrations = [
  "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql",
  "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql",
  "supabase/migrations/20260810050000_social_runtime_executor_role.sql"
];

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const same = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);
function candidatePaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0").filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}
function changedSince(ref, pathspec) {
  const tracked = lines(git(["diff", "--name-only", ref, "--", pathspec]));
  const untracked = lines(git(["ls-files", "--others", "--exclude-standard", "--", pathspec]));
  return [...new Set([...tracked, ...untracked])].sort();
}
function executable(source) {
  return source.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//")) return "";
    const commentAt = line.indexOf("//");
    return commentAt === -1 ? line : line.slice(0, commentAt);
  }).join("\n");
}
function packageOnlyAddsB3Scripts(freeze) {
  const before = JSON.parse(git(["show", `${baseline}:package.json`]));
  const after = JSON.parse(freeze ? git(["show", `${freeze}:package.json`]) : read("package.json"));
  for (const key of [
    "test:social-runtime-transport-sr1b-d2-b3",
    "test:social-runtime-transport-sr1b-d2-b3-smoke",
    "test:social-runtime-transport-sr1b-d2-b3-mutations",
    "test:social-runtime-transport-sr1b-d2-b3-development-live"
  ]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}
function exportedNames(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = [];
  for (const statement of ast.statements) {
    const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (statement.name?.text) names.push(statement.name.text);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
      }
    }
  }
  return names.sort();
}

try {
  const freeze = git(["log", "--format=%H%x09%s", `${baseline}..HEAD`]).split(/\r?\n/).filter(Boolean)
    .map((entry) => entry.split("\t")).find(([, subject]) => subject === freezeMessage)?.[0] ?? null;
  const lifecycleManifest = freeze
    ? lines(git(["diff-tree", "--no-commit-id", "--name-only", "-r", freeze]))
    : candidatePaths();
  const core = read(CORE);
  const config = read(CONFIG);
  const deno = read(DENO);
  const production = `${core}\n${config}\n${deno}`;
  const productionExecutable = executable(production);
  const live = read(LIVE);

  check("1. candidate/freeze manifest is exactly enumerated", same(lifecycleManifest, manifest),
    { expected: manifest, actual: lifecycleManifest });
  check("2. every manifest path exists", manifest.every((entry) => fs.existsSync(path.join(root, entry))));
  check("3. package.json adds only four B3 validation/live commands", packageOnlyAddsB3Scripts(freeze));
  check("4. authority baseline is an ancestor of HEAD", git(["merge-base", baseline, "HEAD"]).trim() === baseline);
  check("5. no migration outside exact SR-1C successor was added or changed",
    changedSince(baseline, "supabase/migrations").every((entry) => SR1C_SUCCESSOR_PATHS.includes(entry) || SR1D_SUCCESSOR_PATHS.includes(entry)),
    changedSince(baseline, "supabase/migrations"));
  check("6. D1/B1/B2 frozen migrations are byte-unchanged",
    frozenMigrations.every((file) => git(["diff", "--name-only", baseline, "--", file]).trim() === ""));
  check("7. only exact SR-1C config and Edge successors were added",
    changedSince(baseline, "supabase/config.toml").every((entry) => SR1C_SUCCESSOR_PATHS.includes(entry) || SR1D_SUCCESSOR_PATHS.includes(entry))
    && changedSince(baseline, "supabase/functions").every((entry) => entry.startsWith(`${TRANSPORT_ROOT}/`) || SR1C_SUCCESSOR_PATHS.includes(entry) || SR1D_SUCCESSOR_PATHS.includes(entry)));
  check("8. B3 adapter paths remain exactly its three non-deployable shared modules",
    same(changedSince(baseline, "supabase/functions").filter((entry) => !SR1C_SUCCESSOR_PATHS.includes(entry) && !SR1D_SUCCESSOR_PATHS.includes(entry)), [CORE, CONFIG, DENO].sort()));

  check("9. production adapter has no HTTP/Auth/candidate/client surface",
    !/\bDeno\.serve\b|\bRequest\b|\bResponse\b|getUser\s*\(|authorization|candidate[_A-Z]|actor[_A-Z]|viewer[_A-Z]/i.test(productionExecutable));
  check("10. production adapter never names or invokes D1/D2-B1 authority",
    !/authorized_candidates|may_evaluate_candidate|authorized_pair_sources/i.test(productionExecutable));
  check("11. production adapter contains no grant, role activation, protected table or migration SQL",
    !/\bgrant\b|\brevoke\b|\bset\s+(local\s+)?role\b|social_(authority|pair_read_authority)|public\.(taste_profiles|nutrition_goals|dietary_restrictions|meal_records|meal_record_items|favorite_restaurants|favorite_menu_items)/i.test(productionExecutable));
  check("12. no service_role/admin credential or EXPO_PUBLIC environment dependency exists",
    !/service[_-]?role|SUPABASE_SERVICE_ROLE_KEY|ADMIN_KEY|EXPO_PUBLIC/i.test(productionExecutable));
  check("13. no source logs a credential, URL, query or raw error",
    !/console\.(log|error|warn|debug)|logger\.|JSON\.stringify\s*\(.*(connection|credential|password|url|error)/is.test(productionExecutable));

  const coreExports = exportedNames(core, CORE);
  check("14. core exports only the bounded statement/transaction substrate",
    same(coreExports, ["SocialRuntimeExecutorDriverTransaction", "SocialRuntimeExecutorStatement",
      "SocialRuntimeExecutorTransaction", "SocialRuntimeExecutorTransactionDriver",
      "SocialRuntimeExecutorTransport", "SocialRuntimeTransactionAbortedError",
      "defineSocialRuntimeExecutorStatement"].sort()), coreExports);
  check("15. statement constructor requires a real frozen interpolation-free tag and one statement",
    /parts\.length !== 1/.test(core) && /Array\.isArray\(parts\.raw\)/.test(core)
    && /Object\.isFrozen\(parts\)/.test(core) && /Object\.isFrozen\(parts\.raw\)/.test(core)
    && /withoutOptionalTerminator\.includes\(";"\)/.test(core));
  check("15a. statements require a module-private runtime brand that forged descriptors cannot supply",
    /const executorStatementBrand: unique symbol = Symbol/.test(core)
    && /\[executorStatementBrand\]: true/.test(core)
    && /statement\[executorStatementBrand\] !== true/.test(core));
  check("16. transaction scope closes in finally and cannot be reused",
    /scopeActive = false/.test(core) && /finally\s*\{[\s\S]*scopeActive = false/.test(core)
    && /transaction_scope_closed/.test(core));
  check("17. transaction errors are not swallowed or converted to an empty result",
    !/catch\s*\([^)]*\)\s*\{[\s\S]{0,160}(return\s+\[\]|return\s+null|return\s+undefined)/.test(core)
    && /return await this\.#driver\.withTransaction/.test(core));
  check("18. close is explicit, idempotent and refuses an active transaction",
    /async close\(\)/.test(core) && /#activeTransactions !== 0/.test(core)
    && /transport_busy/.test(core) && /await this\.#driver\.close\(\)/.test(core));

  check("19. config reads exactly the dedicated executor transaction URL environment variable",
    config.includes('"SOCIAL_RUNTIME_EXECUTOR_SUPAVISOR_TRANSACTION_URL"')
    && /const raw = readEnvironment\(SOCIAL_RUNTIME_EXECUTOR_TRANSACTION_URL_ENV\)\?\.trim\(\);/.test(config)
    && (config.match(/readEnvironment\(SOCIAL_RUNTIME_EXECUTOR_TRANSACTION_URL_ENV\)/g) ?? []).length === 1
    && !/Deno\.env/.test(config));
  check("20. config pins Development project ref, executor identity, Supavisor host and port 6543",
    config.includes('"msbgnnoorsoefuiwluye"')
    && config.includes("social_runtime_executor.${SOCIAL_RUNTIME_DEVELOPMENT_PROJECT_REF}")
    && config.includes('.pooler.supabase.com"') && config.includes('"6543"'));
  check("21. config rejects missing password, query overrides, fragments and non-postgres schemes",
    /parsed\.password\.length > 0/.test(config) && /parsed\.search === ""/.test(config)
    && /parsed\.hash === ""/.test(config) && /parsed\.protocol === "postgres:"/.test(config));

  check("22. Deno binding uses the official-compatible npm Postgres.js driver with an exact version",
    /from "npm:postgres@3\.4\.7"/.test(deno));
  check("23. transaction-pool options are immutable: max one, prepare false, TLS required",
    /Object\.freeze\(\{[\s\S]*max:\s*1[\s\S]*prepare:\s*false[\s\S]*ssl:\s*"require"/.test(deno));
  check("24. every operation uses Postgres.js begin callback and closes the pool explicitly",
    /sql\.begin\(async \(transactionSql\)/.test(deno) && /await sql\.end\(\{ timeout: 5 \}\)/.test(deno));
  check("25. SQL values remain separate parameters and no application sql client is exported",
    /transactionSql\.unsafe\(text, parameters as never\[\]\)/.test(deno)
    && !exportedNames(deno, DENO).some((name) => /sql|client|driver/i.test(name)));
  check("26. binding reads Deno.env only through the validated config loader",
    (deno.match(/Deno\.env\.get/g) ?? []).length === 1
    && /loadSocialRuntimeExecutorTransportConfig\(\(name\) => Deno\.env\.get\(name\)\)/.test(deno));

  check("27. live acceptance is a non-HTTP script and targets only the shared transport",
    !/Deno\.serve|new Response|fetch\s*\(/.test(live) && /createDenoSocialRuntimeExecutorTransport/.test(live));
  check("28. live acceptance checks identity, role flags, memberships and all seven protected tables",
    /session_user/.test(live) && /rolsuper/.test(live) && /rolbypassrls/.test(live) && /rolinherit/.test(live)
    && /pg_has_role/.test(live)
    && ["taste_profiles", "nutrition_goals", "dietary_restrictions", "meal_records", "meal_record_items",
      "favorite_restaurants", "favorite_menu_items"].every((table) => live.includes(`public.${table}`)));
  check("29. live acceptance proves D1/B1 denial, rollback, error recovery and pooled local-state reset",
    /authorized_candidates/.test(live) && /authorized_pair_sources/.test(live)
    && /transaction\.abort/.test(live) && /select 1 \/ 0/.test(live)
    && /set_config\([^)]*true\)/s.test(live) && /current_setting/.test(live));
  check("29a. live prepared-statement proof reads the production adapter options, never an unconditional pass",
    /SOCIAL_RUNTIME_POSTGRES_OPTIONS\.prepare === false/.test(live)
    && /SOCIAL_RUNTIME_POSTGRES_OPTIONS\.max === 1/.test(live)
    && !/record\([^\n]*prepared[^\n]*,\s*true\)/i.test(live));
  check("29b. live denial probes require PostgreSQL insufficient_privilege rather than any error",
    /\(error as \{ code\?: unknown \}\)\.code === "42501"/.test(live));
  // The fail-closed ambient check exits before a transport exists, so the FIRST Deno.exit legitimately
  // precedes close(); what must hold is that the terminal exit still follows it.
  check("29c. live acceptance closes the transport before its terminal exit",
    /finally\s*\{[\s\S]*await transport\.close\(\)/.test(live)
    && live.lastIndexOf("Deno.exit") > live.indexOf("await transport.close()"));

  // Postgres.js 3.4.7 env reads, derived from driver source and confirmed by runtime probe: eight from
  // `env['PG' + key.toUpperCase()]` over unpinned defaults, plus PGAPPNAME and the underscore-free
  // PGTARGETSESSIONATTRS read by tsa(). Connection-authority names must never appear.
  const requiredPgEnv = ["PGAPPNAME", "PGBACKOFF", "PGDEBUG", "PGFETCH_TYPES", "PGKEEP_ALIVE",
    "PGMAX_LIFETIME", "PGMAX_PIPELINE", "PGPUBLICATIONS", "PGTARGETSESSIONATTRS",
    "PGTARGET_SESSION_ATTRS"];
  const forbiddenPgEnv = ["PGHOST", "PGPORT", "PGUSER", "PGUSERNAME", "PGPASSWORD", "PGDATABASE",
    "PGSSLMODE", "PGSERVICE", "PGOPTIONS", "PGCONNECT_TIMEOUT", "PGSSLROOTCERT"];
  const liveCommand = JSON.parse(read("package.json"))
    .scripts["test:social-runtime-transport-sr1b-d2-b3-development-live"] ?? "";
  const allowEnv = /--allow-env=(\S+)/.exec(liveCommand);
  const allowEnvNames = allowEnv ? allowEnv[1].split(",") : [];

  check("30. live command grants an explicit env allowlist, never blanket permission",
    Boolean(allowEnv) && !/--allow-env(\s|$)/.test(liveCommand)
    && !/(^|\s)-A(\s|$)/.test(liveCommand) && !/--allow-all/.test(liveCommand));
  check("30a. allowlist grants the canonical runtime URL variable",
    allowEnvNames.includes("SOCIAL_RUNTIME_EXECUTOR_SUPAVISOR_TRANSACTION_URL"));
  check("30b. allowlist grants every unavoidable postgres@3.4.7 PG env read",
    requiredPgEnv.every((name) => allowEnvNames.includes(name)),
    { missing: requiredPgEnv.filter((name) => !allowEnvNames.includes(name)) });
  check("30c. allowlist grants no alternate connection-authority PG variable",
    forbiddenPgEnv.every((name) => !allowEnvNames.includes(name)),
    { present: forbiddenPgEnv.filter((name) => allowEnvNames.includes(name)) });
  check("30d. allowlist is exactly the URL plus the proven reads — nothing speculative",
    allowEnvNames.length === requiredPgEnv.length + 1
    && allowEnvNames.every((name) => name === "SOCIAL_RUNTIME_EXECUTOR_SUPAVISOR_TRANSACTION_URL"
      || requiredPgEnv.includes(name)), allowEnvNames);
  check("30e. live command resolves npm from the global cache and cannot emit a lockfile",
    /--node-modules-dir=none/.test(liveCommand) && /--no-lock/.test(liveCommand));
  check("30f. live command keeps the narrow network permission and canonical entrypoint",
    /--allow-net(\s|$)/.test(liveCommand) && liveCommand.includes(LIVE));
  check("30g. no deno.lock is present or carried in the candidate",
    !fs.existsSync(path.join(root, "deno.lock")) && !manifest.includes("deno.lock"));
  check("30h. config freezes the ambient PG allowlist to exactly the proven reads",
    /SOCIAL_RUNTIME_POSTGRES_AMBIENT_ENV_NAMES = Object\.freeze\(/.test(config)
    && requiredPgEnv.every((name) => config.includes(`"${name}"`))
    && forbiddenPgEnv.every((name) => !config.includes(`"${name}"`)));
  check("30i. ambient PG check fails closed and reports names only, never values",
    /export function assertNoAmbientPgEnvironment/.test(config)
    && /errorCode: "ambient_pg_environment_present"/.test(config)
    && /presentNames/.test(config) && /\.trim\(\)\.length > 0/.test(config));
  check("30j. live acceptance fails closed on ambient PG variables before a driver is built",
    live.includes("assertNoAmbientPgEnvironment((name) => Deno.env.get(name))")
    && live.indexOf("assertNoAmbientPgEnvironment((name) => Deno.env.get(name))")
      < live.indexOf("createDenoSocialRuntimeExecutorTransport()")
    && /if \(!ambientPgEnvironment\.ok\)/.test(live) && /Deno\.exit\(1\)/.test(live));
  // Presence of Deno.exit anywhere is not enough — the terminal exit would satisfy that while the
  // ambient branch fell through. Require the exit inside the branch itself.
  const ambientBranch = live.slice(live.indexOf("if (!ambientPgEnvironment.ok)"),
    live.indexOf("const transport = createDenoSocialRuntimeExecutorTransport()"));
  check("30k. the ambient failure branch itself exits — never ignores, overwrites or continues",
    /Deno\.exit\(1\);/.test(ambientBranch)
    && !/ambientPgEnvironment\.ok\s*\|\|/.test(live) && !/Deno\.env\.set/.test(live)
    && !/void ambientPgEnvironment/.test(live));
  check("30l. production adapter option values remain exactly frozen",
    /max: 1/.test(deno) && /prepare: false/.test(deno) && /ssl: "require"/.test(deno)
    && /connect_timeout: 10/.test(deno) && /idle_timeout: 20/.test(deno)
    && config.includes('"6543"') && !/5432/.test(`${config}\n${deno}\n${liveCommand}`));

  check("31. predecessor amendments name all three exact B3 paths",
    predecessorGuards.every((file) => [CORE, CONFIG, DENO].every((entry) => read(file).includes(entry))));
  check("32. predecessor amendments contain no wildcard successor allowance",
    predecessorGuards.every((file) => !/social-runtime-transport\/\*|social-runtime-transport\/\.\*/.test(read(file))));
  check("33. staged diff is empty while candidate is open", freeze !== null || git(["diff", "--cached", "--name-only"]).trim() === "");
  check("34. no credential-like literal appears in production or validation source",
    !/(?:postgres|postgresql):\/\/[^\s:@/]+:[^\s@/]+@/i.test(`${production}\n${live}\n${read(GUARD)}\n${read(MUTATIONS)}`)
    && !/(?:password|credential|secret)\s*[:=]\s*["'][^"']+["']/i.test(productionExecutable));
  check("35. no Production hostname/project/credential operation appears",
    !/production[_-]?(database|project|credential|secret)|supabase\s+(secrets|db|migration|functions)\s+(set|push|deploy|repair)/i.test(`${production}\n${live}`));

  console.log(JSON.stringify({
    suite: "social-runtime-transport-sr1b-d2-b3-guard",
    status: failures.length ? "failed" : "passed",
    lifecycle: freeze ? "frozen" : "implementation_candidate",
    baseline,
    freezeCommit: freeze,
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
} catch (error) {
  console.error(JSON.stringify({
    suite: "social-runtime-transport-sr1b-d2-b3-guard",
    status: "crashed",
    error: error instanceof Error ? error.message : String(error),
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false
  }, null, 2));
  process.exit(1);
}
