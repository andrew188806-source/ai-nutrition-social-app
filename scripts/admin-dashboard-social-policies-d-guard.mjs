#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validateAdminD } from "./admin-dashboard-social-policies-d-rules.mjs";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const FILES = Object.freeze({
  migration: "supabase/migrations/20260921010000_admin_dashboard_social_policy_reads_d.sql",
  registry: "apps/admin-web/auth/admin-route-registry.ts",
  dashboard: "apps/admin-web/app/admin/page.tsx",
  social: "apps/admin-web/app/admin/social/policies/page.tsx",
  adapter: "apps/admin-web/server/adminDashboardSocialRead.ts",
  views: "apps/admin-web/components/admin-shell/AdminRestaurantViews.tsx"
});
const source = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));
const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, pass: true }); console.log(`PASS ${String(checks.length).padStart(2, "0")} ${name}`); }
  catch (error) { checks.push({ name, pass: false, detail: String(error.message).split("\n")[0] }); console.log(`FAIL ${String(checks.length).padStart(2, "0")} ${name}\n     detail: ${String(error.message).split("\n")[0]}`); }
}

check("shared ADMIN-D security and UI rules all pass", () => assert.deepEqual(validateAdminD(source), []));
check("the one ADMIN-D migration is additive, sorts after ADMIN-C, and no historical migration is edited by this guard", () => {
  const files = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
  assert.equal(files.length, 139);
  assert.deepEqual(files.slice(-2), ["20260920030000_admin_operational_review_queues_c.sql", path.basename(FILES.migration)]);
});
check("ADMIN-D scope is exactly dashboard and social-policies", () => {
  assert.match(source.registry, /id: "dashboard"[^\n]+availability: "LIVE"/);
  assert.match(source.registry, /id: "social-policies"[^\n]+availability: "LIVE"/);
  for (const id of ["operations", "social", "nutrition-certification"]) assert.doesNotMatch(source.registry, new RegExp(`id: "${id}"[^\\n]+availability: "LIVE"`));
});

const B = ["restaurants", "restaurant-detail", "restaurant-about", "restaurant-contact", "restaurant-branches", "restaurant-branch-detail", "restaurant-branch-contact", "restaurant-branch-hours", "restaurant-branch-geo", "restaurant-menus", "restaurant-menu-detail", "restaurant-menu-items", "restaurant-branch-menu-items", "restaurant-menu-item-detail", "restaurant-item-nutrition"];
const C = ["menu-management", "menu-management-pending", "menu-management-data-quality", "nutrition-certification-pending", "restaurant-item-allergens", "restaurant-item-certification"];
check("all 15 ADMIN-B and 6 ADMIN-C routes remain LIVE", () => {
  for (const id of [...B, ...C]) assert.match(source.registry, new RegExp(`id: "${id}"[^\\n]+availability: "LIVE"`), id);
});
check("legacy dashboard and tags roots remain present", () => {
  assert.ok(fs.existsSync(path.join(ROOT, "apps/admin-web/app/page.tsx")));
  assert.ok(fs.existsSync(path.join(ROOT, "apps/admin-web/app/tags/page.tsx")));
  assert.match(source.registry, /legacyRoutes: \[\{ route: "\/", semantics: "ONE_TO_ONE" \}\]/);
  assert.match(source.registry, /route: "\/tags", semantics: "SPLIT"/);
});
check("dashboard exposes only aggregate counts and no identity/private Social fields", () => {
  for (const banned of ["auth_user_id", "email", "user_id", "meal_buddy", "invitation", "nutritionist"]) assert.doesNotMatch(source.migration, new RegExp(banned, "i"));
  for (const bannedKey of ["message", "block"]) assert.doesNotMatch(source.migration, new RegExp(`[\\"']${bannedKey}[\\"']`, "i"));
});
check("Social projection is canonical, bounded and contains no user selections", () => {
  for (const field of ["tagKey", "namespace", "parentKey", "depth", "selectable", "displayOrder", "active", "labels"]) assert.ok(source.migration.includes(`'${field}'`), field);
  assert.doesNotMatch(source.migration, /social_profile_interest_selection|meal_buddy|candidate|matching_score/i);
});
check("UI and adapter contain no legacy mock imports or mutation controls", () => {
  const app = source.dashboard + source.social + source.adapter;
  assert.doesNotMatch(app, /mockTagReviews|mockRestaurant|legacy|\.insert\(|\.update\(|\.delete\(|onSubmit|<form|<button/i);
});
check("documentation records ADMIN-D Development acceptance and untouched Production", () => {
  for (const file of ["docs/admin-operational-surface-inventory.md", "docs/engineering-state-registers.md", "docs/engineering-handoff.md"]) {
    const text = read(file); assert.match(text, /ADMIN-D/); assert.match(text, /ADMIN_D_ACCEPTANCE_PASS/); assert.match(text, /31\/31/); assert.match(text, /Production (?:is |remains )?untouched/i);
  }
});

const failed = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "admin-dashboard-social-policies-d-guard", total: checks.length, passed: checks.length - failed.length, failed: failed.length, failures: failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
