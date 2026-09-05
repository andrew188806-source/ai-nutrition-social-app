// RA-2F-P1 successor manifest and shared contract. Every value here is an exact pin: nothing is a
// prefix, a suffix or a pattern. Every claim is what a specific mutation is designed to break.
//
// SCOPE. This round governs ONE thing: an OPTIONAL presentation-only override of the public display
// label for one branch-menu offering, stored in the existing public.branch_menu_items.
// branch_specific_name column. It never governs canonical menu_items.name, branch_specific_description,
// menu_item_id, nutrition, allergens, taxonomy, recommendation identity or Meal Buddy matching keys.

import fs from "node:fs";
import path from "node:path";

import { E1_GOVERNED_ROLES, E1_ROLE as BRANCH_NAME_ROLE, E1_MIGRATION as BRANCH_NAME_MIGRATION }
  from "./restaurant-owner-branch-display-name-ra-2e-p1-contract.mjs";
import { RA1CR1_GOVERNED_ROLES } from "./platform-admin-ra-1c-r1-successor-manifest.mjs";
import { RA2AP1_SEALED_ROLE } from "./restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs";

export const F1_BASELINE = "d5863e5a8e0dc67c28bea076407dac1c11324086";
export const F1_ORIGIN_MAIN = "d5863e5a8e0dc67c28bea076407dac1c11324086";
export const F1_SUBJECT = "Add governed Restaurant Owner menu display-name authority";
export const F1_BASELINE_MIGRATION_COUNT = 99;
export const F1_PROJECT_REF = "msbgnnoorsoefuiwluye";
export const F1_PROJECT_NAME = "tastkind-development";

export const F1_MIGRATION =
  "supabase/migrations/20260906020000_restaurant_owner_branch_menu_item_display_name_authority.sql";
export const F1_MIGRATION_SHA256 =
  "fbbd5a2c4955af3343af61ed00fd5c61686679ad1158a4b0986a789c8e4074f4";

/** RA-2A..E are frozen evidence. All six migrations must stay byte-identical. */
export const F1_FROZEN_MIGRATIONS = Object.freeze([
  Object.freeze({
    path: "supabase/migrations/20260904030000_restaurant_owner_branch_menu_item_sold_out_authority.sql",
    sha256: "b28a496dda43383e96d977c8e54ef54e6619f77bb2a1c3d949fe422bf36ecc01"
  }),
  Object.freeze({
    path: "supabase/migrations/20260904040000_restaurant_owner_branch_menu_item_sold_out_preview.sql",
    sha256: "84cf0285a1087a2386fcc3e70d8f75d3d6b28023c843361e42fcd37ab0ef7376"
  }),
  Object.freeze({
    path: "supabase/migrations/20260905010000_restaurant_owner_branch_menu_item_availability_authority.sql",
    sha256: "83522a06b01611c06a665eca66f2921b5d57cd9114973b257a3e374f203aac33"
  }),
  Object.freeze({
    path: "supabase/migrations/20260905020000_restaurant_owner_branch_menu_item_price_authority.sql",
    sha256: "2994111d807fd28ea5c4081a6410c8dad1a3e228ef0bf53e7e89beb5011fd4d1"
  }),
  Object.freeze({
    path: "supabase/migrations/20260905030000_restaurant_owner_branch_menu_item_visibility_authority.sql",
    sha256: "0476c1809129f55ed81c606439bbdaadeacec2a0be6ac7a3a93eed75d11a0654"
  }),
  Object.freeze({
    path: BRANCH_NAME_MIGRATION,
    sha256: "8306120338b4a87da695ebc4964df3fde9ae091646027c812566d7519b0f3247"
  })
]);

export const F1_CLIENT_ROLES = Object.freeze(["anon", "authenticated", "authenticator", "service_role"]);

export const F1_ROLE = "restaurant_owner_branch_menu_item_display_name_write_authority";
export const F1_FROZEN_SOLD_OUT_ROLE = RA2AP1_SEALED_ROLE;
export const F1_FROZEN_AVAILABILITY_ROLE =
  "restaurant_owner_branch_menu_item_availability_write_authority";
export const F1_FROZEN_PRICE_ROLE = "restaurant_owner_branch_menu_item_price_write_authority";
export const F1_FROZEN_VISIBILITY_ROLE = "restaurant_owner_branch_menu_item_visibility_write_authority";
export const F1_FROZEN_BRANCH_NAME_ROLE = BRANCH_NAME_ROLE;

/**
 * SEALED ROLE SUCCESSOR MANIFEST. E1_GOVERNED_ROLES (RA-2E-P1) already unified the two lineages
 * (branch_menu_items and restaurant_branches) at 22. This round adds exactly one: the branch-menu
 * display-name-override writer.
 */
export const F1_GOVERNED_ROLES = Object.freeze([
  ...E1_GOVERNED_ROLES,
  Object.freeze({ role: F1_ROLE, migration: F1_MIGRATION })
].sort((a, b) => a.role.localeCompare(b.role)));

export const F1_INVENTORY = Object.freeze({
  ra1cr1Governed: RA1CR1_GOVERNED_ROLES.length,
  ra2eGoverned: E1_GOVERNED_ROLES.length,
  ra2fSuccessorRoles: 1,
  governedTotal: 23,
  // discoverRepositoryRoleDefinitions() counts every CREATE ROLE in supabase/migrations. Before
  // this round: 24 (per RA-2E-P1's own evidence). This round adds exactly one CREATE ROLE.
  repositoryRoleDefinitionsBefore: 24,
  repositoryRoleDefinitionsAfter: 25,
  ownerWriterDefinitions: 6
});

export const F1_OWNER_WRITERS = Object.freeze([
  Object.freeze({ role: F1_FROZEN_SOLD_OUT_ROLE, migration: F1_FROZEN_MIGRATIONS[0].path }),
  Object.freeze({ role: F1_FROZEN_AVAILABILITY_ROLE, migration: F1_FROZEN_MIGRATIONS[2].path }),
  Object.freeze({ role: F1_FROZEN_PRICE_ROLE, migration: F1_FROZEN_MIGRATIONS[3].path }),
  Object.freeze({ role: F1_FROZEN_VISIBILITY_ROLE, migration: F1_FROZEN_MIGRATIONS[4].path }),
  Object.freeze({ role: F1_FROZEN_BRANCH_NAME_ROLE, migration: F1_FROZEN_MIGRATIONS[5].path }),
  Object.freeze({ role: F1_ROLE, migration: F1_MIGRATION })
]);

export const F1_PERMISSION_KEY = "branch_menu_item.display_name.write";
export const F1_PERMISSION_SCOPE = "restaurant";
export const F1_PERMISSION_ROLE = "owner";
export const F1_NON_PERMITTED_ROLES = Object.freeze(["manager", "staff"]);
export const F1_LEGACY_PERMISSION_KEYS = Object.freeze([
  "access_context.read", "restaurant.read", "branch.read", "menu.read", "nutrition.read",
  "branch_menu_item.sold_out.write", "branch_menu_item.availability.write",
  "branch_menu_item.price.write", "branch_menu_item.visibility.write",
  "branch.profile.display_name.write"
]);

/** THE OPERATION VOCABULARY AND CANONICAL TEXT CONTRACT. */
export const F1_OPERATIONS = Object.freeze(["set", "clear"]);
export const F1_MIN_LENGTH = 1;
export const F1_MAX_LENGTH = 80;
export const F1_CONTROL_CHAR_PATTERN = "[\\x00-\\x1F\\x7F-\\x9F]";
export const F1_NO_UNIQUENESS_CONSTRAINT = true;
export const F1_NO_CASE_FOLDING = true;
export const F1_NO_UNICODE_NORMALIZATION = true;
export const F1_OUTER_TRIM_ONLY = true;
export const F1_CLEAR_STORES_NULL = true;
export const F1_WHITESPACE_ONLY_SET_IS_INVALID = true;

export const F1_VERSION_COLUMN = "branch_specific_name_version";
export const F1_TRIGGER = "branch_menu_items_display_name_version_maintain";
export const F1_TRIGGER_FUNCTION =
  "restaurant_internal.branch_menu_item_display_name_version_maintain";
export const F1_AUDIT = "restaurant_internal.branch_menu_item_display_name_audit_log";
export const F1_PRIVATE_SCHEMA = "restaurant_internal";
export const F1_TARGET_TABLE = "public.branch_menu_items";
export const F1_TARGET_COLUMN = "branch_specific_name";

export const F1_PREVIEW = "public.restaurant_owner_preview_branch_menu_item_display_name_v1";
export const F1_MUTATION = "public.restaurant_owner_set_branch_menu_item_display_name_v1";
export const F1_PREVIEW_SIGNATURE =
  "public.restaurant_owner_preview_branch_menu_item_display_name_v1(text, text, text)";
export const F1_MUTATION_SIGNATURE =
  "public.restaurant_owner_set_branch_menu_item_display_name_v1(text, text, text, text, bigint)";
export const F1_PREVIEW_PARAMETERS = Object.freeze([
  "p_restaurant_id", "p_branch_id", "p_branch_menu_item_id"
]);
export const F1_MUTATION_PARAMETERS = Object.freeze([
  "p_branch_menu_item_id", "p_operation", "p_expected_display_name", "p_next_display_name",
  "p_expected_version"
]);

export const F1_RESTRICTIVE_POLICIES = Object.freeze([
  "branch_menu_items_owner_display_name_tenant_select",
  "branch_menu_items_owner_display_name_tenant_update"
]);
export const F1_PERMISSIVE_POLICIES = Object.freeze([
  "branch_menu_items_owner_display_name_select",
  "branch_menu_items_owner_display_name_update"
]);

export const F1_WRITABLE_COLUMNS = Object.freeze(["branch_specific_name"]);
export const F1_UNWRITABLE_COLUMNS = Object.freeze([
  "id", "restaurant_id", "branch_id", "menu_item_id", "branch_specific_name_version",
  "branch_specific_description", "sold_out", "sold_out_version", "availability",
  "availability_version", "price", "price_version", "branch_specific_status",
  "branch_specific_status_version"
]);

export const F1_PREVIEW_FIELDS = Object.freeze([
  "ok", "state", "branchMenuItemId", "branchId", "menuItemId",
  "branchSpecificDisplayName", "branchSpecificDisplayNameVersion", "canonicalDisplayName"
]);
export const F1_PREVIEW_ERRORS = Object.freeze([
  "unauthenticated", "permission_denied", "target_not_found", "invalid_request"
]);
export const F1_MUTATION_ERRORS = Object.freeze([
  "unauthenticated", "permission_denied", "target_not_found", "invalid_request",
  "stale_state", "no_change"
]);
export const F1_AUDIT_COLUMNS = Object.freeze([
  "id", "actor_auth_user_id", "membership_id", "restaurant_id", "branch_id", "branch_menu_item_id",
  "menu_item_id", "previous_display_name", "next_display_name", "previous_version", "next_version",
  "created_at"
]);
export const F1_NULLABLE_AUDIT_COLUMNS = Object.freeze(["previous_display_name", "next_display_name"]);

/**
 * VALIDATION ORDER. auth -> lexical presence (including operation/next consistency) -> permission ->
 * tenant/target lock -> expected override (nullable-safe) + version (stale) -> canonicalize next
 * (SET only; CLEAR is definitionally NULL) -> validate canonical next (SET only) -> no_change
 * (nullable-safe) -> update -> audit.
 */
export const F1_VALIDATION_ORDER = Object.freeze([
  "authentication", "lexical_presence_and_operation_consistency", "permission", "tenant_target",
  "expected_override_and_version", "canonicalize_next_if_set", "validate_canonical_next_if_set",
  "no_change", "update"
]);

export const F1_FORBIDDEN_TARGETS = Object.freeze([
  "dev-bmi-chicken-nanjing", "dev-bmi-salmon-nanjing", "dev-bmi-tofu-xinyi", "dev-bmi-draft-xinyi"
]);
export const F1_FORBIDDEN_BRANCHES = Object.freeze(["dev-branch-xinyi", "dev-branch-nanjing"]);
export const F1_TARGET_RESTAURANT = "dev-restaurant-hidden";
export const F1_TARGET_BRANCH = "dev-branch-b-main";
export const F1_TARGET = "dev-bmi-b-main";
export const F1_TEST_LABEL = "B Item Test";

export const F1_PACKAGE_KEYS = Object.freeze([
  "test:restaurant-owner-branch-menu-item-display-name-ra-2f-p1",
  "test:restaurant-owner-branch-menu-item-display-name-ra-2f-p1-smoke",
  "test:restaurant-owner-branch-menu-item-display-name-ra-2f-p1-mutations",
  "test:restaurant-owner-branch-menu-item-display-name-ra-2f-p1-postgres"
]);

export const F1_PATHS = Object.freeze([
  "docs/restaurant-owner-branch-menu-item-display-name-ra-2f-p1.md",
  "package.json",
  "scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p1-contract.mjs",
  "scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p1-guard.mjs",
  "scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p1-mutations.mjs",
  "scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p1-postgres-apply.mjs",
  "scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p1-smoke.mjs",
  F1_MIGRATION
].sort());

export const F1_FROZEN_PATHS = Object.freeze([
  "scripts/platform-admin-ra-1c-r1-successor-manifest.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs",
  "scripts/restaurant-owner-branch-display-name-ra-2e-p1-contract.mjs",
  ...F1_FROZEN_MIGRATIONS.map((item) => item.path)
]);

// -------------------------------------------------------------------------------------------------
export const readNormalized = (root, file) =>
  fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
export const readMigrationSource = (root = process.cwd()) => readNormalized(root, F1_MIGRATION);

const stripComments = (text) => text.replace(/^\s*--.*$/gm, "");

function fnBody(sql, name) {
  const start = sql.indexOf(`create function ${name}`);
  if (start < 0) return "";
  const open = sql.indexOf("as $$", start);
  if (open < 0) return "";
  const close = sql.indexOf("$$;", open + 5);
  if (close < 0) return "";
  return stripComments(sql.slice(open + 5, close));
}

export function auditMigrationSource(source) {
  const claims = [];
  const claim = (name, pass, detail) => claims.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const sql = source.replace(/\r\n/g, "\n");
  const bare = stripComments(sql);
  const preview = fnBody(bare, F1_PREVIEW);
  const mutation = fnBody(bare, F1_MUTATION);
  const trigger = fnBody(bare, `${F1_TRIGGER_FUNCTION}()`);
  const has = (needle) => bare.includes(needle);
  const count = (needle) => bare.split(needle).length - 1;

  // --- transaction and permission vocabulary -----------------------------------------------------
  claim("the migration is a single transaction", /^\s*begin;/m.test(bare) && /^\s*commit;\s*$/m.test(bare));
  const checkClause = /add constraint role_permissions_permission_key_check\s*\n\s*check \(permission_key in \(([\s\S]*?)\)\);/
    .exec(bare)?.[1] ?? "";
  const checkKeys = checkClause.split(",").map((k) => k.trim()).filter(Boolean);
  claim("the permission CHECK is widened by exactly this round's key, preserving every predecessor key",
    checkKeys.length === F1_LEGACY_PERMISSION_KEYS.length + 1
    && checkKeys.includes(`'${F1_PERMISSION_KEY}'`)
    && F1_LEGACY_PERMISSION_KEYS.every((key) => checkKeys.includes(`'${key}'`)),
    { checkKeys });
  claim("the permission is seeded for owner at restaurant scope only",
    has(`select role.id, '${F1_PERMISSION_KEY}', '${F1_PERMISSION_SCOPE}'`)
    && has("where role.role_key = 'owner'"));
  claim("neither manager nor staff is seeded",
    F1_NON_PERMITTED_ROLES.every((role) => !new RegExp(`role_key\\s*=\\s*'${role}'`).test(bare)));
  claim("the seed suspends and restores FORCE row level security on both authority tables",
    has("alter table public.role_permissions no force row level security")
    && has("alter table public.restaurant_roles no force row level security")
    && has("alter table public.role_permissions force row level security")
    && has("alter table public.restaurant_roles force row level security"));
  claim("the seed verification fails closed on a wrong row count",
    has("raise exception 'RA-2F-P1: expected exactly one display-name-override permission row"));
  claim("the seed verification refuses to disturb a predecessor permission row",
    has("a frozen predecessor permission row was disturbed"));

  // --- the version token and change-scoped canonical guard, NULL-aware ------------------------------
  claim("the version column is added as bigint not null default 0",
    has(`add column ${F1_VERSION_COLUMN} bigint not null default 0`));
  claim("the trigger follows THIS table's own convention: BEFORE INSERT OR UPDATE with an internal "
    + "IS DISTINCT FROM check, not restaurant_branches' newer UPDATE-OF-column scoping",
    has(`create trigger ${F1_TRIGGER}`)
    && has("before insert or update on public.branch_menu_items")
    && trigger.includes("if tg_op = 'INSERT' then")
    && trigger.includes("new.branch_specific_name is distinct from old.branch_specific_name"));
  claim("canonical validation is skipped entirely when the new value is NULL (a CLEAR)",
    trigger.includes("if new.branch_specific_name is not null then"));
  claim("the trigger enforces the canonical length range on a non-NULL change",
    trigger.includes(`pg_catalog.char_length(new.branch_specific_name) < ${F1_MIN_LENGTH}`)
    && trigger.includes(`pg_catalog.char_length(new.branch_specific_name) > ${F1_MAX_LENGTH}`));
  claim("the trigger enforces outer-trim-only canonicalization on a non-NULL change",
    trigger.includes("new.branch_specific_name <> pg_catalog.btrim(new.branch_specific_name)"));
  claim("the trigger enforces the control-character contract on a non-NULL change",
    trigger.includes(`new.branch_specific_name ~ '${F1_CONTROL_CHAR_PATTERN}'`.replace(/\\\\/g, "\\")));
  claim("the version advances exactly once per real change, in both the INSERT and change branches",
    trigger.includes(`new.${F1_VERSION_COLUMN} := 0;`)
    && trigger.includes(`new.${F1_VERSION_COLUMN} := old.${F1_VERSION_COLUMN} + 1;`)
    && trigger.includes(`new.${F1_VERSION_COLUMN} := old.${F1_VERSION_COLUMN};`));
  claim("the version column carries its own non-negative constraint",
    has(`check (${F1_VERSION_COLUMN} >= 0)`));
  claim("NO table CHECK constrains branch_specific_name beyond the version guard",
    (() => {
      const addedConstraintBodies = [...bare.matchAll(
        /alter table public\.branch_menu_items\s+add constraint\s+\w+\s+check\s*\(([\s\S]*?)\);/g
      )].map((m) => m[1]);
      return addedConstraintBodies.length === 1
        && !/\bbranch_specific_name\b/.test(addedConstraintBodies[0]);
    })());
  claim("the trigger function pins an empty search_path",
    /create function restaurant_internal\.branch_menu_item_display_name_version_maintain\(\)[\s\S]{0,200}set search_path = ''/.test(bare));

  // --- the sealed role -----------------------------------------------------------------------------
  claim("the round creates exactly one role, and it is sealed in every attribute",
    count("create role ") === 1 && has(`create role ${F1_ROLE}\n  nologin\n  noinherit\n  nobypassrls`));
  claim("no frozen predecessor role on this table is altered by this migration",
    !new RegExp(`alter role ${F1_FROZEN_SOLD_OUT_ROLE}`).test(bare)
    && !new RegExp(`alter role ${F1_FROZEN_AVAILABILITY_ROLE}`).test(bare)
    && !new RegExp(`alter role ${F1_FROZEN_PRICE_ROLE}`).test(bare)
    && !new RegExp(`alter role ${F1_FROZEN_VISIBILITY_ROLE}`).test(bare)
    && !new RegExp(`grant[^;]*to ${F1_FROZEN_SOLD_OUT_ROLE}`).test(bare)
    && !new RegExp(`grant[^;]*to ${F1_FROZEN_AVAILABILITY_ROLE}`).test(bare)
    && !new RegExp(`grant[^;]*to ${F1_FROZEN_PRICE_ROLE}`).test(bare)
    && !new RegExp(`grant[^;]*to ${F1_FROZEN_VISIBILITY_ROLE}`).test(bare));
  claim("the transient membership grants SET but never ADMIN or INHERIT",
    has(`grant ${F1_ROLE} to postgres\n  with admin false, inherit false, set true;`));
  claim("the transient membership is released before COMMIT",
    has(`revoke ${F1_ROLE}\n  from postgres granted by postgres;`)
    && bare.indexOf(`revoke ${F1_ROLE}\n  from postgres`) < bare.lastIndexOf("commit;"));
  claim("the transient CREATE on schema public is released before COMMIT",
    has(`revoke create on schema public\n  from ${F1_ROLE};`));
  claim("no client role is ever granted membership of the sealed role",
    F1_CLIENT_ROLES.every((role) => !new RegExp(`grant ${F1_ROLE} to ${role}\\b`).test(bare)));

  // --- least privilege, including total exclusion of description ------------------------------------
  claim("the only column UPDATE granted is branch_specific_name",
    has(`grant update (branch_specific_name)\n  on table public.branch_menu_items\n  to ${F1_ROLE};`)
    && count("grant update (") === 1);
  claim("no broad table UPDATE is granted anywhere in this migration",
    !new RegExp(`grant\\s+[^;]*\\bupdate\\b\\s+on\\s+table\\s+public\\.branch_menu_items\\s+to`).test(
      bare.replace(/grant update \(branch_specific_name\)[\s\S]*?;/g, "")));
  claim("no unwritable column is named in any UPDATE grant",
    F1_UNWRITABLE_COLUMNS.every((column) => !new RegExp(`grant update \\([^)]*\\b${column}\\b`).test(bare)));
  claim("branch_specific_description is named only in comments/prose, never in an executable grant",
    !new RegExp(`grant[^;]*branch_specific_description[^;]*to ${F1_ROLE}`).test(bare)
    && !new RegExp(`select\\s*\\([^)]*branch_specific_description[^)]*\\)[\\s\\S]*?to ${F1_ROLE}`).test(bare));
  claim("the writer cannot update menu_items.name (canonical identity is out of scope)",
    !new RegExp(`grant update[^;]*on table public\\.menu_items`).test(bare));
  claim("the audit relation grants the writer select and insert only",
    has(`grant select, insert on table ${F1_AUDIT}\n  to ${F1_ROLE};`));
  claim("no client role holds any privilege on the audit relation",
    has(`revoke all on table ${F1_AUDIT}\n  from public, anon, authenticated, authenticator, service_role;`));

  // --- audit, nullable-aware ---------------------------------------------------------------------------
  claim("the audit relation declares every approved column and nothing else",
    F1_AUDIT_COLUMNS.every((column) => new RegExp(`\\n  ${column} `).test(bare)));
  claim("previous_display_name and next_display_name carry no NOT NULL (they are nullable)",
    /previous_display_name text,\n  next_display_name text,/.test(bare));
  claim("the audit relation runs under FORCE row level security",
    has(`alter table ${F1_AUDIT}\n  force row level security;`));
  claim("the audit relation has no UPDATE or DELETE policy for any role",
    !/create policy [^;]*for update[^;]*branch_menu_item_display_name_audit_log/.test(bare)
    && count("branch_menu_item_display_name_audit_log_writer_") === 2);
  claim("only real transitions are auditable, using nullable-safe IS DISTINCT FROM",
    has("check (previous_display_name is distinct from next_display_name)"));
  claim("a NULL next_display_name (CLEAR) is always a valid audited destination",
    has("check (next_display_name is null or ("));
  claim("a non-NULL audited destination is always canonical",
    has(`pg_catalog.char_length(next_display_name) >= ${F1_MIN_LENGTH}`)
    && has(`pg_catalog.char_length(next_display_name) <= ${F1_MAX_LENGTH}`)
    && has("next_display_name = pg_catalog.btrim(next_display_name)"));
  claim("the audit version advance is exactly one",
    has("check (next_version = previous_version + 1)"));
  claim("the actor is server-derived, never a parameter",
    mutation.includes("insert into restaurant_internal.branch_menu_item_display_name_audit_log")
    && mutation.includes("values (v_actor,")
    && !/p_actor|p_auth_user|p_membership|p_owner/.test(bare));

  // --- row level security ----------------------------------------------------------------------------
  claim("both tenant policies are declared RESTRICTIVE",
    F1_RESTRICTIVE_POLICIES.every((policy) =>
      new RegExp(`create policy ${policy}\\n  on public\\.branch_menu_items\\n  as restrictive`).test(bare)));
  claim("both permissive visibility policies exist and are not restrictive",
    F1_PERMISSIVE_POLICIES.every((policy) =>
      has(`create policy ${policy}`) && !new RegExp(`create policy ${policy}[\\s\\S]{0,80}as restrictive`).test(bare)));
  claim("the restrictive UPDATE policy carries both USING and WITH CHECK",
    new RegExp(`create policy ${F1_RESTRICTIVE_POLICIES[1]}[\\s\\S]*?with check \\(`).test(bare));
  claim("every tenant policy and both RPCs require the owner role key",
    count("role.role_key = 'owner'") === 10, { observed: count("role.role_key = 'owner'") });
  claim("every tenant policy and both RPCs require this round's exact permission at restaurant scope",
    count(`permission.permission_key = '${F1_PERMISSION_KEY}'`) === 9
    && count(`permission.permission_scope = '${F1_PERMISSION_SCOPE}'`) === 9,
    { key: count(`permission.permission_key = '${F1_PERMISSION_KEY}'`),
      scope: count(`permission.permission_scope = '${F1_PERMISSION_SCOPE}'`) });
  claim("every authority chain also requires an enabled caller and an active membership",
    count("caller.login_status = 'enabled'") === 7 && count("membership.status = 'active'") === 7,
    { login: count("caller.login_status = 'enabled'"), membership: count("membership.status = 'active'") });
  const permissiveUpdatePolicy = (() => {
    const start = bare.indexOf(`create policy ${F1_PERMISSIVE_POLICIES[1]}`);
    if (start < 0) return "";
    const end = bare.indexOf(";", bare.indexOf("with check", start));
    return end < 0 ? "" : bare.slice(start, end);
  })();
  claim("the permissive UPDATE policy allows NULL and constrains any non-NULL value to the canonical shape",
    /with check \(\s*branch_specific_name is null or \(/.test(permissiveUpdatePolicy));
  claim("the permissive UPDATE policy's non-NULL branch enforces the full canonical shape, not a stub",
    permissiveUpdatePolicy.includes(`pg_catalog.char_length(branch_specific_name) >= ${F1_MIN_LENGTH}`)
    && permissiveUpdatePolicy.includes(`pg_catalog.char_length(branch_specific_name) <= ${F1_MAX_LENGTH}`)
    && permissiveUpdatePolicy.includes("branch_specific_name = pg_catalog.btrim(branch_specific_name)")
    && permissiveUpdatePolicy.includes(`branch_specific_name !~ '${F1_CONTROL_CHAR_PATTERN}'`.replace(/\\\\/g, "\\")),
    { permissiveUpdatePolicy: permissiveUpdatePolicy.slice(0, 400) });

  // --- the RPCs ----------------------------------------------------------------------------------------
  claim("both RPCs are SECURITY DEFINER with an empty search_path and row_security on",
    count("security definer") === 2 && count("set search_path = ''") === 3
    && count("set row_security = 'on'") === 2);
  claim("the preview is STABLE, so PostgreSQL itself refuses a write inside it",
    /create function public\.restaurant_owner_preview_branch_menu_item_display_name_v1[\s\S]*?\nstable\n/.test(bare));
  claim("the mutation is VOLATILE",
    /create function public\.restaurant_owner_set_branch_menu_item_display_name_v1[\s\S]*?\nvolatile\n/.test(bare));
  claim("neither RPC takes a caller-supplied actor",
    !/p_actor|p_auth_user_id|p_user_id|p_membership_id|p_owner_id/.test(bare));
  claim("the preview declares exactly its approved parameters",
    F1_PREVIEW_PARAMETERS.every((p) => new RegExp(`${p} text`).test(bare)));
  claim("the mutation declares exactly its approved parameters, including the explicit operation vocabulary",
    has("p_branch_menu_item_id text,") && has("p_operation text,")
    && has("p_expected_display_name text,") && has("p_next_display_name text,")
    && has("p_expected_version bigint"));
  claim("the operation vocabulary is checked against exactly {set, clear}",
    mutation.includes("p_operation not in ('set', 'clear')"));
  claim("clear with a non-NULL next value is invalid_request",
    mutation.includes("p_operation = 'clear' and p_next_display_name is not null"));
  claim("set with a NULL next value is invalid_request",
    mutation.includes("p_operation = 'set' and p_next_display_name is null"));
  const targetQuery = (body) => {
    const start = body.indexOf("from public.branch_menu_items as item");
    return start < 0 ? "" : body.slice(start, body.indexOf(";", start));
  };
  const previewTarget = targetQuery(preview);
  const mutationTarget = targetQuery(mutation);
  claim("the preview's TARGET lookup joins the caller's membership chain, not just its permission gate",
    previewTarget.includes("join public.restaurant_memberships as membership")
    && previewTarget.includes("caller.auth_user_id = v_actor")
    && previewTarget.includes("membership.restaurant_id = item.restaurant_id"),
    { previewTarget: previewTarget.slice(0, 200) });
  claim("the mutation's TARGET lookup joins the caller's membership chain, not just its permission gate",
    mutationTarget.includes("join public.restaurant_memberships as membership")
    && mutationTarget.includes("caller.auth_user_id = v_actor")
    && mutationTarget.includes("membership.restaurant_id = item.restaurant_id"),
    { mutationTarget: mutationTarget.slice(0, 200) });
  claim("both RPCs derive the actor from the verified request subject alone",
    preview.includes("caller.auth_user_id = v_actor") && mutation.includes("caller.auth_user_id = v_actor")
    && count("request.jwt.claim.sub") === 5);
  claim("a cross-tenant target is indistinguishable from a nonexistent one",
    count("'errorCode', 'target_not_found'") === 2);
  claim("the preview joins and returns the canonical menu_items.name distinctly from the override",
    preview.includes("join public.menu_items as menu_item")
    && preview.includes("'canonicalDisplayName', v_target.canonical_name")
    && preview.includes("'branchSpecificDisplayName', v_target.branch_specific_name"));
  claim("the preview projects the version as lossless decimal text, never a number",
    preview.includes("'branchSpecificDisplayNameVersion', v_target.branch_specific_name_version::text"));
  claim("the preview projects exactly the approved fields",
    F1_PREVIEW_FIELDS.every((field) => preview.includes(`'${field}'`)));
  claim("expected-override comparison is nullable-safe (IS DISTINCT FROM), never `=`",
    mutation.includes("v_target.branch_specific_name is distinct from p_expected_display_name")
    && !/v_target\.branch_specific_name\s*<>\s*p_expected_display_name/.test(mutation));
  claim("CLEAR sets the canonical next value to NULL directly, with no length/control validation attempted",
    mutation.includes("if p_operation = 'clear' then\n    v_canonical_next := null;"));
  claim("SET canonicalizes (outer-trim only) before validating and before the no-change comparison",
    mutation.indexOf("v_canonical_next := pg_catalog.btrim(p_next_display_name);") >= 0
    && mutation.indexOf("v_canonical_next := pg_catalog.btrim(p_next_display_name);")
      < mutation.indexOf("no_change"));
  claim("SET validates the canonicalized next value's length and control characters",
    mutation.includes("pg_catalog.char_length(v_canonical_next) < 1")
    && mutation.includes("pg_catalog.char_length(v_canonical_next) > 80")
    && mutation.includes(`v_canonical_next ~ '${F1_CONTROL_CHAR_PATTERN}'`.replace(/\\\\/g, "\\")));
  claim("the no-change comparison is nullable-safe (IS NOT DISTINCT FROM)",
    mutation.includes("v_canonical_next is not distinct from v_target.branch_specific_name"));
  claim("the target row is locked, and locked before the precondition is judged",
    mutation.includes("for update of item")
    && mutation.indexOf("for update of item") < mutation.indexOf("is distinct from p_expected_display_name"));
  claim("a negative expected version is refused before any row is read",
    mutation.includes("or p_expected_version < 0")
    && mutation.indexOf("or p_expected_version < 0") < mutation.indexOf("from public.branch_menu_items as item"));
  claim("the mutation writes branch_specific_name and no other column",
    /update public\.branch_menu_items as item\n  set branch_specific_name = v_canonical_next\n/.test(mutation)
    && !/set [^\n]*(sold_out|availability|price|branch_specific_status|branch_specific_description|branch_specific_name_version)/.test(mutation));
  claim("the result vocabulary is closed",
    F1_MUTATION_ERRORS.every((code) => mutation.includes(`'${code}'`)));
  claim("the success result is explicitly marked 'applied'",
    mutation.includes("'state', 'applied'"));
  claim("no raw PostgreSQL condition can reach a caller",
    !/raise exception/.test(preview) && !/raise exception/.test(mutation));

  // --- ACL ordering and ownership ------------------------------------------------------------------
  claim("privileges are settled BEFORE ownership moves to the sealed role",
    bare.indexOf(`grant execute on function ${F1_PREVIEW}`)
      < bare.indexOf(`alter function ${F1_PREVIEW}(text, text, text)\n  owner to`));
  claim("PUBLIC and every client role are revoked from both RPCs",
    count("from public, anon, authenticated, authenticator, service_role;") === 4);
  claim("only authenticated is granted execute",
    count("  to authenticated;") === 2
    && !/grant execute[^;]*to (anon|service_role|authenticator)/.test(bare));
  claim("both RPCs are owned by this round's sealed role",
    count(`  owner to ${F1_ROLE};`) === 2);

  // --- fail-closed epilogue -------------------------------------------------------------------------
  const epilogue = bare.slice(bare.lastIndexOf("do $$"));
  const epilogueRelations = [...epilogue.matchAll(/\b(?:from|join)\s+([a-z_]+\.[a-z_]+)/g)].map((m) => m[1]);
  claim("the closing assertions exist and read pg_catalog relations only",
    epilogue.includes("RA-2F-P1: the tenant policies are not RESTRICTIVE")
    && epilogueRelations.length >= 6
    && epilogueRelations.every((relation) => relation.startsWith("pg_catalog.")),
    { epilogueRelations });
  claim("the epilogue proves the tenant policies are RESTRICTIVE",
    has("policy.polpermissive = false") && has("the tenant policies are not RESTRICTIVE"));
  claim("the epilogue proves FORCE row level security was restored",
    has("the seed suspension did not restore FORCE row level security"));
  claim("the epilogue proves this writer cannot reach a predecessor's columns",
    has("the display-name-override writer can write a column it must never write"));
  claim("the epilogue proves no predecessor was widened to branch_specific_name",
    has("a frozen predecessor writer was widened to branch_specific_name"));
  claim("the epilogue proves no client role gained the sealed role or table UPDATE",
    has("a client role holds membership of the display-name-override writer")
    && has("a client role gained direct UPDATE access to branch_menu_items"));
  claim("the epilogue proves description independence with its own dedicated assertion",
    has("the writer has any privilege at all on branch_specific_description"));
  claim("every epilogue failure raises rather than warns",
    count("raise exception 'RA-2F-P1:") >= 7 && !/raise warning/.test(bare));

  return claims;
}
