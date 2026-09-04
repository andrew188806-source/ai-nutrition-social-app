// RA-2A-P1 freezes the scope, topology and control-plane position of the governed Restaurant Owner
// sold-out authority. Every value here is an exact pin: nothing is a prefix, suffix or pattern.

import {
  RA1CR1_GOVERNED_ROLES, RA1CR1_CLIENT_ROLES, RA1CR1_PROJECT_REF, RA1CR1_PROJECT_NAME
} from "./platform-admin-ra-1c-r1-successor-manifest.mjs";

export const RA2AP1_BASELINE = "22a877c974e3efb39b3fe59e1b22f88a2711a319";
export const RA2AP1_SUBJECT = "Add governed Restaurant Owner sold-out authority";
export const RA2AP1_PROJECT_REF = RA1CR1_PROJECT_REF;
export const RA2AP1_PROJECT_NAME = RA1CR1_PROJECT_NAME;
export const RA2AP1_CLIENT_ROLES = RA1CR1_CLIENT_ROLES;

export const RA2AP1_MIGRATION =
  "supabase/migrations/20260904030000_restaurant_owner_branch_menu_item_sold_out_authority.sql";
export const RA2AP1_MIGRATION_SHA256 =
  "b28a496dda43383e96d977c8e54ef54e6619f77bb2a1c3d949fe422bf36ecc01";
export const RA2AP1_BASELINE_MIGRATION_COUNT = 93;

export const RA2AP1_PERMISSION_KEY = "branch_menu_item.sold_out.write";
export const RA2AP1_PERMISSION_SCOPE = "restaurant";
export const RA2AP1_PERMISSION_ROLE = "owner";
export const RA2AP1_NON_PERMITTED_ROLES = Object.freeze(["manager", "staff"]);

export const RA2AP1_SEALED_ROLE = "restaurant_owner_branch_menu_item_write_authority";
export const RA2AP1_PRIVATE_SCHEMA = "restaurant_internal";
export const RA2AP1_AUDIT_RELATION = "restaurant_internal.branch_menu_item_sold_out_audit_log";
export const RA2AP1_TARGET_TABLE = "public.branch_menu_items";
export const RA2AP1_VERSION_COLUMN = "sold_out_version";
export const RA2AP1_TRIGGER = "branch_menu_items_sold_out_version_maintain";

export const RA2AP1_RPC = "public.restaurant_owner_set_branch_menu_item_sold_out_v1";
export const RA2AP1_RPC_SIGNATURE =
  "public.restaurant_owner_set_branch_menu_item_sold_out_v1(text, boolean, boolean, bigint)";
export const RA2AP1_RPC_PARAMETERS = Object.freeze([
  "p_branch_menu_item_id", "p_expected_sold_out", "p_next_sold_out", "p_expected_version"
]);

/** The only columns this authority may ever write on the target table. */
export const RA2AP1_WRITABLE_COLUMNS = Object.freeze(["sold_out"]);
export const RA2AP1_UNWRITABLE_COLUMNS = Object.freeze([
  "id", "restaurant_id", "branch_id", "menu_item_id", "price", "availability",
  "branch_specific_name", "branch_specific_description", "branch_specific_status", "sold_out_version"
]);

/** The closed result vocabulary. A caller never sees anything outside this list. */
export const RA2AP1_RESULT_CODES = Object.freeze([
  "unauthenticated", "permission_denied", "target_not_found",
  "stale_state", "no_change", "invalid_request"
]);

/** The typed audit columns. No JSON, no free text, no caller-supplied actor. */
export const RA2AP1_AUDIT_COLUMNS = Object.freeze([
  "id", "actor_auth_user_id", "membership_id", "restaurant_id", "branch_id", "branch_menu_item_id",
  "previous_sold_out", "next_sold_out", "previous_sold_out_version", "next_sold_out_version",
  "created_at"
]);

/**
 * RA-1C-R1's governed sealed-role set, extended by exactly this round's role. The R1 manifest is
 * evidence and is imported unchanged rather than edited: a successor widens the governed set, it
 * does not rewrite its predecessor's adjudication.
 */
export const RA2AP1_GOVERNED_ROLES = Object.freeze([
  ...RA1CR1_GOVERNED_ROLES,
  Object.freeze({ role: RA2AP1_SEALED_ROLE, migration: RA2AP1_MIGRATION })
].sort((a, b) => a.role.localeCompare(b.role)));

/**
 * The accepted PostgreSQL 16+/17 control-plane creator row, adjudicated by RA-1C-R1. `admin_option`
 * is TRUE and stays true: it is the automatic creator grant the platform records when a
 * non-superuser CREATEROLE runner creates a role, only the cluster superuser can clear it, and
 * clearing it would remove the repository's ability to maintain these roles at all.
 */
export const RA2AP1_CONTROL_PLANE_ROW = Object.freeze({
  member: "postgres",
  grantor: "supabase_admin",
  admin_option: true,
  inherit_option: false,
  set_option: false
});
export const RA2AP1_CONTROL_PLANE_EFFECTIVE = Object.freeze({
  member: true, usage: false, set_role: false
});

/** Development targets. The public demo surfaces are named here so they can never be selected. */
export const RA2AP1_ACCEPTANCE_TARGET = "dev-bmi-b-main";
export const RA2AP1_ACCEPTANCE_RESTAURANT = "dev-restaurant-hidden";
export const RA2AP1_ACCEPTANCE_BRANCH = "dev-branch-b-main";
export const RA2AP1_ACCEPTANCE_MENU_ITEM = "dev-item-b-main";
export const RA2AP1_ACCEPTANCE_OWNER_AUTH_ID = "a8e24713-25a2-4ca0-9222-5f4e7165fdcf";
export const RA2AP1_FORBIDDEN_TARGETS = Object.freeze([
  "dev-bmi-chicken-nanjing", "dev-bmi-salmon-nanjing", "dev-bmi-tofu-xinyi", "dev-bmi-draft-xinyi"
]);
export const RA2AP1_FORBIDDEN_BRANCHES = Object.freeze(["dev-branch-xinyi", "dev-branch-nanjing"]);

export const RA2AP1_PACKAGE_KEYS = Object.freeze([
  "test:restaurant-owner-sold-out-ra-2a-p1",
  "test:restaurant-owner-sold-out-ra-2a-p1-smoke",
  "test:restaurant-owner-sold-out-ra-2a-p1-mutations",
  "test:restaurant-owner-sold-out-ra-2a-p1-postgres",
  "test:restaurant-owner-sold-out-ra-2a-p1-development"
]);

export const RA2AP1_PATHS = Object.freeze([
  "docs/restaurant-owner-branch-menu-item-sold-out-ra-2a-p1.md",
  "package.json",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-contract.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-development-acceptance.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-guard.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-mutations.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-postgres-apply.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-smoke.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs",
  RA2AP1_MIGRATION
].sort());

/** Predecessor files this round must leave byte-identical. */
export const RA2AP1_FROZEN_PATHS = Object.freeze([
  "supabase/migrations/20260904010000_platform_admin_authority.sql",
  "supabase/migrations/20260904020000_platform_admin_branch_status_authority.sql",
  "scripts/platform-admin-ra-1c-r1-successor-manifest.mjs",
  "scripts/platform-admin-ra-1c-r1-contract.mjs",
  "scripts/platform-admin-ra-1c-r1-guard.mjs"
]);
