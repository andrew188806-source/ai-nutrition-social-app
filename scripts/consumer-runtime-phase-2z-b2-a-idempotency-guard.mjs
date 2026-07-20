#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const baseline = "424f99f7d62f102b2e6c902cde5224dc5d5241f3";
const migrationName = "20260720010000_consumer_meal_record_create_idempotency.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const migrationSha = "703e724909a96ce7f63a9654ea155cad11d3dbfe5aec29aa99a7296ab16ffb14";
const evidencePath = "docs/consumer-runtime-phase-2z/phase-2z-b2-a-development-validation-record.md";
const candidates = new Set([
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
  evidencePath
]);
const b1Frozen = [
  "apps/mobile/app/_layout.tsx",
  "apps/mobile/app/login.tsx",
  "apps/mobile/app/me.tsx",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx",
  "apps/mobile/features/consumer-runtime/index.ts",
  "lib/i18n/zh-TW.ts",
  "docs/consumer-runtime-phase-2z/phase-2z-b1-development-validation-record.md",
  "scripts/consumer-runtime-phase-2z-b1-guard.mjs",
  "scripts/consumer-runtime-phase-2z-b1-auth-profile-smoke.mjs"
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
  const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  const sql = read(migrationPath);
  const cleanSql = sql.replace(/--.*$/gm, "").toLowerCase();
  const types = read("apps/mobile/features/consumer-meals/types.ts");
  const validation = read("apps/mobile/features/consumer-meals/writeValidation.ts");
  const helper = read("apps/mobile/features/consumer-meals/mealDateTime.ts");
  const contracts = read("apps/mobile/features/consumer-meals/supabaseMealContracts.ts");
  const supabaseRepo = read("apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts");
  const mockRepo = read("apps/mobile/features/consumer-meals/adapters/mockConsumerMealRecordWriteRepository.ts");
  const evidenceExists = fs.existsSync(path.join(root, evidencePath));
  const evidence = evidenceExists ? read(evidencePath) : "";

  record("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  record("baseline commit exists", git(["cat-file", "-e", `${baseline}^{commit}`]).status === 0);
  record("baseline is HEAD ancestor", git(["merge-base", "--is-ancestor", baseline, "HEAD"]).status === 0);
  record("HEAD remains B1 Frozen commit", git(["rev-parse", "HEAD"]).stdout.trim() === baseline);
  record("B1 Frozen manifest is exact and byte-equivalent", b1Frozen.every((file) => fs.existsSync(path.join(root, file))) && equivalent(b1Frozen).length === 0);
  record("candidate inventory is exact", changed.length === candidates.size && changed.every((file) => candidates.has(file)), changed);
  record("staged diff is empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  record("sanitized Development evidence record exists", evidenceExists, evidencePath);
  const requiredEvidenceFacts = [
    ["Development target", /Project name: `tastkind-development`/],
    ["Development project ref", /Project ref: `msbgnnoorsoefuiwluye`/],
    ["migration parity 38\/38", /Post-deployment migration parity: local 38 \/ remote 38/],
    ["credential-backed 38\/38", /Official corrected matrix: `38\/38 PASS`/],
    ["true concurrency", /True parallel concurrency: PASS/],
    ["actor isolation", /cross-actor isolation: PASS/],
    ["rollback", /Item failure rollback: PASS/],
    ["V1 regression", /V1 regression: PASS/],
    ["direct DML denied", /Direct INSERT \/ UPDATE \/ DELETE denied/],
    ["service role exclusion", /`service_role` was not used/],
    ["controlled parents zero", /Controlled parents: 0/],
    ["controlled items zero", /Controlled items: 0/],
    ["controlled keys zero", /Controlled request keys: 0/],
    ["aggregate restored", /Aggregate restored: confirmed/],
    ["persistent data cleanup", /`persistentTestData=false`/],
    ["Production exclusion", /Production remains untouched/],
    ["freeze verdict", /PASS_READY_FOR_GIT_FREEZE/]
  ];
  const missingEvidenceFacts = requiredEvidenceFacts.filter(([, pattern]) => !pattern.test(evidence)).map(([name]) => name);
  record("Development evidence contains all required sanitized facts", missingEvidenceFacts.length === 0, missingEvidenceFacts);
  const disclosureFacts = [
    /read `\.id` instead of `\.mealRecordId`/,
    /did not obtain six controlled record identifiers/,
    /removed those rows using the exact known identifiers/,
    /independently confirmed that all controlled rows were zero/,
    /corrected the temporary runner/,
    /does not exist in Repository production runtime/,
    /did not set safe no-emit behavior/,
    /produced eleven untracked compiled `\.js` artifacts/,
    /removed every artifact/,
    /no tracked source was overwritten/,
    /no artifact remaining/,
    /does not exist in the Repository build or runtime/
  ];
  record("Development evidence preserves both operator disclosures", disclosureFacts.every((pattern) => pattern.test(evidence)));
  const prohibitedEvidenceValues = [
    ["email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ["JWT or token-shaped value", /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/],
    ["Supabase key value", /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+\b/],
    ["credential assignment", /(?:password|access[_ -]?token|refresh[_ -]?token|anon[_ -]?key|publishable[_ -]?key)\s*[:=]\s*[`"'][^`"']+[`"']/i],
    ["full UUID", /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i],
    ["personal profile field", /\b(?:profileId|displayName|nickname|avatarUrl)\b/]
  ];
  const exposedEvidenceValues = prohibitedEvidenceValues.filter(([, pattern]) => pattern.test(evidence)).map(([name]) => name);
  record("Development evidence contains no secret actor or personal values", exposedEvidenceValues.length === 0, exposedEvidenceValues);

  record("migration count is 38", migrationFiles.length === 38, migrationFiles.length);
  record("latest migration name is exact", migrationFiles.at(-1) === migrationName, migrationFiles.at(-1));
  record("latest migration SHA is exact", sha(migrationPath) === migrationSha, sha(migrationPath));
  const historicalMigrations = baselineFiles("supabase/migrations");
  record("existing migrations are byte-equivalent", historicalMigrations.length === 37 && equivalent(historicalMigrations).length === 0);
  record("V1 RPC migration remains byte-equivalent", equivalent(["supabase/migrations/20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql"]).length === 0);

  record("V2 RPC exists without replacing V1", /create\s+function\s+public\.create_current_user_meal_record_v2\s*\(/.test(cleanSql) && !/create\s+or\s+replace|drop\s+function/.test(cleanSql));
  record("V2 actor derives only from auth.uid", /v_user_id\s+uuid\s*:=\s*auth\.uid\(\)/.test(cleanSql) && !/p_(?:user|owner|profile)_id/.test(cleanSql));
  record("actor-scoped partial unique index exists", /unique\s+index[\s\S]*\(user_id\s*,\s*client_request_id\)[\s\S]*where\s+client_request_id\s+is\s+not\s+null/.test(cleanSql));
  record("fingerprint is server-derived canonical JSONB", /request_fingerprint\s+jsonb/.test(cleanSql) && /jsonb_build_object\([\s\S]*'ordinal'/.test(cleanSql) && !/p_(?:request_)?fingerprint/.test(cleanSql));
  record("same-key replay and payload conflict are explicit", /request_fingerprint\s+is\s+distinct\s+from\s+v_fingerprint/.test(cleanSql) && /idempotency_key_conflict/.test(cleanSql) && /return\s+pg_catalog\.jsonb_build_object/.test(cleanSql));
  record("transaction lock serializes actor and key", /pg_advisory_xact_lock[\s\S]*v_user_id::text[\s\S]*p_client_request_id::text/.test(cleanSql));
  record("V1 atomic insert remains rollback boundary", /v_created\s*:=\s*public\.create_current_user_meal_record\s*\(/.test(cleanSql) && /update\s+public\.meal_records[\s\S]*request_fingerprint/.test(cleanSql));
  record("V2 is security definer with fixed search_path", /security\s+definer[\s\S]*set\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*pg_temp/.test(cleanSql));
  record("V2 execute is authenticated-only", /revoke\s+all\s+on\s+function[\s\S]*from\s+public/.test(cleanSql) && /from\s+anon/.test(cleanSql) && /from\s+authenticated/.test(cleanSql) && /grant\s+execute\s+on\s+function[\s\S]*to\s+authenticated/.test(cleanSql));
  record("direct table writes remain revoked", /revoke\s+insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.meal_records\s+from\s+authenticated/.test(cleanSql) && !/grant\s+(?:insert|update|delete)/.test(cleanSql));

  record("TypeScript input adds only optional idempotency key", /idempotencyKey\?:\s*string/.test(types));
  record("UUID v4 validation is canonical", /idempotencyKey must be a UUID v4/.test(validation) && /4\[0-9a-f\]\{3\}/.test(validation));
  record("Supabase adapter routes no-key V1 and keyed V2", /validated\.idempotencyKey[\s\S]*SUPABASE_CREATE_CURRENT_USER_MEAL_RECORD_V2_FUNCTION[\s\S]*SUPABASE_CREATE_CURRENT_USER_MEAL_RECORD_FUNCTION/.test(supabaseRepo) && /p_client_request_id/.test(supabaseRepo));
  record("Supabase client sends neither actor nor fingerprint", !/p_(?:user|owner|profile)_id|p_(?:request_)?fingerprint/.test(supabaseRepo));
  record("mock implements actor-scoped deterministic replay", /session\.value\.user\.userId/.test(mockRepo) && /idempotentRecords/.test(mockRepo) && /existing\.fingerprint !== fingerprint/.test(mockRepo));
  record("timezone parity helper is used by validator", /Intl\.DateTimeFormat/.test(helper) && /toDateKeyInTimeZone\(new Date\(occurredAt\), timezone\)/.test(validation));

  const protectedPaths = ["apps/mobile/app", "apps/mobile/features/analysis", "apps/mobile/features/consumer-runtime", "apps/mobile/features/consumer-auth"];
  const protectedDrift = protectedPaths.flatMap((prefix) => equivalent(baselineFiles(prefix)));
  record("UI Provider Analysis and Auth remain unchanged", protectedDrift.length === 0, protectedDrift);
  record("package and lockfiles remain unchanged", equivalent(["package.json", ...baselineFiles("").filter((file) => /(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|npm-shrinkwrap\.json)$/.test(file))]).length === 0);
  const mobileRuntime = [...candidates].filter((file) => file.startsWith("apps/mobile/")).map(read).join("\n");
  record("Mobile runtime contains no service-role or direct write path", !/service[_-]?role|SUPABASE_SERVICE|\.\s*(?:insert|update|upsert|delete)\s*\(/i.test(mobileRuntime));
  record("Production and N4 are excluded", !changed.some((file) => /production|phase-2v-e|n4/i.test(file)));
  record("guard smoke and documentation exist", ["scripts/consumer-runtime-phase-2z-b2-a-idempotency-smoke.mjs", "docs/consumer-runtime-phase-2z/phase-2z-b2-a-idempotency-contract.md", evidencePath].every((file) => fs.existsSync(path.join(root, file))));

  for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}${check.pass || check.detail === undefined ? "" : ` ${JSON.stringify(check.detail)}`}`);
  console.log(`RESULT ${checks.length - failures.length}/${checks.length} ${failures.length ? "FAIL" : "PASS"}`);
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
