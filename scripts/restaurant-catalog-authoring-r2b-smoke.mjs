#!/usr/bin/env node
// R2B smoke: contract-vs-source agreement. No database. For every RPC this round adds, extracts
// its exact `create function ... (...)` parameter list from the migration source via regex and
// compares it, in order, against a hand-written expected contract -- not merely checking that the
// function name appears somewhere in the file.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const checks = [], failures = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
}

const FILES = {
  a: "supabase/migrations/20260918010000_restaurant_catalog_tenant_consistency_r2b_1.sql",
  b: "supabase/migrations/20260918020000_restaurant_owner_menu_authoring_authority_r2b_2.sql",
  c: "supabase/migrations/20260918030000_restaurant_owner_menu_category_authoring_authority_r2b_3.sql",
  d: "supabase/migrations/20260918040000_restaurant_owner_menu_item_authoring_authority_r2b_4.sql",
  e: "supabase/migrations/20260918050000_restaurant_owner_branch_menu_item_linkage_authority_r2b_5.sql",
};
const source = Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, read(p)]));

// Extract "create function public.NAME(\n  p_a type,\n  p_b type default null\n)" parameter names,
// in declared order, tolerant of the multi-line formatting this repository's migrations use.
function extractParams(text, functionName) {
  const marker = `create function public.${functionName}(`;
  const start = text.indexOf(marker);
  if (start === -1) return null;
  const close = text.indexOf(")\nreturns", start);
  if (close === -1) return null;
  const body = text.slice(start + marker.length, close);
  return body.split(",").map((line) => line.trim()).filter(Boolean)
    .map((line) => line.split(/\s+/)[0]);
}

const CONTRACT = {
  restaurant_owner_create_menu_v1: { file: "b", params: ["p_restaurant_id", "p_name"] },
  restaurant_owner_preview_menu_v1: { file: "b", params: ["p_restaurant_id", "p_menu_id"] },
  restaurant_owner_set_menu_name_v1: { file: "b", params: ["p_menu_id", "p_expected_name", "p_next_name", "p_expected_version"] },
  restaurant_owner_transition_menu_status_v1: { file: "b", params: ["p_menu_id", "p_expected_status", "p_next_status", "p_expected_version"] },
  restaurant_owner_create_menu_category_v1: { file: "c", params: ["p_menu_id", "p_name", "p_sort_order"] },
  restaurant_owner_preview_menu_category_v1: { file: "c", params: ["p_restaurant_id", "p_menu_category_id"] },
  restaurant_owner_set_menu_category_content_v1: { file: "c", params: ["p_menu_category_id", "p_expected_name", "p_next_name", "p_expected_sort_order", "p_next_sort_order", "p_expected_version"] },
  restaurant_owner_create_menu_item_v1: { file: "d", params: ["p_restaurant_id", "p_menu_category_id", "p_name", "p_description", "p_allergens"] },
  restaurant_owner_preview_menu_item_v1: { file: "d", params: ["p_restaurant_id", "p_menu_item_id"] },
  restaurant_owner_set_menu_item_content_v1: { file: "d", params: ["p_menu_item_id", "p_expected_name", "p_next_name", "p_expected_description", "p_next_description", "p_expected_allergens", "p_next_allergens", "p_expected_menu_category_id", "p_next_menu_category_id", "p_expected_version"] },
  restaurant_owner_transition_menu_item_status_v1: { file: "d", params: ["p_menu_item_id", "p_expected_status", "p_next_status", "p_expected_version"] },
  restaurant_owner_link_menu_item_to_branch_v1: { file: "e", params: ["p_branch_id", "p_menu_item_id", "p_price", "p_availability"] },
};

for (const [name, spec] of Object.entries(CONTRACT)) {
  const actual = extractParams(source[spec.file], name);
  check(actual !== null, `${name} is defined in its expected migration file`, { file: FILES[spec.file] });
  if (actual !== null) {
    check(JSON.stringify(actual) === JSON.stringify(spec.params),
      `${name} parameter list matches the contract exactly, in order`,
      { expected: spec.params, actual });
  }
}

// --- permission keys, roles, tables: source claims a 1:1 mapping to what the brief specified -----
const PERMISSION_ROLE = {
  "menu.write": { file: "b", role: "restaurant_owner_menu_write_authority" },
  "menu_category.write": { file: "c", role: "restaurant_owner_menu_category_write_authority" },
  "menu_item.write": { file: "d", role: "restaurant_owner_menu_item_write_authority" },
  "branch_menu_item.create": { file: "e", role: "restaurant_owner_branch_menu_item_creation_authority" },
};
for (const [key, spec] of Object.entries(PERMISSION_ROLE)) {
  const text = source[spec.file];
  check(text.includes(`'${key}'`), `permission key '${key}' is declared in its expected migration`);
  check(text.includes(`create role ${spec.role}`), `sealed role ${spec.role} is created in its expected migration`);
  check(new RegExp(`permission\\.permission_key = '${key.replace(".", "\\.")}'`).test(text),
    `${key} is actually checked (not merely mentioned in a CHECK widening) in its migration`);
}

// --- error-code vocabularies are bounded and match the brief's required semantics ------------------
const errorCodesOf = (text) => [...text.matchAll(/'errorCode',\s*'([a-z_]+)'/g)].map((m) => m[1]);
check(new Set(errorCodesOf(source.b)).size <= 8 &&
  ["unauthenticated", "invalid_request", "permission_denied", "target_not_found", "stale_state", "no_change", "invalid_transition"]
    .every((code) => errorCodesOf(source.b).includes(code)),
  "R2B-2 (menu) uses exactly the expected bounded error vocabulary");
check(errorCodesOf(source.c).includes("parent_unavailable"), "R2B-3 (category) returns parent_unavailable for an archived parent menu");
check(errorCodesOf(source.d).includes("invalid_transition"), "R2B-4 (item) returns invalid_transition for a disallowed status change");
check(errorCodesOf(source.e).includes("already_linked") && errorCodesOf(source.e).includes("parent_unavailable"),
  "R2B-5 (linkage) returns already_linked and parent_unavailable");

// --- lifecycle transitions are an explicit allow-list, not a free-form status update ---------------
check(/v_allowed :=/.test(source.b) && /v_allowed :=/.test(source.d),
  "both menu and item status-transition RPCs compute an explicit v_allowed predicate, not a free-form status write");
check(!/set status = p_next_status[\s\S]{0,40}where[\s\S]{0,120}(?!v_allowed)/.test(source.b.replace(/\s+/g, " ")) || source.b.includes("if not v_allowed then"),
  "R2B-2 rejects a transition before ever writing it");

// --- package.json registration ----------------------------------------------------------------------
const pkg = JSON.parse(read("package.json"));
const EXPECTED_SCRIPTS = [
  "test:restaurant-catalog-authoring-r2b-guard",
  "test:restaurant-catalog-authoring-r2b-smoke",
  "test:restaurant-catalog-authoring-r2b-postgres",
];
for (const key of EXPECTED_SCRIPTS)
  check(typeof pkg.scripts?.[key] === "string" && pkg.scripts[key].includes("restaurant-catalog-authoring-r2b"),
    `package.json declares ${key}`, pkg.scripts?.[key]);

console.log("\n" + JSON.stringify({
  suite: "restaurant-catalog-authoring-r2b-smoke",
  status: failures.length === 0 ? "passed" : "failed",
  total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name),
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
