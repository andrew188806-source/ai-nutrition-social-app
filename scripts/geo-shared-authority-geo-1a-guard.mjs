#!/usr/bin/env node
// GEO-1A guard — the real tree, measured against the canonical manifest.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child from "node:child_process";
import { GEO1B_NPM_KEYS, GEO1B_PATHS } from "./geo-mobile-location-geo-1b-successor-manifest.mjs";
import {
  GEO1A_BASELINE,
  GEO1A_BASELINE_SUBJECT,
  GEO1A_MIGRATION,
  GEO1A_NPM_KEYS,
  GEO1A_PATHS,
  GEO1A_PREDECESSOR_GUARDS,
  GEO1A_PRODUCT_PATHS,
  auditGeo1aAuthoredSources,
  classifyGeo1aLifecycle,
  createGeo1aManifest
} from "./geo-shared-authority-geo-1a-successor-manifest.mjs";
import { GEO1CP0_NPM_KEYS, GEO1CP0_PATHS } from "./geo-coordinate-source-geo-1c-p0-successor-manifest.mjs";
import { GEO1C_BASELINE, GEO1C_NPM_KEYS, GEO1C_PATHS, classifyGeo1cLifecycle } from "./geo-recommendation-geo-1c-successor-manifest.mjs";

const SUITE = "geo-shared-authority-geo-1a-guard";
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const git = (args) => {
  const result = child.spawnSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: root, encoding: "utf8" });
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
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
};

const unstaged = lines(git(["diff", "--name-only", "--", ...GEO1A_PATHS]));
const untracked = lines(git(["ls-files", "--others", "--exclude-standard", "--", ...GEO1A_PATHS]));
const worktreePaths = [...new Set([...unstaged, ...untracked])].sort();
const stagedPaths = lines(git(["diff", "--cached", "--name-only"]));
const head = git(["rev-parse", "HEAD"]);
const originHead = git(["rev-parse", "origin/main"]);
const counts = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/).map(Number);
const deltaPaths = head === GEO1A_BASELINE ? [] : lines(git(["diff", "--name-only", `${GEO1A_BASELINE}..HEAD`]));
const lifecycle = classifyGeo1aLifecycle({
  head,
  parent: head === GEO1A_BASELINE ? null : git(["rev-parse", "HEAD^"]),
  originHead,
  behind: counts[0],
  ahead: counts[1],
  worktreePaths,
  stagedPaths,
  deltaPaths,
  deleted: lines(git(["diff", "--name-only", "--diff-filter=D", "--", ...GEO1A_PATHS])).length > 0
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
const validationManifest = geo1cLifecycle.valid ? geo1cLifecycle.manifest : lifecycle.manifest;

check("lifecycle is exact candidate or frozen-unpushed", lifecycle.valid || geo1cLifecycle.valid,
  geo1cLifecycle.valid ? geo1cLifecycle.phase : lifecycle.phase);
check("the baseline is the pushed Social MVP closure commit",
  git(["log", "-1", "--pretty=%s", GEO1A_BASELINE]) === GEO1A_BASELINE_SUBJECT);
check("branch remains main", git(["branch", "--show-current"]) === "main");
check("nothing is staged", stagedPaths.length === 0, stagedPaths);
check("exact wildcard-free path inventory",
  new Set(GEO1A_PATHS).size === GEO1A_PATHS.length
  && GEO1A_PATHS.every((file) => !file.includes("*") && !file.includes("?"))
  && validationManifest.every((file) => GEO1A_PATHS.includes(file) || GEO1B_PATHS.includes(file)
    || GEO1CP0_PATHS.includes(file) || GEO1C_PATHS.includes(file)), validationManifest);
check("every declared path exists on disk", GEO1A_PATHS.every((file) => fs.existsSync(path.join(root, file))));
check("exactly one narrow additive migration",
  lifecycle.manifest.filter((f) => f.startsWith("supabase/migrations/") && !GEO1CP0_PATHS.includes(f))
    .join("") === GEO1A_MIGRATION
  || lifecycle.manifest.length === 0);
check("no predecessor migration byte is modified",
  lines(git(["diff", "--name-only", GEO1A_BASELINE, "--", "supabase/migrations"]))
    .every((file) => file === GEO1A_MIGRATION || GEO1CP0_PATHS.includes(file)));

// The Geo authority is a new, isolated surface: it may not edit any frozen Social, Taste, Mobile or
// restaurant byte. Everything it contributes is additive.
check("no byte outside the GEO-1A manifest is touched",
  lines(git(["diff", "--name-only", GEO1A_BASELINE, "--"]))
    .every((file) => GEO1A_PATHS.includes(file) || GEO1B_PATHS.includes(file)
      || GEO1CP0_PATHS.includes(file) || GEO1C_PATHS.includes(file)));
check("no Mobile byte is touched at all",
  validationManifest.filter((file) => file.startsWith("apps/"))
    .every((file) => GEO1B_PATHS.includes(file) || GEO1CP0_PATHS.includes(file) || GEO1C_PATHS.includes(file)));
// The product surface is exactly the authority and the shared contract. Everything else GEO-1A
// contributes is validation, and every predecessor file it touches is a GUARD taught to recognise
// this round — never a frozen Social, Taste or restaurant implementation byte.
check("the only product bytes are the Geo authority and the shared contract",
  GEO1A_PATHS.filter((file) => !file.startsWith("scripts/") && file !== "package.json")
    .every((file) => GEO1A_PRODUCT_PATHS.includes(file)));
check("every predecessor byte touched is a validation-only successor-awareness amendment",
  GEO1A_PREDECESSOR_GUARDS.every((file) => file.endsWith("-guard.mjs"))
  && lines(git(["diff", "--name-only", GEO1A_BASELINE, "--", "supabase", "apps", "packages", "lib"]))
    .every((file) => GEO1A_PRODUCT_PATHS.includes(file) || GEO1B_PATHS.includes(file)
      || GEO1CP0_PATHS.includes(file) || GEO1C_PATHS.includes(file)));

const sources = Object.fromEntries(
  GEO1A_PATHS.filter((file) => file !== "package.json").map((file) => [file, read(file)])
);
const violations = auditGeo1aAuthoredSources(sources);
check("GEO-1A source contract has no violation", violations.length === 0, violations);

const packageJson = JSON.parse(read("package.json"));
check("every GEO-1A command key is registered",
  GEO1A_NPM_KEYS.every((key) => typeof packageJson.scripts[key] === "string"
    && packageJson.scripts[key].includes("geo-shared-authority-geo-1a")));
check("package.json gains only the GEO-1A command keys",
  (() => {
    const before = JSON.parse(git(["show", `${GEO1A_BASELINE}:package.json`]));
    const added = Object.keys(packageJson.scripts).filter((key) => !(key in before.scripts));
    const removed = Object.keys(before.scripts).filter((key) => !(key in packageJson.scripts));
    return removed.length === 0
      && added.every((key) => GEO1A_NPM_KEYS.includes(key) || GEO1B_NPM_KEYS.includes(key)
        || GEO1CP0_NPM_KEYS.includes(key) || GEO1C_NPM_KEYS.includes(key));
  })());

// The replacement character is written as an escape, not as itself: a literal here would be found in
// this guard's own bytes and the check would fail on the act of performing it.
check("all source bytes are UTF-8 text without NUL or a replacement character",
  GEO1A_PATHS.every((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    return !bytes.includes(0) && !bytes.toString("utf8").includes(String.fromCharCode(0xFFFD));
  }));
check("no authored byte carries a CRLF pair",
  GEO1A_PATHS.every((file) => !fs.readFileSync(path.join(root, file)).includes(Buffer.from("\r\n"))));
// Scanned over PRODUCT source only. The validation harnesses necessarily spell out the very
// patterns a credential scan looks for, so including them would make this check fail on its own
// vocabulary rather than on a real secret.
const productSource = GEO1A_PATHS
  .filter((file) => !file.startsWith("scripts/") && file !== "package.json")
  .map((file) => read(file)).join("\n");
check("no credential or connection string is present",
  !/(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|sb_secret_|sbp_)/
    .test(productSource));

const manifest = createGeo1aManifest((file) => fs.readFileSync(path.join(root, file)));
check("canonical raw-byte manifest covers the exact sorted paths",
  manifest.entries.length === GEO1A_PATHS.length
  && manifest.entries.every((entry, index) => entry.path === GEO1A_PATHS[index] && /^[0-9a-f]{64}$/.test(entry.sha256)));

console.log("\n" + JSON.stringify({
  suite: SUITE,
  lifecycle: geo1cLifecycle.valid ? geo1cLifecycle.phase : lifecycle.phase,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((f) => f.name),
  canonicalManifestSha256: manifest.aggregateSha256,
  migrationSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, GEO1A_MIGRATION))).digest("hex"),
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
