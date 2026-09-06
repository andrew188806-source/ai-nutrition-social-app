#!/usr/bin/env node
// RA-2H-P1 smoke: every contract claim must hold against the frozen migration source, plus the
// structural facts that are about the repository rather than the SQL text.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  auditMigrationSource, readMigrationSource, readNormalized,
  H1_MIGRATION, H1_MIGRATION_SHA256, H1_FROZEN_MIGRATIONS, H1_BASELINE_MIGRATION_COUNT,
  H1_ROLES, H1_INVENTORY, H1_PACKAGE_KEYS, H1_PATHS,
  H1_PERMISSION_KEYS, H1_WEEKLY_OPERATIONS, H1_SPECIAL_OPERATIONS, H1_CLOSURE_OPERATIONS,
  H1_EVALUATOR_STATES, H1_EVALUATOR_REASONS, H1_MUTATION_ERRORS, H1_CLOSURE_EXTRA_ERRORS,
  H1_WEEKDAY_MIN, H1_WEEKDAY_MAX, H1_MAX_INTERVALS_PER_WEEKDAY, H1_MAX_INTERVALS_PER_WEEK,
  H1_PUBLIC_FUNCTION_SIGNATURES
} from "./restaurant-owner-branch-temporal-ra-2h-p1-contract.mjs";
import { discoverRepositoryRoleDefinitions } from "./platform-admin-ra-1c-r1-contract.mjs";

const SUITE = "restaurant-owner-branch-temporal-ra-2h-p1-smoke";
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
  sha(source) === H1_MIGRATION_SHA256, { expected: H1_MIGRATION_SHA256, actual: sha(source) });
for (const item of H1_FROZEN_MIGRATIONS) {
  check(`frozen predecessor migration is byte-identical: ${path.basename(item.path)}`,
    sha(readNormalized(root, item.path)) === item.sha256);
}

// --- every contract claim -------------------------------------------------------------------------
for (const claim of auditMigrationSource(source)) check(claim.name, claim.pass, claim.detail);

// --- repository structure -------------------------------------------------------------------------
const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql")).sort();
check("the round contributes exactly one forward migration",
  migrations.length === H1_BASELINE_MIGRATION_COUNT + 1, { count: migrations.length });
check("the new migration sorts last, after every predecessor",
  migrations[migrations.length - 1] === path.basename(H1_MIGRATION), migrations.slice(-4));
check("the round creates exactly 10 new relations and no new schema",
  !/create schema/i.test(source) && (source.match(/create table/gi) ?? []).length === 10);

// --- the sealed role successor manifest -------------------------------------------------------------
const definitions = discoverRepositoryRoleDefinitions(root);
check("the repository CREATE ROLE inventory grew by exactly four",
  definitions.length === H1_INVENTORY.repositoryRoleDefinitionsAfter, { count: definitions.length });
for (const role of H1_ROLES) {
  check(`this round's role is defined exactly once, in its own migration: ${role}`,
    definitions.filter((d) => d.role === role && d.migration === H1_MIGRATION).length === 1,
    definitions.filter((d) => d.role === role));
}
check("this round's migration creates exactly four roles",
  definitions.filter((d) => d.migration === H1_MIGRATION).length === H1_INVENTORY.newRolesThisRound,
  definitions.filter((d) => d.migration === H1_MIGRATION));

// --- vocabularies, exercised as predicates ------------------------------------------------------
check("weekday bounds are exactly 1..7", H1_WEEKDAY_MIN === 1 && H1_WEEKDAY_MAX === 7);
check("weekly limits are exactly 8/day and 56/week",
  H1_MAX_INTERVALS_PER_WEEKDAY === 8 && H1_MAX_INTERVALS_PER_WEEK === 56);
check("weekly operation vocabulary is exactly REPLACE_WEEKLY_SCHEDULE|CLEAR_WEEKLY_SCHEDULE",
  H1_WEEKLY_OPERATIONS.length === 2);
check("special operation vocabulary is exactly SET_CLOSED|SET_CUSTOM_HOURS|CLEAR_OVERRIDE",
  H1_SPECIAL_OPERATIONS.length === 3);
check("closure operation vocabulary is exactly the 5 approved commands",
  H1_CLOSURE_OPERATIONS.length === 5);
check("evaluator state vocabulary is exactly OPEN|CLOSED|UNKNOWN", H1_EVALUATOR_STATES.length === 3);
check("evaluator reason vocabulary is exactly the 8 approved machine reasons", H1_EVALUATOR_REASONS.length === 8);
check("the mutation result vocabulary is the approved 6, plus 3 closure-only extras",
  H1_MUTATION_ERRORS.length === 6 && H1_CLOSURE_EXTRA_ERRORS.length === 3);
check("exactly 3 new permission keys, all under the branch.* namespace",
  H1_PERMISSION_KEYS.length === 3 && H1_PERMISSION_KEYS.every((k) => k.startsWith("branch.")));
check("exactly 7 public RPC signatures are declared", H1_PUBLIC_FUNCTION_SIGNATURES.length === 7);

// --- packaging ---------------------------------------------------------------------------------------
const pkg = JSON.parse(readNormalized(root, "package.json"));
check("every package command this round declares exists and points at this round's script",
  H1_PACKAGE_KEYS.every((key) => typeof pkg.scripts?.[key] === "string"
    && pkg.scripts[key].includes("restaurant-owner-branch-temporal-ra-2h-p1")),
  H1_PACKAGE_KEYS.filter((key) => !pkg.scripts?.[key]));
check("every file this round declares exists on disk",
  H1_PATHS.every((file) => fs.existsSync(path.join(root, file))),
  H1_PATHS.filter((file) => !fs.existsSync(path.join(root, file))));

// --- scope discipline --------------------------------------------------------------------------------
check("no ranking, scoring or recommendation-algorithm keyword appears in the migration",
  !/\bweight\b|\bscoring\b|\branking\b|geo_score|taste_score|meal_buddy_score/i.test(source));
check("no application, server or UI path is touched by this round's manifest",
  H1_PATHS.every((f) => !/^apps\//.test(f)));
check("no allergen/nutrition/GEO keyword-claim logic exists executably in the migration",
  !/無花生|無麩質|純素|低鈉|高蛋白|allergen_claim|latitude|longitude|geocode/i.test(source.replace(/^\s*--.*$/gm, "")));
check("menu_items/branch_menu_items are never targeted by an UPDATE in this migration",
  !/update\s+public\.(menu_items|branch_menu_items)\b/i.test(source.replace(/^\s*--.*$/gm, "")));
check("restaurant_branches.status/status_version are never targeted by an UPDATE in this migration",
  !/update\s+public\.restaurant_branches\s+set[^;]*\bstatus\b/i.test(source.replace(/^\s*--.*$/gm, "")));

console.log("\n" + JSON.stringify({
  suite: SUITE,
  status: failures.length === 0 ? "passed" : "failed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name)
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
