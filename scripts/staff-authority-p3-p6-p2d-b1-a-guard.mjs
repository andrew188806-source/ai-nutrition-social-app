#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";

const ROOT = process.cwd();
const PREDECESSOR = "fc241a0bd2c4f0865fb9e60b488320cf99ea7716";
const SUBJECT = "Generalize canonical Admin authority context";
const CORE = [
  "apps/admin-web/auth/admin-current-permission-context.ts",
  "apps/admin-web/auth/admin-context.ts",
  "package.json",
  "scripts/staff-authority-p3-p6-p2d-b1-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b1-a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2d-b1-a-mutations.mjs"
];
const FIXTURES = [
  "scripts/admin-api-session-p3-p5-smoke.mjs",
  "scripts/admin-current-permissions-p3-p2-smoke.mjs",
  "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-navigation-p3-p4-smoke.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-smoke.mjs",
  "scripts/admin-session-p3-p1-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2c-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-mutations.mjs"
];
const SUCCESSOR_GUARDS = [
  "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/staff-authority-p3-p6-p1b-guard.mjs",
  "scripts/staff-authority-p3-p6-p1c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2b-guard.mjs",
  "scripts/staff-authority-p3-p6-p2c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-b-guard.mjs",
  "scripts/admin-session-p3-p1-guard.mjs",
  "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs",
  "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const B1B_PATHS = [
  "apps/admin-web/auth/admin-authority-selector.ts", "apps/admin-web/auth/admin-context.ts",
  "apps/admin-web/auth/admin-protected-read-authority.ts", "apps/admin-web/auth/admin-protected-mutation-authority.ts", "package.json",
  "scripts/staff-authority-p3-p6-p2d-b1-b-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b1-b-smoke.mjs", "scripts/staff-authority-p3-p6-p2d-b1-b-mutations.mjs",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs", "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2a-guard.mjs", "scripts/staff-authority-p3-p6-p2b-guard.mjs", "scripts/staff-authority-p3-p6-p2c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b0-a-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b0-b-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b1-a-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b1-a-smoke.mjs", "scripts/staff-authority-p3-p6-p2d-b1-a-mutations.mjs",
  "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs", "scripts/admin-route-authorization-p3-p3-guard.mjs",
  "scripts/admin-navigation-p3-p4-guard.mjs", "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const ALLOWED = new Set([...CORE, ...FIXTURES, ...SUCCESSOR_GUARDS, ...B1B_PATHS]);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: ROOT, encoding: "utf8", maxBuffer: 64e6 }).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const unchanged = (file) => read(file).trimEnd() === git("show", `${PREDECESSOR}:${file}`).replace(/\r\n/g, "\n").trimEnd();
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const head = git("rev-parse", "HEAD"), origin = git("rev-parse", "origin/main");
const [ahead, behind] = git("rev-list", "--left-right", "--count", "HEAD...origin/main").split(/\s+/).map(Number);
const status = lines(git("status", "--porcelain=v1", "--untracked-files=all"));
const changed = [...new Set([...lines(git("diff", "--name-only", PREDECESSOR)), ...lines(git("ls-files", "--others", "--exclude-standard"))])].sort();
const candidate = head === PREDECESSOR && origin === PREDECESSOR && ahead === 0 && behind === 0;
const frozen = head !== PREDECESSOR && git("rev-parse", "HEAD^") === PREDECESSOR && origin === PREDECESSOR && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === SUBJECT;
const B1A_FREEZE_HEAD = "8012fa1b11ec1824d512f8980276ef4114828a70";
const b1aPushed = head === B1A_FREEZE_HEAD && origin === B1A_FREEZE_HEAD && ahead === 0 && behind === 0;
const b1bFrozen = head !== B1A_FREEZE_HEAD && git("rev-parse", "HEAD^") === B1A_FREEZE_HEAD && origin === B1A_FREEZE_HEAD && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === "Enable staff-native Admin admission";
const b1bPhase = b1aPushed || b1bFrozen;
const current = read(CORE[0]), context = read(CORE[1]);
const selector = read("apps/admin-web/auth/admin-authority-selector.ts");
const legacy = read("apps/admin-web/server/platformAdminAuthority.ts");
const hybrid = context.slice(context.indexOf('if (mode.mode === "staff_permissions_legacy_admission")'), context.indexOf("let branchStatusPermission"));
const checks = [], failures = [];
function check(name, pass, detail) { const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) }; checks.push(item); if (!item.pass) failures.push(item); console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); if (!item.pass && detail !== undefined) console.log(`     ${JSON.stringify(detail).slice(0, 900)}`); }

check("exact predecessor and local lifecycle", candidate || frozen || b1bPhase, { head, origin, ahead, behind, status });
check("changed paths are exactly bounded", changed.every((file) => ALLOWED.has(file)), changed.filter((file) => !ALLOWED.has(file)));
check("all B1-A core files exist", CORE.every((file) => fs.existsSync(path.join(ROOT, file))));
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
check("migration count remains 116", migrations.length === 116, migrations.length);
check("B0-B migration remains latest", migrations.at(-1) === "20260913020000_staff_authority_p3_p6_p2d_b0_b_branch_mutation_authority.sql", migrations.at(-1));
check("B1-A changes no migration", lines(git("diff", "--name-only", PREDECESSOR, "--", "supabase/migrations")).length === 0);
check("canonical context removes roleKey", !/\broleKey\b/.test(current));
check("canonical context contains admissionAuthority", /admissionAuthority: "legacy" \| "staff";/.test(current));
check("canonical admission values are exact", (current.match(/admissionAuthority: "legacy" \| "staff";/g) ?? []).length === 1);
check("legacy composer emits legacy admission only", /admissionAuthority: "legacy" as const/.test(current) && !/admissionAuthority: "staff" as const/.test(current));
check("hybrid composer emits legacy admission", b1bPhase ? /resolveStaffAdminPermissionContext\(client, authority\.subject, "legacy"\)/.test(context) : /admissionAuthority: "legacy" as const/.test(hybrid) && !/admissionAuthority: "staff"/.test(hybrid));
check("legacy PlatformAdminContext retains roleKey", /roleKey: PlatformAdminRoleKey/.test(legacy) && /PLATFORM_ADMIN_ROLE_KEYS = Object\.freeze\(\["platform_admin"\]/.test(legacy));
check("legacy adapter is byte-identical", unchanged("apps/admin-web/server/platformAdminAuthority.ts"));
check("authority selector is exact for phase", b1bPhase ? /\| "staff";/.test(selector) && /value === "staff"/.test(selector) : unchanged("apps/admin-web/auth/admin-authority-selector.ts"));
check("selector values remain phase-exact", b1bPhase ? /\| "legacy"[\s\S]*\| "staff_permissions_legacy_admission"[\s\S]*\| "staff";/.test(selector) : /\| "legacy"\s*\n\s*\| "staff_permissions_legacy_admission";/.test(selector) && !/\| "staff";|value === "staff"/.test(selector));
check("missing and invalid selector behavior unchanged", /value === undefined \|\| value === "legacy"/.test(selector) && /reason: "invalid_authority_mode"/.test(selector));
check("one verified Auth lookup remains", (context.match(/auth\.getUser\(\)/g) ?? []).length === 1);
check("legacy admission RPC remains mandatory", (context.match(/client\.rpc\(PLATFORM_ADMIN_CONTEXT_FUNCTION\)/g) ?? []).length === 1);
check("legacy admission precedes hybrid staff permissions", b1bPhase ? context.indexOf("const authority = await resolveLegacyAdminAuthority") < context.indexOf("return resolvePermissionsForAuthority(client, authority, mode.mode)") : context.indexOf('authority.context.state !== "admin"') < context.indexOf('mode.mode === "staff_permissions_legacy_admission"'));
check("legacy base permission remains mandatory", /!authority\.context\.permissions\.includes\("admin_context\.read"\)/.test(context));
check("staff-only admission is phase-correct", b1bPhase ? /mode\.mode === "staff"[\s\S]*resolveStaffAdminPermissionContext\(client, identity\.subject, "staff"\)/.test(context) : !/mode\.mode === "staff"|admissionAuthority: "staff" as const/.test(context));
check("hybrid still uses staff permissions only", /permissions: staffPermissions\.permissions/.test(b1bPhase ? context : hybrid) && !/concat|union|authority\.context\.permissions[^\n]*staffPermissions/.test(b1bPhase ? context : hybrid));
check("hybrid denial has no legacy fallback", /if \(staffPermissions\.state !== "ready"\) return staffPermissions;/.test(b1bPhase ? context : hybrid));
check("login action is byte-identical", unchanged("apps/admin-web/app/admin/login/actions.ts"));
check("session gate is byte-identical", unchanged("apps/admin-web/auth/admin-session-gate.ts"));
check("Admin registry page is byte-identical", unchanged("apps/admin-web/components/admin-shell/AdminRegistryPage.tsx"));
check("route authorization is byte-identical", unchanged("apps/admin-web/auth/admin-route-authorization.ts"));
check("navigation policy is byte-identical", unchanged("apps/admin-web/auth/admin-navigation-visibility.ts"));
check("cookie and bearer API authorization is byte-identical", unchanged("apps/admin-web/auth/admin-api-authorization.ts"));
check("B0 read selector is phase-exact", b1bPhase ? /mode\.mode === "legacy" \? "legacy" as const : "staff"/.test(read("apps/admin-web/auth/admin-protected-read-authority.ts")) : unchanged("apps/admin-web/auth/admin-protected-read-authority.ts"));
check("B0 mutation selector is phase-exact", b1bPhase ? /mode\.mode === "legacy" \? "legacy" as const : "staff"/.test(read("apps/admin-web/auth/admin-protected-mutation-authority.ts")) : unchanged("apps/admin-web/auth/admin-protected-mutation-authority.ts"));
check("protected operation runtimes are byte-identical", unchanged("apps/admin-web/server/platformAdminAuditRuntime.ts") && unchanged("apps/admin-web/server/platformAdminBranchStatusRuntime.ts"));
check("permission vocabulary is byte-identical", unchanged("apps/admin-web/auth/admin-current-permission-vocabulary.ts"));
check("permission vocabulary remains exact three", JSON.stringify([...read("apps/admin-web/auth/admin-current-permission-vocabulary.ts").matchAll(/"(admin[_.][a-z0-9_.]+)"/g)].map((match) => match[1])) === JSON.stringify(["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"]));
check("P2C shadow is byte-identical", unchanged("apps/admin-web/auth/admin-staff-authority-shadow.ts"));
function findFilesContaining(dirs, needle) {
  const matches = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile() && read(rel).includes(needle)) matches.push(rel);
    }
  };
  for (const dir of dirs) walk(dir);
  return matches;
}
const exposedAuthorityFiles = findFilesContaining(["apps/admin-web/components", "apps/admin-web/app"], "admissionAuthority");
check("no authority metadata reaches components or routes", exposedAuthorityFiles.length === 0, exposedAuthorityFiles);
check("no authority response header or UI surface", !/response.*admissionAuthority|header.*admissionAuthority|data-admission|legacy.*badge|staff.*badge/i.test(context + current));
check("no service_role runtime path", !/service_role/.test(context + current));
check("no Development or Production configuration", !/tastkind-development|production secret|supabase db push|schema_migrations/i.test(context + current));
const pkg = JSON.parse(read("package.json"));
check("three B1-A package commands exact", pkg.scripts?.["test:staff-authority-p3-p6-p2d-b1-a"] === "node scripts/staff-authority-p3-p6-p2d-b1-a-guard.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2d-b1-a-smoke"] === "node scripts/staff-authority-p3-p6-p2d-b1-a-smoke.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2d-b1-a-mutations"] === "node scripts/staff-authority-p3-p6-p2d-b1-a-mutations.mjs");
const changedText = changed.filter((file) => fs.existsSync(path.join(ROOT, file))).map(read).join("\n");
check("secret scan clean", ![/github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/].some((pattern) => pattern.test(changedText)));
check("frozen migration digest remains exact", sha(read("supabase/migrations/20260913020000_staff_authority_p3_p6_p2d_b0_b_branch_mutation_authority.sql")) === "26e757ff7b26471179c5e626094795bc30aa436087fcaa8244f5870ac3bf0a76");

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2d-b1-a-guard", phase: candidate ? "candidate" : frozen ? "frozen_local" : "invalid", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((item) => item.name), changedPaths: changed, migrationCount: migrations.length, developmentAccessed: false, productionAccessed: false, pushed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
