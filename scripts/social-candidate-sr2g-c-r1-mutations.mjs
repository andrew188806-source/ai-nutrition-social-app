#!/usr/bin/env node
// SR-2G-C-R1 meaningful mutation contract. Mutants execute in memory; repository bytes are never
// changed. Three families:
//   A. the membership REPAIR, mutated in an executable pg_auth_members model
//   B. the REPAIR MIGRATION, mutated as text against the structural contract
//   C. the frozen SR-2G-C POOL FUNCTION BODY, mutated as text against the semantic contract, so a
//      round claiming to be "hygiene only" cannot quietly move eligibility, reduction or ranking.
import fs from "node:fs";
import path from "node:path";
import {
  SR2GCR1_MIGRATION,
  SR2GCR1_POOL_CAPABILITIES,
  SR2GCR1_TARGET_ROLE
} from "./social-candidate-sr2g-c-r1-successor-manifest.mjs";

const root = process.cwd();
const POOL_MIGRATION = "supabase/migrations/20260817030000_meal_buddy_candidate_pool_authority.sql";
const sqlExecutable = (s) => s.replace(/(^|\n)\s*--[^\n]*/g, "$1");
const migrationSource = fs.readFileSync(path.join(root, SR2GCR1_MIGRATION), "utf8");
const poolMigrationSource = sqlExecutable(fs.readFileSync(path.join(root, POOL_MIGRATION), "utf8"));
const count = (h, n) => h.split(n).length - 1;

const POOL = SR2GCR1_TARGET_ROLE;
const key = (r) => `${r.role}|${r.member}|${r.grantor}`;
const DEBT = { role: POOL, member: "postgres", grantor: "postgres", admin_option: false, inherit_option: true, set_option: true };
const legit = (role) => ({ role, member: "postgres", grantor: "supabase_admin", admin_option: true, inherit_option: false, set_option: false });
const OTHER_ROLES = ["meal_buddy_card_write_authority", "social_authority", "social_pair_read_authority",
  "social_profile_projection_authority", "social_runtime_executor"];
const DIRTY = [DEBT, legit(POOL), ...OTHER_ROLES.map(legit)].sort((a, b) => key(a).localeCompare(key(b)));
const CLEAN = DIRTY.filter((r) => !(r.role === POOL && r.grantor === "postgres"));

const CLEAN_RUNTIME = Object.freeze({
  functionOwner: POOL, securityDefiner: true, volatility: "s",
  authorizedCandidatesExecute: true, mealBuddyCardsSelect: true, executorExecute: true,
  anonExecute: false, authenticatedExecute: false, serviceRoleExecute: false,
  schemaCreate: false, memberOfSocialAuthority: false, bodyChanged: false,
  writeAuthorityTouched: false
});
const CANONICAL = Object.freeze({
  revokeByGrantor: true, useWithSetFalse: false, revokeIndiscriminately: false,
  removeOtherGrantorRow: false, mutateLegitimateRow: false, ...CLEAN_RUNTIME
});

function applyRepair(rules) {
  let rows = DIRTY.map((r) => ({ ...r }));
  if (rules.useWithSetFalse) {
    rows = rows.map((r) => (r.role === POOL && r.grantor === "postgres" ? { ...r, set_option: false } : r));
  } else if (rules.revokeIndiscriminately) {
    rows = rows.filter((r) => r.role !== POOL);
  } else if (rules.removeOtherGrantorRow) {
    rows = rows.filter((r) => !(r.role === POOL && r.grantor === "supabase_admin"));
  } else if (rules.revokeByGrantor) {
    rows = rows.filter((r) => !(r.role === POOL && r.grantor === "postgres"));
  }
  if (rules.mutateLegitimateRow) {
    rows = rows.map((r) => (r.role === POOL && r.grantor === "supabase_admin" ? { ...r, inherit_option: true, set_option: true } : r));
  }
  if (rules.writeAuthorityTouched) {
    rows = rows.filter((r) => r.role !== "meal_buddy_card_write_authority");
  }
  return rows;
}

function repairViolations(rules) {
  const failed = [];
  const record = (name, condition) => { if (!condition) failed.push(name); };
  const rows = applyRepair(rules);
  const pool = rows.filter((r) => r.role === POOL);

  record("the postgres-granted pool row is gone", !pool.some((r) => r.grantor === "postgres"));
  record("the supabase_admin pool row survives", pool.some((r) => r.grantor === "supabase_admin"));
  record("exactly one pool membership row remains", pool.length === 1);
  record("postgres cannot SET ROLE into the pool authority", !pool.some((r) => r.set_option));
  record("postgres does not inherit the pool authority", !pool.some((r) => r.inherit_option));
  record("ADMIN OPTION over the pool role is preserved", pool.some((r) => r.admin_option));
  record("the whole post-repair topology is exactly the expected row set", JSON.stringify(rows) === JSON.stringify(CLEAN));
  for (const role of OTHER_ROLES) {
    record(`${role} membership is untouched`,
      JSON.stringify(rows.find((r) => r.role === role)) === JSON.stringify(legit(role)));
  }

  // Runtime invariance: a hygiene repair must move none of it.
  record("pool function ownership is unchanged", rules.functionOwner === POOL);
  record("SECURITY DEFINER is unchanged", rules.securityDefiner === true);
  record("STABLE volatility is unchanged", rules.volatility === "s");
  record("authorized_candidates EXECUTE is retained", rules.authorizedCandidatesExecute === true);
  record("meal_buddy_cards SELECT is retained", rules.mealBuddyCardsSelect === true);
  record("executor EXECUTE is retained", rules.executorExecute === true);
  record("anon still cannot execute", rules.anonExecute === false);
  record("authenticated still cannot execute", rules.authenticatedExecute === false);
  record("service_role still has no product execute", rules.serviceRoleExecute === false);
  record("the pool authority holds no schema CREATE", rules.schemaCreate === false);
  record("the pool authority is not a member of social_authority", rules.memberOfSocialAuthority === false);
  record("the pool function body is not redefined", rules.bodyChanged === false);
  return failed;
}

function migrationViolations(source) {
  const failed = [];
  const record = (name, condition) => { if (!condition) failed.push(name); };
  const sql = sqlExecutable(source);

  record("the repair revokes the pool role by grantor",
    new RegExp(`revoke ${POOL} from postgres granted by postgres;`).test(sql));
  record("the WITH SET FALSE form is never used", !/with set false/i.test(sql));
  record("no indiscriminate revoke exists", !new RegExp(`revoke ${POOL} from postgres;`).test(sql));
  record("no other grantor is ever named", !/granted by (?!postgres)/i.test(sql));
  record("exactly one revoke statement exists", count(sql, "revoke ") === 1);
  record("nothing is granted", !/^\s*grant /m.test(sql));
  record("no other authority role is revoked",
    !/revoke (social_authority|social_pair_read_authority|social_profile_projection_authority|social_runtime_executor|meal_buddy_card_write_authority)\b/.test(sql));
  record("the SR-2G-B-R1 write authority is not referenced", !/meal_buddy_card_write_authority/.test(sql));
  record("no role attribute is altered", !/alter role/i.test(sql));
  record("no function is created, replaced or dropped", !/(create|drop)\s+(or replace\s+)?function/i.test(sql));
  record("no function is altered, so ownership cannot move", !/alter function/i.test(sql));
  record("no policy is created, altered or dropped", !/(create|alter|drop) policy/i.test(sql));
  record("no table is created or altered", !/(create|alter) table/i.test(sql));
  record("no privilege is granted to a client role", !/(anon|authenticated|authenticator|service_role)/.test(sql));
  record("the pool primitive is not referenced", !/canonical_meal_buddy_candidate_cards/.test(sql));
  record("the frozen authorization primitive is not referenced", !/authorized_candidates/.test(sql));
  record("no eligibility or reduction rule appears", !/dining_date|meal_period|restaurant_id|row_number|owner_rank/.test(sql));
  record("no ranking or exposure is introduced", !/rank|score|similarity|exposure/i.test(sql));
  record("the migration is transactional", /^begin;/m.test(sql) && /^commit;/m.test(sql));
  return failed;
}

// --- family C: the frozen pool function semantics --------------------------------------------------------
function poolBodyViolations(source) {
  const failed = [];
  const record = (name, condition) => { if (!condition) failed.push(name); };

  record("the source card is constrained to the acting owner",
    /card\.owner_user_id\s*=\s*p_actor_user_id/.test(source));
  record("the source card must be live", /card\.cancelled_at is null/.test(source) && /card\.expires_at\s*>\s*p_authority_instant/.test(source));
  record("self is excluded from the candidate side",
    /candidate\.owner_user_id\s*<>\s*source\.owner_user_id/.test(source));
  record("the candidate card must be live",
    /candidate\.cancelled_at is null/.test(source) && /candidate\.expires_at\s*>\s*p_authority_instant/.test(source));
  record("dining_date eligibility is exact",
    /candidate\.dining_date\s*=\s*source\.dining_date/.test(source));
  record("meal_period eligibility is exact",
    /candidate\.meal_period\s*=\s*source\.meal_period/.test(source));
  record("the restaurant rule is retained",
    /candidate\.restaurant_id\s*=\s*source\.restaurant_id/.test(source) && /card_type\s*<>\s*'restaurant'/.test(source));
  record("one card per owner is reduced by row_number",
    /row_number\(\) over \(/.test(source) && /partition by compatible\.owner_user_id/.test(source));
  record("the reduction orders created_at DESC then id ASC",
    /order by compatible\.created_at desc,\s*compatible\.id asc/.test(source));
  record("only the top card per owner survives", /owner_rank\s*=\s*1/.test(source));
  record("composition with the frozen authorization primitive is retained",
    /social_internal\.authorized_candidates\(/.test(source));
  record("the authorized set is joined, not merely queried",
    /join authorized on authorized\.user_id\s*=\s*selected\.owner_user_id/.test(source));
  record("no LIMIT is imposed", !/\blimit\b/i.test(source));
  record("no Taste ranking is present", !/\b(rank_score|similarity|jaccard|cosine|cold[_ ]?start|taste)\b/i.test(source));
  record("no SR-2B exposure is present", !/\b(exposure|applySocialExposure|willing_to_chat)\b/i.test(source));
  return failed;
}

const poolBody = (poolMigrationSource.match(/create function social_internal\.canonical_meal_buddy_candidate_cards[\s\S]*?as \$\$([\s\S]*?)\$\$;/) ?? ["", ""])[1];

// --- mutants -------------------------------------------------------------------------------------------
const repairMutants = [
  ["the postgres-granted pool row is left in place", { revokeByGrantor: false }],
  ["WITH SET FALSE is used instead of revoke-by-grantor", { revokeByGrantor: false, useWithSetFalse: true }],
  ["every pool membership row is revoked indiscriminately", { revokeByGrantor: false, revokeIndiscriminately: true }],
  ["the other grantor's legitimate row is removed instead", { revokeByGrantor: false, removeOtherGrantorRow: true }],
  ["the legitimate pool row gains INHERIT and SET", { mutateLegitimateRow: true }],
  ["meal_buddy_card_write_authority membership is modified", { writeAuthorityTouched: true }],
  ["the pool authority is made a member of social_authority", { memberOfSocialAuthority: true }],
  ["pool function ownership is changed", { functionOwner: "postgres" }],
  ["SECURITY DEFINER is dropped", { securityDefiner: false }],
  ["STABLE is weakened to VOLATILE", { volatility: "v" }],
  ["authorized_candidates EXECUTE is removed", { authorizedCandidatesExecute: false }],
  ["meal_buddy_cards SELECT is removed", { mealBuddyCardsSelect: false }],
  ["executor EXECUTE is removed", { executorExecute: false }],
  ["anon is granted EXECUTE", { anonExecute: true }],
  ["authenticated is granted EXECUTE", { authenticatedExecute: true }],
  ["service_role is granted product EXECUTE", { serviceRoleExecute: true }],
  ["schema CREATE is left on the pool authority", { schemaCreate: true }],
  ["the pool function body is redefined", { bodyChanged: true }]
];

const migrationMutants = [
  ["the revoke is dropped entirely", (s) => s.replace(/revoke [^;]*;\n/, "")],
  ["restoration uses the proven-incorrect WITH SET FALSE form",
    (s) => s.replace(`revoke ${POOL} from postgres granted by postgres;`, `grant ${POOL} to postgres with set false;`)],
  ["the GRANTED BY qualifier is dropped, making the revoke indiscriminate",
    (s) => s.replace(`revoke ${POOL} from postgres granted by postgres;`, `revoke ${POOL} from postgres;`)],
  ["another grantor's row is targeted", (s) => s.replace("granted by postgres;", "granted by supabase_admin;")],
  ["the SR-2G-B-R1 write authority membership is revoked too",
    (s) => s.replace("commit;", "revoke meal_buddy_card_write_authority from postgres granted by postgres;\n\ncommit;")],
  ["social_authority membership is revoked too",
    (s) => s.replace("commit;", "revoke social_authority from postgres granted by postgres;\n\ncommit;")],
  ["the pool authority is made a member of social_authority",
    (s) => s.replace("commit;", `grant social_authority to ${POOL};\n\ncommit;`)],
  ["the pool role attributes are altered", (s) => s.replace("commit;", `alter role ${POOL} with bypassrls;\n\ncommit;`)],
  ["pool function ownership is changed",
    (s) => s.replace("commit;", `alter function social_internal.canonical_meal_buddy_candidate_cards(uuid,uuid,timestamptz) owner to postgres;\n\ncommit;`)],
  ["the pool function is redefined",
    (s) => s.replace("commit;", "create or replace function social_internal.canonical_meal_buddy_candidate_cards(uuid,uuid,timestamptz) returns setof record language sql as $x$ select 1 $x$;\n\ncommit;")],
  ["executor EXECUTE is revoked",
    (s) => s.replace("commit;", "revoke execute on function social_internal.canonical_meal_buddy_candidate_cards(uuid,uuid,timestamptz) from social_runtime_executor;\n\ncommit;")],
  ["authorized_candidates EXECUTE is revoked",
    (s) => s.replace("commit;", `revoke execute on function social_internal.authorized_candidates(uuid, uuid[]) from ${POOL};\n\ncommit;`)],
  ["meal_buddy_cards SELECT is revoked",
    (s) => s.replace("commit;", `revoke select on table public.meal_buddy_cards from ${POOL};\n\ncommit;`)],
  ["authenticated is granted EXECUTE",
    (s) => s.replace("commit;", "grant execute on function social_internal.canonical_meal_buddy_candidate_cards(uuid,uuid,timestamptz) to authenticated;\n\ncommit;")],
  ["anon is granted EXECUTE",
    (s) => s.replace("commit;", "grant execute on function social_internal.canonical_meal_buddy_candidate_cards(uuid,uuid,timestamptz) to anon;\n\ncommit;")],
  ["service_role is granted product EXECUTE",
    (s) => s.replace("commit;", "grant execute on function social_internal.canonical_meal_buddy_candidate_cards(uuid,uuid,timestamptz) to service_role;\n\ncommit;")],
  ["the role-scoped RLS policy is dropped",
    (s) => s.replace("commit;", "drop policy meal_buddy_cards_candidate_pool_read on public.meal_buddy_cards;\n\ncommit;")]
];

const poolBodyMutants = [
  ["source ownership is weakened", (s) => s.replace(/and card\.owner_user_id = p_actor_user_id\n/, "")],
  ["the source liveness check is dropped", (s) => s.replace(/and card\.cancelled_at is null\n/, "")],
  ["self exclusion is removed", (s) => s.replace(/candidate\.owner_user_id <> source\.owner_user_id/, "true")],
  ["dining_date eligibility is dropped", (s) => s.replace(/and candidate\.dining_date = source\.dining_date\n/, "")],
  ["meal_period eligibility is dropped", (s) => s.replace(/and candidate\.meal_period = source\.meal_period\n/, "")],
  // The restaurant rule is the last disjunct of an OR, not a conjunct: neutralising it means
  // replacing that disjunct with a tautology.
  ["the restaurant rule is dropped", (s) => s.replace(/or candidate\.restaurant_id = source\.restaurant_id/, "or true")],
  ["the one-card-per-owner reduction is removed", (s) => s.replace(/where one_per_owner\.owner_rank = 1/, "where true")],
  ["the reduction tie-break order is inverted", (s) => s.replace(/order by compatible\.created_at desc, compatible\.id asc/, "order by compatible.created_at asc, compatible.id desc")],
  ["the reduction partition is removed", (s) => s.replace(/partition by compatible\.owner_user_id\n/, "")],
  ["composition with authorized_candidates is removed", (s) => s.replace(/social_internal\.authorized_candidates\(/, "social_internal.no_op_candidates(")],
  ["the authorized join is dropped", (s) => s.replace(/join authorized on authorized\.user_id = selected\.owner_user_id/, "")],
  ["a LIMIT is imposed", (s) => s.replace(/order by selected\.owner_user_id asc/, "limit 20\n  order by selected.owner_user_id asc")],
  ["Taste ranking leaks in", (s) => s.replace(/select\n    selected\.owner_user_id,/, "select\n    selected.owner_user_id, -- rank_score\n    similarity_placeholder,")],
  ["SR-2B exposure leaks in", (s) => s.replace(/selected\.preferred_time,/, "selected.preferred_time, exposure_flag, willing_to_chat,")]
];

const results = [];
const push = (name, applied, failed) => {
  const killed = applied && failed.length > 0;
  results.push({ name, applied, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
};

for (const [label, source, violations] of [
  ["canonical repair satisfies the exact SR-2G-C-R1 posture contract", CANONICAL, repairViolations],
  ["canonical migration satisfies the exact SR-2G-C-R1 structural contract", migrationSource, migrationViolations],
  ["the frozen SR-2G-C pool body satisfies the exact semantic contract", poolBody, poolBodyViolations]
]) {
  const failed = violations(source);
  results.push({ name: label, applied: true, killed: failed.length === 0, status: failed.length === 0 ? "killed" : "survived", violations: failed });
  if (failed.length) console.log(`BASELINE BROKEN ${label}: ${failed.join(" | ")}`);
}

for (const [name, override] of repairMutants) push(name, true, repairViolations({ ...CANONICAL, ...override }));

for (const [name, apply] of migrationMutants) {
  const mutated = apply(migrationSource);
  const applied = mutated !== migrationSource;
  // A mutation that failed to apply proves nothing: report it as a survivor, never as a kill.
  push(name, applied, applied ? migrationViolations(mutated) : ["mutation did not apply"]);
}

for (const [name, apply] of poolBodyMutants) {
  const mutated = apply(poolBody);
  const applied = mutated !== poolBody;
  push(name, applied, applied ? poolBodyViolations(mutated) : ["mutation did not apply"]);
}

const survivors = results.filter((entry) => entry.status === "survived");
console.log(JSON.stringify({
  suite: "social-candidate-sr2g-c-r1-mutations",
  total: results.length,
  killed: results.length - survivors.length,
  survived: survivors.length,
  survivors,
  poolBodyExtracted: poolBody.length,
  repositoryBytesModified: false
}, null, 2));
process.exit(survivors.length === 0 ? 0 : 1);
