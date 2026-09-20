#!/usr/bin/env node
// ADMIN-C mutation suite: every mutant must be killed by the ADMIN-C guard. Mutants are applied in place and ALWAYS
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
const files = [MIGRATION, REGISTRY, ADAPTER, B_ADAPTER, OVERVIEW, PENDING, DQ, CERT, B3_MENUS, STATUS];
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
  { id: "O", name: "customer/owner identity leaks into the overview page (auth user id)", file: OVERVIEW, fn: once("<td className=\"py-2 pr-4\"><StatusPill status={row.status} /></td>", "<td className=\"py-2 pr-4\"><StatusPill status={row.status} />{String((row as unknown as { auth_user_id?: string }).auth_user_id)}</td>") }
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
