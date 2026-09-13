#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
function load(file, requireModule = () => ({})) {
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } });
  const module = { exports: {} };
  new Function("exports", "module", "require", out.outputText)(module.exports, module, requireModule);
  return module.exports;
}
const vocabulary = load("apps/admin-web/auth/admin-current-permission-vocabulary.ts");
const staffPermission = load("apps/admin-web/auth/admin-staff-permission-authority.ts", (id) => id === "./admin-current-permission-vocabulary" ? vocabulary : {});
const selector = load("apps/admin-web/auth/admin-authority-selector.ts");
const readSelector = load("apps/admin-web/auth/admin-protected-read-authority.ts", (id) => id === "./admin-authority-selector" ? selector : {});
const mutationSelector = load("apps/admin-web/auth/admin-protected-mutation-authority.ts", (id) => id === "./admin-authority-selector" ? selector : {});
const auditTransport = load("apps/admin-web/server/platformAdminAuditTransport.ts");
const auditConstants = load("apps/admin-web/server/platformAdminAuditRead.ts", (id) => id === "./platformAdminAuditTransport" ? auditTransport : {});
const staffAuditTransport = load("apps/admin-web/server/staffAdminAuditTransport.ts", (id) => {
  if (id === "../auth/admin-staff-permission-authority") return staffPermission;
  if (id === "./platformAdminAuditTransport") return auditTransport;
  return {};
});
const staffAudit = load("apps/admin-web/server/staffAdminAuditRead.ts", (id) => ({
  "../auth/admin-staff-permission-authority": staffPermission,
  "./platformAdminAuditRead": auditConstants,
  "./platformAdminAuditTransport": auditTransport,
  "./staffAdminAuditTransport": staffAuditTransport
}[id] ?? {}));
const branchAuthority = load("apps/admin-web/server/platformAdminBranchStatusAuthority.ts");
const branchTransport = load("apps/admin-web/server/platformAdminBranchStatusTransport.ts", (id) => id === "./platformAdminBranchStatusAuthority" ? branchAuthority : {});
const staffBranchTransport = load("apps/admin-web/server/staffAdminBranchStatusTransport.ts", (id) => ({
  "../auth/admin-staff-permission-authority": staffPermission,
  "./platformAdminBranchStatusTransport": branchTransport,
  "./platformAdminBranchStatusAuthority": branchAuthority
}[id] ?? {}));
const staffBranch = load("apps/admin-web/server/staffAdminBranchStatusRead.ts", (id) => ({
  "../auth/admin-staff-permission-authority": staffPermission,
  "./platformAdminBranchStatusAuthority": branchAuthority,
  "./platformAdminBranchStatusTransport": branchTransport,
  "./staffAdminBranchStatusTransport": staffBranchTransport
}[id] ?? {}));

const BASE = "admin_context.read", AUDIT = "admin_audit.read", BRANCH = "admin_restaurant_branch.status.write";
const config = { mode: "live", url: "https://local.invalid", publishableKey: "test-publishable" };
const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
function fetchSequence(sequence) {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); const next = sequence.shift(); if (next instanceof Error) throw next; return response(next.status ?? 200, next.data); };
  return { fetch, calls };
}
const context = (keys) => keys.map((permission_key) => ({ permission_key }));
const auditRow = { id: "a", actor_auth_user_id: "11111111-1111-4111-8111-111111111111", action: "grant_platform_admin", target_type: "platform_admin_membership", target_id: "x", result: "granted", reason: "test", created_at: "2026-09-13T01:00:00Z" };
const branchRow = { restaurant_id: "r", branch_id: "b", branch_name: "B", status: "active", status_version: "1" };
const identity = { id: "11111111-1111-4111-8111-111111111111", is_anonymous: false };
const checks = [], failures = [];
async function check(name, fn) { try { await fn(); checks.push(name); console.log(`PASS ${String(checks.length).padStart(2,"0")} ${name}`); } catch (error) { checks.push(name); failures.push({ name, error: error.message }); console.log(`FAIL ${String(checks.length).padStart(2,"0")} ${name}`); } }

for (const [name, credential, mode, expected] of [
  ["A bearer missing selector is legacy", "bearer", undefined, "legacy"],
  ["B bearer legacy selector is legacy", "bearer", "legacy", "legacy"],
  ["C bearer staff selector is legacy", "bearer", "staff_permissions_legacy_admission", "legacy"],
  ["D bearer ignores invalid selector", "bearer", "invalid", "legacy"],
  ["E cookie missing selector is legacy", "browser_cookie_session", undefined, "legacy"],
  ["F cookie legacy selector is legacy", "browser_cookie_session", "legacy", "legacy"],
  ["G cookie staff selector is staff", "browser_cookie_session", "staff_permissions_legacy_admission", "staff"],
  ["H cookie invalid selector is unavailable", "browser_cookie_session", "invalid", "unavailable"]
]) await check(name, () => { const r = readSelector.resolveAdminProtectedReadAuthority(credential, mode === undefined ? {} : { TASTKIND_ADMIN_AUTHORITY_MODE: mode }); assert.equal(r.state === "ready" ? r.authority : r.state, expected); });

async function auditRead(before, after = before, rows = [auditRow], failAt) {
  const seq = [{data:identity},{data:context(before)},{data:rows},{data:context(after)}];
  if (failAt !== undefined) seq[failAt] = failAt === 0 ? {status:500,data:{}} : new Error("transport");
  const f = fetchSequence(seq); return { result: await staffAudit.readStaffAdminAudit("Bearer token", new URLSearchParams(), config, f.fetch), calls:f.calls };
}
await check("I staff Audit exact authority reads", async()=>assert.equal((await auditRead([BASE,AUDIT])).result.state,"ready"));
await check("J staff Audit requires base", async()=>assert.equal((await auditRead([AUDIT])).result.state,"forbidden"));
await check("K staff Audit requires operation permission", async()=>assert.equal((await auditRead([BASE])).result.state,"forbidden"));
await check("L staff Audit post-read revoke denies", async()=>assert.equal((await auditRead([BASE,AUDIT],[BASE])).result.state,"forbidden"));
await check("M staff Audit technical failure unavailable", async()=>assert.equal((await auditRead([BASE,AUDIT],[BASE,AUDIT],[auditRow],2)).result.state,"unavailable"));
await check("N staff Audit preserves normalized DTO", async()=>assert.deepEqual((await auditRead([BASE,AUDIT])).result.events[0],{action:"grant_platform_admin",outcome:"granted",role:"platform_admin",occurredAt:"2026-09-13T01:00:00.000Z"}));
await check("O staff Audit reads once", async()=>assert.equal((await auditRead([BASE,AUDIT])).calls.filter(x=>x.url.includes("staff_admin_audit_log_v1")).length,1));
await check("P staff Audit has two freshness reads", async()=>assert.equal((await auditRead([BASE,AUDIT])).calls.filter(x=>x.url.includes("staff_current_context_v1")).length,2));

async function branchRead(before, preview = [branchRow], after = before, failure) {
  const seq = [{data:identity},{data:context(before)},{data:preview},{data:context(after)}];
  if (failure !== undefined) seq[failure] = new Error("transport");
  const f = fetchSequence(seq); return { result: await staffBranch.readStaffAdminBranchStatus("Bearer token","r","b",config,f.fetch), calls:f.calls };
}
await check("Q staff Branch exact authority reads", async()=>assert.equal((await branchRead([BASE,BRANCH])).result.state,"ready"));
await check("R staff Branch requires base", async()=>assert.equal((await branchRead([BRANCH])).result.state,"permission_denied"));
await check("S staff Branch requires operation permission", async()=>assert.equal((await branchRead([BASE])).result.state,"permission_denied"));
await check("T staff Branch target-not-found with healthy authority", async()=>assert.equal((await branchRead([BASE,BRANCH],[])).result.state,"target_not_found"));
await check("U staff Branch zero rows plus revoke denies", async()=>assert.equal((await branchRead([BASE,BRANCH],[],[BASE])).result.state,"permission_denied"));
await check("V staff Branch post-read revoke denies", async()=>assert.equal((await branchRead([BASE,BRANCH],[branchRow],[BASE])).result.state,"permission_denied"));
await check("W staff Branch malformed result fails", async()=>assert.equal((await branchRead([BASE,BRANCH],[{bad:true}])).result.state,"internal_failure"));
await check("X staff Branch technical failure unavailable", async()=>assert.equal((await branchRead([BASE,BRANCH],[branchRow],[BASE,BRANCH],2)).result.state,"dependency_unavailable"));
await check("Y staff Branch exact DTO preserved", async()=>assert.deepEqual((await branchRead([BASE,BRANCH])).result,{state:"ready",restaurantId:"r",branchId:"b",branchName:"B",status:"active",statusVersion:"1"}));

const migration = read("supabase/migrations/20260913010000_staff_authority_p3_p6_p2d_b0_a_protected_read_authority.sql");
const auditRuntime = read("apps/admin-web/server/platformAdminAuditRuntime.ts");
const branchRuntime = read("apps/admin-web/server/platformAdminBranchStatusRuntime.ts");
await check("Z migration_backfill source remains eligible",()=>assert.match(migration,/source_type in \('direct_grant', 'migration_backfill'\)/));
await check("AA direct source remains eligible",()=>assert.match(migration,/source_type in \('direct_grant', 'migration_backfill'\)/));
await check("AB Bundle source remains eligible",()=>assert.match(migration,/source_type = 'bundle_assignment'/));
await check("AC multi-source ANY semantics retained",()=>assert.match(migration,/count\(distinct entitlement\.permission_key\)/));
await check("AD staff-only DB authority does not require legacy",()=>assert.doesNotMatch(migration,/platform_admin_has_permission_v1|platform_admin_memberships/));
await check("AE staff-only application admission remains denied",()=>assert.match(read("apps/admin-web/auth/admin-context.ts"),/authority\.context\.state !== "admin"/));
await check("AF Audit runtime has distinct legacy and staff readers",()=>{assert.match(auditRuntime,/readStaffAdminAudit : readPlatformAdminAudit/);});
await check("AG Branch GET has distinct legacy and staff readers",()=>assert.match(branchRuntime,/readStaffAdminBranchStatus[\s\S]*readPlatformAdminBranchStatus/));
await check("AH Branch POST remains legacy downstream",()=>{ const post=branchRuntime.slice(branchRuntime.indexOf("handlePlatformAdminBranchStatusMutationRequest")); assert.match(post,/mutatePlatformAdminBranchStatus/); assert.doesNotMatch(post,/readStaffAdmin|staff_admin_set/); });
await check("AI CSRF helper remains referenced by POST",()=>assert.match(branchRuntime,/acceptsAdminApiCookieMutationOrigin/));
await check("AJ no service_role transport",()=>assert.doesNotMatch(read("apps/admin-web/server/staffAdminAuditTransport.ts")+read("apps/admin-web/server/staffAdminBranchStatusTransport.ts"),/service_role/));

const runtimeCalls=[];
const auditRuntimeModule=load("apps/admin-web/server/platformAdminAuditRuntime.ts",id=>({
  "./platformAdminAuditTransport":{getPlatformAdminAuditConfig:()=>config},
  "./platformAdminAuditRead":{readPlatformAdminAudit:async()=>{runtimeCalls.push("legacy-audit");return{state:"ready",events:[],page:1,pageSize:20,hasNextPage:false,sourceWindow:500};}},
  "../auth/admin-api-authorization":{},
  "../auth/admin-protected-read-authority":readSelector,
  "./staffAdminAuditRead":{readStaffAdminAudit:async()=>{runtimeCalls.push("staff-audit");return{state:"ready",events:[],page:1,pageSize:20,hasNextPage:false,sourceWindow:500};}}
}[id]??{}));
const runtimeBranchAuthority={...branchAuthority,PLATFORM_ADMIN_BRANCH_STATUS_BODY_LIMIT:2048,PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION:BRANCH,parseMutationRequest:()=>({restaurantId:"r",expectedStatus:"active",nextStatus:"inactive",expectedVersion:"0",reasonCode:"operational_pause",requestId:"11111111-1111-4111-8111-111111111111"}),parseMutationResult:()=>({state:"ready",outcome:"applied",operation:"set_restaurant_branch_status",status:"inactive",statusVersion:"1",occurredAt:"2026-09-13T01:00:00Z",requestId:"11111111-1111-4111-8111-111111111111"})};
const branchRuntimeModule=load("apps/admin-web/server/platformAdminBranchStatusRuntime.ts",id=>({
  "./platformAdminBranchStatusAuthority":runtimeBranchAuthority,
  "./platformAdminBranchStatusTransport":{BranchStatusTransportError:class extends Error{},getPlatformAdminBranchStatusConfig:()=>config,createPlatformAdminBranchStatusTransport:()=>({verifyIdentity:async()=>true,hasPermission:async()=>true,preview:async()=>{runtimeCalls.push("legacy-branch-get");return[branchRow];},mutate:async()=>{runtimeCalls.push("legacy-branch-post");return{};}})},
  "../auth/admin-api-authorization":{acceptsAdminApiCookieMutationOrigin:()=>true},
  "../auth/admin-protected-read-authority":readSelector,
  "./staffAdminBranchStatusRead":{readStaffAdminBranchStatus:async()=>{runtimeCalls.push("staff-branch-get");return{state:"ready",restaurantId:"r",branchId:"b",branchName:"B",status:"active",statusVersion:"1"};}},
  "../auth/admin-protected-mutation-authority":mutationSelector,
  "./staffAdminBranchStatusMutation":{mutateStaffAdminBranchStatus:async()=>{runtimeCalls.push("staff-branch-post");return{state:"ready",outcome:"applied",operation:"set_restaurant_branch_status",status:"inactive",statusVersion:"1",occurredAt:"2026-09-13T01:00:00Z",requestId:"11111111-1111-4111-8111-111111111111"};}}
}[id]??{}));
const authorization=mode=>async()=>({state:"authorized",mode,authorization:"Bearer token"});
const auditRequest=()=>new Request("https://admin.invalid/api/platform-admin/audit");
const branchGet=()=>new Request("https://admin.invalid/api/platform-admin/restaurant-branches/b/status?restaurantId=r");
const branchPost=()=>new Request("https://admin.invalid/api/platform-admin/restaurant-branches/b/status",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
await check("AK legacy cookie invokes only legacy Audit",async()=>{runtimeCalls.length=0;await auditRuntimeModule.handlePlatformAdminAuditRequest(auditRequest(),{},fetch,authorization("browser_cookie_session"));assert.deepEqual(runtimeCalls,["legacy-audit"]);});
await check("AL staff cookie invokes only staff Audit",async()=>{runtimeCalls.length=0;await auditRuntimeModule.handlePlatformAdminAuditRequest(auditRequest(),{TASTKIND_ADMIN_AUTHORITY_MODE:"staff_permissions_legacy_admission"},fetch,authorization("browser_cookie_session"));assert.deepEqual(runtimeCalls,["staff-audit"]);});
await check("AM bearer invokes only legacy Audit even in staff mode",async()=>{runtimeCalls.length=0;await auditRuntimeModule.handlePlatformAdminAuditRequest(auditRequest(),{TASTKIND_ADMIN_AUTHORITY_MODE:"staff_permissions_legacy_admission"},fetch,authorization("bearer"));assert.deepEqual(runtimeCalls,["legacy-audit"]);});
await check("AN legacy cookie invokes legacy Branch preview",async()=>{runtimeCalls.length=0;await branchRuntimeModule.handlePlatformAdminBranchStatusPreviewRequest(branchGet(),"b",{},fetch,authorization("browser_cookie_session"));assert.deepEqual(runtimeCalls,["legacy-branch-get"]);});
await check("AO staff cookie invokes staff Branch preview",async()=>{runtimeCalls.length=0;await branchRuntimeModule.handlePlatformAdminBranchStatusPreviewRequest(branchGet(),"b",{TASTKIND_ADMIN_AUTHORITY_MODE:"staff_permissions_legacy_admission"},fetch,authorization("browser_cookie_session"));assert.deepEqual(runtimeCalls,["staff-branch-get"]);});
await check("AP bearer invokes legacy Branch preview",async()=>{runtimeCalls.length=0;await branchRuntimeModule.handlePlatformAdminBranchStatusPreviewRequest(branchGet(),"b",{TASTKIND_ADMIN_AUTHORITY_MODE:"staff_permissions_legacy_admission"},fetch,authorization("bearer"));assert.deepEqual(runtimeCalls,["legacy-branch-get"]);});
await check("AQ exact B0-B successor selects staff cookie POST",async()=>{runtimeCalls.length=0;await branchRuntimeModule.handlePlatformAdminBranchStatusMutationRequest(branchPost(),"b",{TASTKIND_ADMIN_AUTHORITY_MODE:"staff_permissions_legacy_admission"},fetch,authorization("browser_cookie_session"));assert.deepEqual(runtimeCalls,["staff-branch-post"]);});
await check("AR denied staff cookie POST never reaches downstream",async()=>{runtimeCalls.length=0;const response=await branchRuntimeModule.handlePlatformAdminBranchStatusMutationRequest(branchPost(),"b",{},fetch,async()=>({state:"forbidden"}));assert.equal(response.status,403);assert.deepEqual(runtimeCalls,[]);});
await check("AS bearer POST remains legacy downstream",async()=>{runtimeCalls.length=0;await branchRuntimeModule.handlePlatformAdminBranchStatusMutationRequest(branchPost(),"b",{TASTKIND_ADMIN_AUTHORITY_MODE:"invalid"},fetch,authorization("bearer"));assert.deepEqual(runtimeCalls,["legacy-branch-post"]);});

console.log("\n"+JSON.stringify({suite:"staff-authority-p3-p6-p2d-b0-a-smoke",total:checks.length,passed:checks.length-failures.length,failed:failures.length,failures,databaseUsed:false,developmentAccessed:false,productionAccessed:false},null,2));
process.exitCode=failures.length?1:0;
