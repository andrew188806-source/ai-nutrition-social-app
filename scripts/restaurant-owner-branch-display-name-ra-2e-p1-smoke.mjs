#!/usr/bin/env node
// RA-2E-P1 smoke: every contract claim must hold against the frozen migration source, plus the
// structural facts that are about the repository rather than the SQL text.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  auditMigrationSource, readMigrationSource, readNormalized,
  E1_MIGRATION, E1_MIGRATION_SHA256, E1_FROZEN_MIGRATIONS, E1_BASELINE_MIGRATION_COUNT,
  E1_GOVERNED_ROLES, E1_INVENTORY, E1_ROLE, E1_PACKAGE_KEYS, E1_PATHS,
  E1_PREVIEW_FIELDS, E1_AUDIT_COLUMNS, E1_MUTATION_ERRORS,
  E1_MIN_LENGTH, E1_MAX_LENGTH, E1_NO_UNIQUENESS_CONSTRAINT, E1_NO_CASE_FOLDING,
  E1_NO_UNICODE_NORMALIZATION, E1_OUTER_TRIM_ONLY
} from "./restaurant-owner-branch-display-name-ra-2e-p1-contract.mjs";
import { discoverRepositoryRoleDefinitions } from "./platform-admin-ra-1c-r1-contract.mjs";
import { D1_GOVERNED_ROLES } from "./restaurant-owner-visibility-ra-2d-p1-contract.mjs";

const SUITE = "restaurant-owner-branch-display-name-ra-2e-p1-smoke";
const root = process.cwd();
const checks = []; const failures = [];
const check = (name, pass, detail) => {
  const result = { name, pass: Boolean(pass), ...(pass ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
};
const sha = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");

// --- the frozen source ----------------------------------------------------------------------------
const source = readMigrationSource(root);
check("the migration matches its pinned newline-normalized SHA-256",
  sha(source) === E1_MIGRATION_SHA256, { expected: E1_MIGRATION_SHA256, actual: sha(source) });
for (const item of E1_FROZEN_MIGRATIONS) {
  check(`frozen predecessor migration is byte-identical: ${path.basename(item.path)}`,
    sha(readNormalized(root, item.path)) === item.sha256);
}

// --- every contract claim -------------------------------------------------------------------------
for (const claim of auditMigrationSource(source)) check(claim.name, claim.pass, claim.detail);

// --- repository structure -------------------------------------------------------------------------
const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql")).sort();
check("the round contributes exactly one forward migration",
  migrations.length === E1_BASELINE_MIGRATION_COUNT + 1, { count: migrations.length });
check("the new migration sorts last, after every predecessor",
  migrations[migrations.length - 1] === path.basename(E1_MIGRATION), migrations.slice(-4));
check("the round creates no schema and no new table beyond its own audit relation",
  !/create schema/i.test(source)
  && (source.match(/create table/gi) ?? []).length === 1
  && source.includes("create table restaurant_internal.branch_display_name_audit_log"));

// --- the sealed role successor manifest -------------------------------------------------------------
const definitions = discoverRepositoryRoleDefinitions(root);
check("the repository CREATE ROLE inventory grew by exactly one",
  definitions.length === E1_INVENTORY.repositoryRoleDefinitionsAfter, { count: definitions.length });
check("this round's role is defined exactly once, in its own migration",
  definitions.filter((d) => d.role === E1_ROLE && d.migration === E1_MIGRATION).length === 1,
  definitions.filter((d) => d.role === E1_ROLE));
check("the governed manifest extends RA-2D-P1's by exactly one role",
  D1_GOVERNED_ROLES.length === E1_INVENTORY.ra2dGoverned
  && E1_GOVERNED_ROLES.length === D1_GOVERNED_ROLES.length + E1_INVENTORY.ra2eSuccessorRoles
  && E1_GOVERNED_ROLES.length === E1_INVENTORY.governedTotal,
  { d1: D1_GOVERNED_ROLES.length, e1: E1_GOVERNED_ROLES.length });
check("this round's only new governed role is the display-name writer",
  E1_GOVERNED_ROLES.filter((r) => r.migration === E1_MIGRATION).length === 1
  && E1_GOVERNED_ROLES.some((r) => r.role === E1_ROLE && r.migration === E1_MIGRATION));
check("the governed manifest has no duplicate role",
  new Set(E1_GOVERNED_ROLES.map((r) => r.role)).size === E1_GOVERNED_ROLES.length);
check("every RA-2A..D governed entry survives into this manifest unedited",
  D1_GOVERNED_ROLES.every((prev) =>
    E1_GOVERNED_ROLES.some((r) => r.role === prev.role && r.migration === prev.migration)));

// --- the plain-text canonical contract, exercised as a predicate ------------------------------------
check("the canonical length bound is exactly 1..80", E1_MIN_LENGTH === 1 && E1_MAX_LENGTH === 80);
check("no uniqueness constraint is claimed or required", E1_NO_UNIQUENESS_CONSTRAINT === true);
check("no case folding and no Unicode normalization are claimed", E1_NO_CASE_FOLDING === true
  && E1_NO_UNICODE_NORMALIZATION === true);
check("canonicalization is outer-trim only", E1_OUTER_TRIM_ONLY === true);
check("the migration contains no UNIQUE constraint on name",
  !/unique\s*\([^)]*\bname\b/i.test(source.replace(/^\s*--.*$/gm, "")));

// --- the projected shapes ---------------------------------------------------------------------------
check("the preview DTO carries displayName/Version and no actor or membership",
  E1_PREVIEW_FIELDS.includes("displayName") && E1_PREVIEW_FIELDS.includes("displayNameVersion")
  && !E1_PREVIEW_FIELDS.some((f) => /actor|membership|auth|role|permission/i.test(f)));
check("the audit columns record restaurant and branch identity",
  E1_AUDIT_COLUMNS.includes("restaurant_id") && E1_AUDIT_COLUMNS.includes("branch_id"));
check("the result vocabulary is the approved six",
  E1_MUTATION_ERRORS.length === 6 && E1_MUTATION_ERRORS.includes("no_change")
  && E1_MUTATION_ERRORS.includes("stale_state") && !E1_MUTATION_ERRORS.includes("invalid_transition"));

// --- packaging ---------------------------------------------------------------------------------------
const pkg = JSON.parse(readNormalized(root, "package.json"));
check("every package command this round declares exists and points at this round's script",
  E1_PACKAGE_KEYS.every((key) => typeof pkg.scripts?.[key] === "string"
    && pkg.scripts[key].includes("restaurant-owner-branch-display-name-ra-2e-p1")),
  E1_PACKAGE_KEYS.filter((key) => !pkg.scripts?.[key]));
check("every file this round declares exists on disk",
  E1_PATHS.every((file) => fs.existsSync(path.join(root, file))),
  E1_PATHS.filter((file) => !fs.existsSync(path.join(root, file))));

// --- scope discipline --------------------------------------------------------------------------------
check("no ranking, scoring or recommendation-algorithm keyword appears in the migration",
  !/\bweight\b|\bscoring\b|\branking\b|geo_score|taste_score|meal_buddy_score/i.test(source));
check("no application, server or UI path is touched by this round's manifest",
  E1_PATHS.every((f) => !/^apps\//.test(f)));
// The migration's own header comment explicitly NAMES restaurants.name/legal_name to disclaim them
// as out of scope -- exactly the disclaimer pattern RA-2C-P1 used for billing terms. Comments must
// be stripped before checking that no EXECUTABLE reference to them exists.
const sourceNoComments = source.replace(/^\s*--.*$/gm, "");
check("legal_name and restaurants.name are never referenced executably by this migration",
  !/legal_name/i.test(sourceNoComments) && !/\brestaurants\.name\b/i.test(sourceNoComments));
check("the migration's own comments explicitly disclaim restaurants.name and restaurants.legal_name",
  /restaurants\.name/.test(source) && /restaurants\.legal_name/.test(source));
check("no branch-menu-item identity column is referenced by this migration",
  !/branch_specific_name/i.test(source) && !/branch_specific_description/i.test(source));

console.log("\n" + JSON.stringify({
  suite: SUITE,
  status: failures.length === 0 ? "passed" : "failed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name)
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
