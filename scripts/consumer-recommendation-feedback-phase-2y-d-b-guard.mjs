import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const baseline = "92c46b2254cff88a76c34f8cca7c6023cfeb1393";
const migration = "supabase/migrations/20260719010000_consumer_recommendation_feedback_atomic_write.sql";
const migrationSha = "52a0d5708d6f7b32fca573750cc141342774c52467d90dc65efb650d0652af5e";
const runnerPath = "scripts/consumer-recommendation-feedback-phase-2y-d-b-development-live-smoke.mjs";
const guardPath = "scripts/consumer-recommendation-feedback-phase-2y-d-b-guard.mjs";
const planPath = "docs/consumer-runtime-phase-2y/phase-2y-d-b-development-execution-plan.md";
const candidates = new Set(["package.json", planPath, runnerPath, guardPath]);
const frozenPaths = [
  "apps/mobile/features/consumer-recommendation-feedback",
  "docs/consumer-runtime-phase-2y/phase-2y-a-discovery-report.md",
  "docs/consumer-runtime-phase-2y/phase-2y-a-runtime-contract.md",
  "docs/consumer-runtime-phase-2y/phase-2y-a-security-and-target-identity.md",
  "docs/consumer-runtime-phase-2y/phase-2y-b-local-disabled-mock-architecture.md",
  "docs/consumer-runtime-phase-2y/phase-2y-b-validation-plan.md",
  "docs/consumer-runtime-phase-2y/phase-2y-d-a-atomic-write-preparation.md",
  "docs/consumer-runtime-phase-2y/phase-2y-d-a-security-and-validation.md",
  "docs/consumer-runtime-phase-2y/phase-2y-d-b-development-write-activation-runbook.md",
  "scripts/consumer-recommendation-feedback-phase-2y-a-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-b-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-b-contract-smoke.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-contract-smoke.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-forward-regression-smoke.mjs",
  migration
];
const checks = [];
const issues = [];

function check(name, condition, detail = undefined) {
  const item = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(item); if (!condition) issues.push(item);
}
function git(args) { return spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }); }
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function sha(file) { return createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"); }
function run(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 240000,
    env: { ...process.env, TMPDIR: os.tmpdir(), TEMP: os.tmpdir(), TMP: os.tmpdir(), TASTKIND_CONSUMER_PHASE2Y_DB_DEVELOPMENT_LIVE_SMOKE: "" }
  });
}
function parseFinalJson(stdout) {
  const positions = [...stdout.matchAll(/(?:^|\n)(\{\n  "status")/g)].map((match) => match.index + (match[0].startsWith("\n") ? 1 : 0));
  for (const at of positions.reverse()) { try { return JSON.parse(stdout.slice(at)); } catch { /* try earlier */ } }
  return null;
}

try {
  const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const changed = status.stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/"));
  const extra = changed.filter((file) => !candidates.has(file));
  const missing = [...candidates].filter((file) => !changed.includes(file));
  check("branch is main", git(["branch", "--show-current"]).stdout.trim() === "main");
  check("baseline HEAD is exact", git(["rev-parse", "HEAD"]).stdout.trim() === baseline);
  check("baseline is an ancestor of HEAD", git(["merge-base", "--is-ancestor", baseline, "HEAD"]).status === 0);
  check("candidate inventory is exactly four files", changed.length === 4 && extra.length === 0 && missing.length === 0, { changed, extra, missing });
  check("staged diff is empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  check("Frozen Phase 2Y-A/B/D-A files are byte-equivalent to baseline", git(["diff", "--quiet", baseline, "--", ...frozenPaths]).status === 0);
  check("Production TypeScript runtime diff is empty", git(["diff", "--quiet", baseline, "--", "apps/mobile", "apps/admin-web", "apps/restaurant-web", "packages"]).status === 0);
  check("migration diff is empty", git(["diff", "--quiet", baseline, "--", "supabase/migrations"]).status === 0);
  check("package-lock diff is empty", git(["diff", "--quiet", baseline, "--", "package-lock.json"]).status === 0);

  const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  check("migration count is 37", migrations.length === 37, migrations.length);
  check("latest migration filename is exact", migrations.at(-1) === path.basename(migration), migrations.at(-1));
  check("latest migration SHA-256 is exact", sha(migration) === migrationSha, sha(migration));

  const currentPackage = JSON.parse(read("package.json"));
  const baselinePackage = JSON.parse(git(["show", `${baseline}:package.json`]).stdout);
  const additions = {
    "test:consumer-phase2y-d-b": `node ${guardPath}`,
    "test:consumer-phase2y-d-b-live-smoke": `node ${runnerPath}`
  };
  check("package adds the two exact D-B script keys", Object.entries(additions).every(([key, value]) => currentPackage.scripts[key] === value));
  const scriptsWithoutAdditions = { ...currentPackage.scripts };
  for (const key of Object.keys(additions)) delete scriptsWithoutAdditions[key];
  check("package changes no other script", JSON.stringify(scriptsWithoutAdditions) === JSON.stringify(baselinePackage.scripts));
  check("package dependencies and workspaces are unchanged", ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "workspaces"]
    .every((key) => JSON.stringify(currentPackage[key]) === JSON.stringify(baselinePackage[key])));

  const runner = read(runnerPath);
  const plan = read(planPath);
  check("live runner uses createConsumerAuthPort", /authFactories\.createConsumerAuthPort/.test(runner));
  check("live runner uses createConsumerRecommendationFeedbackRuntime", /feedback\.createConsumerRecommendationFeedbackRuntime/.test(runner));
  check("live runner selects explicit Supabase source", /flags: \{ source: "supabase", issues: \[\] \}/.test(runner));
  check("runner does not directly construct repository or service", !/new\s+(?:Supabase|Mock|Disabled)?ConsumerRecommendationFeedback(?:Write)?Repository|new\s+ConsumerRecommendationFeedbackService/.test(runner));
  check("runner does not read dotenv files", !/\.env\.local|readFileSync\([^)]*\.env|dotenv/i.test(runner));
  check("runner has no direct REST fetch or migration command", !/\bfetch\s*\(|supabase\s+(?:db|migration|link|login)|\bpsql\b/i.test(runner));
  check("safe default precedes live execution", /process\.env\[liveOptInKey\] !== "true"/.test(runner) && /report\("skipped"/.test(runner));
  check("remote state markers fail closed", ["projectIdentityExact", "productionFalse", "migrationLedgerExact", "migrationChecksumExact", "rpcSetExact",
    "functionOwnerExact", "securityDefinerExact", "fixedSearchPathExact", "publicExecuteDenied", "anonExecuteDenied",
    "authenticatedExecuteOnly", "directTableDmlDenied", "rlsEnabled", "catalogRelationshipsExact"].every((word) => runner.includes(`"${word}"`)));
  check("operator capability is verified before lifecycle writes", runner.indexOf("await operator.verify()") < runner.indexOf("await lifecycle("));
  check("controlled lifecycle covers Frozen statuses", ["created", "already_created", "create_failed", "recorded", "already_recorded", "idempotency_conflict",
    "invalid_action", "invalid_target", "write_failed", "event_key_invalid", "ended", "already_ended", "session_not_found"].every((word) => runner.includes(`"${word}"`)));
  check("actor isolation and session-owned source are verified", /actor_isolation_event/.test(runner) && /actor_isolation_end/.test(runner) && /source_surface is derived from owned session/.test(runner));
  check("server timestamps action semantics and ownership input are verified", /server timestamps and action-specific/.test(runner) && /no userId or user_id client input/.test(runner));

  const deletes = [...runner.matchAll(/text: `delete from public\.(recommendation_(?:feedback|sessions))[\s\S]*?`/g)].map((match) => match[0]);
  check("cleanup contains exactly two parameterized deletes", deletes.length === 2);
  check("feedback cleanup uses exact actor session event predicates", deletes.some((sql) => /recommendation_feedback[\s\S]*user_id = any\(\$1::uuid\[\]\)[\s\S]*recommendation_session_id = any\(\$2::uuid\[\]\)[\s\S]*event_idempotency_key = any\(\$3::text\[\]\)/.test(sql)));
  check("session cleanup uses exact actor and session predicates", deletes.some((sql) => /recommendation_sessions[\s\S]*user_id = any\(\$1::uuid\[\]\)[\s\S]*id = any\(\$2::uuid\[\]\)/.test(sql)));
  check("cleanup has no LIKE fuzzy interpolation or unbounded delete", deletes.every((sql) => /where/i.test(sql) && !/\blike\b|\$\{/i.test(sql)));
  check("finally contract covers cleanup zero rows aggregates sign-out close", /finally \{[\s\S]*operator\.cleanup[\s\S]*operator\.controlled[\s\S]*operator\.aggregate[\s\S]*signOut[\s\S]*operator\.close/.test(runner));
  check("injected-failure dry-run evidence exists", /dryScenario\(true\)/.test(runner) && /injected failure proves exact finally cleanup/.test(runner));
  check("temporary compilation artifacts are removed", /fs\.rmSync\(tempRoot, \{ recursive: true, force: true \}\)/.test(runner));
  check("no browser privileged client path", !/service[_-]?role[^\n]*(?:key|client|browser)|(?:key|client|browser)[^\n]*service[_-]?role/i.test(runner));
  check("sanitized output contract is explicit", /credentialsPrinted: false/.test(runner) && /rowContentPrinted: false/.test(runner) && /identifiersPrinted: false/.test(runner));
  check("Production N4 Phase 2Z remain inactive", /productionTouched: false/.test(runner) && /n4Executed: false/.test(runner) && /phase2ZStarted: false/.test(runner));

  check("runbook defines ordered Gates A through F", ["Gate A", "Gate B", "Gate C", "Gate D", "Gate E", "Gate F"].every((gate) => plan.includes(gate)));
  check("runbook pins Development identity", /tastkind-development/.test(plan) && /msbgnnoorsoefuiwluye/.test(plan) && /ap-southeast-1/.test(plan) && /Production=false/.test(plan));
  check("runbook pins 36-to-37 single migration deployment", /exactly `36`/.test(plan) && /exactly `37`/.test(plan) && /Deploy only `20260719010000/.test(plan));
  check("runbook pins checksum and post-deploy RPC ACL evidence", plan.includes(migrationSha) && /PUBLIC.*anon/.test(plan) && /SECURITY DEFINER/.test(plan));
  check("runbook requires zero pre-count and restored aggregates", /pre-count must be `0`/.test(plan) && /aggregate counts are restored/.test(plan));
  check("runbook restricts privacy output", /must not contain emails, passwords, JWTs, tokens/.test(plan) && /UUIDs/.test(plan));

  const safe = run(runnerPath);
  const safeJson = parseFinalJson(safe.stdout);
  check("live runner safe-default is SKIPPED exit 0", safe.status === 0 && safeJson?.status === "skipped" && safeJson?.networkUsed === false && safeJson?.databaseUsed === false);
  const dry1 = run(runnerPath, ["--dry-run"]);
  const dry2 = run(runnerPath, ["--dry-run"]);
  const dryJson = parseFinalJson(dry1.stdout);
  check("dry-run passes entirely locally", dry1.status === 0 && dryJson?.status === "passed" && dryJson?.networkUsed === false && dryJson?.databaseUsed === false && dryJson?.credentialsUsed === false);
  check("dry-run proves cleanup and persistentTestData=false", dryJson?.cleanupVerified === true && dryJson?.aggregateRestored === true && dryJson?.sessionsCleared === true && dryJson?.operatorClosed === true && dryJson?.persistentTestData === false);
  check("dry-run repeat output is deterministic", dry1.stdout === dry2.stdout);

  const daGuardSource = read("scripts/consumer-recommendation-feedback-phase-2y-d-a-guard.mjs");
  check("D-A final guard remains frozen with 202-check committed-state contract",
    git(["diff", "--quiet", baseline, "--", "scripts/consumer-recommendation-feedback-phase-2y-d-a-guard.mjs"]).status === 0 &&
    /totalChecks: passed \+ failed/.test(daGuardSource) && /status: failed === 0 \? "passed" : "failed"/.test(daGuardSource));
  const daSmoke = run("scripts/consumer-recommendation-feedback-phase-2y-d-a-contract-smoke.mjs");
  const daSmokeJson = parseFinalJson(daSmoke.stdout);
  check("D-A contract smoke remains 81/81 PASS", daSmoke.status === 0 && daSmokeJson?.status === "passed" && daSmokeJson?.totalChecks === 81 && daSmokeJson?.checks?.every((item) => item.pass));
  const forward = run("scripts/consumer-recommendation-feedback-phase-2y-d-a-forward-regression-smoke.mjs");
  const forwardJson = parseFinalJson(forward.stdout);
  check("D-A forward regression remains 33/33 PASS", forward.status === 0 && forwardJson?.status === "passed" && forwardJson?.totalChecks === 33 && forwardJson?.checks?.every((item) => item.pass));

  for (const file of [planPath, runnerPath, guardPath]) {
    const content = read(file);
    check(`${file} has one EOF newline`, content.endsWith("\n") && !content.endsWith("\n\n"));
    check(`${file} has no trailing whitespace`, !/[ \t]+$/m.test(content));
  }
  const artifactPattern = /(^|\/)(?:\.env(?:\.|$)|node_modules|\.next|dist|build|coverage|cache|tmp)(?:\/|$)|\.tsbuildinfo$|\.log$/i;
  check("candidate has no generated temp cache log or environment artifact", changed.every((file) => !artifactPattern.test(file)));
  const candidateText = [...candidates].map((file) => read(file)).join("\n");
  const credentialShape = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:postgres(?:ql)?|mysql):\/\/[^\s]+:[^\s]+@|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/;
  check("candidate contains no credential-shaped content", !credentialShape.test(candidateText));
  check("candidate contains no local Supabase network database migration operation", !/\bfetch\s*\(|supabase\s+(?:db|migration|link|login)|\bpsql\b/.test(runner));

  console.log(JSON.stringify({
    status: issues.length ? "failed" : "passed", phase: "Consumer Runtime Phase 2Y-D-B0 Development Execution Preparation Guard",
    totalChecks: checks.length, passed: checks.length - issues.length, failed: issues.length,
    failedChecks: issues.map(({ name, detail }) => ({ name, ...(detail === undefined ? {} : { detail }) })),
    migrationCount: migrations.length, latestMigration: migrations.at(-1), migrationSha256: sha(migration),
    safeDefault: safeJson?.status ?? null, dryRunChecks: dryJson?.checks?.length ?? 0,
    networkUsed: false, databaseUsed: false, credentialsUsed: false, migrationExecuted: false,
    developmentTouched: false, productionTouched: false, serviceRoleUsed: false, n4Executed: false,
    phase2ZStarted: false, stagedDiffEmpty: git(["diff", "--cached", "--name-only"]).stdout.trim() === ""
  }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ status: "failed", phase: "Consumer Runtime Phase 2Y-D-B0 Development Execution Preparation Guard",
    reason: error instanceof Error ? error.message : String(error), totalChecks: checks.length,
    failedChecks: issues.map(({ name, detail }) => ({ name, ...(detail === undefined ? {} : { detail }) })),
    networkUsed: false, databaseUsed: false, credentialsUsed: false }, null, 2));
  process.exitCode = 1;
}
