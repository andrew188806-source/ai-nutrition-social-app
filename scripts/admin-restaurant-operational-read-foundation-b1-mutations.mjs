#!/usr/bin/env node
// ADMIN-B1 mutation suite: every mutant of the B1 contract must be killed by the B1 guard.
// Mutants are applied in place and ALWAYS restored (finally + signal handlers); the run ends by proving the tree is
// byte-identical to its start and the unmutated guard passes.
import child from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const GUARD = "scripts/admin-restaurant-operational-read-foundation-b1-guard.mjs";
const MIGRATION = "supabase/migrations/20260920020000_admin_restaurant_operational_read_foundation_b1.sql";
const REGISTRY = "apps/admin-web/auth/admin-route-registry.ts";
const files = [MIGRATION, REGISTRY];
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
const GATE = (key) => `if not admin_internal.staff_admin_restaurant_read_gate_v1('${key}') then`;
const mutants = [
  { id: "A", name: "permission check removed from one read contract", file: MIGRATION, fn: once(GATE("admin.restaurants.about.read"), "if false then") },
  { id: "A2", name: "permission check removed from the restaurant list", file: MIGRATION, fn: once(GATE("admin.restaurants.read") + "\n    return pg_catalog.jsonb_build_object('state', 'forbidden');\n  end if;\n  if v_limit not between 1 and 50", "if v_limit not between 1 and 50") },
  { id: "B", name: "wrong Restaurant permission substituted (hours -> geo)", file: MIGRATION, fn: once(GATE("admin.restaurants.hours.read"), GATE("admin.restaurants.geo.read")) },
  { id: "B2", name: "wrong permission substituted (contact -> about)", file: MIGRATION, fn: once(GATE("admin.restaurants.contact.read"), GATE("admin.restaurants.about.read")) },
  { id: "C", name: "PUBLIC execute restored", file: MIGRATION, fn: once("grant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;", "grant execute on function public.staff_admin_restaurant_list_v1(integer, integer) to public;\ngrant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;") },
  { id: "D", name: "anon execute restored", file: MIGRATION, fn: once("grant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;", "grant execute on function public.staff_admin_restaurant_list_v1(integer, integer) to anon;\ngrant staff_admin_restaurant_reader to postgres with admin false, inherit false, set true;") },
  { id: "E", name: "base-admin fallback introduced into a contract", file: MIGRATION, fn: once(GATE("admin.restaurants.about.read"), "if not (admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.about.read') or public.staff_has_permission_v1('admin_context.read')) then") },
  { id: "E2", name: "base-admin fallback introduced into the private gate", file: MIGRATION, fn: once("and public.staff_has_permission_v1(p_permission_key);", "or public.staff_has_permission_v1('admin_context.read');") },
  { id: "F", name: "cross-Restaurant parent validation removed (branch detail)", file: MIGRATION, fn: once("  where b.id = p_branch_id and b.restaurant_id = p_restaurant_id;\n  return coalesce(v_result, pg_catalog.jsonb_build_object('state', 'not_found'));\nend;\n$$;\n\n-- 7.", "  where b.id = p_branch_id;\n  return coalesce(v_result, pg_catalog.jsonb_build_object('state', 'not_found'));\nend;\n$$;\n\n-- 7.") },
  { id: "F2", name: "cross-Restaurant parent validation removed (menu item detail)", file: MIGRATION, fn: once("where mi.id = p_menu_item_id and mi.restaurant_id = p_restaurant_id;", "where mi.id = p_menu_item_id;") },
  { id: "F3", name: "cross-Restaurant parent validation removed (branch menu items)", file: MIGRATION, fn: once("where x.branch_id = p_branch_id and x.restaurant_id = p_restaurant_id\n    order by", "where x.branch_id = p_branch_id\n    order by") },
  { id: "G", name: "pagination maximum removed", file: MIGRATION, fn: once("if v_limit not between 1 and 50 or v_offset not between 0 and 10000 then\n    return pg_catalog.jsonb_build_object('state', 'invalid_request');\n  end if;\n  select coalesce(pg_catalog.jsonb_agg(q.item order by q.ord) filter (where q.ord <= v_limit), '[]'::jsonb),\n    pg_catalog.count(*) > v_limit\n  into v_items, v_more\n  from (\n    select pg_catalog.row_number() over (order by r.name", "if v_limit < 1 or v_offset not between 0 and 10000 then\n    return pg_catalog.jsonb_build_object('state', 'invalid_request');\n  end if;\n  select coalesce(pg_catalog.jsonb_agg(q.item order by q.ord) filter (where q.ord <= v_limit), '[]'::jsonb),\n    pg_catalog.count(*) > v_limit\n  into v_items, v_more\n  from (\n    select pg_catalog.row_number() over (order by r.name") },
  { id: "G2", name: "pagination clamps instead of rejecting", file: MIGRATION, fn: once("v_limit integer := coalesce(p_limit, 20);\n  v_offset integer := coalesce(p_offset, 0);\n  v_items jsonb;\n  v_more boolean;\nbegin\n  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.read')", "v_limit integer := least(coalesce(p_limit, 20), 50);\n  v_offset integer := coalesce(p_offset, 0);\n  v_items jsonb;\n  v_more boolean;\nbegin\n  if not admin_internal.staff_admin_restaurant_read_gate_v1('admin.restaurants.read')") },
  { id: "H", name: "ingredient data accidentally introduced", file: MIGRATION, fn: once("'nutritionBadgeStatus', mi.nutrition_badge_status, 'badgeEnabled', mi.badge_enabled,\n    'branchLinkCount'", "'nutritionBadgeStatus', mi.nutrition_badge_status, 'badgeEnabled', mi.badge_enabled, 'ingredients', '[]'::jsonb,\n    'branchLinkCount'") },
  { id: "I", name: "write statement introduced into a read contract", file: MIGRATION, fn: once("  select pg_catalog.jsonb_build_object('state', 'ready', 'restaurantId', r.id, 'name', r.name,\n    'about'", "  update public.restaurants set name = name where false;\n  select pg_catalog.jsonb_build_object('state', 'ready', 'restaurantId', r.id, 'name', r.name,\n    'about'") },
  { id: "J", name: "contract made VOLATILE", file: MIGRATION, fn: once("create function public.staff_admin_restaurant_about_v1(p_restaurant_id text)\nreturns jsonb\nlanguage plpgsql\nstable", "create function public.staff_admin_restaurant_about_v1(p_restaurant_id text)\nreturns jsonb\nlanguage plpgsql\nvolatile") },
  { id: "K", name: "raw whole-table SELECT granted to authenticated", file: MIGRATION, fn: once("revoke create on schema public from staff_admin_restaurant_reader;", "grant select on public.restaurant_memberships to authenticated;\nrevoke create on schema public from staff_admin_restaurant_reader;") },
  { id: "L", name: "the sealed reader is granted UPDATE", file: MIGRATION, fn: once("revoke create on schema public from staff_admin_restaurant_reader;", "grant update (name) on public.restaurants to staff_admin_restaurant_reader;\nrevoke create on schema public from staff_admin_restaurant_reader;") },
  { id: "M", name: "restricted field exposed (legal_name granted)", file: MIGRATION, fn: once("grant select (id, name, city, category, status, created_at,", "grant select (id, name, city, category, status, created_at, legal_name,") },
  { id: "N", name: "lifecycle filtered to Consumer-public state (draft hidden)", file: MIGRATION, fn: once("    from public.restaurants r\n    order by r.name collate \"C\", r.id collate \"C\"\n    limit v_limit + 1 offset v_offset", "    from public.restaurants r where r.status = 'active'\n    order by r.name collate \"C\", r.id collate \"C\"\n    limit v_limit + 1 offset v_offset") },
  { id: "O", name: "a postcondition (permission mapping) removed", file: MIGRATION, fn: once("b1_contract_permission_mismatch_", "b1_removed_") },
  { id: "P", name: "an Owner-scoped function is reused to bypass owner scope", file: MIGRATION, fn: once("  select pg_catalog.jsonb_build_object('state', 'ready', 'restaurantId', r.id, 'name', r.name,\n    'about'", "  perform public.restaurant_internal_restaurants_v1();\n  select pg_catalog.jsonb_build_object('state', 'ready', 'restaurantId', r.id, 'name', r.name,\n    'about'") },
  { id: "Q", name: "the ingredient route is switched LIVE / its permission changed", file: REGISTRY, fn: (text) => { const norm = text.replace(/\r\n/g, "\n"); const re = /(id: "restaurant-item-ingredients"[^\n]*?)availability: "NOT_ENABLED"/; if (!re.test(norm)) throw new Error("ingredient route anchor"); return norm.replace(re, '$1availability: "LIVE"'); } }
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
      if (mutated === original.get(mutant.file).replace(/\r\n/g, "\n") && !/\r/.test(original.get(mutant.file))) throw new Error("mutation changed nothing");
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
console.log(JSON.stringify({ suite: "admin-restaurant-operational-read-foundation-b1-mutations", mutants: mutants.length,
  killed: mutants.length - failed.filter((r) => r.id !== "baseline" && r.id !== "restore").length, failed: failed.length,
  failures: failed.map((r) => `${r.id} ${r.name ?? ""}`) }, null, 2));
process.exitCode = failed.length ? 1 : 0;
