#!/usr/bin/env node
// ADMIN-B3 mutation suite: every mutant must be killed by the B3 guard. Mutants are applied in place and ALWAYS
// restored (finally + signal handlers); the run ends by proving the tree is byte-identical and the guard passes again.
import child from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GUARD = "scripts/admin-menu-canonical-ui-b3-guard.mjs";
const APP = "apps/admin-web/app/admin/restaurants";
const ADAPTER = "apps/admin-web/server/adminRestaurantRead.ts";
const REGISTRY = "apps/admin-web/auth/admin-route-registry.ts";
const MENU_VIEWS = "apps/admin-web/components/admin-shell/AdminMenuViews.tsx";
const MENUS = `${APP}/[restaurantId]/menus/page.tsx`;
const MENU_DETAIL = `${APP}/[restaurantId]/menus/[menuId]/page.tsx`;
const ITEMS = `${APP}/[restaurantId]/menus/[menuId]/items/page.tsx`;
const BRANCH_ITEMS = `${APP}/[restaurantId]/branches/[branchId]/menu-items/page.tsx`;
const ITEM_DETAIL = `${APP}/[restaurantId]/menus/[menuId]/items/[itemId]/page.tsx`;
const NUTRITION = `${APP}/[restaurantId]/menus/[menuId]/items/[itemId]/nutrition/page.tsx`;
const B2_DETAIL = `${APP}/[restaurantId]/page.tsx`;
const B2_HOURS = `${APP}/[restaurantId]/branches/[branchId]/hours/page.tsx`;
const STATUS = `${APP}/[restaurantId]/branches/[branchId]/status/page.tsx`;
const files = [ADAPTER, REGISTRY, MENU_VIEWS, MENUS, MENU_DETAIL, ITEMS, BRANCH_ITEMS, ITEM_DETAIL, NUTRITION, B2_DETAIL, B2_HOURS, STATUS];
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
const mutants = [
  { id: "A", name: "a B3 page switched back to mock data", file: MENUS, fn: once('import Link from "next/link";', 'import Link from "next/link";\nimport { adminRestaurantMockAdapter } from "apps/admin-web/adapters/mock/admin-restaurant-mock-adapter";\nvoid adminRestaurantMockAdapter;') },
  { id: "A2", name: "a B3 route switched back to the registry scaffold (NOT_ENABLED)", file: REGISTRY, fn: routeLine("restaurant-menu-detail", (l) => l.replace('availability: "LIVE"', 'availability: "NOT_ENABLED"')) },
  { id: "B", name: "wrong permission assigned (menu.read -> menus.read)", file: REGISTRY, fn: routeLine("restaurant-menu-detail", (l) => l.replace('requiredPermissions: ["admin.restaurants.menu.read"]', 'requiredPermissions: ["admin.restaurants.menus.read"]')) },
  { id: "B2", name: "wrong permission assigned (item detail -> menu_items.read)", file: REGISTRY, fn: routeLine("restaurant-menu-item-detail", (l) => l.replace('requiredPermissions: ["admin.restaurants.menu_item.read"]', 'requiredPermissions: ["admin.restaurants.menu_items.read"]')) },
  { id: "C", name: "admin_context.read fallback on a B3 route", file: REGISTRY, fn: routeLine("restaurant-branch-menu-items", (l) => l.replace('requiredPermissions: ["admin.restaurants.menu_items.read"]', 'requiredPermissions: ["admin_context.read"]')) },
  { id: "C2", name: "admin_context.read fallback in a B3 page", file: ITEMS, fn: once('const canOpenItem = has(context, "admin.restaurants.menu_item.read");', 'const canOpenItem = has(context, "admin.restaurants.menu_item.read") || has(context, "admin_context.read");') },
  { id: "D", name: "the nutrition page is given a new fake nutrition RPC", file: ADAPTER, fn: once('menuItemDetail: "staff_admin_restaurant_menu_item_detail_v1",', 'menuItemDetail: "staff_admin_restaurant_menu_item_detail_v1",\n  itemNutrition: "staff_admin_restaurant_item_nutrition_v1",') },
  { id: "D2", name: "the nutrition page reads a different function than item detail", file: NUTRITION, fn: (t) => t.replace(/\r\n/g, "\n").split("readMenuItemDetail").join("readMenuDetail") },
  { id: "E", name: "the ingredient route is switched LIVE", file: REGISTRY, fn: routeLine("restaurant-item-ingredients", (l) => l.replace(/availability: "NOT_ENABLED"/, 'availability: "LIVE"')) },
  { id: "E2", name: "an ingredient reference is introduced into a B3 page", file: NUTRITION, fn: (t) => t.replace(/\r\n/g, "\n") + "\n// ingredients parsed from description\n" },
  { id: "F", name: "a mutation control (form/button) is added to a B3 page", file: ITEM_DETAIL, fn: once('<SubLinks links=', '<form method="post"><button type="submit">save</button></form>\n          <SubLinks links=') },
  { id: "F2", name: "a server action is introduced into a B3 page", file: BRANCH_ITEMS, fn: once('import { createAdminOperationalPage }', '"use server";\nimport { createAdminOperationalPage }') },
  { id: "F3", name: "a mutation call (fetch) is introduced into the adapter", file: ADAPTER, fn: once("export function readMenuList(", "void fetch('/api/x', { method: 'POST' });\nexport function readMenuList(") },
  { id: "F4", name: "raw table access introduced in the adapter", file: ADAPTER, fn: once("const result = await createAdminSupabaseServerClient().rpc(contract, { ...args });", "const result = await createAdminSupabaseServerClient().from('menu_items').select('id');") },
  { id: "G", name: "the menu list is wired to the menu-detail contract", file: ADAPTER, fn: once("return call(CONTRACTS.menuList, {", "return call(CONTRACTS.menuDetail, {") },
  { id: "G2", name: "branch menu items wired to the menu-item list contract", file: ADAPTER, fn: once("return call(CONTRACTS.branchMenuItemList, {", "return call(CONTRACTS.menuItemList, {") },
  { id: "H", name: "item detail no longer enforces the route's menu (cross-parent leak)", file: ADAPTER, fn: once("result.data.menuId !== menuId ? { state: \"not_found\" } : result", "result") },
  { id: "H2", name: "item detail page drops the menu id from the read", file: ITEM_DETAIL, fn: once("readMenuItemDetail(params.restaurantId, params.menuId, params.itemId)", "readMenuItemDetail(params.restaurantId, params.itemId, params.itemId)") },
  { id: "H3", name: "the item list is no longer menu-scoped", file: ADAPTER, fn: once("p_menu_id: menuId, p_limit", "p_menu_id: null, p_limit") },
  { id: "I", name: "menu detail page bundles the item list (permission boundary bypass)", file: MENU_DETAIL, fn: once('import { readMenuDetail } from "apps/admin-web/server/adminRestaurantRead";', 'import { readMenuDetail, readMenuItemList } from "apps/admin-web/server/adminRestaurantRead";\nvoid readMenuItemList;') },
  { id: "J", name: "a limit is taken from the URL", file: MENUS, fn: once("const page = parsePageParam(searchParams.page);", "const page = parsePageParam(searchParams.page); void searchParams.limit;") },
  { id: "K", name: "a B2 page (hours) is altered", file: B2_HOURS, fn: (t) => t.replace(/\r\n/g, "\n") + "\n// tampered\n" },
  { id: "L", name: "the ADMIN-A branch-status page is altered", file: STATUS, fn: (t) => t.replace(/\r\n/g, "\n") + "\n// tampered\n" },
  { id: "M", name: "restaurant detail navigation link uses a different permission family", file: B2_DETAIL, fn: once('has(context, "admin.restaurants.menus.read")', 'has(context, "admin.restaurants.menu.read")') },
  { id: "N", name: "the error state is collapsed into an empty list (unavailable -> not_found)", file: ADAPTER, fn: once('if (result.error) return { state: "unavailable" };', 'if (result.error) return { state: "not_found" };') }
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
console.log(JSON.stringify({ suite: "admin-menu-canonical-ui-b3-mutations", mutants: mutants.length,
  killed: mutants.length - failed.filter((r) => r.id !== "baseline" && r.id !== "restore").length, failed: failed.length,
  failures: failed.map((r) => `${r.id} ${r.name ?? ""}`) }, null, 2));
process.exitCode = failed.length ? 1 : 0;
