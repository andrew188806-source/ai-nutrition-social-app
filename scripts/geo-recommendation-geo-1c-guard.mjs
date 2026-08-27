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
const lifecycle = classifyGeo1cLifecycle({
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

check("lifecycle is exact candidate or frozen local", lifecycle.valid, lifecycle);
check("baseline is the frozen pushed GEO-1C-P0 commit",
  git(["log", "-1", "--pretty=%s", GEO1C_BASELINE]) === GEO1C_BASELINE_SUBJECT);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("exact wildcard-free manifest",
  new Set(GEO1C_PATHS).size === GEO1C_PATHS.length
  && GEO1C_PATHS.every((file) => !/[?*]/.test(file) && !file.endsWith("/"))
  && lifecycle.manifest.every((file) => GEO1C_PATHS.includes(file)), lifecycle.manifest);
check("every manifest path exists", GEO1C_PATHS.every((file) => fs.existsSync(path.join(root, file))));
check("no migration is added or modified",
  lines(git(["diff", "--name-only", GEO1C_BASELINE, "--", "supabase/migrations"])).length === 0);
check("dependency and lock bytes are unchanged",
  lines(git(["diff", "--name-only", GEO1C_BASELINE, "--", "apps/mobile/package.json", "package-lock.json"])).length === 0);
check("Production and deployment paths are untouched",
  !lifecycle.manifest.some((file) => /production|deploy|\.github\/workflows/i.test(file)));
check("predecessor edits are validation-only",
  GEO1C_PREDECESSOR_GUARDS.every((file) => file.endsWith("-guard.mjs"))
  && GEO1C_PREDECESSOR_GUARDS.every((file) => lifecycle.manifest.includes(file)));
check("product manifest contains only integration surfaces",
  GEO1C_PRODUCT_PATHS.every((file) => lifecycle.manifest.includes(file)));

const auditedPaths = [...GEO1C_PRODUCT_PATHS, "supabase/config.toml"];
const sources = Object.fromEntries(auditedPaths.map((file) => [file, read(file)]));
const violations = auditGeo1cAuthoredSources(sources);
check("GEO-1C source contract has no violation", violations.length === 0, violations);

const packageJson = JSON.parse(read("package.json"));
check("every GEO-1C command is registered",
  GEO1C_NPM_KEYS.every((key) => typeof packageJson.scripts[key] === "string"
    && packageJson.scripts[key].includes("geo-recommendation-geo-1c")));
check("package gains only GEO-1C commands and no dependency", (() => {
  const before = JSON.parse(git(["show", `${GEO1C_BASELINE}:package.json`]));
  const added = Object.keys(packageJson.scripts).filter((key) => !(key in before.scripts));
  const removed = Object.keys(before.scripts).filter((key) => !(key in packageJson.scripts));
  return removed.length === 0 && added.every((key) => GEO1C_NPM_KEYS.includes(key))
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
if (lifecycle.phase !== "candidate") {
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
