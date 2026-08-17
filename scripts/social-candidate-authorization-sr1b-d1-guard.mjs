#!/usr/bin/env node
// SR-1B-D1 guard — INTERNAL CANDIDATE AUTHORIZATION DATABASE AUTHORITY.
//
// Lifecycle-aware, never lifecycle-dependent: every assertion is a repository CONTENT assertion over
// the working tree, so the verdict is identical before and after the freeze commit. The only
// lifecycle-sensitive input is the manifest, read from the candidate while the round is open and
// from the freeze commit's own diff-tree once it has landed.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SR1C_SUCCESSOR_PATHS } from "./social-ingress-sr1c-successor-manifest.mjs";
import { SR1D_SUCCESSOR_PATHS } from "./social-taste-sr1d-successor-manifest.mjs";
import { SR2A_SUCCESSOR_PATHS } from "./social-ranking-sr2a-successor-manifest.mjs";
import { SR2B_SUCCESSOR_MIGRATION, SR2B_SUCCESSOR_PATHS } from "./social-exposure-sr2b-successor-manifest.mjs";
import { SR2C_SUCCESSOR_MIGRATION, SR2C_SUCCESSOR_PATHS } from "./social-profile-sr2c-successor-manifest.mjs";
import { SR2D_SUCCESSOR_PATHS } from "./social-candidate-sr2d-successor-manifest.mjs";
import { SR2E_SUCCESSOR_PATHS } from "./social-candidate-sr2e-successor-manifest.mjs";
import { SR2F_SUCCESSOR_PATHS } from "./social-candidate-sr2f-successor-manifest.mjs";
import { SR2GA_SUCCESSOR_PATHS } from "./social-candidate-sr2g-a-successor-manifest.mjs";
import { SR2GB_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-successor-manifest.mjs";
import { SR2GC_SUCCESSOR_PATHS } from "./social-candidate-sr2g-c-successor-manifest.mjs";
import { SR2GBR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-r1-successor-manifest.mjs";
import { SR2GCR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-c-r1-successor-manifest.mjs";
import { SR2CR1_SUCCESSOR_PATHS } from "./social-interest-sr2c-r1-successor-manifest.mjs";

const root = process.cwd();
const baseline = "98750c69775d5d15e8bbd32c06ee606d107f3e74";
const freezeMessage = "Add internal Candidate Authorization database authority";

const MIGRATION = "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql";
const BLOCK_MIGRATION = "supabase/migrations/20260810010000_social_block_authority.sql";
const PARTICIPATION_MIGRATION = "supabase/migrations/20260810020000_social_participation_authority.sql";
const domainRoot = "packages/shared/src/domain/taste-similarity";
const mobileTasteRoot = "apps/mobile/features/consumer-taste-profile";
const sr1aServerRoot = "supabase/functions/_shared";

const SCHEMA = "social_internal";
const ROLE = "social_authority";
const B3_SUCCESSOR_PATHS = Object.freeze([
  "supabase/functions/_shared/social-runtime-transport/denoPostgresExecutorTransport.ts",
  "supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts",
  "supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts"
]);

const ALLOWED_COLUMNS = {
  consumer_profiles: ["user_id", "status", "deleted_at"],
  social_participation: ["user_id", "state"],
  social_blocks: ["blocker_user_id", "blocked_user_id"]
};
const FORBIDDEN_COLUMNS = [
  "visibility", "willing_to_chat", "verification_status", "display_name", "public_bio",
  "diet_summary", "recent_meal_style", "nutrition_goal_summary", "anonymous_display_name",
  "mascot_avatar_key", "real_avatar_url", "opted_in_at", "updated_at", "created_at",
  "preferred_cuisine_tags", "disliked_tastes", "spice_preference", "goal_label"
];

const manifest = [
  "package.json",
  MIGRATION,
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-mutations.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-smoke.mjs",
  // Successor amendments to validation harnesses only — never to a predecessor implementation path.
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/social-participation-sr1b-c-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts3-guard.mjs",
  "scripts/taste-similarity-ts3b-r1-guard.mjs",
  "scripts/taste-similarity-ts3c-guard.mjs",
  "scripts/taste-similarity-ts3d-guard.mjs",
  "scripts/taste-similarity-ts3e-guard.mjs",
  "scripts/taste-similarity-ts4-guard.mjs",
  "scripts/taste-similarity-ts5-guard.mjs",
  "scripts/taste-similarity-ts6-guard.mjs"
].sort();

const checks = [];
const failures = [];
function check(name, condition, details = {}) {
  const result = { name, pass: Boolean(condition), ...details };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
function git(args, allowFailure = false) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr.trim()}`);
  return r;
}
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const lines = (v) => v.split(/\r?\n/).map((e) => e.trim()).filter(Boolean).sort();
const same = (a, b) => a.length === b.length && a.every((e, i) => e === b[i]);
function changedSince(ref, pathspec) {
  const tracked = lines(git(["diff", "--name-only", ref, "--", pathspec]).stdout);
  const untracked = lines(git(["ls-files", "--others", "--exclude-standard", "--", pathspec]).stdout);
  return [...new Set([...tracked, ...untracked])].map((e) => e.replaceAll("\\", "/")).sort();
}
function candidatePaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout.split("\0").filter(Boolean)
    .map((e) => e.slice(3).replaceAll("\\", "/")).sort();
}
// A migration that documents the concepts it refuses must be allowed to name them. Concept bans are
// evaluated against executable SQL with `--` comments stripped; `comment on` statements are SQL that
// is documentation, so they are stripped too for concept bans.
function executableSql(source) {
  return source.split("\n").map((line) => {
    const t = line.trim();
    if (t.startsWith("--")) return "";
    const at = line.indexOf("--");
    return at === -1 ? line : line.slice(0, at);
  }).join("\n");
}
function packageOnlyAddsValidationScripts(freezeCommit) {
  const before = JSON.parse(git(["show", `${baseline}:package.json`]).stdout);
  const after = JSON.parse(freezeCommit ? git(["show", `${freezeCommit}:package.json`]).stdout : read("package.json"));
  for (const k of [
    "test:social-candidate-authorization-sr1b-d1",
    "test:social-candidate-authorization-sr1b-d1-smoke",
    "test:social-candidate-authorization-sr1b-d1-mutations"
  ]) delete after.scripts[k];
  return JSON.stringify(before) === JSON.stringify(after);
}

try {
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  const branch = git(["branch", "--show-current"]).stdout.trim();
  const freezeCandidates = git(["log", "--format=%H%x09%s", `${baseline}..HEAD`]).stdout.split(/\r?\n/).filter(Boolean)
    .map((e) => e.split("\t")).filter(([, s]) => s.startsWith(freezeMessage)).map(([c]) => c);
  const freezeCommit = freezeCandidates[0] ?? null;
  const lifecycleManifest = freezeCommit
    ? lines(git(["diff-tree", "--no-commit-id", "--name-only", "-r", freezeCommit]).stdout)
    : candidatePaths();

  const sqlRaw = read(MIGRATION);
  const sql = executableSql(sqlRaw);
  const sqlNoDocs = sql.replace(/comment on [\s\S]*?;\s*$/gim, "");

  // ---- 1-3. exact manifest ----------------------------------------------------------------------
  check("1. the SR-1B-D1 change set is exactly the enumerated manifest",
    same(lifecycleManifest, manifest), { expected: manifest, actual: lifecycleManifest });
  check("2. every manifest path exists on disk", manifest.every((e) => fs.existsSync(path.join(root, e))));
  check("3. package change adds only the three SR-1B-D1 validation commands",
    packageOnlyAddsValidationScripts(freezeCommit));

  // ---- 4-11. frozen authority untouched ---------------------------------------------------------
  check("4. not one byte of the frozen taste domain changed",
    changedSince(baseline, domainRoot).length === 0, { changed: changedSince(baseline, domainRoot) });
  check("5. not one byte of the frozen Mobile taste-profile feature changed",
    changedSince(baseline, mobileTasteRoot).filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry)).length === 0);
  check("6. no Mobile or app file changed — SR-1B-D1 is database authority only",
    changedSince(baseline, "apps").filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry)).length === 0, { changed: changedSince(baseline, "apps").filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry)) });
  check("7. no packages/ file changed", changedSince(baseline, "packages").filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry)).length === 0);
  check("8. not one byte of SR-1A's frozen server primitive changed",
    changedSince(baseline, sr1aServerRoot).filter((entry) => !B3_SUCCESSOR_PATHS.includes(entry) && !SR1C_SUCCESSOR_PATHS.includes(entry) && !SR1D_SUCCESSOR_PATHS.includes(entry) && !SR2A_SUCCESSOR_PATHS.includes(entry) && !SR2B_SUCCESSOR_PATHS.includes(entry) && !SR2C_SUCCESSOR_PATHS.includes(entry) && !SR2D_SUCCESSOR_PATHS.includes(entry) && !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry)).length === 0,
    { changed: changedSince(baseline, sr1aServerRoot).filter((entry) => !B3_SUCCESSOR_PATHS.includes(entry) && !SR1C_SUCCESSOR_PATHS.includes(entry) && !SR1D_SUCCESSOR_PATHS.includes(entry) && !SR2A_SUCCESSOR_PATHS.includes(entry) && !SR2B_SUCCESSOR_PATHS.includes(entry) && !SR2C_SUCCESSOR_PATHS.includes(entry) && !SR2D_SUCCESSOR_PATHS.includes(entry) && !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry)) });
  check("9. SR-1B-B's frozen block migration is byte-unchanged",
    changedSince(baseline, BLOCK_MIGRATION).length === 0);
  check("10. SR-1B-C's frozen participation migration is byte-unchanged",
    changedSince(baseline, PARTICIPATION_MIGRATION).length === 0);
  // SR-1B-D2-B1 adds the next Social migration. Check 11 was a whole-prefix assertion and would
  // report a successor's migration as an SR-1B-D1 scope violation. The successor path is enumerated
  // EXACTLY; 11a additionally constrains what the allowance may ever contain.
  const SOCIAL_SUCCESSOR_MIGRATIONS = Object.freeze([
    "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql",
    "supabase/migrations/20260810050000_social_runtime_executor_role.sql"
  ]);
  const supabaseChanged = changedSince(baseline, "supabase")
    .filter((entry) => !SOCIAL_SUCCESSOR_MIGRATIONS.includes(entry) && !B3_SUCCESSOR_PATHS.includes(entry) && !SR1C_SUCCESSOR_PATHS.includes(entry) && !SR1D_SUCCESSOR_PATHS.includes(entry) && !SR2A_SUCCESSOR_PATHS.includes(entry) && !SR2B_SUCCESSOR_PATHS.includes(entry) && !SR2C_SUCCESSOR_PATHS.includes(entry) && !SR2D_SUCCESSOR_PATHS.includes(entry) && !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry));
  check("11. the only supabase change attributable to SR-1B-D1 is its single migration",
    same(supabaseChanged, [MIGRATION]), { changed: supabaseChanged });
  check("11a. the Social successor allowance is exactly enumerated additive migrations that cannot reach config or an Edge Function",
    SOCIAL_SUCCESSOR_MIGRATIONS.length >= 1
    && new Set(SOCIAL_SUCCESSOR_MIGRATIONS).size === SOCIAL_SUCCESSOR_MIGRATIONS.length
    && SOCIAL_SUCCESSOR_MIGRATIONS.every((e) => /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(e))
    && !SOCIAL_SUCCESSOR_MIGRATIONS.some((e) => e.includes("config.toml") || e.includes("/functions/")));
  check("11b. SR-2A successor paths are wildcard-free and any Supabase delta is confined to the pure shared ranking module", SR2A_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2A_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-ranking/"))
    && !SR2A_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry.startsWith("supabase/migrations/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("11c. SR-2B successor paths are wildcard-free and confined to the pure shared exposure module plus exactly one grant migration", SR2B_SUCCESSOR_PATHS.length > 0
    && new Set(SR2B_SUCCESSOR_PATHS).size === SR2B_SUCCESSOR_PATHS.length
    && SR2B_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-exposure/") || entry === SR2B_SUCCESSOR_MIGRATION)
    && SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2B_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("11d. SR-2C successor paths are wildcard-free and confined to the pure shared profile module plus exactly one projection migration", SR2C_SUCCESSOR_PATHS.length > 0
    && new Set(SR2C_SUCCESSOR_PATHS).size === SR2C_SUCCESSOR_PATHS.length
    && SR2C_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-profile/") || entry === SR2C_SUCCESSOR_MIGRATION)
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2C_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));

  // ---- 12-15. schema exposure boundary ----------------------------------------------------------
  check(`12. the migration creates the internal schema ${SCHEMA}`,
    new RegExp(`create schema ${SCHEMA};`, "i").test(sql));
  // The header legitimately explains WHY the schema is non-exposed, so the token ban is evaluated
  // against executable SQL only. The invariant is that no STATEMENT alters the exposure config.
  check("13. the Data API exposed-schema configuration is NOT touched",
    changedSince(baseline, "supabase/config.toml").every((entry) => SR1C_SUCCESSOR_PATHS.includes(entry) || SR1D_SUCCESSOR_PATHS.includes(entry))
    && !/db[_-]schemas?\b|PGRST_DB_SCHEMAS/i.test(sql)
    && !/alter\s+system|pgrst\.db_schemas|notify\s+pgrst|set_config\s*\(\s*'pgrst/i.test(sql));
  check(`14. no USAGE or CREATE on ${SCHEMA} is granted to any client role`,
    !new RegExp(`grant[^;]*on schema ${SCHEMA}[^;]*to[^;]*\\b(public|anon|authenticated|authenticator)\\b`, "i").test(sql));
  check(`15. ${SCHEMA} is explicitly revoked from every client role and PUBLIC`,
    ["public", "anon", "authenticated", "authenticator"].every((r) =>
      new RegExp(`revoke all on schema ${SCHEMA} from ${r};`, "i").test(sql)));

  // ---- 16-23. authority role --------------------------------------------------------------------
  const createRole = (sql.match(/create role social_authority with([\s\S]*?);/i) ?? [])[1] ?? "";
  for (const attribute of ["nologin", "noinherit", "nobypassrls", "nocreatedb", "nocreaterole", "nosuperuser"]) {
    check(`16. the role is declared ${attribute.toUpperCase()}`, new RegExp(`\\b${attribute}\\b`, "i").test(createRole));
  }
  check("17. no LOGIN role is introduced anywhere — transport is SR-1B-D2's responsibility",
    !/\bwith[^;]*\blogin\b/i.test(sql.replace(/nologin/gi, ""))
    && !/create role [a-z_]*executor/i.test(sql) && !/\bpassword\b/i.test(sql));
  check("18. the role is never granted BYPASSRLS or SUPERUSER later",
    !/alter role social_authority[^;]*(bypassrls|superuser|login|createrole|createdb)/i.test(sql.replace(/no(bypassrls|superuser|login|createrole|createdb)/gi, "")));
  check("19. the role owns no source table — no ownership of a public table is transferred",
    !/alter table[^;]*owner to/i.test(sql));
  check("20. the role owns only the internal functions",
    (sql.match(/alter function social_internal\.[a-z_]+\([^)]*\) owner to social_authority;/gi) ?? []).length === 2);
  check("21. CREATE on the internal schema is transient and revoked before the migration ends",
    new RegExp(`grant create on schema ${SCHEMA} to ${ROLE};`, "i").test(sql)
    && new RegExp(`revoke create on schema ${SCHEMA} from ${ROLE};`, "i").test(sql)
    && sql.indexOf(`revoke create on schema ${SCHEMA}`) > sql.indexOf(`grant create on schema ${SCHEMA}`));
  check("22. no CREATE is granted on public or any other schema",
    !/grant[^;]*create[^;]*on schema (public|auth|extensions|storage|graphql)/i.test(sql));
  check("23. transient postgres membership is taken explicitly and released in the same migration",
    /grant social_authority to postgres with inherit false, set true;/i.test(sql)
    && /revoke social_authority from postgres;/i.test(sql)
    && sql.indexOf("revoke social_authority from postgres") > sql.indexOf("grant social_authority to postgres"));
  check("24. no client role is ever made a member of the authority role",
    !/grant social_authority to (anon|authenticated|authenticator|service_role)/i.test(sql));

  // ---- 25-29. data minimization -----------------------------------------------------------------
  const columnGrants = [...sql.matchAll(/grant select \(([^)]*)\) on table public\.([a-z_]+) to social_authority;/gi)]
    .map((m) => ({ table: m[2], columns: m[1].split(",").map((c) => c.trim()) }));
  check("25. exactly three column-level SELECT grants exist",
    columnGrants.length === 3, { grants: columnGrants.map((g) => `${g.table}(${g.columns.join(",")})`) });
  check("26. the granted columns are exactly the seven the predicate consumes",
    columnGrants.every((g) => ALLOWED_COLUMNS[g.table] && same([...g.columns].sort(), [...ALLOWED_COLUMNS[g.table]].sort()))
    && columnGrants.reduce((n, g) => n + g.columns.length, 0) === 7,
    { total: columnGrants.reduce((n, g) => n + g.columns.length, 0) });
  check("27. no whole-table grant is issued to the authority role",
    !/grant select on table public\.[a-z_]+ to social_authority/i.test(sql)
    && !/grant [a-z, ]*all[a-z, ]* on table[^;]*to social_authority/i.test(sql));
  check("28. no forbidden column appears in any grant",
    !columnGrants.some((g) => g.columns.some((c) => FORBIDDEN_COLUMNS.includes(c))),
    { offending: columnGrants.flatMap((g) => g.columns.filter((c) => FORBIDDEN_COLUMNS.includes(c))) });
  check("29. no Taste Foundation table is granted to the authority role",
    !/(taste_profiles|nutrition_goals|dietary_restrictions|meal_records|meal_record_items|favorite_restaurants|favorite_menu_items)[^;]*to social_authority/i.test(sql));

  // ---- 30-34. RLS -------------------------------------------------------------------------------
  const authorityPolicies = [...sql.matchAll(/create policy ([a-z_]+) on public\.([a-z_]+)\s*\n?\s*for ([a-z]+) to ([a-z_]+) using \(([^;]*?)\);/gi)]
    .map((m) => ({ name: m[1], table: m[2], command: m[3].toLowerCase(), role: m[4], using: m[5].trim() }));
  check("30. exactly three role-scoped policies are added, one per authority table",
    authorityPolicies.length === 3
    && same(authorityPolicies.map((p) => p.table).sort(), ["consumer_profiles", "social_blocks", "social_participation"]),
    { policies: authorityPolicies.map((p) => `${p.table}:${p.name}`) });
  check("31. every added policy is SELECT-only and scoped TO the authority role — never to a client role",
    authorityPolicies.every((p) => p.command === "select" && p.role === ROLE),
    { roles: authorityPolicies.map((p) => `${p.command}:${p.role}`) });
  check("32. no existing client policy is dropped, altered or replaced",
    !/drop policy|alter policy/i.test(sql)
    && !/create policy [a-z_]+ on public\.[a-z_]+\s*\n?\s*for [a-z]+ using/i.test(sql));
  check("33. no policy is added for public, anon or authenticated",
    !/create policy[^;]*to\s+(public|anon|authenticated|authenticator)\b/i.test(sql));
  check("34. row level security is never disabled or forced off on an existing table",
    !/disable row level security/i.test(sql));

  // ---- 35-42. the predicate ---------------------------------------------------------------------
  const functions = [...sql.matchAll(/create function (social_internal\.[a-z_]+)\(([\s\S]*?)\)\s*\nreturns ([a-z ]+)/gi)]
    .map((m) => ({ name: m[1], params: m[2].replace(/\s+/g, " ").trim(), returns: m[3].trim() }));
  check("35. exactly two internal functions are created, both in the internal schema",
    functions.length === 2 && functions.every((f) => f.name.startsWith(`${SCHEMA}.`)),
    { functions: functions.map((f) => `${f.name} -> ${f.returns}`) });
  check("36. the pair predicate returns a bare boolean with no denial reason",
    functions.some((f) => f.name === `${SCHEMA}.may_evaluate_candidate` && f.returns === "boolean")
    && !/denial_reason|deny_reason|reason_code|'denied'|failure_reason/i.test(sqlNoDocs));
  check("37. the set primitive returns the authorized subset only",
    functions.some((f) => f.name === `${SCHEMA}.authorized_candidates` && /setof uuid/i.test(f.returns)));
  check("38. the pair predicate DELEGATES to the set primitive — one canonical implementation",
    /from social_internal\.authorized_candidates\(p_actor_user_id, array\[p_candidate_user_id\]\)/i.test(sql));
  check("39. both functions are SECURITY DEFINER with a pinned search_path and no dynamic SQL",
    (sql.match(/security definer/gi) ?? []).length === 2
    && (sql.match(/set search_path = pg_catalog, pg_temp/gi) ?? []).length === 2
    && !/\bexecute\s+(format|'|")/i.test(sql) && !/quote_ident|quote_literal/i.test(sql));
  check("40. the predicate contains every one of the eight canonical conjuncts",
    /candidate\.user_id <> p_actor_user_id/i.test(sql)
    && (sql.match(/cp\.status = 'active' and cp\.deleted_at is null/gi) ?? []).length === 2
    && (sql.match(/sp\.state = 'opted_in'/gi) ?? []).length === 2
    && /sb\.blocker_user_id = p_actor_user_id and sb\.blocked_user_id = candidate\.user_id/i.test(sql)
    && /sb\.blocker_user_id = candidate\.user_id and sb\.blocked_user_id = p_actor_user_id/i.test(sql));
  check("41. account checks fail closed against the unenforced user_id uniqueness",
    (sql.match(/cp\.status <> 'active' or cp\.deleted_at is not null/gi) ?? []).length === 2);
  check("42. no SELECT * and no wildcard column reference anywhere",
    !/select\s+\*/i.test(sql) && !/select\s+[a-z_]+\.\*/i.test(sql));

  // ---- 43-48. exposure and scope prohibitions ---------------------------------------------------
  check("43. no function is created in the public schema",
    !/create (or replace )?function public\./i.test(sql));
  check("44. EXECUTE is never granted to any client role or to service_role",
    !/grant execute[^;]*to[^;]*\b(public|anon|authenticated|authenticator|service_role)\b/i.test(sql)
    && !/grant execute/i.test(sql));
  check("45. EXECUTE is explicitly revoked from PUBLIC and every client role",
    ["public", "anon", "authenticated", "authenticator"].every((r) =>
      (sql.match(new RegExp(`revoke all on function social_internal\\.[a-z_]+\\([^)]*\\) from ${r};`, "gi")) ?? []).length === 2)
    && /alter default privileges in schema social_internal revoke execute on functions from public;/i.test(sql));
  // A REVOKE only removes grants made by the issuing role. Once ownership moves to social_authority,
  // a postgres-issued REVOKE FROM PUBLIC is a silent no-op and PUBLIC keeps the built-in EXECUTE.
  // Development acceptance caught this, so the ordering is now asserted rather than assumed.
  check("45a. the PUBLIC revokes run BEFORE the ownership transfer, while postgres is still grantor",
    sql.indexOf("revoke all on function social_internal.authorized_candidates(uuid, uuid[]) from public;")
      < sql.indexOf("alter function social_internal.authorized_candidates(uuid, uuid[]) owner to social_authority;")
    && sql.indexOf("revoke all on function social_internal.may_evaluate_candidate(uuid, uuid) from public;")
      < sql.indexOf("alter function social_internal.may_evaluate_candidate(uuid, uuid) owner to social_authority;"));
  check("46. no service-role or admin credential dependency is introduced",
    !/service_role|sb_secret|ADMIN_KEY|SUPABASE_SERVICE_ROLE_KEY/i.test(sqlRaw.replace(/-- .*/g, "")));
  check("47. no Taste read, candidate pool, ranking, entitlement or relationship state appears",
    !/taste_profiles|nutrition_goals|dietary_restrictions|meal_records|favorite_|candidate_pool|\brank\b|ranking|entitlement|subscription|invitation|\bmatch(es)?\b|\bchat\b/i.test(sqlNoDocs));
  check("48. no Edge Function, no config registration, no Production reference",
    changedSince(baseline, "supabase/functions").filter((entry) => !B3_SUCCESSOR_PATHS.includes(entry) && !SR1C_SUCCESSOR_PATHS.includes(entry) && !SR1D_SUCCESSOR_PATHS.includes(entry) && !SR2A_SUCCESSOR_PATHS.includes(entry) && !SR2B_SUCCESSOR_PATHS.includes(entry) && !SR2C_SUCCESSOR_PATHS.includes(entry) && !SR2D_SUCCESSOR_PATHS.includes(entry) && !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry)).length === 0
    && /\[functions\.social-candidate-provenance\][^[]*verify_jwt = true/.test(read("supabase/config.toml"))
    && !/\bproduction\b/i.test(sqlRaw));

  console.log(JSON.stringify({
    guard: "social-candidate-authorization-sr1b-d1",
    status: failures.length ? "failed" : "passed",
    lifecycle: freezeCommit ? "frozen_successor" : "implementation_candidate",
    branch, head, baseline, freezeCommit,
    totalChecks: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
  }, null, 2));
  process.exit(failures.length ? 1 : 0);
} catch (error) {
  console.error(`GUARD ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
