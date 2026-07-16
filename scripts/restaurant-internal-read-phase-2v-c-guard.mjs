import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
const checks = [];
const failures = [];
function record(name, pass, detail) {
  checks.push({ name, pass, ...(detail === undefined ? {} : { detail }) });
  if (!pass) failures.push({ name, detail });
}

const integrity = read("supabase/migrations/20260716030000_add_restaurant_projection_integrity_constraints.sql");
const rls = read("supabase/migrations/20260716040000_create_restaurant_internal_read_rls.sql");
const rpc = read("supabase/migrations/20260716050000_create_restaurant_internal_read_rpcs_as_owner.sql");
const cleanup = read("supabase/migrations/20260716060000_restore_restaurant_internal_reader_set_option.sql");
const known = read("docs/runtime-integration-phase-2v-c/known-issues-and-deferrals.md");
const rpcContract = read("docs/runtime-integration-phase-2v-c/rpc-contract.md");

const expectedFunctions = new Map([
  ["restaurant_internal_restaurants_v1", ["restaurant_id", "name", "city", "category", "status"]],
  ["restaurant_internal_branches_v1", ["branch_id", "restaurant_id", "name", "district", "address", "status"]],
  ["restaurant_internal_menus_v1", ["menu_id", "restaurant_id", "name", "status"]],
  ["restaurant_internal_menu_categories_v1", ["category_id", "menu_id", "restaurant_id", "name", "sort_order"]],
  ["restaurant_internal_menu_items_v1", ["menu_item_id", "restaurant_id", "menu_category_id", "name", "description", "image_url", "allergens", "status", "nutrition_badge_status"]],
  ["restaurant_internal_branch_menu_items_v1", ["branch_menu_item_id", "restaurant_id", "branch_id", "menu_item_id", "price", "availability", "sold_out", "branch_specific_name", "branch_specific_description", "branch_specific_status"]],
  ["restaurant_internal_current_nutrition_v1", ["nutrition_id", "restaurant_id", "menu_item_id", "calories", "protein", "carbohydrates", "fat", "fiber", "sugar", "sodium", "saturated_fat", "serving_size", "verified_status", "is_current"]]
]);

const functionMatches = [...rpc.matchAll(/CREATE FUNCTION public\.([a-z0-9_]+)\(([^)]*)\)\s+RETURNS TABLE \(([\s\S]*?)\)\s+LANGUAGE sql[\s\S]*?AS \$\$([\s\S]*?)\$\$;/g)];
record("exactly seven SQL functions created", functionMatches.length === 7, functionMatches.map((match) => match[1]));
record("function names are exact", JSON.stringify(functionMatches.map((match) => match[1]).sort()) === JSON.stringify([...expectedFunctions.keys()].sort()));

for (const match of functionMatches) {
  const [, name, args, returnBlock, body] = match;
  const columns = returnBlock.split(",").map((column) => column.trim().split(/\s+/)[0]);
  record(`${name} exact return columns`, JSON.stringify(columns) === JSON.stringify(expectedFunctions.get(name)), columns);
  record(`${name} fixed hardened settings`, /STABLE\s+SECURITY DEFINER\s+SET search_path = ''\s+SET row_security = 'on'/s.test(match[0]));
  record(`${name} uses no dynamic SQL or write`, !/\b(?:EXECUTE|INSERT|UPDATE|DELETE|MERGE|UPSERT|TRUNCATE|CALL)\b/i.test(body));
  record(`${name} uses canonical access context`, body.includes("public.restaurant_current_access_context_v1()"));
  if (name !== "restaurant_internal_restaurants_v1") {
    record(`${name} has exact p_restaurant_id argument`, args.trim() === "p_restaurant_id text", args);
    record(`${name} intersects selector with authorized context`, body.includes("access.restaurant_id = p_restaurant_id"));
  }
}

const bodyFor = (name) => functionMatches.find((match) => match[1] === name)?.[4] ?? "";
record("restaurant exclusions absent", !/legal_name|tags|plan|created_at/i.test(bodyFor("restaurant_internal_restaurants_v1")));
record("branch is_active excluded", !/is_active/i.test(bodyFor("restaurant_internal_branches_v1")));
record("item exclusions absent", !/tag_ids|nutrition_id|badge_enabled/i.test(bodyFor("restaurant_internal_menu_items_v1")));
record("nutrition exclusions absent", !/\.source\b|confidence_score|updated_at/i.test(bodyFor("restaurant_internal_current_nutrition_v1")));
record("nutrition is current only", /nutrition\.is_current = true/.test(bodyFor("restaurant_internal_current_nutrition_v1")));
record("category tenant derives through menu", /JOIN public\.menus AS menu ON menu\.id = category\.menu_id/.test(bodyFor("restaurant_internal_menu_categories_v1")) && /menu\.restaurant_id = p_restaurant_id/.test(bodyFor("restaurant_internal_menu_categories_v1")));
record("branch item validates branch/item/category/menu restaurant chain", ["public.restaurant_branches", "public.menu_items", "public.menu_categories", "public.menus"].every((token) => bodyFor("restaurant_internal_branch_menu_items_v1").includes(token)));
record("all branch-scoped RPCs require active access-context branch IDs", ["branches", "menus", "menu_categories", "menu_items", "branch_menu_items", "current_nutrition"].every((suffix) => bodyFor(`restaurant_internal_${suffix}_v1`).includes("scope.branch_id")));

for (const name of expectedFunctions.keys()) {
  const signature = `${name}(${name === "restaurant_internal_restaurants_v1" ? "" : "text"})`;
  record(`${name} owner exact`, rpc.includes(`ALTER FUNCTION public.${signature}\n  OWNER TO restaurant_membership_context_reader;`));
  record(`${name} PUBLIC revoked`, rpc.includes(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`));
  record(`${name} anon revoked`, rpc.includes(`REVOKE ALL ON FUNCTION public.${signature} FROM anon;`));
  record(`${name} authenticated reset and exact execute`, rpc.includes(`REVOKE ALL ON FUNCTION public.${signature} FROM authenticated;`) && rpc.includes(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated;`));
}

record("no raw browser grants introduced", !/GRANT\s+SELECT[\s\S]*?\bTO\s+(?:PUBLIC|anon|authenticated)\b/i.test(rls));
record("reader receives no table-level SELECT", !/GRANT\s+SELECT\s+ON\s+TABLE/i.test(rls));
record("fourteen internal RLS policies created", (rls.match(/CREATE POLICY/g) ?? []).length === 14);
record("seven restrictive tenant policies target only the reader", (rls.match(/AS RESTRICTIVE FOR SELECT\s+TO restaurant_membership_context_reader/g) ?? []).length === 7);
record("existing public policies and safe views untouched", !/DROP POLICY|ALTER POLICY|restaurant_public_published_nutrition_v1|consumer_public_next_meal_candidates_v1/i.test(rls + rpc + integrity));
record("integrity uses composite branch and item FKs", /FOREIGN KEY \(branch_id, restaurant_id\)/.test(integrity) && /FOREIGN KEY \(menu_item_id, restaurant_id\)/.test(integrity));
record("existing branch/item unique relation not duplicated", !/UNIQUE \(branch_id, menu_item_id\)/.test(integrity));
record("menu_categories restaurant_id not added", !/ALTER TABLE public\.menu_categories|ADD COLUMN/i.test(integrity));

const cleanupCode = cleanup.replace(/--[^\r\n]*/g, " ").replace(/\s+/g, " ").trim();
record("cleanup is only fresh SET=false membership restoration", cleanupCode === "BEGIN; GRANT restaurant_membership_context_reader TO postgres WITH INHERIT FALSE, SET FALSE; COMMIT;", cleanupCode);
record("owner migration uses one role switch pair", (rpc.match(/SET LOCAL ROLE restaurant_membership_context_reader;/g) ?? []).length === 1 && (rpc.match(/SET LOCAL ROLE NONE;/g) ?? []).length === 1);
record("owner migration has no ADMIN, GRANTED BY, membership revoke or SET=false", !/WITH\s+ADMIN|GRANTED BY|REVOKE\s+restaurant_membership_context_reader\s+FROM\s+postgres|SET FALSE/i.test(rpc));

record("required known issues recorded", ["P2V-C-TR-001", "P2V-C-DI-002", "P2V-C-DD-001", "P2V-B-KI-001", "P2V-B-DV-001", "P2V-PERF-001"].every((id) => known.includes(id)));
record("membership final gate says exactly two and rejects a third", /exactly (?:the frozen )?two/i.test(known) && /third (?:membership )?row/i.test(known));
record("RPC contract excludes prohibited surfaces", /no staff,\s*rating, analytics, audit or governance/i.test(rpcContract));
record("no prohibited surface added", !/CREATE (?:FUNCTION|VIEW)[\s\S]*?(?:aggregate|analytics|staff|rating|governance)/i.test(rpc));
record("no runtime diff", git(["diff", "--name-only", "HEAD", "--", "apps", "packages", "lib"]) === "");
record("staged diff empty", git(["diff", "--cached", "--name-only"]) === "");

console.log(JSON.stringify({ phase: "2V-C guard", checks, failures }, null, 2));
if (failures.length) process.exit(1);
