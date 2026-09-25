#!/usr/bin/env node
// ADMIN-C guard: the SIX canonical ADMIN-C routes. ADMIN-C1 = four read-only review queues over four purpose-built read contracts;
// ADMIN-C2 = two per-item factual read surfaces (allergens, certification status) that REUSE the ADMIN-B1 item-detail contract. Static; no network.
import assert from "node:assert/strict";
import { isExactAdminE1Successor, matchesE1Source, unexpectedSuccessorPaths } from "./admin-e1-historical-successor.mjs";
import { unexpectedMrbApiOrSupabase } from "./admin-mrb-successor-manifest.mjs";
import child from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SUITE = "admin-operational-review-queues-c-guard";
const BASELINE = "46bfb62457d2e0d86752334481649797ac860db3"; // ADMIN-B3 (pushed) = the ADMIN-C1 baseline
const C1_COMMIT = "6df4660eec5a59ca9f320dad6be0d5486e807924"; // ADMIN-C1 (local) = the ADMIN-C2 baseline
const MIGRATION = "supabase/migrations/20260920030000_admin_operational_review_queues_c.sql";
const D_MIGRATION = "supabase/migrations/20260921010000_admin_dashboard_social_policy_reads_d.sql";
const REGISTRY = "apps/admin-web/auth/admin-route-registry.ts";
const VOCAB = "apps/admin-web/auth/admin-current-permission-vocabulary.ts";
const ADAPTER = "apps/admin-web/server/adminReviewQueueRead.ts";
const B_ADAPTER = "apps/admin-web/server/adminRestaurantRead.ts";
const FACTORY = "apps/admin-web/components/admin-shell/AdminOperationalPage.tsx";
const B_VIEWS = "apps/admin-web/components/admin-shell/AdminRestaurantViews.tsx";
const B3_VIEWS = "apps/admin-web/components/admin-shell/AdminMenuViews.tsx";
const Q_VIEWS = "apps/admin-web/components/admin-shell/AdminQueueViews.tsx";
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const APP = "apps/admin-web/app/admin";

// id -> [page file, adapter read fn, adapter CONTRACTS key, contract, exact key, canonical path, queue reason codes]
const C = Object.freeze({
  "menu-management": [`${APP}/restaurants/menu-management/page.tsx`, "readMenuManagementOverview", "overview", "staff_admin_menu_management_overview_v1", "admin.restaurants.menu_management.read", "/admin/restaurants/menu-management"],
  "menu-management-pending": [`${APP}/restaurants/menu-management/pending/page.tsx`, "readMenuManagementPending", "pending", "staff_admin_menu_management_pending_v1", "admin.restaurants.menu_management.pending.read", "/admin/restaurants/menu-management/pending"],
  "menu-management-data-quality": [`${APP}/restaurants/menu-management/data-quality/page.tsx`, "readMenuManagementDataQuality", "dataQuality", "staff_admin_menu_management_data_quality_v1", "admin.restaurants.menu_management.data_quality.read", "/admin/restaurants/menu-management/data-quality"],
  "nutrition-certification-pending": [`${APP}/nutrition/certification/pending/page.tsx`, "readNutritionCertificationPending", "certificationPending", "staff_admin_nutrition_certification_pending_v1", "admin.nutrition.certification.pending.read", "/admin/nutrition/certification/pending"]
});
// ADMIN-C2: id -> [page file, exact key, canonical path]. Both reuse readMenuItemDetail (staff_admin_restaurant_menu_item_detail_v1).
const IT = `${APP}/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]`;
const C2 = Object.freeze({
  "restaurant-item-allergens": [`${IT}/allergens/page.tsx`, "admin.restaurants.menu_item.read", "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/allergens"],
  "restaurant-item-certification": [`${IT}/certification/page.tsx`, "admin.restaurants.menu_item.read", "/admin/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]/certification"]
});
const ITEM_DETAIL = `${IT}/page.tsx`;
const C1_FILES = [MIGRATION, ADAPTER, Q_VIEWS, ...Object.values(C).map((v) => v[0])];
const B_IDS = ["restaurants", "restaurant-detail", "restaurant-about", "restaurant-contact", "restaurant-branches", "restaurant-branch-detail", "restaurant-branch-contact", "restaurant-branch-hours", "restaurant-branch-geo",
  "restaurant-menus", "restaurant-menu-detail", "restaurant-menu-items", "restaurant-branch-menu-items", "restaurant-menu-item-detail", "restaurant-item-nutrition"];
const R = `${APP}/restaurants`;
const B_FILES = [`${R}/page.tsx`, `${R}/[restaurantId]/page.tsx`, `${R}/[restaurantId]/about/page.tsx`, `${R}/[restaurantId]/contact/page.tsx`, `${R}/[restaurantId]/branches/page.tsx`,
  `${R}/[restaurantId]/branches/[branchId]/page.tsx`, `${R}/[restaurantId]/branches/[branchId]/contact/page.tsx`, `${R}/[restaurantId]/branches/[branchId]/hours/page.tsx`, `${R}/[restaurantId]/branches/[branchId]/geo/page.tsx`,
  `${R}/[restaurantId]/menus/page.tsx`, `${R}/[restaurantId]/menus/[menuId]/page.tsx`, `${R}/[restaurantId]/menus/[menuId]/items/page.tsx`, `${R}/[restaurantId]/branches/[branchId]/menu-items/page.tsx`,
  `${R}/[restaurantId]/menus/[menuId]/items/[itemId]/nutrition/page.tsx`, B3_VIEWS, B_VIEWS, FACTORY];
const ADMIN_A_FILES = ["apps/admin-web/app/admin/audit/platform-memberships/page.tsx", `${R}/[restaurantId]/branches/[branchId]/status/page.tsx`, "apps/admin-web/components/admin-shell/AdminBranchStatusWorkspace.tsx", "apps/admin-web/components/admin-shell/AdminMembershipAudit.tsx", "apps/admin-web/components/PlatformAdminBranchStatus.tsx"];
const DEFERRED_ROUTES = ["menu-management-duplicates", "menu-management-aliases", "menu-management-nutrition-discrepancy", "nutrition-certification", "nutrition-certification-discrepancy", "nutrition-certification-remote-review", "nutrition-certification-history", "nutrition-certification-re-review", "restaurant-item-ingredients"];
const LEGACY_ROOTS = ["pending-menu-items", "data-quality", "nutrition-review", "menu-review", "tags"].map((r) => `apps/admin-web/app/${r}`);
const EXPECTED_REASONS = ["item_status_draft", "menu_belongs_to_other_restaurant", "badge_without_current_nutrition", "multiple_current_nutrition", "badge_pending_review", "nutrition_record_pending_review"];

const checks = [];
function check(name, fn) {
  let pass = false, detail;
  try { fn(); pass = true; } catch (error) { detail = String(error?.message ?? error).split("\n")[0].slice(0, 300); }
  checks.push({ name, pass, ...(pass ? {} : { detail }) });
  console.log(`${pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}${pass ? "" : `\n     detail: ${detail}`}`);
}
const git = (...args) => child.execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const stripSqlComments = (s) => s.replace(/--[^\n]*/g, "");
const stripTsComments = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*") && !l.trimStart().startsWith("/*")).join("\n");
const migration = read(MIGRATION), sql = stripSqlComments(migration);
const adapter = read(ADAPTER), adapterCode = stripTsComments(adapter);
const pages = Object.fromEntries(Object.entries(C).map(([id, v]) => [id, read(v[0])]));
const cSources = () => [...Object.values(pages), adapter, read(Q_VIEWS)];
// the four SQL function bodies, keyed by function name
const bodies = Object.fromEntries([...sql.matchAll(/create function public\.([a-z_0-9]+)\(p_limit integer default 20, p_offset integer default 0\)[\s\S]*?as \$\$([\s\S]*?)\n\$\$;/g)].map((m) => [m[1], m[2]]));

let registry, vocabulary;
try {
  vocabulary = { exports: {} }; new Function("exports", "module", ts.transpileModule(read(VOCAB), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(vocabulary.exports, vocabulary);
  registry = { exports: {} }; new Function("exports", "module", "require", ts.transpileModule(read(REGISTRY), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(registry.exports, registry, () => vocabulary.exports);
} catch (error) { console.log("load error", error.message); }
const route = (id) => registry.exports.ADMIN_ROUTE_REGISTRY.find((r) => r.id === id);
const availOf = (text) => Object.fromEntries([...text.matchAll(/defineRoute\(\{ id: "([^"]+)",[^\n]*?availability: "([A-Z_]+)"/g)].map((m) => [m[1], m[2]]));

check("ADMIN-C1 exact four-queue scope (unchanged): each canonical path exists in the registry, has a real page file and is LIVE", () => {
  assert.equal(Object.keys(C).length, 4);
  for (const [id, [file, , , , , routePath]] of Object.entries(C)) {
    assert.equal(route(id).route, routePath, id);
    assert.ok(fs.existsSync(path.join(ROOT, file)), file);
    assert.equal(route(id).availability, "LIVE", id);
  }
});
check("each page is created through the canonical operational gate with its own route id and calls exactly its one queue read", () => {
  for (const [id, [, fn]] of Object.entries(C)) {
    const src = pages[id];
    assert.ok(src.includes("createAdminOperationalPage<") && src.includes(`>("${id}",`), `${id} factory/route id`);
    assert.ok(new RegExp(`\\b${fn}\\(`).test(src), `${id} uses ${fn}`);
    const reads = [...src.matchAll(/\bread[A-Z][A-Za-z]+\(/g)].map((m) => m[0]);
    assert.deepEqual([...new Set(reads)], [`${fn}(`], `${id} reads only ${fn}`);
    // and it imports only its own read from the ADMIN-C adapter (no bundled sibling read, called or not)
    const imported = [...src.matchAll(/import \{([^}]*)\} from "apps\/admin-web\/server\/adminReviewQueueRead"/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()).filter(Boolean));
    assert.deepEqual(imported, [fn], `${id} imports only ${fn}`);
  }
});
check("exact queue contracts: the ADMIN-C adapter names exactly the four contracts, reuses the ADMIN-B shared call site (no second .rpc), and each read uses its own contract", () => {
  const used = [...adapterCode.matchAll(/"(staff_admin_[a-z_0-9]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(used, Object.values(C).map((v) => v[3]).sort());
  assert.equal((adapterCode.match(/\.rpc\(/g) ?? []).length, 0);
  assert.match(adapterCode, /import \{[^}]*\bcall\b[^}]*\} from "\.\/adminRestaurantRead"/);
  assert.equal((stripTsComments(read(B_ADAPTER)).match(/\.rpc\(/g) ?? []).length, 1);
  for (const [, [, fn, key, contract]] of Object.entries(C)) {
    assert.ok(adapterCode.includes(`${key}: "${contract}"`), `${key} -> ${contract}`);
    const s = adapterCode.indexOf(`export function ${fn}(`); assert.ok(s > 0, fn);
    assert.ok(adapterCode.slice(s, s + 900).split("export function ")[1]?.includes(`CONTRACTS.${key}`), `${fn} -> ${key}`);
  }
  assert.deepEqual(Object.keys(bodies).sort(), Object.values(C).map((v) => v[3]).sort());
});
check("exact permission mapping: every route requires exactly its own CURRENT key in the registry AND in its contract's first statement; no admin_context.read, no umbrella, no direct predicate fallback", () => {
  for (const [id, [, , , contract, key]] of Object.entries(C)) {
    assert.deepEqual([...route(id).requiredPermissions], [key], id);
    assert.ok(vocabulary.exports.CURRENT_ADMIN_PERMISSION_KEYS.includes(key), key);
    const body = bodies[contract];
    const gates = [...body.matchAll(/staff_admin_restaurant_read_gate_v1\('([^']+)'\)/g)].map((m) => m[1]);
    assert.deepEqual(gates, [key], `${contract} gates`);
    assert.doesNotMatch(body, /staff_has_permission_v1|admin_context/);
    assert.match(body.slice(body.indexOf("begin")), /^begin\n  if not admin_internal\.staff_admin_restaurant_read_gate_v1\('/, `${contract} checks the key first`);
  }
  assert.equal(new Set(Object.values(C).map((v) => v[4])).size, 4);
  // the only mention is the postcondition that REFUSES a body containing it (fail-closed), never a gate argument
  assert.deepEqual([...sql.matchAll(/[^\n]*admin_context\.read[^\n]*/g)].map((m) => m[0].trim()).filter((l) => !l.includes("strpos(v_fn.prosrc, 'admin_context.read') > 0")), []);
  for (const src of cSources()) assert.doesNotMatch(src, /admin_context\.read/);
});
check("migration security shape: four SECURITY DEFINER STABLE functions with empty search_path and row_security on, executable only by the sealed ADMIN-B1 reader (owner) and authenticated; PUBLIC/anon/service_role/authenticator revoked", () => {
  assert.equal((sql.match(/create function /g) ?? []).length, 4);
  assert.equal((sql.match(/\n\s*stable\n\s*security definer\n\s*set search_path = ''\n\s*set row_security = 'on'/g) ?? []).length, 4);
  assert.match(sql, /revoke all on function[\s\S]*?from public, anon, authenticated, authenticator, service_role, staff_admin_restaurant_reader;/);
  assert.match(sql, /grant execute on function[\s\S]*?to authenticated;/);
  assert.equal((sql.match(/\bto (public|anon)\b/g) ?? []).length, 0);
  assert.equal((sql.match(/owner to staff_admin_restaurant_reader;/g) ?? []).length, 4);
  assert.doesNotMatch(sql, /create role|create schema|create table|create policy|create view|alter table|alter role|create extension/i);
  // no new privilege for the sealed reader beyond the transient CREATE used for the ownership transfer (revoked in the same migration)
  assert.doesNotMatch(sql, /grant (select|insert|update|delete|references|trigger|truncate)/i);
  assert.match(sql, /revoke create on schema public from staff_admin_restaurant_reader;/);
  assert.match(sql, /revoke staff_admin_restaurant_reader from postgres granted by postgres;/);
  for (const m of ["c_contract_permission_mismatch_", "c_contract_acl_mismatch_", "c_contract_unbounded_", "c_contract_not_read_only_", "c_reader_non_select_privilege", "c_reader_create_privilege_retained", "c_client_table_grant_present"]) assert.ok(migration.includes(m), m);
});
check("read-only boundary: no write verb or DDL in any contract body, no write function, no mutation capability (approve/reject/certify/nutritionist/consultation) anywhere in the ADMIN-C sources", () => {
  for (const [name, body] of Object.entries(bodies)) assert.doesNotMatch(body, /(^|[^a-z_])(insert|update|delete|truncate|merge|alter|drop|create|grant|revoke)\s/i, name);
  assert.doesNotMatch(sql.replace(/[\s\S]*?(?=\bcreate function)/, ""), /(^|\n)\s*(insert|update|delete|truncate)\s/i);
  for (const src of [sql, ...cSources().map(stripTsComments)]) assert.doesNotMatch(src.replace(/'approved'/g, ""), /(approve|reject|certify|nutritionist|consultation)/i);
  for (const src of [...Object.values(pages), read(Q_VIEWS)]) assert.doesNotMatch(src, /<form|<button|<input|<textarea|<select|method=|onSubmit|onClick|"use server"/i);
  for (const src of [adapterCode, ...Object.values(pages)]) assert.doesNotMatch(src, /\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(|\bfetch\(|createClient\(|SERVICE_ROLE|service_role/);
});
check("queue definitions are canonical (existing states only): pending = menu_items.status 'draft'; certification = badge 'pending_review' OR a record verified_status 'pending_review'; data quality = exactly three objective linkage/projection invariants", () => {
  assert.equal((bodies.staff_admin_menu_management_pending_v1.match(/where mi\.status = 'draft'/g) ?? []).length, 1);
  assert.doesNotMatch(bodies.staff_admin_menu_management_pending_v1, /\bin \('draft'|status <> |status != /);
  const cert = bodies.staff_admin_nutrition_certification_pending_v1;
  assert.match(cert, /where f\.badge_status = 'pending_review' or f\.pending_record_count > 0/);
  assert.equal((cert.match(/verified_status = 'pending_review'/g) ?? []).length, 3);
  const dq = bodies.staff_admin_menu_management_data_quality_v1;
  const codes = [...dq.matchAll(/then '([a-z_]+)' end/g)].map((m) => m[1]);
  assert.deepEqual(codes, ["menu_belongs_to_other_restaurant", "badge_without_current_nutrition", "multiple_current_nutrition"]);
  assert.match(dq, /mn\.restaurant_id <> mi\.restaurant_id/);
  assert.match(dq, /mi\.nutrition_badge_status in \('approved', 'ai_estimated'\)/);
  assert.match(dq, /count\(\*\) from public\.menu_item_nutrition n where n\.menu_item_id = mi\.id and n\.is_current\) > 1/);
  assert.match(dq, /where pg_catalog\.cardinality\(f\.reasons\) > 0/);
  const used = new Set([...sql.matchAll(/'([a-z]+_[a-z_]+)'/g)].map((m) => m[1]).filter((c) => EXPECTED_REASONS.includes(c) || /^(item_|menu_belongs|badge_|multiple_|nutrition_record)/.test(c)));
  assert.deepEqual([...used].sort(), [...EXPECTED_REASONS].sort());
  const labels = read(Q_VIEWS);
  for (const code of EXPECTED_REASONS) assert.ok(labels.includes(`${code}:`), `label for ${code}`);
});
check("bounded reads: every contract rejects (never clamps) limit outside 1..50 and offset outside 0..10000, pages with limit+1 lookahead and a total order; the adapter fixes the page size at 20; pages take only ?page", () => {
  for (const [name, body] of Object.entries(bodies)) {
    assert.match(body, /v_limit not between 1 and 50 or v_offset not between 0 and 10000/, name);
    assert.match(body, /limit v_limit \+ 1 offset v_offset/, name);
    assert.match(body, /collate "C"/, name);
    assert.match(body, /coalesce\(p_limit, 20\)/, name);
  }
  assert.match(read(B_ADAPTER), /RESTAURANT_LIST_PAGE_SIZE = 20;/);
  assert.equal((adapterCode.match(/p_limit: RESTAURANT_LIST_PAGE_SIZE, p_offset: offset/g) ?? []).length, 2);
  for (const [id, src] of Object.entries(pages)) { assert.match(src, /parsePageParam\(searchParams\.page\)/, id); assert.match(src, /PageControls/, id); assert.doesNotMatch(src, /searchParams\.(limit|offset|q|search|filter|sort)/, id); }
  assert.doesNotMatch(sql, /order by [^\n]*(priority|score|severity)/i);
});
check("states are distinct and never collapsed into an empty list: forbidden / invalid_request / unavailable via the shared failure notice, an explicit empty state, ready", () => {
  for (const [id, src] of Object.entries(pages)) { assert.ok(src.includes("ReadFailureNotice"), `${id} failure states`); assert.ok(src.includes("EmptyNotice"), `${id} empty state`); }
  assert.match(adapterCode, /if \(!validPage\(page\)\) return Promise\.resolve\(\{ state: "invalid_request" \}\)/);
  const b = read(B_ADAPTER);
  assert.match(b, /Object\.keys\(raw\)\.length === 1/); assert.match(b, /result\.error\) return \{ state: "unavailable" \}/);
  assert.match(adapterCode, /parseReasons/); assert.match(adapterCode, /v\.length === 0\) return null/); // a row without a reason is malformed, never silently shown
});
check("no mock or static queue data: no mock adapter, @haocu/shared mock exports, legacy services or static arrays in any ADMIN-C source", () => {
  for (const src of [...cSources(), read(Q_VIEWS)]) assert.doesNotMatch(src, /adapters\/mock|admin-restaurant-mock-adapter|@haocu\/shared|mock[A-Z]|canonical(PendingMenuItems|DataQualityIssues|Restaurants|Menu)|\/services\/|\/repositories\/|view-models\/admin-governance/);
  for (const [id, src] of Object.entries(pages)) assert.doesNotMatch(src, /const [A-Za-z]+ = \[\s*\{/, `${id} static rows`);
});
check("data minimisation: queue rows carry ids, names, the lifecycle/review fact, reasons and timestamps only — no owner identity, auth id, email, legal name, plan, consumer or audit data", () => {
  for (const src of [...Object.values(pages), adapter, read(Q_VIEWS), sql]) assert.doesNotMatch(src.replace(/'approved'/g, ""), /legal_?name|"plan"|\.plan\b|auth_user|restaurant_user|\bemail\b|meal_record|consumer_|audit_log|staff_management|last_?error|fingerprint/i);
});
check("registry: ADMIN-C's six routes and ADMIN-B's 15 stay LIVE; the exact two ADMIN-D successors are also LIVE", () => {
  const before = availOf(git("show", `${BASELINE}:${REGISTRY}`).replace(/\r\n/g, "\n")), now = availOf(read(REGISTRY));
  assert.deepEqual(Object.keys(before).sort(), Object.keys(now).sort());
  assert.deepEqual(Object.keys(now).filter((id) => now[id] !== before[id]).sort(), [...Object.keys(C), ...Object.keys(C2), "dashboard", "social-policies"].sort());
  for (const id of Object.keys(C)) { assert.equal(before[id], "DEMO", id); assert.equal(now[id], "LIVE", id); }
  for (const id of Object.keys(C2)) { assert.equal(before[id], "NOT_ENABLED", id); assert.equal(now[id], "LIVE", id); }
  for (const id of B_IDS) assert.equal(now[id], "LIVE", id);
  for (const id of DEFERRED_ROUTES) assert.equal(now[id], before[id], id);
  assert.equal(now.dashboard, "LIVE"); assert.equal(now["social-policies"], "LIVE");
  assert.equal(Object.values(now).filter((v) => v === "LIVE").length, 23 + 4 + 2 + 2);
  assert.equal(Object.values(now).filter((v) => v === "DEMO").length, 16 - 4 - 2);
  assert.equal(Object.values(now).filter((v) => v === "NOT_ENABLED").length, 59 - 2);
});
check("ADMIN-B unchanged except the exact ADMIN-D PageControls caption successor; the B1 contracts and read layer preserve their boundaries", () => {
  for (const file of B_FILES.filter((file) => file !== B_VIEWS)) assert.equal(git("diff", "--name-only", BASELINE, "--", file), "", file);
  const viewDiff = git("diff", "-U0", BASELINE, "--", B_VIEWS).split("\n").filter((line) => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line));
  assert.deepEqual(viewDiff, [
    "-/** Minimal previous/next controls over the bounded B1 page (`?page=N`, 20 rows). */",
    "-export function PageControls({ basePath, page, hasMore }: { basePath: string; page: number; hasMore: boolean }) {",
    "+/** Minimal previous/next controls over a bounded page (`?page=N`). */",
    "+export function PageControls({ basePath, page, hasMore, pageSize = 20 }: { basePath: string; page: number; hasMore: boolean; pageSize?: number }) {",
    "-      <span>第 {page} 頁 · 每頁 20 筆</span>",
    "+      <span>第 {page} 頁 · 每頁 {pageSize} 筆</span>"
  ]);
  const diff = git("diff", "-U0", BASELINE, "--", B_ADAPTER).split("\n").filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  assert.ok(diff.length > 0 && diff.every((l) => /^[+-](export )?(const |async function |function |\/\*\* Shared|type ContractName)|^[+-]\s*contract: (ContractName|string),$|^[+-]$/.test(l)), diff.join(" | "));
  const b1 = "supabase/migrations/20260920020000_admin_restaurant_operational_read_foundation_b1.sql";
  assert.equal(git("diff", "--name-only", BASELINE, "--", b1), "");
});
check("ADMIN-A and AE1 stay frozen; legacy roots are preserved or match exact ADMIN-E1 retirement", () => {
  for (const file of ADMIN_A_FILES) assert.equal(git("diff", "--name-only", BASELINE, "--", file), "", file);
  for (const dir of LEGACY_ROOTS) {
    const file = `${dir}/page.tsx`;
    if (isExactAdminE1Successor()) assert.ok(matchesE1Source(file, read(file)), file);
    else assert.equal(git("diff", "--name-only", BASELINE, "--", dir), "", dir);
  }
  for (const id of ["restaurant-branch-status", "audit-platform-memberships"]) assert.equal(route(id).availability, "LIVE");
  assert.equal(git("diff", "--name-only", BASELINE, "--", VOCAB, "supabase/migrations/20260920010000_admin_operational_read_permissions_ae1.sql"), "");
  assert.doesNotMatch(migration, /staff_permission_catalog|staff_permission_entitlements/);
});
check("database changes remain additive and exact: ADMIN-C plus the one ADMIN-D successor; no historical migration modified or removed", () => {
  const lines = (v) => v.split(/\r?\n/).filter(Boolean);
  const status = lines(git("diff", "--name-status", BASELINE));
  assert.deepEqual(status.filter((l) => /\tsupabase\//.test(l) && !/^A\t/.test(l)), []);
  const changed = new Set([...lines(git("diff", "--name-only", BASELINE)), ...lines(git("ls-files", "--others", "--exclude-standard"))]);
  assert.deepEqual([...changed].filter((f) => f.startsWith("supabase/") && ![MIGRATION, D_MIGRATION].includes(f)), []);
  assert.deepEqual(unexpectedMrbApiOrSupabase([...changed], new Set([MIGRATION, D_MIGRATION]))
    .filter((f) => /^apps\/admin-web\/app\/api\//.test(f)), []);
  assert.ok(changed.has(MIGRATION));
  assert.equal(fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort().at(-1), path.basename(D_MIGRATION));
  assert.equal(git("cat-file", "-t", BASELINE), "commit");
});
check("changed paths are inside the exact ADMIN-C allow-list", () => {
  const lines = (v) => v.split(/\r?\n/).filter(Boolean);
  const changed = new Set([...lines(git("diff", "--name-only", BASELINE)), ...lines(git("ls-files", "--others", "--exclude-standard"))]);
  const allowed = new Set([
    MIGRATION, REGISTRY, B_ADAPTER, B_VIEWS, ADAPTER, Q_VIEWS, "package.json", ...Object.values(C).map((v) => v[0]), ...Object.values(C2).map((v) => v[0]), ITEM_DETAIL,
    "scripts/admin-operational-review-queues-c-guard.mjs", "scripts/admin-operational-review-queues-c-mutations.mjs", "scripts/admin-operational-review-queues-c-postgres-apply.mjs",
    "scripts/admin-menu-canonical-ui-b3-guard.mjs", "scripts/admin-restaurant-branch-canonical-ui-b2-guard.mjs", "scripts/admin-restaurant-operational-read-foundation-b1-guard.mjs",
    "scripts/admin-restaurant-operational-read-foundation-b1-postgres-apply.mjs", "scripts/admin-operational-read-permissions-ae1-guard.mjs", "scripts/admin-operational-read-permissions-ae1-postgres-apply.mjs",
    "scripts/pre-admin-hardening-h3-h4-guard.mjs", "scripts/pre-admin-hardening-h3-h4-postgres-apply.mjs", "scripts/restaurant-catalog-authoring-r2b-guard.mjs", "scripts/restaurant-catalog-authoring-r2b-postgres-apply.mjs",
    "scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs", "scripts/restaurant-owner-display-name-draft-visibility-r2e-postgres-apply.mjs",
    "docs/admin-operational-surface-inventory.md", "docs/engineering-state-registers.md", "docs/engineering-handoff.md",
    D_MIGRATION, "apps/admin-web/server/adminDashboardSocialRead.ts", "apps/admin-web/app/admin/page.tsx", "apps/admin-web/app/admin/social/policies/page.tsx",
    "scripts/admin-dashboard-social-policies-d-rules.mjs", "scripts/admin-dashboard-social-policies-d-guard.mjs", "scripts/admin-dashboard-social-policies-d-mutations.mjs", "scripts/admin-dashboard-social-policies-d-postgres-apply.mjs"
  ]);
  assert.deepEqual(unexpectedSuccessorPaths(changed, allowed), []);
});

// ------------------------------------------------------------------------------------------------ ADMIN-C2
const c2pages = Object.fromEntries(Object.entries(C2).map(([id, v]) => [id, read(v[0])]));
const c2Code = Object.fromEntries(Object.entries(c2pages).map(([id, s]) => [id, stripTsComments(s)]));
check("ADMIN-C2: the canonical ADMIN-C set is exactly SIX routes (C1 four queues + two item status pages), all LIVE, each path in the registry with a real page file", () => {
  const six = [...Object.keys(C), ...Object.keys(C2)];
  assert.equal(new Set(six).size, 6);
  for (const [id, [file, , routePath]] of Object.entries(C2)) { assert.equal(route(id).route, routePath, id); assert.ok(fs.existsSync(path.join(ROOT, file)), file); }
  for (const id of six) assert.equal(route(id).availability, "LIVE", id);
});
check("ADMIN-C2: both item pages require exactly admin.restaurants.menu_item.read (no admin_context.read fallback, no new key, not the certification-queue key) and are created through the canonical operational gate", () => {
  const queueKeys = Object.values(C).map((v) => v[4]);
  for (const [id, [, key]] of Object.entries(C2)) {
    assert.deepEqual([...route(id).requiredPermissions], [key], id);
    assert.ok(vocabulary.exports.CURRENT_ADMIN_PERMISSION_KEYS.includes(key), key);
    assert.ok(!queueKeys.includes(key), id);
    assert.ok(c2pages[id].includes("createAdminOperationalPage<") && c2pages[id].includes(`>("${id}",`), `${id} gate/route id`);
    assert.doesNotMatch(c2pages[id], /admin_context\.read|admin\.nutrition\.certification\.pending|readNutritionCertificationPending|adminReviewQueueRead/);
  }
});
check("ADMIN-C2: both pages REUSE the existing ADMIN-B1 item-detail read boundary (readMenuItemDetail with the full Restaurant/Menu/Item chain) - no new RPC, no new adapter read, no migration", () => {
  for (const [id, src] of Object.entries(c2pages)) {
    assert.match(src, /readMenuItemDetail\(params\.restaurantId, params\.menuId, params\.itemId\)/, id);
    assert.deepEqual([...new Set([...src.matchAll(/\bread[A-Z][A-Za-z]+\(/g)].map((m) => m[0]))], ["readMenuItemDetail("], id);
    const imported = [...src.matchAll(/import \{([^}]*)\} from "apps\/admin-web\/server\/([A-Za-z]+)"/g)].map((m) => [m[2], m[1].trim()]);
    assert.deepEqual(imported, [["adminRestaurantRead", "readMenuItemDetail"]], id);
    assert.doesNotMatch(src, /\.rpc\(|supabase|staff_admin_/i, id);
  }
  // hierarchy enforcement lives once, in the shared adapter (wrong menu -> not_found), and is unchanged
  assert.match(stripTsComments(read(B_ADAPTER)), /result\.data\.menuId !== menuId \? \{ state: "not_found" \} : result/);
  for (const file of [B_ADAPTER, ADAPTER, "supabase/migrations/20260920020000_admin_restaurant_operational_read_foundation_b1.sql"]) assert.equal(git("diff", "--name-only", C1_COMMIT, "--", file), "", file);
  const lines = (v) => v.split(/\r?\n/).filter(Boolean);
  const successorSupabase = [...lines(git("diff", "--name-only", C1_COMMIT, "--", "supabase")), ...lines(git("ls-files", "--others", "--exclude-standard", "--", "supabase"))];
  assert.deepEqual(successorSupabase, [D_MIGRATION]);
  assert.equal(fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort().at(-1), path.basename(D_MIGRATION));
});
check("ADMIN-C2 read-only boundary: no form/button/input, no server action, no fetch or table access, no approve/reject/certify/edit/recalculate, no Nutritionist workflow, no mock or static data", () => {
  for (const [id, src] of Object.entries(c2pages)) {
    assert.doesNotMatch(src, /<form|<button|<input|<textarea|<select|method=|onSubmit|onClick|"use server"/i, id);
    assert.doesNotMatch(c2Code[id], /\.from\(|\.insert\(|\.update\(|\.delete\(|\bfetch\(|createClient\(|service_role/, id);
    assert.doesNotMatch(c2Code[id].replace(/'approved'/g, ""), /(approve|reject|certify|revoke|recalculat|nutritionist|consultation)/i, id);
    assert.doesNotMatch(src, /adapters\/mock|@haocu\/shared|mock[A-Z]|\/services\/|\/repositories\/|const [A-Za-z]+ = \[\s*[\{"']/, id);
  }
});
check("ADMIN-C2 no inference: allergens are rendered only from the contract's allergens[] (no description/AI/keyword derivation, empty state is explicit); certification shows only the contract's status facts (no certified verdict, no confidence interpretation, explicit none-state)", () => {
  const a = c2pages["restaurant-item-allergens"], c = c2pages["restaurant-item-certification"];
  assert.match(a, /result\.data\.allergens/);
  assert.doesNotMatch(c2Code["restaurant-item-allergens"], /data\.description|imageUrl|includes\(|matchAll|\.match\(|\.test\(|\bai\b|infer|guess|nutrition/i);
  assert.ok(a.includes('data-c2-allergens="none"') && a.includes("result.data.allergens.length === 0"));
  for (const field of ["nutritionBadgeStatus", "badgeEnabled", "verifiedStatus", "source", "updatedAt"]) assert.ok(c.includes(field), field);
  assert.ok(c.includes("result.data.currentNutrition === null") && c.includes('data-c2-certification="none"'));
  assert.doesNotMatch(c2Code["restaurant-item-certification"], /confidenceScore|已認證|未認證|認證通過|certified|isCertified|allergen|calories|protein/i);
  for (const [id, src] of Object.entries(c2pages)) assert.ok(src.includes("ReadFailureNotice"), `${id} renders forbidden/invalid/not_found/unavailable`);
});
check("ADMIN-C2 navigation: the item-detail page gained ONLY the two contextual links (each gated by its own exact key); everything else on it is byte-identical to the ADMIN-B3 baseline; the sidebar is untouched", () => {
  const d = read(ITEM_DETAIL);
  assert.ok(d.includes("`${base}/allergens`") && d.includes("`${base}/certification`") && d.includes("`${base}/nutrition`"));
  assert.equal((d.match(/allowed: has\(context, "admin\.restaurants\.menu_item\.read"\)/g) ?? []).length, 3);
  const diff = git("diff", "-U0", BASELINE, "--", ITEM_DETAIL).split("\n").filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  assert.ok(diff.length > 0 && diff.every((l) => /SubLinks links=|\{ label: "|^\+\s*\]\} \/>$/.test(l)), diff.join(" | "));
  assert.equal(git("diff", "--name-only", BASELINE, "--", "apps/admin-web/components/admin-shell/admin-ia-navigation.ts", "apps/admin-web/components/admin-shell/AdminShell.tsx"), "");
});
check("ADMIN-C1 unchanged by C2: the four queue pages, their adapter, views and migration are byte-identical to the ADMIN-C1 commit; their four contracts and keys are still exactly as shipped", () => {
  for (const file of C1_FILES) assert.equal(git("diff", "--name-only", C1_COMMIT, "--", file), "", file);
  assert.equal(Object.keys(bodies).length, 4);
  for (const [id, [, , , contract, key]] of Object.entries(C)) { assert.deepEqual([...route(id).requiredPermissions], [key], id); assert.ok(bodies[contract], contract); }
  assert.equal(git("cat-file", "-t", C1_COMMIT), "commit");
});

const failures = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ suite: SUITE, total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((f) => f.name), productionTouched: false, developmentTouched: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
