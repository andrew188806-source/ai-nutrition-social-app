#!/usr/bin/env node
// SR-2A meaningful mutation contract. Mutants execute in memory; repository bytes are never changed.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  createSr2aCanonicalManifest,
  classifySr2aLifecycle,
  SR2A_BASELINE,
  SR2A_SUCCESSOR_PATHS
} from "./social-ranking-sr2a-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const files = Object.freeze({
  rank: "supabase/functions/_shared/social-ranking/rankCandidates.ts",
  policy: "supabase/functions/_shared/social-ranking/policy.ts",
  types: "supabase/functions/_shared/social-ranking/types.ts",
  index: "supabase/functions/_shared/social-ranking/index.ts",
  lifecycle: "scripts/social-ranking-sr2a-successor-manifest.mjs"
});
const canonical = new Map(Object.values(files).map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));

function loadRanking(overrides = new Map()) {
  const cache = new Map();
  const resolveTsFile = (candidate) => [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]
    .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
  const load = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    const source = overrides.get(relative) ?? canonical.get(relative) ?? fs.readFileSync(absolute, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: absolute
    });
    const module = { exports: {} };
    cache.set(absolute, module);
    const localRequire = (specifier) => {
      if (!specifier.startsWith(".")) return require_(specifier);
      const resolved = resolveTsFile(path.resolve(path.dirname(absolute), specifier));
      if (!resolved) throw new Error(`unresolved ranking import: ${specifier}`);
      return load(resolved);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  };
  return load(path.join(root, files.index));
}

const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const versions = { sharedAdapterPolicyVersion: "shared-taste-adapter-v1" };
const scored = (score, extra = {}) => ({
  versions,
  status: "adapted",
  taste: {
    similarity: { status: "scored", score },
    evidenceConfidence: { status: "available", value: 0.5 }
  },
  context: { weight: 0.5 },
  goal: { status: "scored", score: 0.5 },
  restriction: { verdict: "eligible" },
  signals: { availableFamilies: [], incompleteFamilies: [] },
  reasons: { comparison: [], evidence: [] },
  ...extra
});
const notScored = () => ({
  ...scored(0.5),
  taste: { similarity: { status: "not_scored", reason: "no_comparable_evidence" } }
});
const unsupported = () => ({ versions, status: "unsupported", reason: "unsupported_snapshot_schema" });
const candidate = (candidateUserId, result) => ({ candidateUserId, result });
const ids = (result) => result.ordered.map(({ candidateUserId }) => candidateUserId);
const states = (result) => result.ordered.map(({ rankingState }) => rankingState);
const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const rejects = (operation) => {
  try { operation(); return false; } catch (error) { return error instanceof Error && error.message === "social_ranking_contract_violated"; }
};

function rankingContract(module, source) {
  const { rankSocialCandidates } = module;
  const confidenceFirst = scored(0.5, { taste: { similarity: { status: "scored", score: 0.5 }, evidenceConfidence: { status: "available", value: 1 } } });
  const confidenceSecond = scored(0.5, { taste: { similarity: { status: "scored", score: 0.5 }, evidenceConfidence: { status: "available", value: 0 } } });
  const goalContextFirst = scored(0.5, { goal: { status: "scored", score: 1 }, context: { weight: 1 } });
  const goalContextSecond = scored(0.5, { goal: { status: "scored", score: 0 }, context: { weight: 0 } });
  const restrictionFirst = scored(0.5, { restriction: { verdict: "eligible" } });
  const restrictionSecond = scored(0.5, { restriction: { verdict: "needs_attention" } });
  const sample = [candidate(id(3), scored(0.9)), candidate(id(1), notScored()), candidate(id(2), unsupported())];
  return [
    exact(ids(rankSocialCandidates([candidate(id(1), scored(0.1)), candidate(id(2), scored(0.9))])), [id(2), id(1)]),
    exact(states(rankSocialCandidates(sample)), ["scored", "not_scored", "unsupported"]),
    exact(ids(rankSocialCandidates([candidate(id(9), scored(0.5)), candidate(id(4), scored(0.5))])), [id(4), id(9)]),
    exact(ids(rankSocialCandidates([candidate(id(9), notScored()), candidate(id(4), notScored())])), [id(4), id(9)]),
    exact(ids(rankSocialCandidates([candidate(id(9), unsupported()), candidate(id(4), unsupported())])), [id(4), id(9)]),
    rankSocialCandidates([candidate(id(1), notScored())]).ordered.length === 1,
    rankSocialCandidates([candidate(id(1), unsupported())]).ordered.length === 1,
    rejects(() => rankSocialCandidates([candidate(id(1), scored(0.1)), candidate(id(1), scored(0.2))])),
    rejects(() => rankSocialCandidates([candidate(id(1), { versions, status: "invalid" })])),
    rejects(() => rankSocialCandidates([candidate(id(1), { ...notScored(), taste: { similarity: { status: "not_scored", reason: "unknown_reason" } } })])),
    rejects(() => rankSocialCandidates([candidate(id(1), scored(Number.NaN))])),
    rejects(() => rankSocialCandidates([candidate(id(1), scored(-0.1))])),
    rejects(() => rankSocialCandidates([candidate(id(1), scored(1.1))])),
    exact(ids(rankSocialCandidates([candidate(id(8), confidenceFirst), candidate(id(2), confidenceSecond)])), [id(2), id(8)]),
    exact(ids(rankSocialCandidates([candidate(id(8), goalContextFirst), candidate(id(2), goalContextSecond)])), [id(2), id(8)]),
    exact(ids(rankSocialCandidates([candidate(id(8), restrictionFirst), candidate(id(2), restrictionSecond)])), [id(2), id(8)]),
    Object.keys(rankSocialCandidates([candidate(id(1), scored(0.5))]).ordered[0]).sort().join(",") === "candidateUserId,rankingState",
    JSON.stringify(rankSocialCandidates(sample)) === JSON.stringify(rankSocialCandidates(sample)),
    !/localeCompare|Date\.now|new Date|Math\.random|rankingValue\s*:/.test(source)
  ];
}

const mutations = Object.freeze([
  { name: "score direction becomes ascending", file: files.rank, from: "left.score! > right.score! ? -1 : 1", to: "left.score! < right.score! ? -1 : 1" },
  { name: "scored bucket moves after other states", file: files.rank, from: 'if (state === "scored") return 0;', to: 'if (state === "scored") return 3;' },
  { name: "not_scored is coerced to numeric zero", file: files.rank, from: 'rankingState: "not_scored", score: null', to: 'rankingState: "scored", score: 0' },
  { name: "unsupported moves before not_scored", file: files.rank, from: 'if (state === "unsupported") return 2;', to: 'if (state === "unsupported") return -1;' },
  { name: "UUID tie-break is removed", file: files.rank, from: "return compareCodeUnits(left.candidateUserId, right.candidateUserId);", to: "return 0;" },
  { name: "UUID tie-break is reversed", file: files.rank, from: "return compareCodeUnits(left.candidateUserId, right.candidateUserId);", to: "return compareCodeUnits(right.candidateUserId, left.candidateUserId);" },
  { name: "localeCompare replaces code-unit ordering", file: files.rank, from: "return left < right ? -1 : left > right ? 1 : 0;", to: "return left.localeCompare(right);" },
  { name: "confidence is added to the ranking value", file: files.rank, from: "score: similarity.score });", to: "score: similarity.score * (typeof result.taste.evidenceConfidence?.value === \"number\" ? result.taste.evidenceConfidence.value : 1) });" },
  { name: "goal and context are added to the ranking value", file: files.rank, from: "score: similarity.score });", to: "score: similarity.score + (typeof result.goal?.score === \"number\" ? result.goal.score : 0) + (typeof result.context?.weight === \"number\" ? result.context.weight : 0) });" },
  { name: "restriction is added to the ranking value", file: files.rank, from: "score: similarity.score });", to: "score: similarity.score * (result.restriction?.verdict === \"eligible\" ? 2 : 1) });" },
  { name: "NaN and non-finite guard is removed", file: files.rank, from: "    !Number.isFinite(similarity.score) ||\n", to: "" },
  { name: "closed score range guard is removed", file: files.rank, from: "    similarity.score < 0 ||\n    similarity.score > 1\n", to: "    false\n" },
  { name: "duplicate detection is removed", file: files.rank, from: "if (new Set(candidateIds).size !== candidateIds.length)", to: "if (false && new Set(candidateIds).size !== candidateIds.length)" },
  { name: "malformed adapted result is silently classified", file: files.rank, from: '  if (result.status !== "adapted" || !isRecord(result.taste) || !isRecord(result.taste.similarity)) {\n    return socialRankingContractViolation();\n  }', to: '  if (result.status !== "adapted" || !isRecord(result.taste) || !isRecord(result.taste.similarity)) {\n    return Object.freeze({ candidateUserId: value.candidateUserId, rankingState: "unsupported", score: null });\n  }' },
  { name: "unknown not_scored reason is accepted", file: files.rank, from: 'typeof similarity.reason !== "string" || !NOT_SCORED_REASONS.has(similarity.reason)', to: 'typeof similarity.reason !== "string" || similarity.reason.length === 0' },
  { name: "wall clock is introduced", file: files.rank, from: "): SocialRankingResult {\n  if (!Array.isArray(candidates))", to: "): SocialRankingResult {\n  Date.now();\n  if (!Array.isArray(candidates))" },
  { name: "randomness is introduced", file: files.rank, from: "): SocialRankingResult {\n  if (!Array.isArray(candidates))", to: "): SocialRankingResult {\n  Math.random();\n  if (!Array.isArray(candidates))" },
  { name: "unsupported candidates are excluded", file: files.rank, from: "const classified = candidates.map(classifyCandidate);", to: 'const classified = candidates.map(classifyCandidate).filter(({ rankingState }) => rankingState !== "unsupported");' },
  { name: "cold-start not_scored candidates are excluded", file: files.rank, from: "const classified = candidates.map(classifyCandidate);", to: 'const classified = candidates.map(classifyCandidate).filter(({ rankingState }) => rankingState !== "not_scored");' },
  { name: "rankingValue is exposed", file: files.rank, from: "rankingState: candidate.rankingState\n  });", to: "rankingState: candidate.rankingState,\n    rankingValue: candidate.score\n  });" },
  { name: "raw score is exposed", file: files.rank, from: "rankingState: candidate.rankingState\n  });", to: "rankingState: candidate.rankingState,\n    score: candidate.score\n  });" }
]);

const results = [];
let harnessCrash = 0;
for (const mutation of mutations) {
  try {
    const source = canonical.get(mutation.file);
    const occurrences = source.split(mutation.from).length - 1;
    const applied = occurrences === 1 && mutation.from !== mutation.to;
    if (!applied) {
      results.push({ name: mutation.name, applied: false, occurrences, killed: false, status: "anchor_missing" });
      continue;
    }
    const mutated = source.replace(mutation.from, mutation.to);
    const module = loadRanking(new Map([[mutation.file, mutated]]));
    const killed = rankingContract(module, mutated).some((passed) => !passed);
    results.push({ name: mutation.name, applied: true, occurrences, killed, status: killed ? "killed" : "survived" });
  } catch (error) {
    harnessCrash += 1;
    results.push({ name: mutation.name, applied: false, killed: false, status: "harness_crash", error: error instanceof Error ? error.message : String(error) });
  }
}

const frozenHead = "1111111111111111111111111111111111111111";
const delta = SR2A_SUCCESSOR_PATHS.map((entry) => ({ status: entry.includes("social-ranking") ? "A" : "M", path: entry }));
const candidateState = Object.freeze({ head: SR2A_BASELINE, originHead: SR2A_BASELINE, ahead: 0, behind: 0, headParent: null, worktreePaths: SR2A_SUCCESSOR_PATHS, stagedPaths: [], headDeltaEntries: [] });
const frozenState = Object.freeze({ head: frozenHead, originHead: SR2A_BASELINE, ahead: 1, behind: 0, headParent: SR2A_BASELINE, worktreePaths: [], stagedPaths: [], headDeltaEntries: delta });
const pushedState = Object.freeze({ ...frozenState, originHead: frozenHead, ahead: 0 });
const changed = (state, change) => Object.freeze({ ...state, ...change });
const malformedStates = Object.freeze([
  changed(candidateState, { worktreePaths: [...SR2A_SUCCESSOR_PATHS, "README.md"] }),
  changed(candidateState, { stagedPaths: ["package.json"] }),
  changed(frozenState, { worktreePaths: ["README.md"] }),
  changed(frozenState, { headParent: "2222222222222222222222222222222222222222" }),
  changed(frozenState, { headDeltaEntries: [...delta, { status: "M", path: "README.md" }] }),
  changed(frozenState, { headDeltaEntries: delta.map((entry, index) => index === 0 ? { ...entry, status: "D" } : entry) }),
  changed(frozenState, { originHead: "3333333333333333333333333333333333333333" })
]);
function lifecycleContract(classify) {
  return [
    classify(candidateState).phase === "candidate",
    classify(frozenState).phase === "frozen_unpushed",
    classify(pushedState).phase === "frozen_pushed",
    malformedStates.every((state) => !classify(state).valid)
  ];
}
function manifestContract(createManifest) {
  const bytes = new Map(SR2A_SUCCESSOR_PATHS.map((entry) => [entry, Buffer.from(`fixture:${entry}`, "utf8")]));
  const expectedText = [...SR2A_SUCCESSOR_PATHS].sort().map((entry) => {
    const hash = crypto.createHash("sha256").update(bytes.get(entry)).digest("hex");
    return `${hash}  ${entry}\n`;
  }).join("");
  const manifest = createManifest((entry) => bytes.get(entry));
  return [
    manifest.text === expectedText,
    manifest.aggregateSha256 === crypto.createHash("sha256").update(Buffer.from(expectedText, "utf8")).digest("hex")
  ];
}
const lifecycleMutations = Object.freeze([
  { name: "lifecycle accepts extra candidate paths", from: "exactPathSet(worktreePaths, SR2A_SUCCESSOR_PATHS) &&", to: "SR2A_SUCCESSOR_PATHS.every((entry) => worktreePaths.includes(entry)) &&" },
  { name: "lifecycle accepts staged candidate bytes", from: "stagedPaths.length === 0;", to: "stagedPaths.length >= 0;" },
  { name: "lifecycle accepts dirty frozen worktree", from: "worktreePaths.length === 0 &&\n    stagedPaths.length === 0 &&", to: "worktreePaths.length >= 0 &&\n    stagedPaths.length === 0 &&" },
  { name: "lifecycle accepts wrong frozen parent", from: "state.headParent === SR2A_BASELINE &&", to: "state.headParent !== null &&" },
  { name: "lifecycle accepts extra frozen path", from: "exactPathSet(headDeltaPaths, SR2A_SUCCESSOR_PATHS) &&", to: "SR2A_SUCCESSOR_PATHS.every((entry) => headDeltaPaths.includes(entry)) &&" },
  { name: "lifecycle accepts a deleted frozen path", from: "!headDeltaEntries.some(({ status }) => status === \"D\");", to: "headDeltaEntries.every(({ status }) => typeof status === \"string\");" },
  { name: "lifecycle accepts invalid origin relation", from: "state.originHead === SR2A_BASELINE &&\n    state.ahead === 1", to: "state.originHead !== null &&\n    state.ahead === 1" }
]);
const lifecycleSource = canonical.get(files.lifecycle);
for (const [index, mutation] of lifecycleMutations.entries()) {
  try {
    const occurrences = lifecycleSource.split(mutation.from).length - 1;
    const applied = occurrences === 1 && mutation.from !== mutation.to;
    if (!applied) {
      results.push({ name: mutation.name, applied: false, occurrences, killed: false, status: "anchor_missing" });
      continue;
    }
    const mutantUrl = `data:text/javascript;base64,${Buffer.from(lifecycleSource.replace(mutation.from, mutation.to)).toString("base64")}#${index}`;
    const mutant = await import(mutantUrl);
    const killed = lifecycleContract(mutant.classifySr2aLifecycle).some((passed) => !passed);
    results.push({ name: mutation.name, applied: true, occurrences, killed, status: killed ? "killed" : "survived" });
  } catch (error) {
    harnessCrash += 1;
    results.push({ name: mutation.name, applied: false, killed: false, status: "harness_crash", error: error instanceof Error ? error.message : String(error) });
  }
}

const manifestMutations = Object.freeze([
  { name: "manifest serializes with one space", from: "`${sha256}  ${path}\\n`", to: "`${sha256} ${path}\\n`" },
  { name: "manifest serializes with CRLF", from: "`${sha256}  ${path}\\n`", to: "`${sha256}  ${path}\\r\\n`" },
  { name: "manifest hashes UTF-16LE serialization", from: "Buffer.from(text, \"utf8\")", to: "Buffer.from(text, \"utf16le\")" }
]);
for (const [index, mutation] of manifestMutations.entries()) {
  try {
    const occurrences = lifecycleSource.split(mutation.from).length - 1;
    const applied = occurrences === 1 && mutation.from !== mutation.to;
    if (!applied) {
      results.push({ name: mutation.name, applied: false, occurrences, killed: false, status: "anchor_missing" });
      continue;
    }
    const mutantUrl = `data:text/javascript;base64,${Buffer.from(lifecycleSource.replace(mutation.from, mutation.to)).toString("base64")}#manifest-${index}`;
    const mutant = await import(mutantUrl);
    const killed = manifestContract(mutant.createSr2aCanonicalManifest).some((passed) => !passed);
    results.push({ name: mutation.name, applied: true, occurrences, killed, status: killed ? "killed" : "survived" });
  } catch (error) {
    harnessCrash += 1;
    results.push({ name: mutation.name, applied: false, killed: false, status: "harness_crash", error: error instanceof Error ? error.message : String(error) });
  }
}

const canonicalRankingPassed = rankingContract(loadRanking(), canonical.get(files.rank)).every(Boolean);
const canonicalLifecyclePassed = lifecycleContract(classifySr2aLifecycle).every(Boolean);
const canonicalManifestPassed = manifestContract(createSr2aCanonicalManifest).every(Boolean);
const applied = results.filter(({ applied: value }) => value).length;
const killed = results.filter(({ killed: value }) => value).length;
const survived = results.filter(({ status }) => status === "survived").length;
const anchorMissing = results.filter(({ status }) => status === "anchor_missing").length;
const totalMutations = mutations.length + lifecycleMutations.length + manifestMutations.length;
const noOp = [...mutations, ...lifecycleMutations, ...manifestMutations].filter(({ from, to }) => from === to).length;
const passed = canonicalRankingPassed && canonicalLifecyclePassed && canonicalManifestPassed && applied === totalMutations && killed === totalMutations && survived === 0 && anchorMissing === 0 && noOp === 0 && harnessCrash === 0;
console.log(JSON.stringify({
  suite: "social-ranking-sr2a-mutations",
  status: passed ? "passed" : "failed",
  totalMutations,
  applied,
  killed,
  survived,
  noOp,
  anchorMissing,
  harnessCrash,
  canonicalRankingPassed,
  canonicalLifecyclePassed,
  canonicalManifestPassed,
  results,
  repositoryBytesChanged: false,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false
}, null, 2));
process.exit(passed ? 0 : 1);
