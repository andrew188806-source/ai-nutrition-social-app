#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import ts from "typescript";

const P3_P1_HEAD = "a75412a3da1cdf52c37732864975ad926da067f6";
const P3_P2_SUBJECT = "Resolve current Admin permissions";
const P3_P2_HEAD = "ab59cdc13317ee70482ae168923ac45f9b016906";
const P3_P3_SUBJECT = "Enforce current Admin route permissions";
const CURRENT_KEYS = ["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"];
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const exists = (file) => fs.existsSync(path.join(root, file));
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024
}).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const checks = [];
const check = (name, pass, detail) => {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 1200)}`);
};
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

const head = git("rev-parse", "HEAD");
const origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = git("status", "--short");
const untracked = lines(git("ls-files", "--others", "--exclude-standard"));
const changed = [...new Set([...lines(git("diff", "--name-only", P3_P1_HEAD)), ...untracked])].sort();
const candidate = head === P3_P1_HEAD && origin === P3_P1_HEAD && ahead === 0 && behind === 0;
const frozen = head !== P3_P1_HEAD && git("rev-parse", "HEAD^") === P3_P1_HEAD && origin === P3_P1_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P2_SUBJECT && status === "";
const pushed = head === P3_P2_HEAD && origin === P3_P2_HEAD && ahead === 0 && behind === 0;
const p3P3Frozen = head !== P3_P2_HEAD && git("rev-parse", "HEAD^") === P3_P2_HEAD && origin === P3_P2_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P3_SUBJECT && status === "";
const p3P3Phase = pushed || p3P3Frozen;
check("P3-P1/P3-P2 lifecycle or one exact local P3-P3 freeze is recognized", candidate || frozen || p3P3Phase, { head, origin, ahead, behind, status });

const vocabulary = executeTypeScript("apps/admin-web/auth/admin-current-permission-vocabulary.ts");
const ia = executeTypeScript("apps/admin-web/auth/admin-route-registry.ts", (request) => {
  if (request === "./admin-current-permission-vocabulary") return vocabulary;
  throw new Error(`Unexpected registry import: ${request}`);
});
const current = ia.ADMIN_PERMISSION_REGISTRY.filter((item) => item.status === "CURRENT").map((item) => item.key).sort();
const planned = ia.ADMIN_PERMISSION_REGISTRY.filter((item) => item.status === "PLANNED").map((item) => item.key);
check("canonical current permission vocabulary contains exactly three keys", JSON.stringify(vocabulary.CURRENT_ADMIN_PERMISSION_KEYS) === JSON.stringify(CURRENT_KEYS), vocabulary.CURRENT_ADMIN_PERMISSION_KEYS);
check("admin_context.read remains CURRENT", current.includes("admin_context.read"));
check("admin_audit.read remains CURRENT", current.includes("admin_audit.read"));
check("branch status write remains CURRENT", current.includes("admin_restaurant_branch.status.write"));
check("no fourth permission is CURRENT", current.length === 3, current);
check("route registry consumes the shared vocabulary", read("apps/admin-web/auth/admin-route-registry.ts").includes('from "./admin-current-permission-vocabulary"'));
check("route registry CURRENT metadata equals the canonical vocabulary", JSON.stringify(current) === JSON.stringify(CURRENT_KEYS), current);
check("all future permissions remain PLANNED", planned.length > 0 && planned.every((key) => !CURRENT_KEYS.includes(key)));

const historicalAuthority = read("apps/admin-web/server/platformAdminAuthority.ts");
const permissionContext = read("apps/admin-web/auth/admin-current-permission-context.ts");
const serverContext = read("apps/admin-web/auth/admin-context.ts");
const migration = read("supabase/migrations/20260904010000_platform_admin_authority.sql");
const changedApplicationSources = changed.filter((file) => exists(file) && !file.startsWith("scripts/")).map(read).join("\n");
check("historical RA-1A authority contract is byte-identical to P3-P1", historicalAuthority.trimEnd() === git("show", `${P3_P1_HEAD}:apps/admin-web/server/platformAdminAuthority.ts`).replace(/\r\n/g, "\n").trimEnd());
check("historical RA-1A vocabulary remains the two context-RPC reads", /PLATFORM_ADMIN_PERMISSION_KEYS = Object\.freeze\(\[\s*"admin_context\.read",\s*"admin_audit\.read"\s*\]/s.test(historicalAuthority));
check("existing context RPC constant is reused", serverContext.includes("PLATFORM_ADMIN_CONTEXT_FUNCTION") && serverContext.includes("client.rpc(PLATFORM_ADMIN_CONTEXT_FUNCTION)"));
check("existing exact permission predicate constant is reused", serverContext.includes("PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION") && serverContext.includes("client.rpc(PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION"));
check("canonical migration proves the exact predicate signature", /create function public\.platform_admin_has_permission_v1\(\s*requested_permission_key text\s*\)/s.test(migration));
check("predicate uses the exact named Supabase argument", /requested_permission_key:\s*PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION/.test(serverContext));
check("branch predicate resolves only the current branch-status key", serverContext.includes("PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION") && !/requested_permission_key:\s*["']admin\./.test(serverContext));
check("permission resolution uses the P3-P1 cookie-bound client", serverContext.includes("createAdminSupabaseServerClient(config)") && serverContext.includes("client.rpc(PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION"));
check("verified identity still comes from auth.getUser", serverContext.includes("client.auth.getUser()"));
check("verified subject must be a UUID", /UUID\.test\(subject\)/.test(serverContext) && /UUID\.test\(composition\.subject\)/.test(permissionContext));
check("no userId input is accepted as authority", !/\buserId\s*[:=]/.test(permissionContext + serverContext));
check("email is not accepted as authority", !/\.email\b|\bemail\s*[:=]/.test(permissionContext + serverContext));
check("browser role or permission input is not accepted", !/searchParams|FormData|cookies\(\).*role|cookies\(\).*permission/i.test(permissionContext + serverContext));
check("no service_role authority is used", !/TASTKIND_SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(changedApplicationSources));
check("no direct admin_internal table access exists", !/\.from\(\s*["']admin_internal|admin_internal\./i.test(permissionContext + serverContext));
check("no database migration changed", changed.every((file) => !file.startsWith("supabase/migrations/")), changed);
check("membership RPC failures remain unavailable", serverContext.includes('reason: "authority_unreachable"') && serverContext.includes('reason: "authority_rejected"'));
check("predicate transport failure is unavailable", serverContext.includes('reason: "permission_authority_unreachable"'));
check("predicate malformed/error response is unavailable", serverContext.includes('reason: "permission_authority_rejected"') && serverContext.includes('typeof result.data !== "boolean"'));
check("successful false predicate remains an ordinary denial", permissionContext.includes("if (predicate.granted) recognized.add(BRANCH_STATUS_PERMISSION)"));
check("permission output order is deterministic", permissionContext.includes("Object.freeze([...recognized].sort())"));
check("duplicate permissions are removed with a Set", permissionContext.includes("new Set<CurrentAdminPermissionKey>()"));
check("unknown current permission fails closed", permissionContext.includes('reason: "unrecognized_current_permission"'));
check("admin_context.read remains the base console gate", read("apps/admin-web/auth/admin-session-gate.ts").includes('context.permissions.includes("admin_context.read")') && permissionContext.includes('reason: "missing_base_permission"'));
check("P3-P1 session gate is byte-identical", read("apps/admin-web/auth/admin-session-gate.ts").trimEnd() === git("show", `${P3_P1_HEAD}:apps/admin-web/auth/admin-session-gate.ts`).replace(/\r\n/g, "\n").trimEnd());
check("login still resolves only the historical base context", read("apps/admin-web/app/admin/login/actions.ts").includes("resolveVerifiedAdminContext") && !read("apps/admin-web/app/admin/login/actions.ts").includes("PermissionContext"));
check("P3-P2 introduced no route enforcement and its exact P3-P3 successor owns the central enforcement seam", p3P3Phase
  ? read("apps/admin-web/components/admin-shell/AdminRegistryPage.tsx").includes("resolveAdminRouteAuthorization")
  : !changed.some((file) => file.startsWith("apps/admin-web/app/admin/") && file !== "apps/admin-web/auth/admin-route-registry.ts"));
check("Sidebar permission filtering is not introduced", read("apps/admin-web/components/admin-shell/AdminSidebar.tsx").includes("buildAdminScaffoldNavigation()") && !changed.includes("apps/admin-web/components/admin-shell/AdminSidebar.tsx"));
check("no future staff bundle implementation exists", !/roleBundle|permissionBundle|staff_bundle/i.test(permissionContext + serverContext));
check("PLANNED keys cannot enter the current snapshot", permissionContext.includes("isCurrentAdminPermissionKey(permission)") && !planned.some((key) => permissionContext.includes(`"${key}"`)));

const apiPaths = [
  "apps/admin-web/app/api/platform-admin/audit/route.ts",
  "apps/admin-web/app/api/platform-admin/restaurant-branches/[branchId]/status/route.ts",
  "apps/admin-web/server/platformAdminAuditRuntime.ts",
  "apps/admin-web/server/platformAdminAuditRead.ts",
  "apps/admin-web/server/platformAdminAuditTransport.ts",
  "apps/admin-web/server/platformAdminBranchStatusRuntime.ts",
  "apps/admin-web/server/platformAdminBranchStatusTransport.ts",
  "apps/admin-web/server/platformAdminBranchStatusAuthority.ts"
];
check("existing Admin APIs are byte-identical and bearer-only", apiPaths.every((file) => read(file).trimEnd() === git("show", `${P3_P1_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()) && /readVerifiedBearer|authorization/i.test(apiPaths.map(read).join("\n")));
const frozenSessionPaths = [
  "apps/admin-web/auth/admin-session-gate.ts",
  "apps/admin-web/auth/supabase-server.ts",
  "apps/admin-web/middleware.ts",
  "apps/admin-web/app/admin/login/page.tsx",
  "apps/admin-web/app/admin/login/actions.ts"
];
check("P3-P1 cookie login logout and middleware sources are preserved", frozenSessionPaths.every((file) => read(file).trimEnd() === git("show", `${P3_P1_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));
check("no cross-request permission cache is introduced", !/new Map|setInterval|setTimeout|localStorage|sessionStorage|permission.*ttl|jwt.*permission/i.test(permissionContext + serverContext));
check("request-local React cache is used", serverContext.includes('import { cache } from "react"') && serverContext.includes("getVerifiedAdminAuthorityRequest = cache"));
check("pure permission helper performs exact includes matching", /context\.permissions\.includes\(permissionKey\)/.test(permissionContext));
check("no wildcard permission logic exists", !/startsWith\(|endsWith\(|includes\(["']\*|permissionKey\s*===\s*["']\*/.test(permissionContext));
check("no namespace-prefix implication exists", !/split\(|substring\(|slice\(/.test(permissionContext));
check("P3-P1 fail-closed config behavior is retained", serverContext.includes('config.state !== "ready"') && serverContext.includes('reason: "authority_unreachable"'));

const allowed = (file) =>
  file === "package.json"
  || file === "apps/admin-web/auth/admin-context.ts"
  || file === "apps/admin-web/auth/admin-current-permission-context.ts"
  || file === "apps/admin-web/auth/admin-current-permission-vocabulary.ts"
  || file === "apps/admin-web/auth/admin-route-registry.ts"
  || file === "scripts/admin-current-permissions-p3-p2-guard.mjs"
  || file === "scripts/admin-current-permissions-p3-p2-smoke.mjs"
  || file === "apps/admin-web/auth/admin-route-authorization.ts"
  || file === "apps/admin-web/components/admin-shell/AdminAccessState.tsx"
  || file === "apps/admin-web/components/admin-shell/AdminRegistryPage.tsx"
  || file === "scripts/admin-route-authorization-p3-p3-guard.mjs"
  || file === "scripts/admin-route-authorization-p3-p3-smoke.mjs"
  || ["scripts/admin-ia-p1-guard.mjs", "scripts/admin-ia-p2-guard.mjs", "scripts/admin-ia-p2-r1-guard.mjs", "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-session-p3-p1-smoke.mjs"].includes(file);
check("diff remains inside the exact P3-P2 boundary", changed.every(allowed), changed.filter((file) => !allowed(file)));
check("no dependency or lockfile change exists", !changed.some((file) => /lock/i.test(file)) && JSON.stringify(JSON.parse(read("package.json")).dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${P3_P1_HEAD}:package.json`)).dependencies ?? {}));
check("P3-P2 package scripts are registered", JSON.parse(read("package.json")).scripts["test:admin-current-permissions-p3-p2"] === "node scripts/admin-current-permissions-p3-p2-guard.mjs" && JSON.parse(read("package.json")).scripts["test:admin-current-permissions-p3-p2-smoke"] === "node scripts/admin-current-permissions-p3-p2-smoke.mjs");

const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: "admin-current-permissions-p3-p2-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local" : pushed ? "pushed" : p3P3Frozen ? "p3_p3_frozen_local" : "invalid",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures,
  changedPathCount: changed.length,
  changedPaths: changed,
  developmentAccessed: false,
  productionAccessed: false,
  pushed: false
}, null, 2));
if (failures.length) process.exitCode = 1;
