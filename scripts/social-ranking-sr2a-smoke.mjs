#!/usr/bin/env node
// SR-2A deterministic semantic smoke. Executes the real pure ranking module in memory only.
// No network, database, Supabase, credentials, persistence, cache or private-payload logging.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const checks = [];

function expect(condition, name) {
  const result = Object.freeze({ name, pass: Boolean(condition) });
  checks.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

function loadRanking() {
  const cache = new Map();
  const resolveTsFile = (candidate) => [candidate, `${candidate}.ts`, path.join(candidate, "index.ts")]
    .find((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
  const load = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
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
  return load(path.join(root, "supabase/functions/_shared/social-ranking/index.ts"));
}

const { rankSocialCandidates, SOCIAL_RANKING_CONTRACT_ERROR } = loadRanking();
const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const versions = Object.freeze({ sharedAdapterPolicyVersion: "shared-taste-adapter-v1" });
const scoredResult = (score, overrides = {}) => ({
  versions,
  status: "adapted",
  taste: {
    similarity: { status: "scored", score },
    evidenceConfidence: { status: "available", value: 0.5, basis: "complete" },
    evidenceState: "comparable"
  },
  context: {
    mealPattern: { status: "scored", score: 0.5 },
    dining: { status: "scored", score: 0.5 },
    socialLogistics: { status: "scored", score: 0.5 }
  },
  goal: { status: "scored", score: 0.5 },
  restriction: {
    verdict: "eligible",
    basis: "complete",
    evidencePresentForBoth: true,
    unclassifiedPresent: false,
    sourceReachableForBoth: true
  },
  signals: { availableFamilies: [], incompleteFamilies: [] },
  reasons: { comparison: [], evidence: [] },
  ...overrides
});
const notScoredResult = (overrides = {}) => scoredResult(0.5, {
  ...overrides,
  taste: {
    similarity: { status: "not_scored", reason: "no_comparable_evidence" },
    evidenceConfidence: { status: "not_available", reason: "no_comparable_evidence" },
    evidenceState: "cold_start"
  }
});
const unsupportedResult = (reason = "unsupported_snapshot_schema") => ({
  versions,
  status: "unsupported",
  reason
});
const candidate = (candidateUserId, result) => ({ candidateUserId, result });
const order = (result) => result.ordered.map(({ candidateUserId }) => candidateUserId);
const states = (result) => result.ordered.map(({ rankingState }) => rankingState);
const exact = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function rejectsContract(operation) {
  try {
    operation();
    return false;
  } catch (error) {
    return error instanceof Error && error.message === SOCIAL_RANKING_CONTRACT_ERROR;
  }
}

expect(typeof rankSocialCandidates === "function", "0. real SR-2A ranking authority loads");
{
  const result = rankSocialCandidates([]);
  expect(exact(result, { policyVersion: "social-ranking-v1", ordered: [] }), "1. empty input succeeds with the exact empty contract");
  expect(Object.isFrozen(result) && Object.isFrozen(result.ordered), "1a. canonical result and ordered array are immutable");
}
{
  const result = rankSocialCandidates([candidate(id(1), scoredResult(0.75))]);
  expect(exact(states(result), ["scored"]), "2. one scored candidate is classified as scored");
  expect(exact(Object.keys(result.ordered[0]).sort(), ["candidateUserId", "rankingState"]), "2a. output exposes only identity and ranking state");
}
expect(exact(order(rankSocialCandidates([
  candidate(id(1), scoredResult(0.2)), candidate(id(2), scoredResult(1)), candidate(id(3), scoredResult(0.6))
])), [id(2), id(3), id(1)]), "3. multiple scored candidates order by taste similarity descending");
expect(exact(order(rankSocialCandidates([
  candidate(id(9), scoredResult(0.5)), candidate(id(4), scoredResult(0.5))
])), [id(4), id(9)]), "4. equal scores tie by explicit candidate UUID code-unit order");
expect(exact(states(rankSocialCandidates([
  candidate(id(1), notScoredResult()), candidate(id(2), scoredResult(0))
])), ["scored", "not_scored"]), "5. scored sorts before not_scored even at score zero");
expect(exact(order(rankSocialCandidates([
  candidate(id(8), notScoredResult()), candidate(id(3), notScoredResult())
])), [id(3), id(8)]), "6. not_scored candidates order by UUID");
expect(exact(states(rankSocialCandidates([
  candidate(id(1), unsupportedResult()), candidate(id(2), notScoredResult())
])), ["not_scored", "unsupported"]), "7. not_scored sorts before unsupported");
expect(exact(order(rankSocialCandidates([
  candidate(id(7), unsupportedResult()), candidate(id(2), unsupportedResult("policy_version_mismatch"))
])), [id(2), id(7)]), "8. unsupported candidates order by UUID");
expect(exact(states(rankSocialCandidates([candidate(id(1), notScoredResult())])), ["not_scored"]), "9. cold-start remains adapted not_scored");
expect(exact(order(rankSocialCandidates([
  candidate(id(6), unsupportedResult()), candidate(id(1), unsupportedResult()), candidate(id(4), unsupportedResult())
])), [id(1), id(4), id(6)]), "10. all-unsupported input is retained and deterministically ordered");
{
  const input = [candidate(id(3), scoredResult(0.3)), candidate(id(2), notScoredResult()), candidate(id(1), unsupportedResult())];
  const first = JSON.stringify(rankSocialCandidates(input));
  expect(Array.from({ length: 20 }, () => JSON.stringify(rankSocialCandidates(input))).every((value) => value === first), "11. repeated identical runs produce identical output");
}
expect(rejectsContract(() => rankSocialCandidates([
  candidate(id(1), scoredResult(0.2)), candidate(id(1), scoredResult(0.8))
])), "12. duplicate candidate identity fails closed");
expect(rejectsContract(() => rankSocialCandidates([candidate(id(1), { versions, status: "mystery" })])), "13. malformed result discriminant fails closed");
expect(rejectsContract(() => rankSocialCandidates([candidate(id(1), scoredResult(Number.NaN))])), "14. NaN score fails closed");
expect(rejectsContract(() => rankSocialCandidates([candidate(id(1), scoredResult(Number.POSITIVE_INFINITY))])), "15. Infinity score fails closed");
expect(rejectsContract(() => rankSocialCandidates([candidate(id(1), scoredResult(-0.01))])), "16. negative score fails closed");
expect(rejectsContract(() => rankSocialCandidates([candidate(id(1), scoredResult(1.01))])), "17. score above one fails closed");
{
  const lowIdHighConfidence = scoredResult(0.5, { taste: { ...scoredResult(0.5).taste, evidenceConfidence: { status: "available", value: 1, basis: "complete" } } });
  const highIdLowConfidence = scoredResult(0.5, { taste: { ...scoredResult(0.5).taste, evidenceConfidence: { status: "available", value: 0, basis: "sparse" } } });
  expect(exact(order(rankSocialCandidates([
    candidate(id(8), lowIdHighConfidence), candidate(id(2), highIdLowConfidence)
  ])), [id(2), id(8)]), "18. confidence differences do not change ranking");
}
{
  const favorable = scoredResult(0.5, { context: { marker: "favorable" }, goal: { status: "scored", score: 1 } });
  const unfavorable = scoredResult(0.5, { context: { marker: "unfavorable" }, goal: { status: "scored", score: 0 } });
  expect(exact(order(rankSocialCandidates([
    candidate(id(8), favorable), candidate(id(2), unfavorable)
  ])), [id(2), id(8)]), "19. goal and context differences do not change ranking");
}
{
  const needsAttention = scoredResult(0.5, { restriction: { verdict: "needs_attention" } });
  const eligible = scoredResult(0.5, { restriction: { verdict: "eligible" } });
  expect(exact(order(rankSocialCandidates([
    candidate(id(8), eligible), candidate(id(2), needsAttention)
  ])), [id(2), id(8)]), "20. restriction differences do not change ranking");
}
expect(rejectsContract(() => rankSocialCandidates([candidate("not-a-uuid", scoredResult(0.5))])), "21. invalid candidate identity fails closed");
expect(rejectsContract(() => rankSocialCandidates([candidate(id(1), scoredResult(0.5, { taste: { similarity: { status: "unknown" } } }))])), "22. impossible similarity state fails closed");
expect(rejectsContract(() => rankSocialCandidates([candidate(id(1), unsupportedResult("unknown_reason"))])), "23. malformed unsupported result fails closed");
expect(rejectsContract(() => rankSocialCandidates([candidate(id(1), {
  ...notScoredResult(),
  taste: { similarity: { status: "not_scored", reason: "unknown_reason" } }
})])), "23a. unknown not_scored reason fails closed");
expect(rejectsContract(() => rankSocialCandidates(null)), "24. non-array input fails closed");

const failed = checks.filter(({ pass }) => !pass);
console.log(JSON.stringify({
  suite: "social-ranking-sr2a-smoke",
  status: failed.length === 0 ? "passed" : "failed",
  checks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.map(({ name }) => name),
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  privatePayloadLogged: false
}, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
