#!/usr/bin/env node
// SR-1B-D2-B1 mutation proof — AUTHORIZED PRIVATE TASTE READ.
//
// Each mutation rewrites REAL migration bytes, then requires the B1 guard or the B1 smoke to FAIL.
// The smoke compiles the conjuncts, laterals, sentinels and ordering from the migration at run time,
// so semantic mutations change behaviour rather than only tripping text assertions.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const M = path.join(root, "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql");
const run = (s) => spawnSync(process.execPath, [s], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;

function withMutated(targets, fn) {
  const originals = new Map(targets.map(({ file }) => [file, fs.readFileSync(file, "utf8")]));
  try {
    const mutated = new Map(originals);
    for (const { file, from, to } of targets) {
      const src = mutated.get(file);
      if (!src.includes(from)) return { applied: false, reason: `anchor not found: ${from.slice(0, 90)}` };
      mutated.set(file, src.replaceAll(from, to));
    }
    for (const [f, s] of mutated) fs.writeFileSync(f, s, "utf8");
    return { applied: true, value: fn() };
  } finally { for (const [f, s] of originals) fs.writeFileSync(f, s, "utf8"); }
}

const results = [];
function mutation(id, name, targets) {
  const o = withMutated(targets, () => {
    let g = false, s = false, crashed = false;
    try {
      g = !run("scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs");
      s = !run("scripts/social-authorized-pair-read-sr1b-d2-b1-smoke.mjs");
    } catch (e) { crashed = true; void e; }
    return { g, s, crashed };
  });
  if (!o.applied) { results.push({ id, name, killed: false, status: "anchor_missing", detail: o.reason }); return; }
  const killed = o.value.g || o.value.s;
  results.push({ id, name, killed, status: killed ? "killed" : o.value.crashed ? "harness_crash" : "survived",
    killedBy: [o.value.g && "guard", o.value.s && "smoke"].filter(Boolean) });
}

const CREATE_ROLE = "create role social_pair_read_authority with\n  nologin\n  noinherit\n  nobypassrls";
const REVOKE_CREATE = "revoke create on schema social_internal from social_pair_read_authority;";
const TP_GRANT = "grant select (id, user_id, preferred_cuisine_tags, preferred_meal_types, disliked_tastes,\n              spice_preference, dining_style, payment_preference, created_at, updated_at)\n  on table public.taste_profiles to social_pair_read_authority;";
const MR_POLICY = "create policy meal_records_pair_read_authority on public.meal_records\n  for select to social_pair_read_authority using (true);";
const D1_CALL = "from social_internal.authorized_candidates(p_actor_user_id, p_candidate_user_ids) as candidate(user_id)";
const ACTOR_GATE = "    select p_actor_user_id as user_id, true as is_actor\n    where exists (select 1 from authorized)";
const MR_LATERAL = "    left join lateral (\n      select m.id, m.user_id, m.meal_type, m.occurred_at, m.deleted_at,\n             pg_catalog.row_number() over (order by m.occurred_at desc, m.id) as rn\n      from public.meal_records m\n      where m.user_id = s.user_id\n      order by m.occurred_at desc, m.id\n      limit p_meal_limit + 1\n    ) bounded on true";
const MR_HASMORE = "'has_more', coalesce(pg_catalog.bool_or(rn > p_meal_limit), false)";

// ---- role boundary -------------------------------------------------------------------------------
mutation(1, "the pair-read role gains LOGIN",
  [{ file: M, from: CREATE_ROLE, to: "create role social_pair_read_authority with\n  login\n  noinherit\n  nobypassrls" }]);
mutation(2, "the pair-read role gains BYPASSRLS, defeating the RLS boundary",
  [{ file: M, from: CREATE_ROLE, to: "create role social_pair_read_authority with\n  nologin\n  noinherit\n  bypassrls" }]);
mutation(3, "CREATE on the internal schema is left granted",
  [{ file: M, from: `\n${REVOKE_CREATE}`, to: "" }]);
mutation(4, "the transient postgres membership is never released",
  [{ file: M, from: "\nrevoke social_pair_read_authority from postgres;", to: "" }]);

// ---- data minimization ---------------------------------------------------------------------------
mutation(5, "a whole-table SELECT replaces the column grant",
  [{ file: M, from: TP_GRANT, to: "grant select on table public.taste_profiles to social_pair_read_authority;" }]);
mutation(6, "an extra Taste column is granted",
  [{ file: M, from: "spice_preference, dining_style, payment_preference, created_at, updated_at)\n  on table public.taste_profiles",
     to: "spice_preference, dining_style, payment_preference, created_at, updated_at, id)\n  on table public.taste_profiles" }]);
mutation(7, "a nutrition macro target column is granted",
  [{ file: M, from: "grant select (id, user_id, goal_label, starts_on, ends_on, is_active, created_at, updated_at)",
     to: "grant select (id, user_id, goal_label, starts_on, ends_on, is_active, created_at, updated_at, daily_calories_target)" }]);
mutation(8, "a ratings source is granted",
  [{ file: M, from: REVOKE_CREATE,
     to: "grant select (id, user_id) on table public.user_restaurant_ratings to social_pair_read_authority;\n" + REVOKE_CREATE }]);
mutation(9, "D1's social_authority is widened with a Taste column",
  [{ file: M, from: REVOKE_CREATE,
     to: "grant select (user_id, spice_preference) on table public.taste_profiles to social_authority;\n" + REVOKE_CREATE }]);

// ---- RLS ------------------------------------------------------------------------------------------
mutation(10, "one source policy is omitted, so that source becomes unreadable/inconsistent",
  [{ file: M, from: `\n${MR_POLICY}`, to: "" }]);
mutation(11, "a source policy is scoped to authenticated, widening the client view",
  [{ file: M, from: MR_POLICY,
     to: "create policy meal_records_pair_read_authority on public.meal_records\n  for select to authenticated using (true);" }]);

// ---- exposure ---------------------------------------------------------------------------------------
mutation(12, "the function is created in the exposed public schema",
  [{ file: M, from: "create function social_internal.authorized_pair_sources(", to: "create function public.authorized_pair_sources(" }]);
mutation(13, "EXECUTE is granted to authenticated",
  [{ file: M, from: REVOKE_CREATE,
     to: "grant execute on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) to authenticated;\n" + REVOKE_CREATE }]);
mutation(14, "a service-role dependency is introduced",
  [{ file: M, from: REVOKE_CREATE,
     to: "grant execute on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) to service_role;\n" + REVOKE_CREATE }]);
mutation(15, "the PUBLIC revoke is moved AFTER the ownership transfer, silently leaving PUBLIC EXECUTE",
  [{ file: M, from: "revoke all on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) from public;\nrevoke all on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) from anon;",
     to: "revoke all on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) from anon;" },
   { file: M, from: "  owner to social_pair_read_authority;",
     to: "  owner to social_pair_read_authority;\nrevoke all on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) from public;" }]);

// ---- authorization semantics -------------------------------------------------------------------------
mutation(16, "authorization is bypassed — candidates are taken raw instead of from D1",
  [{ file: M, from: D1_CALL, to: "from pg_catalog.unnest(p_candidate_user_ids) as candidate(user_id)" }]);
mutation(17, "the actor is returned even when nothing is authorized",
  [{ file: M, from: ACTOR_GATE, to: "    select p_actor_user_id as user_id, true as is_actor\n    where p_actor_user_id is not null" }]);
mutation(18, "one source is no longer scoped to the authorized subject set",
  [{ file: M, from: "    from subjects s\n    left join public.taste_profiles t on t.user_id = s.user_id",
     to: "    from subjects s\n    left join public.taste_profiles t on true" }]);

// ---- bounding, truncation, ordering ------------------------------------------------------------------
mutation(19, "the per-subject lateral is replaced by one global limit across all subjects",
  [{ file: M, from: MR_LATERAL,
     to: "    left join lateral (\n      select m.id, m.user_id, m.meal_type, m.occurred_at, m.deleted_at,\n             pg_catalog.row_number() over (order by m.occurred_at desc, m.id) as rn\n      from public.meal_records m\n      where m.user_id = any(array(select user_id from subjects))\n      order by m.occurred_at desc, m.id\n      limit p_meal_limit\n    ) bounded on true" }]);
mutation(20, "the truncation sentinel is removed, leaving an ambiguous row-count heuristic",
  [{ file: M, from: "      limit p_meal_limit + 1\n    ) bounded on true", to: "      limit p_meal_limit\n    ) bounded on true" },
   { file: M, from: MR_HASMORE, to: "'has_more', coalesce(pg_catalog.count(*) >= p_meal_limit, false)" }]);
mutation(21, "deterministic ordering is dropped from an aggregated source",
  [{ file: M, from: "          ) order by t.id) filter (where t.id is not null), '[]'::jsonb),",
     to: "          )) filter (where t.id is not null), '[]'::jsonb)," }]);
mutation(22, "the canonical descending order is inverted on a bounded source",
  [{ file: M, from: "      order by m.occurred_at desc, m.id\n      limit p_meal_limit + 1",
     to: "      order by m.occurred_at asc, m.id\n      limit p_meal_limit + 1" }]);

// ---- transport boundary --------------------------------------------------------------------------------
mutation(23, "SQL starts filtering what frozen TypeScript filters",
  [{ file: M, from: "      from public.meal_records m\n      where m.user_id = s.user_id",
     to: "      from public.meal_records m\n      where m.user_id = s.user_id and m.deleted_at is null" }]);
mutation(24, "SQL applies its own date window, reinterpreting SR-1A's recorded metadata",
  [{ file: M, from: "      where i.user_id = s.user_id",
     to: "      where i.user_id = s.user_id and i.occurred_at >= now() - interval '30 days'" }]);
mutation(25, "the transport starts constructing a domain result",
  [{ file: M, from: "    'authorized_candidate_user_ids', (",
     to: "    'similarity_score', 0.5,\n    'authorized_candidate_user_ids', (" }]);

const survivors = results.filter((r) => !r.killed);
console.log(JSON.stringify({
  suite: "social-authorized-pair-read-sr1b-d2-b1-mutations",
  status: survivors.length ? "failed" : "passed",
  totalMutations: results.length, killed: results.length - survivors.length, survived: survivors.length, results,
  networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
}, null, 2));
process.exit(survivors.length ? 1 : 0);
