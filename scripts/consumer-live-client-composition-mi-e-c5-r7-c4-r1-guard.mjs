#!/usr/bin/env node
// MI-E-C5-R7-C4-R1 static guard — live Supabase consumer client composition + Development launcher.
//
// POST-FREEZE LIFECYCLE-AWARE BY CONSTRUCTION. Every assertion is repository CONTENT or a SUBSET
// assertion over uncommitted state that is vacuously true on a clean tree. Nothing requires a path
// to be modified, staged or untracked, so the freeze commit cannot turn a passing guard red.
//
// Fully local: no network, no Supabase project, no credential, no RPC.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
// RAW, never trimmed: a `--porcelain=v1` record for a modified-but-unstaged file starts with a
// SPACE, so trimming the first entry silently eats a character of its path.
const gitRaw = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" }).stdout ?? "";
const git = (args) => gitRaw(args).trim();

// Executable source only, so prose naming a forbidden token cannot fail a check about code.
const stripComments = (source) =>
  source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");

const HELPER = "apps/mobile/features/consumer-auth/liveClientCompositionFlags.ts";
const AUTH_INDEX = "apps/mobile/features/consumer-auth/index.ts";
const FACTORY = "apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts";
const AUTH_FLAGS = "apps/mobile/features/consumer-auth/featureFlags.ts";
const RUNTIME = "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts";
const CATALOG = "apps/mobile/features/restaurants/catalog/composition.ts";
const FAVORITES = "apps/mobile/features/consumer-favorites/consumerFavoriteComposition.ts";
const RATINGS = "apps/mobile/features/consumer-ratings/consumerRatingComposition.ts";
const LAUNCHER = "scripts/start-mobile.mjs";
const GUARD = "scripts/consumer-live-client-composition-mi-e-c5-r7-c4-r1-guard.mjs";
const SMOKE = "scripts/consumer-live-client-composition-mi-e-c5-r7-c4-r1-smoke.mjs";

// The four predecessor guards whose exact successor manifests must register this round, exactly as
// every previous round in this chain registered with its predecessors.
const C3_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c3-guard.mjs";
const C2A_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs";
const C2B_GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2b-guard.mjs";
const R7C1_GUARD = "scripts/restaurant-selection-mi-e-c5-r7-c1-guard.mjs";

// The EXACT thirteen paths this round may introduce or change. Named individually — never a prefix,
// never a wildcard — so a fourteenth path fails here rather than being absorbed.
const CANDIDATE_MANIFEST = Object.freeze([
  HELPER, AUTH_INDEX, RUNTIME, CATALOG, FAVORITES, RATINGS, LAUNCHER, GUARD, SMOKE,
  C3_GUARD, C2A_GUARD, C2B_GUARD, R7C1_GUARD
]);

const helper = read(HELPER);
const helperCode = stripComments(helper);
const factoryCode = stripComments(read(FACTORY));
const runtimeCode = stripComments(read(RUNTIME));
const catalogCode = stripComments(read(CATALOG));
const favoritesCode = stripComments(read(FAVORITES));
const ratingsCode = stripComments(read(RATINGS));
const launcher = read(LAUNCHER);
const launcherCode = stripComments(launcher);

// =============================================================================================
// 1. Shared helper is the single authority (1-8)
// =============================================================================================
check("1. the shared live-client flag helper exists at the consumer-auth authority path", exists(HELPER));
check(
  "2. it exports both the capability-issue and the client-construction derivations",
  /export function withoutObsoleteConsumerWritesIssue\(/.test(helperCode) &&
    /export function deriveLiveSupabaseClientFlags\(/.test(helperCode)
);
check(
  "3. the obsolete Phase 1D statement is a named constant, not a scattered literal",
  /export const CONSUMER_PHASE_1D_WRITES_ISSUE = "Consumer Supabase writes are not enabled in Consumer Runtime Phase 1D\.";/.test(helperCode)
);
check(
  "4. the helper removes ONLY that statement — it never clears the whole issue list",
  /issues\.filter\(\(issue\) => issue !== CONSUMER_PHASE_1D_WRITES_ISSUE\)/.test(helperCode) &&
    !/issues: \[\]/.test(helperCode)
);
check(
  "5. the helper clears only the factory-facing writes gate and nothing else",
  /supabaseWritesEnabled: false/.test(helperCode) &&
    !/authSource:/.test(helperCode) &&
    !/profileSource:/.test(helperCode) &&
    !/supabaseAuthEnabled:/.test(helperCode)
);
check(
  "6. flags without writes enabled pass through untouched (no needless rewriting)",
  (helperCode.match(/if \(!flags\.supabaseWritesEnabled\) return flags;/g) ?? []).length === 2
);
check("7. the helper is pure — no env read, no I/O, no client construction", !/process\.env|readEnv|fetch\(|createClient|require\(/.test(helperCode));
check("8. the helper is exported from the consumer-auth barrel", /export \* from "\.\/liveClientCompositionFlags";/.test(read(AUTH_INDEX)));

// =============================================================================================
// 2. Every live client call site uses it (9-14)
// =============================================================================================
const usesHelperForFactory = (code) =>
  /flags: deriveLiveSupabaseClientFlags\(/.test(code) && !/flags: authFlags,/.test(code);
check("9. the Restaurant Catalog composition builds its client from derived flags", usesHelperForFactory(catalogCode));
check("10. the Favorites composition builds its client from derived flags", usesHelperForFactory(favoritesCode));
check("11. the Ratings composition builds its client from derived flags", usesHelperForFactory(ratingsCode));
check(
  "12. the main Consumer Runtime delegates to the shared helper instead of private duplicates",
  /return withoutObsoleteConsumerWritesIssue\(flags\);/.test(runtimeCode) &&
    /return deriveLiveSupabaseClientFlags\(flags\);/.test(runtimeCode)
);
check(
  "13. no call site re-implements the reconciliation locally",
  [runtimeCode, catalogCode, favoritesCode, ratingsCode].every(
    (code) => !code.includes("Consumer Supabase writes are not enabled in Consumer Runtime Phase 1D.")
  )
);
check(
  "14. every composition that constructs the live client imports the shared helper",
  [catalogCode, favoritesCode, ratingsCode].every((code) => /import \{ deriveLiveSupabaseClientFlags \} from/.test(code)) &&
    /deriveLiveSupabaseClientFlags/.test(runtimeCode)
);

// =============================================================================================
// 3. Fail-closed behaviour is preserved (15-18)
// =============================================================================================
check(
  "15. the factory keeps BOTH Phase 1D fail-closed gates — they are not retired",
  /if \(this\.options\.flags\.issues\.length\) \{/.test(factoryCode) &&
    /if \(this\.options\.flags\.supabaseWritesEnabled\) \{/.test(factoryCode)
);
check(
  "16. the factory still requires a URL and a publishable key",
  /if \(!this\.options\.env\.url \|\| !this\.options\.env\.publishableKey\) \{/.test(factoryCode)
);
check(
  "17. the flag source still records the Phase 1D statement (the helper reconciles, it does not delete history)",
  /issues\.push\("Consumer Supabase writes are not enabled in Consumer Runtime Phase 1D\."\);/.test(stripComments(read(AUTH_FLAGS)))
);
check(
  "18. the catalog still degrades to the disabled repository when a client genuinely cannot be built",
  /catch \{[\s\S]{0,120}createRestaurantCatalogRuntime\(catalogFlags\);/.test(catalogCode)
);

// =============================================================================================
// 4. Development launcher (19-27)
// =============================================================================================
check("19. the launcher forwards only the public EXPO_PUBLIC_ namespace", /const PUBLIC_PREFIX = "EXPO_PUBLIC_";/.test(launcherCode) &&
  /if \(!name\.startsWith\(PUBLIC_PREFIX\)\) continue;/.test(launcherCode));
check("20. forwarded values reach the Expo child process before bundling", /\.\.\.Object\.fromEntries\(forwarded\)/.test(launcherCode));
check("21. Expo still starts from the apps/mobile project root", /cwd: mobileRoot/.test(launcherCode));
check("22. the launcher never writes a file", !/writeFileSync|appendFileSync|mkdirSync|createWriteStream/.test(launcherCode));
check(
  // The exact conditional, not merely the presence of the symbols: neutering the guard to
  // `if (false)` leaves both `preflightErrors` and `process.exit(1)` in the file untouched.
  "23. the launcher fails closed instead of silently starting a mock runtime",
  /if \(preflightErrors\.length\) \{/.test(launcherCode) &&
    /process\.exit\(1\);/.test(launcherCode) &&
    // The exit must precede the spawn, so a failed preflight can never reach Expo.
    launcherCode.indexOf("process.exit(1);") < launcherCode.indexOf("const child = spawn(")
);
check(
  "24. missing URL or key is a preflight error",
  /Missing consumer Supabase URL/.test(launcher) && /Missing consumer Supabase publishable key/.test(launcher)
);
check("25. a non-development environment is refused", /environment !== "development"/.test(launcherCode));
check(
  "26. the launcher reports credentials as present/missing and never interpolates a value",
  /\$\{url \? "present" : "MISSING"\}/.test(launcher) &&
    /\$\{publishableKey \? "present" : "MISSING"\}/.test(launcher) &&
    !/\$\{url\}/.test(launcher) &&
    !/\$\{publishableKey\}/.test(launcher) &&
    !/\$\{value\}/.test(launcher)
);
check(
  "27. the launcher reads the repository root, not only the Expo project root",
  /path\.join\(repoRoot, candidate\)/.test(launcherCode) && /const ENV_FILES = \[".env.local", ".env"\];/.test(launcherCode)
);

// =============================================================================================
// 5. Protected surfaces and scope (28-34)
// =============================================================================================
const PROTECTED_UNCHANGED = [
  "apps/mobile/app/analysis.tsx",
  "apps/mobile/app/today-intake.tsx",
  "apps/mobile/app/restaurants.tsx",
  "apps/mobile/app/meal-photo.tsx",
  "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts",
  "apps/mobile/features/restaurants/catalog/mapper.ts",
  "apps/mobile/features/restaurants/catalog/types.ts",
  "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts",
  "apps/mobile/features/analysis/analysisSessionStore.ts",
  "apps/mobile/features/meal-identification/analysisRestaurantHandoff.ts",
  "apps/mobile/features/meal-identification-finalization/v3Contract.ts",
  FACTORY,
  AUTH_FLAGS
];
// MI-E-C5-R7-C4-R2 successor manifest — the exact eleven paths of the round that consolidates
// /analysis into one page and gives the real primary-result card its restaurant context. Enumerated
// individually, never a prefix, so a twelfth path still fails. It touches no live-client composition
// surface, no auth flag helper and no launcher, so every C4-R1 authority stays fully in force; the
// only overlap is the Analysis screen, which C4-R1 itself never modified.
const C4_R2_SUCCESSOR_MANIFEST = Object.freeze([
  "apps/mobile/app/analysis.tsx",
  "apps/mobile/features/analysis/analysisSinglePagePresentation.ts",
  "scripts/restaurant-context-mi-e-c5-r7-a-guard.mjs",
  "scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs",
  R7C1_GUARD,
  C2A_GUARD,
  C2B_GUARD,
  C3_GUARD,
  GUARD,
  "scripts/analysis-single-page-mi-e-c5-r7-c4-r2-guard.mjs",
  "scripts/analysis-single-page-mi-e-c5-r7-c4-r2-smoke.mjs"
]);
const changedVsHead = git(["diff", "--name-only", "HEAD"]).split("\n").map((entry) => entry.trim()).filter(Boolean);
check(
  // MI-E-C5-R7-C4-R2: the Analysis screen leaves this zero-diff fence, because that successor round
  // is explicitly authorised to change it. Every other protected surface — the resolver, the mapper,
  // the catalog types, Today Intake, the analysis session store, the handoff, the v3 contract, the
  // repository factory and the auth flags — stays absolutely unchanged in both lifecycle states.
  "28. no R7-C3 / resolver / finalization / factory surface is modified by this round (vacuous on a clean tree)",
  PROTECTED_UNCHANGED.filter((file) => !C4_R2_SUCCESSOR_MANIFEST.includes(file)).every(
    (file) => !changedVsHead.includes(file)
  ),
  changedVsHead.filter(
    (file) => PROTECTED_UNCHANGED.includes(file) && !C4_R2_SUCCESSOR_MANIFEST.includes(file)
  )
);
check(
  "28a. the C4-R2 allowance removes EXACTLY the Analysis screen from the zero-diff fence, nothing else",
  PROTECTED_UNCHANGED.filter((file) => C4_R2_SUCCESSOR_MANIFEST.includes(file)).join(",") ===
    "apps/mobile/app/analysis.tsx" &&
    C4_R2_SUCCESSOR_MANIFEST.length === 11 &&
    new Set(C4_R2_SUCCESSOR_MANIFEST).size === 11 &&
    C4_R2_SUCCESSOR_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry)) &&
    C4_R2_SUCCESSOR_MANIFEST.filter((entry) => entry.startsWith("apps/")).length === 2 &&
    // No live-client composition surface may be reopened through the successor manifest.
    ![HELPER, AUTH_INDEX, RUNTIME, CATALOG, FAVORITES, RATINGS, LAUNCHER, FACTORY, AUTH_FLAGS].some((entry) =>
      C4_R2_SUCCESSOR_MANIFEST.includes(entry)
    ) &&
    C4_R2_SUCCESSOR_MANIFEST.every(
      (entry) => !entry.startsWith("supabase/") && !entry.startsWith("packages/") && !/\*/.test(entry)
    )
);
check(
  "29. this round introduces no database, migration, Edge Function or shared-package change",
  CANDIDATE_MANIFEST.every((file) => !file.startsWith("supabase/") && !file.startsWith("packages/"))
);
check(
  "30. the candidate manifest is exactly thirteen named paths, and reaches no protected surface",
  CANDIDATE_MANIFEST.length === 13 &&
    new Set(CANDIDATE_MANIFEST).size === 13 &&
    CANDIDATE_MANIFEST.every((entry) => /^[a-z0-9./_-]+\.(tsx?|mjs)$/i.test(entry) && exists(entry)) &&
    PROTECTED_UNCHANGED.every((entry) => !CANDIDATE_MANIFEST.includes(entry))
);
const worktree = gitRaw(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0")
  .filter(Boolean)
  .map((entry) => entry.slice(3).replaceAll("\\", "/"));
const outsideManifest = worktree.filter((file) => !CANDIDATE_MANIFEST.includes(file));
const outsideC4R2Manifest = worktree.filter((file) => !C4_R2_SUCCESSOR_MANIFEST.includes(file));
check(
  "31. every uncommitted change is confined to the manifest, and a clean committed tree also passes",
  outsideManifest.length === 0 || outsideC4R2Manifest.length === 0,
  { worktreeEntries: worktree.length, outsideManifest, outsideC4R2Manifest }
);
const guardCode = stripComments(read(GUARD));
check(
  "31a. this guard is lifecycle-AWARE: it never requires a path to be modified, staged or untracked",
  !/worktree\.includes\(/.test(guardCode) &&
    !/\.length === CANDIDATE_MANIFEST\.length/.test(guardCode) &&
    !/worktree\.length > 0/.test(guardCode) &&
    /outsideManifest\.length === 0/.test(guardCode)
);
// Fragment-assembled so this scan never matches its own pattern definitions.
const SECRET_PATTERNS = [
  new RegExp(["ey", "J[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{12,}\\."].join("")),
  new RegExp(["sb", "p_"].join("") + "[A-Za-z0-9]{16,}"),
  new RegExp(["service", "_role"].join("") + "[\"'\\s:=]+[A-Za-z0-9_-]{20,}"),
  new RegExp(["Authoriz", "ation:\\s*Bearer\\s+[A-Za-z0-9_.-]{12,}"].join(""))
];
check(
  "32. no candidate path contains an actual secret, token or key value",
  CANDIDATE_MANIFEST.every((entry) => !SECRET_PATTERNS.some((pattern) => pattern.test(read(entry))))
);
// "Remote-operation code" means actually performing a call, not merely naming a host: the companion
// smoke deliberately carries a FAKE project URL as a fixture, which must not be mistaken for one.
// Scanned where it is meaningful: the production surfaces and the launcher. The guard/smoke suites
// in this manifest are TEST files whose whole job is to forbid these constructs, so their denylist
// regexes necessarily contain the very tokens a naive scan would flag.
const PRODUCTION_CANDIDATES = CANDIDATE_MANIFEST.filter((entry) => entry.startsWith("apps/") || entry === LAUNCHER);
check(
  "33. no production candidate performs a remote operation, and no candidate hardcodes the project reference",
  PRODUCTION_CANDIDATES.every((entry) => {
    const code = stripComments(read(entry));
    return (
      !/\bfetch\s*\(/.test(code) &&
      !/functions\.invoke\s*\(/.test(code) &&
      !/\.rpc\s*\(/.test(code) &&
      !/https?:\/\/[a-z0-9-]+\.supabase\.co/.test(code)
    );
  }) &&
    // Project reference: production only. The R7-C1 guard names the Development ref inside its own
    // secret-scan denylist — a pattern that FORBIDS the value — so scanning test suites for it flags
    // exactly the code that protects against it.
    PRODUCTION_CANDIDATES.every((entry) => !read(entry).includes(["msbgnnoo", "rsoefuiwluye"].join("")))
);
const UNCONDITIONAL_PASS = /\btrue\s*\|\||\|\|\s*true\b|,\s*true\s*\)/;
check(
  "34. no guard amended or added this round was neutered by an unconditional-pass short circuit",
  !UNCONDITIONAL_PASS.test(guardCode) && !UNCONDITIONAL_PASS.test(stripComments(read(SMOKE)))
);

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  guard: "consumer-live-client-composition-mi-e-c5-r7-c4-r1",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false
}, null, 2));
if (failed.length) process.exit(1);
