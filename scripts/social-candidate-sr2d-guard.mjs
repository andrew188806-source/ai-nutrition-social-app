#!/usr/bin/env node
// SR-2D local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import {
  createSr2dCanonicalManifest,
  classifySr2dLifecycle,
  SR2D_BASELINE,
  SR2D_BRIDGE_ARTIFACT,
  SR2D_BRIDGE_GENERATOR,
  SR2D_REPOINTED_FROZEN_FILE,
  SR2D_SUCCESSOR_MIGRATION,
  SR2D_SUCCESSOR_PATHS
} from "./social-candidate-sr2d-successor-manifest.mjs";
import { BRIDGE_SOURCE_ROOT, collectBridge, renderBridge } from "./build-social-taste-types-bridge.mjs";
import { proveRepointEquivalence, proveTypeCompatibility, SR2A_FROZEN_BASELINE } from "./social-candidate-sr2d-repoint-equivalence.mjs";
import { SR2E_SUCCESSOR_PATHS } from "./social-candidate-sr2e-successor-manifest.mjs";
import { SR2F_SUCCESSOR_PATHS } from "./social-candidate-sr2f-successor-manifest.mjs";
import { SR2GA_SUCCESSOR_PATHS } from "./social-candidate-sr2g-a-successor-manifest.mjs";
import { SR2GB_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-successor-manifest.mjs";
import {
  classifySr2gcLifecycle,
  SR2GC_BASELINE,
  SR2GC_SUCCESSOR_PATHS
} from "./social-candidate-sr2g-c-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const apiRoot = "supabase/functions/_shared/social-candidate-api";
const refRoot = "supabase/functions/_shared/social-candidate-ref";
const fnRoot = "supabase/functions/social-candidate-list";
const apiFiles = ["composeCandidateList.ts", "index.ts", "policy.ts", "readCandidateTasteSources.ts", "toCandidateDto.ts", "types.ts"].sort();
const refFiles = ["crypto.ts", "index.ts", "policy.ts", "types.ts"].sort();
const fnFiles = ["config.ts", "errors.ts", "handler.ts", "index.ts"].sort();
const sourcePaths = [
  ...apiFiles.map((file) => `${apiRoot}/${file}`),
  ...refFiles.map((file) => `${refRoot}/${file}`),
  ...fnFiles.map((file) => `${fnRoot}/${file}`)
];
const packageScripts = Object.freeze({
  "test:social-candidate-sr2d": "node scripts/social-candidate-sr2d-guard.mjs",
  "test:social-candidate-sr2d-smoke": "node scripts/social-candidate-sr2d-smoke.mjs",
  "test:social-candidate-sr2d-mutations": "node scripts/social-candidate-sr2d-mutations.mjs"
});
// Frozen authority pinned against the BASELINE COMMIT's blob bytes, never the working tree: this
// repository carries core.autocrlf=true with no .gitattributes, so a working-tree hash would depend
// on checkout configuration and would not survive a clone or a committed-state proof.
const frozenFiles = new Map([
  ["supabase/functions/_shared/auth/authenticateCaller.ts", "ea17de723928261397421bd6ab8a1b453812ba46508364b8d4b1965ef9c99a55"],
  ["supabase/functions/_shared/social-exposure/applySocialExposure.ts", "4d9e6d21309c45186b1e679350872bdfdaecca5913c6575f1f7a8d8711e7023f"],
  ["supabase/functions/_shared/social-exposure/index.ts", "ac903d4285095f741e55143011fd9ff838b7de08032c2bdc425282c6a86f8aa1"],
  ["supabase/functions/_shared/social-exposure/policy.ts", "cef032e942ed0f66ccd6a2ba9a817133d19a107b316fba6047bd74bec12cd0f3"],
  ["supabase/functions/_shared/social-exposure/resolveEntitlement.ts", "09d5d8bc69b72782d59f935fe0aeb285b80aa101a1a7038d333c5fee885e6bc9"],
  ["supabase/functions/_shared/social-exposure/types.ts", "f7103b7325c965729e62ef42bf205479e66de031c7fbc71b479e9de6270dc69c"],
  ["supabase/functions/_shared/social-pair/authorizedPairSourcesAdapter.ts", "d36240308bfaaef2769fd3f5e59280f51a11623e48c3a44c3d24ae07f8adca22"],
  ["supabase/functions/_shared/social-pair/index.ts", "6833cc1e29c0a221183207e9beb99cbfaed8a1ae904870e16c321bf048d0c404"],
  ["supabase/functions/_shared/social-pair/serverPairComparison.ts", "512b20e699398ca5d3f6906cad8759b2c98375899a808b042dab1daafaa03668"],
  ["supabase/functions/_shared/social-profile/index.ts", "fdfeb6d9097d54214c44fc8bc68ec56317ad4ba7b834cd567c1238cee712fab8"],
  ["supabase/functions/_shared/social-profile/policy.ts", "d913998908991f1a1b92e3bc7a3264c5cbc98207cc008f2a3485ba25e0ccc570"],
  ["supabase/functions/_shared/social-profile/projectPublicProfiles.ts", "bb20d3f4b2adce4183e957feb46e8308bbea9e219c9f3a7e6d78bb7c97abbb81"],
  ["supabase/functions/_shared/social-profile/readProfileFacts.ts", "ee02eec8b2555d148bb277caf5728bf144aa141f8c034cc4446ca525a57512a3"],
  ["supabase/functions/_shared/social-profile/types.ts", "ad44c1de66c1767e5cdeb1fed5e26262f88d4cecff52ab602f72a2dcae5e9952"],
  ["supabase/functions/_shared/social-ranking/index.ts", "8e97c368201f1d50f0ec317d2041bf354133748d0ad2350437ee5d514f855beb"],
  ["supabase/functions/_shared/social-ranking/policy.ts", "9d9f6d8770ec8d0e4266c9ffe6e0065c0c7e0380ee85bf3827cd28945abd711e"],
  ["supabase/functions/_shared/social-ranking/rankCandidates.ts", "a4d85ecacc6e006cb15446d1387dae34d8ac6e407f7fff25a4d2dfaa781157f2"],
  ["supabase/functions/_shared/social-ranking/types.ts", "1eb2f9fcc99f0afcabe21818f9f633309d05b8d52968aec9b5adfb8720302810"],
  ["supabase/functions/_shared/social-runtime-transport/denoPostgresExecutorTransport.ts", "7533e5085b39e62995142ff94d14bd00d88520617179fa36da1f1485ad4b6f00"],
  ["supabase/functions/_shared/social-runtime-transport/executorTransactionTransport.ts", "5a6f75ea6831e865f2d144384744ef58faefceb5413123bec723ea6d62a9f90d"],
  ["supabase/functions/social-candidate-provenance/handler.ts", "79bf00f270fffa11f00b11535340bea4f001ee5c18530909fb27d8e3e3c672ae"],
  ["supabase/functions/social-candidate-taste/handler.ts", "8e63eb20275bebb84238057f9e0d9f9981bf15aead0b377e431fcd304c6e686f"],
  ["supabase/functions/social-candidate-taste/tasteProvider.ts", "f2ecb2913b5fd2633da3fd12497dada6a2a1a1c8adff60feb1625f1fc6e70174"]
]);

// Every value forbidden from the client DTO by the frozen SR-2D contract.
const forbiddenOutput = [
  "exposureIndex", "exposure_ordinal", "candidateUserId", "candidate_user_id",
  "userId", "user_id", "profileId", "profile_id", "socialPublicId",
  "rankingState", "ranking_state", "score", "matchPercent", "compatibilityLabel",
  "matchReasons", "needsAttention", "needs_attention", "restrictionWarning", "restriction",
  "truncated", "hasMore", "nextCursor", "isPremium", "isVerified", "verification_status",
  "real_avatar_url", "realAvatarUrl", "anonymous_display_name", "anonymousDisplayName",
  "diet_summary", "nutrition_goal_summary", "recent_meal_style", "nutritionGoal",
  "distance", "latitude", "longitude", "locale", "timezone",
  "birthdate", "age_years", "gender", "entitlement", "premium", "plan_code", "subscription", "billing",
  "tags", "restaurantId", "restaurantName"
];
const forbiddenKeyEnvNames = [
  "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE", "JWT_SECRET",
  "SUPABASE_JWT_SECRET", "POSTGRES_PASSWORD", "DATABASE_URL"
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
    headParent: head === SR2GC_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
    worktreePaths: statusPaths(),
    stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
    headDeltaEntries: head === SR2GC_BASELINE ? [] : deltaEntries()
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
  const lifecycle = classifySr2gcLifecycle(state);
  const packageJson = JSON.parse(read("package.json"));
  const baselinePackage = JSON.parse(git(["show", `${SR2D_BASELINE}:package.json`]));
  const packageWithoutSr2d = structuredClone(packageJson);
  const successorScriptKeys = ["test:social-candidate-sr2e", "test:social-candidate-sr2e-smoke", "test:social-candidate-sr2e-mutations", "test:social-candidate-sr2e-development-mobile-smoke", "test:social-candidate-sr2f", "test:social-candidate-sr2f-smoke", "test:social-candidate-sr2f-mutations", "test:social-candidate-sr2f-development-composition-smoke", "test:social-candidate-sr2g-a", "test:social-candidate-sr2g-a-smoke", "test:social-candidate-sr2g-a-mutations", "test:social-candidate-sr2g-a-development-acceptance", "test:social-candidate-sr2g-b", "test:social-candidate-sr2g-b-smoke", "test:social-candidate-sr2g-b-mutations", "test:social-candidate-sr2g-b-development-acceptance", "test:social-candidate-sr2g-c", "test:social-candidate-sr2g-c-smoke", "test:social-candidate-sr2g-c-mutations", "test:social-candidate-sr2g-c-development-acceptance"];
  for (const key of [...Object.keys(packageScripts), ...successorScriptKeys]) delete packageWithoutSr2d.scripts[key];

  const sources = new Map(sourcePaths.map((file) => [file, read(file)]));
  const parsed = new Map(sourcePaths.map((file) => [file, parse(file)]));
  const apiTypes = parsed.get(`${apiRoot}/types.ts`);
  const apiPolicyRaw = sources.get(`${apiRoot}/policy.ts`);
  const composeRaw = sources.get(`${apiRoot}/composeCandidateList.ts`);
  const dtoRaw = sources.get(`${apiRoot}/toCandidateDto.ts`);
  const sourceReadRaw = sources.get(`${apiRoot}/readCandidateTasteSources.ts`);
  const refPolicyRaw = sources.get(`${refRoot}/policy.ts`);
  const refCryptoRaw = sources.get(`${refRoot}/crypto.ts`);
  const handlerRaw = sources.get(`${fnRoot}/handler.ts`);
  const configRaw = sources.get(`${fnRoot}/config.ts`);
  const errorsRaw = sources.get(`${fnRoot}/errors.ts`);
  const entryRaw = sources.get(`${fnRoot}/index.ts`);
  const compose = executable(composeRaw);
  const dto = executable(dtoRaw);
  const handler = executable(handlerRaw);
  const refCrypto = executable(refCryptoRaw);
  const allExecutable = [...sources.values()].map(executable).join("\n");
  const configToml = read("supabase/config.toml");
  const tasteProviderRaw = read("supabase/functions/social-candidate-taste/tasteProvider.ts");

  const apiDirectory = fs.readdirSync(path.join(root, apiRoot), { withFileTypes: true }).filter((e) => e.isFile()).map(({ name }) => name).sort();
  const refDirectory = fs.readdirSync(path.join(root, refRoot), { withFileTypes: true }).filter((e) => e.isFile()).map(({ name }) => name).sort();
  const fnDirectory = fs.readdirSync(path.join(root, fnRoot), { withFileTypes: true }).filter((e) => e.isFile()).map(({ name }) => name).sort();

  const filesystemManifest = createSr2dCanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
  const expectedManifestText = SR2D_SUCCESSOR_PATHS.map((file) => `${sha256(file)}  ${file}\n`).join("");
  // Computed only in a genuinely frozen shape. Keying this on "not candidate" would make the guard
  // crash in an invalid lifecycle instead of reporting the lifecycle failure it exists to report.
  const frozenIndexManifest = lifecycle.frozenShape ? createSr2dCanonicalManifest((file) => gitBytes(["show", `:${file}`])) : null;
  const frozenTreeManifest = lifecycle.frozenShape ? createSr2dCanonicalManifest((file) => gitBytes(["cat-file", "blob", `${state.head}:${file}`])) : null;

  // --- baseline / lifecycle -------------------------------------------------------------------
  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2C authority", lifecycle.valid, { phase: lifecycle.phase, head: state.head, originHead: state.originHead, ahead: state.ahead, behind: state.behind });
  check("2. lifecycle manifest is the exact SR-2G-C successor path set", exact(lifecycle.lifecycleManifest, SR2GC_SUCCESSOR_PATHS), { expected: SR2GC_SUCCESSOR_PATHS, actual: lifecycle.lifecycleManifest });
  check("3. the SR-2D baseline is the frozen SR-2C freeze commit", git(["cat-file", "-t", SR2D_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2D_BASELINE]).trim() === "Complete SR-2C public Social profile projection authority");
  check("4. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("5. every exact SR-2D path exists", SR2D_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
  check("6. candidate paths are wildcard-free and unique", new Set(SR2D_SUCCESSOR_PATHS).size === SR2D_SUCCESSOR_PATHS.length && SR2D_SUCCESSOR_PATHS.every((entry) => !/[*?[\]{}]/.test(entry)));
  check("7. package exposes three exact canonical SR-2D commands", Object.entries(packageScripts).every(([key, value]) => packageJson.scripts[key] === value));
  check("8. package.json differs from frozen authority only by the three SR-2D scripts", JSON.stringify(packageWithoutSr2d) === JSON.stringify(baselinePackage));
  // Predecessor paths carried by this round may only be validation harnesses — a guard or a mutation
  // suite. No predecessor runtime, migration or smoke fixture may ride along.
  // Predecessor paths carried by this round may only be validation harnesses. The SR-2D-owned bridge
  // generator is this round's own script, not a predecessor delta.
  check("9. predecessor delta is validation-only successor lifecycle support", SR2D_SUCCESSOR_PATHS.filter((file) => file.startsWith("scripts/") && !file.includes("sr2d") && file !== SR2D_BRIDGE_GENERATOR).every((file) => file.endsWith("-guard.mjs") || file.endsWith("-mutations.mjs")));
  check("10. exact module boundaries contain only the declared files", exact(apiDirectory, apiFiles) && exact(refDirectory, refFiles) && exact(fnDirectory, fnFiles), { apiDirectory, refDirectory, fnDirectory });
  check("11. no apps or Mobile path is part of the candidate", !SR2D_SUCCESSOR_PATHS.some((file) => file.startsWith("apps/")));

  // --- HTTP contract --------------------------------------------------------------------------
  check("12. the function is registered with verify_jwt=true", /\[functions\.social-candidate-list\][^[]*?verify_jwt = true/.test(configToml));
  check("13. no function registration is downgraded to verify_jwt=false", !/verify_jwt\s*=\s*false/.test(configToml));
  check("14. config.toml differs from frozen authority only by the SR-2D registration", (() => {
    const baseline = git(["show", `${SR2D_BASELINE}:supabase/config.toml`]).replace(/\r\n/g, "\n");
    const sr2gbRegistrations = new RegExp("\\n\\[functions\\.meal-buddy-card-(create|list|cancel)\\]\\n(#[^\\n]*\\n)*verify_jwt = true\\n", "g");
    const stripped = configToml.replace(/\r\n/g, "\n")
      .replace(/\n\[functions\.social-candidate-list\]\n[^\n]*\nverify_jwt = true\n/, "")
      // Enumerated SR-2G-B successor registrations, stripped so SR-2D's own comparison stays exact.
      .replace(sr2gbRegistrations, "");
    return stripped === baseline;
  })());
  check("15. the handler accepts POST only", /request\.method !== "POST"/.test(handler) && !/"GET"|"PUT"|"PATCH"|"DELETE"|"OPTIONS"/.test(handler));
  check("16. no CORS or preflight surface is introduced", !/\bcors\b|Access-Control|"OPTIONS"|method === "OPTIONS"/i.test(allExecutable));
  check("17. actor identity comes only from the verified caller", /authentication\.value\.userId/.test(handler) && !/actorUserId\s*=\s*(body|request|url|headers|params)/i.test(handler));
  check("18. query parameters are rejected", /url\.searchParams\.keys\(\)\]\.length !== 0\) return false/.test(handler));
  check("19. authority-bearing headers are rejected", /AUTHORITY_HEADERS\.some\(\(name\) => request\.headers\.has\(name\)\)/.test(handler));
  check("20. the authority header blocklist covers actor, candidate, limit, tier, paging and clock injection", ["x-actor-user-id", "x-user-id", "x-candidate-user-id", "x-candidate-user-ids", "x-candidate-ref", "x-limit", "x-cap", "x-page", "x-page-size", "x-cursor", "x-offset", "x-entitlement", "x-premium", "x-tier", "x-plan-code", "x-ranking", "x-score-threshold", "x-now", "x-clock"].every((name) => handlerRaw.includes(`"${name}"`)));
  check("21. any meaningful request payload is rejected", /Object\.keys\(body as Record<string, unknown>\)\.length === 0/.test(handler));
  check("22. the empty-request contract gates the request before any composition", handler.indexOf("hasValidEmptyRequestContract(request)") < handler.indexOf("dependencies.authenticateCaller"));
  check("23. exactly three error codes with the frozen status mapping", /authentication_required: 401/.test(errorsRaw) && /invalid_request: 400/.test(errorsRaw) && /server_unavailable: 503/.test(errorsRaw) && (errorsRaw.match(/: \d{3}/g) ?? []).length === 3);
  check("24. the error envelope is the frozen Edge shape", /JSON\.stringify\(\{ error: \{ code, message: MESSAGE\[code\] \} \}\)/.test(errorsRaw));
  check("25. the entrypoint wraps the handler and fails closed", /Deno\.serve\(/.test(entryRaw) && /catch \{[\s\S]*server_unavailable/.test(entryRaw));

  // --- response contract ----------------------------------------------------------------------
  check("26. the public DTO carries exactly the five allow-listed keys", exact(propertyNames(typeAlias(apiTypes, "SocialCandidateDto")), ["candidateRef", "displayName", "mascotAvatarKey", "publicBio", "willingToChat"]));
  check("27. the envelope carries exactly policyVersion and candidates", exact(propertyNames(typeAlias(apiTypes, "SocialCandidateApiResponse")), ["candidates", "policyVersion"]));
  check("28. the policy version authority is exactly social-candidate-api-v1", /SOCIAL_CANDIDATE_API_POLICY_VERSION = "social-candidate-api-v1" as const/.test(apiPolicyRaw));
  check("29. the public field allow-list is exactly the five V1 fields", /SOCIAL_CANDIDATE_API_PUBLIC_FIELDS = Object\.freeze\(\[\s*"candidateRef",\s*"displayName",\s*"mascotAvatarKey",\s*"publicBio",\s*"willingToChat"\s*\] as const\)/.test(apiPolicyRaw));
  check("30. no forbidden field name is emitted as a DTO property", forbiddenOutput.every((field) => !new RegExp(`${field}:`).test(dto.replace(/exposureIndex\b/g, "").replace(/candidateUserId\b/g, ""))), { firstHit: forbiddenOutput.find((field) => new RegExp(`${field}:`).test(dto.replace(/exposureIndex\b/g, "").replace(/candidateUserId\b/g, ""))) });
  check("31. no internal policy version is exposed to the client", !/social-ranking-v1|social-exposure-v1|social-profile-projection-v1/.test(dto.split("return Object.freeze")[1] ?? ""));
  check("32. the DTO type declares no optional or index-signature escape hatch", !/\?\s*:/.test(typeLiteral(typeAlias(apiTypes, "SocialCandidateDto"))?.getText() ?? "") && !/\[key:/.test(apiTypes.getText()));
  check("33. no pagination, cursor or page authority exists", !/paginat|cursor|nextPage|hasMore|pageSize|\boffset\b/i.test(allExecutable.replace(/"x-cursor"|"x-offset"|"x-page"|"x-page-size"/g, "")));
  check("34. truncated never reaches the client DTO", !/truncated/.test(dto));

  // --- composition ----------------------------------------------------------------------------
  check("35. the canonical candidate source is the only SQL statement", (sourceReadRaw.match(/defineSocialRuntimeExecutorStatement</g) ?? []).length === 1 && /social_internal\.canonical_candidate_taste_sources\(\$1::uuid\)/.test(sourceReadRaw) && (allExecutable.match(/social_internal\./g) ?? []).length === 1);
  check("36. the canonical source takes the verified actor and nothing else", /readSocialCandidateTasteSources\(\s*transport: SocialRuntimeExecutorTransport,\s*actorUserId: string\s*\)/.test(sourceReadRaw));
  check("37. the frozen SR-2A ranker is used and never reimplemented", /rankSocialCandidates\(/.test(compose) && !/similarity|rankingState|\.score\b/.test(compose));
  check("38. the frozen SR-2B entitlement resolver and exposure policy are used", /resolveSocialEntitlement\(/.test(compose) && /applySocialExposure\(/.test(compose));
  check("39. the frozen SR-2C projection is used", /readExposedSocialProfileFacts\(/.test(compose) && /projectPublicSocialProfiles\(/.test(compose));
  check("40. no cap, weight or ranking constant is redefined locally", !/\bfree\b|\bpremium\b|cap\s*=|\bweight\b/i.test(compose.replace(/social-exposure-v1|social-profile-projection-v1/g, "")));
  check("41. each frozen stage is invoked exactly once", ["rankSocialCandidates", "resolveSocialEntitlement", "applySocialExposure", "readExposedSocialProfileFacts", "projectPublicSocialProfiles"].every((fnName) => (compose.match(new RegExp(`${fnName}\\(`, "g")) ?? []).length === 1));
  check("42. the composition never sorts, reverses or reranks", !/\.sort\(|\.reverse\(|localeCompare/.test(compose + dto));
  check("43. an omitted profile is never refilled", !/refill|backfill|\.pop\(\)|\.shift\(\)|nextCandidate/i.test(allExecutable));
  check("44. exposureIndex is used only as an internal join coordinate", /profile\.exposureIndex/.test(dto) && !/exposureIndex:/.test(dto));
  check("45. willingToChat is carried, never used as a filter", /willingToChat: profile\.willingToChat/.test(dto) && !/willingToChat\s*(===|!==)\s*(true|false)/.test(allExecutable) && !/filter\([^)]*willingToChat/.test(allExecutable));
  check("46. the SR-1D window policy matches the frozen SR-1D source exactly", (() => {
    const mealLimit = /SOCIAL_TASTE_MEAL_LIMIT = (\d+) as const/.exec(tasteProviderRaw)?.[1];
    const favourites = /SOCIAL_TASTE_COMBINED_FAVORITES_LIMIT = (\d+) as const/.exec(tasteProviderRaw)?.[1];
    const days = /day - 30\)/.test(tasteProviderRaw);
    return mealLimit === "20" && favourites === "20" && days
      && /SOCIAL_CANDIDATE_API_MEAL_LIMIT = 20 as const/.test(apiPolicyRaw)
      && /SOCIAL_CANDIDATE_API_COMBINED_FAVORITES_LIMIT = 20 as const/.test(apiPolicyRaw)
      && /SOCIAL_CANDIDATE_API_WINDOW_DAYS = 30 as const/.test(apiPolicyRaw);
  })());
  check("47. the maximum candidate bound is the frozen Premium cap", /SOCIAL_CANDIDATE_API_MAXIMUM_CANDIDATES = 10 as const/.test(apiPolicyRaw));
  check("48. exactly one request instant governs the whole composition", (handler.match(/new Date\(\)/g) ?? []).length === 1 && !/new Date\(\)/.test(compose + dto + sourceReadRaw));
  check("49. no caller-supplied clock is accepted", !/req\.(now|clock)|body\.now|headers\.get\(["']x-now/i.test(allExecutable));
  check("50. the DTO layer holds no module-scoped request state", !/^let\s+\w+/m.test(dto) && !/^var\s+/m.test(dto));

  // --- candidateRef ---------------------------------------------------------------------------
  check("51. the dedicated key environment name is used", /SOCIAL_CANDIDATE_REF_KEY_ENV = "SOCIAL_CANDIDATE_REF_KEY_V1" as const/.test(refPolicyRaw) && /SOCIAL_CANDIDATE_REF_KEY_ENV/.test(configRaw));
  check("52. no existing public or broader-authority credential is reused for sealing", forbiddenKeyEnvNames.every((name) => !new RegExp(`${name}[\\s\\S]{0,80}candidateRefKey|candidateRefKey[\\s\\S]{0,80}${name}`).test(configRaw)) && !/service_role|SERVICE_ROLE/i.test(allExecutable));
  check("53. the algorithm is AES-GCM with a 32-byte key and 96-bit IV", /SOCIAL_CANDIDATE_REF_ALGORITHM = "AES-GCM" as const/.test(refPolicyRaw) && /SOCIAL_CANDIDATE_REF_KEY_BYTES = 32 as const/.test(refPolicyRaw) && /SOCIAL_CANDIDATE_REF_IV_BYTES = 12 as const/.test(refPolicyRaw));
  check("54. the key length is validated rather than inferred", /binary\.length !== SOCIAL_CANDIDATE_REF_KEY_BYTES\) return socialCandidateRefContractViolation\(\)/.test(refCrypto) && /keyBytes\.byteLength !== SOCIAL_CANDIDATE_REF_KEY_BYTES/.test(refCrypto));
  check("55. the version prefix is scr1", /SOCIAL_CANDIDATE_REF_VERSION = "scr1" as const/.test(refPolicyRaw) && /SOCIAL_CANDIDATE_REF_PREFIX = "scr1\." as const/.test(refPolicyRaw));
  check("56. the TTL is exactly 24 hours", /SOCIAL_CANDIDATE_REF_TTL_MS = 86_400_000 as const/.test(refPolicyRaw));
  check("57. a fresh random IV is drawn per seal", /crypto\.getRandomValues\(new Uint8Array\(byteLength\)\)/.test(refCrypto) && /randomIv\(SOCIAL_CANDIDATE_REF_IV_BYTES\)/.test(refCrypto));
  check("58. the actor is bound as additional authenticated data and never written into the token", /additionalData: additionalAuthenticatedData\(actor\)/.test(refCrypto) && /JSON\.stringify\(claims\)/.test(refCrypto) && !/actorUserId,\s*\n\s*issuedAtMs/.test(refCrypto) && !/actor:\s*actor/.test(refCrypto));
  check("59. issuedAt, expiresAt and version are sealed in the claims", /version: SOCIAL_CANDIDATE_REF_VERSION,/.test(refCrypto) && /candidateUserId: candidate,/.test(refCrypto) && /issuedAtMs,/.test(refCrypto) && /expiresAtMs/.test(refCrypto));
  check("60. expiry is enforced on open", /nowMs >= \(claims\.expiresAtMs as number\)\) return socialCandidateRefContractViolation\(\)/.test(refCrypto));
  check("61. decryption failure is one indistinguishable authentication failure", /catch \{[\s\S]{0,220}return socialCandidateRefContractViolation\(\);/.test(refCrypto));
  check("62. the sealed token structurally cannot contain either identifier", /token\.includes\(candidate\) \|\| token\.includes\(actor\)/.test(refCrypto));
  check("63. the reference primitive has no persistence, database or environment surface", !/Deno\.env|insert|update|delete|localStorage|\bcache\b|from\(/i.test(refCrypto + refPolicyRaw));
  check("64. the list API only seals and never opens a caller-supplied reference", /cipher\.seal\(/.test(dto) && !/\.open\(/.test(dto + compose + handler));

  // --- runtime discipline ---------------------------------------------------------------------
  check("65. no service_role, admin or billing credential path exists", !/service[_-]?role|SERVICE_ROLE|billing|adminClient/i.test(allExecutable));
  check("66. no logging exists anywhere in the SR-2D surface", !/console\.|logger\./.test(allExecutable));
  check("67. no write, cache or persistence capability exists", !/\.insert\(|\.update\(|\.upsert\(|\.delete\(|writeFile|Deno\.writeFile|localStorage|setItem/i.test(allExecutable));
  check("68. no randomness affects composition or ordering", !/Math\.random/.test(allExecutable) && !/getRandomValues/.test(compose + dto + handler));
  check("69. no storage, signed URL or avatar URL capability exists", !/storage|createSignedUrl|getPublicUrl|publicUrl|bucket|avatar_url/i.test(allExecutable));
  check("70. SR-2D adds no migration", SR2D_SUCCESSOR_MIGRATION === null && !SR2D_SUCCESSOR_PATHS.some((file) => file.startsWith("supabase/migrations/")));
  check("71. the repository migration set is unchanged from the baseline apart from the enumerated SR-2G-A migration", exact(fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).filter((f) => !SR2GA_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GB_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`) && !SR2GC_SUCCESSOR_PATHS.includes(`supabase/migrations/${f}`)).sort(), lines(git(["ls-tree", "-r", "--name-only", SR2D_BASELINE, "--", "supabase/migrations"])).map((f) => path.basename(f))));
  check("72. the shared modules never import upward out of _shared", [...sources.entries()].filter(([file]) => file.startsWith("supabase/functions/_shared/")).every(([, source]) => !/from "\.\.\/\.\.\/[a-z]/.test(source)));
  check("73. the composition carries no Supabase client or npm dependency", !/from\s+["'](npm:|@supabase|https?:)/.test([...sources.entries()].filter(([f]) => f.startsWith(apiRoot) || f.startsWith(refRoot)).map(([, s]) => s).join("\n")));
  check("74. the entitlement row source is the authenticated user-scoped client", /entitlementRowSource: authentication\.value\.userScopedClient/.test(handler));
  check("75. a dependency failure returns 503 and never an empty success", /catch \{[\s\S]{0,200}buildSocialCandidateListError\("server_unavailable"\)/.test(handler) && !/catch \{[\s\S]{0,200}candidates: \[\]/.test(handler));
  check("76. the transport is always closed", /finally \{[\s\S]{0,80}transport\.close\(\)/.test(handler));

  // --- frozen predecessor integrity -------------------------------------------------------------
  check("77. all frozen predecessor blobs retain exact SHA-256 at the baseline", [...frozenFiles].every(([file, hash]) => fs.existsSync(path.join(root, file)) && blobSha256(file, SR2D_BASELINE) === hash));
  // The single authorized repoint is exempt here and proven far more strictly by checks 94-97:
  // exactly one line, exactly the authorized specifier, identical runtime emit, untouched SR-2A
  // implementation bytes. Every other frozen path must still be worktree-identical.
  check("78. no frozen runtime path outside the authorized repoint has a worktree delta",
    [...frozenFiles.keys()].filter((file) => file !== SR2D_REPOINTED_FROZEN_FILE)
      .every((file) => git(["diff", "--name-only", SR2D_BASELINE, "--", file]).trim() === ""));
  check("79. frozen SR-2C authority commit remains the exact baseline", git(["show", "-s", "--format=%H", SR2D_BASELINE]).trim() === SR2D_BASELINE);
  check("80. SR-2D imports only frozen shared authorities", exact(moduleSpecifiers(parsed.get(`${apiRoot}/composeCandidateList.ts`)), ["../social-candidate-ref/types.ts", "../social-exposure/index.ts", "../social-pair/index.ts", "../social-profile/index.ts", "../social-ranking/index.ts", "../social-ranking/types.ts", "../social-runtime-transport/executorTransactionTransport.ts", "./policy.ts", "./readCandidateTasteSources.ts", "./toCandidateDto.ts", "./types.ts"].sort()), moduleSpecifiers(parsed.get(`${apiRoot}/composeCandidateList.ts`)));

  // --- SR-2D-R1 deployability bridge --------------------------------------------------------------
  const bridgeSource = read(SR2D_BRIDGE_ARTIFACT);
  const bridgeExecutable = executable(bridgeSource);
  const bridgeClosure = collectBridge();
  const repoint = proveRepointEquivalence();
  const compatibility = proveTypeCompatibility();

  check("86. the bridge generator and its generated artifact are both in the exact SR-2D manifest",
    SR2D_SUCCESSOR_PATHS.includes(SR2D_BRIDGE_GENERATOR) && SR2D_SUCCESSOR_PATHS.includes(SR2D_BRIDGE_ARTIFACT));
  check("87. the generated artifact is byte-identical to a fresh in-memory regeneration",
    fs.readFileSync(path.join(root, SR2D_BRIDGE_ARTIFACT), "utf8") === renderBridge());
  check("88. the artifact carries the generated-file banner and names its canonical authority",
    /^\/\/ GENERATED - DO NOT EDIT\./.test(bridgeSource) && /Source authority remains canonical packages\/shared/.test(bridgeSource));
  check("89. the generator reads only the approved canonical Taste source closure",
    bridgeClosure.sourceFiles.length > 0 && bridgeClosure.sourceFiles.every((file) => file.startsWith(BRIDGE_SOURCE_ROOT)),
    bridgeClosure.sourceFiles.filter((file) => !file.startsWith(BRIDGE_SOURCE_ROOT)));
  check("90. the artifact presents no module-resolution surface at all",
    !/^\s*(import|export)\s[^=]*\bfrom\b/m.test(bridgeExecutable) && !/require\(/.test(bridgeExecutable));
  check("91. every generated declaration is type-level, so the artifact emits no runtime statement",
    ts.transpileModule(bridgeSource, { compilerOptions: { module: ts.ModuleKind.ESNext, removeComments: true } }).outputText.trim() === "export {};");
  check("92. the bridge contains no ranking, exposure or profile projection policy",
    !/rankSocialCandidates|applySocialExposure|projectPublicSocialProfiles|SOCIAL_EXPOSURE_(FREE|PREMIUM)_CAP|social-ranking-v1|social-exposure-v1|social-profile-projection-v1/.test(bridgeSource));
  check("93. the bridge implements no algorithm: no function body, loop or branch",
    !/\bfunction\b|=>|\bif\s*\(|\bfor\s*\(|\bwhile\s*\(|\breturn\b/.test(bridgeExecutable));
  check("94. exactly one line of frozen SR-2A authority changed, and it is the authorized repoint",
    repoint.onlyAuthorizedLineChanged, repoint.changed);
  check("95. the repoint leaves the emitted runtime JavaScript byte-identical and type-only",
    repoint.runtimeEmitIdentical && repoint.runtimeEmitIsTypeOnly, { before: repoint.runtimeEmitBefore, after: repoint.runtimeEmitAfter });
  check("96. the bridged type stays mutually assignable with the canonical SharedTasteAdapterResult",
    compatibility.mutuallyAssignable, compatibility.diagnostics);
  check("97. the SR-2A ranking implementation and policy bytes are untouched",
    ["supabase/functions/_shared/social-ranking/rankCandidates.ts", "supabase/functions/_shared/social-ranking/policy.ts", "supabase/functions/_shared/social-ranking/index.ts"]
      .every((file) => blobSha256(file, SR2A_FROZEN_BASELINE) === blobSha256(file, SR2D_BASELINE)
        && crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex") === blobSha256(file, SR2D_BASELINE)));
  const packagesChangedSinceSr2d = lines(git(["diff", "--name-only", SR2D_BASELINE, "--", "packages/shared"]))
    .filter((entry) => !SR2E_SUCCESSOR_PATHS.includes(entry) && !SR2F_SUCCESSOR_PATHS.includes(entry) && !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry));
  check("98. no canonical Taste package byte changed outside the enumerated SR-2E successor",
    packagesChangedSinceSr2d.length === 0, packagesChangedSinceSr2d);
  check("99. the historical SR-2A freeze commit remains identifiable and immutable",
    git(["cat-file", "-t", SR2A_FROZEN_BASELINE]).trim() === "commit"
    && git(["log", "-1", "--format=%s", SR2A_FROZEN_BASELINE]).trim() === "Complete SR-2A canonical Social ranking authority");
  check("100. the SR-2D Edge path no longer reaches the non-deployable canonical package graph",
    !read(SR2D_REPOINTED_FROZEN_FILE).includes("packages/shared")
    && sourcePaths.every((file) => !read(file).includes("packages/shared")));
  check("101. only the authorized frozen file carries a successor delta inside _shared",
    lines(git(["diff", "--name-only", SR2D_BASELINE, "--", "supabase/functions/_shared"]))
      .every((file) => file === SR2D_REPOINTED_FROZEN_FILE || SR2D_SUCCESSOR_PATHS.includes(file) || SR2GA_SUCCESSOR_PATHS.includes(file) || SR2GB_SUCCESSOR_PATHS.includes(file) || SR2GC_SUCCESSOR_PATHS.includes(file)),
    lines(git(["diff", "--name-only", SR2D_BASELINE, "--", "supabase/functions/_shared"])));

  // --- hygiene ------------------------------------------------------------------------------------
  const secretPattern = /(postgres(ql)?:\/\/[^\s"']*:[^\s"'@]+@)|(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})|(sbp_[A-Za-z0-9]{20,})/i;
  check("81. candidate files contain no credential-shaped secret", !SR2D_SUCCESSOR_PATHS.map((file) => read(file)).some((source) => secretPattern.test(source)));
  const guardSource = read("scripts/social-candidate-sr2d-guard.mjs");
  const guardAst = ts.createSourceFile("guard.mjs", guardSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  let literalPass = false;
  let skipCall = false;
  const inspectGuard = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(guardAst) === "check") {
      const condition = node.arguments[1];
      if (condition && condition.kind === ts.SyntaxKind.TrueKeyword) literalPass = true;
    }
    if (ts.isIdentifier(node) && /^(skip|todo|pending)$/i.test(node.text)) skipCall = true;
    ts.forEachChild(node, inspectGuard);
  };
  inspectGuard(guardAst);
  check("82. guard contains no literal-true pass or skip call", !literalPass && !skipCall);
  check("83. canonical manifest is sorted raw-byte SHA-256 serialized as lowercase hash, two spaces, POSIX path and LF", filesystemManifest.text === expectedManifestText && filesystemManifest.paths.every((file, index, files) => index === 0 || files[index - 1] < file) && filesystemManifest.entries.every(({ path: file, sha256: hash }) => /^[0-9a-f]{64}$/.test(hash) && !file.includes("\\")) && filesystemManifest.text.endsWith("\n") && !filesystemManifest.text.includes("\r"));
  check("84. canonical aggregate is SHA-256 over the exact UTF-8 manifest bytes", filesystemManifest.aggregateSha256 === crypto.createHash("sha256").update(Buffer.from(expectedManifestText, "utf8")).digest("hex"));
  check("85. frozen index and committed tree reproduce filesystem manifest bytes", !lifecycle.frozenShape || (frozenIndexManifest.text === filesystemManifest.text && frozenIndexManifest.aggregateSha256 === filesystemManifest.aggregateSha256 && frozenTreeManifest.text === filesystemManifest.text && frozenTreeManifest.aggregateSha256 === filesystemManifest.aggregateSha256));

  console.log(JSON.stringify({
    suite: "social-candidate-sr2d-guard",
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
  console.log(JSON.stringify({
    suite: "social-candidate-sr2d-guard",
    status: "crashed",
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
}
