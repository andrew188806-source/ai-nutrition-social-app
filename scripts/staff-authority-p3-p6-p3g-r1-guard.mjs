#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { isBoundedP3BSuccessor } from "./staff-authority-p3-p6-p3b-successor-awareness.mjs";

const BASELINE = "79cccc2a3bb2584401757d4620d0135e5e754675";
const P3G = "supabase/migrations/20260915030000_staff_management_p3_p6_p3g_break_glass_control_plane.sql";
const R1 = "supabase/migrations/20260916010000_staff_management_p3_p6_p3g_r1_extend_collation_repair.sql";
const read = (file) => fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const git = (...args) => execFileSync("git", args, {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
}).trim();
const p3g = read(P3G);
const r1 = read(R1);
const migrations = fs.readdirSync("supabase/migrations").filter((file) => file.endsWith(".sql")).sort();
const p3hPhase = isBoundedP3BSuccessor(process.cwd()) && migrations.length === 125;
const checks = [];
const failures = [];
function check(name, condition, detail) {
  const item = { name, pass: Boolean(condition), ...(!condition && detail !== undefined ? { detail } : {}) };
  checks.push(item);
  if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}

// The exact function body R1 replaces, isolated for shape checks below. Comment lines are
// stripped before pattern-matching so explanatory prose (which necessarily discusses the old
// pattern by name) can never masquerade as, or be mistaken for, live SQL.
const extendStart = r1.indexOf("create or replace function admin_internal.staff_break_glass_extend_activation_v1(");
const extendEnd = r1.indexOf("\n$$;", extendStart);
const extendBodyRaw = extendStart >= 0 && extendEnd > extendStart ? r1.slice(extendStart, extendEnd) : "";
const stripSqlComments = (text) => text.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
const extendBody = stripSqlComments(extendBodyRaw);

check("exact P3G predecessor is an ancestor", git("merge-base", "HEAD", BASELINE) === BASELINE);
check("migration inventory is exactly 124 or bounded P3H 125", migrations.length === (p3hPhase ? 125 : 124), migrations.length);
check("R1 migration is unique with only exact P3H successor", (p3hPhase ? migrations.at(-1) === "20260916020000_staff_management_p3_p6_p3h_step_up_authority.sql" : migrations.at(-1) === R1.split("/").at(-1))
  && migrations.filter((file) => file.includes("p3g_r1_extend_collation_repair")).length === 1);
check("frozen P3G migration file is byte-for-byte untouched",
  sha(P3G) === "16f9b4456ec10af8f421eebdb84cc8c2352aa8ecd4a8e97516a79e81d1c9de04");
check("R1 is one complete transaction", /^--[\s\S]*\nbegin;[\s\S]*\ncommit;\s*$/.test(r1));

check("R1 touches exactly one function", (r1.match(/create or replace function admin_internal\./g) ?? []).length === 1
  && !/create function|create table|create role|create trigger|create policy|create index/i.test(r1));
check("R1 targets exactly the extend function", extendBody.length > 0);
check("R1 does not touch any other P3G function", !/staff_break_glass_(?:enroll_principal|revoke_principal|activate|close_activation|status|recent_audit)_v1/.test(r1));
check("R1 grants no new role membership beyond the bounded ownership escalation",
  (r1.match(/^grant /gm) ?? []).length === 2
  && /grant staff_break_glass_control_authority to postgres/.test(r1)
  && /grant create on schema admin_internal to staff_break_glass_control_authority/.test(r1));
check("R1 revokes the same bounded escalation it grants",
  /revoke create on schema admin_internal from staff_break_glass_control_authority/.test(r1)
  && /revoke staff_break_glass_control_authority from postgres granted by postgres/.test(r1));
check("R1 grants no new EXECUTE to any role", !/grant execute/i.test(r1));
check("R1 adds no permission catalogue key", !/(?:insert into|update) admin_internal\.staff_permission_catalog/i.test(r1));
check("R1 adds no new table", !/create table/i.test(r1));
check("R1 seeds no real identity or authority",
  !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|@[a-z0-9.-]+/i.test(r1));

check("old order-sensitive array_agg ORDER BY comparison is absent", !/array_agg\([^)]*order by[^)]*permission_key\)/i.test(extendBody));
check("old literal-array inequality comparison against the root set is absent",
  !/v_permissions\s*<>\s*array\s*\[/i.test(extendBody) && !extendBody.includes("v_permissions"));
check("new proof uses exact row count against the four-key set", /v_count <> 4/.test(extendBody));
check("new proof uses exact distinct-key count", /count\(distinct grant_row\.permission_key\)/i.test(extendBody)
  && /v_distinct_count <> 4/.test(extendBody));
check("new proof rejects any unexpected permission key", /not in \(\s*'admin_context\.read',\s*'admin\.management\.staff\.account\.write',\s*'admin\.management\.staff\.console_admission\.write',\s*'admin\.management\.staff\.permission\.write'\s*\)/.test(extendBody));
check("new proof rejects any missing expected permission key",
  /unnest\(array\[[\s\S]*'admin_context\.read'[\s\S]*\]::text\[\]\) expected/.test(extendBody)
  && /not exists[\s\S]*expected\.permission_key/.test(extendBody));
const exactSetBlockStart = extendBody.indexOf("select pg_catalog.count(*)::integer,\n    pg_catalog.count(distinct grant_row.permission_key)::integer");
const exactSetBlockEnd = extendBody.indexOf("v_cap := least(", exactSetBlockStart);
const exactSetBlock = exactSetBlockStart >= 0 && exactSetBlockEnd > exactSetBlockStart
  ? extendBody.slice(exactSetBlockStart, exactSetBlockEnd) : "";
check("exact-set proof block was isolated for analysis", exactSetBlock.length > 0);
check("exact-set proof contains zero ORDER BY (the two retained ORDER BY clauses are unrelated deadlock-avoidance lock ordering, outside this block)",
  !/order by/i.test(exactSetBlock));

check("extend still requires postgres session_user", /if session_user <> 'postgres'/.test(extendBody));
check("extend still validates reason and request id", /staff_break_glass_validate_mutation_input_v1/.test(extendBody));
check("extend still enforces global per-operator request idempotency", /pg_advisory_xact_lock/.test(extendBody)
  && /staff_break_glass_prior_result_v1/.test(extendBody));
check("extend still requires exact activation lock and CAS", /for update;/.test(extendBody)
  && /v_activation\.status_version <> p_expected_status_version/.test(extendBody)
  && /message = 'stale_state'/.test(extendBody));
check("extend still rejects a non-active or expired activation", /v_activation\.status <> 'active'/.test(extendBody)
  && /activation_not_active/.test(extendBody)
  && /v_now >= v_activation\.effective_until/.test(extendBody)
  && /activation_expired/.test(extendBody));
check("extend still requires an active principal and effective staff account", /principal_not_active/.test(extendBody)
  && /staff_break_glass_lock_staff_account_v1/.test(extendBody)
  && /staff_account_not_effective/.test(extendBody));
check("extend still asserts the live root permission catalogue contract", /staff_break_glass_assert_root_contract_v1/.test(extendBody));
check("exact-set proof still requires source_type direct_grant and no bundle",
  /entitlement\.source_type = 'direct_grant'/.test(extendBody)
  && /entitlement\.source_bundle_assignment_id is null/.test(extendBody));
check("exact-set proof still binds the entitlement to the activation's own principal staff account",
  /entitlement\.staff_account_id = v_principal\.staff_account_id/.test(extendBody));
check("exact-set proof still matches exact current activation window",
  /entitlement\.effective_from = v_activation\.effective_from/.test(extendBody)
  && /entitlement\.effective_until = v_activation\.effective_until/.test(extendBody));
check("extend still bounded by staff envelope and two-hour continuous cap",
  /v_activation\.effective_from \+ interval '2 hours'/.test(extendBody)
  && /coalesce\(v_staff\.effective_until, 'infinity'::timestamptz\)/.test(extendBody));
check("extension still adds exactly 30 minutes and rejects non-forward extension",
  /v_activation\.effective_until \+ interval '30 minutes'/.test(extendBody)
  && /v_new_end <= v_activation\.effective_until/.test(extendBody)
  && /extension_limit_reached/.test(extendBody));
check("extend still moves all four linked entitlement windows identically",
  /update admin_internal\.staff_permission_entitlements entitlement[\s\S]*set effective_until = v_new_end/.test(extendBody)
  && /grant_row\.entitlement_id = entitlement\.entitlement_id/.test(extendBody)
  && /v_count <> 4/.test(extendBody.slice(extendBody.indexOf("update admin_internal.staff_permission_entitlements entitlement"))));
check("extend still writes exactly one receipt and one audit row",
  (extendBody.match(/insert into admin_internal\.staff_break_glass_control_receipts/g) ?? []).length === 1
  && (extendBody.match(/insert into admin_internal\.staff_break_glass_audit_log/g) ?? []).length === 1);
check("extend caller signature is unchanged (activation id, expected version, reason, request id)",
  /staff_break_glass_extend_activation_v1\(\s*p_activation_id uuid,\s*p_expected_status_version bigint,\s*p_reason_code text,\s*p_request_id uuid\s*\)/.test(extendBody));

check("secret scan is clean", ![
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
].some((pattern) => pattern.test(r1)));

console.log("\n" + JSON.stringify({
  suite: "staff-authority-p3-p6-p3g-r1-guard",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((item) => item.name),
  migrationCount: migrations.length,
  developmentAccessed: false,
  productionAccessed: false,
  pushed: false,
}, null, 2));
process.exitCode = failures.length ? 1 : 0;
