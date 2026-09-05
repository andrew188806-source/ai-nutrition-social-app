// RA-2E-P1 successor manifest and shared contract. Every value here is an exact pin: nothing is a
// prefix, a suffix or a pattern. Every claim is what a specific mutation is designed to break.
//
// SCOPE. This round governs ONE thing: public.restaurant_branches.name, the Restaurant Owner's
// public-facing branch display name. Presentation authority only. Nothing about restaurants.name,
// restaurants.legal_name, branch address/district/GEO data, branch status, or any menu-item identity
// is touched, widened, or newly defined by this round.

import fs from "node:fs";
import path from "node:path";

import { D1_GOVERNED_ROLES, D1_ROLE as VISIBILITY_ROLE, D1_MIGRATION as VISIBILITY_MIGRATION }
  from "./restaurant-owner-visibility-ra-2d-p1-contract.mjs";
import { RA1CR1_GOVERNED_ROLES } from "./platform-admin-ra-1c-r1-successor-manifest.mjs";
import { RA2AP1_SEALED_ROLE } from "./restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs";

export const E1_BASELINE = "a3d2b946d2bccd9075201f1d405f53b35d27d6c3";
export const E1_ORIGIN_MAIN = "a3d2b946d2bccd9075201f1d405f53b35d27d6c3";
export const E1_SUBJECT = "Add governed Restaurant Owner branch display-name authority";
export const E1_BASELINE_MIGRATION_COUNT = 98;
export const E1_PROJECT_REF = "msbgnnoorsoefuiwluye";
export const E1_PROJECT_NAME = "tastkind-development";

export const E1_MIGRATION =
  "supabase/migrations/20260906010000_restaurant_owner_branch_display_name_authority.sql";
export const E1_MIGRATION_SHA256 =
  "8306120338b4a87da695ebc4964df3fde9ae091646027c812566d7519b0f3247";

/** RA-2A..D are frozen evidence. All five migrations must stay byte-identical. */
export const E1_FROZEN_MIGRATIONS = Object.freeze([
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
    path: VISIBILITY_MIGRATION,
    sha256: "0476c1809129f55ed81c606439bbdaadeacec2a0be6ac7a3a93eed75d11a0654"
  }),
  // RA-1C's branch-status migration is directly load-bearing for this round's independence proofs
  // (it is the OTHER writer on the same table) and must stay byte-identical too.
  Object.freeze({
    path: "supabase/migrations/20260904020000_platform_admin_branch_status_authority.sql",
    sha256: "dac22c901da171d44b2f064024d10b00f31d78e9fe27f51341baca69a3b44f5a"
  })
]);

export const E1_CLIENT_ROLES = Object.freeze(["anon", "authenticated", "authenticator", "service_role"]);

export const E1_ROLE = "restaurant_owner_branch_display_name_write_authority";
export const E1_FROZEN_STATUS_ROLE = "platform_admin_branch_status_authority";
export const E1_FROZEN_GEOCODE_ROLE = "geo_geocode_authority";
export const E1_FROZEN_GEO_ROLE = "geo_authority";
export const E1_FROZEN_VISIBILITY_ROLE = VISIBILITY_ROLE;
export const E1_FROZEN_SOLD_OUT_ROLE = RA2AP1_SEALED_ROLE;

/**
 * SEALED ROLE SUCCESSOR MANIFEST.
 *
 * This round's target table (restaurant_branches) already carries THREE governed writers that
 * predate the branch_menu_items lineage entirely: platform_admin_branch_status_authority (RA-1C),
 * geo_authority and geo_geocode_authority (the GEO rounds). None of those three are part of the
 * D1_GOVERNED_ROLES chain (which tracks the branch_menu_items lineage only), so this manifest is
 * NOT simply "D1_GOVERNED_ROLES + 1" -- it is the first round to bring the two lineages together
 * for its own independence proofs, while adding exactly one NEW role of its own.
 */
export const E1_GOVERNED_ROLES = Object.freeze([
  ...D1_GOVERNED_ROLES,
  Object.freeze({ role: E1_ROLE, migration: E1_MIGRATION })
].sort((a, b) => a.role.localeCompare(b.role)));

export const E1_INVENTORY = Object.freeze({
  ra1cr1Governed: RA1CR1_GOVERNED_ROLES.length,
  ra2dGoverned: D1_GOVERNED_ROLES.length,
  ra2eSuccessorRoles: 1,
  governedTotal: 22,
  // discoverRepositoryRoleDefinitions() counts every CREATE ROLE in supabase/migrations. Before this
  // round: 23 (the four Restaurant Owner branch_menu_item writers plus the 19 RA-1C-R1-adjudicated
  // remainder). This round adds exactly one CREATE ROLE.
  repositoryRoleDefinitionsBefore: 23,
  repositoryRoleDefinitionsAfter: 24
});

export const E1_PERMISSION_KEY = "branch.profile.display_name.write";
export const E1_PERMISSION_SCOPE = "restaurant";
export const E1_PERMISSION_ROLE = "owner";
export const E1_NON_PERMITTED_ROLES = Object.freeze(["manager", "staff"]);
export const E1_LEGACY_PERMISSION_KEYS = Object.freeze([
  "access_context.read", "restaurant.read", "branch.read", "menu.read", "nutrition.read",
  "branch_menu_item.sold_out.write", "branch_menu_item.availability.write",
  "branch_menu_item.price.write", "branch_menu_item.visibility.write"
]);

/** THE PLAIN-TEXT CANONICAL CONTRACT. */
export const E1_MIN_LENGTH = 1;
export const E1_MAX_LENGTH = 80;
export const E1_CONTROL_CHAR_PATTERN = "[\\x00-\\x1F\\x7F-\\x9F]";
export const E1_NO_UNIQUENESS_CONSTRAINT = true;
export const E1_NO_CASE_FOLDING = true;
export const E1_NO_UNICODE_NORMALIZATION = true;
export const E1_OUTER_TRIM_ONLY = true;

export const E1_VERSION_COLUMN = "display_name_version";
export const E1_TRIGGER = "restaurant_branches_display_name_version_trigger";
export const E1_TRIGGER_FUNCTION = "public.bump_restaurant_branch_display_name_version_v1";
export const E1_AUDIT = "restaurant_internal.branch_display_name_audit_log";
export const E1_PRIVATE_SCHEMA = "restaurant_internal";
export const E1_TARGET_TABLE = "public.restaurant_branches";
export const E1_TARGET_COLUMN = "name";

export const E1_PREVIEW = "public.restaurant_owner_preview_branch_display_name_v1";
export const E1_MUTATION = "public.restaurant_owner_set_branch_display_name_v1";
export const E1_PREVIEW_SIGNATURE =
  "public.restaurant_owner_preview_branch_display_name_v1(text, text)";
export const E1_MUTATION_SIGNATURE =
  "public.restaurant_owner_set_branch_display_name_v1(text, text, text, bigint)";
export const E1_PREVIEW_PARAMETERS = Object.freeze(["p_restaurant_id", "p_branch_id"]);
export const E1_MUTATION_PARAMETERS = Object.freeze([
  "p_branch_id", "p_expected_display_name", "p_next_display_name", "p_expected_version"
]);

export const E1_RESTRICTIVE_POLICIES = Object.freeze([
  "restaurant_branches_owner_display_name_tenant_select",
  "restaurant_branches_owner_display_name_tenant_update"
]);
export const E1_PERMISSIVE_POLICIES = Object.freeze([
  "restaurant_branches_owner_display_name_select",
  "restaurant_branches_owner_display_name_update"
]);

export const E1_WRITABLE_COLUMNS = Object.freeze(["name"]);
export const E1_UNWRITABLE_COLUMNS = Object.freeze([
  "id", "restaurant_id", "display_name_version", "status", "status_version",
  "address", "district", "latitude", "longitude", "geocode_status", "geocode_provider",
  "geocode_provider_ref", "geocode_normalized_address", "geocode_address_fingerprint",
  "geocode_resolved_at", "geocode_attempts", "geocode_last_error", "geocode_last_attempt_at"
]);

export const E1_PREVIEW_FIELDS = Object.freeze([
  "ok", "state", "branchId", "restaurantId", "displayName", "displayNameVersion"
]);
export const E1_PREVIEW_ERRORS = Object.freeze([
  "unauthenticated", "permission_denied", "target_not_found", "invalid_request"
]);
export const E1_MUTATION_ERRORS = Object.freeze([
  "unauthenticated", "permission_denied", "target_not_found", "invalid_request",
  "stale_state", "no_change"
]);
export const E1_AUDIT_COLUMNS = Object.freeze([
  "id", "actor_auth_user_id", "membership_id", "restaurant_id", "branch_id",
  "previous_display_name", "next_display_name", "previous_version", "next_version", "created_at"
]);

/**
 * VALIDATION ORDER. auth -> lexical presence -> permission -> tenant/target lock -> expected name +
 * version (stale) -> canonicalize next -> validate canonical next -> no_change -> update -> audit.
 * Unlike RA-2C/RA-2D, canonical validation of the NEXT value happens AFTER the tenant/target lookup:
 * text validity carries no tenant-leaking risk the way a bounded numeric/enum vocabulary check does,
 * and validating against the real current name lets no_change be computed correctly in one pass.
 */
export const E1_VALIDATION_ORDER = Object.freeze([
  "authentication", "lexical_presence", "permission", "tenant_target",
  "expected_name_and_version", "canonicalize_next", "validate_canonical_next", "no_change", "update"
]);

export const E1_FORBIDDEN_TARGETS = Object.freeze([
  "dev-bmi-chicken-nanjing", "dev-bmi-salmon-nanjing", "dev-bmi-tofu-xinyi", "dev-bmi-draft-xinyi"
]);
export const E1_FORBIDDEN_BRANCHES = Object.freeze(["dev-branch-xinyi", "dev-branch-nanjing"]);
export const E1_TARGET_RESTAURANT = "dev-restaurant-hidden";
export const E1_TARGET_BRANCH = "dev-branch-b-main";
export const E1_TEST_NAME = "B Main Branch Test";

export const E1_PACKAGE_KEYS = Object.freeze([
  "test:restaurant-owner-branch-display-name-ra-2e-p1",
  "test:restaurant-owner-branch-display-name-ra-2e-p1-smoke",
  "test:restaurant-owner-branch-display-name-ra-2e-p1-mutations",
  "test:restaurant-owner-branch-display-name-ra-2e-p1-postgres"
]);

export const E1_PATHS = Object.freeze([
  "docs/restaurant-owner-branch-display-name-ra-2e-p1.md",
  "package.json",
  "scripts/restaurant-owner-branch-display-name-ra-2e-p1-contract.mjs",
  "scripts/restaurant-owner-branch-display-name-ra-2e-p1-guard.mjs",
  "scripts/restaurant-owner-branch-display-name-ra-2e-p1-mutations.mjs",
  "scripts/restaurant-owner-branch-display-name-ra-2e-p1-postgres-apply.mjs",
  "scripts/restaurant-owner-branch-display-name-ra-2e-p1-smoke.mjs",
  E1_MIGRATION
].sort());

export const E1_FROZEN_PATHS = Object.freeze([
  "scripts/platform-admin-ra-1c-r1-successor-manifest.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs",
  "scripts/restaurant-owner-visibility-ra-2d-p1-contract.mjs",
  ...E1_FROZEN_MIGRATIONS.map((item) => item.path)
]);

// -------------------------------------------------------------------------------------------------
export const readNormalized = (root, file) =>
  fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
export const readMigrationSource = (root = process.cwd()) => readNormalized(root, E1_MIGRATION);

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
  const preview = fnBody(bare, E1_PREVIEW);
  const mutation = fnBody(bare, E1_MUTATION);
  const trigger = fnBody(bare, `${E1_TRIGGER_FUNCTION}()`);
  const has = (needle) => bare.includes(needle);
  const count = (needle) => bare.split(needle).length - 1;

  // --- transaction and permission vocabulary -----------------------------------------------------
  claim("the migration is a single transaction", /^\s*begin;/m.test(bare) && /^\s*commit;\s*$/m.test(bare));
  const checkClause = /add constraint role_permissions_permission_key_check\s*\n\s*check \(permission_key in \(([\s\S]*?)\)\);/
    .exec(bare)?.[1] ?? "";
  const checkKeys = checkClause.split(",").map((k) => k.trim()).filter(Boolean);
  claim("the permission CHECK is widened by exactly this round's key, preserving every predecessor key",
    checkKeys.length === E1_LEGACY_PERMISSION_KEYS.length + 1
    && checkKeys.includes(`'${E1_PERMISSION_KEY}'`)
    && E1_LEGACY_PERMISSION_KEYS.every((key) => checkKeys.includes(`'${key}'`)),
    { checkKeys });
  claim("the permission is seeded for owner at restaurant scope only",
    has(`select role.id, '${E1_PERMISSION_KEY}', '${E1_PERMISSION_SCOPE}'`)
    && has("where role.role_key = 'owner'"));
  claim("neither manager nor staff is seeded",
    E1_NON_PERMITTED_ROLES.every((role) => !new RegExp(`role_key\\s*=\\s*'${role}'`).test(bare)));
  claim("the seed suspends and restores FORCE row level security on both authority tables",
    has("alter table public.role_permissions no force row level security")
    && has("alter table public.restaurant_roles no force row level security")
    && has("alter table public.role_permissions force row level security")
    && has("alter table public.restaurant_roles force row level security"));
  claim("the seed verification fails closed on a wrong row count",
    has("raise exception 'RA-2E-P1: expected exactly one display-name permission row"));
  claim("the seed verification refuses to disturb a predecessor permission row",
    has("a frozen predecessor permission row was disturbed"));

  // --- the version token and structural trigger scoping ---------------------------------------------
  claim("the version column is added as bigint not null default 0",
    has(`add column ${E1_VERSION_COLUMN} bigint not null default 0`));
  claim("the trigger is scoped to UPDATE OF name with a WHEN guard -- the same convention as "
    + "status_version's own trigger on this table, which is what makes the independence structural",
    has(`create trigger ${E1_TRIGGER}`)
    && has("before update of name on public.restaurant_branches")
    && has("when (old.name is distinct from new.name)"));
  claim("the trigger carries NO INSERT branch -- insert-time seeding relies purely on the column "
    + "default, exactly like status_version",
    !/tg_op\s*=\s*'INSERT'/.test(trigger));
  claim("the trigger enforces the canonical length range as defense-in-depth",
    trigger.includes(`pg_catalog.char_length(new.name) < ${E1_MIN_LENGTH}`)
    && trigger.includes(`pg_catalog.char_length(new.name) > ${E1_MAX_LENGTH}`));
  claim("the trigger enforces outer-trim-only canonicalization as defense-in-depth (no interior collapse)",
    trigger.includes("new.name <> pg_catalog.btrim(new.name)"));
  claim("the trigger enforces the control-character contract as defense-in-depth",
    trigger.includes(`new.name ~ '${E1_CONTROL_CHAR_PATTERN}'`.replace(/\\\\/g, "\\")));
  claim("the version advances exactly once per change, with no other arithmetic",
    trigger.includes(`new.${E1_VERSION_COLUMN} := old.${E1_VERSION_COLUMN} + 1;`)
    && (trigger.match(new RegExp(`${E1_VERSION_COLUMN}\\s*:=`, "g")) ?? []).length === 1);
  claim("the version column carries its own non-negative constraint",
    has(`check (${E1_VERSION_COLUMN} >= 0)`));
  claim("NO table CHECK constrains name itself -- the guard lives only in the change-scoped trigger",
    (() => {
      const addedConstraintBodies = [...bare.matchAll(
        /alter table public\.restaurant_branches\s+add constraint\s+\w+\s+check\s*\(([\s\S]*?)\);/g
      )].map((m) => m[1]);
      return addedConstraintBodies.length === 1
        && !/\bname\b/.test(addedConstraintBodies[0]);
    })());
  claim("the trigger function pins an empty search_path",
    /create function public\.bump_restaurant_branch_display_name_version_v1\(\)[\s\S]{0,120}set search_path = ''/.test(bare));

  // --- the sealed role ----------------------------------------------------------------------------
  claim("the round creates exactly one role, and it is sealed in every attribute",
    count("create role ") === 1 && has(`create role ${E1_ROLE}\n  nologin\n  noinherit\n  nobypassrls`));
  claim("no frozen predecessor role on this table is altered by this migration",
    !new RegExp(`alter role ${E1_FROZEN_STATUS_ROLE}`).test(bare)
    && !new RegExp(`alter role ${E1_FROZEN_GEOCODE_ROLE}`).test(bare)
    && !new RegExp(`alter role ${E1_FROZEN_GEO_ROLE}`).test(bare)
    && !new RegExp(`grant[^;]*to ${E1_FROZEN_STATUS_ROLE}`).test(bare)
    && !new RegExp(`grant[^;]*to ${E1_FROZEN_GEOCODE_ROLE}`).test(bare)
    && !new RegExp(`grant[^;]*to ${E1_FROZEN_GEO_ROLE}`).test(bare));
  claim("the transient membership grants SET but never ADMIN or INHERIT",
    has(`grant ${E1_ROLE} to postgres\n  with admin false, inherit false, set true;`));
  claim("the transient membership is released before COMMIT",
    has(`revoke ${E1_ROLE}\n  from postgres granted by postgres;`)
    && bare.indexOf(`revoke ${E1_ROLE}\n  from postgres`) < bare.lastIndexOf("commit;"));
  claim("the transient CREATE on schema public is released before COMMIT",
    has(`revoke create on schema public\n  from ${E1_ROLE};`));
  claim("no client role is ever granted membership of the sealed role",
    E1_CLIENT_ROLES.every((role) => !new RegExp(`grant ${E1_ROLE} to ${role}\\b`).test(bare)));

  // --- least privilege -----------------------------------------------------------------------------
  claim("the only column UPDATE granted is name",
    has(`grant update (name)\n  on table public.restaurant_branches\n  to ${E1_ROLE};`)
    && count("grant update (") === 1);
  claim("no broad table UPDATE is granted anywhere in this migration",
    !new RegExp(`grant\\s+[^;]*\\bupdate\\b\\s+on\\s+table\\s+public\\.restaurant_branches\\s+to`).test(
      bare.replace(/grant update \(name\)[\s\S]*?;/g, "")));
  claim("no unwritable column is named in any UPDATE grant",
    E1_UNWRITABLE_COLUMNS.every((column) => !new RegExp(`grant update \\([^)]*\\b${column}\\b`).test(bare)));
  claim("the audit relation grants the writer select and insert only",
    has(`grant select, insert on table ${E1_AUDIT}\n  to ${E1_ROLE};`));
  claim("no client role holds any privilege on the audit relation",
    has(`revoke all on table ${E1_AUDIT}\n  from public, anon, authenticated, authenticator, service_role;`));

  // --- audit ---------------------------------------------------------------------------------------
  claim("the audit relation declares every approved column and nothing else",
    E1_AUDIT_COLUMNS.every((column) => new RegExp(`\\n  ${column} `).test(bare)));
  claim("the audit relation runs under FORCE row level security",
    has(`alter table ${E1_AUDIT}\n  force row level security;`));
  claim("the audit relation has no UPDATE or DELETE policy for any role",
    !/create policy [^;]*for update[^;]*branch_display_name_audit_log/.test(bare)
    && count("branch_display_name_audit_log_writer_") === 2);
  claim("only real transitions are auditable",
    has("check (previous_display_name <> next_display_name)"));
  claim("the audited destination is always canonical, even from a legacy non-canonical origin",
    has(`check (pg_catalog.char_length(next_display_name) >= ${E1_MIN_LENGTH}`)
    && has(`and pg_catalog.char_length(next_display_name) <= ${E1_MAX_LENGTH}`)
    && has("and next_display_name = pg_catalog.btrim(next_display_name)"));
  claim("the audit version advance is exactly one",
    has("check (next_version = previous_version + 1)"));
  claim("the actor is server-derived, never a parameter",
    mutation.includes("insert into restaurant_internal.branch_display_name_audit_log")
    && mutation.includes("values (v_actor,")
    && !/p_actor|p_auth_user|p_membership|p_owner/.test(bare));
  claim("no free-text reason field or JSON payload exists in the audit relation",
    !/reason/i.test(bare.match(/create table restaurant_internal\.branch_display_name_audit_log[\s\S]*?\);/)?.[0] ?? "")
    && !/\bjsonb?\b/i.test(bare.match(/create table restaurant_internal\.branch_display_name_audit_log[\s\S]*?\);/)?.[0] ?? ""));

  // --- row level security ----------------------------------------------------------------------------
  claim("both tenant policies are declared RESTRICTIVE",
    E1_RESTRICTIVE_POLICIES.every((policy) =>
      new RegExp(`create policy ${policy}\\n  on public\\.restaurant_branches\\n  as restrictive`).test(bare)));
  claim("both permissive visibility policies exist and are not restrictive",
    E1_PERMISSIVE_POLICIES.every((policy) =>
      has(`create policy ${policy}`) && !new RegExp(`create policy ${policy}[\\s\\S]{0,80}as restrictive`).test(bare)));
  claim("the restrictive UPDATE policy carries both USING and WITH CHECK",
    new RegExp(`create policy ${E1_RESTRICTIVE_POLICIES[1]}[\\s\\S]*?with check \\(`).test(bare));
  claim("every tenant policy and both RPCs require the owner role key",
    count("role.role_key = 'owner'") === 10, { observed: count("role.role_key = 'owner'") });
  claim("every tenant policy and both RPCs require this round's exact permission at restaurant scope",
    count(`permission.permission_key = '${E1_PERMISSION_KEY}'`) === 9
    && count(`permission.permission_scope = '${E1_PERMISSION_SCOPE}'`) === 9,
    { key: count(`permission.permission_key = '${E1_PERMISSION_KEY}'`),
      scope: count(`permission.permission_scope = '${E1_PERMISSION_SCOPE}'`) });
  claim("every authority chain also requires an enabled caller and an active membership",
    count("caller.login_status = 'enabled'") === 7 && count("membership.status = 'active'") === 7,
    { login: count("caller.login_status = 'enabled'"), membership: count("membership.status = 'active'") });
  claim("the permissive UPDATE policy still constrains the written value to the canonical shape",
    new RegExp(`create policy ${E1_PERMISSIVE_POLICIES[1]}[\\s\\S]*?with check \\(\\s*pg_catalog\\.char_length\\(name\\)`).test(bare));

  // --- the RPCs ----------------------------------------------------------------------------------------
  claim("both RPCs are SECURITY DEFINER with an empty search_path and row_security on",
    count("security definer") === 2 && count("set search_path = ''") === 3
    && count("set row_security = 'on'") === 2);
  claim("the preview is STABLE, so PostgreSQL itself refuses a write inside it",
    /create function public\.restaurant_owner_preview_branch_display_name_v1[\s\S]*?\nstable\n/.test(bare));
  claim("the mutation is VOLATILE",
    /create function public\.restaurant_owner_set_branch_display_name_v1[\s\S]*?\nvolatile\n/.test(bare));
  claim("neither RPC takes a caller-supplied actor",
    !/p_actor|p_auth_user_id|p_user_id|p_membership_id|p_owner_id/.test(bare));
  claim("the preview declares exactly its approved parameters",
    E1_PREVIEW_PARAMETERS.every((p) => new RegExp(`${p} text`).test(bare)));
  claim("the mutation declares exactly its approved parameters",
    has("p_branch_id text,") && has("p_expected_display_name text,")
    && has("p_next_display_name text,") && has("p_expected_version bigint"));
  const targetQuery = (body) => {
    const start = body.indexOf("from public.restaurant_branches as branch");
    return start < 0 ? "" : body.slice(start, body.indexOf(";", start));
  };
  const previewTarget = targetQuery(preview);
  const mutationTarget = targetQuery(mutation);
  claim("the preview's TARGET lookup joins the caller's membership chain, not just its permission gate",
    previewTarget.includes("join public.restaurant_memberships as membership")
    && previewTarget.includes("caller.auth_user_id = v_actor")
    && previewTarget.includes("membership.restaurant_id = branch.restaurant_id"),
    { previewTarget: previewTarget.slice(0, 200) });
  claim("the mutation's TARGET lookup joins the caller's membership chain, not just its permission gate",
    mutationTarget.includes("join public.restaurant_memberships as membership")
    && mutationTarget.includes("caller.auth_user_id = v_actor")
    && mutationTarget.includes("membership.restaurant_id = branch.restaurant_id"),
    { mutationTarget: mutationTarget.slice(0, 200) });
  claim("both RPCs derive the actor from the verified request subject alone",
    preview.includes("caller.auth_user_id = v_actor") && mutation.includes("caller.auth_user_id = v_actor")
    && count("request.jwt.claim.sub") === 5);
  claim("a cross-tenant target is indistinguishable from a nonexistent one",
    count("'errorCode', 'target_not_found'") === 2);
  claim("the preview projects the version as lossless decimal text, never a number",
    preview.includes("'displayNameVersion', v_target.display_name_version::text"));
  claim("the preview projects exactly the approved fields",
    E1_PREVIEW_FIELDS.every((field) => preview.includes(`'${field}'`)));
  claim("expectedDisplayName is compared with exact equality, never trimmed or normalized before comparison",
    mutation.includes("v_target.name <> p_expected_display_name")
    && !/pg_catalog\.btrim\(p_expected_display_name\)/.test(mutation));
  claim("nextDisplayName is canonicalized by exactly one plain outer-trim call, with no interior-"
    + "whitespace collapsing and no case folding",
    (mutation.match(/v_canonical_next\s*:=/g) ?? []).length === 1
    && mutation.includes("v_canonical_next := pg_catalog.btrim(p_next_display_name);")
    && !/regexp_replace/.test(mutation) && !/pg_catalog\.(lower|upper)\(/.test(mutation));
  claim("nextDisplayName is canonicalized before validation and before no-change",
    mutation.indexOf("v_canonical_next := pg_catalog.btrim(p_next_display_name);")
      < mutation.indexOf("no_change"));
  // Presence, not just ordering: an indexOf-only check would pass even if the whole validation
  // block were deleted, since indexOf(missing) is -1 and -1 is "before" everything.
  claim("the RPC validates the canonicalized next value's length and control characters",
    mutation.includes("pg_catalog.char_length(v_canonical_next) < 1")
    && mutation.includes("pg_catalog.char_length(v_canonical_next) > 80")
    && mutation.includes(`v_canonical_next ~ '${E1_CONTROL_CHAR_PATTERN}'`.replace(/\\\\/g, "\\")));
  claim("canonical validation of the next value happens before the no-change comparison",
    mutation.includes("char_length(v_canonical_next)")
    && mutation.indexOf("char_length(v_canonical_next)") < mutation.indexOf("v_canonical_next = v_target.name"));
  claim("the target row is locked, and locked before the precondition is judged",
    mutation.includes("for update of branch")
    && mutation.indexOf("for update of branch") < mutation.indexOf("v_target.name <> p_expected_display_name"));
  claim("a negative expected version is refused before any row is read",
    mutation.includes("or p_expected_version < 0")
    && mutation.indexOf("or p_expected_version < 0") < mutation.indexOf("from public.restaurant_branches as branch"));
  claim("both concurrency facts (name and version) are checked together",
    mutation.includes("v_target.name <> p_expected_display_name")
    && mutation.includes("v_target.display_name_version <> p_expected_version"));
  claim("the mutation writes name and no other column",
    /update public\.restaurant_branches as branch\n  set name = v_canonical_next\n/.test(mutation)
    && !/set [^\n]*(status|address|district|latitude|longitude|geocode|display_name_version)/.test(mutation));
  claim("the result vocabulary is closed",
    E1_MUTATION_ERRORS.every((code) => mutation.includes(`'${code}'`)));
  claim("the success result is explicitly marked 'applied'",
    mutation.includes("'state', 'applied'"));
  claim("no raw PostgreSQL condition can reach a caller",
    !/raise exception/.test(preview) && !/raise exception/.test(mutation));

  // --- ACL ordering and ownership ------------------------------------------------------------------
  claim("privileges are settled BEFORE ownership moves to the sealed role",
    bare.indexOf(`grant execute on function ${E1_PREVIEW}`)
      < bare.indexOf(`alter function ${E1_PREVIEW}(text, text)\n  owner to`));
  claim("PUBLIC and every client role are revoked from both RPCs",
    count("from public, anon, authenticated, authenticator, service_role;") === 4);
  claim("only authenticated is granted execute",
    count("  to authenticated;") === 2
    && !/grant execute[^;]*to (anon|service_role|authenticator)/.test(bare));
  claim("both RPCs are owned by this round's sealed role",
    count(`  owner to ${E1_ROLE};`) === 2);

  // --- fail-closed epilogue -------------------------------------------------------------------------
  const epilogue = bare.slice(bare.lastIndexOf("do $$"));
  const epilogueRelations = [...epilogue.matchAll(/\b(?:from|join)\s+([a-z_]+\.[a-z_]+)/g)].map((m) => m[1]);
  claim("the closing assertions exist and read pg_catalog relations only",
    epilogue.includes("RA-2E-P1: the tenant policies are not RESTRICTIVE")
    && epilogueRelations.length >= 6
    && epilogueRelations.every((relation) => relation.startsWith("pg_catalog.")),
    { epilogueRelations });
  claim("the epilogue proves the tenant policies are RESTRICTIVE",
    has("policy.polpermissive = false") && has("the tenant policies are not RESTRICTIVE"));
  claim("the epilogue proves FORCE row level security was restored",
    has("the seed suspension did not restore FORCE row level security"));
  claim("the epilogue proves this writer cannot reach a predecessor's columns",
    has("the display-name writer can write a column it must never write"));
  claim("the epilogue proves no predecessor was widened to name",
    has("a frozen predecessor writer was widened to name"));
  claim("the epilogue proves no client role gained the sealed role or table UPDATE",
    has("a client role holds membership of the display-name writer")
    && has("a client role gained direct UPDATE access to restaurant_branches"));
  claim("the epilogue proves the version trigger is structurally scoped to UPDATE OF name",
    has("the display-name version trigger is not scoped to UPDATE OF name"));
  claim("every epilogue failure raises rather than warns",
    count("raise exception 'RA-2E-P1:") >= 7 && !/raise warning/.test(bare));

  return claims;
}
