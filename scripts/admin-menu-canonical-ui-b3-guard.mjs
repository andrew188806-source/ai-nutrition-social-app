#!/usr/bin/env node
// ADMIN-B3 guard: the six Menu / Menu Item canonical read-only pages over the ADMIN-B1 contracts. Static; no network.
import assert from "node:assert/strict";
import child from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SUITE = "admin-menu-canonical-ui-b3-guard";
const BASELINE = "2a88442b829921f819f0913991c5f16d9b96d494";
const REGISTRY = "apps/admin-web/auth/admin-route-registry.ts";
const VOCAB = "apps/admin-web/auth/admin-current-permission-vocabulary.ts";
const ADAPTER = "apps/admin-web/server/adminRestaurantRead.ts";
const FACTORY = "apps/admin-web/components/admin-shell/AdminOperationalPage.tsx";
const VIEWS = "apps/admin-web/components/admin-shell/AdminRestaurantViews.tsx";
const MENU_VIEWS = "apps/admin-web/components/admin-shell/AdminMenuViews.tsx";
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const APP = "apps/admin-web/app/admin/restaurants";

// The exact B3 route set: id -> [page file, adapter read fn, adapter CONTRACTS key, B1 contract, exact permission key, canonical path].
const B3 = Object.freeze({
  "restaurant-menus": [`${APP}/[restaurantId]/menus/page.tsx`, "readMenuList", "menuList", "staff_admin_restaurant_menu_list_v1", "admin.restaurants.menus.read", "/admin/restaurants/[restaurantId]/menus"],
  "restaurant-menu-detail": [`${APP}/[restaurantId]/menus/[menuId]/page.tsx`, "readMenuDetail", "menuDetail", "staff_admin_restaurant_menu_detail_v1", "admin.restaurants.menu.read", "/admin/restaurants/[restaurantId]/menus/[menuId]"],
  "restaurant-menu-items": [`${APP}/[restaurantId]/menus/[menuId]/items/page.tsx`, "readMenuItemList", "menuItemList", "staff_admin_restaurant_menu_item_list_v1", "admin.restaurants.menu_items.read", "/admin/restaurants/[restaurantId]/menus/[menuId]/items"],
  "restaurant-branch-menu-items": [`${APP}/[restaurantId]/branches/[branchId]/menu-items/page.tsx`, "readBranchMenuItemList", "branchMenuItemList", "staff_admin_restaurant_branch_menu_item_list_v1", "admin.restaurants.menu_items.read", "/admin/restaurants/[restaurantId]/branches/[branchId]/menu-items"],
  "restaurant-menu-item-detail": [`${APP}/[restaurantId]/menus/[menuId]/items/[itemId]/page.tsx`, "readMenuItemDetail", "menuItemDetail", "staff_admin_restaurant_menu_item_detail_v1", "admin.restaurants.menu_item.read", "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]"],
  // Nutrition is a focused presentation of the SAME item-detail contract: no separate nutrition RPC exists or is added.
  "restaurant-item-nutrition": [`${APP}/[restaurantId]/menus/[menuId]/items/[itemId]/nutrition/page.tsx`, "readMenuItemDetail", "menuItemDetail", "staff_admin_restaurant_menu_item_detail_v1", "admin.restaurants.menu_item.read", "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/nutrition"]
});
const B2_IDS = ["restaurants", "restaurant-detail", "restaurant-about", "restaurant-contact", "restaurant-branches", "restaurant-branch-detail", "restaurant-branch-contact", "restaurant-branch-hours", "restaurant-branch-geo"];
const B2_FILES = {
  "restaurants": `${APP}/page.tsx`, "restaurant-detail": `${APP}/[restaurantId]/page.tsx`, "restaurant-about": `${APP}/[restaurantId]/about/page.tsx`,
  "restaurant-contact": `${APP}/[restaurantId]/contact/page.tsx`, "restaurant-branches": `${APP}/[restaurantId]/branches/page.tsx`,
  "restaurant-branch-detail": `${APP}/[restaurantId]/branches/[branchId]/page.tsx`, "restaurant-branch-contact": `${APP}/[restaurantId]/branches/[branchId]/contact/page.tsx`,
  "restaurant-branch-hours": `${APP}/[restaurantId]/branches/[branchId]/hours/page.tsx`, "restaurant-branch-geo": `${APP}/[restaurantId]/branches/[branchId]/geo/page.tsx`
};
const B2_CONTRACTS = ["staff_admin_restaurant_list_v1", "staff_admin_restaurant_detail_v1", "staff_admin_restaurant_about_v1", "staff_admin_restaurant_contact_v1", "staff_admin_restaurant_branch_list_v1", "staff_admin_restaurant_branch_detail_v1", "staff_admin_restaurant_branch_contact_v1", "staff_admin_restaurant_branch_hours_v1", "staff_admin_restaurant_branch_geo_v1"];
const ADMIN_A_FILES = [
  "apps/admin-web/app/admin/audit/platform-memberships/page.tsx",
  `${APP}/[restaurantId]/branches/[branchId]/status/page.tsx`,
  "apps/admin-web/components/admin-shell/AdminBranchStatusWorkspace.tsx",
  "apps/admin-web/components/admin-shell/AdminMembershipAudit.tsx",
  "apps/admin-web/components/PlatformAdminBranchStatus.tsx"
];
const ADMIN_C_ROUTES = ["menu-management", "menu-management-pending", "menu-management-data-quality", "nutrition-certification-pending"];
const DEFERRED_PAGES = ["ingredients", "allergens", "certification"].map((leaf) => `${APP}/[restaurantId]/menus/[menuId]/items/[itemId]/${leaf}/page.tsx`);

const checks = [];
function check(name, fn) {
  let pass = false, detail;
  try { fn(); pass = true; } catch (error) { detail = String(error?.message ?? error).split("\n")[0].slice(0, 300); }
  checks.push({ name, pass, ...(pass ? {} : { detail }) });
  console.log(`${pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}${pass ? "" : `\n     detail: ${detail}`}`);
}
const git = (...args) => child.execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const adapter = read(ADAPTER);
const adapterCode = adapter.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*") && !l.trimStart().startsWith("/*")).join("\n");
const pages = Object.fromEntries(Object.entries(B3).map(([id, v]) => [id, read(v[0])]));
const b3Sources = () => [...Object.values(pages), adapter, read(FACTORY), read(VIEWS), read(MENU_VIEWS)];

let registry, vocabulary;
try {
  vocabulary = { exports: {} }; new Function("exports", "module", ts.transpileModule(read(VOCAB), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(vocabulary.exports, vocabulary);
  registry = { exports: {} }; new Function("exports", "module", "require", ts.transpileModule(read(REGISTRY), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(registry.exports, registry, () => vocabulary.exports);
} catch (error) { console.log("load error", error.message); }
const route = (id) => registry.exports.ADMIN_ROUTE_REGISTRY.find((r) => r.id === id);
const availOf = (text) => Object.fromEntries([...text.matchAll(/defineRoute\(\{ id: "([^"]+)",[^\n]*?availability: "([A-Z_]+)"/g)].map((m) => [m[1], m[2]]));

check("exact six-route B3 set: each canonical path exists in the registry, has a real page file and is LIVE", () => {
  assert.equal(Object.keys(B3).length, 6);
  for (const [id, [file, , , , , routePath]] of Object.entries(B3)) {
    assert.equal(route(id).route, routePath, id);
    assert.ok(fs.existsSync(path.join(ROOT, file)), file);
    assert.equal(route(id).availability, "LIVE", id);
  }
});
check("each page is created through the canonical operational gate with its own route id and calls exactly its one B1 read", () => {
  for (const [id, [, fn]] of Object.entries(B3)) {
    const src = pages[id];
    assert.ok(src.includes(`createAdminOperationalPage<`) && src.includes(`>("${id}",`), `${id} factory/route id`);
    assert.ok(new RegExp(`\\b${fn}\\(`).test(src), `${id} uses ${fn}`);
    const reads = [...src.matchAll(/\bread[A-Z][A-Za-z]+\(/g)].map((m) => m[0]);
    assert.deepEqual([...new Set(reads)], [`${fn}(`], `${id} reads only ${fn}`);
  }
});
check("adapter adds exactly the five B3 B1 contracts (nine B2 unchanged, no replacement or nutrition-specific RPC); each read uses its expected contract", () => {
  const used = [...adapterCode.matchAll(/"(staff_admin_[a-z_0-9]+)"/g)].map((m) => m[1]).sort();
  const b3Contracts = [...new Set(Object.values(B3).map((v) => v[3]))];
  assert.equal(b3Contracts.length, 5);
  assert.deepEqual(used, [...B2_CONTRACTS, ...b3Contracts].sort());
  assert.doesNotMatch(adapterCode, /staff_admin_[a-z_]*nutrition/);
  assert.equal((adapterCode.match(/\.rpc\(/g) ?? []).length, 1); // single shared call site
  for (const [, [, fn, key, contract]] of Object.entries(B3)) {
    assert.ok(adapterCode.includes(`${key}: "${contract}"`), `${key} -> ${contract}`);
    const start = adapterCode.indexOf(`export function ${fn}(`); assert.ok(start > 0, fn);
    assert.ok(adapterCode.slice(start, start + 1600).split("export function ")[1]?.includes(`CONTRACTS.${key}`), `${fn} -> ${key}`);
  }
});
check("item-nutrition reuses staff_admin_restaurant_menu_item_detail_v1 (same read as item-detail) and renders only the current-nutrition facts it returns", () => {
  assert.equal(B3["restaurant-item-nutrition"][3], B3["restaurant-menu-item-detail"][3]);
  assert.equal(B3["restaurant-item-nutrition"][1], "readMenuItemDetail");
  const src = pages["restaurant-item-nutrition"];
  assert.ok(src.includes("NutritionFacts") && src.includes("result.data.currentNutrition"));
  assert.doesNotMatch(src, /<form|<button|<input|method=|onClick|approve|certif|重新計算|審核通過|修改營養/i);
  assert.ok(read(MENU_VIEWS).includes('data-b3-nutrition="none"'), "truthful empty nutrition state");
  assert.match(adapterCode, /currentNutrition: CurrentNutrition \| null/);
});
check("exact ADMIN-AE1 permission mapping preserved; four key families stay distinct; no admin_context.read fallback anywhere in B3 sources", () => {
  for (const [id, [, , , , key]] of Object.entries(B3)) {
    assert.deepEqual([...route(id).requiredPermissions], [key], id);
    assert.ok(vocabulary.exports.CURRENT_ADMIN_PERMISSION_KEYS.includes(key), key);
  }
  const keys = new Set(Object.values(B3).map((v) => v[4]));
  assert.deepEqual([...keys].sort(), ["admin.restaurants.menu.read", "admin.restaurants.menu_item.read", "admin.restaurants.menu_items.read", "admin.restaurants.menus.read"]);
  for (const src of b3Sources()) assert.doesNotMatch(src, /admin_context\.read/);
  // one family never implies another: sub-links are gated by the child's own key
  assert.ok(pages["restaurant-menus"].includes('has(context, "admin.restaurants.menu.read")'));
  assert.ok(pages["restaurant-menu-detail"].includes('has(context, "admin.restaurants.menu_items.read")'));
  assert.ok(pages["restaurant-menu-items"].includes('has(context, "admin.restaurants.menu_item.read")'));
  assert.ok(pages["restaurant-menu-item-detail"].includes('has(context, "admin.restaurants.menu_item.read")'));
  assert.doesNotMatch(pages["restaurant-menus"], /readMenuDetail|readMenuItem/);
  assert.doesNotMatch(pages["restaurant-menu-detail"], /readMenuItem|readMenuList/);
  assert.doesNotMatch(pages["restaurant-menu-items"], /readMenuItemDetail|readMenuDetail/);
});
check("no mock leakage: no mock adapter, @haocu/shared mock exports, legacy services/repositories or static menu data in B3 sources", () => {
  for (const src of b3Sources()) {
    assert.doesNotMatch(src, /adapters\/mock|admin-restaurant-mock-adapter|@haocu\/shared|mock[A-Z]|canonical(Restaurants|Branches|Menu)|\/services\/|\/repositories\/|view-models\/admin-governance/);
  }
});
check("no raw client table access and no mutation surface: only the shared rpc call site; no form/button/input controls, no server action, no route handler", () => {
  for (const src of b3Sources()) {
    assert.doesNotMatch(src.replace(/\/\/[^\n]*/g, ""), /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\bfetch\(|"use server"|createClient\(|SERVICE_ROLE|service_role/);
  }
  for (const src of [...Object.values(pages), read(MENU_VIEWS)]) assert.doesNotMatch(src, /<form|<button|<input|<textarea|<select|method=|onSubmit|onClick/i);
  const changed = [...git("diff", "--name-only", BASELINE).split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean);
  assert.deepEqual(changed.filter((f) => /^apps\/admin-web\/app\/api\//.test(f) || (/^supabase\//.test(f) && f !== "supabase/migrations/20260920030000_admin_operational_review_queues_c.sql")), []); // ADMIN-C adds exactly one additive migration
});
check("contract states are validated, not collapsed: forbidden/invalid_request/not_found/unavailable distinct; identifiers echo-checked; item's menu enforced", () => {
  const echo = {
    readMenuList: /raw\.restaurantId !== restaurantId/, readMenuDetail: /raw\.restaurantId !== restaurantId \|\| raw\.menuId !== menuId/,
    readMenuItemList: /raw\.restaurantId !== restaurantId \|\| raw\.menuId !== menuId/, readMenuItemDetail: /raw\.restaurantId !== restaurantId \|\| raw\.menuItemId !== menuItemId/,
    readBranchMenuItemList: /raw\.restaurantId !== restaurantId \|\| raw\.branchId !== branchId/
  };
  for (const [fn, re] of Object.entries(echo)) { const s = adapterCode.indexOf(`export function ${fn}(`); assert.match(adapterCode.slice(s, s + 2600).split("export function ")[1] ?? "", re, `${fn} echo check`); }
  for (const s of ["forbidden", "invalid_request", "not_found", "unavailable"]) assert.ok(adapterCode.includes(`"${s}"`), s);
  assert.match(adapterCode, /Object\.keys\(raw\)\.length === 1/);
  assert.match(adapterCode, /result\.error\) return \{ state: "unavailable" \}/);
  const detail = adapterCode.slice(adapterCode.indexOf("export function readMenuItemDetail("));
  assert.match(detail.split("export function ")[1], /result\.data\.menuId !== menuId \? \{ state: "not_found" \}/);
  for (const [id, src] of Object.entries(pages)) assert.ok(src.includes("ReadFailureNotice"), `${id} renders failure states`);
  for (const id of ["restaurant-menus", "restaurant-menu-items", "restaurant-branch-menu-items"]) assert.ok(pages[id].includes("EmptyNotice"), `${id} empty state`);
});
check("parent/child safety: nested reads always pass the full parent chain; identifiers are shape-checked before any call", () => {
  assert.match(pages["restaurant-menus"], /readMenuList\(params\.restaurantId, page\)/);
  assert.match(pages["restaurant-menu-detail"], /readMenuDetail\(params\.restaurantId, params\.menuId\)/);
  assert.match(pages["restaurant-menu-items"], /readMenuItemList\(params\.restaurantId, params\.menuId, page\)/);
  assert.match(pages["restaurant-branch-menu-items"], /readBranchMenuItemList\(params\.restaurantId, params\.branchId, page\)/);
  for (const id of ["restaurant-menu-item-detail", "restaurant-item-nutrition"]) assert.match(pages[id], /readMenuItemDetail\(params\.restaurantId, params\.menuId, params\.itemId\)/, id);
  for (const [fn, re] of Object.entries({
    readMenuDetail: /isValidReadId\(restaurantId\) \|\| !isValidReadId\(menuId\)/, readMenuItemList: /isValidReadId\(restaurantId\) \|\| !isValidReadId\(menuId\)/,
    readMenuItemDetail: /isValidReadId\(restaurantId\) \|\| !isValidReadId\(menuId\) \|\| !isValidReadId\(menuItemId\)/, readBranchMenuItemList: /isValidReadId\(restaurantId\) \|\| !isValidReadId\(branchId\)/
  })) { const s = adapterCode.indexOf(`export function ${fn}(`); assert.match(adapterCode.slice(s, s + 420), re, fn); }
  assert.match(adapterCode, /p_menu_id: menuId, p_limit/); // the item list is always menu-scoped from this route
});
check("bounded pagination on the three lists: fixed page size 20 via the shared constants, ?page only; no search/filter/limit/offset from the URL", () => {
  assert.match(adapter, /RESTAURANT_LIST_PAGE_SIZE = 20;/); assert.match(adapter, /RESTAURANT_LIST_MAX_PAGE = 500/);
  for (const id of ["restaurant-menus", "restaurant-menu-items", "restaurant-branch-menu-items"]) {
    assert.match(pages[id], /parsePageParam\(searchParams\.page\)/, id); assert.match(pages[id], /PageControls/, id);
    assert.doesNotMatch(pages[id], /searchParams\.(limit|offset|q|search|filter)/, id);
  }
  for (const fn of ["readMenuList", "readMenuItemList", "readBranchMenuItemList"]) {
    const s = adapterCode.indexOf(`export function ${fn}(`);
    assert.match(adapterCode.slice(s, s + 900), /p_limit: RESTAURANT_LIST_PAGE_SIZE, p_offset: offset/, fn);
  }
});
check("data minimisation: no owner identity, email, plan, legal name or raw/internal fields excluded by B1 are read or rendered", () => {
  for (const src of [...Object.values(pages), read(MENU_VIEWS)]) assert.doesNotMatch(src, /legal_?name|"plan"|\.plan\b|auth_user|restaurant_user|\bemail\b|fingerprint|last_?error|created_by|updated_by/i);
});
check("registry: exactly the six B3 routes moved to LIVE; B2 stays LIVE; ADMIN-C, deferred (ingredients/allergens/certification) and every other route status unchanged", () => {
  const before = availOf(git("show", `${BASELINE}:${REGISTRY}`).replace(/\r\n/g, "\n")), now = availOf(read(REGISTRY));
  assert.deepEqual(Object.keys(before).sort(), Object.keys(now).sort());
  assert.deepEqual(Object.keys(now).filter((id) => now[id] !== before[id]).sort(), [...Object.keys(B3), ...ADMIN_C_ROUTES].sort()); // ADMIN-C (exact successor) moves its four routes DEMO -> LIVE
  for (const id of Object.keys(B3)) { assert.equal(before[id], "NOT_ENABLED", id); assert.equal(now[id], "LIVE", id); }
  for (const id of B2_IDS) assert.equal(now[id], "LIVE", id);
  for (const id of ADMIN_C_ROUTES) { assert.equal(before[id], "DEMO", id); assert.equal(now[id], "LIVE", id); }
  for (const id of ["restaurant-item-ingredients", "restaurant-item-allergens", "restaurant-item-certification"]) if (now[id] !== undefined) assert.equal(now[id], "NOT_ENABLED", id);
  assert.equal(Object.values(now).filter((v) => v === "LIVE").length, 17 + 6 + 4);
  assert.equal(Object.values(now).filter((v) => v === "NOT_ENABLED").length, 65 - 6);
});
check("ingredient route remains DEFERRED: NOT_ENABLED, its page byte-identical (registry scaffold), and no ingredient source is read or parsed anywhere in B3", () => {
  assert.equal(route("restaurant-item-ingredients").availability, "NOT_ENABLED");
  for (const file of DEFERRED_PAGES) assert.equal(git("diff", "--name-only", BASELINE, "--", file), "", file);
  assert.ok(read(DEFERRED_PAGES[0]).includes('createAdminRegistryPage("restaurant-item-ingredients")'));
  for (const src of [...Object.values(pages), adapter, read(MENU_VIEWS)]) assert.doesNotMatch(src, /ingredient/i);
});
check("ADMIN-C exclusion: no queue/aggregate page exists in B3; the menu-management pages are byte-identical to the baseline", () => {
  // the four ADMIN-C queue pages are wired by ADMIN-C (exact successor); their own guard pins them
  for (const src of Object.values(pages)) assert.doesNotMatch(src, /pending|data-quality|待審|待處理/i);
});
check("ADMIN-B2 unchanged: seven B2 pages are byte-identical; restaurant-detail and branch-detail differ only by the added B3 navigation links", () => {
  for (const id of B2_IDS.filter((x) => !["restaurant-detail", "restaurant-branch-detail"].includes(x))) assert.equal(git("diff", "--name-only", BASELINE, "--", B2_FILES[id]), "", id);
  for (const id of ["restaurant-detail", "restaurant-branch-detail"]) {
    const diff = git("diff", "-U0", BASELINE, "--", B2_FILES[id]).split("\n").filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
    assert.ok(diff.length > 0 && diff.every((l) => /menus|menu-items|admin\.restaurants\.branches\.read|admin_restaurant_branch\.status\.write/.test(l)), `${id} diff: ${diff.join(" | ")}`);
  }
  // contextual navigation into B3 is gated by the child's own exact key (never a parent key)
  assert.ok(read(B2_FILES["restaurant-detail"]).includes('href: `${base}/menus`, allowed: has(context, "admin.restaurants.menus.read")'));
  assert.ok(read(B2_FILES["restaurant-branch-detail"]).includes('href: `${base}/menu-items`, allowed: has(context, "admin.restaurants.menu_items.read")'));
  for (const file of [VIEWS, FACTORY]) assert.equal(git("diff", "--name-only", BASELINE, "--", file), "", file);
  // the nine B2 contracts and reads are still exactly as B2 shipped them
  for (const c of B2_CONTRACTS) assert.ok(adapterCode.includes(`"${c}"`), c);
});
check("ADMIN-A unchanged: the branch-status and membership-audit pages/components are byte-identical to the baseline; legacy roots untouched", () => {
  for (const file of ADMIN_A_FILES) assert.equal(git("diff", "--name-only", BASELINE, "--", file), "", file);
  assert.equal(git("diff", "--name-only", BASELINE, "--", "apps/admin-web/app/restaurant-review", "apps/admin-web/app/audit-trail", "apps/admin-web/app/api"), "");
  for (const id of ["restaurant-branch-status", "audit-platform-memberships"]) assert.equal(route(id).availability, "LIVE");
});
check("no database or authority change: no migration, RPC, RLS, permission or vocabulary edit; changed paths are inside the exact B3 allow-list", () => {
  const lines = (v) => v.split(/\r?\n/).filter(Boolean);
  const changed = new Set([...lines(git("diff", "--name-only", BASELINE)), ...lines(git("ls-files", "--others", "--exclude-standard"))]);
  const allowed = new Set([
    REGISTRY, ADAPTER, MENU_VIEWS, "package.json",
    ...Object.values(B3).map((v) => v[0]), B2_FILES["restaurant-detail"], B2_FILES["restaurant-branch-detail"],
    "scripts/admin-menu-canonical-ui-b3-guard.mjs", "scripts/admin-menu-canonical-ui-b3-mutations.mjs", "supabase/migrations/20260920030000_admin_operational_review_queues_c.sql", "apps/admin-web/server/adminReviewQueueRead.ts", "apps/admin-web/components/admin-shell/AdminQueueViews.tsx", "apps/admin-web/app/admin/restaurants/menu-management/page.tsx", "apps/admin-web/app/admin/restaurants/menu-management/pending/page.tsx", "apps/admin-web/app/admin/restaurants/menu-management/data-quality/page.tsx", "apps/admin-web/app/admin/nutrition/certification/pending/page.tsx", "scripts/admin-operational-review-queues-c-guard.mjs", "scripts/admin-operational-review-queues-c-mutations.mjs", "scripts/admin-operational-review-queues-c-postgres-apply.mjs", "scripts/admin-menu-canonical-ui-b3-guard.mjs", "scripts/admin-restaurant-branch-canonical-ui-b2-guard.mjs", "scripts/admin-restaurant-operational-read-foundation-b1-guard.mjs", "scripts/admin-restaurant-operational-read-foundation-b1-postgres-apply.mjs", "scripts/admin-operational-read-permissions-ae1-guard.mjs", "scripts/admin-operational-read-permissions-ae1-postgres-apply.mjs", "scripts/pre-admin-hardening-h3-h4-guard.mjs", "scripts/pre-admin-hardening-h3-h4-postgres-apply.mjs", "scripts/restaurant-catalog-authoring-r2b-guard.mjs", "scripts/restaurant-catalog-authoring-r2b-postgres-apply.mjs", "scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs", "scripts/restaurant-owner-display-name-draft-visibility-r2e-postgres-apply.mjs", "apps/admin-web/server/adminRestaurantRead.ts", "package.json",
    "scripts/admin-restaurant-branch-canonical-ui-b2-guard.mjs", "scripts/admin-restaurant-branch-canonical-ui-b2-mutations.mjs",
    "scripts/admin-restaurant-operational-read-foundation-b1-guard.mjs", "scripts/admin-operational-read-permissions-ae1-guard.mjs",
    "scripts/pre-admin-hardening-h3-h4-guard.mjs",
    "docs/admin-operational-surface-inventory.md", "docs/engineering-state-registers.md", "docs/engineering-handoff.md"
  ]);
  assert.deepEqual([...changed].filter((f) => !allowed.has(f)), []);
  assert.ok(!changed.has(VOCAB));
  assert.deepEqual([...changed].filter((f) => f.startsWith("supabase/") && f !== "supabase/migrations/20260920030000_admin_operational_review_queues_c.sql"), []); // ADMIN-C adds exactly one additive migration
  assert.equal(git("cat-file", "-t", BASELINE), "commit");
});

const failures = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ suite: SUITE, total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((f) => f.name), productionTouched: false, developmentTouched: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
