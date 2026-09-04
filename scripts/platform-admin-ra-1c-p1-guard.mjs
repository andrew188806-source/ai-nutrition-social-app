#!/usr/bin/env node
import child from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { BASELINE, ORIGIN_BASELINE, P0_MIGRATION, P0_SHA256, PATHS, SCRIPT_KEYS, SUBJECT, auditSources, readSources } from "./platform-admin-ra-1c-p1-contract.mjs";

const git = (...args) => {
  try { return child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], { encoding: "utf8", maxBuffer: 64e6 }).trim(); }
  catch (error) {
    // Managed local runners can report EPERM after a read-only git child exits 0; preserve its verified stdout.
    if (error?.status === 0 && typeof error.stdout === "string") return error.stdout.trim();
    throw error;
  }
};
const checks = [], check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
check("origin/main remains frozen", git("rev-parse", "origin/main") === ORIGIN_BASELINE);
check("P1 descends directly from frozen P0", git("merge-base", BASELINE, "HEAD") === BASELINE);
check("branch remains main", git("branch", "--show-current") === "main");
const changed = [...new Set([...git("diff", "--name-only", BASELINE).split(/\r?\n/),
  ...git("ls-files", "--others", "--exclude-standard").split(/\r?\n/)])].filter(Boolean).sort();
check("exact P1 path allowlist", JSON.stringify(changed) === JSON.stringify(PATHS), changed);
check("no deletion", git("diff", "--name-only", "--diff-filter=D", BASELINE) === "");
check("no P1 migration", changed.every((file) => !file.startsWith("supabase/migrations/")), changed);
const migration = fs.readFileSync(P0_MIGRATION);
check("P0 migration SHA-256 frozen", crypto.createHash("sha256").update(migration).digest("hex") === P0_SHA256);
check("P0 migration byte-identical to P0 commit", git("diff", "--name-only", BASELINE, "--", P0_MIGRATION) === "");
for (const file of ["docs/platform-admin-branch-status-ra-1c-p0.md", ...["contract", "development-acceptance", "guard", "mutations", "postgres-apply", "smoke"].map((name) => `scripts/platform-admin-ra-1c-p0-${name}.mjs`)]) {
  check(`P0 source frozen: ${file}`, git("diff", "--name-only", BASELINE, "--", file) === "");
}
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
for (const key of SCRIPT_KEYS) check(`package script ${key}`, typeof packageJson.scripts?.[key] === "string");
const developmentHarness = fs.readFileSync("scripts/platform-admin-ra-1c-p1-development-acceptance.mjs", "utf8");
check("Development harness is hard-pinned to synthetic branch B", developmentHarness.includes('TARGET_BRANCH = "synthetic-fixture-branch-b"')
  && developmentHarness.includes('TARGET_RESTAURANT = "synthetic-fixture-restaurant"'));
check("Development harness treats dev-branch-xinyi as protected observation", developmentHarness.includes('PROTECTED_BRANCH = "dev-branch-xinyi"')
  && !/requestBody\([^)]*PROTECTED_BRANCH|p_branch_id:\s*PROTECTED_BRANCH/.test(developmentHarness));
check("Development harness permits only HTTPS or exact HTTP loopback", developmentHarness.includes('["127.0.0.1", "localhost"].includes(baseUrl.hostname)')
  && developmentHarness.includes('baseUrl.protocol !== "https:"'));
check("Development harness has no direct branch update fallback", !/update\s+public\.restaurant_branches/i.test(developmentHarness));
for (const item of auditSources(readSources())) check(`source contract: ${item.name}`, item.pass);
const head = git("rev-parse", "HEAD");
if (head !== BASELINE) {
  check("frozen P1 has exactly one commit", git("rev-list", "--count", `${BASELINE}..HEAD`) === "1");
  check("frozen P1 parent is P0", git("rev-parse", "HEAD^") === BASELINE);
  check("frozen P1 subject", git("show", "-s", "--format=%s", "HEAD") === SUBJECT);
}
const failures = checks.filter((item) => !item.pass);
checks.forEach((item, index) => console.log(`${item.pass ? "PASS" : "FAIL"} ${index + 1} ${item.name}`));
console.log(JSON.stringify({ suite: "platform-admin-ra-1c-p1-guard", total: checks.length, passed: checks.length - failures.length,
  failed: failures.length, failures, changedPaths: changed }, null, 2));
if (failures.length) process.exitCode = 1;
