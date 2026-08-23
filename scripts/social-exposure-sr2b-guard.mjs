#!/usr/bin/env node
// SR-2B local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import {
  createSr2bCanonicalManifest,
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
import { SR2HB_MIGRATION } from "./social-interest-sr2h-b-successor-manifest.mjs";
import { SR2IA_SUCCESSOR_PATHS } from "./meal-buddy-relationship-sr2i-a-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const moduleRoot = "supabase/functions/_shared/social-exposure";
const moduleFiles = ["applySocialExposure.ts", "index.ts", "policy.ts", "resolveEntitlement.ts", "types.ts"].sort();
const sourcePaths = moduleFiles.map((file) => `${moduleRoot}/${file}`);
const packageScripts = Object.freeze({
  "test:social-exposure-sr2b": "node scripts/social-exposure-sr2b-guard.mjs",
  "test:social-exposure-sr2b-smoke": "node scripts/social-exposure-sr2b-smoke.mjs",
  "test:social-exposure-sr2b-mutations": "node scripts/social-exposure-sr2b-mutations.mjs"
});
// Frozen authority is pinned against the BASELINE COMMIT's blob bytes, never the working tree.
// This repository carries core.autocrlf=true with no .gitattributes, so a working-tree hash would
// silently depend on checkout configuration and would not survive a clone, a CI runner or a
// committed-state proof. The committed blob is the only checkout-independent notion of "unchanged".
const frozenFiles = new Map([
  ["supabase/config.toml", "9b90a9df1d70bf9ea3b4f405db6ca6b3555fedd060a51d7364f94cc8122e8b8f"],
  ["supabase/functions/_shared/social-pair/authorizedPairSourcesAdapter.ts", "d36240308bfaaef2769fd3f5e59280f51a11623e48c3a44c3d24ae07f8adca22"],
  ["supabase/functions/_shared/social-pair/index.ts", "6833cc1e29c0a221183207e9beb99cbfaed8a1ae904870e16c321bf048d0c404"],
  ["supabase/functions/_shared/social-ranking/index.ts", "8e97c368201f1d50f0ec317d2041bf354133748d0ad2350437ee5d514f855beb"],
  ["supabase/functions/_shared/social-ranking/policy.ts", "9d9f6d8770ec8d0e4266c9ffe6e0065c0c7e0380ee85bf3827cd28945abd711e"],
  ["supabase/functions/_shared/social-ranking/rankCandidates.ts", "a4d85ecacc6e006cb15446d1387dae34d8ac6e407f7fff25a4d2dfaa781157f2"],
  ["supabase/functions/_shared/social-ranking/types.ts", "1eb2f9fcc99f0afcabe21818f9f633309d05b8d52968aec9b5adfb8720302810"],
  ["supabase/functions/social-candidate-taste/handler.ts", "8e63eb20275bebb84238057f9e0d9f9981bf15aead0b377e431fcd304c6e686f"],
  ["supabase/functions/social-candidate-taste/tasteProvider.ts", "f2ecb2913b5fd2633da3fd12497dada6a2a1a1c8adff60feb1625f1fc6e70174"],
  ["supabase/migrations/20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql", "127a64fbd11a34f1629e2510345ba0c2feb1058011c75ffc687ae633336bcef2"],
  ["supabase/migrations/20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql", "9f0c923d9a47369dd3722bd3513c7b2c0c38ac5e63ad2501bcb7b77373830394"],
  ["supabase/migrations/20260810050000_social_runtime_executor_role.sql", "501243dbc6b7179259be32b2d627d21d1e2d11f93dc31dde4c8fea26958eecbc"],
  ["supabase/migrations/20260811010000_social_canonical_candidate_pool.sql", "0d5c683d129038527a6b72db8ea28d87e94efe18a39928d13b4fc82e5f0ba9fb"],
  ["supabase/migrations/20260811020000_social_candidate_taste_sources.sql", "e0859f801c040002e855f2b03e27a5f8f95fd037c23210223a1ce29881bbe624"]
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
const blobSha256 = (file, ref) => crypto.createHash("sha256").update(gitBytes(["cat-file", "blob", `${ref}:${file}`])).digest("hex");
const blobText = (file, ref) => gitBytes(["cat-file", "blob", `${ref}:${file}`]).toString("utf8");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const exact = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);
const executable = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
const executableSql = (source) => source
  .split(/\r?\n/)
  .map((line) => (line.trim().startsWith("--") ? "" : line.split("--")[0]))
  .join("\n");
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
  const baselinePackage = JSON.parse(git(["show", `${SR2B_BASELINE}:package.json`]));
  const packageWithoutSr2b = structuredClone(packageJson);
  const successorScriptKeys = ["test:social-profile-sr2c", "test:social-profile-sr2c-smoke", "test:social-profile-sr2c-mutations", "test:social-candidate-sr2d", "test:social-candidate-sr2d-smoke", "test:social-candidate-sr2d-mutations", "test:social-candidate-sr2e", "test:social-candidate-sr2e-smoke", "test:social-candidate-sr2e-mutations", "test:social-candidate-sr2e-development-mobile-smoke", "test:social-candidate-sr2f", "test:social-candidate-sr2f-smoke", "test:social-candidate-sr2f-mutations", "test:social-candidate-sr2f-development-composition-smoke", "test:social-candidate-sr2g-a", "test:social-candidate-sr2g-a-smoke", "test:social-candidate-sr2g-a-mutations", "test:social-candidate-sr2g-a-development-acceptance", "test:social-candidate-sr2g-b", "test:social-candidate-sr2g-b-smoke", "test:social-candidate-sr2g-b-mutations", "test:social-candidate-sr2g-b-development-acceptance", "test:social-candidate-sr2g-c", "test:social-candidate-sr2g-c-smoke", "test:social-candidate-sr2g-c-mutations", "test:social-candidate-sr2g-c-development-acceptance", "test:social-candidate-sr2g-b-r1", "test:social-candidate-sr2g-b-r1-smoke", "test:social-candidate-sr2g-b-r1-mutations", "test:social-candidate-sr2g-b-r1-development-acceptance", "test:social-candidate-sr2g-c-r1", "test:social-candidate-sr2g-c-r1-smoke", "test:social-candidate-sr2g-c-r1-mutations", "test:social-candidate-sr2g-c-r1-development-acceptance", "test:social-interest-sr2c-r1", "test:social-interest-sr2c-r1-smoke", "test:social-interest-sr2c-r1-mutations", "test:social-interest-sr2c-r1-development-acceptance", "test:social-candidate-sr2g-d", "test:social-candidate-sr2g-d-smoke", "test:social-candidate-sr2g-d-mutations", "test:social-candidate-sr2g-d-development-acceptance", "test:social-candidate-sr2g-e1", "test:social-candidate-sr2g-e1-smoke", "test:social-candidate-sr2g-e1-mutations", "test:social-candidate-sr2g-e1-development-acceptance", "test:social-candidate-sr2g-e2", "test:social-candidate-sr2g-e2-smoke", "test:social-candidate-sr2g-e2-mutations", "test:social-candidate-sr2g-e2-development-mobile-smoke", "test:social-candidate-sr2g-f", "test:social-candidate-sr2g-f-smoke", "test:social-candidate-sr2g-f-mutations", "test:social-candidate-sr2g-f-development-acceptance"];
  for (const key of [...Object.keys(packageScripts), ...successorScriptKeys]) delete packageWithoutSr2b.scripts[key];
  for (const key of ["test:social-candidate-sr2g-g", "test:social-candidate-sr2g-g-smoke", "test:social-candidate-sr2g-g-mutations"]) delete packageWithoutSr2b.scripts[key];
  for (const key of ["test:social-candidate-sr2h-a", "test:social-candidate-sr2h-a-smoke", "test:social-candidate-sr2h-a-mutations"]) delete packageWithoutSr2b.scripts[key];
  for (const key of ["test:social-interest-sr2h-b", "test:social-interest-sr2h-b-smoke", "test:social-interest-sr2h-b-mutations", "test:social-interest-sr2h-b-concurrency"]) delete packageWithoutSr2b.scripts[key];
  for (const key of ["test:meal-buddy-relationship-sr2i-a", "test:meal-buddy-relationship-sr2i-a-smoke", "test:meal-buddy-relationship-sr2i-a-mutations", "test:meal-buddy-relationship-sr2i-a-concurrency"]) delete packageWithoutSr2b.scripts[key];
  for (const key of ["test:meal-buddy-relationship-sr2i-b", "test:meal-buddy-relationship-sr2i-b-smoke", "test:meal-buddy-relationship-sr2i-b-mutations"]) delete packageWithoutSr2b.scripts[key];
  for (const key of ["test:meal-buddy-chat-sr2j-a", "test:meal-buddy-chat-sr2j-a-smoke", "test:meal-buddy-chat-sr2j-a-mutations", "test:meal-buddy-chat-sr2j-a-concurrency"]) delete packageWithoutSr2b.scripts[key];
  for (const key of ["test:meal-buddy-chat-sr2j-b", "test:meal-buddy-chat-sr2j-b-smoke", "test:meal-buddy-chat-sr2j-b-mutations"]) delete packageWithoutSr2b.scripts[key];
  const sources = new Map(sourcePaths.map((file) => [file, read(file)]));
  const parsed = new Map(sourcePaths.map((file) => [file, parse(file)]));
  const typesSource = parsed.get(`${moduleRoot}/types.ts`);
  const policyRaw = sources.get(`${moduleRoot}/policy.ts`);
  const applyRaw = sources.get(`${moduleRoot}/applySocialExposure.ts`);
  const resolveRaw = sources.get(`${moduleRoot}/resolveEntitlement.ts`);
  const apply = executable(applyRaw);
  const resolver = executable(resolveRaw);
  const allExecutable = [...sources.values()].map(executable).join("\n");
  const directoryFiles = fs.readdirSync(path.join(root, moduleRoot), { withFileTypes: true })
    .filter((entry) => entry.isFile()).map(({ name }) => name).sort();
  const migrationRaw = read(SR2B_SUCCESSOR_MIGRATION);
  const migrationSql = executableSql(migrationRaw).replace(/\s+/g, " ").trim();
  const repositoryMigrations = fs.readdirSync(path.join(root, "supabase/migrations"))
    .filter((file) => file.endsWith(".sql")).sort();
  const filesystemManifest = createSr2bCanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
  const expectedManifestText = SR2B_SUCCESSOR_PATHS.map((file) => `${sha256(file)}  ${file}\n`).join("");
  const sr2bOwnedPaths = SR2B_SUCCESSOR_PATHS.filter((file) => !SR2C_SUCCESSOR_PATHS.includes(file) && !SR2D_SUCCESSOR_PATHS.includes(file) && !SR2E_SUCCESSOR_PATHS.includes(file) && !SR2F_SUCCESSOR_PATHS.includes(file) && !SR2GA_SUCCESSOR_PATHS.includes(file) && !SR2GB_SUCCESSOR_PATHS.includes(file) && !SR2GC_SUCCESSOR_PATHS.includes(file) && !SR2GBR1_SUCCESSOR_PATHS.includes(file) && !SR2GCR1_SUCCESSOR_PATHS.includes(file) && !SR2CR1_SUCCESSOR_PATHS.includes(file) && !SR2GD_SUCCESSOR_PATHS.includes(file) && !SR2GE1_SUCCESSOR_PATHS.includes(file) && !SR2GE2_SUCCESSOR_PATHS.includes(file) && !SR2GF_SUCCESSOR_PATHS.includes(file) && !SR2GG_SUCCESSOR_PATHS.includes(file));

  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2C-R1 authority", effectivePhase !== "invalid", { phase: effectivePhase, head: state.head, originHead: state.originHead, ahead: state.ahead, behind: state.behind });
  check("2. frozen SR-2G-F authority commit retains its exact successor path set", frozenAuthorityAtHead, { authority: SR2GG_BASELINE, expected: SR2GF_SUCCESSOR_PATHS });
  check("2a. frozen SR-2B commit has the exact predecessor parent and immutable manifest", git(["rev-parse", `${SR2C_BASELINE}^`]).trim() === SR2B_BASELINE && exact(deltaEntries(SR2C_BASELINE).map(({ path: file }) => file).sort(), SR2B_SUCCESSOR_PATHS));
  check("2b. SR-2C successor paths are wildcard-free and confined to the pure shared profile module plus exactly one projection migration", SR2C_SUCCESSOR_PATHS.length > 0
    && new Set(SR2C_SUCCESSOR_PATHS).size === SR2C_SUCCESSOR_PATHS.length
    && SR2C_SUCCESSOR_PATHS.every((entry) => !/[*?\[\]{}]/.test(entry))
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/")).every((entry) => entry.startsWith("supabase/functions/_shared/social-profile/") || entry === SR2C_SUCCESSOR_MIGRATION)
    && SR2C_SUCCESSOR_PATHS.filter((entry) => entry.startsWith("supabase/migrations/")).length === 1
    && !SR2C_SUCCESSOR_PATHS.some((entry) => entry.startsWith("apps/") || entry === "supabase/config.toml" || /^supabase\/functions\/[^_]/.test(entry)));
  check("3. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("4. exact module boundary contains only five TypeScript files", exact(directoryFiles, moduleFiles), { expected: moduleFiles, actual: directoryFiles });
  check("5. every exact SR-2B path exists", SR2B_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
  check("6. package exposes three exact canonical SR-2B commands", Object.entries(packageScripts).every(([key, value]) => packageJson.scripts[key] === value));
  check("7. package.json differs from frozen authority only by the three SR-2B scripts", JSON.stringify(packageWithoutSr2b) === JSON.stringify(baselinePackage));
  check("8. predecessor delta is validation-only successor lifecycle support", SR2B_SUCCESSOR_PATHS.filter((file) => file.startsWith("scripts/") && !file.includes("sr2b")).every((file) => file.endsWith("-guard.mjs")));

  check("9. module imports carry no Supabase, transport, environment or executor dependency", !/from\s+["'](npm:|@supabase|https?:)/.test(allExecutable) && !/social-runtime-transport|denoPostgres|executorTransaction|createClient/.test(allExecutable));
  check("10. only the pure policy consumes the frozen SR-2A type and never its runtime", exact(moduleSpecifiers(typesSource), ["../social-ranking/types.ts"]) && exact(moduleSpecifiers(parsed.get(`${moduleRoot}/applySocialExposure.ts`)), ["../social-ranking/types.ts", "./policy.ts", "./types.ts"]) && !/rankSocialCandidates|rankCandidates/.test(allExecutable));
  check("11. the pure exposure policy imports no resolver or row source", !/resolveEntitlement|RowSource|from\(/.test(apply));
  check("12. policy version authority is exactly social-exposure-v1", /SOCIAL_EXPOSURE_POLICY_VERSION = "social-exposure-v1" as const/.test(policyRaw) && /policyVersion: "social-exposure-v1"/.test(read(`${moduleRoot}/types.ts`)));
  check("13. exact free exposure cap is 3", /SOCIAL_EXPOSURE_FREE_CAP = 3 as const/.test(policyRaw));
  check("14. exact premium exposure cap is 10", /SOCIAL_EXPOSURE_PREMIUM_CAP = 10 as const/.test(policyRaw));
  check("15. caps are bound only to the two canonical classes", /free: SOCIAL_EXPOSURE_FREE_CAP/.test(policyRaw) && /premium: SOCIAL_EXPOSURE_PREMIUM_CAP/.test(policyRaw) && (policyRaw.match(/SOCIAL_EXPOSURE_CAPS/g) ?? []).length === 1);
  check("16. plan vocabulary is exactly free and premium", /SOCIAL_EXPOSURE_PLAN_CODES = Object\.freeze\(\["free", "premium"\] as const\)/.test(policyRaw));
  check("17. entitlement status vocabulary is exactly the frozen enum", /SOCIAL_ENTITLEMENT_STATUSES = Object\.freeze\(\[\s*"active",\s*"expired",\s*"cancelled",\s*"grace_period"\s*\] as const\)/.test(policyRaw));
  check("18. only active and grace_period keep a premium plan entitled", /SOCIAL_ENTITLEMENT_PREMIUM_STATUSES = Object\.freeze\(\[\s*"active",\s*"grace_period"\s*\] as const\)/.test(policyRaw));
  check("19. one stable contract error is centralized", /SOCIAL_EXPOSURE_CONTRACT_ERROR = "social_entitlement_contract_violated" as const/.test(policyRaw) && /throw new Error\(SOCIAL_EXPOSURE_CONTRACT_ERROR\)/.test(policyRaw));

  check("20. exposure is prefix only and never a suffix, sample or fill", /\.slice\(0, cap\)/.test(apply) && !/slice\(-|reverse\(|shift\(|pop\(|concat\(/.test(apply));
  check("21. exposure never sorts, reranks or filters the frozen order", !/\.sort\(|\.filter\(|localeCompare|compare/i.test(apply));
  check("22. exposure never reads ranking state, confidence, goal, context, restriction or score", !/rankingState\s*===|confidence|goal|context|restriction|needs_attention|\.score/i.test(apply));
  check("23. truncation is exactly ordered length above the entitlement cap", /truncated: admitted\.length > cap/.test(apply));
  check("24. exposure output is exactly policyVersion, exposed and truncated", exact(propertyNames(typeAlias(typesSource, "SocialExposureResult")), ["exposed", "policyVersion", "truncated"]));
  check("25. exposure output is frozen and exposes no entitlement, cap or billing field", /return Object\.freeze\(\{/.test(apply) && !/class:|cap:|plan_code|planCode|status:|valid_from|valid_until|entitlement:/.test(typeAlias(typesSource, "SocialExposureResult").getText()));
  check("26. no pagination, cursor, page or remaining-count authority exists", !/paginat|cursor|nextPage|hasMore|offset|pageSize|remaining/i.test(allExecutable));

  check("27. the entitlement fact carries only the canonical class", exact(propertyNames(typeAlias(typesSource, "SocialEntitlementFact")), ["class"]) && /SocialEntitlementClass = "free" \| "premium"/.test(read(`${moduleRoot}/types.ts`)));
  check("28. the resolver reads only subscription_entitlements", /from\("subscription_entitlements"\)/.test(resolver) && (resolver.match(/\.from\(/g) ?? []).length === 1);
  check("29. the resolver carries an explicit verified-actor owner predicate", /\.eq\("user_id", actorUserId\)/.test(resolver) && (resolver.match(/\.eq\(/g) ?? []).length === 1);
  check("30. the resolver accepts no arbitrary target, tier, cap or limit parameter", !/targetUserId|otherUserId|subjectUserId|planCode\s*[:=]\s*param|tier|cap\b|\blimit\b/i.test(resolver));
  check("31. the resolver never selects billing provenance or identity columns", /ENTITLEMENT_COLUMNS = "plan_code,status,valid_from,valid_until"/.test(resolver) && !/entitlement_source|source_reference|created_at|updated_at/.test(resolver.replace(/ENTITLEMENT_COLUMNS[^\n]*/, "")));
  check("32. an absent entitlement row is canonical free rather than a failure", /grantsPremium\.some\(Boolean\) \? PREMIUM : FREE/.test(resolver));
  check("32a. the complete visible row set is validated before any premium decision", /const grantsPremium = outcome\.data\.map\(\(row\) => rowGrantsPremium\(row, nowMs\)\);/.test(resolver) && !/outcome\.data\.(some|find|findIndex|filter)\(/.test(resolver) && !/\.slice\(/.test(resolver));
  check("32b. row order cannot change the resolved entitlement", /grantsPremium\.some\(Boolean\)/.test(resolver) && !/grantsPremium\[\d+\]|grantsPremium\.at\(|\.sort\(|\.reverse\(/.test(resolver));
  check("33. a read error fails the request and can never become free or premium", /outcome\.error !== null && outcome\.error !== undefined\) return socialEntitlementContractViolation\(\)/.test(resolver));
  check("34. an unknown plan_code fails closed instead of downgrading", /!PLAN_CODES\.has\(planCode\)\) return socialEntitlementContractViolation\(\)/.test(resolver));
  check("35. an unknown entitlement status fails closed", /!STATUSES\.has\(status\)\) return socialEntitlementContractViolation\(\)/.test(resolver));
  check("36. premium requires an entitled status", /!PREMIUM_STATUSES\.has\(status\)\) return false/.test(resolver));
  check("37. premium requires the canonical instant inside valid_from", /nowMs < validFromMs\) return false/.test(resolver));
  check("38. premium requires the canonical instant inside a non-null valid_until", /validUntilMs !== null && nowMs > validUntilMs\) return false/.test(resolver));
  check("39. a null valid_until is an unbounded window rather than an error", /validUntil === null \|\| validUntil === undefined \? null : instant\(validUntil\)/.test(resolver));
  check("40. the canonical instant is injected once and never read from a clock", /now: Date/.test(resolver) && !/Date\.now|new Date\(\)|performance\.now/.test(allExecutable));
  check("41. no service_role, admin, billing or executor credential path exists", !/service[_-]?role|SERVICE_ROLE|billing_admin|social_runtime_executor|social_pair_read_authority|social_authority/i.test(allExecutable));
  check("42. no environment, network, HTTP or Edge runtime capability exists", !/Deno\.env|process\.env|fetch\s*\(|new Request|new Response|serve\s*\(|http:/i.test(allExecutable));
  check("43. no persistence, cache or write capability exists", !/insert\s*\(|update\s*\(|upsert\s*\(|delete\s*\(|writeFile|Deno\.write|localStorage|\bcache\b/i.test(allExecutable));
  check("44. no entitlement or candidate payload logging exists", !/console\.|logger\.|\blog\s*\(/i.test(allExecutable));
  check("45. no randomness can affect exposure", !/Math\.random|crypto\.randomUUID|randomBytes/.test(allExecutable));

  check("46. exactly one SR-2B migration is added and it is the only candidate migration", exact(SR2B_SUCCESSOR_PATHS.filter((file) => file.startsWith("supabase/migrations/")), [SR2B_SUCCESSOR_MIGRATION]));
  const nonSuccessorMigrations = repositoryMigrations.filter((file) => !SR2C_SUCCESSOR_PATHS.includes(`supabase/migrations/${file}`) && !SR2GA_SUCCESSOR_PATHS.includes(`supabase/migrations/${file}`) && !SR2GB_SUCCESSOR_PATHS.includes(`supabase/migrations/${file}`) && !SR2GC_SUCCESSOR_PATHS.includes(`supabase/migrations/${file}`) && !SR2GBR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${file}`) && !SR2GCR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${file}`) && !SR2CR1_SUCCESSOR_PATHS.includes(`supabase/migrations/${file}`) && !SR2GD_SUCCESSOR_PATHS.includes(`supabase/migrations/${file}`) && !SR2GF_SUCCESSOR_PATHS.includes(`supabase/migrations/${file}`) && !SR2GG_SUCCESSOR_PATHS.includes(`supabase/migrations/${file}`) && !SR2IA_SUCCESSOR_PATHS.includes(`supabase/migrations/${file}`) && file !== "20260823020000_meal_buddy_chat_authority.sql");
  check("47. the SR-2B migration is the newest repository migration outside an enumerated successor", nonSuccessorMigrations.filter((file) => file !== path.basename(SR2HB_MIGRATION)).at(-1) === path.basename(SR2B_SUCCESSOR_MIGRATION));
  check("48. the migration executes exactly one grant statement", migrationSql === "grant select on table public.subscription_entitlements to authenticated;");
  check("49. the migration grants SELECT only to authenticated", /grant select on table public\.subscription_entitlements to authenticated;/.test(migrationSql) && !/\bto\s+(anon|public|service_role|social_runtime_executor|social_pair_read_authority|social_authority)\b/i.test(migrationSql));
  check("50. the migration grants no write, truncate, reference, trigger or execute privilege", !/\b(insert|update|delete|truncate|references|trigger|execute|all privileges|grant all)\b/i.test(migrationSql));
  check("51. the migration creates or alters no policy, table, schema, function, index or role", !/\b(create|alter|drop|revoke)\b/i.test(migrationSql));
  check("52. the migration adds no security definer or arbitrary-target entitlement primitive", !/security definer|returns|language sql|language plpgsql/i.test(migrationSql));
  const policyMigration = "supabase/migrations/20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql";
  check("53. the frozen owner-read policy migration is byte-unchanged", blobSha256(policyMigration, SR2B_BASELINE) === frozenFiles.get(policyMigration) && /create policy subscription_entitlements_owner_read on subscription_entitlements for select using \(auth\.uid\(\) = user_id\);/.test(blobText(policyMigration, SR2B_BASELINE)));

  check("54. no apps or Mobile path is part of the candidate", !SR2B_SUCCESSOR_PATHS.some((file) => file.startsWith("apps/")));
  check("55. no config.toml path is added or modified", !SR2B_SUCCESSOR_PATHS.includes("supabase/config.toml"));
  check("56. no Edge function, HTTP endpoint or public DTO path is introduced", !SR2B_SUCCESSOR_PATHS.some((file) => /^supabase\/functions\/[^_]/.test(file) || /dto/i.test(file)));
  check("57. the Supabase delta is only the pure shared module plus the one grant migration", SR2B_SUCCESSOR_PATHS.filter((file) => file.startsWith("supabase/")).every((file) => file.startsWith(`${moduleRoot}/`) || file === SR2B_SUCCESSOR_MIGRATION));
  check("58. all frozen SR-2A runtime and predecessor migration blobs retain exact SHA-256 at the baseline", [...frozenFiles].every(([file, hash]) => fs.existsSync(path.join(root, file)) && blobSha256(file, SR2B_BASELINE) === hash));
  check("59. no frozen SR-2A runtime or migration path has a worktree delta", [...frozenFiles.keys()].filter((file) => !SR2D_SUCCESSOR_PATHS.includes(file) && !SR2E_SUCCESSOR_PATHS.includes(file) && !SR2F_SUCCESSOR_PATHS.includes(file) && !SR2GA_SUCCESSOR_PATHS.includes(file) && !SR2GB_SUCCESSOR_PATHS.includes(file) && !SR2GC_SUCCESSOR_PATHS.includes(file) && !SR2GBR1_SUCCESSOR_PATHS.includes(file) && !SR2GCR1_SUCCESSOR_PATHS.includes(file) && !SR2CR1_SUCCESSOR_PATHS.includes(file) && !SR2GD_SUCCESSOR_PATHS.includes(file) && !SR2GE1_SUCCESSOR_PATHS.includes(file) && !SR2GE2_SUCCESSOR_PATHS.includes(file) && !SR2GF_SUCCESSOR_PATHS.includes(file)).every((file) => git(["diff", "--name-only", SR2B_BASELINE, "--", file]).trim() === ""));
  check("60. frozen SR-2A authority commit remains the exact baseline", git(["cat-file", "-t", SR2B_BASELINE]).trim() === "commit" && git(["show", "-s", "--format=%H", SR2B_BASELINE]).trim() === SR2B_BASELINE);
  const secretPattern = new RegExp(`(?:${["sb", "secret"].join("_")}_[A-Za-z0-9._-]{20,}|${["service", "role", "key"].join("_")}\\s*[=:]\\s*["'][A-Za-z0-9._-]{20,}|eyJ[A-Za-z0-9_-]{30,}\\.)`);
  check("61. candidate files contain no credential-shaped secret", !secretPattern.test(SR2B_SUCCESSOR_PATHS.map((file) => read(file)).join("\n")));
  const guardAst = parse("scripts/social-exposure-sr2b-guard.mjs");
  let literalPass = false;
  let skipCall = false;
  const inspectGuard = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText(guardAst) === "check" && node.arguments[1]?.kind === ts.SyntaxKind.TrueKeyword) literalPass = true;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "skip") skipCall = true;
    ts.forEachChild(node, inspectGuard);
  };
  inspectGuard(guardAst);
  check("62. guard contains no literal-true pass or skip call", !literalPass && !skipCall);
  check("63. canonical manifest is sorted raw-byte SHA-256 serialized as lowercase hash, two spaces, POSIX path and LF", filesystemManifest.text === expectedManifestText && filesystemManifest.paths.every((file, index, files) => index === 0 || files[index - 1] < file) && filesystemManifest.entries.every(({ path: file, sha256: hash }) => /^[0-9a-f]{64}$/.test(hash) && !file.includes("\\")) && filesystemManifest.text.endsWith("\n") && !filesystemManifest.text.includes("\r") && !filesystemManifest.text.includes("\0"));
  check("64. canonical aggregate is SHA-256 over the exact UTF-8 manifest bytes", filesystemManifest.aggregateSha256 === crypto.createHash("sha256").update(Buffer.from(expectedManifestText, "utf8")).digest("hex"));
  check("65. every SR-2B-owned path is byte-identical between its freeze commit and the worktree", sr2bOwnedPaths.length > 0 && sr2bOwnedPaths.every((file) => gitBytes(["show", `${SR2C_BASELINE}:${file}`]).equals(fs.readFileSync(path.join(root, file)))), { owned: sr2bOwnedPaths });

  console.log(JSON.stringify({
    suite: "social-exposure-sr2b-guard",
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
    suite: "social-exposure-sr2b-guard",
    status: "crashed",
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
}
