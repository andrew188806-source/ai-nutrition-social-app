#!/usr/bin/env node
// RA-2D-P1 smoke: every contract claim must hold against the frozen migration source, plus the
// structural facts that are about the repository rather than the SQL text.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  auditMigrationSource, readMigrationSource, readNormalized,
  D1_MIGRATION, D1_MIGRATION_SHA256, D1_FROZEN_MIGRATIONS, D1_BASELINE_MIGRATION_COUNT,
  D1_GOVERNED_ROLES, D1_INVENTORY, D1_OWNER_WRITERS, D1_ROLE,
  D1_FROZEN_SOLD_OUT_ROLE, D1_FROZEN_AVAILABILITY_ROLE, D1_FROZEN_PRICE_ROLE,
  D1_PACKAGE_KEYS, D1_PATHS, D1_PREVIEW_FIELDS, D1_AUDIT_COLUMNS, D1_MUTATION_ERRORS,
  D1_NEXT_VOCABULARY, D1_EXPECTED_VOCABULARY, D1_OWNER_COPY, D1_FORBIDDEN_COPY,
  D1_DISCONTINUED
} from "./restaurant-owner-visibility-ra-2d-p1-contract.mjs";
import {
  discoverRepositoryRoleDefinitions, auditRepositoryRoleDefinitions
} from "./platform-admin-ra-1c-r1-contract.mjs";
import { C1_GOVERNED_ROLES } from "./restaurant-owner-price-ra-2c-p1-contract.mjs";
import { RA2AP1_GOVERNED_ROLES } from "./restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs";
import { RA1CR1_GOVERNED_ROLES } from "./platform-admin-ra-1c-r1-successor-manifest.mjs";

const SUITE = "restaurant-owner-visibility-ra-2d-p1-smoke";
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
  sha(source) === D1_MIGRATION_SHA256, { expected: D1_MIGRATION_SHA256, actual: sha(source) });
for (const item of D1_FROZEN_MIGRATIONS) {
  check(`frozen predecessor migration is byte-identical: ${path.basename(item.path)}`,
    sha(readNormalized(root, item.path)) === item.sha256);
}

// --- every contract claim -------------------------------------------------------------------------
for (const claim of auditMigrationSource(source)) check(claim.name, claim.pass, claim.detail);

// --- repository structure -------------------------------------------------------------------------
const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql")).sort();
check("the round contributes exactly one forward migration",
  migrations.length === D1_BASELINE_MIGRATION_COUNT + 1, { count: migrations.length });
check("the new migration sorts last, after every predecessor",
  migrations[migrations.length - 1] === path.basename(D1_MIGRATION), migrations.slice(-4));
check("the round creates no schema and no table outside its own audit relation",
  !/create schema/i.test(source)
  && (source.match(/create table/gi) ?? []).length === 1
  && source.includes("create table restaurant_internal.branch_menu_item_visibility_audit_log"));

// --- the sealed role successor manifest -------------------------------------------------------------
const definitions = discoverRepositoryRoleDefinitions(root);
check("the repository CREATE ROLE inventory is exactly as this round claims",
  definitions.length === D1_INVENTORY.repositoryRoleDefinitions, { count: definitions.length });
check("each of the four Restaurant Owner writers is defined exactly once, in its own migration",
  D1_OWNER_WRITERS.every(({ role, migration }) =>
    definitions.filter((d) => d.role === role && d.migration === migration).length === 1),
  { expected: D1_OWNER_WRITERS, observed: definitions.filter((d) => /restaurant_owner_/.test(d.role)) });
const remainder = definitions.filter((d) => !D1_OWNER_WRITERS.some((w) => w.role === d.role));
check("removing the four Owner writers leaves exactly RA-1C-R1's adjudicated inventory",
  remainder.length === D1_INVENTORY.ra1cr1AdjudicatedRemainder, { remainder: remainder.length });
check("that remainder still passes RA-1C-R1's own disposition audit unchanged",
  auditRepositoryRoleDefinitions(remainder).every((c) => c.pass),
  auditRepositoryRoleDefinitions(remainder).filter((c) => !c.pass));
check("the governed manifest extends RA-2C-P1's by exactly one role",
  RA1CR1_GOVERNED_ROLES.length === D1_INVENTORY.ra1cr1Governed
  && RA2AP1_GOVERNED_ROLES.length === D1_INVENTORY.ra2ap1Governed
  && C1_GOVERNED_ROLES.length === D1_INVENTORY.ra2cGoverned
  && D1_GOVERNED_ROLES.length === C1_GOVERNED_ROLES.length + D1_INVENTORY.ra2dSuccessorRoles
  && D1_GOVERNED_ROLES.length === D1_INVENTORY.governedTotal,
  { r1: RA1CR1_GOVERNED_ROLES.length, r2a: RA2AP1_GOVERNED_ROLES.length,
    r2c: C1_GOVERNED_ROLES.length, r2d: D1_GOVERNED_ROLES.length });
check("this round's only new governed role is the visibility writer",
  D1_GOVERNED_ROLES.filter((r) => r.migration === D1_MIGRATION).length === 1
  && D1_GOVERNED_ROLES.some((r) => r.role === D1_ROLE && r.migration === D1_MIGRATION));
check("the governed manifest has no duplicate role",
  new Set(D1_GOVERNED_ROLES.map((r) => r.role)).size === D1_GOVERNED_ROLES.length);
check("every RA-2A/RA-2B/RA-2C governed entry survives into this manifest unedited",
  C1_GOVERNED_ROLES.every((prev) =>
    D1_GOVERNED_ROLES.some((r) => r.role === prev.role && r.migration === prev.migration))
  && D1_GOVERNED_ROLES.some((r) => r.role === D1_FROZEN_AVAILABILITY_ROLE)
  && D1_GOVERNED_ROLES.some((r) => r.role === D1_FROZEN_SOLD_OUT_ROLE)
  && D1_GOVERNED_ROLES.some((r) => r.role === D1_FROZEN_PRICE_ROLE));

// --- the transition contract, exercised as a predicate ----------------------------------------------
check("the next-selectable vocabulary is exactly available and hidden",
  D1_NEXT_VOCABULARY.length === 2 && D1_NEXT_VOCABULARY.includes("available")
  && D1_NEXT_VOCABULARY.includes("hidden") && !D1_NEXT_VOCABULARY.includes(D1_DISCONTINUED));
check("the expected-status vocabulary additionally admits discontinued for concurrency proof",
  D1_EXPECTED_VOCABULARY.length === 3 && D1_EXPECTED_VOCABULARY.includes(D1_DISCONTINUED));
check("the Owner-facing copy uses exactly the two approved phrases",
  D1_OWNER_COPY.available_to_hidden === "暫時隱藏" && D1_OWNER_COPY.hidden_to_available === "恢復顯示");
// The round document and the contract's own D1_FORBIDDEN_COPY data source are excluded on purpose:
// their job is to NAME the forbidden stronger-lifecycle phrases -- to disclaim them, or to define
// the list this very check scans against -- mirroring RA-2C-P1's billing disclaimer.
const DOC = "docs/restaurant-owner-visibility-ra-2d-p1.md";
const SELF = "scripts/restaurant-owner-visibility-ra-2d-p1-smoke.mjs";
const CONTRACT = "scripts/restaurant-owner-visibility-ra-2d-p1-contract.mjs";
check("none of the forbidden stronger-lifecycle phrases appear in any executable, user-facing artefact",
  D1_PATHS.filter((f) => f !== "package.json" && f !== DOC && f !== SELF && f !== CONTRACT).every((file) =>
    !D1_FORBIDDEN_COPY.some((phrase) => readNormalized(root, file).includes(phrase))));
check("the round document explicitly disclaims every forbidden stronger-lifecycle phrase",
  D1_FORBIDDEN_COPY.every((phrase) => readNormalized(root, DOC).includes(phrase))
  && /never uses/.test(readNormalized(root, DOC)));

// --- the projected shapes ---------------------------------------------------------------------------
check("the preview DTO carries branchSpecificStatus/Version and no actor or membership",
  D1_PREVIEW_FIELDS.includes("branchSpecificStatus") && D1_PREVIEW_FIELDS.includes("branchSpecificStatusVersion")
  && !D1_PREVIEW_FIELDS.some((f) => /actor|membership|auth|role|permission|restaurant/i.test(f)));
check("the audit columns record the menu item as well as the branch offering",
  D1_AUDIT_COLUMNS.includes("menu_item_id") && D1_AUDIT_COLUMNS.includes("branch_menu_item_id"));
check("the result vocabulary is the approved seven, including invalid_transition",
  D1_MUTATION_ERRORS.length === 7 && D1_MUTATION_ERRORS.includes("invalid_transition")
  && D1_MUTATION_ERRORS.includes("no_change") && D1_MUTATION_ERRORS.includes("stale_state"));

// --- packaging ---------------------------------------------------------------------------------------
const pkg = JSON.parse(readNormalized(root, "package.json"));
check("every package command this round declares exists and points at this round's script",
  D1_PACKAGE_KEYS.every((key) => typeof pkg.scripts?.[key] === "string"
    && pkg.scripts[key].includes("restaurant-owner-visibility-ra-2d-p1")),
  D1_PACKAGE_KEYS.filter((key) => !pkg.scripts?.[key]));
check("every file this round declares exists on disk",
  D1_PATHS.every((file) => fs.existsSync(path.join(root, file))),
  D1_PATHS.filter((file) => !fs.existsSync(path.join(root, file))));

// --- scope discipline --------------------------------------------------------------------------------
check("no ranking, scoring or recommendation-algorithm keyword appears in the migration",
  !/\bweight\b|\bscoring\b|\branking\b|geo_score|taste_score|meal_buddy_score/i.test(source));
check("no application, server or UI path is touched by this round's manifest",
  D1_PATHS.every((f) => !/^apps\//.test(f)));

console.log("\n" + JSON.stringify({
  suite: SUITE,
  status: failures.length === 0 ? "passed" : "failed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name)
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
