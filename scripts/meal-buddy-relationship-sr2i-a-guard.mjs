#!/usr/bin/env node
// SR-2I-A lifecycle-aware local authority guard. Read-only: no network, database, credentials,
// deployment or repository writes.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  classifySr2iaLifecycle,
  createSr2iaManifest,
  SR2IA_BASELINE,
  SR2IA_BASELINE_SUBJECT,
  SR2IA_MIGRATION,
  SR2IA_SUCCESSOR_PATHS
} from "./meal-buddy-relationship-sr2i-a-successor-manifest.mjs";
import { SR2IB_SUCCESSOR_PATHS } from "./meal-buddy-relationship-sr2i-b-successor-manifest.mjs";
import { SR2JA_MIGRATION } from "./meal-buddy-chat-sr2j-a-successor-manifest.mjs";
import { auditSr2ibSources, SR2IB_SOURCE_PATHS } from "./meal-buddy-relationship-sr2i-b-contract.mjs";

const root = process.cwd(); const checks = []; const failures = [];
function check(name, condition, detail) {
  const result = { name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) };
  checks.push(result); if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout;
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const exact = (a, b) => a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);
const statusPaths = () => git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
const head = git(["rev-parse", "HEAD"]).trim();
const originHead = git(["rev-parse", "origin/main"]).trim();
const [ahead, behind] = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"]).trim().split(/\s+/).map(Number);
const delta = head === SR2IA_BASELINE ? [] : lines(git(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", "HEAD"]));
const state = Object.freeze({
  head, originHead, ahead, behind,
  parent: head === SR2IA_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
  worktreePaths: statusPaths(), stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
  deltaPaths: delta.map((entry) => entry.split("\t")[1]), deleted: delta.some((entry) => entry.startsWith("D\t"))
});
const lifecycle = classifySr2iaLifecycle(state);
const migration = read(SR2IA_MIGRATION);
const request = read("supabase/functions/_shared/meal-buddy-relationship-api/request.ts");
const types = read("supabase/functions/_shared/meal-buddy-relationship-api/types.ts");
const repository = read("supabase/functions/_shared/meal-buddy-relationship-api/repository.ts");
const service = read("supabase/functions/_shared/meal-buddy-relationship-api/service.ts");
const refPolicy = read("supabase/functions/_shared/meal-buddy-relationship-ref/policy.ts");
const refCrypto = read("supabase/functions/_shared/meal-buddy-relationship-ref/crypto.ts");
const handler = read("supabase/functions/meal-buddy-relationship/handler.ts");
const endpointConfig = read("supabase/functions/meal-buddy-relationship/config.ts");
const supabaseConfig = read("supabase/config.toml");
const packageJson = JSON.parse(read("package.json"));
const baselinePackage = JSON.parse(git(["show", `${SR2IA_BASELINE}:package.json`]));
const packageWithout = structuredClone(packageJson);
const commandNames = [
  "test:meal-buddy-relationship-sr2i-a",
  "test:meal-buddy-relationship-sr2i-a-smoke",
  "test:meal-buddy-relationship-sr2i-a-mutations",
  "test:meal-buddy-relationship-sr2i-a-concurrency"
];
for (const name of commandNames) delete packageWithout.scripts[name];
for (const name of ["test:meal-buddy-relationship-sr2i-b", "test:meal-buddy-relationship-sr2i-b-smoke", "test:meal-buddy-relationship-sr2i-b-mutations"]) delete packageWithout.scripts[name];
for (const name of ["test:meal-buddy-chat-sr2j-a", "test:meal-buddy-chat-sr2j-a-smoke", "test:meal-buddy-chat-sr2j-a-mutations", "test:meal-buddy-chat-sr2j-a-concurrency"]) delete packageWithout.scripts[name];
for (const key of ["test:meal-buddy-chat-sr2j-b", "test:meal-buddy-chat-sr2j-b-smoke", "test:meal-buddy-chat-sr2j-b-mutations"]) delete packageWithout.scripts[key];

check("01 lifecycle is exact candidate, frozen-unpushed or frozen-pushed", lifecycle.valid, { phase: lifecycle.phase, head, originHead, ahead, behind });
check("02 lifecycle inventory is exact and wildcard-free", exact(lifecycle.manifest, lifecycle.phase.startsWith("successor_") ? SR2IB_SUCCESSOR_PATHS : SR2IA_SUCCESSOR_PATHS));
check("03 pushed SR-2H-B baseline and subject are pinned", git(["cat-file", "-t", SR2IA_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2IA_BASELINE]).trim() === SR2IA_BASELINE_SUBJECT);
check("04 branch is main and baseline remains ancestor authority", git(["branch", "--show-current"]).trim() === "main" && spawnSync("git", ["merge-base", "--is-ancestor", SR2IA_BASELINE, "HEAD"], { cwd: root }).status === 0);
check("05 no staged or deleted path exists", state.stagedPaths.length === 0 && !state.deleted);
check("06 every exact candidate path exists", SR2IA_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
check("07 package preserves I-A commands while admitting exact successor validation commands", JSON.stringify(packageWithout) === JSON.stringify(baselinePackage));
check("08 dependencies, workspaces and lockfiles are unchanged", JSON.stringify(packageJson.dependencies) === JSON.stringify(baselinePackage.dependencies) && JSON.stringify(packageJson.devDependencies) === JSON.stringify(baselinePackage.devDependencies) && JSON.stringify(packageJson.workspaces) === JSON.stringify(baselinePackage.workspaces) && !SR2IA_SUCCESSOR_PATHS.some((file) => /lock(?:file)?/i.test(file)));
check("09 dedicated commands resolve to the four exact scripts", commandNames.every((name) => packageJson.scripts[name] === `node scripts/meal-buddy-relationship-sr2i-a-${name.split("-").at(-1) === "a" ? "guard" : name.split("-").at(-1)}.mjs`));
check("10 exactly one SR-2I-A migration is present", SR2IA_SUCCESSOR_PATHS.filter((file) => file.startsWith("supabase/migrations/")).length === 1 && SR2IA_SUCCESSOR_PATHS.includes(SR2IA_MIGRATION));

const sendSql = migration.split("create function social_internal.send_meal_buddy_invite")[1]?.split("create function social_internal.read_meal_buddy_relationship")[0] ?? "";
const readSql = migration.split("create function social_internal.read_meal_buddy_relationship")[1]?.split("create function social_internal.list_meal_buddy_relationships")[0] ?? "";
const listSql = migration.split("create function social_internal.list_meal_buddy_relationships")[1]?.split("create function social_internal.resolve_meal_buddy_relationship")[0] ?? "";
const resolveSql = migration.split("create function social_internal.resolve_meal_buddy_relationship")[1]?.split("comment on function")[0] ?? "";
check("11 canonical table has one ordered unique unordered pair", migration.includes("user_low_id < user_high_id") && migration.includes("unique (user_low_id, user_high_id)") && !/create table public\.(meal_buddy_invites|meal_buddy_friendships)/i.test(migration));
check("12 canonical lifecycle permits only pending accepted declined cancelled", /state in \('pending', 'accepted', 'declined', 'cancelled'\)/.test(migration) && migration.includes("meal_buddy_relationships_lifecycle_valid"));
check("13 accepted relationship is one symmetric row with no parallel pending", migration.includes("set state = 'accepted'") && migration.includes("accepted_at = v_now") && migration.includes("resolved_at = v_now"));
check("14 reinvite reuses only declined or cancelled canonical row", /elsif v_relation\.state in \('declined', 'cancelled'\)[\s\S]*set invited_by_user_id = p_actor_user_id,[\s\S]*state = 'pending'/.test(migration));
check("15 duplicate and reverse send cannot auto-accept", !/create function social_internal\.send_meal_buddy_invite[\s\S]*?set state = 'accepted'[\s\S]*?create function social_internal\.read_meal_buddy_relationship/.test(migration));
check("16 self invite and invalid target fail closed", migration.includes("p_actor_user_id = p_target_user_id") && migration.includes("RELATIONSHIP_TARGET_INVALID"));
check("17 sender and recipient authority is explicit", migration.includes("p_actor_user_id <> v_recipient") && migration.includes("p_action = 'decline' and p_actor_user_id = v_recipient") && migration.includes("p_action = 'cancel' and p_actor_user_id = v_relation.invited_by_user_id"));
check("18 accept idempotency remains behind recipient and current eligibility authority", resolveSql.indexOf("p_actor_user_id <> v_recipient") < resolveSql.indexOf("may_evaluate_candidate") && resolveSql.indexOf("may_evaluate_candidate") < resolveSql.indexOf("v_relation.state = 'accepted'"));

check("19 frozen Candidate Authorization is reused by send", sendSql.includes("social_internal.may_evaluate_candidate(p_actor_user_id, p_target_user_id)"));
check("20 frozen Candidate Authorization is reused by read", readSql.includes("social_internal.may_evaluate_candidate(p_actor_user_id, p_target_user_id)"));
check("21 frozen Candidate Authorization is reused by list", listSql.includes("social_internal.may_evaluate_candidate("));
check("22 frozen Candidate Authorization is rechecked by accept", resolveSql.includes("social_internal.may_evaluate_candidate(p_actor_user_id, v_counterpart)"));
check("23 eligibility denial is opaque", !/return.*(block|pause|opt.?out)/i.test(migration) && migration.includes("RELATIONSHIP_TARGET_UNAVAILABLE"));
check("24 candidate authority implementation is not copied", !/from public\.(social_blocks|social_participation|profiles)/i.test(migration));

check("25 pair lock is transaction scoped and canonical", migration.includes(":meal_buddy_relationship:") && migration.includes("pg_advisory_xact_lock"));
check("26 exact frozen participation lock family is acquired low then high", migration.includes("p_user_low_id::text || ':social_participation'") && migration.includes("p_user_high_id::text || ':social_participation'") && migration.indexOf("p_user_low_id::text || ':social_participation'") < migration.indexOf("p_user_high_id::text || ':social_participation'"));
check("27 both exact frozen directional block lock families are acquired", migration.includes("p_user_low_id::text || ':social_block:' || p_user_high_id::text") && migration.includes("p_user_high_id::text || ':social_block:' || p_user_low_id::text"));
check("28 send locks before current eligibility evaluation", sendSql.indexOf("lock_meal_buddy_relationship_pair") < sendSql.indexOf("may_evaluate_candidate"));
check("29 resolve locks and reloads row before transition", (resolveSql.match(/select relation\.\* into v_relation/g) ?? []).length === 2 && resolveSql.indexOf("lock_meal_buddy_relationship_pair") < resolveSql.lastIndexOf("select relation.* into v_relation"));
check("30 row uniqueness plus pair lock serialize duplicate and cross-send races", migration.includes("meal_buddy_relationships_pair_unique") && sendSql.includes("for update"));

check("31 table is RLS protected and direct client roles have no table authority", migration.includes("enable row level security") && migration.includes("revoke all on table public.meal_buddy_relationships from public, anon, authenticated, authenticator, service_role"));
check("32 dedicated authority role cannot login, inherit or bypass RLS", /create role meal_buddy_relationship_authority with[\s\S]*nologin noinherit nobypassrls/.test(migration));
check("33 only authority role owns table policies", (migration.match(/create policy meal_buddy_relationship_authority_/g) ?? []).length === 3 && !/create policy[^\n]*authenticated/i.test(migration));
check("34 internal helper remains ungranted to executor", !/grant execute on function social_internal\.lock_meal_buddy_relationship_pair[\s\S]*to social_runtime_executor/.test(migration));
const callableFunctions = ["send_meal_buddy_invite(uuid, uuid)", "read_meal_buddy_relationship(uuid, uuid)", "list_meal_buddy_relationships(uuid)", "resolve_meal_buddy_relationship(uuid, uuid, text)"];
const internalFunctions = ["lock_meal_buddy_relationship_pair(uuid, uuid)", ...callableFunctions];
check("35 only four narrow relationship functions are executor-callable", callableFunctions.every((signature) => migration.includes(`grant execute on function social_internal.${signature} to social_runtime_executor;`)) && (migration.match(/grant execute on function social_internal\.[^;]+ to social_runtime_executor;/g) ?? []).length === 4);
check("36 public anon authenticated authenticator and service role cannot call internal functions", internalFunctions.every((signature) => migration.includes(`revoke all on function social_internal.${signature} from public, anon, authenticated, authenticator, service_role, social_runtime_executor;`)));

check("37 request contract accepts scr1 only for target send and read", request.includes("SOCIAL_CANDIDATE_REF_PREFIX") && /operation === "send" \|\| operation === "read"/.test(request));
check("38 arbitrary raw target and relation UUIDs are not request fields", !/targetUserId|candidateUserId|relationId|counterpartUserId/.test(types + request));
check("39 list accepts no graph target or scope", request.includes('operation === "list"') && request.includes("Object.keys(record).length === 1"));
check("40 actions accept only actor-bound mbr1 reference", request.includes("MEAL_BUDDY_RELATIONSHIP_REF_PREFIX") && types.includes('relationshipRef: string'));
check("41 query and authority headers fail closed", request.includes('url.search !== ""') && request.includes("x-target-user-id") && request.includes("x-relation-id"));
check("42 response exposes only policy version, opaque ref, relative state and the sanctioned minimal counterpart summary", /MealBuddyRelationshipItem = Readonly<\{\s*relationshipRef: string;\s*state: MealBuddyRelationshipState;\s*counterpart: MealBuddyRelationshipCounterpart;\s*\}>/.test(types) && /MealBuddyRelationshipCounterpart = Readonly<\{\s*displayName: string;\s*mascotAvatarKey: string;\s*\}>/.test(types) && !/targetId|counterpartId|relationId|publicBio|willingToChat|email|phone/.test(types));
check("43 service opens scr1 server-side before send/read", service.includes("candidateCipher.open(actorUserId, request.candidateRef, now)") && service.includes("claims.candidateUserId"));
check("44 service opens mbr1 server-side before action", service.includes("relationshipCipher.open(actorUserId, request.relationshipRef, now)") && service.includes("claims.relationId"));
check("45 service seals every internal relation id, discards counterpart UUID and emits only the composed public summary", service.includes("relationshipCipher.seal(actorUserId, row.relation_id, now)") && service.includes("counterpart: row.counterpart") && !service.includes("counterpart_user_id:"));
check("46 cardinality failures do not fabricate state", service.includes("meal_buddy_relationship_cardinality_invalid") && service.includes("meal_buddy_relationship_action_unavailable"));

check("47 mbr1 is AES-GCM, actor-bound AAD and finite-lived", refPolicy.includes('"mbr1."') && refCrypto.includes('name: "AES-GCM"') && refCrypto.includes("additionalData: aad(actor)") && refCrypto.includes("nowMs >="));
check("48 relationship ref contains no raw actor or relation", refCrypto.includes("token.includes(actor)") && refCrypto.includes("token.includes(relation)"));
check("49 relationship key is separate from the frozen candidate key", endpointConfig.includes("MEAL_BUDDY_RELATIONSHIP_REF_KEY_ENV") && endpointConfig.includes("SOCIAL_CANDIDATE_REF_KEY_ENV") && refPolicy.includes("MEAL_BUDDY_RELATIONSHIP_REF_KEY_V1"));
check("50 endpoint authenticates caller before creating service", handler.includes("authenticateCaller(") && handler.indexOf("authenticateCaller(") < handler.indexOf("new MealBuddyRelationshipService"));
check("51 executor transport is the sole database boundary", handler.includes("createDenoSocialRuntimeExecutorTransport") && repository.includes("defineSocialRuntimeExecutorStatement") && !/supabase\.from\(|\.rpc\(/.test(handler + repository));
check("52 endpoint returns opaque errors without raw database text", !/JSON\.stringify\(error\)|new Response\([^)]*error\.message/.test(handler) && handler.includes("buildMealBuddyRelationshipError") && handler.includes('"invalid_request" : "server_unavailable"'));
check("53 Edge JWT verification is enabled exactly for endpoint", /\[functions\.meal-buddy-relationship\][\s\S]*?verify_jwt = true/.test(supabaseConfig));

const protectedPaths = [
  "apps/mobile/features/meal-buddy-candidates/MealBuddyCandidateCard.tsx",
  "apps/mobile/features/meal-buddy-candidates/MealBuddyRealCandidateSection.tsx",
  "supabase/functions/_shared/social-ranking", "supabase/functions/_shared/social-exposure",
  "supabase/functions/_shared/meal-buddy-context", "supabase/functions/_shared/social-candidate-ref",
  "supabase/functions/meal-buddy-candidate-profile", "supabase/functions/social-candidate-evaluation"
];
const successorMobileContract = lifecycle.phase.startsWith("successor_")
  ? auditSr2ibSources(new Map(SR2IB_SOURCE_PATHS.map((file) => [file, read(file)]))).length === 0
  : true;
check("54 compact discovery and frozen ranking exposure context candidate-ref authorities remain intact while sanctioned Mobile activation is contract-checked", protectedPaths.every((file) => git(["diff", "--name-only", SR2IA_BASELINE, "--", file]).trim() === "") && successorMobileContract);
check("55 no chat message conversation room or notification authority is introduced", !/create (?:table|function)[^;]*(?:chat|message|conversation|room|notification)/i.test(migration));
check("56 no ranking exposure context interest or premium authority is introduced", !/(ranking_score|exposure_reason|food_context_tag_key|interest_snapshot|entitlement|premium_tier)/i.test(migration + types + service));
check("57 lifecycle migration inventory is exact", exact(lifecycle.manifest.filter((file) => file.startsWith("supabase/migrations/")), lifecycle.phase.startsWith("successor_") ? [] : [SR2IA_MIGRATION]));
check("58 existing migration bytes are unchanged", lines(git(["diff", "--name-only", SR2IA_BASELINE, "--", "supabase/migrations"])).every((file) => file === SR2IA_MIGRATION || file === SR2JA_MIGRATION));
const implementationSources = SR2IA_SUCCESSOR_PATHS.filter((file) => !file.startsWith("scripts/") && file !== "package.json").map(read).join("\n");
check("59 no deploy remote operator or credential command is introduced", !/supabase\s+(db push|functions deploy)|--project-ref|DATABASE_URL|SUPABASE_SERVICE_ROLE/.test(implementationSources));
check("60 all candidate source bytes are UTF-8 text without NUL", SR2IA_SUCCESSOR_PATHS.every((file) => { const bytes = fs.readFileSync(path.join(root, file)); return !bytes.includes(0) && !read(file).includes("\uFFFD"); }));
const manifest = createSr2iaManifest((file) => fs.readFileSync(path.join(root, file)));
check("61 canonical raw-byte manifest covers every exact sorted path", manifest.entries.length === SR2IA_SUCCESSOR_PATHS.length && manifest.entries.every((entry, index) => entry.path === SR2IA_SUCCESSOR_PATHS[index] && /^[0-9a-f]{64}$/.test(entry.sha256)));
check("62 repository calls only the four frozen relationship functions plus the frozen SR-2C projection", ["send_meal_buddy_invite", "read_meal_buddy_relationship", "list_meal_buddy_relationships", "resolve_meal_buddy_relationship", "project_exposed_social_profiles"].every((name) => repository.includes(`social_internal.${name}`)) && (repository.match(/defineSocialRuntimeExecutorStatement/g) ?? []).length === 6);

console.log(JSON.stringify({ suite: "meal-buddy-relationship-sr2i-a-guard", lifecycle: lifecycle.phase, total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures, canonicalManifestSha256: manifest.aggregateSha256, migrationSha256: sha256(fs.readFileSync(path.join(root, SR2IA_MIGRATION))), networkUsed: false, databaseUsed: false, credentialsUsed: false, developmentTouched: false, productionTouched: false }, null, 2));
if (failures.length) process.exitCode = 1;
