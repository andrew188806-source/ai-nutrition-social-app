#!/usr/bin/env node
// H3 + H4 static successor guard. No database, no network. Verifies the two hardening migrations against
// the frozen predecessor sources (function set and reader roles are DERIVED from them, not restated),
// that no historical migration or RPC body changed, and that no runtime code writes the lookup tables.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const git = (args) => cp.spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout;
const BASELINE = "2bb090b40658808c82c4ed91a74053e0598cca3e";
const H3 = "supabase/migrations/20260919020000_staff_management_v2_outer_acl_hardening_h3.sql";
const H4 = "supabase/migrations/20260919030000_social_interest_lookup_rls_acl_hardening_h4.sql";
const P3H = "supabase/migrations/20260916020000_staff_management_p3_p6_p3h_step_up_authority.sql";
const R2E = "20260919010000_restaurant_owner_branch_menu_item_display_name_draft_visibility_r2e.sql";
const checks = [];
function check(pass, name, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}
const strip = (sql) => sql.replace(/--[^\n]*/g, "");
const sigs = (block) => [...block.matchAll(/public\.(staff_management_[a-z_]+_v2)\(([^)]*)\)/g)].map((m) => `${m[1]}(${m[2].replace(/\s+/g, "")})`).sort();

// ---------------- ordering / baseline ---------------------------------------------------------------
const migrations = fs.readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
const at = migrations.indexOf(path.basename(H3));
check(fs.existsSync(path.join(root, H3)) && fs.existsSync(path.join(root, H4)), "both hardening migration files exist");
check(migrations.slice(at - 1, at + 2).join("|") === [R2E, path.basename(H3), path.basename(H4)].join("|"), "H3 and H4 follow R2E immediately, in that order", migrations.slice(at - 1, at + 3));
check(migrations.length >= 135 && migrations.includes(R2E), "at least 135 migrations exist including the R2E successor", migrations.length);
const changed = git(["diff", "--name-status", BASELINE, "--", "supabase/migrations"]).split("\n").filter(Boolean);
check(changed.every((line) => /^A\t/.test(line)) && changed.every((line) => [path.basename(H3), path.basename(H4)].some((n) => line.endsWith(n)) || !line.includes("supabase/migrations")), "no historical migration was modified or removed since the baseline (only H3/H4 added)", changed);

// ---------------- H3 -----------------------------------------------------------------------------------
const h3 = read(H3), h3Code = strip(h3), p3h = read(P3H);
const h3Body = h3Code.slice(0, h3Code.indexOf("do $$"));
const p3hRevoke = p3h.slice(p3h.lastIndexOf("revoke all on function\n  public.staff_management_link_staff_account_v2"));
const derived = sigs(p3hRevoke.slice(0, p3hRevoke.indexOf("from public, anon, authenticated, authenticator, service_role;")));
check(derived.length === 10, "the ten target signatures are derived from the frozen P3H migration", derived.length);
const h3Revoke = h3Code.slice(h3Code.indexOf("revoke all on function"), h3Code.indexOf("from public, anon, authenticated, authenticator, service_role;"));
const h3Grant = h3Code.slice(h3Code.indexOf("grant execute on function"), h3Code.indexOf("to authenticated;"));
check(JSON.stringify(sigs(h3Revoke)) === JSON.stringify(derived), "H3 revokes exactly the P3H v2 signature set (10)");
check(JSON.stringify(sigs(h3Grant)) === JSON.stringify(derived), "H3 grants EXECUTE on exactly the same ten signatures");
check(/from public, anon, authenticated, authenticator, service_role;/.test(h3Code), "H3 revokes from PUBLIC, anon, authenticated, authenticator and service_role before re-granting");
check(/to authenticated;/.test(h3Code) && (h3Code.match(/grant execute on function/g) ?? []).length === 1 && !/grant execute[\s\S]{0,900}to (?:public|anon|service_role|authenticator)/.test(h3Code), "H3 grants EXECUTE only to authenticated, once");
check(!/\bcreate or replace function\b|\bcreate function\b|\balter function\b|\bdrop function\b|\bcomment on function\b/i.test(h3Code), "H3 defines, alters and drops no function (bodies untouched)");
const iSet = h3Code.indexOf("set local role staff_step_up_gate_authority;"), iRevoke = h3Code.indexOf("revoke all on function"), iGrant = h3Code.indexOf("grant execute on function"), iReset = h3Code.indexOf("reset role;");
check(iSet > 0 && iRevoke > iSet && iGrant > iRevoke && iReset > iGrant, "H3 changes the ACL AS the sealed owner role (set local role ... revoke ... grant ... reset role) -- the missing step in P3H");
check(/grant staff_step_up_gate_authority to postgres\s+with admin false, inherit false, set true;/.test(h3Code) && h3Code.indexOf("grant staff_step_up_gate_authority to postgres") < iSet, "the temporary SET-only membership is granted before the role switch");
check(/revoke staff_step_up_gate_authority from postgres granted by postgres;/.test(h3Code) && h3Code.indexOf("revoke staff_step_up_gate_authority from postgres") > iReset, "the temporary membership is removed after the role reset (granted by postgres only)");
check(/^begin;/m.test(h3Code) && /\ncommit;\s*$/.test(h3Code), "H3 is one transaction");
for (const marker of ["still executable by PUBLIC", "still executable by anon/service_role/authenticator", "must remain executable by authenticated", "must remain SECURITY DEFINER owned by staff_step_up_gate_authority", "lost its search_path/row_security settings", "expected exactly 10", "protected mutating _v1 function is executable by a client role", "retained a SET edge"]) {
  check(h3.includes(marker), `H3 epilogue enforces: ${marker}`);
}
check(!/service_role|anon/.test(h3Body.replace(/from public, anon, authenticated, authenticator, service_role;/, "")), "outside its revoke list, the H3 statement body names neither anon nor service_role");

// ---------------- H4 -----------------------------------------------------------------------------------
const h4 = read(H4), h4Code = strip(h4);
const h4Body = h4Code.slice(0, h4Code.indexOf("do $$"));
check(/^begin;/m.test(h4Code) && /\ncommit;\s*$/.test(h4Code), "H4 is one transaction");
check(/alter table public\.social_interest_catalog enable row level security;/.test(h4Code) && /alter table public\.social_interest_catalog_label enable row level security;/.test(h4Code), "H4 enables RLS on both lookup tables");
check(!/force row level security|disable row level security|no force/i.test(h4Code), "H4 neither forces nor disables RLS (owner stays exempt)");
const policies = [...h4Code.matchAll(/create policy (\S+)\s+on (public\.\S+) as permissive for select to (\S+) using \(true\);/g)].map((m) => `${m[2]}|${m[3]}|${m[1]}`).sort();
check((h4Code.match(/create policy/g) ?? []).length === 5 && policies.length === 5, "H4 creates exactly five policies and every one is PERMISSIVE / FOR SELECT / using (true)", policies);
// reader roles derived from predecessor migrations
const readerRoles = new Set();
for (const file of migrations.filter((f) => f < path.basename(H3))) {
  const sql = strip(read(`supabase/migrations/${file}`));
  for (const m of sql.matchAll(/grant select\s*\([^)]*\)\s*on table public\.social_interest_catalog\s+to\s+([a-z_]+)/gi)) readerRoles.add(m[1]);
  for (const m of sql.matchAll(/grant select\s+on (?:table )?public\.social_interest_catalog\s+to\s+([a-z_]+)/gi)) readerRoles.add(m[1]);
}
const sealedReaders = [...readerRoles].filter((r) => r !== "authenticated" && r !== "anon");
const catalogPolicyRoles = policies.filter((p) => p.startsWith("public.social_interest_catalog|")).map((p) => p.split("|")[1]).sort();
check(JSON.stringify([...sealedReaders, "authenticated"].sort()) === JSON.stringify(catalogPolicyRoles), "the catalog policy roles equal authenticated plus every sealed reader granted SELECT by predecessor migrations", { derivedSealedReaders: sealedReaders, policyRoles: catalogPolicyRoles });
check(policies.filter((p) => p.startsWith("public.social_interest_catalog_label|")).map((p) => p.split("|")[1]).join() === "authenticated", "the label table has exactly one policy, for authenticated");
check(!/create policy[\s\S]{0,140}(?:for (?:insert|update|delete|all)|to (?:public|anon))/i.test(h4Code), "H4 creates no client mutation policy and no anon/PUBLIC policy");
check(/revoke all on table public\.social_interest_catalog from anon, authenticated;/.test(h4Code) && /revoke all on table public\.social_interest_catalog_label from anon, authenticated;/.test(h4Code), "H4 revokes all privileges from anon and authenticated on both tables");
check((h4Code.match(/grant select on table/g) ?? []).length === 2 && !/grant (?!select on table)/i.test(h4Code), "H4's only grants are SELECT to authenticated on the two tables");
check(!/\bservice_role\b/.test(h4Body) && !/\b(?:insert into|update|delete from|truncate|drop|create table|alter table\s+\S+\s+(?:add|drop|alter))\b/i.test(h4Body), "H4 touches no service_role grant, no data and no column definition");
for (const marker of ["must have RLS enabled and not forced", "still holds", "anon must not read", "authenticated must keep SELECT", "may carry only permissive SELECT policies", "unexpected catalog policy set", "unexpected label policy set", "a sealed reader lost its column SELECT grant"]) {
  check(h4.includes(marker), `H4 epilogue enforces: ${marker}`);
}

// ---------------- runtime: only authenticated read paths; nothing writes the lookup tables -------------
const files = git(["ls-files", "apps", "supabase/functions", "packages"]).split("\n").filter((f) => /\.(ts|tsx|mjs|js)$/.test(f));
const users = files.filter((f) => /social_interest_catalog(_label)?\b/.test(read(f)));
const writes = users.filter((f) => /\.(insert|update|delete|upsert)\(/.test(read(f)) && /from\(["'`]social_interest_catalog/.test(read(f)));
check(users.length >= 3 && writes.length === 0, "no runtime source writes either lookup table (client reads only)", { readers: users, writers: writes });
const clientReaders = users.filter((f) => f.startsWith("apps/mobile/"));
check(clientReaders.every((f) => !/anon/i.test(read(f).replace(/\/\/[^\n]*/g, "").match(/[^\n]*social_interest_catalog[^\n]*/g)?.join("\n") ?? "")), "no client read path of the lookup tables references the anon role", clientReaders);

// ---------------- predecessor Admin / Social contracts intact --------------------------------------------
const untouched = ["supabase/migrations/20260916020000_staff_management_p3_p6_p3h_step_up_authority.sql", "supabase/migrations/20260818010000_social_interest_catalog_and_profile_selections.sql", "apps/admin-web/server/adminStepUpMutationRuntime.ts", "apps/admin-web/auth/admin-route-registry.ts"];
check(untouched.every((f) => git(["diff", "--name-only", BASELINE, "--", f]).trim() === ""), "P3H migration, the interest-catalog migration and the Admin runtime/registry are byte-unchanged since the baseline");
const adminCaller = read("apps/admin-web/server/adminStepUpMutationRuntime.ts");
check(/authorization\.session\.client\.rpc\(/.test(adminCaller) && !/service_role|serviceRole|SUPABASE_SERVICE/.test(adminCaller), "admin-web calls the v2 RPCs only through the authenticated user-session client (authenticated is the only caller role needed)");

const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ suite: "pre-admin-hardening-h3-h4-guard", total: checks.length, passed: checks.length - failed.length, failed: failed.length, failures: failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
