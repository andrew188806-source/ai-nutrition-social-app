#!/usr/bin/env node
// SR-1D adversarial mutations are applied in memory only. Repository bytes are never rewritten.
// No network, database, credential, deployment or Production access.
import fs from "node:fs";
import {
  classifySr1dLifecycle,
  SR1D_BASELINE,
  SR1D_SUCCESSOR_MIGRATION,
  SR1D_SUCCESSOR_PATHS
} from "./social-taste-sr1d-successor-manifest.mjs";

const files = Object.freeze({
  migration: "supabase/migrations/20260811020000_social_candidate_taste_sources.sql",
  adapter: "supabase/functions/_shared/social-pair/authorizedPairSourcesAdapter.ts",
  provider: "supabase/functions/social-candidate-taste/tasteProvider.ts",
  handler: "supabase/functions/social-candidate-taste/handler.ts",
  sr1cHandler: "supabase/functions/social-candidate-provenance/handler.ts",
  configToml: "supabase/config.toml",
  lifecycleManifest: "scripts/social-taste-sr1d-successor-manifest.mjs"
});
const canonical = new Map(Object.values(files).map((file) => [file, fs.readFileSync(file, "utf8")]));

const mutations = [
  { name: "add caller candidate UUID parameter", file: files.migration, from: "canonical_candidate_taste_sources(p_actor_user_id uuid)", to: "canonical_candidate_taste_sources(p_actor_user_id uuid, p_candidate_user_id uuid)" },
  { name: "add caller candidate UUID array parameter", file: files.migration, from: "canonical_candidate_taste_sources(p_actor_user_id uuid)", to: "canonical_candidate_taste_sources(p_actor_user_id uuid, p_candidate_user_ids uuid[])" },
  { name: "add caller meal limit parameter", file: files.migration, from: "canonical_candidate_taste_sources(p_actor_user_id uuid)", to: "canonical_candidate_taste_sources(p_actor_user_id uuid, p_meal_limit integer)" },
  { name: "add caller favorites limit parameter", file: files.migration, from: "canonical_candidate_taste_sources(p_actor_user_id uuid)", to: "canonical_candidate_taste_sources(p_actor_user_id uuid, p_favorites_limit integer)" },
  { name: "remove canonical pool derivation", file: files.migration, from: "social_internal.canonical_candidate_pool(p_actor_user_id)", to: "social_internal.caller_supplied_candidates(p_actor_user_id)" },
  { name: "replace atomic candidate UUID array", file: files.migration, from: "pg_catalog.array_agg(candidate.user_id order by candidate.ordinality)", to: "array[p_actor_user_id]::uuid[]" },
  { name: "change meal limit", file: files.migration, from: "    20,\n    10", to: "    50,\n    10" },
  { name: "change favorites per table limit", file: files.migration, from: "    20,\n    10", to: "    20,\n    20" },
  { name: "change composition combined favorites capacity to per-table bound", file: files.provider, from: "SOCIAL_TASTE_COMBINED_FAVORITES_LIMIT = 20", to: "SOCIAL_TASTE_COMBINED_FAVORITES_LIMIT = 10" },
  { name: "grant executor direct B1 execution", file: files.migration, from: "grant execute on function social_internal.canonical_candidate_taste_sources(uuid)\n  to social_runtime_executor;", to: "grant execute on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) to social_runtime_executor;" },
  { name: "grant executor direct D1 execution", file: files.migration, from: "grant execute on function social_internal.canonical_candidate_taste_sources(uuid)\n  to social_runtime_executor;", to: "grant execute on function social_internal.authorized_candidates(uuid, uuid[]) to social_runtime_executor;" },
  { name: "grant executor authority membership", file: files.migration, from: "grant execute on function social_internal.canonical_candidate_taste_sources(uuid)\n  to social_runtime_executor;", to: "grant social_pair_read_authority to social_runtime_executor;" },
  { name: "grant executor protected table select", file: files.migration, from: "grant execute on function social_internal.canonical_candidate_taste_sources(uuid)\n  to social_runtime_executor;", to: "grant select on table public.taste_profiles to social_runtime_executor;" },
  { name: "add SQL date predicate", file: files.migration, from: "  from canonical_candidate_array;", to: "  from canonical_candidate_array where current_date >= date '2020-01-01';" },
  { name: "provider queries D1 separately", file: files.provider, from: "select social_internal.canonical_candidate_taste_sources($1::uuid) as payload", to: "select social_internal.authorized_candidates($1::uuid, '{}'::uuid[]) as payload" },
  { name: "provider calls B1 per candidate", file: files.provider, from: "transaction.query(CANONICAL_CANDIDATE_TASTE_SOURCES, [actorUserId])", to: "transaction.query(AUTHORIZED_PAIR_SOURCES_PER_CANDIDATE, [actorUserId])" },
  { name: "provider adds caller meal limit", file: files.provider, from: "async evaluateCanonicalCandidates(actorUserId: string): Promise<SocialTasteDiagnostics>", to: "async evaluateCanonicalCandidates(actorUserId: string, mealLimit = 20): Promise<SocialTasteDiagnostics>" },
  { name: "read clock inside candidate loop", file: files.provider, from: "for (const candidate of payload.candidates) {", to: "for (const candidate of payload.candidates) {\n        const candidateGeneratedAt = now().toISOString();" },
  { name: "derive local calendar date", file: files.provider, from: "const requestedEndDate = canonicalGeneratedAt.slice(0, 10);", to: "const requestedEndDate = instant.toLocaleDateString();" },
  { name: "give candidate a different asOf", file: files.provider, from: "          asOf\n        );", to: "          buildSocialTasteAsOf(now().toISOString())\n        );" },
  { name: "compose actor inside candidate loop", file: files.provider, from: "      const actorSnapshot = composeServerSnapshot(", to: "      for (const candidate of payload.candidates) {\n      const actorSnapshot = composeServerSnapshot(" },
  { name: "use per-user repository composition", file: files.provider, from: "composeServerSnapshot(\n        payload.actor.userId", to: "composeServerSnapshotForUser(\n        repository, payload.actor.userId" },
  { name: "adapter maps zero rows to failed", file: files.adapter, from: "return Object.freeze({ status: \"available\" as const, rows: Object.freeze([...payload.rows]) });", to: "return payload.rows.length === 0 ? { status: \"failed\", failureCode: \"source_read_failed\" } : { status: \"available\", rows: payload.rows };" },
  { name: "adapter maps zero rows to empty", file: files.adapter, from: "return Object.freeze({ status: \"available\" as const, rows: Object.freeze([...payload.rows]) });", to: "return payload.rows.length === 0 ? { status: \"empty\" } : { status: \"available\", rows: payload.rows };" },
  { name: "adapter consumes has_more", file: files.adapter, from: "if (!isRecord(payload) || !Array.isArray(payload.rows) || !payload.rows.every(isRecord))", to: "if (!isRecord(payload) || payload.has_more === true || !Array.isArray(payload.rows) || !payload.rows.every(isRecord))" },
  { name: "return raw shared result", file: files.handler, from: "unsupported_count: diagnostics.unsupportedCount", to: "unsupported_count: diagnostics.unsupportedCount, shared_taste_result: diagnostics" },
  { name: "return actor UUID", file: files.handler, from: "authorized_candidate_count: diagnostics.authorizedCandidateCount,", to: "actor_user_id: authentication.value.userId, authorized_candidate_count: diagnostics.authorizedCandidateCount," },
  { name: "return per-candidate diagnostics", file: files.handler, from: "adapted_count: diagnostics.adaptedCount,", to: "candidates: diagnostics, adapted_count: diagnostics.adaptedCount," },
  { name: "log private payload", file: files.provider, from: "      const payload = parsePayload(rows[0].payload);", to: "      const payload = parsePayload(rows[0].payload);\n      console.log(payload);" },
  { name: "use service role shortcut", file: files.provider, from: "createDenoSocialRuntimeExecutorTransport()", to: "createServiceRoleTransport(Deno.env.get(\"SUPABASE_SERVICE_ROLE_KEY\"))" },
  { name: "remove provider failure catch", file: files.handler, from: "  } catch {\n    return buildSocialCandidateTasteError(\"server_unavailable\");\n  } finally {", to: "  } finally {" },
  { name: "swallow B1 failure into zero", file: files.handler, from: "  } catch {\n    return buildSocialCandidateTasteError(\"server_unavailable\");\n  } finally {", to: "  } catch {\n    return new Response(JSON.stringify({ authorized_candidate_count: 0, adapted_count: 0, unsupported_count: 0 }), { status: 200 });\n  } finally {" },
  { name: "alter frozen SR1C response", file: files.sr1cHandler, from: "JSON.stringify({ candidate_count: candidateCount })", to: "JSON.stringify({ candidate_count: candidateCount, taste_ready: true })" },
  { name: "accept authority body", file: files.handler, from: "Object.keys(body as Record<string, unknown>).length === 0", to: "Object.keys(body as Record<string, unknown>).every((key) => key === \"candidate_user_ids\")" },
  { name: "remove gateway JWT verification", file: files.configToml, from: "[functions.social-candidate-taste]\n# SR-1D: authenticated aggregate-only Taste diagnostics. Actor identity is resolved by auth.getUser().\nverify_jwt = true", to: "[functions.social-candidate-taste]\nverify_jwt = false" }
];

function invariants(sources) {
  const sql = sources.get(files.migration);
  const adapter = sources.get(files.adapter);
  const provider = sources.get(files.provider);
  const handler = sources.get(files.handler);
  const sr1cHandler = sources.get(files.sr1cHandler);
  const toml = sources.get(files.configToml);
  const actorCompositionIndex = provider.indexOf("const actorSnapshot = composeServerSnapshot(");
  const firstCandidateLoopIndex = provider.indexOf("for (const candidate of payload.candidates)");
  return [
    /canonical_candidate_taste_sources\(p_actor_user_id uuid\)/i.test(sql) && !/p_candidate|p_candidates|p_limit/i.test(sql),
    /canonical_candidate_pool\(p_actor_user_id\)/i.test(sql),
    /array_agg\(candidate\.user_id order by candidate\.ordinality\)/i.test(sql),
    /authorized_pair_sources\(\s*p_actor_user_id,\s*canonical_candidate_array\.user_ids,\s*20,\s*10\s*\)/is.test(sql),
    !/current_date|current_timestamp|now\s*\(|where\s+.*date/i.test(sql),
    /grant execute on function social_internal\.canonical_candidate_taste_sources\(uuid\)\s+to social_runtime_executor/i.test(sql),
    !/grant (?:execute|select)[^;]*(?:authorized_candidates|authorized_pair_sources|public\.)[^;]*social_runtime_executor/i.test(sql),
    !/grant social_(?:authority|pair_read_authority) to social_runtime_executor/i.test(sql),
    /canonical_candidate_taste_sources\(\$1::uuid\)/.test(provider) && !/AUTHORIZED_PAIR_SOURCES_PER_CANDIDATE|authorized_candidates\(/.test(provider),
    /evaluateCanonicalCandidates\(actorUserId: string\)/.test(provider) && !/mealLimit\s*=/.test(provider),
    /SOCIAL_TASTE_COMBINED_FAVORITES_LIMIT = 20/.test(provider) && /favoritesLimit: SOCIAL_TASTE_COMBINED_FAVORITES_LIMIT/.test(provider),
    (provider.match(/now\(\)\.toISOString\(\)/g) ?? []).length === 1,
    /canonicalGeneratedAt\.slice\(0, 10\)/.test(provider) && !/toLocaleDateString/.test(provider),
    actorCompositionIndex >= 0 && actorCompositionIndex < firstCandidateLoopIndex && (provider.match(/for \(const candidate of payload\.candidates\)/g) ?? []).length === 1,
    /candidate\.userId,[\s\S]*?adaptAuthorizedPairSources\(candidate\.sources\),[\s\S]*?asOf/.test(provider),
    !/composeServerSnapshotForUser|repository, payload\.actor/.test(provider),
    /status: "available" as const, rows: Object\.freeze/.test(adapter) && !/status: "failed"|status: "empty"/.test(adapter),
    !/payload\.has_more|payload\.requested_limit|payload\.returned_count/.test(adapter),
    !/console\.(?:log|debug|info|warn)|service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i.test(provider),
    /catch \{\s*return buildSocialCandidateTasteError\("server_unavailable"\)/.test(handler),
    !/authorized_candidate_count:\s*0/.test(handler),
    /JSON\.stringify\(\{\s*authorized_candidate_count: diagnostics\.authorizedCandidateCount,\s*adapted_count: diagnostics\.adaptedCount,\s*unsupported_count: diagnostics\.unsupportedCount\s*\}\)/s.test(handler),
    !/actor_user_id: authentication|shared_taste_result|candidates: diagnostics/.test(handler),
    /Object\.keys\([^)]*\)\.length === 0/.test(handler),
    /JSON\.stringify\(\{ candidate_count: candidateCount \}\)/.test(sr1cHandler) && !/taste_ready/.test(sr1cHandler),
    /\[functions\.social-candidate-taste\][^[]*?verify_jwt = true/.test(toml)
  ];
}

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
    const mutant = new Map(canonical);
    mutant.set(mutation.file, source.replace(mutation.from, mutation.to));
    const killed = invariants(mutant).some((passed) => !passed);
    results.push({ name: mutation.name, applied: true, occurrences, killed, status: killed ? "killed" : "survived" });
  } catch (error) {
    harnessCrash += 1;
    results.push({ name: mutation.name, applied: false, killed: false, status: "harness_crash", error: error instanceof Error ? error.message : String(error) });
  }
}

const frozenHead = "1111111111111111111111111111111111111111";
const exactDelta = SR1D_SUCCESSOR_PATHS.map((file) => Object.freeze({
  status: file === SR1D_SUCCESSOR_MIGRATION ? "A" : "M",
  path: file
}));
const candidateLifecycle = Object.freeze({
  head: SR1D_BASELINE,
  originHead: SR1D_BASELINE,
  ahead: 0,
  behind: 0,
  headParent: null,
  worktreePaths: SR1D_SUCCESSOR_PATHS,
  stagedPaths: [],
  untrackedMigrationPaths: [SR1D_SUCCESSOR_MIGRATION],
  headDeltaEntries: [],
  migrationTrackedInHead: false
});
const frozenUnpushedLifecycle = Object.freeze({
  head: frozenHead,
  originHead: SR1D_BASELINE,
  ahead: 1,
  behind: 0,
  headParent: SR1D_BASELINE,
  worktreePaths: [],
  stagedPaths: [],
  untrackedMigrationPaths: [],
  headDeltaEntries: exactDelta,
  migrationTrackedInHead: true
});
const frozenPushedLifecycle = Object.freeze({
  ...frozenUnpushedLifecycle,
  originHead: frozenHead,
  ahead: 0
});
const withState = (state, change) => Object.freeze({ ...state, ...change });
const malformedLifecycleStates = Object.freeze([
  ["arbitrary dirty frozen worktree", withState(frozenUnpushedLifecycle, { worktreePaths: ["README.md"] })],
  ["hidden staged bytes", withState(frozenUnpushedLifecycle, { stagedPaths: ["README.md"] })],
  ["wrong frozen parent", withState(frozenUnpushedLifecycle, { headParent: "2222222222222222222222222222222222222222" })],
  ["extra frozen commit path", withState(frozenUnpushedLifecycle, { headDeltaEntries: [...exactDelta, { status: "M", path: "README.md" }] })],
  ["missing tracked successor migration", withState(frozenUnpushedLifecycle, { migrationTrackedInHead: false })],
  ["deleted frozen path", withState(frozenUnpushedLifecycle, { headDeltaEntries: exactDelta.map((entry, index) => index === 0 ? { ...entry, status: "D" } : entry) })],
  ["invalid frozen origin relationship", withState(frozenUnpushedLifecycle, { originHead: "3333333333333333333333333333333333333333" })],
  ["arbitrary unrelated clean commit", withState(frozenUnpushedLifecycle, { headDeltaEntries: [{ status: "M", path: "README.md" }] })]
]);
function lifecycleContract(classify) {
  const candidate = classify(candidateLifecycle);
  const frozenUnpushed = classify(frozenUnpushedLifecycle);
  const frozenPushed = classify(frozenPushedLifecycle);
  return Object.freeze({
    candidateAccepted: candidate.valid && candidate.phase === "candidate",
    frozenUnpushedAccepted: frozenUnpushed.valid && frozenUnpushed.phase === "frozen_unpushed",
    frozenPushedAccepted: frozenPushed.valid && frozenPushed.phase === "frozen_pushed",
    malformedRejected: malformedLifecycleStates.every(([, state]) => !classify(state).valid)
  });
}
const canonicalLifecycleContract = lifecycleContract(classifySr1dLifecycle);
const canonicalLifecyclePassed = Object.values(canonicalLifecycleContract).every(Boolean);
const lifecycleSource = canonical.get(files.lifecycleManifest);
const lifecycleMutations = [
  { name: "lifecycle rejects the valid candidate phase", from: "const candidate =\n    state.head === SR1D_BASELINE &&", to: "const candidate =\n    false && state.head === SR1D_BASELINE &&" },
  { name: "lifecycle accepts an arbitrary dirty frozen worktree", from: "worktreePaths.length === 0 &&\n    stagedPaths.length === 0 &&", to: "worktreePaths.length >= 0 &&\n    stagedPaths.length === 0 &&" },
  { name: "lifecycle accepts hidden staged bytes", from: "stagedPaths.length === 0 &&\n    exactPathSet(headDeltaPaths, SR1D_SUCCESSOR_PATHS) &&", to: "stagedPaths.length >= 0 &&\n    exactPathSet(headDeltaPaths, SR1D_SUCCESSOR_PATHS) &&" },
  { name: "lifecycle accepts a frozen commit with the wrong parent", from: "state.headParent === SR1D_BASELINE &&", to: "state.headParent !== null &&" },
  { name: "lifecycle accepts an extra frozen commit path", from: "exactPathSet(headDeltaPaths, SR1D_SUCCESSOR_PATHS) &&", to: "headDeltaPaths.includes(SR1D_SUCCESSOR_MIGRATION) &&" },
  { name: "lifecycle accepts a missing tracked successor migration", from: "state.migrationTrackedInHead === true;", to: "state.migrationTrackedInHead !== null;" },
  { name: "lifecycle accepts a deletion in the frozen commit", from: "!headDeltaEntries.some(({ status }) => status === \"D\") &&", to: "headDeltaEntries.every(({ status }) => typeof status === \"string\") &&" },
  { name: "lifecycle rejects the valid frozen-unpushed origin posture", from: "state.ahead === 1 &&", to: "state.ahead === 0 &&" },
  { name: "lifecycle rejects the valid frozen-pushed origin posture", from: "state.originHead === state.head &&", to: "state.originHead !== state.head &&" },
  { name: "lifecycle accepts an invalid frozen origin relationship", from: "frozenShape &&\n    state.originHead === SR1D_BASELINE &&", to: "frozenShape &&\n    state.originHead !== null &&" },
  { name: "lifecycle accepts an arbitrary unrelated clean commit", from: "exactPathSet(headDeltaPaths, SR1D_SUCCESSOR_PATHS) &&", to: "headDeltaPaths.length > 0 &&" }
];

for (const [index, mutation] of lifecycleMutations.entries()) {
  try {
    const occurrences = lifecycleSource.split(mutation.from).length - 1;
    const appliedMutation = occurrences === 1 && mutation.from !== mutation.to;
    if (!appliedMutation) {
      results.push({ name: mutation.name, applied: false, occurrences, killed: false, status: "anchor_missing" });
      continue;
    }
    const mutatedSource = lifecycleSource.replace(mutation.from, mutation.to);
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(mutatedSource).toString("base64")}#lifecycle-${index}`;
    const mutantModule = await import(moduleUrl);
    const killed = !Object.values(lifecycleContract(mutantModule.classifySr1dLifecycle)).every(Boolean);
    results.push({ name: mutation.name, applied: true, occurrences, killed, status: killed ? "killed" : "survived" });
  } catch (error) {
    harnessCrash += 1;
    results.push({ name: mutation.name, applied: false, killed: false, status: "harness_crash", error: error instanceof Error ? error.message : String(error) });
  }
}

const applied = results.filter((result) => result.applied).length;
const killed = results.filter((result) => result.killed).length;
const survived = results.filter((result) => result.status === "survived").length;
const anchorMissing = results.filter((result) => result.status === "anchor_missing").length;
const totalMutations = mutations.length + lifecycleMutations.length;
const noOp = [...mutations, ...lifecycleMutations].filter((mutation) => mutation.from === mutation.to).length;
const passed = canonicalLifecyclePassed && applied === totalMutations && killed === totalMutations && survived === 0 && anchorMissing === 0 && noOp === 0 && harnessCrash === 0;
console.log(JSON.stringify({ suite: "social-taste-sr1d-mutations", status: passed ? "passed" : "failed", totalMutations, applied, killed, survived, noOp, anchorMissing, harnessCrash, lifecycleContract: canonicalLifecycleContract, malformedLifecycleStates: malformedLifecycleStates.map(([name]) => name), results, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
process.exit(passed ? 0 : 1);
