#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authorityPath = "docs/runtime-integration-phase-2v-e/p2v-perf-001b-c01-remediation-authority.json";
const contractPath = "docs/runtime-integration-phase-2v-e/p2v-perf-001b-c01-remediation-contract.md";
const guardPath = "scripts/restaurant-performance-p2v-perf-001b-c01-remediation-guard.mjs";
const candidates = [authorityPath, contractPath, guardPath].sort();
const baselineHead = "3c36c5c64d6b02b8da807f5715d67065ba3f7de6";
const onlyFutureMigration = "supabase/migrations/20260722010000_cache_restaurant_current_access_context_plan.sql";
const authoritySha = "f7babca2616f5a901a6c5946770029a39630e46f2e168977fa0b31e82abc4430";
const contractSha = "fac68f9258e8a58fcba6392e61e59274ce39efd57aca386c0d477904127b8a5c";

const frozen = {
  baseContract: ["docs/runtime-integration-phase-2v-e/performance-and-query-plan-contract.md", "81af13e4078a7ed820a7088472ab449b00bc50514fdeef11fdeaecc4170e28f2"],
  baseAuthority: ["docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json", "4bfc94a5085a537c3faff97deb8329800f8171e506cbe37c0308a66035a24ade"],
  baseGuard: ["scripts/restaurant-performance-p2v-perf-001a-authority-guard.mjs", "dc18308ff9735fabf266cef0f4591a34bf099bf2527753146000baddee319292"],
  planMachineAuthority: ["docs/runtime-integration-phase-2v-e/p2v-perf-001-plan-metric-semantics-authority.json", "ce9236f9a5855b041fa9edb8dc667378e8303168a12b782a1a52510cf1a22067"],
  planMarkdown: ["docs/runtime-integration-phase-2v-e/p2v-perf-001-plan-metric-semantics-contract.md", "a9429e148c7bbfdb3e13465847a8ef60aafbc8d864344ce8dae8b67fa09ab7c4"],
  planGuard: ["scripts/restaurant-performance-p2v-perf-001a-d1-plan-metric-semantics-guard.mjs", "137744cc9282333c691a22e206bec04e32fd540015cc7e6b303f218917687f00"],
  datasetAuthority: ["docs/runtime-integration-phase-2v-e/p2v-perf-001-dataset-semantics-authority.json", "a9b6c7669291c6ae8ebd1e09fa50c412c3b5c651b0ba3b511f783f8f4afe4a9f"],
  datasetMarkdown: ["docs/runtime-integration-phase-2v-e/p2v-perf-001-dataset-semantics-contract.md", "f1b8bd99629e98a2bbf244060bc2c1034942a1e6f687b9137f3778941e17c4d4"],
  datasetGuard: ["scripts/restaurant-performance-p2v-perf-001b-dataset-semantics-guard.mjs", "ac7da82a0870b490e39ad0a953c32ddac66b819ca03058b110ef4ea6ea724601"]
};

const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const clone = value => JSON.parse(JSON.stringify(value));
const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && same(Object.keys(value).sort(), [...keys].sort());
const git = (args, allowFailure = false) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result;
};

const selfPath = fileURLToPath(import.meta.url);
const expectedSelfIndexes = process.argv.map((value, index) => value === "--expected-self-sha256" ? index : -1).filter(index => index >= 0);
if (expectedSelfIndexes.length !== 1) {
  console.error("FAIL self SHA argument --expected-self-sha256 is mandatory exactly once");
  process.exit(1);
}
const expectedSelfSha = process.argv[expectedSelfIndexes[0] + 1];
if (typeof expectedSelfSha !== "string" || !/^[0-9a-f]{64}$/.test(expectedSelfSha)) {
  console.error("FAIL self SHA argument must be exactly 64 lowercase hexadecimal characters");
  process.exit(1);
}
const actualSelfSha = sha(fs.readFileSync(selfPath));
if (actualSelfSha !== expectedSelfSha) {
  console.error(`FAIL self SHA mismatch expected=${expectedSelfSha} actual=${actualSelfSha}`);
  process.exit(1);
}
console.log(`VERIFIED SELF SHA256 ${actualSelfSha}`);

let authority;
try {
  authority = JSON.parse(read(authorityPath));
} catch (error) {
  console.error(`FAIL authority JSON parse ${error.message}`);
  process.exit(1);
}
const contract = read(contractPath);

function validateAuthority(a) {
  const issues = [];
  const add = (condition, code) => { if (!condition) issues.push(code); };
  add(exactKeys(a, ["schema", "version", "authorizationId", "status", "candidateBaseline", "candidateInventory", "frozenBindings", "rootCauseEvidence", "runnerCorrection", "measurementContract", "runtimeRemediationAuthorization", "preservedFunctionInvariants", "evidenceSemantics", "guardSelfIntegrity", "postImplementationVerification", "prohibitions", "lifecycle"]), "top-level-schema");
  add(a.schema === "tastkind.p2v-perf.c01-remediation-authorization" && a.version === 1 && a.authorizationId === "P2V-PERF-001B-C01-REMEDIATION-A1" && a.status === "candidate-for-independent-d2-review-runtime-remediation-not-authorized", "identity");
  const b = a.candidateBaseline;
  add(exactKeys(b, ["branch", "head", "migrationCount", "bindingScope", "postFreezeRule"]) && b.branch === "main" && b.head === baselineHead && b.migrationCount === 41 && b.bindingScope === "candidate-preparation-only" && /not a runtime implementation baseline or permission/.test(b.postFreezeRule), "candidate-baseline");
  add(same([...a.candidateInventory].sort(), candidates), "candidate-inventory-binding");
  add(exactKeys(a.frozenBindings, Object.keys(frozen)) && Object.entries(frozen).every(([key, [file, digest]]) => exactKeys(a.frozenBindings[key], ["path", "sha256"]) && a.frozenBindings[key].path === file && a.frozenBindings[key].sha256 === digest), "nine-frozen-bindings");

  const r = a.rootCauseEvidence;
  add(exactKeys(r, ["caseId", "track", "oldRunner", "persistentSessionResult", "sharedHitAttribution", "functionDiagnosis", "ruledOut"]) && r.caseId === "C01" && r.track === "outer", "root-cause-schema");
  add(exactKeys(r?.oldRunner, ["sessionPolicy", "sharedHitBlocksApproximate", "executionTimeMsRange", "disposition"]) && r.oldRunner.sessionPolicy === "new-database-session-per-measured-run" && r.oldRunner.sharedHitBlocksApproximate === 1949 && same(r.oldRunner.executionTimeMsRange, [31, 42]), "old-runner-metrics");
  add(exactKeys(r?.persistentSessionResult, ["warmMedianMs", "warmMaximumMs", "sharedHitBlocks"]) && exactKeys(r.persistentSessionResult.warmMedianMs, ["actual", "limit", "pass"]) && exactKeys(r.persistentSessionResult.warmMaximumMs, ["actual", "limit", "pass"]) && exactKeys(r.persistentSessionResult.sharedHitBlocks, ["actual", "limit", "pass"]), "persistent-metric-schema");
  add(same(r?.persistentSessionResult?.warmMedianMs, { actual: 17.076, limit: 15, pass: false }) && same(r?.persistentSessionResult?.warmMaximumMs, { actual: 17.471, limit: 25, pass: true }) && same(r?.persistentSessionResult?.sharedHitBlocks, { actual: 842, limit: 256, pass: false }), "persistent-metrics");
  const attribution = r?.sharedHitAttribution;
  add(exactKeys(attribution, ["total", "rlsExpandedInnerPlanning", "innerExecution", "equation"]) && attribution.total === 842 && attribution.rlsExpandedInnerPlanning === 790 && attribution.innerExecution === 52 && attribution.total === attribution.rlsExpandedInnerPlanning + attribution.innerExecution && attribution.equation === "842 = 790 + 52", "842-attribution");
  const diagnosis = r?.functionDiagnosis;
  add(exactKeys(diagnosis, ["name", "currentLanguage", "security", "forceRlsPlanNodes", "cause"]) && diagnosis.name === "restaurant_current_access_context_v1()" && diagnosis.currentLanguage === "sql" && diagnosis.security === "SECURITY DEFINER" && diagnosis.forceRlsPlanNodes === 96 && /re-plans/.test(diagnosis.cause), "function-diagnosis");
  add(same(r?.ruledOut, ["missing-index", "unused-index", "statistics-defect", "selectivity-defect", "excessive-data-access"]), "ruled-out-causes");

  const runner = a.runnerCorrection;
  const requiredSequence = ["cold", "warmup-1", "warmup-2", "measured-1", "measured-2", "measured-3", "measured-4", "measured-5", "measured-6", "measured-7"];
  add(exactKeys(runner, ["tracks", "sessionIsolation", "sequencePerTrackSession", "sameSessionRequired", "coldDefinition", "connectionRule", "outerIsAuthoritative", "innerMayReplaceOuter", "failureRule"]) && same(runner.tracks, ["outer", "inner"]) && same(runner.sequencePerTrackSession, requiredSequence) && runner.sameSessionRequired === true && /first formal invocation/.test(runner.coldDefinition) && /not an OS-cache-cold/.test(runner.coldDefinition) && /No measured run may create a new connection or backend/.test(runner.connectionRule) && runner.outerIsAuthoritative === true && runner.innerMayReplaceOuter === false && /outer-track failure remains/.test(runner.failureRule), "persistent-session-runner");

  const measurement = a.measurementContract;
  const bufferFields = ["Shared Hit Blocks", "Shared Read Blocks", "Shared Dirtied Blocks", "Shared Written Blocks", "Local Hit Blocks", "Local Read Blocks", "Local Dirtied Blocks", "Local Written Blocks", "Temp Read Blocks", "Temp Written Blocks"];
  add(exactKeys(measurement, ["postgresServerPlanningTime", "postgresServerExecutionTime", "executionBuffers", "planningBuffers", "clientWallTime", "outerWarmExecutionSummaries", "planningSummary", "metricSeparation"]), "measurement-schema");
  const planningTime = measurement?.postgresServerPlanningTime;
  add(exactKeys(planningTime, ["field", "source", "unit", "classification", "separationRule"]) && planningTime.field === "Planning Time" && /top-level EXPLAIN/.test(planningTime.source) && planningTime.unit === "ms" && /server planning only/.test(planningTime.classification) && /Never add/.test(planningTime.separationRule), "server-planning-time");
  const executionTime = measurement?.postgresServerExecutionTime;
  add(exactKeys(executionTime, ["field", "source", "unit", "classification", "outerFunctionScanRule", "separationRule"]) && executionTime.field === "Execution Time" && /top-level EXPLAIN/.test(executionTime.source) && executionTime.unit === "ms" && /server execution only/.test(executionTime.classification) && /inner planning/.test(executionTime.outerFunctionScanRule) && /never reclassified as client overhead/.test(executionTime.outerFunctionScanRule) && /Never add/.test(executionTime.separationRule), "server-execution-time");
  const executionBuffers = measurement?.executionBuffers;
  add(exactKeys(executionBuffers, ["source", "rawFields", "rawRunRule", "summaryRules"]) && /top-level Plan object/.test(executionBuffers.source) && same(executionBuffers.rawFields, bufferFields) && /cold run and each of the seven measured runs/.test(executionBuffers.rawRunRule) && exactKeys(executionBuffers.summaryRules, ["maxSharedHitBlocks", "maxColdReadBlocks", "maxWarmReadBlocks", "localAndTempLimits"]), "execution-buffer-contract");
  const planningBuffers = measurement?.planningBuffers;
  add(exactKeys(planningBuffers, ["source", "rawFields", "separationRule"]) && /top-level Planning object/.test(planningBuffers.source) && same(planningBuffers.rawFields, bufferFields) && /never add/.test(planningBuffers.separationRule), "planning-buffer-contract");
  const clientWall = measurement?.clientWallTime;
  add(exactKeys(clientWall, ["field", "source", "unit", "includes", "thresholdRole", "separationRule"]) && clientWall.field === "clientWallTimeMs" && /monotonic clock/.test(clientWall.source) && clientWall.unit === "ms" && same(clientWall.includes, ["client overhead", "libpq overhead", "serialization overhead", "server round trip"]) && clientWall.thresholdRole === "diagnostic-only-never-substitutes-for-Frozen-server-thresholds", "client-wall-time");
  const warm = measurement?.outerWarmExecutionSummaries;
  add(exactKeys(warm, ["sourceTrack", "sourceSession", "sourceField", "sourceRuns", "warmMedianMs", "warmMaximumMs", "excluded", "outerFailureRule"]) && warm.sourceTrack === "outer" && warm.sourceSession === "the same outer persistent session" && warm.sourceField === "PostgreSQL top-level EXPLAIN JSON Execution Time" && same(warm.sourceRuns, requiredSequence.slice(3)) && /median/.test(warm.warmMedianMs) && /maximum/.test(warm.warmMaximumMs) && same(warm.excluded, ["cold", "warmup-1", "warmup-2", "clientWallTimeMs", "inner Execution Time"]) && /never replaces/.test(warm.outerFailureRule), "outer-warm-execution-summary");
  add(/maximum Planning Time/.test(measurement?.planningSummary ?? "") && /distinct evidence classes/.test(measurement?.metricSeparation ?? ""), "measurement-separation");

  const remediation = a.runtimeRemediationAuthorization;
  add(exactKeys(remediation, ["authorizationState", "onlyFutureRuntimeCandidate", "candidateCount", "migrationOperation", "function", "languageBefore", "languageAfter", "bodyForm", "purpose", "noTrialAlternatives"]) && remediation.authorizationState === "deferred-until-independent-d2-review-and-freeze" && remediation.onlyFutureRuntimeCandidate === onlyFutureMigration && remediation.candidateCount === 1 && remediation.migrationOperation === "CREATE OR REPLACE FUNCTION" && remediation.function === "restaurant_current_access_context_v1()" && remediation.languageBefore === "sql" && remediation.languageAfter === "plpgsql" && remediation.bodyForm === "static RETURN QUERY" && /plan caching/.test(remediation.purpose) && remediation.noTrialAlternatives === true, "sole-remediation-direction");

  const p = a.preservedFunctionInvariants;
  add(exactKeys(p, ["functionIdentity", "completeSignature", "identityArguments", "returnSemantics", "returnsSet", "returnColumns", "returnOrderRule", "catalogEquivalenceEvidence", "volatility", "security", "parallel", "cost", "rows", "rowsAdjustmentRule", "searchPath", "rowSecurity", "owner", "executeAcl", "ownerBypassRls", "rlsPolicies", "tenantPredicates", "denialSemantics"]), "preservation-schema");
  const expectedReturnNames = ["restaurant_id", "role_key", "permission_key", "permission_scope", "branch_id"];
  const returnColumnsValid = Array.isArray(p?.returnColumns) && p.returnColumns.length === 5 && p.returnColumns.every((column, index) => exactKeys(column, ["ordinal", "name", "declaredType", "schemaQualifiedType", "typmod", "array", "enum", "domain"]) && column.ordinal === index + 1 && column.name === expectedReturnNames[index] && column.declaredType === "text" && column.schemaQualifiedType === "pg_catalog.text" && column.typmod === -1 && column.array === false && column.enum === false && column.domain === false);
  const catalog = p?.catalogEquivalenceEvidence;
  const requiredCatalogEvidence = ["pg_get_function_identity_arguments", "pg_get_function_result", "pg_get_function_arguments", "pg_proc.proretset", "pg_proc.prorettype", "pg_proc.proallargtypes", "pg_proc.proargmodes", "pg_proc.proargnames", "pg_type schema-qualified identities for every return type"];
  add(p?.functionIdentity === "public.restaurant_current_access_context_v1()" && p.completeSignature === "public.restaurant_current_access_context_v1()" && p.identityArguments === "" && p.returnSemantics === "RETURNS TABLE" && p.returnsSet === true && returnColumnsValid && /ordinal remains/.test(p.returnOrderRule), "return-shape-preservation");
  add(exactKeys(catalog, ["requiredBeforeAndAfter", "expectedIdentityArguments", "expectedFunctionResult", "expectedFunctionArguments", "expectedProretset", "expectedProrettype", "expectedProallargtypes", "expectedProargmodes", "expectedProargnames", "comparisonRule"]) && same(catalog.requiredBeforeAndAfter, requiredCatalogEvidence) && catalog.expectedIdentityArguments === "" && catalog.expectedFunctionResult === "TABLE(restaurant_id text, role_key text, permission_key text, permission_scope text, branch_id text)" && catalog.expectedFunctionArguments === "" && catalog.expectedProretset === true && catalog.expectedProrettype === "pg_catalog.record" && same(catalog.expectedProallargtypes, Array(5).fill("pg_catalog.text")) && same(catalog.expectedProargmodes, Array(5).fill("t")) && same(catalog.expectedProargnames, expectedReturnNames) && /exact equality/.test(catalog.comparisonRule), "catalog-equivalence-preservation");
  add(p?.volatility === "STABLE" && p.security === "SECURITY DEFINER" && p.parallel === "PARALLEL UNSAFE" && p.cost === 100 && p.rows === 1000 && p.rowsAdjustmentRule === "forbidden-unless-separately-authorized-by-independent-evidence" && p.searchPath === "empty" && p.rowSecurity === "on" && p.owner === "unchanged" && p.executeAcl === "unchanged" && p.ownerBypassRls === false && p.rlsPolicies === "unchanged" && p.tenantPredicates === "unchanged" && p.denialSemantics === "unchanged", "preservation-values");

  const e = a.evidenceSemantics;
  add(exactKeys(e, ["innerExecutionSharedHits", "classification", "requiredEnvironment", "measurementRequired", "thresholds", "failureDisposition", "failureProhibitions"]) && e.innerExecutionSharedHits === 52 && e.classification === "diagnosis-derived-expectation-not-pass-evidence" && e.requiredEnvironment === "fresh-isolated-local-PostgreSQL-17.6" && e.measurementRequired === true && e.thresholds === "all-original-Frozen-thresholds-unchanged" && e.failureDisposition === "fail-closed" && same(e.failureProhibitions, ["semantic-change", "index-addition-or-change", "threshold-relaxation", "RLS-bypass"]), "evidence-not-predeclared-pass");

  const selfIntegrity = a.guardSelfIntegrity;
  add(exactKeys(selfIntegrity, ["argument", "mandatory", "format", "digestTarget", "verificationOrder", "mismatchDisposition", "successOutput", "reviewInvocation", "trustAnchorRule", "circularHashProhibition"]) && selfIntegrity.argument === "--expected-self-sha256" && selfIntegrity.mandatory === true && selfIntegrity.format === "exactly 64 lowercase hexadecimal characters" && /actual bytes/.test(selfIntegrity.digestTarget) && /before authority parsing/.test(selfIntegrity.verificationOrder) && selfIntegrity.mismatchDisposition === "exit-nonzero-before-semantic-checks" && /verified self SHA-256/.test(selfIntegrity.successOutput) && /--expected-self-sha256 <64-lowercase-hex-digest>/.test(selfIntegrity.reviewInvocation) && /external digest/.test(selfIntegrity.trustAnchorRule) && /Do not hard-code/.test(selfIntegrity.circularHashProhibition), "guard-self-integrity-contract");

  const verification = a.postImplementationVerification;
  const coverage = ["C01-outer-and-inner", "C02-outer-and-inner", "D01-D10-denial", "A05-multi-tenant-portfolio", "disabled-actors", "inactive-actors", "suspended-actors", "revoked-actors", "branch-scope-isolation", "function-owner", "function-execute-ACL", "all-function-metadata", "41-existing-migrations-plus-authorized-new-migration-full-rebuild", "historical-guards-and-smokes", "dataset-determinism", "all-nine-Frozen-hashes"];
  add(exactKeys(verification, ["freshPostgresSuites", "postgresVersion", "cases", "thresholdProfiles", "requiredCoverage", "allMandatory"]) && verification.freshPostgresSuites === 2 && verification.postgresVersion === "17.6" && verification.cases === 35 && verification.thresholdProfiles === 9 && same(verification.requiredCoverage, coverage) && verification.allMandatory === true, "full-revalidation");

  const prohibitions = ["runtime-remediation-in-this-candidate-phase", "additional-candidate", "threshold-change", "dataset-size-or-semantics-change", "RLS-policy-or-predicate-change", "grant-or-ACL-change", "index-change", "schema-change-other-than-the-later-authorized-function-replacement", "application-change", "package-or-lockfile-change", "development-or-production-connection", "reuse-of-stale-performance-evidence", "outer-result-replacement-by-inner-result"];
  add(same(a.prohibitions, prohibitions), "prohibitions");
  const lifecycle = a.lifecycle;
  add(exactKeys(lifecycle, ["currentPhase", "nextPermittedGate", "freezeAutomatic", "implementationAutomatic", "b1RetryAutomatic"]) && lifecycle.currentPhase === "authorization-candidate-preparation-only" && lifecycle.nextPermittedGate === "independent-d2-review" && lifecycle.freezeAutomatic === false && lifecycle.implementationAutomatic === false && lifecycle.b1RetryAutomatic === false, "lifecycle");
  return issues;
}

function validateContract(value) {
  const issues = [];
  const required = [
    "P2V-PERF-001B-C01-REMEDIATION-A1", baselineHead, "All nine Frozen files remain byte-identical",
    "1,949 shared-hit blocks", "17.076 ms against 15 ms", "17.471 ms", "842 = 790 + 52",
    "96-node FORCE-RLS-expanded", "Outer and inner tracks each use a separate persistent database session",
    "cold execution, two warm-ups, and seven measured runs", "outer result remains authoritative",
    "`Planning Time`", "`Execution Time`", "`clientWallTimeMs`", "client monotonic clock",
    "top-level `Plan` object", "top-level `Planning` object", "seven measured runs",
    onlyFutureMigration, "CREATE OR REPLACE FUNCTION", "LANGUAGE sql", "LANGUAGE plpgsql", "static `RETURN QUERY`",
    "complete zero-input signature", "`RETURNS TABLE`", "restaurant_id pg_catalog.text", "branch_id pg_catalog.text",
    "pg_get_function_identity_arguments", "pg_get_function_result", "pg_get_function_arguments", "pg_proc.proretset",
    "`STABLE`", "`SECURITY DEFINER`", "`PARALLEL UNSAFE`",
    "`COST 100`", "`ROWS 1000`", "empty `search_path`", "`row_security=on`", "owner `NOBYPASSRLS`",
    "diagnosis-derived expectation", "not pre-declared pass evidence", "fresh, isolated, local PostgreSQL 17.6 suites",
    "all 35 cases and all 9 threshold profiles", "D01–D10", "A05 multi-tenant portfolio", "independent D2 review",
    "--expected-self-sha256", "64 lowercase", "Before parsing the authority"
  ];
  if (!required.every(token => value.includes(token))) issues.push("required-cross-file-language");
  if (!candidates.every(file => value.includes(file))) issues.push("candidate-inventory-language");
  const headings = [...value.matchAll(/^## (.+)$/gm)].map(match => match[1]);
  if (!same(headings, ["Frozen composition", "Root-cause basis", "Persistent-session runner correction", "Measurement field contract", "Sole permitted remediation direction", "Evidence and fail-closed disposition", "Mandatory post-implementation verification", "Candidate lifecycle", "Guard external self-integrity"])) issues.push("contract-section-schema");
  return issues;
}

function snapshot() {
  const entries = git(["status", "--porcelain=v1", "--untracked-files=all"]).stdout.split(/\r?\n/).filter(Boolean).map(line => ({ status: line.slice(0, 2), path: line.slice(3) }));
  const protectedPaths = ["supabase/migrations", "apps", "packages", "lib", "package.json", "package-lock.json"];
  const protectedDiff = git(["diff", "--name-only", "HEAD", "--", ...protectedPaths]).stdout.split(/\r?\n/).filter(Boolean);
  return {
    branch: git(["branch", "--show-current"]).stdout.trim(),
    head: git(["rev-parse", "HEAD"]).stdout.trim(),
    staged: git(["diff", "--cached", "--quiet"], true).status !== 0,
    entries,
    protectedDiff
  };
}

function validateSnapshot(s) {
  const issues = [];
  if (s.branch !== "main") issues.push("branch");
  if (s.head !== baselineHead) issues.push("head");
  if (s.staged) issues.push("staged");
  if (!same(s.entries.map(entry => entry.path).sort(), candidates)) issues.push("candidate-inventory");
  if (s.entries.some(entry => entry.status !== "??")) issues.push("candidate-status");
  if (s.protectedDiff.length) issues.push("protected-diff");
  return issues;
}

const checks = [];
const record = (name, pass, detail) => {
  checks.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
};

const authorityIssues = validateAuthority(authority);
record("authority exact schema and all semantic bindings", authorityIssues.length === 0, authorityIssues);
record("authority byte digest exact", sha(read(authorityPath)) === authoritySha);
const contractIssues = validateContract(contract);
record("contract sections and cross-file bindings exact", contractIssues.length === 0, contractIssues);
record("contract byte digest exact", sha(contract) === contractSha);
record("all nine Frozen files are byte-identical", Object.values(frozen).every(([file, digest]) => sha(read(file)) === digest));
record("authority binds all nine Frozen paths and digests", Object.entries(frozen).every(([key, [file, digest]]) => authority.frozenBindings[key].path === file && authority.frozenBindings[key].sha256 === digest));

const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations")).filter(file => file.endsWith(".sql")).sort();
record("candidate baseline has exactly 41 migrations", migrationFiles.length === 41, migrationFiles.length);
record("authorized future migration does not exist in candidate phase", !fs.existsSync(path.join(root, onlyFutureMigration)));
record("all 41 migrations are byte-identical to candidate baseline HEAD", migrationFiles.every(file => git(["hash-object", `supabase/migrations/${file}`]).stdout.trim() === git(["rev-parse", `${baselineHead}:supabase/migrations/${file}`]).stdout.trim()));

const baseAuthority = JSON.parse(read(frozen.baseAuthority[0]));
record("Frozen workload remains 35 cases and 9 threshold profiles", baseAuthority.cases?.length === 35 && Object.keys(baseAuthority.thresholdProfiles ?? {}).length === 9);
record("root-cause metrics and 842 attribution exact", !authorityIssues.some(issue => ["old-runner-metrics", "persistent-metrics", "842-attribution", "function-diagnosis"].includes(issue)));
record("persistent-session runner and outer precedence exact", !authorityIssues.includes("persistent-session-runner"));
record("sole migration and PLpgSQL static RETURN QUERY direction exact", !authorityIssues.includes("sole-remediation-direction"));
record("function return shape metadata RLS owner ACL and denial invariants exact", !authorityIssues.some(issue => ["preservation-schema", "return-shape-preservation", "catalog-equivalence-preservation", "preservation-values"].includes(issue)));
record("52 hits is expectation and never pass evidence", !authorityIssues.includes("evidence-not-predeclared-pass") && contract.includes("not pre-declared pass evidence"));
record("two suites full 35-case 9-profile revalidation mandatory", !authorityIssues.includes("full-revalidation"));
record("threshold RLS index dataset application package changes forbidden", !authorityIssues.includes("prohibitions"));

const snap = snapshot();
const snapshotIssues = validateSnapshot(snap);
record("branch HEAD staging exact inventory and protected paths", snapshotIssues.length === 0, snapshotIssues);

const candidateText = candidates.map(read).join("\n");
const credentialPatterns = [
  /postgres(?:ql)?:\/\//i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:service[_-]?role[_-]?(?:key|secret)|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*["'][^"']+/i,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/
];
record("candidate content contains no remote credential or secret material", credentialPatterns.every(pattern => !pattern.test(candidateText)));
record("candidate inventory contains no database artifact or runtime migration", candidates.every(file => !/\.(?:sql|dump|log)$/.test(file)) && !candidates.includes(onlyFutureMigration));

if (process.argv.includes("--self-test")) {
  const results = [];
  const mutation = (name, mutate, expectedIssue) => {
    const value = clone(authority);
    mutate(value);
    const pass = validateAuthority(value).includes(expectedIssue);
    results.push(pass);
    console.log(`${pass ? "PASS" : "FAIL"} SELFTEST ${name}`);
  };
  mutation("missing top-level field rejected", value => { delete value.runnerCorrection; }, "top-level-schema");
  mutation("extra top-level field rejected", value => { value.extra = true; }, "top-level-schema");
  mutation("extra nested field rejected", value => { value.candidateBaseline.extra = true; }, "candidate-baseline");
  mutation("wrong Frozen hash rejected", value => { value.frozenBindings.baseContract.sha256 = "0".repeat(64); }, "nine-frozen-bindings");
  mutation("842 decomposition contradiction rejected", value => { value.rootCauseEvidence.sharedHitAttribution.innerExecution = 51; }, "842-attribution");
  mutation("new session per run rejected", value => { value.runnerCorrection.sameSessionRequired = false; }, "persistent-session-runner");
  mutation("cold cache overclaim rejected", value => { value.runnerCorrection.coldDefinition = "physical buffers cleared"; }, "persistent-session-runner");
  mutation("measured reconnect allowed rejected", value => { value.runnerCorrection.connectionRule = "connections may rotate"; }, "persistent-session-runner");
  mutation("inner replacing outer rejected", value => { value.runnerCorrection.innerMayReplaceOuter = true; }, "persistent-session-runner");
  mutation("planning field confusion rejected", value => { value.measurementContract.postgresServerPlanningTime.field = "Execution Time"; }, "server-planning-time");
  mutation("outer execution reclassified as client rejected", value => { value.measurementContract.postgresServerExecutionTime.outerFunctionScanRule = "treat as client overhead"; }, "server-execution-time");
  mutation("execution buffer field missing rejected", value => { value.measurementContract.executionBuffers.rawFields.pop(); }, "execution-buffer-contract");
  mutation("planning buffers merged rejected", value => { value.measurementContract.planningBuffers.separationRule = "add to execution"; }, "planning-buffer-contract");
  mutation("client wall threshold substitution rejected", value => { value.measurementContract.clientWallTime.thresholdRole = "server-threshold"; }, "client-wall-time");
  mutation("warm summary uses inner rejected", value => { value.measurementContract.outerWarmExecutionSummaries.sourceTrack = "inner"; }, "outer-warm-execution-summary");
  mutation("warm summary includes cold rejected", value => { value.measurementContract.outerWarmExecutionSummaries.excluded.shift(); }, "outer-warm-execution-summary");
  mutation("second migration candidate rejected", value => { value.runtimeRemediationAuthorization.candidateCount = 2; }, "sole-remediation-direction");
  mutation("index remediation rejected", value => { value.runtimeRemediationAuthorization.migrationOperation = "CREATE INDEX"; }, "sole-remediation-direction");
  mutation("dynamic SQL remediation rejected", value => { value.runtimeRemediationAuthorization.bodyForm = "dynamic EXECUTE"; }, "sole-remediation-direction");
  mutation("return column type drift rejected", value => { value.preservedFunctionInvariants.returnColumns[2].schemaQualifiedType = "public.text"; }, "return-shape-preservation");
  mutation("return column order drift rejected", value => { value.preservedFunctionInvariants.returnColumns[0].ordinal = 2; }, "return-shape-preservation");
  mutation("set-returning semantics drift rejected", value => { value.preservedFunctionInvariants.returnsSet = false; }, "return-shape-preservation");
  mutation("catalog evidence removal rejected", value => { value.preservedFunctionInvariants.catalogEquivalenceEvidence.requiredBeforeAndAfter.pop(); }, "catalog-equivalence-preservation");
  mutation("ROWS metadata drift rejected", value => { value.preservedFunctionInvariants.rows = 5; }, "preservation-values");
  mutation("SECURITY DEFINER drift rejected", value => { value.preservedFunctionInvariants.security = "SECURITY INVOKER"; }, "preservation-values");
  mutation("owner preservation removal rejected", value => { value.preservedFunctionInvariants.owner = "changed"; }, "preservation-values");
  mutation("ACL preservation removal rejected", value => { value.preservedFunctionInvariants.executeAcl = "changed"; }, "preservation-values");
  mutation("RLS bypass rejected", value => { value.preservedFunctionInvariants.ownerBypassRls = true; }, "preservation-values");
  mutation("52 declared pass rejected", value => { value.evidenceSemantics.classification = "pass-evidence"; }, "evidence-not-predeclared-pass");
  mutation("self integrity contract removal rejected", value => { delete value.guardSelfIntegrity; }, "top-level-schema");
  mutation("self integrity format weakening rejected", value => { value.guardSelfIntegrity.format = "any string"; }, "guard-self-integrity-contract");
  mutation("reduced case count rejected", value => { value.postImplementationVerification.cases = 34; }, "full-revalidation");
  mutation("reduced profile count rejected", value => { value.postImplementationVerification.thresholdProfiles = 8; }, "full-revalidation");
  mutation("missing denial coverage rejected", value => { value.postImplementationVerification.requiredCoverage.splice(2, 1); }, "full-revalidation");
  mutation("threshold prohibition removal rejected", value => { value.prohibitions.splice(2, 1); }, "prohibitions");
  const extraSnapshot = clone(snap);
  extraSnapshot.entries.push({ status: "??", path: "fourth-candidate.txt" });
  const extraPass = validateSnapshot(extraSnapshot).includes("candidate-inventory");
  results.push(extraPass);
  console.log(`${extraPass ? "PASS" : "FAIL"} SELFTEST fourth candidate rejected`);
  const stagedSnapshot = clone(snap);
  stagedSnapshot.staged = true;
  const stagedPass = validateSnapshot(stagedSnapshot).includes("staged");
  results.push(stagedPass);
  console.log(`${stagedPass ? "PASS" : "FAIL"} SELFTEST staged diff rejected`);
  const digestPass = sha(read(authorityPath) + " ") !== authoritySha && sha(contract + " ") !== contractSha;
  results.push(digestPass);
  console.log(`${digestPass ? "PASS" : "FAIL"} SELFTEST candidate byte mutation rejected by digest`);
  console.log(`SELFTEST RESULT ${results.filter(Boolean).length}/${results.length} ${results.every(Boolean) ? "PASS" : "FAIL"}`);
  if (!results.every(Boolean)) process.exitCode = 1;
}

const failed = checks.filter(check => !check.pass);
console.log(`RESULT ${checks.length - failed.length}/${checks.length} ${failed.length ? "FAIL" : "PASS"}`);
if (failed.length) process.exitCode = 1;
