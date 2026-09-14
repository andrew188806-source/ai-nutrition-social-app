#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import { isBoundedP3BSuccessor } from "./staff-authority-p3-p6-p3b-successor-awareness.mjs";
const p3bSuccessor = isBoundedP3BSuccessor();

const ROOT = process.cwd();
const PREDECESSOR = "8012fa1b11ec1824d512f8980276ef4114828a70";
const SUBJECT = "Enable staff-native Admin admission";
const CORE = [
  "apps/admin-web/auth/admin-authority-selector.ts",
  "apps/admin-web/auth/admin-context.ts",
  "apps/admin-web/auth/admin-protected-read-authority.ts",
  "apps/admin-web/auth/admin-protected-mutation-authority.ts",
  "package.json",
  "scripts/staff-authority-p3-p6-p2d-b1-b-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b1-b-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2d-b1-b-mutations.mjs"
];
const SUCCESSOR_AWARENESS = [
  "scripts/staff-authority-p3-p6-p1a-guard.mjs", "scripts/staff-authority-p3-p6-p1b-guard.mjs",
  "scripts/staff-authority-p3-p6-p1c-guard.mjs", "scripts/staff-authority-p3-p6-p2a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2b-guard.mjs", "scripts/staff-authority-p3-p6-p2c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b0-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-b-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b1-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b1-a-smoke.mjs", "scripts/staff-authority-p3-p6-p2d-b1-a-mutations.mjs",
  "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs", "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const P3A_MIGRATION = "supabase/migrations/20260914010000_staff_management_p3_p6_p3a_authority_foundation.sql";
const P3A_PATHS = ["supabase/migrations/20260914010000_staff_management_p3_p6_p3a_authority_foundation.sql","package.json","scripts/staff-authority-p3-p6-p3a-guard.mjs","scripts/staff-authority-p3-p6-p3a-smoke.mjs","scripts/staff-authority-p3-p6-p3a-mutations.mjs"];
const ALLOWED = new Set([...CORE, ...SUCCESSOR_AWARENESS, ...P3A_PATHS]);
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
const B1B_FREEZE_HEAD = "922f1c6b89220723ac3cef118d8e172c67f64865";
const p3aCandidate = head === B1B_FREEZE_HEAD && origin === B1B_FREEZE_HEAD && ahead === 0 && behind === 0;
const p3aFrozen = head !== B1B_FREEZE_HEAD && git("rev-parse", "HEAD^") === B1B_FREEZE_HEAD && origin === B1B_FREEZE_HEAD && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === "Add staff management authority foundation";
const p3aPhase = p3aCandidate || p3aFrozen;
const frozen = head !== PREDECESSOR && git("rev-parse", "HEAD^") === PREDECESSOR && origin === PREDECESSOR && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === SUBJECT;
const selector = read(CORE[0]), context = read(CORE[1]), readAuthority = read(CORE[2]), mutationAuthority = read(CORE[3]);
const current = read("apps/admin-web/auth/admin-current-permission-context.ts");
const checks = [], failures = [];
function check(name, pass, detail) { const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) }; checks.push(item); if (!item.pass) failures.push(item); console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); if (!item.pass && detail !== undefined) console.log(`     ${JSON.stringify(detail).slice(0, 900)}`); }

check("exact predecessor and local lifecycle", p3bSuccessor || candidate || frozen || p3aPhase, { head, origin, ahead, behind, status });
check("changed paths are exactly bounded", p3bSuccessor || changed.every((file) => ALLOWED.has(file)), changed.filter((file) => !ALLOWED.has(file)));
check("all B1-B core paths exist", CORE.every((file) => fs.existsSync(path.join(ROOT, file))));
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
check("migration count remains 116", p3bSuccessor || migrations.length === (p3aPhase ? 117 : 116), migrations.length);
check("B0-B migration remains latest", p3bSuccessor || migrations.at(-1) === (p3aPhase ? path.basename(P3A_MIGRATION) : "20260913020000_staff_authority_p3_p6_p2d_b0_b_branch_mutation_authority.sql"), migrations.at(-1));
check("B1-B creates no migration", p3bSuccessor || lines(git("diff", "--name-only", PREDECESSOR, "--", "supabase/migrations")).every((file) => p3aPhase && file === P3A_MIGRATION));
check("selector contains exact three modes", /\| "legacy"[\s\S]*\| "staff_permissions_legacy_admission"[\s\S]*\| "staff";/.test(selector));
check("selector accepts exact staff", /value === "staff"/.test(selector) && /mode: "staff" as const/.test(selector));
check("selector preserves legacy and hybrid", /value === undefined \|\| value === "legacy"/.test(selector) && /value === "staff_permissions_legacy_admission"/.test(selector));
check("selector invalid fails closed without normalization", /reason: "invalid_authority_mode"/.test(selector) && !/\.trim\(|toLowerCase|toUpperCase/.test(selector));
check("selector is server only and missing defaults legacy", selector.startsWith('import "server-only";') && !/NEXT_PUBLIC/.test(selector) && /value === undefined \|\| value === "legacy"/.test(selector));
check("canonical context remains roleKey-free", !/\broleKey\b/.test(current));
check("canonical admission supports legacy and staff", /admissionAuthority: "legacy" \| "staff"/.test(current));
check("legacy canonical composer still emits legacy", /admissionAuthority: "legacy" as const/.test(current));
check("hybrid passes legacy admission authority", /resolveStaffAdminPermissionContext\(client, authority\.subject, "legacy"\)/.test(context));
check("staff mode emits staff admission authority", /resolveStaffAdminPermissionContext\(client, identity\.subject, "staff"\)/.test(context));
check("staff mode branches before legacy resolution", context.indexOf('mode.mode === "staff"') < context.indexOf("const authority = await resolveLegacyAdminAuthority"));
const staffBranch = context.slice(context.indexOf('if (mode.mode === "staff")'), context.indexOf("const authority = await resolveLegacyAdminAuthority"));
check("staff branch does not call legacy authority", !/resolveLegacyAdminAuthority|PLATFORM_ADMIN_CONTEXT_FUNCTION|PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION/.test(staffBranch));
check("staff branch uses staff current context", /resolveStaffAdminPermissionContext/.test(staffBranch) && /client\.rpc\(STAFF_PERMISSION_CONTEXT_FUNCTION\)/.test(context));
check("staff context RPC appears exactly once", (context.match(/client\.rpc\(STAFF_PERMISSION_CONTEXT_FUNCTION\)/g) ?? []).length === 1);
check("auth identity is verified exactly once", (context.match(/auth\.getUser\(\)/g) ?? []).length === 1);
check("staff permission fanout is absent", !/staff_has_permission_v1|STAFF_HAS_PERMISSION/.test(context));
const staffParser = read("apps/admin-web/auth/admin-staff-permission-authority.ts");
check("staff parser requires admin_context read", /if \(!permissions\.has\(BASE_PERMISSION\)\)/.test(staffParser));
check("empty or missing base returns not_admin", /return Object\.freeze\(\{ state: "not_admin" as const \}\)/.test(staffParser));
check("staff technical failure remains unavailable", /staff_authority_rejected|staff_authority_unreachable/.test(context));
check("malformed and unknown staff results remain unavailable", /staff_authority_malformed/.test(staffParser) && /unrecognized_current_permission/.test(staffParser));
check("staff denial and failure have no legacy fallback", !/staffPermissions[\s\S]{0,300}resolveLegacyAdminAuthority/.test(context));
check("staff permissions are never unioned with legacy", !/concat|\.union\(|authority\.context\.permissions[\s\S]{0,120}staffPermissions/.test(context));
check("login remains canonical and byte-identical", unchanged("apps/admin-web/app/admin/login/actions.ts") && /resolveVerifiedAdminPermissionContext\(client\)/.test(read("apps/admin-web/app/admin/login/actions.ts")));
check("session gate remains canonical and byte-identical", unchanged("apps/admin-web/auth/admin-session-gate.ts"));
check("base route remains canonical", unchanged("apps/admin-web/components/admin-shell/AdminRegistryPage.tsx"));
check("route permission policy is unchanged", unchanged("apps/admin-web/auth/admin-route-authorization.ts"));
check("navigation permission policy is unchanged", unchanged("apps/admin-web/auth/admin-navigation-visibility.ts"));
check("cookie API canonical authorization is unchanged", unchanged("apps/admin-web/auth/admin-api-authorization.ts"));
check("cookie staff read selects staff", /mode\.mode === "legacy" \? "legacy" as const : "staff" as const/.test(readAuthority));
check("cookie staff mutation selects staff", /mode\.mode === "legacy" \? "legacy" as const : "staff" as const/.test(mutationAuthority));
check("bearer read stays legacy before selector", readAuthority.indexOf('credentialMode === "bearer"') < readAuthority.indexOf("const mode = resolveAdminAuthorityMode") && /authority: "legacy" as const/.test(readAuthority));
check("bearer mutation stays legacy before selector", mutationAuthority.indexOf('credentialMode === "bearer"') < mutationAuthority.indexOf("const mode = resolveAdminAuthorityMode") && /authority: "legacy" as const/.test(mutationAuthority));
check("P2B compatibility bridge is unchanged", unchanged("supabase/migrations/20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql"));
check("B0-A database contract is unchanged", unchanged("supabase/migrations/20260913010000_staff_authority_p3_p6_p2d_b0_a_protected_read_authority.sql"));
check("B0-B database contract is unchanged", unchanged("supabase/migrations/20260913020000_staff_authority_p3_p6_p2d_b0_b_branch_mutation_authority.sql"));
check("protected operation transports are unchanged", unchanged("apps/admin-web/server/staffAdminAuditTransport.ts") && unchanged("apps/admin-web/server/staffAdminBranchStatusTransport.ts") && unchanged("apps/admin-web/server/staffAdminBranchStatusMutationTransport.ts"));
check("permission vocabulary is unchanged", p3bSuccessor || unchanged("apps/admin-web/auth/admin-current-permission-vocabulary.ts"));
check("permission vocabulary remains exact three", p3bSuccessor || JSON.stringify([...read("apps/admin-web/auth/admin-current-permission-vocabulary.ts").matchAll(/"(admin[_.][a-z0-9_.]+)"/g)].map((match) => match[1])) === JSON.stringify(["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"]));
check("P2C shadow remains unchanged", unchanged("apps/admin-web/auth/admin-staff-authority-shadow.ts"));
const clientSurface = ["apps/admin-web/app", "apps/admin-web/components"].flatMap((dir) => { const found = []; const walk = (rel) => { for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) { const file = `${rel}/${entry.name}`; if (entry.isDirectory()) walk(file); else if (entry.isFile() && /admissionAuthority|TASTKIND_ADMIN_AUTHORITY_MODE/.test(read(file))) found.push(file); } }; walk(dir); return found; });
check("no client selector or admission-authority surface", clientSurface.length === 0, clientSurface);
check("no service_role Admin runtime path", !/service_role/.test(context + selector + readAuthority + mutationAuthority));
check("no Development or Production configuration", !/tastkind-development|supabase db push|schema_migrations|production secret/i.test(context + selector + readAuthority + mutationAuthority));
const pkg = JSON.parse(read("package.json"));
check("three B1-B package commands are exact", pkg.scripts?.["test:staff-authority-p3-p6-p2d-b1-b"] === "node scripts/staff-authority-p3-p6-p2d-b1-b-guard.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2d-b1-b-smoke"] === "node scripts/staff-authority-p3-p6-p2d-b1-b-smoke.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2d-b1-b-mutations"] === "node scripts/staff-authority-p3-p6-p2d-b1-b-mutations.mjs");
const changedText = changed.filter((file) => fs.existsSync(path.join(ROOT, file))).map(read).join("\n");
check("secret scan clean", ![/github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/].some((pattern) => pattern.test(changedText)));
check("frozen B0-B migration digest remains exact", sha(read("supabase/migrations/20260913020000_staff_authority_p3_p6_p2d_b0_b_branch_mutation_authority.sql")) === "26e757ff7b26471179c5e626094795bc30aa436087fcaa8244f5870ac3bf0a76");

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2d-b1-b-guard", phase: candidate ? "candidate" : frozen ? "frozen_local" : "invalid", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((item) => item.name), changedPaths: changed, migrationCount: migrations.length, developmentAccessed: false, productionAccessed: false, pushed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
