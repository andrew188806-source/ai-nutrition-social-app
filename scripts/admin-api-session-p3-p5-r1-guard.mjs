#!/usr/bin/env node
import child from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const P3_P4_HEAD = "61256ade3bb8e92d57264bc9ef322f6a351825c4";
const P3_P5_HEAD = "2ddc6eadeb344d40cba57958874a808fb79dc19d";
const R1_SUBJECT = "Classify missing Admin sessions as unauthenticated";
const P3_P5_R1_HEAD = "e79cca87fe2eea689251d86008b23edb6dc9d5d4";
const P1A_SUBJECT = "Add staff authority identity foundation";
const P1A_MIGRATION = "supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql";
const P1A_PATHS = [
  P1A_MIGRATION,
  "package.json",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/staff-authority-p3-p6-p1a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p1a-mutations.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs",
  "scripts/admin-session-p3-p1-guard.mjs",
  "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs",
  "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs",
  "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const P1A_HEAD = "0d60c787c1919aaf44d7714a1fd03b419469ba15";
const P1B_SUBJECT = "Add staff bundle entitlement foundation";
const P1B_MIGRATION = "supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql";
const P1B_PATHS = [
  P1B_MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1b-smoke.mjs", "scripts/staff-authority-p3-p6-p1b-mutations.mjs",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs", "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs",
  "scripts/admin-current-permissions-p3-p2-guard.mjs", "scripts/admin-route-authorization-p3-p3-guard.mjs",
  "scripts/admin-navigation-p3-p4-guard.mjs", "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const P1B_HEAD = "2cb5f50944a8bff261d9f5d8dc7457ad9f6247a7";
const P1C_HEAD = "78dcdaba1cebbbe3ec99a5d56b5361ba1a16a31a";
const P1C_SUBJECT = "Add sealed staff authority materializer";
const P1C_MIGRATION = "supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql";
const P1C_PATHS = [
  P1C_MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p1c-guard.mjs", "scripts/staff-authority-p3-p6-p1c-smoke.mjs", "scripts/staff-authority-p3-p6-p1c-mutations.mjs",
  "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs", "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const P2A_SUBJECT = "Add staff effective permission resolver";
const P2A_MIGRATION = "supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql";
const P2A_PATHS = [
  P2A_MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p2a-guard.mjs", "scripts/staff-authority-p3-p6-p2a-smoke.mjs", "scripts/staff-authority-p3-p6-p2a-mutations.mjs",
  "scripts/staff-authority-p3-p6-p1c-guard.mjs", "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs", "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const P2A_HEAD = "8c8ab93fc091f76f8b0af535c910d8a5227d48cb";
const P2B_SUBJECT = "Add Platform Admin staff compatibility bridge";
const P2B_MIGRATION = "supabase/migrations/20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql";
const P2B_PATHS = [
  P2B_MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p2b-guard.mjs", "scripts/staff-authority-p3-p6-p2b-smoke.mjs", "scripts/staff-authority-p3-p6-p2b-mutations.mjs",
  "scripts/staff-authority-p3-p6-p2a-guard.mjs", "scripts/staff-authority-p3-p6-p1c-guard.mjs", "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs", "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs", "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
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
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 1400)}`);
};

const head = git("rev-parse", "HEAD");
const origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = git("status", "--short");
const untracked = lines(git("ls-files", "--others", "--exclude-standard"));
const changed = [...new Set([...lines(git("diff", "--name-only", P3_P5_HEAD)), ...untracked])].sort();
const candidate = head === P3_P5_HEAD && origin === P3_P4_HEAD && ahead === 1 && behind === 0;
const frozen = head !== P3_P5_HEAD && git("rev-parse", "HEAD^") === P3_P5_HEAD && origin === P3_P4_HEAD
  && ahead === 2 && behind === 0 && git("log", "-1", "--format=%s") === R1_SUBJECT && status === "";
const p1aCandidate = head === P3_P5_R1_HEAD && origin === P3_P5_R1_HEAD && ahead === 0 && behind === 0;
const p1aFrozen = head !== P3_P5_R1_HEAD && git("rev-parse", "HEAD^") === P3_P5_R1_HEAD && origin === P3_P5_R1_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P1A_SUBJECT && status === "";
const p1aPushed = head === P1A_HEAD && origin === P1A_HEAD && ahead === 0 && behind === 0;
const p1bCandidate = p1aPushed;
const p1bFrozen = head !== P1A_HEAD && git("rev-parse", "HEAD^") === P1A_HEAD && origin === P1A_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P1B_SUBJECT && status === "";
const p1bPushed = head === P1B_HEAD && origin === P1B_HEAD && ahead === 0 && behind === 0;
const p1cCandidate = p1bPushed;
const p1cFrozen = head !== P1B_HEAD && git("rev-parse", "HEAD^") === P1B_HEAD && origin === P1B_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P1C_SUBJECT && status === "";
const p1cPushed = head === P1C_HEAD && origin === P1C_HEAD && ahead === 0 && behind === 0;
const p2aCandidate = p1cPushed;
const p2aFrozen = head !== P1C_HEAD && git("rev-parse", "HEAD^") === P1C_HEAD && origin === P1C_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P2A_SUBJECT && status === "";
const p2bCandidate = head === P2A_HEAD && origin === P2A_HEAD && ahead === 0 && behind === 0;
const p2bFrozen = head !== P2A_HEAD && git("rev-parse", "HEAD^") === P2A_HEAD && origin === P2A_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P2B_SUBJECT && status === "";
const p2bPhase = p2bCandidate || p2bFrozen;
const p2aPhase = p2aCandidate || p2aFrozen || p2bPhase;
const p1cPhase = p1cCandidate || p1cFrozen || p1cPushed || p2aPhase;
const p1bPhase = p1bCandidate || p1bFrozen || p1cPhase;
const p1aPhase = p1aCandidate || p1aFrozen || p1bPhase;
check("exact P3-P5/R1 lifecycle through the exact P1A successor is recognized", candidate || frozen || p1aPhase, { head, origin, ahead, behind, status });

const contextPath = "apps/admin-web/auth/admin-context.ts";
const context = read(contextPath);
const predecessorContext = git("show", `${P3_P5_HEAD}:${contextPath}`).replace(/\r\n/g, "\n");
const expectedContext = predecessorContext
  .replace('import type { SupabaseClient } from "@supabase/supabase-js";', 'import {\n  isAuthSessionMissingError,\n  type SupabaseClient\n} from "@supabase/supabase-js";')
  .replace('type VerifiedAdminAuthorityResolution = Readonly<{\n  subject: string | null;\n  context: PlatformAdminContext;\n}>;\n', 'type VerifiedAdminAuthorityResolution = Readonly<{\n  subject: string | null;\n  context: PlatformAdminContext;\n}>;\n\n/** Distinguishes an expected absent session from an Auth authority failure. */\nexport function isMissingAdminAuthSessionError(error: unknown): boolean {\n  return isAuthSessionMissingError(error);\n}\n')
  .replace('    if (userResult.error && userResult.error.status !== 401 && userResult.error.status !== 403) {', '    if (\n      userResult.error\n      && !isMissingAdminAuthSessionError(userResult.error)\n      && userResult.error.status !== 401\n      && userResult.error.status !== 403\n    ) {');
check("repair is confined to the exact missing-session classification edit", context.trimEnd() === expectedContext.trimEnd());
check("no broad all-status-400 unauthenticated rule exists", !/status\s*!==\s*400|status\s*===\s*400|\[400[^\]]*\]/.test(context));
check("public Supabase missing-session predicate is imported", /import\s*{[\s\S]*isAuthSessionMissingError[\s\S]*}\s*from\s*"@supabase\/supabase-js"/.test(context));
check("no private dependency source path is imported", !/node_modules|@supabase\/auth-js\/(?:src|dist)|@supabase\/supabase-js\/(?:src|dist)/.test(context));

let publicSurface = null;
try {
  publicSurface = createRequire(path.join(root, "apps/admin-web/package.json"))("@supabase/supabase-js");
} catch {}
const canonicalMissing = publicSurface?.AuthSessionMissingError ? new publicSurface.AuthSessionMissingError() : null;
check("installed public package exports the canonical class and predicate", typeof publicSurface?.AuthSessionMissingError === "function" && typeof publicSurface?.isAuthSessionMissingError === "function");
check("public predicate recognizes the installed status-400 missing-session error", canonicalMissing?.status === 400 && publicSurface.isAuthSessionMissingError(canonicalMissing));
check("classification does not swallow all Auth errors", context.includes("userResult.error") && context.includes("authority_unreachable") && context.includes("status !== 401") && context.includes("status !== 403"));
check("recognized missing session reaches unauthenticated resolution", context.includes("!isMissingAdminAuthSessionError(userResult.error)") && context.includes("resolvePlatformAdminContext({ ok: true, rows: [] }, false)"));
check("thrown getUser failures remain unavailable", /try\s*{[\s\S]*client\.auth\.getUser\(\)[\s\S]*}\s*catch\s*{[\s\S]*authority_unreachable/.test(context));

const permissionContextPath = "apps/admin-web/auth/admin-current-permission-context.ts";
check("current permission composition remains byte-identical", read(permissionContextPath).trimEnd() === git("show", `${P3_P5_HEAD}:${permissionContextPath}`).replace(/\r\n/g, "\n").trimEnd());
check("current permission context preserves unauthenticated", read(permissionContextPath).includes('membershipContext.state === "unauthenticated"') && read(permissionContextPath).includes('state: "unauthenticated" as const'));

const auditRuntimePath = "apps/admin-web/server/platformAdminAuditRuntime.ts";
const branchRuntimePath = "apps/admin-web/server/platformAdminBranchStatusRuntime.ts";
const helperPath = "apps/admin-web/auth/admin-api-authorization.ts";
const auditRuntime = read(auditRuntimePath);
const branchRuntime = read(branchRuntimePath);
const helper = read(helperPath);
check("Audit no-session refusal still maps unauthenticated to 401", auditRuntime.includes("unauthenticated: 401") && auditRuntime.includes('{ state: authorization.state }'));
check("Branch no-session refusal still maps unauthenticated to 401", branchRuntime.includes('result.state === "unauthenticated"') && branchRuntime.includes('unauthenticated: 401'));
check("explicit Authorization precedence is byte-identical", helper.trimEnd() === git("show", `${P3_P5_HEAD}:${helperPath}`).replace(/\r\n/g, "\n").trimEnd() && helper.includes("authorizationHeader !== null"));
check("malformed bearer cookie fallback remains forbidden", helper.indexOf("authorizationHeader !== null") < helper.indexOf("resolvePermissionContext()"));

const bearerFiles = [
  "apps/admin-web/server/platformAdminAuditRead.ts",
  "apps/admin-web/server/platformAdminAuditTransport.ts",
  "apps/admin-web/server/platformAdminBranchStatusAuthority.ts",
  "apps/admin-web/server/platformAdminBranchStatusTransport.ts"
];
check("bearer transport and authority files are byte-identical", bearerFiles.every((file) => read(file).trimEnd() === git("show", `${P3_P5_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));
check("P3-P5 API runtimes are byte-identical", [auditRuntimePath, branchRuntimePath].every((file) => read(file).trimEnd() === git("show", `${P3_P5_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));
check("cookie mutation CSRF and Origin policy are unchanged", branchRuntime.includes('authorization.mode === "browser_cookie_session" && !acceptsAdminApiCookieMutationOrigin(request)') && helper.includes('fetchSite === null || fetchSite === "same-origin"'));
check("response cache security headers are unchanged", auditRuntime.includes('Vary: "Authorization, Cookie"') && branchRuntime.includes('Vary: "Authorization, Cookie"') && (auditRuntime + branchRuntime).includes('"Cache-Control": "private, no-store"') && (auditRuntime + branchRuntime).includes('"X-Content-Type-Options": "nosniff"'));

const changedApplication = changed.filter((file) => file.startsWith("apps/")).filter(exists).map(read).join("\n");
check("no service-role authority is introduced", !/TASTKIND_SUPABASE_SERVICE_ROLE_KEY|service_role/i.test(changedApplication));
check("database migrations are unchanged except the exact P1A successor", changed.filter((file) => file.startsWith("supabase/")).every((file) => p1aPhase && (file === P1A_MIGRATION || (p1bPhase && file === P1B_MIGRATION) || (p1cPhase && file === P1C_MIGRATION) || (p2aPhase && file === P2A_MIGRATION) || (p2bPhase && file === P2B_MIGRATION))), changed.filter((file) => file.startsWith("supabase/")));
check("current permission vocabulary is byte-identical", read("apps/admin-web/auth/admin-current-permission-vocabulary.ts").trimEnd() === git("show", `${P3_P5_HEAD}:apps/admin-web/auth/admin-current-permission-vocabulary.ts`).replace(/\r\n/g, "\n").trimEnd());
check("Admin UI route navigation and session gate files are unchanged", [
  "apps/admin-web/auth/admin-route-authorization.ts",
  "apps/admin-web/auth/admin-navigation-visibility.ts",
  "apps/admin-web/auth/admin-session-gate.ts"
].every((file) => read(file).trimEnd() === git("show", `${P3_P5_HEAD}:${file}`).replace(/\r\n/g, "\n").trimEnd()));
check("P3-P5 API composition is otherwise byte-identical", changed.filter((file) => file.startsWith("apps/")).every((file) => file === contextPath), changed.filter((file) => file.startsWith("apps/")));

const predecessorGuards = [
  "admin-ia-p1", "admin-ia-p2", "admin-ia-p2-r1", "admin-ia-p2-r2", "admin-session-p3-p1",
  "admin-current-permissions-p3-p2", "admin-route-authorization-p3-p3", "admin-navigation-p3-p4", "admin-api-session-p3-p5"
];
check("P3-P1 through P3-P5 guards have exact R1 successor awareness", predecessorGuards.every((name) => read(`scripts/${name}-guard.mjs`).includes(R1_SUBJECT)));

const allowed = [...new Set([
  contextPath,
  "package.json",
  "scripts/admin-api-session-p3-p5-r1-guard.mjs",
  "scripts/admin-api-session-p3-p5-r1-smoke.mjs",
  ...predecessorGuards.map((name) => `scripts/${name}-guard.mjs`),
  ...(p1aPhase ? P1A_PATHS : []),
  ...(p1bPhase ? P1B_PATHS : []),
  ...(p1cPhase ? P1C_PATHS : []),
  ...(p2aPhase ? P2A_PATHS : []),
  ...(p2bPhase ? P2B_PATHS : [])
])].sort();
check("diff contains exactly the bounded R1/P1A successor paths", JSON.stringify(changed) === JSON.stringify(allowed), { changed, allowed });
check("no dependency or lockfile change exists", !changed.some((file) => /lock/i.test(file))
  && JSON.stringify(JSON.parse(read("package.json")).dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${P3_P5_HEAD}:package.json`)).dependencies ?? {}));
const pkg = JSON.parse(read("package.json"));
check("R1 guard and smoke scripts are registered", pkg.scripts["test:admin-api-session-p3-p5-r1"] === "node scripts/admin-api-session-p3-p5-r1-guard.mjs"
  && pkg.scripts["test:admin-api-session-p3-p5-r1-smoke"] === "node scripts/admin-api-session-p3-p5-r1-smoke.mjs");
check("changed sources contain no secret value pattern", ![/sb_secret_[A-Za-z0-9_-]+/, /github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/].some((pattern) => pattern.test(changed.filter(exists).map(read).join("\n"))));

const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: "admin-api-session-p3-p5-r1-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local" : p1aCandidate ? "p1a_candidate" : p1aFrozen ? "p1a_frozen_local" : p1bCandidate ? "p1b_candidate" : p1bFrozen ? "p1b_frozen_local" : p1cCandidate ? "p1c_candidate" : p1cFrozen ? "p1c_frozen_local" : p2aCandidate ? "p2a_candidate" : p2aFrozen ? "p2a_frozen_local" : p2bCandidate ? "p2b_candidate" : p2bFrozen ? "p2b_frozen_local" : p1cPushed ? "p1c_pushed" : "invalid",
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
