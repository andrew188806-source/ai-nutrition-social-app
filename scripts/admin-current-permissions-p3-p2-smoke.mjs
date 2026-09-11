#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");

function executeTypeScript(file, requireModule = () => { throw new Error(`Unexpected runtime import from ${file}`); }) {
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

const vocabulary = executeTypeScript("apps/admin-web/auth/admin-current-permission-vocabulary.ts");
const permissions = executeTypeScript(
  "apps/admin-web/auth/admin-current-permission-context.ts",
  (request) => {
    if (request === "./admin-current-permission-vocabulary") return vocabulary;
    throw new Error(`Unexpected permission-context import: ${request}`);
  }
);

const subject = "11111111-1111-4111-8111-111111111111";
const admin = (historicalPermissions) => ({
  state: "admin",
  roleKey: "platform_admin",
  permissions: historicalPermissions
});
const resolve = (membershipContext, branchStatusPermission, actor = subject) =>
  permissions.resolveCurrentAdminPermissionContext({ subject: actor, membershipContext, branchStatusPermission });
const keys = (context) => context.state === "admin" ? context.permissions : [];
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

const unavailable = { state: "unavailable", reason: "authority_unreachable" };
const cases = [
  ["A unauthenticated has no permission context", () => resolve({ state: "unauthenticated" }, null, null).state === "unauthenticated"],
  ["B authenticated non-admin has no permission context", () => resolve({ state: "not_admin" }, null).state === "not_admin"],
  ["C membership authority failure stays unavailable", () => resolve(unavailable, null).state === "unavailable"],
  ["D base-only admin receives exactly one key", () => same(keys(resolve(admin(["admin_context.read"]), { ok: true, granted: false })), ["admin_context.read"])],
  ["E audit admin receives exactly two sorted keys", () => same(keys(resolve(admin(["admin_context.read", "admin_audit.read"]), { ok: true, granted: false })), ["admin_audit.read", "admin_context.read"])],
  ["F fully permitted admin receives exactly three sorted keys", () => same(keys(resolve(admin(["admin_context.read", "admin_audit.read"]), { ok: true, granted: true })), vocabulary.CURRENT_ADMIN_PERMISSION_KEYS)],
  ["G successful false predicate omits branch write", () => !keys(resolve(admin(["admin_context.read"]), { ok: true, granted: false })).includes("admin_restaurant_branch.status.write")],
  ["H predicate transport failure is unavailable", () => resolve(admin(["admin_context.read"]), { ok: false, reason: "permission_authority_unreachable" }).state === "unavailable"],
  ["I unknown historical permission fails closed", () => resolve(admin(["admin_context.read", "admin_unknown.read"]), { ok: true, granted: false }).state === "unavailable"],
  ["J duplicate historical keys are deterministically deduplicated", () => same(keys(resolve(admin(["admin_context.read", "admin_audit.read", "admin_context.read"]), { ok: true, granted: false })), ["admin_audit.read", "admin_context.read"])],
  ["K missing base permission fails closed", () => resolve(admin(["admin_audit.read"]), { ok: true, granted: true }).state === "unavailable"],
  ["L planned permission cannot enter the snapshot", () => resolve(admin(["admin_context.read", "admin.management.read"]), { ok: true, granted: false }).state === "unavailable"],
  ["M arbitrary string cannot be checked as authority", () => permissions.hasCurrentAdminPermission(resolve(admin(["admin_context.read"]), { ok: true, granted: false }), "admin_context.*") === false]
];

const results = cases.map(([name, test]) => {
  let pass = false;
  try { pass = test(); } catch { pass = false; }
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  return { name, pass };
});
const failures = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  suite: "admin-current-permissions-p3-p2-smoke",
  total: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  developmentAccessed: false,
  productionAccessed: false
}, null, 2));
if (failures.length) process.exitCode = 1;
