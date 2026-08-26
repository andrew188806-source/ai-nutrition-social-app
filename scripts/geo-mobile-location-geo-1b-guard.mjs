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

check("lifecycle is exact candidate or frozen-unpushed", lifecycle.valid, lifecycle.phase);
check("the baseline is the pushed GEO-1A authority",
  git(["log", "-1", "--pretty=%s", GEO1B_BASELINE]) === GEO1B_BASELINE_SUBJECT);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("exact wildcard-free path inventory",
  new Set(GEO1B_PATHS).size === GEO1B_PATHS.length
  && GEO1B_PATHS.every((file) => !file.includes("*") && !file.includes("?") && !file.endsWith("/"))
  && lifecycle.manifest.every((file) => GEO1B_PATHS.includes(file)), lifecycle.manifest);
check("every declared path exists on disk", GEO1B_PATHS.every((file) => fs.existsSync(path.join(root, file))));

// GEO-1B is a Mobile phase. It adds no migration and touches no server authority at all.
check("GEO-1B adds no migration and touches no server byte",
  lines(git(["diff", "--name-only", GEO1B_BASELINE, "--", "supabase"])).length === 0
  && !GEO1B_PATHS.some((file) => file.startsWith("supabase/")));
check("the frozen GEO-1A shared contract is byte-unchanged",
  lines(git(["diff", "--name-only", GEO1B_BASELINE, "--",
    "supabase/functions/_shared/geo-api", "supabase/migrations"])).length === 0);
check("no byte outside the GEO-1B manifest is touched",
  lines(git(["diff", "--name-only", GEO1B_BASELINE, "--"])).every((file) => GEO1B_PATHS.includes(file)));
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
check("GEO-1B source contract has no violation", violations.length === 0, violations);

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
check("root package.json gains only the GEO-1B command keys",
  (() => {
    const before = JSON.parse(git(["show", `${GEO1B_BASELINE}:package.json`]));
    const added = Object.keys(packageJson.scripts).filter((key) => !(key in before.scripts));
    const removed = Object.keys(before.scripts).filter((key) => !(key in packageJson.scripts));
    return removed.length === 0 && added.every((key) => GEO1B_NPM_KEYS.includes(key))
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
  lifecycle: lifecycle.phase,
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
