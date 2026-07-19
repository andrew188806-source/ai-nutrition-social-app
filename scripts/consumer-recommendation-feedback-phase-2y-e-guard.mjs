import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const baseline = "a663a2f04261b563d2aee42e656450c2e8cf42ca";
const migration = "supabase/migrations/20260719010000_consumer_recommendation_feedback_atomic_write.sql";
const migrationSha = "52a0d5708d6f7b32fca573750cc141342774c52467d90dc65efb650d0652af5e";
const composition = "apps/mobile/features/consumer-recommendation-feedback/consumerRecommendationFeedbackComposition.ts";
const mapper = "apps/mobile/features/consumer-recommendation-feedback/consumerRecommendationFeedbackTargetMapper.ts";
const uiModel = "apps/mobile/features/consumer-recommendation-feedback/consumerRecommendationFeedbackUiModel.ts";
const content = "apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx";
const provider = "apps/mobile/features/next-meal-prototype/canonicalNextMealPrototypeProvider.ts";
const nextTypes = "apps/mobile/features/next-meal-prototype/types.ts";
const i18n = "lib/i18n/zh-TW.ts";
const doc = "docs/consumer-runtime-phase-2y/phase-2y-e-mobile-recommendation-feedback-cutover.md";
const guardPath = "scripts/consumer-recommendation-feedback-phase-2y-e-guard.mjs";
const uiSmokePath = "scripts/consumer-recommendation-feedback-phase-2y-e-ui-contract-smoke.mjs";
const devSmokePath = "scripts/consumer-recommendation-feedback-phase-2y-e-development-mobile-smoke.mjs";
const candidates = new Set(["package.json", composition, mapper, uiModel, content, provider, nextTypes, i18n, doc, guardPath, uiSmokePath, devSmokePath]);
const frozenExact = [
  "apps/mobile/features/consumer-recommendation-feedback/adapters/disabledConsumerRecommendationFeedbackRepository.ts",
  "apps/mobile/features/consumer-recommendation-feedback/adapters/mockConsumerRecommendationFeedbackRepository.ts",
  "apps/mobile/features/consumer-recommendation-feedback/adapters/supabaseConsumerRecommendationFeedbackWriteRepository.ts",
  "apps/mobile/features/consumer-recommendation-feedback/consumerRecommendationFeedbackService.ts",
  "apps/mobile/features/consumer-recommendation-feedback/errors.ts",
  "apps/mobile/features/consumer-recommendation-feedback/factories.ts",
  "apps/mobile/features/consumer-recommendation-feedback/featureFlags.ts",
  "apps/mobile/features/consumer-recommendation-feedback/ports.ts",
  "apps/mobile/features/consumer-recommendation-feedback/supabaseRecommendationFeedbackContracts.ts",
  "apps/mobile/features/consumer-recommendation-feedback/supabaseRecommendationFeedbackMappers.ts",
  "apps/mobile/features/consumer-recommendation-feedback/types.ts",
  "apps/mobile/features/consumer-recommendation-feedback/validation.ts",
  "docs/consumer-runtime-phase-2y/phase-2y-d-a-atomic-write-preparation.md",
  "docs/consumer-runtime-phase-2y/phase-2y-d-a-security-and-validation.md",
  "docs/consumer-runtime-phase-2y/phase-2y-d-b-development-execution-plan.md",
  "docs/consumer-runtime-phase-2y/phase-2y-d-b-development-write-activation-runbook.md",
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-contract-smoke.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-a-forward-regression-smoke.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-b-guard.mjs",
  "scripts/consumer-recommendation-feedback-phase-2y-d-b-development-live-smoke.mjs",
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
function run(file, args = []) {
  return spawnSync(process.execPath, [file, ...args], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 240000,
    env: { ...process.env, TMPDIR: os.tmpdir(), TEMP: os.tmpdir(), TMP: os.tmpdir(), TASTKIND_CONSUMER_PHASE2Y_E_DEVELOPMENT_MOBILE_SMOKE: "" } });
}
function parse(stdout) { try { return JSON.parse(stdout); } catch { return null; } }

try {
  const statusResult = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const changed = statusResult.stdout.split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/"));
  const extra = changed.filter((file) => !candidates.has(file));
  const missing = [...candidates].filter((file) => !changed.includes(file));
  check("branch remains main", git(["branch", "--show-current"]).stdout.trim() === "main");
  check("Phase 2Y-D-B Frozen Commit is HEAD baseline", git(["rev-parse", "HEAD"]).stdout.trim() === baseline);
  check("Phase 2Y-D-B Frozen Commit is ancestor", git(["merge-base", "--is-ancestor", baseline, "HEAD"]).status === 0);
  check("candidate scope is exactly 12 approved files", changed.length === 12 && !extra.length && !missing.length, { changed, extra, missing });
  check("staged diff remains empty", git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  check("D-A and D-B Frozen implementation files remain byte-equivalent", git(["diff", "--quiet", baseline, "--", ...frozenExact]).status === 0);
  check("Frozen public index remains byte-equivalent", git(["diff", "--quiet", baseline, "--", "apps/mobile/features/consumer-recommendation-feedback/index.ts"]).status === 0);
  check("migration diff is empty and no migration was added", git(["diff", "--quiet", baseline, "--", "supabase/migrations"]).status === 0);
  check("package-lock diff is empty", git(["diff", "--quiet", baseline, "--", "package-lock.json"]).status === 0);
  const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  check("migration count remains 37", migrations.length === 37, migrations.length);
  check("latest migration filename remains exact", migrations.at(-1) === path.basename(migration), migrations.at(-1));
  check("latest migration SHA-256 remains exact", sha(migration) === migrationSha, sha(migration));

  const packageNow = JSON.parse(read("package.json"));
  const packageBaseline = JSON.parse(git(["show", `${baseline}:package.json`]).stdout);
  const additions = {
    "test:consumer-phase2y-e": `node ${guardPath}`,
    "test:consumer-phase2y-e-ui-smoke": `node ${uiSmokePath}`,
    "test:consumer-phase2y-e-development-mobile-smoke": `node ${devSmokePath}`
  };
  check("package adds exactly three Phase 2Y-E scripts", Object.entries(additions).every(([key, value]) => packageNow.scripts[key] === value));
  const oldScripts = { ...packageNow.scripts }; for (const key of Object.keys(additions)) delete oldScripts[key];
  check("all prior package scripts remain exact", JSON.stringify(oldScripts) === JSON.stringify(packageBaseline.scripts));
  check("dependencies and workspaces remain exact", ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "workspaces"].every((key) => JSON.stringify(packageNow[key]) === JSON.stringify(packageBaseline[key])));

  const compositionSource = read(composition);
  const mapperSource = read(mapper);
  const modelSource = read(uiModel);
  const contentSource = read(content);
  const providerSource = read(provider);
  const document = read(doc);
  check("composition exports required public entry", /export function createMobileConsumerRecommendationFeedbackComposition/.test(compositionSource));
  check("composition uses Auth and feedback public factories", /createConsumerAuthPort/.test(compositionSource) && /createConsumerRecommendationFeedbackRuntime/.test(compositionSource));
  check("composition defaults from disabled feedback flags and requires explicit Supabase", /getConsumerRecommendationFeedbackRuntimeFlags/.test(compositionSource) && /flags\.source|flags/.test(compositionSource));
  check("composition construction contains no operation call", !/\.createCurrentUser|\.recordCurrentUser|\.endCurrentUser|\bfetch\s*\(/.test(compositionSource));
  check("UI uses Mobile composition mapper and UI model only", /createMobileConsumerRecommendationFeedbackComposition/.test(contentSource) && /mapConsumerRecommendationFeedbackTarget/.test(contentSource) && /ConsumerRecommendationFeedbackUiModel/.test(contentSource));
  check("UI has no direct runtime repository Supabase RPC or DML", !/createConsumerRecommendationFeedbackRuntime|Repository\s*\(|supabase|\.rpc\s*\(|\.from\s*\(|\b(?:insert|update|delete)\s*\(/i.test(contentSource));
  check("canonical live provider alone supplies feedback targets", /dataProvenance === "live"/.test(providerSource) && /canonicalFeedbackTarget/.test(providerSource));
  check("sample presentation cannot become persisted success", /feedbackTargetUnavailable/.test(contentSource) && /canonicalFeedbackTarget/.test(contentSource));
  check("route-local fake feedback persistence is absent", !/useState[^\n]*(?:savedFeedback|dismissedFeedback|feedbackEvents)|AsyncStorage|localStorage/i.test(contentSource));

  check("target mapper accepts only canonical evidence", /identityEvidence !== "canonical"/.test(mapperSource));
  check("target mapper covers three Frozen kinds", ["recommendation", "restaurant", "menu_item"].every((kind) => mapperSource.includes(`source.kind === "${kind}"`)));
  check("target mapper rejects forbidden identity classes", ["fav-", "meal-record-", "local-meal-", "rating-", "presentation-", "display_name", "array_index"].every((item) => mapperSource.includes(item)));
  check("target mapper does not blanket-reject numeric IDs", !/\^\\d\+\$|Number\(|parseInt/.test(mapperSource));
  check("target mapper enforces exact cross-kind shape and menu parent", /exactKeys/.test(mapperSource) && /menu_item_parent_missing/.test(mapperSource));

  check("UI model has generation stale-response isolation", (modelSource.match(/generation/g) ?? []).length >= 8);
  check("UI model has duplicate pending and completed-event prevention", /identity\?\.pending/.test(modelSource) && /identity\?\.completed/.test(modelSource));
  check("UI model retains stable session and event UUID across retry", /sessionId \?\?=/.test(modelSource) && /identity \?\?= \{ eventKey/.test(modelSource));
  check("UI model protects ended sessions and repeated end", /if \(this\.ended\)/.test(modelSource) && /already_ended/.test(modelSource));
  check("UI model resets on auth identity change", /setAuthSessionIdentity[\s\S]*this\.reset\(\)/.test(modelSource));
  check("secure UUID uses crypto randomUUID with no unsafe fallback", /cryptoLike\.randomUUID/.test(compositionSource) && !/Math\.random|Date\.now\(\)/.test(compositionSource + modelSource));
  check("no client ownership fields source spoof timestamps or excluded payload", !/userId\s*:|user_id\s*:|event[^\n]*(?:sourceSurface|timestamp|feedbackNote|dismissReason|rating)/i.test(contentSource + modelSource));
  check("only actual clicked and accepted actions are wired", /"clicked"/.test(contentSource) && /"accepted"/.test(contentSource) && !/"shown"|"dismissed"|"saved"|"consumed"/.test(contentSource));
  check("new UI strings are in zh-TW i18n", ["feedbackAvailable", "feedbackTargetUnavailable", "feedbackPending", "feedbackRecorded", "feedbackFailed"].every((key) => read(i18n).includes(`${key}:`)));

  const uiSmoke = run(uiSmokePath);
  const uiReport = parse(uiSmoke.stdout);
  check("UI contract smoke passes production-backed checks", uiSmoke.status === 0 && uiReport?.status === "passed" && uiReport?.checks?.every((item) => item.pass));
  const safe = run(devSmokePath);
  const safeReport = parse(safe.stdout);
  check("Development Mobile smoke safe default is SKIPPED", safe.status === 0 && safeReport?.status === "skipped" && safeReport?.networkUsed === false && safeReport?.databaseUsed === false);
  const dry1 = run(devSmokePath, ["--dry-run"]);
  const dry2 = run(devSmokePath, ["--dry-run"]);
  const dryReport = parse(dry1.stdout);
  check("Development Mobile dry-run passes in memory", dry1.status === 0 && dryReport?.status === "passed" && dryReport?.networkUsed === false && dryReport?.databaseUsed === false);
  check("Development Mobile dry-run is deterministic", dry1.stdout === dry2.stdout);
  check("dry-run proves stale duplicate ended and cleanup protections", dryReport?.checks?.some((item) => item.name.includes("stale") && item.pass) &&
    dryReport?.checks?.some((item) => item.name.includes("duplicate tap") && item.pass) && dryReport?.checks?.some((item) => item.name.includes("ended-session") && item.pass) && dryReport?.persistentTestData === false);

  check("implementation document contains exact action mapping and supported/deferred reasons", /\| `clicked` \|/.test(document) && /\| `accepted` \|/.test(document) && /Deferred/.test(document));
  check("historical service-role disclosure is exact", /serviceRoleCredentialAccessed=false/.test(document) && /serviceRoleCredentialUsed=false/.test(document) && /serviceRoleBrowserRuntimePathUsed=false/.test(document));
  for (const file of candidates) {
    if (file === "package.json") continue;
    const value = read(file);
    check(`${file} has one EOF newline`, value.endsWith("\n") && !value.endsWith("\n\n"));
    check(`${file} has no trailing whitespace`, !/[ \t]+$/m.test(value));
  }
  const combined = [...candidates].filter((file) => file !== guardPath).map((file) => read(file)).join("\n");
  const credentialPattern = new RegExp([
    "-----BEGIN ", "[A-Z ]*", "PRIVATE KEY-----",
    "|eyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,}",
    "|(?:postgres(?:ql)?):\\/\\/[^\\s]+:[^\\s]+@"
  ].join(""));
  check("candidate has no credential-shaped content", !credentialPattern.test(combined));
  check("no Production N4 Phase 2Z or privileged runtime activity", !/\bfetch\s*\(|supabase\s+(?:db|migration|link|login)|\bpsql\b/.test(read(devSmokePath)) &&
    /productionTouched: false/.test(read(devSmokePath)) && /n4Executed: false/.test(read(devSmokePath)) && /phase2ZStarted: false/.test(read(devSmokePath)));

  console.log(JSON.stringify({ status: issues.length ? "failed" : "passed", phase: "Consumer Runtime Phase 2Y-E Guard",
    totalChecks: checks.length, passed: checks.length - issues.length, failed: issues.length,
    failedChecks: issues.map(({ name, detail }) => ({ name, ...(detail === undefined ? {} : { detail }) })),
    candidateCount: changed.length, migrationCount: migrations.length, latestMigration: migrations.at(-1), migrationSha256: sha(migration),
    uiSmokeChecks: uiReport?.totalChecks ?? 0, developmentDryRunChecks: dryReport?.checks?.length ?? 0,
    networkUsed: false, databaseUsed: false, credentialsUsed: false, developmentTouched: false, productionTouched: false,
    serviceRoleCredentialAccessed: false, serviceRoleCredentialUsed: false, serviceRoleBrowserRuntimePathUsed: false,
    n4Executed: false, phase2ZStarted: false, stagedDiffEmpty: git(["diff", "--cached", "--name-only"]).stdout.trim() === "" }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ status: "failed", phase: "Consumer Runtime Phase 2Y-E Guard", reason: error instanceof Error ? error.message : String(error),
    totalChecks: checks.length, failedChecks: issues.map(({ name }) => name), networkUsed: false, databaseUsed: false, credentialsUsed: false }, null, 2));
  process.exitCode = 1;
}
