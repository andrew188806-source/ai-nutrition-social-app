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
const currentContext = executeTypeScript("apps/admin-web/auth/admin-current-permission-context.ts", (request) => {
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected current-context import: ${request}`);
});
const registry = executeTypeScript("apps/admin-web/auth/admin-route-registry.ts", (request) => {
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected registry import: ${request}`);
});
const routeAuthorization = executeTypeScript("apps/admin-web/auth/admin-route-authorization.ts", (request) => {
  if (request === "./admin-route-registry") return registry;
  if (request === "./admin-current-permission-context") return currentContext;
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected route-authorization import: ${request}`);
});
const navigation = executeTypeScript("apps/admin-web/components/admin-shell/admin-ia-navigation.ts", (request) => {
  if (request === "../../auth/admin-route-registry") return registry;
  throw new Error(`Unexpected navigation import: ${request}`);
});

const byId = new Map(registry.ADMIN_ROUTE_REGISTRY.map((route) => [route.id, route]));
const baseAdmin = { state: "admin", roleKey: "platform_admin", permissions: ["admin_context.read"] };
const currentAdmin = (permissions) => ({
  state: "admin",
  subject: "11111111-1111-4111-8111-111111111111",
  roleKey: "platform_admin",
  permissions
});
const decide = (route, context, current = false) => {
  const requirement = routeAuthorization.resolveAdminRouteRequirement(route);
  return routeAuthorization.resolveAdminRouteAuthorization(current
    ? { requirement, currentPermissionContext: context }
    : { requirement, baseContext: context });
};
const audit = byId.get("audit");
const planned = byId.get("business-development");
const breakGlass = byId.get("break-glass");
const noPermissionRoute = { ...planned, id: "fixture-base", route: "/admin/fixture-base", requiredPermissions: [] };

const cases = [
  ["A unauthenticated uses the P3-P1 login gate", () => decide(planned, { state: "unauthenticated" }).state === "redirect_login"],
  ["B non-admin uses the P3-P1 access denial", () => decide(planned, { state: "not_admin" }).state === "access_denied"],
  ["C base authority failure remains unavailable", () => decide(planned, { state: "unavailable", reason: "authority_unreachable" }).state === "authority_unavailable"],
  ["D base Admin may open a route without a requirement", () => decide(noPermissionRoute, baseAdmin).state === "allow_base_admin"],
  ["E PLANNED route uses temporary base-Admin policy", () => decide(planned, baseAdmin).state === "allow_base_admin"],
  ["F held CURRENT permission allows its route", () => decide(audit, currentAdmin(["admin_audit.read", "admin_context.read"]), true).state === "allow_current_permission"],
  ["G missing CURRENT permission denies its route", () => decide(audit, currentAdmin(["admin_context.read"]), true).state === "permission_denied"],
  ["H current permission authority failure remains unavailable", () => decide(audit, { state: "unavailable", reason: "permission_authority_unreachable" }, true).state === "authority_unavailable"],
  ["I unknown route remains not registered", () => navigation.matchAdminRoute("/admin/does-not-exist") === null && routeAuthorization.resolveAdminRouteRequirement(null).state === "not_registered"],
  ["J hidden break-glass is not an ordinary route", () => routeAuthorization.resolveAdminRouteRequirement(breakGlass).state === "not_registered" && !fs.existsSync(path.join(root, "apps/admin-web/app/admin/break-glass/page.tsx"))],
  ["K contextual branch-status route matches deterministically", () => navigation.matchAdminRoute("/admin/restaurants/r1/branches/b1/status")?.entry.id === "restaurant-branch-status"],
  ["L static route outranks overlapping dynamic route", () => navigation.matchAdminRoute("/admin/restaurants/menu-management")?.entry.id === "menu-management"],
  ["M availability never grants a missing permission", () => audit.availability === "NOT_ENABLED" && decide(audit, currentAdmin(["admin_context.read"]), true).state === "permission_denied"],
  ["N PLANNED permission is never current authority", () => !vocabulary.isCurrentAdminPermissionKey(planned.requiredPermissions[0]) && routeAuthorization.resolveAdminRouteRequirement(planned).state === "base_admin"]
];

const results = cases.map(([name, test]) => {
  let pass = false;
  try { pass = test(); } catch { pass = false; }
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  return { name, pass };
});
const failures = results.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "admin-route-authorization-p3-p3-smoke", total: results.length, passed: results.length - failures.length, failed: failures.length, developmentAccessed: false, productionAccessed: false }, null, 2));
if (failures.length) process.exitCode = 1;
