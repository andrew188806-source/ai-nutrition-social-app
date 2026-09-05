// RA-2D-P1 successor manifest and shared contract. Every value here is an exact pin: nothing is a
// prefix, a suffix or a pattern. Every claim is what a specific mutation is designed to break.
//
// SCOPE. This round governs ONE thing: temporary Owner-controlled visibility of a branch-menu
// offering, restricted to exactly the available <-> hidden transition. discontinued stays a valid
// stored value with its future governance deliberately unresolved -- this round grants no authority
// to move a row into or out of it, in either direction.

import fs from "node:fs";
import path from "node:path";

import {
  RA2AP1_GOVERNED_ROLES, RA2AP1_SEALED_ROLE
} from "./restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs";
import { RA1CR1_GOVERNED_ROLES } from "./platform-admin-ra-1c-r1-successor-manifest.mjs";
import {
  C1_GOVERNED_ROLES, C1_ROLE as PRICE_ROLE, C1_MIGRATION as PRICE_MIGRATION
} from "./restaurant-owner-price-ra-2c-p1-contract.mjs";

export const D1_BASELINE = "539668c60a96dce9c8f44fa8cfd52929f214a4c5";
export const D1_ORIGIN_MAIN = "539668c60a96dce9c8f44fa8cfd52929f214a4c5";
export const D1_SUBJECT = "Add governed Restaurant Owner offering visibility authority";
export const D1_BASELINE_MIGRATION_COUNT = 97;
export const D1_PROJECT_REF = "msbgnnoorsoefuiwluye";
export const D1_PROJECT_NAME = "tastkind-development";

export const D1_MIGRATION =
  "supabase/migrations/20260905030000_restaurant_owner_branch_menu_item_visibility_authority.sql";
export const D1_MIGRATION_SHA256 =
  "0476c1809129f55ed81c606439bbdaadeacec2a0be6ac7a3a93eed75d11a0654";

/** RA-2A/RA-2B/RA-2C are frozen evidence. All four migrations must stay byte-identical. */
export const D1_FROZEN_MIGRATIONS = Object.freeze([
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
    path: PRICE_MIGRATION,
    sha256: "2994111d807fd28ea5c4081a6410c8dad1a3e228ef0bf53e7e89beb5011fd4d1"
  })
]);

export const D1_CLIENT_ROLES = Object.freeze(["anon", "authenticated", "authenticator", "service_role"]);

export const D1_ROLE = "restaurant_owner_branch_menu_item_visibility_write_authority";
export const D1_FROZEN_SOLD_OUT_ROLE = RA2AP1_SEALED_ROLE;
export const D1_FROZEN_AVAILABILITY_ROLE =
  "restaurant_owner_branch_menu_item_availability_write_authority";
export const D1_FROZEN_PRICE_ROLE = PRICE_ROLE;

/**
 * SEALED ROLE SUCCESSOR MANIFEST. RA-2C-P1 closed RA-2B's inherited manifest gap and landed at 20
 * governed roles (17 R1 + 1 RA-2A + 1 RA-2B (backfilled) + 1 RA-2C). This round adds exactly one:
 * the visibility writer.
 */
export const D1_GOVERNED_ROLES = Object.freeze([
  ...C1_GOVERNED_ROLES,
  Object.freeze({ role: D1_ROLE, migration: D1_MIGRATION })
].sort((a, b) => a.role.localeCompare(b.role)));

export const D1_INVENTORY = Object.freeze({
  ra1cr1Governed: RA1CR1_GOVERNED_ROLES.length,
  ra2ap1Governed: RA2AP1_GOVERNED_ROLES.length,
  ra2cGoverned: C1_GOVERNED_ROLES.length,
  ra2dSuccessorRoles: 1,
  governedTotal: 21,
  repositoryRoleDefinitions: 23,
  ownerWriterDefinitions: 4,
  ra1cr1AdjudicatedRemainder: 19
});

export const D1_OWNER_WRITERS = Object.freeze([
  Object.freeze({ role: D1_FROZEN_SOLD_OUT_ROLE, migration: D1_FROZEN_MIGRATIONS[0].path }),
  Object.freeze({ role: D1_FROZEN_AVAILABILITY_ROLE, migration: D1_FROZEN_MIGRATIONS[2].path }),
  Object.freeze({ role: D1_FROZEN_PRICE_ROLE, migration: D1_FROZEN_MIGRATIONS[3].path }),
  Object.freeze({ role: D1_ROLE, migration: D1_MIGRATION })
]);

export const D1_PERMISSION_KEY = "branch_menu_item.visibility.write";
export const D1_PERMISSION_SCOPE = "restaurant";
export const D1_PERMISSION_ROLE = "owner";
export const D1_NON_PERMITTED_ROLES = Object.freeze(["manager", "staff"]);
export const D1_LEGACY_PERMISSION_KEYS = Object.freeze([
  "access_context.read", "restaurant.read", "branch.read", "menu.read", "nutrition.read",
  "branch_menu_item.sold_out.write", "branch_menu_item.availability.write",
  "branch_menu_item.price.write"
]);

/** THE PRODUCT CONTRACT. */
export const D1_AVAILABLE = "available";
export const D1_HIDDEN = "hidden";
export const D1_DISCONTINUED = "discontinued";
export const D1_NEXT_VOCABULARY = Object.freeze([D1_AVAILABLE, D1_HIDDEN]);
export const D1_EXPECTED_VOCABULARY = Object.freeze([D1_AVAILABLE, D1_HIDDEN, D1_DISCONTINUED]);
export const D1_OWNER_COPY = Object.freeze({
  available_to_hidden: "暫時隱藏",
  hidden_to_available: "恢復顯示"
});
export const D1_FORBIDDEN_COPY = Object.freeze(["停售", "刪除", "永久停售", "停產"]);

/**
 * DESIGN DECISION: no trigger-level transition restriction. Transition legality (excluding
 * discontinued) is authorization-shaped, not value-domain-shaped, so it lives entirely in the
 * mutation RPC, scoped to this round's own sealed writer. A future round governing discontinued
 * needs to touch nothing here.
 */
export const D1_TRANSITION_LOGIC_LOCATION = "rpc_only";
export const D1_NO_TRIGGER_TRANSITION_RESTRICTION = true;

export const D1_VERSION_COLUMN = "branch_specific_status_version";
export const D1_TRIGGER = "branch_menu_items_branch_specific_status_version_maintain";
export const D1_TRIGGER_FUNCTION =
  "restaurant_internal.branch_menu_item_branch_specific_status_version_maintain";
export const D1_AUDIT = "restaurant_internal.branch_menu_item_visibility_audit_log";
export const D1_PRIVATE_SCHEMA = "restaurant_internal";
export const D1_TARGET_TABLE = "public.branch_menu_items";
export const D1_TARGET_COLUMN = "branch_specific_status";

export const D1_PREVIEW = "public.restaurant_owner_preview_branch_menu_item_visibility_v1";
export const D1_MUTATION = "public.restaurant_owner_set_branch_menu_item_visibility_v1";
export const D1_PREVIEW_SIGNATURE =
  "public.restaurant_owner_preview_branch_menu_item_visibility_v1(text, text, text)";
export const D1_MUTATION_SIGNATURE =
  "public.restaurant_owner_set_branch_menu_item_visibility_v1(text, text, text, bigint)";
export const D1_PREVIEW_PARAMETERS = Object.freeze([
  "p_restaurant_id", "p_branch_id", "p_branch_menu_item_id"
]);
export const D1_MUTATION_PARAMETERS = Object.freeze([
  "p_branch_menu_item_id", "p_expected_status", "p_next_status", "p_expected_version"
]);

export const D1_RESTRICTIVE_POLICIES = Object.freeze([
  "branch_menu_items_owner_visibility_tenant_select",
  "branch_menu_items_owner_visibility_tenant_update"
]);
export const D1_PERMISSIVE_POLICIES = Object.freeze([
  "branch_menu_items_owner_visibility_select",
  "branch_menu_items_owner_visibility_update"
]);

export const D1_WRITABLE_COLUMNS = Object.freeze(["branch_specific_status"]);
export const D1_UNWRITABLE_COLUMNS = Object.freeze([
  "id", "restaurant_id", "branch_id", "menu_item_id", "branch_specific_status_version",
  "sold_out", "sold_out_version", "availability", "availability_version", "price", "price_version",
  "branch_specific_name", "branch_specific_description"
]);

export const D1_PREVIEW_FIELDS = Object.freeze([
  "ok", "state", "branchMenuItemId", "branchId", "menuItemId",
  "branchSpecificStatus", "branchSpecificStatusVersion"
]);
export const D1_PREVIEW_ERRORS = Object.freeze([
  "unauthenticated", "permission_denied", "target_not_found", "invalid_request"
]);
export const D1_MUTATION_ERRORS = Object.freeze([
  "unauthenticated", "permission_denied", "target_not_found", "invalid_request",
  "invalid_transition", "stale_state", "no_change"
]);
export const D1_AUDIT_COLUMNS = Object.freeze([
  "id", "actor_auth_user_id", "membership_id", "restaurant_id", "branch_id", "branch_menu_item_id",
  "menu_item_id", "previous_status", "next_status", "previous_version", "next_version", "created_at"
]);

/**
 * VALIDATION ORDER. Mirrors RA-2C-P1's discipline: a bounded-vocabulary check precedes permission,
 * so an authorization boundary is never used to help distinguish malformed input from a real target.
 * The transition-legality check (expected='discontinued') sits right after lexical validation and
 * before permission, since it is itself a bounded-input classification, not a tenant fact.
 */
export const D1_VALIDATION_ORDER = Object.freeze([
  "authentication", "lexical_vocabulary", "transition_legality", "permission", "tenant_target",
  "expected_status_and_version", "no_change", "update"
]);

export const D1_FORBIDDEN_TARGETS = Object.freeze([
  "dev-bmi-chicken-nanjing", "dev-bmi-salmon-nanjing", "dev-bmi-tofu-xinyi", "dev-bmi-draft-xinyi"
]);
export const D1_FORBIDDEN_BRANCHES = Object.freeze(["dev-branch-xinyi", "dev-branch-nanjing"]);
export const D1_TARGET = "dev-bmi-b-main";
export const D1_TARGET_RESTAURANT = "dev-restaurant-hidden";
export const D1_TARGET_BRANCH = "dev-branch-b-main";

export const D1_PACKAGE_KEYS = Object.freeze([
  "test:restaurant-owner-visibility-ra-2d-p1",
  "test:restaurant-owner-visibility-ra-2d-p1-smoke",
  "test:restaurant-owner-visibility-ra-2d-p1-mutations",
  "test:restaurant-owner-visibility-ra-2d-p1-postgres"
]);

export const D1_PATHS = Object.freeze([
  "docs/restaurant-owner-visibility-ra-2d-p1.md",
  "package.json",
  "scripts/restaurant-owner-visibility-ra-2d-p1-contract.mjs",
  "scripts/restaurant-owner-visibility-ra-2d-p1-guard.mjs",
  "scripts/restaurant-owner-visibility-ra-2d-p1-mutations.mjs",
  "scripts/restaurant-owner-visibility-ra-2d-p1-postgres-apply.mjs",
  "scripts/restaurant-owner-visibility-ra-2d-p1-smoke.mjs",
  D1_MIGRATION
].sort());

export const D1_FROZEN_PATHS = Object.freeze([
  "scripts/platform-admin-ra-1c-r1-successor-manifest.mjs",
  "scripts/platform-admin-ra-1c-r1-contract.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs",
  "scripts/restaurant-owner-availability-ra-2b-p1-contract.mjs",
  "scripts/restaurant-owner-price-ra-2c-p1-contract.mjs",
  ...D1_FROZEN_MIGRATIONS.map((item) => item.path)
]);

// -------------------------------------------------------------------------------------------------
export const readNormalized = (root, file) =>
  fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
export const readMigrationSource = (root = process.cwd()) => readNormalized(root, D1_MIGRATION);

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
  const preview = fnBody(bare, D1_PREVIEW);
  const mutation = fnBody(bare, D1_MUTATION);
  const trigger = fnBody(bare, `${D1_TRIGGER_FUNCTION}()`);
  const has = (needle) => bare.includes(needle);
  const count = (needle) => bare.split(needle).length - 1;

  // --- transaction and permission vocabulary -----------------------------------------------------
  claim("the migration is a single transaction", /^\s*begin;/m.test(bare) && /^\s*commit;\s*$/m.test(bare));
  const checkClause = /add constraint role_permissions_permission_key_check\s*\n\s*check \(permission_key in \(([\s\S]*?)\)\);/
    .exec(bare)?.[1] ?? "";
  const checkKeys = checkClause.split(",").map((k) => k.trim()).filter(Boolean);
  claim("the permission CHECK is widened by exactly this round's key, preserving every predecessor key",
    checkKeys.length === D1_LEGACY_PERMISSION_KEYS.length + 1
    && checkKeys.includes(`'${D1_PERMISSION_KEY}'`)
    && D1_LEGACY_PERMISSION_KEYS.every((key) => checkKeys.includes(`'${key}'`)),
    { checkKeys });
  claim("the permission is seeded for owner at restaurant scope only",
    has(`select role.id, '${D1_PERMISSION_KEY}', '${D1_PERMISSION_SCOPE}'`)
    && has("where role.role_key = 'owner'"));
  claim("neither manager nor staff is seeded",
    D1_NON_PERMITTED_ROLES.every((role) => !new RegExp(`role_key\\s*=\\s*'${role}'`).test(bare)));
  claim("the seed suspends and restores FORCE row level security on both authority tables",
    has("alter table public.role_permissions no force row level security")
    && has("alter table public.restaurant_roles no force row level security")
    && has("alter table public.role_permissions force row level security")
    && has("alter table public.restaurant_roles force row level security"));
  claim("the seed verification fails closed on a wrong row count",
    has("raise exception 'RA-2D-P1: expected exactly one visibility permission row"));
  claim("the seed verification refuses to disturb a predecessor permission row",
    has("a frozen predecessor permission row was disturbed"));

  // --- the version token: NO transition restriction ------------------------------------------------
  claim("the version column is added as bigint not null default 0",
    has(`add column ${D1_VERSION_COLUMN} bigint not null default 0`));
  claim("the trigger fires before insert or update, for each row",
    has(`create trigger ${D1_TRIGGER}`) && has("before insert or update on public.branch_menu_items")
    && has("for each row execute function"));
  claim("DESIGN: the trigger contains NO business-rule reference to 'discontinued' -- transition "
    + "legality lives only in the RPC, so a future round governing discontinued needs to touch "
    + "nothing here", !/discontinued/.test(trigger));
  claim("the trigger seeds 0 on insert and advances the version only when the status actually changes",
    trigger.includes("if tg_op = 'INSERT' then")
    && trigger.includes(`new.${D1_VERSION_COLUMN} := 0;`)
    && trigger.includes(`new.branch_specific_status is distinct from old.branch_specific_status`)
    && trigger.includes(`new.${D1_VERSION_COLUMN} := old.${D1_VERSION_COLUMN} + 1;`)
    && trigger.includes(`new.${D1_VERSION_COLUMN} := old.${D1_VERSION_COLUMN};`));
  claim("the version column carries its own non-negative constraint",
    has(`check (${D1_VERSION_COLUMN} >= 0)`));
  // Read every ALTER TABLE ... ADD CONSTRAINT ... CHECK(...) body this migration adds, regardless of
  // the constraint's own NAME (a malicious constraint need not name itself after the column it
  // constrains). After stripping the one legitimate reference to branch_specific_status_version,
  // none of them may still mention bare branch_specific_status.
  const addedConstraintBodies = [...bare.matchAll(
    /alter table public\.branch_menu_items\s+add constraint\s+\w+\s+check\s*\(([\s\S]*?)\);/g
  )].map((m) => m[1]);
  claim("NO new CHECK constrains branch_specific_status beyond the pre-existing enum CHECK",
    addedConstraintBodies.length === 1
    && !/\bbranch_specific_status\b/.test(
      addedConstraintBodies[0].replace(/branch_specific_status_version/g, "")),
    addedConstraintBodies);
  claim("the trigger function pins an empty search_path",
    /create function restaurant_internal\.branch_menu_item_branch_specific_status_version_maintain\(\)[\s\S]{0,200}set search_path = ''/.test(bare));

  // --- the sealed role ----------------------------------------------------------------------------
  claim("the round creates exactly one role, and it is sealed in every attribute",
    count("create role ") === 1 && has(`create role ${D1_ROLE}\n  nologin\n  noinherit\n  nobypassrls`));
  claim("no frozen predecessor role is altered by this migration",
    !new RegExp(`alter role ${D1_FROZEN_SOLD_OUT_ROLE}`).test(bare)
    && !new RegExp(`alter role ${D1_FROZEN_AVAILABILITY_ROLE}`).test(bare)
    && !new RegExp(`alter role ${D1_FROZEN_PRICE_ROLE}`).test(bare)
    && !new RegExp(`grant[^;]*to ${D1_FROZEN_SOLD_OUT_ROLE}`).test(bare)
    && !new RegExp(`grant[^;]*to ${D1_FROZEN_AVAILABILITY_ROLE}`).test(bare)
    && !new RegExp(`grant[^;]*to ${D1_FROZEN_PRICE_ROLE}`).test(bare));
  claim("the transient membership grants SET but never ADMIN or INHERIT",
    has(`grant ${D1_ROLE} to postgres\n  with admin false, inherit false, set true;`));
  claim("the transient membership is released before COMMIT",
    has(`revoke ${D1_ROLE}\n  from postgres granted by postgres;`)
    && bare.indexOf(`revoke ${D1_ROLE}\n  from postgres`) < bare.lastIndexOf("commit;"));
  claim("the transient CREATE on schema public is released before COMMIT",
    has(`revoke create on schema public\n  from ${D1_ROLE};`));
  claim("no client role is ever granted membership of the sealed role",
    D1_CLIENT_ROLES.every((role) => !new RegExp(`grant ${D1_ROLE} to ${role}\\b`).test(bare)));

  // --- least privilege -----------------------------------------------------------------------------
  claim("the only column UPDATE granted is branch_specific_status",
    has(`grant update (branch_specific_status)\n  on table public.branch_menu_items\n  to ${D1_ROLE};`)
    && count("grant update (") === 1);
  claim("no broad table UPDATE is granted anywhere in this migration",
    !new RegExp(`grant\\s+[^;]*\\bupdate\\b\\s+on\\s+table\\s+public\\.branch_menu_items\\s+to`).test(
      bare.replace(/grant update \(branch_specific_status\)[\s\S]*?;/g, "")));
  claim("no unwritable column is named in any UPDATE grant",
    D1_UNWRITABLE_COLUMNS.every((column) => !new RegExp(`grant update \\([^)]*\\b${column}\\b`).test(bare)));
  claim("the audit relation grants the writer select and insert only",
    has(`grant select, insert on table ${D1_AUDIT}\n  to ${D1_ROLE};`));
  claim("no client role holds any privilege on the audit relation",
    has(`revoke all on table ${D1_AUDIT}\n  from public, anon, authenticated, authenticator, service_role;`));

  // --- audit ---------------------------------------------------------------------------------------
  claim("the audit relation declares every approved column and nothing else",
    D1_AUDIT_COLUMNS.every((column) => new RegExp(`\\n  ${column} `).test(bare)));
  claim("the audit relation runs under FORCE row level security",
    has(`alter table ${D1_AUDIT}\n  force row level security;`));
  claim("the audit relation has no UPDATE or DELETE policy for any role",
    !/create policy [^;]*for update[^;]*branch_menu_item_visibility_audit_log/.test(bare)
    && count("branch_menu_item_visibility_audit_log_writer_") === 2);
  claim("only real transitions are auditable",
    has("check (previous_status <> next_status)"));
  claim("both sides of every audited transition are always canonical -- never discontinued",
    has("check (previous_status in ('available', 'hidden'))")
    && has("check (next_status in ('available', 'hidden'))"));
  claim("the audit version advance is exactly one",
    has("check (next_version = previous_version + 1)"));
  claim("the actor is server-derived, never a parameter",
    mutation.includes("insert into restaurant_internal.branch_menu_item_visibility_audit_log")
    && mutation.includes("values (v_actor,")
    && !/p_actor|p_auth_user|p_membership|p_owner/.test(bare));

  // --- row level security ----------------------------------------------------------------------------
  claim("both tenant policies are declared RESTRICTIVE",
    D1_RESTRICTIVE_POLICIES.every((policy) =>
      new RegExp(`create policy ${policy}\\n  on public\\.branch_menu_items\\n  as restrictive`).test(bare)));
  claim("both permissive visibility policies exist and are not restrictive",
    D1_PERMISSIVE_POLICIES.every((policy) =>
      has(`create policy ${policy}`) && !new RegExp(`create policy ${policy}[\\s\\S]{0,80}as restrictive`).test(bare)));
  claim("the restrictive UPDATE policy carries both USING and WITH CHECK",
    new RegExp(`create policy ${D1_RESTRICTIVE_POLICIES[1]}[\\s\\S]*?with check \\(`).test(bare));
  claim("every tenant policy and both RPCs require the owner role key",
    count("role.role_key = 'owner'") === 10, { observed: count("role.role_key = 'owner'") });
  claim("every tenant policy and both RPCs require this round's exact permission at restaurant scope",
    count(`permission.permission_key = '${D1_PERMISSION_KEY}'`) === 9
    && count(`permission.permission_scope = '${D1_PERMISSION_SCOPE}'`) === 9,
    { key: count(`permission.permission_key = '${D1_PERMISSION_KEY}'`),
      scope: count(`permission.permission_scope = '${D1_PERMISSION_SCOPE}'`) });
  claim("every authority chain also requires an enabled caller and an active membership",
    count("caller.login_status = 'enabled'") === 7 && count("membership.status = 'active'") === 7,
    { login: count("caller.login_status = 'enabled'"), membership: count("membership.status = 'active'") });
  claim("the permissive UPDATE policy still constrains the written value to the owner-selectable vocabulary",
    new RegExp(`create policy ${D1_PERMISSIVE_POLICIES[1]}[\\s\\S]*?with check \\(branch_specific_status in \\('available', 'hidden'\\)`).test(bare));

  // --- the RPCs ----------------------------------------------------------------------------------------
  claim("both RPCs are SECURITY DEFINER with an empty search_path and row_security on",
    count("security definer") === 2 && count("set search_path = ''") === 3
    && count("set row_security = 'on'") === 2);
  claim("the preview is STABLE, so PostgreSQL itself refuses a write inside it",
    /create function public\.restaurant_owner_preview_branch_menu_item_visibility_v1[\s\S]*?\nstable\n/.test(bare));
  claim("the mutation is VOLATILE",
    /create function public\.restaurant_owner_set_branch_menu_item_visibility_v1[\s\S]*?\nvolatile\n/.test(bare));
  claim("neither RPC takes a caller-supplied actor",
    !/p_actor|p_auth_user_id|p_user_id|p_membership_id|p_owner_id/.test(bare));
  claim("the preview declares exactly its approved parameters",
    D1_PREVIEW_PARAMETERS.every((p) => new RegExp(`${p} text`).test(bare)));
  claim("the mutation declares exactly its approved parameters",
    has("p_branch_menu_item_id text,") && has("p_expected_status text,")
    && has("p_next_status text,") && has("p_expected_version bigint"));
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
  claim("the preview projects the version as lossless decimal text, never a number",
    preview.includes("'branchSpecificStatusVersion', v_target.branch_specific_status_version::text"));
  claim("the preview projects exactly the approved fields",
    D1_PREVIEW_FIELDS.every((field) => preview.includes(`'${field}'`)));

  // --- discontinued boundary, the heart of this round -----------------------------------------------
  claim("the expected-status vocabulary lexically admits discontinued (needed for concurrency proof)",
    mutation.includes("p_expected_status not in ('available', 'hidden', 'discontinued')"));
  claim("the next-status vocabulary EXCLUDES discontinued entirely -- naming it is invalid_request",
    mutation.includes("p_next_status not in ('available', 'hidden')")
    && !mutation.includes("p_next_status not in ('available', 'hidden', 'discontinued')"));
  claim("ORDERING: the lexical vocabulary check precedes the transition-legality check",
    mutation.indexOf("p_next_status not in") < mutation.indexOf("p_expected_status = 'discontinued'"));
  claim("ORDERING: transition legality is checked BEFORE the permission check",
    mutation.indexOf("p_expected_status = 'discontinued'") < mutation.indexOf("permission_denied"));
  claim("a discontinued expected status is refused as invalid_transition before any row lock",
    mutation.indexOf("errorCode', 'invalid_transition'") < mutation.indexOf("for update of item"));
  claim("no path can apply a write when the expected status is discontinued",
    (() => {
      const idx = mutation.indexOf("p_expected_status = 'discontinued'");
      const ret = mutation.indexOf("invalid_transition", idx);
      const nextCheck = mutation.indexOf("if not exists", idx);
      return idx >= 0 && ret > idx && ret < nextCheck;
    })());

  claim("the mutation validates lexically before touching any row",
    mutation.indexOf("p_next_status not in") < mutation.indexOf("from public.branch_menu_items as item"));
  claim("a negative expected version is refused before any row is read",
    mutation.includes("or p_expected_version < 0")
    && mutation.indexOf("or p_expected_version < 0") < mutation.indexOf("from public.branch_menu_items as item"));
  claim("both concurrency facts (status and version) are checked together",
    mutation.includes("v_target.branch_specific_status <> p_expected_status")
    && mutation.includes("v_target.branch_specific_status_version <> p_expected_version"));
  claim("the target row is locked, and locked before the precondition is judged",
    mutation.includes("for update of item")
    && mutation.indexOf("for update of item") < mutation.indexOf("v_target.branch_specific_status <> p_expected_status"));
  claim("ORDERING: the concurrency check precedes the no-change comparison",
    mutation.indexOf("stale_state") < mutation.indexOf("no_change"));
  claim("the mutation writes branch_specific_status and no other column",
    /update public\.branch_menu_items as item\n  set branch_specific_status = p_next_status\n/.test(mutation)
    && !/set [^\n]*(sold_out|availability|price|branch_specific_status_version)/.test(mutation));
  claim("the result vocabulary is closed",
    D1_MUTATION_ERRORS.every((code) => mutation.includes(`'${code}'`)));
  claim("the success result is explicitly marked 'applied'",
    mutation.includes("'state', 'applied'"));
  claim("no raw PostgreSQL condition can reach a caller",
    !/raise exception/.test(preview) && !/raise exception/.test(mutation));

  // --- ACL ordering and ownership ------------------------------------------------------------------
  claim("privileges are settled BEFORE ownership moves to the sealed role",
    bare.indexOf(`grant execute on function ${D1_PREVIEW}`)
      < bare.indexOf(`alter function ${D1_PREVIEW}(text, text, text)\n  owner to`));
  claim("PUBLIC and every client role are revoked from both RPCs",
    count("from public, anon, authenticated, authenticator, service_role;") === 4);
  claim("only authenticated is granted execute",
    count("  to authenticated;") === 2
    && !/grant execute[^;]*to (anon|service_role|authenticator)/.test(bare));
  claim("both RPCs are owned by this round's sealed role",
    count(`  owner to ${D1_ROLE};`) === 2);

  // --- fail-closed epilogue -------------------------------------------------------------------------
  const epilogue = bare.slice(bare.lastIndexOf("do $$"));
  const epilogueRelations = [...epilogue.matchAll(/\b(?:from|join)\s+([a-z_]+\.[a-z_]+)/g)].map((m) => m[1]);
  claim("the closing assertions exist and read pg_catalog relations only",
    epilogue.includes("RA-2D-P1: the tenant policies are not RESTRICTIVE")
    && epilogueRelations.length >= 6
    && epilogueRelations.every((relation) => relation.startsWith("pg_catalog.")),
    { epilogueRelations });
  claim("the epilogue proves the tenant policies are RESTRICTIVE",
    has("policy.polpermissive = false") && has("the tenant policies are not RESTRICTIVE"));
  claim("the epilogue proves FORCE row level security was restored",
    has("the seed suspension did not restore FORCE row level security"));
  claim("the epilogue proves this writer cannot reach a predecessor's columns",
    has("the visibility writer can write a column it must never write"));
  claim("the epilogue proves no predecessor was widened to branch_specific_status",
    has("a frozen predecessor writer was widened to branch_specific_status"));
  claim("the epilogue proves no client role gained the sealed role or the table",
    has("a client role holds membership of the visibility writer")
    && has("a client role gained direct table access to branch_menu_items"));
  claim("the epilogue proves branch_specific_status carries no new CHECK beyond the pre-existing enum",
    has("an unexpected constraint on branch_specific_status was added"));
  claim("every epilogue failure raises rather than warns",
    count("raise exception 'RA-2D-P1:") >= 8 && !/raise warning/.test(bare));

  return claims;
}
