#!/usr/bin/env node
// H3/H4 mutation suite over the two hardening migrations. Every mutant must be KILLED by the static guard
// and must really change the file (STALE = 0). Files are restored byte-for-byte in finally and on signals.
// The behavioural counterpart (mutant migrations refused by the epilogues on a real cluster) lives in the
// postgres apply gate.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

const root = process.cwd();
const files = {
  h3: path.join(root, "supabase/migrations/20260919020000_staff_management_v2_outer_acl_hardening_h3.sql"),
  h4: path.join(root, "supabase/migrations/20260919030000_social_interest_lookup_rls_acl_hardening_h4.sql")
};
const originals = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file)]));
const restore = () => { for (const [key, file] of Object.entries(files)) { try { fs.writeFileSync(file, originals[key]); } catch { /* best effort */ } } };
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(signal, () => { restore(); process.exit(130); });
process.on("uncaughtException", (error) => { restore(); console.error(error); process.exit(1); });

const mutants = [
  ["h3", "issue the ACL change as postgres (drop the owner-role switch)", (s) => s.replace("set local role staff_step_up_gate_authority;", "")],
  ["h3", "also grant EXECUTE to anon", (s) => s.replace("to authenticated;\n\nreset role;", "to authenticated, anon;\n\nreset role;")],
  ["h3", "leave service_role out of the revoke list", (s) => s.replace("from public, anon, authenticated, authenticator, service_role;", "from public, anon, authenticated, authenticator;")],
  ["h3", "leave PUBLIC out of the revoke list", (s) => s.replace("from public, anon, authenticated, authenticator, service_role;", "from anon, authenticated, authenticator, service_role;")],
  ["h3", "grant to only nine of the ten functions", (s) => s.replace("  public.staff_management_reactivate_staff_account_v2(uuid,bigint,text,uuid,uuid,text),\n  public.staff_management_revoke_staff_account_v2(uuid,bigint,text,uuid,uuid,text),\n  public.staff_management_grant_permission_delegation_v2(uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid,uuid,text),\n  public.staff_management_revoke_permission_delegation_v2(uuid,bigint,text,uuid,uuid,text),\n  public.staff_management_grant_console_admission_v2(uuid,text,uuid,uuid,text),\n  public.staff_management_revoke_console_admission_v2(uuid,bigint,text,uuid,uuid,text),\n  public.staff_management_grant_privileged_permission_v2(uuid,text,timestamptz,timestamptz,text,uuid,uuid,text),\n  public.staff_management_revoke_privileged_permission_v2(uuid,bigint,text,uuid,uuid,text)\nto authenticated;", "  public.staff_management_reactivate_staff_account_v2(uuid,bigint,text,uuid,uuid,text),\n  public.staff_management_revoke_staff_account_v2(uuid,bigint,text,uuid,uuid,text),\n  public.staff_management_grant_permission_delegation_v2(uuid,text,boolean,boolean,boolean,timestamptz,timestamptz,text,uuid,uuid,text),\n  public.staff_management_revoke_permission_delegation_v2(uuid,bigint,text,uuid,uuid,text),\n  public.staff_management_grant_console_admission_v2(uuid,text,uuid,uuid,text),\n  public.staff_management_revoke_console_admission_v2(uuid,bigint,text,uuid,uuid,text),\n  public.staff_management_grant_privileged_permission_v2(uuid,text,timestamptz,timestamptz,text,uuid,uuid,text)\nto authenticated;")],
  ["h3", "redefine a function body", (s) => s.replace("reset role;\n\nrevoke staff_step", "reset role;\ncreate or replace function public.staff_management_link_staff_account_v2(uuid,timestamptz,timestamptz,text,uuid,uuid,text) returns jsonb language sql as $f$ select null::jsonb $f$;\n\nrevoke staff_step")],
  ["h3", "leave the temporary SET edge on the sealed owner", (s) => s.replace("revoke staff_step_up_gate_authority from postgres granted by postgres;", "")],
  ["h3", "grant the temporary membership with INHERIT", (s) => s.replace("with admin false, inherit false, set true;", "with admin false, inherit true, set true;")],
  ["h3", "delete the PUBLIC-still-executable epilogue assertion", (s) => s.replace("H3: % is still executable by PUBLIC", "H3: removed")],
  ["h3", "delete the protected-v1-stays-closed epilogue assertion", (s) => s.replace("H3: a protected mutating _v1 function is executable by a client role", "H3: removed")],
  ["h4", "drop the candidate-pool reader policy", (s) => s.replace(/create policy social_interest_catalog_candidate_pool_authority_read[\s\S]*?using \(true\);\n/, "")],
  ["h4", "add a client mutation policy", (s) => s.replace("create policy social_interest_catalog_label_authenticated_read", "create policy social_interest_catalog_authenticated_write on public.social_interest_catalog as permissive for all to authenticated using (true);\ncreate policy social_interest_catalog_label_authenticated_read")],
  ["h4", "add an anonymous read policy", (s) => s.replace("create policy social_interest_catalog_label_authenticated_read", "create policy social_interest_catalog_anon_read on public.social_interest_catalog as permissive for select to anon using (true);\ncreate policy social_interest_catalog_label_authenticated_read")],
  ["h4", "force row level security", (s) => s.replace("alter table public.social_interest_catalog_label enable row level security;", "alter table public.social_interest_catalog_label enable row level security;\nalter table public.social_interest_catalog_label force row level security;")],
  ["h4", "skip the label-table revoke", (s) => s.replace("revoke all on table public.social_interest_catalog_label from anon, authenticated;\n", "")],
  ["h4", "grant INSERT to authenticated", (s) => s.replace("grant select on table public.social_interest_catalog to authenticated;", "grant select, insert on table public.social_interest_catalog to authenticated;")],
  ["h4", "do not enable RLS on the catalog", (s) => s.replace("alter table public.social_interest_catalog enable row level security;\n", "")],
  ["h4", "delete the policy-set epilogue assertion", (s) => s.replace("H4: unexpected catalog policy set: %", "H4: removed")],
  ["h4", "touch service_role", (s) => s.replace("grant select on table public.social_interest_catalog_label to authenticated;", "grant select on table public.social_interest_catalog_label to authenticated;\nrevoke all on table public.social_interest_catalog_label from service_role;")]
];

const results = [];
try {
  for (const [key, name, apply] of mutants) {
    const source = originals[key].toString("utf8");
    const mutated = apply(source);
    const stale = mutated === source;
    if (!stale) fs.writeFileSync(files[key], mutated);
    const run = stale ? { status: 0 } : cp.spawnSync(process.execPath, ["scripts/pre-admin-hardening-h3-h4-guard.mjs"], { cwd: root, encoding: "utf8", timeout: 120000 });
    restore();
    const killed = !stale && run.status !== 0;
    results.push({ key, name, stale, killed });
    console.log(`${stale ? "STALE   " : killed ? "KILLED  " : "SURVIVED"} [${key}] ${name}`);
  }
} finally {
  restore();
}
const restored = Object.entries(files).every(([key, file]) => fs.readFileSync(file).equals(originals[key]));
const survived = results.filter((r) => !r.stale && !r.killed).length, stale = results.filter((r) => r.stale).length;
console.log(JSON.stringify({ suite: "pre-admin-hardening-h3-h4-mutations", mutants: results.length, killed: results.filter((r) => r.killed).length, survived, stale, sourceRestored: restored }, null, 2));
process.exitCode = survived === 0 && stale === 0 && restored ? 0 : 1;
