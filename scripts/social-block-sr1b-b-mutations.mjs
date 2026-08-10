#!/usr/bin/env node
// SR-1B-B mutation proof — CANONICAL DIRECTIONAL SOCIAL BLOCK AUTHORITY.
//
// Each mutation rewrites REAL migration bytes on disk, then requires that the SR-1B-B guard or the
// SR-1B-B smoke FAILS. A mutation nothing notices is a hole.
//
// The smoke compiles its authority from the migration at run time, so a mutation to the policy
// predicate, the grants, the composite key or the CHECK changes smoke BEHAVIOUR rather than merely
// tripping a text assertion. Those kills are marked `smoke` below and are the meaningful ones.
//
// Kills must be real: a mutation that only crashes the harness is reported as `harness_crash` and
// does NOT count as a kill.
//
// Fully local: no network, no database, no Supabase, no credential, no Production.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const MIGRATION = path.join(root, "supabase/migrations/20260810010000_social_block_authority.sql");

function runSuite(script) {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;
}

// Replacements accumulate into a separate map so multiple edits to the SAME file all survive:
// re-reading the pristine file each iteration would silently keep only the last one.
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
      guardFailed = !runSuite("scripts/social-block-sr1b-b-guard.mjs");
      smokeFailed = !runSuite("scripts/social-block-sr1b-b-smoke.mjs");
    } catch (error) {
      crashed = true;
      void error;
    }
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

// ================================================================================================
// 1-3. constraint and directionality authority
mutation(1, "the database self-block CHECK constraint is removed",
  [{
    file: MIGRATION,
    from: ",\n  constraint social_blocks_no_self_block check (blocker_user_id <> blocked_user_id)",
    to: ""
  }]);

mutation(2, "the composite key is reduced so one blocker can hold only one block",
  [{
    file: MIGRATION,
    from: "constraint social_blocks_pkey primary key (blocker_user_id, blocked_user_id)",
    to: "constraint social_blocks_pkey primary key (blocker_user_id)"
  }]);

mutation(3, "storage is made symmetric by normalizing the pair on insert",
  [{
    file: MIGRATION,
    from: "    values (v_blocker_user_id, v_blocked_user_id)",
    to: "    values (least(v_blocker_user_id, v_blocked_user_id), greatest(v_blocker_user_id, v_blocked_user_id))"
  }]);

// ================================================================================================
// 4-6. read-boundary privacy
mutation(4, "the SELECT policy is widened to expose inbound blocks",
  [{
    file: MIGRATION,
    from: "  using (auth.uid() = blocker_user_id);",
    to: "  using (auth.uid() = blocker_user_id or auth.uid() = blocked_user_id);"
  }]);

mutation(5, "the SELECT policy is widened to every authenticated user",
  [{
    file: MIGRATION,
    from: "  using (auth.uid() = blocker_user_id);",
    to: "  using (true);"
  }]);

mutation(6, "the policy is inverted so it exposes only inbound blocks",
  [{
    file: MIGRATION,
    from: "  using (auth.uid() = blocker_user_id);",
    to: "  using (auth.uid() = blocked_user_id);"
  }]);

// ================================================================================================
// 7-9. privilege boundary
mutation(7, "anon is granted read access to block rows",
  [{
    file: MIGRATION,
    from: "grant select on table public.social_blocks to authenticated;",
    to: "grant select on table public.social_blocks to authenticated;\ngrant select on table public.social_blocks to anon;"
  }]);

mutation(8, "Mobile is granted direct INSERT, bypassing the RPC boundary",
  [{
    file: MIGRATION,
    from: "grant select on table public.social_blocks to authenticated;",
    to: "grant select, insert on table public.social_blocks to authenticated;"
  }]);

mutation(9, "Mobile is granted direct DELETE, bypassing the RPC boundary",
  [{
    file: MIGRATION,
    from: "grant select on table public.social_blocks to authenticated;",
    to: "grant select, delete on table public.social_blocks to authenticated;"
  }]);

// ================================================================================================
// 10-11. actor derivation
mutation(10, "the block RPC accepts a client-supplied blocker id",
  [{
    file: MIGRATION,
    from: "create or replace function public.create_authenticated_social_block(\n  p_blocked_user_id uuid\n)",
    to: "create or replace function public.create_authenticated_social_block(\n  p_blocker_user_id uuid,\n  p_blocked_user_id uuid\n)"
  }, {
    file: MIGRATION,
    from: "  v_blocker_user_id uuid := auth.uid();\n  v_blocked_user_id uuid := p_blocked_user_id;\n  v_created_at timestamptz;",
    to: "  v_blocker_user_id uuid := p_blocker_user_id;\n  v_blocked_user_id uuid := p_blocked_user_id;\n  v_created_at timestamptz;"
  }]);

mutation(11, "the unblock DELETE is no longer scoped to the calling blocker",
  [{
    file: MIGRATION,
    from: "  delete from public.social_blocks\n  where blocker_user_id = v_blocker_user_id\n    and blocked_user_id = v_blocked_user_id;",
    to: "  delete from public.social_blocks\n  where blocked_user_id = v_blocked_user_id;"
  }]);

// ================================================================================================
// 12-14. lifecycle and disclosure
mutation(12, "unblock becomes a soft delete that leaves stale state behind",
  [{
    file: MIGRATION,
    from: "  created_at timestamptz not null default now(),",
    to: "  created_at timestamptz not null default now(),\n  unblocked_at timestamptz,"
  }, {
    file: MIGRATION,
    from: "  delete from public.social_blocks\n  where blocker_user_id = v_blocker_user_id\n    and blocked_user_id = v_blocked_user_id;",
    to: "  update public.social_blocks\n  set unblocked_at = now()\n  where blocker_user_id = v_blocker_user_id\n    and blocked_user_id = v_blocked_user_id;"
  }]);

mutation(13, "the block RPC discloses whether the target has blocked the caller",
  [{
    file: MIGRATION,
    from: "  return pg_catalog.jsonb_build_object(\n    'status', 'blocked',\n    'blocked_user_id', v_blocked_user_id,\n    'created_at', v_created_at\n  );\nend;",
    to: "  return pg_catalog.jsonb_build_object(\n    'status', 'blocked',\n    'blocked_user_id', v_blocked_user_id,\n    'blocked_by', exists (select 1 from public.social_blocks as rb where rb.blocker_user_id = v_blocked_user_id and rb.blocked_user_id = v_blocker_user_id),\n    'created_at', v_created_at\n  );\nend;"
  }]);

mutation(14, "the migration acquires a service-role credential dependency",
  [{
    file: MIGRATION,
    from: "grant execute on function public.create_authenticated_social_block(uuid) to authenticated;",
    to: "grant execute on function public.create_authenticated_social_block(uuid) to authenticated;\ngrant execute on function public.create_authenticated_social_block(uuid) to service_role;"
  }]);

// ================================================================================================
// 15-16. authentication and search_path hardening
mutation(15, "the unauthenticated guard is removed from the block RPC",
  [{
    file: MIGRATION,
    from: "  if v_blocker_user_id is null then\n    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';\n  end if;\n  if v_blocked_user_id is null then\n    raise exception 'SOCIAL_BLOCK_TARGET_REQUIRED' using errcode = '22023';\n  end if;\n  -- Self-block fails closed here",
    to: "  if v_blocked_user_id is null then\n    raise exception 'SOCIAL_BLOCK_TARGET_REQUIRED' using errcode = '22023';\n  end if;\n  -- Self-block fails closed here"
  }]);

mutation(16, "the SECURITY DEFINER search_path pin is dropped",
  [{
    file: MIGRATION,
    from: "security definer\nset search_path = pg_catalog, public, pg_temp\nas $$\ndeclare\n  v_blocker_user_id uuid := auth.uid();\n  v_blocked_user_id uuid := p_blocked_user_id;\n  v_created_at timestamptz;",
    to: "security definer\nas $$\ndeclare\n  v_blocker_user_id uuid := auth.uid();\n  v_blocked_user_id uuid := p_blocked_user_id;\n  v_created_at timestamptz;"
  }]);

// ================================================================================================
const survivors = results.filter((entry) => !entry.killed);
console.log(JSON.stringify({
  suite: "social-block-sr1b-b-mutations",
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
