// RA-1C-R1 freezes the repository roles governed by the trusted database control-plane boundary.
// A role enters this manifest only when its repository definition and Development catalogue state
// both satisfy the sealed-authority contract. This is not a suffix or pattern-based allowlist.

export const RA1CR1_BASELINE = "e630afcbd170818f894d71cf0b50dc05890cfb99";
export const RA1CR1_ORIGIN_MAIN = "6bff2e750f5ac72bab0c93f819bc9ce56b698e22";
export const RA1CR1_SUBJECT = "Pin trusted sealed-role control-plane boundary";
export const RA1CR1_PROJECT_REF = "msbgnnoorsoefuiwluye";
export const RA1CR1_PROJECT_NAME = "tastkind-development";
export const RA1CR1_CLIENT_ROLES = Object.freeze(["anon", "authenticated", "authenticator", "service_role"]);

export const RA1CR1_GOVERNED_ROLES = Object.freeze([
  ["candidate_allergen_write_authority", "supabase/migrations/20260830010000_candidate_allergen_data_authority.sql"],
  ["candidate_ingredient_avoidance_write_authority", "supabase/migrations/20260901010000_candidate_ingredient_avoidance_data_authority.sql"],
  ["candidate_taste_write_authority", "supabase/migrations/20260828010000_candidate_taste_data_authority.sql"],
  ["geo_authority", "supabase/migrations/20260825010000_geo_shared_candidate_authority.sql"],
  ["geo_geocode_authority", "supabase/migrations/20260826010000_restaurant_geocode_source_authority.sql"],
  ["meal_buddy_candidate_pool_authority", "supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql"],
  ["meal_buddy_card_write_authority", "supabase/migrations/20260817020000_meal_buddy_card_write_authority.sql"],
  ["meal_buddy_chat_authority", "supabase/migrations/20260823020000_meal_buddy_chat_authority.sql"],
  ["meal_buddy_notification_authority", "supabase/migrations/20260824030000_meal_buddy_push_notification_authority.sql"],
  ["meal_buddy_relationship_authority", "supabase/migrations/20260823010000_meal_buddy_relationship_authority.sql"],
  ["platform_admin_branch_status_authority", "supabase/migrations/20260904020000_platform_admin_branch_status_authority.sql"],
  ["platform_admin_context_reader", "supabase/migrations/20260904010000_platform_admin_authority.sql"],
  ["platform_admin_write_authority", "supabase/migrations/20260904010000_platform_admin_authority.sql"],
  ["private_taste_normalization_write_authority", "supabase/migrations/20260829010000_private_taste_normalization_authority.sql"],
  ["social_authority", "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql"],
  ["social_pair_read_authority", "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql"],
  ["social_profile_projection_authority", "supabase/migrations/20260811040000_social_public_profile_projection.sql"]
].map(([role, migration]) => Object.freeze({ role, migration })));

// These are repository CREATE ROLE definitions, but they are deliberately outside this manifest.
// Each exclusion is named and source-pinned so it cannot become an implicit wildcard exception.
export const RA1CR1_RECONCILED_EXCLUSIONS = Object.freeze([
  Object.freeze({
    role: "restaurant_membership_context_reader",
    migration: "supabase/migrations/20260715050000_create_restaurant_membership_foundation.sql",
    reason: "legacy_phase_specific_development_membership_contract"
  }),
  Object.freeze({
    role: "social_runtime_executor",
    migration: "supabase/migrations/20260810050000_social_runtime_executor_role.sql",
    reason: "login_runtime_role_not_sealed_authority"
  })
]);

// Development contains this historical probe, but no repository migration defines it and it owns
// no application object. Naming it here documents why the raw twenty-name scan was not copied.
export const RA1CR1_LIVE_ONLY_NON_AUTHORITY = Object.freeze([
  Object.freeze({ role: "sr1bd1_probe", reason: "no_repository_definition_or_application_authority" })
]);

export const RA1CR1_REPOSITORY_ROLE_DEFINITIONS = Object.freeze([
  ...RA1CR1_GOVERNED_ROLES,
  ...RA1CR1_RECONCILED_EXCLUSIONS
].sort((a, b) => a.role.localeCompare(b.role)));

export const RA1CR1_PACKAGE_KEYS = Object.freeze([
  "test:platform-admin-ra-1c-r1",
  "test:platform-admin-ra-1c-r1-smoke",
  "test:platform-admin-ra-1c-r1-mutations",
  "test:platform-admin-ra-1c-r1-development-security"
]);

export const RA1CR1_PATHS = Object.freeze([
  "docs/platform-admin-sealed-role-control-plane-ra-1c-r1.md",
  "package.json",
  "scripts/platform-admin-ra-1c-p1-development-acceptance.mjs",
  "scripts/platform-admin-ra-1c-r1-contract.mjs",
  "scripts/platform-admin-ra-1c-r1-development-security.mjs",
  "scripts/platform-admin-ra-1c-r1-guard.mjs",
  "scripts/platform-admin-ra-1c-r1-mutations.mjs",
  "scripts/platform-admin-ra-1c-r1-smoke.mjs",
  "scripts/platform-admin-ra-1c-r1-successor-manifest.mjs"
].sort());
