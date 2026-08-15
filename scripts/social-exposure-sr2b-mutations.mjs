#!/usr/bin/env node
// SR-2B meaningful mutation contract. Mutants execute in memory; repository bytes are never changed.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { SR2B_SUCCESSOR_MIGRATION } from "./social-exposure-sr2b-successor-manifest.mjs";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const moduleRoot = "supabase/functions/_shared/social-exposure";
const files = Object.freeze({
  apply: `${moduleRoot}/applySocialExposure.ts`,
  policy: `${moduleRoot}/policy.ts`,
  resolve: `${moduleRoot}/resolveEntitlement.ts`,
  types: `${moduleRoot}/types.ts`,
  index: `${moduleRoot}/index.ts`
});
const canonical = new Map(Object.values(files).map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const canonicalSql = fs.readFileSync(path.join(root, SR2B_SUCCESSOR_MIGRATION), "utf8");

function loadExposure(overrides = new Map()) {
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
      if (!resolved) throw new Error(`unresolved exposure import: ${specifier}`);
      return load(resolved);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    return module.exports;
  };
  return load(path.join(root, files.index));
}

const id = (suffix) => `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const STATES = ["scored", "not_scored", "unsupported"];
const ranking = (count, state = "scored") => ({
  policyVersion: "social-ranking-v1",
  ordered: Array.from({ length: count }, (_, index) => ({
    candidateUserId: id(index),
    rankingState: typeof state === "function" ? state(index) : state
  }))
});
const FREE = { class: "free" };
const PREMIUM = { class: "premium" };
const NOW = new Date("2026-08-15T12:00:00.000Z");
const ACTOR = id(1);
const rowSource = (outcome) => ({
  from: () => ({ select: () => ({ eq: () => Promise.resolve(outcome) }) })
});
const rows = (data) => ({ data, error: null });
const row = (overrides = {}) => ({
  plan_code: "premium",
  status: "active",
  valid_from: "2026-01-01T00:00:00.000Z",
  valid_until: null,
  ...overrides
});

// Records exactly what the resolver asked the row source for, so a widened column set or a
// caller-supplied target is observable rather than merely readable in the source.
function capturingRowSource(outcome, calls) {
  return {
    from: (table) => {
      calls.push({ fn: "from", table });
      return {
        select: (columns) => {
          calls.push({ fn: "select", columns });
          return {
            eq: (column, value) => {
              calls.push({ fn: "eq", column, value });
              return Promise.resolve(outcome);
            }
          };
        }
      };
    }
  };
}

async function classOf(exposure, outcome) {
  const fact = await exposure.resolveSocialEntitlement(rowSource(outcome), ACTOR, NOW);
  return fact.class;
}
async function failsClosed(exposure, outcome) {
  try { await exposure.resolveSocialEntitlement(rowSource(outcome), ACTOR, NOW); return false; } catch { return true; }
}

// Each detector returns true when the mutant is KILLED (observable contract regression).
const sourceMutations = [
  { name: "free cap widened from 3", file: files.policy, from: "SOCIAL_EXPOSURE_FREE_CAP = 3 as const", to: "SOCIAL_EXPOSURE_FREE_CAP = 4 as const",
    detect: async (m) => m.applySocialExposure(ranking(9), FREE).exposed.length !== 3 },
  { name: "free cap narrowed from 3", file: files.policy, from: "SOCIAL_EXPOSURE_FREE_CAP = 3 as const", to: "SOCIAL_EXPOSURE_FREE_CAP = 2 as const",
    detect: async (m) => m.applySocialExposure(ranking(9), FREE).exposed.length !== 3 },
  { name: "premium cap widened from 10", file: files.policy, from: "SOCIAL_EXPOSURE_PREMIUM_CAP = 10 as const", to: "SOCIAL_EXPOSURE_PREMIUM_CAP = 11 as const",
    detect: async (m) => m.applySocialExposure(ranking(20), PREMIUM).exposed.length !== 10 },
  { name: "premium cap narrowed from 10", file: files.policy, from: "SOCIAL_EXPOSURE_PREMIUM_CAP = 10 as const", to: "SOCIAL_EXPOSURE_PREMIUM_CAP = 5 as const",
    detect: async (m) => m.applySocialExposure(ranking(20), PREMIUM).exposed.length !== 10 },
  { name: "free and premium caps swapped", file: files.policy, from: "free: SOCIAL_EXPOSURE_FREE_CAP,\n  premium: SOCIAL_EXPOSURE_PREMIUM_CAP", to: "free: SOCIAL_EXPOSURE_PREMIUM_CAP,\n  premium: SOCIAL_EXPOSURE_FREE_CAP",
    detect: async (m) => m.applySocialExposure(ranking(20), FREE).exposed.length !== 3 },

  { name: "prefix replaced by suffix", file: files.apply, from: "admitted.slice(0, cap)", to: "admitted.slice(-cap)",
    detect: async (m) => m.applySocialExposure(ranking(9), FREE).exposed[0].candidateUserId !== id(0) },
  { name: "exposed order reversed", file: files.apply, from: "admitted.slice(0, cap)", to: "admitted.slice(0, cap).reverse()",
    detect: async (m) => m.applySocialExposure(ranking(9), FREE).exposed[0].candidateUserId !== id(0) },
  { name: "exposure sorts the frozen ranking", file: files.apply, from: "admitted.slice(0, cap)", to: "[...admitted].sort((left, right) => right.candidateUserId.localeCompare(left.candidateUserId)).slice(0, cap)",
    detect: async (m) => m.applySocialExposure(ranking(9), FREE).exposed[0].candidateUserId !== id(0) },
  { name: "unsupported candidates filtered out", file: files.apply, from: "const admitted = ranking.ordered.map(admitCandidate);", to: "const admitted = ranking.ordered.map(admitCandidate).filter((entry) => entry.rankingState !== \"unsupported\");",
    detect: async (m) => !m.applySocialExposure(ranking(3, "unsupported"), FREE).exposed.length },
  { name: "cold-start candidates filtered out", file: files.apply, from: "const admitted = ranking.ordered.map(admitCandidate);", to: "const admitted = ranking.ordered.map(admitCandidate).filter((entry) => entry.rankingState !== \"not_scored\");",
    detect: async (m) => !m.applySocialExposure(ranking(3, "not_scored"), FREE).exposed.length },
  { name: "only scored candidates exposed", file: files.apply, from: "const admitted = ranking.ordered.map(admitCandidate);", to: "const admitted = ranking.ordered.map(admitCandidate).filter((entry) => entry.rankingState === \"scored\");",
    detect: async (m) => m.applySocialExposure(ranking(9, (index) => STATES[index % 3]), PREMIUM).exposed.length !== 9 },
  { name: "truncation boundary loosened", file: files.apply, from: "truncated: admitted.length > cap", to: "truncated: admitted.length > cap + 1",
    detect: async (m) => m.applySocialExposure(ranking(4), FREE).truncated !== true },
  { name: "truncation boundary tightened", file: files.apply, from: "truncated: admitted.length > cap", to: "truncated: admitted.length >= cap",
    detect: async (m) => m.applySocialExposure(ranking(3), FREE).truncated !== false },
  { name: "entitlement class leaked into output", file: files.apply, from: "truncated: admitted.length > cap", to: "truncated: admitted.length > cap, entitlementClass: entitlement.class",
    detect: async (m) => Object.keys(m.applySocialExposure(ranking(1), FREE)).length !== 3 },
  { name: "pagination cursor added to output", file: files.apply, from: "truncated: admitted.length > cap", to: "truncated: admitted.length > cap, nextPageOffset: cap",
    detect: async (m) => Object.keys(m.applySocialExposure(ranking(1), FREE)).length !== 3 },
  { name: "unknown entitlement class silently treated as free", file: files.apply, from: "if (typeof cap !== \"number\") return socialEntitlementContractViolation();", to: "if (typeof cap !== \"number\") return SOCIAL_EXPOSURE_CAPS.free;",
    detect: async (m) => { try { m.applySocialExposure(ranking(1), { class: "enterprise" }); return true; } catch { return false; } } },

  { name: "grace_period downgraded out of premium", file: files.policy, from: "SOCIAL_ENTITLEMENT_PREMIUM_STATUSES = Object.freeze([\n  \"active\",\n  \"grace_period\"\n]", to: "SOCIAL_ENTITLEMENT_PREMIUM_STATUSES = Object.freeze([\n  \"active\"\n]",
    detect: async (m) => await classOf(m, rows([row({ status: "grace_period" })])) !== "premium" },
  { name: "expired status upgraded to premium", file: files.policy, from: "SOCIAL_ENTITLEMENT_PREMIUM_STATUSES = Object.freeze([\n  \"active\",\n  \"grace_period\"\n]", to: "SOCIAL_ENTITLEMENT_PREMIUM_STATUSES = Object.freeze([\n  \"active\",\n  \"grace_period\",\n  \"expired\"\n]",
    detect: async (m) => await classOf(m, rows([row({ status: "expired" })])) !== "free" },
  { name: "cancelled status upgraded to premium", file: files.policy, from: "SOCIAL_ENTITLEMENT_PREMIUM_STATUSES = Object.freeze([\n  \"active\",\n  \"grace_period\"\n]", to: "SOCIAL_ENTITLEMENT_PREMIUM_STATUSES = Object.freeze([\n  \"active\",\n  \"grace_period\",\n  \"cancelled\"\n]",
    detect: async (m) => await classOf(m, rows([row({ status: "cancelled" })])) !== "free" },
  { name: "entitled-status gate removed entirely", file: files.resolve, from: "if (!PREMIUM_STATUSES.has(status)) return false;", to: "",
    detect: async (m) => await classOf(m, rows([row({ status: "expired" })])) !== "free" },
  { name: "valid_from ignored", file: files.resolve, from: "if (nowMs < validFromMs) return false;", to: "",
    detect: async (m) => await classOf(m, rows([row({ valid_from: "2026-09-01T00:00:00.000Z" })])) !== "free" },
  { name: "valid_until ignored", file: files.resolve, from: "if (validUntilMs !== null && nowMs > validUntilMs) return false;", to: "",
    detect: async (m) => await classOf(m, rows([row({ valid_until: "2026-08-01T00:00:00.000Z" })])) !== "free" },
  { name: "unknown plan_code silently downgraded to free", file: files.resolve, from: "if (typeof planCode !== \"string\" || !PLAN_CODES.has(planCode)) return socialEntitlementContractViolation();", to: "if (typeof planCode !== \"string\" || !PLAN_CODES.has(planCode)) return false;",
    detect: async (m) => await failsClosed(m, rows([row({ plan_code: "enterprise" })])) === false },
  { name: "unknown plan_code silently upgraded to premium", file: files.resolve, from: "if (typeof planCode !== \"string\" || !PLAN_CODES.has(planCode)) return socialEntitlementContractViolation();", to: "if (typeof planCode !== \"string\" || !PLAN_CODES.has(planCode)) return true;",
    detect: async (m) => await failsClosed(m, rows([row({ plan_code: "enterprise" })])) === false },
  { name: "unknown status silently downgraded to free", file: files.resolve, from: "if (typeof status !== \"string\" || !STATUSES.has(status)) return socialEntitlementContractViolation();", to: "if (typeof status !== \"string\" || !STATUSES.has(status)) return false;",
    detect: async (m) => await failsClosed(m, rows([row({ status: "trialing" })])) === false },
  { name: "read failure converted to canonical free", file: files.resolve, from: "if (outcome.error !== null && outcome.error !== undefined) return socialEntitlementContractViolation();", to: "if (outcome.error !== null && outcome.error !== undefined) return FREE;",
    detect: async (m) => await failsClosed(m, { data: null, error: { message: "permission denied" } }) === false },
  { name: "malformed payload converted to canonical free", file: files.resolve, from: "if (!Array.isArray(outcome.data)) return socialEntitlementContractViolation();", to: "if (!Array.isArray(outcome.data)) return FREE;",
    detect: async (m) => await failsClosed(m, { data: null, error: null }) === false },
  { name: "malformed row accepted instead of failing closed", file: files.resolve, from: "if (!isRecord(value)) return socialEntitlementContractViolation();", to: "if (!isRecord(value)) return false;",
    detect: async (m) => await failsClosed(m, rows([null])) === false },
  { name: "unparsable validity instant accepted", file: files.resolve, from: "if (!Number.isFinite(parsed)) return socialEntitlementContractViolation();", to: "if (!Number.isFinite(parsed)) return 0;",
    detect: async (m) => await failsClosed(m, rows([row({ valid_from: "not-a-timestamp" })])) === false },
  { name: "owner predicate replaced by an arbitrary caller-supplied target", file: files.resolve, from: ".eq(\"user_id\", actorUserId)", to: ".eq(\"user_id\", arguments.length > 3 ? arguments[3] : actorUserId)",
    detect: async (m) => {
      const calls = [];
      await m.resolveSocialEntitlement(capturingRowSource(rows([]), calls), ACTOR, NOW, id(999));
      return calls.some(({ fn, value }) => fn === "eq" && value !== ACTOR);
    } },
  { name: "absent entitlement row throws instead of resolving free", file: files.resolve, from: "return grantsPremium.some(Boolean) ? PREMIUM : FREE;", to: "if (grantsPremium.length === 0) return socialEntitlementContractViolation();\n  return grantsPremium.some(Boolean) ? PREMIUM : FREE;",
    detect: async (m) => await failsClosed(m, rows([])) === true },
  { name: "live premium suppressed by a historical expired row", file: files.resolve, from: "return grantsPremium.some(Boolean) ? PREMIUM : FREE;", to: "return grantsPremium.every(Boolean) && grantsPremium.length > 0 ? PREMIUM : FREE;",
    detect: async (m) => await classOf(m, rows([row({ status: "expired" }), row()])) !== "premium" },
  // The frozen multi-row authority requires the COMPLETE visible row set to be validated before any
  // premium decision, so every lazy short-circuit must be observable.
  { name: "eager row validation replaced by a short-circuiting some()", file: files.resolve,
    from: "const grantsPremium = outcome.data.map((row) => rowGrantsPremium(row, nowMs));\n  return grantsPremium.some(Boolean) ? PREMIUM : FREE;",
    to: "return outcome.data.some((row) => rowGrantsPremium(row, nowMs)) ? PREMIUM : FREE;",
    detect: async (m) => await failsClosed(m, rows([row(), row({ plan_code: "enterprise" })])) === false },
  { name: "eager row validation replaced by a short-circuiting find()", file: files.resolve,
    from: "const grantsPremium = outcome.data.map((row) => rowGrantsPremium(row, nowMs));\n  return grantsPremium.some(Boolean) ? PREMIUM : FREE;",
    to: "return outcome.data.find((row) => rowGrantsPremium(row, nowMs)) ? PREMIUM : FREE;",
    detect: async (m) => await failsClosed(m, rows([row(), row({ plan_code: "enterprise" })])) === false },
  { name: "only the first visible row evaluated", file: files.resolve,
    from: "const grantsPremium = outcome.data.map((row) => rowGrantsPremium(row, nowMs));",
    to: "const grantsPremium = outcome.data.slice(0, 1).map((row) => rowGrantsPremium(row, nowMs));",
    detect: async (m) => await classOf(m, rows([row({ status: "expired" }), row()])) !== "premium" },
  { name: "row order made significant", file: files.resolve,
    from: "const grantsPremium = outcome.data.map((row) => rowGrantsPremium(row, nowMs));\n  return grantsPremium.some(Boolean) ? PREMIUM : FREE;",
    to: "const grantsPremium = outcome.data.map((row) => rowGrantsPremium(row, nowMs));\n  return grantsPremium[0] === true ? PREMIUM : FREE;",
    detect: async (m) => await classOf(m, rows([row({ status: "expired" }), row()])) !== "premium" },
  { name: "an active free row suppresses a valid premium row", file: files.resolve,
    from: "if (planCode !== \"premium\") return false;",
    to: "if (planCode !== \"premium\") return true;",
    detect: async (m) => await classOf(m, rows([row({ plan_code: "free" })])) !== "free" },

  { name: "billing provenance columns selected", file: files.resolve, from: "\"plan_code,status,valid_from,valid_until\"", to: "\"plan_code,status,valid_from,valid_until,entitlement_source,source_reference\"",
    detect: async (m) => {
      const calls = [];
      await m.resolveSocialEntitlement(capturingRowSource(rows([]), calls), ACTOR, NOW);
      return calls.some(({ fn, columns }) => fn === "select" && /entitlement_source|source_reference/.test(columns));
    } }
];

const sqlMutations = [
  { name: "grant broadened to anon", from: "to authenticated;", to: "to authenticated, anon;" },
  { name: "grant broadened to PUBLIC", from: "to authenticated;", to: "to public;" },
  { name: "grant broadened to the Social runtime executor", from: "to authenticated;", to: "to social_runtime_executor;" },
  { name: "grant broadened to service_role", from: "to authenticated;", to: "to service_role;" },
  { name: "write privilege added", from: "grant select on table", to: "grant select, insert, update on table" },
  { name: "all privileges granted", from: "grant select on table", to: "grant all privileges on table" },
  { name: "owner-read policy weakened", from: "grant select on table public.subscription_entitlements to authenticated;", to: "alter policy subscription_entitlements_owner_read on public.subscription_entitlements using (true);" },
  { name: "arbitrary-target entitlement primitive introduced", from: "grant select on table public.subscription_entitlements to authenticated;", to: "create function public.entitlement_of(p_user uuid) returns text language sql security definer as $$ select plan_code from public.subscription_entitlements where user_id = p_user $$;" }
];

// Mirrors the guard's exact durable-delta assertions over the mutated SQL.
function sqlContractHolds(sql) {
  const executable = sql.split(/\r?\n/).map((line) => (line.trim().startsWith("--") ? "" : line.split("--")[0])).join("\n").replace(/\s+/g, " ").trim();
  return executable === "grant select on table public.subscription_entitlements to authenticated;"
    && !/\bto\s+(anon|public|service_role|social_runtime_executor|social_pair_read_authority|social_authority)\b/i.test(executable)
    && !/\b(insert|update|delete|truncate|references|trigger|execute|all privileges|grant all)\b/i.test(executable)
    && !/\b(create|alter|drop|revoke)\b/i.test(executable);
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
    killed = Boolean(await mutation.detect(loadExposure(overrides)));
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
  && fs.readFileSync(path.join(root, SR2B_SUCCESSOR_MIGRATION), "utf8") === canonicalSql;
const applied = results.filter(({ applied: was }) => was).length;
const killed = results.filter(({ killed: was }) => was).length;
const survived = results.filter(({ status }) => status === "survived");
const anchorMissing = results.filter(({ status }) => status === "anchor_missing");

console.log(JSON.stringify({
  suite: "social-exposure-sr2b-mutations",
  status: survived.length === 0 && anchorMissing.length === 0 && residue ? "passed" : "failed",
  totalMutations: results.length,
  applied,
  killed,
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
