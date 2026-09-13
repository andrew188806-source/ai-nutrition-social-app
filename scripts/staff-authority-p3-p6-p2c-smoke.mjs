#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
function loadTypeScript(file, requireModule = () => { throw new Error(`Unexpected import from ${file}`); }) {
  const result = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
    reportDiagnostics: true
  });
  const errors = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(errors.map((item) => String(item.messageText)).join("\n"));
  const module = { exports: {} };
  new Function("exports", "module", "require", result.outputText)(module.exports, module, requireModule);
  return module.exports;
}

const vocabulary = loadTypeScript("apps/admin-web/auth/admin-current-permission-vocabulary.ts");
const currentPermissions = loadTypeScript(
  "apps/admin-web/auth/admin-current-permission-context.ts",
  (request) => request === "./admin-current-permission-vocabulary"
    ? vocabulary
    : (() => { throw new Error(`Unexpected current-context import: ${request}`); })()
);
const shadow = loadTypeScript("apps/admin-web/auth/admin-staff-authority-shadow.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected shadow import: ${request}`);
});
const legacyAuthority = loadTypeScript("apps/admin-web/server/platformAdminAuthority.ts", (request) => {
  if (request === "server-only") return {};
  throw new Error(`Unexpected legacy authority import: ${request}`);
});
const adminContext = loadTypeScript("apps/admin-web/auth/admin-context.ts", (request) => {
  if (request === "server-only") return {};
  if (request === "next/cache") return { unstable_noStore: () => {} };
  if (request === "react") return { cache: (callback) => callback };
  if (request === "@supabase/supabase-js") return { isAuthSessionMissingError: () => false };
  if (request === "../server/platformAdminAuthority") return legacyAuthority;
  if (request === "../server/platformAdminBranchStatusAuthority") {
    return { PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION: "admin_restaurant_branch.status.write" };
  }
  if (request === "../config/admin-auth") return { getAdminAuthConfig: () => ({ state: "unavailable" }) };
  if (request === "./admin-current-permission-context") return currentPermissions;
  if (request === "./admin-staff-authority-shadow") return shadow;
  if (request === "./supabase-server") return { createAdminSupabaseServerClient: () => { throw new Error("unused"); } };
  throw new Error(`Unexpected Admin context import: ${request}`);
});

const subject = "11111111-1111-4111-8111-111111111111";
const threeKeys = [...vocabulary.CURRENT_ADMIN_PERMISSION_KEYS];
const authoritative = Object.freeze({
  state: "admin",
  subject,
  roleKey: "platform_admin",
  permissions: Object.freeze([...threeKeys])
});
const rows = (permissions) => permissions.map((permission_key) => ({ permission_key }));
const ok = (permissions) => ({ ok: true, data: rows(permissions) });
const compare = (permissions) => shadow.compareAdminStaffAuthorityShadow(authoritative, ok(permissions), true);

function fakeClient({ staffData = rows(threeKeys), staffError = null, staffThrow = false, legacyState = "admin" } = {}) {
  const calls = { getUser: 0, rpc: [] };
  const client = {
    auth: {
      getUser: async () => {
        calls.getUser += 1;
        return { data: { user: { id: subject, is_anonymous: false } }, error: null };
      }
    },
    rpc: async (name) => {
      calls.rpc.push(name);
      if (name === "platform_admin_current_context_v1") {
        if (legacyState === "unavailable") return { data: null, error: new Error("legacy rejected") };
        if (legacyState === "not_admin") return { data: [], error: null };
        return {
          data: [
            { role_key: "platform_admin", permission_key: "admin_context.read", permission_scope: "self" },
            { role_key: "platform_admin", permission_key: "admin_audit.read", permission_scope: "platform" }
          ],
          error: null
        };
      }
      if (name === "platform_admin_has_permission_v1") return { data: true, error: null };
      if (name === "staff_current_context_v1") {
        if (staffThrow) throw new Error("private staff transport detail");
        return { data: staffData, error: staffError };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }
  };
  return { client, calls };
}

async function withEnv(value, run) {
  const before = process.env.TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW;
  if (value === undefined) delete process.env.TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW;
  else process.env.TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW = value;
  try { return await run(); }
  finally {
    if (before === undefined) delete process.env.TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW;
    else process.env.TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW = before;
  }
}

const cases = [];
const test = (name, run) => cases.push([name, run]);
test("A missing shadow env defaults disabled", () => assert.equal(shadow.isAdminStaffAuthorityShadowEnabled({}), false));
test("B explicit disabled stays disabled", () => assert.equal(shadow.isAdminStaffAuthorityShadowEnabled({ TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW: "disabled" }), false));
test("C explicit enabled enables shadow only", () => assert.equal(shadow.isAdminStaffAuthorityShadowEnabled({ TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW: "enabled" }), true));
test("D invalid env fails closed", () => assert.equal(shadow.isAdminStaffAuthorityShadowEnabled({ TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW: "legacy" }), false));
test("D2 padded env value remains disabled", () => assert.equal(shadow.isAdminStaffAuthorityShadowEnabled({ TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW: " enabled " }), false));
test("E exact three-key set matches", () => assert.deepEqual(compare(threeKeys), { state: "match" }));
test("F match is order independent", () => assert.deepEqual(compare([...threeKeys].reverse()), { state: "match" }));
test("G duplicate rows normalize to match", () => assert.deepEqual(compare([...threeKeys, threeKeys[0]]), { state: "match" }));
test("H missing Branch Status is exact mismatch", () => assert.deepEqual(compare(threeKeys.filter((key) => key !== "admin_restaurant_branch.status.write")), {
  state: "mismatch", missingFromStaff: ["admin_restaurant_branch.status.write"], extraInStaff: []
}));
test("I recognized staff extra is exact mismatch", () => {
  const legacyTwo = { ...authoritative, permissions: ["admin_context.read", "admin_audit.read"] };
  assert.deepEqual(shadow.compareAdminStaffAuthorityShadow(legacyTwo, ok(threeKeys), true), {
    state: "mismatch", missingFromStaff: [], extraInStaff: ["admin_restaurant_branch.status.write"]
  });
});
test("J both missing and extra are reported", () => {
  const legacyTwo = { ...authoritative, permissions: ["admin_context.read", "admin_restaurant_branch.status.write"] };
  assert.deepEqual(shadow.compareAdminStaffAuthorityShadow(legacyTwo, ok(["admin_context.read", "admin_audit.read"]), true), {
    state: "mismatch", missingFromStaff: ["admin_restaurant_branch.status.write"], extraInStaff: ["admin_audit.read"]
  });
});
for (const [label, data] of [
  ["K null response", null], ["L object response", {}], ["M missing key", [{}]],
  ["N non-string key", [{ permission_key: 1 }]], ["O unknown key", [{ permission_key: "admin.future.read" }]]
]) test(`${label} is malformed`, () => assert.deepEqual(shadow.compareAdminStaffAuthorityShadow(authoritative, { ok: true, data }, true), { state: "unavailable", reason: "malformed_response" }));
test("P RPC rejection is unavailable", () => assert.deepEqual(shadow.compareAdminStaffAuthorityShadow(authoritative, { ok: false, reason: "rpc_rejected" }, true), { state: "unavailable", reason: "rpc_rejected" }));
test("Q RPC throw is unavailable and caught", async () => {
  const { client } = fakeClient({ staffThrow: true });
  assert.deepEqual(await shadow.resolveAdminStaffAuthorityShadow(client, authoritative, { enabled: true, warn: () => {} }), { state: "unavailable", reason: "rpc_unreachable" });
});
test("Q2 stalled staff RPC times out without changing authority", async () => {
  const client = { rpc: async () => new Promise(() => {}) };
  assert.deepEqual(await shadow.resolveAdminStaffAuthorityShadow(client, authoritative, { enabled: true, timeoutMs: 1, warn: () => {} }), { state: "unavailable", reason: "rpc_unreachable" });
});
test("R disabled runtime makes no staff call", async () => {
  const { client, calls } = fakeClient();
  assert.deepEqual(await shadow.resolveAdminStaffAuthorityShadow(client, authoritative, { enabled: false }), { state: "disabled" });
  assert.deepEqual(calls.rpc, []);
});
test("S non-admin runtime is not applicable and makes no staff call", async () => {
  const { client, calls } = fakeClient();
  assert.deepEqual(await shadow.resolveAdminStaffAuthorityShadow(client, { state: "not_admin" }, { enabled: true }), { state: "not_applicable" });
  assert.deepEqual(calls.rpc, []);
});
test("T enabled runtime calls staff context exactly once", async () => {
  const { client, calls } = fakeClient();
  assert.deepEqual(await shadow.resolveAdminStaffAuthorityShadow(client, authoritative, { enabled: true }), { state: "match" });
  assert.deepEqual(calls.rpc, ["staff_current_context_v1"]);
});
test("U mismatch diagnostic contains only bounded permission data", async () => {
  const diagnostics = [];
  const { client } = fakeClient({ staffData: rows(["admin_context.read"]) });
  await shadow.resolveAdminStaffAuthorityShadow(client, authoritative, { enabled: true, warn: (value) => diagnostics.push(value) });
  assert.equal(diagnostics.length, 1);
  const serialized = JSON.stringify(diagnostics[0]);
  assert.equal(serialized.includes(subject), false);
  assert.equal(/email|jwt|cookie|authorization|access.?token|refresh.?token|error/i.test(serialized), false);
});
test("V throwing diagnostic transport cannot change shadow result", async () => {
  const { client } = fakeClient({ staffData: rows(["admin_context.read"]) });
  assert.equal((await shadow.resolveAdminStaffAuthorityShadow(client, authoritative, { enabled: true, warn: () => { throw new Error("logger"); } })).state, "mismatch");
});
test("W shadow-disabled integration preserves legacy admin and performs no staff RPC", () => withEnv("disabled", async () => {
  const { client, calls } = fakeClient();
  assert.deepEqual(await adminContext.resolveVerifiedAdminPermissionContext(client), authoritative);
  assert.equal(calls.getUser, 1);
  assert.deepEqual(calls.rpc, ["platform_admin_current_context_v1", "platform_admin_has_permission_v1"]);
}));
test("X enabled integration matches and preserves authoritative admin", () => withEnv("enabled", async () => {
  const { client, calls } = fakeClient();
  assert.deepEqual(await adminContext.resolveVerifiedAdminPermissionContext(client), authoritative);
  assert.equal(calls.getUser, 1);
  assert.deepEqual(calls.rpc, ["platform_admin_current_context_v1", "platform_admin_has_permission_v1", "staff_current_context_v1"]);
}));
test("Y enabled mismatch preserves authoritative admin", () => withEnv("enabled", async () => {
  const { client } = fakeClient({ staffData: rows(["admin_context.read", "admin_audit.read"]) });
  const before = console.warn; console.warn = () => {};
  try { assert.deepEqual(await adminContext.resolveVerifiedAdminPermissionContext(client), authoritative); }
  finally { console.warn = before; }
}));
test("Z staff rejection preserves authoritative admin", () => withEnv("enabled", async () => {
  const { client } = fakeClient({ staffError: new Error("private") });
  const before = console.warn; console.warn = () => {};
  try { assert.deepEqual(await adminContext.resolveVerifiedAdminPermissionContext(client), authoritative); }
  finally { console.warn = before; }
}));
test("AA staff throw preserves authoritative admin", () => withEnv("enabled", async () => {
  const { client } = fakeClient({ staffThrow: true });
  const before = console.warn; console.warn = () => {};
  try { assert.deepEqual(await adminContext.resolveVerifiedAdminPermissionContext(client), authoritative); }
  finally { console.warn = before; }
}));
test("AB legacy not_admin cannot be rescued by staff", () => withEnv("enabled", async () => {
  const { client, calls } = fakeClient({ legacyState: "not_admin" });
  assert.deepEqual(await adminContext.resolveVerifiedAdminPermissionContext(client), { state: "not_admin" });
  assert.equal(calls.rpc.includes("staff_current_context_v1"), false);
}));
test("AC legacy unavailable cannot be rescued by staff", () => withEnv("enabled", async () => {
  const { client, calls } = fakeClient({ legacyState: "unavailable" });
  assert.equal((await adminContext.resolveVerifiedAdminPermissionContext(client)).state, "unavailable");
  assert.equal(calls.rpc.includes("staff_current_context_v1"), false);
}));
test("AD staff predicate fan-out is absent", () => withEnv("enabled", async () => {
  const { client, calls } = fakeClient();
  await adminContext.resolveVerifiedAdminPermissionContext(client);
  assert.equal(calls.rpc.includes("staff_has_permission_v1"), false);
}));

let passed = 0;
for (const [name, run] of cases) {
  try { await run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { console.log(`FAIL ${name}`); console.log(error instanceof Error ? error.stack : String(error)); }
}
console.log(JSON.stringify({ suite: "staff-authority-p3-p6-p2c-smoke", total: cases.length, passed, failed: cases.length - passed, developmentAccessed: false, productionAccessed: false }, null, 2));
if (passed !== cases.length) process.exitCode = 1;
