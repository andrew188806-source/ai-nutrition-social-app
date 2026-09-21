#!/usr/bin/env node
// R2E static source-freeze guard. No database, no network. Verifies the shape of the one new R2E
// migration (target role, new policy name/permissiveness/tenant-scoping/status-independence, exact
// column grants, RA-2F RPC bodies untouched) and that no historical migration was edited. Later
// rounds are accepted only through the exact successor sequence below.
import fs from "node:fs";
const ROOT = process.cwd();
const read = (file) => fs.readFileSync(`${ROOT}/${file}`, "utf8");

const MIGRATION = "supabase/migrations/20260919010000_restaurant_owner_branch_menu_item_display_name_draft_visibility_r2e.sql";
const RA2F_MIGRATION = "supabase/migrations/20260906020000_restaurant_owner_branch_menu_item_display_name_authority.sql";
const R2B4_MIGRATION = "supabase/migrations/20260918040000_restaurant_owner_menu_item_authoring_authority_r2b_4.sql";

const source = fs.existsSync(`${ROOT}/${MIGRATION}`) ? read(MIGRATION) : null;
const checks = [], failures = [];
function check(pass, name, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

check(source !== null, `migration file exists: ${MIGRATION}`);
if (source === null) {
  console.log(JSON.stringify({ suite: "restaurant-owner-display-name-draft-visibility-r2e-guard", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
  process.exitCode = 1;
  process.exit(1);
}

// --- ordering: this is the final migration in the repo --------------------------------------------
const migrationFiles = fs.readdirSync(`${ROOT}/supabase/migrations`).filter((f) => f.endsWith(".sql")).sort();
// Exact successor awareness: R2E is followed by precisely the authorized hardening and Admin migrations through ADMIN-D.
check(migrationFiles.slice(-7).join("|") === [MIGRATION.split("/").pop(), "20260919020000_staff_management_v2_outer_acl_hardening_h3.sql", "20260919030000_social_interest_lookup_rls_acl_hardening_h4.sql", "20260920010000_admin_operational_read_permissions_ae1.sql", "20260920020000_admin_restaurant_operational_read_foundation_b1.sql", "20260920030000_admin_operational_review_queues_c.sql", "20260921010000_admin_dashboard_social_policy_reads_d.sql"].join("|"), "R2E is followed only by the authorized H3, H4, ADMIN-AE1, ADMIN-B1, ADMIN-C and ADMIN-D migrations", migrationFiles.slice(-7));
check(migrationFiles.length >= 133, "at least 133 migrations exist (127 historical + 5 R2B + 1 R2E)", migrationFiles.length);

// --- target role and new policy -------------------------------------------------------------------
const TARGET_ROLE = "restaurant_owner_branch_menu_item_display_name_write_authority";
check(source.includes(TARGET_ROLE), "migration references the exact RA-2F sealed role");
check(source.includes("create policy menu_items_display_name_context_select"), "migration creates the expected policy name");
check(/on public\.menu_items for select to restaurant_owner_branch_menu_item_display_name_write_authority/.test(source),
  "the new policy targets menu_items FOR SELECT scoped to exactly the RA-2F role");
check(!/create policy menu_items_display_name_context_select[\s\S]{0,20}as restrictive/i.test(source),
  "the new policy is PERMISSIVE (no `as restrictive` on its own CREATE POLICY statement)");

// The new policy's own USING clause (extracted between its CREATE POLICY and the next top-level
// statement) must not reference status at all.
const policyStart = source.indexOf("create policy menu_items_display_name_context_select");
const policyEnd = source.indexOf("comment on policy menu_items_display_name_context_select", policyStart);
const policyBody = policyStart >= 0 && policyEnd > policyStart ? source.slice(policyStart, policyEnd) : "";
check(policyBody.length > 0, "the new policy's body was successfully isolated for inspection");
check(!/menu_items\.status|item\.status\b|mi\.status\b/i.test(policyBody),
  "the new policy's USING clause contains no reference to menu_items' own status column (membership.status/role.status are unrelated and expected)", policyBody);
check(/membership\.restaurant_id\s*=\s*menu_items\.restaurant_id/.test(policyBody),
  "the new policy's tenant predicate compares membership.restaurant_id to menu_items.restaurant_id");
check(/permission\.permission_key\s*=\s*'branch_menu_item\.display_name\.write'/.test(policyBody),
  "the new policy checks the exact RA-2F permission key");
check(/role\.role_key\s*=\s*'owner'/.test(policyBody), "the new policy requires role_key='owner'");
check(/membership\.status\s*=\s*'active'/.test(policyBody), "the new policy requires an active membership");
check(/caller\.login_status\s*=\s*'enabled'/.test(policyBody), "the new policy requires an enabled restaurant_users row");

// --- grants: exactly one new minimal column grant --------------------------------------------------
check(/grant select \(restaurant_id\)\s*\n\s*on table public\.menu_items\s*\n\s*to restaurant_owner_branch_menu_item_display_name_write_authority/.test(source),
  "migration grants exactly SELECT(restaurant_id) on menu_items to the RA-2F role, nothing broader");
for (const forbidden of ["description)", "status)", "allergens)", "menu_category_id)", "nutrition_badge_status)", "badge_enabled)", "image_url)", "tag_ids)", "nutrition_id)"]) {
  check(!new RegExp(`grant\\s+(select|update|insert)\\s*\\([^)]*${forbidden.replace(")", "\\)")}`, "i").test(source),
    `migration never grants any privilege on menu_items.${forbidden.replace(")", "")}`);
}
check(!/grant (update|insert|delete)[\s\S]{0,60}menu_items/i.test(source), "migration grants no write privilege on menu_items to anyone");

// --- RA-2F RPC bodies untouched ----------------------------------------------------------------
check(!/create (or replace )?function public\.restaurant_owner_preview_branch_menu_item_display_name_v1/i.test(source),
  "migration does not create or replace the RA-2F preview RPC");
check(!/create (or replace )?function public\.restaurant_owner_set_branch_menu_item_display_name_v1/i.test(source),
  "migration does not create or replace the RA-2F mutation RPC");
check(!/alter function public\.restaurant_owner_(preview|set)_branch_menu_item_display_name/i.test(source),
  "migration does not ALTER either RA-2F RPC");

// --- no historical migration edited (byte-identity of the two most relevant predecessors) ---------
check(fs.existsSync(`${ROOT}/${RA2F_MIGRATION}`), "the frozen RA-2F migration file still exists on disk");
check(fs.existsSync(`${ROOT}/${R2B4_MIGRATION}`), "the frozen R2B-4 migration file still exists on disk");
const ra2fSource = fs.existsSync(`${ROOT}/${RA2F_MIGRATION}`) ? read(RA2F_MIGRATION) : "";
check(ra2fSource.includes("create function public.restaurant_owner_preview_branch_menu_item_display_name_v1"),
  "the RA-2F migration file still defines its own preview RPC unmodified (spot check)");

// --- no broadened roles anywhere in the new migration text ------------------------------------------
for (const forbidden of ["to anon", "to authenticated", "to service_role", "to public"]) {
  check(!source.toLowerCase().includes(forbidden), `migration never grants anything "${forbidden}"`);
}
// The migration's own closing assertions legitimately NAME sibling roles as negative-proof targets
// ("has_table_privilege('restaurant_owner_branch_menu_item_write_authority', ..., 'SELECT')" must be
// false) -- that is expected and desired. What must never appear is a GRANT statement naming one.
const otherRoles = ["restaurant_owner_menu_write_authority", "restaurant_owner_menu_category_write_authority",
  "restaurant_owner_branch_menu_item_creation_authority", "restaurant_owner_branch_menu_item_write_authority",
  "restaurant_owner_branch_menu_item_price_write_authority", "restaurant_owner_branch_menu_item_availability_write_authority",
  "restaurant_owner_branch_menu_item_visibility_write_authority"];
for (const role of otherRoles) {
  check(!new RegExp(`grant\\s[^;]*to\\s+${role}\\b`, "is").test(source),
    `migration contains no GRANT statement naming the sibling role ${role}`);
}

// --- closing assertions present -------------------------------------------------------------------
check(/do \$\$/.test(source) && /raise exception 'R2E:/.test(source), "migration contains its own closing self-assertion block");
check((source.match(/raise exception 'R2E:/g) ?? []).length >= 8, "the closing block contains at least 8 distinct fail-closed assertions",
  (source.match(/raise exception 'R2E:/g) ?? []).length);

console.log(JSON.stringify({ suite: "restaurant-owner-display-name-draft-visibility-r2e-guard", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
process.exitCode = failures.length ? 1 : 0;
