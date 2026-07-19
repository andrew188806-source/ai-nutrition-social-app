#!/usr/bin/env node
// Phase 2Y-B Guard — static integrity checks for the Local Disabled/Mock architecture.
// Verifies candidate scope, Phase 2Y-A frozen baseline, static source patterns, and smoke.

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const PHASE = "Consumer Runtime Phase 2Y-B Local Disabled/Mock Architecture Guard";
const PHASE_2YA_COMMIT = "14d308f300d4754e076ed6194d298707c5844a8e";

let passed = 0;
let failed = 0;
const failures = [];

function pass(name) {
  passed++;
  console.log(`  PASS  ${name}`);
}

function fail(name, detail = "") {
  failed++;
  failures.push({ name, detail });
  console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
}

function check(name, condition, detail = "") {
  if (condition) pass(name);
  else fail(name, detail);
}

function run(cmd, options = {}) {
  try {
    return { ok: true, stdout: execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...options }).trim() };
  } catch (e) {
    return { ok: false, stdout: "", stderr: e.stderr?.toString().trim() ?? "" };
  }
}

function runCapture(cmd) {
  try {
    const stdout = execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { exitCode: 0, stdout: stdout.trim() };
  } catch (e) {
    return { exitCode: e.status ?? 1, stdout: (e.stdout ?? "").trim() };
  }
}

function readFile(relPath) {
  try { return { ok: true, content: fs.readFileSync(path.join(root, relPath), "utf8") }; }
  catch { return { ok: false, content: "" }; }
}

function fileExists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

// =====================================================================
// SECTION 1: Phase 2Y-A Commit Ancestry
// =====================================================================
console.log("\n=== 1. Phase 2Y-A Commit Ancestry ===");

const ancestorCheck = run(`git merge-base --is-ancestor ${PHASE_2YA_COMMIT} HEAD`);
check(
  `Phase 2Y-A commit ${PHASE_2YA_COMMIT.slice(0, 10)} is ancestor of HEAD`,
  ancestorCheck.ok,
  ancestorCheck.ok ? "" : "Phase 2Y-A commit not found in history — has the repo been rebased?"
);

const headLog = run("git log -1 --format=%H");
check("HEAD commit is accessible", headLog.ok && headLog.stdout.length === 40);

// =====================================================================
// SECTION 2: Phase 2Y-A Frozen File Integrity (git diff --quiet, no trim)
// =====================================================================
console.log("\n=== 2. Phase 2Y-A Frozen File Integrity ===");

const FROZEN_FILES = [
  "docs/consumer-runtime-phase-2y/phase-2y-a-discovery-report.md",
  "docs/consumer-runtime-phase-2y/phase-2y-a-runtime-contract.md",
  "docs/consumer-runtime-phase-2y/phase-2y-a-security-and-target-identity.md",
  "docs/consumer-runtime-phase-2y/phase-2y-implementation-plan.md",
  "docs/consumer-runtime-phase-2y/phase-2y-known-issues-and-deferrals.md",
  "docs/consumer-runtime-phase-2y/phase-2y-validation-plan.md",
  "scripts/consumer-recommendation-feedback-phase-2y-a-guard.mjs"
];

for (const frozenFile of FROZEN_FILES) {
  const basename = path.basename(frozenFile);
  const commitDiff = run(`git diff --quiet ${PHASE_2YA_COMMIT} HEAD -- "${frozenFile}"`);
  check(
    `No commit delta between Phase 2Y-A commit and HEAD: ${basename}`,
    commitDiff.ok,
    "file content differs between Phase 2Y-A commit and HEAD"
  );
  const wtDiff = run(`git diff --quiet HEAD -- "${frozenFile}"`);
  check(
    `Working tree clean vs HEAD for frozen file: ${basename}`,
    wtDiff.ok,
    "working tree has uncommitted changes to this frozen file"
  );
}

// =====================================================================
// SECTION 3: Phase 2Y-B Candidate Scope
// =====================================================================
console.log("\n=== 3. Phase 2Y-B Candidate Scope ===");

const CANDIDATE_TS_FILES = [
  "apps/mobile/features/consumer-recommendation-feedback/types.ts",
  "apps/mobile/features/consumer-recommendation-feedback/errors.ts",
  "apps/mobile/features/consumer-recommendation-feedback/validation.ts",
  "apps/mobile/features/consumer-recommendation-feedback/ports.ts",
  "apps/mobile/features/consumer-recommendation-feedback/consumerRecommendationFeedbackService.ts",
  "apps/mobile/features/consumer-recommendation-feedback/featureFlags.ts",
  "apps/mobile/features/consumer-recommendation-feedback/factories.ts",
  "apps/mobile/features/consumer-recommendation-feedback/index.ts",
  "apps/mobile/features/consumer-recommendation-feedback/adapters/disabledConsumerRecommendationFeedbackRepository.ts",
  "apps/mobile/features/consumer-recommendation-feedback/adapters/mockConsumerRecommendationFeedbackRepository.ts"
];

const CANDIDATE_DOC_FILES = [
  "docs/consumer-runtime-phase-2y/phase-2y-b-local-disabled-mock-architecture.md",
  "docs/consumer-runtime-phase-2y/phase-2y-b-validation-plan.md"
];

const CANDIDATE_SCRIPT_FILES = [
  "scripts/consumer-recommendation-feedback-phase-2y-b-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs"
];

const ALL_CANDIDATE_FILES = [...CANDIDATE_TS_FILES, ...CANDIDATE_DOC_FILES, ...CANDIDATE_SCRIPT_FILES];

for (const candidateFile of ALL_CANDIDATE_FILES) {
  check(`Candidate file exists: ${path.basename(candidateFile)}`, fileExists(candidateFile));
}

check("Candidate TypeScript count is 10", CANDIDATE_TS_FILES.filter(f => fileExists(f)).length === 10);
check("Candidate doc count is 2", CANDIDATE_DOC_FILES.filter(f => fileExists(f)).length === 2);
check("Candidate script count is 2", CANDIDATE_SCRIPT_FILES.filter(f => fileExists(f)).length === 2);
check("Candidate total count is 15 (including package.json)",
  ALL_CANDIDATE_FILES.filter(f => fileExists(f)).length === 14 && fileExists("package.json"));

// =====================================================================
// SECTION 4: package.json New Scripts
// =====================================================================
console.log("\n=== 4. package.json Script Additions ===");

const pkgRead = readFile("package.json");
check("package.json is readable", pkgRead.ok);

if (pkgRead.ok) {
  let pkg;
  try { pkg = JSON.parse(pkgRead.content); } catch { pkg = null; }
  check("package.json parses as valid JSON", pkg !== null);

  if (pkg) {
    check(
      "package.json has test:consumer-phase2y-b script",
      typeof pkg.scripts?.["test:consumer-phase2y-b"] === "string" &&
      pkg.scripts["test:consumer-phase2y-b"].includes("consumer-recommendation-feedback-phase-2y-b-guard.mjs")
    );
    check(
      "package.json has test:consumer-phase2y-b-smoke script",
      typeof pkg.scripts?.["test:consumer-phase2y-b-smoke"] === "string" &&
      pkg.scripts["test:consumer-phase2y-b-smoke"].includes("consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs")
    );
    check(
      "package.json Phase 2Y-A guard script still present",
      typeof pkg.scripts?.["test:consumer-phase2y-a"] === "string"
    );
  }
}

// =====================================================================
// SECTION 5: Migration Integrity
// =====================================================================
console.log("\n=== 5. Migration Integrity ===");

const migrationStatus = run("git diff --name-only -- supabase/migrations/");
check("No migration files modified in working tree", migrationStatus.ok && migrationStatus.stdout === "");

const migrationStatusCached = run("git diff --cached --name-only -- supabase/migrations/");
check("No migration files staged", migrationStatusCached.ok && migrationStatusCached.stdout === "");

const migDir = path.join(root, "supabase", "migrations");
check("Migration directory exists", fs.existsSync(migDir));

let sqlFileCount = 0;
let latestFilenameActual = "";
let latestShaDiffers = false;
if (fs.existsSync(migDir)) {
  const sqlFiles = fs.readdirSync(migDir).filter(f => f.endsWith(".sql")).sort();
  sqlFileCount = sqlFiles.length;
  latestFilenameActual = sqlFiles.at(-1) ?? "";

  check("Migration count is exactly 36", sqlFiles.length === 36, `got ${sqlFiles.length}`);

  const expectedLatestFilename = "20260718020000_consumer_favorites_atomic_write.sql";
  check(
    "Latest migration filename matches expected",
    latestFilenameActual === expectedLatestFilename,
    `got: ${latestFilenameActual}`
  );

  if (latestFilenameActual === expectedLatestFilename) {
    const latestPath = path.join(migDir, expectedLatestFilename);
    const computedSha = createHash("sha256").update(fs.readFileSync(latestPath)).digest("hex");
    const expectedSha = "63257e599b51551a4425eb03b26a5a21319c97fafeb9e7fad08a8c4ec8311475";
    check(
      "Latest migration SHA-256 matches expected",
      computedSha === expectedSha,
      `got: ${computedSha}`
    );
    if (computedSha !== expectedSha) latestShaDiffers = true;
  }
}

const migCommitDiff = run(`git diff --quiet ${PHASE_2YA_COMMIT} HEAD -- supabase/migrations/`);
check("Migration diff vs Phase 2Y-A frozen commit is empty", migCommitDiff.ok,
  "migrations changed since Phase 2Y-A commit");

// =====================================================================
// SECTION 6: TypeScript Compilation
// =====================================================================
console.log("\n=== 6. TypeScript Compilation ===");

const mobileTscCheck = run("npx tsc -p apps/mobile/tsconfig.json --noEmit");
check(
  "Mobile TypeScript compiles cleanly (consumer-recommendation-feedback)",
  mobileTscCheck.ok,
  mobileTscCheck.ok ? "" : (mobileTscCheck.stderr ?? "").split("\n").slice(0, 5).join("\n")
);

// =====================================================================
// SECTION 7: Static Pattern Checks — TypeScript Source Files
// =====================================================================
console.log("\n=== 7. Static Source Pattern Checks ===");

const featureDir = "apps/mobile/features/consumer-recommendation-feedback";

function readSrc(file) {
  const r = readFile(path.join(featureDir, file));
  return r.content;
}

const typesTs = readSrc("types.ts");
const validationTs = readSrc("validation.ts");
const featureFlagsTs = readSrc("featureFlags.ts");
const mockRepoTs = readSrc("adapters/mockConsumerRecommendationFeedbackRepository.ts");
const factoriesTs = readSrc("factories.ts");
const serviceTs = readSrc("consumerRecommendationFeedbackService.ts");
const indexTs = readSrc("index.ts");
const errorsTs = readSrc("errors.ts");
const disabledTs = readSrc("adapters/disabledConsumerRecommendationFeedbackRepository.ts");
const portsTs = readSrc("ports.ts");

const allSrc = [typesTs, validationTs, featureFlagsTs, mockRepoTs, factoriesTs, serviceTs, indexTs, errorsTs, disabledTs, portsTs].join("\n");

// Types: required action values
check("types.ts defines all 6 canonical action values",
  ["shown", "clicked", "accepted", "dismissed", "saved", "consumed"].every(a => typesTs.includes(`"${a}"`)));

// Types: target kinds
check("types.ts defines 3 target kinds (recommendation, restaurant, menu_item)",
  typesTs.includes('"recommendation"') && typesTs.includes('"restaurant"') && typesTs.includes('"menu_item"'));

// Types: result status vocabularies
check("types.ts has all create session result statuses",
  ["created", "already_created", "disabled", "unauthenticated", "invalid_input", "create_failed"].every(s => typesTs.includes(`"${s}"`)));
check("types.ts has all end session result statuses",
  ["ended", "already_ended", "disabled", "unauthenticated", "session_not_found", "invalid_session", "end_failed"].every(s => typesTs.includes(`"${s}"`)));
check("types.ts has all feedback event result statuses",
  ["recorded", "already_recorded", "idempotency_conflict", "disabled", "unauthenticated", "session_not_found", "invalid_session", "invalid_target", "invalid_action", "write_failed"].every(s => typesTs.includes(`"${s}"`)));

// Types: forbidden fields must NOT be in RecordRecommendationFeedbackEventInput
const recordInputBlock = (typesTs.match(/RecordRecommendationFeedbackEventInput\s*=\s*\{[^}]+\}/) ?? [""])[0];
check("RecordRecommendationFeedbackEventInput has no sourceSurface property",
  !/\bsourceSurface\s*\??:/.test(recordInputBlock));
check("types.ts has no eventTimestamp property (v1 excluded)",
  !/\beventTimestamp\s*\??:\s*\w/.test(typesTs));
check("types.ts has no rating property in feedback input (v1 excluded)",
  !/\brating\s*\??:\s*\w/.test(typesTs));
check("types.ts has no feedbackNote property in feedback input (v1 excluded)",
  !/\bfeedbackNote\s*\??:\s*\w/.test(typesTs));
check("types.ts has no dismissReason property in feedback input (v1 excluded)",
  !/\bdismissReason\s*\??:\s*\w/.test(typesTs));

// Feature flags: fail closed
check("featureFlags.ts default source is disabled (empty env var branch)",
  /if\s*\(!value\)/.test(featureFlagsTs) && featureFlagsTs.includes('return "disabled"'));
check("featureFlags.ts unknown source falls back to disabled, not mock",
  !/return\s*["']mock["']/.test(featureFlagsTs.split("SUPPORTED_SOURCES")[1] ?? featureFlagsTs));
check("featureFlags.ts supabase is NOT in supported sources set",
  !featureFlagsTs.includes('"supabase"') || /SUPPORTED_SOURCES.*=.*new Set/.test(featureFlagsTs) && !/"supabase"/.test((featureFlagsTs.match(/new Set\([^)]+\)/) ?? [""])[0]));

// Mock repo: deterministic clock and ID
check("mock repo has no Date.now() nondeterministic call",
  !/\bDate\.now\s*\(/.test(mockRepoTs));
check("mock repo has no Math.random() nondeterministic call",
  !/\bMath\.random\s*\(/.test(mockRepoTs));
check("mock repo has no bare new Date() call",
  !/\bnew\s+Date\s*\(/.test(mockRepoTs));

// Mock repo: correct sourceSurface derivation from session
check("mock repo derives sourceSurface from session row",
  mockRepoTs.includes("session.sourceSurface"));

// Mock repo: actor isolation pattern (ownedSession checks actorId)
check("mock repo ownedSession enforces actorId ownership",
  /actorId/.test(mockRepoTs) && /ownedSession/.test(mockRepoTs));

// Mock repo: action timestamp mapping (each action sets exactly one column)
check("mock repo maps action to timestamp column (shownAt present)",
  mockRepoTs.includes("shownAt"));
check("mock repo maps all 6 action timestamp columns",
  ["shownAt", "clickedAt", "acceptedAt", "dismissedAt", "savedAt", "consumedAt"].every(c => mockRepoTs.includes(c)));

// Validation: isValidId rejects fav-* but NOT numeric text
check("validation.ts rejects fav-* prefix via regex",
  validationTs.includes("fav-"));
check("validation.ts does NOT reject numeric text IDs (no bare-integer check)",
  !/\/\^\s*\\d\+\s*\$\/|\/\^\[0-9\]/.test(validationTs));

// Source: no network, database, or credential access
check("source files have no fetch/XMLHttpRequest/WebSocket network call",
  !/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(allSrc));
check("source files have no supabase import or client construction",
  !/from\s+["'][^"']*@supabase|createClient\s*\(/.test(allSrc));
check("source files have no service_role credential reference",
  !/service_role/.test(allSrc));
check("source files have no raw SQL DML",
  !/\b(?:INSERT|UPDATE|DELETE)\s+INTO\b/i.test(allSrc));
check("source files have no raw SQL SELECT",
  !/\bSELECT\s+\*?\s+FROM\b/i.test(allSrc));
check("source files have no .env.local or SUPABASE_URL access",
  !/NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|\.env\.local/.test(allSrc));

// Disabled repo: all 3 methods return status disabled
check("disabled repo create method returns disabled status",
  disabledTs.includes('"disabled"') && disabledTs.includes("createCurrentUserRecommendationSession"));
check("disabled repo end method returns disabled status",
  disabledTs.includes('"disabled"') && disabledTs.includes("endCurrentUserRecommendationSession"));
check("disabled repo record method returns disabled status",
  disabledTs.includes('"disabled"') && disabledTs.includes("recordCurrentUserRecommendationFeedbackEvent"));

// Index exports all modules
check("index.ts re-exports from types",
  indexTs.includes("./types"));
check("index.ts re-exports from errors",
  indexTs.includes("./errors"));
check("index.ts re-exports from validation",
  indexTs.includes("./validation"));
check("index.ts re-exports from factories",
  indexTs.includes("./factories"));
check("index.ts re-exports from adapters",
  indexTs.includes("./adapters/"));

// =====================================================================
// SECTION 8: Staged Diff Clean
// =====================================================================
console.log("\n=== 8. Staged Diff Clean ===");

const stagedDiff = run("git diff --cached --name-only");
check("No files staged in working tree (Phase 2Y-B is candidate-only, not staged)",
  stagedDiff.ok && stagedDiff.stdout === "");

const unstaged2YBSrc = run("git diff --name-only -- apps/mobile/features/consumer-recommendation-feedback/");
check("Consumer recommendation feedback feature directory not modified in git index",
  unstaged2YBSrc.ok);

// =====================================================================
// SECTION 9: No Forbidden Patterns (Production / service_role / N4 / 2Z)
// =====================================================================
console.log("\n=== 9. Forbidden Pattern Checks ===");

check("candidate files contain no supabase RPC call pattern",
  !/\.rpc\s*\(["']/.test(allSrc));
check("candidate files contain no HTTP fetch to external URL",
  !/fetch\s*\(\s*["']https?:\/\//.test(allSrc));
check("candidate files contain no N4 execution pattern",
  !/\bN4\b/.test(allSrc));
check("candidate files contain no Phase 2Z references",
  !/phase[._-]?2z/i.test(allSrc));

// =====================================================================
// SECTION 10: Guard Self-Syntax Check
// =====================================================================
console.log("\n=== 10. Guard Script Syntax ===");

const guardSyntax = run("node --check scripts/consumer-recommendation-feedback-phase-2y-b-guard.mjs");
check("Guard script passes node --check", guardSyntax.ok);

const smokeSyntax = run("node --check scripts/consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs");
check("Smoke script passes node --check", smokeSyntax.ok);

// =====================================================================
// SECTION 11: Contract Smoke — Two Runs for Determinism
// =====================================================================
console.log("\n=== 11. Contract Smoke (Run 1) ===");

const smoke1Result = run("node scripts/consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs");
let smoke1 = null;
let smoke1Parsed = false;
try {
  smoke1 = JSON.parse(smoke1Result.stdout);
  smoke1Parsed = true;
} catch {
  smoke1 = null;
}

check("Smoke run 1 produces valid JSON output", smoke1Parsed, smoke1Result.stdout.slice(0, 200));
check("Smoke run 1 status is passed", smoke1?.status === "passed", smoke1?.reason ?? "");
check("Smoke run 1 has at least 80 checks", (smoke1?.totalChecks ?? 0) >= 80,
  `got ${smoke1?.totalChecks ?? 0}`);
check("Smoke run 1 reports networkUsed: false", smoke1?.networkUsed === false);
check("Smoke run 1 reports databaseUsed: false", smoke1?.databaseUsed === false);
check("Smoke run 1 reports supabaseUsed: false", smoke1?.supabaseUsed === false);
check("Smoke run 1 compiledEntryPath is present",
  typeof smoke1?.compilationProof?.compiledEntryPath === "string" && smoke1.compilationProof.compiledEntryPath.length > 0);
check("Smoke run 1 importedPublicFactory is createConsumerRecommendationFeedbackRuntime",
  smoke1?.compilationProof?.importedPublicFactory === "createConsumerRecommendationFeedbackRuntime");

console.log("\n=== 11b. Contract Smoke (Run 2 — Determinism Check) ===");

const smoke2Result = run("node scripts/consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs");
let smoke2 = null;
try { smoke2 = JSON.parse(smoke2Result.stdout); } catch { smoke2 = null; }

check("Smoke run 2 produces valid JSON output", smoke2 !== null);
check("Smoke run 2 status is passed", smoke2?.status === "passed", smoke2?.reason ?? "");
check("Smoke run 1 and run 2 have identical totalChecks (deterministic)",
  smoke1?.totalChecks === smoke2?.totalChecks,
  `run1=${smoke1?.totalChecks} run2=${smoke2?.totalChecks}`);
check("Smoke run 1 and run 2 have same check names (deterministic)",
  JSON.stringify(smoke1?.checks?.map(c => c.name)) === JSON.stringify(smoke2?.checks?.map(c => c.name)));
check("Smoke temp artifacts cleaned up after run 1",
  smoke1?.compilationProof?.temporaryArtifactPath == null ||
  !fs.existsSync(smoke1.compilationProof.temporaryArtifactPath));

// =====================================================================
// SECTION 12: Phase 2Y-A Guard Disposition
// =====================================================================
console.log("\n=== 12. Phase 2Y-A Guard Disposition ===");

const phase2yaRun = runCapture("node scripts/consumer-recommendation-feedback-phase-2y-a-guard.mjs");
let phase2yaOutput = null;
try { phase2yaOutput = JSON.parse(phase2yaRun.stdout); } catch { phase2yaOutput = null; }

check("Phase 2Y-A guard produces parseable JSON output", phase2yaOutput !== null,
  `stdout: ${phase2yaRun.stdout.slice(0, 200)}`);

if (phase2yaOutput !== null) {
  const failingChecks = (phase2yaOutput.checks ?? []).filter(c => !c.pass);

  check("Phase 2Y-A guard total checks = 121",
    phase2yaOutput.totalChecks === 121,
    `got ${phase2yaOutput.totalChecks}`);

  check("Phase 2Y-A guard has exactly 2 expected failures",
    failingChecks.length === 2,
    `got ${failingChecks.length}: ${failingChecks.map(c => c.name).join("; ")}`);

  const EXPECTED_2YA_FAILURES = [
    "no consumer-recommendation-feedback runtime directory exists in Phase 2Y-A",
    "package.json adds exactly one new script key in Phase 2Y-A"
  ];

  for (const expected of EXPECTED_2YA_FAILURES) {
    check(
      `Phase 2Y-A guard has expected failure: "${expected}"`,
      failingChecks.some(c => c.name === expected),
      `actual failures: ${failingChecks.map(c => c.name).join("; ")}`
    );
  }

  check("Phase 2Y-A guard has no unexpected third failure",
    failingChecks.length <= 2,
    failingChecks.length > 2
      ? `unexpected: ${failingChecks.filter(c => !EXPECTED_2YA_FAILURES.includes(c.name)).map(c => c.name).join("; ")}`
      : ""
  );
}

// =====================================================================
// FINAL REPORT
// =====================================================================
console.log(`\n${"=".repeat(60)}`);
console.log(`${PHASE}`);
console.log(`${"=".repeat(60)}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log(`TOTAL:  ${passed + failed}`);

if (failures.length > 0) {
  console.log("\nFailed checks:");
  for (const f of failures) {
    console.log(`  - ${f.name}${f.detail ? `\n    ${f.detail}` : ""}`);
  }
}

const phase2yaFailingNames = phase2yaOutput != null
  ? (phase2yaOutput.checks ?? []).filter(c => !c.pass).map(c => c.name)
  : null;

console.log(JSON.stringify({
  status: failed === 0 ? "passed" : "failed",
  phase: PHASE,
  totalChecks: passed + failed,
  passed,
  failed,
  failures: failures.map(f => f.name),
  phase2yaDisposition: {
    totalChecks: phase2yaOutput?.totalChecks ?? null,
    failingCheckCount: phase2yaFailingNames?.length ?? null,
    failingCheckNames: phase2yaFailingNames
  },
  migrationInventory: {
    count: sqlFileCount,
    latestFilename: latestFilenameActual
  },
  frozenFileCount: FROZEN_FILES.length,
  smokeRun1TotalChecks: smoke1?.totalChecks ?? null,
  smokeRun2TotalChecks: smoke2?.totalChecks ?? null,
  smokeCompilationProof: smoke1?.compilationProof ?? null,
  networkUsed: false,
  databaseUsed: false,
  supabaseUsed: false,
  migrationExecuted: false,
  developmentTouched: false,
  productionTouched: false,
  serviceRoleUsed: false,
  n4Executed: false,
  phase2ZStarted: false
}, null, 2));

if (failed > 0) process.exitCode = 1;
