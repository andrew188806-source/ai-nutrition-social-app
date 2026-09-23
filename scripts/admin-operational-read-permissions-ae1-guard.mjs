#!/usr/bin/env node
// ADMIN-AE1 guard: exact CURRENT operational read permissions for the accepted Admin MVP surfaces.
// Static + in-process route-resolution proof. No network, no Development access.
import assert from "node:assert/strict";
import { isExactAdminE1Successor, matchesE1Source, unexpectedSuccessorPaths } from "./admin-e1-historical-successor.mjs";
import child from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SUITE = "admin-operational-read-permissions-ae1-guard";
const BASELINE = "7b112ac3013873236a28e0b15281feda04a8ac79";
const MIGRATION = "supabase/migrations/20260920010000_admin_operational_read_permissions_ae1.sql";
const VOCAB = "apps/admin-web/auth/admin-current-permission-vocabulary.ts";
const REGISTRY = "apps/admin-web/auth/admin-route-registry.ts";
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");

const BASE = "admin_context.read";
const ADMIN_A = Object.freeze({
  "restaurant-branch-status": ["admin_restaurant_branch.status.write"],
  "audit-platform-memberships": ["admin_audit.read"]
});
// Accepted ADMIN-B/C routes -> their exact operational read key (A0 inventory sections 3 and 5).
const AE1_ROUTES = Object.freeze({
  "restaurants": "admin.restaurants.read",
  "restaurant-detail": "admin.restaurants.read",
  "restaurant-about": "admin.restaurants.about.read",
  "restaurant-contact": "admin.restaurants.contact.read",
  "restaurant-branches": "admin.restaurants.branches.read",
  "restaurant-branch-detail": "admin.restaurants.branches.read",
  "restaurant-branch-hours": "admin.restaurants.hours.read",
  "restaurant-branch-contact": "admin.restaurants.contact.read",
  "restaurant-branch-geo": "admin.restaurants.geo.read",
  "restaurant-branch-menu-items": "admin.restaurants.menu_items.read",
  "restaurant-menus": "admin.restaurants.menus.read",
  "restaurant-menu-detail": "admin.restaurants.menu.read",
  "restaurant-menu-items": "admin.restaurants.menu_items.read",
  "restaurant-menu-item-detail": "admin.restaurants.menu_item.read",
  "restaurant-item-nutrition": "admin.restaurants.menu_item.read",
  "menu-management": "admin.restaurants.menu_management.read",
  "menu-management-pending": "admin.restaurants.menu_management.pending.read",
  "menu-management-data-quality": "admin.restaurants.menu_management.data_quality.read",
  "nutrition-certification-pending": "admin.nutrition.certification.pending.read",
  "restaurant-item-allergens": "admin.restaurants.menu_item.read",
  "restaurant-item-certification": "admin.restaurants.menu_item.read",
  "social-policies": "admin.social.policies.read"
});
// ADMIN-B/C/D route that shares an AE1 key (tighter, never looser): reported, not a new activation.
const SHARED_DEFERRED_ROUTES = Object.freeze({ "restaurant-item-ingredients": "admin.restaurants.menu_item.read" });
const DASHBOARD_KEY = "admin.dashboard.counts.read";
const AE1_KEYS = Object.freeze([...new Set([...Object.values(AE1_ROUTES), DASHBOARD_KEY])].sort());
const PREDECESSOR_CURRENT = Object.freeze([
  "admin.management.permissions.read", "admin.management.read", "admin.management.staff.account.write",
  "admin.management.staff.console_admission.write", "admin.management.staff.delegation.write",
  "admin.management.staff.permission.write", "admin.management.staff.read", "admin_audit.read",
  "admin_context.read", "admin_restaurant_branch.status.write"
].sort());
const EXPECTED_CURRENT = Object.freeze([...PREDECESSOR_CURRENT, ...AE1_KEYS].sort());
const DEFERRED_PREFIXES = Object.freeze([
  "admin.business_development.", "admin.operations.", "admin.members.", "admin.social.reports.",
  "admin.nutrition.my_work.", "admin.nutrition.standards.", "admin.nutrition.assignment", "admin.nutrition.members.",
  "admin.engineering.", "admin.audit.", "admin.management.roles."
]);

function loadTypeScript(file, requireModule = () => { throw new Error(`Unexpected import from ${file}`); }) {
  const result = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file, reportDiagnostics: true
  });
  const errors = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(errors.map((item) => String(item.messageText)).join("\n"));
  const module = { exports: {} };
  new Function("exports", "module", "require", result.outputText)(module.exports, module, requireModule);
  return module.exports;
}

const checks = [];
function check(name, fn) {
  let pass = false, detail;
  try { fn(); pass = true; } catch (error) { detail = String(error?.message ?? error).split("\n")[0].slice(0, 300); }
  checks.push({ name, pass, ...(pass ? {} : { detail }) });
  console.log(`${pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}${pass ? "" : `\n     detail: ${detail}`}`);
}

let vocabulary, registry, current, routeAuthorization, navigation;
const loadError = (() => {
  try {
    vocabulary = loadTypeScript(VOCAB);
    current = loadTypeScript("apps/admin-web/auth/admin-current-permission-context.ts", (r) => {
      if (r === "./admin-current-permission-vocabulary") return vocabulary;
      throw new Error(`Unexpected import ${r}`);
    });
    registry = loadTypeScript(REGISTRY, (r) => {
      if (r === "./admin-current-permission-vocabulary") return vocabulary;
      throw new Error(`Unexpected import ${r}`);
    });
    routeAuthorization = loadTypeScript("apps/admin-web/auth/admin-route-authorization.ts", (r) => {
      if (r === "./admin-route-registry") return registry;
      if (r === "./admin-current-permission-context") return current;
      if (r === "./admin-current-permission-vocabulary") return vocabulary;
      throw new Error(`Unexpected import ${r}`);
    });
    navigation = loadTypeScript("apps/admin-web/auth/admin-navigation-visibility.ts", (r) => {
      if (r === "./admin-route-registry") return registry;
      if (r === "./admin-route-authorization") return routeAuthorization;
      throw new Error(`Unexpected import ${r}`);
    });
    return null;
  } catch (error) { return error; }
})();

const subject = "11111111-1111-4111-8111-111111111111";
const ctx = (permissions) => ({ state: "admin", subject, admissionAuthority: "staff", permissions });
const route = (id) => registry.ADMIN_ROUTE_REGISTRY.find((entry) => entry.id === id);
const decide = (id, permissions) => routeAuthorization.resolveAdminRouteAuthorization({
  requirement: routeAuthorization.resolveAdminRouteRequirement(route(id)),
  currentPermissionContext: ctx(permissions)
}).state;
const permissionStatus = (key) => registry.ADMIN_PERMISSION_REGISTRY.find((p) => p.key === key)?.status;

check("modules load (registry, vocabulary, route authorization, navigation)", () => { if (loadError) throw loadError; });

// Baseline drift, deliberately untouched (frozen management authority): the registry still lists these four
// management write keys as PLANNED although the database and the application vocabulary already treat them as CURRENT.
const BASELINE_REGISTRY_DRIFT = Object.freeze([
  "admin.management.staff.account.write", "admin.management.staff.console_admission.write",
  "admin.management.staff.delegation.write", "admin.management.staff.permission.write"
].sort());
check("exact CURRENT key set: application vocabulary == expected 26; registry CURRENT == vocabulary minus the unchanged baseline drift", () => {
  assert.equal(vocabulary.CURRENT_ADMIN_PERMISSION_KEYS.length, 26);
  assert.deepEqual([...vocabulary.CURRENT_ADMIN_PERMISSION_KEYS].sort(), EXPECTED_CURRENT);
  const registryCurrent = registry.ADMIN_PERMISSION_REGISTRY.filter((p) => p.status === "CURRENT").map((p) => p.key).sort();
  assert.equal(registryCurrent.length, 22);
  assert.deepEqual(EXPECTED_CURRENT.filter((k) => !registryCurrent.includes(k)), BASELINE_REGISTRY_DRIFT);
  assert.deepEqual(registryCurrent.filter((k) => !EXPECTED_CURRENT.includes(k)), []);
});
check("exactly 16 AE1 keys (15 route keys + 1 dashboard key) were promoted/added", () => {
  assert.equal(AE1_KEYS.length, 16);
  assert.equal(new Set(Object.values(AE1_ROUTES)).size, 15);
  for (const key of AE1_KEYS) assert.equal(permissionStatus(key), "CURRENT", key);
});
check("all other PLANNED registry keys stay PLANNED (65) and none belongs to a deferred family as CURRENT", () => {
  const planned = registry.ADMIN_PERMISSION_REGISTRY.filter((p) => p.status === "PLANNED");
  assert.equal(planned.length, 65);
  for (const p of registry.ADMIN_PERMISSION_REGISTRY) {
    if (DEFERRED_PREFIXES.some((prefix) => p.key.startsWith(prefix))) assert.equal(p.status, "PLANNED", p.key);
  }
  assert.equal(registry.ADMIN_PERMISSION_REGISTRY.length, 87);
});
check("no blanket / umbrella / wildcard permission exists in registry, vocabulary or migration", () => {
  const banned = /^(admin_all\.|platform_everything\.|admin\.read$|admin\.\*|admin\.restaurants\.all\.|admin\.operations\.all)/;
  for (const key of [...vocabulary.CURRENT_ADMIN_PERMISSION_KEYS, ...registry.ADMIN_PERMISSION_REGISTRY.map((p) => p.key)]) {
    assert.ok(!banned.test(key) && !/[*%]/.test(key), key);
  }
});
check("every accepted ADMIN-B/C route requires exactly its own CURRENT read key (no base fallback)", () => {
  for (const [id, key] of Object.entries(AE1_ROUTES)) {
    assert.deepEqual([...route(id).requiredPermissions], [key], id);
    const requirement = routeAuthorization.resolveAdminRouteRequirement(route(id));
    assert.equal(requirement.state, "current_permissions", id);
    assert.deepEqual([...requirement.permissions], [key], id);
  }
  assert.equal(Object.keys(AE1_ROUTES).length, 22);
});
check("base Admin without the exact key is DENIED on every AE1 route, and holding it allows exactly that route family", () => {
  for (const [id, key] of Object.entries(AE1_ROUTES)) {
    assert.equal(decide(id, [BASE]), "permission_denied", `${id} base`);
    assert.equal(decide(id, [BASE, key]), "allow_current_permission", `${id} exact`);
  }
});
check("cross-permission negative: holding key X never opens a route that needs key Y (no umbrella)", () => {
  for (const [id, key] of Object.entries(AE1_ROUTES)) {
    for (const other of AE1_KEYS) {
      if (other === key) continue;
      assert.equal(decide(id, [BASE, other]), "permission_denied", `${id} with ${other}`);
    }
    assert.equal(decide(id, [BASE, "admin_audit.read", "admin_restaurant_branch.status.write"]), "permission_denied", `${id} ADMIN-A keys`);
  }
});
check("shared-key deferred route (ingredients) is tightened, never loosened", () => {
  for (const [id, key] of Object.entries(SHARED_DEFERRED_ROUTES)) {
    assert.deepEqual([...route(id).requiredPermissions], [key]);
    assert.equal(decide(id, [BASE]), "permission_denied");
    assert.equal(route(id).availability, "NOT_ENABLED");
  }
});
check("dashboard hub stays a base-Admin landing; ADMIN-D makes the page LIVE while its counts key is not a route requirement", () => {
  assert.deepEqual([...route("dashboard").requiredPermissions], [BASE]);
  assert.equal(route("dashboard").availability, "LIVE");
  assert.equal(permissionStatus(DASHBOARD_KEY), "CURRENT");
  assert.match(registry.ADMIN_PERMISSION_REGISTRY.find((p) => p.key === DASHBOARD_KEY).description, /aggregate only/);
  for (const entry of registry.ADMIN_ROUTE_REGISTRY) assert.ok(!entry.requiredPermissions.includes(DASHBOARD_KEY), entry.id);
});
check("navigation: base Admin links none of the AE1 routes; the exact key links only its own routes", () => {
  const routeIds = Object.keys(AE1_ROUTES);
  const baseNav = navigation.deriveAdminNavigationVisibility(ctx([BASE]));
  assert.equal(baseNav.state, "ready");
  for (const id of routeIds) assert.ok(!baseNav.linkRouteIds.includes(id), id);
  const keyNav = navigation.deriveAdminNavigationVisibility(ctx([BASE, "admin.restaurants.read"]));
  for (const id of routeIds) assert.equal(keyNav.linkRouteIds.includes(id), AE1_ROUTES[id] === "admin.restaurants.read", id);
});
check("ADMIN-A routes keep their exact proven requirements and remain LIVE", () => {
  for (const [id, keys] of Object.entries(ADMIN_A)) {
    assert.deepEqual([...route(id).requiredPermissions], keys, id);
    assert.equal(route(id).availability, "LIVE", id);
    assert.equal(decide(id, [BASE]), "permission_denied", id);
    assert.equal(decide(id, [BASE, keys[0]]), "allow_current_permission", id);
  }
});
check("unrelated deferred routes are unchanged: still base fallback or PLANNED metadata (Business Development, Engineering, Members)", () => {
  for (const id of ["business-development", "business-development-prospects", "engineering", "engineering-health", "members", "member-detail", "social-reports", "nutrition-standards", "operations-campaigns"]) {
    const entry = route(id);
    assert.equal(entry.availability, "NOT_ENABLED", id);
    assert.equal(routeAuthorization.resolveAdminRouteRequirement(entry).state, "base_admin", id);
  }
});
check("registry deep-validation reports exactly the six pre-existing baseline errors and no new one", () => {
  assert.deepEqual([...registry.validateAdminIaRegistry()].sort(), [
    "CURRENT permission vocabulary is broader than repository authority",
    "management authority incorrectly enabled: management",
    "management authority incorrectly enabled: management-permissions",
    "management authority incorrectly enabled: management-security-log",
    "management authority incorrectly enabled: management-settings",
    "management authority incorrectly enabled: management-staff"
  ].sort());
});

const migration = read(MIGRATION);
const migrationCode = migration.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
check("migration is the exact additive successor (name, single file, predecessor untouched)", () => {
  assert.ok(fs.existsSync(path.join(ROOT, MIGRATION)));
  const all = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  assert.equal(all.at(-4), path.basename(MIGRATION));
  assert.equal(all.at(-3), "20260920020000_admin_restaurant_operational_read_foundation_b1.sql");
  assert.equal(all.at(-2), "20260920030000_admin_operational_review_queues_c.sql");
  assert.equal(all.at(-1), "20260921010000_admin_dashboard_social_policy_reads_d.sql");
  const holders = all.filter((f) => read(`supabase/migrations/${f}`).includes(DASHBOARD_KEY));
  assert.deepEqual(holders, [path.basename(MIGRATION), "20260921010000_admin_dashboard_social_policy_reads_d.sql"]);
});
check("migration inserts exactly the 16 keys with the privileged-lane shape and nothing else", () => {
  const inserted = [...migrationCode.matchAll(/\(\s*'([a-z][a-z0-9_.*%]*)',\s*'([A-Z_]+)'\s*\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(inserted, [...AE1_KEYS]);
  assert.match(migrationCode, /select v\.permission_key, 'active', 'current', v\.sensitivity_class, true, true, false, true, false, false/);
  assert.equal((migrationCode.match(/insert into /g) ?? []).length, 1);
  assert.match(migrationCode, /insert into admin_internal\.staff_permission_catalog/);
});
check("migration is catalogue-additive only: no update/delete/alter/create/drop/grant to client roles, no entitlement or delegation write", () => {
  assert.doesNotMatch(migrationCode, /\b(update|delete|truncate)\s+(from\s+)?admin_internal\./i);
  assert.doesNotMatch(migrationCode, /\b(create|drop|alter)\s+(or replace\s+)?(function|table|role|policy|trigger|view|schema)\b/i);
  assert.doesNotMatch(migrationCode, /insert into admin_internal\.staff_(permission_entitlements|permission_delegations|console_admission_grants|privileged_permission_grants|bundle)/i);
  assert.doesNotMatch(migrationCode, /\bto\s+(public|anon|authenticated|authenticator|service_role)\b/i);
  assert.doesNotMatch(migrationCode, /on_conflict|on conflict/i);
});
check("migration is fail-closed: predecessor count check, delta/shape/no-grant/no-umbrella postconditions, SET edge released", () => {
  for (const marker of ["ae1_predecessor_catalog_mismatch", "ae1_catalog_delta_mismatch", "ae1_new_key_shape_mismatch",
    "ae1_predecessor_rows_changed", "ae1_umbrella_permission_present", "ae1_unexpected_grant_present", "ae1_writer_set_edge_retained"]) {
    assert.ok(migrationCode.includes(marker), marker);
  }
  assert.match(migrationCode, /grant staff_authority_write_authority to postgres with admin false, inherit false, set true;/);
  assert.match(migrationCode, /revoke staff_authority_write_authority from postgres granted by postgres;/);
  assert.match(migrationCode, /^begin;/m); assert.match(migrationCode, /^commit;/m);
});

check("frozen authority and ADMIN-A code are untouched: changed paths are inside the exact AE1 allow-list", () => {
  const git = (...args) => child.execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const lines = (v) => v.split(/\r?\n/).filter(Boolean);
  const changed = new Set([...lines(git("diff", "--name-only", BASELINE)), ...lines(git("ls-files", "--others", "--exclude-standard"))]);
  const allowed = new Set([
    MIGRATION, VOCAB, REGISTRY, "package.json",
    "supabase/migrations/20260920020000_admin_restaurant_operational_read_foundation_b1.sql", "apps/admin-web/server/adminRestaurantRead.ts", "apps/admin-web/components/admin-shell/AdminOperationalPage.tsx", "apps/admin-web/components/admin-shell/AdminRestaurantViews.tsx", "apps/admin-web/app/admin/restaurants/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/about/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/contact/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/branches/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/branches/[branchId]/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/branches/[branchId]/contact/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/branches/[branchId]/hours/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/branches/[branchId]/geo/page.tsx", "scripts/admin-restaurant-branch-canonical-ui-b2-guard.mjs", "scripts/admin-restaurant-branch-canonical-ui-b2-mutations.mjs", "scripts/admin-restaurant-operational-read-foundation-b1-guard.mjs", "scripts/admin-restaurant-operational-read-foundation-b1-mutations.mjs", "scripts/admin-restaurant-operational-read-foundation-b1-postgres-apply.mjs",
    "scripts/pre-admin-hardening-h3-h4-guard.mjs", "scripts/pre-admin-hardening-h3-h4-postgres-apply.mjs",
    "scripts/restaurant-catalog-authoring-r2b-guard.mjs", "scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs",
    "scripts/restaurant-catalog-authoring-r2b-postgres-apply.mjs", "scripts/restaurant-owner-display-name-draft-visibility-r2e-postgres-apply.mjs",
    "scripts/admin-operational-read-permissions-ae1-guard.mjs",
    "scripts/admin-operational-read-permissions-ae1-mutations.mjs",
    "scripts/admin-operational-read-permissions-ae1-postgres-apply.mjs",
    "docs/admin-operational-surface-inventory.md", "docs/engineering-state-registers.md", "docs/engineering-handoff.md",
    "apps/admin-web/components/admin-shell/AdminMenuViews.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/items/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/nutrition/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/branches/[branchId]/menu-items/page.tsx", "scripts/admin-menu-canonical-ui-b3-guard.mjs", "scripts/admin-menu-canonical-ui-b3-mutations.mjs", "supabase/migrations/20260920030000_admin_operational_review_queues_c.sql", "apps/admin-web/server/adminReviewQueueRead.ts", "apps/admin-web/components/admin-shell/AdminQueueViews.tsx", "apps/admin-web/app/admin/restaurants/menu-management/page.tsx", "apps/admin-web/app/admin/restaurants/menu-management/pending/page.tsx", "apps/admin-web/app/admin/restaurants/menu-management/data-quality/page.tsx", "apps/admin-web/app/admin/nutrition/certification/pending/page.tsx", "scripts/admin-operational-review-queues-c-guard.mjs", "scripts/admin-operational-review-queues-c-mutations.mjs", "scripts/admin-operational-review-queues-c-postgres-apply.mjs", "scripts/admin-menu-canonical-ui-b3-guard.mjs", "scripts/admin-restaurant-branch-canonical-ui-b2-guard.mjs", "scripts/admin-restaurant-operational-read-foundation-b1-guard.mjs", "scripts/admin-restaurant-operational-read-foundation-b1-postgres-apply.mjs", "scripts/admin-operational-read-permissions-ae1-guard.mjs", "scripts/admin-operational-read-permissions-ae1-postgres-apply.mjs", "scripts/pre-admin-hardening-h3-h4-guard.mjs", "scripts/pre-admin-hardening-h3-h4-postgres-apply.mjs", "scripts/restaurant-catalog-authoring-r2b-guard.mjs", "scripts/restaurant-catalog-authoring-r2b-postgres-apply.mjs", "scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs", "scripts/restaurant-owner-display-name-draft-visibility-r2e-postgres-apply.mjs", "apps/admin-web/server/adminRestaurantRead.ts", "package.json", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/allergens/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/certification/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/page.tsx",
    "supabase/migrations/20260921010000_admin_dashboard_social_policy_reads_d.sql", "apps/admin-web/server/adminDashboardSocialRead.ts", "apps/admin-web/app/admin/page.tsx", "apps/admin-web/app/admin/social/policies/page.tsx", "scripts/admin-dashboard-social-policies-d-rules.mjs", "scripts/admin-dashboard-social-policies-d-guard.mjs", "scripts/admin-dashboard-social-policies-d-mutations.mjs", "scripts/admin-dashboard-social-policies-d-postgres-apply.mjs"
  ]);
  const outside = unexpectedSuccessorPaths(changed, allowed);
  assert.deepEqual(outside, []);
  assert.equal(git("cat-file", "-t", BASELINE), "commit");
});

const failures = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: SUITE, total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name), productionTouched: false, developmentTouched: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
