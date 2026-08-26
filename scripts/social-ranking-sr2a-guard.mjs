#!/usr/bin/env node
// SR-2A local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import {
  createSr2aCanonicalManifest,
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
import { classifySr2ggLifecycle, SR2GG_BASELINE, SR2GG_SUCCESSOR_PATHS } from "./social-candidate-sr2g-g-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const moduleRoot = "supabase/functions/_shared/social-ranking";
const moduleFiles = ["index.ts", "policy.ts", "rankCandidates.ts", "types.ts"].sort();
const sourcePaths = moduleFiles.map((file) => `${moduleRoot}/${file}`);
const packageScripts = Object.freeze({
  "test:social-ranking-sr2a": "node scripts/social-ranking-sr2a-guard.mjs",
  "test:social-ranking-sr2a-smoke": "node scripts/social-ranking-sr2a-smoke.mjs",
  "test:social-ranking-sr2a-mutations": "node scripts/social-ranking-sr2a-mutations.mjs"
});
const frozenFiles = new Map([
  ["supabase/config.toml", "9b90a9df1d70bf9ea3b4f405db6ca6b3555fedd060a51d7364f94cc8122e8b8f"],
  ["supabase/functions/_shared/social-pair/authorizedPairSourcesAdapter.ts", "d36240308bfaaef2769fd3f5e59280f51a11623e48c3a44c3d24ae07f8adca22"],
  ["supabase/functions/_shared/social-pair/index.ts", "6833cc1e29c0a221183207e9beb99cbfaed8a1ae904870e16c321bf048d0c404"],
  ["supabase/functions/social-candidate-taste/config.ts", "4846caf4c16989e1b211c0080edf21c4a0b216600ca7a403216e48da0ee85975"],
  ["supabase/functions/social-candidate-taste/errors.ts", "11e7b82bf5c50cf5554aa813c61a86494aa2737aff9363f8d823defa7e2ce01e"],
  ["supabase/functions/social-candidate-taste/handler.ts", "8e63eb20275bebb84238057f9e0d9f9981bf15aead0b377e431fcd304c6e686f"],
  ["supabase/functions/social-candidate-taste/index.ts", "b4bc4cafe3d955b7e2a1d2430ba8be5678bdaf9a6206674ed0b9723e604195d5"],
  ["supabase/functions/social-candidate-taste/tasteProvider.ts", "f2ecb2913b5fd2633da3fd12497dada6a2a1a1c8adff60feb1625f1fc6e70174"],
  ["supabase/migrations/20260811020000_social_candidate_taste_sources.sql", "e0859f801c040002e855f2b03e27a5f8f95fd037c23210223a1ce29881bbe624"],
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
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const exact = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);
const executable = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
function statusPaths() {
  return git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
    .split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/")).sort();
}
function deltaEntries(commit = "HEAD") {
  return lines(git(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", commit]))
    .map((entry) => {
      const [status, file] = entry.split("\t");
      return Object.freeze({ status, path: file.replaceAll("\\", "/") });
    });
}
function lifecycleState() {
  const head = git(["rev-parse", "HEAD"]).trim();
  const originHead = git(["rev-parse", "origin/main"]).trim();
  const [ahead, behind] = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"]).trim().split(/\s+/).map(Number);
  return Object.freeze({
    head,
    originHead,
    ahead,
    behind,
    headParent: head === SR2GF_BASELINE ? null : git(["rev-parse", "HEAD^"]).trim(),
    worktreePaths: statusPaths(),
    stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
    headDeltaEntries: head === SR2GF_BASELINE ? [] : deltaEntries()
  });
}
function parse(file) {
  return ts.createSourceFile(file, read(file), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
}
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
  return literal.members
    .filter(ts.isPropertySignature)
    .map((member) => member.name.getText(alias.getSourceFile()).replaceAll('"', ""))
    .sort();
}
function moduleSpecifiers(source) {
  return source.statements
    .filter((node) => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
    .map((node) => node.moduleSpecifier.text)
    .sort();
}

try {
  const state = lifecycleState();
  const lifecycle = classifySr2gfLifecycle(state);
  const successorLifecycle = classifySr2ggLifecycle({
    ...state,
    headDeltaPaths: state.headDeltaEntries.map(({ path: file }) => file),
    headDeleted: state.headDeltaEntries.some(({ status }) => status === "D")
  });
  const frozenAuthorityAtHead = git(["rev-parse", `${SR2GG_BASELINE}^`]).trim() === SR2GF_BASELINE
    && exact(deltaEntries(SR2GG_BASELINE).map(({ path: file }) => file).sort(), SR2GF_SUCCESSOR_PATHS);
  const effectivePhase = lifecycle.valid ? lifecycle.phase : frozenAuthorityAtHead && successorLifecycle.valid
    ? `successor_${successorLifecycle.phase}` : "invalid";
  const packageJson = JSON.parse(read("package.json"));
  const baselinePackage = JSON.parse(git(["show", `${SR2A_BASELINE}:package.json`]));
  const successorScriptKeys = ["test:social-exposure-sr2b", "test:social-exposure-sr2b-smoke", "test:social-exposure-sr2b-mutations", "test:social-profile-sr2c", "test:social-profile-sr2c-smoke", "test:social-profile-sr2c-mutations", "test:social-candidate-sr2d", "test:social-candidate-sr2d-smoke", "test:social-candidate-sr2d-mutations", "test:social-candidate-sr2e", "test:social-candidate-sr2e-smoke", "test:social-candidate-sr2e-mutations", "test:social-candidate-sr2e-development-mobile-smoke", "test:social-candidate-sr2f", "test:social-candidate-sr2f-smoke", "test:social-candidate-sr2f-mutations", "test:social-candidate-sr2f-development-composition-smoke", "test:social-candidate-sr2g-a", "test:social-candidate-sr2g-a-smoke", "test:social-candidate-sr2g-a-mutations", "test:social-candidate-sr2g-a-development-acceptance", "test:social-candidate-sr2g-b", "test:social-candidate-sr2g-b-smoke", "test:social-candidate-sr2g-b-mutations", "test:social-candidate-sr2g-b-development-acceptance", "test:social-candidate-sr2g-c", "test:social-candidate-sr2g-c-smoke", "test:social-candidate-sr2g-c-mutations", "test:social-candidate-sr2g-c-development-acceptance", "test:social-candidate-sr2g-b-r1", "test:social-candidate-sr2g-b-r1-smoke", "test:social-candidate-sr2g-b-r1-mutations", "test:social-candidate-sr2g-b-r1-development-acceptance", "test:social-candidate-sr2g-c-r1", "test:social-candidate-sr2g-c-r1-smoke", "test:social-candidate-sr2g-c-r1-mutations", "test:social-candidate-sr2g-c-r1-development-acceptance", "test:social-interest-sr2c-r1", "test:social-interest-sr2c-r1-smoke", "test:social-interest-sr2c-r1-mutations", "test:social-interest-sr2c-r1-development-acceptance", "test:social-candidate-sr2g-d", "test:social-candidate-sr2g-d-smoke", "test:social-candidate-sr2g-d-mutations", "test:social-candidate-sr2g-d-development-acceptance", "test:social-candidate-sr2g-e1", "test:social-candidate-sr2g-e1-smoke", "test:social-candidate-sr2g-e1-mutations", "test:social-candidate-sr2g-e1-development-acceptance", "test:social-candidate-sr2g-e2", "test:social-candidate-sr2g-e2-smoke", "test:social-candidate-sr2g-e2-mutations", "test:social-candidate-sr2g-e2-development-mobile-smoke", "test:social-candidate-sr2g-f", "test:social-candidate-sr2g-f-smoke", "test:social-candidate-sr2g-f-mutations", "test:social-candidate-sr2g-f-development-acceptance"];
  const packageWithoutSr2a = structuredClone(packageJson);
  for (const key of [...Object.keys(packageScripts), ...successorScriptKeys]) delete packageWithoutSr2a.scripts[key];
  for (const key of ["test:social-candidate-sr2g-g", "test:social-candidate-sr2g-g-smoke", "test:social-candidate-sr2g-g-mutations"]) delete packageWithoutSr2a.scripts[key];
  for (const key of ["test:social-candidate-sr2h-a", "test:social-candidate-sr2h-a-smoke", "test:social-candidate-sr2h-a-mutations"]) delete packageWithoutSr2a.scripts[key];
  for (const key of ["test:social-interest-sr2h-b", "test:social-interest-sr2h-b-smoke", "test:social-interest-sr2h-b-mutations", "test:social-interest-sr2h-b-concurrency"]) delete packageWithoutSr2a.scripts[key];
  for (const key of ["test:meal-buddy-relationship-sr2i-a", "test:meal-buddy-relationship-sr2i-a-smoke", "test:meal-buddy-relationship-sr2i-a-mutations", "test:meal-buddy-relationship-sr2i-a-concurrency"]) delete packageWithoutSr2a.scripts[key];
  for (const key of ["test:meal-buddy-relationship-sr2i-b", "test:meal-buddy-relationship-sr2i-b-smoke", "test:meal-buddy-relationship-sr2i-b-mutations"]) delete packageWithoutSr2a.scripts[key];
  for (const key of ["test:meal-buddy-chat-sr2j-a", "test:meal-buddy-chat-sr2j-a-smoke", "test:meal-buddy-chat-sr2j-a-mutations", "test:meal-buddy-chat-sr2j-a-concurrency"]) delete packageWithoutSr2a.scripts[key];
  for (const key of ["test:meal-buddy-chat-sr2j-b", "test:meal-buddy-chat-sr2j-b-smoke", "test:meal-buddy-chat-sr2j-b-mutations"]) delete packageWithoutSr2a.scripts[key];
  // SR-2K-A adds three validation-only command keys. Stripping them keeps this guard measuring
  // what it has always measured: that no OTHER package byte moved.
  for (const key of ["test:meal-buddy-closure-sr2k-a", "test:meal-buddy-closure-sr2k-a-smoke", "test:meal-buddy-closure-sr2k-a-mutations"]) delete packageWithoutSr2a.scripts[key];
  // SR-2K-B adds five validation-only command keys. Stripping them keeps this guard measuring
  // what it has always measured: that no OTHER package byte moved.
  for (const key of ["test:social-final-sr2k-b", "test:social-final-sr2k-b-smoke", "test:social-final-sr2k-b-mutations", "test:social-final-sr2k-b-concurrency", "test:social-final-sr2k-b-postgres"]) delete packageWithoutSr2a.scripts[key];
  // GEO-1A registers the shared Geo authority's four command keys. Named exactly, never by pattern.
  for (const key of ["test:geo-shared-authority-geo-1a","test:geo-shared-authority-geo-1a-smoke","test:geo-shared-authority-geo-1a-mutations","test:geo-shared-authority-geo-1a-postgres"]) delete packageWithoutSr2a.scripts[key];
  // GEO-1B registers the Mobile location authority's three command keys. Named exactly.
  for (const key of ["test:geo-mobile-location-geo-1b","test:geo-mobile-location-geo-1b-smoke","test:geo-mobile-location-geo-1b-mutations"]) delete packageWithoutSr2a.scripts[key];
  const sources = new Map(sourcePaths.map((file) => [file, read(file)]));
  const parsed = new Map(sourcePaths.map((file) => [file, parse(file)]));
  const typesSource = parsed.get(`${moduleRoot}/types.ts`);
  const policyRaw = sources.get(`${moduleRoot}/policy.ts`);
  const rankRaw = sources.get(`${moduleRoot}/rankCandidates.ts`);
  const rank = executable(rankRaw);
  const allExecutable = [...sources.values()].map(executable).join("\n");
  const directoryFiles = fs.readdirSync(path.join(root, moduleRoot), { withFileTypes: true })
    .filter((entry) => entry.isFile()).map(({ name }) => name).sort();
  const filesystemManifest = createSr2aCanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
  const expectedManifestText = SR2A_SUCCESSOR_PATHS
    .map((file) => `${sha256(file)}  ${file}\n`)
    .join("");
  // SR-2A is frozen at SR2B_BASELINE. A successor round legitimately amends the shared predecessor
  // guards it also lists, so the provable invariant is that every path SR-2A alone owns is still
  // byte-identical to its freeze commit.
  const sr2aOwnedPaths = SR2A_SUCCESSOR_PATHS.filter((file) => !SR2B_SUCCESSOR_PATHS.includes(file) && !SR2C_SUCCESSOR_PATHS.includes(file) && !SR2D_SUCCESSOR_PATHS.includes(file) && !SR2E_SUCCESSOR_PATHS.includes(file) && !SR2F_SUCCESSOR_PATHS.includes(file) && !SR2GA_SUCCESSOR_PATHS.includes(file) && !SR2GB_SUCCESSOR_PATHS.includes(file) && !SR2GC_SUCCESSOR_PATHS.includes(file) && !SR2GBR1_SUCCESSOR_PATHS.includes(file) && !SR2GCR1_SUCCESSOR_PATHS.includes(file) && !SR2CR1_SUCCESSOR_PATHS.includes(file) && !SR2GD_SUCCESSOR_PATHS.includes(file) && !SR2GE1_SUCCESSOR_PATHS.includes(file) && !SR2GE2_SUCCESSOR_PATHS.includes(file) && !SR2GF_SUCCESSOR_PATHS.includes(file) && !SR2GG_SUCCESSOR_PATHS.includes(file));

  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2C-R1 authority", effectivePhase !== "invalid", { phase: effectivePhase, head: state.head, originHead: state.originHead, ahead: state.ahead, behind: state.behind });
  check("2. frozen SR-2G-F authority commit retains its exact successor path set", frozenAuthorityAtHead, { authority: SR2GG_BASELINE, expected: SR2GF_SUCCESSOR_PATHS });
  check("2c. frozen SR-2B commit remains the exact immutable predecessor of this successor round", git(["rev-parse", `${SR2C_BASELINE}^`]).trim() === SR2B_BASELINE && exact(deltaEntries(SR2C_BASELINE).map(({ path: file }) => file).sort(), SR2B_SUCCESSOR_PATHS));
  check("2d. SR-2C successor paths are wildcard-free and confined to the pure shared profile module plus exactly one projection migration", SR2C_SUCCESSOR_PATHS.length > 0
    && new Set(SR2C_SUCCESSOR_PATHS).size === SR2C_SUCCESSOR_PATHS.length
    && SR2C_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-profile/") || entry === SR2C_SUCCESSOR_MIGRATION)
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2C_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("2a. frozen SR-2A commit has the exact predecessor parent and immutable manifest", git(["rev-parse", `${SR2B_BASELINE}^`]).trim() === SR2A_BASELINE && exact(deltaEntries(SR2B_BASELINE).map(({ path: file }) => file).sort(), SR2A_SUCCESSOR_PATHS));
  check("2b. SR-2B successor paths are wildcard-free and confined to the pure shared exposure module plus exactly one grant migration", SR2B_SUCCESSOR_PATHS.length > 0
    && new Set(SR2B_SUCCESSOR_PATHS).size === SR2B_SUCCESSOR_PATHS.length
    && SR2B_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-exposure/") || entry === SR2B_SUCCESSOR_MIGRATION)
    && SR2B_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2B_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("3. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("4. exact module boundary contains only four TypeScript files", exact(directoryFiles, moduleFiles), { expected: moduleFiles, actual: directoryFiles });
  check("5. every exact SR-2A path exists", SR2A_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
  check("6. package exposes three exact canonical SR-2A commands", Object.entries(packageScripts).every(([key, value]) => packageJson.scripts[key] === value));
  check("7. package.json differs from frozen authority only by the three SR-2A scripts", JSON.stringify(packageWithoutSr2a) === JSON.stringify(baselinePackage));
  check("8. predecessor guard delta is validation-only successor lifecycle support", SR2A_SUCCESSOR_PATHS.includes("scripts/social-taste-sr1d-guard.mjs") && !SR2A_SUCCESSOR_PATHS.some((file) => file.includes("social-taste-sr1d-") && file !== "scripts/social-taste-sr1d-guard.mjs"));

  // SR-2D carries one authorized deployability repoint of this module's single type-only import: the
  // Supabase Edge bundler resolves specifiers literally and cannot follow the canonical Taste
  // package's extension-less directory imports. Either the canonical specifier or the generated
  // Edge types bridge is legal here, and nothing else; the SR-2D guard separately proves the
  // repoint is exactly one line with byte-identical runtime emit.
  const SR2D_AUTHORIZED_TASTE_SPECIFIERS = [
    "../../../../packages/shared/src/domain/taste-similarity/shared-adapter/types.ts",
    "../social-taste-types/sharedTasteAdapterTypes.generated.ts"
  ];
  check("9. module imports are limited to the frozen Taste type and local ranking files", (() => {
    const specifiers = moduleSpecifiers(parsed.get(`${moduleRoot}/types.ts`));
    return specifiers.length === 1 && SR2D_AUTHORIZED_TASTE_SPECIFIERS.includes(specifiers[0]);
  })() && moduleSpecifiers(parsed.get(`${moduleRoot}/policy.ts`)).length === 0 && exact(moduleSpecifiers(parsed.get(`${moduleRoot}/rankCandidates.ts`)), ["./policy.ts", "./types.ts"]) && exact(moduleSpecifiers(parsed.get(`${moduleRoot}/index.ts`)), ["./policy.ts", "./rankCandidates.ts", "./types.ts"]));
  check("10. candidate input is exactly candidateUserId plus frozen SharedTasteAdapterResult", exact(propertyNames(typeAlias(typesSource, "SocialRankingCandidateInput")), ["candidateUserId", "result"]) && typeAlias(typesSource, "SocialRankingCandidateInput").getText().includes("result: SharedTasteAdapterResult"));
  check("11. ranking states are exactly scored, not_scored and unsupported", /SocialRankingState\s*=\s*"scored"\s*\|\s*"not_scored"\s*\|\s*"unsupported"/.test(read(`${moduleRoot}/types.ts`)) && exact([...policyRaw.matchAll(/"(scored|not_scored|unsupported)"/g)].map((match) => match[1]).slice(0, 3), ["scored", "not_scored", "unsupported"]));
  check("12. ranked candidate output has exactly identity and rankingState", exact(propertyNames(typeAlias(typesSource, "SocialRankedCandidate")), ["candidateUserId", "rankingState"]));
  check("13. result output has exactly policyVersion and ordered", exact(propertyNames(typeAlias(typesSource, "SocialRankingResult")), ["ordered", "policyVersion"]));
  check("14. exact policy authority is social-ranking-v1", /SOCIAL_RANKING_POLICY_VERSION = "social-ranking-v1" as const/.test(policyRaw) && /policyVersion: "social-ranking-v1"/.test(read(`${moduleRoot}/types.ts`)));
  check("15. exact stable contract error is centralized", /SOCIAL_RANKING_CONTRACT_ERROR = "social_ranking_contract_violated" as const/.test(policyRaw) && /throw new Error\(SOCIAL_RANKING_CONTRACT_ERROR\)/.test(policyRaw));

  check("16. valid scored value comes only from taste.similarity.score", /const similarity = result\.taste\.similarity/.test(rank) && /score: similarity\.score/.test(rank));
  check("17. scored values require number, finite and closed unit range", /typeof similarity\.score !== "number"/.test(rank) && /!Number\.isFinite\(similarity\.score\)/.test(rank) && /similarity\.score < 0/.test(rank) && /similarity\.score > 1/.test(rank));
  check("18. malformed candidates fail through one stable contract authority", (rank.match(/socialRankingContractViolation\(\)/g) ?? []).length >= 5 && !/clamp|Math\.(min|max)/.test(rank));
  check("19. duplicate UUID identity is rejected without deduplication", /new Set\(candidateIds\)\.size !== candidateIds\.length/.test(rank) && /candidateUserId\.toLowerCase\(\)/.test(rank));
  check("20. classification retains unsupported and not_scored as non-numeric states", /rankingState: "unsupported", score: null/.test(rank) && /rankingState: "not_scored", score: null/.test(rank));
  check("20a. not_scored accepts only the three frozen reason codes", /const NOT_SCORED_REASONS = new Set\(\[\s*"no_comparable_evidence",\s*"insufficient_evidence",\s*"unsupported_snapshot_schema"\s*\]\)/.test(rank) && /!NOT_SCORED_REASONS\.has\(similarity\.reason\)/.test(rank));
  check("20b. unsupported accepts only the two frozen adapter reasons", /const UNSUPPORTED_REASONS = new Set\(\[\s*"unsupported_snapshot_schema",\s*"policy_version_mismatch"\s*\]\)/.test(rank) && /!UNSUPPORTED_REASONS\.has\(result\.reason\)/.test(rank));
  check("21. bucket order is exactly scored then not_scored then unsupported", /state === "scored"\) return 0/.test(rank) && /state === "not_scored"\) return 1/.test(rank) && /state === "unsupported"\) return 2/.test(rank));
  check("22. scored comparator authority is score descending", /left\.score! > right\.score! \? -1 : 1/.test(rank));
  check("23. every equal-score or non-scored tie reaches explicit UUID comparison", /return compareCodeUnits\(left\.candidateUserId, right\.candidateUserId\)/.test(rank));
  check("24. code-unit comparator uses exact relational behavior", /return left < right \? -1 : left > right \? 1 : 0/.test(rank));
  check("25. comparator never uses locale ordering or implicit sort stability", !/localeCompare|Intl\.|Collator/.test(allExecutable) && /\.sort\(compareCandidates\)/.test(rank));
  check("26. confidence does not enter classification or ordering", !/confidence/i.test(rank));
  check("27. goal and context do not enter classification or ordering", !/\bgoal\b|\bcontext\b/i.test(rank));
  check("28. restriction does not enter classification or ordering", !/restriction/i.test(rank));
  check("29. no aggregate, weighted, match or composite numeric policy exists", !/aggregate|weighted|weighting|matchScore|overallScore|composite|multiplier|penalty|boost/i.test(allExecutable));
  check("30. no Premium, entitlement, exposure, pagination or limit authority exists", !/premium|entitlement|exposure|pagination|\bpage\b|\blimit\b/i.test(allExecutable));
  check("31. no actor, meal, date or caller authority parameter exists", !/actorUserId|mealId|startDate|endDate|caller|requestingUser|viewer/i.test(allExecutable));
  check("32. no clock or randomness can affect the pure authority", !/Date\.now|new Date|performance\.now|Math\.random|crypto\.randomUUID/.test(allExecutable));
  check("33. no database, Supabase, B1, D1, provider or candidate-pool import exists", !/from\s+["'][^"']*(supabase|database|provider|candidate-pool|authorized-pair|social-pair)/i.test(allExecutable));
  check("34. no environment, network, HTTP or Edge runtime capability exists", !/Deno\.env|process\.env|fetch\s*\(|Request\b|Response\b|serve\s*\(|http:/i.test(allExecutable));
  check("35. no persistence or cache capability exists", !/insert\s*\(|update\s*\(|upsert\s*\(|delete\s*\(|writeFile|Deno\.write|localStorage|cache/i.test(allExecutable));
  check("36. no private ranking input or output logging exists", !/console\.|logger\.|log\s*\(/i.test(allExecutable));
  check("37. canonical projection cannot expose score, confidence, evidence, reasons, signals or snapshots", !/score|confidence|evidence|reason|signal|snapshot/i.test(typeAlias(typesSource, "SocialRankedCandidate").getText()) && !/score|confidence|evidence|reason|signal|snapshot/i.test(typeAlias(typesSource, "SocialRankingResult").getText()));
  check("38. result and every projected row are frozen", /return Object\.freeze\(\{[\s\S]*ordered: Object\.freeze\(\[\.\.\.classified\]\.sort\(compareCandidates\)\.map\(projectCandidate\)\)/.test(rank) && /function projectCandidate[\s\S]*return Object\.freeze/.test(rank));
  check("39. empty input naturally returns the canonical empty ordered array", /const classified = candidates\.map\(classifyCandidate\)/.test(rank) && !/candidates\.length === 0[\s\S]*throw/.test(rank));

  check("40. no apps or Mobile path is part of the candidate", !SR2A_SUCCESSOR_PATHS.some((file) => file.startsWith("apps/")));
  check("41. no migration path is added or modified", !SR2A_SUCCESSOR_PATHS.some((file) => file.startsWith("supabase/migrations/")));
  check("42. no config.toml path is added or modified", !SR2A_SUCCESSOR_PATHS.includes("supabase/config.toml"));
  check("43. Supabase delta is only the pure shared four-file module", SR2A_SUCCESSOR_PATHS.filter((file) => file.startsWith("supabase/")).every((file) => file.startsWith(`${moduleRoot}/`)));
  check("44. no Edge function, HTTP endpoint or public DTO path is introduced", !SR2A_SUCCESSOR_PATHS.some((file) => /^supabase\/functions\/[^_]/.test(file) || /dto/i.test(file)));
  check("45. all frozen SR-1D live-relevant and predecessor migration bytes retain exact SHA-256", [...frozenFiles].filter(([file]) => !SR2D_SUCCESSOR_PATHS.includes(file) && !SR2E_SUCCESSOR_PATHS.includes(file) && !SR2F_SUCCESSOR_PATHS.includes(file) && !SR2GA_SUCCESSOR_PATHS.includes(file) && !SR2GB_SUCCESSOR_PATHS.includes(file) && !SR2GC_SUCCESSOR_PATHS.includes(file) && !SR2GBR1_SUCCESSOR_PATHS.includes(file) && !SR2GCR1_SUCCESSOR_PATHS.includes(file) && !SR2CR1_SUCCESSOR_PATHS.includes(file) && !SR2GD_SUCCESSOR_PATHS.includes(file) && !SR2GE1_SUCCESSOR_PATHS.includes(file) && !SR2GE2_SUCCESSOR_PATHS.includes(file) && !SR2GF_SUCCESSOR_PATHS.includes(file)).every(([file, hash]) => fs.existsSync(path.join(root, file)) && sha256(file) === hash));
  check("46. frozen SR-1D authority commit remains the exact baseline", git(["cat-file", "-t", SR2A_BASELINE]).trim() === "commit" && git(["show", "-s", "--format=%H", SR2A_BASELINE]).trim() === SR2A_BASELINE);
  check("47. no frozen migration, config or live SR-1D path has a worktree delta", [...frozenFiles.keys()].filter((file) => !SR2D_SUCCESSOR_PATHS.includes(file) && !SR2E_SUCCESSOR_PATHS.includes(file) && !SR2F_SUCCESSOR_PATHS.includes(file) && !SR2GA_SUCCESSOR_PATHS.includes(file) && !SR2GB_SUCCESSOR_PATHS.includes(file) && !SR2GC_SUCCESSOR_PATHS.includes(file) && !SR2GBR1_SUCCESSOR_PATHS.includes(file) && !SR2GCR1_SUCCESSOR_PATHS.includes(file) && !SR2CR1_SUCCESSOR_PATHS.includes(file) && !SR2GD_SUCCESSOR_PATHS.includes(file) && !SR2GE1_SUCCESSOR_PATHS.includes(file) && !SR2GE2_SUCCESSOR_PATHS.includes(file) && !SR2GF_SUCCESSOR_PATHS.includes(file)).every((file) => git(["diff", "--name-only", SR2A_BASELINE, "--", file]).trim() === ""));
  const secretPattern = new RegExp(`(?:${["sb", "secret"].join("_")}_[A-Za-z0-9._-]{20,}|${["service", "role", "key"].join("_")}\\s*[=:]\\s*["'][A-Za-z0-9._-]{20,}|eyJ[A-Za-z0-9_-]{30,}\\.)`);
  check("48. candidate scripts contain no credential-shaped secret", !secretPattern.test(SR2A_SUCCESSOR_PATHS.map((file) => read(file)).join("\n")));
  const guardAst = parse("scripts/social-ranking-sr2a-guard.mjs");
  let literalPass = false;
  let skipCall = false;
  const inspectGuard = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(guardAst) === "check" && node.arguments[1]?.kind === ts.SyntaxKind.TrueKeyword) literalPass = true;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "skip") skipCall = true;
    ts.forEachChild(node, inspectGuard);
  };
  inspectGuard(guardAst);
  check("49. guard contains no literal-true pass or skip call", !literalPass && !skipCall);
  check("50. canonical manifest is sorted raw-byte SHA-256 serialized as lowercase hash, two spaces, POSIX path and LF", filesystemManifest.text === expectedManifestText && filesystemManifest.paths.every((file, index, files) => index === 0 || files[index - 1] < file) && filesystemManifest.entries.every(({ path: file, sha256: hash }) => /^[0-9a-f]{64}$/.test(hash) && !file.includes("\\")) && filesystemManifest.text.endsWith("\n") && !filesystemManifest.text.includes("\r") && !filesystemManifest.text.includes("\0"));
  check("51. canonical aggregate is SHA-256 over the exact UTF-8 manifest bytes", filesystemManifest.aggregateSha256 === crypto.createHash("sha256").update(Buffer.from(expectedManifestText, "utf8")).digest("hex"));
  check("52. every SR-2A-owned path is byte-identical between its freeze commit and the worktree", sr2aOwnedPaths.length > 0 && sr2aOwnedPaths.every((file) => gitBytes(["show", `${SR2B_BASELINE}:${file}`]).equals(fs.readFileSync(path.join(root, file)))), { owned: sr2aOwnedPaths });

  console.log(JSON.stringify({
    suite: "social-ranking-sr2a-guard",
    status: failures.length === 0 ? "passed" : "failed",
    lifecycle: effectivePhase,
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
    suite: "social-ranking-sr2a-guard",
    status: "crashed",
    error: error instanceof Error ? error.message : String(error),
    networkUsed: false,
    databaseUsed: false,
    credentialsUsed: false,
    productionTouched: false
  }, null, 2));
  process.exit(1);
}
