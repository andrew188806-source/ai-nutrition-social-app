#!/usr/bin/env node
// SR-2F local guard. Read-only and local: no network, database, credentials or deployment.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import {
  createSr2fCanonicalManifest,
  SR2F_BASELINE,
  SR2F_COMPOSITION,
  SR2F_FORBIDDEN_COMPOSITION_MARKERS,
  SR2F_FORBIDDEN_CONTEXT_EXPORTS,
  SR2F_FROZEN_FEATURE_PATHS,
  SR2F_RUNTIME_BINDING,
  SR2F_SUCCESSOR_MIGRATION,
  SR2F_SUCCESSOR_PATHS
} from "./social-candidate-sr2f-successor-manifest.mjs";
// Lifecycle classification always belongs to the newest round: SR-2F's own byte assertions stay
// anchored to SR2F_BASELINE, while "which commit are we sitting on" is now SR-2G-A's question.
import { SR2GA_SUCCESSOR_PATHS } from "./social-candidate-sr2g-a-successor-manifest.mjs";
import { SR2GB_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-successor-manifest.mjs";
import {
  SR2GC_SUCCESSOR_PATHS
} from "./social-candidate-sr2g-c-successor-manifest.mjs";
import { SR2GBR1_BASELINE, SR2GBR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-b-r1-successor-manifest.mjs";
import { SR2GCR1_BASELINE, SR2GCR1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-c-r1-successor-manifest.mjs";
import { SR2CR1_BASELINE, SR2CR1_SUCCESSOR_PATHS } from "./social-interest-sr2c-r1-successor-manifest.mjs";
import { SR2GD_BASELINE, SR2GD_SUCCESSOR_PATHS } from "./social-candidate-sr2g-d-successor-manifest.mjs";
import { classifySr2ge1Lifecycle, SR2GE1_TOOLING_COMMIT, SR2GE1_SUCCESSOR_PATHS } from "./social-candidate-sr2g-e1-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const BIND_FN = "bindSocialCandidateRuntimeDependencies";
const CLIENT_TYPE = "SupabaseSocialCandidateClientLike";
const PROVIDER = "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx";
const LIVE_BRANCH_CONDITION = 'capabilityFlags.authSource === "supabase-live"';

// The exact additive shape SR-2F is allowed to have: 16 inserted lines, nothing deleted, of which
// exactly these six are executable. Pinning both totals is what makes "additive" mean additive.
const EXPECTED_ADDED_LINES = 16;
const EXPECTED_DELETED_LINES = 0;
const EXPECTED_EXECUTABLE_ADDITIONS = Object.freeze([
  `import { ${BIND_FN} } from "../social-candidates/runtimeBinding";`,
  `import type { ${CLIENT_TYPE} } from "../social-candidates/supabaseSocialCandidateContracts";`,
  `${BIND_FN}({`,
  "authPort,",
  `candidateClient: client as unknown as ${CLIENT_TYPE}`,
  "});"
].sort());

const packageScripts = Object.freeze({
  "test:social-candidate-sr2f": "node scripts/social-candidate-sr2f-guard.mjs",
  "test:social-candidate-sr2f-smoke": "node scripts/social-candidate-sr2f-smoke.mjs",
  "test:social-candidate-sr2f-mutations": "node scripts/social-candidate-sr2f-mutations.mjs",
  "test:social-candidate-sr2f-development-composition-smoke": "node scripts/social-candidate-sr2f-development-composition-smoke.mjs"
});

// Values that must never reach the client surface, inherited from frozen SR-2A/SR-2B/SR-2C.
const forbiddenClientValues = [
  "userId", "user_id", "candidateUserId", "profileId", "profile_id", "exposureIndex", "exposure_ordinal",
  "rankingState", "similarityScore", "matchPercent", "compatibilityLabel", "matchReasons"
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
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout;
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const blobSha256 = (file, ref) => crypto.createHash("sha256").update(gitBytes(["cat-file", "blob", `${ref}:${file}`])).digest("hex");
const lines = (value) => value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean).sort();
const exact = (left, right) => left.length === right.length && left.every((entry, index) => entry === right[index]);
const executable = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
const count = (haystack, needle) => haystack.split(needle).length - 1;

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
    headParent: head === SR2GE1_TOOLING_COMMIT ? null : git(["rev-parse", "HEAD^"]).trim(),
    worktreePaths: statusPaths(),
    stagedPaths: lines(git(["diff", "--cached", "--name-only"])),
    headDeltaEntries: head === SR2GE1_TOOLING_COMMIT ? [] : deltaEntries()
  });
}
// Works identically in candidate and frozen phases: when frozen the worktree equals HEAD.
function numstatAgainstBaseline(file) {
  const row = git(["diff", "--numstat", SR2F_BASELINE, "--", file]).trim();
  if (!row) return { added: 0, deleted: 0 };
  const [added, deleted] = row.split(/\s+/).map(Number);
  return { added, deleted };
}
function changedPathsAgainstBaseline() {
  // "What SR-2F changed" must exclude what a LATER round changed, or every assertion built on this
  // set starts failing the moment a successor is committed. The exclusion is the enumerated SR-2G-A
  // manifest only — no prefix, no glob.
  return lines(git(["diff", "--name-only", SR2F_BASELINE]))
    .map((entry) => entry.replaceAll("\\", "/"))
    .filter((entry) => !SR2GA_SUCCESSOR_PATHS.includes(entry) && !SR2GB_SUCCESSOR_PATHS.includes(entry) && !SR2GC_SUCCESSOR_PATHS.includes(entry) && !SR2GBR1_SUCCESSOR_PATHS.includes(entry) && !SR2GCR1_SUCCESSOR_PATHS.includes(entry) && !SR2CR1_SUCCESSOR_PATHS.includes(entry) && !SR2GD_SUCCESSOR_PATHS.includes(entry) && !SR2GE1_SUCCESSOR_PATHS.includes(entry))
    .sort();
}
function addedLinesAgainstBaseline(file) {
  return git(["diff", "--unified=0", SR2F_BASELINE, "--", file])
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

const parse = (file) => ts.createSourceFile(file, read(file), ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
function collect(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  // forEachChild aborts as soon as its callback returns a truthy value, so the recursion must
  // deliberately return undefined or only the first child of every node would ever be visited.
  node.forEachChild((child) => { collect(child, predicate, found); });
  return found;
}
function ancestors(node) {
  const chain = [];
  for (let current = node.parent; current; current = current.parent) chain.push(current);
  return chain;
}
function enclosingFunctionName(node) {
  for (const parent of ancestors(node)) {
    if (ts.isFunctionDeclaration(parent) && parent.name) return parent.name.text;
  }
  return null;
}

try {
  const state = lifecycleState();
  const lifecycle = classifySr2ge1Lifecycle(state);
  const packageJson = JSON.parse(read("package.json"));
  const baselinePackage = JSON.parse(git(["show", `${SR2F_BASELINE}:package.json`]));
  const packageWithoutSr2f = structuredClone(packageJson);
  const successorScriptKeys = ["test:social-candidate-sr2g-a", "test:social-candidate-sr2g-a-smoke", "test:social-candidate-sr2g-a-mutations", "test:social-candidate-sr2g-a-development-acceptance", "test:social-candidate-sr2g-b", "test:social-candidate-sr2g-b-smoke", "test:social-candidate-sr2g-b-mutations", "test:social-candidate-sr2g-b-development-acceptance", "test:social-candidate-sr2g-c", "test:social-candidate-sr2g-c-smoke", "test:social-candidate-sr2g-c-mutations", "test:social-candidate-sr2g-c-development-acceptance", "test:social-candidate-sr2g-b-r1", "test:social-candidate-sr2g-b-r1-smoke", "test:social-candidate-sr2g-b-r1-mutations", "test:social-candidate-sr2g-b-r1-development-acceptance", "test:social-candidate-sr2g-c-r1", "test:social-candidate-sr2g-c-r1-smoke", "test:social-candidate-sr2g-c-r1-mutations", "test:social-candidate-sr2g-c-r1-development-acceptance", "test:social-interest-sr2c-r1", "test:social-interest-sr2c-r1-smoke", "test:social-interest-sr2c-r1-mutations", "test:social-interest-sr2c-r1-development-acceptance", "test:social-candidate-sr2g-d", "test:social-candidate-sr2g-d-smoke", "test:social-candidate-sr2g-d-mutations", "test:social-candidate-sr2g-d-development-acceptance", "test:social-candidate-sr2g-e1", "test:social-candidate-sr2g-e1-smoke", "test:social-candidate-sr2g-e1-mutations", "test:social-candidate-sr2g-e1-development-acceptance"];
  for (const key of [...Object.keys(packageScripts), ...successorScriptKeys]) delete packageWithoutSr2f.scripts[key];

  const compositionRaw = read(SR2F_COMPOSITION);
  const composition = executable(compositionRaw);
  const source = parse(SR2F_COMPOSITION);
  const providerRaw = read(PROVIDER);

  const numstat = numstatAgainstBaseline(SR2F_COMPOSITION);
  const changedPaths = changedPathsAgainstBaseline();
  const addedLines = addedLinesAgainstBaseline(SR2F_COMPOSITION);
  const addedExecutable = addedLines.map((line) => line.trim()).filter((line) => line && !line.startsWith("//")).sort();

  // --- the binding call, located structurally rather than by text ------------------------------
  const bindCalls = collect(source, (node) =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === BIND_FN);
  const bindCall = bindCalls[0] ?? null;
  const bindArg = bindCall && bindCall.arguments.length === 1 && ts.isObjectLiteralExpression(bindCall.arguments[0])
    ? bindCall.arguments[0] : null;
  const bindKeys = bindArg
    ? bindArg.properties.map((property) => property.name?.getText(source) ?? "").sort()
    : [];
  const authPortProperty = bindArg?.properties.find((property) => property.name?.getText(source) === "authPort") ?? null;
  const clientProperty = bindArg?.properties.find((property) => property.name?.getText(source) === "candidateClient") ?? null;

  // `authPort` must be passed as the bare identifier already in scope — a shorthand property is the
  // only form that cannot smuggle in a freshly constructed adapter.
  const authPortIsShorthand = Boolean(authPortProperty) && ts.isShorthandPropertyAssignment(authPortProperty);
  // `candidateClient` must be the bare `client` identifier under type assertions only.
  let clientInnerIdentifier = null;
  if (clientProperty && ts.isPropertyAssignment(clientProperty)) {
    let expression = clientProperty.initializer;
    while (ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)) expression = expression.expression;
    if (ts.isIdentifier(expression)) clientInnerIdentifier = expression.text;
  }

  const enclosingIf = bindCall
    ? ancestors(bindCall).find((node) => ts.isIfStatement(node) && node.expression.getText(source).includes(LIVE_BRANCH_CONDITION)) ?? null
    : null;
  const liveBranchBlock = enclosingIf && ts.isBlock(enclosingIf.thenStatement) ? enclosingIf.thenStatement : null;
  const branchStatements = liveBranchBlock ? [...liveBranchBlock.statements] : [];
  const guardIndex = branchStatements.findIndex((statement) =>
    ts.isIfStatement(statement) && statement.expression.getText(source) === "!runtimeParts");
  const bindIndex = branchStatements.findIndex((statement) =>
    ts.isExpressionStatement(statement) && statement.expression === bindCall);
  const returnIndex = branchStatements.findIndex((statement) => ts.isReturnStatement(statement));

  const filesystemManifest = createSr2fCanonicalManifest((file) => fs.readFileSync(path.join(root, file)));
  const expectedManifestText = SR2F_SUCCESSOR_PATHS.map((file) => `${sha256(file)}  ${file}\n`).join("");
  const frozenIndexManifest = lifecycle.frozenShape ? createSr2fCanonicalManifest((file) => gitBytes(["show", `:${file}`])) : null;
  const frozenTreeManifest = lifecycle.frozenShape ? createSr2fCanonicalManifest((file) => gitBytes(["cat-file", "blob", `${state.head}:${file}`])) : null;

  // --- baseline / lifecycle -------------------------------------------------------------------
  check("1. lifecycle is exactly candidate, frozen-unpushed or frozen-pushed from SR-2C-R1 authority", lifecycle.valid, { phase: lifecycle.phase, head: state.head, originHead: state.originHead, ahead: state.ahead, behind: state.behind });
  check("2. lifecycle manifest is the exact SR-2G-E1 path set", exact(lifecycle.lifecycleManifest, SR2GE1_SUCCESSOR_PATHS), { expected: SR2GE1_SUCCESSOR_PATHS, actual: lifecycle.lifecycleManifest });
  check("3. the SR-2F baseline is the frozen SR-2E freeze commit", git(["cat-file", "-t", SR2F_BASELINE]).trim() === "commit" && git(["log", "-1", "--format=%s", SR2F_BASELINE]).trim() === "Complete SR-2E real Social candidate mobile integration");
  check("4. candidate and frozen lifecycle prohibit staged bytes", state.stagedPaths.length === 0, { staged: state.stagedPaths });
  check("5. every exact SR-2F path exists", SR2F_SUCCESSOR_PATHS.every((file) => fs.existsSync(path.join(root, file))));
  check("6. candidate paths are wildcard-free and unique", new Set(SR2F_SUCCESSOR_PATHS).size === SR2F_SUCCESSOR_PATHS.length && SR2F_SUCCESSOR_PATHS.every((entry) => !/[*?[\]{}]/.test(entry)));
  check("7. package exposes the exact canonical SR-2F commands", Object.entries(packageScripts).every(([key, value]) => packageJson.scripts[key] === value));
  check("8. package.json differs from frozen authority only by the SR-2F scripts", JSON.stringify(packageWithoutSr2f) === JSON.stringify(baselinePackage));
  check("9. predecessor delta is validation-only successor lifecycle support", SR2F_SUCCESSOR_PATHS.filter((file) => file.startsWith("scripts/") && !file.includes("sr2f")).every((file) => file.endsWith("-guard.mjs")));
  // Lockfiles are matched by exact filename: a bare /lock/ substring also matches "social-block".
  const lockfile = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|npm-shrinkwrap\.json)$/;
  check("10. no dependency, devDependency or lockfile is touched", JSON.stringify(packageJson.dependencies) === JSON.stringify(baselinePackage.dependencies) && JSON.stringify(packageJson.devDependencies) === JSON.stringify(baselinePackage.devDependencies) && !changedPaths.some((file) => lockfile.test(file)), { lockfiles: changedPaths.filter((file) => lockfile.test(file)) });

  // --- backend and frozen-surface immutability -------------------------------------------------
  check("11. SR-2F adds no migration", SR2F_SUCCESSOR_MIGRATION === null && !SR2F_SUCCESSOR_PATHS.some((file) => file.startsWith("supabase/migrations/")));
  check("12. SR-2F changes no backend path at all", !SR2F_SUCCESSOR_PATHS.some((file) => file.startsWith("supabase/")) && !changedPaths.some((file) => file.startsWith("supabase/")), { backend: changedPaths.filter((file) => file.startsWith("supabase/")) });
  check("13. every frozen SR-2E feature file is byte-identical to the SR-2E freeze commit", SR2F_FROZEN_FEATURE_PATHS.every((file) => sha256(file) === blobSha256(file, SR2F_BASELINE)), { drifted: SR2F_FROZEN_FEATURE_PATHS.filter((file) => sha256(file) !== blobSha256(file, SR2F_BASELINE)) });
  check("14. the SR-2E runtime binding seam itself is unmodified", sha256(SR2F_RUNTIME_BINDING) === blobSha256(SR2F_RUNTIME_BINDING, SR2F_BASELINE));
  check("15. the consumer runtime provider is unmodified", sha256(PROVIDER) === blobSha256(PROVIDER, SR2F_BASELINE));
  check("16. exactly one application file differs from the frozen baseline", exact(changedPaths.filter((file) => !file.startsWith("scripts/") && file !== "package.json"), [SR2F_COMPOSITION]), { changedPaths });
  check("17. no Meal Buddy or Nearby demo path is modified", !changedPaths.some((file) => /meal-buddy|meal-buddies|community-profile|app\/social\.tsx/.test(file)));

  // --- the additive delta ----------------------------------------------------------------------
  check(`18. the composition delta inserts exactly ${EXPECTED_ADDED_LINES} lines and deletes none`, numstat.added === EXPECTED_ADDED_LINES && numstat.deleted === EXPECTED_DELETED_LINES, { numstat });
  check("19. the composition delta is purely additive — no baseline line is rewritten", numstat.deleted === 0);
  check("20. the executable additions are exactly the two imports and the four-line bind call", exact(addedExecutable, EXPECTED_EXECUTABLE_ADDITIONS), { expected: EXPECTED_EXECUTABLE_ADDITIONS, actual: addedExecutable });
  check("21. no forbidden transport construction marker appears in executable composition code", !SR2F_FORBIDDEN_COMPOSITION_MARKERS.some((marker) => composition.includes(marker)), { present: SR2F_FORBIDDEN_COMPOSITION_MARKERS.filter((marker) => composition.includes(marker)) });

  // --- one client, one auth port ---------------------------------------------------------------
  check("22. exactly one Supabase client factory is constructed in the whole file", count(composition, "new SupabaseConsumerClientFactory(") === 1);
  check("23. exactly one client is obtained from that factory", count(composition, "getOrCreateClient()") === 1);
  check("24. exactly one consumer auth adapter is constructed in the whole file", count(composition, "new SupabaseConsumerAuthAdapter(") === 1);
  check("25. no Social-specific client factory, loader or auth adapter exists", !/Social\w*(ClientFactory|SdkLoader|AuthAdapter)/.test(composition));
  check("26. the Social binding is imported from the frozen SR-2E seam", /import \{ bindSocialCandidateRuntimeDependencies \} from "\.\.\/social-candidates\/runtimeBinding";/.test(compositionRaw));
  check("27. the Social client type is imported as a type-only import from the frozen contracts", /import type \{ SupabaseSocialCandidateClientLike \} from "\.\.\/social-candidates\/supabaseSocialCandidateContracts";/.test(compositionRaw));
  check("28. no Social repository, service or factory is constructed in the composition", !/(SocialCandidateService|SocialCandidateRepository|createSocialCandidate)/.test(composition));

  // --- binding placement -----------------------------------------------------------------------
  check("29. the binding call appears exactly once", bindCalls.length === 1, { occurrences: bindCalls.length });
  check("30. the binding call sits inside createConsumerRuntimeComposition", bindCall !== null && enclosingFunctionName(bindCall) === "createConsumerRuntimeComposition", { enclosing: bindCall ? enclosingFunctionName(bindCall) : null });
  check("31. the binding call sits inside the supabase-live branch", enclosingIf !== null);
  check("32. the binding call runs only after the runtime parts guard succeeds", guardIndex >= 0 && bindIndex > guardIndex, { guardIndex, bindIndex });
  check("33. the binding call runs before the live branch returns", returnIndex >= 0 && bindIndex < returnIndex, { bindIndex, returnIndex });
  check("34. the binding is not performed at module scope", bindCall !== null && ancestors(bindCall).some((node) => ts.isFunctionDeclaration(node)));
  check("35. the binding is not performed inside a sign-in, sign-out or auth-state callback", bindCall !== null && !ancestors(bindCall).some((node) => (ts.isMethodDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))));
  check("36. the mock and disabled branches perform no Social binding", bindCalls.length === 1 && enclosingIf !== null);

  // --- binding payload -------------------------------------------------------------------------
  check("37. the binding receives a single object literal argument", bindArg !== null);
  check("38. the binding object has exactly the keys authPort and candidateClient", exact(bindKeys, ["authPort", "candidateClient"]), { bindKeys });
  check("39. authPort is passed as the canonical in-scope identifier, not a new construction", authPortIsShorthand);
  check("40. candidateClient is the canonical singleton `client` under type assertion only", clientInnerIdentifier === "client", { clientInnerIdentifier });
  check("41. the bound client is the same identifier the meal runtime receives", /mealClient: client as unknown as SupabaseConsumerMealClientLike/.test(composition) && clientInnerIdentifier === "client");
  check("42. the bound authPort is the same one the returned controller receives", /controller: new ConsumerAuthProfileRuntime\(\{ authPort,/.test(composition) && authPortIsShorthand);
  check("43. no actor identifier is passed to the Social binding", !/(userId|user_id|actorId|actor_id|profileId)/.test(bindArg ? bindArg.getText(source) : ""));

  // --- public surface containment ---------------------------------------------------------------
  const returnedLiveObject = returnIndex >= 0 ? branchStatements[returnIndex].getText(source) : "";
  check("44. the live branch return value gains no new key", !SR2F_FORBIDDEN_CONTEXT_EXPORTS.some((key) => new RegExp(`\\b${key}\\s*:`).test(returnedLiveObject.replace(/controller: new ConsumerAuthProfileRuntime\(\{[^}]*\}\)/, ""))), { returnedLiveObject });
  check("45. the composition exports no new symbol", exact(lines(git(["diff", SR2F_BASELINE, "--", SR2F_COMPOSITION])).filter((line) => /^\+export /.test(line)), []));
  check("46. no forbidden client value is introduced by the delta", !forbiddenClientValues.some((value) => addedExecutable.join("\n").includes(value)));
  check("47. the Social feature flag remains the sole authority over the active repository", !/social/i.test(composition.replace(/bindSocialCandidateRuntimeDependencies\([\s\S]*?\}\);/, "").replace(/import[^\n]*social-candidates[^\n]*\n/g, "")), { residue: composition.replace(/bindSocialCandidateRuntimeDependencies\([\s\S]*?\}\);/, "").replace(/import[^\n]*social-candidates[^\n]*\n/g, "").match(/[^\n]*social[^\n]*/gi) });

  // --- no reset machinery, because the navigation gate already unmounts -------------------------
  check("48. SR-2F adds no unbind or clear call", !composition.includes("clearSocialCandidateRuntimeDependencies"));
  check("49. the navigation gate still withholds children while signed out", /signedOutLike/.test(providerRaw) && /RuntimeLoadingBoundary/.test(providerRaw));
  check("50. the gate returns the loading boundary rather than children when signed out", /\(signedOutLike && !onLoginRoute\)[\s\S]{0,160}return <RuntimeLoadingBoundary \/>;[\s\S]{0,40}\}\s*return <>\{children\}<\/>;/.test(providerRaw));

  // --- secrets -----------------------------------------------------------------------------------
  // Value shapes only. Names such as "service_role" appear legitimately throughout the validation
  // harnesses, which assert that role is never granted anything; matching the name would flag them.
  const secretPattern = /(postgres(ql)?:\/\/[^\s"']*:[^\s"']*@|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|sb_secret_[A-Za-z0-9_-]{10,})/;
  check("51. candidate files contain no credential-shaped secret", !SR2F_SUCCESSOR_PATHS.map((file) => read(file)).some((text) => secretPattern.test(text)), { offenders: SR2F_SUCCESSOR_PATHS.filter((file) => secretPattern.test(read(file))) });
  check("52. no environment file is part of the candidate", !SR2F_SUCCESSOR_PATHS.some((file) => /(^|\/)\.env/.test(file)));
  check("53. no environment file is untracked-but-staged into the delta", !changedPaths.some((file) => /(^|\/)\.env/.test(file)));

  // --- manifest integrity ------------------------------------------------------------------------
  check("54. filesystem manifest text is canonical", filesystemManifest.text === expectedManifestText);
  check("55. manifest aggregate is a 64-character lowercase hex digest", /^[0-9a-f]{64}$/.test(filesystemManifest.aggregateSha256));
  check("56. manifest entry count equals the declared path count", filesystemManifest.entries.length === SR2F_SUCCESSOR_PATHS.length);
  // This asserts SR-2F's OWN manifest is sorted and POSIX. It is not a successor allowance, so the
  // SR-2G-A set must not appear here.
  check("57. manifest paths are POSIX and sorted", exact(filesystemManifest.paths, [...SR2F_SUCCESSOR_PATHS].sort()) && filesystemManifest.paths.every((file) => !file.includes("\\")));
  check("58. frozen index bytes equal filesystem bytes", !lifecycle.frozenShape || frozenIndexManifest.aggregateSha256 === filesystemManifest.aggregateSha256, { frozen: lifecycle.frozenShape });
  check("59. frozen tree bytes equal filesystem bytes", !lifecycle.frozenShape || frozenTreeManifest.aggregateSha256 === filesystemManifest.aggregateSha256, { frozen: lifecycle.frozenShape });
  check("60. no candidate file carries a CRLF byte pair", SR2F_SUCCESSOR_PATHS.every((file) => !fs.readFileSync(path.join(root, file)).includes(Buffer.from("\r\n"))), { crlf: SR2F_SUCCESSOR_PATHS.filter((file) => fs.readFileSync(path.join(root, file)).includes(Buffer.from("\r\n"))) });

  const summary = Object.freeze({
    round: "SR-2F",
    baseline: SR2F_BASELINE,
    phase: lifecycle.phase,
    paths: SR2F_SUCCESSOR_PATHS.length,
    aggregateSha256: filesystemManifest.aggregateSha256,
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ round: "SR-2F", error: error.message }, null, 2));
  process.exit(1);
}
