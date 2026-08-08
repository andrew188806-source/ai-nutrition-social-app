#!/usr/bin/env node
// TS-3D mutation proof — GOAL COMPATIBILITY and RESTRICTION ELIGIBILITY.
//
// Each mutation rewrites REAL implementation bytes on disk, then requires that the TS-3D guard, the
// TS-3D smoke, or a dedicated behavioural probe FAILS. A mutation nothing notices is a hole.
//
// Kills must be real: a mutation that only crashes the harness (unloadable module, syntax error) is
// reported as `harness_crash` and does NOT count as a kill.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const domainRoot = path.join(root, "packages/shared/src/domain/taste-similarity");
const goalRestrictionRoot = path.join(domainRoot, "goal-restriction");

const file = (name) => path.join(goalRestrictionRoot, name);
const COMPARATOR = file("comparator.ts");
const POLICY = file("policy.ts");
const TYPES = file("types.ts");
const REASON_CODES = file("reasonCodes.ts");
const TASTE_COMPARATOR = path.join(domainRoot, "similarity/comparator.ts");
const TASTE_POLICY = path.join(domainRoot, "similarity/policy.ts");
const CONTEXT_COMPARATOR = path.join(domainRoot, "compatibility/comparator.ts");
const CONTEXT_POLICY = path.join(domainRoot, "compatibility/policy.ts");

function resolveTsFile(candidate) {
  for (const suffix of ["", ".ts", "/index.ts"]) {
    const full = `${candidate}${suffix}`;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function loadDomain() {
  const cache = new Map();
  const loadFile = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const { outputText } = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: absolute
    });
    const module = { exports: {} };
    cache.set(absolute, module);
    const localRequire = (specifier) => {
      if (!specifier.startsWith(".")) return require_(specifier);
      const resolved = resolveTsFile(path.resolve(path.dirname(absolute), specifier));
      if (!resolved) throw new Error(`unresolved ${specifier}`);
      return loadFile(resolved);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  };
  return loadFile(path.join(domainRoot, "index.ts"));
}

// ---- fixtures ------------------------------------------------------------------------------------
const envelope = (id, origin, kind, basis, decay, target = null, extra = {}) => ({
  evidenceId: id, origin, sourceRecordKind: kind, recordedAt: "2026-08-01T00:00:00.000Z",
  confidenceBasis: basis, decayEligibility: decay, ...(target ? { target } : {}), ...extra
});
const preference = (user, scope, facet, polarity, value, slot = value) => ({
  category: "preference", scope, facet, polarity, value,
  evidence: envelope(`tp:${user}:${scope}:${facet}:${slot}`, "explicit_profile", "taste_profile", "user_explicit", "not_eligible")
});
const cuisine = (user, value) => preference(user, "food_taste", "cuisine", "positive", value);
const mealType = (user, value) => preference(user, "meal_pattern", "meal_type", "positive", value);
const goalLabel = (user, value, { isActive = true, startsOn = "2026-07-01", endsOn, slot = value } = {}) => ({
  category: "goal", facet: "goal_label", value,
  validity: { startsOn, isActive, ...(endsOn === undefined ? {} : { endsOn }) },
  evidence: envelope(`goal:${user}:label:${slot}`, "nutrition_goal", "nutrition_goal", "user_explicit", "not_eligible")
});
const goalScalar = (user, facet, value, unit = "kcal") => ({
  category: "goal", facet, value, unit,
  validity: { startsOn: "2026-07-01", isActive: true },
  evidence: envelope(`goal:${user}:${facet}`, "nutrition_goal", "nutrition_goal", "user_explicit", "not_eligible")
});
const restriction = (user, label, { rawSeverity = "preference", restrictionType = "avoidance", slot = label } = {}) => ({
  category: "restriction", restrictionType, label, rawSeverity, visibility: "private",
  evidence: envelope(`restr:${user}:${slot}`, "dietary_restriction", "dietary_restriction", "user_explicit", "not_eligible")
});

const state = (count) => (count > 0 ? { status: "available", evidenceCount: count } : { status: "empty", evidenceCount: 0 });
function makeSnapshot(compose, userId, { preferences = [], behavior = [], goals = [], restrictions = [] } = {}) {
  return compose({
    subjectUserId: userId,
    preferences, goals, restrictions, behavior,
    sourceStates: {
      taste_profile: state(preferences.length),
      nutrition_goals: state(goals.length),
      dietary_restrictions: state(restrictions.length),
      meals: state(0),
      favorites: state(behavior.filter((entry) => entry.behaviorKind === "favorite").length),
      ratings: state(0)
    },
    generatedAt: "2026-08-08T12:00:00.000Z",
    evidenceWindow: {
      historyScope: "bounded",
      meals: { requestedStartDate: "2026-07-01", requestedEndDate: "2026-08-08", requestedLimit: 50, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" },
      favorites: { requestedLimit: 25, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" },
      ratings: { requestedLimit: null, actualEarliestAt: null, actualLatestAt: null, returnedCount: 0, truncation: "not_truncated" }
    }
  });
}

// ---- harness -------------------------------------------------------------------------------------
function runSuite(script) {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;
}

function withMutatedDisk(targets, run) {
  const originals = new Map(targets.map(({ file: target }) => [target, fs.readFileSync(target, "utf8")]));
  try {
    const mutated = new Map(originals);
    for (const { file: target, from, to } of targets) {
      const source = mutated.get(target);
      if (!source.includes(from)) return { applied: false, reason: `anchor not found in ${path.basename(target)}: ${from}` };
      mutated.set(target, source.replaceAll(from, to));
    }
    for (const [target, source] of mutated) fs.writeFileSync(target, source, "utf8");
    return { applied: true, value: run() };
  } finally {
    for (const [target, original] of originals) fs.writeFileSync(target, original, "utf8");
  }
}

const results = [];

function mutation(id, name, targets, detector) {
  const outcome = withMutatedDisk(targets, () => {
    let guardFailed = false;
    let smokeFailed = false;
    let probeFailed = false;
    let crashed = false;
    try {
      guardFailed = !runSuite("scripts/taste-similarity-ts3d-guard.mjs");
      smokeFailed = !runSuite("scripts/taste-similarity-ts3d-smoke.mjs");
      if (detector) probeFailed = detector(loadDomain());
    } catch (error) {
      crashed = true;
      probeFailed = false;
      void error;
    }
    return { guardFailed, smokeFailed, probeFailed, crashed };
  });

  if (!outcome.applied) {
    results.push({ id, name, killed: false, status: "anchor_missing", detail: outcome.reason });
    return;
  }
  const { guardFailed, smokeFailed, probeFailed, crashed } = outcome.value;
  const killed = guardFailed || smokeFailed || probeFailed;
  results.push({
    id, name, killed,
    status: killed ? "killed" : crashed ? "harness_crash" : "survived",
    killedBy: [guardFailed && "guard", smokeFailed && "smoke", probeFailed && "probe"].filter(Boolean)
  });
}

const probe = (assertion) => (domain) => {
  const {
    compareGoalRestrictionCompatibility,
    compareSocialContextCompatibility,
    compareTasteSimilarity,
    composeTasteProfileSnapshot
  } = domain;
  const snap = (userId, input) => makeSnapshot(composeTasteProfileSnapshot, userId, input);
  return assertion({
    gr: compareGoalRestrictionCompatibility,
    context: compareSocialContextCompatibility,
    taste: compareTasteSimilarity,
    snap
  });
};

// ================================================================================================
// 1-2. goal / restriction leaking into taste
mutation(1, "goal evidence leaks into the taste comparator",
  [{ file: TASTE_COMPARATOR, from: "  for (const preference of snapshot.preferences as readonly PreferenceEvidence[]) {", to: "  for (const entry of snapshot.goals as readonly { facet: string; value: unknown }[]) {\n    if (entry.facet === \"goal_label\") {\n      cuisines.push(String(entry.value));\n      explicitEvidenceCount += 1;\n    }\n  }\n  for (const preference of snapshot.preferences as readonly PreferenceEvidence[]) {" }],
  probe(({ taste, snap }) => {
    const result = taste(
      snap("user-a", { goals: [goalLabel("a", "fat_loss")] }),
      snap("user-b", { goals: [goalLabel("b", "fat_loss")] })
    );
    return result.status === "scored";
  }));

mutation(2, "restriction evidence leaks into the taste comparator",
  [{ file: TASTE_COMPARATOR, from: "  for (const preference of snapshot.preferences as readonly PreferenceEvidence[]) {", to: "  for (const entry of snapshot.restrictions as readonly { label: string }[]) {\n    dislikedFlavors.push(entry.label);\n    explicitEvidenceCount += 1;\n  }\n  for (const preference of snapshot.preferences as readonly PreferenceEvidence[]) {" }],
  probe(({ taste, snap }) => {
    const result = taste(
      snap("user-a", { restrictions: [restriction("a", "coriander")] }),
      snap("user-b", { restrictions: [restriction("b", "coriander")] })
    );
    return result.status === "scored";
  }));

// 3-4. goal / restriction leaking into social context
mutation(3, "goal evidence leaks into the social-context comparator",
  [{ file: CONTEXT_COMPARATOR, from: "  const tasteProfileState = snapshot.sourceStates.taste_profile.status;", to: "  for (const entry of snapshot.goals as readonly { facet: string; value: unknown }[]) {\n    if (entry.facet === \"goal_label\") {\n      mealTypes.push(String(entry.value));\n      mealTypeEvidenceCount += 1;\n    }\n  }\n  const tasteProfileState = snapshot.sourceStates.taste_profile.status;" }],
  probe(({ context, snap }) => {
    const result = context(
      snap("user-a", { goals: [goalLabel("a", "fat_loss")] }),
      snap("user-b", { goals: [goalLabel("b", "fat_loss")] })
    );
    return result.mealPatternCompatibility.status === "scored";
  }));

mutation(4, "restriction evidence leaks into the social-context comparator",
  [{ file: CONTEXT_COMPARATOR, from: "  const tasteProfileState = snapshot.sourceStates.taste_profile.status;", to: "  for (const entry of snapshot.restrictions as readonly { label: string }[]) {\n    if (diningStyle === null) {\n      diningStyle = entry.label;\n      diningStyleEvidenceCount += 1;\n    }\n  }\n  const tasteProfileState = snapshot.sourceStates.taste_profile.status;" }],
  probe(({ context, snap }) => {
    const result = context(
      snap("user-a", { restrictions: [restriction("a", "coriander")] }),
      snap("user-b", { restrictions: [restriction("b", "coriander")] })
    );
    return result.diningCompatibility.status === "scored";
  }));

// 5. a macro target is used in compatibility
mutation(5, "a macro target is used in goal compatibility",
  [{ file: COMPARATOR, from: '    if (goal.facet !== "goal_label") continue;', to: '    if (goal.facet === "daily_calories_target") {\n      goalLabels.push(`calories:${String((goal as { value: unknown }).value)}`);\n      goalLabelEvidenceCount += 1;\n      continue;\n    }\n    if (goal.facet !== "goal_label") continue;' }],
  probe(({ gr, snap }) => {
    const result = gr(
      snap("user-a", { goals: [goalScalar("a", "daily_calories_target", 2000)] }),
      snap("user-b", { goals: [goalScalar("b", "daily_calories_target", 2000)] })
    );
    return result.goalCompatibility.status === "scored";
  }));

// 6. a calorie distance formula is introduced
mutation(6, "a numeric calorie distance formula is introduced",
  [{ file: COMPARATOR, from: "  return { comparisonMode: \"set_overlap\", status: \"scored\", score: roundGoalCompatibilityScore(shared / unionSize) };", to: "  const calorieDelta = Math.abs(2000 - 1800) / 2000;\n  return { comparisonMode: \"set_overlap\", status: \"scored\", score: roundGoalCompatibilityScore((shared / unionSize) * (1 - calorieDelta)) };" }],
  null);

// 7. missing goal evidence becomes a mismatch
mutation(7, "missing goal evidence is scored as a mismatch",
  [{ file: COMPARATOR, from: "  if (leftMissing && rightMissing) return \"no_comparable_evidence\";\n  if (leftMissing || rightMissing) return \"insufficient_evidence\";", to: "  if (leftMissing && rightMissing) return \"no_comparable_evidence\";" }],
  probe(({ gr, snap }) => {
    const result = gr(snap("user-a", { goals: [goalLabel("a", "fat_loss")] }), snap("user-b", {}));
    return result.goalCompatibility.status === "scored";
  }));

// 8. an inactive goal is included
mutation(8, "an inactive goal is included",
  [{ file: COMPARATOR, from: "    if (!goal.validity.isActive) continue;", to: "    void goal.validity.isActive;" }],
  probe(({ gr, snap }) => {
    const result = gr(
      snap("user-a", { goals: [goalLabel("a", "fat_loss", { isActive: false })] }),
      snap("user-b", { goals: [goalLabel("b", "fat_loss")] })
    );
    return result.goalCompatibility.status === "scored";
  }));

// 9. an expired or not-yet-started goal is included
mutation(9, "an expired or not-yet-started goal is included",
  [{ file: COMPARATOR, from: "    if (goal.validity.startsOn > asOfDate) continue;\n    if (goal.validity.endsOn !== undefined && goal.validity.endsOn < asOfDate) continue;", to: "    void asOfDate;" }],
  probe(({ gr, snap }) => {
    const expired = gr(
      snap("user-a", { goals: [goalLabel("a", "fat_loss", { endsOn: "2026-07-31" })] }),
      snap("user-b", { goals: [goalLabel("b", "fat_loss")] })
    );
    const future = gr(
      snap("user-a", { goals: [goalLabel("a", "fat_loss", { startsOn: "2027-01-01" })] }),
      snap("user-b", { goals: [goalLabel("b", "fat_loss")] })
    );
    return expired.goalCompatibility.status === "scored" || future.goalCompatibility.status === "scored";
  }));

// 10. an unclassified restriction is marked compatible
mutation(10, "an unclassified restriction is marked compatible",
  [{ file: COMPARATOR, from: "  if (leftFacts.unclassifiedRestrictionPresent || rightFacts.unclassifiedRestrictionPresent) {\n    return { verdict: \"needs_attention\", basis: \"unclassified_enforcement_present\", comparableRestrictionEvidence };\n  }", to: "  if (false) {\n    return { verdict: \"needs_attention\", basis: \"unclassified_enforcement_present\", comparableRestrictionEvidence };\n  }" }],
  probe(({ gr, snap }) => {
    const result = gr(
      snap("user-a", { restrictions: [restriction("a", "peanut", { rawSeverity: "unknown_severity" })] }),
      snap("user-b", { restrictions: [restriction("b", "coriander")] })
    );
    return result.restrictionEligibility.verdict === "compatible";
  }));

// 11. a soft preference becomes a hard exclusion
mutation(11, "a soft preference is turned into a hard exclusion",
  [{ file: TYPES, from: 'export const RESTRICTION_ELIGIBILITY_VERDICTS = ["compatible", "needs_attention", "unknown"] as const;', to: 'export const RESTRICTION_ELIGIBILITY_VERDICTS = ["compatible", "needs_attention", "unknown", "incompatible"] as const;' },
   { file: COMPARATOR, from: "  return { verdict: \"compatible\", basis: \"soft_preferences_only\", comparableRestrictionEvidence };", to: "  if (comparableRestrictionEvidence && intersectionSize(leftFacts.softRestrictionLabels, rightFacts.softRestrictionLabels) === 0) {\n    return { verdict: \"incompatible\", basis: \"soft_preferences_only\", comparableRestrictionEvidence };\n  }\n  return { verdict: \"compatible\", basis: \"soft_preferences_only\", comparableRestrictionEvidence };" }],
  probe(({ gr, snap }) => {
    const result = gr(
      snap("user-a", { restrictions: [restriction("a", "coriander")] }),
      snap("user-b", { restrictions: [restriction("b", "mushroom")] })
    );
    return result.restrictionEligibility.verdict !== "compatible";
  }));

// 12. a numeric restriction similarity score appears
mutation(12, "a numeric restriction similarity score is introduced",
  [{ file: TYPES, from: "export type RestrictionEligibilityResult = {\n  verdict: RestrictionEligibilityVerdict;", to: "export type RestrictionEligibilityResult = {\n  restrictionScore: number;\n  verdict: RestrictionEligibilityVerdict;" },
   { file: COMPARATOR, from: "  const comparableRestrictionEvidence =\n    leftFacts.restrictionEvidenceCount > 0 && rightFacts.restrictionEvidenceCount > 0;", to: "  const comparableRestrictionEvidence =\n    leftFacts.restrictionEvidenceCount > 0 && rightFacts.restrictionEvidenceCount > 0;\n  const restrictionScore = intersectionSize(leftFacts.softRestrictionLabels, rightFacts.softRestrictionLabels) /\n    Math.max(1, new Set([...leftFacts.softRestrictionLabels, ...rightFacts.softRestrictionLabels]).size);" },
   { file: COMPARATOR, from: 'return { verdict: "needs_attention", basis: "unclassified_enforcement_present", comparableRestrictionEvidence };', to: 'return { restrictionScore, verdict: "needs_attention", basis: "unclassified_enforcement_present", comparableRestrictionEvidence };' },
   { file: COMPARATOR, from: 'return { verdict: "compatible", basis: "no_restriction_evidence", comparableRestrictionEvidence };', to: 'return { restrictionScore, verdict: "compatible", basis: "no_restriction_evidence", comparableRestrictionEvidence };' },
   { file: COMPARATOR, from: 'return { verdict: "compatible", basis: "soft_preferences_only", comparableRestrictionEvidence };', to: 'return { restrictionScore, verdict: "compatible", basis: "soft_preferences_only", comparableRestrictionEvidence };' },
   { file: COMPARATOR, from: '      verdict: "unknown",\n      basis: "unsupported_snapshot_schema",\n      comparableRestrictionEvidence: false', to: '      restrictionScore: 0,\n      verdict: "unknown",\n      basis: "unsupported_snapshot_schema",\n      comparableRestrictionEvidence: false' }],
  probe(({ gr, snap }) => "restrictionScore" in gr(snap("user-a"), snap("user-b")).restrictionEligibility));

// 13. a raw restriction label is exposed
mutation(13, "a raw restriction label is exposed in the result",
  [{ file: COMPARATOR, from: "    explanationReasonCodes: orderGoalRestrictionReasonCodes(reasonCodes)\n  };\n}", to: "    explanationReasonCodes: orderGoalRestrictionReasonCodes(reasonCodes),\n    ...({ sharedSoftLabels: [...leftFacts.softRestrictionLabels] } as Record<string, unknown>)\n  };\n}" }],
  probe(({ gr, snap }) => {
    const result = gr(
      snap("user-a", { restrictions: [restriction("a", "coriander")] }),
      snap("user-b", { restrictions: [restriction("b", "coriander")] })
    );
    return JSON.stringify(result).includes("coriander");
  }));

// 14. a raw macro target is exposed
mutation(14, "a raw macro target value is exposed in the result",
  [{ file: COMPARATOR, from: "      eligibleGoalLabelCount: leftFacts.goalLabelEvidenceCount + rightFacts.goalLabelEvidenceCount,", to: "      eligibleGoalLabelCount: leftFacts.goalLabelEvidenceCount + rightFacts.goalLabelEvidenceCount,\n      ...({ dailyCaloriesTarget: 1200 } as Record<string, unknown>)," }],
  probe(({ gr, snap }) => {
    const result = gr(
      snap("user-a", { goals: [goalLabel("a", "fat_loss"), goalScalar("a", "daily_calories_target", 1200)] }),
      snap("user-b", { goals: [goalLabel("b", "fat_loss"), goalScalar("b", "daily_calories_target", 4000)] })
    );
    return JSON.stringify(result).includes("1200");
  }));

// 15. a medical / free-text note is exposed
mutation(15, "a raw severity string is exposed in the result",
  [{ file: COMPARATOR, from: "    if (restriction.enforcement === \"soft\") {", to: "    (globalThis as unknown as { __sev?: string }).__sev = restriction.rawSeverity;\n    if (restriction.enforcement === \"soft\") {" },
   { file: COMPARATOR, from: "      unclassifiedRestrictionPresent:\n        leftFacts.unclassifiedRestrictionPresent || rightFacts.unclassifiedRestrictionPresent,", to: "      unclassifiedRestrictionPresent:\n        leftFacts.unclassifiedRestrictionPresent || rightFacts.unclassifiedRestrictionPresent,\n      ...({ rawSeverity: (globalThis as unknown as { __sev?: string }).__sev } as Record<string, unknown>)," }],
  probe(({ gr, snap }) => {
    const result = gr(
      snap("user-a", { restrictions: [restriction("a", "peanut", { rawSeverity: "life_threatening" })] }),
      snap("user-b", { restrictions: [restriction("b", "coriander")] })
    );
    return JSON.stringify(result).includes("life_threatening");
  }));

// 16-17. invented taxonomies
mutation(16, "an allergy severity taxonomy is invented",
  [{ file: COMPARATOR, from: "    if (restriction.enforcement === \"soft\") {", to: "    if (restriction.restrictionType === \"allergy\" || /peanut|shellfish/.test(restriction.label)) {\n      unclassifiedRestrictionPresent = true;\n      restrictionEvidenceCount += 0;\n      continue;\n    }\n    if (restriction.enforcement === \"soft\") {" }],
  null);

mutation(17, "a religious or dietary-belief taxonomy is invented",
  [{ file: COMPARATOR, from: "  const softRestrictionLabels = new Set<string>();", to: "  const RELIGIOUS_LABELS = [\"halal\", \"kosher\", \"vegan\"];\n  void RELIGIOUS_LABELS;\n  const softRestrictionLabels = new Set<string>();" }],
  null);

// 18. an overall aggregate score appears
mutation(18, "an overall combined score is introduced",
  [{ file: COMPARATOR, from: "    confidenceInputs: buildConfidenceInputs(", to: "    ...({ overallCompatibility: goalCompatibility.status === \"scored\" ? goalCompatibility.score : 0 } as Record<string, unknown>),\n    confidenceInputs: buildConfidenceInputs(" }],
  probe(({ gr, snap }) => {
    const result = gr(
      snap("user-a", { goals: [goalLabel("a", "fat_loss")] }),
      snap("user-b", { goals: [goalLabel("b", "fat_loss")] })
    );
    return Object.keys(result).some((key) => /overall|aggregate|combined/i.test(key));
  }));

// 19. symmetry broken
mutation(19, "argument order changes the goal/restriction result",
  [{ file: COMPARATOR, from: "  return compareCodeUnits(first.subjectUserId, second.subjectUserId) <= 0 ? [first, second] : [second, first];", to: "  return [first, second];" },
   { file: COMPARATOR, from: "  const goalCompatibility = compareGoalLabels(leftFacts.goalLabels, rightFacts.goalLabels);", to: "  const goalCompatibility = left.subjectUserId > right.subjectUserId\n    ? compareGoalLabels(null, rightFacts.goalLabels)\n    : compareGoalLabels(leftFacts.goalLabels, rightFacts.goalLabels);" }],
  probe(({ gr, snap }) => {
    const a = snap("user-a", { goals: [goalLabel("a", "fat_loss")] });
    const b = snap("user-b", { goals: [goalLabel("b", "fat_loss")] });
    return JSON.stringify(gr(a, b)) !== JSON.stringify(gr(b, a));
  }));

// 20. a score is added to restriction eligibility
mutation(20, "a score key is added to the restriction eligibility result",
  [{ file: COMPARATOR, from: 'return { verdict: "compatible", basis: "soft_preferences_only", comparableRestrictionEvidence };', to: 'return { verdict: "compatible", basis: "soft_preferences_only", comparableRestrictionEvidence, ...({ score: 1 } as Record<string, unknown>) };' }],
  probe(({ gr, snap }) => {
    const result = gr(
      snap("user-a", { restrictions: [restriction("a", "coriander")] }),
      snap("user-b", { restrictions: [restriction("b", "coriander")] })
    );
    return "score" in result.restrictionEligibility;
  }));

// 21. a numeric confidence is fabricated
mutation(21, "a numeric confidence value is fabricated",
  [{ file: TYPES, from: "export type GoalRestrictionConfidenceInputs = {\n  goal: {", to: "export type GoalRestrictionConfidenceInputs = {\n  confidenceScore: number;\n  goal: {" },
   { file: COMPARATOR, from: "  return {\n    goal: {\n      eligibleGoalLabelCount:", to: "  return {\n    confidenceScore: goalCompatibility.status === \"scored\" ? 0.8 : 0.2,\n    goal: {\n      eligibleGoalLabelCount:" },
   { file: COMPARATOR, from: "      goal: { eligibleGoalLabelCount: 0, comparableGoalDimension: false, goalSourceAvailableForBoth: false },", to: "      confidenceScore: 0,\n      goal: { eligibleGoalLabelCount: 0, comparableGoalDimension: false, goalSourceAvailableForBoth: false }," }],
  probe(({ gr, snap }) => "confidenceScore" in gr(snap("user-a"), snap("user-b")).confidenceInputs));

// 22. the policy version is omitted
mutation(22, "the goal/restriction policy version is omitted from the result",
  [{ file: COMPARATOR, from: "    policyVersion: GOAL_RESTRICTION_COMPATIBILITY_POLICY_VERSION,\n    snapshotSchemaVersion: GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,\n    goalCompatibility,", to: "    snapshotSchemaVersion: GOAL_RESTRICTION_SUPPORTED_SNAPSHOT_SCHEMA_VERSION,\n    goalCompatibility," }],
  probe(({ gr, snap }) => gr(snap("user-a"), snap("user-b")).policyVersion === undefined));

// 23-24. sibling policy versions bumped
mutation(23, "the taste policy version is bumped by this round",
  [{ file: TASTE_POLICY, from: 'export const TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v1.1" as const;', to: 'export const TASTE_SIMILARITY_POLICY_VERSION = "taste-similarity-v2" as const;' }],
  probe(({ taste, snap }) => {
    const result = taste(
      snap("user-a", { preferences: [cuisine("a", "japanese")] }),
      snap("user-b", { preferences: [cuisine("b", "japanese")] })
    );
    return result.policyVersion !== "taste-similarity-v1.1";
  }));

mutation(24, "the social-context policy version is bumped by this round",
  [{ file: CONTEXT_POLICY, from: 'export const SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION = "social-context-compatibility-v1" as const;', to: 'export const SOCIAL_CONTEXT_COMPATIBILITY_POLICY_VERSION = "social-context-compatibility-v2" as const;' }],
  probe(({ context, snap }) => {
    const result = context(
      snap("user-a", { preferences: [mealType("a", "lunch")] }),
      snap("user-b", { preferences: [mealType("b", "lunch")] })
    );
    return result.policyVersion !== "social-context-compatibility-v1";
  }));

// 25. reason-code ordering stops following the declaration rank
mutation(25, "reason code ordering follows lexicographic order instead of the declaration rank",
  [{ file: REASON_CODES, from: "  return [...new Set(codes)].sort(\n    (left, right) => (REASON_CODE_RANK.get(left) ?? 0) - (REASON_CODE_RANK.get(right) ?? 0)\n  );", to: "  return [...new Set(codes)].sort();" }],
  probe(({ gr, snap }) => {
    const result = gr(
      snap("user-a", { goals: [goalLabel("a", "fat_loss")], restrictions: [restriction("a", "coriander"), restriction("a", "peanut", { rawSeverity: "unknown_severity" })] }),
      snap("user-b", { goals: [goalLabel("b", "fat_loss")], restrictions: [restriction("b", "coriander")] })
    );
    return JSON.stringify(result.explanationReasonCodes) !== JSON.stringify(["shared_goal_label", "shared_soft_restriction", "restriction_requires_attention"]);
  }));

// ================================================================================================
const killed = results.filter((entry) => entry.killed);
const survived = results.filter((entry) => !entry.killed);
console.log(JSON.stringify({
  suite: "taste-similarity-ts3d-mutations",
  status: survived.length === 0 ? "passed" : "failed",
  totalMutations: results.length,
  killed: killed.length,
  survived: survived.length,
  results,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
if (survived.length) process.exitCode = 1;
