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
let exactPermissionChecks = 0;
const measuredCurrentContext = {
  ...currentContext,
  hasCurrentAdminPermission(...args) {
    exactPermissionChecks += 1;
    return currentContext.hasCurrentAdminPermission(...args);
  }
};
const registry = executeTypeScript("apps/admin-web/auth/admin-route-registry.ts", (request) => {
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected registry import: ${request}`);
});
const authorization = executeTypeScript("apps/admin-web/auth/admin-route-authorization.ts", (request) => {
  if (request === "./admin-route-registry") return registry;
  if (request === "./admin-current-permission-context") return measuredCurrentContext;
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected authorization import: ${request}`);
});
const visibility = executeTypeScript("apps/admin-web/auth/admin-navigation-visibility.ts", (request) => {
  if (request === "./admin-route-registry") return registry;
  if (request === "./admin-route-authorization") return authorization;
  throw new Error(`Unexpected visibility import: ${request}`);
});

const byId = new Map(registry.ADMIN_ROUTE_REGISTRY.map((route) => [route.id, route]));
const admin = (permissions) => ({
  state: "admin",
  subject: "11111111-1111-4111-8111-111111111111",
  roleKey: "platform_admin",
  permissions
});
const baseAdmin = admin(["admin_context.read"]);
const fullAdmin = admin(vocabulary.CURRENT_ADMIN_PERMISSION_KEYS);
const derive = (context, routes = registry.ADMIN_ROUTE_REGISTRY) => visibility.deriveAdminNavigationVisibility(context, routes);
const linked = (model, id) => model.state === "ready" && model.linkRouteIds.includes(id);
const visible = (model, id) => model.state === "ready" && model.visibleRouteIds.includes(id);
const fixture = (sourceId, overrides) => ({ ...byId.get(sourceId), ...overrides, legacyRoutes: [] });

const currentParent = fixture("audit", { id: "fixture-parent", parentId: null, route: "/admin/fixture-parent" });
const missingChild = fixture("audit-platform-memberships", { id: "fixture-child", parentId: "fixture-parent", route: "/admin/fixture-parent/child" });
const allowedChild = fixture("restaurant-branch-status", { id: "fixture-child", parentId: "fixture-parent", route: "/admin/fixture-parent/child" });
const base = derive(baseAdmin);
const full = derive(fullAdmin);

const cases = [
  ["A base Admin route is visible", () => linked(base, "dashboard")],
  ["B PLANNED route is visible under the temporary base policy", () => linked(base, "business-development")],
  ["C held CURRENT route is visible", () => linked(full, "audit")],
  ["D missing CURRENT route is hidden as a link", () => !linked(base, "audit")],
  ["E hidden login route stays hidden", () => !visible(full, "admin-login")],
  ["F break-glass stays hidden", () => !visible(full, "break-glass")],
  ["G visible CURRENT child retains its necessary ancestor", () => {
    const model = derive(admin(["admin_context.read", "admin_restaurant_branch.status.write"]), [currentParent, allowedChild]);
    return linked(model, "fixture-child") && visible(model, "fixture-parent");
  }],
  ["H hidden CURRENT child leaves no empty parent", () => {
    const model = derive(baseAdmin, [currentParent, missingChild]);
    return model.state === "ready" && model.visibleRouteIds.length === 0;
  }],
  ["I unauthorized parent is retained only as a structural node", () => {
    const model = derive(admin(["admin_context.read", "admin_restaurant_branch.status.write"]), [currentParent, allowedChild]);
    return visible(model, "fixture-parent") && !linked(model, "fixture-parent") && linked(model, "fixture-child");
  }],
  ["J canonical registry order is preserved", () => full.state === "ready" && full.linkRouteIds.every((id, index) => index === 0 || registry.ADMIN_ROUTE_REGISTRY.findIndex((route) => route.id === full.linkRouteIds[index - 1]) < registry.ADMIN_ROUTE_REGISTRY.findIndex((route) => route.id === id))],
  ["K duplicate route IDs fail closed", () => derive(fullAdmin, [currentParent, { ...allowedChild, id: currentParent.id }]).state === "unavailable"],
  ["L LIVE availability cannot override a missing CURRENT permission", () => !linked(derive(baseAdmin, [fixture("audit", { id: "fixture-live", parentId: null, route: "/admin/fixture-live", availability: "LIVE" })]), "fixture-live")],
  ["M NOT_ENABLED availability does not hide an allowed PLANNED route", () => linked(base, "business-development") && byId.get("business-development").availability === "NOT_ENABLED"],
  ["N unavailable authority produces no guessed navigation", () => derive({ state: "unavailable", reason: "permission_authority_unreachable" }).state === "unavailable"],
  ["O PLANNED metadata never enters the current permission helper", () => {
    exactPermissionChecks = 0;
    const model = derive(baseAdmin, [fixture("business-development", { id: "fixture-planned", parentId: null, route: "/admin/fixture-planned" })]);
    return linked(model, "fixture-planned") && exactPermissionChecks === 0;
  }]
];

const results = cases.map(([name, test]) => {
  let pass = false;
  try { pass = test(); } catch { pass = false; }
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  return { name, pass };
});
const failures = results.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "admin-navigation-p3-p4-smoke", total: results.length, passed: results.length - failures.length, failed: failures.length, developmentAccessed: false, productionAccessed: false }, null, 2));
if (failures.length) process.exitCode = 1;
