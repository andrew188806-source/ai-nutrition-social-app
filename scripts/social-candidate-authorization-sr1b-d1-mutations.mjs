#!/usr/bin/env node
// SR-1B-D1 mutation proof — INTERNAL CANDIDATE AUTHORIZATION DATABASE AUTHORITY.
//
// Each mutation rewrites REAL migration bytes on disk, then requires that the SR-1B-D1 guard or the
// SR-1B-D1 smoke FAILS. A mutation nothing notices is a hole.
//
// The smoke compiles the eight conjuncts, the grants, the role attributes and the policies from the
// migration at run time, so semantic mutations change smoke BEHAVIOUR rather than only tripping a
// text assertion. Those kills are marked `smoke`.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const M = path.join(root, "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql");
const runSuite = (s) => spawnSync(process.execPath, [s], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;

function withMutatedDisk(targets, run) {
  const originals = new Map(targets.map(({ file }) => [file, fs.readFileSync(file, "utf8")]));
  try {
    const mutated = new Map(originals);
    for (const { file, from, to } of targets) {
      const source = mutated.get(file);
      if (!source.includes(from)) return { applied: false, reason: `anchor not found: ${from.slice(0, 100)}` };
      mutated.set(file, source.replaceAll(from, to));
    }
    for (const [file, source] of mutated) fs.writeFileSync(file, source, "utf8");
    return { applied: true, value: run() };
  } finally {
    for (const [file, original] of originals) fs.writeFileSync(file, original, "utf8");
  }
}

const results = [];
function mutation(id, name, targets) {
  const outcome = withMutatedDisk(targets, () => {
    let guardFailed = false, smokeFailed = false, crashed = false;
    try {
      guardFailed = !runSuite("scripts/social-candidate-authorization-sr1b-d1-guard.mjs");
      smokeFailed = !runSuite("scripts/social-candidate-authorization-sr1b-d1-smoke.mjs");
    } catch (e) { crashed = true; void e; }
    return { guardFailed, smokeFailed, crashed };
  });
  if (!outcome.applied) { results.push({ id, name, killed: false, status: "anchor_missing", detail: outcome.reason }); return; }
  const { guardFailed, smokeFailed, crashed } = outcome.value;
  const killed = guardFailed || smokeFailed;
  results.push({ id, name, killed, status: killed ? "killed" : crashed ? "harness_crash" : "survived",
    killedBy: [guardFailed && "guard", smokeFailed && "smoke"].filter(Boolean) });
}

const GRANT_COLS_PROFILE = "grant select (user_id, status, deleted_at) on table public.consumer_profiles to social_authority;";
const GRANT_COLS_PART = "grant select (user_id, state) on table public.social_participation to social_authority;";
const GRANT_COLS_BLOCK = "grant select (blocker_user_id, blocked_user_id) on table public.social_blocks to social_authority;";
const CREATE_ROLE = "create role social_authority with\n  nologin\n  noinherit\n  nobypassrls";
const REVOKE_CREATE = "revoke create on schema social_internal from social_authority;";
const REVOKE_MEMBERSHIP = "revoke social_authority from postgres;";
const POLICY_BLOCKS = "create policy social_blocks_social_authority_read on public.social_blocks\n  for select to social_authority using (true);";

// ================================================================================================
// 1-4. schema and function exposure
mutation(1, "the authority functions are created in the exposed public schema",
  [{ file: M, from: "create function social_internal.authorized_candidates(", to: "create function public.authorized_candidates(" },
   { file: M, from: "alter function social_internal.authorized_candidates(uuid, uuid[]) owner to social_authority;", to: "alter function public.authorized_candidates(uuid, uuid[]) owner to social_authority;" }]);

mutation(2, "EXECUTE is granted to authenticated, making it a Mobile-callable oracle",
  [{ file: M, from: REVOKE_CREATE,
     to: "grant execute on function social_internal.may_evaluate_candidate(uuid, uuid) to authenticated;\n" + REVOKE_CREATE }]);

mutation(3, "EXECUTE is granted to anon",
  [{ file: M, from: REVOKE_CREATE,
     to: "grant execute on function social_internal.may_evaluate_candidate(uuid, uuid) to anon;\n" + REVOKE_CREATE }]);

mutation(4, "the internal schema is opened to authenticated",
  [{ file: M, from: "grant usage on schema social_internal to social_authority;",
     to: "grant usage on schema social_internal to social_authority;\ngrant usage on schema social_internal to authenticated;" }]);

// ================================================================================================
// 5-9. role attributes and membership
mutation(5, "the authority role gains LOGIN",
  [{ file: M, from: CREATE_ROLE, to: "create role social_authority with\n  login\n  noinherit\n  nobypassrls" }]);

mutation(6, "the authority role gains BYPASSRLS, defeating the RLS boundary",
  [{ file: M, from: CREATE_ROLE, to: "create role social_authority with\n  nologin\n  noinherit\n  bypassrls" }]);

mutation(7, "CREATE on the internal schema is left granted",
  [{ file: M, from: `\n${REVOKE_CREATE}`, to: "" }]);

mutation(8, "the transient postgres membership is never released",
  [{ file: M, from: `\n${REVOKE_MEMBERSHIP}`, to: "" }]);

mutation(9, "authenticator is made a member of the authority role",
  [{ file: M, from: "grant social_authority to postgres with inherit false, set true;",
     to: "grant social_authority to postgres with inherit false, set true;\ngrant social_authority to authenticator;" }]);

// ================================================================================================
// 10-14. data minimization
mutation(10, "a whole-table SELECT replaces the column-level grant",
  [{ file: M, from: GRANT_COLS_PROFILE, to: "grant select on table public.consumer_profiles to social_authority;" }]);

mutation(11, "an extra consumer profile column is granted",
  [{ file: M, from: GRANT_COLS_PROFILE,
     to: "grant select (user_id, status, deleted_at, visibility) on table public.consumer_profiles to social_authority;" }]);

mutation(12, "social_participation.opted_in_at is granted",
  [{ file: M, from: GRANT_COLS_PART, to: "grant select (user_id, state, opted_in_at) on table public.social_participation to social_authority;" }]);

mutation(13, "social_blocks.created_at is granted",
  [{ file: M, from: GRANT_COLS_BLOCK,
     to: "grant select (blocker_user_id, blocked_user_id, created_at) on table public.social_blocks to social_authority;" }]);

mutation(14, "a Taste Foundation table is granted to the authority role",
  [{ file: M, from: GRANT_COLS_BLOCK,
     to: GRANT_COLS_BLOCK + "\ngrant select (user_id, spice_preference) on table public.taste_profiles to social_authority;" }]);

// ================================================================================================
// 15-16. RLS scoping
mutation(15, "the block authority policy is scoped to authenticated, widening the client view",
  [{ file: M, from: POLICY_BLOCKS,
     to: "create policy social_blocks_social_authority_read on public.social_blocks\n  for select to authenticated using (true);" }]);

mutation(16, "the reverse-block authority policy is omitted entirely",
  [{ file: M, from: `\n${POLICY_BLOCKS}\n`, to: "\n" }]);

// ================================================================================================
// 17-22. predicate semantics
mutation(17, "the actor participation conjunct is removed, letting a paused or opted-out actor evaluate",
  [{ file: M, from: "    and exists (\n      select 1 from public.social_participation as sp\n      where sp.user_id = p_actor_user_id and sp.state = 'opted_in'\n    )\n", to: "" }]);

mutation(18, "a paused actor is permitted by widening the actor state test",
  [{ file: M, from: "where sp.user_id = p_actor_user_id and sp.state = 'opted_in'",
     to: "where sp.user_id = p_actor_user_id and sp.state in ('opted_in', 'paused')" }]);

mutation(19, "the candidate participation conjunct is removed",
  [{ file: M, from: "    and exists (\n      select 1 from public.social_participation as sp\n      where sp.user_id = candidate.user_id and sp.state = 'opted_in'\n    )\n", to: "" }]);

mutation(20, "the reverse-block conjunct is removed, so B blocking A no longer denies",
  [{ file: M, from: "    and not exists (\n      select 1 from public.social_blocks as sb\n      where sb.blocker_user_id = candidate.user_id and sb.blocked_user_id = p_actor_user_id\n    )\n", to: "" }]);

mutation(21, "self-comparison is permitted",
  [{ file: M, from: "    and candidate.user_id <> p_actor_user_id\n", to: "" }]);

mutation(22, "the fail-closed duplicate-profile guard is removed for the candidate",
  [{ file: M, from: "    and not exists (\n      select 1 from public.consumer_profiles as cp\n      where cp.user_id = candidate.user_id and (cp.status <> 'active' or cp.deleted_at is not null)\n    )\n", to: "" }]);

// ================================================================================================
// 23-24. disclosure and credentials
mutation(23, "the predicate returns a denial reason instead of a bare boolean",
  [{ file: M, from: "returns boolean\nlanguage sql\nstable\nsecurity definer\nset search_path = pg_catalog, pg_temp\nas $$\n  select exists (",
     to: "returns text\nlanguage sql\nstable\nsecurity definer\nset search_path = pg_catalog, pg_temp\nas $$\n  select case when exists (" },
   { file: M, from: "    from social_internal.authorized_candidates(p_actor_user_id, array[p_candidate_user_id])\n  );",
     to: "    from social_internal.authorized_candidates(p_actor_user_id, array[p_candidate_user_id])\n  ) then 'authorized' else 'denied:reason_code' end;" }]);

mutation(24, "a service-role dependency is introduced",
  [{ file: M, from: REVOKE_CREATE,
     to: "grant execute on function social_internal.may_evaluate_candidate(uuid, uuid) to service_role;\n" + REVOKE_CREATE }]);

// ================================================================================================
const survivors = results.filter((r) => !r.killed);
console.log(JSON.stringify({
  suite: "social-candidate-authorization-sr1b-d1-mutations",
  status: survivors.length ? "failed" : "passed",
  totalMutations: results.length,
  killed: results.length - survivors.length,
  survived: survivors.length,
  results,
  networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
}, null, 2));
process.exit(survivors.length ? 1 : 0);
