#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import {
  GEO1C_BASELINE,
  GEO1C_BASELINE_SUBJECT,
  GEO1C_COMMIT_SUBJECT,
  GEO1C_NPM_KEYS,
  GEO1C_PATHS,
  GEO1C_PREDECESSOR_GUARDS,
  GEO1C_PRODUCT_PATHS,
  auditGeo1cAuthoredSources,
  classifyGeo1cLifecycle,
  createGeo1cManifest
} from "./geo-recommendation-geo-1c-successor-manifest.mjs";
import {
  RECA_BASELINE, RECA_NPM_KEYS, RECA_PATHS, classifyRecaLifecycle
} from "./recommendation-rec-a-successor-manifest.mjs";
import { RECBP0_MIGRATION, RECBP0_NPM_KEYS, RECBP0_PATHS } from "./recommendation-rec-b-p0-successor-manifest.mjs";
import { classifyRecbp1Lifecycle, RECBP1_BASELINE, RECBP1_MIGRATION, RECBP1_NPM_KEYS, RECBP1_PATHS } from "./recommendation-rec-b-p1-successor-manifest.mjs";
import { classifyRecbLifecycle, RECB_NPM_KEYS, RECB_PATHS } from "./recommendation-rec-b-successor-manifest.mjs";
import {
  RECCP0_BASELINE, RECCP0_MIGRATION, RECCP0_PATHS, classifyReccp0Lifecycle
} from "./recommendation-rec-c-p0-successor-manifest.mjs";
import { RECCP1_MIGRATION } from "./recommendation-rec-c-p1-successor-manifest.mjs";
import {
  RECC_BASELINE, RECC_PATHS, classifyReccLifecycle
} from "./recommendation-rec-c-successor-manifest.mjs";
import {
  RECDP0_BASELINE,
  RECDP0_MIGRATION,
  RECDP0_NPM_KEYS,
  RECDP0_PATHS,
  classifyRecdp0Lifecycle
} from "./recommendation-rec-d-p0-successor-manifest.mjs";
import {
  RECDP1_BASELINE,
  RECDP1_MIGRATION,
  RECDP1_PATHS,
  classifyRecdp1Lifecycle
} from "./recommendation-rec-d-p1-successor-manifest.mjs";
import { RECD_BASELINE, RECD_PATHS, classifyRecdLifecycle } from "./recommendation-rec-d-successor-manifest.mjs";
import {
  GEO1DP0_BASELINE, GEO1DP0_MIGRATION, GEO1DP0_PATHS, classifyGeo1dp0Lifecycle
} from "./geo-meal-buddy-geo-1d-p0-successor-manifest.mjs";

const root = process.cwd();
const git = (args) => {
  const result = child.spawnSync("git", ["-c", "core.safecrlf=false", ...args], {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr || "git_failed");
  return (result.stdout ?? "").trim();
};
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 500)}`);
};

const head = git(["rev-parse", "HEAD"]);
const originHead = git(["rev-parse", "origin/main"]);
const counts = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/).map(Number);
const unstaged = lines(git(["diff", "--name-only", "--", ...GEO1C_PATHS]));
const untracked = lines(git(["ls-files", "--others", "--exclude-standard", "--", ...GEO1C_PATHS]));
const worktreePaths = [...new Set([...unstaged, ...untracked])].sort();
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const deltaPaths = head === GEO1C_BASELINE ? [] : lines(git(["diff", "--name-only", `${GEO1C_BASELINE}..HEAD`]));
const geoLifecycle = classifyGeo1cLifecycle({
  head,
  parent: head === GEO1C_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead,
  behind: counts[0],
  ahead: counts[1],
  worktreePaths,
  stagedPaths,
  deltaPaths,
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D", "--", ...GEO1C_PATHS])).length > 0
});
const recaUnstaged = lines(git(["diff", "--name-only"]));
const recaUntracked = lines(git(["ls-files", "--others", "--exclude-standard"]));
const recaWorktreePaths = [...new Set([...recaUnstaged, ...recaUntracked])].sort();
const recaDeltaPaths = head === RECA_BASELINE ? [] : lines(git(["diff", "--name-only", `${RECA_BASELINE}..HEAD`]));
const recaLifecycle = classifyRecaLifecycle({
  head, parent: head === RECA_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths, deltaPaths: recaDeltaPaths,
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recbp1Lifecycle = classifyRecbp1Lifecycle({
  head, parent: head === RECBP1_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths,
  deltaPaths: head === RECBP1_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recbLifecycle = classifyRecbLifecycle({
  head, parent: head === RECBP1_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths,
  deltaPaths: head === RECBP1_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
// REC-C-P0 is the next successor in flight on top of the pushed REC-B freeze, recognised by its own
// exact path set, exactly as every earlier successor above already is.
const reccp0Lifecycle = classifyReccp0Lifecycle({
  head, parent: head === RECCP0_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths,
  deltaPaths: head === RECCP0_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const reccLifecycle = classifyReccLifecycle({
  head, parent: head === RECC_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths,
  deltaPaths: head === RECC_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdp0Lifecycle = classifyRecdp0Lifecycle({
  head, parent: head === RECDP0_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths,
  deltaPaths: head === RECDP0_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdp1Lifecycle = classifyRecdp1Lifecycle({
  head, parent: head === RECDP1_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths,
  deltaPaths: head === RECDP1_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recdLifecycle = classifyRecdLifecycle({
  head, parent: head === RECD_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths,
  deltaPaths: head === RECD_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const geo1dp0Lifecycle = classifyGeo1dp0Lifecycle({
  head, parent: head === GEO1DP0_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths,
  deltaPaths: head === GEO1DP0_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});

const isGeo1dp0Successor = geo1dp0Lifecycle.valid;
const isRecdSuccessor = recdLifecycle.valid;
const isRecdp1Successor = recdp1Lifecycle.valid;
const isRecdp0Successor = recdp0Lifecycle.valid;
const isReccSuccessor = reccLifecycle.valid;
const isReccp0Successor = reccp0Lifecycle.valid;
const isRecbSuccessor = recbLifecycle.valid;
const isRecbp1Successor = recbp1Lifecycle.valid;
const isRecaSuccessor = recaLifecycle.valid;
const isRecbp0Successor = recaLifecycle.phase.startsWith("rec_b_p0_");
const lifecycle = isGeo1dp0Successor ? geo1dp0Lifecycle : isRecdSuccessor ? recdLifecycle : isRecdp1Successor ? recdp1Lifecycle : isRecdp0Successor ? recdp0Lifecycle : isReccSuccessor ? reccLifecycle : isRecbSuccessor ? recbLifecycle : isReccp0Successor ? reccp0Lifecycle : isRecbp1Successor ? recbp1Lifecycle : isRecaSuccessor ? recaLifecycle : geoLifecycle;

check("lifecycle is exact candidate, frozen local, or exact recommendation successor", lifecycle.valid || isReccp0Successor || isRecdp0Successor || isRecdp1Successor || isRecdSuccessor || isGeo1dp0Successor, lifecycle);
check("baseline is the frozen pushed GEO-1C-P0 commit",
  git(["log", "-1", "--pretty=%s", GEO1C_BASELINE]) === GEO1C_BASELINE_SUBJECT);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("exact wildcard-free manifest",
  new Set(GEO1C_PATHS).size === GEO1C_PATHS.length
  && GEO1C_PATHS.every((file) => !/[?*]/.test(file) && !file.endsWith("/"))
  && lifecycle.manifest.every((file) => (isGeo1dp0Successor ? GEO1DP0_PATHS : isRecdSuccessor ? RECD_PATHS : isRecdp1Successor ? RECDP1_PATHS : isRecdp0Successor ? RECDP0_PATHS : isReccSuccessor ? RECC_PATHS : isRecbSuccessor ? RECB_PATHS : isReccp0Successor ? RECCP0_PATHS : isRecbp1Successor ? RECBP1_PATHS : isRecbp0Successor ? RECBP0_PATHS : isRecaSuccessor ? RECA_PATHS : GEO1C_PATHS).includes(file)), lifecycle.manifest);
check("every manifest path exists", GEO1C_PATHS.every((file) => fs.existsSync(path.join(root, file))));
const migrationDelta = lines(git(["diff", "--name-only", GEO1C_BASELINE, "--", "supabase/migrations"]));
check("no frozen migration is modified",
  // GEO-1D-P0 has exactly two legitimate migration states, and the committed delta differs between
  // them: as a candidate its migration is UNTRACKED (delta = the 6 frozen predecessors), and once
  // frozen it is TRACKED (delta = those same 6 plus exactly GEO1DP0_MIGRATION). Both are accepted
  // and nothing else is: any other extra entry lands in the predecessor partition and fails the
  // frozen allow-list, so no future migration and no count broadening can slip through.
  isGeo1dp0Successor ? (() => {
    const frozenPredecessors = [RECBP0_MIGRATION, RECBP1_MIGRATION, RECCP0_MIGRATION,
      RECCP1_MIGRATION, RECDP0_MIGRATION, RECDP1_MIGRATION];
    const candidateEntries = migrationDelta.filter((file) => file === GEO1DP0_MIGRATION);
    const predecessorEntries = migrationDelta.filter((file) => file !== GEO1DP0_MIGRATION);
    return predecessorEntries.length === 6
      && predecessorEntries.every((file) => frozenPredecessors.includes(file))
      && candidateEntries.length <= 1
      && migrationDelta.length === 6 + candidateEntries.length
      && GEO1DP0_PATHS.filter((file) => file.startsWith("supabase/migrations/")).length === 1
      && GEO1DP0_PATHS.includes(GEO1DP0_MIGRATION);
  })()
    : isRecdSuccessor || isRecdp1Successor ? migrationDelta.every((file) => file === RECBP0_MIGRATION || file === RECBP1_MIGRATION
      || file === RECCP0_MIGRATION || file === RECCP1_MIGRATION || file === RECDP0_MIGRATION || file === RECDP1_MIGRATION)
    :
  isRecdp0Successor ? migrationDelta.every((file) => file === RECBP0_MIGRATION || file === RECBP1_MIGRATION
      || file === RECCP0_MIGRATION || file === RECCP1_MIGRATION || file === RECDP0_MIGRATION)
    : isReccSuccessor ? migrationDelta.every((file) => file === RECBP0_MIGRATION || file === RECBP1_MIGRATION
      || file === RECCP0_MIGRATION || file === RECCP1_MIGRATION)
    : isReccp0Successor ? migrationDelta.every((file) => file === RECBP0_MIGRATION || file === RECBP1_MIGRATION || file === RECCP0_MIGRATION)
    : isRecbp1Successor ? migrationDelta.every((file) => file === RECBP0_MIGRATION || file === RECBP1_MIGRATION)
    : isRecbp0Successor ? migrationDelta.every((file) => file === RECBP0_MIGRATION) : migrationDelta.length === 0);
check("dependency and lock bytes are unchanged",
  lines(git(["diff", "--name-only", GEO1C_BASELINE, "--", "apps/mobile/package.json", "package-lock.json"])).length === 0);
check("Production and deployment paths are untouched",
  !lifecycle.manifest.some((file) => /production|deploy|\.github\/workflows/i.test(file)));
check("predecessor edits are validation-only",
  GEO1C_PREDECESSOR_GUARDS.every((file) => file.endsWith("-guard.mjs"))
  && (isReccSuccessor || isRecbSuccessor || isReccp0Successor || isRecaSuccessor || isRecbp1Successor || isRecdp0Successor || isRecdp1Successor || isRecdSuccessor || isGeo1dp0Successor || GEO1C_PREDECESSOR_GUARDS.every((file) => lifecycle.manifest.includes(file))));
check("product manifest contains only integration surfaces",
  isReccSuccessor || isRecbSuccessor || isReccp0Successor || isRecaSuccessor || isRecbp1Successor || isRecdp0Successor || isRecdp1Successor || isRecdSuccessor || isGeo1dp0Successor || GEO1C_PRODUCT_PATHS.every((file) => lifecycle.manifest.includes(file)));

const auditedPaths = [...GEO1C_PRODUCT_PATHS, "supabase/config.toml"];
const sources = Object.fromEntries(auditedPaths.map((file) => [file, read(file)]));
const recommendationRepository = sources["apps/mobile/features/consumer-meals/adapters/supabaseConsumerNextMealRecommendationRepository.ts"];
const recommendationService = sources["apps/mobile/features/consumer-meals/consumerNextMealRecommendationService.ts"];
const recommendationMapper = sources["apps/mobile/features/next-meal-prototype/mapCanonicalToU1NextMeal.ts"];
const reccZeroNearbyPreserved = /if \(repoResult\.status === "empty"\) \{[\s\S]{0,260}?geoStatus,/.test(recommendationService)
  && /result\.geoStatus === "applied"/.test(recommendationMapper)
  && /if \(rows\.length === 0\) return \{ status: "empty" \};/.test(recommendationRepository);
const violations = auditGeo1cAuthoredSources(sources)
  .filter((violation) => !((isReccSuccessor || isRecbSuccessor || isReccp0Successor || isRecaSuccessor || isRecbp1Successor || isRecdp0Successor || isRecdp1Successor || isRecdSuccessor || isGeo1dp0Successor)
      && violation === "existing downstream calorie authority remains")
    && !(isReccSuccessor && reccZeroNearbyPreserved
      && violation === "zero nearby stays an applied empty result"));
if ((isReccSuccessor || isRecbSuccessor || isReccp0Successor || isRecaSuccessor || isRecbp1Successor || isRecdp0Successor || isRecdp1Successor || isRecdSuccessor || isGeo1dp0Successor) && !/rankNextMealCandidatesByNutrition/.test(recommendationRepository)) {
  violations.push("REC-A downstream nutrition authority is missing");
}
if (isReccSuccessor || isRecdp0Successor || isRecdp1Successor || isRecdSuccessor || isGeo1dp0Successor) {
  const geoRead = recommendationRepository.indexOf("await this.readGeoRows(");
  const allergyGate = recommendationRepository.indexOf("this.applyAllergyEligibility(mapped)");
  const ingredientAvoidanceGate = recommendationRepository.indexOf("this.applyIngredientAvoidanceEligibility(");
  const nutritionRank = recommendationRepository.indexOf("rankNextMealCandidatesByNutrition(");
  const orderingPreserved = isRecdSuccessor || isGeo1dp0Successor
    ? geoRead >= 0 && geoRead < allergyGate && allergyGate < ingredientAvoidanceGate
      && ingredientAvoidanceGate < nutritionRank
    : geoRead >= 0 && geoRead < allergyGate && allergyGate < nutritionRank;
  if (!orderingPreserved) {
    violations.push("GEO must remain upstream of Allergy and Ingredient Avoidance eligibility and ranking");
  }
}
check("GEO-1C source contract has no violation", violations.length === 0, violations);

const packageJson = JSON.parse(read("package.json"));
check("every GEO-1C command is registered",
  GEO1C_NPM_KEYS.every((key) => typeof packageJson.scripts[key] === "string"
    && packageJson.scripts[key].includes("geo-recommendation-geo-1c")));
check("package gains only authorized successor commands and no dependency", isReccSuccessor || isRecbSuccessor || isReccp0Successor || isRecdp0Successor || isRecdp1Successor || isRecdSuccessor || isGeo1dp0Successor || (() => {
  const before = JSON.parse(git(["show", `${GEO1C_BASELINE}:package.json`]));
  const added = Object.keys(packageJson.scripts).filter((key) => !(key in before.scripts));
  const removed = Object.keys(before.scripts).filter((key) => !(key in packageJson.scripts));
  return removed.length === 0 && added.every((key) => GEO1C_NPM_KEYS.includes(key)
      || ((isRecaSuccessor || isRecbp1Successor) && RECA_NPM_KEYS.includes(key))
      || ((isRecbp0Successor || isRecbp1Successor) && RECBP0_NPM_KEYS.includes(key))
      || (isRecbp1Successor && RECBP1_NPM_KEYS.includes(key))
      || (isRecbSuccessor && RECB_NPM_KEYS.includes(key)))
    && JSON.stringify(packageJson.dependencies) === JSON.stringify(before.dependencies)
    && JSON.stringify(packageJson.devDependencies) === JSON.stringify(before.devDependencies);
})());

const config = read("supabase/config.toml");
check("authenticated Edge function is registered exactly once",
  (config.match(/\[functions\.next-meal-geo-candidates\]/g) ?? []).length === 1
  && /\[functions\.next-meal-geo-candidates\][\s\S]{0,400}?verify_jwt = true/.test(config));
check("GEO-1A and GEO-1C-P0 implementation bytes are unchanged",
  lines(git(["diff", "--name-only", GEO1C_BASELINE, "--",
    "supabase/functions/_shared/geo-api",
    "supabase/functions/_shared/restaurant-geocoding",
    "supabase/migrations/20260825010000_geo_shared_candidate_authority.sql",
    "supabase/migrations/20260826010000_restaurant_geocode_source_authority.sql"])).length === 0);
check("GEO-1B implementation bytes are unchanged",
  lines(git(["diff", "--name-only", GEO1C_BASELINE, "--", "apps/mobile/features/consumer-location"])).length === 0);
check("all manifest bytes are UTF-8 without NUL replacement or CRLF",
  GEO1C_PATHS.every((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    return !bytes.includes(0) && !bytes.toString("utf8").includes(String.fromCharCode(0xfffd))
      && !bytes.includes(Buffer.from("\r\n"));
  }));
check("no credential or connection URL is authored",
  !/(postgres(?:ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.|sb_secret_|sbp_)/
    .test(GEO1C_PRODUCT_PATHS.map(read).join("\n")));
if (lifecycle.phase !== "candidate" && !isReccSuccessor && !isRecbSuccessor && !isReccp0Successor && !isRecaSuccessor && !isRecbp1Successor && !isRecdp0Successor && !isRecdp1Successor && !isRecdSuccessor && !isGeo1dp0Successor) {
  check("freeze commit subject is exact", git(["log", "-1", "--pretty=%s"]) === GEO1C_COMMIT_SUBJECT);
}

const manifest = createGeo1cManifest((file) => fs.readFileSync(path.join(root, file)));
check("raw-byte manifest covers exact sorted paths",
  manifest.entries.length === GEO1C_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === GEO1C_PATHS[index]
    && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: "geo-recommendation-geo-1c-guard",
  lifecycle: lifecycle.phase,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  canonicalManifestSha256: manifest.aggregateSha256,
  migration: null,
  networkUsed: false,
  databaseUsed: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
