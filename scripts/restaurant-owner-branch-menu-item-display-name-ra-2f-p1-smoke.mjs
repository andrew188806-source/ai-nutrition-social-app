#!/usr/bin/env node
// RA-2F-P1 smoke: every contract claim must hold against the frozen migration source, plus the
// structural facts that are about the repository rather than the SQL text.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  auditMigrationSource, readMigrationSource, readNormalized,
  F1_MIGRATION, F1_MIGRATION_SHA256, F1_FROZEN_MIGRATIONS, F1_BASELINE_MIGRATION_COUNT,
  F1_GOVERNED_ROLES, F1_INVENTORY, F1_ROLE, F1_PACKAGE_KEYS, F1_PATHS,
  F1_PREVIEW_FIELDS, F1_AUDIT_COLUMNS, F1_NULLABLE_AUDIT_COLUMNS, F1_MUTATION_ERRORS,
  F1_OPERATIONS, F1_MIN_LENGTH, F1_MAX_LENGTH, F1_NO_UNIQUENESS_CONSTRAINT, F1_NO_CASE_FOLDING,
  F1_NO_UNICODE_NORMALIZATION, F1_OUTER_TRIM_ONLY, F1_CLEAR_STORES_NULL,
  F1_WHITESPACE_ONLY_SET_IS_INVALID
} from "./restaurant-owner-branch-menu-item-display-name-ra-2f-p1-contract.mjs";
import { discoverRepositoryRoleDefinitions } from "./platform-admin-ra-1c-r1-contract.mjs";
import { E1_GOVERNED_ROLES } from "./restaurant-owner-branch-display-name-ra-2e-p1-contract.mjs";

const SUITE = "restaurant-owner-branch-menu-item-display-name-ra-2f-p1-smoke";
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
  sha(source) === F1_MIGRATION_SHA256, { expected: F1_MIGRATION_SHA256, actual: sha(source) });
for (const item of F1_FROZEN_MIGRATIONS) {
  check(`frozen predecessor migration is byte-identical: ${path.basename(item.path)}`,
    sha(readNormalized(root, item.path)) === item.sha256);
}

// --- every contract claim -------------------------------------------------------------------------
for (const claim of auditMigrationSource(source)) check(claim.name, claim.pass, claim.detail);

// --- repository structure -------------------------------------------------------------------------
const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql")).sort();
check("the round contributes exactly one forward migration",
  migrations.length === F1_BASELINE_MIGRATION_COUNT + 1, { count: migrations.length });
check("the new migration sorts last, after every predecessor",
  migrations[migrations.length - 1] === path.basename(F1_MIGRATION), migrations.slice(-4));
check("the round creates no schema and no new table beyond its own audit relation",
  !/create schema/i.test(source)
  && (source.match(/create table/gi) ?? []).length === 1
  && source.includes("create table restaurant_internal.branch_menu_item_display_name_audit_log"));

// --- the sealed role successor manifest -------------------------------------------------------------
const definitions = discoverRepositoryRoleDefinitions(root);
check("the repository CREATE ROLE inventory grew by exactly one",
  definitions.length === F1_INVENTORY.repositoryRoleDefinitionsAfter, { count: definitions.length });
check("this round's role is defined exactly once, in its own migration",
  definitions.filter((d) => d.role === F1_ROLE && d.migration === F1_MIGRATION).length === 1,
  definitions.filter((d) => d.role === F1_ROLE));
check("the governed manifest extends RA-2E-P1's by exactly one role",
  E1_GOVERNED_ROLES.length === F1_INVENTORY.ra2eGoverned
  && F1_GOVERNED_ROLES.length === E1_GOVERNED_ROLES.length + F1_INVENTORY.ra2fSuccessorRoles
  && F1_GOVERNED_ROLES.length === F1_INVENTORY.governedTotal,
  { e1: E1_GOVERNED_ROLES.length, f1: F1_GOVERNED_ROLES.length });
check("this round's only new governed role is the display-name-override writer",
  F1_GOVERNED_ROLES.filter((r) => r.migration === F1_MIGRATION).length === 1
  && F1_GOVERNED_ROLES.some((r) => r.role === F1_ROLE && r.migration === F1_MIGRATION));
check("the governed manifest has no duplicate role",
  new Set(F1_GOVERNED_ROLES.map((r) => r.role)).size === F1_GOVERNED_ROLES.length);
check("every RA-2A..E governed entry survives into this manifest unedited",
  E1_GOVERNED_ROLES.every((prev) =>
    F1_GOVERNED_ROLES.some((r) => r.role === prev.role && r.migration === prev.migration)));

// --- the operation vocabulary and canonical text contract, exercised as a predicate ------------------
check("the operation vocabulary is exactly {set, clear}",
  F1_OPERATIONS.length === 2 && F1_OPERATIONS.includes("set") && F1_OPERATIONS.includes("clear"));
check("the canonical length bound is exactly 1..80", F1_MIN_LENGTH === 1 && F1_MAX_LENGTH === 80);
check("no uniqueness constraint is claimed or required", F1_NO_UNIQUENESS_CONSTRAINT === true);
check("no case folding and no Unicode normalization are claimed",
  F1_NO_CASE_FOLDING === true && F1_NO_UNICODE_NORMALIZATION === true);
check("canonicalization is outer-trim only", F1_OUTER_TRIM_ONLY === true);
check("CLEAR is claimed to store real SQL NULL", F1_CLEAR_STORES_NULL === true);
check("whitespace-only SET is claimed invalid, never clear/null/no_change",
  F1_WHITESPACE_ONLY_SET_IS_INVALID === true);
check("the migration contains no UNIQUE constraint on branch_specific_name",
  !/unique\s*\([^)]*\bbranch_specific_name\b/i.test(source.replace(/^\s*--.*$/gm, "")));

// --- the projected shapes ---------------------------------------------------------------------------
check("the preview DTO distinguishes the nullable override from the read-only canonical name",
  F1_PREVIEW_FIELDS.includes("branchSpecificDisplayName") && F1_PREVIEW_FIELDS.includes("canonicalDisplayName")
  && !F1_PREVIEW_FIELDS.some((f) => /actor|membership|auth|role|permission/i.test(f)));
check("the audit columns record the menu item as well as the branch offering",
  F1_AUDIT_COLUMNS.includes("menu_item_id") && F1_AUDIT_COLUMNS.includes("branch_menu_item_id"));
check("previous/next display-name are declared as the nullable pair",
  F1_NULLABLE_AUDIT_COLUMNS.length === 2
  && F1_NULLABLE_AUDIT_COLUMNS.includes("previous_display_name")
  && F1_NULLABLE_AUDIT_COLUMNS.includes("next_display_name"));
check("the result vocabulary is the approved six, and has no invalid_transition (not a lifecycle round)",
  F1_MUTATION_ERRORS.length === 6 && F1_MUTATION_ERRORS.includes("no_change")
  && F1_MUTATION_ERRORS.includes("stale_state") && !F1_MUTATION_ERRORS.includes("invalid_transition"));

// --- packaging ---------------------------------------------------------------------------------------
const pkg = JSON.parse(readNormalized(root, "package.json"));
check("every package command this round declares exists and points at this round's script",
  F1_PACKAGE_KEYS.every((key) => typeof pkg.scripts?.[key] === "string"
    && pkg.scripts[key].includes("restaurant-owner-branch-menu-item-display-name-ra-2f-p1")),
  F1_PACKAGE_KEYS.filter((key) => !pkg.scripts?.[key]));
check("every file this round declares exists on disk",
  F1_PATHS.every((file) => fs.existsSync(path.join(root, file))),
  F1_PATHS.filter((file) => !fs.existsSync(path.join(root, file))));

// --- scope discipline --------------------------------------------------------------------------------
check("no ranking, scoring or recommendation-algorithm keyword appears in the migration",
  !/\bweight\b|\bscoring\b|\branking\b|geo_score|taste_score|meal_buddy_score/i.test(source));
check("no application, server or UI path is touched by this round's manifest",
  F1_PATHS.every((f) => !/^apps\//.test(f)));
check("no allergen/nutrition keyword-claim logic exists in the migration (comments citing the scope "
  + "exclusion by example are not logic)",
  !/無花生|無麩質|純素|低鈉|高蛋白|vegan|allergen_claim/i.test(source.replace(/^\s*--.*$/gm, "")));
check("menu_items.name is never targeted by an UPDATE in this migration",
  !/update\s+public\.menu_items\b/i.test(source.replace(/^\s*--.*$/gm, "")));

console.log("\n" + JSON.stringify({
  suite: SUITE,
  status: failures.length === 0 ? "passed" : "failed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name)
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
