#!/usr/bin/env node
// GEO-1C-P0 guard — the real tree, measured against the canonical manifest.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child from "node:child_process";
import {
  GEO1CP0_BASELINE,
  GEO1CP0_BASELINE_SUBJECT,
  GEO1CP0_LIFECYCLE_STATES,
  GEO1CP0_MIGRATION,
  GEO1CP0_NPM_KEYS,
  GEO1CP0_PATHS,
  GEO1CP0_PREDECESSOR_GUARDS,
  GEO1CP0_PRODUCT_PATHS,
  auditGeo1cp0AuthoredSources,
  classifyGeo1cp0Lifecycle,
  createGeo1cp0Manifest
} from "./geo-coordinate-source-geo-1c-p0-successor-manifest.mjs";

const SUITE = "geo-coordinate-source-geo-1c-p0-guard";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const git = (args) => {
  const result = child.spawnSync("git", ["-c", "core.safecrlf=false", ...args],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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

const unstaged = lines(git(["diff", "--name-only", "--", ...GEO1CP0_PATHS]));
const untracked = lines(git(["ls-files", "--others", "--exclude-standard", "--", ...GEO1CP0_PATHS]));
const worktreePaths = [...new Set([...unstaged, ...untracked])].sort();
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const head = git(["rev-parse", "HEAD"]);
const originHead = git(["rev-parse", "origin/main"]);
const counts = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/).map(Number);
const deltaPaths = head === GEO1CP0_BASELINE ? [] : lines(git(["diff", "--name-only", `${GEO1CP0_BASELINE}..HEAD`]));
const lifecycle = classifyGeo1cp0Lifecycle({
  head,
  parent: head === GEO1CP0_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead,
  behind: counts[0],
  ahead: counts[1],
  worktreePaths,
  stagedPaths,
  deltaPaths,
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D", "--", ...GEO1CP0_PATHS])).length > 0
});

check("lifecycle is exact candidate or frozen-unpushed", lifecycle.valid, lifecycle.phase);
check("the baseline is the pushed GEO-1B authority",
  git(["log", "-1", "--pretty=%s", GEO1CP0_BASELINE]) === GEO1CP0_BASELINE_SUBJECT);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("exact wildcard-free path inventory",
  new Set(GEO1CP0_PATHS).size === GEO1CP0_PATHS.length
  && GEO1CP0_PATHS.every((file) => !file.includes("*") && !file.includes("?") && !file.endsWith("/"))
  && lifecycle.manifest.every((file) => GEO1CP0_PATHS.includes(file)), lifecycle.manifest);
check("every declared path exists on disk", GEO1CP0_PATHS.every((file) => fs.existsSync(path.join(root, file))));
check("exactly one narrow additive migration",
  lifecycle.manifest.filter((f) => f.startsWith("supabase/migrations/")).join("") === GEO1CP0_MIGRATION
  || lifecycle.manifest.length === 0);
check("no predecessor migration byte is modified",
  lines(git(["diff", "--name-only", GEO1CP0_BASELINE, "--", "supabase/migrations"]))
    .every((file) => file === GEO1CP0_MIGRATION));

// GEO-1C-P0 is a server round. It touches no Mobile byte at all, so the GEO-1B acquisition
// authority and every Social surface stay exactly where they were frozen.
check("no Mobile byte is touched at all",
  !lifecycle.manifest.some((file) => file.startsWith("apps/"))
  && lines(git(["diff", "--name-only", GEO1CP0_BASELINE, "--", "apps", "lib", "packages"])).length === 0);
check("the frozen GEO-1A shared contract and authority are byte-unchanged",
  lines(git(["diff", "--name-only", GEO1CP0_BASELINE, "--",
    "supabase/functions/_shared/geo-api",
    "supabase/migrations/20260825010000_geo_shared_candidate_authority.sql"])).length === 0);
check("no byte outside the GEO-1C-P0 manifest is touched",
  lines(git(["diff", "--name-only", GEO1CP0_BASELINE, "--"])).every((file) => GEO1CP0_PATHS.includes(file)));
check("the only product bytes are the geocoding authority and its dispatcher",
  GEO1CP0_PATHS.filter((file) => !file.startsWith("scripts/") && file !== "package.json"
    && file !== "supabase/config.toml")
    .every((file) => GEO1CP0_PRODUCT_PATHS.includes(file)));
check("every predecessor byte touched is a validation-only successor-awareness amendment",
  GEO1CP0_PREDECESSOR_GUARDS.every((file) => file.startsWith("scripts/")
    && (file.endsWith("-guard.mjs") || file.endsWith("-successor-manifest.mjs"))));

const sources = Object.fromEntries(
  GEO1CP0_PATHS.filter((file) => !file.startsWith("scripts/") && file !== "package.json")
    .map((file) => [file, read(file)])
);
const violations = auditGeo1cp0AuthoredSources(sources);
check("GEO-1C-P0 source contract has no violation", violations.length === 0, violations);

// --- the lifecycle vocabulary is exactly four, everywhere it appears ------------------------------
const migration = read(GEO1CP0_MIGRATION);
check("the canonical lifecycle is exactly four states",
  GEO1CP0_LIFECYCLE_STATES.length === 4
  && GEO1CP0_LIFECYCLE_STATES.every((state) => migration.includes(`'${state}'`)));
check("no fifth state is introduced anywhere in the authority",
  !/'stale'|'resolving'|'expired'|'refreshing'/.test(migration));

// --- registration and configuration ----------------------------------------------------------------
const configToml = read("supabase/config.toml");
check("the dispatcher is registered exactly once, without JWT verification",
  (configToml.match(/\[functions\.restaurant-geocode-dispatch\]/g) ?? []).length === 1
  && /\[functions\.restaurant-geocode-dispatch\][\s\S]{0,400}?verify_jwt = false/.test(configToml));
check("config.toml gains only the dispatcher registration",
  (() => {
    const before = git(["show", `${GEO1CP0_BASELINE}:supabase/config.toml`]);
    return configToml.startsWith(before.replace(/\s+$/, ""))
      && configToml.slice(before.replace(/\s+$/, "").length).includes("restaurant-geocode-dispatch");
  })());

const packageJson = JSON.parse(read("package.json"));
check("every GEO-1C-P0 command key is registered",
  GEO1CP0_NPM_KEYS.every((key) => typeof packageJson.scripts[key] === "string"
    && packageJson.scripts[key].includes("geo-coordinate-source-geo-1c-p0")));
check("root package.json gains only the GEO-1C-P0 command keys and no dependency",
  (() => {
    const before = JSON.parse(git(["show", `${GEO1CP0_BASELINE}:package.json`]));
    const added = Object.keys(packageJson.scripts).filter((key) => !(key in before.scripts));
    const removed = Object.keys(before.scripts).filter((key) => !(key in packageJson.scripts));
    return removed.length === 0 && added.every((key) => GEO1CP0_NPM_KEYS.includes(key))
      && JSON.stringify(packageJson.dependencies) === JSON.stringify(before.dependencies)
      && JSON.stringify(packageJson.devDependencies) === JSON.stringify(before.devDependencies);
  })());
check("no Mobile dependency is added for a server-side geocoder",
  git(["diff", "--name-only", GEO1CP0_BASELINE, "--", "apps/mobile/package.json", "package-lock.json"]) === "");

// --- the provider secret never reaches Mobile -------------------------------------------------------
const mobileTree = git(["ls-files", "apps/mobile", "lib", "packages"]).split("\n").filter(Boolean);
const mobileSource = mobileTree.filter((file) => /\.(ts|tsx|json)$/.test(file))
  .map((file) => read(file)).join("\n");
check("no geocoding provider or dispatch secret name appears anywhere in Mobile or shared source",
  !/RESTAURANT_GEOCODE_DISPATCH_SECRET|RESTAURANT_GEOCODING_PROVIDER|x-restaurant-geocode-dispatch/
    .test(mobileSource));
check("Mobile never imports the geocoding authority",
  !/restaurant-geocoding|restaurant-geocode-dispatch/.test(mobileSource));

// --- no consumer geocodes at request time ------------------------------------------------------------
const consumerEdge = git(["ls-files", "supabase/functions"]).split("\n").filter(Boolean)
  .filter((file) => !file.startsWith("supabase/functions/_shared/restaurant-geocoding/")
    && !file.startsWith("supabase/functions/restaurant-geocode-dispatch/"));
const consumerSource = consumerEdge.map((file) => read(file)).join("\n");
check("no recommendation or Social Edge function imports the geocoding authority",
  !/restaurant-geocoding|claim_branch_geocodes|complete_branch_geocode/.test(consumerSource));

// --- hygiene ------------------------------------------------------------------------------------------
check("all source bytes are UTF-8 text without NUL or a replacement character",
  GEO1CP0_PATHS.every((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    return !bytes.includes(0) && !bytes.toString("utf8").includes(String.fromCharCode(0xFFFD));
  }));
check("no authored byte carries a CRLF pair",
  GEO1CP0_PATHS.every((file) => !fs.readFileSync(path.join(root, file)).includes(Buffer.from("\r\n"))));
check("no credential or connection string is present",
  !/(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|sb_secret_|sbp_)/
    .test(GEO1CP0_PRODUCT_PATHS.map((file) => read(file)).join("\n")));
check("the migration is transactional",
  /^begin;/m.test(migration) && /^commit;/m.test(migration));

const manifest = createGeo1cp0Manifest((file) => fs.readFileSync(path.join(root, file)));
check("canonical raw-byte manifest covers the exact sorted paths",
  manifest.entries.length === GEO1CP0_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === GEO1CP0_PATHS[index] && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: SUITE,
  lifecycle: lifecycle.phase,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((f) => f.name),
  canonicalManifestSha256: manifest.aggregateSha256,
  migrationSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, GEO1CP0_MIGRATION))).digest("hex"),
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
