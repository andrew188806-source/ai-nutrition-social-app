#!/usr/bin/env node
import child from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  RA1CR1_BASELINE,
  RA1CR1_ORIGIN_MAIN,
  RA1CR1_PACKAGE_KEYS,
  RA1CR1_PATHS,
  RA1CR1_SUBJECT
} from "./platform-admin-ra-1c-r1-successor-manifest.mjs";
import {
  auditClosureSources,
  auditRepositoryRoleDefinitions,
  discoverRepositoryRoleDefinitions,
  readClosureSources
} from "./platform-admin-ra-1c-r1-contract.mjs";

const P0_MIGRATION = "supabase/migrations/20260904020000_platform_admin_branch_status_authority.sql";
const P0_SHA256 = "dac22c901da171d44b2f064024d10b00f31d78e9fe27f51341baca69a3b44f5a";
const git = (...args) => {
  try {
    return child.execFileSync("git", ["-c", "core.safecrlf=false", ...args],
      { encoding: "utf8", maxBuffer: 64e6 }).trim();
  } catch (error) {
    // Managed local runners can surface EPERM after a read-only git child exited successfully.
    if (error?.status === 0 && typeof error.stdout === "string") return error.stdout.trim();
    throw error;
  }
};
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
const head = git("rev-parse", "HEAD");
const candidate = head === RA1CR1_BASELINE;
const frozen = !candidate && git("rev-parse", "HEAD^") === RA1CR1_BASELINE
  && git("rev-list", "--count", `${RA1CR1_BASELINE}..HEAD`) === "1";
check("R1 is candidate or exactly one frozen successor commit", candidate || frozen, { head });
check("origin/main remains frozen", git("rev-parse", "origin/main") === RA1CR1_ORIGIN_MAIN);
check("branch remains main", git("branch", "--show-current") === "main");
const changed = [...new Set([...git("diff", "--name-only", RA1CR1_BASELINE).split(/\r?\n/),
  ...git("ls-files", "--others", "--exclude-standard").split(/\r?\n/)])].filter(Boolean).sort();
check("exact R1 path manifest", JSON.stringify(changed) === JSON.stringify(RA1CR1_PATHS), changed);
check("R1 deletes nothing", git("diff", "--name-only", "--diff-filter=D", RA1CR1_BASELINE) === "");
check("R1 changes no migration", git("diff", "--name-only", RA1CR1_BASELINE, "--", "supabase/migrations") === "");
check("P0 migration SHA-256 remains frozen",
  crypto.createHash("sha256").update(fs.readFileSync(P0_MIGRATION)).digest("hex") === P0_SHA256);
check("P1 application/runtime sources remain frozen", git("diff", "--name-only", RA1CR1_BASELINE, "--", "apps/admin-web") === "");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
for (const key of RA1CR1_PACKAGE_KEYS) check(`package script ${key}`, typeof packageJson.scripts?.[key] === "string");
for (const item of auditRepositoryRoleDefinitions(discoverRepositoryRoleDefinitions())) check(`inventory: ${item.name}`, item.pass, item.detail);
for (const item of auditClosureSources(readClosureSources())) check(`closure: ${item.name}`, item.pass);
if (frozen) check("frozen R1 subject is exact", git("show", "-s", "--format=%s", "HEAD") === RA1CR1_SUBJECT);
const failures = checks.filter((item) => !item.pass);
checks.forEach((item, index) => console.log(`${item.pass ? "PASS" : "FAIL"} ${index + 1} ${item.name}`));
console.log(JSON.stringify({ suite: "platform-admin-ra-1c-r1-guard", phase: candidate ? "candidate" : frozen ? "frozen" : "invalid",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, changedPaths: changed }, null, 2));
if (failures.length) process.exitCode = 1;
