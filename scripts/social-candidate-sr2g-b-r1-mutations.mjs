#!/usr/bin/env node
// SR-2G-B-R1 meaningful mutation contract. Mutants execute in memory; repository bytes are never
// changed. Two families: the membership REPAIR is mutated in an executable pg_auth_members model and
// must break a posture invariant, and the MIGRATION is mutated as text and must break the structural
// contract.
import fs from "node:fs";
import path from "node:path";
import { SR2GBR1_MIGRATION, SR2GBR1_TARGET_ROLE } from "./social-candidate-sr2g-b-r1-successor-manifest.mjs";

const root = process.cwd();
const migrationSource = fs.readFileSync(path.join(root, SR2GBR1_MIGRATION), "utf8");
const sqlExecutable = (s) => s.replace(/(^|\n)\s*--[^\n]*/g, "$1");
const count = (h, n) => h.split(n).length - 1;

const ROLE = SR2GBR1_TARGET_ROLE;
const key = (r) => `${r.role}|${r.member}|${r.grantor}`;
const DIRTY = [
  { role: ROLE, member: "postgres", grantor: "postgres", admin_option: false, inherit_option: true, set_option: true },
  { role: ROLE, member: "postgres", grantor: "supabase_admin", admin_option: true, inherit_option: false, set_option: false }
];
const CLEAN_RUNTIME = Object.freeze({
  functionOwner: ROLE, executorExecute: true,
  authenticatedInsert: false, authenticatedUpdate: false, authenticatedDelete: false,
  serviceRoleRuntime: false, quotaFree: 1, quotaPremium: 3, functionBodiesChanged: false,
  poolAuthorityUntouched: true, socialAuthorityUntouched: true
});

// --- the repair, expressed as knobs a mutant can turn ------------------------------------------------
const CANONICAL = Object.freeze({
  revokeByGrantor: true, useWithSetFalse: false, revokeIndiscriminately: false,
  removeOtherGrantorRow: false, mutateLegitimateRow: false, ...CLEAN_RUNTIME
});

function applyRepair(rules) {
  let rows = DIRTY.map((r) => ({ ...r }));
  if (rules.useWithSetFalse) {
    rows = rows.map((r) => (r.grantor === "postgres" ? { ...r, set_option: false } : r));
  } else if (rules.revokeIndiscriminately) {
    rows = [];
  } else if (rules.removeOtherGrantorRow) {
    rows = rows.filter((r) => r.grantor !== "supabase_admin");
  } else if (rules.revokeByGrantor) {
    rows = rows.filter((r) => r.grantor !== "postgres");
  }
  if (rules.mutateLegitimateRow) {
    rows = rows.map((r) => (r.grantor === "supabase_admin" ? { ...r, inherit_option: true, set_option: true } : r));
  }
  return rows;
}

function repairViolations(rules) {
  const failed = [];
  const record = (name, condition) => { if (!condition) failed.push(name); };
  const rows = applyRepair(rules);

  record("the postgres-granted row is gone", !rows.some((r) => r.grantor === "postgres"));
  record("the supabase_admin row survives", rows.some((r) => r.grantor === "supabase_admin"));
  record("exactly one membership row remains", rows.length === 1);
  record("postgres cannot SET ROLE into the write authority", !rows.some((r) => r.set_option));
  record("postgres does not inherit the write authority", !rows.some((r) => r.inherit_option));
  record("ADMIN OPTION is preserved", rows.some((r) => r.admin_option));
  record("the legitimate row is byte-identical to baseline",
    JSON.stringify(rows) === JSON.stringify([DIRTY[1]]));

  // Runtime invariance: a hygiene repair must move none of it.
  record("function ownership is unchanged", rules.functionOwner === ROLE);
  record("executor EXECUTE is retained", rules.executorExecute === true);
  record("authenticated INSERT stays denied", rules.authenticatedInsert === false);
  record("authenticated UPDATE stays denied", rules.authenticatedUpdate === false);
  record("authenticated DELETE stays denied", rules.authenticatedDelete === false);
  record("no service_role product runtime is introduced", rules.serviceRoleRuntime === false);
  record("the Free quota is unchanged", rules.quotaFree === 1);
  record("the Premium quota is unchanged", rules.quotaPremium === 3);
  record("no function body is redefined", rules.functionBodiesChanged === false);
  record("SR-2G-C pool authority is untouched", rules.poolAuthorityUntouched === true);
  record("social_authority membership is untouched", rules.socialAuthorityUntouched === true);
  return failed;
}

function migrationViolations(source) {
  const failed = [];
  const record = (name, condition) => { if (!condition) failed.push(name); };
  const sql = sqlExecutable(source);

  record("the repair revokes the target role by grantor",
    new RegExp(`revoke ${ROLE} from postgres granted by postgres;`).test(sql));
  record("the WITH SET FALSE form is never used", !/with set false/i.test(sql));
  record("no indiscriminate revoke exists", !new RegExp(`revoke ${ROLE} from postgres;`).test(sql));
  record("exactly one revoke statement exists", count(sql, "revoke ") === 1);
  record("nothing is granted", !/^\s*grant /m.test(sql));
  record("no other authority role is revoked",
    !/revoke (social_authority|social_pair_read_authority|social_profile_projection_authority|social_runtime_executor|meal_buddy_candidate_pool_authority)/.test(sql));
  record("no role attribute is altered", !/alter role/i.test(sql));
  record("no function is created, replaced or dropped", !/(create|drop)\s+(or replace\s+)?function/i.test(sql));
  // ALTER FUNCTION is how ownership moves, and ownership IS the privilege boundary here.
  record("no function is altered, so ownership cannot move", !/alter function/i.test(sql));
  record("no policy is created or dropped", !/(create|drop) policy/i.test(sql));
  record("no table is created or altered", !/(create|alter) table/i.test(sql));
  record("no privilege is granted to a client role", !/(anon|authenticated|authenticator|service_role)/.test(sql));
  record("SR-2G-C authority is not referenced", !/meal_buddy_candidate_pool_authority|canonical_meal_buddy_candidate_cards/.test(sql));
  record("social_authority is not referenced", !/social_authority/.test(sql));
  record("no quota or business rule appears", !/quota|premium|free/i.test(sql));
  record("the migration is transactional", /^begin;/m.test(sql) && /^commit;/m.test(sql));
  return failed;
}

// --- mutants -------------------------------------------------------------------------------------------
const repairMutants = [
  ["the postgres-granted row is left in place", { revokeByGrantor: false }],
  ["WITH SET FALSE is used instead of revoke-by-grantor", { revokeByGrantor: false, useWithSetFalse: true }],
  ["every membership row is revoked indiscriminately", { revokeByGrantor: false, revokeIndiscriminately: true }],
  ["the other grantor's row is removed instead", { revokeByGrantor: false, removeOtherGrantorRow: true }],
  ["the legitimate row gains INHERIT and SET", { mutateLegitimateRow: true }],
  ["function ownership is changed", { functionOwner: "postgres" }],
  ["executor EXECUTE is removed", { executorExecute: false }],
  ["authenticated is granted INSERT", { authenticatedInsert: true }],
  ["authenticated is granted UPDATE", { authenticatedUpdate: true }],
  ["authenticated is granted DELETE", { authenticatedDelete: true }],
  ["a service_role product runtime is introduced", { serviceRoleRuntime: true }],
  ["the Free quota is changed", { quotaFree: 2 }],
  ["the Premium quota is changed", { quotaPremium: 4 }],
  ["a create/list/cancel body is redefined", { functionBodiesChanged: true }],
  ["SR-2G-C pool authority privileges are altered", { poolAuthorityUntouched: false }],
  ["social_authority membership is altered", { socialAuthorityUntouched: false }]
];

const migrationMutants = [
  ["the revoke is dropped entirely", (s) => s.replace(/revoke [^;]*;\n/, "")],
  ["restoration uses the proven-incorrect WITH SET FALSE form",
    (s) => s.replace(`revoke ${ROLE} from postgres granted by postgres;`, `grant ${ROLE} to postgres with set false;`)],
  ["the GRANTED BY qualifier is dropped, making the revoke indiscriminate",
    (s) => s.replace(`revoke ${ROLE} from postgres granted by postgres;`, `revoke ${ROLE} from postgres;`)],
  ["another grantor's row is targeted",
    (s) => s.replace("granted by postgres;", "granted by supabase_admin;")],
  ["a second, unrelated authority membership is revoked",
    (s) => s.replace("commit;", "revoke social_authority from postgres granted by postgres;\n\ncommit;")],
  ["the SR-2G-C pool authority membership is revoked too",
    (s) => s.replace("commit;", `revoke meal_buddy_candidate_pool_authority from postgres granted by postgres;\n\ncommit;`)],
  ["the role attributes are altered", (s) => s.replace("commit;", `alter role ${ROLE} with bypassrls;\n\ncommit;`)],
  ["function ownership is changed", (s) => s.replace("commit;", "alter function social_internal.create_meal_buddy_card(uuid,text,text,text,text,date,text,time,integer,integer) owner to postgres;\n\ncommit;")],
  ["executor EXECUTE is revoked", (s) => s.replace("commit;", "revoke execute on function social_internal.list_owned_meal_buddy_cards(uuid) from social_runtime_executor;\n\ncommit;")],
  ["authenticated is granted a direct write", (s) => s.replace("commit;", "grant insert on table public.meal_buddy_cards to authenticated;\n\ncommit;")],
  ["service_role is granted a product runtime privilege", (s) => s.replace("commit;", "grant execute on function social_internal.create_meal_buddy_card(uuid,text,text,text,text,date,text,time,integer,integer) to service_role;\n\ncommit;")],
  ["a quota policy change is smuggled in", (s) => s.replace("commit;", "create or replace function social_internal.free_quota() returns integer language sql as $x$ select 3 $x$;\n\ncommit;")]
];

const results = [];

const canonicalRepair = repairViolations(CANONICAL);
results.push({ name: "canonical repair satisfies the exact SR-2G-B-R1 posture contract", applied: true,
  killed: canonicalRepair.length === 0, status: canonicalRepair.length === 0 ? "killed" : "survived", violations: canonicalRepair });
const canonicalMigration = migrationViolations(migrationSource);
results.push({ name: "canonical migration satisfies the exact SR-2G-B-R1 structural contract", applied: true,
  killed: canonicalMigration.length === 0, status: canonicalMigration.length === 0 ? "killed" : "survived", violations: canonicalMigration });

for (const [name, override] of repairMutants) {
  const failed = repairViolations({ ...CANONICAL, ...override });
  const killed = failed.length > 0;
  results.push({ name, applied: true, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
}

for (const [name, apply] of migrationMutants) {
  const mutated = apply(migrationSource);
  const applied = mutated !== migrationSource;
  // A mutation that failed to apply proves nothing: report it as a survivor, never as a kill.
  const failed = applied ? migrationViolations(mutated) : ["mutation did not apply"];
  const killed = applied && failed.length > 0;
  results.push({ name, applied, killed, status: killed ? "killed" : "survived", violations: failed.slice(0, 3) });
  console.log(`${killed ? "KILLED  " : "SURVIVED"} ${name}`);
}

const survivors = results.filter((entry) => entry.status === "survived");
console.log(JSON.stringify({
  suite: "social-candidate-sr2g-b-r1-mutations",
  total: results.length,
  killed: results.length - survivors.length,
  survived: survivors.length,
  survivors,
  repositoryBytesModified: false
}, null, 2));
process.exit(survivors.length === 0 ? 0 : 1);
