// RA-2A-P1-R1 successor manifest and shared contract. Every value is an exact pin, and every claim
// below is what a specific mutation is designed to break.

import fs from "node:fs";
import path from "node:path";
import {
  RA2AP1_MIGRATION, RA2AP1_MIGRATION_SHA256, RA2AP1_SEALED_ROLE, RA2AP1_CLIENT_ROLES,
  RA2AP1_PERMISSION_KEY, RA2AP1_PROJECT_REF, RA2AP1_PROJECT_NAME, RA2AP1_GOVERNED_ROLES,
  RA2AP1_ACCEPTANCE_TARGET, RA2AP1_ACCEPTANCE_RESTAURANT, RA2AP1_ACCEPTANCE_BRANCH,
  RA2AP1_ACCEPTANCE_MENU_ITEM, RA2AP1_ACCEPTANCE_OWNER_AUTH_ID, RA2AP1_FORBIDDEN_TARGETS,
  RA2AP1_FORBIDDEN_BRANCHES
} from "./restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs";

export const R1_BASELINE = "e74762e78fae210be926c956ee735fa83a621cf9";
export const R1_ORIGIN_MAIN = "22a877c974e3efb39b3fe59e1b22f88a2711a319";
export const R1_SUBJECT = "Add governed Restaurant Owner sold-out preview";
export const R1_BASELINE_MIGRATION_COUNT = 94;

export const R1_MIGRATION =
  "supabase/migrations/20260904040000_restaurant_owner_branch_menu_item_sold_out_preview.sql";
export const R1_MIGRATION_SHA256 =
  "84cf0285a1087a2386fcc3e70d8f75d3d6b28023c843361e42fcd37ab0ef7376";

/** The frozen P1 migration and its hash. R1 must leave both untouched. */
export const R1_FROZEN_P1_MIGRATION = RA2AP1_MIGRATION;
export const R1_FROZEN_P1_SHA256 = RA2AP1_MIGRATION_SHA256;
export const R1_FROZEN_PATHS = Object.freeze([
  RA2AP1_MIGRATION,
  "scripts/restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-contract.mjs",
  "scripts/restaurant-owner-sold-out-ra-2a-p1-guard.mjs",
  "scripts/platform-admin-ra-1c-r1-successor-manifest.mjs"
]);

export const R1_PREVIEW = "public.restaurant_owner_preview_branch_menu_item_sold_out_v1";
export const R1_PREVIEW_SIGNATURE = `${R1_PREVIEW}(text, text, text)`;
export const R1_PREVIEW_PARAMETERS = Object.freeze([
  "p_restaurant_id", "p_branch_id", "p_branch_menu_item_id"
]);
export const R1_MUTATION = "public.restaurant_owner_set_branch_menu_item_sold_out_v1";
export const R1_SEALED_ROLE = RA2AP1_SEALED_ROLE;
export const R1_CLIENT_ROLES = RA2AP1_CLIENT_ROLES;
export const R1_PERMISSION_KEY = RA2AP1_PERMISSION_KEY;
export const R1_GOVERNED_ROLES = RA2AP1_GOVERNED_ROLES;
export const R1_PROJECT_REF = RA2AP1_PROJECT_REF;
export const R1_PROJECT_NAME = RA2AP1_PROJECT_NAME;

/** The approved read DTO. Nothing else may cross the boundary. */
export const R1_RESULT_FIELDS = Object.freeze([
  "ok", "state", "branchMenuItemId", "branchId", "menuItemId", "soldOut", "soldOutVersion"
]);
export const R1_ERROR_CODES = Object.freeze([
  "unauthenticated", "permission_denied", "target_not_found", "invalid_request"
]);
/** Values the preview must never project. */
export const R1_FORBIDDEN_PROJECTIONS = Object.freeze([
  "actor_auth_user_id", "membership_id", "price", "availability", "restaurant_id",
  "permission_key", "role_key", "latitude", "longitude", "geocode"
]);

/** Development acceptance is read-only in this round: these values must not move. */
export const R1_EXPECTED_SOLD_OUT = false;
export const R1_EXPECTED_VERSION = "2";
export const R1_EXPECTED_AUDIT_ROWS = 2;
export const R1_ACCEPTANCE_TARGET = RA2AP1_ACCEPTANCE_TARGET;
export const R1_ACCEPTANCE_RESTAURANT = RA2AP1_ACCEPTANCE_RESTAURANT;
export const R1_ACCEPTANCE_BRANCH = RA2AP1_ACCEPTANCE_BRANCH;
export const R1_ACCEPTANCE_MENU_ITEM = RA2AP1_ACCEPTANCE_MENU_ITEM;
export const R1_ACCEPTANCE_OWNER_AUTH_ID = RA2AP1_ACCEPTANCE_OWNER_AUTH_ID;
export const R1_FORBIDDEN_TARGETS = RA2AP1_FORBIDDEN_TARGETS;
export const R1_FORBIDDEN_BRANCHES = RA2AP1_FORBIDDEN_BRANCHES;

export const R1_PACKAGE_KEYS = Object.freeze([
  "test:restaurant-owner-sold-out-preview-ra-2a-p1-r1",
  "test:restaurant-owner-sold-out-preview-ra-2a-p1-r1-smoke",
  "test:restaurant-owner-sold-out-preview-ra-2a-p1-r1-mutations",
  "test:restaurant-owner-sold-out-preview-ra-2a-p1-r1-postgres",
  "test:restaurant-owner-sold-out-preview-ra-2a-p1-r1-development"
]);

export const R1_PATHS = Object.freeze([
  "docs/restaurant-owner-sold-out-preview-ra-2a-p1-r1.md",
  "package.json",
  "scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-contract.mjs",
  "scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-development-acceptance.mjs",
  "scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-guard.mjs",
  "scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-mutations.mjs",
  "scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-postgres-apply.mjs",
  "scripts/restaurant-owner-sold-out-preview-ra-2a-p1-r1-smoke.mjs",
  R1_MIGRATION
].sort());

export const readNormalized = (root, file) =>
  fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
export const readMigrationSource = (root = process.cwd()) => readNormalized(root, R1_MIGRATION);

function previewBody(sql) {
  const start = sql.indexOf(`create function ${R1_PREVIEW}(`);
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end);
}

/** Every behavioural claim RA-2A-P1-R1 makes about its own migration text. */
export function auditMigrationSource(sql) {
  const body = previewBody(sql);
  const checks = [];
  const claim = (name, pass) => checks.push({ name, pass: Boolean(pass) });

  // ---------------------------------------------------------------- scope
  claim("the round creates exactly one function and nothing else",
    (sql.match(/^create function /gm) ?? []).length === 1 && sql.includes(`create function ${R1_PREVIEW}(`));
  claim("no new role, schema, table, policy, trigger or index is created",
    !/^create (role|schema|table|policy|trigger|index)/m.test(sql));
  claim("no new grant is issued on any business table",
    !/^grant [^;]*on table /m.test(sql));
  claim("the only schema grant is the transient CREATE needed for the ownership transfer",
    (sql.match(/^grant create on schema public/gm) ?? []).length === 1
    && (sql.match(/^revoke create on schema public/gm) ?? []).length === 1);

  // ---------------------------------------------------------------- read-only
  claim("the preview is declared STABLE, so PostgreSQL itself refuses any write inside it",
    /^stable$/m.test(body));
  claim("the preview contains no write statement of any kind",
    !/\b(update|insert|delete|truncate|alter|drop)\s/i.test(
      body.replace(/^\s*--.*$/gm, "").replace(/'[^']*'/g, "''")));
  claim("the preview writes no audit row",
    !/branch_menu_item_sold_out_audit_log/.test(body));
  claim("the preview takes no row lock",
    !/for update|for share|for no key update/i.test(body.replace(/^\s*--.*$/gm, "")));

  // ---------------------------------------------------------------- authority
  claim("the preview takes only the three selector parameters",
    R1_PREVIEW_PARAMETERS.every((p) => body.includes(p))
    && !/p_(actor|owner|user|auth_user|membership|role|permission)[a-z_]*\s+(uuid|text)/.test(body));
  claim("the actor is derived only from the verified request claims",
    /request\.jwt\.claim\.sub/.test(body) && /request\.jwt\.claims/.test(body));
  claim("the preview proves the same effective Owner authority as the mutation",
    /role\.role_key = 'owner'/.test(body)
    && new RegExp(`permission\\.permission_key = '${R1_PERMISSION_KEY.replace(/\./g, "\\.")}'`).test(body)
    && /permission\.permission_scope = 'restaurant'/.test(body)
    && /caller\.login_status = 'enabled'/.test(body)
    && /membership\.status = 'active'/.test(body)
    && /role\.status = 'active'/.test(body));
  claim("authorised scope is proven before any target is resolved",
    body.indexOf("permission_denied") < body.indexOf("from public.branch_menu_items"));
  claim("the target lookup JOINS the caller's own membership rather than trusting the selector",
    /from public\.branch_menu_items as item[\s\S]{0,900}join public\.restaurant_memberships as membership[\s\S]{0,200}on membership\.restaurant_id = item\.restaurant_id/.test(body)
    && /caller\.auth_user_id = v_actor/.test(body));
  claim("the tenant predicate is not delegated to row level security alone",
    (body.match(/membership\.restaurant_id = item\.restaurant_id/g) ?? []).length === 1
    && /join public\.role_permissions as permission/.test(body));
  // Twice, not merely once: the scope test and the target join each carry the full owner chain, so
  // dropping either one has to fail rather than be masked by the survivor.
  claim("the owner chain is proven in BOTH the scope test and the target resolution",
    (body.match(/role\.role_key = 'owner'/g) ?? []).length === 2
    && (body.match(new RegExp(`permission\\.permission_key = '${R1_PERMISSION_KEY.replace(/\./g, "\\.")}'`, "g")) ?? []).length === 2
    && (body.match(/permission\.permission_scope = 'restaurant'/g) ?? []).length === 2
    && (body.match(/caller\.login_status = 'enabled'/g) ?? []).length === 2
    && (body.match(/membership\.status = 'active'/g) ?? []).length === 2
    && (body.match(/role\.status = 'active'/g) ?? []).length === 2);
  claim("the caller's selectors are used only to narrow, never to authorise",
    /where item\.id = p_branch_menu_item_id/.test(body)
    && /and item\.restaurant_id = p_restaurant_id/.test(body)
    && /and item\.branch_id = p_branch_id/.test(body));

  // ---------------------------------------------------------------- DTO and errors
  claim("the version crosses the boundary as text, never a JSON number",
    /'soldOutVersion', v_target\.sold_out_version::text/.test(body));
  claim("the ready result projects exactly the approved fields",
    R1_RESULT_FIELDS.every((f) => f === "ok" || body.includes(`'${f}'`))
    && /'state', 'ready'/.test(body));
  claim("the preview projects no identity, pricing, permission or database metadata",
    R1_FORBIDDEN_PROJECTIONS.every((f) => !new RegExp(`'[a-zA-Z]*', *v_target\\.${f}`).test(body))
    && !/v_actor\s*,/.test(body.slice(body.indexOf("jsonb_build_object(\n    'ok', true"))));
  claim("the error vocabulary is exactly the four bounded codes",
    R1_ERROR_CODES.every((c) => body.includes(`'${c}'`))
    && (body.match(/'errorCode', '([a-z_]+)'/g) ?? [])
      .every((m) => R1_ERROR_CODES.includes(m.replace(/.*'errorCode', '/, "").replace(/'$/, ""))));
  claim("a cross-tenant target is indistinguishable from a nonexistent one",
    (body.match(/'target_not_found'/g) ?? []).length === 1);
  claim("no raw PostgreSQL condition can reach a caller",
    !/sqlerrm/i.test(body) && !/get stacked diagnostics/i.test(body) && !/raise notice/i.test(body));

  // ---------------------------------------------------------------- security lifecycle
  claim("the preview is SECURITY DEFINER with a pinned empty search_path and row_security on",
    /security definer/.test(body) && /set search_path = ''/.test(body)
    && /set row_security = 'on'/.test(body));
  claim("client EXECUTE is revoked before ownership moves",
    sql.indexOf(`revoke all on function ${R1_PREVIEW}`) < sql.indexOf(`alter function ${R1_PREVIEW}`));
  claim("the intended EXECUTE grant is issued before ownership moves",
    sql.indexOf(`grant execute on function ${R1_PREVIEW}`) < sql.indexOf(`alter function ${R1_PREVIEW}`));
  claim("PUBLIC, anon, authenticator and service_role EXECUTE are explicitly revoked",
    new RegExp(`revoke all on function ${R1_PREVIEW}[\\s\\S]{0,140}from public, ${R1_CLIENT_ROLES.join(", ")}`).test(sql));
  claim("only authenticated receives EXECUTE",
    new RegExp(`grant execute on function ${R1_PREVIEW}[\\s\\S]{0,140}to authenticated;`).test(sql)
    && !new RegExp(`grant execute on function ${R1_PREVIEW}[\\s\\S]{0,140}to (public|anon|authenticator|service_role)`).test(sql));
  claim("ownership moves to the EXISTING sealed writer",
    new RegExp(`alter function ${R1_PREVIEW}[\\s\\S]{0,140}owner to ${R1_SEALED_ROLE}`).test(sql));
  claim("the transient sealed-role membership is released",
    new RegExp(`revoke ${R1_SEALED_ROLE} from postgres granted by postgres`).test(sql));
  claim("the accepted control-plane creator row is not attacked",
    !/admin option/i.test(sql) && !/granted by supabase_admin/i.test(sql));
  claim("the migration fails closed on its own outcome",
    (sql.match(/raise exception 'RA-2A-P1-R1:/g) ?? []).length === 8
    && /expected exactly one preview function/.test(sql)
    && /owned by % rather than the sealed writer/.test(sql)
    && /not STABLE, so it is not provably read-only/.test(sql)
    && /does not pin search_path and row_security/.test(sql)
    && /authenticated cannot execute the preview/.test(sql)
    && /a runtime role other than authenticated may execute the preview/.test(sql)
    && /a client role holds membership of the sealed writer/.test(sql)
    && /gained direct table access to branch_menu_items/.test(sql));
  claim("the migration is one transaction",
    (sql.match(/^begin;$/gm) ?? []).length === 1 && (sql.match(/^commit;$/gm) ?? []).length === 1
    && sql.trimEnd().endsWith("commit;"));

  return checks;
}

/** Target-safety claims about the Development acceptance harness itself. */
export function auditAcceptanceSource(text) {
  const checks = [];
  const claim = (name, pass) => checks.push({ name, pass: Boolean(pass) });
  claim("the harness pins its target and project through the manifest, not literals",
    /import \{[\s\S]*?R1_ACCEPTANCE_TARGET[\s\S]*?\} from/.test(text)
    && text.includes("R1_PROJECT_REF")
    && (text.match(/[a-z0-9]{20}\.supabase\.co/g) ?? []).length === 0);
  claim("no public demo offering or branch is named",
    [...R1_FORBIDDEN_TARGETS, ...R1_FORBIDDEN_BRANCHES].every((id) => !text.includes(id)));
  claim("the harness performs no business mutation in this round",
    !/update public\./i.test(text) && !/set_branch_menu_item_sold_out_v1/.test(text)
    && !/insert into/i.test(text));
  claim("the harness creates no user and no membership",
    !/insert into auth\.users/i.test(text) && !/restaurant_memberships *\(/i.test(text));
  claim("the harness deletes no evidence",
    !/delete from/i.test(text) && !/truncate/i.test(text));
  claim("the harness asserts the business state is unchanged after previewing",
    (() => {
      const imports = text.slice(0, text.indexOf("} from \"./restaurant-owner-sold-out-preview"));
      return ["R1_EXPECTED_VERSION", "R1_EXPECTED_AUDIT_ROWS", "R1_EXPECTED_SOLD_OUT"]
        .every((pin) => imports.includes(pin) && text.split(pin).length >= 3);
    })());
  return checks;
}

export const SECRET_SHAPE =
  /(?:sb_secret_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
