// RA-2A-P1 shared contract. The guard, the smoke runner and the mutation runner all assert through
// these functions, so a mutant that survives one of them survives none of them by accident: every
// assertion below is what a specific mutation is designed to break.

import fs from "node:fs";
import path from "node:path";
import {
  RA2AP1_AUDIT_COLUMNS, RA2AP1_AUDIT_RELATION, RA2AP1_CLIENT_ROLES, RA2AP1_MIGRATION,
  RA2AP1_NON_PERMITTED_ROLES, RA2AP1_PERMISSION_KEY, RA2AP1_PERMISSION_ROLE,
  RA2AP1_PERMISSION_SCOPE, RA2AP1_PRIVATE_SCHEMA, RA2AP1_RESULT_CODES, RA2AP1_RPC,
  RA2AP1_RPC_PARAMETERS, RA2AP1_SEALED_ROLE, RA2AP1_TRIGGER, RA2AP1_UNWRITABLE_COLUMNS,
  RA2AP1_VERSION_COLUMN, RA2AP1_WRITABLE_COLUMNS, RA2AP1_FORBIDDEN_TARGETS,
  RA2AP1_FORBIDDEN_BRANCHES, RA2AP1_ACCEPTANCE_TARGET
} from "./restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs";

/** The five permission keys that existed before this round. The sixth is this round's. */
export const RA2AP1_LEGACY_PERMISSION_KEYS = Object.freeze([
  "access_context.read", "restaurant.read", "branch.read", "menu.read", "nutrition.read"
]);

export const readNormalized = (root, file) =>
  fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");

export function readMigrationSource(root = process.cwd()) {
  return readNormalized(root, RA2AP1_MIGRATION);
}

/** The body of the single mutation RPC, isolated so parameter and branch checks cannot drift. */
function rpcBody(sql) {
  const start = sql.indexOf(`create function ${RA2AP1_RPC}(`);
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end);
}

function triggerBody(sql) {
  const start = sql.indexOf(`create function ${RA2AP1_PRIVATE_SCHEMA}.branch_menu_item_${RA2AP1_VERSION_COLUMN}_maintain()`);
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end);
}

/**
 * Every behavioural claim RA-2A-P1 makes about its own migration text. Returns an ordered list of
 * `{ name, pass }`; callers decide how to report. Written as claims, not as pattern counts, so a
 * mutant has to actually restore the behaviour to pass rather than restore a keyword.
 */
export function auditMigrationSource(sql) {
  const rpc = rpcBody(sql);
  const trigger = triggerBody(sql);
  const checks = [];
  const claim = (name, pass) => checks.push({ name, pass: Boolean(pass) });

  // ---------------------------------------------------------------- permission
  claim("the new permission key is seeded exactly once",
    (sql.match(new RegExp(`'${RA2AP1_PERMISSION_KEY.replace(/\./g, "\\.")}'`, "g")) ?? []).length >= 1
    && (sql.match(/insert into public\.role_permissions/g) ?? []).length === 1);
  claim("the permission is seeded only for the canonical owner role",
    new RegExp(`where role\\.role_key = '${RA2AP1_PERMISSION_ROLE}'`).test(sql));
  claim("the permission is seeded at restaurant scope",
    new RegExp(`'${RA2AP1_PERMISSION_KEY.replace(/\./g, "\\.")}', '${RA2AP1_PERMISSION_SCOPE}'`).test(sql));
  claim("manager and staff are never named as permission recipients",
    RA2AP1_NON_PERMITTED_ROLES.every((role) =>
      !new RegExp(`role_key = '${role}'`).test(sql) && !new RegExp(`'${role}'`).test(sql)));
  claim("the permission vocabulary is widened by exactly one key",
    (sql.match(/add constraint role_permissions_permission_key_check/g) ?? []).length === 1
    && (() => {
      const start = sql.indexOf("add constraint role_permissions_permission_key_check");
      const list = sql.slice(start, sql.indexOf("));", start));
      const keys = (list.match(/'[a-z_.]+'/g) ?? []).map((k) => k.slice(1, -1)).sort();
      return JSON.stringify(keys) === JSON.stringify([...RA2AP1_LEGACY_PERMISSION_KEYS,
        RA2AP1_PERMISSION_KEY].sort());
    })());
  claim("the permission scope vocabulary is not widened",
    !/role_permissions_permission_scope_check/.test(sql));
  claim("the seed's row level security suspension is restored in the same transaction",
    (sql.match(/no force row level security/g) ?? []).length === 2
    && sql.includes("alter table public.role_permissions no force row level security")
    && sql.includes("alter table public.restaurant_roles no force row level security")
    && sql.includes("alter table public.role_permissions force row level security")
    && sql.includes("alter table public.restaurant_roles force row level security")
    && sql.lastIndexOf("no force row level security")
      < sql.indexOf("alter table public.role_permissions force row level security"));

  // ---------------------------------------------------------------- version token
  claim("the version column is a non-negative bigint defaulting to zero",
    new RegExp(`add column ${RA2AP1_VERSION_COLUMN} bigint not null default 0`).test(sql)
    && /branch_menu_items_sold_out_version_non_negative[\s\S]{0,80}>= 0/.test(sql));
  claim("a before insert-or-update row trigger maintains the version",
    new RegExp(`create trigger ${RA2AP1_TRIGGER}[\\s\\S]{0,140}before insert or update on public\\.branch_menu_items[\\s\\S]{0,80}for each row`).test(sql));
  claim("the trigger advances the version only when sold_out actually changes",
    /new\.sold_out is distinct from old\.sold_out/.test(trigger)
    && /old\.sold_out_version\s*\+/.test(trigger));
  claim("the trigger overwrites any caller-supplied version rather than trusting it",
    new RegExp(`new\\.${RA2AP1_VERSION_COLUMN} :=`).test(trigger)
    && /tg_op = 'INSERT'[\s\S]{0,120}:= 0/.test(trigger));
  claim("the trigger pins a safe search_path", /set search_path = ''/.test(trigger));

  // ---------------------------------------------------------------- sealed writer
  claim("the sealed writer is created NOLOGIN, NOINHERIT and NOBYPASSRLS",
    new RegExp(`create role ${RA2AP1_SEALED_ROLE}\\s+nologin\\s+noinherit\\s+nobypassrls`).test(sql));
  claim("the sealed writer requests no elevated attribute",
    !new RegExp(`create role ${RA2AP1_SEALED_ROLE}[\\s\\S]{0,200}(superuser|createdb|createrole|replication|bypassrls;)`)
      .test(sql.replace(/nobypassrls/g, "")));
  claim("no client or runtime role is granted membership of the sealed writer",
    RA2AP1_CLIENT_ROLES.every((role) =>
      !new RegExp(`grant ${RA2AP1_SEALED_ROLE} to ${role}`).test(sql)));
  claim("the migration releases its own transient sealed-role membership",
    new RegExp(`revoke ${RA2AP1_SEALED_ROLE} from postgres granted by postgres`).test(sql));
  claim("the migration does not touch the platform creator row",
    !/admin option/i.test(sql) && !/granted by supabase_admin/i.test(sql));

  // ---------------------------------------------------------------- column authority
  claim("the sealed writer receives column UPDATE on sold_out and nothing else",
    new RegExp(`grant update \\(${RA2AP1_WRITABLE_COLUMNS.join(", ")}\\)\\s*\\n?\\s*on table public\\.branch_menu_items`).test(sql)
    && (sql.match(/grant update \([^)]*\)\s*\n?\s*on table public\.branch_menu_items/g) ?? []).length === 1);
  claim("no broad table UPDATE, INSERT or DELETE is granted on the target table",
    !/grant [^(]*update[^(]*on table public\.branch_menu_items/i.test(sql.replace(/grant update \([^)]*\)/g, ""))
    && !/grant[^;]*\b(insert|delete)\b[^;]*on table public\.branch_menu_items/i.test(sql));
  claim("no unwritable column appears in any UPDATE grant",
    RA2AP1_UNWRITABLE_COLUMNS.every((column) =>
      !new RegExp(`grant update \\([^)]*\\b${column}\\b[^)]*\\)`).test(sql)));
  claim("the version column is never granted for direct UPDATE",
    !new RegExp(`grant update \\([^)]*${RA2AP1_VERSION_COLUMN}`).test(sql));

  // ---------------------------------------------------------------- tenant proof
  claim("row level security repeats the tenant predicate on both read and write",
    (sql.match(/membership\.restaurant_id = branch_menu_items\.restaurant_id/g) ?? []).length === 3);
  claim("the update policy carries a WITH CHECK clause, so a row cannot leave its tenant",
    /for update to restaurant_owner_branch_menu_item_write_authority[\s\S]*?with check \(/.test(sql));
  claim("the policies require an active enabled owner holding this exact permission",
    (sql.match(/role\.role_key = 'owner'/g) ?? []).length >= 2
    && (sql.match(new RegExp(`permission\\.permission_key = '${RA2AP1_PERMISSION_KEY.replace(/\./g, "\\.")}'`, "g")) ?? []).length >= 3
    && (sql.match(/caller\.login_status = 'enabled'/g) ?? []).length >= 3);
  // The private audit relation's writer-only policies are legitimately `using (true)`: it carries no
  // tenant column and no client role can reach it at all. Only the tenant-bearing policies on the
  // shared target table may never be short-circuited.
  claim("no tenant policy expression is short-circuited by a constant",
    (() => {
      const start = sql.indexOf("create policy branch_menu_items_owner_sold_out_select");
      const end = sql.indexOf("grant create on schema public", start);
      const block = sql.slice(start, end);
      return !/(using|with check) \(\s*(true|false)[\s)]/.test(block)
        && !/(true|false) (or|and) exists \(/.test(block);
    })());
  claim("the update policy's WITH CHECK carries the tenant predicate, not a weaker one",
    (() => {
      const start = sql.indexOf("create policy branch_menu_items_owner_sold_out_update");
      const body = sql.slice(start, sql.indexOf(";", start));
      const withCheck = body.slice(body.indexOf("with check ("));
      return withCheck.includes("membership.restaurant_id = branch_menu_items.restaurant_id")
        && withCheck.includes("role.role_key = 'owner'")
        && withCheck.includes("caller.login_status = 'enabled'");
    })());
  claim("no policy is created for a client or runtime role",
    RA2AP1_CLIENT_ROLES.every((role) => !new RegExp(`create policy[\\s\\S]{0,200}to ${role}\\b`).test(sql)));

  // ---------------------------------------------------------------- the RPC
  claim("exactly one public mutation function is created",
    (sql.match(/create function public\./g) ?? []).length === 1
    && sql.includes(`create function ${RA2AP1_RPC}(`));
  claim("the RPC takes no actor, owner, membership, role or permission parameter",
    RA2AP1_RPC_PARAMETERS.every((p) => rpc.includes(p))
    && !/p_(actor|owner|user|auth_user|membership|role|permission|restaurant)[a-z_]*\s+(uuid|text)/.test(rpc));
  claim("the RPC derives the actor only from the verified request claims",
    /request\.jwt\.claim\.sub/.test(rpc) && /request\.jwt\.claims/.test(rpc));
  claim("the RPC is SECURITY DEFINER with a pinned empty search_path and row_security on",
    /security definer/.test(rpc) && /set search_path = ''/.test(rpc) && /set row_security = 'on'/.test(rpc));
  claim("the RPC locks the target row before deciding anything about it",
    /from public\.branch_menu_items[\s\S]{0,200}for update/.test(rpc));
  claim("the RPC proves authorised scope before it resolves a target",
    rpc.indexOf("permission_denied") < rpc.indexOf("for update"));
  claim("the RPC enforces the expected state and the expected version together",
    /\n  if v_target\.sold_out <> p_expected_sold_out\n    or v_target\.sold_out_version <> p_expected_version\n  then/.test(rpc)
    && !/(false|true) (and|or) v_target/.test(rpc)
    && new RegExp(`v_target\\.${RA2AP1_VERSION_COLUMN} <> p_expected_version`).test(rpc)
    && /'stale_state'/.test(rpc));
  claim("the RPC refuses a request for the state that already holds",
    /p_next_sold_out = v_target\.sold_out/.test(rpc) && /'no_change'/.test(rpc));
  claim("the RPC writes only the sold_out column",
    /update public\.branch_menu_items[\s\S]{0,120}set sold_out = p_next_sold_out/.test(rpc)
    && !new RegExp(`set [^;]*${RA2AP1_VERSION_COLUMN}\\s*=`).test(rpc)
    && !/set [^;]*\b(price|availability|branch_specific_status|restaurant_id|branch_id)\s*=/.test(rpc));
  claim("the RPC appends exactly one audit row per applied transition",
    (rpc.match(new RegExp(`insert into ${RA2AP1_AUDIT_RELATION.replace(/\./g, "\\.")}`, "g")) ?? []).length === 1);
  claim("the audit insert is not wrapped in an exception handler that could swallow it",
    !/insert into restaurant_internal[\s\S]*?exception[\s\S]*?when/.test(rpc));
  claim("the audit actor and membership are server-derived, never parameters",
    /values \(v_actor, v_membership_id,/.test(rpc));
  claim("the version crosses the boundary as text, never a JSON number",
    new RegExp(`'soldOutVersion', v_next_version::text`).test(rpc));
  claim("the RPC returns only the closed result vocabulary",
    RA2AP1_RESULT_CODES.every((code) => rpc.includes(`'${code}'`))
    && (rpc.match(/'errorCode', '([a-z_]+)'/g) ?? [])
      .every((m) => RA2AP1_RESULT_CODES.includes(m.replace(/.*'errorCode', '/, "").replace(/'$/, ""))));
  claim("no raw PostgreSQL condition can reach a caller",
    !/raise notice/.test(rpc) && !/sqlerrm/i.test(rpc) && !/get stacked diagnostics/i.test(rpc));

  // ---------------------------------------------------------------- audit relation
  claim("the audit relation is typed, with no JSON or free-text column",
    RA2AP1_AUDIT_COLUMNS.every((c) => new RegExp(`\\n  ${c} `).test(sql))
    && !/jsonb|json |payload|reason|note|request_body/.test(
      sql.slice(sql.indexOf(`create table ${RA2AP1_AUDIT_RELATION}`), sql.indexOf("create index branch_menu_item"))));
  claim("the audit relation records only real transitions",
    /previous_sold_out <> next_sold_out/.test(sql)
    && /next_sold_out_version = previous_sold_out_version \+ 1/.test(sql));
  claim("the audit relation runs under FORCE row level security",
    new RegExp(`alter table ${RA2AP1_AUDIT_RELATION.replace(/\./g, "\\.")} force row level security`).test(sql));
  claim("the audit relation has no UPDATE, DELETE or ALL policy",
    !/create policy[^;]*branch_menu_item_sold_out_audit_log[^;]*for (update|delete|all)/i.test(sql));
  claim("no client role holds any privilege on the audit relation or its schema",
    new RegExp(`revoke all on table ${RA2AP1_AUDIT_RELATION.replace(/\./g, "\\.")}\\s*\\n?\\s*from public, ${RA2AP1_CLIENT_ROLES.join(", ")}`).test(sql)
    && RA2AP1_CLIENT_ROLES.every((r) =>
      !new RegExp(`grant [^;]*on schema ${RA2AP1_PRIVATE_SCHEMA} to [^;]*${r}`).test(sql)));
  claim("no durable idempotency receipt system is introduced",
    !/request_id/.test(sql) && !/create table [a-z_.]*receipt/i.test(sql)
    && !/idempotency/i.test(sql.replace(/^--.*$/gm, ""))
    && !/unique \([^)]*request_id/i.test(sql));

  // ---------------------------------------------------------------- execute ACL and ordering
  claim("client EXECUTE is revoked before ownership moves",
    sql.indexOf(`revoke all on function ${RA2AP1_RPC}`) < sql.indexOf(`alter function ${RA2AP1_RPC}`));
  claim("the intended EXECUTE grant is issued before ownership moves",
    sql.indexOf(`grant execute on function ${RA2AP1_RPC}`) < sql.indexOf(`alter function ${RA2AP1_RPC}`));
  claim("only authenticated receives EXECUTE on the RPC",
    new RegExp(`grant execute on function ${RA2AP1_RPC}[\\s\\S]{0,160}to authenticated;`).test(sql)
    && !new RegExp(`grant execute on function ${RA2AP1_RPC}[\\s\\S]{0,160}to (public|anon|authenticator|service_role)`).test(sql));
  claim("PUBLIC, anon, authenticator and service_role EXECUTE are explicitly revoked",
    new RegExp(`revoke all on function ${RA2AP1_RPC}[\\s\\S]{0,160}from public, ${RA2AP1_CLIENT_ROLES.join(", ")}`).test(sql));
  claim("ownership moves to the sealed writer",
    new RegExp(`alter function ${RA2AP1_RPC}[\\s\\S]{0,160}owner to ${RA2AP1_SEALED_ROLE}`).test(sql));
  claim("the transient CREATE privilege is released",
    new RegExp(`revoke create on schema public from ${RA2AP1_SEALED_ROLE}`).test(sql));
  claim("the migration fails closed if its own outcome is not what it intended",
    (sql.match(/raise exception 'RA-2A-P1:/g) ?? []).length === 5
    && /expected exactly one sold-out permission row/.test(sql)
    && /not owner\/restaurant scoped/.test(sql)
    && /did not restore FORCE row level security/.test(sql)
    && /a client role holds membership of the sealed writer/.test(sql)
    && /holds table UPDATE on branch_menu_items/.test(sql));
  claim("the migration is one transaction",
    (sql.match(/^begin;$/gm) ?? []).length === 1 && (sql.match(/^commit;$/gm) ?? []).length === 1
    && sql.trimEnd().endsWith("commit;")
    && sql.indexOf("\nbegin;") < sql.indexOf("alter table public.role_permissions"));

  return checks;
}

/** Target-safety claims about the Development acceptance harness itself. */
export function auditAcceptanceSource(text) {
  const checks = [];
  const claim = (name, pass) => checks.push({ name, pass: Boolean(pass) });
  claim("the acceptance target is the approved hidden-restaurant offering, pinned by import",
    /import \{[\s\S]*?RA2AP1_ACCEPTANCE_TARGET[\s\S]*?\} from/.test(text)
    && text.includes('from "./restaurant-owner-sold-out-ra-2a-p1-successor-manifest.mjs"')
    && !new RegExp(`["']${RA2AP1_ACCEPTANCE_TARGET}["']`).test(text));
  claim("no public demo menu item is reachable as an acceptance target",
    RA2AP1_FORBIDDEN_TARGETS.every((id) => !text.includes(id)));
  claim("no forbidden public demo branch is named",
    RA2AP1_FORBIDDEN_BRANCHES.every((id) => !text.includes(id)));
  claim("the harness pins the Development project by import and names no other project",
    text.includes("RA2AP1_PROJECT_REF")
    && (text.match(/[a-z0-9]{20}\.supabase\.co/g) ?? []).length === 0
    && !/projects\/[a-z0-9]{20}/.test(text));
  claim("the harness creates no auth user and no membership",
    !/insert into auth\.users/i.test(text) && !/insert into public\.restaurant_memberships/i.test(text)
    && !/insert into public\.restaurant_users/i.test(text));
  claim("the harness never repairs the target with a direct UPDATE",
    !/update public\.branch_menu_items/i.test(text));
  claim("the harness never deletes audit evidence",
    !/delete from restaurant_internal/i.test(text) && !/truncate/i.test(text));
  return checks;
}

/** Credential-shaped values must never appear in any RA-2A-P1 path. */
export const SECRET_SHAPE =
  /(?:sb_secret_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
