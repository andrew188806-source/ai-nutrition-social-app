import crypto from "node:crypto";

// RA-1A migration lifecycle protection.
//
// One place that states what the RA-1A round is allowed to contain, what its migration must hash to,
// and which repository shapes are legitimate. The guard consumes this; nothing else may widen it.

export const RA1A_BASELINE = "101064dd4ab1c315d11e0a11f7acf1172033d8ab";
export const RA1A_BASELINE_SUBJECT = "Finalize post-audit MVP handoff";
export const RA1A_COMMIT_SUBJECT = "Establish Platform Admin authorization foundation";

export const RA1A_MIGRATION =
  "supabase/migrations/20260904010000_platform_admin_authority.sql";
// SHA-256 of the migration with line endings normalised to LF. Normalising removes the
// core.autocrlf hazard: a checkout that rewrites CRLF must not look like a modified frozen file.
export const RA1A_MIGRATION_SHA256 =
  "b97b45c6090e8b0284da4da7b24b7de3cde4a87f0b7d25583216fabd07048a44";

// The migration count immediately before RA-1A. RA-1A adds exactly one.
export const RA1A_BASELINE_MIGRATION_COUNT = 91;

// Every function RA-1A creates, with the sealed role that must end up owning it and whether a
// signed-in client may execute it. Privilege statements for each must precede its ownership
// transfer: a REVOKE issued by a role that no longer owns the function is a silent no-op.
export const RA1A_FUNCTIONS = Object.freeze([
  { signature: "public.platform_admin_current_context_v1()",
    owner: "platform_admin_context_reader", clientExecutable: true },
  { signature: "public.platform_admin_has_permission_v1(text)",
    owner: "platform_admin_context_reader", clientExecutable: true },
  { signature: "public.platform_admin_audit_log_v1(integer)",
    owner: "platform_admin_context_reader", clientExecutable: true },
  { signature: "admin_internal.grant_platform_admin(uuid, text, uuid, text)",
    owner: "platform_admin_write_authority", clientExecutable: false },
  { signature: "admin_internal.revoke_platform_admin(uuid, uuid, text)",
    owner: "platform_admin_write_authority", clientExecutable: false }
]);

export const RA1A_CLIENT_ROLE_LIST = "public, anon, authenticated, authenticator, service_role";
export const escapeRa1aRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const RA1A_NPM_KEYS = Object.freeze([
  "test:platform-admin-ra-1a",
  "test:platform-admin-ra-1a-smoke",
  "test:platform-admin-ra-1a-mutations",
  "test:platform-admin-ra-1a-development-acceptance",
  "test:platform-admin-ra-1a-development-reset"
]);

export const RA1A_PRODUCT_PATHS = Object.freeze([
  RA1A_MIGRATION,
  "apps/admin-web/server/platformAdminAuthority.ts",
  "apps/admin-web/types/server-only.d.ts"
]);

export const RA1A_PATHS = Object.freeze([
  ...RA1A_PRODUCT_PATHS,
  "ENGINEER_HANDOFF.md",
  "docs/platform-admin-authority-ra-1a.md",
  "package.json",
  "scripts/platform-admin-ra-1a-development-acceptance.mjs",
  "scripts/platform-admin-ra-1a-development-reset.mjs",
  "scripts/platform-admin-ra-1a-guard.mjs",
  "scripts/platform-admin-ra-1a-mutations.mjs",
  "scripts/platform-admin-ra-1a-smoke.mjs",
  "scripts/platform-admin-ra-1a-successor-manifest.mjs"
].sort());

const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

export function classifyRa1aLifecycle(input) {
  const worktree = [...input.worktreePaths].sort();
  const delta = [...input.deltaPaths].sort();
  const candidate = input.head === RA1A_BASELINE
    && input.originHead === RA1A_BASELINE && input.behind === 0 && input.ahead === 0
    && input.stagedPaths.length === 0 && !input.deleted && same(worktree, RA1A_PATHS);
  const frozenShape = input.parent === RA1A_BASELINE
    && input.stagedPaths.length === 0 && input.worktreePaths.length === 0
    && !input.deleted && same(delta, RA1A_PATHS);
  const frozenLocal = frozenShape && input.originHead === RA1A_BASELINE
    && input.behind === 0 && input.ahead === 1;
  const frozenPushed = frozenShape && input.originHead === input.head
    && input.behind === 0 && input.ahead === 0;
  const phase = candidate ? "candidate" : frozenLocal ? "frozen_local"
    : frozenPushed ? "frozen_pushed" : "invalid";
  return Object.freeze({
    valid: phase !== "invalid",
    phase,
    manifest: candidate ? worktree : delta
  });
}

const stripSqlComments = (source) => source.replace(/(^|\s)--[^\n]*/g, "$1");

// The security contract of the RA-1A migration, asserted against its own text. Every rule here is a
// property the round must not lose; the mutation suite flips each one and expects a kill.
export function auditRa1aSources(sources) {
  const migration = sources[RA1A_MIGRATION] ?? "";
  const authority = sources["apps/admin-web/server/platformAdminAuthority.ts"] ?? "";
  const sql = stripSqlComments(migration);
  const violations = [];
  const rule = (name, pass) => { if (!pass) violations.push(name); };

  // --- schema and role model -------------------------------------------------------------------
  rule("server-only private schema", /create schema admin_internal;/.test(sql));
  rule("private schema revoked from public", /revoke all on schema admin_internal from public;/.test(sql));
  rule("sealed context reader role",
    /create role platform_admin_context_reader\s+nologin\s+noinherit\s+nobypassrls;/.test(sql));
  rule("sealed write authority role",
    /create role platform_admin_write_authority\s+nologin\s+noinherit\s+nobypassrls;/.test(sql));
  rule("no LOGIN role", !/create role[\s\S]{0,80}?\blogin\b(?!\s*;)/.test(sql.replace(/nologin/g, "")));
  rule("no SUPERUSER", !/\bsuperuser\b/.test(sql));
  rule("no CREATEDB", !/\bcreatedb\b/.test(sql));
  rule("no CREATEROLE", !/\bcreaterole\b/.test(sql));
  rule("no REPLICATION", !/\breplication\b/.test(sql));
  rule("no BYPASSRLS is requested", !/(^|[^o])\bbypassrls\b/.test(sql.replace(/nobypassrls/g, "")));

  // --- tables ----------------------------------------------------------------------------------
  for (const table of ["platform_admin_roles", "platform_admin_role_permissions",
    "platform_admin_memberships", "platform_admin_audit_log"]) {
    rule(`${table} lives in the private schema`,
      new RegExp(`create table admin_internal\\.${table} \\(`).test(sql));
    rule(`${table} enables and forces RLS`,
      new RegExp(`alter table admin_internal\\.${table} enable row level security;`).test(sql)
      && new RegExp(`alter table admin_internal\\.${table} force row level security;`).test(sql));
    rule(`${table} is revoked from every client role`,
      new RegExp(`revoke all on table admin_internal\\.${table}\\s+from public, anon, authenticated, authenticator, service_role;`)
        .test(sql));
  }
  rule("one membership row per identity",
    /platform_admin_memberships_auth_user_id_key unique \(auth_user_id\)/.test(sql));
  rule("membership targets a real auth identity",
    /foreign key \(auth_user_id\) references auth\.users \(id\)/.test(sql));

  // --- closed vocabularies ---------------------------------------------------------------------
  rule("only the platform_admin role key is admitted",
    /platform_admin_roles_role_key_check\s+check \(role_key = 'platform_admin'\)/.test(sql));
  rule("permission vocabulary is the closed RA-1A read list",
    /check \(permission_key in \('admin_context\.read', 'admin_audit\.read'\)\)/.test(sql));
  rule("permission vocabulary contains no write capability",
    !/permission_key in \([^)]*\.(write|create|update|delete|approve|manage)/.test(sql));

  // --- policies --------------------------------------------------------------------------------
  rule("no delete policy exists anywhere", !/for delete/.test(sql));
  rule("audit log has no update policy",
    !/create policy platform_admin_audit_log[\s\S]{0,120}?for update/.test(sql));
  rule("membership writes are scoped to the sealed writer only",
    /for insert to platform_admin_write_authority with check \(true\)/.test(sql)
    && /for update to platform_admin_write_authority using \(true\) with check \(true\)/.test(sql));
  rule("no policy names a client role",
    !/for (select|insert|update) to (anon|authenticated|authenticator|service_role|public)\b/.test(sql));

  // --- definer boundary ------------------------------------------------------------------------
  const definers = sql.match(/security definer/g) ?? [];
  const pinnedPath = sql.match(/set search_path = ''/g) ?? [];
  const pinnedRls = sql.match(/set row_security = 'on'/g) ?? [];
  rule("every SECURITY DEFINER pins an empty search_path",
    definers.length === 5 && pinnedPath.length === 5 && pinnedRls.length === 5);
  rule("the read boundary takes no actor parameter",
    /create function public\.platform_admin_current_context_v1\(\)/.test(sql));
  rule("the actor is resolved only from the verified request claims",
    (sql.match(/request\.jwt\.claim\.sub/g) ?? []).length >= 2
    && !/p_actor_auth_user_id[^\n]*where[^\n]*membership\.auth_user_id/.test(sql));
  rule("public read functions are owned by the sealed reader",
    /alter function public\.platform_admin_current_context_v1\(\)\s+owner to platform_admin_context_reader;/.test(sql)
    && /alter function public\.platform_admin_has_permission_v1\(text\)\s+owner to platform_admin_context_reader;/.test(sql)
    && /alter function public\.platform_admin_audit_log_v1\(integer\)\s+owner to platform_admin_context_reader;/.test(sql));
  rule("provisioning functions are owned by the sealed writer",
    /alter function admin_internal\.grant_platform_admin\(uuid, text, uuid, text\)\s+owner to platform_admin_write_authority;/.test(sql)
    && /alter function admin_internal\.revoke_platform_admin\(uuid, uuid, text\)\s+owner to platform_admin_write_authority;/.test(sql));

  // --- role graph ------------------------------------------------------------------------------
  //
  // The invariant: no client or runtime role may be a member of either sealed role, directly or
  // indirectly, and no sealed role may be a member of a client role. `GRANT reader TO authenticated`
  // makes authenticated a MEMBER of reader and is forbidden; the direction matters, so both are
  // checked. NOINHERIT is not treated as protection — the correct state is no membership at all.
  const membershipGrants = [...sql.matchAll(
    /grant\s+(platform_admin_context_reader|platform_admin_write_authority)\s+to\s+([a-z_]+)/g)];
  rule("the only sealed-role memberships granted are the two transient postgres bootstraps",
    membershipGrants.length === 2 && membershipGrants.every((match) => match[2] === "postgres"));
  for (const client of ["authenticated", "anon", "authenticator", "service_role", "public"]) {
    rule(`${client} is never granted membership of a sealed role`,
      !new RegExp(`grant\\s+platform_admin_(context_reader|write_authority)\\s+to\\s+[^;]*\\b${client}\\b`)
        .test(sql));
    rule(`no sealed role is ever granted membership of ${client}`,
      !new RegExp(`grant\\s+${client}\\s+to\\s+platform_admin_`).test(sql));
  }
  rule("both transient postgres memberships are the only ones and both are revoked",
    (sql.match(/revoke platform_admin_(context_reader|write_authority) from postgres granted by postgres;/g) ?? [])
      .length === 2);
  rule("no SET ROLE seam to a sealed role is created", !/set\s+role\s+platform_admin_/.test(sql));
  rule("no sealed role is made a default or session role for a client",
    !/alter\s+role\s+(authenticated|anon|authenticator|service_role)\b/.test(sql));

  // --- execution grants ------------------------------------------------------------------------
  rule("unintended EXECUTE is revoked from every RA-1A function, for every client role",
    (sql.match(new RegExp(
      `revoke all on function (public|admin_internal)\\.[a-z_0-9]+\\([a-z, ]*\\)\\s+from ${RA1A_CLIENT_ROLE_LIST};`,
      "g")) ?? []).length === 5);
  rule("public read functions are granted to authenticated only",
    (sql.match(/grant execute on function public\.platform_admin_[a-z_0-9]+\([a-z ,]*\) to authenticated;/g) ?? []).length === 3
    && !/grant execute on function public\.platform_admin_[\s\S]{0,80}?to (anon|service_role|public)\b/.test(sql));
  rule("no client-callable make-me-admin path exists",
    !/grant execute on function admin_internal\./.test(sql));

  // --- privilege / ownership statement order -----------------------------------------------------
  //
  // The defect this pins was found by live Development inspection, not by any text rule: the
  // migration transferred function ownership and only then issued its REVOKE/GRANT block. A REVOKE
  // by a role that no longer owns the object is NOT an error — PostgreSQL warns and changes
  // nothing — so all eight statements silently no-opped and PUBLIC kept EXECUTE on all five
  // functions. Text alone cannot see privilege semantics, but it can see statement order, so order
  // is what is pinned: for every function, every privilege statement must precede its transfer.
  const ownershipIndexes = [];
  for (const fn of RA1A_FUNCTIONS) {
    const sig = escapeRa1aRegex(fn.signature);
    const ownerAt = sql.search(new RegExp(`alter function ${sig}\\s+owner to ${fn.owner};`));
    const revokeAt = sql.search(new RegExp(`revoke all on function ${sig}\\s+from ${RA1A_CLIENT_ROLE_LIST};`));
    const grantAt = sql.search(new RegExp(`grant execute on function ${sig} to authenticated;`));
    ownershipIndexes.push(ownerAt);
    rule(`${fn.signature} is owned by ${fn.owner}`, ownerAt >= 0);
    rule(`${fn.signature} revokes client EXECUTE before ownership moves`,
      revokeAt >= 0 && ownerAt > revokeAt);
    if (fn.clientExecutable) {
      rule(`${fn.signature} grants EXECUTE to authenticated before ownership moves`,
        grantAt >= 0 && ownerAt > grantAt);
    } else {
      rule(`${fn.signature} is granted EXECUTE to no role whatsoever`,
        !new RegExp(`grant execute on function ${sig}`).test(sql));
    }
  }
  rule("no function privilege statement survives past the first ownership transfer",
    ownershipIndexes.every((index) => index >= 0)
    && [...sql.matchAll(/(revoke all|grant execute) on function (public|admin_internal)\.[a-z_0-9]+\(/g)]
      .every((match) => match.index < Math.min(...ownershipIndexes)));

  // --- SQL construct qualification ---------------------------------------------------------------
  //
  // `least`, `greatest`, `coalesce` and `nullif` are SQL constructs, not schema-qualifiable
  // functions: PostgreSQL exposes no pg_catalog entry for them, so `pg_catalog.least(...)` raises
  // 42883 when the function body is parsed. They must stay bare even inside a definer that pins an
  // empty search_path — the empty path does not reach them, because they are resolved by the
  // grammar rather than by name. The detector is call-shaped and runs on comment-stripped SQL, so
  // prose that merely names a construct is never matched, and genuine qualified calls such as
  // `pg_catalog.btrim(...)` are left alone.
  for (const construct of ["least", "greatest", "coalesce", "nullif"]) {
    rule(`the SQL construct ${construct} is never schema-qualified`,
      !new RegExp(`[a-z_][a-z0-9_]*\\s*\\.\\s*${construct}\\s*\\(`).test(sql));
  }
  rule("the audit-log limit clamp is written with bare SQL constructs",
    /limit least\(greatest\(coalesce\(requested_limit, 100\), 1\), 500\);/.test(sql));
  // The converse guarantee: every name that IS qualified must be a real catalogue function. This
  // allowlist was resolved against a live PostgreSQL 17.6 pg_proc; widening it is a decision, not a
  // typo, and an unlisted name fails here instead of at the next Development apply.
  const catalogFunctions = ["btrim", "clock_timestamp", "count", "current_setting",
    "gen_random_uuid", "jsonb_build_object"];
  rule("every pg_catalog-qualified call names a genuine catalogue function",
    [...sql.matchAll(/\bpg_catalog\s*\.\s*([a-z_][a-z0-9_]*)\s*\(/g)]
      .every((match) => catalogFunctions.includes(match[1])));

  // --- foreign-schema authority --------------------------------------------------------------------
  //
  // A sealed admin_internal definer must not reach into a foreign private schema its owner has no
  // pinned privilege contract for. `grant_platform_admin` originally preflighted the target against
  // auth.users; the sealed writer holds no USAGE on the auth schema, so the body raised 42501 the
  // first time it ran — and the migration could not have granted that USAGE anyway, because the auth
  // schema is owned by supabase_admin and postgres holds USAGE without grant option. The foreign key
  // is the identity authority instead, and both halves of that decision are pinned here: no direct
  // read, and no widening of the sealed role to make one possible.
  // Scoped to function bodies specifically. The migration must still NAME auth.users once, in the
  // foreign key that is now the identity authority; it is the executable body that must never read
  // it. A whole-file rule would contradict the FK it depends on.
  const functionBodies = [...sql.matchAll(/as \$\$([\s\S]*?)\$\$;/g)].map((match) => match[1]).join("\n");
  rule("no RA-1A function body reads the auth schema directly", !/\bauth\./.test(functionBodies));
  rule("the sealed writer is never granted reach into the auth schema",
    !/grant[^;]*\bon schema auth\b[^;]*to\s+platform_admin_/.test(sql)
    && !/grant[^;]*\bon\s+auth\.[a-z_]+[^;]*to\s+platform_admin_/.test(sql)
    && !/grant[^;]*\bto\s+platform_admin_write_authority[^;]*\bauth\b/.test(sql));
  rule("no sealed role is granted membership of a Supabase platform or auth role",
    !/grant\s+(supabase_admin|supabase_auth_admin|service_role|supabase_storage_admin|dashboard_user)\s+to\s+platform_admin_/
      .test(sql));
  rule("target identity existence is delegated to the foreign key",
    /foreign key \(auth_user_id\) references auth\.users \(id\)/.test(sql)
    && /when foreign_key_violation then/.test(sql));
  rule("only the target-identity constraint is translated into a user-facing rejection",
    // CONSTRAINT_NAME, not PG_CONSTRAINT_NAME: the latter is not a GET DIAGNOSTICS item and
    // PL/pgSQL rejects it at CREATE FUNCTION with 42601. Pinned so the working spelling stays.
    /get stacked diagnostics v_constraint_name = constraint_name;/.test(sql)
    && /if v_constraint_name <> 'platform_admin_memberships_auth_user_id_fkey' then\s*\n\s*raise;/
      .test(sql));
  rule("an unrecognised foreign-key violation is re-raised, never masked as unknown_identity",
    (sql.match(/\braise;/g) ?? []).length >= 1
    && /v_constraint_name <>[^\n]*\n\s*raise;\s*\n\s*end if;/.test(sql));
  rule("the exception block wraps only the membership write",
    /begin\s*\n\s*insert into admin_internal\.platform_admin_memberships/.test(sql)
    && !/begin\s*\n[\s\S]{0,200}?select role\.id into v_role_id[\s\S]*?exception/.test(sql));

  // --- audit foundation ------------------------------------------------------------------------
  rule("grant writes an audit row in the same statement flow",
    /insert into admin_internal\.platform_admin_audit_log[\s\S]{0,400}?'granted'/.test(sql));
  rule("revoke writes an audit row in the same statement flow",
    /insert into admin_internal\.platform_admin_audit_log[\s\S]{0,400}?'revoked'/.test(sql));
  rule("refusals are audited too", (sql.match(/'rejected'/g) ?? []).length >= 4);
  rule("revocation never deletes a membership",
    !/delete from admin_internal\.platform_admin_memberships/.test(sql));

  // --- transient privilege release -------------------------------------------------------------
  rule("both bootstrap memberships are released",
    /revoke platform_admin_context_reader from postgres granted by postgres;/.test(sql)
    && /revoke platform_admin_write_authority from postgres granted by postgres;/.test(sql));
  rule("both transient CREATE privileges are released",
    /revoke create on schema public from platform_admin_context_reader;/.test(sql)
    && /revoke create on schema admin_internal from platform_admin_write_authority;/.test(sql));
  rule("the migration is one transaction", /^begin;/m.test(sql) && /^commit;/m.test(sql));

  // --- server-only authority module ------------------------------------------------------------
  rule("authority module is server-only", /^import "server-only";/m.test(authority));
  rule("authority module holds no transport or environment access",
    !/createClient|process\.env|fetch\(/.test(authority));
  rule("authority module mirrors the closed permission vocabulary",
    /"admin_context\.read"/.test(authority) && /"admin_audit\.read"/.test(authority)
    && !/\.(write|create|update|delete|approve|manage)"/.test(authority));
  rule("authority module fails closed on an unrecognised vocabulary",
    /unrecognized_role/.test(authority) && /unrecognized_permission/.test(authority));
  rule("authority module separates not_admin from unavailable",
    /"not_admin"/.test(authority) && /"unavailable"/.test(authority));

  return Object.freeze(violations);
}

const normalize = (buffer) => Buffer.from(buffer).toString("utf8").replace(/\r\n/g, "\n");

export function createRa1aManifest(readFile) {
  const entries = RA1A_PATHS.map((file) => ({
    path: file,
    sha256: crypto.createHash("sha256").update(normalize(readFile(file)), "utf8").digest("hex")
  }));
  return Object.freeze({
    entries: Object.freeze(entries),
    aggregateSha256: crypto.createHash("sha256")
      .update(entries.map((entry) => `${entry.path}\0${entry.sha256}`).join("\n"))
      .digest("hex")
  });
}
