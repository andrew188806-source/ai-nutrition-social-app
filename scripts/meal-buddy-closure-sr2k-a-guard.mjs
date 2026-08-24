#!/usr/bin/env node
// SR-2K-A guard — Mobile Meal Buddy closure. Static/source authority only: no network, no database,
// no credentials, no Development and no Production access.
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import child from "node:child_process";
import {
  SR2KA_BASELINE, SR2KA_BASELINE_SUBJECT, SR2KA_DEMO_AUTHORITY, SR2KA_FORBIDDEN_FEATURES,
  SR2KA_FROZEN_MIGRATION, SR2KA_FROZEN_MIGRATION_SHA256, SR2KA_NEW_PRODUCTION_PATHS,
  SR2KA_NPM_COMMANDS, SR2KA_PATHS, SR2KA_PRODUCTION_PATHS, SR2KA_REF_FAMILIES,
  auditSr2kaAuthoredSources, classifySr2kaLifecycle, createSr2kaManifest
} from "./meal-buddy-closure-sr2k-a-successor-manifest.mjs";

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

const unstaged = lines(run(["diff", "--name-only", "--", ...SR2KA_PATHS]));
const untracked = lines(run(["ls-files", "--others", "--exclude-standard", "--", ...SR2KA_PATHS]));
const worktree = [...new Set([...unstaged, ...untracked])].sort();
const staged = lines(run(["diff", "--cached", "--name-only"]));
const head = run(["rev-parse", "HEAD"]);
const originHead = run(["rev-parse", "origin/main"]);
const counts = run(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/).map(Number);
const delta = head === SR2KA_BASELINE ? [] : lines(run(["diff", "--name-only", `${SR2KA_BASELINE}..HEAD`]));
const lifecycle = classifySr2kaLifecycle({
  head, parent: head === SR2KA_BASELINE ? null : run(["rev-parse", "HEAD^"]),
  originHead, behind: counts[0], ahead: counts[1],
  worktreePaths: worktree, stagedPaths: staged, deltaPaths: delta,
  deleted: lines(run(["diff", "--name-only", "--diff-filter=D", "--", ...SR2KA_PATHS])).length > 0
});

// Pre-existing files are scanned by the lines THIS round added; files the round authors are scanned
// whole. Legacy demo bytes that already lived in meal-buddies.tsx or the i18n bundle therefore
// cannot raise a false positive against an absence rule.
// SR-2K-A's own frozen commit. "Did SR-2K-A introduce this?" and "did SR-2K-A leave this frozen?"
// are both answered against THESE bytes. A successor legitimately changes files SR-2K-A left alone,
// and that is the successor's business, not a regression in this round.
const SR2KA_FROZEN_COMMIT = "8a1da28732dcd88efb87f0c5543fc76fb66bb708";
const frozenExists = child.spawnSync("git", ["cat-file", "-e", `${SR2KA_FROZEN_COMMIT}^{commit}`], { cwd: root }).status === 0;
const selfRange = frozenExists ? [SR2KA_BASELINE, SR2KA_FROZEN_COMMIT] : [SR2KA_BASELINE];
const readSelf = (f) => {
  if (!frozenExists) return read(f);
  const shown = child.spawnSync("git", ["-c", "core.safecrlf=false", "show", `${SR2KA_FROZEN_COMMIT}:${f}`],
    { cwd: root, encoding: "utf8" });
  return shown.status === 0 ? (shown.stdout ?? "") : read(f);
};
function addedLines(file) {
  const diff = child.spawnSync("git", ["-c", "core.safecrlf=false", "diff", "-U0", ...selfRange, "--", file],
    { cwd: root, encoding: "utf8" });
  const body = diff.status === 0 ? (diff.stdout ?? "") : "";
  return body.split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}
const TOUCHED_PRODUCTION_PATHS = SR2KA_PRODUCTION_PATHS.filter((f) => !SR2KA_NEW_PRODUCTION_PATHS.includes(f));
const candidateProduction = [
  ...SR2KA_NEW_PRODUCTION_PATHS.map(readSelf),
  ...TOUCHED_PRODUCTION_PATHS.map(addedLines)
].join("\n");

const REL = "apps/mobile/features/meal-buddy-relationships";
const sources = new Map([
  ["refBoundary", read(`${REL}/refBoundary.ts`)],
  ["inbox", read(`${REL}/MealBuddyRelationshipInbox.tsx`)],
  ["panel", read(`${REL}/MealBuddyRelationshipPanel.tsx`)],
  ["hook", read(`${REL}/useMealBuddyRelationships.ts`)],
  ["controller", read(`${REL}/controller.ts`)],
  ["repository", read(`${REL}/repository.ts`)],
  ["profileRoute", read("apps/mobile/app/meal-buddy-candidate-profile/[candidateRef].tsx")],
  ["chatRoute", read("apps/mobile/app/meal-buddy-chat/[relationshipRef].tsx")],
  ["chatScreen", read("apps/mobile/features/meal-buddy-chat/MealBuddyChatScreen.tsx")],
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
check("baseline is the pushed SR-2J-B authority",
  run(["show", "-s", "--format=%s", SR2KA_BASELINE]) === SR2KA_BASELINE_SUBJECT
  && run(["merge-base", "--is-ancestor", SR2KA_BASELINE, "HEAD"]) === "");
check("branch is main", run(["branch", "--show-current"]) === "main");
// The expected count is derived from the manifest itself, so the inventory can never drift from the
// path set. Square brackets are NOT wildcards here: Expo Router dynamic routes legitimately use them.
check("exact wildcard-free path inventory",
  SR2KA_PATHS.length > 0
  && new Set(SR2KA_PATHS).size === SR2KA_PATHS.length
  && SR2KA_PATHS.every((f) => typeof f === "string" && !/[*?]/.test(f) && !f.endsWith("/"))
  && SR2KA_PATHS.every((f) => fs.existsSync(path.join(root, f)))
  && lifecycle.manifest.every((f) => SR2KA_PATHS.includes(f)));
check("no candidate path is deleted or staged", staged.length === 0
  && lines(run(["diff", "--name-only", "--diff-filter=D", `${SR2KA_BASELINE}..HEAD`])).length === 0);

// ---- backend delta is zero (§27) ---------------------------------------------------------------
check("zero migrations in the candidate", SR2KA_PATHS.every((f) => !f.startsWith("supabase/migrations/")));
check("zero supabase paths in the candidate", SR2KA_PATHS.every((f) => !f.startsWith("supabase/")));
check("no supabase byte changed by SR-2K-A",
  lines(run(["diff", "--name-only", ...selfRange, "--", "supabase"])).length === 0);
check("the newest frozen migration is byte-unchanged",
  sha(bytes(SR2KA_FROZEN_MIGRATION)) === SR2KA_FROZEN_MIGRATION_SHA256);
check("candidate touches only Mobile, shared i18n, scripts and package.json",
  SR2KA_PATHS.every((f) => f.startsWith("apps/mobile/") || f === "lib/i18n/zh-TW.ts"
    || f.startsWith("scripts/") || f === "package.json"));
check("no new Mobile route is introduced by SR-2K-A",
  lines(run(["diff", "--name-only", "--diff-filter=A",
    frozenExists ? `${SR2KA_BASELINE}..${SR2KA_FROZEN_COMMIT}` : `${SR2KA_BASELINE}..HEAD`,
    "--", "apps/mobile/app"])).length === 0);

// ---- frozen predecessor product authority is untouched (§7, §8, §23, §24) ----------------------
const frozenProductAuthority = [
  "apps/mobile/features/meal-buddy-candidates",
  "apps/mobile/features/meal-buddy-card",
  "apps/mobile/features/social-interest-settings",
  "apps/mobile/features/social-candidates",
  "apps/mobile/features/display-resolvers",
  "apps/mobile/app/community-profile",
  `${REL}/controller.ts`,
  `${REL}/repository.ts`,
  `${REL}/supabaseContracts.ts`,
  `${REL}/types.ts`,
  "apps/mobile/features/meal-buddy-chat/controller.ts",
  "apps/mobile/features/meal-buddy-chat/repository.ts",
  "apps/mobile/features/meal-buddy-chat/types.ts",
  "apps/mobile/features/consumer-runtime"
];
check("ranking, exposure, context, interest and lifecycle authority bytes are unchanged by SR-2K-A",
  frozenProductAuthority.every((f) => lines(run(["diff", "--name-only", ...selfRange, "--", f])).length === 0));

// ---- the shared production contract ------------------------------------------------------------
const violations = auditSr2kaAuthoredSources(sources);
check("SR-2K-A production source contract has no violation", violations.length === 0);
if (violations.length) for (const violation of violations) console.log(`     violated: ${violation}`);

// ---- reference boundary (§21) ------------------------------------------------------------------
const refBoundary = sources.get("refBoundary");
check("every opaque reference family keeps its own distinct prefix",
  new Set(Object.values(SR2KA_REF_FAMILIES)).size === Object.keys(SR2KA_REF_FAMILIES).length
  && Object.values(SR2KA_REF_FAMILIES).every((prefix) => refBoundary.includes(`"${prefix}"`)));
check("no reference family is converted into another",
  !/\.replace\(/.test(refBoundary) && !/slice\(\s*prefix\.length/.test(refBoundary));
check("no display name is ever used as identity",
  !/displayName/.test(refBoundary) && !/displayName/.test(sources.get("chatRoute")));
check("no long-lived storage of an opaque reference",
  !/AsyncStorage|SecureStore|localStorage|storage\.setItem/.test(candidateProduction));

// ---- real/demo isolation (§5, §19) -------------------------------------------------------------
const realRelationshipSurfaces = ["inbox", "panel", "profileRoute", "chatRoute", "chatScreen"]
  .map((key) => sources.get(key)).join("\n");
check("no demo Meal Buddy authority is reachable from the real relationship journey",
  SR2KA_DEMO_AUTHORITY.every((name) => !realRelationshipSurfaces.includes(name)));
check("the real relationship inbox is rendered only in real mode",
  /isRealCandidateMode \? \(\s*<MealBuddyRelationshipInbox/.test(sources.get("home")));
check("an empty real result is never backfilled with demo rows",
  /state\.relationships\.length === 0/.test(sources.get("inbox"))
  // The shared UI kit module is legitimately named DemoUi; what must never appear is demo DATA.
  && !/mockMatchedBuddies|mockGatheringRecords|mealBuddyFlowMock|mealBuddyCardMock|mealBuddySocialStore|demoMode|demoLabel/
    .test(sources.get("inbox")));

// ---- absence of out-of-scope authority (§3, §28) ------------------------------------------------
for (const [label, pattern] of SR2KA_FORBIDDEN_FEATURES) {
  check(`no ${label} in the SR-2K-A candidate`, !pattern.test(candidateProduction));
}

// ---- package surface ---------------------------------------------------------------------------
const packageJson = JSON.parse(read("package.json"));
const baselinePackage = JSON.parse(run(["show", `${SR2KA_BASELINE}:package.json`]));
const packageWithout = structuredClone(packageJson);
for (const key of Object.keys(SR2KA_NPM_COMMANDS)) delete packageWithout.scripts[key];
// SR-2K-B adds five validation-only command keys. Stripping them keeps this guard measuring what it
// has always measured: that no OTHER package byte moved.
for (const key of ["test:social-final-sr2k-b", "test:social-final-sr2k-b-smoke", "test:social-final-sr2k-b-mutations", "test:social-final-sr2k-b-concurrency", "test:social-final-sr2k-b-postgres"]) delete packageWithout.scripts[key];
check("package exposes the exact canonical SR-2K-A commands",
  Object.entries(SR2KA_NPM_COMMANDS).every(([name, command]) => packageJson.scripts[name] === command));
check("package.json differs from the frozen predecessor only by the SR-2K-A commands",
  JSON.stringify(packageWithout) === JSON.stringify(baselinePackage));
check("no dependency, workspace or lockfile is touched",
  JSON.stringify(packageJson.dependencies) === JSON.stringify(baselinePackage.dependencies)
  && JSON.stringify(packageJson.devDependencies) === JSON.stringify(baselinePackage.devDependencies)
  && JSON.stringify(packageJson.workspaces) === JSON.stringify(baselinePackage.workspaces)
  && !SR2KA_PATHS.some((f) => /lock(?:file)?/i.test(f)));

// ---- predecessor amendments are validation-only (§30) -------------------------------------------
const amendedPredecessors = SR2KA_PATHS.filter((f) =>
  f.startsWith("scripts/") && !f.includes("sr2k-a"));
check("every predecessor amendment is a validation script, never production",
  amendedPredecessors.length > 0 && amendedPredecessors.every((f) => f.startsWith("scripts/")));
check("no predecessor assertion is removed by the amendment",
  amendedPredecessors.every((f) => {
    const now = (read(f).match(/check\(|rule\(|requireInvariant\(/g) ?? []).length;
    const before = ((run(["show", `${SR2KA_BASELINE}:${f}`]) ?? "").match(/check\(|rule\(|requireInvariant\(/g) ?? []).length;
    return now >= before;
  }));
const stripListGuards = amendedPredecessors.filter((f) => !f.includes("sr2j-b"));
check("every package-pinning predecessor guard learns the exact new command keys",
  stripListGuards.length === 13
  && stripListGuards.every((f) => Object.keys(SR2KA_NPM_COMMANDS).every((key) => read(f).includes(key))));

// ---- byte hygiene ------------------------------------------------------------------------------
const HOME = "apps/mobile/app/meal-buddies.tsx";
check("authored candidate files carry no CRLF pair and no BOM",
  [...SR2KA_NEW_PRODUCTION_PATHS, ...SR2KA_PATHS.filter((f) => f.includes("sr2k-a"))].every((f) => {
    const b = bytes(f);
    return !b.includes(Buffer.from("\r\n")) && !(b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF);
  }));
// The 116 KB home screen is stored with a UTF-8 BOM and LF endings. That is historical and must
// survive untouched: rewriting either would be an unrelated whole-file change.
check("the pre-existing home screen keeps its own byte conventions",
  (() => {
    const blob = child.spawnSync("git", ["-c", "core.safecrlf=false", "show", `${SR2KA_BASELINE}:${HOME}`],
      { cwd: root, encoding: "buffer" }).stdout;
    const disk = bytes(HOME);
    const bom = (b) => b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF;
    const crlf = (b) => b.includes(Buffer.from("\r\n"));
    return bom(disk) === bom(blob) && bom(disk) && crlf(disk) === crlf(blob) && !crlf(disk);
  })());
check("all candidate bytes are UTF-8 text without NUL",
  SR2KA_PATHS.every((f) => !bytes(f).includes(0) && !read(f).includes(String.fromCharCode(0xFFFD))));
check("no candidate file carries a credential-shaped secret",
  !SR2KA_PATHS.map(read).some((t) =>
    /(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{10,}|sbp_[A-Za-z0-9]{20,})/.test(t)));
check("no Development or Production project reference is hard-coded",
  !SR2KA_PRODUCTION_PATHS.map(read).some((t) => /msbgnnoorsoefuiwluye|\bprod(uction)?[-_]?(ref|project|url)\b/i.test(t)));

const manifest = createSr2kaManifest((f) => bytes(f));
check("canonical raw-byte manifest covers the exact sorted path set",
  manifest.entries.length === SR2KA_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === SR2KA_PATHS[index] && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log(JSON.stringify({
  suite: "meal-buddy-closure-sr2k-a-guard",
  lifecycle: lifecycle.phase,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  canonicalManifestSha256: manifest.aggregateSha256,
  frozenMigrationSha256: sha(bytes(SR2KA_FROZEN_MIGRATION)),
  backendDelta: SR2KA_PATHS.filter((f) => f.startsWith("supabase/")).length,
  networkUsed: false, databaseUsed: false, credentialsUsed: false,
  developmentTouched: false, productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
