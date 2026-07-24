#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const correctionShaFrozenHead = "320499280fcad30a8608443760e6b274ce1133fe";
const protectedMigration =
  "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";

const frozenMiCAAndMiCBPaths = [
  "apps/mobile/features/meal-identification/types.ts",
  "apps/mobile/features/meal-identification/sourceResolutionPolicy.ts",
  "apps/mobile/features/meal-identification/catalogCandidateAdapter.ts",
  "apps/mobile/features/meal-identification/candidateResolver.ts",
  "apps/mobile/features/meal-identification/finalizationContract.ts",
  "apps/mobile/features/meal-identification/index.ts",
  "scripts/meal-identification-mi-c-a-guard.mjs",
  "scripts/meal-identification-mi-c-a-contract-smoke.mjs",
  "scripts/meal-identification-mi-c-b-guard.mjs",
  "scripts/meal-identification-mi-c-b-contract-smoke.mjs",
  "supabase/migrations/20260724020000_consumer_meal_identification_atomic_finalization.sql"
];

const featureDir = "apps/mobile/features/meal-identification-finalization";
const implementationPaths = [
  "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/consumer-runtime/index.ts",
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationOperationStore.ts",
  "apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts",
  `${featureDir}/types.ts`,
  `${featureDir}/errors.ts`,
  `${featureDir}/ports.ts`,
  `${featureDir}/featureFlags.ts`,
  `${featureDir}/validation.ts`,
  `${featureDir}/mealIdentificationFinalizationMappers.ts`,
  `${featureDir}/supabaseMealIdentificationFinalizationContracts.ts`,
  `${featureDir}/consumerMealIdentificationFinalizationService.ts`,
  `${featureDir}/factories.ts`,
  `${featureDir}/index.ts`,
  `${featureDir}/adapters/disabledConsumerMealIdentificationFinalizationRepository.ts`,
  `${featureDir}/adapters/mockConsumerMealIdentificationFinalizationRepository.ts`,
  `${featureDir}/adapters/supabaseConsumerMealIdentificationFinalizationRepository.ts`,
  "package.json",
  "scripts/meal-identification-mi-c-d-guard.mjs",
  "scripts/meal-identification-mi-c-d-contract-smoke.mjs"
].sort();
const expectedChangedPaths = new Set([...implementationPaths, protectedMigration]);

const checks = [];
const failures = [];

function record(name, condition) {
  const pass = Boolean(condition);
  checks.push({ name, pass });
  if (!pass) failures.push(name);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function git(args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
}

function changedPaths() {
  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  return status.stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/"))
    .sort();
}

try {
  const paths = changedPaths();

  record("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  record(
    "HEAD remains MI-C-B correction frozen commit pending this integration",
    git(["rev-parse", "HEAD"]).stdout.trim() === correctionShaFrozenHead
  );
  record("staged diff is empty", git(["diff", "--cached", "--quiet"]).status === 0);
  record(
    "exact MI-C-D implementation candidate plus protected migration",
    paths.length === expectedChangedPaths.size && paths.every((entry) => expectedChangedPaths.has(entry))
  );
  record(
    "protected migration is excluded from the implementation candidate",
    !implementationPaths.includes(protectedMigration) && paths.includes(protectedMigration)
  );

  for (const frozenPath of frozenMiCAAndMiCBPaths) {
    record(
      `frozen MI-C-A/MI-C-B unchanged: ${frozenPath}`,
      git(["diff", "--quiet", "--", frozenPath]).status === 0 &&
        git(["diff", "--cached", "--quiet", "--", frozenPath]).status === 0
    );
  }

  const sources = Object.fromEntries(implementationPaths.map((p) => [p, read(p)]));
  const allSource = Object.values(sources).join("\n");

  // ---------- No direct table writes ----------
  const newFeatureSources = implementationPaths
    .filter((p) => p.startsWith(featureDir) || p.includes("consumerMealIdentificationFinalization"))
    .map((p) => sources[p])
    .join("\n");
  record(
    "no direct table write (no .from( query-builder usage anywhere in the new module)",
    !/\.from\s*\(/.test(newFeatureSources)
  );
  record(
    "no reference to protected write tables outside the frozen RPC name",
    !/["'`](meal_records|meal_record_items|meal_analyses|meal_corrections|meal_identification_finalizations)["'`]/.test(
      newFeatureSources
    )
  );

  // ---------- No user_id in payload ----------
  record(
    "RPC args carry no user_id / p_user_id field",
    !/p_user_id/.test(sources[`${featureDir}/supabaseMealIdentificationFinalizationContracts.ts`]) &&
      !/["'`]?user_id["'`]?\s*:/.test(sources[`${featureDir}/mealIdentificationFinalizationMappers.ts`])
  );
  record(
    "no caller-suppliable userId field reaches the RPC args builder",
    !/userId\s*:/.test(sources[`${featureDir}/mealIdentificationFinalizationMappers.ts`])
  );

  // ---------- Canonical RPC name ----------
  const contracts = sources[`${featureDir}/supabaseMealIdentificationFinalizationContracts.ts`];
  const nonScriptImplementationSource = implementationPaths
    .filter((p) => !p.startsWith("scripts/") && p !== "package.json")
    .map((p) => sources[p])
    .join("\n");
  record(
    "canonical RPC name constant is exact and unique",
    /SUPABASE_FINALIZE_CURRENT_USER_MEAL_IDENTIFICATION_FUNCTION\s*=\s*"finalize_current_user_meal_identification_v1"\s*as const/.test(
      contracts
    ) &&
      (nonScriptImplementationSource.match(/"finalize_current_user_meal_identification_v1"/g) ?? []).length === 1
  );
  const repo = sources[`${featureDir}/adapters/supabaseConsumerMealIdentificationFinalizationRepository.ts`];
  record(
    "repository calls the canonical RPC name constant, not a raw string literal",
    /this\.client\.rpc\(\s*SUPABASE_FINALIZE_CURRENT_USER_MEAL_IDENTIFICATION_FUNCTION/.test(repo) &&
      !/this\.client\.rpc\(\s*["'`]finalize/.test(repo)
  );
  record(
    "repository calls the canonical RPC exactly once",
    (repo.match(/this\.client\.rpc\(/g) ?? []).length === 1
  );

  // ---------- Frozen contract version passthrough ----------
  const mappers = sources[`${featureDir}/mealIdentificationFinalizationMappers.ts`];
  record(
    "finalization command is passed through as-is (no version override or field re-derivation)",
    /p_finalization:\s*input\.finalization\s+as\s+unknown\s+as\s+Record<string, unknown>/.test(mappers) &&
      !/version:\s*["'`]/.test(mappers)
  );
  const validation = sources[`${featureDir}/validation.ts`];
  record(
    "input validation re-validates through the frozen MI-C-A contract, not a re-implementation",
    /validateMealIdentificationFinalizationCommand/.test(validation) &&
      !/selection\.kind\s*===\s*["'`]confirmed_catalog["'`]/.test(validation) &&
      !/selection\.kind\s*===\s*["'`]personal_unresolved["'`]/.test(validation)
  );

  // ---------- UUID v4 and retry key rules ----------
  const runtime = sources["apps/mobile/features/consumer-runtime/consumerMealIdentificationFinalizationRuntime.ts"];
  record(
    "secure UUID v4 generator is used for new intents",
    /function secureUuidV4/.test(runtime) &&
      /bytes\[6\] = \(bytes\[6\] & 0x0f\) \| 0x40/.test(runtime) &&
      /bytes\[8\] = \(bytes\[8\] & 0x3f\) \| 0x80/.test(runtime)
  );
  record(
    "new submissions always mint a fresh clientRequestId",
    /const clientRequestId = \(this\.options\.uuidFactory \?\? secureUuidV4\)\(\);/.test(runtime) &&
      /startOperation\(/.test(runtime)
  );
  record(
    "retry reuses the exact same pending operation without minting a new key",
    /retry\(context: Omit<ConsumerMealIdentificationFinalizationActorContext, "timezone">\) \{[\s\S]*?const operation = this\.pending;[\s\S]*?this\.execute\(context\.actorKey, context\.actorGeneration, operation\)/.test(
      runtime
    )
  );
  record(
    "same client_request_id, different payload is rejected as idempotency conflict (not silently reused)",
    /finalization_idempotency_conflict/.test(runtime) || /IdempotencyConflict/.test(mappers)
  );

  // ---------- Confirmed/unresolved exclusivity and no partial identity (frozen, not reimplemented) ----------
  record(
    "MI-C-D never redefines confirmed/unresolved selection branching itself",
    !/confirmed_catalog/.test(mappers) && !/personal_unresolved/.test(mappers)
  );

  // ---------- SQLSTATE mapping completeness ----------
  record(
    "all six SQLSTATE categories are mapped to typed errors",
    /error\.code === "28000"/.test(mappers) &&
      /error\.code === "22023"/.test(mappers) &&
      /error\.code === "23503"/.test(mappers) &&
      /error\.code === "23514"/.test(mappers) &&
      /error\.code === "23505"/.test(mappers) &&
      /error\.code === "42501"/.test(mappers)
  );
  record(
    "unknown/unrecognized errors fall back to a safe generic typed failure",
    /return new ConsumerMealIdentificationFinalizationTransportFailedError\(\);\s*\}\s*$/m.test(mappers.trim())
  );

  // ---------- No raw error leakage ----------
  record(
    "error mapper never forwards raw Postgrest message/details/hint into a constructed error",
    !/new Consumer\w*Error\(\s*error\.(message|details|hint)/.test(mappers) &&
      !/new Consumer\w*Error\(\s*response\.error\.(message|details|hint)/.test(repo)
  );
  record(
    "repository never logs or returns raw SQL, query text, or credentials",
    !/console\.(log|error|warn)/.test(repo) && !/SELECT |INSERT |UPDATE |DELETE /i.test(repo)
  );

  // ---------- Scope boundaries ----------
  record(
    "no UI, GPS, alias, or Food Memory scope creep",
    !/expo-location|navigator\.geolocation|Location\.|food[_ -]?memory|alias[_ -]?resolver|findAliasByInput/i.test(
      newFeatureSources
    )
  );
  record(
    "no changes reach mobile screens, routes, or components",
    implementationPaths.every((p) => !p.startsWith("apps/mobile/app/"))
  );
  record(
    "no migration added or modified beyond the protected untracked path",
    implementationPaths.every((p) => !p.startsWith("supabase/migrations/"))
  );

  // ---------- Actor derivation ----------
  const service = sources[`${featureDir}/consumerMealIdentificationFinalizationService.ts`];
  record(
    "service gates on authPort.getCurrentSession before ever calling the repository",
    /getAuthError/.test(service) && /authPort\.getCurrentSession\(\)/.test(service)
  );

  // ---------- package.json ----------
  const packageJson = JSON.parse(sources["package.json"]);
  const baselinePackage = JSON.parse(git(["show", `${correctionShaFrozenHead}:package.json`]).stdout);
  const expectedScripts = {
    "test:meal-identification-mi-c-d": "node scripts/meal-identification-mi-c-d-guard.mjs",
    "test:meal-identification-mi-c-d-smoke": "node scripts/meal-identification-mi-c-d-contract-smoke.mjs"
  };
  record(
    "package.json adds exactly the two MI-C-D scripts",
    Object.entries(expectedScripts).every(([key, value]) => packageJson.scripts?.[key] === value)
  );
  const packageWithoutMiCD = structuredClone(packageJson);
  for (const key of Object.keys(expectedScripts)) delete packageWithoutMiCD.scripts[key];
  record(
    "package.json preserves every pre-existing field and script",
    JSON.stringify(packageWithoutMiCD) === JSON.stringify(baselinePackage)
  );

  // ---------- Guard self-integrity ----------
  const guardSource = read("scripts/meal-identification-mi-c-d-guard.mjs");
  const mutationApis = ["write" + "File", "append" + "File", "mk" + "dir", "rm" + "Sync", "un" + "link", "re" + "name", "copy" + "File", "exec" + "FileSync"];
  record(
    "guard is read-only and creates no artifacts",
    mutationApis.every((name) => !guardSource.includes(`fs.${name}`)) && guardSource.includes('spawnSync("git"')
  );

  for (const check of checks) {
    console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}`);
  }
  console.log(`RESULT ${checks.length - failures.length}/${checks.length} ${failures.length ? "FAIL" : "PASS"}`);
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
