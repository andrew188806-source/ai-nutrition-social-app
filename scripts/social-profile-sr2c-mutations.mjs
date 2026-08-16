#!/usr/bin/env node
// SR-2C meaningful mutation contract. Mutants execute in memory; repository bytes are never changed.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SR2C_SUCCESSOR_MIGRATION } from "./social-profile-sr2c-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const moduleRoot = "supabase/functions/_shared/social-profile";
const files = Object.freeze({
  project: `${moduleRoot}/projectPublicProfiles.ts`,
  read: `${moduleRoot}/readProfileFacts.ts`,
  policy: `${moduleRoot}/policy.ts`,
  types: `${moduleRoot}/types.ts`,
  index: `${moduleRoot}/index.ts`
});
const canonical = new Map(Object.values(files).map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const canonicalSql = fs.readFileSync(path.join(root, SR2C_SUCCESSOR_MIGRATION), "utf8");

function loadProfile(overrides = new Map()) {
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
      if (!resolved) throw new Error(`unresolved profile import: ${specifier}`);
      return load(resolved);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  };
  return load(path.join(root, files.index));
}

const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const exposure = (count) => ({
  policyVersion: "social-exposure-v1",
  exposed: Array.from({ length: count }, (_, index) => ({ candidateUserId: id(index), rankingState: "scored" })),
  truncated: false
});
const row = (ordinal, overrides = {}) => ({
  exposure_ordinal: ordinal,
  display_name: `Name ${ordinal}`,
  mascot_avatar_key: `mascot_${ordinal}`,
  public_bio: `bio ${ordinal}`,
  willing_to_chat: true,
  ...overrides
});
const transport = (rows, calls = []) => ({
  withTransaction: async (operation) => operation({
    query: async (statement, parameters) => { calls.push({ text: statement.text, parameters }); return rows; },
    abort: () => { throw new Error("aborted"); }
  }),
  close: async () => {}
});
const indices = (result) => result.candidates.map((c) => c.exposureIndex);
const threw = (run) => { try { run(); return false; } catch { return true; } };
const threwAsync = async (run) => { try { await run(); return false; } catch { return true; } };

// Each detector returns true when the mutant is KILLED (observable contract regression).
const sourceMutations = [
  { name: "database row order trusted instead of ordinal correlation", file: files.project,
    from: "  const candidates: SocialPublicProfile[] = [];\n  for (let exposureIndex = 0; exposureIndex < exposureCount; exposureIndex += 1) {\n    const row = byOrdinal.get(exposureIndex);\n    if (row === undefined) continue;",
    to: "  const candidates: SocialPublicProfile[] = [];\n  for (const row of rows) {\n    const exposureIndex = row.exposure_ordinal;",
    detect: async (m) => JSON.stringify(indices(m.projectPublicSocialProfiles(exposure(3), [row(2), row(0), row(1)]))) !== JSON.stringify([0, 1, 2]) },
  { name: "exposure order reversed", file: files.project,
    from: "for (let exposureIndex = 0; exposureIndex < exposureCount; exposureIndex += 1) {",
    to: "for (let exposureIndex = exposureCount - 1; exposureIndex >= 0; exposureIndex -= 1) {",
    detect: async (m) => JSON.stringify(indices(m.projectPublicSocialProfiles(exposure(3), [row(0), row(1), row(2)]))) !== JSON.stringify([0, 1, 2]) },
  { name: "alphabetical sort introduced", file: files.project,
    from: "    candidates: Object.freeze(candidates)",
    to: "    candidates: Object.freeze([...candidates].sort((left, right) => right.displayName.localeCompare(left.displayName)))",
    detect: async (m) => JSON.stringify(indices(m.projectPublicSocialProfiles(exposure(3), [row(0), row(1), row(2)]))) !== JSON.stringify([0, 1, 2]) },
  { name: "missing candidate refilled by compaction", file: files.project,
    from: "      exposureIndex,\n      displayName: row.display_name,",
    to: "      exposureIndex: candidates.length,\n      displayName: row.display_name,",
    detect: async (m) => JSON.stringify(indices(m.projectPublicSocialProfiles(exposure(3), [row(0), row(2)]))) !== JSON.stringify([0, 2]) },
  { name: "missing candidate converted to a request-level failure", file: files.project,
    from: "    if (row === undefined) continue;",
    to: "    if (row === undefined) return socialProfileContractViolation();",
    detect: async (m) => threw(() => m.projectPublicSocialProfiles(exposure(3), [row(0), row(2)])) },
  { name: "malformed row silently omitted instead of failing closed", file: files.project,
    from: "  if (typeof value.display_name !== \"string\" || value.display_name.length === 0) {\n    return socialProfileContractViolation();\n  }",
    to: "  if (typeof value.display_name !== \"string\" || value.display_name.length === 0) {\n    return Object.freeze({ exposure_ordinal: ordinal, display_name: \"unknown\", mascot_avatar_key: null, public_bio: null, willing_to_chat: false });\n  }",
    detect: async (m) => !threw(() => m.projectPublicSocialProfiles(exposure(1), [row(0, { display_name: "" })])) },
  { name: "duplicate returned ordinal detection removed", file: files.project,
    from: "    if (byOrdinal.has(admitted.exposure_ordinal)) return socialProfileContractViolation();",
    to: "",
    detect: async (m) => !threw(() => m.projectPublicSocialProfiles(exposure(2), [row(0), row(0)])) },
  { name: "ordinal range validation removed", file: files.project,
    from: "    ordinal < 0 ||\n    ordinal >= exposureCount",
    to: "    false",
    detect: async (m) => !threw(() => m.projectPublicSocialProfiles(exposure(2), [row(5)])) },
  { name: "ranking state leaked into the projection", file: files.project,
    from: "      willingToChat: row.willing_to_chat",
    to: "      willingToChat: row.willing_to_chat,\n      rankingState: exposure.exposed[exposureIndex].rankingState",
    detect: async (m) => JSON.stringify(m.projectPublicSocialProfiles(exposure(1), [row(0)])).includes("rankingState") },
  { name: "raw candidate UUID leaked into the projection", file: files.project,
    from: "      willingToChat: row.willing_to_chat",
    to: "      willingToChat: row.willing_to_chat,\n      candidateUserId: exposure.exposed[exposureIndex].candidateUserId",
    detect: async (m) => JSON.stringify(m.projectPublicSocialProfiles(exposure(1), [row(0)])).includes("candidateUserId") },
  { name: "pagination surface added to the envelope", file: files.project,
    from: "    candidates: Object.freeze(candidates)",
    to: "    candidates: Object.freeze(candidates), nextPageOffset: exposureCount",
    detect: async (m) => Object.keys(m.projectPublicSocialProfiles(exposure(1), [row(0)])).length !== 2 },
  { name: "projection cap removed", file: files.project,
    from: "    exposure.exposed.length > SOCIAL_PROFILE_MAXIMUM_CANDIDATES",
    to: "    false",
    detect: async (m) => !threw(() => m.projectPublicSocialProfiles(exposure(11), [])) },
  { name: "maximum candidate bound widened", file: files.policy,
    from: "SOCIAL_PROFILE_MAXIMUM_CANDIDATES = 10 as const",
    to: "SOCIAL_PROFILE_MAXIMUM_CANDIDATES = 25 as const",
    detect: async (m) => m.SOCIAL_PROFILE_MAXIMUM_CANDIDATES !== 10 },
  { name: "policy version altered", file: files.policy,
    from: "SOCIAL_PROFILE_PROJECTION_POLICY_VERSION = \"social-profile-projection-v1\" as const",
    to: "SOCIAL_PROFILE_PROJECTION_POLICY_VERSION = \"social-profile-projection-v2\" as const",
    detect: async (m) => m.SOCIAL_PROFILE_PROJECTION_POLICY_VERSION !== "social-profile-projection-v1" },
  { name: "arbitrary caller candidate array accepted", file: files.read,
    from: "  const candidateUserIds = exposure.exposed.map((candidate) => {",
    to: "  const candidateUserIds = (arguments.length > 3 ? arguments[3] : exposure.exposed).map((candidate) => {",
    detect: async (m) => {
      const calls = [];
      await m.readExposedSocialProfileFacts(transport([], calls), id(99), exposure(1), [{ candidateUserId: id(777), rankingState: "scored" }]);
      return calls.some(({ parameters }) => Array.isArray(parameters[1]) && parameters[1].includes(id(777)));
    } },
  { name: "duplicate exposed candidate detection removed", file: files.read,
    from: "  if (new Set(candidateUserIds.map((entry) => entry.toLowerCase())).size !== candidateUserIds.length) {\n    return socialProfileContractViolation();\n  }",
    to: "",
    detect: async (m) => !(await threwAsync(() => m.readExposedSocialProfileFacts(transport([]), id(99), { policyVersion: "social-exposure-v1", exposed: [{ candidateUserId: id(1), rankingState: "scored" }, { candidateUserId: id(1), rankingState: "scored" }], truncated: false }))) },
  { name: "read-side maximum candidate check removed", file: files.read,
    from: "  if (exposure.exposed.length > SOCIAL_PROFILE_MAXIMUM_CANDIDATES) {\n    return socialProfileContractViolation();\n  }",
    to: "",
    detect: async (m) => !(await threwAsync(() => m.readExposedSocialProfileFacts(transport([]), id(99), exposure(11)))) },
  { name: "select * introduced into the protected read", file: files.read,
    from: "  select exposure_ordinal, display_name, mascot_avatar_key, public_bio, willing_to_chat",
    to: "  select *",
    detect: async (m) => {
      const calls = [];
      await m.readExposedSocialProfileFacts(transport([], calls), id(99), exposure(1));
      return /select\s+\*/i.test(calls[0].text);
    } }
];

const sqlMutations = [
  { name: "column-level grant widened to a full table grant", from: "grant select (user_id, display_name, mascot_avatar_key, public_bio, willing_to_chat, status, deleted_at)\n  on table public.consumer_profiles to social_profile_projection_authority;", to: "grant select on table public.consumer_profiles to social_profile_projection_authority;" },
  { name: "private profile table granted to the authority", from: "grant select (user_id, display_name", to: "grant select on table public.consumer_private_profiles to social_profile_projection_authority;\ngrant select (user_id, display_name" },
  { name: "real avatar url added to the projected columns", from: "         profile.public_bio,", to: "         profile.real_avatar_url,\n         profile.public_bio," },
  { name: "verification status added to the projected columns", from: "         profile.public_bio,", to: "         profile.verification_status,\n         profile.public_bio," },
  { name: "health summary added to the projected columns", from: "         profile.public_bio,", to: "         profile.diet_summary,\n         profile.public_bio," },
  { name: "anonymous display name added to the projected columns", from: "         profile.display_name,", to: "         profile.anonymous_display_name,\n         profile.display_name," },
  { name: "user identifier returned to the caller", from: "  exposure_ordinal integer,", to: "  exposure_ordinal integer,\n  user_id uuid," },
  { name: "profile identifier returned to the caller", from: "  exposure_ordinal integer,", to: "  exposure_ordinal integer,\n  profile_id text," },
  { name: "canonical candidate authorization removed", from: "  join authorized on authorized.user_id = requested.user_id\n", to: "" },
  { name: "candidate limit removed", from: "  if v_count > 10 then", to: "  if v_count > 1000000 then" },
  { name: "duplicate candidate rejection removed", from: "    raise exception 'SOCIAL_PROFILE_CANDIDATE_DUPLICATE' using errcode = '22023';", to: "    null;" },
  { name: "null candidate rejection removed", from: "    raise exception 'SOCIAL_PROFILE_CANDIDATE_NULL' using errcode = '22023';", to: "    null;" },
  { name: "active/non-deleted profile predicate removed", from: "  where profile.status = 'active'\n    and profile.deleted_at is null\n", to: "" },
  { name: "execute granted to authenticated", from: "  to social_runtime_executor;", to: "  to authenticated;" },
  { name: "execute granted to anon", from: "  to social_runtime_executor;", to: "  to anon;" },
  { name: "execute granted to service_role", from: "  to social_runtime_executor;", to: "  to service_role;" },
  { name: "executor granted direct profile table select", from: "grant usage on schema social_internal to social_profile_projection_authority;", to: "grant select on table public.consumer_profiles to social_runtime_executor;\ngrant usage on schema social_internal to social_profile_projection_authority;" },
  { name: "legacy public profile view granted", from: "commit;", to: "grant select on table public.consumer_public_profiles to authenticated;\ncommit;" },
  { name: "durable schema CREATE retained", from: "revoke create on schema social_internal from social_profile_projection_authority;", to: "" },
  { name: "security definer downgraded to invoker", from: "security definer", to: "security invoker" },
  { name: "search path unhardened", from: "set search_path = pg_catalog, pg_temp", to: "set search_path = public, pg_catalog, pg_temp" },
  { name: "volatility widened to volatile", from: "stable\nsecurity definer", to: "volatile\nsecurity definer" },
  { name: "ordinality correlation replaced by physical order", from: "  order by requested.ordinality;", to: "  order by profile.display_name;" },
  { name: "role-scoped read policy removed", from: "create policy consumer_profiles_profile_projection_authority on public.consumer_profiles\n  for select to social_profile_projection_authority using (true);", to: "" },
  { name: "read policy widened to authenticated", from: "to social_profile_projection_authority using (true);", to: "to social_profile_projection_authority, authenticated using (true);" },
  { name: "read policy widened to PUBLIC", from: "to social_profile_projection_authority using (true);", to: "to public using (true);" },
  { name: "read policy widened past SELECT to all commands", from: "for select to social_profile_projection_authority using (true);", to: "for all to social_profile_projection_authority using (true);" },
  { name: "frozen owner-only profile policy dropped", from: "create policy consumer_profiles_profile_projection_authority", to: "drop policy consumer_profiles_owner_read on public.consumer_profiles;\ncreate policy consumer_profiles_profile_projection_authority" },
  { name: "authority membership granted to the executor", from: "revoke social_profile_projection_authority from postgres;", to: "grant social_profile_projection_authority to social_runtime_executor;\nrevoke social_profile_projection_authority from postgres;" }
];

// Mirrors the guard's exact durable-delta assertions over the mutated SQL.
function sqlContractHolds(sql) {
  const code = sql.split(/\r?\n/).map((line) => (line.trim().startsWith("--") ? "" : line)).join("\n");
  const flat = code.replace(/\s+/g, " ");
  return /grant select \(user_id, display_name, mascot_avatar_key, public_bio, willing_to_chat, status, deleted_at\) on table public\.consumer_profiles to social_profile_projection_authority;/.test(flat)
    && !/grant select on table public\.consumer_profiles/i.test(flat)
    && !/consumer_private_profiles|taste_profiles|nutrition_goals|dietary_restrictions|meal_records|subscription_entitlements|consumer_public_profiles/i.test(flat)
    && !/select \*/i.test(flat)
    && !/profile\.(real_avatar_url|verification_status|diet_summary|nutrition_goal_summary|recent_meal_style|anonymous_display_name|profile_id|visibility|locale|timezone)/i.test(flat)
    && !/\b(user_id uuid,|profile_id text,)/i.test(flat)
    && /join authorized on authorized\.user_id = requested\.user_id/.test(flat)
    && /if v_count > 10 then/.test(flat)
    && /raise exception 'SOCIAL_PROFILE_CANDIDATE_DUPLICATE'/.test(flat)
    && /raise exception 'SOCIAL_PROFILE_CANDIDATE_NULL'/.test(flat)
    && /where profile\.status = 'active' and profile\.deleted_at is null/.test(flat)
    && /grant execute on function social_internal\.project_exposed_social_profiles\(uuid, uuid\[\]\) to social_runtime_executor;/.test(flat)
    && !/to (authenticated|anon|service_role|public);/i.test(flat)
    && !/grant select on table public\.consumer_profiles to social_runtime_executor/i.test(flat)
    && /revoke create on schema social_internal from social_profile_projection_authority;/.test(flat)
    && /security definer/.test(flat) && !/security invoker/.test(flat)
    && /set search_path = pg_catalog, pg_temp/.test(flat)
    && /stable security definer/.test(flat)
    && /order by requested\.ordinality;/.test(flat)
    && !/grant social_profile_projection_authority to social_runtime_executor/i.test(flat)
    && /create policy consumer_profiles_profile_projection_authority on public\.consumer_profiles for select to social_profile_projection_authority using \(true\);/.test(flat)
    && (flat.match(/create policy/g) ?? []).length === 1
    && !/drop policy|alter policy|consumer_profiles_owner_read/i.test(flat)
    && !/\bfor (all|insert|update|delete)\b/i.test(flat);
}

const results = [];
for (const mutation of sourceMutations) {
  const source = canonical.get(mutation.file);
  const occurrences = source.split(mutation.from).length - 1;
  if (occurrences !== 1) {
    results.push({ name: mutation.name, applied: false, killed: false, status: "anchor_missing", occurrences });
    continue;
  }
  const overrides = new Map([[mutation.file, source.replace(mutation.from, mutation.to)]]);
  let killed = false;
  try {
    killed = Boolean(await mutation.detect(loadProfile(overrides)));
  } catch {
    // A mutant that cannot even load or evaluate is observably broken, which is a kill.
    killed = true;
  }
  results.push({ name: mutation.name, applied: true, killed, status: killed ? "killed" : "survived" });
}

for (const mutation of sqlMutations) {
  const occurrences = canonicalSql.split(mutation.from).length - 1;
  if (occurrences < 1) {
    results.push({ name: `migration: ${mutation.name}`, applied: false, killed: false, status: "anchor_missing", occurrences });
    continue;
  }
  const mutated = canonicalSql.replace(mutation.from, mutation.to);
  const killed = !sqlContractHolds(mutated);
  results.push({ name: `migration: ${mutation.name}`, applied: true, killed, status: killed ? "killed" : "survived" });
}

const canonicalHolds = sqlContractHolds(canonicalSql);
results.push({ name: "canonical migration satisfies the exact durable delta", applied: true, killed: canonicalHolds, status: canonicalHolds ? "killed" : "survived" });

const residue = Object.values(files).every((file) => fs.readFileSync(path.join(root, file), "utf8") === canonical.get(file))
  && fs.readFileSync(path.join(root, SR2C_SUCCESSOR_MIGRATION), "utf8") === canonicalSql;
const survived = results.filter(({ status }) => status === "survived");
const anchorMissing = results.filter(({ status }) => status === "anchor_missing");

console.log(JSON.stringify({
  suite: "social-profile-sr2c-mutations",
  status: survived.length === 0 && anchorMissing.length === 0 && residue ? "passed" : "failed",
  totalMutations: results.length,
  applied: results.filter(({ applied }) => applied).length,
  killed: results.filter(({ killed }) => killed).length,
  survived: survived.length,
  anchorMissing: anchorMissing.length,
  repositoryBytesUnchanged: residue,
  failures: [...survived, ...anchorMissing],
  results,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  productionTouched: false
}, null, 2));
process.exit(survived.length === 0 && anchorMissing.length === 0 && residue ? 0 : 1);
