#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");

function executeTypeScript(file, requireModule = () => { throw new Error(`Unexpected import from ${file}`); }) {
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

const gate = executeTypeScript("apps/admin-web/auth/admin-session-gate.ts");
const ia = executeTypeScript("apps/admin-web/auth/admin-route-registry.ts");
const navigation = executeTypeScript(
  "apps/admin-web/components/admin-shell/admin-ia-navigation.ts",
  (request) => {
    if (request === "../../auth/admin-route-registry") return ia;
    throw new Error(`Unexpected navigation import: ${request}`);
  }
);

const decisions = [
  ["unauthenticated redirects", { state: "unauthenticated" }, "redirect_login"],
  ["non-admin is denied", { state: "not_admin" }, "access_denied"],
  ["authority failure is distinct", { state: "unavailable", reason: "authority_unreachable" }, "authority_unavailable"],
  ["admin without context permission is denied", { state: "admin", roleKey: "platform_admin", permissions: ["admin_audit.read"] }, "access_denied"],
  ["admin with context permission is allowed", { state: "admin", roleKey: "platform_admin", permissions: ["admin_context.read"] }, "allow"]
];

const checks = decisions.map(([name, context, expected]) => ({
  name,
  pass: gate.decideAdminSessionGate(context).state === expected
}));
checks.push(
  { name: "login route remains identifiable and exempt", pass: navigation.matchAdminRoute("/admin/login")?.entry.id === "admin-login" },
  { name: "dashboard remains a registered protected page", pass: navigation.matchAdminRoute("/admin")?.entry.id === "dashboard" },
  { name: "contextual dynamic route remains registered", pass: navigation.matchAdminRoute("/admin/restaurants/r1/branches/b1/status")?.entry.id === "restaurant-branch-status" },
  { name: "unknown route remains unknown", pass: navigation.matchAdminRoute("/admin/does-not-exist") === null }
);

for (const [index, item] of checks.entries()) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(index + 1).padStart(2, "0")} ${item.name}`);
}
const failures = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "admin-session-p3-p1-smoke", total: checks.length, passed: checks.length - failures.length, failed: failures.length }, null, 2));
if (failures.length) process.exitCode = 1;
