import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const root = process.cwd();
const temporaryRoot = process.platform === "win32" ? os.tmpdir() : "/tmp";
const baseline = "e0c625ff5c8b65de14f7fdc50da8f939ff007821";
const freezeMessage = "Freeze canonical taste evidence contract and normalization";
const domainRoot = "packages/shared/src/domain/taste-similarity";
const manifest = [
  "package.json",
  "packages/shared/src/domain/index.ts",
  `${domainRoot}/behavior.ts`,
  `${domainRoot}/evidence.ts`,
  `${domainRoot}/goal.ts`,
  `${domainRoot}/index.ts`,
  `${domainRoot}/normalization.ts`,
  `${domainRoot}/preference.ts`,
  `${domainRoot}/restriction.ts`,
  "scripts/taste-similarity-ts1-guard.mjs",
  "scripts/taste-similarity-ts1-mutations.mjs",
  "scripts/taste-similarity-ts1-smoke.mjs"
].sort();
const checks = [];
const failures = [];

function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function sortedLines(value) {
  return value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
}

function equalLists(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function currentCandidatePaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout
    .split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/"))
    .sort();
}

function packageChangeIsScriptsOnly(freezeCommit) {
  const before = JSON.parse(git(["show", `${baseline}:package.json`]).stdout);
  const after = JSON.parse(freezeCommit ? git(["show", `${freezeCommit}:package.json`]).stdout : read("package.json"));
  for (const key of [
    "test:taste-similarity-ts1",
    "test:taste-similarity-ts1-smoke",
    "test:taste-similarity-ts1-mutations"
  ]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

function compileTypeBoundaryProbe() {
  const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, "taste-similarity-ts1-types-"));
  try {
    const importPath = path.join(root, domainRoot, "index").replaceAll("\\", "/");
    const probePath = path.join(tempRoot, "type-boundaries.ts");
    fs.writeFileSync(probePath, `
      import type {
        FoodTastePreferenceEvidence,
        SocialLogisticsPreferenceEvidence,
        MealPatternPreferenceEvidence,
        DiningContextPreferenceEvidence,
        GoalEvidence,
        RestrictionEvidence
      } from ${JSON.stringify(importPath)};

      declare const social: SocialLogisticsPreferenceEvidence;
      declare const mealPattern: MealPatternPreferenceEvidence;
      declare const dining: DiningContextPreferenceEvidence;
      declare const goal: GoalEvidence;
      declare const restriction: RestrictionEvidence;

      // @ts-expect-error social logistics cannot be consumed as food taste
      const socialAsFood: FoodTastePreferenceEvidence = social;
      // @ts-expect-error meal pattern cannot be consumed as food taste
      const mealAsFood: FoodTastePreferenceEvidence = mealPattern;
      // @ts-expect-error dining context cannot be consumed as food taste
      const diningAsFood: FoodTastePreferenceEvidence = dining;
      // @ts-expect-error goal has no preference polarity
      goal.polarity;
      // @ts-expect-error restriction has no preference polarity
      restriction.polarity;
      void [socialAsFood, mealAsFood, diningAsFood];
    `, "utf8");
    const sourceFiles = fs.readdirSync(path.join(root, domainRoot))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => path.join(root, domainRoot, file));
    const program = ts.createProgram([...sourceFiles, probePath], {
      noEmit: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      skipLibCheck: true
    });
    return ts.getPreEmitDiagnostics(program).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  const branch = git(["branch", "--show-current"]).stdout.trim();
  const freezeCandidates = git(["log", "--format=%H%x09%s", `${baseline}..HEAD`]).stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((entry) => entry.split("\t"))
    .filter(([, subject]) => subject === freezeMessage)
    .map(([commit]) => commit)
    .sort();
  const freezeCommit = freezeCandidates[0] ?? null;
  const lifecycleManifest = freezeCommit
    ? sortedLines(git(["diff-tree", "--no-commit-id", "--name-only", "-r", freezeCommit]).stdout)
    : currentCandidatePaths();

  check("branch remains main", branch === "main", { branch });
  check("TS-1 baseline remains ancestor authority", git(["merge-base", "--is-ancestor", baseline, "HEAD"], true).status === 0, { head });
  check("candidate or frozen commit has the exact 12-path manifest", equalLists(lifecycleManifest, manifest), { lifecycleManifest, manifest });
  check("freeze lifecycle has at most one exact authority commit", freezeCandidates.length <= 1, { freezeCandidates });
  check("pre-commit staged diff is empty or frozen TS-1 has no hidden staged bytes", freezeCommit
    ? git(["diff", "--cached", "--name-only", "--", domainRoot]).stdout.trim() === ""
    : git(["diff", "--cached", "--name-only"]).stdout.trim() === "");
  check("manifest contains no wildcard authority", manifest.every((entry) => !/[?*\[\]{}]/.test(entry)));
  check("freeze package change adds only three TS-1 validation scripts", packageChangeIsScriptsOnly(freezeCommit));
  check("no Mobile, Supabase, migration, UI, Social, or GPS path is in the manifest", !manifest.some((entry) => /^(apps\/|supabase\/|lib\/i18n)|migration|social|gps/i.test(entry)));

  const evidence = read(`${domainRoot}/evidence.ts`);
  const preference = read(`${domainRoot}/preference.ts`);
  const behavior = read(`${domainRoot}/behavior.ts`);
  const goal = read(`${domainRoot}/goal.ts`);
  const restriction = read(`${domainRoot}/restriction.ts`);
  const normalization = read(`${domainRoot}/normalization.ts`);
  const index = read(`${domainRoot}/index.ts`);
  const guardSource = read("scripts/taste-similarity-ts1-guard.mjs");
  const domainSource = [evidence, preference, behavior, goal, restriction, normalization, index].join("\n");
  const frozenCorePaths = ["evidence.ts", "preference.ts", "behavior.ts", "goal.ts", "restriction.ts", "normalization.ts"]
    .map((file) => `${domainRoot}/${file}`);
  const frozenCoreSource = [evidence, preference, behavior, goal, restriction, normalization].join("\n");
  const domainImports = domainSource.split(/\r?\n/).filter((line) => /^import\s/.test(line.trim())).join("\n");

  check("four evidence categories are structurally separated", /"preference" \| "behavior" \| "goal" \| "restriction"/.test(evidence));
  check("Preference has an explicit semantic scope", /export type PreferenceScope/.test(preference));
  check("all four preference scopes exist", ["food_taste", "meal_pattern", "dining_context", "social_logistics"].every((value) => preference.includes(`"${value}"`)));
  check("food taste type excludes social logistics", /FoodTastePreferenceEvidence[\s\S]*food_taste/.test(preference) && /SocialLogisticsPreferenceEvidence[\s\S]*social_logistics/.test(preference));
  check("meal pattern and dining context remain dedicated types", /MealPatternPreferenceEvidence/.test(preference) && /DiningContextPreferenceEvidence/.test(preference));
  check("Goal has no preference polarity field", !/polarity/.test(goal));
  check("Restriction has no preference polarity field", !/polarity/.test(restriction));
  check("disliked flavor remains negative preference", /food_taste", "flavor", "negative"/.test(preference));
  check("restriction normalization never returns a preference category", /category: "restriction"/.test(normalization) && !/normalizeRestrictionEvidence[\s\S]{0,1000}category: "preference"/.test(normalization));
  check("severity preference maps exactly to soft", /rawSeverity === "preference" \? "soft" : "unclassified"/.test(normalization));
  check("unknown severity remains unclassified and no hard inference exists", !/enforcement[^\n]*"hard"|"hard"[^\n]*enforcement/.test(domainSource));
  check("Ratings preserve raw scalar meaning without thresholds", /ratingValue: number/.test(behavior) && /scalar_evaluation_unclassified/.test(behavior) && !/>=\s*[234]|<=\s*[234]/.test(domainSource));
  check("favorite and rating normalizers enforce canonical origin authority", /input\.evidence\.origin !== "favorite"/.test(normalization) && /input\.evidence\.origin !== "rating"/.test(normalization));
  check("meal source confidence is envelope metadata rather than taste confidence", /sourceConfidence\?: number/.test(evidence) && !/tasteConfidence|profileConfidence/.test(domainSource));
  check("canonical restaurant, branch, and menu-item IDs are typed opaque strings", ["restaurantId", "branchId", "menuItemId"].every((value) => evidence.includes(`${value}: string`)));
  check("canonical target contains no display-name identity", !/displayName|restaurantName|menuItemName|routeIndex|tagId/.test(evidence));
  check("denormalized taste-profile favorite arrays are excluded", !/favorite_restaurant_ids|favorite_menu_item_ids/.test(domainSource));
  check("consumer profile summary authority is excluded", !/diet_summary|recent_meal_style|nutrition_goal_summary/.test(domainSource));
  check("domain has no fixture or community-card dependency", !/community-card|i18n|mock\//i.test(domainSource));
  check("domain has no Supabase dependency", !/supabase/i.test(domainSource));
  check("domain has no Mobile dependency", !/apps\/mobile|react-native|(?:from|import)[^\n]*expo/i.test(domainImports));
  check("domain has no Social dependency", !/(?:from|import)[^\n]*social/i.test(domainImports));
  check("domain has no Restaurant runtime dependency", !/features\/restaurants|restaurantRuntime|RestaurantDomain/.test(domainImports));
  check("domain has no GPS dependency", !/(?:from|import)[^\n]*(gps|geolocation)/i.test(domainImports));
  check("TS-1 contains no similarity score", !/similarityScore|matchScore|rankScore|weighting|scoreTaste/i.test(domainSource));
  check("TS-1 contains no numeric profile confidence", !/tasteConfidence|profileConfidence|confidenceScore/.test(domainSource));
  check("TS-1 contains no decay formula", !/Math\.exp|halfLife|decayRate|decayWeight/.test(domainSource));
  check("frozen TS-1 core files have no successor content diff", freezeCommit !== null
    && git(["diff", "--name-only", freezeCommit, "--", ...frozenCorePaths]).stdout.trim() === "");
  check("TasteProfileSnapshot and composition semantics remain absent from frozen TS-1 core", !/TasteProfileSnapshot|sourceStates|evidenceWindow|generatedAt|truncation/.test(frozenCoreSource));
  check("normalization uses Unicode NFC, trim, empty rejection, deterministic Set dedupe and code-unit sort", /normalize\("NFC"\)\.trim\(\)/.test(normalization) && /if \(!normalized\) throw/.test(normalization) && /new Set/.test(normalization) && /compareCodeUnits/.test(normalization));
  check("unknown source values preserve rawValue", /classification: "unknown", rawValue/.test(normalization));
  check("shared barrel exports an isolated TasteSimilarityDomain namespace", read("packages/shared/src/domain/index.ts").includes('export * as TasteSimilarityDomain from "./taste-similarity";'));
  const typeBoundaryDiagnostics = compileTypeBoundaryProbe();
  check("type-system boundary probe compiles with all negative expectations consumed", typeBoundaryDiagnostics.length === 0, { diagnostics: typeBoundaryDiagnostics });
  const unconditionalSuccessExit = ["process", ".exit(0)"].join("");
  check("guard has no HEAD bypass or unconditional success exit", !guardSource.includes(unconditionalSuccessExit));
  check("guard has no unconditional PASS assertion", !/check\([^,\n]+,\s*(?:true|1)\b/.test(guardSource));

  const status = failures.length === 0 ? "passed" : "failed";
  console.log(JSON.stringify({
    status,
    phase: "TS-1A + TS-1B Canonical Taste Evidence Guard",
    totalChecks: checks.length,
    passedChecks: checks.length - failures.length,
    failedChecks: failures.length,
    lifecycle: freezeCommit ? "frozen_successor" : "implementation_candidate",
    freezeCommit,
    failures,
    networkUsed: false,
    databaseUsed: false,
    productionTouched: false
  }, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    status: "failed",
    phase: "TS-1A + TS-1B Canonical Taste Evidence Guard",
    reason: error instanceof Error ? error.message : String(error),
    checks,
    failures
  }, null, 2));
  process.exitCode = 1;
}
