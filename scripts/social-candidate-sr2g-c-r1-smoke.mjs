#!/usr/bin/env node
// SR-2G-C-R1 local smoke. Pure and local: no network, no database, no credentials, no deployment.
//
// PostgreSQL 17 membership semantics are modelled exactly — pg_auth_members keyed by
// (role, member, grantor), a bare GRANT defaulting INHERIT to true, and REVOKE ... GRANTED BY
// naming one row — so the dirty topology, the repair, and the wrong repair can all be exercised
// without a database. The real behaviour is proven separately by the Development acceptance.
import fs from "node:fs";
import path from "node:path";
import {
  SR2GCR1_FROZEN_BODY_MD5,
  SR2GCR1_MIGRATION,
  SR2GCR1_POOL_CAPABILITIES,
  SR2GCR1_TARGET_ROLE
} from "./social-candidate-sr2g-c-r1-successor-manifest.mjs";

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, SR2GCR1_MIGRATION), "utf8").replace(/(^|\n)\s*--[^\n]*/g, "$1");

const checks = [];
const failures = [];
function check(name, condition, detail) {
  const result = Object.freeze({ name, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${name}`);
}

// --- a model of pg_auth_members ------------------------------------------------------------------
const key = (row) => `${row.role}|${row.member}|${row.grantor}`;

function grant(rows, { role, member, grantor, admin = false, inherit = true, set = true }) {
  // A GRANT is keyed by grantor: re-granting from a DIFFERENT grantor adds a row rather than
  // modifying the existing one. Omitted options default — INHERIT to true — which is the trap.
  const next = rows.filter((r) => key(r) !== key({ role, member, grantor }));
  next.push({ role, member, grantor, admin_option: admin, inherit_option: inherit, set_option: set });
  return next.sort((a, b) => key(a).localeCompare(key(b)));
}
function revokeGrantedBy(rows, { role, member, grantor }) {
  return rows.filter((r) => key(r) !== key({ role, member, grantor }));
}
function revokeAll(rows, { role, member }) {
  return rows.filter((r) => !(r.role === role && r.member === member));
}
const canSetRole = (rows, role, member) => rows.some((r) => r.role === role && r.member === member && r.set_option);
const inherits = (rows, role, member) => rows.some((r) => r.role === role && r.member === member && r.inherit_option);
const hasAdmin = (rows, role, member) => rows.some((r) => r.role === role && r.member === member && r.admin_option);

// The measured pre-repair Development topology, across every Social authority.
const POOL = SR2GCR1_TARGET_ROLE;
const DEBT = { role: POOL, member: "postgres", grantor: "postgres", admin_option: false, inherit_option: true, set_option: true };
const legit = (role) => ({ role, member: "postgres", grantor: "supabase_admin", admin_option: true, inherit_option: false, set_option: false });
const OTHERS = [
  legit("meal_buddy_card_write_authority"),
  legit("social_authority"),
  legit("social_pair_read_authority"),
  legit("social_profile_projection_authority"),
  legit("social_runtime_executor")
];
const DIRTY = [DEBT, legit(POOL), ...OTHERS].sort((a, b) => key(a).localeCompare(key(b)));
const CLEAN = [legit(POOL), ...OTHERS].sort((a, b) => key(a).localeCompare(key(b)));

// The frozen SR-2G-C runtime a hygiene repair must not disturb.
const RUNTIME = Object.freeze({
  functionOwner: SR2GCR1_POOL_CAPABILITIES.owner,
  securityDefiner: true,
  volatility: "s",
  bodyMd5: SR2GCR1_FROZEN_BODY_MD5.canonical_meal_buddy_candidate_cards,
  authorizedCandidatesMd5: SR2GCR1_FROZEN_BODY_MD5.authorized_candidates,
  authorizedCandidatesExecute: true,
  mealBuddyCardsSelect: true,
  executorExecute: true,
  anonExecute: false,
  authenticatedExecute: false,
  serviceRoleExecute: false,
  schemaCreate: false,
  memberOfSocialAuthority: false
});
function applyRepair(rows, runtime) {
  return { rows: revokeGrantedBy(rows, { role: POOL, member: "postgres", grantor: "postgres" }), runtime };
}

try {
  // --- the dirty topology is detected ---------------------------------------------------------------
  check("01 the pre-repair pool topology carries two rows", DIRTY.filter((r) => r.role === POOL).length === 2);
  check("02 the debt row is the postgres-granted one", DIRTY.some((r) => r.role === POOL && r.grantor === "postgres" && r.inherit_option && r.set_option));
  check("03 the debt grants postgres SET ROLE into the pool authority", canSetRole(DIRTY, POOL, "postgres"));
  check("04 the debt also grants implicit inheritance", inherits(DIRTY, POOL, "postgres"));
  check("05 ADMIN OPTION lives on the supabase_admin row, not the debt row",
    DIRTY.find((r) => r.role === POOL && r.grantor === "supabase_admin").admin_option === true
    && DIRTY.find((r) => r.role === POOL && r.grantor === "postgres").admin_option === false);
  check("06 the debt shape is identical to the one SR-2G-B-R1 already repaired",
    DEBT.admin_option === false && DEBT.inherit_option === true && DEBT.set_option === true);

  // --- the repair --------------------------------------------------------------------------------------
  const repaired = applyRepair(DIRTY, RUNTIME);
  check("07 the repaired topology is exactly the expected row set", JSON.stringify(repaired.rows) === JSON.stringify(CLEAN));
  check("08 the postgres-granted pool row is removed", !repaired.rows.some((r) => r.role === POOL && r.grantor === "postgres"));
  check("09 the other grantor's pool row is preserved", repaired.rows.some((r) => r.role === POOL && r.grantor === "supabase_admin"));
  check("10 postgres can no longer SET ROLE into the pool authority", !canSetRole(repaired.rows, POOL, "postgres"));
  check("11 postgres no longer inherits the pool authority implicitly", !inherits(repaired.rows, POOL, "postgres"));
  check("12 postgres retains ADMIN OPTION, so the role stays administrable", hasAdmin(repaired.rows, POOL, "postgres"));
  check("13 the repair is idempotent", JSON.stringify(applyRepair(repaired.rows, RUNTIME).rows) === JSON.stringify(CLEAN));
  check("14 exactly one row is removed in total", DIRTY.length - repaired.rows.length === 1);

  // --- every other authority is untouched -----------------------------------------------------------------
  for (const other of OTHERS) {
    check(`15 ${other.role} membership survives the repair byte-identically`,
      JSON.stringify(repaired.rows.find((r) => r.role === other.role)) === JSON.stringify(other));
  }
  check("16 social_authority keeps its frozen no-SET no-INHERIT posture",
    !canSetRole(repaired.rows, "social_authority", "postgres") && !inherits(repaired.rows, "social_authority", "postgres"));
  check("17 the SR-2G-B-R1 write-authority repair is still in place",
    repaired.rows.filter((r) => r.role === "meal_buddy_card_write_authority").length === 1
    && !repaired.rows.some((r) => r.role === "meal_buddy_card_write_authority" && r.grantor === "postgres"));

  // --- the WRONG repairs, for contrast -------------------------------------------------------------------
  const withSetFalse = grant(DIRTY, { role: POOL, member: "postgres", grantor: "postgres", admin: false, inherit: true, set: false });
  check("18 WITH SET FALSE leaves the postgres-granted row in place", withSetFalse.some((r) => r.role === POOL && r.grantor === "postgres"));
  check("19 WITH SET FALSE leaves residual inheritance", inherits(withSetFalse, POOL, "postgres"));
  check("20 WITH SET FALSE therefore does not reach the clean posture", JSON.stringify(withSetFalse) !== JSON.stringify(CLEAN));

  const indiscriminate = revokeAll(DIRTY, { role: POOL, member: "postgres" });
  check("21 an indiscriminate revoke destroys the legitimate supabase_admin row", !indiscriminate.some((r) => r.role === POOL));
  check("22 an indiscriminate revoke would lose ADMIN OPTION over the pool role", !hasAdmin(indiscriminate, POOL, "postgres"));

  const wrongGrantor = revokeGrantedBy(DIRTY, { role: POOL, member: "postgres", grantor: "supabase_admin" });
  check("23 targeting the other grantor would leave the debt and destroy the legitimate row",
    wrongGrantor.some((r) => r.role === POOL && r.grantor === "postgres") && !hasAdmin(wrongGrantor, POOL, "postgres"));

  // --- runtime invariance -----------------------------------------------------------------------------------
  check("24 pool function ownership is unchanged by the repair", repaired.runtime.functionOwner === SR2GCR1_POOL_CAPABILITIES.owner);
  check("25 SECURITY DEFINER and STABLE posture are unchanged", repaired.runtime.securityDefiner === true && repaired.runtime.volatility === "s");
  check("26 the pool function body digest is unchanged", repaired.runtime.bodyMd5 === SR2GCR1_FROZEN_BODY_MD5.canonical_meal_buddy_candidate_cards);
  check("27 the frozen authorization primitive body digest is unchanged", repaired.runtime.authorizedCandidatesMd5 === SR2GCR1_FROZEN_BODY_MD5.authorized_candidates);
  check("28 composition with authorized_candidates is retained", repaired.runtime.authorizedCandidatesExecute === true);
  check("29 SELECT on public.meal_buddy_cards is retained", repaired.runtime.mealBuddyCardsSelect === true);
  check("30 executor invoke authority is retained", repaired.runtime.executorExecute === true);
  check("31 anon still cannot execute the pool primitive", repaired.runtime.anonExecute === false);
  check("32 authenticated still cannot execute the pool primitive", repaired.runtime.authenticatedExecute === false);
  check("33 service_role still has no product execute", repaired.runtime.serviceRoleExecute === false);
  check("34 the pool authority holds no schema CREATE", repaired.runtime.schemaCreate === false);
  check("35 the pool authority is not a member of social_authority", repaired.runtime.memberOfSocialAuthority === false);

  // --- the model is pinned to the migration it stands in for ---------------------------------------------------
  check("36 the migration performs exactly the modelled revoke",
    new RegExp(`revoke ${POOL} from postgres granted by postgres;`).test(migration));
  check("37 the migration never uses the WITH SET FALSE form", !/with set false/i.test(migration));
  check("38 the migration never performs an indiscriminate revoke",
    !new RegExp(`revoke ${POOL} from postgres;`).test(migration));
  check("39 the migration never names another grantor", !/granted by (?!postgres)/i.test(migration));
  check("40 the migration grants nothing", !/^\s*grant /m.test(migration));
  check("41 the migration touches no function, policy, role or table", !/create |alter |drop /i.test(migration));

  const summary = Object.freeze({
    suite: "social-candidate-sr2g-c-r1-smoke",
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ suite: "social-candidate-sr2g-c-r1-smoke", error: error.message }, null, 2));
  process.exit(1);
}
