#!/usr/bin/env node
// SR-1B-D2-B1 guard — AUTHORIZED PRIVATE TASTE READ DATABASE AUTHORITY.
//
// Lifecycle-aware, never lifecycle-dependent: every assertion is a repository CONTENT assertion, so
// the verdict is identical before and after the freeze commit. Only the manifest is lifecycle-
// sensitive, read from the candidate while the round is open and from the freeze commit afterwards.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const baseline = "45a115b4f481066e86a9d3e7d6edc967c584b214";
const freezeMessage = "Add authorized private Taste read database authority";

const MIGRATION = "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql";
const D1_MIGRATION = "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql";
const ROLE = "social_pair_read_authority";
const FN = "social_internal.authorized_pair_sources";
const B3_SUCCESSOR_PATHS = Object.freeze([
  "supabase/functions/_shared/social-runtime-transport/denoPostgresExecutorTransport.ts",
  "supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts",
  "supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts"
]);

// The exact fifty columns SR-1A declares, keyed by source.
const SR1A_COLUMNS = {
  taste_profiles: ["id", "user_id", "preferred_cuisine_tags", "preferred_meal_types", "disliked_tastes",
    "spice_preference", "dining_style", "payment_preference", "created_at", "updated_at"],
  nutrition_goals: ["id", "user_id", "goal_label", "starts_on", "ends_on", "is_active", "created_at", "updated_at"],
  dietary_restrictions: ["id", "user_id", "restriction_type", "label", "severity", "visibility", "created_at", "updated_at"],
  meal_records: ["id", "user_id", "meal_type", "occurred_at", "deleted_at"],
  meal_record_items: ["id", "user_id", "meal_record_id", "restaurant_id", "branch_id", "menu_item_id",
    "occurred_at", "consumed_ratio"],
  favorite_restaurants: ["id", "user_id", "restaurant_id", "created_at", "removed_at"],
  favorite_menu_items: ["id", "user_id", "restaurant_id", "menu_item_id", "created_at", "removed_at"]
};
const BOUNDED = { meal_records: "meal", meal_record_items: "meal", favorite_restaurants: "fav", favorite_menu_items: "fav" };
const FORBIDDEN = ["daily_calories_target", "protein_target_g", "carbohydrates_target_g", "fat_target_g",
  "fiber_target_g", "nutrition_snapshot", "display_name_snapshot", "user_entered_name", "ai_detected_name",
  "normalized_name", "portion_snapshot", "confidence_score", "nutrition_source", "collection_label", "sort_order"];

const manifest = [
  "package.json", MIGRATION,
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-authorized-pair-read-sr1b-d2-b1-mutations.mjs",
  "scripts/social-authorized-pair-read-sr1b-d2-b1-smoke.mjs",
  // Successor amendments to validation harnesses only.
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
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
const check = (name, cond, detail) => {
  const r = { name, pass: Boolean(cond), ...(detail === undefined ? {} : { detail }) };
  checks.push(r); if (!r.pass) failures.push(r);
  console.log(`${r.pass ? "PASS" : "FAIL"} ${name}`);
};
function git(a, allow = false) {
  const r = spawnSync("git", a, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allow && r.status !== 0) throw new Error(`git ${a.join(" ")} failed: ${r.stderr.trim()}`);
  return r;
}
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const lines = (v) => v.split(/\r?\n/).map((e) => e.trim()).filter(Boolean).sort();
const same = (a, b) => a.length === b.length && a.every((e, i) => e === b[i]);
function changedSince(ref, spec) {
  const t = lines(git(["diff", "--name-only", ref, "--", spec]).stdout);
  const u = lines(git(["ls-files", "--others", "--exclude-standard", "--", spec]).stdout);
  return [...new Set([...t, ...u])].map((e) => e.replaceAll("\\", "/")).sort();
}
const candidatePaths = () => git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout
  .split("\0").filter(Boolean).map((e) => e.slice(3).replaceAll("\\", "/")).sort();
const stripLineComments = (s) => s.split("\n").map((l) => {
  const t = l.trim(); if (t.startsWith("--")) return "";
  const at = l.indexOf("--"); return at === -1 ? l : l.slice(0, at);
}).join("\n");

try {
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  const branch = git(["branch", "--show-current"]).stdout.trim();
  const freeze = git(["log", "--format=%H%x09%s", `${baseline}..HEAD`]).stdout.split(/\r?\n/).filter(Boolean)
    .map((e) => e.split("\t")).filter(([, s]) => s.startsWith(freezeMessage)).map(([c]) => c)[0] ?? null;
  const lifecycleManifest = freeze
    ? lines(git(["diff-tree", "--no-commit-id", "--name-only", "-r", freeze]).stdout)
    : candidatePaths();

  const raw = read(MIGRATION);
  const sql = stripLineComments(raw);
  // `comment on ... is '...'` is documentation expressed as SQL; concept bans exclude it.
  const sqlNoDocs = sql.replace(/comment on [\s\S]*?;\s*$/gim, "");
  const fnBody = (sql.match(/create function social_internal\.authorized_pair_sources[\s\S]*?\n\$\$;/i) ?? [""])[0];

  // ---- 1-3 manifest ------------------------------------------------------------------------------
  check("1. the change set is exactly the enumerated manifest", same(lifecycleManifest, manifest),
    { expected: manifest, actual: lifecycleManifest });
  check("2. every manifest path exists", manifest.every((e) => fs.existsSync(path.join(root, e))));
  const pkgBefore = JSON.parse(git(["show", `${baseline}:package.json`]).stdout);
  const pkgAfter = JSON.parse(freeze ? git(["show", `${freeze}:package.json`]).stdout : read("package.json"));
  for (const k of ["test:social-authorized-pair-read-sr1b-d2-b1", "test:social-authorized-pair-read-sr1b-d2-b1-smoke",
    "test:social-authorized-pair-read-sr1b-d2-b1-mutations"]) delete pkgAfter.scripts[k];
  check("3. package change adds only the three B1 validation commands",
    JSON.stringify(pkgBefore) === JSON.stringify(pkgAfter));

  // ---- 4-9 frozen authority ----------------------------------------------------------------------
  for (const [n, p] of [["frozen taste domain", "packages/shared/src/domain/taste-similarity"],
    ["frozen Mobile taste feature", "apps/mobile/features/consumer-taste-profile"],
    ["any app file", "apps"], ["any packages file", "packages"],
    ["SR-1A server primitive", "supabase/functions/_shared"], ["D1 migration", D1_MIGRATION]]) {
    const changed = changedSince(baseline, p).filter((entry) => !B3_SUCCESSOR_PATHS.includes(entry));
    check(`4. ${n} is byte-unchanged outside exact B3 transport successors`, changed.length === 0, { changed });
  }
  // D2-B2 adds only the passwordless executor identity. Keep the B1 authority immutable while
  // allowing that exact additive successor migration; every other Supabase path still fails.
  const SOCIAL_SUCCESSOR_MIGRATIONS = Object.freeze([
    "supabase/migrations/20260810050000_social_runtime_executor_role.sql"
  ]);
  const supabaseChanged = changedSince(baseline, "supabase")
    .filter((entry) => !SOCIAL_SUCCESSOR_MIGRATIONS.includes(entry) && !B3_SUCCESSOR_PATHS.includes(entry));
  check("5. the only supabase change attributable to B1 is the single B1 migration",
    same(supabaseChanged, [MIGRATION]), { changed: supabaseChanged });
  check("5a. the successor allowance is one exact additive migration, never config or an Edge Function",
    SOCIAL_SUCCESSOR_MIGRATIONS.length === 1
    && SOCIAL_SUCCESSOR_MIGRATIONS.every((entry) => /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(entry))
    && !SOCIAL_SUCCESSOR_MIGRATIONS.some((entry) => entry.includes("config.toml") || entry.includes("/functions/")));

  // ---- 10-16 role --------------------------------------------------------------------------------
  const createRole = (sql.match(/create role social_pair_read_authority with([\s\S]*?);/i) ?? [])[1] ?? "";
  for (const attr of ["nologin", "noinherit", "nobypassrls", "nocreatedb", "nocreaterole", "nosuperuser"]) {
    check(`10. the role is ${attr.toUpperCase()}`, new RegExp(`\\b${attr}\\b`, "i").test(createRole));
  }
  check("11. no LOGIN role and no password is introduced",
    !/\bwith[^;]*\blogin\b/i.test(sql.replace(/nologin/gi, "")) && !/\bpassword\b/i.test(sql)
    && !/create role [a-z_]*executor/i.test(sql));
  check("12. the role owns no table — no table ownership is transferred",
    !/alter table[^;]*owner to/i.test(sql));
  check("13. the role owns only the one B1 function",
    (sql.match(/alter function social_internal\.[a-z_]+\([^)]*\)\s*owner to social_pair_read_authority;/gi) ?? []).length === 1);
  check("14. CREATE on the internal schema is transient and revoked",
    new RegExp(`grant create on schema social_internal to ${ROLE};`, "i").test(sql)
    && new RegExp(`revoke create on schema social_internal from ${ROLE};`, "i").test(sql)
    && sql.indexOf(`revoke create on schema social_internal from ${ROLE}`) > sql.indexOf(`grant create on schema social_internal to ${ROLE}`));
  check("15. no CREATE is granted on public or any other schema",
    !/grant[^;]*create[^;]*on schema (public|auth|extensions|storage|graphql)/i.test(sql));
  check("16. both transient memberships are released, and no client role is ever a member",
    /revoke social_authority from postgres;/i.test(sql)
    && /revoke social_pair_read_authority from postgres;/i.test(sql)
    && !/grant social_(authority|pair_read_authority) to (anon|authenticated|authenticator|service_role)/i.test(sql));

  // ---- 17-22 data minimization -------------------------------------------------------------------
  const grants = [...sql.matchAll(/grant select \(([\s\S]*?)\)\s*\n?\s*on table public\.([a-z_]+) to social_pair_read_authority;/gi)]
    .map((m) => ({ table: m[2], columns: m[1].split(",").map((c) => c.trim()).filter(Boolean) }));
  check("17. exactly seven column-level grants exist", grants.length === 7, { grants: grants.map((g) => g.table) });
  check("18. the granted columns are exactly SR-1A's fifty",
    grants.every((g) => SR1A_COLUMNS[g.table] && same([...g.columns].sort(), [...SR1A_COLUMNS[g.table]].sort()))
    && grants.reduce((n, g) => n + g.columns.length, 0) === 50,
    { total: grants.reduce((n, g) => n + g.columns.length, 0) });
  check("19. no whole-table grant to the authority role",
    !/grant select on table public\.[a-z_]+ to social_pair_read_authority/i.test(sql)
    && !/grant[^;]*\ball\b[^;]*on table[^;]*to social_pair_read_authority/i.test(sql));
  check("20. no forbidden column appears in any grant or in the function body",
    !FORBIDDEN.some((c) => new RegExp(`\\b${c}\\b`).test(sqlNoDocs)),
    { offending: FORBIDDEN.filter((c) => new RegExp(`\\b${c}\\b`).test(sqlNoDocs)) });
  check("21. no ratings source is granted or read", !/rating/i.test(sqlNoDocs));
  check("22. no SELECT * and no wildcard column reference",
    !/select\s+\*/i.test(sql) && !/select\s+[a-z_]+\.\*/i.test(sql));
  check("22a. D1's social_authority receives no Taste grant here",
    !/to social_authority;/i.test(sql.replace(/grant social_authority to postgres[^;]*;/gi, "")));

  // ---- 23-25 RLS ---------------------------------------------------------------------------------
  const policies = [...sql.matchAll(/create policy ([a-z_]+) on public\.([a-z_]+)\s*\n?\s*for ([a-z]+) to ([a-z_]+) using \(([^;]*?)\);/gi)]
    .map((m) => ({ name: m[1], table: m[2], cmd: m[3].toLowerCase(), role: m[4] }));
  check("23. exactly seven role-scoped policies, one per source table",
    policies.length === 7 && same(policies.map((p) => p.table).sort(), Object.keys(SR1A_COLUMNS).sort()),
    { policies: policies.map((p) => p.table) });
  check("24. every policy is SELECT-only and scoped TO the pair-read role",
    policies.every((p) => p.cmd === "select" && p.role === ROLE));
  check("25. no existing policy is dropped or altered, no policy targets a client role, RLS never disabled",
    !/drop policy|alter policy|disable row level security/i.test(sql)
    && !/create policy[^;]*to\s+(public|anon|authenticated|authenticator)\b/i.test(sql));

  // ---- 26-31 the function ------------------------------------------------------------------------
  check("26. exactly one function is created, in the internal schema",
    (sql.match(/create function social_internal\.[a-z_]+\(/gi) ?? []).length === 1
    && !/create (or replace )?function public\./i.test(sql));
  check("27. it is SECURITY DEFINER, STABLE, pinned search_path, no dynamic SQL",
    /security definer/i.test(fnBody) && /\bstable\b/i.test(fnBody)
    && /set search_path = pg_catalog, pg_temp/i.test(fnBody)
    && !/\bexecute\s+(format|'|")/i.test(sql) && !/quote_ident|quote_literal/i.test(sql));
  check("28. it calls D1's canonical set primitive and never re-implements authorization",
    /social_internal\.authorized_candidates\(p_actor_user_id, p_candidate_user_ids\)/i.test(fnBody)
    && !/social_blocks|social_participation|consumer_profiles/i.test(fnBody));
  check("28a. only D1's SET primitive is granted — never may_evaluate_candidate",
    /grant execute on function social_internal\.authorized_candidates\(uuid, uuid\[\]\)\s*\n?\s*to social_pair_read_authority;/i.test(sql)
    && !/grant execute on function social_internal\.may_evaluate_candidate/i.test(sql));
  check("29. ONE SQL statement: the body has a single terminating semicolon and no procedural block",
    (fnBody.match(/;\s*\n\$\$/g) ?? []).length === 1
    && !/\bbegin\b[\s\S]*\bend\b/i.test(fnBody.replace(/\$\$[\s\S]*?\$\$/, "")) && !/language plpgsql/i.test(fnBody));
  check("30. every source subquery is gated by the authorized subject set",
    (fnBody.match(/from subjects s/gi) ?? []).length >= 7,
    { gated: (fnBody.match(/from subjects s/gi) ?? []).length });
  check("31. every row-bearing source is explicitly user_id scoped",
    (fnBody.match(/\.user_id = s\.user_id/gi) ?? []).length === 7,
    { scoped: (fnBody.match(/\.user_id = s\.user_id/gi) ?? []).length });

  // ---- 32-36 bounding, truncation, ordering ------------------------------------------------------
  check("32. bounded sources use a PER-SUBJECT lateral, never one global LIMIT",
    (fnBody.match(/left join lateral \(/gi) ?? []).length === 4
    && !/where[^)]*user_id = any\(/i.test(fnBody));
  check("33. each bounded source fetches limit + 1 as an exact truncation sentinel",
    (fnBody.match(/limit p_meal_limit \+ 1/gi) ?? []).length === 2
    && (fnBody.match(/limit p_favorites_limit \+ 1/gi) ?? []).length === 2);
  check("34. has_more comes from the sentinel, never from a row-count heuristic",
    (fnBody.match(/'has_more', coalesce\(pg_catalog\.bool_or\(rn > p_(meal|favorites)_limit\), false\)/gi) ?? []).length === 4
    && !/returned_count\s*[><=]+\s*p_(meal|favorites)_limit/i.test(fnBody));
  check("35. every source reports requested_limit and returned_count",
    (fnBody.match(/'requested_limit',/g) ?? []).length === 7
    && (fnBody.match(/'returned_count',/g) ?? []).length === 7);
  // Scan each jsonb_agg( call to its matching close paren and require an ORDER BY inside it. A regex
  // cannot balance parentheses, and the earlier attempt to fake it let a dropped ORDER BY survive.
  const aggCalls = [];
  for (let i = fnBody.indexOf("jsonb_agg("); i !== -1; i = fnBody.indexOf("jsonb_agg(", i + 1)) {
    let depth = 0, j = i + "jsonb_agg".length;
    for (; j < fnBody.length; j += 1) {
      if (fnBody[j] === "(") depth += 1;
      else if (fnBody[j] === ")") { depth -= 1; if (depth === 0) break; }
    }
    aggCalls.push(fnBody.slice(i, j + 1));
  }
  const unordered = aggCalls.filter((call) => !/order by/i.test(call));
  check("36. every aggregated array is deterministically ordered — no bare jsonb_agg",
    aggCalls.length >= 8 && unordered.length === 0,
    { aggregates: aggCalls.length, unordered: unordered.map((c) => c.slice(0, 60)) });
  // Each bounded source states its canonical order TWICE — once inside row_number() so the sentinel
  // numbering matches, and once on the lateral itself so the limited window is the right one.
  check("36a. the four bounded sources use SR-1A's canonical order, in both the window and the lateral",
    (fnBody.match(/order by m\.occurred_at desc, m\.id/gi) ?? []).length === 2
    && (fnBody.match(/order by i\.occurred_at desc, i\.id/gi) ?? []).length === 2
    && (fnBody.match(/order by f\.created_at desc, f\.id/gi) ?? []).length === 4,
    {
      meal_records: (fnBody.match(/order by m\.occurred_at desc, m\.id/gi) ?? []).length,
      meal_record_items: (fnBody.match(/order by i\.occurred_at desc, i\.id/gi) ?? []).length,
      favorites: (fnBody.match(/order by f\.created_at desc, f\.id/gi) ?? []).length
    });

  // ---- 37-42 semantic boundary -------------------------------------------------------------------
  check("37. SQL does not re-filter what frozen TypeScript filters",
    !/where[^;]*deleted_at is null/i.test(fnBody) && !/where[^;]*removed_at is null/i.test(fnBody));
  check("38. SQL applies no date-window filter — SR-1A records the window, it does not query by it",
    !/occurred_at\s*(>=|<=|>|<|between)/i.test(fnBody) && !/p_meal_start|p_meal_end|requested_start/i.test(sql));
  check("39. the function reads no clock — as-of stays with the trusted orchestrator",
    !/\bnow\(\)|current_timestamp|clock_timestamp|current_date/i.test(fnBody));
  // Deliberately NOT word-bounded: `_` is a word character, so \bscore\b cannot match
  // `similarity_score` — a gap a mutation exploited. No legitimate identifier here contains these.
  check("40. no scoring, normalization or mapper construct exists in SQL",
    !/(jaccard|similarity|cosine|score|weight|ranking|confidence|cold_start|normalize)/i.test(sqlNoDocs),
    { offending: (sqlNoDocs.match(/[a-z_]*(jaccard|similarity|cosine|score|weight|ranking|confidence|cold_start|normalize)[a-z_]*/gi) ?? []).slice(0, 5) });
  check("41. the transport builds no snapshot or domain result",
    !/snapshot|adapter|policy_version|policyVersion|verdict|compatib/i.test(sqlNoDocs));
  check("42. no denial reason map is returned",
    !/denial|deny_reason|reason_code|unauthorized_reason/i.test(sqlNoDocs));

  // ---- 43-46 exposure ----------------------------------------------------------------------------
  check("43. EXECUTE is granted to no client role and not to service_role",
    !/grant execute[^;]*to[^;]*\b(public|anon|authenticated|authenticator|service_role)\b/i.test(sql));
  check("44. EXECUTE on the new function is explicitly revoked from PUBLIC and every client role, BEFORE the ownership transfer",
    ["public", "anon", "authenticated", "authenticator"].every((r) =>
      new RegExp(`revoke all on function social_internal\\.authorized_pair_sources\\([^)]*\\) from ${r};`, "i").test(sql))
    && sql.indexOf("revoke all on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) from public;")
      < sql.indexOf("alter function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer)\n  owner to"));
  check("45. no service-role or credential dependency, and the exposed-schema config is untouched",
    !/service_role|sb_secret|ADMIN_KEY|DATABASE_URL|db[_-]schemas?\b/i.test(sqlNoDocs)
    && changedSince(baseline, "supabase/config.toml").length === 0
    && !/social/i.test(read("supabase/config.toml")));
  check("46. no Edge Function, candidate pool, ranking, entitlement or client DTO appears",
    changedSince(baseline, "supabase/functions").filter((entry) => !B3_SUCCESSOR_PATHS.includes(entry)).length === 0
    && !/candidate_pool|entitlement|subscription|invitation|\bchat\b|\bdto\b/i.test(sqlNoDocs)
    && !/\bproduction\b/i.test(raw));

  console.log(JSON.stringify({
    guard: "social-authorized-pair-read-sr1b-d2-b1",
    status: failures.length ? "failed" : "passed",
    lifecycle: freeze ? "frozen_successor" : "implementation_candidate",
    branch, head, baseline, freezeCommit: freeze,
    totalChecks: checks.length, passed: checks.length - failures.length, failed: failures.length, failures,
    networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
  }, null, 2));
  process.exit(failures.length ? 1 : 0);
} catch (error) {
  console.error(`GUARD ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
