// RA-2B-P1 successor manifest and shared contract. Every value is an exact pin, and every claim
// below is what a specific mutation is designed to break.

import fs from "node:fs";
import path from "node:path";

export const B1_BASELINE = "bbe60548ea8e65abce22b4ed330980c4a856d3bb";
export const B1_ORIGIN_MAIN = "bbe60548ea8e65abce22b4ed330980c4a856d3bb";
export const B1_SUBJECT = "Add governed Restaurant Owner availability authority";
export const B1_BASELINE_MIGRATION_COUNT = 95;
export const B1_PROJECT_REF = "msbgnnoorsoefuiwluye";
export const B1_PROJECT_NAME = "tastkind-development";

export const B1_MIGRATION =
  "supabase/migrations/20260905010000_restaurant_owner_branch_menu_item_availability_authority.sql";
export const B1_MIGRATION_SHA256 =
  "83522a06b01611c06a665eca66f2921b5d57cd9114973b257a3e374f203aac33";

/** RA-2A is frozen evidence. Both migrations must stay byte-identical to these hashes. */
export const B1_FROZEN_MIGRATIONS = Object.freeze([
  Object.freeze({
    path: "supabase/migrations/20260904030000_restaurant_owner_branch_menu_item_sold_out_authority.sql",
    sha256: "b28a496dda43383e96d977c8e54ef54e6619f77bb2a1c3d949fe422bf36ecc01"
  }),
  Object.freeze({
    path: "supabase/migrations/20260904040000_restaurant_owner_branch_menu_item_sold_out_preview.sql",
    sha256: "84cf0285a1087a2386fcc3e70d8f75d3d6b28023c843361e42fcd37ab0ef7376"
  })
]);

export const B1_CLIENT_ROLES = Object.freeze(["anon", "authenticated", "authenticator", "service_role"]);

/** This round's role. Deliberately NOT the sold-out writer. */
export const B1_ROLE = "restaurant_owner_branch_menu_item_availability_write_authority";
/** RA-2A's frozen role, which must not gain a single new privilege. */
export const B1_FROZEN_ROLE = "restaurant_owner_branch_menu_item_write_authority";

export const B1_PERMISSION_KEY = "branch_menu_item.availability.write";
export const B1_PERMISSION_SCOPE = "restaurant";
export const B1_PERMISSION_ROLE = "owner";
export const B1_NON_PERMITTED_ROLES = Object.freeze(["manager", "staff"]);
export const B1_LEGACY_PERMISSION_KEYS = Object.freeze([
  "access_context.read", "restaurant.read", "branch.read", "menu.read", "nutrition.read",
  "branch_menu_item.sold_out.write"
]);

export const B1_VOCABULARY = Object.freeze(["available", "limited", "unavailable"]);
export const B1_VERSION_COLUMN = "availability_version";
export const B1_TRIGGER = "branch_menu_items_availability_version_maintain";
export const B1_AUDIT = "restaurant_internal.branch_menu_item_availability_audit_log";

export const B1_PREVIEW = "public.restaurant_owner_preview_branch_menu_item_availability_v1";
export const B1_MUTATION = "public.restaurant_owner_set_branch_menu_item_availability_v1";
export const B1_PREVIEW_PARAMETERS = Object.freeze([
  "p_restaurant_id", "p_branch_id", "p_branch_menu_item_id"
]);
export const B1_MUTATION_PARAMETERS = Object.freeze([
  "p_branch_menu_item_id", "p_expected_availability", "p_next_availability", "p_expected_version"
]);

/** The two RESTRICTIVE tenant policies and the two permissive visibility policies. */
export const B1_RESTRICTIVE_POLICIES = Object.freeze([
  "branch_menu_items_owner_availability_tenant_select",
  "branch_menu_items_owner_availability_tenant_update"
]);
export const B1_PERMISSIVE_POLICIES = Object.freeze([
  "branch_menu_items_owner_availability_select",
  "branch_menu_items_owner_availability_update"
]);

/** Columns this authority must never be able to write. */
export const B1_UNWRITABLE_COLUMNS = Object.freeze([
  "id", "restaurant_id", "branch_id", "menu_item_id", "price", "sold_out", "sold_out_version",
  "availability_version", "branch_specific_name", "branch_specific_description",
  "branch_specific_status"
]);

export const B1_PREVIEW_FIELDS = Object.freeze([
  "ok", "state", "branchMenuItemId", "branchId", "menuItemId", "availability", "availabilityVersion"
]);
export const B1_PREVIEW_ERRORS = Object.freeze([
  "unauthenticated", "permission_denied", "target_not_found", "invalid_request"
]);
export const B1_MUTATION_ERRORS = Object.freeze([
  "unauthenticated", "permission_denied", "target_not_found", "stale_state", "no_change",
  "invalid_request"
]);
export const B1_AUDIT_COLUMNS = Object.freeze([
  "id", "actor_auth_user_id", "membership_id", "restaurant_id", "branch_id", "branch_menu_item_id",
  "previous_availability", "next_availability", "previous_availability_version",
  "next_availability_version", "created_at"
]);

/** Development acceptance pins. */
export const B1_TARGET = "dev-bmi-b-main";
export const B1_TARGET_RESTAURANT = "dev-restaurant-hidden";
export const B1_TARGET_BRANCH = "dev-branch-b-main";
export const B1_TARGET_MENU_ITEM = "dev-item-b-main";
export const B1_OWNER_AUTH_ID = "a8e24713-25a2-4ca0-9222-5f4e7165fdcf";
export const B1_EXPECTED_START_AVAILABILITY = "available";
export const B1_EXPECTED_FINAL_VERSION = "2";
export const B1_EXPECTED_AUDIT_ROWS = 2;
export const B1_FROZEN_SOLD_OUT_VERSION = "4";
export const B1_FORBIDDEN_TARGETS = Object.freeze([
  "dev-bmi-chicken-nanjing", "dev-bmi-salmon-nanjing", "dev-bmi-tofu-xinyi", "dev-bmi-draft-xinyi"
]);
export const B1_FORBIDDEN_BRANCHES = Object.freeze(["dev-branch-xinyi", "dev-branch-nanjing"]);

export const B1_PACKAGE_KEYS = Object.freeze([
  "test:restaurant-owner-availability-ra-2b-p1",
  "test:restaurant-owner-availability-ra-2b-p1-smoke",
  "test:restaurant-owner-availability-ra-2b-p1-mutations",
  "test:restaurant-owner-availability-ra-2b-p1-postgres",
  "test:restaurant-owner-availability-ra-2b-p1-development"
]);

export const B1_PATHS = Object.freeze([
  "docs/restaurant-owner-availability-ra-2b-p1.md",
  "package.json",
  "scripts/restaurant-owner-availability-ra-2b-p1-contract.mjs",
  "scripts/restaurant-owner-availability-ra-2b-p1-development-acceptance.mjs",
  "scripts/restaurant-owner-availability-ra-2b-p1-guard.mjs",
  "scripts/restaurant-owner-availability-ra-2b-p1-mutations.mjs",
  "scripts/restaurant-owner-availability-ra-2b-p1-postgres-apply.mjs",
  "scripts/restaurant-owner-availability-ra-2b-p1-smoke.mjs",
  B1_MIGRATION
].sort());

export const readNormalized = (root, file) =>
  fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
export const readMigrationSource = (root = process.cwd()) => readNormalized(root, B1_MIGRATION);

const stripComments = (text) => text.replace(/^\s*--.*$/gm, "");
function fnBody(sql, name) {
  const start = sql.indexOf(`create function ${name}(`);
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end);
}
const OWNER_CHAIN = (body, key) =>
  /role\.role_key = 'owner'/.test(body)
  && new RegExp(`permission\\.permission_key = '${key.replace(/\./g, "\\.")}'`).test(body)
  && /permission\.permission_scope = 'restaurant'/.test(body)
  && /caller\.login_status = 'enabled'/.test(body)
  && /membership\.status = 'active'/.test(body)
  && /role\.status = 'active'/.test(body);

/** Every behavioural claim RA-2B-P1 makes about its own migration text. */
export function auditMigrationSource(sql) {
  const preview = fnBody(sql, B1_PREVIEW);
  const mutation = fnBody(sql, B1_MUTATION);
  const trigger = fnBody(sql, `restaurant_internal.branch_menu_item_${B1_VERSION_COLUMN}_maintain`);
  const bare = stripComments(sql);
  const checks = [];
  const claim = (name, pass) => checks.push({ name, pass: Boolean(pass) });

  // ---------------------------------------------------------------- permission
  claim("the permission is seeded exactly once, for owner, at restaurant scope",
    (bare.match(/insert into public\.role_permissions/g) ?? []).length === 1
    && new RegExp(`where role\\.role_key = '${B1_PERMISSION_ROLE}'`).test(bare)
    && new RegExp(`'${B1_PERMISSION_KEY.replace(/\./g, "\\.")}', '${B1_PERMISSION_SCOPE}'`).test(bare));
  claim("manager and staff are never named as recipients",
    B1_NON_PERMITTED_ROLES.every((r) => !new RegExp(`'${r}'`).test(bare)));
  claim("the permission vocabulary widens by exactly one key and keeps every legacy key",
    (() => {
      const start = bare.indexOf("add constraint role_permissions_permission_key_check");
      const list = bare.slice(start, bare.indexOf("));", start));
      const keys = (list.match(/'[a-z_.]+'/g) ?? []).map((k) => k.slice(1, -1)).sort();
      return JSON.stringify(keys)
        === JSON.stringify([...B1_LEGACY_PERMISSION_KEYS, B1_PERMISSION_KEY].sort());
    })());
  claim("the permission scope vocabulary is not widened",
    !/role_permissions_permission_scope_check/.test(bare));
  claim("the FORCE-RLS seed suspension is bounded and restored in the same transaction",
    (bare.match(/no force row level security/g) ?? []).length === 2
    && bare.includes("alter table public.role_permissions force row level security")
    && bare.includes("alter table public.restaurant_roles force row level security")
    && bare.lastIndexOf("no force row level security")
      < bare.indexOf("alter table public.role_permissions force row level security"));
  claim("the seed is verified inside the suspension window",
    bare.indexOf("expected exactly one availability permission row")
      < bare.indexOf("alter table public.role_permissions force row level security"));
  claim("RA-2A's sold-out permission row is asserted to survive",
    /the frozen sold-out permission row was disturbed/.test(sql));

  // ---------------------------------------------------------------- version
  claim("the version column is a non-negative bigint defaulting to zero",
    new RegExp(`add column ${B1_VERSION_COLUMN} bigint not null default 0`).test(bare)
    && /branch_menu_items_availability_version_non_negative[\s\S]{0,90}>= 0/.test(bare));
  claim("a before insert-or-update row trigger maintains the version",
    new RegExp(`create trigger ${B1_TRIGGER}[\\s\\S]{0,160}before insert or update on public\\.branch_menu_items[\\s\\S]{0,80}for each row`).test(bare));
  claim("the trigger advances only when availability actually changes",
    /new\.availability is distinct from old\.availability/.test(trigger)
    && /old\.availability_version\s*\+/.test(trigger));
  claim("the trigger discards any caller-supplied version",
    new RegExp(`new\\.${B1_VERSION_COLUMN} :=`).test(trigger)
    && /tg_op = 'INSERT'[\s\S]{0,120}:= 0/.test(trigger));
  claim("the trigger pins a safe search_path", /set search_path = ''/.test(trigger));
  claim("sold_out_version is never reused as this operation's token",
    !/sold_out_version\s*:?=/.test(stripComments(preview + mutation + trigger)));

  // ---------------------------------------------------------------- sealed role
  claim("a NEW sealed role is created NOLOGIN, NOINHERIT, NOBYPASSRLS",
    new RegExp(`create role ${B1_ROLE}\\s+nologin\\s+noinherit\\s+nobypassrls`).test(bare)
    && (bare.match(/^create role /gm) ?? []).length === 1);
  claim("the sealed role requests no elevated attribute",
    !new RegExp(`create role ${B1_ROLE}[\\s\\S]{0,200}(superuser|createdb|createrole|replication|bypassrls;)`)
      .test(bare.replace(/nobypassrls/g, "")));
  claim("no client or runtime role is granted membership of the sealed role",
    B1_CLIENT_ROLES.every((r) => !new RegExp(`grant ${B1_ROLE} to ${r}`).test(bare)));
  claim("the transient sealed-role membership is released",
    new RegExp(`revoke ${B1_ROLE}\\s*\\n?\\s*from postgres granted by postgres`).test(bare));
  claim("the accepted control-plane creator row is not attacked",
    !/admin option/i.test(bare) && !/granted by supabase_admin/i.test(bare));

  // ---------------------------------------------------------------- independence from RA-2A
  claim("RA-2A's frozen writer receives no new grant of any kind",
    !new RegExp(`grant [^;]*to ${B1_FROZEN_ROLE}`).test(bare));
  claim("the migration asserts the frozen sold-out writer was not widened",
    /the frozen sold-out writer was widened to availability/.test(sql));
  claim("the migration asserts the availability writer cannot write sold_out or any version",
    /the availability writer can write a column it must never write/.test(sql));
  claim("RA-2A's audit relation is never written or altered by this round",
    !/branch_menu_item_sold_out_audit_log/.test(bare));

  // ---------------------------------------------------------------- column authority
  claim("the sealed role receives column UPDATE on availability and nothing else",
    new RegExp(`grant update \\(availability\\)\\s*\\n?\\s*on table public\\.branch_menu_items`).test(bare)
    && (bare.match(/grant update \([^)]*\)\s*\n?\s*on table public\.branch_menu_items/g) ?? []).length === 1);
  claim("no broad table UPDATE, INSERT or DELETE is granted on the target table",
    !/grant [^(]*update[^(]*on table public\.branch_menu_items/i
      .test(bare.replace(/grant update \([^)]*\)/g, ""))
    && !/grant[^;]*\b(insert|delete)\b[^;]*on table public\.branch_menu_items/i.test(bare));
  claim("no unwritable column appears in any UPDATE grant",
    B1_UNWRITABLE_COLUMNS.every((c) => !new RegExp(`grant update \\([^)]*\\b${c}\\b[^)]*\\)`).test(bare)));

  // ---------------------------------------------------------------- RESTRICTIVE policies
  claim("both tenant policies are declared AS RESTRICTIVE",
    B1_RESTRICTIVE_POLICIES.every((p) =>
      new RegExp(`create policy ${p}[\\s\\S]{0,120}as restrictive`).test(bare)));
  claim("a permissive visibility pair also exists, because restrictive policies alone grant nothing",
    B1_PERMISSIVE_POLICIES.every((p) => new RegExp(`create policy ${p}\\b`).test(bare))
    && B1_PERMISSIVE_POLICIES.every((p) =>
      !new RegExp(`create policy ${p}[\\s\\S]{0,120}as restrictive`).test(bare)));
  claim("the restrictive policies carry the tenant predicate",
    (bare.match(/membership\.restaurant_id = branch_menu_items\.restaurant_id/g) ?? []).length === 3);
  claim("the restrictive update policy's WITH CHECK carries the tenant predicate, not a constant",
    (() => {
      const start = bare.indexOf(`create policy ${B1_RESTRICTIVE_POLICIES[1]}`);
      const body = bare.slice(start, bare.indexOf("\n\n", start + 40));
      const withCheck = body.slice(body.indexOf("with check ("));
      return withCheck.includes("membership.restaurant_id = branch_menu_items.restaurant_id")
        && withCheck.includes("role.role_key = 'owner'")
        && withCheck.includes("caller.login_status = 'enabled'")
        && !/(true|false) (or|and) exists \(/.test(body)
        && !/(using|with check) \(\s*(true|false)[\s)]/.test(body);
    })());
  claim("the migration refuses to commit unless the tenant policies really are restrictive",
    /the tenant policies are not RESTRICTIVE/.test(sql)
    && /polpermissive = false/.test(bare));
  claim("the migration refuses to commit if the permissive pair is missing",
    /the permissive availability policies are missing/.test(sql));
  claim("no policy is created for a client or runtime role",
    B1_CLIENT_ROLES.every((r) => !new RegExp(`create policy[\\s\\S]{0,200}to ${r}\\b`).test(bare)));

  // ---------------------------------------------------------------- preview
  claim("the preview is STABLE and contains no write statement",
    /^stable$/m.test(preview)
    && !/\b(update|insert|delete|truncate|alter|drop)\s/i.test(
      stripComments(preview).replace(/'[^']*'/g, "''")));
  claim("the preview takes no row lock",
    !/for update|for share/i.test(stripComments(preview)));
  claim("the preview takes only the three selectors",
    B1_PREVIEW_PARAMETERS.every((p) => preview.includes(p))
    && !/p_(actor|owner|user|auth_user|membership|role|permission)[a-z_]*\s+(uuid|text)/.test(preview));
  claim("the preview derives the actor from verified claims and proves the owner chain",
    /request\.jwt\.claim\.sub/.test(preview) && OWNER_CHAIN(preview, B1_PERMISSION_KEY));
  claim("the preview joins the caller's membership rather than trusting row level security",
    /from public\.branch_menu_items as item[\s\S]{0,900}join public\.restaurant_memberships as membership[\s\S]{0,200}on membership\.restaurant_id = item\.restaurant_id/.test(preview)
    && /caller\.auth_user_id = v_actor/.test(preview));
  claim("the preview returns the version as text and only the approved fields",
    new RegExp(`'availabilityVersion', v_target\\.${B1_VERSION_COLUMN}::text`).test(preview)
    && B1_PREVIEW_FIELDS.every((f) => f === "ok" || preview.includes(`'${f}'`))
    && /'state', 'ready'/.test(preview));
  claim("the preview error vocabulary is exactly the four bounded codes",
    B1_PREVIEW_ERRORS.every((c) => preview.includes(`'${c}'`))
    && (preview.match(/'errorCode', '([a-z_]+)'/g) ?? [])
      .every((m) => B1_PREVIEW_ERRORS.includes(m.replace(/.*'errorCode', '/, "").replace(/'$/, ""))));

  // ---------------------------------------------------------------- mutation
  claim("the mutation takes no actor or caller-authority parameter",
    B1_MUTATION_PARAMETERS.every((p) => mutation.includes(p))
    && !/p_(actor|owner|user|auth_user|membership|role|permission|restaurant)[a-z_]*\s+(uuid|text)/.test(mutation));
  claim("the mutation proves the owner chain before resolving a target",
    OWNER_CHAIN(mutation, B1_PERMISSION_KEY)
    && mutation.indexOf("permission_denied") < mutation.indexOf("from public.branch_menu_items"));
  claim("the mutation joins the caller's membership and locks only the target row",
    /join public\.restaurant_memberships as membership[\s\S]{0,200}on membership\.restaurant_id = item\.restaurant_id/.test(mutation)
    && /for update of item/.test(mutation));
  claim("the mutation validates the closed vocabulary on both sides",
    B1_VOCABULARY.every((v) => mutation.includes(`'${v}'`))
    && /p_expected_availability not in \('available', 'limited', 'unavailable'\)/.test(mutation)
    && /p_next_availability not in \('available', 'limited', 'unavailable'\)/.test(mutation));
  claim("the mutation enforces expected state and expected version together",
    /\n  if v_target\.availability <> p_expected_availability\n    or v_target\.availability_version <> p_expected_version\n  then/.test(mutation)
    && !/(false|true) (and|or) v_target/.test(mutation) && /'stale_state'/.test(mutation));
  claim("the mutation refuses the value that already holds",
    /p_next_availability = v_target\.availability/.test(mutation) && /'no_change'/.test(mutation));
  claim("the mutation writes only the availability column",
    /set availability = p_next_availability/.test(mutation)
    && !new RegExp(`set [^;]*${B1_VERSION_COLUMN}\\s*=`).test(mutation)
    && !/set [^;]*\b(sold_out|price|branch_specific_status|restaurant_id|branch_id)\s*=/.test(mutation));
  claim("the mutation appends exactly one audit row, after the update, unwrapped",
    (mutation.match(new RegExp(`insert into ${B1_AUDIT.replace(/\./g, "\\.")}`, "g")) ?? []).length === 1
    && mutation.indexOf("update public.branch_menu_items") < mutation.indexOf(`insert into ${B1_AUDIT}`)
    && !/insert into restaurant_internal[\s\S]*?exception[\s\S]*?when/.test(mutation));
  claim("the audit actor and membership are server-derived",
    /values \(v_actor, v_membership_id,/.test(mutation));
  claim("the mutation returns the version as text",
    new RegExp(`'availabilityVersion', v_next_version::text`).test(mutation));
  claim("the mutation error vocabulary is exactly the six bounded codes",
    B1_MUTATION_ERRORS.every((c) => mutation.includes(`'${c}'`))
    && (mutation.match(/'errorCode', '([a-z_]+)'/g) ?? [])
      .every((m) => B1_MUTATION_ERRORS.includes(m.replace(/.*'errorCode', '/, "").replace(/'$/, ""))));
  claim("no raw PostgreSQL condition can reach a caller",
    ![preview, mutation].some((b) => /sqlerrm|get stacked diagnostics|raise notice/i.test(b)));
  claim("no durable idempotency receipt system is introduced",
    !/request_id/.test(bare) && !/idempotenc/i.test(bare));

  // ---------------------------------------------------------------- audit relation
  claim("the audit relation is typed, with no JSON or free-text column",
    B1_AUDIT_COLUMNS.every((c) => new RegExp(`\\n  ${c} `).test(bare))
    && !/jsonb|json |payload|reason|note/.test(
      bare.slice(bare.indexOf(`create table ${B1_AUDIT}`), bare.indexOf("create index branch_menu_item_availability"))));
  claim("the audit relation records only real transitions with an advancing version",
    /previous_availability <> next_availability/.test(bare)
    && /next_availability_version = previous_availability_version \+ 1/.test(bare));
  claim("the audit relation runs under FORCE row level security with no UPDATE, DELETE or ALL policy",
    new RegExp(`alter table ${B1_AUDIT.replace(/\./g, "\\.")}\\s*\\n?\\s*force row level security`).test(bare)
    && !/create policy[^;]*availability_audit_log[^;]*for (update|delete|all)/i.test(bare));
  claim("no client role holds any privilege on the audit relation",
    new RegExp(`revoke all on table ${B1_AUDIT.replace(/\./g, "\\.")}\\s*\\n?\\s*from public, ${B1_CLIENT_ROLES.join(", ")}`).test(bare));

  // ---------------------------------------------------------------- ACL lifecycle
  for (const fn of [B1_PREVIEW, B1_MUTATION]) {
    const label = fn === B1_PREVIEW ? "preview" : "mutation";
    claim(`${label}: client EXECUTE is revoked before ownership moves`,
      bare.indexOf(`revoke all on function ${fn}`) < bare.indexOf(`alter function ${fn}`));
    claim(`${label}: the intended grant is issued before ownership moves`,
      bare.indexOf(`grant execute on function ${fn}`) < bare.indexOf(`alter function ${fn}`));
    claim(`${label}: PUBLIC, anon, authenticator and service_role are explicitly revoked`,
      new RegExp(`revoke all on function ${fn}[\\s\\S]{0,160}from public, ${B1_CLIENT_ROLES.join(", ")}`).test(bare));
    claim(`${label}: only authenticated receives EXECUTE`,
      new RegExp(`grant execute on function ${fn}[\\s\\S]{0,160}to authenticated;`).test(bare)
      && !new RegExp(`grant execute on function ${fn}[\\s\\S]{0,160}to (public|anon|authenticator|service_role)`).test(bare));
    claim(`${label}: ownership moves to the new sealed role`,
      new RegExp(`alter function ${fn}[\\s\\S]{0,160}owner to ${B1_ROLE}`).test(bare));
    claim(`${label}: is SECURITY DEFINER with pinned search_path and row_security`,
      new RegExp(`create function ${fn}\\(`).test(bare));
  }
  claim("both RPCs pin an empty search_path and row_security on",
    [preview, mutation].every((b) =>
      /security definer/.test(b) && /set search_path = ''/.test(b) && /set row_security = 'on'/.test(b)));
  claim("the transient CREATE privilege is released",
    new RegExp(`revoke create on schema public\\s*\\n?\\s*from ${B1_ROLE}`).test(bare));
  claim("the migration fails closed on its own outcome",
    (sql.match(/raise exception 'RA-2B-P1:/g) ?? []).length === 11
    && /expected exactly one availability permission row/.test(sql)
    && /the availability permission is not owner\/restaurant scoped/.test(sql)
    && /the frozen sold-out permission row was disturbed/.test(sql)
    && /the tenant policies are not RESTRICTIVE/.test(sql)
    && /the permissive availability policies are missing/.test(sql)
    && /the seed suspension did not restore FORCE row level security/.test(sql)
    && /the availability writer can write a column it must never write/.test(sql)
    && /the frozen sold-out writer was widened to availability/.test(sql)
    && /the availability writer holds broad table UPDATE/.test(sql)
    && /a client role holds membership of the availability writer/.test(sql)
    && /a client role gained direct table access to branch_menu_items/.test(sql));
  claim("the migration is one transaction",
    (bare.match(/^begin;$/gm) ?? []).length === 1 && (bare.match(/^commit;$/gm) ?? []).length === 1
    && bare.trimEnd().endsWith("commit;"));

  return checks;
}

/** Target-safety claims about the Development acceptance harness. */
export function auditAcceptanceSource(text) {
  const checks = [];
  const claim = (name, pass) => checks.push({ name, pass: Boolean(pass) });
  claim("the harness pins its target and project through the manifest, not literals",
    /import \{[\s\S]*?B1_TARGET[\s\S]*?\} from/.test(text) && text.includes("B1_PROJECT_REF")
    && (text.match(/[a-z0-9]{20}\.supabase\.co/g) ?? []).length === 0);
  claim("no public demo offering or protected branch is named",
    [...B1_FORBIDDEN_TARGETS, ...B1_FORBIDDEN_BRANCHES].every((id) => !text.includes(id)));
  claim("the harness never repairs the target with a direct write",
    !/update public\./i.test(text) && !/insert into/i.test(text) && !/delete from/i.test(text));
  claim("the harness never calls the frozen sold-out mutation",
    !/set_branch_menu_item_sold_out_v1/.test(text));
  claim("the harness asserts the frozen sold-out state is unchanged",
    (() => {
      const imports = text.slice(0, text.indexOf("} from \"./restaurant-owner-availability"));
      return imports.includes("B1_FROZEN_SOLD_OUT_VERSION")
        && text.split("B1_FROZEN_SOLD_OUT_VERSION").length >= 3 && /sold_out/.test(text);
    })());
  claim("the harness asserts the final availability state and audit count",
    (() => {
      const imports = text.slice(0, text.indexOf("} from \"./restaurant-owner-availability"));
      return ["B1_EXPECTED_FINAL_VERSION", "B1_EXPECTED_AUDIT_ROWS", "B1_EXPECTED_START_AVAILABILITY"]
        .every((pin) => imports.includes(pin) && text.split(pin).length >= 3);
    })());
  return checks;
}

export const SECRET_SHAPE =
  /(?:sb_secret_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
