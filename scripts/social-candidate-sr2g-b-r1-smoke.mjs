#!/usr/bin/env node
// SR-2G-B-R1 local smoke. Pure and local: no network, no database, no credentials, no deployment.
//
// PostgreSQL 17 membership semantics are modelled exactly — pg_auth_members keyed by
// (role, member, grantor), a bare GRANT defaulting INHERIT to true, and REVOKE ... GRANTED BY
// naming one row — so the dirty topology, the repair, and the wrong repair can all be exercised
// without a database. The real behaviour is proven separately by the Development acceptance.
import fs from "node:fs";
import path from "node:path";
import { SR2GBR1_MIGRATION, SR2GBR1_TARGET_ROLE } from "./social-candidate-sr2g-b-r1-successor-manifest.mjs";

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, SR2GBR1_MIGRATION), "utf8").replace(/(^|\n)\s*--[^\n]*/g, "$1");

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

// The measured pre-repair Development topology.
const DIRTY = [
  { role: SR2GBR1_TARGET_ROLE, member: "postgres", grantor: "postgres", admin_option: false, inherit_option: true, set_option: true },
  { role: SR2GBR1_TARGET_ROLE, member: "postgres", grantor: "supabase_admin", admin_option: true, inherit_option: false, set_option: false }
];
const CLEAN = [DIRTY[1]];

// The frozen runtime posture a hygiene repair must not disturb.
const RUNTIME = Object.freeze({
  functionOwner: SR2GBR1_TARGET_ROLE,
  executorExecute: true,
  authenticatedInsert: false,
  authenticatedUpdate: false,
  authenticatedDelete: false
});
function applyRepair(rows, runtime) {
  return { rows: revokeGrantedBy(rows, { role: SR2GBR1_TARGET_ROLE, member: "postgres", grantor: "postgres" }), runtime };
}

try {
  // --- the dirty topology is detected ---------------------------------------------------------------
  check("01 the pre-repair topology carries two rows", DIRTY.length === 2);
  check("02 the debt row is the postgres-granted one", DIRTY.some((r) => r.grantor === "postgres" && r.inherit_option && r.set_option));
  check("03 the debt grants postgres SET ROLE", canSetRole(DIRTY, SR2GBR1_TARGET_ROLE, "postgres"));
  check("04 the debt also grants implicit inheritance", inherits(DIRTY, SR2GBR1_TARGET_ROLE, "postgres"));
  check("05 ADMIN OPTION lives on the supabase_admin row, not the debt row",
    DIRTY.find((r) => r.grantor === "supabase_admin").admin_option === true
    && DIRTY.find((r) => r.grantor === "postgres").admin_option === false);

  // --- the repair --------------------------------------------------------------------------------------
  const repaired = applyRepair(DIRTY, RUNTIME);
  check("06 the repaired topology is exactly the supabase_admin row", JSON.stringify(repaired.rows) === JSON.stringify(CLEAN));
  check("07 the postgres-granted row is removed", !repaired.rows.some((r) => r.grantor === "postgres"));
  check("08 the other grantor's row is preserved", repaired.rows.some((r) => r.grantor === "supabase_admin"));
  check("09 postgres can no longer SET ROLE into the write authority", !canSetRole(repaired.rows, SR2GBR1_TARGET_ROLE, "postgres"));
  check("10 postgres no longer inherits the write authority implicitly", !inherits(repaired.rows, SR2GBR1_TARGET_ROLE, "postgres"));
  check("11 postgres retains ADMIN OPTION, so the role stays administrable", hasAdmin(repaired.rows, SR2GBR1_TARGET_ROLE, "postgres"));
  check("12 the repair is idempotent", JSON.stringify(applyRepair(repaired.rows, RUNTIME).rows) === JSON.stringify(CLEAN));

  // --- the WRONG repairs, for contrast -------------------------------------------------------------------
  const withSetFalse = grant(DIRTY, { role: SR2GBR1_TARGET_ROLE, member: "postgres", grantor: "postgres", admin: false, inherit: true, set: false });
  check("13 WITH SET FALSE leaves the postgres-granted row in place", withSetFalse.some((r) => r.grantor === "postgres"));
  check("14 WITH SET FALSE leaves residual inheritance", inherits(withSetFalse, SR2GBR1_TARGET_ROLE, "postgres"));
  check("15 WITH SET FALSE therefore does not reach the clean posture", JSON.stringify(withSetFalse) !== JSON.stringify(CLEAN));

  const indiscriminate = revokeAll(DIRTY, { role: SR2GBR1_TARGET_ROLE, member: "postgres" });
  check("16 an indiscriminate revoke destroys the legitimate supabase_admin row", indiscriminate.length === 0);
  check("17 an indiscriminate revoke would lose ADMIN OPTION", !hasAdmin(indiscriminate, SR2GBR1_TARGET_ROLE, "postgres"));

  // --- runtime invariance -----------------------------------------------------------------------------------
  check("18 function ownership is unchanged by the repair", repaired.runtime.functionOwner === SR2GBR1_TARGET_ROLE);
  check("19 executor invoke authority is unchanged", repaired.runtime.executorExecute === true);
  check("20 authenticated direct INSERT remains denied", repaired.runtime.authenticatedInsert === false);
  check("21 authenticated direct UPDATE remains denied", repaired.runtime.authenticatedUpdate === false);
  check("22 authenticated direct DELETE remains denied", repaired.runtime.authenticatedDelete === false);

  // --- the model is pinned to the migration it stands in for ---------------------------------------------------
  check("23 the migration performs exactly the modelled revoke",
    new RegExp(`revoke ${SR2GBR1_TARGET_ROLE} from postgres granted by postgres;`).test(migration));
  check("24 the migration never uses the WITH SET FALSE form", !/with set false/i.test(migration));
  check("25 the migration never performs an indiscriminate revoke",
    !new RegExp(`revoke ${SR2GBR1_TARGET_ROLE} from postgres;`).test(migration));
  check("26 the migration grants nothing", !/^\s*grant /m.test(migration));
  check("27 the migration touches no function, policy, role or table", !/create |alter |drop /i.test(migration));

  const summary = Object.freeze({
    suite: "social-candidate-sr2g-b-r1-smoke",
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    networkUsed: false, databaseUsed: false, credentialsUsed: false, productionTouched: false
  });
  console.log(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(failures.length === 0 ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({ suite: "social-candidate-sr2g-b-r1-smoke", error: error.message }, null, 2));
  process.exit(1);
}
