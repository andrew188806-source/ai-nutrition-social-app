#!/usr/bin/env node
// P3-P6-P2D-A reversible staff-permission authority cutover gate.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";

const ROOT = process.cwd();
const PREDECESSOR = "a7eedc960a070e19224bc3e91b9dffca7809a320";
const SUBJECT = "Add reversible Admin staff permission authority";
const B0A_PREDECESSOR = "fd698dbdfedd131aac1779d2d07e8dbbe2d77267";
const B0A_SUBJECT = "Add staff-native Admin read authority";
const SELECTOR = "apps/admin-web/auth/admin-authority-selector.ts";
const STAFF = "apps/admin-web/auth/admin-staff-permission-authority.ts";
const CONTEXT = "apps/admin-web/auth/admin-context.ts";
const CURRENT = "apps/admin-web/auth/admin-current-permission-context.ts";
const SESSION = "apps/admin-web/auth/admin-session-gate.ts";
const LOGIN = "apps/admin-web/app/admin/login/actions.ts";
const PAGE = "apps/admin-web/components/admin-shell/AdminRegistryPage.tsx";
const OWN = [
  SELECTOR, STAFF, CONTEXT, CURRENT, SESSION, LOGIN, PAGE, "package.json",
  "scripts/staff-authority-p3-p6-p2d-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-mutations.mjs"
];
const SUCCESSOR_AWARENESS = [
  "scripts/staff-authority-p3-p6-p2c-guard.mjs",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/staff-authority-p3-p6-p1b-guard.mjs",
  "scripts/staff-authority-p3-p6-p1c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2b-guard.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs",
  "scripts/admin-session-p3-p1-guard.mjs",
  "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs",
  "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs",
  "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const TEST_AWARENESS = [
  "scripts/staff-authority-p3-p6-p2c-smoke.mjs",
  "scripts/admin-session-p3-p1-smoke.mjs",
  "scripts/admin-api-session-p3-p5-smoke.mjs",
  "scripts/admin-api-session-p3-p5-r1-smoke.mjs"
];
const B0A_PATHS = [
  "apps/admin-web/auth/admin-protected-read-authority.ts",
  "apps/admin-web/server/platformAdminAuditRuntime.ts", "apps/admin-web/server/staffAdminAuditRead.ts", "apps/admin-web/server/staffAdminAuditTransport.ts",
  "apps/admin-web/server/platformAdminBranchStatusRuntime.ts", "apps/admin-web/server/staffAdminBranchStatusRead.ts", "apps/admin-web/server/staffAdminBranchStatusTransport.ts",
  "supabase/migrations/20260913010000_staff_authority_p3_p6_p2d_b0_a_protected_read_authority.sql", "package.json",
  "scripts/staff-authority-p3-p6-p2d-b0-a-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b0-a-smoke.mjs", "scripts/staff-authority-p3-p6-p2d-b0-a-mutations.mjs", "scripts/staff-authority-p3-p6-p2d-b0-a-postgres.mjs",
  ...SUCCESSOR_AWARENESS, ...TEST_AWARENESS, "scripts/staff-authority-p3-p6-p2d-a-guard.mjs"
];
const FROZEN = new Map([
  ["supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql", "68a938a04b898f8d25b2ee7c9176cd3e9c97b3f324e66cbc1b70b1ad61470ddf"],
  ["supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql", "c60becab5009051a01311e53dc7d8fa6c9072925aaa283cda3abff56b6e455c4"],
  ["supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql", "c4f3877f889582a3af14533f530135beced7ba68a7d11f82e23f2b4ea996e835"],
  ["supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql", "140c0bd790c428d2153671d373d4e5a362de962714f0630741820fc93ece699d"],
  ["supabase/migrations/20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql", "12b70090b757d32df79fbb3bbeda206f16a4458f3b1d091bf9476c59b16a410e"]
]);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const sha = (value) => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const baseline = (file) => git("show", `${PREDECESSOR}:${file}`).replace(/\r\n/g, "\n");
const unchanged = (file) => read(file).trimEnd() === baseline(file).trimEnd();

const head = git("rev-parse", "HEAD"), origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = lines(git("status", "--porcelain=v1", "--untracked-files=all"));
const changed = [...new Set([...lines(git("diff", "--name-only", PREDECESSOR)), ...lines(git("ls-files", "--others", "--exclude-standard"))])].sort();
const candidate = head === PREDECESSOR && origin === PREDECESSOR && ahead === 0 && behind === 0;
const frozen = head !== PREDECESSOR && git("rev-parse", "HEAD^") === PREDECESSOR && origin === PREDECESSOR
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === SUBJECT;
const b0aCandidate = head === B0A_PREDECESSOR && origin === B0A_PREDECESSOR && ahead === 0 && behind === 0;
const b0aFrozen = head !== B0A_PREDECESSOR && git("rev-parse", "HEAD^") === B0A_PREDECESSOR && origin === B0A_PREDECESSOR
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === B0A_SUBJECT;
const b0aPhase = b0aCandidate || b0aFrozen;
const allowed = new Set([...OWN, ...SUCCESSOR_AWARENESS, ...TEST_AWARENESS, ...(b0aPhase ? B0A_PATHS : [])]);
const selector = read(SELECTOR), staff = read(STAFF), context = read(CONTEXT), current = read(CURRENT);
const session = read(SESSION), login = read(LOGIN), page = read(PAGE);
const staffBranch = context.slice(context.indexOf('if (mode.mode === "staff_permissions_legacy_admission")'), context.indexOf("let branchStatusPermission"));
const legacyBranch = context.slice(context.indexOf("let branchStatusPermission"));
const checks = [], failures = [];
function check(name, pass, detail) {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item); if (!item.pass) failures.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 1200)}`);
}

check("exact P2C predecessor through bounded B0-A successor", candidate || frozen || b0aPhase, { head, origin, ahead, behind, status });
check("P2D-A diff contains only exact bounded paths", changed.every((file) => allowed.has(file)), changed.filter((file) => !allowed.has(file)));
for (const [file, digest] of FROZEN) check(`${path.basename(file)} remains hash-pinned`, sha(read(file)) === digest, sha(read(file)));
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
check("migration count is exact for recognized successor", migrations.length === (b0aPhase ? 115 : 114), migrations.length);
check("latest migration is exact for recognized successor", migrations.at(-1) === (b0aPhase ? "20260913010000_staff_authority_p3_p6_p2d_b0_a_protected_read_authority.sql" : "20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql"), migrations.at(-1));
check("P2D-A itself remains migration-free", lines(git("diff", "--name-only", B0A_PREDECESSOR, "--", "supabase/migrations")).every((file) => file === "supabase/migrations/20260913010000_staff_authority_p3_p6_p2d_b0_a_protected_read_authority.sql"));
check("selector is server-only", selector.startsWith('import "server-only";'));
check("selector env name is exact", /ADMIN_AUTHORITY_MODE_ENV = "TASTKIND_ADMIN_AUTHORITY_MODE"/.test(selector));
check("selector exposes exact legacy mode", /"legacy"/.test(selector));
check("selector exposes exact transitional staff mode", /"staff_permissions_legacy_admission"/.test(selector));
check("missing selector defaults legacy", /value === undefined \|\| value === "legacy"/.test(selector));
check("invalid selector is unavailable", /state: "unavailable" as const, reason: "invalid_authority_mode"/.test(selector));
check("selector performs no trimming or case normalization", !/\.trim\(|toLowerCase|toUpperCase/i.test(selector));
check("selector is not browser exposed", !/NEXT_PUBLIC|cookie|localStorage|query|route|header/i.test(selector.replace(/\/\*[\s\S]*?\*\//g, "")));
check("selector contains no Supabase transport or secret", !/supabase|service_role|publishable|secret|password|token/i.test(selector));
check("authentication is resolved exactly once", (context.match(/auth\.getUser\(\)/g) ?? []).length === 1);
check("legacy admission RPC remains exact", (context.match(/client\.rpc\(PLATFORM_ADMIN_CONTEXT_FUNCTION\)/g) ?? []).length === 1);
check("unauthenticated classification precedes selector", context.indexOf("if (authority.subject === null)") < context.indexOf("resolveAdminAuthorityMode()"));
check("invalid selector fails closed", /mode\.state === "unavailable"[\s\S]*state: "unavailable" as const, reason: mode\.reason/.test(context));
check("legacy not_admin and unavailable return before staff RPC", context.indexOf('authority.context.state !== "admin"') < context.indexOf('mode.mode === "staff_permissions_legacy_admission"'));
check("legacy admin_context.read admission is mandatory", /!authority\.context\.permissions\.includes\("admin_context\.read"\)/.test(context));
check("staff authority module is server-only", staff.startsWith('import "server-only";'));
check("staff current-context RPC name is exact", /STAFF_PERMISSION_CONTEXT_FUNCTION = "staff_current_context_v1"/.test(staff));
check("staff current-context is called once in staff branch", (staffBranch.match(/client\.rpc\(STAFF_PERMISSION_CONTEXT_FUNCTION\)/g) ?? []).length === 1);
check("staff predicate fan-out is absent", !/staff_has_permission_v1|STAFF_HAS_PERMISSION/.test(staff + context));
check("staff branch does not call legacy permission predicate", !/PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION|branchStatusPermission/.test(staffBranch));
check("staff resolver accepts no subject identity argument", /resolveAdminStaffPermissionSet\(\s*outcome:/.test(staff) && !/\bsubject\s*:/.test(staff));
check("staff composer accepts no legacy permission input", !/legacyPermissions|PlatformAdminContext/.test(staff));
check("staff permissions are not unioned", !/union|\.concat\(|legacyPermissions|authority\.context\.permissions[\s\S]*resolveAdminStaffPermissionSet/i.test(staffBranch));
check("staff permissions are not intersected", !/legacyPermissions|authority\.context\.permissions/.test(staff + staffBranch));
check("staff denial has no legacy fallback", /const staffPermissions = resolveAdminStaffPermissionSet\(outcome\);[\s\S]*if \(staffPermissions\.state !== "ready"\) return staffPermissions;/.test(staffBranch));
check("staff RPC rejection is unavailable", /result\.error[\s\S]*staff_authority_rejected/.test(staffBranch));
check("staff RPC throw is unavailable", /catch \{[\s\S]*staff_authority_unreachable/.test(staffBranch));
check("staff response requires an array", /if \(!Array\.isArray\(outcome\.data\)\)/.test(staff));
check("staff row shape is strict", /typeof row !== "object"[\s\S]*row === null[\s\S]*!\("permission_key" in row\)[\s\S]*typeof row\.permission_key !== "string"/.test(staff));
check("unknown current staff permission is unavailable", /!isCurrentAdminPermissionKey\(row\.permission_key\)[\s\S]*unrecognized_current_permission/.test(staff));
check("duplicate staff rows deduplicate and sort", /new Set<CurrentAdminPermissionKey>\(\)[\s\S]*permissions\.add\(row\.permission_key\)[\s\S]*\[\.\.\.permissions\]\.sort\(\)/.test(staff));
check("staff base permission is mandatory", /!permissions\.has\(BASE_PERMISSION\)[\s\S]*state: "not_admin"/.test(staff));
check("zero staff permissions deny as not_admin", /if \(!permissions\.has\(BASE_PERMISSION\)\)/.test(staff));
check("staff admin retains real legacy roleKey", /roleKey: "platform_admin" as const/.test(staffBranch));
check("CurrentAdminPermissionContext remains canonical", /Promise<CurrentAdminPermissionContext>/.test(context) && /type CurrentAdminPermissionContext/.test(current));
check("bounded staff failure reasons are represented", ["invalid_authority_mode", "staff_authority_unreachable", "staff_authority_rejected", "staff_authority_malformed"].every((reason) => current.includes(`"${reason}"`)));
check("legacy mode retains exact branch predicate", /client\.rpc\(PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION/.test(legacyBranch));
check("legacy mode retains final context composition", /resolveCurrentAdminPermissionContext\([\s\S]*resolveAdminStaffAuthorityShadow\(client, authoritativeContext\)[\s\S]*return authoritativeContext/.test(legacyBranch));
check("P2C forward shadow remains only in legacy branch", !staffBranch.includes("resolveAdminStaffAuthorityShadow") && (legacyBranch.match(/resolveAdminStaffAuthorityShadow/g) ?? []).length === 1);
check("shadow flag cannot select authority", !/ADMIN_STAFF_AUTHORITY_SHADOW|isAdminStaffAuthorityShadowEnabled/.test(selector + staff));
check("login uses canonical permission resolver", /resolveVerifiedAdminPermissionContext\(client\)/.test(login) && !/resolveVerifiedAdminContext/.test(login));
check("session gate consumes canonical context", /CurrentAdminPermissionContext/.test(session) && !/PlatformAdminContext/.test(session));
check("session gate trusts only canonical admin state", /if \(context\.state === "not_admin"\)[\s\S]*return \{ state: "allow" \};/.test(session) && !/permissions\.includes/.test(session));
check("all canonical pages resolve canonical permission context", /const permissionContext = await getVerifiedAdminPermissionContext\(\)/.test(page));
check("raw legacy base-route bypass is absent", !/getVerifiedAdminContext|baseContext:/.test(page));
check("route authorization policy is byte-identical", unchanged("apps/admin-web/auth/admin-route-authorization.ts"));
check("navigation policy is byte-identical", unchanged("apps/admin-web/auth/admin-navigation-visibility.ts"));
check("Sidebar clients are byte-identical", ["apps/admin-web/components/admin-shell/AdminSidebar.tsx", "apps/admin-web/components/admin-shell/AdminSidebarSection.tsx"].every(unchanged));
check("cookie API inherits canonical context", /resolvePermissionContext: getVerifiedAdminPermissionContext/.test(read("apps/admin-web/auth/admin-api-authorization.ts")));
check("explicit bearer path is byte-identical", unchanged("apps/admin-web/auth/admin-api-authorization.ts"));
check("Admin API routes and bounded runtimes are exact", [
  "apps/admin-web/app/api/platform-admin/audit/route.ts",
  "apps/admin-web/app/api/platform-admin/restaurant-branches/[branchId]/status/route.ts"
].every(unchanged));
check("route registry is byte-identical", unchanged("apps/admin-web/auth/admin-route-registry.ts"));
check("current permission vocabulary is byte-identical", unchanged("apps/admin-web/auth/admin-current-permission-vocabulary.ts"));
check("current permission vocabulary remains exact three", JSON.stringify([...read("apps/admin-web/auth/admin-current-permission-vocabulary.ts").matchAll(/"(admin[_.][a-z0-9_.]+)"/g)].map((match) => match[1])) === JSON.stringify(["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"]));
check("P2B bridge and P2A resolver remain unchanged", [...FROZEN.keys()].slice(-2).every((file) => !changed.includes(file)));
check("P2C shadow module is byte-identical", unchanged("apps/admin-web/auth/admin-staff-authority-shadow.ts"));
check("no service_role runtime path", !/service_role/.test([selector, staff, context, current, session, login, page].join("\n")));
const pkg = JSON.parse(read("package.json"));
check("P2D-A package scripts are exact", pkg.scripts?.["test:staff-authority-p3-p6-p2d-a"] === "node scripts/staff-authority-p3-p6-p2d-a-guard.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2d-a-smoke"] === "node scripts/staff-authority-p3-p6-p2d-a-smoke.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2d-a-mutations"] === "node scripts/staff-authority-p3-p6-p2d-a-mutations.mjs");
check("dependencies and lockfiles remain unchanged", JSON.stringify(pkg.dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${PREDECESSOR}:package.json`)).dependencies ?? {}) && !changed.some((file) => /lock/i.test(file)));
const implementationText = changed.filter((file) => (file.startsWith("apps/") || file === "package.json") && fs.existsSync(file)).map(read).join("\n");
check("no client authority source surface", !/NEXT_PUBLIC_TASTKIND_ADMIN_AUTHORITY|localStorage|sessionStorage|authority_mode.*(?:cookie|query|header)/i.test(implementationText));
check("no migration history repair or environment access", !/schema_migrations|migration repair|supabase db push|tastkind-development|production secret/i.test(implementationText));
const changedText = changed.filter((file) => fs.existsSync(file)).map(read).join("\n");
check("changed files contain no credential-shaped value", ![/github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/].some((pattern) => pattern.test(changedText)));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2d-a-guard", phase: candidate ? "candidate" : frozen ? "frozen_local" : "invalid", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((item) => item.name), changedPaths: changed, migrationCount: migrations.length, developmentAccessed: false, productionAccessed: false, pushed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
