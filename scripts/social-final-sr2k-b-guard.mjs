#!/usr/bin/env node
// SR-2K-B guard — Social MVP final closure. Static/source authority only: no network, no database,
// no credentials, no Development and no Production access. The REAL PostgreSQL apply proof is a
// separate, opt-in harness (social-final-sr2k-b-postgres-apply.mjs).
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import child from "node:child_process";
import {
  SR2KB_BASELINE, SR2KB_BASELINE_SUBJECT, SR2KB_DEMO_AUTHORITY, SR2KB_FORBIDDEN_FEATURES,
  SR2KB_FREEZE_COMMIT,
  SR2KB_FROZEN_MIGRATIONS, SR2KB_MIGRATIONS, SR2KB_NPM_COMMANDS, SR2KB_PATHS, SR2KB_PRODUCTION_PATHS,
  auditSr2kbAuthoredSources, classifySr2kbLifecycle, createSr2kbManifest
} from "./social-final-sr2k-b-successor-manifest.mjs";
import { GEO1A_PATHS } from "./geo-shared-authority-geo-1a-successor-manifest.mjs";
import { GEO1B_PATHS } from "./geo-mobile-location-geo-1b-successor-manifest.mjs";
import { GEO1CP0_PATHS } from "./geo-coordinate-source-geo-1c-p0-successor-manifest.mjs";

const root = process.cwd();
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const bytes = (f) => fs.readFileSync(path.join(root, f));
const run = (args) => {
  const result = child.spawnSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr || "git_failed");
  return (result.stdout ?? "").trim();
};
const lines = (v) => (v ? v.split(/\r?\n/).filter(Boolean) : []);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

const unstaged = lines(run(["diff", "--name-only", "--", ...SR2KB_PATHS]));
const untracked = lines(run(["ls-files", "--others", "--exclude-standard", "--", ...SR2KB_PATHS]));
const worktree = [...new Set([...unstaged, ...untracked])].sort();
const staged = lines(run(["diff", "--cached", "--name-only"]));
const head = run(["rev-parse", "HEAD"]);
const originHead = run(["rev-parse", "origin/main"]);
const counts = run(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/).map(Number);
const delta = head === SR2KB_BASELINE ? [] : lines(run(["diff", "--name-only", `${SR2KB_BASELINE}..HEAD`]));
const lifecycle = classifySr2kbLifecycle({
  head, parent: head === SR2KB_BASELINE ? null : run(["rev-parse", "HEAD^"]),
  originHead, behind: counts[0], ahead: counts[1],
  worktreePaths: worktree, stagedPaths: staged, deltaPaths: delta,
  deleted: lines(run(["diff", "--name-only", "--diff-filter=D", "--", ...SR2KB_PATHS])).length > 0
});

// Pre-existing files are scanned by the lines THIS round added; files it authors are scanned whole.
function addedLines(file) {
  const diff = child.spawnSync("git", ["-c", "core.safecrlf=false", "diff", "-U0", SR2KB_BASELINE, SR2KB_FREEZE_COMMIT, "--", file],
    { cwd: root, encoding: "utf8" });
  const body = diff.status === 0 ? (diff.stdout ?? "") : "";
  return body.split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n");
}
const NEW_PRODUCTION = SR2KB_PRODUCTION_PATHS.filter((f) =>
  f.startsWith("supabase/migrations/2026082401") || f.startsWith("supabase/migrations/2026082402")
  || f.startsWith("supabase/migrations/2026082403")
  || f.startsWith("supabase/functions/_shared/meal-buddy-push-api/")
  || f.startsWith("supabase/functions/meal-buddy-push-de") || f.startsWith("supabase/functions/meal-buddy-push-di")
  || f.startsWith("apps/mobile/features/meal-buddy-push/")
  || f === "apps/mobile/features/meal-buddy-chat/supabaseRealtime.ts"
  || f === "apps/mobile/features/meal-buddy-relationships/MealBuddyUnfriendConfirm.tsx");
const TOUCHED_PRODUCTION = SR2KB_PRODUCTION_PATHS.filter((f) => !NEW_PRODUCTION.includes(f));
const frozenBytes = (file) => {
  const shown = child.spawnSync("git", ["-c", "core.safecrlf=false", "show", `${SR2KB_FREEZE_COMMIT}:${file}`],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return shown.status === 0 ? (shown.stdout ?? "") : read(file);
};
const candidateProduction = [...NEW_PRODUCTION.map(frozenBytes), ...TOUCHED_PRODUCTION.map(addedLines)].join("\n");

const REL = "apps/mobile/features/meal-buddy-relationships/";
const CHAT = "apps/mobile/features/meal-buddy-chat/";
const PUSH = "apps/mobile/features/meal-buddy-push/";
const EDGE = "supabase/functions/_shared/";
const sources = new Map([
  ["unfriendSql", read(SR2KB_MIGRATIONS[0])],
  ["realtimeSql", read(SR2KB_MIGRATIONS[1])],
  ["pushSql", read(SR2KB_MIGRATIONS[2])],
  ["relationshipApi", read(`${EDGE}meal-buddy-relationship-api/repository.ts`)],
  ["relationshipRequest", read(`${EDGE}meal-buddy-relationship-api/request.ts`)],
  ["relationshipTypes", read(`${EDGE}meal-buddy-relationship-api/types.ts`)],
  ["chatApiTypes", read(`${EDGE}meal-buddy-chat-api/types.ts`)],
  ["chatApiRepository", read(`${EDGE}meal-buddy-chat-api/repository.ts`)],
  ["pushApiService", read(`${EDGE}meal-buddy-push-api/service.ts`)],
  ["pushApiRequest", read(`${EDGE}meal-buddy-push-api/request.ts`)],
  ["pushDispatchConfig", read("supabase/functions/meal-buddy-push-dispatch/config.ts")],
  ["pushDispatchHandler", read("supabase/functions/meal-buddy-push-dispatch/handler.ts")],
  ["pushDeviceHandler", read("supabase/functions/meal-buddy-push-device/handler.ts")],
  ["mobileRelController", read(`${REL}controller.ts`)],
  ["mobileRelRepository", read(`${REL}repository.ts`)],
  ["inbox", read(`${REL}MealBuddyRelationshipInbox.tsx`)],
  ["panel", read(`${REL}MealBuddyRelationshipPanel.tsx`)],
  ["confirm", read(`${REL}MealBuddyUnfriendConfirm.tsx`)],
  ["chatController", read(`${CHAT}controller.ts`)],
  ["chatRepository", read(`${CHAT}repository.ts`)],
  ["chatRealtime", read(`${CHAT}supabaseRealtime.ts`)],
  ["pushController", read(`${PUSH}controller.ts`)],
  ["pushTypes", read(`${PUSH}types.ts`)],
  ["pushRouting", read(`${PUSH}useMealBuddyPushRouting.ts`)],
  ["pushInstallId", read(`${PUSH}installId.ts`)],
  ["pushHook", read(`${PUSH}useMealBuddyPush.ts`)],
  ["config", read("supabase/config.toml")],
  ["home", read("apps/mobile/app/meal-buddies.tsx")],
  ["i18n", read("lib/i18n/zh-TW.ts")],
  ["authoredDelta", candidateProduction]
]);

const checks = []; const failures = [];
const check = (name, ok) => {
  checks.push(name);
  console.log(`${ok ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!ok) failures.push(name);
};

// ---- lifecycle / inventory ---------------------------------------------------------------------
check("lifecycle is exact candidate or frozen-unpushed", lifecycle.valid);
check("baseline is the pushed SR-2K-A authority",
  run(["show", "-s", "--format=%s", SR2KB_BASELINE]) === SR2KB_BASELINE_SUBJECT
  && run(["merge-base", "--is-ancestor", SR2KB_BASELINE, "HEAD"]) === "");
check("branch is main", run(["branch", "--show-current"]) === "main");
check("exact wildcard-free path inventory",
  SR2KB_PATHS.length > 0 && new Set(SR2KB_PATHS).size === SR2KB_PATHS.length
  && SR2KB_PATHS.every((f) => typeof f === "string" && !/[*?]/.test(f) && !f.endsWith("/"))
  && SR2KB_PATHS.every((f) => fs.existsSync(path.join(root, f)))
  // GEO-1A, GEO-1B and then GEO-1C-P0 sit on top of this frozen round, so the cumulative delta
  // legitimately contains their exactly enumerated path sets as well. Anything in none of the four
  // still fails.
  && lifecycle.manifest.every((f) =>
    SR2KB_PATHS.includes(f) || GEO1A_PATHS.includes(f) || GEO1B_PATHS.includes(f)
    || GEO1CP0_PATHS.includes(f)));
check("no candidate path is deleted or staged", staged.length === 0
  && lines(run(["diff", "--name-only", "--diff-filter=D", `${SR2KB_BASELINE}..HEAD`])).length === 0);

// ---- backend delta is exactly the three authorized migrations ------------------------------------
check("exactly three migrations are added",
  SR2KB_PATHS.filter((f) => f.startsWith("supabase/migrations/")).length === 3);
check("no frozen predecessor migration byte is modified",
  lines(run(["diff", "--name-only", SR2KB_BASELINE, "--", "supabase/migrations"]))
    .every((f) => SR2KB_MIGRATIONS.includes(f) || GEO1A_PATHS.includes(f) || GEO1CP0_PATHS.includes(f))
  && SR2KB_FROZEN_MIGRATIONS.every((f) =>
    lines(run(["diff", "--name-only", SR2KB_BASELINE, "--", f])).length === 0));
check("every candidate migration is transactional",
  SR2KB_MIGRATIONS.every((f) => /^begin;/m.test(read(f)) && /^commit;/m.test(read(f))));
check("the frozen ref-crypto and chat/relationship Edge entrypoints are untouched",
  ["supabase/functions/_shared/meal-buddy-relationship-ref", "supabase/functions/_shared/meal-buddy-chat-ref",
    "supabase/functions/meal-buddy-relationship", "supabase/functions/meal-buddy-chat"]
    .every((f) => lines(run(["diff", "--name-only", SR2KB_BASELINE, "--", f])).length === 0));
check("ranking, exposure, context and interest authority bytes are unchanged",
  ["supabase/functions/_shared/social-ranking", "supabase/functions/_shared/social-exposure",
    "supabase/functions/_shared/meal-buddy-context", "apps/mobile/features/social-interest-settings",
    "apps/mobile/features/meal-buddy-candidates", "apps/mobile/features/meal-buddy-card"]
    .every((f) => lines(run(["diff", "--name-only", SR2KB_BASELINE, "--", f])).length === 0));
check("no new Mobile route is introduced",
  lines(run(["diff", "--name-only", "--diff-filter=A", `${SR2KB_BASELINE}..HEAD`, "--", "apps/mobile/app"])).length === 0);

// ---- the shared production contract ---------------------------------------------------------------
const violations = auditSr2kbAuthoredSources(sources);
check("SR-2K-B production source contract has no violation", violations.length === 0);
if (violations.length) for (const violation of violations) console.log(`     violated: ${violation}`);

// ---- absence of deferred product surface (§2, §48) -------------------------------------------------
for (const [label, pattern] of SR2KB_FORBIDDEN_FEATURES) {
  check(`no ${label} in the SR-2K-B candidate`, !pattern.test(candidateProduction));
}

// ---- token and identity hygiene -------------------------------------------------------------------
check("no push token is exposed through any Social projection or Mobile surface",
  !/push_token/.test(read(`${EDGE}meal-buddy-relationship-api/repository.ts`))
  && !/push_token/.test(read(`${EDGE}meal-buddy-chat-api/repository.ts`))
  && !/pushToken/.test(sources.get("inbox")) && !/pushToken/.test(sources.get("panel")));
check("the realtime topic never appears in a relationship or candidate projection",
  !/mbrt1/.test(read(`${EDGE}meal-buddy-relationship-api/service.ts`))
  && !/mbrt1/.test(sources.get("inbox")));
check("no raw database identifier reaches a Mobile surface",
  !/senderUserId|targetUserId|pairKey|userLowId|userHighId|relationshipId:|conversationId:/.test(
    `${sources.get("inbox")}\n${sources.get("panel")}\n${sources.get("chatController")}\n${sources.get("pushController")}`));
check("no demo Meal Buddy authority reaches the real relationship or chat surfaces",
  SR2KB_DEMO_AUTHORITY.every((name) =>
    !`${sources.get("inbox")}\n${sources.get("panel")}\n${sources.get("confirm")}\n${sources.get("chatController")}`.includes(name)));

// ---- package surface -------------------------------------------------------------------------------
const packageJson = JSON.parse(read("package.json"));
const baselinePackage = JSON.parse(run(["show", `${SR2KB_BASELINE}:package.json`]));
const packageWithout = structuredClone(packageJson);
for (const key of Object.keys(SR2KB_NPM_COMMANDS)) delete packageWithout.scripts[key];
// GEO-1A registers the shared Geo authority's four command keys. Named exactly, never by pattern.
for (const key of ["test:geo-shared-authority-geo-1a", "test:geo-shared-authority-geo-1a-smoke", "test:geo-shared-authority-geo-1a-mutations", "test:geo-shared-authority-geo-1a-postgres"]) delete packageWithout.scripts[key];
// GEO-1B registers the Mobile location authority's three command keys. Named exactly.
for (const key of ["test:geo-mobile-location-geo-1b","test:geo-mobile-location-geo-1b-smoke","test:geo-mobile-location-geo-1b-mutations"]) delete packageWithout.scripts[key];
// GEO-1C-P0 registers the coordinate-source authority's four command keys. Named exactly.
for (const key of ["test:geo-coordinate-source-geo-1c-p0","test:geo-coordinate-source-geo-1c-p0-smoke","test:geo-coordinate-source-geo-1c-p0-mutations","test:geo-coordinate-source-geo-1c-p0-postgres"]) delete packageWithout.scripts[key];
check("package exposes the exact canonical SR-2K-B commands",
  Object.entries(SR2KB_NPM_COMMANDS).every(([name, command]) => packageJson.scripts[name] === command));
check("root package.json differs from the frozen predecessor only by the SR-2K-B commands",
  JSON.stringify(packageWithout) === JSON.stringify(baselinePackage));
const mobilePackage = JSON.parse(run(["show", `${SR2KB_FREEZE_COMMIT}:apps/mobile/package.json`]));
const baselineMobile = JSON.parse(run(["show", `${SR2KB_BASELINE}:apps/mobile/package.json`]));
const mobileWithout = structuredClone(mobilePackage);
delete mobileWithout.dependencies["expo-notifications"];
check("the ONLY new Mobile dependency is expo-notifications",
  typeof mobilePackage.dependencies["expo-notifications"] === "string"
  && JSON.stringify(mobileWithout) === JSON.stringify(baselineMobile));

// ---- predecessor amendments are validation-only ------------------------------------------------------
const amended = SR2KB_PATHS.filter((f) => f.startsWith("scripts/") && !f.includes("sr2k-b"));
check("every predecessor amendment is a validation script, never production",
  amended.length > 0 && amended.every((f) => f.startsWith("scripts/")));
check("no predecessor assertion is removed by the amendment",
  amended.every((f) => {
    const now = (read(f).match(/check\(|rule\(|requireInvariant\(/g) ?? []).length;
    const before = ((run(["show", `${SR2KB_BASELINE}:${f}`]) ?? "").match(/check\(|rule\(|requireInvariant\(/g) ?? []).length;
    return now >= before;
  }));
// Only the guards that actually compare package.json against a frozen baseline need the strip
// list; a manifest, a smoke or a mutation suite has nothing to strip.
check("every package-pinning predecessor guard learns the exact new command keys",
  amended.filter((f) => /packageWithout/.test(read(f))).length >= 14
  && amended.filter((f) => /packageWithout/.test(read(f))).every((f) =>
    Object.keys(SR2KB_NPM_COMMANDS).every((key) => read(f).includes(key))));

// ---- byte hygiene ---------------------------------------------------------------------------------
const HOME = "apps/mobile/app/meal-buddies.tsx";
check("authored candidate files carry no CRLF pair and no BOM",
  [...NEW_PRODUCTION, ...SR2KB_PATHS.filter((f) => f.includes("sr2k-b"))].every((f) => {
    const b = bytes(f);
    return !b.includes(Buffer.from("\r\n")) && !(b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF);
  }));
check("the pre-existing home screen keeps its own byte conventions",
  (() => {
    const blob = child.spawnSync("git", ["-c", "core.safecrlf=false", "show", `${SR2KB_BASELINE}:${HOME}`],
      { cwd: root, encoding: "buffer" }).stdout;
    const disk = bytes(HOME);
    const bom = (b) => b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF;
    const crlf = (b) => b.includes(Buffer.from("\r\n"));
    return bom(disk) === bom(blob) && bom(disk) && crlf(disk) === crlf(blob) && !crlf(disk);
  })());
check("all candidate bytes are UTF-8 text without NUL",
  SR2KB_PATHS.every((f) => !bytes(f).includes(0) && !read(f).includes(String.fromCharCode(0xFFFD))));
check("no candidate file carries a credential-shaped secret",
  !SR2KB_PATHS.filter((f) => f !== "package-lock.json").map(read).some((t) =>
    /(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{10,}|sbp_[A-Za-z0-9]{20,})/.test(t)));
check("no Development or Production project reference is hard-coded in production bytes",
  !SR2KB_PRODUCTION_PATHS.filter((f) => f !== "supabase/config.toml").map(read)
    .some((t) => /msbgnnoorsoefuiwluye|\bprod(uction)?[-_]?(ref|project|url)\b/i.test(t)));

const manifest = createSr2kbManifest((f) => bytes(f));
check("canonical raw-byte manifest covers the exact sorted path set",
  manifest.entries.length === SR2KB_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === SR2KB_PATHS[index] && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log(JSON.stringify({
  suite: "social-final-sr2k-b-guard",
  lifecycle: lifecycle.phase,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  canonicalManifestSha256: manifest.aggregateSha256,
  migrationSha256: SR2KB_MIGRATIONS.map((f) => ({ path: f, sha256: sha(bytes(f)) })),
  networkUsed: false, databaseUsed: false, credentialsUsed: false,
  developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
