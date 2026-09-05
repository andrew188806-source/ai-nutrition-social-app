// RA-2C-P1 successor manifest and shared contract. Every value here is an exact pin: nothing is a
// prefix, a suffix or a pattern. Every claim is what a specific mutation is designed to break.
//
// SCOPE. This round governs one thing: the listed menu price of a specific menu item at a specific
// restaurant branch, in whole New Taiwan Dollars. It has nothing to do with TastKind subscription
// pricing, Restaurant plan tiers, add-ons, crowdfunding, early-bird or founder pricing, or any
// future billing, payment or entitlement product. Those belong to a later phase and are not evidence
// for anything in this file.

import fs from "node:fs";
import path from "node:path";

import {
  RA2AP1_GOVERNED_ROLES, RA2AP1_SEALED_ROLE
} from "./restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs";
import { RA1CR1_GOVERNED_ROLES } from "./platform-admin-ra-1c-r1-successor-manifest.mjs";

export const C1_BASELINE = "da0331f80594bbc30d4b9ed578081ed0b3591d22";
export const C1_ORIGIN_MAIN = "da0331f80594bbc30d4b9ed578081ed0b3591d22";
export const C1_SUBJECT = "Add governed Restaurant Owner price authority";
export const C1_BASELINE_MIGRATION_COUNT = 96;
export const C1_PROJECT_REF = "msbgnnoorsoefuiwluye";
export const C1_PROJECT_NAME = "tastkind-development";

export const C1_MIGRATION =
  "supabase/migrations/20260905020000_restaurant_owner_branch_menu_item_price_authority.sql";
export const C1_MIGRATION_SHA256 =
  "2994111d807fd28ea5c4081a6410c8dad1a3e228ef0bf53e7e89beb5011fd4d1";

/** RA-2A and RA-2B are frozen evidence. All three migrations must stay byte-identical. */
export const C1_FROZEN_MIGRATIONS = Object.freeze([
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
  })
]);

export const C1_CLIENT_ROLES = Object.freeze(["anon", "authenticated", "authenticator", "service_role"]);

/** This round's role. Deliberately neither predecessor writer. */
export const C1_ROLE = "restaurant_owner_branch_menu_item_price_write_authority";
/** The frozen predecessor writers, which must not gain a single new privilege. */
export const C1_FROZEN_SOLD_OUT_ROLE = RA2AP1_SEALED_ROLE;
export const C1_FROZEN_AVAILABILITY_ROLE =
  "restaurant_owner_branch_menu_item_availability_write_authority";

/**
 * SEALED ROLE SUCCESSOR MANIFEST.
 *
 * The chain of explicit governed inventories in this repository is RA-1C-R1 (17 roles) extended by
 * RA-2A-P1 to 18. RA-2B-P1 created its sealed writer but did NOT publish a governed-role manifest of
 * its own — it pinned only its own role name — so the last explicit inventory omits a role that
 * genuinely exists in the migrations. That is an inherited gap, verified against the repository
 * rather than assumed: `discoverRepositoryRoleDefinitions()` finds 22 CREATE ROLE definitions, and
 * removing the three Restaurant Owner writers leaves exactly the 19 that RA-1C-R1 adjudicated.
 *
 * This manifest therefore closes RA-2B's gap and adds exactly one role of its own. RA-2C's own
 * successor addition is the price writer and nothing else; the availability writer is carried in
 * because it was already governed in substance, not because this round created it.
 */
export const C1_GOVERNED_ROLES = Object.freeze([
  ...RA2AP1_GOVERNED_ROLES,
  Object.freeze({
    role: C1_FROZEN_AVAILABILITY_ROLE,
    migration: "supabase/migrations/20260905010000_restaurant_owner_branch_menu_item_availability_authority.sql"
  }),
  Object.freeze({ role: C1_ROLE, migration: C1_MIGRATION })
].sort((a, b) => a.role.localeCompare(b.role)));

/** Evidence for the counts above, so a mutation cannot quietly redefine what "extends by one" means. */
export const C1_INVENTORY = Object.freeze({
  ra1cr1Governed: RA1CR1_GOVERNED_ROLES.length,
  ra2ap1Governed: RA2AP1_GOVERNED_ROLES.length,
  ra2bUnmanifestedRoles: 1,
  ra2cSuccessorRoles: 1,
  governedTotal: 20,
  repositoryRoleDefinitions: 22,
  ownerWriterDefinitions: 3,
  ra1cr1AdjudicatedRemainder: 19
});

/** The three Restaurant Owner writers, each pinned to the migration that creates it. */
export const C1_OWNER_WRITERS = Object.freeze([
  Object.freeze({ role: C1_FROZEN_SOLD_OUT_ROLE, migration: C1_FROZEN_MIGRATIONS[0].path }),
  Object.freeze({ role: C1_FROZEN_AVAILABILITY_ROLE, migration: C1_FROZEN_MIGRATIONS[2].path }),
  Object.freeze({ role: C1_ROLE, migration: C1_MIGRATION })
]);

export const C1_PERMISSION_KEY = "branch_menu_item.price.write";
export const C1_PERMISSION_SCOPE = "restaurant";
export const C1_PERMISSION_ROLE = "owner";
export const C1_NON_PERMITTED_ROLES = Object.freeze(["manager", "staff"]);
export const C1_LEGACY_PERMISSION_KEYS = Object.freeze([
  "access_context.read", "restaurant.read", "branch.read", "menu.read", "nutrition.read",
  "branch_menu_item.sold_out.write", "branch_menu_item.availability.write"
]);

/**
 * THE CANONICAL PRICE CONTRACT. Whole New Taiwan Dollars, 1 through 999999 inclusive.
 * Zero is NOT canonical: it does not mean free, unknown, unpublished or market price, and a later
 * product decision needing any of those must give them their own semantics rather than overload
 * this column. Fractional amounts are refused rather than rounded.
 */
export const C1_MIN_PRICE = 1;
export const C1_MAX_PRICE = 999999;
export const C1_NEXT_PRICE_PATTERN = "^[1-9][0-9]{0,5}$";
export const C1_EXPECTED_PRICE_PATTERN = "^(0|[1-9][0-9]{0,7})(\\.[0-9]{1,2})?$";
export const C1_CURRENCY = "TWD";

/**
 * LEGACY COMPATIBILITY, the governing design constraint of this round. Development holds a
 * branch-menu row priced 0.00 that predates the canonical contract. A table CHECK on price would
 * make EVERY future write to that row fail, including RA-2A's sold-out mutation and RA-2B's
 * availability mutation, which never touch price. Canonical enforcement is therefore change-scoped:
 * it fires only when OLD.price IS DISTINCT FROM NEW.price.
 */
export const C1_CHANGE_SCOPED_GUARD = "new.price is distinct from old.price";
export const C1_FORBIDS_TABLE_CHECK_ON_PRICE = true;
export const C1_LEGACY_PRICE = "0.00";

export const C1_VERSION_COLUMN = "price_version";
export const C1_TRIGGER = "branch_menu_items_price_version_maintain";
export const C1_TRIGGER_FUNCTION = "restaurant_internal.branch_menu_item_price_version_maintain";
export const C1_AUDIT = "restaurant_internal.branch_menu_item_price_audit_log";
export const C1_PRIVATE_SCHEMA = "restaurant_internal";
export const C1_TARGET_TABLE = "public.branch_menu_items";

export const C1_PREVIEW = "public.restaurant_owner_preview_branch_menu_item_price_v1";
export const C1_MUTATION = "public.restaurant_owner_set_branch_menu_item_price_v1";
export const C1_PREVIEW_SIGNATURE =
  "public.restaurant_owner_preview_branch_menu_item_price_v1(text, text, text)";
export const C1_MUTATION_SIGNATURE =
  "public.restaurant_owner_set_branch_menu_item_price_v1(text, text, text, bigint)";
export const C1_PREVIEW_PARAMETERS = Object.freeze([
  "p_restaurant_id", "p_branch_id", "p_branch_menu_item_id"
]);
export const C1_MUTATION_PARAMETERS = Object.freeze([
  "p_branch_menu_item_id", "p_expected_price", "p_next_price", "p_expected_version"
]);

/** The two RESTRICTIVE tenant policies and the two permissive visibility policies. */
export const C1_RESTRICTIVE_POLICIES = Object.freeze([
  "branch_menu_items_owner_price_tenant_select",
  "branch_menu_items_owner_price_tenant_update"
]);
export const C1_PERMISSIVE_POLICIES = Object.freeze([
  "branch_menu_items_owner_price_select",
  "branch_menu_items_owner_price_update"
]);

/** The only column this authority may ever write. */
export const C1_WRITABLE_COLUMNS = Object.freeze(["price"]);
export const C1_UNWRITABLE_COLUMNS = Object.freeze([
  "id", "restaurant_id", "branch_id", "menu_item_id", "price_version", "sold_out",
  "sold_out_version", "availability", "availability_version", "branch_specific_name",
  "branch_specific_description", "branch_specific_status"
]);

export const C1_PREVIEW_FIELDS = Object.freeze([
  "ok", "state", "branchMenuItemId", "branchId", "menuItemId", "price", "priceVersion"
]);
export const C1_PREVIEW_ERRORS = Object.freeze([
  "unauthenticated", "permission_denied", "target_not_found", "invalid_request"
]);
export const C1_MUTATION_ERRORS = Object.freeze([
  "unauthenticated", "permission_denied", "target_not_found", "stale_state", "no_change",
  "invalid_request"
]);
export const C1_AUDIT_COLUMNS = Object.freeze([
  "id", "actor_auth_user_id", "membership_id", "restaurant_id", "branch_id", "branch_menu_item_id",
  "menu_item_id", "previous_price", "next_price", "previous_price_version", "next_price_version",
  "created_at"
]);

/**
 * VALIDATION ORDER. Canonical validation of the destination must precede the no-change comparison,
 * so an owner sitting on a legacy 0.00 who submits "0" receives invalid_request rather than
 * no_change. Reversing these two steps is a real behavioural regression and is mutation-tested.
 */
export const C1_VALIDATION_ORDER = Object.freeze([
  "authentication", "canonical_next_price", "permission", "tenant_target",
  "expected_price_and_version", "no_change", "update"
]);

/** Development pins. No safe positive Development price fixture exists yet; see the round report. */
export const C1_FORBIDDEN_TARGETS = Object.freeze([
  "dev-bmi-chicken-nanjing", "dev-bmi-salmon-nanjing", "dev-bmi-tofu-xinyi", "dev-bmi-draft-xinyi"
]);
export const C1_FORBIDDEN_BRANCHES = Object.freeze(["dev-branch-xinyi", "dev-branch-nanjing"]);
export const C1_KNOWN_LEGACY_TARGET = "dev-bmi-b-main";

export const C1_PACKAGE_KEYS = Object.freeze([
  "test:restaurant-owner-price-ra-2c-p1",
  "test:restaurant-owner-price-ra-2c-p1-smoke",
  "test:restaurant-owner-price-ra-2c-p1-mutations",
  "test:restaurant-owner-price-ra-2c-p1-postgres"
]);

export const C1_PATHS = Object.freeze([
  "docs/restaurant-owner-price-ra-2c-p1.md",
  "package.json",
  "scripts/restaurant-owner-price-ra-2c-p1-contract.mjs",
  "scripts/restaurant-owner-price-ra-2c-p1-guard.mjs",
  "scripts/restaurant-owner-price-ra-2c-p1-mutations.mjs",
  "scripts/restaurant-owner-price-ra-2c-p1-postgres-apply.mjs",
  "scripts/restaurant-owner-price-ra-2c-p1-smoke.mjs",
  C1_MIGRATION
].sort());

/** Predecessor files this round must leave byte-identical. */
export const C1_FROZEN_PATHS = Object.freeze([
  "scripts/platform-admin-ra-1c-r1-successor-manifest.mjs",
  "scripts/platform-admin-ra-1c-r1-contract.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs",
  "scripts/restaurant-owner-availability-ra-2b-p1-contract.mjs",
  ...C1_FROZEN_MIGRATIONS.map((item) => item.path)
]);

// -------------------------------------------------------------------------------------------------
// Source reading. `core.autocrlf` is true in this checkout and there is no `.gitattributes`, so the
// working tree can hold CRLF for a file committed with LF. Every hash and every claim below is
// computed on newline-normalized text; comparing raw bytes would make the pinned digest depend on
// how the file happened to be checked out.
// -------------------------------------------------------------------------------------------------
export const readNormalized = (root, file) =>
  fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
export const readMigrationSource = (root = process.cwd()) => readNormalized(root, C1_MIGRATION);

const stripComments = (text) => text.replace(/^\s*--.*$/gm, "");

/** Extract one `create function <name>(...) ... $$ body $$;` block, comments removed. */
function fnBody(sql, name) {
  const start = sql.indexOf(`create function ${name}`);
  if (start < 0) return "";
  const open = sql.indexOf("as $$", start);
  if (open < 0) return "";
  const close = sql.indexOf("$$;", open + 5);
  if (close < 0) return "";
  return stripComments(sql.slice(open + 5, close));
}

/**
 * THE CLAIMS. Each is a single fact about the frozen migration source. The guard asserts all of
 * them; the mutation suite corrupts the source one edit at a time and requires each corruption to
 * be caught by at least one claim. A claim no mutant can break is decoration, not a test.
 */
export function auditMigrationSource(source) {
  const claims = [];
  const claim = (name, pass, detail) => claims.push({ name, pass: Boolean(pass), ...(pass ? {} : { detail }) });
  const sql = source.replace(/\r\n/g, "\n");
  const bare = stripComments(sql);
  const preview = fnBody(bare, C1_PREVIEW);
  const mutation = fnBody(bare, C1_MUTATION);
  const trigger = fnBody(bare, `${C1_TRIGGER_FUNCTION}()`);
  const has = (needle) => bare.includes(needle);
  const count = (needle) => bare.split(needle).length - 1;

  // --- transaction and permission vocabulary -----------------------------------------------------
  claim("the migration is a single transaction", /^\s*begin;/m.test(bare) && /^\s*commit;\s*$/m.test(bare));
  // Read the CHECK clause itself, not the whole file: every one of these keys also appears in the
  // seed verification, so a file-wide `includes` would still find a key deleted from the constraint.
  const checkClause = /add constraint role_permissions_permission_key_check\s*\n\s*check \(permission_key in \(([\s\S]*?)\)\);/
    .exec(bare)?.[1] ?? "";
  const checkKeys = checkClause.split(",").map((k) => k.trim()).filter(Boolean);
  claim("the permission CHECK is widened by exactly this round's key, preserving every predecessor key",
    checkKeys.length === C1_LEGACY_PERMISSION_KEYS.length + 1
    && checkKeys.includes(`'${C1_PERMISSION_KEY}'`)
    && C1_LEGACY_PERMISSION_KEYS.every((key) => checkKeys.includes(`'${key}'`)),
    { checkKeys });
  claim("the permission is seeded for owner at restaurant scope only",
    has(`select role.id, '${C1_PERMISSION_KEY}', '${C1_PERMISSION_SCOPE}'`)
    && has("where role.role_key = 'owner'"));
  claim("neither manager nor staff is seeded",
    C1_NON_PERMITTED_ROLES.every((role) => !new RegExp(`role_key\\s*=\\s*'${role}'`).test(bare)));
  claim("the seed suspends FORCE row level security on both authority tables",
    has("alter table public.role_permissions no force row level security")
    && has("alter table public.restaurant_roles no force row level security"));
  claim("the seed restores FORCE row level security on both authority tables",
    has("alter table public.role_permissions force row level security")
    && has("alter table public.restaurant_roles force row level security"));
  claim("the seed is verified INSIDE the suspension window, not after it",
    bare.indexOf("expected exactly one price permission row")
      < bare.indexOf("alter table public.role_permissions force row level security"));
  claim("the seed verification fails closed on a wrong row count",
    has("raise exception 'RA-2C-P1: expected exactly one price permission row"));
  claim("the seed verification refuses to disturb a predecessor permission row",
    has("a frozen predecessor permission row was disturbed"));

  // --- the change-scoped canonical guard ----------------------------------------------------------
  claim("the version column is added as bigint not null default 0",
    has(`add column ${C1_VERSION_COLUMN} bigint not null default 0`));
  claim("the trigger fires before insert or update, for each row",
    has(`create trigger ${C1_TRIGGER}`) && has("before insert or update on public.branch_menu_items")
    && has("for each row execute function"));
  claim("canonical enforcement is change-scoped, which is what keeps legacy rows writable",
    trigger.includes(C1_CHANGE_SCOPED_GUARD));
  claim("the version advances only inside the change-scoped branch",
    trigger.includes(`new.${C1_VERSION_COLUMN} := old.${C1_VERSION_COLUMN} + 1`)
    && trigger.includes(`new.${C1_VERSION_COLUMN} := old.${C1_VERSION_COLUMN};`));
  claim("the trigger pins the canonical floor and ceiling",
    trigger.includes(`new.price < ${C1_MIN_PRICE}::pg_catalog.numeric`)
    && trigger.includes(`new.price > ${C1_MAX_PRICE}::pg_catalog.numeric`));
  claim("the trigger refuses a fractional price rather than rounding it",
    trigger.includes("new.price <> pg_catalog.trunc(new.price)")
    && !/round\s*\(/i.test(trigger));
  claim("an INSERT is not judged against the canonical contract",
    trigger.includes("if tg_op = 'INSERT'") && trigger.includes(`new.${C1_VERSION_COLUMN} := 0;`));
  // A table CHECK on price would be evaluated on EVERY write to the row, so it would break RA-2A's
  // and RA-2B's mutations on the legacy zero-priced row. Only the version counter may be constrained.
  const targetConstraints = [...bare.matchAll(
    /alter table public\.branch_menu_items\s*\n\s*add constraint\s+\w+\s*\n?\s*check\s*\(([\s\S]*?)\);/g
  )].map((m) => m[1]);
  claim("NO table CHECK constrains price itself, only the version counter",
    targetConstraints.length === 1
    && !/\bprice\b/.test(targetConstraints[0].replace(/price_version/g, "counter")),
    targetConstraints);
  claim("the version column carries its own non-negative constraint",
    has(`check (${C1_VERSION_COLUMN} >= 0)`));
  claim("the trigger function pins an empty search_path",
    /create function restaurant_internal\.branch_menu_item_price_version_maintain\(\)[\s\S]{0,200}set search_path = ''/.test(bare));

  // --- the sealed role ----------------------------------------------------------------------------
  claim("the round creates exactly one role, and it is sealed in every attribute",
    count("create role ") === 1 && has(`create role ${C1_ROLE}\n  nologin\n  noinherit\n  nobypassrls`));
  claim("neither frozen predecessor role is altered by this migration",
    !new RegExp(`alter role ${C1_FROZEN_SOLD_OUT_ROLE}`).test(bare)
    && !new RegExp(`alter role ${C1_FROZEN_AVAILABILITY_ROLE}`).test(bare)
    && !new RegExp(`grant[^;]*to ${C1_FROZEN_SOLD_OUT_ROLE}`).test(bare)
    && !new RegExp(`grant[^;]*to ${C1_FROZEN_AVAILABILITY_ROLE}`).test(bare));
  claim("the transient membership grants SET but never ADMIN or INHERIT",
    has(`grant ${C1_ROLE} to postgres\n  with admin false, inherit false, set true;`));
  claim("the transient membership is released before COMMIT",
    has(`revoke ${C1_ROLE}\n  from postgres granted by postgres;`)
    && bare.indexOf(`revoke ${C1_ROLE}\n  from postgres`) < bare.lastIndexOf("commit;"));
  claim("the transient CREATE on schema public is released before COMMIT",
    has(`revoke create on schema public\n  from ${C1_ROLE};`));
  claim("no client role is ever granted membership of the sealed role",
    C1_CLIENT_ROLES.every((role) => !new RegExp(`grant ${C1_ROLE} to ${role}\\b`).test(bare)));

  // --- least privilege -----------------------------------------------------------------------------
  claim("the only column UPDATE granted is price",
    has(`grant update (price)\n  on table public.branch_menu_items\n  to ${C1_ROLE};`)
    && count("grant update (") === 1);
  claim("no broad table UPDATE is granted anywhere in this migration",
    !/grant\s+[^;]*\bupdate\b\s+on\s+table\s+public\.branch_menu_items\s+to/.test(
      bare.replace(/grant update \(price\)[\s\S]*?;/g, "")));
  claim("no unwritable column is named in any UPDATE grant",
    C1_UNWRITABLE_COLUMNS.every((column) => !new RegExp(`grant update \\([^)]*\\b${column}\\b`).test(bare)));
  claim("the audit relation grants the writer select and insert only",
    has(`grant select, insert on table ${C1_AUDIT}\n  to ${C1_ROLE};`));
  claim("no client role holds any privilege on the audit relation",
    has(`revoke all on table ${C1_AUDIT}\n  from public, anon, authenticated, authenticator, service_role;`));

  // --- audit ---------------------------------------------------------------------------------------
  claim("the audit relation declares every approved column and nothing else",
    C1_AUDIT_COLUMNS.every((column) => new RegExp(`\\n  ${column} `).test(bare)));
  claim("the audit relation records menu_item_id", has("\n  menu_item_id text not null,"));
  claim("the audit relation runs under FORCE row level security",
    has(`alter table ${C1_AUDIT}\n  force row level security;`));
  claim("the audit relation has no UPDATE or DELETE policy for any role",
    !/create policy [^;]*for update[^;]*branch_menu_item_price_audit_log/.test(bare)
    && count("branch_menu_item_price_audit_log_writer_") === 2);
  claim("only real transitions are auditable",
    has("check (previous_price <> next_price)"));
  claim("the audited destination is always canonical, even from a legacy origin",
    has(`check (next_price >= ${C1_MIN_PRICE} and next_price <= ${C1_MAX_PRICE} and next_price = pg_catalog.trunc(next_price))`));
  claim("the audit version advance is exactly one",
    has("check (next_price_version = previous_price_version + 1)"));
  claim("the actor is server-derived, never a parameter",
    mutation.includes("insert into restaurant_internal.branch_menu_item_price_audit_log")
    && mutation.includes("values (v_actor,")
    && !/p_actor|p_auth_user|p_membership|p_owner/.test(bare));

  // --- row level security ----------------------------------------------------------------------------
  claim("both tenant policies are declared RESTRICTIVE",
    C1_RESTRICTIVE_POLICIES.every((policy) =>
      new RegExp(`create policy ${policy}\\n  on public\\.branch_menu_items\\n  as restrictive`).test(bare)));
  claim("both permissive visibility policies exist and are not restrictive",
    C1_PERMISSIVE_POLICIES.every((policy) =>
      has(`create policy ${policy}`) && !new RegExp(`create policy ${policy}[\\s\\S]{0,80}as restrictive`).test(bare)));
  claim("the restrictive UPDATE policy carries both USING and WITH CHECK",
    new RegExp(`create policy ${C1_RESTRICTIVE_POLICIES[1]}[\\s\\S]*?with check \\(`).test(bare));
  // Exact counts, not floors. A floor lets a mutant delete one predicate and still clear the bar;
  // these are the three policy predicates plus the two guards inside each of the two RPCs.
  claim("every tenant policy and both RPCs require the owner role key",
    count("role.role_key = 'owner'") === 10, { observed: count("role.role_key = 'owner'") });
  claim("every tenant policy and both RPCs require this round's exact permission at restaurant scope",
    count(`permission.permission_key = '${C1_PERMISSION_KEY}'`) === 9
    && count(`permission.permission_scope = '${C1_PERMISSION_SCOPE}'`) === 9,
    { key: count(`permission.permission_key = '${C1_PERMISSION_KEY}'`),
      scope: count(`permission.permission_scope = '${C1_PERMISSION_SCOPE}'`) });
  claim("every authority chain also requires an enabled caller and an active membership",
    count("caller.login_status = 'enabled'") === 7 && count("membership.status = 'active'") === 7,
    { login: count("caller.login_status = 'enabled'"), membership: count("membership.status = 'active'") });
  claim("the permissive UPDATE policy still constrains the written value",
    new RegExp(`create policy ${C1_PERMISSIVE_POLICIES[1]}[\\s\\S]*?with check \\(price >= ${C1_MIN_PRICE} and price <= ${C1_MAX_PRICE}`).test(bare));

  // --- the RPCs ----------------------------------------------------------------------------------------
  claim("both RPCs are SECURITY DEFINER with an empty search_path and row_security on",
    count("security definer") === 2 && count("set search_path = ''") === 3
    && count("set row_security = 'on'") === 2);
  claim("the preview is STABLE, so PostgreSQL itself refuses a write inside it",
    /create function public\.restaurant_owner_preview_branch_menu_item_price_v1[\s\S]*?\nstable\n/.test(bare));
  claim("the mutation is VOLATILE", /create function public\.restaurant_owner_set_branch_menu_item_price_v1[\s\S]*?\nvolatile\n/.test(bare));
  claim("neither RPC takes a caller-supplied actor",
    !/p_actor|p_auth_user_id|p_user_id|p_membership_id|p_owner_id/.test(bare));
  claim("the preview declares exactly its approved parameters",
    C1_PREVIEW_PARAMETERS.every((p) => new RegExp(`${p} text`).test(bare)));
  claim("the mutation declares exactly its approved parameters",
    has("p_branch_menu_item_id text,") && has("p_expected_price text,")
    && has("p_next_price text,") && has("p_expected_version bigint"));
  // The TARGET lookup specifically must be tenant-scoped. Both functions also carry a separate
  // permission-exists block that joins memberships, so checking the function body as a whole would
  // still pass with the target query left wide open — which is the RA-2A-P1-R1 defect exactly.
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
    preview.includes("caller.auth_user_id = v_actor")
    && mutation.includes("caller.auth_user_id = v_actor")
    && count("request.jwt.claim.sub") === 2 + C1_RESTRICTIVE_POLICIES.length + 1);
  claim("a cross-tenant target is indistinguishable from a nonexistent one",
    count("'errorCode', 'target_not_found'") === 2);
  claim("the preview projects price as lossless decimal text, never a number",
    preview.includes("'price', v_target.price::text")
    && preview.includes("'priceVersion', v_target.price_version::text"));
  claim("the preview projects exactly the approved fields",
    C1_PREVIEW_FIELDS.every((field) => preview.includes(`'${field}'`)));
  claim("the mutation validates the destination lexically before touching any row",
    mutation.indexOf(C1_NEXT_PRICE_PATTERN) < mutation.indexOf("from public.branch_menu_items as item"));
  claim("ORDERING: canonical validation precedes the no-change comparison",
    mutation.indexOf(C1_NEXT_PRICE_PATTERN) < mutation.indexOf("'no_change'"));
  claim("the canonical destination pattern is anchored at both ends",
    mutation.includes(`p_next_price !~ '${C1_NEXT_PRICE_PATTERN}'`));
  claim("the expected price accepts any exact value the column can hold, including a legacy zero",
    mutation.includes(`p_expected_price !~ '${C1_EXPECTED_PRICE_PATTERN.replace(/\\\\/g, "\\")}'`));
  claim("prices are compared as numeric, never as float, double precision or real",
    mutation.includes("::pg_catalog.numeric") && !/::(float|double precision|real)/.test(bare));
  claim("both concurrency facts are checked together",
    mutation.includes("v_target.price <> v_expected")
    && mutation.includes(`v_target.price_version <> p_expected_version`));
  // Presence first: a bare index comparison passes when the lock is DELETED, because indexOf
  // returns -1 and -1 is less than everything.
  claim("the target row is locked, and locked before the precondition is judged",
    mutation.includes("for update of item")
    && mutation.indexOf("for update of item") < mutation.indexOf("v_target.price <> v_expected"));
  claim("a negative expected version is refused before any row is read",
    mutation.includes("or p_expected_version < 0")
    && mutation.indexOf("or p_expected_version < 0") < mutation.indexOf("from public.branch_menu_items as item"));
  claim("the mutation writes price and no other column",
    /update public\.branch_menu_items as item\n  set price = v_next\n/.test(mutation)
    && !/set [^\n]*(sold_out|availability|price_version)/.test(mutation));
  claim("the result vocabulary is closed",
    C1_MUTATION_ERRORS.every((code) => mutation.includes(`'${code}'`)));
  claim("no raw PostgreSQL condition can reach a caller",
    !/raise exception/.test(preview) && !/raise exception/.test(mutation));

  // --- ACL ordering and ownership ------------------------------------------------------------------
  claim("privileges are settled BEFORE ownership moves to the sealed role",
    bare.indexOf(`grant execute on function ${C1_PREVIEW}`)
      < bare.indexOf(`alter function ${C1_PREVIEW}(text, text, text)\n  owner to`));
  claim("PUBLIC and every client role are revoked from both RPCs",
    count("from public, anon, authenticated, authenticator, service_role;") === 4);
  claim("only authenticated is granted execute",
    count("  to authenticated;") === 2
    && !/grant execute[^;]*to (anon|service_role|authenticator)/.test(bare));
  claim("both RPCs are owned by this round's sealed role",
    count(`  owner to ${C1_ROLE};`) === 2);

  // --- fail-closed epilogue -------------------------------------------------------------------------
  // Extract the epilogue and check every relation it reads. The Restaurant authority tables run
  // under FORCE row level security with subject-scoped policies, so a migration principal counts
  // zero rows in them for reasons unrelated to whether this round succeeded: an epilogue that read
  // them would pass by accident, or fail by accident, but never actually prove anything.
  const epilogue = bare.slice(bare.lastIndexOf("do $$"));
  const epilogueRelations = [...epilogue.matchAll(/\b(?:from|join)\s+([a-z_]+\.[a-z_]+)/g)].map((m) => m[1]);
  claim("the closing assertions exist and read pg_catalog relations only",
    epilogue.includes("RA-2C-P1: the tenant policies are not RESTRICTIVE")
    && epilogueRelations.length >= 6
    && epilogueRelations.every((relation) => relation.startsWith("pg_catalog.")),
    { epilogueRelations });
  claim("the epilogue proves the tenant policies are RESTRICTIVE",
    has("policy.polpermissive = false") && has("the tenant policies are not RESTRICTIVE"));
  claim("the epilogue proves FORCE row level security was restored",
    has("the seed suspension did not restore FORCE row level security"));
  claim("the epilogue proves this writer cannot reach a predecessor's columns",
    has("the price writer can write a column it must never write"));
  claim("the epilogue proves neither predecessor was widened to price",
    has("a frozen predecessor writer was widened to price"));
  claim("the epilogue proves no client role gained the sealed role or the table",
    has("a client role holds membership of the price writer")
    && has("a client role gained direct table access to branch_menu_items"));
  claim("the epilogue proves no table CHECK constrains price",
    has("a table CHECK on price would break legacy rows"));
  claim("every epilogue failure raises rather than warns",
    count("raise exception 'RA-2C-P1:") >= 11 && !/raise warning/.test(bare));

  return claims;
}
