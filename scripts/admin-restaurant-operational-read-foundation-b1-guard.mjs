#!/usr/bin/env node
// ADMIN-B1 guard: the Platform Admin Restaurant operational READ foundation. Static; no network, no Development access.
import assert from "node:assert/strict";
import child from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SUITE = "admin-restaurant-operational-read-foundation-b1-guard";
const BASELINE = "be6e0f2d91d5ea6ed47bcea94453009dd7ba5efe";
const MIGRATION = "supabase/migrations/20260920020000_admin_restaurant_operational_read_foundation_b1.sql";
const AE1_MIGRATION = "supabase/migrations/20260920010000_admin_operational_read_permissions_ae1.sql";
const REGISTRY = "apps/admin-web/auth/admin-route-registry.ts";
const VOCAB = "apps/admin-web/auth/admin-current-permission-vocabulary.ts";
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const READER = "staff_admin_restaurant_reader";

// Contract map (the canonical B1 inventory): function -> [exact permission key, kind, parent-validation fragment].
const CONTRACTS = Object.freeze({
  staff_admin_restaurant_list_v1: ["admin.restaurants.read", "list", null],
  staff_admin_restaurant_detail_v1: ["admin.restaurants.read", "one", "r.id = p_restaurant_id"],
  staff_admin_restaurant_about_v1: ["admin.restaurants.about.read", "one", "r.id = p_restaurant_id"],
  staff_admin_restaurant_contact_v1: ["admin.restaurants.contact.read", "one", "r.id = p_restaurant_id"],
  staff_admin_restaurant_branch_list_v1: ["admin.restaurants.branches.read", "list", "b.restaurant_id = p_restaurant_id"],
  staff_admin_restaurant_branch_detail_v1: ["admin.restaurants.branches.read", "one", "b.restaurant_id = p_restaurant_id"],
  staff_admin_restaurant_branch_contact_v1: ["admin.restaurants.contact.read", "one", "b.restaurant_id = p_restaurant_id"],
  staff_admin_restaurant_branch_hours_v1: ["admin.restaurants.hours.read", "one", "b.restaurant_id = p_restaurant_id"],
  staff_admin_restaurant_branch_geo_v1: ["admin.restaurants.geo.read", "one", "b.restaurant_id = p_restaurant_id"],
  staff_admin_restaurant_menu_list_v1: ["admin.restaurants.menus.read", "list", "mn.restaurant_id = p_restaurant_id"],
  staff_admin_restaurant_menu_detail_v1: ["admin.restaurants.menu.read", "one", "mn.restaurant_id = p_restaurant_id"],
  staff_admin_restaurant_menu_item_list_v1: ["admin.restaurants.menu_items.read", "list", "mi.restaurant_id = p_restaurant_id"],
  staff_admin_restaurant_menu_item_detail_v1: ["admin.restaurants.menu_item.read", "one", "mi.restaurant_id = p_restaurant_id"],
  staff_admin_restaurant_branch_menu_item_list_v1: ["admin.restaurants.menu_items.read", "list", "x.restaurant_id = p_restaurant_id"]
});
const B_ROUTES = Object.freeze({
  "restaurants": "admin.restaurants.read", "restaurant-detail": "admin.restaurants.read", "restaurant-about": "admin.restaurants.about.read",
  "restaurant-contact": "admin.restaurants.contact.read", "restaurant-branch-contact": "admin.restaurants.contact.read",
  "restaurant-branches": "admin.restaurants.branches.read", "restaurant-branch-detail": "admin.restaurants.branches.read",
  "restaurant-branch-hours": "admin.restaurants.hours.read", "restaurant-branch-geo": "admin.restaurants.geo.read",
  "restaurant-menus": "admin.restaurants.menus.read", "restaurant-menu-detail": "admin.restaurants.menu.read",
  "restaurant-menu-items": "admin.restaurants.menu_items.read", "restaurant-branch-menu-items": "admin.restaurants.menu_items.read",
  "restaurant-menu-item-detail": "admin.restaurants.menu_item.read", "restaurant-item-nutrition": "admin.restaurants.menu_item.read"
});

const checks = [];
function check(name, fn) {
  let pass = false, detail;
  try { fn(); pass = true; } catch (error) { detail = String(error?.message ?? error).split("\n")[0].slice(0, 300); }
  checks.push({ name, pass, ...(pass ? {} : { detail }) });
  console.log(`${pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}${pass ? "" : `\n     detail: ${detail}`}`);
}

const sql = read(MIGRATION);
const code = sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
// Function bodies keyed by name.
const bodies = new Map();
for (const match of code.matchAll(/create function ((?:public|admin_internal)\.[a-z_0-9]+)\(([\s\S]*?)\)\s*returns[\s\S]*?as \$\$([\s\S]*?)\$\$;/g)) {
  bodies.set(match[1], { header: match[0].slice(0, match[0].indexOf("as $$")), body: match[3], signature: match[2] });
}
const contractNames = Object.keys(CONTRACTS);

check("exact read-contract inventory: 14 public contracts + 2 private helpers, nothing else is created", () => {
  const created = [...bodies.keys()].sort();
  assert.deepEqual(created, [
    "admin_internal.staff_admin_restaurant_read_gate_v1", "admin_internal.staff_admin_restaurant_read_valid_id_v1",
    ...contractNames.map((n) => `public.${n}`)].sort());
  assert.equal((code.match(/create function /g) ?? []).length, 16);
  assert.equal((code.match(/create role /g) ?? []).length, 1);
  assert.doesNotMatch(code, /create (or replace )?(view|table|materialized view|trigger|schema|extension|type)\b/i);
});
check("every contract is SECURITY DEFINER, STABLE, search_path '' and row_security on (no INVOKER, no VOLATILE)", () => {
  for (const name of contractNames) {
    const { header } = bodies.get(`public.${name}`);
    assert.match(header, /\bstable\b/, name); assert.match(header, /security definer/, name);
    assert.match(header, /set search_path = ''/, name); assert.match(header, /set row_security = 'on'/, name);
    assert.doesNotMatch(header, /\bvolatile\b|security invoker/, name);
  }
});
check("exact permission per contract: the FIRST statement is the private gate with that one key; no admin_context.read fallback in any contract body", () => {
  for (const [name, [key]] of Object.entries(CONTRACTS)) {
    const { body } = bodies.get(`public.${name}`);
    const first = body.indexOf("if not admin_internal.staff_admin_restaurant_read_gate_v1('" + key + "') then");
    assert.ok(first > 0, `${name} missing gate for ${key}`);
    assert.equal((body.match(/staff_admin_restaurant_read_gate_v1\(/g) ?? []).length, 1, name);
    assert.ok(!/(^|[^a-z_])(select|from)\b/i.test(body.slice(0, first)), `${name}: data access before the gate`);
    assert.doesNotMatch(body, /admin_context\.read|staff_has_permission_v1|admin_context/, `${name} fallback`);
    assert.match(body.slice(first, first + 250), /return pg_catalog\.jsonb_build_object\('state', 'forbidden'\)/, name);
  }
});
check("the private gate requires BOTH admin_context.read and the exact key (no key substitution, no OR)", () => {
  const { body } = bodies.get("admin_internal.staff_admin_restaurant_read_gate_v1");
  assert.match(body, /public\.staff_has_permission_v1\('admin_context\.read'\)\s+and public\.staff_has_permission_v1\(p_permission_key\)/);
  assert.doesNotMatch(body, /\bor\b/i);
});
check("permission keys used are exactly the ten ADMIN-AE1 keys (no umbrella, no dashboard/menu_management/social key)", () => {
  const used = new Set(Object.values(CONTRACTS).map((c) => c[0]));
  assert.equal(used.size, 10);
  for (const k of used) assert.match(k, /^admin\.restaurants\.[a-z_.]+\.read$|^admin\.restaurants\.read$/);
  assert.doesNotMatch(code, /menu_management|dashboard|social\.policies|nutrition\.certification|admin_all|platform_everything/);
});
check("anon/PUBLIC cannot execute: every function is revoked from public/anon/authenticated/authenticator/service_role and only authenticated (contracts) or the sealed reader (helpers) is granted", () => {
  assert.match(code, /revoke all on function[\s\S]*?from public, anon, authenticated, authenticator, service_role, staff_admin_restaurant_reader;/);
  const grants = [...code.matchAll(/grant execute on function([\s\S]*?)\bto (\w+);/g)];
  const byTarget = Object.fromEntries(grants.map((m) => [m[2], m[1]]));
  assert.deepEqual(Object.keys(byTarget).sort(), ["authenticated", "staff_admin_restaurant_reader"]);
  for (const name of contractNames) assert.ok(byTarget.authenticated.includes(`public.${name}(`), name);
  assert.ok(!byTarget.authenticated.includes("admin_internal."));
  assert.ok(byTarget.staff_admin_restaurant_reader.includes("admin_internal.staff_admin_restaurant_read_gate_v1"));
  assert.doesNotMatch(code, /grant execute[\s\S]{0,400}?\bto (public|anon|service_role|authenticator)\b/i);
});
check("no raw client table access: only column-scoped SELECT grants to the sealed reader; no whole-table grant; no grant to any client role", () => {
  const statements = code.split(";").map((s) => s.trim()).filter(Boolean);
  const tableGrants = statements.filter((s) => /^grant\s/i.test(s) && /\son\s(table\s)?(public|admin_internal)\.[a-z_]+\sto\s/i.test(s.replace(/\([^)]*\)/g, "")) && !/^grant\s+execute\b/i.test(s));
  assert.equal(tableGrants.length, 15);
  for (const g of tableGrants) { assert.match(g, /^grant select \([a-z_, \n]+\)\s+on table public\.[a-z_]+ to staff_admin_restaurant_reader$/i, g.slice(0, 80)); }
  assert.doesNotMatch(code, /grant select on (table )?public\./i);
  assert.equal((code.match(/create policy staff_admin_restaurant_reader_select on public\.[a-z_]+ for select to staff_admin_restaurant_reader using \(true\);/g) ?? []).length, 15);
  assert.doesNotMatch(code, /(alter|drop) policy|(enable|disable|force|no force) row level security/i);
});
check("read-only: no write/DDL verb inside any contract body; the reader holds SELECT only; contracts never call another writer", () => {
  for (const [name, { body }] of bodies) assert.doesNotMatch(body, /(^|[^a-z_])(insert|update|delete|truncate|merge|alter|drop|create|grant|revoke|copy|call|perform|execute)[\s(]/i, name);
  assert.doesNotMatch(code, /grant (insert|update|delete|truncate|all|references|trigger)\b/i);
  assert.doesNotMatch(code, /restaurant_owner_|restaurant_internal_/); // no Owner-scoped function is called to bypass owner scope
});
check("bounded pagination: every list contract rejects limit outside 1..50 and offset outside 0..10000; default 20; total order; hasMore", () => {
  const lists = Object.entries(CONTRACTS).filter(([, c]) => c[1] === "list").map(([n]) => n);
  assert.equal(lists.length, 5);
  for (const name of lists) {
    const { body, signature } = bodies.get(`public.${name}`);
    assert.match(signature, /p_limit integer default 20, p_offset integer default 0/, name);
    assert.match(body, /v_limit not between 1 and 50/, name); assert.match(body, /v_offset not between 0 and 10000/, name);
    assert.match(body, /coalesce\(p_limit, 20\)/, name); assert.match(body, /limit v_limit \+ 1 offset v_offset/, name);
    assert.match(body, /- v_offset as ord/, name); assert.match(body, /'hasMore'/, name);
    assert.match(body, /order by[^\n]*collate "C"[^\n]*id collate "C"/, name);
    assert.doesNotMatch(body, /least\(|greatest\(/, `${name} clamps instead of rejecting`);
  }
  for (const [name, c] of Object.entries(CONTRACTS)) if (c[1] === "one") assert.doesNotMatch(bodies.get(`public.${name}`).body, /\blimit v_limit/, name);
});
check("cross-parent isolation: every child contract filters by BOTH the child id and the parent Restaurant id, and answers not_found otherwise", () => {
  for (const [name, [, , fragment]] of Object.entries(CONTRACTS)) {
    if (!fragment) continue;
    const { body } = bodies.get(`public.${name}`);
    assert.ok(body.includes(fragment), `${name} lacks ${fragment}`);
    assert.match(body, /'state', 'not_found'/, name);
  }
  const branchLevel = ["staff_admin_restaurant_branch_detail_v1", "staff_admin_restaurant_branch_contact_v1", "staff_admin_restaurant_branch_hours_v1", "staff_admin_restaurant_branch_geo_v1"];
  for (const name of branchLevel) assert.match(bodies.get(`public.${name}`).body, /b\.id = p_branch_id and b\.restaurant_id = p_restaurant_id/, name);
  assert.match(bodies.get("public.staff_admin_restaurant_menu_detail_v1").body, /mn\.id = p_menu_id and mn\.restaurant_id = p_restaurant_id/);
  assert.match(bodies.get("public.staff_admin_restaurant_menu_item_detail_v1").body, /mi\.id = p_menu_item_id and mi\.restaurant_id = p_restaurant_id/);
  assert.match(bodies.get("public.staff_admin_restaurant_menu_item_list_v1").body, /mn\.id = p_menu_id and mn\.restaurant_id = p_restaurant_id/);
  assert.match(bodies.get("public.staff_admin_restaurant_branch_menu_item_list_v1").body, /x\.branch_id = p_branch_id and x\.restaurant_id = p_restaurant_id/);
});
check("lifecycle visibility: no contract filters the primary rows to the Consumer-public state; only the two count predicates mention a status literal", () => {
  const allowed = new Set(["m.status = 'active'", "b.status = 'active'"]);
  for (const [name, { body }] of bodies) {
    for (const m of body.matchAll(/\b[a-z]+\.status\s*=\s*'[a-z_]+'/g)) assert.ok(allowed.has(m[0].replace(/\s+/g, " ")), `${name}: ${m[0]}`);
    assert.doesNotMatch(body.replace(/\b[mb]\.status\s*=\s*'active'/g, ""), /where[^;]*\bstatus\s*=\s*'(active|published)'/i, name);
  }
});
check("field minimisation: legal_name, plan, tags, geocode refs/fingerprints/errors, user/auth ids, credentials are never selected or granted", () => {
  for (const banned of ["legal_name", "plan", "tags", "tag_ids", "geocode_provider_ref", "geocode_address_fingerprint", "geocode_last_error", "geocode_normalized_address", "auth_user_id", "restaurant_user_id", "login_status", "email", "password", "token", "content_version", "name_version"]) {
    const re = new RegExp(`(^|[^a-z_])${banned}([^a-z_]|$)`, "i");
    assert.deepEqual(code.split("\n").filter((line) => re.test(line)), [], banned);
  }
});
check("ingredient capability is absent: no ingredient identifier in the migration, the guard-visible code, or the registry route requirement change", () => {
  assert.doesNotMatch(code, /ingredient/i);
  const registry = read(REGISTRY);
  const line = registry.split("\n").find((l) => l.includes('id: "restaurant-item-ingredients"'));
  assert.match(line, /availability: "NOT_ENABLED"/);
  assert.match(line, /requiredPermissions: \["admin\.restaurants\.menu_item\.read"\]/);
});
check("migration is fail-closed: object-set, mode, permission mapping, read-only, ACL, helper, reader-role, policy and no-client-grant postconditions; SET edges released", () => {
  for (const marker of ["b1_unexpected_contract_", "b1_contract_mode_mismatch_", "b1_contract_permission_mismatch_", "b1_contract_not_read_only_", "b1_contract_acl_mismatch_", "b1_contract_acl_extra_grantee_", "b1_contract_count_mismatch", "b1_helper_mismatch", "b1_reader_role_mismatch", "b1_reader_non_select_privilege", "b1_reader_policy_mismatch", "b1_client_table_grant_present", "b1_context_reader_set_edge_retained"]) assert.ok(code.includes(marker), marker);
  assert.match(code, /revoke staff_admin_restaurant_reader from postgres granted by postgres;/);
  assert.match(code, /revoke staff_authority_context_reader from postgres granted by postgres;/);
  assert.match(code, /^begin;/m); assert.match(code, /^commit;/m);
  const owners = [...code.matchAll(/alter function [^\n]+ owner to (\w+);/g)].map((m) => m[1]);
  assert.equal(owners.length, 16); assert.ok(owners.every((o) => o === READER));
});
check("the B1 route family maps exactly to CURRENT AE1 keys and is NOT marked LIVE (UI conversion belongs to B2/B3)", () => {
  const source = read(REGISTRY);
  const vocab = ts.transpileModule(read(VOCAB), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const m = { exports: {} }; new Function("exports", "module", vocab)(m.exports, m);
  const rs = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} }; new Function("exports", "module", "require", rs)(mod.exports, mod, () => m.exports);
  for (const [id, key] of Object.entries(B_ROUTES)) {
    const r = mod.exports.ADMIN_ROUTE_REGISTRY.find((x) => x.id === id);
    assert.deepEqual([...r.requiredPermissions], [key], id);
    assert.ok(m.exports.CURRENT_ADMIN_PERMISSION_KEYS.includes(key), key);
    // ADMIN-B2 and ADMIN-B3 (exact successors) move all fifteen of these routes LIVE; B1 itself marks none.
  }
  assert.equal(Object.keys(B_ROUTES).length, 15);
});

check("ADMIN-A / ADMIN-AE1 unchanged and no UI touched: changed paths are inside the exact B1 allow-list", () => {
  const git = (...args) => child.execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  const lines = (v) => v.split(/\r?\n/).filter(Boolean);
  const changed = new Set([...lines(git("diff", "--name-only", BASELINE)), ...lines(git("ls-files", "--others", "--exclude-standard"))]);
  const allowed = new Set([
    MIGRATION, "package.json",
    "scripts/admin-restaurant-operational-read-foundation-b1-guard.mjs",
    "scripts/admin-restaurant-operational-read-foundation-b1-mutations.mjs",
    "scripts/admin-restaurant-operational-read-foundation-b1-postgres-apply.mjs",
    "scripts/admin-operational-read-permissions-ae1-guard.mjs", "scripts/admin-operational-read-permissions-ae1-postgres-apply.mjs",
    "scripts/pre-admin-hardening-h3-h4-guard.mjs", "scripts/pre-admin-hardening-h3-h4-postgres-apply.mjs",
    "scripts/restaurant-catalog-authoring-r2b-guard.mjs", "scripts/restaurant-catalog-authoring-r2b-postgres-apply.mjs",
    "scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs", "scripts/restaurant-owner-display-name-draft-visibility-r2e-postgres-apply.mjs",
    "docs/admin-operational-surface-inventory.md", "docs/engineering-state-registers.md", "docs/engineering-handoff.md",
    "apps/admin-web/server/adminRestaurantRead.ts", "apps/admin-web/components/admin-shell/AdminOperationalPage.tsx", "apps/admin-web/components/admin-shell/AdminRestaurantViews.tsx", "apps/admin-web/app/admin/restaurants/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/about/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/contact/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/branches/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/branches/[branchId]/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/branches/[branchId]/contact/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/branches/[branchId]/hours/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/branches/[branchId]/geo/page.tsx", "scripts/admin-restaurant-branch-canonical-ui-b2-guard.mjs", "scripts/admin-restaurant-branch-canonical-ui-b2-mutations.mjs", "apps/admin-web/auth/admin-route-registry.ts",
    "apps/admin-web/components/admin-shell/AdminMenuViews.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/items/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/nutrition/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/branches/[branchId]/menu-items/page.tsx", "scripts/admin-menu-canonical-ui-b3-guard.mjs", "scripts/admin-menu-canonical-ui-b3-mutations.mjs", "supabase/migrations/20260920030000_admin_operational_review_queues_c.sql", "apps/admin-web/server/adminReviewQueueRead.ts", "apps/admin-web/components/admin-shell/AdminQueueViews.tsx", "apps/admin-web/app/admin/restaurants/menu-management/page.tsx", "apps/admin-web/app/admin/restaurants/menu-management/pending/page.tsx", "apps/admin-web/app/admin/restaurants/menu-management/data-quality/page.tsx", "apps/admin-web/app/admin/nutrition/certification/pending/page.tsx", "scripts/admin-operational-review-queues-c-guard.mjs", "scripts/admin-operational-review-queues-c-mutations.mjs", "scripts/admin-operational-review-queues-c-postgres-apply.mjs", "scripts/admin-menu-canonical-ui-b3-guard.mjs", "scripts/admin-restaurant-branch-canonical-ui-b2-guard.mjs", "scripts/admin-restaurant-operational-read-foundation-b1-guard.mjs", "scripts/admin-restaurant-operational-read-foundation-b1-postgres-apply.mjs", "scripts/admin-operational-read-permissions-ae1-guard.mjs", "scripts/admin-operational-read-permissions-ae1-postgres-apply.mjs", "scripts/pre-admin-hardening-h3-h4-guard.mjs", "scripts/pre-admin-hardening-h3-h4-postgres-apply.mjs", "scripts/restaurant-catalog-authoring-r2b-guard.mjs", "scripts/restaurant-catalog-authoring-r2b-postgres-apply.mjs", "scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs", "scripts/restaurant-owner-display-name-draft-visibility-r2e-postgres-apply.mjs", "apps/admin-web/server/adminRestaurantRead.ts", "package.json"
  ]);
  assert.deepEqual([...changed].filter((f) => !allowed.has(f)), []);
  for (const frozen of [AE1_MIGRATION, VOCAB]) assert.ok(!changed.has(frozen), `${frozen} changed`);
  assert.ok(![...changed].some((f) => f.startsWith("apps/") && !f.startsWith("apps/admin-web/")), "no app outside admin-web may change");
  assert.equal(git("cat-file", "-t", BASELINE), "commit");
});

const failures = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: SUITE, total: checks.length, passed: checks.length - failures.length, failed: failures.length,
  failures: failures.map((f) => f.name), productionTouched: false, developmentTouched: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
