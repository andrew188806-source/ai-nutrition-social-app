#!/usr/bin/env node
// SR-2C local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import {
  createSr2cCanonicalManifest,
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
import {
  classifySr2haLifecycle,
  SR2HA_BASELINE,
  SR2HA_SUCCESSOR_PATHS
} from "./social-candidate-sr2h-a-successor-manifest.mjs";
import { SR2HB_SUCCESSOR_PATHS } from "./social-interest-sr2h-b-successor-manifest.mjs";
import { SR2IA_SUCCESSOR_PATHS } from "./meal-buddy-relationship-sr2i-a-successor-manifest.mjs";
import { SR2IB_SUCCESSOR_PATHS } from "./meal-buddy-relationship-sr2i-b-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const moduleRoot = "supabase/functions/_shared/social-profile";
const moduleFiles = ["index.ts", "policy.ts", "projectPublicProfiles.ts", "readProfileFacts.ts", "types.ts"].sort();
const sourcePaths = moduleFiles.map((file) => `${moduleRoot}/${file}`);
const packageScripts = Object.freeze({
  "test:social-profile-sr2c": "node scripts/social-profile-sr2c-guard.mjs",
  "test:social-profile-sr2c-smoke": "node scripts/social-profile-sr2c-smoke.mjs",
  "test:social-profile-sr2c-mutations": "node scripts/social-profile-sr2c-mutations.mjs"
});
// Frozen authority is pinned against the BASELINE COMMIT's blob bytes, never the working tree: this
// repository carries core.autocrlf=true with no .gitattributes, so a working-tree hash would depend
// on checkout configuration and would not survive a clone or a committed-state proof.
const frozenFiles = new Map([
  ["supabase/config.toml", "9b90a9df1d70bf9ea3b4f405db6ca6b3555fedd060a51d7364f94cc8122e8b8f"],
  ["supabase/functions/_shared/social-exposure/applySocialExposure.ts", "4d9e6d21309c45186b1e679350872bdfdaecca5913c6575f1f7a8d8711e7023f"],
  ["supabase/functions/_shared/social-exposure/index.ts", "ac903d4285095f741e55143011fd9ff838b7de08032c2bdc425282c6a86f8aa1"],
  ["supabase/functions/_shared/social-exposure/policy.ts", "cef032e942ed0f66ccd6a2ba9a817133d19a107b316fba6047bd74bec12cd0f3"],
  ["supabase/functions/_shared/social-exposure/resolveEntitlement.ts", "09d5d8bc69b72782d59f935fe0aeb285b80aa101a1a7038d333c5fee885e6bc9"],
  ["supabase/functions/_shared/social-exposure/types.ts", "f7103b7325c965729e62ef42bf205479e66de031c7fbc71b479e9de6270dc69c"],
  ["supabase/functions/_shared/social-pair/authorizedPairSourcesAdapter.ts", "d36240308bfaaef2769fd3f5e59280f51a11623e48c3a44c3d24ae07f8adca22"],
  ["supabase/functions/_shared/social-ranking/policy.ts", "9d9f6d8770ec8d0e4266c9ffe6e0065c0c7e0380ee85bf3827cd28945abd711e"],
  ["supabase/functions/_shared/social-ranking/rankCandidates.ts", "a4d85ecacc6e006cb15446d1387dae34d8ac6e407f7fff25a4d2dfaa781157f2"],
  ["supabase/functions/_shared/social-ranking/types.ts", "1eb2f9fcc99f0afcabe21818f9f633309d05b8d52968aec9b5adfb8720302810"],
  ["supabase/functions/social-candidate-taste/tasteProvider.ts", "f2ecb2913b5fd2633da3fd12497dada6a2a1a1c8adff60feb1625f1fc6e70174"],
  ["supabase/migrations/20260712130200_consumer_schema_phase_1_3_consumer_profiles.sql", "1738766e1cd2f5a81a51d44aee1899d17b761dfccb5f4be019d3ec1e08df2ac8"],
  ["supabase/migrations/20260712131300_consumer_schema_phase_1_3_consumer_public_private_views.sql", "9d270cb4858d9ec58a864b34cf9dfa84c64eafe0661cfcd0ad46ebfd88239cc5"],
  ["supabase/migrations/20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql", "9f0c923d9a47369dd3722bd3513c7b2c0c38ac5e63ad2501bcb7b77373830394"],
  ["supabase/migrations/20260810050000_social_runtime_executor_role.sql", "501243dbc6b7179259be32b2d627d21d1e2d11f93dc31dde4c8fea26958eecbc"],
  ["supabase/migrations/20260811010000_social_canonical_candidate_pool.sql", "0d5c683d129038527a6b72db8ea28d87e94efe18a39928d13b4fc82e5f0ba9fb"],
  ["supabase/migrations/20260811020000_social_candidate_taste_sources.sql", "e0859f801c040002e855f2b03e27a5f8f95fd037c23210223a1ce29881bbe624"],
  ["supabase/migrations/20260811030000_social_exposure_entitlement_authenticated_read.sql", "4b9667de8cc2f6933737c8677e131f2b5139ef8f005ed20da2ee06e1e17c9bad"]
]);
const forbiddenOutput = [
  "user_id", "userId", "candidateUserId", "profile_id", "profileId",
  "real_avatar_url", "realAvatarUrl", "anonymous_display_name", "anonymousDisplayName",
  "verification_status", "verificationStatus", "verified",
  "diet_summary", "dietSummary", "nutrition_goal_summary", "nutritionGoalSummary",
  "recent_meal_style", "recentMealStyle", "locale", "timezone",
  "birthdate", "age_years", "gender", "latitude", "longitude", "distance",
  "rankingState", "similarity", "confidence", "restriction", "needs_attention",
  "entitlement", "premium", "plan_code", "subscription", "billing"
];

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}
function git(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}
function gitBytes(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: null, windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString("utf8").trim()}`);
  return result.stdout;
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const blobSha256 = (file, ref) => crypto.createHash("sha256").update(gitBytes(["cat-file", "blob", `${ref}:${file}`])).digest("hex");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const exact = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);
const executable = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
const executableSql = (source) => source.split(/\r?\n/).map((line) => (line.trim().startsWith("--") ? "" : line)).join("\n");
function statusPaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
    .split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}
function deltaEntries(commit = "HEAD") {
  return lines(git(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", commit]))
    .map((entry) => { const [status, file] = entry.split("\t"); return Object.freeze({ status, path: file.replaceAll("\\", "/") }); });
}
function lifecycleState() {
  const head = git(["rev-parse", "HEAD"]).trim();
  const originHead = git(["rev-parse", "origin/main"]).trim();
  const [ahead, behind] = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"]).trim().split(/\s+/).map(Number);
  return Object.freeze({
    head, originHead, ahead, behind,
    headParent: head === SR2HA_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
    worktreePaths: statusPaths(),
    stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
    headDeltaEntries: head === SR2HA_BASELINE ? [] : deltaEntries(),
    headDeltaPaths: head === SR2HA_BASELINE ? [] : deltaEntries().map(({ path }) => path),
    headDeleted: head === SR2HA_BASELINE ? false : deltaEntries().some(({ status }) => status === "D")
  });
}
const parse = (file) => ts.createSourceFile(file, read(file), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
function typeAlias(source, name) {
  return source.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === name);
}
function typeLiteral(alias) {
  if (!alias) return null;
  if (ts.isTypeLiteralNode(alias.type)) return alias.type;
  if (ts.isTypeReferenceNode(alias.type) && alias.type.typeName.getText(alias.getSourceFile()) === "Readonly" && alias.type.typeArguments?.length === 1 && ts.isTypeLiteralNode(alias.type.typeArguments[0])) {
    return alias.type.typeArguments[0];
  }
  return null;
}
function propertyNames(alias) {
  const literal = typeLiteral(alias);
  if (!literal) return [];
  return literal.members.filter(ts.isPropertySignature)
    .map((member) => member.name.getText(alias.getSourceFile()).replaceAll('"', "")).sort();
}
const moduleSpecifiers = (source) => source.statements
  .filter((node) => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
  .map((node) => node.moduleSpecifier.text).sort();

try {
  const state = lifecycleState();
  const lifecycle = classifySr2haLifecycle(state);
  const packageJson = JSON.parse(read("package.json"));
  const baselinePackage = JSON.parse(git(["show", `${SR2C_BASELINE}:package.json`]));
  const packageWithoutSr2c = structuredClone(packageJson);
  const successorScriptKeys = ["test:social-candidate-sr2d", "test:social-candidate-sr2d-smoke", "test:social-candidate-sr2d-mutations", "test:social-candidate-sr2e", "test:social-candidate-sr2e-smoke", "test:social-candidate-sr2e-mutations", "test:social-candidate-sr2e-development-mobile-smoke", "test:social-candidate-sr2f", "test:social-candidate-sr2f-smoke", "test:social-candidate-sr2f-mutations", "test:social-candidate-sr2f-development-composition-smoke", "test:social-candidate-sr2g-a", "test:social-candidate-sr2g-a-smoke", "test:social-candidate-sr2g-a-mutations", "test:social-candidate-sr2g-a-development-acceptance", "test:social-candidate-sr2g-b", "test:social-candidate-sr2g-b-smoke", "test:social-candidate-sr2g-b-mutations", "test:social-candidate-sr2g-b-development-acceptance", "test:social-candidate-sr2g-c", "test:social-candidate-sr2g-c-smoke", "test:social-candidate-sr2g-c-mutations", "test:social-candidate-sr2g-c-development-acceptance", "test:social-candidate-sr2g-b-r1", "test:social-candidate-sr2g-b-r1-smoke", "test:social-candidate-sr2g-b-r1-mutations", "test:social-candidate-sr2g-b-r1-development-acceptance", "test:social-candidate-sr2g-c-r1", "test:social-candidate-sr2g-c-r1-smoke", "test:social-candidate-sr2g-c-r1-mutations", "test:social-candidate-sr2g-c-r1-development-acceptance", "test:social-interest-sr2c-r1", "test:social-interest-sr2c-r1-smoke", "test:social-interest-sr2c-r1-mutations", "test:social-interest-sr2c-r1-development-acceptance", "test:social-candidate-sr2g-d", "test:social-candidate-sr2g-d-smoke", "test:social-candidate-sr2g-d-mutations", "test:social-candidate-sr2g-d-development-acceptance", "test:social-candidate-sr2g-e1", "test:social-candidate-sr2g-e1-smoke", "test:social-candidate-sr2g-e1-mutations", "test:social-candidate-sr2g-e1-development-acceptance", "test:social-candidate-sr2g-e2", "test:social-candidate-sr2g-e2-smoke", "test:social-candidate-sr2g-e2-mutations", "test:social-candidate-sr2g-e2-development-mobile-smoke", "test:social-candidate-sr2g-f", "test:social-candidate-sr2g-f-smoke", "test:social-candidate-sr2g-f-mutations", "test:social-candidate-sr2g-f-development-acceptance", "test:social-candidate-sr2g-g", "test:social-candidate-sr2g-g-smoke", "test:social-candidate-sr2g-g-mutations", "test:social-candidate-sr2h-a", "test:social-candidate-sr2h-a-smoke", "test:social-candidate-sr2h-a-mutations"];
  for (const key of [...Object.keys(packageScripts), ...successorScriptKeys]) delete packageWithoutSr2c.scripts[key];
  for (const key of ["test:social-interest-sr2h-b", "test:social-interest-sr2h-b-smoke", "test:social-interest-sr2h-b-mutations", "test:social-interest-sr2h-b-concurrency"]) delete packageWithoutSr2c.scripts[key];
  for (const key of ["test:meal-buddy-relationship-sr2i-a", "test:meal-buddy-relationship-sr2i-a-smoke", "test:meal-buddy-relationship-sr2i-a-mutations", "test:meal-buddy-relationship-sr2i-a-concurrency"]) delete packageWithoutSr2c.scripts[key];
  for (const key of ["test:meal-buddy-relationship-sr2i-b", "test:meal-buddy-relationship-sr2i-b-smoke", "test:meal-buddy-relationship-sr2i-b-mutations"]) delete packageWithoutSr2c.scripts[key];
  for (const key of ["test:meal-buddy-chat-sr2j-a", "test:meal-buddy-chat-sr2j-a-smoke", "test:meal-buddy-chat-sr2j-a-mutations", "test:meal-buddy-chat-sr2j-a-concurrency"]) delete packageWithoutSr2c.scripts[key];
  for (const key of ["test:meal-buddy-chat-sr2j-b", "test:meal-buddy-chat-sr2j-b-smoke", "test:meal-buddy-chat-sr2j-b-mutations"]) delete packageWithoutSr2c.scripts[key];
  // SR-2K-A adds three validation-only command keys. Stripping them keeps this guard measuring
  // what it has always measured: that no OTHER package byte moved.
  for (const key of ["test:meal-buddy-closure-sr2k-a", "test:meal-buddy-closure-sr2k-a-smoke", "test:meal-buddy-closure-sr2k-a-mutations"]) delete packageWithoutSr2c.scripts[key];
  // SR-2K-B adds five validation-only command keys. Stripping them keeps this guard measuring
  // what it has always measured: that no OTHER package byte moved.
  for (const key of ["test:social-final-sr2k-b", "test:social-final-sr2k-b-smoke", "test:social-final-sr2k-b-mutations", "test:social-final-sr2k-b-concurrency", "test:social-final-sr2k-b-postgres"]) delete packageWithoutSr2c.scripts[key];
  const sources = new Map(sourcePaths.map((file) => [file, read(file)]));
  const parsed = new Map(sourcePaths.map((file) => [file, parse(file)]));
  const typesSource = parsed.get(`${moduleRoot}/types.ts`);
  const policyRaw = sources.get(`${moduleRoot}/policy.ts`);
  const projectRaw = sources.get(`${moduleRoot}/projectPublicProfiles.ts`);
  const readRaw = sources.get(`${moduleRoot}/readProfileFacts.ts`);
  const project = executable(projectRaw);
  const reader = executable(readRaw);
  const allExecutable = [...sources.values()].map(executable).join("\n");
  const directoryFiles = fs.readdirSync(path.join(root, moduleRoot), { withFileTypes: true })
    .filter((entry) => entry.isFile()).map(({ name }) => name).sort();
  const sql = executableSql(read(SR2C_SUCCESSOR_MIGRATION));
  const flatSql = sql.replace(/\s+/g, " ");
  const repositoryMigrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const filesystemManifest = createSr2cCanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
  const expectedManifestText = SR2C_SUCCESSOR_PATHS.map((file) => `${sha256(file)}  ${file}\n`).join("");
  const frozenTreeManifest = lifecycle.phase === "candidate" ? null : createSr2cCanonicalManifest((file) => gitBytes(["cat-file", "blob", `${state.head}:${file}`]));

  check("1. lifecycle is exactly the SR-2H-A candidate, frozen-unpushed or frozen-pushed state", lifecycle.valid, { phase: lifecycle.phase, head: state.head, originHead: state.originHead, ahead: state.ahead, behind: state.behind });
  const expectedSuccessorManifest = lifecycle.phase.startsWith("successor_successor_successor_") ? SR2IB_SUCCESSOR_PATHS
    : lifecycle.phase.startsWith("successor_successor_") ? SR2IA_SUCCESSOR_PATHS
    : lifecycle.phase.startsWith("successor_") ? SR2HB_SUCCESSOR_PATHS : SR2HA_SUCCESSOR_PATHS;
  check("2. lifecycle manifest is the exact enumerated successor path set", exact([...lifecycle.manifest].sort(), expectedSuccessorManifest), { expected: expectedSuccessorManifest, actual: lifecycle.manifest });
  check("3. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("4. exact module boundary contains only five TypeScript files", exact(directoryFiles, moduleFiles), { expected: moduleFiles, actual: directoryFiles });
  check("5. every exact SR-2C path exists", SR2C_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
  check("6. package exposes three exact canonical SR-2C commands", Object.entries(packageScripts).every(([key, value]) => packageJson.scripts[key] === value));
  check("7. package.json differs from frozen authority only by the three SR-2C scripts", JSON.stringify(packageWithoutSr2c) === JSON.stringify(baselinePackage));
  check("8. predecessor delta is validation-only successor lifecycle support", SR2C_SUCCESSOR_PATHS.filter((file) => file.startsWith("scripts/") && !file.includes("sr2c")).every((file) => file.endsWith("-guard.mjs")));

  check("9. projection version authority is exactly social-profile-projection-v1", /SOCIAL_PROFILE_PROJECTION_POLICY_VERSION = "social-profile-projection-v1" as const/.test(policyRaw) && /policyVersion: "social-profile-projection-v1"/.test(read(`${moduleRoot}/types.ts`)));
  check("10. the public allow-list is exactly the five V1 fields", /SOCIAL_PROFILE_PUBLIC_FIELDS = Object\.freeze\(\[\s*"displayName",\s*"exposureIndex",\s*"mascotAvatarKey",\s*"publicBio",\s*"willingToChat"\s*\] as const\)/.test(policyRaw));
  check("11. the public profile type carries exactly the five allow-listed keys", exact(propertyNames(typeAlias(typesSource, "SocialPublicProfile")), ["displayName", "exposureIndex", "mascotAvatarKey", "publicBio", "willingToChat"]));
  check("12. the projection envelope carries exactly policyVersion and candidates", exact(propertyNames(typeAlias(typesSource, "SocialProfileProjectionResult")), ["candidates", "policyVersion"]));
  check("13. the primitive row type carries exactly the five public-safe columns", exact(propertyNames(typeAlias(typesSource, "SocialProfileFactRow")), ["display_name", "exposure_ordinal", "mascot_avatar_key", "public_bio", "willing_to_chat"]));
  check("14. no forbidden identifier or private field appears in any exported type", forbiddenOutput.every((field) => !new RegExp(`\\b${field}\\b`).test(executable(read(`${moduleRoot}/types.ts`)).replace(/exposure_ordinal|exposureIndex/g, ""))), { firstHit: forbiddenOutput.find((field) => new RegExp(`\\b${field}\\b`).test(executable(read(`${moduleRoot}/types.ts`)).replace(/exposure_ordinal|exposureIndex/g, ""))) });
  check("15. one stable contract error is centralized", /SOCIAL_PROFILE_CONTRACT_ERROR = "social_profile_projection_contract_violated" as const/.test(policyRaw) && /throw new Error\(SOCIAL_PROFILE_CONTRACT_ERROR\)/.test(policyRaw));
  check("16. the frozen maximum candidate bound is exactly ten", /SOCIAL_PROFILE_MAXIMUM_CANDIDATES = 10 as const/.test(policyRaw));

  check("17. the protected read names five explicit columns and never selects star", /select exposure_ordinal, display_name, mascot_avatar_key, public_bio, willing_to_chat/.test(reader) && !/select\s+\*/i.test(allExecutable));
  check("18. the protected read invokes only the SR-2C projection primitive", /social_internal\.project_exposed_social_profiles\(\$1::uuid, \$2::uuid\[\]\)/.test(reader) && (reader.match(/defineSocialRuntimeExecutorStatement</g) ?? []).length === 1 && (reader.match(/social_internal\./g) ?? []).length === 1);
  check("19. the candidate set is derived from the frozen SR-2B exposure rather than a caller array", /exposure: SocialExposureResult/.test(reader) && /exposure\.exposed\.map\(/.test(reader) && !/candidateUserIds:\s*readonly string\[\]/.test(reader));
  check("20. the read rejects a foreign exposure policy version, overflow, duplicates and null identities", /exposure\.policyVersion !== "social-exposure-v1"/.test(reader) && /exposure\.exposed\.length > SOCIAL_PROFILE_MAXIMUM_CANDIDATES/.test(reader) && /new Set\(candidateUserIds\.map\(\(entry\) => entry\.toLowerCase\(\)\)\)\.size !== candidateUserIds\.length/.test(reader));
  check("21. projection correlates by exposure ordinal and never by physical row order", /for \(let exposureIndex = 0; exposureIndex < exposureCount; exposureIndex \+= 1\)/.test(project) && /byOrdinal\.get\(exposureIndex\)/.test(project));
  check("22. projection never sorts, reverses or reranks", !/\.sort\(|\.reverse\(|localeCompare/.test(project));
  check("23. a missing profile is omitted rather than failing or refilling", /if \(row === undefined\) continue;/.test(project) && !/refill|backfill|\.pop\(\)|\.shift\(\)/i.test(allExecutable));
  check("24. a duplicate or out-of-range ordinal fails closed", /byOrdinal\.has\(admitted\.exposure_ordinal\)\) return socialProfileContractViolation\(\)/.test(project) && /ordinal < 0 \|\|\s*ordinal >= exposureCount/.test(project));
  check("25. a malformed required display name fails closed", /typeof value\.display_name !== "string" \|\| value\.display_name\.length === 0/.test(project));
  check("26. the projection emits no ranking, entitlement or identity field", forbiddenOutput.every((field) => !new RegExp(`${field}:`).test(project)));
  check("27. no pagination, cursor or page authority exists", !/paginat|cursor|nextPage|hasMore|offset|pageSize/i.test(allExecutable));
  check("28. no service_role, admin or billing credential path exists", !/service[_-]?role|SERVICE_ROLE|billing|admin/i.test(allExecutable));
  check("29. no environment, HTTP or Edge runtime capability exists", !/Deno\.env|process\.env|fetch\s*\(|new Request|new Response|serve\s*\(|http:/i.test(allExecutable));
  check("30. no persistence, cache or write capability exists", !/insert\s*\(|update\s*\(|upsert\s*\(|delete\s*\(|writeFile|Deno\.write|localStorage|\bcache\b/i.test(allExecutable));
  check("31. no profile payload logging exists", !/console\.|logger\.|\blog\s*\(/i.test(allExecutable));
  check("32. no clock or randomness can affect the projection", !/Date\.now|new Date|performance\.now|Math\.random|crypto\.random/.test(allExecutable));
  check("33. no storage, signed URL or public URL capability exists", !/storage|createSignedUrl|getPublicUrl|publicUrl|bucket/i.test(allExecutable));
  check("34. module imports carry no Supabase client or database driver dependency", !/from\s+["'](npm:|@supabase|https?:)/.test(allExecutable) && exact(moduleSpecifiers(parsed.get(`${moduleRoot}/readProfileFacts.ts`)), ["../social-exposure/types.ts", "../social-runtime-transport/executorTransactionTransport.ts", "./policy.ts", "./types.ts"]));

  check("35. exactly one SR-2C migration is added and it is the only candidate migration", exact(SR2C_SUCCESSOR_PATHS.filter((file) => file.startsWith("supabase/migrations/")), [SR2C_SUCCESSOR_MIGRATION]));
  check("36. the tracked SR-2C migration retains its frozen SR-2H-A baseline bytes", repositoryMigrations.includes(path.basename(SR2C_SUCCESSOR_MIGRATION)) && git(["ls-files", "--error-unmatch", SR2C_SUCCESSOR_MIGRATION]).trim() === SR2C_SUCCESSOR_MIGRATION && sha256(SR2C_SUCCESSOR_MIGRATION) === "b9c616dab7f8cadc3a75cd6f5014c42afadb00ecfaed87cacf1d72cfd307ce07" && git(["diff", "--name-only", SR2HA_BASELINE, "--", SR2C_SUCCESSOR_MIGRATION]).trim() === "");
  check("37. a dedicated NOLOGIN NOINHERIT NOBYPASSRLS projection authority is created", /create role social_profile_projection_authority with\s+nologin\s+noinherit\s+nobypassrls\s+nocreatedb\s+nocreaterole\s+nosuperuser\s+noreplication;/.test(flatSql.replace(/ +/g, " ")));
  check("38. the authority receives column-level SELECT on exactly seven consumer_profiles columns", /grant select \(user_id, display_name, mascot_avatar_key, public_bio, willing_to_chat, status, deleted_at\) on table public\.consumer_profiles to social_profile_projection_authority;/.test(flatSql));
  check("39. no table-level consumer_profiles grant is issued", !/grant select on table public\.consumer_profiles/i.test(flatSql));
  check("40. no private, Taste, subscription or legacy public-view object is granted or altered", !/consumer_private_profiles|taste_profiles|nutrition_goals|dietary_restrictions|meal_records|meal_record_items|favorite_|subscription_entitlements|consumer_public_profiles/i.test(flatSql));
  check("41. a role-scoped permissive read policy admits exactly the projection authority", /create policy consumer_profiles_profile_projection_authority on public\.consumer_profiles for select to social_profile_projection_authority using \(true\);/.test(flatSql) && (flatSql.match(/create policy/g) ?? []).length === 1);
  check("42. no frozen policy is dropped, altered, widened to a client role or widened past SELECT", !/drop policy|alter policy|consumer_profiles_owner_read/i.test(flatSql) && !/create policy [^;]*\bto (anon|authenticated|public|service_role|social_runtime_executor)\b/i.test(flatSql) && !/\bfor (all|insert|update|delete)\b/i.test(flatSql));
  check("43. the function signature is exactly the actor plus the server-owned candidate array", /create function social_internal\.project_exposed_social_profiles\( p_actor_user_id uuid, p_candidate_user_ids uuid\[\] \)/.test(flatSql) && !/p_limit|p_offset|p_page|p_start|p_end|p_columns/i.test(flatSql));
  check("44. the returned shape is exactly the five public-safe columns", /returns table \( exposure_ordinal integer, display_name text, mascot_avatar_key text, public_bio text, willing_to_chat boolean \)/.test(flatSql));
  check("45. the function is STABLE SECURITY DEFINER with a hardened search path", /stable security definer set search_path = pg_catalog, pg_temp/.test(flatSql) && !/security invoker/i.test(flatSql));
  check("46. the projection re-checks every candidate against the canonical candidate pool", /social_internal\.canonical_candidate_pool\(p_actor_user_id\)/.test(flatSql) && /join authorized on authorized\.user_id = requested\.user_id/.test(flatSql));
  check("47. null, duplicate and over-cap candidate arrays are rejected", /raise exception 'SOCIAL_PROFILE_CANDIDATE_NULL'/.test(flatSql) && /raise exception 'SOCIAL_PROFILE_CANDIDATE_DUPLICATE'/.test(flatSql) && /if v_count > 10 then/.test(flatSql));
  check("48. only active non-deleted profiles are projected", /where profile\.status = 'active' and profile\.deleted_at is null/.test(flatSql));
  check("49. ordinality from the supplied array is the ordering authority", /with ordinality as candidate\(user_id, ordinality\)/.test(flatSql) && /order by requested\.ordinality;/.test(flatSql));
  check("50. no private or identifying column is projected by the primitive", !/profile\.(real_avatar_url|verification_status|diet_summary|nutrition_goal_summary|recent_meal_style|anonymous_display_name|profile_id|visibility|locale|timezone|id)\b/.test(flatSql) && !/select \*/i.test(flatSql));
  check("51. the executor receives EXECUTE on the projection primitive only", /grant execute on function social_internal\.project_exposed_social_profiles\(uuid, uuid\[\]\) to social_runtime_executor;/.test(flatSql) && !/grant select on table [^;]* to social_runtime_executor/i.test(flatSql));
  check("52. PUBLIC and every client or service role is explicitly denied execution", ["public", "anon", "authenticated", "authenticator", "service_role"].every((role) => new RegExp(`revoke all on function social_internal\\.project_exposed_social_profiles\\(uuid, uuid\\[\\]\\) from ${role};`).test(flatSql)) && !/to (anon|authenticated|service_role|public);/i.test(flatSql));
  check("53. neither frozen Social authority gains projection execution", /revoke all on function social_internal\.project_exposed_social_profiles\(uuid, uuid\[\]\) from social_authority;/.test(flatSql) && /revoke all on function social_internal\.project_exposed_social_profiles\(uuid, uuid\[\]\) from social_pair_read_authority;/.test(flatSql));
  check("54. transient schema CREATE is granted once and revoked, leaving no durable CREATE", (flatSql.match(/grant create on schema social_internal to social_profile_projection_authority;/g) ?? []).length === 1 && /revoke create on schema social_internal from social_profile_projection_authority;/.test(flatSql));
  check("55. every authority-owned grant uses the frozen SET LOCAL ROLE grantor lifecycle", /set local role social_authority; grant execute on function social_internal\.canonical_candidate_pool\(uuid\) to social_profile_projection_authority; set local role postgres;/.test(flatSql) && /set local role social_profile_projection_authority; grant execute on function social_internal\.project_exposed_social_profiles\(uuid, uuid\[\]\) to social_runtime_executor; set local role postgres;/.test(flatSql) && !/reset role/i.test(flatSql));
  check("56. transient authority memberships are released", /revoke social_authority from postgres;/.test(flatSql) && /revoke social_profile_projection_authority from postgres;/.test(flatSql) && !/grant social_profile_projection_authority to social_runtime_executor/i.test(flatSql));
  check("57. no ownership is transferred to an unrelated authority", /alter function social_internal\.project_exposed_social_profiles\(uuid, uuid\[\]\) owner to social_profile_projection_authority;/.test(flatSql));

  check("58. no apps or Mobile path is part of the candidate", !SR2C_SUCCESSOR_PATHS.some((file) => file.startsWith("apps/")));
  check("59. no config.toml path is added or modified", !SR2C_SUCCESSOR_PATHS.includes("supabase/config.toml"));
  check("60. no Edge function, HTTP endpoint or public DTO path is introduced", !SR2C_SUCCESSOR_PATHS.some((file) => /^supabase\/functions\/[^_]/.test(file) || /dto/i.test(file)));
  check("61. the Supabase delta is only the pure shared module plus the one migration", SR2C_SUCCESSOR_PATHS.filter((file) => file.startsWith("supabase/")).every((file) => file.startsWith(`${moduleRoot}/`) || file === SR2C_SUCCESSOR_MIGRATION));
  check("62. all frozen SR-2B, SR-2A and predecessor blobs retain exact SHA-256 at the baseline", [...frozenFiles].every(([file, hash]) => fs.existsSync(path.join(root, file)) && blobSha256(file, SR2C_BASELINE) === hash));
  check("63. no frozen runtime or migration path has a worktree delta", [...frozenFiles.keys()].filter((file) => !SR2D_SUCCESSOR_PATHS.includes(file) && !SR2E_SUCCESSOR_PATHS.includes(file) && !SR2F_SUCCESSOR_PATHS.includes(file) && !SR2GA_SUCCESSOR_PATHS.includes(file) && !SR2GB_SUCCESSOR_PATHS.includes(file) && !SR2GC_SUCCESSOR_PATHS.includes(file) && !SR2GBR1_SUCCESSOR_PATHS.includes(file) && !SR2GCR1_SUCCESSOR_PATHS.includes(file) && !SR2CR1_SUCCESSOR_PATHS.includes(file) && !SR2GD_SUCCESSOR_PATHS.includes(file) && !SR2GE1_SUCCESSOR_PATHS.includes(file) && !SR2GE2_SUCCESSOR_PATHS.includes(file) && !SR2GF_SUCCESSOR_PATHS.includes(file)).every((file) => git(["diff", "--name-only", SR2C_BASELINE, "--", file]).trim() === ""));
  check("64. frozen SR-2B authority commit remains the exact baseline", git(["cat-file", "-t", SR2C_BASELINE]).trim() === "commit" && git(["show", "-s", "--format=%H", SR2C_BASELINE]).trim() === SR2C_BASELINE);
  const secretPattern = new RegExp(`(?:${["sb", "secret"].join("_")}_[A-Za-z0-9._-]{20,}|${["service", "role", "key"].join("_")}\\s*[=:]\\s*["'][A-Za-z0-9._-]{20,}|eyJ[A-Za-z0-9_-]{30,}\\.)`);
  check("65. candidate files contain no credential-shaped secret", !secretPattern.test(SR2C_SUCCESSOR_PATHS.map((file) => read(file)).join("\n")));
  const guardAst = parse("scripts/social-profile-sr2c-guard.mjs");
  let literalPass = false;
  let skipCall = false;
  const inspectGuard = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(guardAst) === "check" && node.arguments[1]?.kind === ts.SyntaxKind.TrueKeyword) literalPass = true;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "skip") skipCall = true;
    ts.forEachChild(node, inspectGuard);
  };
  inspectGuard(guardAst);
  check("66. guard contains no literal-true pass or skip call", !literalPass && !skipCall);
  check("67. canonical manifest is sorted raw-byte SHA-256 serialized as lowercase hash, two spaces, POSIX path and LF", filesystemManifest.text === expectedManifestText && filesystemManifest.paths.every((file, index, files) => index === 0 || files[index - 1] < file) && filesystemManifest.entries.every(({ path: file, sha256: hash }) => /^[0-9a-f]{64}$/.test(hash) && !file.includes("\\")) && filesystemManifest.text.endsWith("\n") && !filesystemManifest.text.includes("\r") && !filesystemManifest.text.includes("\0"));
  check("68. canonical aggregate is SHA-256 over the exact UTF-8 manifest bytes", filesystemManifest.aggregateSha256 === crypto.createHash("sha256").update(Buffer.from(expectedManifestText, "utf8")).digest("hex"));
  const frozenSr2cProductionPaths = [...sourcePaths, SR2C_SUCCESSOR_MIGRATION];
  check("69. committed tree preserves every frozen SR-2C production byte", lifecycle.phase === "candidate" || frozenSr2cProductionPaths.every((file) => git(["diff", "--name-only", state.head, "--", file]).trim() === ""));

  console.log(JSON.stringify({
    suite: "social-profile-sr2c-guard",
    status: failures.length === 0 ? "passed" : "failed",
    lifecycle: lifecycle.phase,
    totalChecks: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false
  }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({
    suite: "social-profile-sr2c-guard",
    status: "crashed",
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
}
