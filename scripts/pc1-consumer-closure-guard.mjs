#!/usr/bin/env node
// PC-1 closure guard. Fails closed unless the tree is EXACTLY the recorded PC-1 successor of the GQA-6
// closure commit: exact product bytes, no unexpected changed path, no migration / Edge Function /
// lockfile / package change, no PC-2 or analytics path, the frozen SR-2G-E source-card boundary intact,
// the PC-1 contracts present, and — for the PC-1 manifest files only — no secret and clean encoding.
// Never reads .env files and never prints file contents.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  PC1_PREDECESSOR,
  PC1_PRODUCT_PATHS,
  PC1_RECOGNITION_PATHS,
  PC1_VALIDATION_PATHS,
  collectPc1ChangedPaths,
  collectPc1Evidence,
  matchesExactPc1
} from "./pc1-consumer-closure-manifest.mjs";

// Historical isolated fixtures may omit PC-2. Missing module preserves only the original branch.
const { isExactPc2, pc2AuthorizedPaths, PC2_ALL_PATHS } = await import("./pc2-consumer-onboarding-manifest.mjs").catch(error => {
  if (error.code === "ERR_MODULE_NOT_FOUND" && error.message.includes("pc2-consumer-onboarding-manifest.mjs")) return { isExactPc2: () => false, pc2PredecessorEvidence: () => null, PC2_ALL_PATHS: [], PC2_PRODUCT_PATHS: [], PC2_MIGRATIONS_PATHS: [] };
  throw error;
});
const root = process.cwd();
const exactPc2 = isExactPc2(root);
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) });
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

// ---- exactness
const evidence = collectPc1Evidence(root);
check("01 the GQA-6 closure commit is the PC-1 predecessor in history", evidence.predecessorInHistory === true, PC1_PREDECESSOR);
check("02 the product delta is exactly the recorded PC-1 set with exactly the recorded bytes", matchesExactPc1(evidence),
  { recorded: PC1_PRODUCT_PATHS.length, delta: evidence.productDelta.length,
    extra: evidence.productDelta.filter((f) => !PC1_PRODUCT_PATHS.includes(f)),
    missing: PC1_PRODUCT_PATHS.filter((f) => !evidence.productDelta.includes(f)) });

const changed = collectPc1ChangedPaths(root);
const allowed = new Set([...PC1_PRODUCT_PATHS, ...PC1_VALIDATION_PATHS, ...PC1_RECOGNITION_PATHS, ...(exactPc2 ? pc2AuthorizedPaths() : [])]);
check("03 no changed path outside the PC-1 manifest (product + validation + recognized predecessor guards)",
  changed.every((f) => allowed.has(f)), changed.filter((f) => !allowed.has(f)));
check("04 every PC-1 validation file is present", PC1_VALIDATION_PATHS.every((f) => fs.existsSync(path.join(root, f))),
  PC1_VALIDATION_PATHS.filter((f) => !fs.existsSync(path.join(root, f))));

// ---- forbidden surfaces
check("05 no migration and no Supabase Function changed",
  exactPc2 || !changed.some((f) => f.startsWith("supabase/migrations/") || f.startsWith("supabase/functions/")), changed.filter((f) => f.startsWith("supabase/")));
check("06 no lockfile or package manifest changed",
  !changed.some((f) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|package\.json)$/.test(f)), changed.filter((f) => /package|lock/.test(f)));
check("07 no PC-2 onboarding, analytics, Restaurant or Admin path changed",
  exactPc2 || !changed.some((f) => f.startsWith("apps/restaurant-web/") || f.startsWith("apps/admin-web/")
    || f === "apps/mobile/app/login.tsx" || f.startsWith("apps/mobile/features/consumer-auth/")
    || f === "lib/i18n/zh-TW.ts" || /analytics/i.test(f)), changed);
check("08 the frozen SR-2G-E source-card adapter and port are untouched",
  git("diff", "--name-only", PC1_PREDECESSOR, "--",
    "apps/mobile/features/meal-buddy-candidates/adapters/supabaseMealBuddySourceCardRepository.ts",
    "apps/mobile/features/meal-buddy-candidates/ports.ts") === "");
check("09 no application-wide Supabase client consolidation",
  exactPc2 || !changed.some((f) => /consumer-auth\/(supabaseSdkLoader|supabaseConsumerClientFactory)\.ts$|consumer-runtime\/consumerRuntimeComposition\.ts$/.test(f)));

// ---- PC-1 contracts
const relTypes = read("apps/mobile/features/meal-buddy-relationships/types.ts");
const relRepo = read("apps/mobile/features/meal-buddy-relationships/repository.ts");
const relController = read("apps/mobile/features/meal-buddy-relationships/controller.ts");
const chatRepo = read("apps/mobile/features/meal-buddy-chat/repository.ts");
const chatController = read("apps/mobile/features/meal-buddy-chat/controller.ts");
const chatScreen = read("apps/mobile/features/meal-buddy-chat/MealBuddyChatScreen.tsx");
const quota = read("apps/mobile/features/meal-buddy-card-create/ownCardQuota.ts");
const screen = read("apps/mobile/app/meal-buddies.tsx");
const presenter = read("apps/mobile/features/next-meal-prototype/nextMealPrototypePresenter.ts");
const content = read("apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx");
check("10 A1: one named 15000 ms relationship bound, raced around the whole call and passed to the SDK",
  /MEAL_BUDDY_RELATIONSHIP_REQUEST_TIMEOUT_MS = 15_000;/.test(relTypes)
  && /this\.timeoutPolicy\.schedule\(\(\) => finish\(failure\("request_timeout"\)\), this\.timeoutPolicy\.timeoutMs\)/.test(relRepo)
  && /\{ body: request, timeout: this\.timeoutPolicy\.timeoutMs \}/.test(relRepo));
check("11 A1: uncertain results reconcile once and end in canonical, retryable or unknown_server_state",
  /const uncertain = UNCERTAIN_MEAL_BUDDY_RELATIONSHIP_ERRORS\.has\(errorCode\);/.test(relController)
  && /syncPhase: uncertain \? "unknown_server_state" : "stable"/.test(relController)
  && /this\.state\.syncPhase !== "stable"/.test(relController)
  && /"network_error", "server_unavailable", "invalid_server_response", "request_timeout"/.test(relTypes));
check("12 A2: send completion is session-scoped and realtime reconciliation defers during a send",
  /const session = this\.captureSession\(\);/.test(chatController)
  && !/private async dispatchSend[\s\S]{0,200}this\.captureRequest\(\)/.test(chatController)
  && /if \(this\.sendInFlight\) \{ this\.reconcileDeferred = true; return false; \}/.test(chatController)
  && /if \(this\.reconciling\) \{ this\.reconcileDeferred = true; return false; \}/.test(chatController)
  && /MEAL_BUDDY_CHAT_REQUEST_TIMEOUT_MS = 15_000;/.test(chatRepo)
  && /\{ body: request, timeout: this\.timeoutPolicy\.timeoutMs \}/.test(chatRepo));
check("13 A2: the composer clears on admission and never re-fills from a failure",
  /isSubmittableMealBuddyChatBody\(body\)\) \{\s*setDraft\(""\);\s*\}\s*void controller\.send\(body\);/.test(chatScreen)
  && !/\.then\(\(sent\) => \{ if \(sent\) setDraft/.test(chatScreen));
check("14 B1: canonical quota reader validates policyVersion and is bounded; live screen fails closed on it",
  /value\.policyVersion !== MEAL_BUDDY_CARD_WRITE_POLICY_VERSION/.test(quota) && /MEAL_BUDDY_OWN_CARD_QUOTA_TIMEOUT_MS = 15_000;/.test(quota)
  && /cardUsage=\{isRealCandidateMode \? canonicalCardUsage : cardUsage\}/.test(screen)
  && /\{isRealCandidateMode \? null : <DemoModeToggle/.test(screen)
  && (screen.match(/if \(!cardUsage\) \{/g) ?? []).length === 2);
check("15 B2: one pure location formatter used by both the list and the detail line",
  /export function formatNextMealLocationLine\(/.test(presenter)
  && /formatNextMealLocationLine\(candidate\), candidate\.calorieLabel/.test(content)
  && /formatNextMealLocationLine\(selectedCandidate\)/.test(content));

// ---- secret + encoding (PC-1 manifest files only; never .env, never printed)
const manifestFiles = [...PC1_PRODUCT_PATHS, ...PC1_VALIDATION_PATHS, ...PC1_RECOGNITION_PATHS].filter((f) => fs.existsSync(path.join(root, f)));
check("16 the scanned set is exactly the PC-1 manifest and contains no .env file",
  manifestFiles.length === PC1_PRODUCT_PATHS.length + PC1_VALIDATION_PATHS.length + PC1_RECOGNITION_PATHS.length
  && !manifestFiles.some((f) => /(^|\/)\.env/.test(f)));
const SECRET_PATTERNS = [
  ["jwt", /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ["supabase secret key", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["supabase publishable key literal", /sb_publishable_[A-Za-z0-9_-]{10,}/],
  ["service role assignment", /service_role[_-]?key\s*[:=]\s*["'][^"']{10,}/i],
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["database url with credentials", /postgres(ql)?:\/\/[^\s:@/]+:[^\s@/]+@/i],
  ["access token literal", /sbp_[A-Za-z0-9]{20,}/]
];
const secretHits = [];
for (const f of manifestFiles) {
  const text = read(f);
  for (const [label, pattern] of SECRET_PATTERNS) if (pattern.test(text)) secretHits.push(`${f}: ${label}`);
}
check("17 no secret material in the PC-1 manifest files (labels only reported)", secretHits.length === 0, secretHits);
// A BOM is never introduced by PC-1. The single exception is an INHERITED one: a file whose predecessor
// blob already starts with a BOM must keep it (frozen SR-2G-E2 check 75a: "the BOM must survive untouched").
const hasBom = (bytes) => bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
const predecessorHasBom = (file) => {
  const r = spawnSync("git", ["show", `${PC1_PREDECESSOR}:${file}`], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  return r.status === 0 && hasBom(r.stdout);
};
const encodingIssues = [];
for (const f of manifestFiles) {
  const bytes = fs.readFileSync(path.join(root, f));
  if (hasBom(bytes) && !predecessorHasBom(f)) encodingIssues.push(`${f}: BOM introduced`);
  if (!hasBom(bytes) && predecessorHasBom(f)) encodingIssues.push(`${f}: inherited BOM removed`);
  if (bytes.includes(0x0d)) encodingIssues.push(`${f}: CR`);
  try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { encodingIssues.push(`${f}: not UTF-8`); }
}
check("18 every PC-1 manifest file is UTF-8 and LF-only; no BOM is introduced and an inherited BOM is preserved",
  encodingIssues.length === 0, encodingIssues);

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : `\n     detail: ${JSON.stringify(c.detail ?? null).slice(0, 600)}`}`);
console.log(JSON.stringify({ suite: "pc1-consumer-closure-guard", total: checks.length, failed: failed.length,
  failures: failed.map((c) => c.name), networkUsed: false, databaseUsed: false }));
process.exitCode = failed.length ? 1 : 0;
