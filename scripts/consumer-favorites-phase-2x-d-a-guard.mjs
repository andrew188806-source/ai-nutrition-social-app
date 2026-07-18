import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const phase2xAFrozenCommit = "7e4a9148b5caa73955d87570ea6aed645aff9bfe";
const phase2xBFrozenCommit = "bb45c808ef7c1773bc7fd7d5a32da935bf291a78";
const phase2xCAFrozenCommit = "4053673de0e533e7e4376d21fb4e93c6d85cdff4";
const phase2xCBFrozenCommit = "ae71d5a42835679af709bf0098593f4a1ea932d3";
const previousMigration = "supabase/migrations/20260718010000_consumer_favorites_authenticated_read.sql";
const previousMigrationSha = "64c3c35b149c129c82f7ac4bf89e4d320db6635a9a6122891d8f97a79547e616";
const migrationPath = "supabase/migrations/20260718020000_consumer_favorites_atomic_write.sql";
const featureRoot = "apps/mobile/features/consumer-favorites";
const docsRoot = "docs/consumer-runtime-phase-2x";
const adapterPath = `${featureRoot}/adapters/supabaseConsumerFavoriteWriteRepository.ts`;
const implementationDoc = `${docsRoot}/phase-2x-d-a-atomic-write-preparation.md`;
const securityDoc = `${docsRoot}/phase-2x-d-a-security-and-validation.md`;
const runbookPath = `${docsRoot}/phase-2x-d-b-development-write-activation-runbook.md`;
const guardPath = "scripts/consumer-favorites-phase-2x-d-a-guard.mjs";
const smokePath = "scripts/consumer-favorites-phase-2x-d-a-contract-smoke.mjs";
const forwardSmokePath = "scripts/consumer-favorites-phase-2x-d-a-forward-regression-smoke.mjs";
const frozenBSmokePath = "scripts/consumer-favorites-phase-2x-b-contract-smoke.mjs";
const frozenCASmokePath = "scripts/consumer-favorites-phase-2x-c-a-contract-smoke.mjs";
const frozenSmokeShas = {
  [frozenBSmokePath]: "de1182993dc2345f52fff7120f229efd93ea6918df3bbfb5fc97db2a061b9a53",
  [frozenCASmokePath]: "8a001865e8fb18f18ef3548ec7bf8a69f38e6bf028609a8bee114ae4281f524a"
};
const approvedProductionShas = {
  [`${featureRoot}/types.ts`]: "b2e46380f5893c961e015d3d0cd6669941dd38b40f250173b675f135df4678d7",
  [`${featureRoot}/featureFlags.ts`]: "a1688d1ccb7f10ad88912c892b489c52f8d8047984bb9112389e19ec8167cb2f",
  [`${featureRoot}/factories.ts`]: "21541b1636b92c0ae27eb23b018c8d9328eb366f74d8217b88ca8006453e3d51",
  [`${featureRoot}/index.ts`]: "ad245b16b90fee2d40f0f782131b09929bbdbd815287c0a2a374acbb75638197",
  [`${featureRoot}/supabaseFavoriteContracts.ts`]: "d2a87a99ff0837ef3218cf15ab124c4260b3b5731e25ffbf6ad7e3062c4338b8",
  [`${featureRoot}/supabaseFavoriteMappers.ts`]: "26e7990cc02f90a738ab35578eb0e0ead7f2dec0a40ff159de3c742830f3eb01",
  [adapterPath]: "51c66f0fc36b4a1182c21995f60592fb4b42b86046ce38a4838a8bde2b5e6c9d",
  [migrationPath]: "63257e599b51551a4425eb03b26a5a21319c97fafeb9e7fad08a8c4ec8311475"
};
const extensionFiles = [
  `${featureRoot}/types.ts`,
  `${featureRoot}/featureFlags.ts`,
  `${featureRoot}/supabaseFavoriteContracts.ts`,
  `${featureRoot}/supabaseFavoriteMappers.ts`,
  `${featureRoot}/factories.ts`,
  `${featureRoot}/index.ts`
];
const allowedChanges = new Set([
  "package.json",
  ...extensionFiles,
  adapterPath,
  migrationPath,
  implementationDoc,
  securityDoc,
  runbookPath,
  guardPath,
  smokePath,
  forwardSmokePath
]);
const checks = [];
const issues = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!condition) issues.push(result);
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sha256(relativePath) {
  return createHash("sha256").update(fs.readFileSync(path.join(root, relativePath))).digest("hex");
}

function runJsonScript(relativePath) {
  const result = spawnSync(process.execPath, [relativePath], { cwd: root, encoding: "utf8", windowsHide: true });
  const output = (result.status === 0 ? result.stdout : result.stderr).trim();
  let report = null;
  try { report = JSON.parse(output); } catch { report = null; }
  return { status: result.status, report, stdout: result.stdout, stderr: result.stderr };
}

function stripSqlComments(sql) {
  return sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

try {
  const statusEntries = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => ({ code: entry.slice(0, 2), file: entry.slice(3).replaceAll("\\", "/") }));
  const changedFiles = statusEntries.map(({ file }) => file);
  const outOfScope = changedFiles.filter((file) => !allowedChanges.has(file));
  const missingCandidate = [...allowedChanges].filter((file) => !changedFiles.includes(file));

  check("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  check("HEAD remains the Phase 2X-C-B Frozen Commit", git(["rev-parse", "HEAD"]).stdout.trim() === phase2xCBFrozenCommit);
  for (const [name, commit] of [
    ["Phase 2X-A", phase2xAFrozenCommit],
    ["Phase 2X-B", phase2xBFrozenCommit],
    ["Phase 2X-C-A", phase2xCAFrozenCommit],
    ["Phase 2X-C-B", phase2xCBFrozenCommit]
  ]) {
    check(`${name} Frozen Commit is an ancestor`, git(["merge-base", "--is-ancestor", commit, "HEAD"], true).status === 0);
  }
  check("candidate is exactly the approved Phase 2X-D-A boundary", outOfScope.length === 0 && missingCandidate.length === 0 && changedFiles.length === allowedChanges.size, { changedFiles, outOfScope, missingCandidate });
  check("staged diff remains empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  check("package-lock remains unchanged", git(["diff", "--name-only", "HEAD", "--", "package-lock.json"]).stdout.trim() === "");
  check("Mobile UI and routes remain unchanged", git(["diff", "--name-only", "HEAD", "--", "apps/mobile/app"]).stdout.trim() === "");
  check("unrelated runtimes remain unchanged", git(["diff", "--name-only", "HEAD", "--", "apps/mobile/features/consumer-ratings", "apps/mobile/features/consumer-auth", "apps/admin-web", "apps/restaurant-web", "packages"]).stdout.trim() === "");

  const immutableFavoriteFiles = [
    `${featureRoot}/errors.ts`,
    `${featureRoot}/ports.ts`,
    `${featureRoot}/validation.ts`,
    `${featureRoot}/consumerFavoriteService.ts`,
    `${featureRoot}/adapters/disabledConsumerFavoriteRepository.ts`,
    `${featureRoot}/adapters/mockConsumerFavoriteRepository.ts`,
    `${featureRoot}/adapters/supabaseConsumerFavoriteReadRepository.ts`
  ];
  const immutablePhase2XArtifacts = git(["ls-tree", "-r", "--name-only", phase2xCBFrozenCommit, "--", docsRoot, "scripts/consumer-favorites-phase-2x-a-guard.mjs", "scripts/consumer-favorites-phase-2x-b-guard.mjs", "scripts/consumer-favorites-phase-2x-b-contract-smoke.mjs", "scripts/consumer-favorites-phase-2x-c-a-guard.mjs", "scripts/consumer-favorites-phase-2x-c-a-contract-smoke.mjs", "scripts/consumer-favorites-phase-2x-c-b-guard.mjs", "scripts/consumer-favorites-phase-2x-c-b-development-live-smoke.mjs"]).stdout.split(/\r?\n/).filter(Boolean);
  check("Frozen non-extension Favorites runtime remains byte-unchanged", git(["diff", "--name-only", "HEAD", "--", ...immutableFavoriteFiles]).stdout.trim() === "");
  check("Frozen Phase 2X documents and guards remain byte-unchanged", git(["diff", "--name-only", "HEAD", "--", ...immutablePhase2XArtifacts]).stdout.trim() === "");
  check("Frozen Phase 2X-B and 2X-C-A smoke files remain byte-equivalent", Object.entries(frozenSmokeShas).every(([file, expectedSha]) => sha256(file) === expectedSha), {
    hashes: Object.fromEntries(Object.keys(frozenSmokeShas).map((file) => [file, sha256(file)]))
  });
  check("regression correction preserves approved production runtime and migration bytes", Object.entries(approvedProductionShas).every(([file, expectedSha]) => sha256(file) === expectedSha), {
    hashes: Object.fromEntries(Object.keys(approvedProductionShas).map((file) => [file, sha256(file)]))
  });
  check("all prior migrations remain byte-unchanged", git(["diff", "--name-only", "HEAD", "--", "supabase/migrations"]).stdout.trim() === "");

  const migrations = fs.readdirSync(path.join(root, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).sort();
  const previousSha = createHash("sha256").update(fs.readFileSync(path.join(root, previousMigration))).digest("hex");
  const migrationSha = createHash("sha256").update(fs.readFileSync(path.join(root, migrationPath))).digest("hex");
  check("local migration count is 36", migrations.length === 36, { count: migrations.length });
  check("latest migration is exactly 20260718020000", migrations.at(-1) === path.basename(migrationPath), { latest: migrations.at(-1) });
  check("Phase 2X-C-A migration SHA remains immutable", previousSha === previousMigrationSha, { previousSha });
  check("Phase 2X-D-A migration SHA remains correction-immutable", migrationSha === approvedProductionShas[migrationPath], { migrationSha });

  for (const file of [adapterPath, migrationPath, implementationDoc, securityDoc, runbookPath, guardPath, smokePath, forwardSmokePath]) {
    check(`required Phase 2X-D-A file exists: ${file}`, fs.existsSync(path.join(root, file)));
  }

  const packageCurrent = JSON.parse(read("package.json"));
  const packageFrozen = JSON.parse(git(["show", `${phase2xCBFrozenCommit}:package.json`]).stdout);
  const newScripts = {
    "test:consumer-phase2x-d-a": `node ${guardPath}`,
    "test:consumer-phase2x-d-a-smoke": `node ${smokePath}`,
    "test:consumer-phase2x-d-a-forward-regression": `node ${forwardSmokePath}`
  };
  check("package adds exactly the three Phase 2X-D-A script keys", Object.entries(newScripts).every(([key, value]) => packageCurrent.scripts[key] === value));
  const currentWithoutNew = { ...packageCurrent.scripts };
  for (const key of Object.keys(newScripts)) delete currentWithoutNew[key];
  check("all Frozen package scripts remain exact", JSON.stringify(currentWithoutNew) === JSON.stringify(packageFrozen.scripts));
  check("dependencies workspaces and package metadata remain unchanged", ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "workspaces"].every((key) => JSON.stringify(packageCurrent[key]) === JSON.stringify(packageFrozen[key])));

  const frozenBResult = runJsonScript(frozenBSmokePath);
  const frozenCAResult = runJsonScript(frozenCASmokePath);
  const expectedBReason = "unsupported sources do not fall back to mock: Contract assertion failed.";
  const expectedCAReason = "Supabase write source is rejected: Contract assertion failed.";
  const expectedBPositivePrefix = [
    "Phase 2X-B TypeScript contract compilation",
    "default read and write sources are disabled",
    "missing source values fail closed to disabled"
  ];
  const expectedCAPositivePrefix = [
    "Phase 2X-C-A TypeScript contract compilation",
    "default read and write remain disabled",
    "Supabase read is explicit opt-in"
  ];
  check("Frozen Phase 2X-B smoke has only its approved phase-transition failure", frozenBResult.status === 1 && frozenBResult.report?.status === "failed" && frozenBResult.report?.reason === expectedBReason && JSON.stringify(frozenBResult.report?.checks?.map(({ name }) => name)) === JSON.stringify(expectedBPositivePrefix), {
    classification: "EXPECTED_PHASE_TRANSITION_RESULT",
    reason: frozenBResult.report?.reason,
    passedBeforeTransition: frozenBResult.report?.checks?.length ?? 0
  });
  check("Frozen Phase 2X-C-A smoke has only its approved phase-transition failure", frozenCAResult.status === 1 && frozenCAResult.report?.status === "failed" && frozenCAResult.report?.reason === expectedCAReason && JSON.stringify(frozenCAResult.report?.checks?.map(({ name }) => name)) === JSON.stringify(expectedCAPositivePrefix), {
    classification: "EXPECTED_PHASE_TRANSITION_RESULT",
    reason: frozenCAResult.report?.reason,
    passedBeforeTransition: frozenCAResult.report?.checks?.length ?? 0
  });

  const forwardResult = runJsonScript(forwardSmokePath);
  const forwardRequiredChecks = [
    "default read and write remain disabled",
    "explicit mock read and write compose normally",
    "mock duplicate add remains already_present",
    "mock removed history remains preserved",
    "same mock target remains actor isolated",
    "Supabase read composes independently with disabled write",
    "Supabase list retains canonical ordering tuple",
    "malformed Supabase read response remains fail closed",
    "disabled write never calls a write RPC",
    "Supabase write requires explicit Auth dependency",
    "Supabase write requires explicit client dependency",
    "Supabase write composes independently only when explicitly selected"
  ];
  const forwardNames = forwardResult.report?.checks?.map(({ name }) => name) ?? [];
  check("forward-compatible regression smoke passes all retained positive invariants", forwardResult.status === 0 && forwardResult.report?.status === "passed" && forwardResult.report?.classification === "FORWARD_COMPATIBLE_POSITIVE_INVARIANTS" && forwardResult.report?.checks?.every(({ pass }) => pass) && forwardRequiredChecks.every((name) => forwardNames.includes(name)), {
    totalChecks: forwardResult.report?.totalChecks ?? 0,
    classification: forwardResult.report?.classification
  });

  const migration = read(migrationPath);
  const sql = stripSqlComments(migration);
  const functionNames = [
    "add_authenticated_restaurant_favorite",
    "remove_authenticated_restaurant_favorite",
    "add_authenticated_menu_item_favorite",
    "remove_authenticated_menu_item_favorite"
  ];
  check("migration has one BEGIN and one COMMIT", (sql.match(/\bbegin\s*;/gi) ?? []).length === 1 && (sql.match(/\bcommit\s*;/gi) ?? []).length === 1);
  check("migration defines exactly four approved functions", functionNames.every((name) => new RegExp(`create or replace function public\\.${name}\\s*\\(`, "i").test(sql)) && (sql.match(/create or replace function public\./gi) ?? []).length === 4);
  check("all functions are SECURITY DEFINER", (sql.match(/security definer/gi) ?? []).length === 4);
  check("all functions fix the safe search_path", (sql.match(/set search_path = pg_catalog, public, pg_temp/gi) ?? []).length === 4);
  check("all functions reject null auth.uid ownership", (sql.match(/v_user_id uuid := auth\.uid\(\)/g) ?? []).length === 4 && (sql.match(/if v_user_id is null/g) ?? []).length === 4);
  check("function signatures accept no ownership argument", !/create or replace function[\s\S]*?\((?:[^;]|\n)*?p_(?:user|owner)_id/i.test(sql));
  check("restaurant add validates canonical existence with a row lock", /add_authenticated_restaurant_favorite[\s\S]*from public\.restaurants[\s\S]*r\.id = v_restaurant_id[\s\S]*for key share/.test(sql));
  check("menu-item add validates restaurant and exact parent pair", /add_authenticated_menu_item_favorite[\s\S]*from public\.restaurants[\s\S]*from public\.menu_items[\s\S]*mi\.id = v_menu_item_id[\s\S]*mi\.restaurant_id = v_restaurant_id[\s\S]*for key share/.test(sql));
  check("every write is scoped to auth.uid ownership", (sql.match(/user_id = v_user_id/g) ?? []).length >= 7 && (sql.match(/values \(v_user_id,/g) ?? []).length === 2 && !/user_id\s*=\s*p_/i.test(sql));
  check("all four operations use transaction advisory locks", (sql.match(/pg_catalog\.pg_advisory_xact_lock/g) ?? []).length === 4);
  check("restaurant and menu adds use the existing partial unique keys", /on conflict \(user_id, restaurant_id\) where removed_at is null do nothing/i.test(sql) && /on conflict \(user_id, menu_item_id\) where removed_at is null do nothing/i.test(sql));
  check("conflict winners map to already_present or fail serialization", (sql.match(/'already_present'/g) ?? []).length >= 4 && (sql.match(/FAVORITE_ACTIVE_ROW_CONFLICT/g) ?? []).length === 2);
  check("menu active-parent conflict fails closed", (sql.match(/FAVORITE_MENU_ITEM_ACTIVE_PARENT_CONFLICT/g) ?? []).length >= 2);
  check("remove performs soft update only", (sql.match(/update public\.favorite_(?:restaurants|menu_items)/g) ?? []).length === 2 && /set removed_at = v_now/g.test(sql) && !/\bdelete\s+from\b/i.test(sql));
  check("add does not rewrite removed history", !/update public\.favorite_(?:restaurants|menu_items)[\s\S]{0,160}set removed_at = null/i.test(sql));
  check("return vocabulary is exactly Frozen Favorites vocabulary", ["added", "already_present", "removed", "already_absent"].every((status) => sql.includes(`'${status}'`)) && !/'saved'|'replaced'/.test(sql));
  check("returned JSON contains no ownership or security field", !/jsonb_build_object\([\s\S]{0,1200}'(?:user_id|owner_id|session|token|policy)'/i.test(sql));
  check("direct table DML remains revoked", /revoke insert, update, delete on table public\.favorite_restaurants from public, anon, authenticated/i.test(sql) && /revoke insert, update, delete on table public\.favorite_menu_items from public, anon, authenticated/i.test(sql));
  check("all function EXECUTE privileges are revoked before authenticated-only grants", functionNames.every((name) => new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon, authenticated;[\\s\\S]*?grant execute on function public\\.${name}[\\s\\S]*?to authenticated;`, "i").test(sql)));
  check("migration adds no table SELECT grant or generic writer", !/grant select/i.test(sql) && !/p_(?:table|sql|identifier|entity_type)/i.test(sql));
  check("migration contains no privileged-role Production Auth RLS or hard-delete change", !/service_role|production|alter policy|create policy|drop policy|alter table.*(?:disable|force) row level security|auth\.users|\bdelete\s+from\b/i.test(sql));

  const types = read(`${featureRoot}/types.ts`);
  const flags = read(`${featureRoot}/featureFlags.ts`);
  const contracts = read(`${featureRoot}/supabaseFavoriteContracts.ts`);
  const mappers = read(`${featureRoot}/supabaseFavoriteMappers.ts`);
  const factories = read(`${featureRoot}/factories.ts`);
  const index = read(`${featureRoot}/index.ts`);
  const adapter = read(adapterPath);
  check("write source adds Supabase while default remains disabled", /ConsumerFavoriteWriteSource = "disabled" \| "mock" \| "supabase"/.test(types) && /writeSources[\s\S]*"disabled", "mock", "supabase"/.test(flags) && /return "disabled"/.test(flags));
  check("invalid source records an issue without mock fallback", /issues\.push/.test(flags) && !/return "mock"/.test(flags));
  check("contracts expose exactly four typed RPC names", functionNames.every((name) => contracts.includes(`"${name}"`)) && (contracts.match(/export const SUPABASE_(?:ADD|REMOVE)_AUTHENTICATED_(?:RESTAURANT|MENU_ITEM)_FAVORITE_FUNCTION/g) ?? []).length === 4);
  check("RPC argument contracts contain only canonical target IDs", /p_restaurant_id: string/.test(contracts) && /p_menu_item_id: string/.test(contracts) && !/user_id|userId|owner_id|ownerId/.test(contracts));
  check("write adapter implements only both approved service writes", /addCurrentUserFavorite/.test(adapter) && /removeCurrentUserFavorite/.test(adapter));
  check("write adapter calls only typed RPC and no direct DML", /this\.client\.rpc/.test(adapter) && !/\.(?:from|insert|update|delete|upsert)\s*\(/.test(adapter));
  check("write adapter maps typed operation failures", /ConsumerFavoriteAuthenticationRequiredError/.test(adapter) && /ConsumerFavoritePermissionDeniedError/.test(adapter) && /ConsumerFavoriteDatabaseFailedError/.test(adapter) && /ConsumerFavoriteTransportFailedError/.test(adapter) && /ConsumerFavoriteResponseMalformedError/.test(adapter));
  check("mapper validates exact allowlisted response shape and Frozen vocabulary", /exactKeys/.test(mappers) && /"added" \| "already_present" \| "removed"/.test(mappers) && /"already_absent"/.test(mappers) && !/"saved"|"replaced"/.test(mappers));
  check("factory composes independent Supabase read and write paths", /flags\.readSource === "supabase"/.test(factories) && /flags\.writeSource === "supabase"/.test(factories) && /SupabaseConsumerFavoriteWriteRepository/.test(factories));
  check("factory requires an injected RPC-capable client for write", /typeof client\.rpc !== "function"/.test(factories) && /explicitly injected RPC-capable favorite client/.test(factories));
  check("factory construction contains no network operation", !/\.from\s*\(|\.rpc\s*\(|fetch\s*\(/.test(factories));
  check("index exports the single new write adapter", /supabaseConsumerFavoriteWriteRepository/.test(index));
  check("adapter contains no mock fallback logging credential or ownership field", !/MockConsumerFavorite|console\.|logger\.|SUPABASE_ACCESS_TOKEN|user_id|userId|owner_id|ownerId/.test(adapter));

  const implementation = read(implementationDoc);
  const security = read(securityDoc);
  const runbook = read(runbookPath);
  const forwardSmoke = read(forwardSmokePath);
  const docs = `${implementation}\n${security}\n${runbook}`;
  check("docs preserve Frozen result vocabulary and history semantics", /no `saved` or `replaced`[\s\S]*Hard delete/.test(implementation) && /removed historical row is never reactivated or rewritten/.test(implementation));
  check("docs explain pair identity and unresolved structural global uniqueness", /canonical menu-item target remains `\(restaurantId, menuItemId\)`[\s\S]*does not by itself prove structural global uniqueness/.test(implementation));
  check("runbook makes structural menu ID uniqueness a deployment hard gate", /Gate C[\s\S]*primary or unique structural constraint[\s\S]*Zero rows or zero duplicate groups alone is insufficient[\s\S]*do not deploy/.test(runbook));
  check("runbook requires 36/35 exact migration alignment and one pending migration", /Pre-deployment local\/remote migrations: `36\/35`[\s\S]*Only pending migration: `20260718020000/.test(runbook));
  check("runbook requires function ACL definition and direct-DML verification", /Gate F[\s\S]*authenticated execute=true[\s\S]*anon and PUBLIC execute=false[\s\S]*direct INSERT\/UPDATE\/DELETE=false/.test(runbook));
  check("runbook covers two actors lifecycle concurrency isolation and denial", /Gate G[\s\S]*two approved Development test actors[\s\S]*duplicate add[\s\S]*second remove[\s\S]*simultaneous duplicate adds[\s\S]*actor A cannot read or mutate actor B/.test(runbook));
  check("runbook requires exact exceptional cleanup and aggregate equality", /Gate H[\s\S]*exact synthetic actors and controlled targets[\s\S]*aggregate catalog queries[\s\S]*exact equality[\s\S]*persistent test data=false/.test(runbook));
  check("docs exclude Production privileged browser path N4 Phase 2Y and local remote execution", /Production/.test(docs) && /N4/.test(docs) && /Phase 2Y/.test(docs) && /no HTTP, SQL, credential login, remote operation/.test(security));
  check("validation doc records exact Frozen transition disposition", /EXPECTED_PHASE_TRANSITION_RESULT/.test(security) && /Phase 2X-B smoke: native exit `1`, `3` positive assertions/.test(security) && /unsupported sources do not fall back to mock/.test(security) && /Phase 2X-C-A smoke: native exit `1`, `3` positive assertions/.test(security) && /Supabase write source is rejected/.test(security));
  check("validation doc adopts positive invariants for later phases", /Phase 2X-D\/E and Phase 2Y regression gates must carry forward historical positive invariants/.test(security));
  check("forward smoke contains no obsolete source-prohibition assertion", !/readSource=supabase[^\n]*(?:unsupported|rejected)|writeSource=supabase[^\n]*(?:unsupported|rejected)/i.test(forwardSmoke));

  for (const file of [adapterPath, implementationDoc, securityDoc, runbookPath, guardPath, smokePath, forwardSmokePath, migrationPath]) {
    const content = read(file);
    check(`${file} ends with one newline`, content.endsWith("\n") && !content.endsWith("\n\n"));
    check(`${file} has no trailing whitespace`, !/[ \t]+$/m.test(content));
  }
  check("candidate contains no environment generated log or cache artifact", changedFiles.every((file) => !/(^|\/)(?:\.env(?:\.|$)|node_modules|\.next|dist|build|coverage|cache)(?:\/|$)|\.tsbuildinfo$|\.log$/i.test(file)));

  console.log(JSON.stringify({
    status: issues.length ? "failed" : "passed",
    phase: "Consumer Runtime Phase 2X-D-A Atomic Favorites Write Preparation Guard",
    totalChecks: checks.length,
    migrationSha256: migrationSha,
    checks,
    issues,
    networkUsed: false,
    databaseUsed: false,
    migrationExecuted: false,
    productionTouched: false,
    privilegedCredentialUsed: false,
    n4Executed: false,
    phase2YStarted: false,
    stagedDiffEmpty: git(["diff", "--cached", "--name-only"]).stdout.trim() === ""
  }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "Consumer Runtime Phase 2X-D-A Atomic Favorites Write Preparation Guard",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    issues
  }, null, 2));
  process.exitCode = 1;
}
