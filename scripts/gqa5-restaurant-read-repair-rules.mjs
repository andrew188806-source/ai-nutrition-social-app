// Structural rules for the GQA-5 Restaurant catalogue read repair. Pure: callers pass the migration text
// and the historical migration texts; nothing is read from a database.
import { stripSqlComments } from "./db-contract-sql.mjs";

export const REPAIR_RPCS = Object.freeze([
  "restaurant_current_access_context_v1", "restaurant_internal_restaurants_v1", "restaurant_internal_branches_v1",
  "restaurant_internal_menus_v1", "restaurant_internal_menu_categories_v1", "restaurant_internal_menu_items_v1",
  "restaurant_internal_branch_menu_items_v1", "restaurant_internal_current_nutrition_v1",
  "restaurant_internal_restaurants_v2", "restaurant_internal_branches_v2"
]);
export const REPAIR_HELPERS = Object.freeze([
  "restaurant_internal_visible_menu_restaurant_id_v1", "restaurant_internal_visible_menu_item_restaurant_id_v1",
  "restaurant_internal_visible_branch_restaurant_id_v1", "restaurant_internal_actor_is_active_member_v1",
  "restaurant_internal_actor_has_catalog_permission_v1"
]);
export const REPAIR_POLICIES = Object.freeze([
  ["menu_categories", "menu_categories_internal_access_permit"], ["menu_categories", "menu_categories_internal_tenant_restrict"],
  ["menu_item_nutrition", "menu_item_nutrition_internal_access_permit"], ["menu_item_nutrition", "menu_item_nutrition_internal_tenant_restrict"],
  ["restaurant_membership_branch_scopes", "restaurant_membership_branch_scopes_self_active_select"],
  ["restaurants", "restaurants_internal_access_permit"], ["restaurants", "restaurants_internal_tenant_restrict"],
  ["restaurant_branches", "restaurant_branches_internal_access_permit"], ["restaurant_branches", "restaurant_branches_internal_tenant_restrict"],
  ["menus", "menus_internal_access_permit"], ["menus", "menus_internal_tenant_restrict"],
  ["menu_items", "menu_items_internal_access_permit"], ["menu_items", "menu_items_internal_tenant_restrict"],
  ["branch_menu_items", "branch_menu_items_internal_access_permit"], ["branch_menu_items", "branch_menu_items_internal_tenant_restrict"]
]);
const READER = "restaurant_membership_context_reader";
const norm = (s) => s.replace(/\s+/g, " ").trim().replace(/;$/, "").trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The last LANGUAGE sql body of each read RPC in the historical migrations (the text A must reuse verbatim). */
export function historicalRpcBodies(historicalTexts) {
  const out = {};
  for (const text of historicalTexts) {
    for (const fn of REPAIR_RPCS) {
      const re = new RegExp(String.raw`create(?: or replace)? function public\.${fn}\s*\([^)]*\)\s*returns table\s*\([\s\S]*?\)\s*language sql\s+stable\s+security definer\s+set search_path = ''\s+set row_security = 'on'\s+as \$\$([\s\S]*?)\$\$;`, "gi");
      for (const m of text.matchAll(re)) out[fn] = norm(m[1]);
    }
  }
  return out;
}

export function validateRepairMigration(text, historicalTexts) {
  const failures = [];
  const fail = (m) => failures.push(m);
  const code = stripSqlComments(text);
  const low = code.toLowerCase();
  // Nothing outside the repair's own surface.
  if (/\bcreate\s+table\b|\bdrop\s+table\b|\balter\s+table\b/i.test(code)) fail("migration creates, drops or alters a table");
  if (/\bdrop\s+policy\b|\bcreate\s+policy\b/i.test(code)) fail("migration creates or drops a policy (only ALTER POLICY ... USING is allowed)");
  if (/disable\s+row\s+level\s+security|no\s+force\s+row\s+level\s+security|row_security\s*=\s*'?off/i.test(code)) fail("row level security is weakened");
  if (/\bbypassrls\b|\bservice_role\b|\bsecurity\s+definer\b[^;]*\binvoker\b/i.test(code)) fail("BYPASSRLS / service_role reference");
  if (/\bgrant\s+[^;]*\bto\s+(anon|authenticated|public)\b/i.test(code)) fail("grant to a client role or PUBLIC");
  if (/\balter\s+default\s+privileges\b/i.test(code)) fail("default privileges changed");
  // A: every read RPC is PL/pgSQL, definer, pinned, and returns exactly its historical query text.
  const bodies = historicalRpcBodies(historicalTexts);
  for (const fn of REPAIR_RPCS) {
    const m = code.match(new RegExp(String.raw`CREATE OR REPLACE FUNCTION public\.${fn}\s*\([^)]*\)\s*RETURNS TABLE\s*\([\s\S]*?\)\s*LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = ''\s+SET row_security = 'on'\s+AS \$function\$\s*#variable_conflict use_column\s*BEGIN\s*RETURN QUERY([\s\S]*?);\s*END;\s*\$function\$;`, "i"));
    if (!m) { fail(`${fn}: not recreated as pinned PL/pgSQL SECURITY DEFINER with RETURN QUERY`); continue; }
    if (!bodies[fn]) { fail(`${fn}: no historical LANGUAGE sql body found`); continue; }
    if (norm(m[1]) !== bodies[fn]) fail(`${fn}: RETURN QUERY text differs from the historical body`);
  }
  if ((low.match(/create or replace function public\.restaurant_/g) ?? []).length !== REPAIR_RPCS.length) fail("unexpected number of recreated RPCs");
  // Owner-role pattern: recreate as the existing owner, then restore the SET=false edge and revoke CREATE.
  const setRole = low.indexOf(`set local role ${READER}`), setNone = low.indexOf("set local role none");
  const firstRpc = low.indexOf("create or replace function public.restaurant_");
  if (!(setRole >= 0 && setRole < firstRpc && setNone > firstRpc)) fail("RPCs are not recreated under SET LOCAL ROLE of the existing owner");
  if (!new RegExp(String.raw`grant ${READER} to postgres\s+with inherit false, set false;`, "i").test(code)) fail("postgres SET edge to the reader is not restored to SET FALSE");
  if (!new RegExp(String.raw`revoke create on schema public from ${READER};`, "i").test(code)) fail("temporary CREATE on public is not revoked");
  // B: helpers are PL/pgSQL SECURITY INVOKER, pinned, EXECUTE only for the reader.
  for (const h of REPAIR_HELPERS) {
    const m = code.match(new RegExp(String.raw`CREATE FUNCTION public\.${h}\s*\(([^)]*)\)\s*RETURNS (text|boolean)\s+LANGUAGE plpgsql\s+STABLE\s+SECURITY INVOKER\s+SET search_path = ''\s+SET row_security = 'on'`, "i"));
    if (!m) { fail(`${h}: not a pinned PL/pgSQL SECURITY INVOKER function`); continue; }
    const sig = m[1].split(",").map((p) => p.trim().split(/\s+/).pop()).join(", ");
    if (!new RegExp(String.raw`REVOKE ALL ON FUNCTION public\.${h}\(${esc(sig)}\) FROM PUBLIC;`, "i").test(code)) fail(`${h}: EXECUTE not revoked from PUBLIC`);
    const grants = [...code.matchAll(new RegExp(String.raw`GRANT EXECUTE ON FUNCTION public\.${h}\([^)]*\) TO ([a-z_]+);`, "gi"))].map((g) => g[1]);
    if (grants.length !== 1 || grants[0] !== READER) fail(`${h}: EXECUTE must be granted only to ${READER}`);
  }
  // B: exactly the fifteen reader policies are re-expressed; none joins a catalogue relation inline any more.
  const altered = [...code.matchAll(/ALTER POLICY (\w+) ON public\.(\w+)\s+USING \(([\s\S]*?)\);\s*(?=ALTER POLICY|GRANT |CREATE |SET |REVOKE |DO |$)/gi)].map((m) => ({ name: m[1], table: m[2], using: m[3] }));
  const want = new Set(REPAIR_POLICIES.map(([t, p]) => `${t}.${p}`));
  const got = new Set(altered.map((a) => `${a.table}.${a.name}`));
  for (const w of want) if (!got.has(w)) fail(`policy not re-expressed: ${w}`);
  for (const g of got) if (!want.has(g)) fail(`unexpected policy altered: ${g}`);
  for (const a of altered) {
    if (!/public\.restaurant_internal_(visible|actor)_/.test(a.using)) fail(`${a.table}.${a.name}: USING does not go through a lookup helper`);
    if (/\bpublic\.(menus|menu_items|restaurant_branches|menu_categories|branch_menu_items|restaurants|menu_item_nutrition)\b(?!\s*\()/i.test(a.using.replace(/public\.restaurant_internal_\w+\(/g, "")))
      fail(`${a.table}.${a.name}: USING still reads a catalogue relation inline`);
  }
  if (!/DO \$verify\$[\s\S]*RAISE EXCEPTION[\s\S]*\$verify\$;/i.test(code)) fail("catalog-verified epilogue missing");
  return failures;
}
