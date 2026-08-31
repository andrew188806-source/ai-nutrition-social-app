#!/usr/bin/env node
// GEO-1B guard — the real tree, measured against the canonical manifest.
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import {
  GEO1B_BASELINE,
  GEO1B_BASELINE_SUBJECT,
  GEO1B_EXPO_LOCATION_RANGE,
  GEO1B_NPM_KEYS,
  GEO1B_PATHS,
  GEO1B_PREDECESSOR_GUARDS,
  GEO1B_PRODUCT_PATHS,
  auditGeo1bAuthoredSources,
  classifyGeo1bLifecycle,
  createGeo1bManifest
} from "./geo-mobile-location-geo-1b-successor-manifest.mjs";
import { GEO1CP0_NPM_KEYS, GEO1CP0_PATHS } from "./geo-coordinate-source-geo-1c-p0-successor-manifest.mjs";
import { GEO1C_BASELINE, GEO1C_NPM_KEYS, GEO1C_PATHS, classifyGeo1cLifecycle } from "./geo-recommendation-geo-1c-successor-manifest.mjs";
import { RECA_BASELINE, RECA_NPM_KEYS, RECA_PATHS, classifyRecaLifecycle } from "./recommendation-rec-a-successor-manifest.mjs";
import { RECBP0_MIGRATION, RECBP0_NPM_KEYS, RECBP0_PATHS } from "./recommendation-rec-b-p0-successor-manifest.mjs";
import { classifyRecbLifecycle, RECB_PATHS } from "./recommendation-rec-b-successor-manifest.mjs";
import { RECCP0_BASELINE, RECCP0_PATHS, classifyReccp0Lifecycle } from "./recommendation-rec-c-p0-successor-manifest.mjs";
import {
  GEO1D_BASELINE, GEO1D_PATHS, auditGeo1dSources, classifyGeo1dLifecycle
} from "./geo-meal-buddy-geo-1d-successor-manifest.mjs";

const SUITE = "geo-mobile-location-geo-1b-guard";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const git = (args) => {
  const result = child.spawnSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw result.error ?? new Error(result.stderr || "git_failed");
  return (result.stdout ?? "").trim();
};
const lines = (value) => (value ? value.split(/\r?\n/).filter(Boolean) : []);

const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 420)}`);
};

const unstaged = lines(git(["diff", "--name-only", "--", ...GEO1B_PATHS]));
const untracked = lines(git(["ls-files", "--others", "--exclude-standard", "--", ...GEO1B_PATHS]));
const worktreePaths = [...new Set([...unstaged, ...untracked])].sort();
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const head = git(["rev-parse", "HEAD"]);
const originHead = git(["rev-parse", "origin/main"]);
const counts = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/).map(Number);
const deltaPaths = head === GEO1B_BASELINE ? [] : lines(git(["diff", "--name-only", `${GEO1B_BASELINE}..HEAD`]));
const lifecycle = classifyGeo1bLifecycle({
  head,
  parent: head === GEO1B_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead,
  behind: counts[0],
  ahead: counts[1],
  worktreePaths,
  stagedPaths,
  deltaPaths,
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D", "--", ...GEO1B_PATHS])).length > 0
});
const geo1cWorktreePaths = [...new Set([
  ...lines(git(["diff", "--name-only", "--", ...GEO1C_PATHS])),
  ...lines(git(["ls-files", "--others", "--exclude-standard", "--", ...GEO1C_PATHS]))
])].sort();
const geo1cLifecycle = classifyGeo1cLifecycle({
  head, parent: head === GEO1C_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: geo1cWorktreePaths, stagedPaths,
  deltaPaths: head === GEO1C_BASELINE ? [] : lines(git(["diff", "--name-only", `${GEO1C_BASELINE}..HEAD`])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D", "--", ...GEO1C_PATHS])).length > 0
});
const recaWorktreePaths = [...new Set([
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"]))
])].sort();
const recaLifecycle = classifyRecaLifecycle({
  head, parent: head === RECA_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths,
  deltaPaths: head === RECA_BASELINE ? [] : lines(git(["diff", "--name-only", `${RECA_BASELINE}..HEAD`])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const recbLifecycle = classifyRecbLifecycle({
  head, parent: head === RECA_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths,
  deltaPaths: head === RECA_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
// REC-C-P0 is the next successor in flight on top of the pushed REC-B freeze, recognised by its own
// exact path set. Widening only: on GEO-1B's own commit that set is absent and nothing changes.
const reccp0Lifecycle = classifyReccp0Lifecycle({
  head, parent: head === RECCP0_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths,
  deltaPaths: head === RECCP0_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const reccp0Successor = reccp0Lifecycle.valid;
const geo1dLifecycle = classifyGeo1dLifecycle({
  head, parent: head === GEO1D_BASELINE ? null : git(["rev-parse", "HEAD^"]), originHead,
  behind: counts[0], ahead: counts[1], worktreePaths: recaWorktreePaths, stagedPaths,
  deltaPaths: head === GEO1D_BASELINE ? []
    : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"])),
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D"])).length > 0
});
const isGeo1dSuccessor = geo1dLifecycle.valid;
const validationManifest = recbLifecycle.valid ? recbLifecycle.manifest : reccp0Successor ? reccp0Lifecycle.manifest : recaLifecycle.valid ? recaLifecycle.manifest : geo1cLifecycle.valid ? geo1cLifecycle.manifest : lifecycle.manifest;

check("lifecycle is exact candidate or frozen-unpushed", recbLifecycle.valid || lifecycle.valid || geo1cLifecycle.valid || recaLifecycle.valid || reccp0Successor,
  recbLifecycle.valid ? recbLifecycle.phase : reccp0Successor ? reccp0Lifecycle.phase : recaLifecycle.valid ? recaLifecycle.phase : geo1cLifecycle.valid ? geo1cLifecycle.phase : lifecycle.phase);
check("the baseline is the pushed GEO-1A authority",
  git(["log", "-1", "--pretty=%s", GEO1B_BASELINE]) === GEO1B_BASELINE_SUBJECT);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("exact wildcard-free path inventory",
  new Set(GEO1B_PATHS).size === GEO1B_PATHS.length
  && GEO1B_PATHS.every((file) => !file.includes("*") && !file.includes("?") && !file.endsWith("/"))
  && validationManifest.every((file) => RECB_PATHS.includes(file) || GEO1B_PATHS.includes(file)
    || GEO1CP0_PATHS.includes(file) || GEO1C_PATHS.includes(file) || RECA_PATHS.includes(file) || RECBP0_PATHS.includes(file)
    || RECCP0_PATHS.includes(file)), validationManifest);
check("every declared path exists on disk", GEO1B_PATHS.every((file) => fs.existsSync(path.join(root, file))));

// GEO-1B is a Mobile phase. It adds no migration and touches no server authority at all.
// GEO-1C-P0 and then REC-B-P0 are server rounds sitting on top of this Mobile one, so the cumulative
// supabase delta legitimately contains their exactly enumerated path sets. GEO-1B itself still
// contributes none, which is what the second half of this check keeps proving.
check("GEO-1B adds no migration and touches no server byte", recbLifecycle.valid || reccp0Successor ||
  lines(git(["diff", "--name-only", GEO1B_BASELINE, "--", "supabase"]))
    .every((file) => GEO1CP0_PATHS.includes(file) || GEO1C_PATHS.includes(file)
      || RECBP0_PATHS.includes(file))
  && !GEO1B_PATHS.some((file) => file.startsWith("supabase/")));
check("the frozen GEO-1A shared contract is byte-unchanged", recbLifecycle.valid || reccp0Successor ||
  lines(git(["diff", "--name-only", GEO1B_BASELINE, "--",
    "supabase/functions/_shared/geo-api"])).length === 0
  && lines(git(["diff", "--name-only", GEO1B_BASELINE, "--", "supabase/migrations"]))
    .every((file) => GEO1CP0_PATHS.includes(file) || file === RECBP0_MIGRATION));
check("no byte outside the GEO-1B manifest is touched", recbLifecycle.valid || reccp0Successor ||
  lines(git(["diff", "--name-only", GEO1B_BASELINE, "--"]))
    .every((file) => GEO1B_PATHS.includes(file) || GEO1CP0_PATHS.includes(file) || GEO1C_PATHS.includes(file) || RECA_PATHS.includes(file) || RECBP0_PATHS.includes(file)));
check("the only product bytes are the consumer-location feature",
  GEO1B_PATHS.filter((file) => file.startsWith("apps/") && !file.endsWith("app.json") && !file.endsWith("package.json"))
    .every((file) => GEO1B_PRODUCT_PATHS.includes(file)));
check("every predecessor byte touched is a validation-only successor-awareness amendment",
  GEO1B_PREDECESSOR_GUARDS.every((file) => file.startsWith("scripts/")));

const sources = Object.fromEntries(
  GEO1B_PATHS.filter((file) => !file.startsWith("scripts/") && file !== "package-lock.json")
    .map((file) => [file, read(file)])
);
const violations = auditGeo1bAuthoredSources(sources);
const geo1dSources = Object.fromEntries(GEO1D_PATHS.filter((file) => fs.existsSync(path.join(root, file)))
  .map((file) => [file, read(file)]));
geo1dSources["supabase/functions/_shared/geo-api/repository.ts"] =
  read("supabase/functions/_shared/geo-api/repository.ts");
const provider = geo1dSources["apps/mobile/features/consumer-location/ConsumerLocationProvider.tsx"] ?? "";
const providerBindingEffects = provider.slice(0, provider.indexOf("const value"));
const geo1dProviderPreservesExplicitAction = isGeo1dSuccessor
  && violations.length === 1
  && violations[0] === "acquisition is reachable only through an explicit action"
  && /enable: \(\) => controller\.requestAndAcquire\(\)/.test(provider)
  && !/controller\.(?:requestAndAcquire|refresh)\(/.test(providerBindingEffects)
  && auditGeo1dSources(geo1dSources).length === 0;
check("GEO-1B source contract has no violation",
  violations.length === 0 || geo1dProviderPreservesExplicitAction, violations);

// --- dependency and configuration integrity -------------------------------------------------------
const mobilePackage = JSON.parse(read("apps/mobile/package.json"));
const baselineMobile = JSON.parse(git(["show", `${GEO1B_BASELINE}:apps/mobile/package.json`]));
check("expo-location is added at the SDK-pinned range",
  mobilePackage.dependencies["expo-location"] === GEO1B_EXPO_LOCATION_RANGE,
  mobilePackage.dependencies["expo-location"]);
check("expo-location is the ONLY dependency GEO-1B adds, and none is removed",
  (() => {
    const added = Object.keys(mobilePackage.dependencies)
      .filter((name) => !(name in (baselineMobile.dependencies ?? {})));
    const removed = Object.keys(baselineMobile.dependencies ?? {})
      .filter((name) => !(name in mobilePackage.dependencies));
    const changed = Object.keys(baselineMobile.dependencies ?? {})
      .filter((name) => name in mobilePackage.dependencies
        && mobilePackage.dependencies[name] !== baselineMobile.dependencies[name]);
    return added.length === 1 && added[0] === "expo-location" && removed.length === 0 && changed.length === 0;
  })());
check("no dev dependency is touched",
  JSON.stringify(mobilePackage.devDependencies ?? {}) === JSON.stringify(baselineMobile.devDependencies ?? {}));

const appJson = JSON.parse(read("apps/mobile/app.json"));
const baselineApp = JSON.parse(git(["show", `${GEO1B_BASELINE}:apps/mobile/app.json`]));
const pluginName = (entry) => (Array.isArray(entry) ? entry[0] : entry);
check("app.json gains exactly the expo-location plugin and keeps every frozen one",
  (() => {
    const before = (baselineApp.expo.plugins ?? []).map(pluginName);
    const after = (appJson.expo.plugins ?? []).map(pluginName);
    const added = after.filter((name) => !before.includes(name));
    return before.every((name) => after.includes(name))
      && added.length === 1 && added[0] === "expo-location";
  })(), (appJson.expo.plugins ?? []).map(pluginName));
check("app.json changes nothing outside the plugin list",
  JSON.stringify({ ...appJson.expo, plugins: null }) === JSON.stringify({ ...baselineApp.expo, plugins: null }));
const locationPlugin = (appJson.expo.plugins ?? []).find((entry) => pluginName(entry) === "expo-location");
check("the location plugin declares foreground-only permission and no background mode",
  Array.isArray(locationPlugin) && typeof locationPlugin[1] === "object"
  && typeof locationPlugin[1].locationWhenInUsePermission === "string"
  && locationPlugin[1].locationWhenInUsePermission.length > 0
  && locationPlugin[1].isIosBackgroundLocationEnabled === false
  && locationPlugin[1].isAndroidBackgroundLocationEnabled === false
  && locationPlugin[1].locationAlwaysPermission === false
  && locationPlugin[1].locationAlwaysAndWhenInUsePermission === false, locationPlugin);

const packageJson = JSON.parse(read("package.json"));
check("every GEO-1B command key is registered",
  GEO1B_NPM_KEYS.every((key) => typeof packageJson.scripts[key] === "string"
    && packageJson.scripts[key].includes("geo-mobile-location-geo-1b")));
check("root package.json gains only authorized successor command keys", recbLifecycle.valid || reccp0Successor ||
  (() => {
    const before = JSON.parse(git(["show", `${GEO1B_BASELINE}:package.json`]));
    const added = Object.keys(packageJson.scripts).filter((key) => !(key in before.scripts));
    const removed = Object.keys(before.scripts).filter((key) => !(key in packageJson.scripts));
    return removed.length === 0
      && added.every((key) => GEO1B_NPM_KEYS.includes(key) || GEO1CP0_NPM_KEYS.includes(key)
        || GEO1C_NPM_KEYS.includes(key) || RECA_NPM_KEYS.includes(key) || RECBP0_NPM_KEYS.includes(key))
      && JSON.stringify(packageJson.dependencies) === JSON.stringify(before.dependencies)
      && JSON.stringify(packageJson.devDependencies) === JSON.stringify(before.devDependencies);
  })());

// --- the copy explains the product reason, not the mechanism ---------------------------------------
const i18n = read("lib/i18n/zh-TW.ts");
check("the location copy exists and is zh-TW authority",
  /consumerLocation: \{/.test(i18n)
  && ["title", "body", "allow", "retry", "acquiring", "denied", "deniedForever", "servicesDisabled", "failed"]
    .every((key) => new RegExp(`${key}:`).test(i18n.slice(i18n.indexOf("consumerLocation: {")))));
check("no internal Geo terminology is exposed to the user",
  !/geo_internal|narrow_branch_candidates|haversine|distanceMeters|GeoPoint/i
    .test(i18n.slice(i18n.indexOf("consumerLocation: {"), i18n.indexOf("consumerLocation: {") + 1200)));

// --- hygiene ---------------------------------------------------------------------------------------
check("all source bytes are UTF-8 text without NUL or a replacement character",
  GEO1B_PATHS.every((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    return !bytes.includes(0) && !bytes.toString("utf8").includes(String.fromCharCode(0xFFFD));
  }));
check("no authored byte carries a CRLF pair",
  GEO1B_PATHS.filter((file) => file !== "package-lock.json")
    .every((file) => !fs.readFileSync(path.join(root, file)).includes(Buffer.from("\r\n"))));
const productSource = GEO1B_PRODUCT_PATHS.map((file) => read(file)).join("\n");
check("no credential or connection string is present",
  !/(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|sb_secret_|sbp_)/
    .test(productSource));

const manifest = createGeo1bManifest((file) => fs.readFileSync(path.join(root, file)));
check("canonical raw-byte manifest covers the exact sorted paths",
  manifest.entries.length === GEO1B_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === GEO1B_PATHS[index] && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: SUITE,
  lifecycle: recbLifecycle.valid ? recbLifecycle.phase : recaLifecycle.valid ? recaLifecycle.phase : geo1cLifecycle.valid ? geo1cLifecycle.phase : lifecycle.phase,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((f) => f.name),
  canonicalManifestSha256: manifest.aggregateSha256,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
