#!/usr/bin/env node
// SR-1B-C guard — CANONICAL SOCIAL PARTICIPATION / DISCOVERABILITY AUTHORITY.
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

const root = process.cwd();
const baseline = "527d5c9da538e9d8e065e9e0bf3c8dfd338a8e3a";
const freezeMessage = "Add canonical Social participation authority";

const MIGRATION = "supabase/migrations/20260810020000_social_participation_authority.sql";
const BLOCK_MIGRATION = "supabase/migrations/20260810010000_social_block_authority.sql";
const domainRoot = "packages/shared/src/domain/taste-similarity";
const mobileTasteRoot = "apps/mobile/features/consumer-taste-profile";
const sr1aServerRoot = "supabase/functions/_shared";
const B3_SUCCESSOR_PATHS = Object.freeze([
  "supabase/functions/_shared/social-runtime-transport/denoPostgresExecutorTransport.ts",
  "supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts",
  "supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts"
]);

const ACTIONS = ["opt_in", "pause", "resume", "opt_out"];

const manifest = [
  "package.json",
  MIGRATION,
  "scripts/social-participation-sr1b-c-guard.mjs",
  "scripts/social-participation-sr1b-c-mutations.mjs",
  "scripts/social-participation-sr1b-c-smoke.mjs",
  // Successor amendments to validation harnesses only — never to a predecessor implementation path.
  "scripts/social-block-sr1b-b-guard.mjs",
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

function changedSince(baselineRef, pathspec) {
  const tracked = lines(git(["diff", "--name-only", baselineRef, "--", pathspec]).stdout);
  const untracked = lines(git(["ls-files", "--others", "--exclude-standard", "--", pathspec]).stdout);
  return [...new Set([...tracked, ...untracked])].map((entry) => entry.replaceAll("\\", "/")).sort();
}

function candidatePaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout.split("\0").filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}

// A migration that documents the concepts it REFUSES to reuse must be allowed to name them. Every
// prohibition below is therefore evaluated against executable SQL with `--` comments stripped.
function executableSql(source) {
  return source.split("\n").map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("--")) return "";
    const at = line.indexOf("--");
    return at === -1 ? line : line.slice(0, at);
  }).join("\n");
}

function packageOnlyAddsValidationScripts(freezeCommit) {
  const before = JSON.parse(git(["show", `${baseline}:package.json`]).stdout);
  const after = JSON.parse(freezeCommit ? git(["show", `${freezeCommit}:package.json`]).stdout : read("package.json"));
  for (const key of [
    "test:social-participation-sr1b-c",
    "test:social-participation-sr1b-c-smoke",
    "test:social-participation-sr1b-c-mutations"
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
  // `comment on ... is '...'` is documentation that happens to be SQL, so its string literals
  // legitimately name the concepts this authority REFUSES to adopt. Concept prohibitions are
  // evaluated against a view with those statements removed; structural checks still use `sql`.
  const sqlNoDocs = sql.replace(/comment on [\s\S]*?;\s*$/gim, "");

  // ---- 1-3. exact manifest ----------------------------------------------------------------------
  check("1. the SR-1B-C change set is exactly the enumerated manifest",
    same(lifecycleManifest, manifest), { expected: manifest, actual: lifecycleManifest });
  check("2. every manifest path exists on disk",
    manifest.every((entry) => fs.existsSync(path.join(root, entry))));
  check("3. package change adds only the three SR-1B-C validation commands",
    packageOnlyAddsValidationScripts(freezeCommit));

  // ---- 4-10. frozen authority untouched ---------------------------------------------------------
  check("4. not one byte of the frozen taste domain changed",
    changedSince(baseline, domainRoot).length === 0, { changed: changedSince(baseline, domainRoot) });
  check("5. not one byte of the frozen Mobile taste-profile feature changed",
    changedSince(baseline, mobileTasteRoot).filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry)).length === 0, { changed: changedSince(baseline, mobileTasteRoot).filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry)) });
  check("6. no Mobile or app file changed — SR-1B-C is database authority only",
    changedSince(baseline, "apps").filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry)).length === 0, { changed: changedSince(baseline, "apps").filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry)) });
  check("7. no packages/ file changed",
    changedSince(baseline, "packages").filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry)).length === 0, { changed: changedSince(baseline, "packages").filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry)) });
  check("8. not one byte of SR-1A's frozen server primitive changed",
    changedSince(baseline, sr1aServerRoot).filter((entry) => !B3_SUCCESSOR_PATHS.includes(entry) && !SR1C_SUCCESSOR_PATHS.includes(entry) && !SR1D_SUCCESSOR_PATHS.includes(entry) && !SR2A_SUCCESSOR_PATHS.includes(entry) && !SR2B_SUCCESSOR_PATHS.includes(entry) && !SR2C_SUCCESSOR_PATHS.includes(entry) && !SR2D_SUCCESSOR_PATHS.includes(entry) && !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry)).length === 0,
    { changed: changedSince(baseline, sr1aServerRoot).filter((entry) => !B3_SUCCESSOR_PATHS.includes(entry) && !SR1C_SUCCESSOR_PATHS.includes(entry) && !SR1D_SUCCESSOR_PATHS.includes(entry) && !SR2A_SUCCESSOR_PATHS.includes(entry) && !SR2B_SUCCESSOR_PATHS.includes(entry) && !SR2C_SUCCESSOR_PATHS.includes(entry) && !SR2D_SUCCESSOR_PATHS.includes(entry) && !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry)) });
  check("9. SR-1B-B's frozen block migration is byte-unchanged",
    changedSince(baseline, BLOCK_MIGRATION).length === 0, { changed: changedSince(baseline, BLOCK_MIGRATION) });
  // SR-1B-D1 adds the next Social migration. Check 10 was written as a whole-prefix assertion and
  // would report a successor's migration as an SR-1B-C scope violation. The successor path is
  // enumerated EXACTLY; anything else under supabase/ still fails. 10a additionally constrains what
  // the allowance may contain, which the original whole-prefix assertion never did.
  const SOCIAL_SUCCESSOR_MIGRATIONS = Object.freeze([
    "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql",
    "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql",
    "supabase/migrations/20260810050000_social_runtime_executor_role.sql"
  ]);
  const supabaseChanged = changedSince(baseline, "supabase")
    .filter((entry) => !SOCIAL_SUCCESSOR_MIGRATIONS.includes(entry) && !B3_SUCCESSOR_PATHS.includes(entry) && !SR1C_SUCCESSOR_PATHS.includes(entry) && !SR1D_SUCCESSOR_PATHS.includes(entry) && !SR2A_SUCCESSOR_PATHS.includes(entry) && !SR2B_SUCCESSOR_PATHS.includes(entry) && !SR2C_SUCCESSOR_PATHS.includes(entry) && !SR2D_SUCCESSOR_PATHS.includes(entry) && !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry));
  check("10. the only supabase change attributable to SR-1B-C is its single migration",
    same(supabaseChanged, [MIGRATION]), { changed: supabaseChanged });
  check("10a. the Social successor allowance is exactly enumerated additive migrations that cannot reach config or an Edge Function",
    SOCIAL_SUCCESSOR_MIGRATIONS.length >= 1
    && new Set(SOCIAL_SUCCESSOR_MIGRATIONS).size === SOCIAL_SUCCESSOR_MIGRATIONS.length
    && SOCIAL_SUCCESSOR_MIGRATIONS.every((entry) => /^supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/.test(entry))
    && !SOCIAL_SUCCESSOR_MIGRATIONS.some((entry) => entry.includes("config.toml") || entry.includes("/functions/")));
  check("10b. SR-2A successor paths are wildcard-free and any Supabase delta is confined to the pure shared ranking module", SR2A_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2A_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-ranking/"))
    && !SR2A_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry.startsWith("supabase/migrations/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("10c. SR-2B successor paths are wildcard-free and confined to the pure shared exposure module plus exactly one grant migration", SR2B_SUCCESSOR_PATHS.length > 0
    && new Set(SR2B_SUCCESSOR_PATHS).size === SR2B_SUCCESSOR_PATHS.length
    && SR2B_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-exposure/") || entry === SR2B_SUCCESSOR_MIGRATION)
    && SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2B_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("10d. SR-2C successor paths are wildcard-free and confined to the pure shared profile module plus exactly one projection migration", SR2C_SUCCESSOR_PATHS.length > 0
    && new Set(SR2C_SUCCESSOR_PATHS).size === SR2C_SUCCESSOR_PATHS.length
    && SR2C_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-profile/") || entry === SR2C_SUCCESSOR_MIGRATION)
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2C_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));

  // ---- 11-13. migration safety ------------------------------------------------------------------
  check("11. the migration is additive — it drops nothing and alters no existing table",
    !/\bdrop\s+(table|column|policy|function|view|index|constraint|type)\b/i.test(sql)
    && !/\balter\s+table\s+public\.(?!social_participation)/i.test(sql));
  check("12. no backfill, seed or data write outside its own table",
    !/\binsert\s+into\s+public\.(?!social_participation)/i.test(sql)
    && !/\bupdate\s+public\.(?!social_participation)/i.test(sql)
    && !/\bcopy\b/i.test(sql));
  check("13. no default participation row is created for anyone — absence stays the default",
    !/insert\s+into\s+public\.social_participation[^;]*?\bselect\b/i.test(sql)
    && !/from\s+(auth\.users|public\.consumer_profiles)/i.test(sql),
    { note: "no INSERT..SELECT and no read of any user table" });

  // ---- 14-20. exact table authority -------------------------------------------------------------
  const createTable = (sqlRaw.match(/create table public\.social_participation \(([\s\S]*?)\n\);/) ?? [])[1] ?? "";
  const columnNames = [...createTable.matchAll(/^\s{2}([a-z_]+)\s+(uuid|text|timestamptz)\b/gm)].map((m) => m[1]);
  check("14. the table declares exactly four columns and no speculative field",
    same([...columnNames].sort(), ["opted_in_at", "state", "updated_at", "user_id"]), { columns: columnNames });
  check("15. one row per user — user_id is the whole primary key",
    /constraint social_participation_pkey primary key \(user_id\)/i.test(createTable));
  check("16. the canonical FK references auth.users with ON DELETE CASCADE",
    /user_id uuid not null references auth\.users\(id\) on delete cascade/i.test(createTable));
  const stateCheck = (createTable.match(/check \(state in \(([^)]*)\)\)/i) ?? [])[1] ?? "";
  const allowedStates = stateCheck.split(",").map((s) => s.trim().replace(/'/g, "")).filter(Boolean);
  check("17. exactly two states are permitted, enforced by a database CHECK",
    same([...allowedStates].sort(), ["opted_in", "paused"]), { states: allowedStates });
  check("18. no speculative account or moderation state is representable",
    !/\b(suspended|banned|disabled|hidden|deleted|blocked|shadow)\b/i.test(createTable),
    { offending: createTable.match(/\b(suspended|banned|disabled|hidden|deleted|blocked|shadow)\b/gi) ?? [] });
  check("19. both lifecycle timestamps are server-defaulted and NOT NULL",
    /opted_in_at timestamptz not null default now\(\)/i.test(createTable)
    && /updated_at timestamptz not null default now\(\)/i.test(createTable));
  check("20. no account-status column is duplicated into participation",
    !/\b(status|deleted_at|is_active|verification_status|account_state)\b/i.test(createTable));

  // ---- 21-26. RLS and grants --------------------------------------------------------------------
  check("21. row level security is enabled",
    /alter table public\.social_participation enable row level security;/i.test(sql));
  const policies = [...sql.matchAll(/create policy ([a-z_]+) on public\.social_participation\s*\n?\s*for ([a-z]+)\s*\n?\s*using \(([\s\S]*?)\);/gi)];
  check("22. exactly one policy exists and it is SELECT-only",
    policies.length === 1 && policies[0][2].toLowerCase() === "select"
    && !/for (insert|update|delete|all)\b/i.test(sql), { policies: policies.map((p) => `${p[1]}:${p[2]}`) });
  check("23. the policy predicate is exactly owner ownership",
    policies.length === 1 && policies[0][3].trim().replace(/\s+/g, " ") === "auth.uid() = user_id",
    { predicate: policies[0]?.[3]?.trim() });
  check("24. no unconditional or broadened predicate exists anywhere",
    !/using\s*\(\s*true\s*\)/i.test(sql)
    && !/using\s*\(\s*auth\.uid\(\)\s+is\s+not\s+null\s*\)/i.test(sql));
  check("25. table privileges revoke everything then grant SELECT only, to authenticated only",
    /revoke all on table public\.social_participation from public;/i.test(sql)
    && /revoke all on table public\.social_participation from anon;/i.test(sql)
    && /revoke all on table public\.social_participation from authenticated;/i.test(sql)
    && /grant select on table public\.social_participation to authenticated;/i.test(sql)
    && !/grant (insert|update|delete|all)[^;]*on table public\.social_participation/i.test(sql)
    && !/grant[^;]*on table public\.social_participation to [^;]*anon/i.test(sql));
  check("26. no cross-user read path of any kind is created",
    !/create (or replace )?view/i.test(sql) && !/create trigger/i.test(sql));

  // ---- 27-34. lifecycle write authority ---------------------------------------------------------
  const functions = [...sql.matchAll(/create or replace function (public\.[a-z_]+)\(\s*([^)]*?)\s*\)/gi)]
    .map((e) => ({ name: e[1], params: e[2].trim() }));
  check("27. exactly four lifecycle functions exist",
    functions.length === 4, { functions: functions.map((f) => f.name) });
  check("28. they are exactly the four canonical lifecycle actions",
    same(functions.map((f) => f.name).sort(),
      ACTIONS.map((a) => `public.${a}_authenticated_social_participation`).sort()));
  check("29. every lifecycle function takes ZERO parameters — the caller cannot name a user, a state or a timestamp",
    functions.every((f) => f.params === ""), { params: functions.map((f) => `${f.name}(${f.params})`) });
  check("30. the subject is derived from the authenticated request context in all four",
    (sql.match(/v_user_id uuid := auth\.uid\(\);/g) ?? []).length === 4);
  check("31. unauthenticated calls fail closed in all four",
    (sql.match(/raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';/g) ?? []).length === 4);
  check("32. all four are SECURITY DEFINER with a pinned search_path and no dynamic SQL",
    (sql.match(/security definer/gi) ?? []).length === 4
    && (sql.match(/set search_path = pg_catalog, public, pg_temp/gi) ?? []).length === 4
    && !/\bexecute\s+(format|'|")/i.test(sql) && !/quote_ident|quote_literal/i.test(sql));
  check("33. execute privilege is revoked from public and anon, then granted to authenticated only",
    (sql.match(/revoke all on function public\.[a-z_]+\(\) from (public|anon|authenticated);/gi) ?? []).length === 12
    && (sql.match(/grant execute on function public\.[a-z_]+\(\) to authenticated;/gi) ?? []).length === 4
    && !/grant execute[^;]*to [^;]*anon/i.test(sql));
  check("34. every write statement is scoped to the authenticated subject",
    (sql.match(/where (sp\.)?user_id = v_user_id/g) ?? []).length >= 7
    && !/where\s+(sp\.)?user_id\s*=\s*p_/i.test(sql),
    { ownerScopedPredicates: (sql.match(/where (sp\.)?user_id = v_user_id/g) ?? []).length });

  // ---- 35-38. lifecycle timestamp contract ------------------------------------------------------
  const pauseBody = (sql.match(/function public\.pause_authenticated_social_participation\(\)[\s\S]*?\n\$\$;/) ?? [""])[0];
  const resumeBody = (sql.match(/function public\.resume_authenticated_social_participation\(\)[\s\S]*?\n\$\$;/) ?? [""])[0];
  const optOutBody = (sql.match(/function public\.opt_out_authenticated_social_participation\(\)[\s\S]*?\n\$\$;/) ?? [""])[0];
  check("35. pause never writes opted_in_at",
    /set state = 'paused', updated_at = pg_catalog\.now\(\)/i.test(pauseBody)
    && !/set[^;]*opted_in_at\s*=/i.test(pauseBody));
  check("36. resume never writes opted_in_at",
    /set state = 'opted_in', updated_at = pg_catalog\.now\(\)/i.test(resumeBody)
    && !/set[^;]*opted_in_at\s*=/i.test(resumeBody));
  check("37. opt-out is a hard DELETE back to canonical absence — no tombstone column is written",
    /delete from public\.social_participation/i.test(optOutBody)
    && !/update public\.social_participation/i.test(optOutBody));
  check("38. opted_in_at is written only when the participation row is created",
    (sql.match(/opted_in_at/g) ?? []).length > 0
    && (sql.match(/insert into public\.social_participation \(user_id, state, opted_in_at, updated_at\)/g) ?? []).length === 1
    // Inspect only the SET clause. A RETURNING list may legitimately read opted_in_at back out;
    // what must never happen is opted_in_at appearing on the left of an assignment in an UPDATE.
    && ![...sql.matchAll(/update public\.social_participation\s*\n\s*set ([\s\S]*?)\n\s*where/gi)]
      .some((match) => /opted_in_at/i.test(match[1])),
    { updateSetClauses: [...sql.matchAll(/update public\.social_participation\s*\n\s*set ([\s\S]*?)\n\s*where/gi)].map((m) => m[1].trim()) });

  // ---- 39-44. semantic boundary: no reuse of a different visibility concept ---------------------
  check("39. no dependency on consumer_profiles.visibility",
    !/consumer_profiles/i.test(sqlNoDocs) && !/\bvisibility\b/i.test(sqlNoDocs));
  check("40. no dependency on the client VisibilityLevel vocabulary",
    !/visibilitylevel|premiumonly/i.test(sqlNoDocs));
  check("41. no dependency on willing_to_chat",
    !/willing_to_chat/i.test(sqlNoDocs));
  check("42. no dependency on consumer_public_profiles",
    !/consumer_public_profiles/i.test(sqlNoDocs));
  check("43. participation is not derived from Premium, entitlement or verification",
    !/subscription_entitlements|plan_code|premium|entitlement|verification_status/i.test(sqlNoDocs));
  check("44. no Meal Buddy or socialMatchingPolicy dependency",
    !/meal_buddy|mealbuddy|socialmatchingpolicy/i.test(sqlNoDocs));

  // ---- 45-50. scope prohibitions ----------------------------------------------------------------
  check("45. no block authority is mixed into participation",
    !/social_blocks|blocker_user_id|blocked_user_id/i.test(sqlNoDocs));
  check("46. no Candidate Authorization predicate is implemented",
    !/may_evaluate|mayevaluate|authorized_candidate|candidate_authoriz|candidate_pool/i.test(sqlNoDocs));
  check("47. no ranking, scoring or taste construct appears",
    !/\b(rank|ranking|score|scoring|weight|jaccard|similarity|confidence|cold_start|taste)\b/i.test(sqlNoDocs));
  check("48. no arbitrary-UUID participation lookup exists — no function accepts a uuid parameter",
    !functions.some((f) => /uuid/i.test(f.params))
    && !/create or replace function[^(]*\([^)]*uuid/i.test(sql));
  check("49. no privileged credential, service role or admin key is referenced",
    !/service_role|sb_secret|ADMIN_KEY|SUPABASE_SERVICE_ROLE_KEY|security invoker/i.test(sqlRaw));
  check("50. no Edge Function, no config registration, and no Production reference",
    /\[functions\.social-candidate-provenance\][^[]*verify_jwt = true/.test(read("supabase/config.toml"))
    && changedSince(baseline, "supabase/config.toml").every((entry) => SR1C_SUCCESSOR_PATHS.includes(entry) || SR1D_SUCCESSOR_PATHS.includes(entry))
    && changedSince(baseline, "supabase/functions").filter((entry) => !B3_SUCCESSOR_PATHS.includes(entry) && !SR1C_SUCCESSOR_PATHS.includes(entry) && !SR1D_SUCCESSOR_PATHS.includes(entry) && !SR2A_SUCCESSOR_PATHS.includes(entry) && !SR2B_SUCCESSOR_PATHS.includes(entry) && !SR2C_SUCCESSOR_PATHS.includes(entry) && !SR2D_SUCCESSOR_PATHS.includes(entry) && !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry)).length === 0
    && !/\bproduction\b/i.test(sqlRaw));

  console.log(JSON.stringify({
    guard: "social-participation-sr1b-c",
    status: failures.length ? "failed" : "passed",
    lifecycle: freezeCommit ? "frozen_successor" : "implementation_candidate",
    branch, head, baseline, freezeCommit,
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
