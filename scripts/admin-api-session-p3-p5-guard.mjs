#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";

const P3_P4_HEAD = "61256ade3bb8e92d57264bc9ef322f6a351825c4";
const P3_P5_HEAD = "2ddc6eadeb344d40cba57958874a808fb79dc19d";
const P3_P5_SUBJECT = "Allow Admin APIs from browser sessions";
const P3_P5_R1_SUBJECT = "Classify missing Admin sessions as unauthenticated";
const P3_P5_R1_HEAD = "e79cca87fe2eea689251d86008b23edb6dc9d5d4";
const P1A_SUBJECT = "Add staff authority identity foundation";
const P1A_MIGRATION = "supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql";
const P1A_PATHS = [
  P1A_MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs", "scripts/staff-authority-p3-p6-p1a-smoke.mjs", "scripts/staff-authority-p3-p6-p1a-mutations.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs", "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const exists = (file) => fs.existsSync(path.join(root, file));
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const checks = [];
const check = (name, pass, detail) => {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 1200)}`);
};

const head = git("rev-parse", "HEAD");
const origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = git("status", "--short");
const untracked = lines(git("ls-files", "--others", "--exclude-standard"));
const changed = [...new Set([...lines(git("diff", "--name-only", P3_P4_HEAD)), ...untracked])].sort();
const candidate = head === P3_P4_HEAD && origin === P3_P4_HEAD && ahead === 0 && behind === 0;
const frozen = head !== P3_P4_HEAD && git("rev-parse", "HEAD^") === P3_P4_HEAD && origin === P3_P4_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P5_SUBJECT && status === "";
const r1Candidate = head === P3_P5_HEAD && origin === P3_P4_HEAD && ahead === 1 && behind === 0;
const r1Frozen = head !== P3_P5_HEAD && git("rev-parse", "HEAD^") === P3_P5_HEAD && origin === P3_P4_HEAD
  && ahead === 2 && behind === 0 && git("log", "-1", "--format=%s") === P3_P5_R1_SUBJECT && status === "";
const p1aCandidate = head === P3_P5_R1_HEAD && origin === P3_P5_R1_HEAD && ahead === 0 && behind === 0;
const p1aFrozen = head !== P3_P5_R1_HEAD && git("rev-parse", "HEAD^") === P3_P5_R1_HEAD && origin === P3_P5_R1_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P1A_SUBJECT && status === "";
const p1aPhase = p1aCandidate || p1aFrozen;
const r1Phase = r1Candidate || r1Frozen || p1aPhase;
check("exact P3-P4/P3-P5 lifecycle through one bounded R1 repair is recognized", candidate || frozen || r1Phase, { head, origin, ahead, behind, status });

const helperPath = "apps/admin-web/auth/admin-api-authorization.ts";
const auditRoutePath = "apps/admin-web/app/api/platform-admin/audit/route.ts";
const branchRoutePath = "apps/admin-web/app/api/platform-admin/restaurant-branches/[branchId]/status/route.ts";
const auditRuntimePath = "apps/admin-web/server/platformAdminAuditRuntime.ts";
const branchRuntimePath = "apps/admin-web/server/platformAdminBranchStatusRuntime.ts";
const helper = read(helperPath);
const auditRoute = read(auditRoutePath);
const branchRoute = read(branchRoutePath);
const auditRuntime = read(auditRuntimePath);
const branchRuntime = read(branchRuntimePath);
const runtime = auditRuntime + branchRuntime;
const applicationChanges = changed.filter((file) => exists(file) && file.startsWith("apps/")).map(read).join("\n");

check("both existing canonical API paths are preserved", auditRoute.includes("export async function GET") && branchRoute.includes("export async function GET") && branchRoute.includes("export async function POST"));
check("accepted bearer read and transport authority remain unchanged", [
  "apps/admin-web/server/platformAdminAuditRead.ts",
  "apps/admin-web/server/platformAdminAuditTransport.ts",
  "apps/admin-web/server/platformAdminBranchStatusAuthority.ts",
  "apps/admin-web/server/platformAdminBranchStatusTransport.ts"
].every((file) => read(file).trimEnd() === git("show", `${P3_P4_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));
check("Authorization presence deterministically selects bearer mode", helper.includes("authorizationHeader !== null") && helper.indexOf("authorizationHeader !== null") < helper.indexOf("resolvePermissionContext()"));
check("malformed explicit bearer cannot fall back to cookie authority", helper.includes('mode: "bearer" as const') && runtime.includes("readVerifiedBearer(authorization.authorization)"));
check("browser mode reuses the Admin SSR server client", helper.includes("createAdminSupabaseServerClient().auth.getSession()"));
const adminContext = read("apps/admin-web/auth/admin-context.ts");
check("verified browser identity still comes from auth.getUser", adminContext.includes("client.auth.getUser()")
  && (r1Phase ? adminContext.includes("isAuthSessionMissingError") : adminContext.trimEnd() === git("show", `${P3_P4_HEAD}:apps/admin-web/auth/admin-context.ts`).replace(/\r\n/g, "\n").trimEnd()));
check("canonical current permission context is reused", helper.includes("getVerifiedAdminPermissionContext") && helper.includes("assertCurrentAdminPermission"));
check("Audit cookie mode requires the exact audit permission", auditRuntime.includes('"admin_audit.read"'));
check("both branch methods require the exact branch permission", (branchRuntime.match(/PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION/g) ?? []).length >= 3);
check("helper permission input is compile-time CurrentAdminPermissionKey", helper.includes("requiredPermission: CurrentAdminPermissionKey"));
check("server-only session token bridge is bounded", helper.startsWith('import "server-only";') && helper.includes("MAX_BEARER_LENGTH") && helper.includes("BEARER_TOKEN.test(token)"));
check("getSession follows independently verified permission authority", helper.includes(".auth.getSession()")
  && helper.indexOf("dependencies.resolvePermissionContext()") < helper.indexOf("dependencies.resolveSessionSnapshot()"));
check("verified and session subjects must agree", helper.includes("session.subject !== context.subject"));
check("session token never enters response or logging APIs", !/Response|console\.|logger|JSON\.stringify|redirect\(/.test(helper));
check("no localStorage or sessionStorage token path exists", !/localStorage|sessionStorage/i.test(applicationChanges));
check("no permission snapshot cookie is introduced", !/permission.*cookie|cookie.*permission/i.test(helper));
check("cookie POST requires an Origin header", helper.includes('headers.get("origin")') && helper.includes("origin === null"));
check("cookie POST uses exact request-origin equality", helper.includes("origin !== expectedOrigin") && helper.includes("new URL(request.url).origin"));
check("cross-site mutation is rejected", helper.includes('fetchSite === null || fetchSite === "same-origin"'));
check("same-site mutation is rejected", helper.includes('fetchSite === null || fetchSite === "same-origin"'));
check("bearer POST bypasses ambient-authority CSRF checks", branchRuntime.includes('authorization.mode === "browser_cookie_session" && !acceptsAdminApiCookieMutationOrigin(request)'));
const previewHandler = branchRuntime.slice(branchRuntime.indexOf("export async function handlePlatformAdminBranchStatusPreviewRequest"), branchRuntime.indexOf("export async function handlePlatformAdminBranchStatusMutationRequest"));
check("GET has no mutation Origin requirement", !previewHandler.includes("acceptsAdminApiCookieMutationOrigin"));
check("existing JSON content-type requirement is retained", branchRuntime.includes('contentType !== "application/json"'));
check("existing body byte limit is retained", branchRuntime.includes("PLATFORM_ADMIN_BRANCH_STATUS_BODY_LIMIT") && branchRuntime.includes("new TextEncoder().encode(text).byteLength"));
check("responses vary on Authorization and Cookie", auditRuntime.includes('Vary: "Authorization, Cookie"') && branchRuntime.includes('Vary: "Authorization, Cookie"'));
check("responses remain private and no-store", (runtime.match(/"Cache-Control": "private, no-store"/g) ?? []).length === 2);
check("nosniff remains on both API response paths", (runtime.match(/"X-Content-Type-Options": "nosniff"/g) ?? []).length === 2);
check("no CORS relaxation was added", !/Access-Control-Allow-Origin|cors/i.test(applicationChanges));
check("no service_role runtime was added", !/TASTKIND_SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(applicationChanges));
check("database migrations are unchanged except the exact P1A successor", changed.filter((file) => file.startsWith("supabase/migrations/")).every((file) => p1aPhase && file === P1A_MIGRATION), changed.filter((file) => file.startsWith("supabase/migrations/")));
check("current permission vocabulary is byte-identical", read("apps/admin-web/auth/admin-current-permission-vocabulary.ts").trimEnd() === git("show", `${P3_P4_HEAD}:apps/admin-web/auth/admin-current-permission-vocabulary.ts`).replace(/\r\n/g, "\n").trimEnd());
check("no Admin UI feature expansion exists", changed.every((file) => !file.startsWith("apps/admin-web/app/admin/") && !file.startsWith("apps/admin-web/components/")), changed);
check("P3-P3 route authorization is untouched", read("apps/admin-web/auth/admin-route-authorization.ts").trimEnd() === git("show", `${P3_P4_HEAD}:apps/admin-web/auth/admin-route-authorization.ts`).replace(/\r\n/g, "\n").trimEnd());
check("P3-P4 navigation visibility is untouched", read("apps/admin-web/auth/admin-navigation-visibility.ts").trimEnd() === git("show", `${P3_P4_HEAD}:apps/admin-web/auth/admin-navigation-visibility.ts`).replace(/\r\n/g, "\n").trimEnd());
check("existing public response vocabularies are reused", !/csrf_failure|origin_failure|cookie_failure/.test(runtime));
check("cookie mutation refusal uses existing permission_denied state", branchRuntime.includes('return json({ state: "permission_denied" })'));
check("route files remain thin and method-bounded", auditRoute.split(/\r?\n/).length < 20 && branchRoute.split(/\r?\n/).length < 25 && !/PUT|PATCH|DELETE/.test(auditRoute + branchRoute));
check("no cross-request API authorization cache was added", !/new Map|setInterval|setTimeout|ttl|cache\(/i.test(helper));
check("Admin cookie namespace and options are untouched", ["apps/admin-web/auth/admin-auth-cookie.ts", "apps/admin-web/auth/supabase-server.ts"].every((file) => read(file).trimEnd() === git("show", `${P3_P4_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));

const predecessorGuards = ["admin-ia-p1", "admin-ia-p2", "admin-ia-p2-r1", "admin-ia-p2-r2", "admin-session-p3-p1", "admin-current-permissions-p3-p2", "admin-route-authorization-p3-p3", "admin-navigation-p3-p4"];
check("predecessor guards contain exact P3-P5 successor awareness", predecessorGuards.every((name) => read(`scripts/${name}-guard.mjs`).includes(P3_P5_SUBJECT)));
const allowed = (file) => file === helperPath
  || file === "apps/admin-web/auth/admin-context.ts"
  || file === auditRuntimePath
  || file === branchRuntimePath
  || file === "package.json"
  || file === "scripts/admin-api-session-p3-p5-guard.mjs"
  || file === "scripts/admin-api-session-p3-p5-smoke.mjs"
  || file === "scripts/admin-api-session-p3-p5-r1-guard.mjs"
  || file === "scripts/admin-api-session-p3-p5-r1-smoke.mjs"
  || (p1aPhase && P1A_PATHS.includes(file))
  || predecessorGuards.map((name) => `scripts/${name}-guard.mjs`).includes(file);
check("diff remains inside the exact P3-P5 boundary", changed.every(allowed), changed.filter((file) => !allowed(file)));
check("no dependency or lockfile change exists", !changed.some((file) => /lock/i.test(file)) && JSON.stringify(JSON.parse(read("package.json")).dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${P3_P4_HEAD}:package.json`)).dependencies ?? {}));
const pkg = JSON.parse(read("package.json"));
check("P3-P5 guard and smoke scripts are registered", pkg.scripts["test:admin-api-session-p3-p5"] === "node scripts/admin-api-session-p3-p5-guard.mjs" && pkg.scripts["test:admin-api-session-p3-p5-smoke"] === "node scripts/admin-api-session-p3-p5-smoke.mjs");

const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: "admin-api-session-p3-p5-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local" : r1Candidate ? "p3_p5_r1_candidate" : r1Frozen ? "p3_p5_r1_frozen_local" : p1aCandidate ? "p1a_candidate" : p1aFrozen ? "p1a_frozen_local" : "invalid",
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
