#!/usr/bin/env node
// ADMIN-B2 mutation suite: every mutant must be killed by the B2 guard. Mutants are applied in place and ALWAYS
// restored (finally + signal handlers); the run ends by proving the tree is byte-identical and the guard passes again.
import child from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GUARD = "scripts/admin-restaurant-branch-canonical-ui-b2-guard.mjs";
const APP = "apps/admin-web/app/admin/restaurants";
const ADAPTER = "apps/admin-web/server/adminRestaurantRead.ts";
const REGISTRY = "apps/admin-web/auth/admin-route-registry.ts";
const FACTORY = "apps/admin-web/components/admin-shell/AdminOperationalPage.tsx";
const DETAIL = `${APP}/[restaurantId]/page.tsx`;
const BRANCH = `${APP}/[restaurantId]/branches/[branchId]/page.tsx`;
const CONTACT = `${APP}/[restaurantId]/contact/page.tsx`;
const LIST = `${APP}/page.tsx`;
const MENUS = `${APP}/[restaurantId]/menus/page.tsx`;
const STATUS = `${APP}/[restaurantId]/branches/[branchId]/status/page.tsx`;
const files = [ADAPTER, REGISTRY, FACTORY, DETAIL, BRANCH, CONTACT, LIST, MENUS, STATUS];
const original = new Map(files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
function restore() { for (const [f, text] of original) fs.writeFileSync(path.join(ROOT, f), text); }
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(signal, () => { restore(); process.exit(130); });
process.on("exit", restore);

const once = (from, to) => (text) => {
  const norm = text.replace(/\r\n/g, "\n");
  if (!norm.includes(from)) throw new Error(`mutation anchor missing: ${from.slice(0, 70)}`);
  return norm.replace(from, to);
};
const routeLine = (id, transform) => (text) => {
  const norm = text.replace(/\r\n/g, "\n"); let hit = false;
  const out = norm.split("\n").map((line) => { if (line.includes(`defineRoute({ id: "${id}",`)) { hit = true; return transform(line); } return line; }).join("\n");
  if (!hit) throw new Error(`route ${id} not found`); return out;
};
const mutants = [
  { id: "A", name: "a B2 page reads the Admin Restaurant mock adapter", file: LIST, fn: once('import Link from "next/link";', 'import Link from "next/link";\nimport { adminRestaurantMockAdapter } from "apps/admin-web/adapters/mock/admin-restaurant-mock-adapter";\nvoid adminRestaurantMockAdapter;') },
  { id: "B", name: "a B2 route falls back to admin_context.read", file: REGISTRY, fn: routeLine("restaurant-branch-geo", (l) => l.replace('requiredPermissions: ["admin.restaurants.geo.read"]', 'requiredPermissions: ["admin_context.read"]')) },
  { id: "B2", name: "a B2 route is mapped to the wrong permission (contact -> about)", file: REGISTRY, fn: routeLine("restaurant-contact", (l) => l.replace('requiredPermissions: ["admin.restaurants.contact.read"]', 'requiredPermissions: ["admin.restaurants.about.read"]')) },
  { id: "C", name: "the restaurant list reads the detail contract", file: ADAPTER, fn: once("return call(CONTRACTS.list, {", "return call(CONTRACTS.detail, {") },
  { id: "D", name: "raw table access introduced in the adapter", file: ADAPTER, fn: once("const result = await createAdminSupabaseServerClient().rpc(contract, { ...args });", "const result = await createAdminSupabaseServerClient().from('restaurants').select('id');") },
  { id: "E", name: "a B3 route is switched LIVE", file: REGISTRY, fn: routeLine("restaurant-menus", (l) => l.replace(/availability: "NOT_ENABLED"/, 'availability: "LIVE"')) },
  { id: "E2", name: "a deferred route (ingredients) is switched LIVE", file: REGISTRY, fn: routeLine("restaurant-item-ingredients", (l) => l.replace(/availability: "NOT_ENABLED"/, 'availability: "LIVE"')) },
  { id: "E3", name: "one B2 route is left un-wired (not LIVE)", file: REGISTRY, fn: routeLine("restaurant-branch-hours", (l) => l.replace('availability: "LIVE"', 'availability: "NOT_ENABLED"')) },
  { id: "F", name: "a mutation call (fetch) is introduced into the adapter", file: ADAPTER, fn: once("export function readRestaurantList(", "void fetch('/api/x', { method: 'POST' });\nexport function readRestaurantList(") },
  { id: "F2", name: "a server action is introduced into a B2 page", file: BRANCH, fn: once('import { createAdminOperationalPage }', '"use server";\nimport { createAdminOperationalPage }') },
  { id: "G", name: "the ADMIN-A branch-status page is altered", file: STATUS, fn: (t) => t.replace(/\r\n/g, "\n") + "\n// tampered\n" },
  { id: "H", name: "branch detail is fetched by child id alone", file: BRANCH, fn: once("readBranchDetail(params.restaurantId, params.branchId)", "readBranchDetail(params.branchId, params.branchId)") },
  { id: "H2", name: "parent identifier no longer shape-checked in a nested read", file: ADAPTER, fn: once("export function readBranchGeo(restaurantId: string, branchId: string): Promise<ReadResult<BranchGeoData>> {\n  if (!isValidReadId(restaurantId) || !isValidReadId(branchId))", "export function readBranchGeo(restaurantId: string, branchId: string): Promise<ReadResult<BranchGeoData>> {\n  if (!isValidReadId(branchId))") },
  { id: "I", name: "contract state collapsed: forbidden/not_found treated as unavailable-or-empty (unavailable path removed)", file: ADAPTER, fn: once('if (result.error) return { state: "unavailable" };', "if (result.error) return { state: \"not_found\" };") },
  { id: "J", name: "the contract's restaurant echo is no longer verified", file: ADAPTER, fn: once("if (raw.restaurantId !== restaurantId || !str(raw.name) || !strOrNull(raw.about)", "if (!str(raw.name) || !strOrNull(raw.about)") },
  { id: "K", name: "the detail page bundles contact data (permission boundary bypass)", file: DETAIL, fn: once('import { readRestaurantDetail } from "apps/admin-web/server/adminRestaurantRead";', 'import { readRestaurantDetail, readRestaurantContact } from "apps/admin-web/server/adminRestaurantRead";\nvoid readRestaurantContact;') },
  { id: "L", name: "the operational gate falls back to admin_context.read", file: FACTORY, fn: once("export type AdminOperationalContext", "const FALLBACK = 'admin_context.read';\nexport type AdminOperationalContext") },
  { id: "M", name: "a limit is taken from the URL", file: LIST, fn: once("const page = parsePageParam(searchParams.page);", "const page = parsePageParam(searchParams.page); void searchParams.limit;") },
  { id: "N", name: "page size raised above the B1 default", file: ADAPTER, fn: once("RESTAURANT_LIST_PAGE_SIZE = 20", "RESTAURANT_LIST_PAGE_SIZE = 200") },
  { id: "O", name: "a restricted field (legal_name) is rendered", file: CONTACT, fn: once("<h2 className=\"text-lg font-bold text-slate-950\">{result.data.name}</h2>", "<h2 className=\"text-lg font-bold text-slate-950\">{result.data.name} legal_name</h2>") }
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
console.log(JSON.stringify({ suite: "admin-restaurant-branch-canonical-ui-b2-mutations", mutants: mutants.length,
  killed: mutants.length - failed.filter((r) => r.id !== "baseline" && r.id !== "restore").length, failed: failed.length,
  failures: failed.map((r) => `${r.id} ${r.name ?? ""}`) }, null, 2));
process.exitCode = failed.length ? 1 : 0;
