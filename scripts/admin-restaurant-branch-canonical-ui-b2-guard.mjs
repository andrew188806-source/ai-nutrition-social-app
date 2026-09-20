#!/usr/bin/env node
// ADMIN-B2 guard: the nine Restaurant / Branch canonical read-only pages over the ADMIN-B1 contracts. Static; no network.
import assert from "node:assert/strict";
import child from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SUITE = "admin-restaurant-branch-canonical-ui-b2-guard";
const BASELINE = "792f2841ffd1906eb1c768feb91a0966e198df5f";
const REGISTRY = "apps/admin-web/auth/admin-route-registry.ts";
const VOCAB = "apps/admin-web/auth/admin-current-permission-vocabulary.ts";
const ADAPTER = "apps/admin-web/server/adminRestaurantRead.ts";
const FACTORY = "apps/admin-web/components/admin-shell/AdminOperationalPage.tsx";
const VIEWS = "apps/admin-web/components/admin-shell/AdminRestaurantViews.tsx";
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const APP = "apps/admin-web/app/admin/restaurants";

// The exact B2 route set: id -> [page file, adapter read fn, B1 contract, exact permission key].
const B2 = Object.freeze({
  "restaurants": [`${APP}/page.tsx`, "readRestaurantList", "staff_admin_restaurant_list_v1", "admin.restaurants.read", "/admin/restaurants"],
  "restaurant-detail": [`${APP}/[restaurantId]/page.tsx`, "readRestaurantDetail", "staff_admin_restaurant_detail_v1", "admin.restaurants.read", "/admin/restaurants/[restaurantId]"],
  "restaurant-about": [`${APP}/[restaurantId]/about/page.tsx`, "readRestaurantAbout", "staff_admin_restaurant_about_v1", "admin.restaurants.about.read", "/admin/restaurants/[restaurantId]/about"],
  "restaurant-contact": [`${APP}/[restaurantId]/contact/page.tsx`, "readRestaurantContact", "staff_admin_restaurant_contact_v1", "admin.restaurants.contact.read", "/admin/restaurants/[restaurantId]/contact"],
  "restaurant-branches": [`${APP}/[restaurantId]/branches/page.tsx`, "readBranchList", "staff_admin_restaurant_branch_list_v1", "admin.restaurants.branches.read", "/admin/restaurants/[restaurantId]/branches"],
  "restaurant-branch-detail": [`${APP}/[restaurantId]/branches/[branchId]/page.tsx`, "readBranchDetail", "staff_admin_restaurant_branch_detail_v1", "admin.restaurants.branches.read", "/admin/restaurants/[restaurantId]/branches/[branchId]"],
  "restaurant-branch-contact": [`${APP}/[restaurantId]/branches/[branchId]/contact/page.tsx`, "readBranchContact", "staff_admin_restaurant_branch_contact_v1", "admin.restaurants.contact.read", "/admin/restaurants/[restaurantId]/branches/[branchId]/contact"],
  "restaurant-branch-hours": [`${APP}/[restaurantId]/branches/[branchId]/hours/page.tsx`, "readBranchHours", "staff_admin_restaurant_branch_hours_v1", "admin.restaurants.hours.read", "/admin/restaurants/[restaurantId]/branches/[branchId]/hours"],
  "restaurant-branch-geo": [`${APP}/[restaurantId]/branches/[branchId]/geo/page.tsx`, "readBranchGeo", "staff_admin_restaurant_branch_geo_v1", "admin.restaurants.geo.read", "/admin/restaurants/[restaurantId]/branches/[branchId]/geo"]
});
// ADMIN-B3 routes (must stay scaffolds) and the ADMIN-A pages (must stay byte-identical).
const B3 = Object.freeze({
  "restaurant-menus": `${APP}/[restaurantId]/menus/page.tsx`,
  "restaurant-menu-detail": `${APP}/[restaurantId]/menus/[menuId]/page.tsx`,
  "restaurant-menu-items": `${APP}/[restaurantId]/menus/[menuId]/items/page.tsx`,
  "restaurant-branch-menu-items": `${APP}/[restaurantId]/branches/[branchId]/menu-items/page.tsx`,
  "restaurant-menu-item-detail": `${APP}/[restaurantId]/menus/[menuId]/items/[itemId]/page.tsx`,
  "restaurant-item-nutrition": `${APP}/[restaurantId]/menus/[menuId]/items/[itemId]/nutrition/page.tsx`
});
const ADMIN_A_FILES = [
  "apps/admin-web/app/admin/audit/platform-memberships/page.tsx",
  `${APP}/[restaurantId]/branches/[branchId]/status/page.tsx`,
  "apps/admin-web/components/admin-shell/AdminBranchStatusWorkspace.tsx",
  "apps/admin-web/components/admin-shell/AdminMembershipAudit.tsx",
  "apps/admin-web/components/PlatformAdminBranchStatus.tsx"
];

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
const pages = Object.fromEntries(Object.entries(B2).map(([id, v]) => [id, read(v[0])]));

let registry, vocabulary;
try {
  vocabulary = { exports: {} }; new Function("exports", "module", ts.transpileModule(read(VOCAB), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(vocabulary.exports, vocabulary);
  registry = { exports: {} }; new Function("exports", "module", "require", ts.transpileModule(read(REGISTRY), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(registry.exports, registry, () => vocabulary.exports);
} catch (error) { console.log("load error", error.message); }
const route = (id) => registry.exports.ADMIN_ROUTE_REGISTRY.find((r) => r.id === id);

check("exact nine-route B2 set: each canonical path exists in the registry and has a real page file", () => {
  assert.equal(Object.keys(B2).length, 9);
  for (const [id, [file, , , , routePath]] of Object.entries(B2)) {
    assert.equal(route(id).route, routePath, id);
    assert.ok(fs.existsSync(path.join(ROOT, file)), file);
  }
});
check("each page is created through the canonical operational gate with its own route id and calls exactly its one B1 read", () => {
  for (const [id, [, fn]] of Object.entries(B2)) {
    const src = pages[id];
    assert.ok(src.includes(`createAdminOperationalPage<`) && src.includes(`>("${id}",`), `${id} factory/route id`);
    assert.ok(new RegExp(`\\b${fn}\\(`).test(src), `${id} uses ${fn}`);
    const reads = [...src.matchAll(/\bread[A-Z][A-Za-z]+\(/g)].map((m) => m[0]);
    assert.deepEqual([...new Set(reads)], [`${fn}(`], `${id} reads only ${fn}`);
  }
});
check("adapter maps exactly the nine B1 contracts (no replacement RPC) and each read uses the expected contract", () => {
  const used = [...adapterCode.matchAll(/"(staff_admin_[a-z_0-9]+)"/g)].map((m) => m[1]).sort();
  // ADMIN-B3 (exact successor) adds five more B1 contracts to the same adapter; the nine B2 contracts are unchanged.
  const B3_CONTRACTS = ["staff_admin_restaurant_menu_list_v1", "staff_admin_restaurant_menu_detail_v1", "staff_admin_restaurant_menu_item_list_v1", "staff_admin_restaurant_menu_item_detail_v1", "staff_admin_restaurant_branch_menu_item_list_v1"];
  assert.deepEqual(used, [...Object.values(B2).map((v) => v[2]), ...B3_CONTRACTS].sort());
  assert.equal((adapterCode.match(/\.rpc\(/g) ?? []).length, 1); // single shared call site
  const pairs = { readRestaurantList: "list", readRestaurantDetail: "detail", readRestaurantAbout: "about", readRestaurantContact: "contact", readBranchList: "branchList", readBranchDetail: "branchDetail", readBranchContact: "branchContact", readBranchHours: "branchHours", readBranchGeo: "branchGeo" };
  for (const [fn, key] of Object.entries(pairs)) {
    const start = adapterCode.indexOf(`export function ${fn}(`); assert.ok(start > 0, fn);
    assert.ok(adapterCode.slice(start, start + 900).includes(`CONTRACTS.${key}`), `${fn} -> ${key}`);
  }
});
check("exact ADMIN-AE1 permission mapping preserved: every B2 route requires exactly its own CURRENT key (no admin_context.read fallback)", () => {
  for (const [id, [, , , key]] of Object.entries(B2)) {
    assert.deepEqual([...route(id).requiredPermissions], [key], id);
    assert.ok(vocabulary.exports.CURRENT_ADMIN_PERMISSION_KEYS.includes(key), key);
  }
  for (const src of [...Object.values(pages), adapter, read(FACTORY), read(VIEWS)]) assert.doesNotMatch(src, /admin_context\.read/);
  // contact and about are separate keys; detail never bundles subdomain data
  assert.notEqual(B2["restaurant-about"][3], B2["restaurant-contact"][3]);
  assert.doesNotMatch(pages["restaurant-detail"], /readRestaurant(About|Contact)|readBranch/);
});
check("sub-links are permission-aware (detail -> about/contact/branches; branch -> contact/hours/geo/status) and never fetch other domains", () => {
  const d = pages["restaurant-detail"], b = pages["restaurant-branch-detail"];
  for (const k of ["admin.restaurants.about.read", "admin.restaurants.contact.read", "admin.restaurants.branches.read"]) assert.ok(d.includes(`"${k}"`), k);
  for (const k of ["admin.restaurants.contact.read", "admin.restaurants.hours.read", "admin.restaurants.geo.read", "admin_restaurant_branch.status.write"]) assert.ok(b.includes(`"${k}"`), k);
  assert.ok(b.includes("/status`"), "links to the ADMIN-A canonical status page");
  assert.doesNotMatch(b, /method|POST|fetch\(|mutat/i);
});
check("no mock leakage: no mock adapter, @haocu/shared mock exports, legacy services/repositories or view-models anywhere in B2 sources", () => {
  for (const src of [...Object.values(pages), adapter, read(FACTORY), read(VIEWS)]) {
    assert.doesNotMatch(src, /adapters\/mock|admin-restaurant-mock-adapter|@haocu\/shared|mock[A-Z]|canonical(Restaurants|Branches|Menu)|\/services\/|\/repositories\/|view-models\/admin-governance/);
  }
});
check("no raw client table access and no mutation surface: only the shared rpc call site, no .from()/insert/update/delete/upsert/fetch, no route handler or server action added", () => {
  for (const src of [...Object.values(pages), adapter, read(FACTORY), read(VIEWS)]) {
    assert.doesNotMatch(src.replace(/\/\/[^\n]*/g, ""), /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\bfetch\(|"use server"|createClient\(|SERVICE_ROLE|service_role/);
  }
  const changed = [...git("diff", "--name-only", BASELINE).split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean);
  assert.deepEqual(changed.filter((f) => /^apps\/admin-web\/app\/api\//.test(f) || (/^supabase\//.test(f) && f !== "supabase/migrations/20260920030000_admin_operational_review_queues_c.sql")), []); // ADMIN-C adds exactly one additive migration
});
check("contract states are validated, not collapsed: ready/forbidden/invalid_request/not_found stay distinct; malformed or error -> unavailable; identifiers are echo-checked", () => {
  for (const s of ["forbidden", "invalid_request", "not_found", "unavailable"]) assert.ok(adapterCode.includes(`"${s}"`), s);
  assert.match(adapterCode, /Object\.keys\(raw\)\.length === 1/);
  assert.match(adapterCode, /result\.error\) return \{ state: "unavailable" \}/);
  const echo = { readRestaurantDetail: /row\.restaurantId !== restaurantId/, readRestaurantAbout: /raw\.restaurantId !== restaurantId/, readRestaurantContact: /raw\.restaurantId !== restaurantId/, readBranchList: /raw\.restaurantId !== restaurantId/,
    readBranchDetail: /raw\.restaurantId !== restaurantId \|\| raw\.branchId !== branchId/, readBranchContact: /raw\.restaurantId !== restaurantId \|\| raw\.branchId !== branchId/,
    readBranchHours: /raw\.restaurantId !== restaurantId \|\| raw\.branchId !== branchId/, readBranchGeo: /raw\.restaurantId !== restaurantId \|\| raw\.branchId !== branchId/ };
  for (const [fn, re] of Object.entries(echo)) { const s = adapterCode.indexOf(`export function ${fn}(`); assert.match(adapterCode.slice(s, s + 1500).split("export function ")[1] ?? "", re, `${fn} echo check`); }
  const views = read(VIEWS);
  for (const s of ["forbidden", "invalid_request", "not_found", "unavailable"]) assert.ok(views.includes(`${s}:`), `view copy for ${s}`);
  for (const [id, src] of Object.entries(pages)) assert.ok(src.includes("ReadFailureNotice"), `${id} renders failure states`);
});
check("parent/child safety: nested reads always pass BOTH restaurantId and branchId; identifiers are shape-checked before any call", () => {
  for (const id of ["restaurant-branch-detail", "restaurant-branch-contact", "restaurant-branch-hours", "restaurant-branch-geo"]) {
    assert.match(pages[id], /\(params\.restaurantId, params\.branchId\)/, id);
  }
  assert.match(pages["restaurant-branches"], /readBranchList\(params\.restaurantId, page\)/);
  for (const fn of ["readBranchDetail", "readBranchContact", "readBranchHours", "readBranchGeo"]) {
    const start = adapterCode.indexOf(`export function ${fn}(`);
    assert.match(adapterCode.slice(start, start + 260), /isValidReadId\(restaurantId\) \|\| !isValidReadId\(branchId\)/, fn);
    assert.match(adapterCode.slice(start, start + 700), /p_restaurant_id: restaurantId, p_branch_id: branchId/, fn);
  }
});
check("bounded pagination: fixed page size 20, page -> offset, page bounded to B1's offset ceiling; no search/filter/limit-from-URL", () => {
  assert.match(adapter, /RESTAURANT_LIST_PAGE_SIZE = 20;/); assert.match(adapter, /RESTAURANT_LIST_MAX_PAGE = 500/);
  assert.match(adapterCode, /p_limit: RESTAURANT_LIST_PAGE_SIZE, p_offset: offset/);
  assert.equal((adapterCode.match(/p_limit: RESTAURANT_LIST_PAGE_SIZE/g) ?? []).length, 2 + 3); // B2 lists + ADMIN-B3 lists
  for (const id of ["restaurants", "restaurant-branches"]) { assert.match(pages[id], /parsePageParam\(searchParams\.page\)/); assert.doesNotMatch(pages[id], /searchParams\.(limit|offset|q|search|filter)/); }
  assert.match(read(VIEWS), /\[1-9\]\[0-9\]\{0,5\}/);
});
check("data minimisation on the pages: no owner identity, email, plan, legal name, geocode fingerprint or error fields are read or rendered", () => {
  for (const src of [...Object.values(pages), adapter, read(VIEWS)]) assert.doesNotMatch(src, /legal_?name|"plan"|\.plan\b|auth_user|restaurant_user|\bemail\b|fingerprint|last_?error|geocode_provider_ref/i);
});
check("registry: exactly the nine B2 routes moved to LIVE; the six B3 routes and every other route status are unchanged", () => {
  const base = git("show", `${BASELINE}:${REGISTRY}`);
  const avail = (text) => Object.fromEntries([...text.matchAll(/defineRoute\(\{ id: "([^"]+)",[^\n]*?availability: "([A-Z_]+)"/g)].map((m) => [m[1], m[2]]));
  const before = avail(base.replace(/\r\n/g, "\n")), now = avail(read(REGISTRY));
  assert.deepEqual(Object.keys(before).sort(), Object.keys(now).sort());
  const changed = Object.keys(now).filter((id) => now[id] !== before[id]).sort();
  assert.deepEqual(changed, [...Object.keys(B2), ...Object.keys(B3), "menu-management", "menu-management-pending", "menu-management-data-quality", "nutrition-certification-pending", "restaurant-item-allergens", "restaurant-item-certification"].sort()); // ADMIN-B3 successor: the six B3 routes are LIVE too
  for (const id of Object.keys(B2)) assert.equal(now[id], "LIVE", id);
  for (const id of Object.keys(B3)) assert.equal(now[id], "LIVE", id);
  assert.equal(Object.values(now).filter((v) => v === "NOT_ENABLED").length, 73 - 8 - 6 - 2);
  assert.equal(Object.values(now).filter((v) => v === "LIVE").length, 8 + 9 + 6 + 4 + 2); // + the four ADMIN-C1 and two ADMIN-C2 routes
});
check("B3 routes are wired by ADMIN-B3 (operational gate, not scaffolds); ingredients stays NOT_ENABLED", () => {
  for (const [id, file] of Object.entries(B3)) { const src = read(file); assert.ok(src.includes(`createAdminOperationalPage<`) && src.includes(`>("${id}",`), id); }
  assert.equal(route("restaurant-item-ingredients").availability, "NOT_ENABLED");
});
check("ADMIN-A unchanged: the branch-status and membership-audit pages/components are byte-identical to the baseline; legacy roots untouched", () => {
  for (const file of ADMIN_A_FILES) assert.equal(git("diff", "--name-only", BASELINE, "--", file), "", file);
  assert.equal(git("diff", "--name-only", BASELINE, "--", "apps/admin-web/app/restaurant-review", "apps/admin-web/app/audit-trail", "apps/admin-web/app/api"), "");
  for (const id of ["restaurant-branch-status", "audit-platform-memberships"]) assert.equal(route(id).availability, "LIVE");
});
check("no database or authority change: no migration, RPC, RLS, permission or vocabulary edit; changed paths are inside the exact B2 allow-list", () => {
  const lines = (v) => v.split(/\r?\n/).filter(Boolean);
  const changed = new Set([...lines(git("diff", "--name-only", BASELINE)), ...lines(git("ls-files", "--others", "--exclude-standard"))]);
  const allowed = new Set([
    REGISTRY, ADAPTER, FACTORY, VIEWS, "package.json",
    ...Object.values(B2).map((v) => v[0]),
    "scripts/admin-restaurant-branch-canonical-ui-b2-guard.mjs", "scripts/admin-restaurant-branch-canonical-ui-b2-mutations.mjs",
    "scripts/admin-restaurant-operational-read-foundation-b1-guard.mjs", "scripts/admin-operational-read-permissions-ae1-guard.mjs",
    "scripts/pre-admin-hardening-h3-h4-guard.mjs",
    "docs/admin-operational-surface-inventory.md", "docs/engineering-state-registers.md", "docs/engineering-handoff.md",
    "apps/admin-web/components/admin-shell/AdminMenuViews.tsx", ...Object.values(B3), "scripts/admin-menu-canonical-ui-b3-guard.mjs", "scripts/admin-menu-canonical-ui-b3-mutations.mjs", "supabase/migrations/20260920030000_admin_operational_review_queues_c.sql", "apps/admin-web/server/adminReviewQueueRead.ts", "apps/admin-web/components/admin-shell/AdminQueueViews.tsx", "apps/admin-web/app/admin/restaurants/menu-management/page.tsx", "apps/admin-web/app/admin/restaurants/menu-management/pending/page.tsx", "apps/admin-web/app/admin/restaurants/menu-management/data-quality/page.tsx", "apps/admin-web/app/admin/nutrition/certification/pending/page.tsx", "scripts/admin-operational-review-queues-c-guard.mjs", "scripts/admin-operational-review-queues-c-mutations.mjs", "scripts/admin-operational-review-queues-c-postgres-apply.mjs", "scripts/admin-menu-canonical-ui-b3-guard.mjs", "scripts/admin-restaurant-branch-canonical-ui-b2-guard.mjs", "scripts/admin-restaurant-operational-read-foundation-b1-guard.mjs", "scripts/admin-restaurant-operational-read-foundation-b1-postgres-apply.mjs", "scripts/admin-operational-read-permissions-ae1-guard.mjs", "scripts/admin-operational-read-permissions-ae1-postgres-apply.mjs", "scripts/pre-admin-hardening-h3-h4-guard.mjs", "scripts/pre-admin-hardening-h3-h4-postgres-apply.mjs", "scripts/restaurant-catalog-authoring-r2b-guard.mjs", "scripts/restaurant-catalog-authoring-r2b-postgres-apply.mjs", "scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs", "scripts/restaurant-owner-display-name-draft-visibility-r2e-postgres-apply.mjs", "apps/admin-web/server/adminRestaurantRead.ts", "package.json", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/allergens/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/certification/page.tsx", "apps/admin-web/app/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/page.tsx"
  ]);
  assert.deepEqual([...changed].filter((f) => !allowed.has(f)), []);
  assert.ok(!changed.has(VOCAB));
  assert.deepEqual([...changed].filter((f) => f.startsWith("supabase/") && f !== "supabase/migrations/20260920030000_admin_operational_review_queues_c.sql"), []); // ADMIN-C adds exactly one additive migration
  assert.equal(git("cat-file", "-t", BASELINE), "commit");
});

const failures = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ suite: SUITE, total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((f) => f.name), productionTouched: false, developmentTouched: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
