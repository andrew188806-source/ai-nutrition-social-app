#!/usr/bin/env node
// SR-1B-B guard — CANONICAL DIRECTIONAL SOCIAL BLOCK AUTHORITY.
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

const root = process.cwd();
const baseline = "8fb97da8574cc533e4af901e174ecf0be3a25d03";
const freezeMessage = "Add canonical directional Social block authority";

const MIGRATION = "supabase/migrations/20260810010000_social_block_authority.sql";
const domainRoot = "packages/shared/src/domain/taste-similarity";
const mobileTasteRoot = "apps/mobile/features/consumer-taste-profile";
const sr1aServerRoot = "supabase/functions/_shared";

const manifest = [
  "package.json",
  MIGRATION,
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-block-sr1b-b-mutations.mjs",
  "scripts/social-block-sr1b-b-smoke.mjs",
  // Successor amendments to validation harnesses only — never to a predecessor implementation path.
  // Ten predecessor guards assert "nothing under supabase/ changed" at prefix granularity; SR-1B-B
  // is the first round to add a migration, so each receives an exactly-enumerated allowance.
  "scripts/social-pair-sr1a-guard.mjs",
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
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result;
}

const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const same = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);

// Tracked modifications AND untracked additions. Before the freeze commit the SR-1B-B paths are
// untracked, and a diff-only view would report an empty change set — making every "nothing changed
// here" assertion vacuously true exactly when it matters most.
function changedSince(baselineRef, pathspec) {
  const tracked = lines(git(["diff", "--name-only", baselineRef, "--", pathspec]).stdout);
  const untracked = lines(git(["ls-files", "--others", "--exclude-standard", "--", pathspec]).stdout);
  return [...new Set([...tracked, ...untracked])].map((entry) => entry.replaceAll("\\", "/")).sort();
}

function candidatePaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout.split("\0").filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}

// A migration that documents its own exclusions must be allowed to NAME them. Every prohibition
// below is therefore evaluated against executable SQL with `--` comments stripped; bans that must
// hold implementation-wide are stated against the raw text and marked as such.
function executableSql(source) {
  return source
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("--")) return "";
      const commentAt = line.indexOf("--");
      return commentAt === -1 ? line : line.slice(0, commentAt);
    })
    .join("\n");
}

function packageOnlyAddsValidationScripts(freezeCommit) {
  const before = JSON.parse(git(["show", `${baseline}:package.json`]).stdout);
  const after = JSON.parse(freezeCommit ? git(["show", `${freezeCommit}:package.json`]).stdout : read("package.json"));
  for (const key of [
    "test:social-block-sr1b-b",
    "test:social-block-sr1b-b-smoke",
    "test:social-block-sr1b-b-mutations"
  ]) delete after.scripts[key];
  return JSON.stringify(before) === JSON.stringify(after);
}

try {
  const head = git(["rev-parse", "HEAD"]).stdout.trim();
  const branch = git(["branch", "--show-current"]).stdout.trim();
  const freezeCandidates = git(["log", "--format=%H%x09%s", `${baseline}..HEAD`]).stdout.split(/\r?\n/).filter(Boolean)
    .map((entry) => entry.split("\t")).filter(([, subject]) => subject.startsWith(freezeMessage)).map(([commit]) => commit);
  const freezeCommit = freezeCandidates[0] ?? null;
  const lifecycleManifest = freezeCommit
    ? lines(git(["diff-tree", "--no-commit-id", "--name-only", "-r", freezeCommit]).stdout)
    : candidatePaths();

  const sqlRaw = read(MIGRATION);
  const sql = executableSql(sqlRaw);
  const sqlLower = sql.toLowerCase();

  // ---- 1-3. exact manifest ----------------------------------------------------------------------
  check("1. the SR-1B-B change set is exactly the enumerated manifest",
    same(lifecycleManifest, manifest), { expected: manifest, actual: lifecycleManifest });
  check("2. every manifest path exists on disk",
    manifest.every((entry) => fs.existsSync(path.join(root, entry))));
  check("3. package change adds only the three SR-1B-B validation commands",
    packageOnlyAddsValidationScripts(freezeCommit));

  // ---- 4-9. frozen authority untouched ----------------------------------------------------------
  check("4. not one byte of the frozen taste domain changed",
    changedSince(baseline, domainRoot).length === 0, { changed: changedSince(baseline, domainRoot) });
  check("5. not one byte of the frozen Mobile taste-profile feature changed",
    changedSince(baseline, mobileTasteRoot).length === 0, { changed: changedSince(baseline, mobileTasteRoot) });
  check("6. no Mobile or app file changed — SR-1B-B is database authority only",
    changedSince(baseline, "apps").length === 0, { changed: changedSince(baseline, "apps") });
  check("7. no packages/ file changed",
    changedSince(baseline, "packages").length === 0, { changed: changedSince(baseline, "packages") });
  check("8. not one byte of SR-1A's frozen server primitive changed",
    changedSince(baseline, sr1aServerRoot).length === 0, { changed: changedSince(baseline, sr1aServerRoot) });
  // SR-1B-C adds the next Social migration. Checks 9 and 10 were written as whole-prefix assertions
  // and would report a successor's migration as an SR-1B-B scope violation. The successor path is
  // enumerated EXACTLY; anything else under supabase/ still fails. Check 9a additionally constrains
  // what the allowance may contain, which the original whole-prefix assertions never did.
  const SOCIAL_SUCCESSOR_MIGRATIONS = Object.freeze([
    "supabase/migrations/20260810020000_social_participation_authority.sql"
  ]);
  const supabaseChanged = changedSince(baseline, "supabase")
    .filter((entry) => !SOCIAL_SUCCESSOR_MIGRATIONS.includes(entry));
  check("9. the only supabase change attributable to SR-1B-B is its single migration",
    same(supabaseChanged, [MIGRATION]), { changed: supabaseChanged });
  check("9a. the Social successor allowance is exactly enumerated additive migrations that cannot reach config or an Edge Function",
    SOCIAL_SUCCESSOR_MIGRATIONS.length >= 1
    && new Set(SOCIAL_SUCCESSOR_MIGRATIONS).size === SOCIAL_SUCCESSOR_MIGRATIONS.length
    && SOCIAL_SUCCESSOR_MIGRATIONS.every((entry) => /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(entry))
    && !SOCIAL_SUCCESSOR_MIGRATIONS.some((entry) => entry.includes("config.toml") || entry.includes("/functions/")));

  // ---- 10-12. migration safety ------------------------------------------------------------------
  check("10. SR-1B-B modified no existing migration",
    changedSince(baseline, "supabase/migrations")
      .filter((entry) => !SOCIAL_SUCCESSOR_MIGRATIONS.includes(entry)).length === 1);
  check("11. the migration is additive — it drops nothing and alters no existing consumer table",
    !/\bdrop\s+(table|column|policy|function|view|index|constraint|type)\b/i.test(sql)
    && !/\balter\s+table\s+public\.(consumer_profiles|consumer_private_profiles|taste_profiles|nutrition_goals|dietary_restrictions|meal_records|meal_record_items|favorite_restaurants|favorite_menu_items|subscription_entitlements)\b/i.test(sql),
    { drops: (sql.match(/\bdrop\s+\w+/gi) ?? []).slice(0, 5) });
  check("12. the migration performs no backfill, seed or data write outside its own table",
    !/\binsert\s+into\s+public\.(?!social_blocks)/i.test(sql)
    && !/\bupdate\s+public\.(?!social_blocks)/i.test(sql)
    && !/\bcopy\b/i.test(sql));

  // ---- 13-19. exact table authority -------------------------------------------------------------
  const createTable = (sqlRaw.match(/create table public\.social_blocks \(([\s\S]*?)\n\);/) ?? [])[1] ?? "";
  const columnNames = [...createTable.matchAll(/^\s{2}([a-z_]+)\s+(uuid|timestamptz)\b/gm)].map((match) => match[1]);
  check("13. the table declares exactly three columns and no speculative field",
    same([...columnNames].sort(), ["blocked_user_id", "blocker_user_id", "created_at"]),
    { columns: columnNames });
  check("14. both identities are uuid NOT NULL referencing auth.users with ON DELETE CASCADE",
    /blocker_user_id uuid not null references auth\.users\(id\) on delete cascade/i.test(createTable)
    && /blocked_user_id uuid not null references auth\.users\(id\) on delete cascade/i.test(createTable));
  check("15. created_at is a server-defaulted timestamptz, never client-supplied",
    /created_at timestamptz not null default now\(\)/i.test(createTable));
  check("16. the composite primary key is exactly (blocker_user_id, blocked_user_id)",
    /constraint social_blocks_pkey primary key \(blocker_user_id, blocked_user_id\)/i.test(createTable));
  check("17. a DATABASE CHECK constraint forbids self-block",
    /constraint social_blocks_no_self_block check \(blocker_user_id <> blocked_user_id\)/i.test(createTable));
  check("18. the reverse index exists to serve the FK cascade and the future inbound lookup",
    /create index social_blocks_blocked_user_id_blocker_user_id_idx\s*\n?\s*on public\.social_blocks \(blocked_user_id, blocker_user_id\)/i.test(sql));
  check("19. no lifecycle, moderation or history column exists — current authority only",
    !/\b(deleted_at|removed_at|unblocked_at|status|state|reason|reason_text|note|moderation|report|severity|expires_at|updated_at|history|audit)\b/i.test(createTable),
    { offending: (createTable.match(/\b(deleted_at|removed_at|unblocked_at|status|state|reason|moderation|report|severity|expires_at|updated_at|history|audit)\b/gi) ?? []) });

  // ---- 20-26. RLS and grants --------------------------------------------------------------------
  check("20. row level security is enabled on the table",
    /alter table public\.social_blocks enable row level security;/i.test(sql));
  const policies = [...sql.matchAll(/create policy ([a-z_]+) on public\.social_blocks\s*\n?\s*for ([a-z]+)\s*\n?\s*using \(([^;]*?)\);/gi)];
  check("21. exactly one policy exists on the table",
    policies.length === 1, { policies: policies.map((entry) => entry[1]) });
  check("22. that policy is SELECT only — no insert, update, delete or ALL policy exists",
    policies.length === 1 && policies[0][2].toLowerCase() === "select"
    && !/for (insert|update|delete|all)\b/i.test(sql), { mode: policies[0]?.[2] });
  check("23. the policy predicate is exactly outbound ownership",
    policies.length === 1 && policies[0][3].trim().replace(/\s+/g, " ") === "auth.uid() = blocker_user_id",
    { predicate: policies[0]?.[3]?.trim() });
  check("24. no policy predicate references blocked_user_id — inbound blocks are structurally unreachable",
    !policies.some((entry) => /blocked_user_id/i.test(entry[3])));
  check("25. no unconditional or broadened predicate is present anywhere",
    !/using\s*\(\s*true\s*\)/i.test(sql)
    && !/using\s*\(\s*auth\.uid\(\)\s+is\s+not\s+null\s*\)/i.test(sql)
    && !/to\s+authenticated\s+using\s*\(\s*true/i.test(sql));
  check("26. table privileges revoke everything then grant SELECT only, to authenticated only",
    /revoke all on table public\.social_blocks from public;/i.test(sql)
    && /revoke all on table public\.social_blocks from anon;/i.test(sql)
    && /revoke all on table public\.social_blocks from authenticated;/i.test(sql)
    && /grant select on table public\.social_blocks to authenticated;/i.test(sql)
    && !/grant (insert|update|delete|all)[^;]*on table public\.social_blocks/i.test(sql)
    && !/grant[^;]*on table public\.social_blocks to [^;]*anon/i.test(sql));

  // ---- 27-36. RPC write authority ---------------------------------------------------------------
  const functionSignatures = [...sql.matchAll(/create or replace function (public\.[a-z_]+)\(\s*([^)]*?)\s*\)/gi)]
    .map((entry) => ({ name: entry[1], params: entry[2].trim() }));
  check("27. exactly two write functions exist",
    functionSignatures.length === 2, { functions: functionSignatures.map((entry) => entry.name) });
  check("28. they are the canonical block and unblock authorities",
    same(functionSignatures.map((entry) => entry.name).sort(),
      ["public.create_authenticated_social_block", "public.remove_authenticated_social_block"]));
  check("29. each accepts ONLY the target identity — no blocker, actor or user id parameter exists",
    functionSignatures.every((entry) => entry.params === "p_blocked_user_id uuid")
    && !/\bp_(blocker|actor|user|caller|owner)_?[a-z_]*\b/i.test(sql),
    { params: functionSignatures.map((entry) => entry.params) });
  check("30. the blocker is derived from the authenticated request context",
    (sql.match(/v_blocker_user_id uuid := auth\.uid\(\);/g) ?? []).length === 2);
  check("31. unauthenticated calls fail closed",
    (sql.match(/if v_blocker_user_id is null then\s*\n\s*raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';/g) ?? []).length === 2);
  check("32. self-block fails closed in both functions as well as at the constraint",
    (sql.match(/raise exception 'SOCIAL_BLOCK_SELF_FORBIDDEN'/g) ?? []).length === 2);
  check("33. both functions are SECURITY DEFINER with a pinned search_path",
    (sql.match(/security definer/gi) ?? []).length === 2
    && (sql.match(/set search_path = pg_catalog, public, pg_temp/gi) ?? []).length === 2);
  check("34. no dynamic SQL is used",
    !/\bexecute\s+(format|'|")/i.test(sql) && !/\bquote_ident\b|\bquote_literal\b/i.test(sql));
  check("35. execute privilege is revoked from public and anon, then granted to authenticated only",
    (sql.match(/revoke all on function public\.(create|remove)_authenticated_social_block\(uuid\) from (public|anon|authenticated);/gi) ?? []).length === 6
    && (sql.match(/grant execute on function public\.(create|remove)_authenticated_social_block\(uuid\) to authenticated;/gi) ?? []).length === 2
    && !/grant execute[^;]*to [^;]*anon/i.test(sql));
  // Storage must stay DIRECTIONAL. Normalizing the pair — e.g. inserting least()/greatest() — would
  // silently collapse A→B and B→A into one row, destroying the record of which side blocked and
  // making unblock able to clear the other party's decision.
  check("35a. the insert stores the caller's direction verbatim, never a normalized or sorted pair",
    /insert into public\.social_blocks \(blocker_user_id, blocked_user_id\)\s*\n\s*values \(v_blocker_user_id, v_blocked_user_id\)/i.test(sql)
    && !/\b(least|greatest)\s*\(/i.test(sql));
  check("36. the unblock path deletes hard and is scoped to the caller's own direction",
    /delete from public\.social_blocks\s*\n\s*where blocker_user_id = v_blocker_user_id\s*\n\s*and blocked_user_id = v_blocked_user_id;/i.test(sql)
    && !/update public\.social_blocks/i.test(sql));

  // ---- 37-41. reverse-block privacy -------------------------------------------------------------
  check("37. no executable statement ever selects or filters on the reverse direction",
    !/where[^;]*blocked_user_id\s*=\s*v_blocker_user_id/i.test(sql)
    && !/where[^;]*blocker_user_id\s*=\s*v_blocked_user_id/i.test(sql));
  check("38. no RPC response field can carry reverse-block state",
    !/'(blocked_by|is_blocked_by|reverse|inbound|blocked_me|mutual)'/i.test(sql));
  check("39. the returned payload names only the caller's own outbound record",
    (sql.match(/'blocked_user_id', v_blocked_user_id/g) ?? []).length >= 4
    && !/'blocker_user_id',/i.test(sql));
  check("40. no view, trigger or additional function is created",
    !/create (or replace )?view/i.test(sql)
    && !/create trigger/i.test(sql)
    && (sql.match(/create or replace function/gi) ?? []).length === 2);
  check("41. no privileged credential, service role or admin key is referenced",
    !/service_role|sb_secret|ADMIN_KEY|SUPABASE_SERVICE_ROLE_KEY|security invoker/i.test(sqlRaw));

  // ---- 42-47. scope prohibitions ----------------------------------------------------------------
  check("42. no Candidate Authorization predicate is implemented",
    !/may_evaluate|mayevaluate|authorized_candidate|candidate_authoriz|social_authorized/i.test(sql));
  check("43. no discoverability or participation authority is implemented",
    !/discoverab|social_participation|opted_in|visibility_status/i.test(sql));
  check("44. no invitation, match, chat or relationship state is created",
    !/\b(invitation|invitations|match|matches|chat|chats|chat_participants|meal_buddy|relationship)\b/i.test(sql));
  check("45. no Social ranking or scoring construct appears",
    !/\b(rank|ranking|score|scoring|weight|jaccard|similarity|confidence|cold_start)\b/i.test(sql));
  check("46. no existing visibility authority is reused as block or discoverability authority",
    !/consumer_public_profiles|consumer_profiles\.visibility|visibilitylevel|socialmatchingpolicy/i.test(sql));
  check("47. no Edge Function and no Social registration in supabase/config.toml",
    !/social/i.test(read("supabase/config.toml"))
    && changedSince(baseline, "supabase/config.toml").length === 0
    && changedSince(baseline, "supabase/functions").length === 0
    && !fs.existsSync(path.join(root, "supabase/functions/social-block")));

  console.log(JSON.stringify({
    guard: "social-block-sr1b-b",
    status: failures.length ? "failed" : "passed",
    lifecycle: freezeCommit ? "frozen_successor" : "implementation_candidate",
    branch,
    head,
    baseline,
    freezeCommit,
    totalChecks: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false
  }, null, 2));
  process.exit(failures.length ? 1 : 0);
} catch (error) {
  console.error(`GUARD ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
