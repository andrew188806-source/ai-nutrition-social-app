#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const baseline = "4e65fc096ca926412102ba2b1b40037469913419";
const migrationName = "20260719010000_consumer_recommendation_feedback_atomic_write.sql";
const migrationPath = `supabase/migrations/${migrationName}`;
const migrationSha = "52a0d5708d6f7b32fca573750cc141342774c52467d90dc65efb650d0652af5e";
const evidencePath = "docs/consumer-runtime-phase-2z/phase-2z-b1-development-validation-record.md";
const approved = new Set([
  "apps/mobile/app/_layout.tsx",
  "apps/mobile/app/login.tsx",
  "apps/mobile/app/me.tsx",
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts",
  "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx",
  "apps/mobile/features/consumer-runtime/index.ts",
  "lib/i18n/zh-TW.ts",
  evidencePath,
  "scripts/consumer-runtime-phase-2z-b1-guard.mjs",
  "scripts/consumer-runtime-phase-2z-b1-auth-profile-smoke.mjs"
]);
const protectedRoutes = [
  "apps/mobile/app/analysis.tsx",
  "apps/mobile/app/recommendation.tsx",
  "apps/mobile/app/meal-photo.tsx",
  "apps/mobile/app/today-intake.tsx"
];
const checks = [];
const failures = [];

function git(args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
}
function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}
function sha(file) {
  return createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
}
function normalizeComparablePath(value, platform = process.platform) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const normalized = pathApi.resolve(value).replaceAll("\\", "/").replace(/\/$/, "");
  return platform === "win32" ? normalized.replace(/^([A-Z]):/, (_, drive) => `${drive.toLowerCase()}:`) : normalized;
}
function realComparablePath(value) {
  const resolved = path.resolve(value);
  const real = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved);
  return normalizeComparablePath(real);
}
function record(name, condition, detail) {
  const item = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(item);
  if (!condition) failures.push(item);
}
function worktreeFiles() {
  const result = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  return result.stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/"));
}
function baselineFiles(prefix) {
  if (!prefix) return git(["ls-tree", "-r", "--name-only", baseline]).stdout.trim().split("\n").filter(Boolean);
  return git(["ls-tree", "-r", "--name-only", baseline, "--", prefix]).stdout.trim().split("\n").filter(Boolean);
}
function baselineEquivalent(files) {
  return files.filter((file) => git(["diff", "--quiet", baseline, "--", file]).status !== 0);
}

try {
  const changed = worktreeFiles();
  const unapproved = changed.filter((file) => !approved.has(file));
  const missingApproved = [...approved].filter((file) => !changed.includes(file));
  const runtimeFiles = [...approved].filter((file) => file.startsWith("apps/mobile/") || file === "lib/i18n/zh-TW.ts").filter((file) => fs.existsSync(path.join(root, file)));
  const runtimeSource = runtimeFiles.map(read).join("\n");
  const layout = read("apps/mobile/app/_layout.tsx");
  const login = read("apps/mobile/app/login.tsx");
  const me = read("apps/mobile/app/me.tsx");
  const composition = read("apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts");
  const provider = read("apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx");
  const evidenceExists = fs.existsSync(path.join(root, evidencePath));
  const evidence = evidenceExists ? read(evidencePath) : "";

  const gitTopLevelResult = git(["rev-parse", "--show-toplevel"]);
  const gitTopLevel = gitTopLevelResult.stdout.trim();
  const normalizedCwd = realComparablePath(root);
  const normalizedGitTopLevel = gitTopLevelResult.status === 0 && gitTopLevel ? realComparablePath(gitTopLevel) : "";
  const windowsNormalizationSelfCheck =
    normalizeComparablePath("C:\\portable fixture\\repository", "win32") ===
    normalizeComparablePath("c:/portable fixture/repository", "win32");
  record(
    "repository root matches git top-level",
    gitTopLevelResult.status === 0 && normalizedCwd === normalizedGitTopLevel && windowsNormalizationSelfCheck,
    { normalizedCwd, normalizedGitTopLevel, windowsNormalizationSelfCheck }
  );
  const repositoryAnchors = [
    ["package.json", "file"],
    ["apps/mobile", "directory"],
    ["supabase/migrations", "directory"],
    ["scripts/consumer-runtime-phase-2z-b1-guard.mjs", "file"],
    ["ROADMAP.md", "file"]
  ];
  const invalidRepositoryAnchors = repositoryAnchors.filter(([file, kind]) => {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) return true;
    const stat = fs.statSync(target);
    return kind === "file" ? !stat.isFile() : !stat.isDirectory();
  });
  record("repository identity anchors are present", invalidRepositoryAnchors.length === 0, {
    anchors: repositoryAnchors.map(([file]) => file),
    invalidRepositoryAnchors: invalidRepositoryAnchors.map(([file]) => file)
  });
  record("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  record("starting HEAD remains exact", git(["rev-parse", "HEAD"]).stdout.trim() === baseline);
  record("worktree is exactly the ten-file Phase 2Z-B1 candidate", unapproved.length === 0 && missingApproved.length === 0 && changed.length === approved.size, {
    changed,
    unapproved,
    missingApproved
  });
  record("staged diff remains empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");

  record("sanitized Development evidence record exists", evidenceExists, evidencePath);
  const requiredEvidenceFacts = [
    ["Development project name", /Project name: `tastkind-development`/],
    ["Development project ref", /Project ref: `msbgnnoorsoefuiwluye`/],
    ["Development region", /Region: `ap-southeast-1`/],
    ["40\/40 result", /40\/40 PASS/],
    ["controlled sessions cleanup", /controlled sessions=0/],
    ["persistent test data cleanup", /persistentTestData=false/],
    ["Local\/Remote migration parity", /Local\/Remote: 37\/37/],
    ["service role exclusion", /service_role` (?:was )?not used/],
    ["Production exclusion", /Production untouched/],
    ["RPC and table-write exclusion", /No table write[\s\S]*No RPC/],
    ["freeze verdict", /PASS_READY_FOR_GIT_FREEZE/]
  ];
  const missingEvidenceFacts = requiredEvidenceFacts.filter(([, pattern]) => !pattern.test(evidence)).map(([name]) => name);
  record("Development evidence contains all required sanitized facts", missingEvidenceFacts.length === 0, missingEvidenceFacts);
  const prohibitedEvidenceValues = [
    ["Email address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ["JWT or token-shaped value", /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/],
    ["Supabase key value", /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]+\b/],
    ["credential assignment", /(?:password|access[_ -]?token|refresh[_ -]?token|service[_ -]?role|anon[_ -]?key|publishable[_ -]?key)\s*[:=]\s*[`"'][^`"']+[`"']/i],
    ["full actor UUID", /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i]
  ];
  const exposedEvidenceValues = prohibitedEvidenceValues.filter(([, pattern]) => pattern.test(evidence)).map(([name]) => name);
  record("Development evidence contains no credential or actor identity values", exposedEvidenceValues.length === 0, exposedEvidenceValues);

  const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  record("migration count remains 37", migrations.length === 37, migrations.length);
  record("latest migration filename remains exact", migrations.at(-1) === migrationName, migrations.at(-1));
  record("latest migration SHA-256 remains exact", sha(migrationPath) === migrationSha, sha(migrationPath));
  record("all migrations remain byte-equivalent to baseline", baselineEquivalent(baselineFiles("supabase/migrations")).length === 0);
  record("package.json remains byte-equivalent to baseline", git(["diff", "--quiet", baseline, "--", "package.json"]).status === 0);
  const lockfiles = baselineFiles("").filter((file) => /(^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/.test(file));
  record("all lockfiles remain byte-equivalent to baseline", baselineEquivalent(lockfiles).length === 0, lockfiles);

  const authFiles = baselineFiles("apps/mobile/features/consumer-auth");
  const authDrift = baselineEquivalent(authFiles);
  record("Frozen Auth/Profile backend manifest is non-empty", authFiles.length > 0, authFiles.length);
  record("Frozen Auth/Profile backend files remain byte-equivalent", authDrift.length === 0, authDrift);
  const protectedRouteDrift = baselineEquivalent(protectedRoutes);
  record("Meal Write and Planned Meal routes remain byte-equivalent", protectedRouteDrift.length === 0, protectedRouteDrift);

  record("root mounts exactly one ConsumerRuntimeProvider", (layout.match(/<ConsumerRuntimeProvider>/g) ?? []).length === 1);
  record("root mounts the session navigation gate", /<ConsumerRuntimeNavigationGate>/.test(layout));
  record("login uses provider actions", /useConsumerRuntime/.test(login) && /runtime\.signIn\(/.test(login) && /runtime\.signInDemo\(/.test(login));
  record("login has no Sign Up Forgot Password or OAuth action", !/signUp|forgotPassword|passwordReset|OAuth|signInWithOAuth/.test(login));
  record("profile route consumes canonical profile and logout", /profileState\.profile/.test(me) && /runtime\.signOut\(\)/.test(me));
  record("composition reuses ConsumerAuthStateStore and existing scaffold", /ConsumerAuthStateStore/.test(composition) && /createConsumerAuthScaffold/.test(composition));
  record("Supabase composition creates one shared client identity", (composition.match(/new SupabaseConsumerClientFactory/g) ?? []).length === 1 && /authPort, profileClient: client/.test(composition));
  record("app composition is singleton across Strict Mode remounts", /let appComposition: ConsumerRuntimeCompositionResult \| null = null/.test(composition) && /getOrCreateConsumerRuntimeComposition/.test(provider));
  record("session restore is guarded by a single restorePromise", /restorePromise/.test(composition) && /if \(!this\.restorePromise\)/.test(composition));
  record("actor generation rejects stale profile responses", /generation !== this\.state\.actorGeneration/.test(composition) && /actorKey !== this\.state\.actorKey/.test(composition));
  record("Supabase branch contains no mock fallback", /flags\.authSource === "supabase-live" && flags\.profileSource !== "supabase-live"/.test(composition) && !/flags\.authSource === "supabase-live"[\s\S]*new MockConsumer/.test(composition));
  record("Demo entry is limited to mock mode", /this\.mode !== "mock"/.test(composition));

  record("approved UI/runtime has no direct Supabase SDK import", !/@supabase\/supabase-js|react-native-url-polyfill/.test(runtimeSource));
  record("approved UI/runtime has no direct RPC or DML", !/\.rpc\s*\(|\.from\s*\(/.test(runtimeSource));
  record("approved UI/runtime has no service-role reference", !/service[_-]?role|SUPABASE_SERVICE|SECRET_KEY/i.test(runtimeSource));
  record("approved UI/runtime has no raw credential logging", !/console\.(?:log|debug|info|warn|error)[\s\S]{0,120}(?:password|publishableKey|accessToken|refreshToken)/i.test(runtimeSource));
  record("no Production activation was added", !/TASTKIND_ENVIRONMENT\s*=\s*["']production|EXPO_PUBLIC_TASTKIND_ENVIRONMENT\s*=\s*["']production/.test(runtimeSource));
  record("no unapproved .env file was added", changed.every((file) => !/(^|\/)\.env(?:\.|$)/.test(file)));
  record("only Phase 2Z-B1 guard and smoke names are present", changed.every((file) => !/consumer-runtime-phase-2z-(?:guard|smoke)\.mjs$/.test(file)));

  const report = {
    phase: "Phase 2Z-B1 Auth/Profile Mobile Cutover Guard",
    status: failures.length ? "failed" : "passed",
    totalChecks: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failedChecks: failures,
    checks
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({
    phase: "Phase 2Z-B1 Auth/Profile Mobile Cutover Guard",
    status: "blocked",
    reason: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exitCode = 1;
}
