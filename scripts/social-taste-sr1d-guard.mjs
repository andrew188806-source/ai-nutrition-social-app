#!/usr/bin/env node
// SR-1D local guard. No network, database, credential, deployment or Production access.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  SR1D_BASELINE,
  SR1D_SUCCESSOR_MIGRATION,
  SR1D_SUCCESSOR_PATHS
} from "./social-taste-sr1d-successor-manifest.mjs";
import {
  SR2A_BASELINE,
  SR2A_SUCCESSOR_PATHS
} from "./social-ranking-sr2a-successor-manifest.mjs";
import {
  SR2B_BASELINE,
  SR2B_SUCCESSOR_MIGRATION,
  SR2B_SUCCESSOR_PATHS
} from "./social-exposure-sr2b-successor-manifest.mjs";
import {
  classifySr2cLifecycle,
  SR2C_BASELINE,
  SR2C_SUCCESSOR_MIGRATION,
  SR2C_SUCCESSOR_PATHS
} from "./social-profile-sr2c-successor-manifest.mjs";
import {
  classifySr2dLifecycle,
  SR2D_BASELINE,
  SR2D_SUCCESSOR_PATHS
} from "./social-candidate-sr2d-successor-manifest.mjs";
import { SR2E_SUCCESSOR_PATHS } from "./social-candidate-sr2e-successor-manifest.mjs";
import { SR2F_SUCCESSOR_PATHS } from "./social-candidate-sr2f-successor-manifest.mjs";
import { SR2GA_SUCCESSOR_PATHS } from "./social-candidate-sr2g-a-successor-manifest.mjs";
import { SR2GB_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-successor-manifest.mjs";
import {
  SR2GC_SUCCESSOR_PATHS
} from "./social-candidate-sr2g-c-successor-manifest.mjs";
import { SR2GBR1_BASELINE, SR2GBR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-r1-successor-manifest.mjs";
import { SR2GCR1_BASELINE, SR2GCR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-c-r1-successor-manifest.mjs";
import { SR2CR1_BASELINE, SR2CR1_SUCCESSOR_PATHS } from "./social-interest-sr2c-r1-successor-manifest.mjs";
import { SR2GD_BASELINE, SR2GD_SUCCESSOR_PATHS } from "./social-candidate-sr2g-d-successor-manifest.mjs";
import { SR2GE1_TOOLING_COMMIT, SR2GE1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e1-successor-manifest.mjs";
import { SR2GE2_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e2-successor-manifest.mjs";
import { classifySr2gfLifecycle, SR2GF_BASELINE, SR2GF_SUCCESSOR_PATHS } from "./social-candidate-sr2g-f-successor-manifest.mjs";
import { classifyRecbp0Lifecycle, RECBP0_PATHS } from "./recommendation-rec-b-p0-successor-manifest.mjs";

const root = process.cwd();
const successorMigrationSha256 = "e0859f801c040002e855f2b03e27a5f8f95fd037c23210223a1ce29881bbe624";
const ADAPTER = "supabase/functions/_shared/social-pair/authorizedPairSourcesAdapter.ts";
const BARREL = "supabase/functions/_shared/social-pair/index.ts";
const EDGE_ROOT = "supabase/functions/social-candidate-taste";
const CONFIG = `${EDGE_ROOT}/config.ts`;
const ERRORS = `${EDGE_ROOT}/errors.ts`;
const HANDLER = `${EDGE_ROOT}/handler.ts`;
const ENTRY = `${EDGE_ROOT}/index.ts`;
const PROVIDER = `${EDGE_ROOT}/tasteProvider.ts`;
const predecessorGuards = [
  "scripts/social-pair-sr1a-guard.mjs",
  "scripts/social-block-sr1b-b-guard.mjs",
  "scripts/social-participation-sr1b-c-guard.mjs",
  "scripts/social-candidate-authorization-sr1b-d1-guard.mjs",
  "scripts/social-authorized-pair-read-sr1b-d2-b1-guard.mjs",
  "scripts/social-runtime-executor-sr1b-d2-b2-guard.mjs",
  "scripts/social-runtime-transport-sr1b-d2-b3-guard.mjs",
  "scripts/social-ingress-sr1c-guard.mjs",
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
const frozenMigrations = new Map([
  ["supabase/migrations/20260810010000_social_block_authority.sql", "9484f1e2e199267c40e46cf783bd4078b294fca36591aec097831b921c3f4c50"],
  ["supabase/migrations/20260810020000_social_participation_authority.sql", "dcb896bab2dca7382c71ffb8bf141940723e4c9f55a58ac33ff96222812b6535"],
  ["supabase/migrations/20260810030000_social_candidate_authorization_authority.sql", "f0127ed726dd252022126ba6eac9399d39478ec61f80ef68bf2abe945fa1801f"],
  ["supabase/migrations/20260810040000_social_authorized_pair_read_authority.sql", "2b3c57851cf52e3259aaa8df5a68f911672c9cb885205e4148e6faea979fad6a"],
  ["supabase/migrations/20260810050000_social_runtime_executor_role.sql", "501243dbc6b7179259be32b2d627d21d1e2d11f93dc31dde4c8fea26958eecbc"],
  ["supabase/migrations/20260811010000_social_canonical_candidate_pool.sql", "0d5c683d129038527a6b72db8ea28d87e94efe18a39928d13b4fc82e5f0ba9fb"]
]);

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
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const sortedLines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const same = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);
const executable = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split(/\r?\n/)
  .map((line) => line.trim().startsWith("--") || line.trim().startsWith("//") ? "" : line.split("--")[0].split("//")[0])
  .join("\n");
function candidatePaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).split("\0").filter(Boolean)
    .map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}
function commitDeltaEntries(commit = "HEAD") {
  return git(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", commit])
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [status, file] = entry.split("\t");
      return Object.freeze({ status, path: file.replaceAll("\\", "/") });
    });
}
function collectLifecycleState() {
  const head = git(["rev-parse", "HEAD"]).trim();
  const originHead = git(["rev-parse", "origin/main"]).trim();
  const [ahead, behind] = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"])
    .trim().split(/\s+/).map(Number);
  return Object.freeze({
    head,
    originHead,
    ahead,
    behind,
    headParent: head === SR2GF_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
    worktreePaths: candidatePaths(),
    stagedPaths: sortedLines(git(["diff", "--cached", "--name-only"])),
    headDeltaEntries: head === SR2GF_BASELINE ? [] : commitDeltaEntries()
  });
}

try {
  const sqlRaw = read(SR1D_SUCCESSOR_MIGRATION);
  const sql = executable(sqlRaw);
  const adapterRaw = read(ADAPTER);
  const adapter = executable(adapterRaw);
  const providerRaw = read(PROVIDER);
  const provider = executable(providerRaw);
  const handlerRaw = read(HANDLER);
  const handler = executable(handlerRaw);
  const errors = executable(read(ERRORS));
  const entry = executable(read(ENTRY));
  const config = executable(read(CONFIG));
  const toml = read("supabase/config.toml");
  const packageJson = JSON.parse(read("package.json"));
  const lifecycleState = collectLifecycleState();
  const lifecycle = classifySr2gfLifecycle(lifecycleState);
  const recbp0Lifecycle = classifyRecbp0Lifecycle({
    ...lifecycleState,
    parent: lifecycleState.headParent,
    deltaPaths: lifecycleState.headDeltaEntries.map(({ path: file }) => file),
    deleted: lifecycleState.headDeltaEntries.some(({ status }) => status === "D")
  });
  const effectiveLifecycle = recbp0Lifecycle.valid ? recbp0Lifecycle : lifecycle;
  const frozenDeltaEntries = commitDeltaEntries(SR2A_BASELINE);
  const frozenDeltaPaths = frozenDeltaEntries.map(({ path: file }) => file).sort();
  const frozenMigrationTracked = git(["ls-tree", "-r", "--name-only", SR2A_BASELINE, "--", SR1D_SUCCESSOR_MIGRATION]).trim() === SR1D_SUCCESSOR_MIGRATION;

  check("1. frozen SR-1D commit has the exact predecessor parent and immutable manifest", git(["rev-parse", `${SR2A_BASELINE}^`]).trim() === SR1D_BASELINE && same(frozenDeltaPaths, SR1D_SUCCESSOR_PATHS) && !frozenDeltaEntries.some(({ status }) => status === "D"), { expectedParent: SR1D_BASELINE, expected: SR1D_SUCCESSOR_PATHS, actual: frozenDeltaPaths });
  check("1a. candidate or frozen successor manifest is exact and contains no unrelated path",
    recbp0Lifecycle.valid ? same(recbp0Lifecycle.manifest, RECBP0_PATHS) : same(lifecycle.lifecycleManifest, SR2GF_SUCCESSOR_PATHS),
    { expected: recbp0Lifecycle.valid ? RECBP0_PATHS : SR2GF_SUCCESSOR_PATHS, actual: recbp0Lifecycle.valid ? recbp0Lifecycle.manifest : lifecycle.lifecycleManifest });
  check("1b2. frozen SR-2B commit remains the exact immutable predecessor of this successor round", git(["rev-parse", `${SR2C_BASELINE}^`]).trim() === SR2B_BASELINE && same(commitDeltaEntries(SR2C_BASELINE).map(({ path: file }) => file).sort(), SR2B_SUCCESSOR_PATHS));
  check("1b. frozen SR-2A commit remains the exact immutable predecessor of this successor round", git(["rev-parse", `${SR2B_BASELINE}^`]).trim() === SR2A_BASELINE && same(commitDeltaEntries(SR2B_BASELINE).map(({ path: file }) => file).sort(), SR2A_SUCCESSOR_PATHS));
  check("1c. SR-2B successor paths are wildcard-free and confined to the pure shared exposure module plus exactly one grant migration", SR2B_SUCCESSOR_PATHS.length > 0
    && new Set(SR2B_SUCCESSOR_PATHS).size === SR2B_SUCCESSOR_PATHS.length
    && SR2B_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-exposure/") || entry === SR2B_SUCCESSOR_MIGRATION)
    && SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2B_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("1d. SR-2C successor paths are wildcard-free and confined to the pure shared profile module plus exactly one projection migration", SR2C_SUCCESSOR_PATHS.length > 0
    && new Set(SR2C_SUCCESSOR_PATHS).size === SR2C_SUCCESSOR_PATHS.length
    && SR2C_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-profile/") || entry === SR2C_SUCCESSOR_MIGRATION)
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2C_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("2. every exact candidate path exists", SR1D_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
  check("3. lifecycle is exactly an authorized successor state rooted at the frozen SR-1D authority", effectiveLifecycle.valid, { phase: effectiveLifecycle.phase, head: lifecycleState.head, originHead: lifecycleState.originHead, ahead: lifecycleState.ahead, behind: lifecycleState.behind, headParent: lifecycleState.headParent });
  check("4. candidate and frozen lifecycle both prohibit staged bytes", lifecycleState.stagedPaths.length === 0, { stagedPaths: lifecycleState.stagedPaths });
  check("5. package exposes the three exact SR-1D local suites", ["test:social-taste-sr1d", "test:social-taste-sr1d-smoke", "test:social-taste-sr1d-mutations"].every((key) => typeof packageJson.scripts[key] === "string" && packageJson.scripts[key].includes("social-taste-sr1d-")));
  check("6. frozen SR-1D successor migration remains tracked at its exact immutable path", frozenMigrationTracked && fs.existsSync(path.join(root, SR1D_SUCCESSOR_MIGRATION)) && git(["diff", "--name-only", SR2A_BASELINE, "--", SR1D_SUCCESSOR_MIGRATION]).trim() === "");
  check("6a. successor migration retains the Development-accepted SHA-256", sha256(SR1D_SUCCESSOR_MIGRATION) === successorMigrationSha256);
  check("7. all six predecessor migrations retain their frozen SHA-256", [...frozenMigrations].every(([file, hash]) => sha256(file) === hash));
  check("8. all predecessor guards use the exact SR-1D successor manifest", predecessorGuards.every((file) => read(file).includes("social-taste-sr1d-successor-manifest.mjs") && read(file).includes("SR1D_SUCCESSOR_PATHS")));
  check("9. SR-1C runtime and migration bytes are untouched", [
    "supabase/migrations/20260811010000_social_canonical_candidate_pool.sql",
    "supabase/functions/social-candidate-provenance",
    "supabase/functions/_shared/auth/authenticateCaller.ts"
  ].every((file) => git(["diff", "--name-only", SR1D_BASELINE, "--", file]).trim() === ""));

  check("10. successor creates exactly one internal uuid-only function", /create function social_internal\.canonical_candidate_taste_sources\(p_actor_user_id uuid\)/i.test(sql) && (sql.match(/create function/gi) ?? []).length === 1 && !/p_candidate|p_meal|p_favorites|p_limit|p_date/i.test(sql));
  check("11. function returns jsonb and is SQL STABLE SECURITY DEFINER", /returns jsonb\s+language sql\s+stable\s+security definer/i.test(sql));
  check("12. function has the hardened search_path", /set search_path = pg_catalog, pg_temp/i.test(sql));
  check("13. function body is one SQL statement", (sqlRaw.match(/as \$\$([\s\S]*?)\$\$;/i)?.[1].match(/;/g) ?? []).length === 1);
  check("14. canonical pool is generated internally and aggregated to uuid[]", /canonical_candidate_pool\(p_actor_user_id\)[\s\S]*with ordinality/i.test(sql) && /array_agg\(candidate\.user_id order by candidate\.ordinality\)/i.test(sql) && /'\{\}'::uuid\[\]/i.test(sql));
  check("15. B1 is the only downstream authority call with exact 20 and 10", (sql.match(/social_internal\.authorized_pair_sources\(/gi) ?? []).length === 1 && /authorized_pair_sources\(\s*p_actor_user_id,\s*canonical_candidate_array\.user_ids,\s*20,\s*10\s*\)/i.test(sql));
  check("16. no separate D1 call or direct protected-table read exists", !/authorized_candidates|may_evaluate_candidate|public\.(taste_profiles|nutrition_goals|dietary_restrictions|meal_records|meal_record_items|favorite_restaurants|favorite_menu_items)/i.test(sql));
  check("17. SQL carries no date parameter, predicate or wall clock", !/start_date|end_date|occurred_at\s*[<>=]|created_at\s*[<>=]|current_date|current_timestamp|clock_timestamp|\bnow\s*\(/i.test(sql));

  const poolOwnerGrant = sql.indexOf("set local role social_authority;");
  const poolExecuteGrant = sql.indexOf("grant execute on function social_internal.canonical_candidate_pool(uuid)");
  const restoreAfterPool = sql.indexOf("set local role postgres;", poolExecuteGrant);
  const createGrant = sql.indexOf("grant create on schema social_internal to social_pair_read_authority;");
  const createFunction = sql.indexOf("create function social_internal.canonical_candidate_taste_sources");
  const firstPublicRevoke = sql.indexOf("revoke all on function social_internal.canonical_candidate_taste_sources(uuid) from public;");
  const ownerTransfer = sql.indexOf("alter function social_internal.canonical_candidate_taste_sources(uuid)");
  const pairOwnerRole = sql.indexOf("set local role social_pair_read_authority;", ownerTransfer);
  const executorGrant = sql.indexOf("grant execute on function social_internal.canonical_candidate_taste_sources(uuid)");
  const restoreAfterExecutor = sql.indexOf("set local role postgres;", executorGrant);
  const createRevoke = sql.indexOf("revoke create on schema social_internal from social_pair_read_authority;");
  check("18. pool EXECUTE grant is issued as social_authority then explicitly restores postgres", poolOwnerGrant >= 0 && poolOwnerGrant < poolExecuteGrant && poolExecuteGrant < restoreAfterPool);
  check("19. migration never uses RESET ROLE", !/\breset\s+role\b/i.test(sql));
  check("20. B1 owner receives transient schema CREATE before function creation", createGrant >= 0 && createGrant < createFunction);
  check("21. every unwanted EXECUTE revoke precedes ownership transfer", ["public", "anon", "authenticated", "authenticator", "service_role", "social_authority", "social_runtime_executor"].every((role) => {
    const index = sql.indexOf(`revoke all on function social_internal.canonical_candidate_taste_sources(uuid) from ${role};`);
    return index >= firstPublicRevoke && index < ownerTransfer;
  }));
  check("22. ownership transfers exactly to social_pair_read_authority", /alter function social_internal\.canonical_candidate_taste_sources\(uuid\)\s+owner to social_pair_read_authority;/i.test(sql));
  check("23. executor grant is issued as function owner then explicitly restores postgres", ownerTransfer < pairOwnerRole && pairOwnerRole < executorGrant && executorGrant < restoreAfterExecutor);
  check("24. transient schema CREATE is revoked after owner/grant lifecycle", restoreAfterExecutor < createRevoke && (sql.match(/grant create on schema social_internal to social_pair_read_authority;/gi) ?? []).length === 1 && (sql.match(/revoke create on schema social_internal from social_pair_read_authority;/gi) ?? []).length === 1);
  check("25. both transient postgres memberships are released", /revoke social_authority from postgres;/i.test(sql) && /revoke social_pair_read_authority from postgres;/i.test(sql));
  check("26. durable capability delta is exactly pool-to-B1 and orchestrator-to-executor", (sql.match(/grant execute on function/gi) ?? []).length === 2 && /canonical_candidate_pool\(uuid\)[\s\S]*to social_pair_read_authority;/i.test(sql) && /canonical_candidate_taste_sources\(uuid\)[\s\S]*to social_runtime_executor;/i.test(sql));
  check("27. executor gets no D1/B1 execution, membership, table read, schema CREATE or generic grant", !/grant[^;]*(authorized_candidates|may_evaluate_candidate|authorized_pair_sources)[^;]*social_runtime_executor|grant social_(authority|pair_read_authority) to social_runtime_executor|grant select[^;]*social_runtime_executor|grant create[^;]*social_runtime_executor|grant execute on all functions/i.test(sql));

  check("28. adapter exports exactly the seven frozen B1 source keys", ["taste_profiles", "nutrition_goals", "dietary_restrictions", "meal_records", "meal_record_items", "favorite_restaurants", "favorite_menu_items"].every((key) => adapterRaw.includes(`"${key}"`)) && (adapterRaw.match(/availableRows\(value,/g) ?? []).length === 7);
  check("29. adapter emits available rows only", /status: "available" as const, rows:/i.test(adapter) && !/status: "(failed|empty)"/i.test(adapter));
  check("30. adapter never consumes B1 truncation metadata", !/has_more|requested_limit|returned_count/i.test(adapter));
  check("31. shared barrel exports only the additive adapter path", read(BARREL).includes('export * from "./authorizedPairSourcesAdapter.ts";'));

  check("32. provider uses exactly one static orchestration statement through frozen B3", /canonical_candidate_taste_sources\(\$1::uuid\)/.test(provider) && /createDenoSocialRuntimeExecutorTransport/.test(provider) && (provider.match(/defineSocialRuntimeExecutorStatement<CandidateTastePayloadRow>`/g) ?? []).length === 1);
  check("33. provider accepts actor identity only", (provider.match(/evaluateCanonicalCandidates\(actorUserId: string\)/g) ?? []).length === 2 && !/evaluateCanonicalCandidates\(actorUserId: string\s*,/.test(provider));
  check("34. provider never invokes D1, B1 or protected tables directly", !/authorized_candidates|authorized_pair_sources|may_evaluate_candidate|public\.(taste_profiles|nutrition_goals|dietary_restrictions|meal_records|meal_record_items|favorite_restaurants|favorite_menu_items)/i.test(provider));
  check("35. all four frozen evidence limits are exact", /SOCIAL_TASTE_MEAL_LIMIT = 20/.test(provider) && /SOCIAL_TASTE_FAVORITES_PER_TABLE_LIMIT = 10/.test(provider) && /SOCIAL_TASTE_COMBINED_FAVORITES_LIMIT = 20/.test(provider) && /requestedLimit: SOCIAL_TASTE_MEAL_LIMIT/.test(provider) && /favoritesLimit: SOCIAL_TASTE_COMBINED_FAVORITES_LIMIT/.test(provider));
  check("36. one generatedAt instant is captured before candidate iteration", (provider.match(/now\(\)\.toISOString\(\)/g) ?? []).length === 1 && provider.indexOf("const generatedAt = now().toISOString();") < provider.indexOf("for (const candidate"));
  check("37. trailing 31-calendar-day metadata uses UTC arithmetic", /Date\.UTC\(year, month - 1, day - 30\)/.test(provider) && /toISOString\(\)\.slice\(0, 10\)/.test(provider) && !/getFullYear|getMonth|getDate|setDate|toLocale/i.test(provider));
  check("38. actor is composed exactly once before the candidate loop", (provider.match(/const actorSnapshot = composeServerSnapshot\(/g) ?? []).length === 1 && provider.indexOf("const actorSnapshot") < provider.indexOf("for (const candidate"));
  check("39. each candidate is composed independently with the same asOf", /for \(const candidate of payload\.candidates\)[\s\S]*const candidateSnapshot = composeServerSnapshot\([\s\S]*asOf\s*\)/.test(provider));
  check("40. comparison uses pre-composed snapshots and no repository composition path", /compareComposedServerPair\(actorSnapshot, candidateSnapshot\)/.test(provider) && !/composeServerSnapshotForUser/.test(provider));
  check("41. adapted and unsupported mean only the frozen adapter statuses", /value\.status !== "adapted" && value\.status !== "unsupported"/.test(provider) && !/score|ranking|orderKey|readiness|entitlement|premium/i.test(provider));
  check("42. empty B1 payload is a successful zero aggregate", /payload\.actor === null[\s\S]*authorizedCandidateCount: 0, adaptedCount: 0, unsupportedCount: 0/.test(provider));
  check("43. B1 and composition failures are not converted to empty success", !/catch[\s\S]{0,120}authorizedCandidateCount: 0/.test(provider));

  check("44. new ingress is POST-only with a closed empty-body/query/header contract", /request\.method !== "POST"/.test(handler) && /url\.searchParams\.keys\(\)/.test(handler) && /Object\.keys\([^)]*\)\.length === 0/.test(handler) && /AUTHORITY_HEADERS\.some/.test(handler));
  check("45. all named authority inputs are rejected", ["actor", "user", "viewer", "requesting", "candidate", "candidates", "target", "meal", "favorites", "limit", "start", "end"].every((token) => handlerRaw.toLowerCase().includes(token)));
  check("46. actor comes only from canonical getUser authentication", /authenticateCaller/.test(handler) && /evaluateCanonicalCandidates\(authentication\.value\.userId\)/.test(handler) && !/actor_user_id|candidate_user_ids|target_user_id/i.test(executable(handlerRaw.replace(/const AUTHORITY_HEADERS[\s\S]*?\] as const\);/, ""))));
  check("47. success response is the exact three aggregate counts", /JSON\.stringify\(\{\s*authorized_candidate_count: diagnostics\.authorizedCandidateCount,\s*adapted_count: diagnostics\.adaptedCount,\s*unsupported_count: diagnostics\.unsupportedCount\s*\}\)/.test(handler));
  check("47a. every aggregate is a bounded non-negative integer and the partition sum is exact", ["authorizedCandidateCount", "adaptedCount", "unsupportedCount"].every((field) => new RegExp(`Number\\.isInteger\\(diagnostics\\.${field}\\)`).test(handler)) && /authorizedCandidateCount > SOCIAL_TASTE_MAXIMUM_CANDIDATES/.test(handler) && /authorizedCandidateCount !== diagnostics\.adaptedCount \+ diagnostics\.unsupportedCount/.test(handler));
  check("48. response contains no UUID, private row or per-candidate field", !/(?:actor|candidate)_user_id\s*:|candidate_user_ids\s*:|candidates\s*:|sources\s*:|rows\s*:|shared_taste_result\s*:|similarity\s*:|confidence\s*:|evidence\s*:/i.test(handler));
  check("49. SharedTasteAdapterResult is never returned, logged, persisted or cached", !/console\.|Deno\.write|fetch\(|insert\(|upsert\(|cache/i.test(`${provider}\n${handler}\n${entry}`));
  check("50. safe errors contain no raw input", /buildSocialCandidateTasteError\(code/.test(errors) && !/unknown|detail|stack|sql|cause|raw/i.test(errors));
  check("51. provider/database/composition errors fail closed as 503", /catch \{\s*return buildSocialCandidateTasteError\("server_unavailable"\)/.test(handler) && /catch \{[\s\S]*buildSocialCandidateTasteError\("server_unavailable"\)/.test(entry));
  check("52. provider closes the B3 transport", /await transport\.close\(\)/.test(provider) && /finally \{\s*await provider\.close\(\)/.test(handler));
  check("53. no service-role shortcut or credential material exists", !/service[_-]?role|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/i.test(`${provider}\n${handler}\n${config}\n${entry}`));
  check("54. config registers only an authenticated SR-1D ingress addition", /\[functions\.social-candidate-taste\][^[]*?verify_jwt = true/.test(toml));
  check("55. frozen SR-1C ingress remains count-only", /JSON\.stringify\(\{ candidate_count: candidateCount \}\)/.test(read("supabase/functions/social-candidate-provenance/handler.ts")) && !/taste|adapted_count|unsupported_count/i.test(read("supabase/functions/social-candidate-provenance/handler.ts")));
  check("56. no Mobile, product DTO, ranking, entitlement or pagination path is introduced", SR1D_SUCCESSOR_PATHS.every((file) => !file.startsWith("apps/")) && !/ranking|recommendation|premium|entitlement|pagination/i.test(`${provider}\n${handler}`));

  console.log(JSON.stringify({ suite: "social-taste-sr1d-guard", status: failures.length ? "failed" : "passed", lifecycle: effectiveLifecycle.phase, totalChecks: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
  process.exit(failures.length ? 1 : 0);
} catch (error) {
  console.error(JSON.stringify({ suite: "social-taste-sr1d-guard", status: "crashed", error: error instanceof Error ? error.message : String(error), networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
  process.exit(1);
}
