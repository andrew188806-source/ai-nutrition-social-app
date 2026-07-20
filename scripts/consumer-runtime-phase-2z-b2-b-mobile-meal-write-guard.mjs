#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const baseline = "171f7294c120c8ab0ec4c97c4ee657f6133d8f1b";
const migrationName = "20260720010000_consumer_meal_record_create_idempotency.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const migrationSha = "703e724909a96ce7f63a9654ea155cad11d3dbfe5aec29aa99a7296ab16ffb14";
const evidencePath = "docs/consumer-runtime-phase-2z/phase-2z-b2-b-development-validation-record.md";
const candidates = new Set([
  "apps/mobile/app/analysis.tsx",
  "apps/mobile/app/index.tsx",
  "apps/mobile/app/today-intake.tsx",
  "apps/mobile/features/analysis/analysisSessionStore.ts",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx",
  "apps/mobile/features/consumer-runtime/index.ts",
  "apps/mobile/features/consumer-runtime/consumerMealWriteMapper.ts",
  "apps/mobile/features/consumer-runtime/consumerMealWriteRuntime.ts",
  "apps/mobile/features/consumer-runtime/consumerMealWriteOperationStore.ts",
  "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts",
  "lib/i18n/zh-TW.ts",
  evidencePath,
  "scripts/consumer-runtime-phase-2z-b2-b-mobile-meal-write-guard.mjs",
  "scripts/consumer-runtime-phase-2z-b2-b-mobile-meal-write-smoke.mjs"
]);
const b2aFrozen = [
  "apps/mobile/features/consumer-meals/types.ts",
  "apps/mobile/features/consumer-meals/writeValidation.ts",
  "apps/mobile/features/consumer-meals/mealDateTime.ts",
  "apps/mobile/features/consumer-meals/supabaseMealContracts.ts",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerMealRecordWriteRepository.ts",
  migrationPath,
  "scripts/consumer-runtime-phase-2z-b2-a-idempotency-guard.mjs",
  "scripts/consumer-runtime-phase-2z-b2-a-idempotency-smoke.mjs",
  "docs/consumer-runtime-phase-2z/phase-2z-b2-a-idempotency-contract.md",
  "docs/consumer-runtime-phase-2z/phase-2z-b2-a-development-validation-record.md"
];
const checks = [];
const failures = [];
const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha = (file) => createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
function record(name, condition, detail) {
  const item = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(item);
  if (!item.pass) failures.push(item);
}
function changedFiles() {
  const result = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  return result.stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/"));
}
function baselineFiles(prefix) {
  return git(["ls-tree", "-r", "--name-only", baseline, "--", prefix]).stdout.trim().split("\n").filter(Boolean);
}
function equivalent(files) {
  return files.filter((file) => git(["diff", "--quiet", baseline, "--", file]).status !== 0);
}

try {
  const changed = changedFiles();
  const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  const analysis = read("apps/mobile/app/analysis.tsx");
  const home = read("apps/mobile/app/index.tsx");
  const today = read("apps/mobile/app/today-intake.tsx");
  const mapper = read("apps/mobile/features/consumer-runtime/consumerMealWriteMapper.ts");
  const runtime = read("apps/mobile/features/consumer-runtime/consumerMealWriteRuntime.ts");
  const operationStore = read("apps/mobile/features/consumer-runtime/consumerMealWriteOperationStore.ts");
  const composition = read("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts");
  const provider = read("apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx");
  const todayModel = read("apps/mobile/features/consumer-meals/todayIntakeUiModel.ts");
  const evidence = read(evidencePath);
  const uiSources = [analysis, home, today].join("\n");

  record("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  record("B2-A baseline commit exists", git(["cat-file", "-e", `${baseline}^{commit}`]).status === 0);
  record("B2-A baseline is HEAD ancestor", git(["merge-base", "--is-ancestor", baseline, "HEAD"]).status === 0);
  record("HEAD remains exact B2-A Frozen commit", git(["rev-parse", "HEAD"]).stdout.trim() === baseline);
  record("candidate inventory is exact", changed.length === candidates.size && changed.every((file) => candidates.has(file)), changed);
  record("staged diff remains empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  record("B2-A Frozen manifest remains byte-equivalent", b2aFrozen.length === 11 && equivalent(b2aFrozen).length === 0);

  record("migration count remains 38", migrations.length === 38, migrations.length);
  record("latest migration filename remains exact", migrations.at(-1) === migrationName, migrations.at(-1));
  record("latest migration SHA remains exact", sha(migrationPath) === migrationSha, sha(migrationPath));
  record("all historical migrations remain byte-equivalent", equivalent(baselineFiles("supabase/migrations")).length === 0);

  const authDrift = equivalent(baselineFiles("apps/mobile/features/consumer-auth"));
  record("B1 Auth Profile backend remains byte-equivalent", authDrift.length === 0, authDrift);
  record("B1 login me and layout remain byte-equivalent", equivalent(["apps/mobile/app/login.tsx", "apps/mobile/app/me.tsx", "apps/mobile/app/_layout.tsx"]).length === 0);
  record("Provider preserves B1 Auth Profile actions", ["signIn", "signInDemo", "signOut", "retryProfile", "ConsumerRuntimeNavigationGate"].every((name) => provider.includes(name)));

  record("only explicit add gesture invokes Meal Write", /saveMealRecordFromExplicitGesture[\s\S]*consumerRuntime\.createMealRecord/.test(analysis));
  record("confirmed state has no automatic Meal Write", !/autoSavedConfirmedMeal|persistMealRecordToTodayIntake|confirmPlannedDinnerFromAnalysis/.test(analysis));
  record("UI imports no Supabase repository RPC or DML", !/Supabase|Repository|\.rpc\s*\(|\.(?:insert|update|upsert|delete)\s*\(/.test(uiSources));
  record("mapper accepts an allowlisted Analysis draft", /ConsumerAnalysisMealWriteDraft/.test(mapper) && !/actor|userId|credential|photo|social|rating|planned/i.test(mapper));
  record("mapper excludes note stuffing and noncanonical data", /note:\s*null/.test(mapper) && !/ingredients|guilt|completion|restaurantName|\bmealId\s*[?:]|photo|planned/i.test(mapper));
  record("mapper nulls untrusted identity", /identity\?\.restaurantId\s*\?\?\s*null/.test(mapper) && /identity\?\.menuItemId\s*\?\?\s*null/.test(mapper));
  record("mapper uses timezone helper and one submitted snapshot", /toDateKeyInTimeZone\(input\.submittedAt, timezone\)/.test(mapper) && /input\.submittedAt\.toISOString\(\)/.test(mapper));
  record("correction and source mapping are canonical", /user_corrected/.test(mapper) && /ai_estimated/.test(mapper) && /self_made/.test(mapper) && /consumedRatio:\s*1/.test(mapper));

  record("new operation uses secure UUID v4", /secureUuidV4/.test(runtime) && /getRandomValues|randomUUID/.test(runtime) && /0x40/.test(runtime));
  record("pending key and input persist before remote call", runtime.indexOf("operationStore.save(actorKey, operation)") < runtime.indexOf("service.createCurrentUserMealRecord(operation.input)"));
  record("retry reuses stored key and exact input", /const operation = this\.pending/.test(runtime) && /this\.execute\(context\.actorKey, context\.actorGeneration, operation\)/.test(runtime));
  record("ambiguous result retains same pending operation", /errorCode === "result_uncertain"[\s\S]*pending:\s*true/.test(runtime));
  record("runtime has no automatic or background retry", !/setInterval|setTimeout|background|automaticRetry/i.test(runtime));
  record("operation storage is actor-scoped with TTL", /encodeURIComponent\(actorKey\)/.test(operationStore) && /24 \* 60 \* 60 \* 1000/.test(operationStore));
  record("expired pending is removed without sending", /Date\.parse\(parsed\.expiresAt\) <= this\.now\(\)\.getTime\(\)[\s\S]*removeItem/.test(operationStore));
  record("actor generation suppresses stale responses", /actorKey === this\.actorKey && generation === this\.actorGeneration/.test(runtime) && /setActor\(state\.actorKey, state\.actorGeneration\)/.test(provider));
  record("logout and actor change clear in-memory and persisted pending", /this\.pending = null/.test(runtime) && /operationStore\.clear\(previousActor\)/.test(runtime));

  record("composition creates one Supabase client", (composition.match(/new SupabaseConsumerClientFactory/g) ?? []).length === 1);
  record("Today model creates no second client", !/SupabaseConsumerClientFactory|createOfficialSupabaseConsumerSdkLoader|getSupabaseConsumerEnvironment/.test(todayModel));
  record("Provider injects shared write and overview composition", /mealWriteRuntime/.test(provider) && /createOverviewService/.test(provider));
  record("Supabase failure has no mock local fallback", !/fallback[\s\S]{0,100}(?:mock|local)|(?:mock|local)[\s\S]{0,100}fallback/i.test(provider + composition + runtime));
  record("success invalidates Home and Today overview", /mealDataRevision/.test(runtime) && /revision:\s*runtime\.mealDataRevision/.test(home) && /revision:\s*runtime\.mealDataRevision/.test(today));
  record("overview stale response is actor-bound", /input\.actorGeneration/.test(todayModel) && /input\.actorKey/.test(todayModel));
  record("Meal Write calls no summary persistence RPC", !/persist_authenticated_daily_nutrition_summary|dailyNutritionSummaryPersistence/.test(analysis + provider + runtime));
  record("live Meal Write has no Planned Meal side effect", !/confirmPlannedDinner|plannedMealWrite|saveAuthenticatedPlannedMeal/.test(analysis + provider + runtime));
  record("Demo local persistence occurs only after mock success", /result\.status !== "succeeded"[\s\S]*consumerRuntime\.mode === "mock"[\s\S]*persistCanonicalMealToExplicitDemoStore/.test(analysis));
  record("uncertain UX offers same-request retry and confirmation navigation", /retryPendingMealRecord/.test(analysis) && /checkTodayIntake/.test(analysis));

  record("package and lockfiles remain byte-equivalent", equivalent(["package.json", ...baselineFiles("").filter((file) => /(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|npm-shrinkwrap\.json)$/.test(file))]).length === 0);
  const candidateRuntime = [...candidates].filter((file) => file.startsWith("apps/mobile/") || file === "lib/i18n/zh-TW.ts").map(read).join("\n");
  record("candidate contains no service-role or secret runtime", !/service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/i.test(candidateRuntime));
  record("Production N4 Phase 2V-F are excluded", !changed.some((file) => /production|phase-2v|n4|restaurant-n4/i.test(file)));
  record("guard and smoke scripts exist", ["scripts/consumer-runtime-phase-2z-b2-b-mobile-meal-write-guard.mjs", "scripts/consumer-runtime-phase-2z-b2-b-mobile-meal-write-smoke.mjs"].every((file) => fs.existsSync(path.join(root, file))));
  record("sanitized Development evidence record exists", fs.existsSync(path.join(root, evidencePath)));
  const evidenceFacts = [
    "tastkind-development",
    "msbgnnoorsoefuiwluye",
    "ap-southeast-1",
    "Production: false",
    "Local/remote migration parity: 38/38",
    "explicit `加入今日飲食` gesture",
    "Initial Auth/Profile lifecycle",
    "First canonical create through Meal Write V2",
    "Canonical overview refresh",
    "SUPERSEDED_BY_CORRECTED_RESPONSE_LOSS_VALIDATION",
    "real V2 repository success",
    "wrapper discards the response before runtime success handling",
    "69/69 PASS",
    "result_uncertain",
    "pending operation are retained",
    "same idempotency key, canonical input, occurredAt, mealDate, and timezone",
    "no automatic network request",
    "original server record",
    "row counts did not increase on replay",
    "revision increased exactly once",
    "overview contained the meal exactly once",
    "No daily summary persistence write",
    "No Planned Meal write",
    "Controlled parent rows: 0",
    "Controlled item rows: 0",
    "Controlled idempotency keys: 0",
    "persistentTestData=false",
    "Production was untouched",
    "PASS_READY_FOR_GIT_FREEZE"
  ];
  record("Development evidence contains all required facts", evidenceFacts.every((fact) => evidence.includes(fact)), evidenceFacts.filter((fact) => !evidence.includes(fact)));
  const disclosureFacts = [
    "initial live wrapper omitted the process-local Meal Write opt-in",
    "temporary process explicitly enabled the Development-only opt-in",
    "temp-only `@haocu/shared` compiled-output redirect",
    "React Native host shim",
    "wrong overview nutrition field path",
    "omitted the actor rebind normally performed by the Provider",
    "prior response-loss simulation allowed the runtime to receive success",
    "corrected injection discarded the repository response between real success and runtime success handling"
  ];
  record("Development evidence retains all operator disclosures", disclosureFacts.every((fact) => evidence.includes(fact)), disclosureFacts.filter((fact) => !evidence.includes(fact)));
  const forbiddenEvidence = [
    { name: "email value", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
    { name: "JWT", pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
    { name: "complete UUID", pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i },
    { name: "secret assignment", pattern: /(?:password|token|secret|credential|request[_ -]?key|record[_ -]?id)\s*[:=]\s*[`'\"]?[^\s`'\"]+/i },
    { name: "personal profile field", pattern: /(?:display[_ -]?name|phone|address|birth(?:day|date))\s*[:=]/i }
  ];
  const evidenceLeaks = forbiddenEvidence.filter(({ pattern }) => pattern.test(evidence)).map(({ name }) => name);
  record("Development evidence contains no identity credential or personal values", evidenceLeaks.length === 0, evidenceLeaks);

  for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}${check.pass || check.detail === undefined ? "" : ` ${JSON.stringify(check.detail)}`}`);
  console.log(`RESULT ${checks.length - failures.length}/${checks.length} ${failures.length ? "FAIL" : "PASS"}`);
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
