#!/usr/bin/env node
// SR-1C local guard. No network, database, credential, deployment or Production access.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { SR1C_SUCCESSOR_PATHS } from "./social-ingress-sr1c-successor-manifest.mjs";
import { SR1D_SUCCESSOR_MIGRATION, SR1D_SUCCESSOR_PATHS } from "./social-taste-sr1d-successor-manifest.mjs";
import { SR2A_SUCCESSOR_PATHS } from "./social-ranking-sr2a-successor-manifest.mjs";
import { SR2B_SUCCESSOR_MIGRATION, SR2B_SUCCESSOR_PATHS } from "./social-exposure-sr2b-successor-manifest.mjs";
import { SR2C_SUCCESSOR_MIGRATION, SR2C_SUCCESSOR_PATHS } from "./social-profile-sr2c-successor-manifest.mjs";
import { SR2D_SUCCESSOR_PATHS } from "./social-candidate-sr2d-successor-manifest.mjs";
import { SR2E_SUCCESSOR_PATHS } from "./social-candidate-sr2e-successor-manifest.mjs";
import { SR2F_SUCCESSOR_PATHS } from "./social-candidate-sr2f-successor-manifest.mjs";
import { SR2GA_SUCCESSOR_PATHS } from "./social-candidate-sr2g-a-successor-manifest.mjs";

const root = process.cwd();
const baseline = "2efcac730c954d39a6016f5dc808dc1c9f45e42c";
const successorBaseline = "800490e14521c0fd277cf31a2dfc39f811a60332";
const freezeMessage = "Complete SR-1C authenticated Social candidate provenance";
const MIGRATION = "supabase/migrations/20260811010000_social_canonical_candidate_pool.sql";
const SHARED_AUTH = "supabase/functions/_shared/auth/authenticateCaller.ts";
const MEAL_AUTH = "supabase/functions/meal-photo-analysis/auth.ts";
const EDGE_ROOT = "supabase/functions/social-candidate-provenance";
const CONFIG = `${EDGE_ROOT}/config.ts`;
const PROVIDER = `${EDGE_ROOT}/candidateProvider.ts`;
const ERRORS = `${EDGE_ROOT}/errors.ts`;
const HANDLER = `${EDGE_ROOT}/handler.ts`;
const ENTRY = `${EDGE_ROOT}/index.ts`;
const GUARD = "scripts/social-ingress-sr1c-guard.mjs";
const SMOKE = "scripts/social-ingress-sr1c-smoke.mjs";
const MUTATIONS = "scripts/social-ingress-sr1c-mutations.mjs";
const predecessorGuards = [
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-participation-sr1b-c-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-runtime-executor-sr1b-d2-b2-guard.mjs",
  "scripts/social-runtime-transport-sr1b-d2-b3-guard.mjs",
  "scripts/taste-foundation-ts2d-guard.mjs",
  "scripts/taste-similarity-ts3-guard.mjs",
  "scripts/taste-similarity-ts3b-r1-guard.mjs",
  "scripts/taste-similarity-ts3c-guard.mjs",
  "scripts/taste-similarity-ts3d-guard.mjs",
  "scripts/taste-similarity-ts3e-guard.mjs",
  "scripts/taste-similarity-ts4-guard.mjs",
  "scripts/taste-similarity-ts5-guard.mjs",
  "scripts/taste-similarity-ts6-guard.mjs"
];
const manifest = [
  "package.json", "supabase/config.toml", MIGRATION, SHARED_AUTH, MEAL_AUTH,
  CONFIG, PROVIDER, ERRORS, HANDLER, ENTRY, GUARD, SMOKE, MUTATIONS,
  "scripts/meal-photo-analysis-edge-function-mi-e-c4-smoke.mjs",
  "scripts/social-pair-sr1a-smoke.mjs", ...predecessorGuards
  , "scripts/social-ingress-sr1c-successor-manifest.mjs"
].sort();
const frozenMigrations = [
  "supabase/migrations/20260810010000_social_block_authority.sql",
  "supabase/migrations/20260810020000_social_participation_authority.sql",
  "supabase/migrations/20260810030000_social_candidate_authorization_authority.sql",
  "supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql",
  "supabase/migrations/20260810050000_social_runtime_executor_role.sql"
];

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const same = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);
function candidatePaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0").filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}
function changedSince(ref, pathspec) {
  return [...new Set([
    ...lines(git(["diff", "--name-only", ref, "--", pathspec])),
    ...lines(git(["ls-files", "--others", "--exclude-standard", "--", pathspec]))
  ])].sort();
}
function executableSql(source) {
  return source.split(/\r?\n/).map((line) => line.trim().startsWith("--") ? "" : line.split("--")[0]).join("\n");
}
function schemaCreateGrants(source) {
  return [...source.matchAll(/\bgrant\s+([^;]+?)\s+on\s+schema\s+social_internal\s+to\s+([^;]+);/gi)]
    .filter((match) => match[1].split(",").some((privilege) => /^(create|all(?: privileges)?)$/i.test(privilege.trim())))
    .map((match) => ({
      index: match.index,
      grantees: match[2].replace(/\s+with\s+grant\s+option\s*$/i, "").split(",").map((grantee) => grantee.trim().toLowerCase())
    }));
}

try {
  const sqlRaw = read(MIGRATION);
  const sql = executableSql(sqlRaw);
  const sharedAuth = read(SHARED_AUTH);
  const mealAuth = read(MEAL_AUTH);
  const provider = read(PROVIDER);
  const handler = read(HANDLER);
  const errors = read(ERRORS);
  const entry = read(ENTRY);
  const config = read(CONFIG);
  const toml = read("supabase/config.toml");
  const packageJson = JSON.parse(read("package.json"));
  // Lifecycle-aware, never lifecycle-dependent: the candidate set is read from the working tree
  // while the round is open, and from the freeze commit's own diff-tree once it has landed, so the
  // verdict is identical before and after the freeze.
  const freezeCommit = lines(git(["log", "--format=%H%x09%s", `${baseline}..HEAD`]))
    .map((entry) => entry.split("\t"))
    .find(([, subject]) => subject === freezeMessage)?.[0] ?? null;
  const lifecycleManifest = freezeCommit
    ? lines(git(["diff-tree", "--no-commit-id", "--name-only", "-r", freezeCommit]))
    : candidatePaths();

  check("1. candidate manifest is exact and contains no unrelated path", same(lifecycleManifest, SR1C_SUCCESSOR_PATHS) && same(manifest, SR1C_SUCCESSOR_PATHS), { expected: SR1C_SUCCESSOR_PATHS, actual: lifecycleManifest });
  check("2. every candidate path exists", manifest.every((file) => fs.existsSync(path.join(root, file))));
  check("3. baseline remains ancestor authority", git(["merge-base", baseline, "HEAD"]).trim() === baseline);
  check("4. staged diff remains empty", git(["diff", "--cached", "--name-only"]).trim() === "");
  check("5. package adds the three exact SR-1C local scripts", ["test:social-ingress-sr1c", "test:social-ingress-sr1c-smoke", "test:social-ingress-sr1c-mutations"].every((key) => typeof packageJson.scripts[key] === "string"));
  check("6. SR-1C migration is frozen and every later migration is an exact enumerated successor",
    git(["diff", "--name-only", successorBaseline, "--", MIGRATION]).trim() === ""
    && same(changedSince(successorBaseline, "supabase/migrations").filter((entry) => !SR2GA_SUCCESSOR_PATHS.includes(entry)), [SR1D_SUCCESSOR_MIGRATION, SR2B_SUCCESSOR_MIGRATION, SR2C_SUCCESSOR_MIGRATION].sort()));
  check("6a. the SR-1D successor is an exact path manifest without wildcard authority",
    same(changedSince(successorBaseline, "."), [...new Set([...SR1D_SUCCESSOR_PATHS, ...SR2A_SUCCESSOR_PATHS, ...SR2B_SUCCESSOR_PATHS, ...SR2C_SUCCESSOR_PATHS,
    ...SR2D_SUCCESSOR_PATHS,
    ...SR2E_SUCCESSOR_PATHS, ...SR2F_SUCCESSOR_PATHS, ...SR2GA_SUCCESSOR_PATHS])].sort())
    && SR1D_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry)));
  check("6b. SR-2A successor paths are exact, wildcard-free and confined to pure shared ranking plus validation", SR2A_SUCCESSOR_PATHS.length > 0
    && new Set(SR2A_SUCCESSOR_PATHS).size === SR2A_SUCCESSOR_PATHS.length
    && SR2A_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2A_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-ranking/"))
    && !SR2A_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry.startsWith("supabase/migrations/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("6c. SR-2B successor paths are wildcard-free and confined to the pure shared exposure module plus exactly one grant migration", SR2B_SUCCESSOR_PATHS.length > 0
    && new Set(SR2B_SUCCESSOR_PATHS).size === SR2B_SUCCESSOR_PATHS.length
    && SR2B_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-exposure/") || entry === SR2B_SUCCESSOR_MIGRATION)
    && SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2B_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("6d. SR-2C successor paths are wildcard-free and confined to the pure shared profile module plus exactly one projection migration", SR2C_SUCCESSOR_PATHS.length > 0
    && new Set(SR2C_SUCCESSOR_PATHS).size === SR2C_SUCCESSOR_PATHS.length
    && SR2C_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-profile/") || entry === SR2C_SUCCESSOR_MIGRATION)
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2C_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("7. every frozen predecessor migration is byte-unchanged", frozenMigrations.every((file) => git(["diff", "--name-only", baseline, "--", file]).trim() === ""));
  check("8. every predecessor guard imports and applies the exact SR-1C successor manifest", predecessorGuards.every((file) => read(file).includes("social-ingress-sr1c-successor-manifest.mjs") && read(file).includes("SR1C_SUCCESSOR_PATHS")));

  check("9. pool is one internal canonical function", /create function social_internal\.canonical_candidate_pool\(p_actor_user_id uuid\)/i.test(sql) && (sql.match(/create function/gi) ?? []).length === 1);
  check("10. pool returns identity only", /returns setof uuid/i.test(sql) && !/returns table/i.test(sql));
  check("11. pool is stable SECURITY DEFINER", /language sql\s+stable\s+security definer/i.test(sql));
  check("12. pool has hardened search_path", /set search_path = pg_catalog, pg_temp/i.test(sql));
  check("13. pool owner is social_authority", /alter function social_internal\.canonical_candidate_pool\(uuid\) owner to social_authority/i.test(sql));
  const createGrant = "grant create on schema social_internal to social_authority;";
  const createFunction = "create function social_internal.canonical_candidate_pool(p_actor_user_id uuid)";
  const ownerTransfer = "alter function social_internal.canonical_candidate_pool(uuid) owner to social_authority;";
  const createRevoke = "revoke create on schema social_internal from social_authority;";
  const createGrantIndex = sql.indexOf(createGrant);
  const createFunctionIndex = sql.indexOf(createFunction);
  const ownerTransferIndex = sql.indexOf(ownerTransfer);
  const createRevokeIndex = sql.indexOf(createRevoke);
  const createGrants = schemaCreateGrants(sql);
  check("13a. social_authority receives exactly one transient schema CREATE grant",
    createGrants.length === 1
    && createGrants[0].index === createGrantIndex
    && same(createGrants[0].grantees, ["social_authority"]));
  check("13b. transient schema CREATE is granted before function creation",
    createGrantIndex >= 0 && createGrantIndex < createFunctionIndex);
  check("13c. transient schema CREATE remains available through ownership transfer",
    createFunctionIndex < ownerTransferIndex && createGrantIndex < ownerTransferIndex);
  check("13d. social_authority schema CREATE is revoked exactly once",
    (sql.match(/revoke create on schema social_internal from social_authority;/gi) ?? []).length === 1);
  check("13e. schema CREATE is revoked only after ownership transfer",
    ownerTransferIndex >= 0 && ownerTransferIndex < createRevokeIndex);
  check("13f. final durable posture retains no schema CREATE grant",
    createRevokeIndex >= 0
    && createGrants.length === 1
    && createGrants[0].index < createRevokeIndex
    && !/grant create on schema social_internal to social_authority;[\s\S]*revoke create on schema social_internal from social_authority;[\s\S]*grant create on schema social_internal to social_authority;/i.test(sql));
  check("14. self is explicitly excluded", /participation\.user_id <> p_actor_user_id/i.test(sql));
  check("15. candidate enumeration requires opted_in", /participation\.state = 'opted_in'/i.test(sql));
  check("16. D1 pair predicate is the sole eligibility truth", /social_internal\.may_evaluate_candidate\(p_actor_user_id, participation\.user_id\)/i.test(sql) && !/consumer_profiles|social_blocks/i.test(sql));
  check("17. ordering is exact transport order", /order by participation\.opted_in_at asc, participation\.user_id asc/i.test(sql));
  check("18. source explicitly says ordering is not ranking", /not ranking/i.test(sqlRaw));
  check("19. hard bound is exact and internal", /limit 256/i.test(sql) && !/p_limit|limit\s+\$/i.test(sql));
  check("20. duplicates are structurally impossible through participation primary identity", /from public\.social_participation as participation/i.test(sql) && !/join/i.test(sql));

  check("21. social_authority receives only opted_in_at successor column grant", /grant select \(opted_in_at\) on table public\.social_participation to social_authority/i.test(sql) && (sql.match(/grant select/gi) ?? []).length === 1);
  check("22. executor receives exact internal schema USAGE", /grant usage on schema social_internal to social_runtime_executor/i.test(sql));
  check("23. executor receives exact pool EXECUTE", /grant execute on function social_internal\.canonical_candidate_pool\(uuid\) to social_runtime_executor/i.test(sql));
  check("24. executor receives no table SELECT", !/grant select[^;]*social_runtime_executor/i.test(sql));
  check("25. executor receives no authority membership", !/grant social_(authority|pair_read_authority) to social_runtime_executor/i.test(sql));
  check("26. executor receives no D1 or B1 execution", !/grant execute on function social_internal\.(authorized_candidates|may_evaluate_candidate|authorized_pair_sources)/i.test(sql));
  check("27. executor receives no CREATE or generic function privilege", !createGrants.some((grant) => grant.grantees.includes("social_runtime_executor")) && !/grant execute on all functions/i.test(sql));
  check("27a. schema CREATE is never widened to PUBLIC or a client/service role",
    !createGrants.some((grant) => grant.grantees.some((grantee) => ["public", "anon", "authenticated", "authenticator", "service_role"].includes(grantee))));
  check("28. PUBLIC and all client/service roles are explicitly denied pool execution", ["public", "anon", "authenticated", "authenticator", "service_role"].every((role) => new RegExp(`revoke all on function social_internal\\.canonical_candidate_pool\\(uuid\\) from ${role}`, "i").test(sql)));
  check("29. transient authority membership is released", /revoke social_authority from postgres/i.test(sql));

  check("30. shared auth is the one implementation", (sharedAuth.match(/createClient\(/g) ?? []).length === 1 && (sharedAuth.match(/auth\.getUser\(\)/g) ?? []).length === 1);
  check("31. meal-photo auth is compatibility re-export only", /from "\.\.\/_shared\/auth\/authenticateCaller\.ts"/.test(mealAuth) && !/createClient|getUser\(/.test(mealAuth));
  check("32. auth requires Authorization and real getUser result", /headers\.get\("Authorization"\)/.test(sharedAuth) && /error \|\| !data\.user/.test(sharedAuth));
  check("33. auth has no local JWT decode or service-role shortcut", !/decode|atob|service[_-]?role|admin/i.test(sharedAuth));

  check("34. Edge config registers verify_jwt true in its own TOML section", /\[functions\.social-candidate-provenance\][^[]*?verify_jwt = true/.test(toml));
  check("35. ingress is POST only", /request\.method !== "POST"/.test(handler));
  check("36. empty body contract rejects all submitted fields", /Object\.keys\([^)]*\)\.length === 0/.test(handler));
  check("37. ingress rejects every query parameter", /url\.searchParams\.keys\(\)/.test(handler));
  check("38. ingress rejects authority headers", handler.includes("AUTHORITY_HEADERS.some((name) => request.headers.has(name))"));
  check("39. actor comes only from authenticated outcome", /getCanonicalSocialCandidates\(authentication\.value\.userId\)/.test(handler) && !/actor_user_id|candidate_user_ids|target_user_id/i.test(handler));
  check("40. provider invokes only canonical pool through B3 transport", /canonical_candidate_pool\(\$1::uuid\)/.test(provider) && /createDenoSocialRuntimeExecutorTransport/.test(provider) && !/public\.(social_participation|social_blocks|consumer_profiles)/.test(provider));
  check("41. provider accepts no limit or candidates", /getCanonicalSocialCandidates\(actorUserId: string\)/.test(provider) && !/candidateUserIds|targetUserId|\blimit\b/i.test(provider));
  check("42. provider fails closed above 256", /rows\.length > SOCIAL_CANDIDATE_POOL_HARD_MAXIMUM/.test(provider) && /throw new Error\("candidate_pool_contract_violated"\)/.test(provider));
  check("43. provider errors are not converted to empty candidates", !/catch[\s\S]{0,100}return \[\]/.test(provider));
  check("44. provider closes B3 transport", /await transport\.close\(\)/.test(provider) && /finally[\s\S]*await provider\.close\(\)/.test(handler));

  check("45. success response contains candidate_count only", /JSON\.stringify\(\{ candidate_count: candidateCount \}\)/.test(handler));
  check("46. response count is bounded and integer", /Number\.isInteger\(candidateCount\)/.test(handler) && /candidateCount > SOCIAL_CANDIDATE_POOL_HARD_MAXIMUM/.test(handler));
  check("47. no candidate identity is serialized", !/JSON\.stringify\([^\n]*(candidates|candidate_user_id|userId)/.test(handler));
  check("48. safe error envelope has no raw error input", /buildSocialCandidateProvenanceError\(code/.test(errors) && !/unknown|detail|stack|sql|cause|raw/i.test(errors));
  check("49. provider/database failure is server error, never count zero", /catch \{\s*return buildSocialCandidateProvenanceError\("server_unavailable"\)/.test(handler) && !/candidate_count:\s*0/.test(handler));
  check("50. entry catches unknown failures into safe error", /catch \{[\s\S]*buildSocialCandidateProvenanceError\("server_unavailable"\)/.test(entry));
  check("51. no service-role transport shortcut exists", !/service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i.test(`${provider}\n${handler}\n${config}\n${entry}`));
  check("52. no candidate pool product Taste integration exists", !/authorized_candidates|authorized_pair_sources|taste|similarity|ranking/i.test(`${provider}\n${handler}`));
  check("53. no CORS or OPTIONS policy was invented", !/access-control-allow|OPTIONS/i.test(`${handler}\n${entry}`));

  console.log(JSON.stringify({ suite: "social-ingress-sr1c-guard", status: failures.length ? "failed" : "passed", totalChecks: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
  process.exit(failures.length ? 1 : 0);
} catch (error) {
  console.error(JSON.stringify({ suite: "social-ingress-sr1c-guard", status: "crashed", error: error instanceof Error ? error.message : String(error), networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
  process.exit(1);
}
