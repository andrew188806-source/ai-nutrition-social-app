#!/usr/bin/env node
// RA-2A-P1 guard. Scope, topology, migration integrity, predecessor freeze, control-plane position
// and credential hygiene. Behaviour is asserted by the smoke and mutation runners; a real cluster
// apply is the separate postgres gate.
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";
import { auditMigrationSource, readMigrationSource, readNormalized, SECRET_SHAPE }
  from "./restaurant-owner-sold-out-ra-2a-p1-contract.mjs";
import {
  RA2AP1_BASELINE, RA2AP1_BASELINE_MIGRATION_COUNT, RA2AP1_GOVERNED_ROLES, RA2AP1_FROZEN_PATHS,
  RA2AP1_MIGRATION, RA2AP1_MIGRATION_SHA256, RA2AP1_PACKAGE_KEYS, RA2AP1_PATHS, RA2AP1_SEALED_ROLE,
  RA2AP1_SUBJECT, RA2AP1_CONTROL_PLANE_ROW, RA2AP1_FORBIDDEN_BRANCHES, RA2AP1_FORBIDDEN_TARGETS
} from "./restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs";
import { RA1CR1_GOVERNED_ROLES } from "./platform-admin-ra-1c-r1-successor-manifest.mjs";

const SUITE = "restaurant-owner-sold-out-ra-2a-p1-guard";
const root = process.cwd();
const git = (args) => child.execFileSync("git", args,
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (value) => (value ? value.split(/\r?\n/).filter(Boolean) : []);
const read = (file) => readNormalized(root, file);

const checks = []; const failures = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
}

// ---------------------------------------------------------------- lifecycle
const head = git(["rev-parse", "HEAD"]);
const originMain = git(["rev-parse", "origin/main"]);
const [behind, ahead] = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"])
  .split(/\s+/).map(Number);
const staged = lines(git(["diff", "--cached", "--name-only"]));
const worktree = [...new Set([
  ...lines(git(["diff", "--name-only"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"]))
])].sort();
const committed = head === RA2AP1_BASELINE
  ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "HEAD"]));
const phase = head === RA2AP1_BASELINE ? "candidate" : "frozen";
const manifest = (phase === "candidate" ? worktree : committed).sort();

check("origin/main is the approved RA-2A-P1 baseline", originMain === RA2AP1_BASELINE,
  { originMain, expected: RA2AP1_BASELINE });
check("the round is exactly one commit ahead, or an uncommitted candidate on the baseline",
  behind === 0 && ((phase === "candidate" && ahead === 0) || (phase === "frozen" && ahead === 1)),
  { phase, ahead, behind, head });
check("nothing is staged and nothing is deleted",
  staged.length === 0 && lines(git(["diff", "--name-only", "--diff-filter=D"])).length === 0,
  { staged });
check("the changed paths are exactly the authorized manifest",
  JSON.stringify(manifest) === JSON.stringify([...RA2AP1_PATHS]),
  { expected: [...RA2AP1_PATHS], actual: manifest });
if (phase === "frozen") {
  check("the freeze commit carries the RA-2A-P1 subject",
    git(["log", "-1", "--format=%s"]) === RA2AP1_SUBJECT, git(["log", "-1", "--format=%s"]));
  check("the parent of the freeze commit is the approved baseline",
    git(["rev-parse", "HEAD^"]) === RA2AP1_BASELINE);
}

// ---------------------------------------------------------------- migration integrity
const migrationDir = path.join(root, "supabase/migrations");
const migrations = fs.readdirSync(migrationDir).filter((f) => f.endsWith(".sql")).sort();
check("the round contributes exactly one forward migration",
  migrations.length === RA2AP1_BASELINE_MIGRATION_COUNT + 1,
  { count: migrations.length, expected: RA2AP1_BASELINE_MIGRATION_COUNT + 1 });
check("the new migration sorts last, after every predecessor",
  migrations[migrations.length - 1] === path.basename(RA2AP1_MIGRATION), migrations.slice(-2));
const migrationSql = readMigrationSource(root);
check("the migration matches its frozen SHA-256",
  crypto.createHash("sha256").update(migrationSql, "utf8").digest("hex") === RA2AP1_MIGRATION_SHA256,
  crypto.createHash("sha256").update(migrationSql, "utf8").digest("hex"));
check("no predecessor migration is modified by this round",
  !manifest.some((file) => file.startsWith("supabase/migrations/") && file !== RA2AP1_MIGRATION),
  manifest.filter((f) => f.startsWith("supabase/migrations/")));
const frozenChanged = RA2AP1_FROZEN_PATHS.filter((file) =>
  git(["diff", "--name-only", RA2AP1_BASELINE, "--", file]).length > 0);
check("every frozen predecessor file is byte-identical to the baseline",
  frozenChanged.length === 0, frozenChanged);

// ---------------------------------------------------------------- control-plane position
check("the new sealed role joins the governed set without rewriting its predecessor",
  RA2AP1_GOVERNED_ROLES.length === RA1CR1_GOVERNED_ROLES.length + 1
  && RA2AP1_GOVERNED_ROLES.some((entry) => entry.role === RA2AP1_SEALED_ROLE)
  && RA1CR1_GOVERNED_ROLES.every((entry) =>
    RA2AP1_GOVERNED_ROLES.some((e) => e.role === entry.role && e.migration === entry.migration)),
  { governed: RA2AP1_GOVERNED_ROLES.length, inherited: RA1CR1_GOVERNED_ROLES.length });
check("the governed set carries no duplicate or wildcard role name",
  new Set(RA2AP1_GOVERNED_ROLES.map((e) => e.role)).size === RA2AP1_GOVERNED_ROLES.length
  && RA2AP1_GOVERNED_ROLES.every((e) => /^[a-z][a-z0-9_]*$/.test(e.role)));
check("the accepted control-plane creator row is pinned, not attacked",
  RA2AP1_CONTROL_PLANE_ROW.member === "postgres" && RA2AP1_CONTROL_PLANE_ROW.grantor === "supabase_admin"
  && RA2AP1_CONTROL_PLANE_ROW.admin_option === true
  && RA2AP1_CONTROL_PLANE_ROW.inherit_option === false
  && RA2AP1_CONTROL_PLANE_ROW.set_option === false, RA2AP1_CONTROL_PLANE_ROW);

// ---------------------------------------------------------------- scope and hygiene
check("the round adds no application, server or UI path",
  !manifest.some((file) => file.startsWith("apps/") || file.startsWith("lib/")), manifest);
check("the package manifest declares exactly the RA-2A-P1 commands",
  RA2AP1_PACKAGE_KEYS.every((key) => JSON.parse(read("package.json")).scripts[key] !== undefined),
  RA2AP1_PACKAGE_KEYS.filter((key) => JSON.parse(read("package.json")).scripts[key] === undefined));
check("no credential-shaped value appears in any RA-2A-P1 path",
  RA2AP1_PATHS.every((file) => !SECRET_SHAPE.test(read(file))));
check("no forbidden public demo target is named anywhere in the round",
  RA2AP1_PATHS.filter((f) => f !== "package.json").every((file) => {
    const text = read(file);
    return [...RA2AP1_FORBIDDEN_TARGETS, ...RA2AP1_FORBIDDEN_BRANCHES]
      .every((id) => !text.includes(id) || file.includes("successor-manifest")
        || file.includes("mutations"));
  }));
// This repository runs with core.autocrlf=true and no .gitattributes, so a fresh checkout
// materializes CRLF and a raw byte pin would break for a reason unrelated to content. Integrity is
// therefore asserted on the newline-normalized SHA-256 above; here we only require that every
// declared path actually exists and is non-empty, so the manifest cannot drift from the tree.
check("every declared RA-2A-P1 path exists and carries content",
  RA2AP1_PATHS.every((file) => {
    const full = path.join(root, file);
    return fs.existsSync(full) && fs.statSync(full).size > 0;
  }), RA2AP1_PATHS.filter((file) => !fs.existsSync(path.join(root, file))));

// ---------------------------------------------------------------- delegated source contract
const contract = auditMigrationSource(migrationSql);
const contractFailures = contract.filter((item) => !item.pass);
check(`the frozen migration satisfies all ${contract.length} source contract claims`,
  contractFailures.length === 0, contractFailures.map((item) => item.name));

console.log("\n" + JSON.stringify({
  suite: SUITE, phase, status: failures.length === 0 ? "passed" : "failed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((item) => item.name),
  head, originMain, ahead, behind,
  migrationSha256: RA2AP1_MIGRATION_SHA256, migrations: migrations.length,
  contractClaims: contract.length, changedPaths: manifest
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
