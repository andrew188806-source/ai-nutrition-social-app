#!/usr/bin/env node
// Development-only acceptance for the real local P1 HTTP route. Inert without both opt-ins.
import crypto from "node:crypto";
import fs from "node:fs";

const PREFLIGHT_OPT_IN = "TASTKIND_PLATFORM_ADMIN_RA1C_P1_DEVELOPMENT_PREFLIGHT";
const WRITE_OPT_IN = "TASTKIND_PLATFORM_ADMIN_RA1C_P1_DEVELOPMENT_WRITE";
const DEV_REF = "msbgnnoorsoefuiwluye";
const DEV_NAME = "tastkind-development";
const TARGET_RESTAURANT = "synthetic-fixture-restaurant";
const TARGET_BRANCH = "synthetic-fixture-branch-b";
const PROTECTED_BRANCH = "dev-branch-xinyi";
const ADMIN_ID = "81b4cdaf-2f12-4bda-bb26-197f6f5990ae";
const ADMIN_EMAIL = "restaurant.owner.demo.20260903@development.invalid";
const BODY_LIMIT = 2048;
if (process.env[PREFLIGHT_OPT_IN] !== "1") {
  console.log(JSON.stringify({ suite: "platform-admin-ra-1c-p1-development-acceptance", status: "skipped",
    reason: `set ${PREFLIGHT_OPT_IN}=1 for the read-only preflight` }, null, 2)); process.exit(0);
}
const managementToken = process.env.SUPABASE_ACCESS_TOKEN;
const password = process.env.TASTKIND_RA1A_LIFECYCLE_TARGET_PASSWORD;
if (!managementToken) throw new Error("SUPABASE_ACCESS_TOKEN absent");
const baseUrl = new URL(process.env.TASTKIND_RA1C_P1_ADMIN_BASE_URL ?? "");
const loopback = baseUrl.protocol === "http:" && ["127.0.0.1", "localhost"].includes(baseUrl.hostname);
if ((!loopback && baseUrl.protocol !== "https:") || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash
  || baseUrl.pathname !== "/") throw new Error("invalid P1 Admin base URL");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function management(path, init = {}) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}${path}`, {
    ...init, headers: { Authorization: `Bearer ${managementToken}`, ...(init.headers ?? {}) }
  });
  const text = await response.text(); let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) throw new Error(`Development Management API ${response.status}`);
  return body;
}
async function sql(query) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, { method: "POST",
      headers: { Authorization: `Bearer ${managementToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const text = await response.text();
    if (response.ok) return JSON.parse(text);
    if (response.status !== 429) throw new Error(`Development SQL ${response.status}`);
    await wait(Math.min(30000, attempt * 4000));
  }
  throw new Error("Development Management API throttled");
}
const one = async (query) => (await sql(query))[0];
const fingerprint = (value) => crypto.createHash("sha256").update(JSON.stringify(value, Object.keys(value).sort())).digest("hex");
const requestHash = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
const redact = (value) => JSON.parse(JSON.stringify(value, (key, item) => {
  if (["requestId", "access_token", "refresh_token"].includes(key) && typeof item === "string") return `hash:${requestHash(item)}`;
  return item;
}).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[uuid-redacted]"));
const checks = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail: redact(detail) }) };
  checks.push(item); console.log(`${item.pass ? "PASS" : "FAIL"} ${checks.length} ${name}`);
}
const branchSnapshot = async (id) => (await one(`select jsonb_build_object(
  'branchId',b.id,'restaurantId',b.restaurant_id,'branchName',b.name,'status',b.status,'statusVersion',b.status_version::text,
  'isActive',b.is_active,'district',b.district,'address',b.address,'latitude',b.latitude,'longitude',b.longitude,
  'geocodeStatus',b.geocode_status,'geocodeAttempts',b.geocode_attempts,'geocodeProvider',b.geocode_provider,
  'geocodeProviderRef',b.geocode_provider_ref,'geocodeNormalizedAddress',b.geocode_normalized_address,
  'geocodeAddressFingerprint',b.geocode_address_fingerprint,'geocodeResolvedAt',b.geocode_resolved_at) snapshot
  from public.restaurant_branches b where b.id='${id}';`))?.snapshot;
const ownerSnapshot = async () => (await one(`select jsonb_build_object('authUserId',ru.auth_user_id,'loginStatus',ru.login_status,
  'membershipId',rm.id,'membershipStatus',rm.status,'roleKey',rr.role_key,'restaurantId',rm.restaurant_id,
  'branchScopes',(select coalesce(jsonb_agg(jsonb_build_object('branchId',s.branch_id,'status',s.status) order by s.branch_id),'[]'::jsonb)
    from public.restaurant_membership_branch_scopes s where s.membership_id=rm.id)) snapshot
  from public.restaurant_users ru join public.restaurant_memberships rm on rm.restaurant_user_id=ru.id
  join public.restaurant_roles rr on rr.id=rm.role_id
  where ru.auth_user_id='${ADMIN_ID}'::uuid;`))?.snapshot;
const receiptStats = async () => one(`select count(*)::int total,
  count(*) filter(where result='applied')::int applied,count(*) filter(where result='rejected')::int rejected,
  count(*) filter(where result='noop')::int noop from admin_internal.platform_admin_operation_receipts
  where branch_id='${TARGET_BRANCH}';`);
const operationReceiptCount = async (requestId) => (await one(`select count(*)::int n from admin_internal.platform_admin_operation_receipts
  where branch_id='${TARGET_BRANCH}' and request_id='${requestId}'::uuid;`)).n;
const branchScopeCount = async () => (await one(`select count(*)::int n from public.restaurant_membership_branch_scopes where branch_id='${TARGET_BRANCH}';`)).n;
const restaurantFingerprint = async () => (await one(`select md5(to_jsonb(r)::text) fingerprint from public.restaurants r where r.id='${TARGET_RESTAURANT}';`)).fingerprint;
const otherBranchesFingerprint = async () => (await one(`select md5(coalesce(jsonb_agg(jsonb_build_array(b.id,b.restaurant_id,b.name,b.district,b.address,b.status,
  b.is_active,b.latitude,b.longitude,b.geocode_status,b.geocode_attempts,b.geocode_provider,b.geocode_provider_ref,
  b.geocode_normalized_address,b.geocode_address_fingerprint,b.geocode_resolved_at) order by b.id)::text,'[]')) fingerprint
  from public.restaurant_branches b where b.id<>'${TARGET_BRANCH}';`)).fingerprint;
const activeAdminCount = async () => (await one("select count(*)::int n from admin_internal.platform_admin_memberships where status='active';")).n;
const operator = (statement) => sql(`begin; grant platform_admin_write_authority to postgres with inherit true, set false;
  ${statement}; revoke platform_admin_write_authority from postgres granted by postgres; commit;`);
const routeUrl = () => new URL(`/api/platform-admin/restaurant-branches/${encodeURIComponent(TARGET_BRANCH)}/status`, baseUrl);
async function api(method, bearer, body) {
  const url = routeUrl(); if (method === "GET") url.searchParams.set("restaurantId", TARGET_RESTAURANT);
  const response = await fetch(url, { method, headers: { Accept: "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error" });
  const text = await response.text(); let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: response.status, body: parsed, cacheControl: response.headers.get("cache-control") };
}
const requestBody = (preview, nextStatus, requestId = crypto.randomUUID()) => ({ restaurantId: TARGET_RESTAURANT,
  expectedStatus: preview.status, nextStatus, expectedVersion: preview.statusVersion,
  reasonCode: nextStatus === "inactive" ? "operational_pause" : "operational_resume", requestId });
async function signOut(publishableKey, bearer) {
  const response = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/logout`, { method: "POST",
    headers: { apikey: publishableKey, Authorization: `Bearer ${bearer}` } });
  return response.ok;
}
async function emergencyRestore(publishableKey, bearer, current, desiredStatus) {
  const body = { p_restaurant_id: TARGET_RESTAURANT, p_branch_id: TARGET_BRANCH, p_expected_status: current.status,
    p_requested_status: desiredStatus, p_expected_version: current.statusVersion,
    p_reason_code: desiredStatus === "active" ? "operational_resume" : "operational_pause", p_request_id: crypto.randomUUID() };
  const response = await fetch(`https://${DEV_REF}.supabase.co/rest/v1/rpc/platform_admin_set_restaurant_branch_status_v1`, {
    method: "POST", headers: { apikey: publishableKey, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  return response.ok;
}

let bearer, publishableKey, initial, protectedBefore, ownerBefore, receiptsBefore;
let targetChanged = false, adminGranted = false;
const requestEvidence = [];
try {
  const project = await management("");
  check("project pin is exactly tastkind-development", project.id === DEV_REF && project.name === DEV_NAME, { id: project.id, name: project.name });
  initial = await branchSnapshot(TARGET_BRANCH); protectedBefore = await branchSnapshot(PROTECTED_BRANCH);
  ownerBefore = await ownerSnapshot(); receiptsBefore = await receiptStats();
  const preScopeCount = await branchScopeCount(), preRestaurant = await restaurantFingerprint(), preOthers = await otherBranchesFingerprint();
  const dependencyCounts = await one(`select
    (select count(*)::int from public.menus where restaurant_id='${TARGET_RESTAURANT}') menus,
    (select count(*)::int from public.branch_menu_items where branch_id='${TARGET_BRANCH}') branch_menu_items;`);
  check("approved synthetic target exists", initial?.branchId === TARGET_BRANCH && initial.restaurantId === TARGET_RESTAURANT, initial);
  check("target begins active at version 4", initial?.status === "active" && initial.statusVersion === "4", initial);
  check("zero active Platform Admins before write", await activeAdminCount() === 0);
  check("seven P0 receipts are retained", receiptsBefore.total === 7, receiptsBefore);
  check("existing fixture remains an active Restaurant Owner", ownerBefore?.authUserId === ADMIN_ID && ownerBefore.loginStatus === "enabled"
    && ownerBefore.membershipStatus === "active" && ownerBefore.roleKey === "owner", ownerBefore);
  check("protected branch invariants match", protectedBefore?.status === "active" && protectedBefore.isActive === true
    && protectedBefore.district === "大安區" && protectedBefore.address === "信義路四段 200 號"
    && protectedBefore.geocodeStatus === "pending" && protectedBefore.geocodeAttempts === 0
    && protectedBefore.latitude === null && protectedBefore.longitude === null, protectedBefore);
  console.log(JSON.stringify({ phase: "PRE_WRITE_TARGET_CONFIRMATION", targetSnapshot: initial,
    targetFingerprint: fingerprint(initial), protectedFingerprint: fingerprint(protectedBefore), preScopeCount,
    dependencyCounts, preRestaurant, preOthers, receiptsBefore, developmentWriteStarted: false }, null, 2));
  if (process.env[WRITE_OPT_IN] !== "1") {
    const failures = checks.filter((item) => !item.pass);
    console.log(JSON.stringify({ suite: "platform-admin-ra-1c-p1-development-acceptance", status: "preflight_complete",
      writeExecuted: false, total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures }, null, 2));
    process.exitCode = failures.length ? 1 : 0; process.exit();
  }
  if (checks.some((item) => !item.pass)) throw new Error("PRE_WRITE_TARGET_CONFIRMATION_FAILED");
  if (!password) throw new Error("TASTKIND_RA1A_LIFECYCLE_TARGET_PASSWORD absent");
  const keys = await management("/api-keys");
  publishableKey = keys.find((key) => key.name === "default" && key.type === "publishable" && key.disabled !== true)?.api_key
    ?? keys.find((key) => key.name === "anon" && key.disabled !== true)?.api_key;
  if (!publishableKey) throw new Error("Development publishable key unavailable");
  const loginResponse = await fetch(`https://${DEV_REF}.supabase.co/auth/v1/token?grant_type=password`, { method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" }, body: JSON.stringify({ email: ADMIN_EMAIL, password }) });
  const login = await loginResponse.json(); bearer = login.access_token;
  check("existing Development fixture signs in", loginResponse.ok && Boolean(bearer) && login.user?.id === ADMIN_ID, { status: loginResponse.status, id: login.user?.id });
  const initialBody = requestBody(initial, "inactive");
  const unauthGet = await api("GET", null), unauthPost = await api("POST", null, initialBody);
  check("no-bearer GET is denied", unauthGet.status === 401 && unauthGet.body?.state === "unauthenticated", unauthGet);
  check("no-bearer POST is denied", unauthPost.status === 401 && unauthPost.body?.state === "unauthenticated", unauthPost);
  const ownerGet = await api("GET", bearer), ownerPost = await api("POST", bearer, initialBody);
  check("Restaurant Owner GET is denied", ownerGet.status === 403 && ownerGet.body?.state === "permission_denied", ownerGet);
  check("Restaurant Owner POST is denied", ownerPost.status === 403 && ownerPost.body?.state === "permission_denied", ownerPost);
  check("pre-grant denials create no receipt", (await receiptStats()).total === receiptsBefore.total);
  const ui = fs.readFileSync("apps/admin-web/components/PlatformAdminBranchStatus.tsx", "utf8");
  check("UI denial is disabled without canonical preview", ui.includes('if (preview.state !== "ready")') && ui.includes("狀態變更不可用"));
  await operator(`select admin_internal.grant_platform_admin('${ADMIN_ID}'::uuid,'platform_admin',null,'RA-1C-P1 Development acceptance')`); adminGranted = true;
  check("temporary active Platform Admin count is one", await activeAdminCount() === 1);
  check("Restaurant Owner authority remains unchanged after Admin grant", JSON.stringify(await ownerSnapshot()) === JSON.stringify(ownerBefore));
  const preview = await api("GET", bearer);
  check("active Admin receives canonical preview", preview.status === 200 && preview.body?.state === "ready"
    && preview.body.branchId === TARGET_BRANCH && preview.body.restaurantId === TARGET_RESTAURANT
    && preview.body.status === "active" && typeof preview.body.statusVersion === "string", preview);
  check("preview DTO is exact, bounded and private", JSON.stringify(Object.keys(preview.body).sort())
    === JSON.stringify(["branchId","branchName","restaurantId","state","status","statusVersion"].sort())
    && preview.cacheControl === "private, no-store" && !JSON.stringify(preview.body).match(/address|geocode|member|receipt|actor|audit/i), preview);
  const appliedRequest = requestBody(preview.body, "inactive"); requestEvidence.push({ operation: "pause", hash: requestHash(appliedRequest.requestId) });
  check("mutation request body is bounded", new TextEncoder().encode(JSON.stringify(appliedRequest)).byteLength <= BODY_LIMIT);
  const applied = await api("POST", bearer, appliedRequest); targetChanged = applied.body?.state === "ready";
  check("HTTP mutation applies active to inactive", applied.status === 200 && applied.body?.state === "ready"
    && applied.body.outcome === "applied" && applied.body.status === "inactive"
    && applied.body.statusVersion === (BigInt(preview.body.statusVersion) + 1n).toString()
    && applied.body.requestId === appliedRequest.requestId, applied);
  const afterApply = await branchSnapshot(TARGET_BRANCH);
  check("Development target advances exactly once", afterApply.status === "inactive"
    && afterApply.statusVersion === (BigInt(initial.statusVersion) + 1n).toString(), { initial, afterApply });
  check("apply changes only status and version", Object.keys(initial).every((key) => ["status", "statusVersion", "isActive"].includes(key)
    || JSON.stringify(initial[key]) === JSON.stringify(afterApply[key])), { initial, afterApply });
  check("apply creates exactly one receipt", await operationReceiptCount(appliedRequest.requestId) === 1);
  check("restaurant, scopes and unrelated branches remain unchanged", await restaurantFingerprint() === preRestaurant
    && await branchScopeCount() === preScopeCount && await otherBranchesFingerprint() === preOthers);
  const replayBefore = await receiptStats(), replay = await api("POST", bearer, appliedRequest), replayAfter = await receiptStats();
  check("HTTP replay returns the stored result", replay.status === 200 && JSON.stringify(replay.body) === JSON.stringify(applied.body), { applied, replay });
  check("replay adds no receipt or version", JSON.stringify(replayAfter) === JSON.stringify(replayBefore)
    && (await branchSnapshot(TARGET_BRANCH)).statusVersion === afterApply.statusVersion);
  const conflictPayload = { ...appliedRequest, expectedStatus: "inactive", nextStatus: "active", reasonCode: "operational_resume" };
  const conflict = await api("POST", bearer, conflictPayload);
  check("different valid payload with the same requestId conflicts", conflict.status === 409 && conflict.body?.state === "idempotency_conflict", conflict);
  check("conflict preserves original receipt and version", await operationReceiptCount(appliedRequest.requestId) === 1
    && (await branchSnapshot(TARGET_BRANCH)).statusVersion === afterApply.statusVersion);
  const staleRequest = { ...appliedRequest, requestId: crypto.randomUUID() }; requestEvidence.push({ operation: "stale", hash: requestHash(staleRequest.requestId) });
  const stale = await api("POST", bearer, staleRequest);
  check("new stale request maps to HTTP 409", stale.status === 409 && stale.body?.state === "stale_state", stale);
  check("stale does not mutate or advance version", (await branchSnapshot(TARGET_BRANCH)).statusVersion === afterApply.statusVersion);
  check("UI stale path refreshes and never auto-submits", /result\.state === "stale_state"[\s\S]{0,260}await refresh/.test(ui)
    && !/result\.state === "stale_state"[\s\S]{0,260}send\(/.test(ui));
  check("uncertain retry retains identical operation", ui.includes("onClick={() => void send(pending)}") && ui.includes("使用相同 requestId 重試"));
  const fresh = await api("GET", bearer);
  check("fresh preview after stale is inactive", fresh.body?.state === "ready" && fresh.body.status === "inactive"
    && fresh.body.statusVersion === afterApply.statusVersion, fresh);
  const recoveryRequest = requestBody(fresh.body, "active"); requestEvidence.push({ operation: "recovery", hash: requestHash(recoveryRequest.requestId) });
  check("recovery is a new intentional requestId", recoveryRequest.requestId !== appliedRequest.requestId);
  const restored = await api("POST", bearer, recoveryRequest);
  check("P1 recovery applies inactive to active", restored.status === 200 && restored.body?.state === "ready"
    && restored.body.outcome === "applied" && restored.body.status === "active"
    && restored.body.statusVersion === (BigInt(afterApply.statusVersion) + 1n).toString(), restored);
  targetChanged = false;
  const abaRequest = { restaurantId: TARGET_RESTAURANT, expectedStatus: "active", nextStatus: "inactive",
    expectedVersion: initial.statusVersion, reasonCode: "operational_pause", requestId: crypto.randomUUID() };
  requestEvidence.push({ operation: "aba", hash: requestHash(abaRequest.requestId) });
  const aba = await api("POST", bearer, abaRequest);
  check("old pre-cycle version is stale after active recovery", aba.status === 409 && aba.body?.state === "stale_state", aba);
  const afterAba = await branchSnapshot(TARGET_BRANCH);
  check("ABA proof creates no mutation", afterAba.status === "active" && afterAba.statusVersion === restored.body.statusVersion);
  await operator(`select admin_internal.revoke_platform_admin('${ADMIN_ID}'::uuid,null,'RA-1C-P1 Development acceptance')`); adminGranted = false;
  check("active Platform Admin count returns to zero", await activeAdminCount() === 0);
  const deniedGet = await api("GET", bearer);
  const deniedNew = await api("POST", bearer, { ...abaRequest, requestId: crypto.randomUUID(), expectedVersion: restored.body.statusVersion });
  const deniedReplay = await api("POST", bearer, appliedRequest);
  check("same-session GET denied after revoke", deniedGet.status === 403 && deniedGet.body?.state === "permission_denied", deniedGet);
  check("same-session new mutation denied after revoke", deniedNew.status === 403 && deniedNew.body?.state === "permission_denied", deniedNew);
  check("same-session historical replay denied after revoke", deniedReplay.status === 403 && deniedReplay.body?.state === "permission_denied", deniedReplay);
  const final = await branchSnapshot(TARGET_BRANCH), protectedFinal = await branchSnapshot(PROTECTED_BRANCH), ownerFinal = await ownerSnapshot();
  const receiptsAfter = await receiptStats();
  check("target finishes active with two canonical increments", final.status === "active"
    && final.statusVersion === (BigInt(initial.statusVersion) + 2n).toString(), { initial, final });
  check("protected branch business fingerprint is unchanged", fingerprint(protectedFinal) === fingerprint(protectedBefore), { protectedBefore, protectedFinal });
  check("Restaurant Owner authority is unchanged", JSON.stringify(ownerFinal) === JSON.stringify(ownerBefore), { ownerBefore, ownerFinal });
  check("receipt delta is exactly two applied and two rejected", receiptsAfter.total - receiptsBefore.total === 4
    && receiptsAfter.applied - receiptsBefore.applied === 2 && receiptsAfter.rejected - receiptsBefore.rejected === 2
    && receiptsAfter.noop === receiptsBefore.noop, { receiptsBefore, receiptsAfter });
  const security = await one(`select
    has_table_privilege('authenticated','admin_internal.platform_admin_operation_receipts','select') receipt_client_read,
    has_function_privilege('authenticated','admin_internal.lock_current_platform_admin_branch_status_actor_v1()','execute') helper_client_execute,
    has_function_privilege('anon','public.platform_admin_set_restaurant_branch_status_v1(text,text,text,text,bigint,text,uuid)','execute') anon_mutation_execute,
    has_column_privilege('platform_admin_branch_status_authority','public.restaurant_branches','address','update') writer_address_update,
    (select count(*) = 3 and count(*) filter (where member.rolname = 'postgres' and grantor.rolname = 'supabase_admin'
      and membership.admin_option is true and membership.inherit_option is false and membership.set_option is false) = 3
      from pg_auth_members membership join pg_roles role on role.oid=membership.roleid
      join pg_roles member on member.oid=membership.member join pg_roles grantor on grantor.oid=membership.grantor
      where role.rolname in ('platform_admin_write_authority','platform_admin_branch_status_authority','platform_admin_context_reader'))
      platform_creator_memberships_exact,
    exists(select 1 from (values ('platform_admin_write_authority'),('platform_admin_branch_status_authority'),
      ('platform_admin_context_reader')) sealed(role_name)
      where pg_has_role('postgres',sealed.role_name,'usage') or pg_has_role('postgres',sealed.role_name,'set'))
      postgres_runtime_path,
    exists(select 1 from pg_auth_members m join pg_roles role on role.oid=m.roleid join pg_roles member on member.oid=m.member
      where role.rolname in ('platform_admin_write_authority','platform_admin_branch_status_authority','platform_admin_context_reader')
      and member.rolname in ('anon','authenticated','authenticator','service_role')) client_role_residue;`);
  check("receipt table and private helper remain client-denied", security.receipt_client_read === false && security.helper_client_execute === false, security);
  check("anon mutation and unrelated writer UPDATE remain denied", security.anon_mutation_execute === false && security.writer_address_update === false, security);
  check("trusted control-plane memberships are exact and confer no runtime path",
    security.platform_creator_memberships_exact === true && security.postgres_runtime_path === false
    && security.client_role_residue === false, security);
  check("final sign-out succeeds", await signOut(publishableKey, bearer)); bearer = undefined;
  console.log(JSON.stringify({ phase: "FINAL_DEVELOPMENT_STATE", target: final, protectedFingerprint: fingerprint(protectedFinal),
    ownerFingerprint: fingerprint(ownerFinal), receiptsBefore, receiptsAfter, requestEvidence }, null, 2));
} catch (error) {
  checks.push({ name: "suite execution", pass: false, detail: String(error?.message ?? error).slice(0, 300) });
} finally {
  try {
    if (targetChanged && bearer && adminGranted) {
      const current = await api("GET", bearer);
      if (current.body?.state === "ready" && current.body.status === "inactive") {
        const result = await api("POST", bearer, requestBody(current.body, "active"));
        if (result.body?.state !== "ready") await emergencyRestore(publishableKey, bearer, current.body, "active");
        targetChanged = false;
      }
    }
    if (adminGranted) {
      await operator(`select admin_internal.revoke_platform_admin('${ADMIN_ID}'::uuid,null,'RA-1C-P1 recovery')`); adminGranted = false;
    }
    if (bearer && publishableKey) await signOut(publishableKey, bearer);
  } catch (error) { checks.push({ name: "canonical recovery", pass: false, detail: String(error?.message ?? error).slice(0, 300) }); }
}
const failures = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "platform-admin-ra-1c-p1-development-acceptance", project: DEV_REF, target: TARGET_BRANCH,
  total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures,
  developmentWriteExecuted: process.env[WRITE_OPT_IN] === "1", productionTouched: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
