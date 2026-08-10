#!/usr/bin/env node
// SR-1B-C mutation proof — CANONICAL SOCIAL PARTICIPATION / DISCOVERABILITY AUTHORITY.
//
// Each mutation rewrites REAL migration bytes on disk, then requires that the SR-1B-C guard or the
// SR-1B-C smoke FAILS. A mutation nothing notices is a hole.
//
// The smoke compiles its authority from the migration at run time, so mutations to the policy
// predicate, the grants, the permitted states, or the lifecycle SET clauses change smoke BEHAVIOUR
// rather than merely tripping a text assertion. Those kills are marked `smoke`.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const M = path.join(root, "supabase/migrations/20260810020000_social_participation_authority.sql");

const runSuite = (script) =>
  spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;

function withMutatedDisk(targets, run) {
  const originals = new Map(targets.map(({ file }) => [file, fs.readFileSync(file, "utf8")]));
  try {
    const mutated = new Map(originals);
    for (const { file, from, to } of targets) {
      const source = mutated.get(file);
      if (!source.includes(from)) return { applied: false, reason: `anchor not found: ${from.slice(0, 90)}` };
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
    let guardFailed = false;
    let smokeFailed = false;
    let crashed = false;
    try {
      guardFailed = !runSuite("scripts/social-participation-sr1b-c-guard.mjs");
      smokeFailed = !runSuite("scripts/social-participation-sr1b-c-smoke.mjs");
    } catch (error) { crashed = true; void error; }
    return { guardFailed, smokeFailed, crashed };
  });
  if (!outcome.applied) {
    results.push({ id, name, killed: false, status: "anchor_missing", detail: outcome.reason });
    return;
  }
  const { guardFailed, smokeFailed, crashed } = outcome.value;
  const killed = guardFailed || smokeFailed;
  results.push({
    id, name, killed,
    status: killed ? "killed" : crashed ? "harness_crash" : "survived",
    killedBy: [guardFailed && "guard", smokeFailed && "smoke"].filter(Boolean)
  });
}

const GRANT_SELECT = "grant select on table public.social_participation to authenticated;";
const STATE_CHECK = "constraint social_participation_state_valid check (state in ('opted_in', 'paused'))";
const PAUSE_SET = "  set state = 'paused', updated_at = pg_catalog.now()";
const RESUME_SET = "  set state = 'opted_in', updated_at = pg_catalog.now()";
const OPT_OUT_DELETE = "  delete from public.social_participation\n  where user_id = v_user_id;";
const OPT_IN_SIGNATURE = "create or replace function public.opt_in_authenticated_social_participation()";
const OPT_IN_DECLARE = "  v_user_id uuid := auth.uid();\n  v_state text;\n  v_opted_in_at timestamptz;\nbegin\n  if v_user_id is null then\n    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';\n  end if;\n\n  perform pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended(v_user_id::pg_catalog.text || ':social_participation', 0)\n  );\n\n  select sp.state, sp.opted_in_at\n  into v_state, v_opted_in_at\n  from public.social_participation as sp\n  where sp.user_id = v_user_id;\n\n  -- Idempotent";

// ================================================================================================
// 1-3. opt-in must stay explicit
mutation(1, "existing accounts are backfilled into Social participation",
  [{ file: M, from: GRANT_SELECT,
     to: `${GRANT_SELECT}\ninsert into public.social_participation (user_id, state)\n  select u.id, 'opted_in' from auth.users as u;` }]);

mutation(2, "participation is derived from consumer_profiles.visibility instead of explicit opt-in",
  [{ file: M, from: "  select sp.state, sp.opted_in_at\n  into v_state, v_opted_in_at\n  from public.social_participation as sp\n  where sp.user_id = v_user_id;\n\n  -- Idempotent",
     to: "  perform 1 from public.consumer_profiles as cp where cp.user_id = v_user_id and cp.visibility = 'public';\n\n  select sp.state, sp.opted_in_at\n  into v_state, v_opted_in_at\n  from public.social_participation as sp\n  where sp.user_id = v_user_id;\n\n  -- Idempotent" }]);

mutation(3, "the client VisibilityLevel vocabulary is adopted as participation state",
  [{ file: M, from: STATE_CHECK,
     to: "constraint social_participation_state_valid check (state in ('opted_in', 'paused', 'premiumOnly'))" }]);

// ================================================================================================
// 4-6. read boundary
mutation(4, "the SELECT policy is widened so any authenticated user can read any participation row",
  [{ file: M, from: "  using (auth.uid() = user_id);", to: "  using (true);" }]);

mutation(5, "anon is granted participation read access",
  [{ file: M, from: GRANT_SELECT, to: `${GRANT_SELECT}\ngrant select on table public.social_participation to anon;` }]);

mutation(6, "Mobile is granted direct table writes, bypassing the lifecycle RPCs",
  [{ file: M, from: GRANT_SELECT,
     to: "grant select, insert, update, delete on table public.social_participation to authenticated;" }]);

// ================================================================================================
// 7-8. actor and timestamp forgery
mutation(7, "opt-in accepts a client-supplied user_id",
  [{ file: M, from: OPT_IN_SIGNATURE,
     to: "create or replace function public.opt_in_authenticated_social_participation(p_user_id uuid)" },
   { file: M, from: "  v_user_id uuid := auth.uid();\n  v_state text;\n  v_opted_in_at timestamptz;\nbegin\n  if v_user_id is null then\n    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';\n  end if;\n\n  perform pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended(v_user_id::pg_catalog.text || ':social_participation', 0)\n  );\n\n  select sp.state, sp.opted_in_at\n  into v_state, v_opted_in_at\n  from public.social_participation as sp\n  where sp.user_id = v_user_id;\n\n  -- Idempotent",
     to: "  v_user_id uuid := p_user_id;\n  v_state text;\n  v_opted_in_at timestamptz;\nbegin\n  if v_user_id is null then\n    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';\n  end if;\n\n  perform pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended(v_user_id::pg_catalog.text || ':social_participation', 0)\n  );\n\n  select sp.state, sp.opted_in_at\n  into v_state, v_opted_in_at\n  from public.social_participation as sp\n  where sp.user_id = v_user_id;\n\n  -- Idempotent" }]);

mutation(8, "opt-in accepts a client-supplied lifecycle timestamp",
  [{ file: M, from: OPT_IN_SIGNATURE,
     to: "create or replace function public.opt_in_authenticated_social_participation(p_opted_in_at timestamptz)" },
   { file: M, from: "  values (v_user_id, 'opted_in', pg_catalog.now(), pg_catalog.now())",
     to: "  values (v_user_id, 'opted_in', p_opted_in_at, pg_catalog.now())" }]);

// ================================================================================================
// 9-11. state vocabulary
mutation(9, "the state CHECK constraint is removed so any string becomes a valid state",
  [{ file: M, from: `,\n  ${STATE_CHECK}`, to: "" }]);

mutation(10, "a speculative moderation state is added to the participation authority",
  [{ file: M, from: STATE_CHECK,
     to: "constraint social_participation_state_valid check (state in ('opted_in', 'paused', 'suspended'))" }]);

mutation(11, "account status is duplicated into the participation table",
  [{ file: M, from: "  updated_at timestamptz not null default now(),",
     to: "  updated_at timestamptz not null default now(),\n  status text not null default 'active',\n  deleted_at timestamptz," }]);

// ================================================================================================
// 12-14. lifecycle timestamp contract
mutation(12, "pause resets opted_in_at, destroying lifecycle continuity",
  [{ file: M, from: PAUSE_SET,
     to: "  set state = 'paused', opted_in_at = pg_catalog.now(), updated_at = pg_catalog.now()" }]);

mutation(13, "resume resets opted_in_at, destroying lifecycle continuity",
  [{ file: M, from: RESUME_SET,
     to: "  set state = 'opted_in', opted_in_at = pg_catalog.now(), updated_at = pg_catalog.now()" }]);

mutation(14, "opt out leaves a stale row behind instead of returning to canonical absence",
  [{ file: M, from: OPT_OUT_DELETE,
     to: "  update public.social_participation\n  set state = 'paused', updated_at = pg_catalog.now()\n  where user_id = v_user_id;" }]);

// ================================================================================================
// 15-16. authority mixing and credentials
mutation(15, "block authority is mixed into participation",
  [{ file: M, from: "  -- Idempotent: an existing participant keeps its original lifecycle start, whether it is currently",
     to: "  perform 1 from public.social_blocks as sb where sb.blocker_user_id = v_user_id;\n\n  -- Idempotent: an existing participant keeps its original lifecycle start, whether it is currently" }]);

mutation(16, "the migration acquires a service-role credential dependency",
  [{ file: M, from: "grant execute on function public.opt_in_authenticated_social_participation() to authenticated;",
     to: "grant execute on function public.opt_in_authenticated_social_participation() to authenticated;\ngrant execute on function public.opt_in_authenticated_social_participation() to service_role;" }]);

// ================================================================================================
const survivors = results.filter((entry) => !entry.killed);
console.log(JSON.stringify({
  suite: "social-participation-sr1b-c-mutations",
  status: survivors.length ? "failed" : "passed",
  totalMutations: results.length,
  killed: results.length - survivors.length,
  survived: survivors.length,
  results,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
process.exit(survivors.length ? 1 : 0);
