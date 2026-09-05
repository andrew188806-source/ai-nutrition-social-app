#!/usr/bin/env node
// RA-2C-P1 smoke: every contract claim must hold against the frozen migration source, plus the
// structural facts that are about the repository rather than the SQL text.
//
// This suite is deliberately offline. It proves what the source says; `-postgres` proves what a real
// cluster does with it. Neither substitutes for the other, and the source claims exist mainly so the
// mutation suite has something precise to try to break.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  auditMigrationSource, readMigrationSource, readNormalized,
  C1_MIGRATION, C1_MIGRATION_SHA256, C1_FROZEN_MIGRATIONS, C1_BASELINE_MIGRATION_COUNT,
  C1_GOVERNED_ROLES, C1_INVENTORY, C1_OWNER_WRITERS, C1_ROLE,
  C1_FROZEN_SOLD_OUT_ROLE, C1_FROZEN_AVAILABILITY_ROLE,
  C1_PACKAGE_KEYS, C1_PATHS, C1_PREVIEW_FIELDS, C1_AUDIT_COLUMNS, C1_MUTATION_ERRORS,
  C1_MIN_PRICE, C1_MAX_PRICE, C1_NEXT_PRICE_PATTERN, C1_EXPECTED_PRICE_PATTERN
} from "./restaurant-owner-price-ra-2c-p1-contract.mjs";
import {
  discoverRepositoryRoleDefinitions, auditRepositoryRoleDefinitions
} from "./platform-admin-ra-1c-r1-contract.mjs";
import { RA2AP1_GOVERNED_ROLES } from "./restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs";
import { RA1CR1_GOVERNED_ROLES } from "./platform-admin-ra-1c-r1-successor-manifest.mjs";

const SUITE = "restaurant-owner-price-ra-2c-p1-smoke";
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
  sha(source) === C1_MIGRATION_SHA256, { expected: C1_MIGRATION_SHA256, actual: sha(source) });
for (const item of C1_FROZEN_MIGRATIONS) {
  check(`frozen predecessor migration is byte-identical: ${path.basename(item.path)}`,
    sha(readNormalized(root, item.path)) === item.sha256);
}

// --- every contract claim -------------------------------------------------------------------------
for (const claim of auditMigrationSource(source)) check(claim.name, claim.pass, claim.detail);

// --- repository structure -------------------------------------------------------------------------
const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql")).sort();
check("the round contributes exactly one forward migration",
  migrations.length === C1_BASELINE_MIGRATION_COUNT + 1, { count: migrations.length });
check("the new migration sorts last, after every predecessor",
  migrations[migrations.length - 1] === path.basename(C1_MIGRATION), migrations.slice(-3));
check("the round creates no schema or table outside its own audit relation",
  !/create schema/i.test(source)
  && (source.match(/create table/gi) ?? []).length === 1
  && source.includes("create table restaurant_internal.branch_menu_item_price_audit_log"));

// --- the sealed role successor manifest (section 9) ------------------------------------------------
const definitions = discoverRepositoryRoleDefinitions(root);
check("the repository CREATE ROLE inventory is exactly as this round claims",
  definitions.length === C1_INVENTORY.repositoryRoleDefinitions, { count: definitions.length });
check("each of the three Restaurant Owner writers is defined exactly once, in its own migration",
  C1_OWNER_WRITERS.every(({ role, migration }) =>
    definitions.filter((d) => d.role === role && d.migration === migration).length === 1),
  { expected: C1_OWNER_WRITERS, observed: definitions.filter((d) => /restaurant_owner_/.test(d.role)) });
const remainder = definitions.filter((d) => !C1_OWNER_WRITERS.some((w) => w.role === d.role));
check("removing the three Owner writers leaves exactly RA-1C-R1's adjudicated inventory",
  remainder.length === C1_INVENTORY.ra1cr1AdjudicatedRemainder, { remainder: remainder.length });
check("that remainder still passes RA-1C-R1's own disposition audit unchanged",
  auditRepositoryRoleDefinitions(remainder).every((c) => c.pass),
  auditRepositoryRoleDefinitions(remainder).filter((c) => !c.pass));
check("the governed manifest extends RA-2A's by RA-2B's unmanifested role plus exactly one of this round's",
  RA1CR1_GOVERNED_ROLES.length === C1_INVENTORY.ra1cr1Governed
  && RA2AP1_GOVERNED_ROLES.length === C1_INVENTORY.ra2ap1Governed
  && C1_GOVERNED_ROLES.length === RA2AP1_GOVERNED_ROLES.length
    + C1_INVENTORY.ra2bUnmanifestedRoles + C1_INVENTORY.ra2cSuccessorRoles
  && C1_GOVERNED_ROLES.length === C1_INVENTORY.governedTotal,
  { r1: RA1CR1_GOVERNED_ROLES.length, r2a: RA2AP1_GOVERNED_ROLES.length, r2c: C1_GOVERNED_ROLES.length });
check("this round's only new governed role is the price writer",
  C1_GOVERNED_ROLES.filter((r) => r.migration === C1_MIGRATION).length === 1
  && C1_GOVERNED_ROLES.some((r) => r.role === C1_ROLE && r.migration === C1_MIGRATION));
check("the governed manifest has no duplicate role",
  new Set(C1_GOVERNED_ROLES.map((r) => r.role)).size === C1_GOVERNED_ROLES.length);
check("every RA-2A and RA-2B governed entry survives into this manifest unedited",
  RA2AP1_GOVERNED_ROLES.every((prev) =>
    C1_GOVERNED_ROLES.some((r) => r.role === prev.role && r.migration === prev.migration))
  && C1_GOVERNED_ROLES.some((r) => r.role === C1_FROZEN_AVAILABILITY_ROLE)
  && C1_GOVERNED_ROLES.some((r) => r.role === C1_FROZEN_SOLD_OUT_ROLE));

// --- the canonical price contract, exercised as a predicate ----------------------------------------
const nextOk = new RegExp(C1_NEXT_PRICE_PATTERN);
const expectedOk = new RegExp(C1_EXPECTED_PRICE_PATTERN);
const accepted = ["1", "9", "150", "999999", "100000"];
const refused = ["0", "00", "0150", "-1", "-150", "150.5", "150.00", "1000000", "9999999", "",
  " 150", "150 ", "+150", "1e2", "1.5e2", "NaN", "Infinity", "0x96", "1,500", "NT$150", "150\n",
  "150; drop table public.branch_menu_items", "١٥٠"];
check(`every canonical whole-TWD amount from ${C1_MIN_PRICE} to ${C1_MAX_PRICE} is accepted`,
  accepted.every((v) => nextOk.test(v)), accepted.filter((v) => !nextOk.test(v)));
check("every non-canonical destination is refused, including zero, fractions and scientific notation",
  refused.every((v) => !nextOk.test(v)), refused.filter((v) => nextOk.test(v)));
check("the destination pattern is anchored, so no prefix or suffix can smuggle a value through",
  C1_NEXT_PRICE_PATTERN.startsWith("^") && C1_NEXT_PRICE_PATTERN.endsWith("$"));
check("the expected-price pattern admits a legacy zero, which the destination pattern must not",
  expectedOk.test("0") && expectedOk.test("0.00") && expectedOk.test("150.00")
  && !nextOk.test("0") && !nextOk.test("0.00"));
check("the expected-price pattern still refuses malformed input",
  ["", " ", "one", "1e2", "-1", "150.000", "NaN"].every((v) => !expectedOk.test(v)));

// --- the projected shapes ---------------------------------------------------------------------------
check("the preview DTO carries price and priceVersion and no actor or membership",
  C1_PREVIEW_FIELDS.includes("price") && C1_PREVIEW_FIELDS.includes("priceVersion")
  && !C1_PREVIEW_FIELDS.some((f) => /actor|membership|auth|role|permission|restaurant/i.test(f)));
check("the audit columns record the menu item as well as the branch offering",
  C1_AUDIT_COLUMNS.includes("menu_item_id") && C1_AUDIT_COLUMNS.includes("branch_menu_item_id"));
check("the result vocabulary is the approved six",
  C1_MUTATION_ERRORS.length === 6 && C1_MUTATION_ERRORS.includes("no_change")
  && C1_MUTATION_ERRORS.includes("stale_state") && C1_MUTATION_ERRORS.includes("invalid_request"));

// --- packaging ---------------------------------------------------------------------------------------
const pkg = JSON.parse(readNormalized(root, "package.json"));
check("every package command this round declares exists and points at this round's script",
  C1_PACKAGE_KEYS.every((key) => typeof pkg.scripts?.[key] === "string"
    && pkg.scripts[key].includes("restaurant-owner-price-ra-2c-p1")),
  C1_PACKAGE_KEYS.filter((key) => !pkg.scripts?.[key]));
check("every file this round declares exists on disk",
  C1_PATHS.every((file) => fs.existsSync(path.join(root, file))),
  C1_PATHS.filter((file) => !fs.existsSync(path.join(root, file))));

// --- product-scope discipline --------------------------------------------------------------------------
// RA-2C governs a branch menu price. No executable artefact may reach for, cite or encode a
// billing-side price. The round document is excluded on purpose: its job is to NAME those product
// areas in order to declare them out of scope, and a scan that forbade the words would forbid saying
// so. It is checked for the disclaimer instead.
const BILLING = /subscription|billing|payment|entitlement|crowdfund|early.?bird|founder|plan.?tier|invoice|stripe|checkout.?price/i;
const DOC = "docs/restaurant-owner-price-ra-2c-p1.md";
const SELF = "scripts/restaurant-owner-price-ra-2c-p1-smoke.mjs";
// This file is excluded from its own scan: the only place those words occur here is the pattern
// that enforces the rule.
for (const file of C1_PATHS.filter((f) => f !== "package.json" && f !== DOC && f !== SELF)) {
  const text = readNormalized(root, file);
  check(`no billing, subscription or entitlement pricing is referenced: ${path.basename(file)}`,
    !BILLING.test(text.replace(/^\s*--.*$/gm, "").replace(/^\s*\/\/.*$/gm, "")),
    (text.match(BILLING) ?? []).slice(0, 3));
}
// Markdown wraps, so collapse whitespace before asserting on prose.
const doc = readNormalized(root, DOC).replace(/\s+/g, " ");
check("the round document explicitly disclaims every billing-side pricing surface",
  /has no relationship to TastKind subscription pricing/i.test(doc)
  && /Billing \/ Subscription \/ Payment \/ Entitlement phase/i.test(doc)
  && /none of them is evidence or authority for/i.test(doc));
check("the round document states the change-scoped rule that keeps legacy rows writable",
  doc.includes("new.price is distinct from old.price") && /change-scoped/i.test(doc));

console.log("\n" + JSON.stringify({
  suite: SUITE,
  status: failures.length === 0 ? "passed" : "failed",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((f) => f.name)
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
