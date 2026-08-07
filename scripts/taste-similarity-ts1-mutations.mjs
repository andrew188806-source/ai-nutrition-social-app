import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const temporaryRoot = process.platform === "win32" ? os.tmpdir() : "/tmp";
const sourceRoot = path.join(root, "packages", "shared", "src", "domain", "taste-similarity");
const sourceFiles = fs.readdirSync(sourceRoot).filter((file) => file.endsWith(".ts")).sort();
const canonicalSources = Object.fromEntries(sourceFiles.map((file) => [file, fs.readFileSync(path.join(sourceRoot, file), "utf8")]));

const explicit = (id) => ({
  evidenceId: id,
  origin: "explicit_profile",
  sourceRecordKind: "taste_profile",
  confidenceBasis: "user_explicit",
  decayEligibility: "not_eligible"
});
const restrictionMeta = (id) => ({
  evidenceId: id,
  origin: "dietary_restriction",
  sourceRecordKind: "dietary_restriction",
  confidenceBasis: "user_explicit",
  decayEligibility: "not_eligible"
});

const mutations = [
  {
    name: "social_logistics maps to food_taste",
    file: "normalization.ts",
    from: "scope: input.scope,",
    to: 'scope: (input.scope === "social_logistics" ? "food_taste" : input.scope) as PreferenceEvidence["scope"],',
    probe: (domain) => domain.normalizePreferenceEvidence({ category: "preference", scope: "social_logistics", facet: "payment_preference", polarity: "neutral", value: "split", evidence: explicit("p-social") }).scope === "social_logistics"
  },
  {
    name: "dining_context maps to food_taste",
    file: "normalization.ts",
    from: "scope: input.scope,",
    to: 'scope: (input.scope === "dining_context" ? "food_taste" : input.scope) as PreferenceEvidence["scope"],',
    probe: (domain) => domain.normalizePreferenceEvidence({ category: "preference", scope: "dining_context", facet: "dining_style", polarity: "neutral", value: "casual", evidence: explicit("p-dining") }).scope === "dining_context"
  },
  {
    name: "meal_pattern maps to food_taste",
    file: "normalization.ts",
    from: "scope: input.scope,",
    to: 'scope: (input.scope === "meal_pattern" ? "food_taste" : input.scope) as PreferenceEvidence["scope"],',
    probe: (domain) => domain.normalizePreferenceEvidence({ category: "preference", scope: "meal_pattern", facet: "meal_type", polarity: "positive", value: "lunch", evidence: explicit("p-meal") }).scope === "meal_pattern"
  },
  {
    name: "disliked preference converts to restriction",
    file: "normalization.ts",
    from: 'category: "preference",\n    scope: input.scope,',
    to: 'category: (input.facet === "flavor" ? "restriction" : "preference") as "preference",\n    scope: input.scope,',
    probe: (domain) => domain.normalizePreferenceEvidence({ category: "preference", scope: "food_taste", facet: "flavor", polarity: "negative", value: "bitter", evidence: explicit("p-dislike") }).category === "preference"
  },
  {
    name: "restriction converts to negative preference",
    file: "normalization.ts",
    from: 'category: "restriction",\n    restrictionType:',
    to: 'category: "preference" as "restriction",\n    ...({ polarity: "negative" } as object),\n    restrictionType:',
    probe: (domain) => { const result = domain.normalizeRestrictionEvidence({ category: "restriction", restrictionType: "dietary", label: "x", rawSeverity: "preference", visibility: "private", evidence: restrictionMeta("r-category") }); return result.category === "restriction" && !("polarity" in result); }
  },
  {
    name: "unknown severity converts to hard",
    file: "normalization.ts",
    from: 'enforcement: rawSeverity === "preference" ? "soft" : "unclassified",',
    to: 'enforcement: rawSeverity === "preference" ? "soft" : "hard" as RestrictionEvidence["enforcement"],',
    probe: (domain) => domain.normalizeRestrictionEvidence({ category: "restriction", restrictionType: "allergy", label: "x", rawSeverity: "severe", visibility: "private", evidence: restrictionMeta("r-hard") }).enforcement === "unclassified"
  },
  {
    name: "unknown severity converts to soft",
    file: "normalization.ts",
    from: 'enforcement: rawSeverity === "preference" ? "soft" : "unclassified",',
    to: 'enforcement: rawSeverity === "preference" ? "soft" : "soft",',
    probe: (domain) => domain.normalizeRestrictionEvidence({ category: "restriction", restrictionType: "future", label: "x", rawSeverity: "future", visibility: "private", evidence: restrictionMeta("r-soft") }).enforcement === "unclassified"
  },
  {
    name: "unknown raw value is dropped",
    file: "normalization.ts",
    from: ': { classification: "unknown", rawValue };',
    to: ': { classification: "unknown", rawValue: "unknown" };',
    probe: (domain) => domain.normalizeRestrictionEvidence({ category: "restriction", restrictionType: "future", label: "x", rawSeverity: "future", visibility: "future_circle", evidence: restrictionMeta("r-raw") }).visibility.rawValue === "future_circle"
  },
  {
    name: "trim is disabled",
    file: "normalization.ts",
    from: 'value.normalize("NFC").trim()',
    to: 'value.normalize("NFC")',
    probe: (domain) => domain.normalizeUnicodeText("  value  ") === "value"
  },
  {
    name: "Unicode normalization is disabled",
    file: "normalization.ts",
    from: 'value.normalize("NFC").trim()',
    to: 'value.trim()',
    probe: (domain) => domain.normalizeUnicodeText("Cafe\u0301") === "Café"
  },
  {
    name: "empty text is accepted",
    file: "normalization.ts",
    from: 'if (!normalized) throw new TasteEvidenceNormalizationError("Text evidence must not be empty.");',
    to: 'if (normalized.length < 0) throw new TasteEvidenceNormalizationError("Text evidence must not be empty.");',
    probe: (domain) => { try { domain.normalizeUnicodeText("   "); return false; } catch { return true; } }
  },
  {
    name: "dedupe is disabled",
    file: "normalization.ts",
    from: 'return [...new Set(values.map(normalizeUnicodeText))].sort(compareCodeUnits);',
    to: 'return values.map(normalizeUnicodeText).sort(compareCodeUnits);',
    probe: (domain) => JSON.stringify(domain.normalizeStringSet(["b", "a", "b"])) === JSON.stringify(["a", "b"])
  },
  {
    name: "deterministic ordering is disabled",
    file: "normalization.ts",
    from: 'return [...new Set(values.map(normalizeUnicodeText))].sort(compareCodeUnits);',
    to: 'return [...new Set(values.map(normalizeUnicodeText))];',
    probe: (domain) => JSON.stringify(domain.normalizeStringSet(["b", "a"])) === JSON.stringify(["a", "b"])
  },
  {
    name: "canonical ID is replaced with display name",
    file: "normalization.ts",
    from: 'return { kind: "restaurant", restaurantId: normalizeOpaqueCanonicalId(input.restaurantId) };',
    to: 'return { kind: "restaurant", restaurantId: normalizeUnicodeText((input as typeof input & { displayName?: string }).displayName ?? input.restaurantId) };',
    probe: (domain) => domain.normalizeCanonicalTarget({ kind: "restaurant", restaurantId: "opaque-id", displayName: "Display Name" }).restaurantId === "opaque-id"
  },
  {
    name: "goal receives positive polarity",
    file: "normalization.ts",
    from: 'category: "goal",\n      facet: "goal_label",',
    to: 'category: "goal",\n      ...({ polarity: "positive" } as object),\n      facet: "goal_label",',
    probe: (domain) => !("polarity" in domain.normalizeGoalEvidence({ category: "goal", facet: "goal_label", value: "balanced", validity: { startsOn: "2026-08-01", isActive: true }, evidence: { evidenceId: "g-polarity", origin: "nutrition_goal", sourceRecordKind: "nutrition_goal", confidenceBasis: "user_explicit", decayEligibility: "not_eligible" } }))
  },
  {
    name: "restriction receives negative polarity",
    file: "normalization.ts",
    from: 'category: "restriction",\n    restrictionType:',
    to: 'category: "restriction",\n    ...({ polarity: "negative" } as object),\n    restrictionType:',
    probe: (domain) => !("polarity" in domain.normalizeRestrictionEvidence({ category: "restriction", restrictionType: "dietary", label: "x", rawSeverity: "preference", visibility: "private", evidence: restrictionMeta("r-polarity") }))
  },
  {
    name: "meal source confidence becomes taste confidence",
    file: "normalization.ts",
    from: 'interpretation: "observed",\n    mealType:',
    to: 'interpretation: "observed",\n    ...({ tasteConfidence: evidence.sourceConfidence } as object),\n    mealType:',
    probe: (domain) => !("tasteConfidence" in domain.normalizeBehavioralEvidence({ category: "behavior", behaviorKind: "meal_occurrence", interpretation: "observed", mealType: "lunch", occurredAt: "2026-08-08T12:00:00Z", consumedRatio: 1, evidence: { evidenceId: "m-confidence", origin: "meal_record", sourceRecordKind: "meal_record_item", confidenceBasis: "observed_consumption", sourceConfidence: 0.7, decayEligibility: "source_policy", target: null } }))
  }
];

function compileModule(sources, token) {
  const tempRoot = fs.mkdtempSync(path.join(temporaryRoot, `taste-similarity-ts1-${token}-`));
  const srcRoot = path.join(tempRoot, "src");
  const outRoot = path.join(tempRoot, "out");
  fs.mkdirSync(srcRoot, { recursive: true });
  for (const [file, source] of Object.entries(sources)) fs.writeFileSync(path.join(srcRoot, file), source, "utf8");
  const inputFiles = Object.keys(sources).map((file) => path.join(srcRoot, file));
  const program = ts.createProgram(inputFiles, {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    outDir: outRoot,
    rootDir: srcRoot
  });
  const emit = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emit.diagnostics);
  if (diagnostics.length) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    return { compiled: false, diagnostics: diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")) };
  }
  try {
    const requireFromTemp = createRequire(path.join(outRoot, "index.js"));
    const domain = requireFromTemp("./index.js");
    return { compiled: true, domain, cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true }) };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    return { compiled: true, loaded: false, loadError: error instanceof Error ? error.message : String(error) };
  }
}

const canonical = compileModule(canonicalSources, "canonical");
if (!canonical.compiled || !canonical.domain) {
  console.error(JSON.stringify({ status: "failed", reason: "canonical production module did not compile/load", canonical }, null, 2));
  process.exit(1);
}

const results = [];
try {
  for (const [index, mutation] of mutations.entries()) {
    const source = canonicalSources[mutation.file];
    const occurrences = source.split(mutation.from).length - 1;
    const applied = occurrences === 1;
    const canonicalPass = Boolean(mutation.probe(canonical.domain));
    if (!applied) {
      results.push({ name: mutation.name, applied, occurrences, canonicalPass, compiled: false, killed: false });
      console.log(`FAIL MUTATION ${index + 1} ${mutation.name} (not applied exactly once)`);
      continue;
    }
    const mutatedSources = { ...canonicalSources, [mutation.file]: source.replace(mutation.from, mutation.to) };
    const compiled = compileModule(mutatedSources, `mutant-${index + 1}`);
    let mutantPass = null;
    let runtimeError = null;
    if (compiled.compiled && compiled.domain) {
      try {
        mutantPass = Boolean(mutation.probe(compiled.domain));
      } catch (error) {
        runtimeError = error instanceof Error ? error.message : String(error);
        mutantPass = false;
      } finally {
        compiled.cleanup?.();
      }
    }
    const killed = applied && canonicalPass && compiled.compiled && Boolean(compiled.domain) && mutantPass === false;
    results.push({
      name: mutation.name,
      applied,
      occurrences,
      canonicalPass,
      compiled: compiled.compiled,
      loaded: Boolean(compiled.domain),
      mutantPass,
      runtimeError,
      diagnostics: compiled.diagnostics ?? [],
      loadError: compiled.loadError ?? null,
      killed
    });
    console.log(`${killed ? "PASS" : "FAIL"} MUTATION ${index + 1} ${mutation.name}`);
  }
} finally {
  canonical.cleanup?.();
}

const killed = results.filter((entry) => entry.killed).length;
const passed = killed === mutations.length;
console.log(JSON.stringify({
  status: passed ? "passed" : "failed",
  phase: "TS-1A + TS-1B Targeted Semantic Mutation Suite",
  totalMutations: mutations.length,
  killedMutations: killed,
  survivedMutations: mutations.length - killed,
  compileOnlyKillsAccepted: false,
  results,
  networkUsed: false,
  databaseUsed: false,
  productionTouched: false
}, null, 2));
if (!passed) process.exitCode = 1;
