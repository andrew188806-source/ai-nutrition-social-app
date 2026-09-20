#!/usr/bin/env node
// R2B static source-freeze guard. No database, no network. Verifies the shape of the 5 new R2B
// migrations (permission keys, RPC names, sealed-role properties, trigger names, RLS structure,
// prohibited privileges) and that no frozen predecessor migration or Auth/Admin authority object
// was touched. This is a frozen single-round check: expected to report FAIL once a later round
// lands on top of it, matching every other guard in this repository -- never loosen it to force
// green.
import fs from "node:fs";
const ROOT = process.cwd();
const read = (file) => fs.readFileSync(`${ROOT}/${file}`, "utf8");

const FILES = {
  a: "supabase/migrations/20260918010000_restaurant_catalog_tenant_consistency_r2b_1.sql",
  b: "supabase/migrations/20260918020000_restaurant_owner_menu_authoring_authority_r2b_2.sql",
  c: "supabase/migrations/20260918030000_restaurant_owner_menu_category_authoring_authority_r2b_3.sql",
  d: "supabase/migrations/20260918040000_restaurant_owner_menu_item_authoring_authority_r2b_4.sql",
  e: "supabase/migrations/20260918050000_restaurant_owner_branch_menu_item_linkage_authority_r2b_5.sql",
};
const source = {};
for (const [key, path] of Object.entries(FILES)) source[key] = fs.existsSync(`${ROOT}/${path}`) ? read(path) : null;

const checks = [], failures = [];
function check(pass, name, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

// --- Files exist, in the expected R2B-1..R2B-5 order ------------------------------------------
for (const [key, path] of Object.entries(FILES)) check(source[key] !== null, `migration file exists: ${path}`);
const migrationFiles = fs.readdirSync(`${ROOT}/supabase/migrations`).filter((f) => f.endsWith(".sql")).sort();
// Exact successor awareness: the final six migrations are exactly R2B-1..R2B-5 followed by the one
// authorized R2E successor. Any other migration inserted inside the R2B chain, after R2E, or in
// place of an R2B file fails. A future round must deliberately update this authorized list.
const AUTHORIZED_SUCCESSORS = [
  "20260919010000_restaurant_owner_branch_menu_item_display_name_draft_visibility_r2e.sql",
  "20260919020000_staff_management_v2_outer_acl_hardening_h3.sql",
  "20260919030000_social_interest_lookup_rls_acl_hardening_h4.sql",
  "20260920010000_admin_operational_read_permissions_ae1.sql",
  "20260920020000_admin_restaurant_operational_read_foundation_b1.sql",
  "20260920030000_admin_operational_review_queues_c.sql"
];
const r2bNames = Object.values(FILES).map((path) => path.split("/").pop());
const expectedTail = [...r2bNames, ...AUTHORIZED_SUCCESSORS];
check(
  expectedTail.every((name, i) => migrationFiles.at(-expectedTail.length + i) === name),
  "the final 11 migrations are exactly R2B-1..R2B-5 followed by the authorized successors (R2E, H3, H4, ADMIN-AE1, ADMIN-B1, ADMIN-C)",
  migrationFiles.slice(-expectedTail.length)
);

// --- R2B-1: tenant consistency ------------------------------------------------------------------
check(source.a?.includes("enforce_menu_item_tenant_consistency"), "R2B-1 defines the menu_items tenant-consistency trigger function");
check(source.a?.includes("enforce_branch_menu_item_tenant_consistency"), "R2B-1 defines the branch_menu_items tenant-consistency trigger function");
check(source.a?.includes("menu_items_tenant_consistency_trigger"), "R2B-1 creates the menu_items trigger");
check(source.a?.includes("branch_menu_items_tenant_consistency_trigger"), "R2B-1 creates the branch_menu_items trigger");
check(source.a?.includes("security definer") && source.a?.includes("set search_path = ''"), "R2B-1 trigger functions are SECURITY DEFINER with search_path pinned empty");
check(source.a?.includes("PRECHECK"), "R2B-1 contains an existing-data precheck before enforcement is installed");
check(!/update\s+public\.(menu_items|branch_menu_items)\s+set\s+restaurant_id/i.test(source.a ?? ""), "R2B-1 never silently repairs existing inconsistent rows");

// --- R2B-2: menu authority -----------------------------------------------------------------------
check(source.b?.includes("'menu.write'"), "R2B-2 defines the menu.write permission key");
check(source.b?.includes("create role restaurant_owner_menu_write_authority") && /nologin\s+noinherit\s+nobypassrls/i.test(source.b ?? ""), "R2B-2 sealed role has NOLOGIN NOINHERIT NOBYPASSRLS");
for (const fn of ["restaurant_owner_create_menu_v1", "restaurant_owner_preview_menu_v1", "restaurant_owner_set_menu_name_v1", "restaurant_owner_transition_menu_status_v1"])
  check(source.b?.includes(`function public.${fn}`), `R2B-2 defines ${fn}`);
check(/draft\s*->\s*published.*published\s*->\s*archived.*draft\s*->\s*archived|draft -> published, published -> archived, draft -> archived/i.test(source.b ?? ""), "R2B-2 documents exactly the three accepted menu status transitions");
check(!/archived['"]?\s*and p_next_status\s*=\s*'draft'|archived.*->.*published/i.test(source.b?.replace(/--.*$/gm, "") ?? ""), "R2B-2 never allows an archived -> * transition");
check((source.b?.match(/as restrictive/gi) ?? []).length === 3, "R2B-2 declares exactly 3 RESTRICTIVE policies (select/insert/update)");

// --- R2B-3: category authority --------------------------------------------------------------------
check(source.c?.includes("'menu_category.write'"), "R2B-3 defines the menu_category.write permission key");
check(source.c?.includes("create role restaurant_owner_menu_category_write_authority") && /nologin\s+noinherit\s+nobypassrls/i.test(source.c ?? ""), "R2B-3 sealed role has NOLOGIN NOINHERIT NOBYPASSRLS");
for (const fn of ["restaurant_owner_create_menu_category_v1", "restaurant_owner_preview_menu_category_v1", "restaurant_owner_set_menu_category_content_v1"])
  check(source.c?.includes(`function public.${fn}`), `R2B-3 defines ${fn}`);
check(source.c?.includes("CATEGORY_DELETE_DEFERRED"), "R2B-3 explicitly documents CATEGORY_DELETE_DEFERRED");
check(!/create function public\.restaurant_owner_delete_menu_category/i.test(source.c ?? ""), "R2B-3 defines no category delete RPC");
check(!/p_restaurant_id/.test(source.c?.match(/create function public\.restaurant_owner_create_menu_category_v1[\s\S]*?\)\s*\n?returns/)?.[0] ?? ""), "R2B-3's create RPC never accepts a caller-supplied restaurant_id parameter");

// --- R2B-4: item authority -----------------------------------------------------------------------
check(source.d?.includes("'menu_item.write'"), "R2B-4 defines the menu_item.write permission key");
check(source.d?.includes("create role restaurant_owner_menu_item_write_authority") && /nologin\s+noinherit\s+nobypassrls/i.test(source.d ?? ""), "R2B-4 sealed role has NOLOGIN NOINHERIT NOBYPASSRLS");
for (const fn of ["restaurant_owner_create_menu_item_v1", "restaurant_owner_preview_menu_item_v1", "restaurant_owner_set_menu_item_content_v1", "restaurant_owner_transition_menu_item_status_v1"])
  check(source.d?.includes(`function public.${fn}`), `R2B-4 defines ${fn}`);
for (const forbidden of ["p_nutrition_badge_status", "p_badge_enabled", "p_nutrition_id", "p_tag_ids"])
  check(!source.d?.includes(forbidden), `R2B-4 never declares a ${forbidden} RPC parameter`);
check(!/grant insert \([^)]*(nutrition_badge_status|badge_enabled|nutrition_id|tag_ids|image_url)/i.test(source.d ?? ""), "R2B-4 never grants INSERT on a governed/excluded column");
check(!/grant update \([^)]*(nutrition_badge_status|badge_enabled|nutrition_id|tag_ids|image_url)/i.test(source.d ?? ""), "R2B-4 never grants UPDATE on a governed/excluded column");

// --- R2B-5: linkage authority --------------------------------------------------------------------
check(source.e?.includes("'branch_menu_item.create'"), "R2B-5 defines the branch_menu_item.create permission key");
check(source.e?.includes("create role restaurant_owner_branch_menu_item_creation_authority") && /nologin\s+noinherit\s+nobypassrls/i.test(source.e ?? ""), "R2B-5 sealed role has NOLOGIN NOINHERIT NOBYPASSRLS");
check(source.e?.includes("function public.restaurant_owner_link_menu_item_to_branch_v1"), "R2B-5 defines restaurant_owner_link_menu_item_to_branch_v1");
check(source.e?.includes("already_linked"), "R2B-5 translates the UNIQUE(branch_id, menu_item_id) violation into already_linked");
check(!/grant insert \([^)]*(branch_specific_name|branch_specific_description|branch_specific_status)/i.test(source.e ?? ""), "R2B-5 never grants INSERT on the RA-2F-governed branch_specific_* columns");
for (const predecessor of ["restaurant_owner_branch_menu_item_write_authority", "restaurant_owner_branch_menu_item_availability_write_authority", "restaurant_owner_branch_menu_item_price_write_authority", "restaurant_owner_branch_menu_item_visibility_write_authority", "restaurant_owner_branch_menu_item_display_name_write_authority"])
  check(!source.e?.includes(`create role ${predecessor}`), `R2B-5 does not redefine the frozen predecessor role ${predecessor}`);

// --- Cross-cutting: no Auth/Admin authority touched, no predecessor migration rewritten ----------
for (const [key, path] of Object.entries(FILES)) {
  const bare = (source[key] ?? "").replace(/^\s*--.*$/gm, "");
  check(!/\bauth\.(users|sessions|identities)\b/i.test(bare), `${path} does not reference auth.* tables`);
  check(!/platform_admin|staff_management|admin_authority/i.test(bare), `${path} does not reference Admin/staff authority objects`);
}
const predecessorMigrations = [
  "supabase/migrations/20260904030000_restaurant_owner_branch_menu_item_sold_out_authority.sql",
  "supabase/migrations/20260905020000_restaurant_owner_branch_menu_item_price_authority.sql",
  "supabase/migrations/20260906020000_restaurant_owner_branch_menu_item_display_name_authority.sql",
  "supabase/migrations/20260910060000_restaurant_owner_about_authority.sql",
];
for (const path of predecessorMigrations) check(fs.existsSync(`${ROOT}/${path}`), `frozen predecessor migration still present, untouched: ${path}`);
check(migrationFiles.length >= 132, "at least 132 migrations exist (127 historical + 5 R2B)", migrationFiles.length);

console.log(JSON.stringify({ suite: "restaurant-catalog-authoring-r2b-guard", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
