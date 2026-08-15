#!/usr/bin/env node
// SR-1C adversarial mutations over candidate bytes. Mutants stay in memory; repository bytes are
// never rewritten. No network, database, credential, deployment or Production access.
import fs from "node:fs";

const files = Object.freeze({
  migration: "supabase/migrations/20260811010000_social_canonical_candidate_pool.sql",
  sharedAuth: "supabase/functions/_shared/auth/authenticateCaller.ts",
  mealAuth: "supabase/functions/meal-photo-analysis/auth.ts",
  provider: "supabase/functions/social-candidate-provenance/candidateProvider.ts",
  handler: "supabase/functions/social-candidate-provenance/handler.ts",
  errors: "supabase/functions/social-candidate-provenance/errors.ts",
  configToml: "supabase/config.toml"
});
const canonical = new Map(Object.values(files).map((file) => [file, fs.readFileSync(file, "utf8")]));

const CREATE_GRANT = "grant create on schema social_internal to social_authority;";
const OWNER_TRANSFER = "alter function social_internal.canonical_candidate_pool(uuid) owner to social_authority;";
const CREATE_REVOKE = "revoke create on schema social_internal from social_authority;";
function schemaCreateGrants(source) {
  return [...source.matchAll(/\bgrant\s+([^;]+?)\s+on\s+schema\s+social_internal\s+to\s+([^;]+);/gi)]
    .filter((match) => match[1].split(",").some((privilege) => /^(create|all(?: privileges)?)$/i.test(privilege.trim())))
    .map((match) => ({
      index: match.index,
      grantees: match[2].replace(/\s+with\s+grant\s+option\s*$/i, "").split(",").map((grantee) => grantee.trim().toLowerCase())
    }));
}

const mutations = [
  { name: "remove transient CREATE grant", file: files.migration, from: `${CREATE_GRANT}\n`, to: "" },
  { name: "move CREATE grant after ownership transfer", file: files.migration, from: `${CREATE_GRANT}\n`, to: "", also: { from: OWNER_TRANSFER, to: `${OWNER_TRANSFER}\n${CREATE_GRANT}` } },
  { name: "remove transient CREATE revoke", file: files.migration, from: `${CREATE_REVOKE}\n`, to: "" },
  { name: "revoke CREATE before ownership transfer", file: files.migration, from: `${CREATE_REVOKE}\n`, to: "", also: { from: OWNER_TRANSFER, to: `${CREATE_REVOKE}\n${OWNER_TRANSFER}` } },
  { name: "grant schema CREATE to executor instead", file: files.migration, from: CREATE_GRANT, to: "grant create on schema social_internal to social_runtime_executor;" },
  { name: "leave permanent CREATE on social_authority", file: files.migration, from: CREATE_REVOKE, to: CREATE_GRANT },
  { name: "widen schema CREATE through a combined privilege grant", file: files.migration, from: CREATE_GRANT, to: `${CREATE_GRANT}\ngrant usage, create on schema social_internal to authenticated;` },
  { name: "remove self exclusion", file: files.migration, from: "    and participation.user_id <> p_actor_user_id\n", to: "" },
  { name: "allow paused", file: files.migration, from: "participation.state = 'opted_in'", to: "participation.state <> 'not_a_state'" },
  { name: "remove actor participation requirement", file: files.migration, from: "social_internal.may_evaluate_candidate(p_actor_user_id, participation.user_id)", to: "social_internal.actor_account_only(p_actor_user_id, participation.user_id)" },
  { name: "remove candidate participation requirement", file: files.migration, from: "social_internal.may_evaluate_candidate(p_actor_user_id, participation.user_id)", to: "social_internal.candidate_account_only(p_actor_user_id, participation.user_id)" },
  { name: "remove outbound block exclusion", file: files.migration, from: "social_internal.may_evaluate_candidate(p_actor_user_id, participation.user_id)", to: "social_internal.eligibility_without_outbound_block(p_actor_user_id, participation.user_id)" },
  { name: "remove reverse block exclusion", file: files.migration, from: "social_internal.may_evaluate_candidate(p_actor_user_id, participation.user_id)", to: "social_internal.eligibility_without_reverse_block(p_actor_user_id, participation.user_id)" },
  { name: "weaken fail-closed account predicate", file: files.migration, from: "social_internal.may_evaluate_candidate(p_actor_user_id, participation.user_id)", to: "social_internal.eligibility_allow_duplicate_profiles(p_actor_user_id, participation.user_id)" },
  { name: "add visibility requirement", file: files.migration, from: "    and social_internal.may_evaluate_candidate", to: "    and participation.visibility = 'public'\n    and social_internal.may_evaluate_candidate" },
  { name: "add willing_to_chat requirement", file: files.migration, from: "    and social_internal.may_evaluate_candidate", to: "    and participation.willing_to_chat is true\n    and social_internal.may_evaluate_candidate" },
  { name: "add verification_status requirement", file: files.migration, from: "    and social_internal.may_evaluate_candidate", to: "    and participation.verification_status = 'verified'\n    and social_internal.may_evaluate_candidate" },
  { name: "remove opted_in_at ordering", file: files.migration, from: "order by participation.opted_in_at asc, participation.user_id asc", to: "order by participation.user_id asc" },
  { name: "reverse opted_in_at order", file: files.migration, from: "participation.opted_in_at asc, participation.user_id asc", to: "participation.opted_in_at desc, participation.user_id asc" },
  { name: "remove user_id tie-breaker", file: files.migration, from: "participation.opted_in_at asc, participation.user_id asc", to: "participation.opted_in_at asc" },
  { name: "remove hard bound", file: files.migration, from: "  limit 256\n", to: "" },
  { name: "increase hard bound", file: files.migration, from: "  limit 256", to: "  limit 512" },
  { name: "add caller-controlled limit", file: files.migration, from: "canonical_candidate_pool(p_actor_user_id uuid)", to: "canonical_candidate_pool(p_actor_user_id uuid, p_limit integer)" },
  { name: "grant executor protected table SELECT", file: files.migration, from: "grant usage on schema social_internal to social_runtime_executor;", to: "grant select on table public.social_participation to social_runtime_executor;\ngrant usage on schema social_internal to social_runtime_executor;" },
  { name: "grant executor social_authority membership", file: files.migration, from: "grant usage on schema social_internal to social_runtime_executor;", to: "grant social_authority to social_runtime_executor;\ngrant usage on schema social_internal to social_runtime_executor;" },
  { name: "grant executor D1 execution", file: files.migration, from: "grant execute on function social_internal.canonical_candidate_pool(uuid) to social_runtime_executor;", to: "grant execute on function social_internal.authorized_candidates(uuid, uuid[]) to social_runtime_executor;" },
  { name: "expose pool to authenticated", file: files.migration, from: "revoke all on function social_internal.canonical_candidate_pool(uuid) from authenticated;", to: "grant execute on function social_internal.canonical_candidate_pool(uuid) to authenticated;" },
  { name: "expose pool to anon", file: files.migration, from: "revoke all on function social_internal.canonical_candidate_pool(uuid) from anon;", to: "grant execute on function social_internal.canonical_candidate_pool(uuid) to anon;" },
  { name: "expose pool to service_role", file: files.migration, from: "revoke all on function social_internal.canonical_candidate_pool(uuid) from service_role;", to: "grant execute on function social_internal.canonical_candidate_pool(uuid) to service_role;" },
  { name: "move pool function into public schema", file: files.migration, from: "create function social_internal.canonical_candidate_pool", to: "create function public.canonical_candidate_pool" },
  { name: "trust body actor UUID", file: files.handler, from: "const provider = dependencies.createCandidateProvider();", to: "const actorUserId = new URL(request.url).searchParams.get(\"actor_user_id\") ?? authentication.value.userId;\n  const provider = dependencies.createCandidateProvider();" },
  { name: "accept candidate_user_ids", file: files.handler, from: "Object.keys(body as Record<string, unknown>).length === 0", to: "Object.keys(body as Record<string, unknown>).every((key) => key === \"candidate_user_ids\")" },
  { name: "accept arbitrary target UUID", file: files.handler, from: "Object.keys(body as Record<string, unknown>).length === 0", to: "Object.keys(body as Record<string, unknown>).every((key) => key === \"target_user_id\")" },
  { name: "return candidate UUIDs", file: files.handler, from: "JSON.stringify({ candidate_count: candidateCount })", to: "JSON.stringify({ candidate_count: candidateCount, candidates })" },
  { name: "return participation and block reasons", file: files.handler, from: "JSON.stringify({ candidate_count: candidateCount })", to: "JSON.stringify({ candidate_count: candidateCount, reasons: [\"paused\", \"reverse_block\"] })" },
  { name: "return raw database error", file: files.handler, from: "  } catch {\n    return buildSocialCandidateProvenanceError(\"server_unavailable\");\n  } finally {", to: "  } catch (error) {\n    return new Response(String(error), { status: 500 });\n  } finally {" },
  { name: "swallow provider error into zero count", file: files.handler, from: "  } catch {\n    return buildSocialCandidateProvenanceError(\"server_unavailable\");\n  } finally {", to: "  } catch {\n    return new Response(JSON.stringify({ candidate_count: 0 }), { status: 200 });\n  } finally {" },
  { name: "replace getUser with local trusted claim decode", file: files.sharedAuth, from: "  const { data, error } = await userScopedClient.auth.getUser();", to: "  const data = { user: JSON.parse(atob(authorizationHeader.split(\".\")[1])) };\n  const error = null;" },
  { name: "use service-role database shortcut", file: files.provider, from: "createDenoSocialRuntimeExecutorTransport()", to: "createServiceRoleSocialRuntimeTransport(Deno.env.get(\"SUPABASE_SERVICE_ROLE_KEY\"))" },
  { name: "remove gateway JWT verification", file: files.configToml, from: "[functions.social-candidate-provenance]\n# SR-1C: authenticated count-only ingress. Actor identity is also resolved by auth.getUser().\nverify_jwt = true", to: "[functions.social-candidate-provenance]\nverify_jwt = false" },
  { name: "duplicate authentication implementation", file: files.mealAuth, from: "// Compatibility re-export.", to: "const duplicateAuthImplementation = () => ({ createClient: true, getUser: true });\n// Compatibility re-export." }
];

function invariants(sources) {
  const sql = sources.get(files.migration);
  const handler = sources.get(files.handler);
  const provider = sources.get(files.provider);
  const sharedAuth = sources.get(files.sharedAuth);
  const mealAuth = sources.get(files.mealAuth);
  const toml = sources.get(files.configToml);
  const createGrantIndex = sql.indexOf(CREATE_GRANT);
  const createFunctionIndex = sql.indexOf("create function social_internal.canonical_candidate_pool(p_actor_user_id uuid)");
  const ownerTransferIndex = sql.indexOf(OWNER_TRANSFER);
  const createRevokeIndex = sql.indexOf(CREATE_REVOKE);
  const createGrants = schemaCreateGrants(sql);
  return [
    createGrants.length === 1 && createGrants[0].grantees.length === 1 && createGrants[0].grantees[0] === "social_authority",
    createGrantIndex >= 0 && createGrantIndex < createFunctionIndex && createFunctionIndex < ownerTransferIndex,
    (sql.match(/revoke create on schema social_internal from social_authority;/gi) ?? []).length === 1,
    ownerTransferIndex >= 0 && ownerTransferIndex < createRevokeIndex && createGrants[0]?.index < createRevokeIndex,
    !createGrants.some((grant) => grant.grantees.some((grantee) => ["social_runtime_executor", "public", "anon", "authenticated", "authenticator", "service_role"].includes(grantee))),
    /create function social_internal\.canonical_candidate_pool\(p_actor_user_id uuid\)/i.test(sql),
    /participation\.user_id <> p_actor_user_id/i.test(sql),
    /participation\.state = 'opted_in'/i.test(sql),
    /social_internal\.may_evaluate_candidate\(p_actor_user_id, participation\.user_id\)/i.test(sql),
    !/visibility|willing_to_chat|verification_status/i.test(sql),
    /order by participation\.opted_in_at asc, participation\.user_id asc/i.test(sql),
    /limit 256/i.test(sql) && !/p_limit/i.test(sql),
    !/grant select[^;]*social_runtime_executor/i.test(sql),
    !/grant social_(authority|pair_read_authority) to social_runtime_executor/i.test(sql),
    /grant execute on function social_internal\.canonical_candidate_pool\(uuid\) to social_runtime_executor/i.test(sql),
    !/grant execute on function social_internal\.(authorized_candidates|may_evaluate_candidate|authorized_pair_sources)/i.test(sql),
    ["public", "anon", "authenticated", "authenticator", "service_role"].every((role) => new RegExp(`revoke all on function social_internal\\.canonical_candidate_pool\\(uuid\\) from ${role}`, "i").test(sql)),
    /Object\.keys\([^)]*\)\.length === 0/.test(handler),
    !/actor_user_id|candidate_user_ids|target_user_id/i.test(handler),
    /getCanonicalSocialCandidates\(authentication\.value\.userId\)/.test(handler),
    /JSON\.stringify\(\{ candidate_count: candidateCount \}\)/.test(handler),
    !/reasons|reverse_block|new Response\(String\(error\)/.test(handler),
    /catch \{\s*return buildSocialCandidateProvenanceError\("server_unavailable"\)/.test(handler),
    !/candidate_count:\s*0/.test(handler),
    /createDenoSocialRuntimeExecutorTransport\(\)/.test(provider) && !/service[_-]?role|SUPABASE_SERVICE_ROLE_KEY/i.test(provider),
    (sharedAuth.match(/auth\.getUser\(\)/g) ?? []).length === 1 && !/atob|decode/i.test(sharedAuth),
    /from "\.\.\/_shared\/auth\/authenticateCaller\.ts"/.test(mealAuth) && !/createClient|getUser/.test(mealAuth),
    /\[functions\.social-candidate-provenance\][^[]*?verify_jwt = true/.test(toml)
  ];
}

const results = [];
let harnessCrash = 0;
for (const mutation of mutations) {
  try {
    const source = canonical.get(mutation.file);
    const occurrences = source.split(mutation.from).length - 1;
    const secondaryOccurrences = mutation.also === undefined ? 1 : source.split(mutation.also.from).length - 1;
    const applied = occurrences === 1 && mutation.from !== mutation.to && secondaryOccurrences === 1;
    if (!applied) {
      results.push({ name: mutation.name, applied: false, occurrences, killed: false, status: "anchor_missing" });
      continue;
    }
    const mutant = new Map(canonical);
    const primaryMutant = source.replace(mutation.from, mutation.to);
    mutant.set(mutation.file, mutation.also === undefined
      ? primaryMutant
      : primaryMutant.replace(mutation.also.from, mutation.also.to));
    const killed = invariants(mutant).some((passed) => !passed);
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
const noOp = mutations.filter((mutation) => mutation.from === mutation.to).length;
const passed = applied === mutations.length && killed === mutations.length && survived === 0 && anchorMissing === 0 && noOp === 0 && harnessCrash === 0;
console.log(JSON.stringify({ suite: "social-ingress-sr1c-mutations", status: passed ? "passed" : "failed", totalMutations: mutations.length, applied, killed, survived, noOp, anchorMissing, harnessCrash, results, networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false }, null, 2));
process.exit(passed ? 0 : 1);
