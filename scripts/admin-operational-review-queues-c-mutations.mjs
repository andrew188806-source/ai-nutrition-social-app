#!/usr/bin/env node
// ADMIN-C (C1 queues + C2 item status pages) mutation suite: every mutant must be killed by the ADMIN-C guard. Mutants are applied in place and ALWAYS
// restored (finally + signal handlers); the run ends by proving the tree is byte-identical and the guard passes again.
import child from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GUARD = "scripts/admin-operational-review-queues-c-guard.mjs";
const APP = "apps/admin-web/app/admin";
const MIGRATION = "supabase/migrations/20260920030000_admin_operational_review_queues_c.sql";
const REGISTRY = "apps/admin-web/auth/admin-route-registry.ts";
const ADAPTER = "apps/admin-web/server/adminReviewQueueRead.ts";
const B_ADAPTER = "apps/admin-web/server/adminRestaurantRead.ts";
const OVERVIEW = `${APP}/restaurants/menu-management/page.tsx`;
const PENDING = `${APP}/restaurants/menu-management/pending/page.tsx`;
const DQ = `${APP}/restaurants/menu-management/data-quality/page.tsx`;
const CERT = `${APP}/nutrition/certification/pending/page.tsx`;
const B3_MENUS = `${APP}/restaurants/[restaurantId]/menus/page.tsx`;
const STATUS = `${APP}/restaurants/[restaurantId]/branches/[branchId]/status/page.tsx`;
const IT = `${APP}/restaurants/[restaurantId]/menus/[menuId]/items/[itemId]`;
const ALLERGENS = `${IT}/allergens/page.tsx`;
const CERTIFICATION = `${IT}/certification/page.tsx`;
const ITEM_DETAIL = `${IT}/page.tsx`;
const files = [MIGRATION, REGISTRY, ADAPTER, B_ADAPTER, OVERVIEW, PENDING, DQ, CERT, B3_MENUS, STATUS, ALLERGENS, CERTIFICATION, ITEM_DETAIL];
const original = new Map(files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
function restore() { for (const [f, text] of original) fs.writeFileSync(path.join(ROOT, f), text); }
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(signal, () => { restore(); process.exit(130); });
process.on("exit", restore);

const once = (from, to) => (text) => {
  const norm = text.replace(/\r\n/g, "\n");
  if (!norm.includes(from)) throw new Error(`mutation anchor missing: ${from.slice(0, 70)}`);
  return norm.replace(from, () => to);
};
const routeLine = (id, transform) => (text) => {
  const norm = text.replace(/\r\n/g, "\n"); let hit = false;
  const out = norm.split("\n").map((line) => { if (line.includes(`defineRoute({ id: "${id}",`)) { hit = true; return transform(line); } return line; }).join("\n");
  if (!hit) throw new Error(`route ${id} not found`); return out;
};
const append = (s) => (t) => t.replace(/\r\n/g, "\n") + s;
const PEND_GATE = "if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_management.pending.read') then";
const PRE_OWNER = "grant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;";

const mutants = [
  { id: "A", name: "wrong permission in the registry (pending -> data_quality key)", file: REGISTRY, fn: routeLine("menu-management-pending", (l) => l.replace('requiredPermissions: ["admin.restaurants.menu_management.pending.read"]', 'requiredPermissions: ["admin.restaurants.menu_management.data_quality.read"]')) },
  { id: "A2", name: "wrong permission in the contract (pending gate uses the data-quality key)", file: MIGRATION, fn: once(PEND_GATE, "if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_management.data_quality.read') then") },
  { id: "A3", name: "an umbrella: the overview route accepts the pending key too", file: REGISTRY, fn: routeLine("menu-management", (l) => l.replace('requiredPermissions: ["admin.restaurants.menu_management.read"]', 'requiredPermissions: ["admin.restaurants.menu_management.read", "admin.restaurants.menu_management.pending.read"]')) },
  { id: "B", name: "admin_context.read fallback in the registry (certification route)", file: REGISTRY, fn: routeLine("nutrition-certification-pending", (l) => l.replace('requiredPermissions: ["admin.nutrition.certification.pending.read"]', 'requiredPermissions: ["admin_context.read"]')) },
  { id: "B2", name: "admin_context.read fallback in a contract body", file: MIGRATION, fn: once(PEND_GATE, "if not (admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.menu_management.pending.read') or public.staff_has_permission_v1('admin_context.read')) then") },
  { id: "C", name: "PUBLIC execute restored on a contract", file: MIGRATION, fn: once(PRE_OWNER, "grant execute on function public.staff_admin_menu_management_pending_v1(integer, integer) to public;\n" + PRE_OWNER) },
  { id: "C2", name: "anon execute restored on a contract", file: MIGRATION, fn: once(PRE_OWNER, "grant execute on function public.staff_admin_nutrition_certification_pending_v1(integer, integer) to anon;\n" + PRE_OWNER) },
  { id: "C3", name: "a contract is left owned by postgres instead of the sealed reader", file: MIGRATION, fn: once("alter function public.staff_admin_menu_management_data_quality_v1(integer, integer) owner to staff_admin_restaurant_reader;", "alter function public.staff_admin_menu_management_data_quality_v1(integer, integer) owner to postgres;") },
  { id: "D", name: "pagination bound removed from a contract", file: MIGRATION, fn: once("if v_limit not between 1 and 50 or v_offset not between 0 and 10000 then", "if false then") },
  { id: "D2", name: "page size raised above the B1 default", file: B_ADAPTER, fn: once("RESTAURANT_LIST_PAGE_SIZE = 20", "RESTAURANT_LIST_PAGE_SIZE = 200") },
  { id: "D3", name: "a limit is taken from the URL", file: PENDING, fn: once("const page = parsePageParam(searchParams.page);", "const page = parsePageParam(searchParams.page); void searchParams.limit;") },
  { id: "E", name: "pending criterion broadened beyond the canonical draft state", file: MIGRATION, fn: once("    where mi.status = 'draft'\n    order by", "    where mi.status in ('draft', 'active')\n    order by") },
  { id: "E2", name: "certification criterion broadened beyond pending_review", file: MIGRATION, fn: once("where f.badge_status = 'pending_review' or f.pending_record_count > 0", "where f.badge_status in ('pending_review', 'ai_estimated') or f.pending_record_count > 0") },
  { id: "E3", name: "an invented data-quality criterion (missing description) is added", file: MIGRATION, fn: once("          case when mn.restaurant_id <> mi.restaurant_id then 'menu_belongs_to_other_restaurant' end,", "          case when mn.restaurant_id <> mi.restaurant_id then 'menu_belongs_to_other_restaurant' end,\n          case when mi.description is null then 'description_missing' end,") },
  { id: "F", name: "a write statement introduced into a contract", file: MIGRATION, fn: once("  select pg_catalog.jsonb_build_object(\n    'restaurantCount'", "  update public.menus set name = name where false;\n  select pg_catalog.jsonb_build_object(\n    'restaurantCount'") },
  { id: "F2", name: "a mutation call (fetch) is introduced into the ADMIN-C adapter", file: ADAPTER, fn: append("\nvoid fetch('/api/x', { method: 'POST' });\n") },
  { id: "F3", name: "a form (write control) is added to a queue page", file: PENDING, fn: once("<QueueTable", "<form method=\"post\"><button type=\"submit\">save</button></form>\n          <QueueTable") },
  { id: "F4", name: "a server action is introduced into a queue page", file: DQ, fn: once('import { createAdminOperationalPage }', '"use server";\nimport { createAdminOperationalPage }') },
  { id: "F5", name: "the migration touches the permission catalogue", file: MIGRATION, fn: once("comment on function public.staff_admin_menu_management_overview_v1", "select 1 from admin_internal.staff_permission_catalog;\ncomment on function public.staff_admin_menu_management_overview_v1") },
  { id: "G", name: "a nutrition approval control is added to the certification page", file: CERT, fn: once("<QueueTable", "<button type=\"submit\">approve</button>\n          <QueueTable") },
  { id: "G2", name: "a certification/approve capability enters the adapter", file: ADAPTER, fn: append("\nexport const approveNutrition = async () => null;\n") },
  { id: "G3", name: "a Nutritionist workflow reference enters a queue page", file: CERT, fn: append("\n// nutritionist consultation workflow\nconst nutritionist = true; void nutritionist;\n") },
  { id: "H", name: "a queue page is switched back to mock data", file: PENDING, fn: once('import { createAdminOperationalPage }', 'import { adminRestaurantMockAdapter } from "apps/admin-web/adapters/mock/admin-restaurant-mock-adapter";\nvoid adminRestaurantMockAdapter;\nimport { createAdminOperationalPage }') },
  { id: "H2", name: "static queue rows are introduced into a page", file: DQ, fn: once("export default createAdminOperationalPage", "const staticRows = [{ menuItemId: \"fake\" }];\nvoid staticRows;\nexport default createAdminOperationalPage") },
  { id: "H3", name: "a queue route is un-wired back to DEMO", file: REGISTRY, fn: routeLine("menu-management", (l) => l.replace('availability: "LIVE"', 'availability: "DEMO"')) },
  { id: "I", name: "the pending read is wired to the data-quality contract", file: ADAPTER, fn: once("return readQueue(CONTRACTS.pending, page, parseQueueRow);", "return readQueue(CONTRACTS.dataQuality, page, parseQueueRow);") },
  { id: "I2", name: "the pending page bundles the data-quality read (permission boundary bypass)", file: PENDING, fn: once('import { readMenuManagementPending } from "apps/admin-web/server/adminReviewQueueRead";', 'import { readMenuManagementPending, readMenuManagementDataQuality } from "apps/admin-web/server/adminReviewQueueRead";\nvoid readMenuManagementDataQuality;') },
  { id: "J", name: "a second .rpc call site appears in the ADMIN-C adapter", file: ADAPTER, fn: append("\nexport const leak = (c: { rpc: (n: string) => unknown }) => c.rpc(\"staff_admin_menu_management_pending_v1\");\n") },
  { id: "K", name: "a deferred route (duplicates) is switched LIVE", file: REGISTRY, fn: routeLine("menu-management-duplicates", (l) => l.replace('availability: "DEMO"', 'availability: "LIVE"')) },
  { id: "L", name: "an ADMIN-B page (menus) is altered", file: B3_MENUS, fn: append("\n// tampered\n") },
  { id: "M", name: "the ADMIN-A branch-status page is altered", file: STATUS, fn: append("\n// tampered\n") },
  { id: "N", name: "the error state is collapsed (ready parse returns an empty list on malformed reasons)", file: ADAPTER, fn: once("if (!list(v) || v.length === 0) return null;", "if (!list(v)) return [];") },
  { id: "O", name: "customer/owner identity leaks into the overview page (auth user id)", file: OVERVIEW, fn: once("<td className=\"py-2 pr-4\"><StatusPill status={row.status} /></td>", "<td className=\"py-2 pr-4\"><StatusPill status={row.status} />{String((row as unknown as { auth_user_id?: string }).auth_user_id)}</td>") },
  // ---- ADMIN-C2 ----
  { id: "C2-A", name: "allergen page uses static values", file: ALLERGENS, fn: once("export default createAdminOperationalPage", "const staticAllergens = [\"peanut\", \"milk\"];\nvoid staticAllergens;\nexport default createAdminOperationalPage") },
  { id: "C2-A2", name: "allergen page switched to a mock adapter", file: ALLERGENS, fn: once('import { createAdminOperationalPage }', 'import { adminRestaurantMockAdapter } from "apps/admin-web/adapters/mock/admin-restaurant-mock-adapter";\nvoid adminRestaurantMockAdapter;\nimport { createAdminOperationalPage }') },
  { id: "C2-A3", name: "allergens are inferred from the description", file: ALLERGENS, fn: once("result.data.allergens.length === 0 ? (", "result.data.allergens.length === 0 && !result.data.description ? (") },
  { id: "C2-B", name: "certification page invents a fake certification verdict", file: CERTIFICATION, fn: once("<h3 className=\"mb-3 mt-5", "<p>已認證</p>\n          <h3 className=\"mb-3 mt-5") },
  { id: "C2-B2", name: "certification page interprets the confidence score", file: CERTIFICATION, fn: once("{ label: \"更新時間\"", "{ label: \"信心\", value: String(result.data.currentNutrition.confidenceScore) },\n                { label: \"更新時間\"") },
  { id: "C2-B3", name: "certification none-state removed (manufactures a state for a missing record)", file: CERTIFICATION, fn: once("result.data.currentNutrition === null ? (", "result.data.currentNutrition === undefined ? (") },
  { id: "C2-C", name: "wrong permission substituted for the allergens route (menu_items.read)", file: REGISTRY, fn: routeLine("restaurant-item-allergens", (l) => l.replace('requiredPermissions: ["admin.restaurants.menu_item.read"]', 'requiredPermissions: ["admin.restaurants.menu_items.read"]')) },
  { id: "C2-C2", name: "the certification page borrows the certification-queue key", file: REGISTRY, fn: routeLine("restaurant-item-certification", (l) => l.replace('requiredPermissions: ["admin.restaurants.menu_item.read"]', 'requiredPermissions: ["admin.nutrition.certification.pending.read"]')) },
  { id: "C2-D", name: "admin_context.read fallback on the certification route", file: REGISTRY, fn: routeLine("restaurant-item-certification", (l) => l.replace('requiredPermissions: ["admin.restaurants.menu_item.read"]', 'requiredPermissions: ["admin_context.read"]')) },
  { id: "C2-D2", name: "admin_context.read referenced in the allergens page", file: ALLERGENS, fn: append("\n// admin_context.read\n") },
  { id: "C2-E", name: "a new fake certification RPC is introduced into the adapter", file: B_ADAPTER, fn: append("\nexport const fakeCertificationContract = \"staff_admin_item_certification_v1\";\n") },
  { id: "C2-E2", name: "the certification page reads a new/other read function", file: CERTIFICATION, fn: (x) => x.replace(/\r\n/g, "\n").split("readMenuItemDetail").join("readMenuDetail") },
  { id: "C2-F", name: "an approve/reject control is added to the certification page", file: CERTIFICATION, fn: once("<h3 className=\"mb-3 mt-5", "<button type=\"submit\">approve</button>\n          <h3 className=\"mb-3 mt-5") },
  { id: "C2-F2", name: "an edit form is added to the allergens page", file: ALLERGENS, fn: once("<div className=\"mb-4\">", "<form method=\"post\"><input name=\"allergen\" /></form>\n          <div className=\"mb-4\">") },
  { id: "C2-F3", name: "a server action is introduced into the certification page", file: CERTIFICATION, fn: once('import { createAdminOperationalPage }', '"use server";\nimport { createAdminOperationalPage }') },
  { id: "C2-G", name: "the wrong-menu hierarchy check is removed from the shared adapter", file: B_ADAPTER, fn: once("result.data.menuId !== menuId ? { state: \"not_found\" } : result", "result") },
  { id: "C2-G2", name: "the allergens page drops the menu id from the read (child-only lookup)", file: ALLERGENS, fn: once("readMenuItemDetail(params.restaurantId, params.menuId, params.itemId)", "readMenuItemDetail(params.restaurantId, params.itemId, params.itemId)") },
  { id: "C2-H", name: "the allergens route is left NOT_ENABLED", file: REGISTRY, fn: routeLine("restaurant-item-allergens", (l) => l.replace('availability: "LIVE"', 'availability: "NOT_ENABLED"')) },
  { id: "C2-H2", name: "the certification route is left NOT_ENABLED", file: REGISTRY, fn: routeLine("restaurant-item-certification", (l) => l.replace('availability: "LIVE"', 'availability: "NOT_ENABLED"')) },
  { id: "C2-I", name: "the allergens page bundles the queue adapter (certification-queue authority)", file: ALLERGENS, fn: once('import { readMenuItemDetail } from "apps/admin-web/server/adminRestaurantRead";', 'import { readMenuItemDetail } from "apps/admin-web/server/adminRestaurantRead";\nimport { readNutritionCertificationPending } from "apps/admin-web/server/adminReviewQueueRead";\nvoid readNutritionCertificationPending;') },
  { id: "C2-J", name: "an item-detail navigation link is gated by the wrong key", file: ITEM_DETAIL, fn: once('{ label: "過敏原（專頁）", href: `${base}/allergens`, allowed: has(context, "admin.restaurants.menu_item.read") }', '{ label: "過敏原（專頁）", href: `${base}/allergens`, allowed: has(context, "admin.restaurants.menu_items.read") }') },
  { id: "C2-K", name: "the item-detail page is altered beyond the two links", file: ITEM_DETAIL, fn: append("\n// tampered\n") }
];

function runGuard() {
  const r = child.spawnSync("node", [GUARD], { cwd: ROOT, encoding: "utf8", timeout: 20 * 60 * 1000, maxBuffer: 1 << 26 });
  return { status: r.status, out: r.stdout ?? "" };
}
const results = [];
try {
  const baseline = runGuard();
  results.push({ id: "baseline", pass: baseline.status === 0 });
  console.log(`${baseline.status === 0 ? "PASS" : "FAIL"} baseline unmutated guard passes`);
  for (const mutant of mutants) {
    let killed = false, note = "";
    try {
      restore();
      const mutated = mutant.fn(original.get(mutant.file));
      fs.writeFileSync(path.join(ROOT, mutant.file), mutated);
      const run = runGuard();
      killed = run.status !== 0;
      try { note = killed ? (JSON.parse(run.out.slice(run.out.lastIndexOf("{\n  \"suite\""))).failures?.[0] ?? "").slice(0, 90) : "SURVIVED"; } catch { note = killed ? "(guard error)" : "SURVIVED"; }
    } catch (error) { note = `harness error: ${String(error?.message ?? error).slice(0, 120)}`; }
    finally { restore(); }
    results.push({ id: mutant.id, name: mutant.name, pass: killed });
    console.log(`${killed ? "KILLED" : "FAIL"} ${mutant.id} ${mutant.name}${note ? ` -> ${note}` : ""}`);
  }
} finally { restore(); }
const identical = files.every((f) => sha(fs.readFileSync(path.join(ROOT, f), "utf8")) === sha(original.get(f)));
const after = runGuard();
results.push({ id: "restore", pass: identical && after.status === 0 });
console.log(`${identical && after.status === 0 ? "PASS" : "FAIL"} restore tree byte-identical and guard passes again`);
const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ suite: "admin-operational-review-queues-c-mutations", mutants: mutants.length,
  killed: mutants.length - failed.filter((r) => r.id !== "baseline" && r.id !== "restore").length, failed: failed.length,
  failures: failed.map((r) => `${r.id} ${r.name ?? ""}`) }, null, 2));
process.exitCode = failed.length ? 1 : 0;
