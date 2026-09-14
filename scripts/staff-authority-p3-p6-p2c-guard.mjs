#!/usr/bin/env node
// P3-P6-P2C static Admin staff-authority shadow and non-authority gate.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import { isBoundedP3BSuccessor } from "./staff-authority-p3-p6-p3b-successor-awareness.mjs";
const p3bSuccessor = isBoundedP3BSuccessor();

const ROOT = process.cwd();
const PREDECESSOR = "8dbd14b65b8734842095ce809686ce5929cc5958";
const SUBJECT = "Add Admin staff authority shadow comparison";
const P2C_FROZEN_HEAD = "a7eedc960a070e19224bc3e91b9dffca7809a320";
const P2D_A_SUBJECT = "Add reversible Admin staff permission authority";
const B0A_PREDECESSOR = "fd698dbdfedd131aac1779d2d07e8dbbe2d77267";
const B0A_SUBJECT = "Add staff-native Admin read authority";
const B0A_MIGRATION = "supabase/migrations/20260913010000_staff_authority_p3_p6_p2d_b0_a_protected_read_authority.sql";
const SHADOW = "apps/admin-web/auth/admin-staff-authority-shadow.ts";
const CONTEXT = "apps/admin-web/auth/admin-context.ts";
const OWN = [
  CONTEXT, SHADOW, "package.json",
  "scripts/staff-authority-p3-p6-p2c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2c-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2c-mutations.mjs"
];
const SUCCESSOR_AWARENESS = [
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
const TEST_AWARENESS = ["scripts/admin-api-session-p3-p5-r1-smoke.mjs"];
const P2D_A_APP_PATHS = [
  "apps/admin-web/auth/admin-authority-selector.ts",
  "apps/admin-web/auth/admin-staff-permission-authority.ts",
  "apps/admin-web/auth/admin-context.ts",
  "apps/admin-web/auth/admin-current-permission-context.ts",
  "apps/admin-web/auth/admin-session-gate.ts",
  "apps/admin-web/app/admin/login/actions.ts",
  "apps/admin-web/components/admin-shell/AdminRegistryPage.tsx"
];
const P2D_A_PATHS = [
  ...P2D_A_APP_PATHS,
  "package.json",
  "scripts/staff-authority-p3-p6-p2d-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-mutations.mjs",
  "scripts/staff-authority-p3-p6-p2c-smoke.mjs",
  "scripts/admin-session-p3-p1-smoke.mjs",
  ...SUCCESSOR_AWARENESS,
  ...TEST_AWARENESS
];
const B0A_PATHS = [
  ...P2D_A_PATHS,
  "apps/admin-web/auth/admin-protected-read-authority.ts",
  "apps/admin-web/server/platformAdminAuditRuntime.ts", "apps/admin-web/server/staffAdminAuditRead.ts", "apps/admin-web/server/staffAdminAuditTransport.ts",
  "apps/admin-web/server/platformAdminBranchStatusRuntime.ts", "apps/admin-web/server/staffAdminBranchStatusRead.ts", "apps/admin-web/server/staffAdminBranchStatusTransport.ts",
  B0A_MIGRATION, "scripts/staff-authority-p3-p6-p2d-b0-a-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b0-a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-a-mutations.mjs", "scripts/staff-authority-p3-p6-p2d-b0-a-postgres.mjs",
  "scripts/admin-api-session-p3-p5-smoke.mjs"
];
const B0B_MIGRATION = "supabase/migrations/20260913020000_staff_authority_p3_p6_p2d_b0_b_branch_mutation_authority.sql";
const B0B_PATHS = [
  "apps/admin-web/auth/admin-protected-mutation-authority.ts",
  "apps/admin-web/server/platformAdminBranchStatusRuntime.ts",
  "apps/admin-web/server/staffAdminBranchStatusMutation.ts",
  "apps/admin-web/server/staffAdminBranchStatusMutationTransport.ts",
  B0B_MIGRATION, "package.json",
  "scripts/staff-authority-p3-p6-p2d-b0-b-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-b-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-b-mutations.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-b-postgres.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-a-smoke.mjs"
];

const B1A_HEAD = "fc241a0bd2c4f0865fb9e60b488320cf99ea7716";
const B1A_SUBJECT = "Generalize canonical Admin authority context";
const B1A_PATHS = [
  "apps/admin-web/auth/admin-context.ts", "apps/admin-web/auth/admin-current-permission-context.ts", "package.json",
  "scripts/staff-authority-p3-p6-p2d-b1-a-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b1-a-smoke.mjs", "scripts/staff-authority-p3-p6-p2d-b1-a-mutations.mjs",
  "scripts/admin-api-session-p3-p5-smoke.mjs", "scripts/admin-current-permissions-p3-p2-smoke.mjs", "scripts/admin-navigation-p3-p4-guard.mjs", "scripts/admin-navigation-p3-p4-smoke.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs", "scripts/admin-route-authorization-p3-p3-smoke.mjs", "scripts/admin-session-p3-p1-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2c-smoke.mjs", "scripts/staff-authority-p3-p6-p2d-a-guard.mjs", "scripts/staff-authority-p3-p6-p2d-a-mutations.mjs", "scripts/staff-authority-p3-p6-p2d-a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs", "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1c-guard.mjs", "scripts/staff-authority-p3-p6-p2a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2b-guard.mjs", "scripts/staff-authority-p3-p6-p2c-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b0-a-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b0-b-guard.mjs",
  "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs", "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs", "scripts/admin-ia-p2-r2-guard.mjs"
];
B0A_PATHS.push(...B0B_PATHS, ...B1A_PATHS);

const B1A_FREEZE_HEAD = "8012fa1b11ec1824d512f8980276ef4114828a70";
const B1B_SUBJECT = "Enable staff-native Admin admission";
const B1B_PATHS = [
  "apps/admin-web/auth/admin-authority-selector.ts", "apps/admin-web/auth/admin-context.ts",
  "apps/admin-web/auth/admin-protected-read-authority.ts", "apps/admin-web/auth/admin-protected-mutation-authority.ts", "package.json",
  "scripts/staff-authority-p3-p6-p2d-b1-b-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b1-b-smoke.mjs", "scripts/staff-authority-p3-p6-p2d-b1-b-mutations.mjs",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs", "scripts/staff-authority-p3-p6-p1b-guard.mjs", "scripts/staff-authority-p3-p6-p1c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2a-guard.mjs", "scripts/staff-authority-p3-p6-p2b-guard.mjs", "scripts/staff-authority-p3-p6-p2c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-guard.mjs", "scripts/staff-authority-p3-p6-p2d-a-smoke.mjs", "scripts/staff-authority-p3-p6-p2d-a-mutations.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-a-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b0-b-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b1-a-guard.mjs", "scripts/staff-authority-p3-p6-p2d-b1-a-smoke.mjs", "scripts/staff-authority-p3-p6-p2d-b1-a-mutations.mjs",
  "scripts/admin-session-p3-p1-guard.mjs", "scripts/admin-current-permissions-p3-p2-guard.mjs", "scripts/admin-route-authorization-p3-p3-guard.mjs",
  "scripts/admin-navigation-p3-p4-guard.mjs", "scripts/admin-api-session-p3-p5-guard.mjs", "scripts/admin-api-session-p3-p5-r1-guard.mjs"
];
const P3A_MIGRATION = "supabase/migrations/20260914010000_staff_management_p3_p6_p3a_authority_foundation.sql";
const P3A_PATHS = [P3A_MIGRATION, "package.json", "scripts/staff-authority-p3-p6-p3a-guard.mjs", "scripts/staff-authority-p3-p6-p3a-smoke.mjs", "scripts/staff-authority-p3-p6-p3a-mutations.mjs"];
B0A_PATHS.push(...B1B_PATHS, ...P3A_PATHS);


const FROZEN = new Map([
  ["supabase/migrations/20260912010000_staff_authority_p3_p6_p1a_foundation.sql", "68a938a04b898f8d25b2ee7c9176cd3e9c97b3f324e66cbc1b70b1ad61470ddf"],
  ["supabase/migrations/20260912020000_staff_authority_p3_p6_p1b_entitlement_foundation.sql", "c60becab5009051a01311e53dc7d8fa6c9072925aaa283cda3abff56b6e455c4"],
  ["supabase/migrations/20260912030000_staff_authority_p3_p6_p1c_materializer_audit.sql", "c4f3877f889582a3af14533f530135beced7ba68a7d11f82e23f2b4ea996e835"],
  ["supabase/migrations/20260912040000_staff_authority_p3_p6_p2a_effective_permission_resolver.sql", "140c0bd790c428d2153671d373d4e5a362de962714f0630741820fc93ece699d"],
  ["supabase/migrations/20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql", "12b70090b757d32df79fbb3bbeda206f16a4458f3b1d091bf9476c59b16a410e"]
]);
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const sha = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");
const git = (...args) => child.execFileSync("git", ["-c", "core.safecrlf=false", ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const head = git("rev-parse", "HEAD"), origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = lines(git("status", "--porcelain=v1", "--untracked-files=all"));
const changed = [...new Set([...lines(git("diff", "--name-only", PREDECESSOR)), ...lines(git("ls-files", "--others", "--exclude-standard"))])].sort();
const candidate = head === PREDECESSOR && origin === PREDECESSOR && ahead === 0 && behind === 0;
const frozen = head !== PREDECESSOR && git("rev-parse", "HEAD^") === PREDECESSOR && origin === PREDECESSOR && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === SUBJECT;
const pushed = head === P2C_FROZEN_HEAD && origin === P2C_FROZEN_HEAD && ahead === 0 && behind === 0;
const p2dAFrozen = head !== P2C_FROZEN_HEAD && git("rev-parse", "HEAD^") === P2C_FROZEN_HEAD && origin === P2C_FROZEN_HEAD && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === P2D_A_SUBJECT;
const b0aCandidate = head === B0A_PREDECESSOR && origin === B0A_PREDECESSOR && ahead === 0 && behind === 0;
const b0aFrozen = head !== B0A_PREDECESSOR && git("rev-parse", "HEAD^") === B0A_PREDECESSOR && origin === B0A_PREDECESSOR && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === B0A_SUBJECT;
const b0aPushed = head === "79b4f92e568ea37becbbe0b502c07ef857108813" && origin === "79b4f92e568ea37becbbe0b502c07ef857108813" && ahead === 0 && behind === 0;
const b0bFrozen = head !== "79b4f92e568ea37becbbe0b502c07ef857108813" && git("rev-parse", "HEAD^") === "79b4f92e568ea37becbbe0b502c07ef857108813" && origin === "79b4f92e568ea37becbbe0b502c07ef857108813"
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === "Add staff-native Admin branch mutation authority";
const b0bPushed = head === B1A_HEAD && origin === B1A_HEAD && ahead === 0 && behind === 0;
const b1aFrozen = head !== B1A_HEAD && git("rev-parse", "HEAD^") === B1A_HEAD && origin === B1A_HEAD
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === B1A_SUBJECT;
const b1aPushed = head === B1A_FREEZE_HEAD && origin === B1A_FREEZE_HEAD && ahead === 0 && behind === 0;
const b1bFrozen = head !== B1A_FREEZE_HEAD && git("rev-parse", "HEAD^") === B1A_FREEZE_HEAD && origin === B1A_FREEZE_HEAD
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === B1B_SUBJECT;
const B1B_FREEZE_HEAD = "922f1c6b89220723ac3cef118d8e172c67f64865";
const P3A_SUBJECT = "Add staff management authority foundation";
const b1bPushed = head === B1B_FREEZE_HEAD && origin === B1B_FREEZE_HEAD && ahead === 0 && behind === 0;
const p3aFrozen = head !== B1B_FREEZE_HEAD && git("rev-parse", "HEAD^") === B1B_FREEZE_HEAD && origin === B1B_FREEZE_HEAD
  && ahead === 1 && behind === 0 && status.length === 0 && git("log", "-1", "--format=%s") === P3A_SUBJECT;
const p3aPhase = b1bPushed || p3aFrozen;
const b1bPhase = b1aPushed || b1bFrozen || p3aPhase;
const b1aPhase = b0bPushed || b1aFrozen || b1bPhase;
const b0bPhase = b0aPushed || b0bFrozen || b1aPhase;
const b0aPhase = b0aCandidate || b0aFrozen || b0bPhase;
const p2dAPhase = pushed || p2dAFrozen || b0aPhase;
const allowed = new Set([...OWN, ...SUCCESSOR_AWARENESS, ...TEST_AWARENESS, ...(p2dAPhase ? P2D_A_PATHS : []), ...(b0aPhase ? B0A_PATHS : [])]);
const shadow = read(SHADOW), context = read(CONTEXT);
const runtime = shadow.slice(shadow.indexOf("export async function resolveAdminStaffAuthorityShadow"));
const comparator = shadow.slice(shadow.indexOf("export function compareAdminStaffAuthorityShadow"), shadow.indexOf("function emitAdminStaffAuthorityShadowDiagnostic"));
const diagnostics = shadow.slice(shadow.indexOf("export type AdminStaffAuthorityShadowDiagnostic"), shadow.indexOf("export async function resolveAdminStaffAuthorityShadow"));
const checks = [], failures = [];
function check(name, pass, detail) { const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) }; checks.push(item); if (!item.pass) failures.push(item); console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 1200)}`); }

check("exact P2B predecessor through exact P2D-A successor lifecycle", p3bSuccessor || candidate || frozen || p2dAPhase, { head, origin, ahead, behind, status });
check("P2C diff contains only exact bounded paths", p3bSuccessor || changed.every((file) => allowed.has(file)), changed.filter((file) => !allowed.has(file)));
for (const [file, digest] of FROZEN) check(`${path.basename(file)} remains hash-pinned`, sha(read(file)) === digest, sha(read(file)));
const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((file) => file.endsWith(".sql")).sort();
check("migration count is exact through bounded B0-A", p3bSuccessor || migrations.length === (p3aPhase ? 117 : b0bPhase ? 116 : b0aPhase ? 115 : 114), migrations.length);
check("latest migration is exact through bounded B0-B", p3bSuccessor || migrations.at(-1) === (p3aPhase ? path.basename(P3A_MIGRATION) : b0bPhase ? path.basename(B0B_MIGRATION) : b0aPhase ? path.basename(B0A_MIGRATION) : "20260912050000_staff_authority_p3_p6_p2b_platform_admin_compatibility.sql"), migrations.at(-1));
check("P2C migration boundary remains frozen", p3bSuccessor || lines(git("diff", "--name-only", B0A_PREDECESSOR, "--", "supabase/migrations")).every((file) => file === B0A_MIGRATION || (b0bPhase && file === B0B_MIGRATION) || (p3aPhase && file === P3A_MIGRATION)));
check("server-only shadow module exists", shadow.startsWith('import "server-only";'));
check("shadow env name is exact", /ADMIN_STAFF_AUTHORITY_SHADOW_ENV = "TASTKIND_ADMIN_STAFF_AUTHORITY_SHADOW"/.test(shadow));
check("shadow defaults disabled and enables only exact enabled", /return env\[ADMIN_STAFF_AUTHORITY_SHADOW_ENV\] === "enabled";/.test(shadow));
check("shadow config is not browser exposed", !/NEXT_PUBLIC/.test(shadow));
check("staff current-context RPC constant is exact and single", (shadow.match(/"staff_current_context_v1"/g) ?? []).length === 1);
check("staff predicate fan-out is absent", !/staff_has_permission_v1/.test(shadow) && !/STAFF_HAS_PERMISSION/.test(shadow));
check("shadow result states are bounded", ["disabled", "not_applicable", "match", "mismatch", "unavailable"].every((state) => shadow.includes(`state: "${state}"`)));
check("unavailable reasons are bounded", ["rpc_rejected", "rpc_unreachable", "malformed_response"].every((reason) => shadow.includes(`"${reason}"`)));
check("staff response requires an array", /if \(!Array\.isArray\(data\)\)/.test(shadow));
check("staff rows require an object and string current key", /typeof row !== "object"[\s\S]*row === null[\s\S]*!\("permission_key" in row\)[\s\S]*!isCurrentAdminPermissionKey\(row\.permission_key\)/.test(shadow));
check("staff rows are deduplicated and sorted", /new Set<CurrentAdminPermissionKey>\(\)[\s\S]*permissions\.add\(row\.permission_key\)[\s\S]*\[\.\.\.permissions\]\.sort\(\)/.test(shadow));
check("comparator uses final authoritative permissions", /new Set\(authoritativeContext\.permissions\)/.test(comparator));
check("comparator computes missing-from-staff exactly", /authoritativeContext\.permissions[\s\S]*!staffPermissions\.has\(permission\)/.test(comparator));
check("comparator computes extra-in-staff exactly", /staff\.permissions[\s\S]*!authoritativePermissions\.has\(permission\)/.test(comparator));
check("match requires both exact set differences empty", /missingFromStaff\.length === 0 && extraInStaff\.length === 0/.test(comparator));
check("disabled state returns before any RPC", /if \(!enabled \|\| authoritativeContext\.state !== "admin"\)[\s\S]*return compareAdminStaffAuthorityShadow\(authoritativeContext, null, enabled\);/.test(runtime));
check("non-admin shadow is not applicable", /authoritativeContext\.state !== "admin"[\s\S]*state: "not_applicable"/.test(shadow));
check("runtime calls only staff current-context once", /client\.rpc\(STAFF_CURRENT_CONTEXT_FUNCTION\)/.test(runtime) && (runtime.match(/client\.rpc\(/g) ?? []).length === 1);
check("staff shadow timeout is bounded and caught", /ADMIN_STAFF_AUTHORITY_SHADOW_TIMEOUT_MS = 1_500/.test(shadow) && /Promise\.race\([\s\S]*setTimeout\([\s\S]*clearTimeout\(timeout\)/.test(runtime));
check("RPC rejection is diagnostic only", /result\.error[\s\S]*reason: "rpc_rejected"/.test(runtime));
check("RPC throw is caught as unreachable", /catch \{[\s\S]*reason: "rpc_unreachable"/.test(runtime));
check("malformed response is unavailable", /!staff\.ok[\s\S]*reason: "malformed_response"/.test(comparator));
check("legacy final context is composed before shadow", /const authoritativeContext = resolveCurrentAdminPermissionContext\([\s\S]*await resolveAdminStaffAuthorityShadow\(client, authoritativeContext\)/.test(context));
check("authoritative legacy context is returned unchanged", context.includes("await resolveAdminStaffAuthorityShadow(client, authoritativeContext);\n  return authoritativeContext;"));
check("verified authority resolver remains legacy", /client\.rpc\(PLATFORM_ADMIN_CONTEXT_FUNCTION\)/.test(context));
check("Branch Status predicate remains legacy", /client\.rpc\(PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION/.test(context));
check("one auth.getUser call remains", (context.match(/auth\.getUser\(\)/g) ?? []).length === 1);
check("same verified client is reused for shadow", p3bSuccessor || b1bPhase
  ? /resolvePermissionsForIdentity\(request\.client, request\.identity\)/.test(context)
  : /resolvePermissionsForAuthority\(request\.client, request\.authority\)/.test(context));
check("getVerifiedAdminContext remains legacy context only", p3bSuccessor || b1bPhase
  ? /getVerifiedAdminContext = cache\(async \(\): Promise<PlatformAdminContext> =>[\s\S]*resolveLegacyAdminAuthority\(request\.client, request\.identity\)/.test(context)
  : /getVerifiedAdminContext = cache\(async \(\): Promise<PlatformAdminContext> =>[\s\S]*\.authority\.context/.test(context));
check("getVerifiedAdminPermissionContext return type is unchanged", /getVerifiedAdminPermissionContext = cache\(async \(\): Promise<CurrentAdminPermissionContext>/.test(context));
check("shadow is not compared with legacy DTO", !/platform_admin_current_context_v1|PlatformAdminContextRow|membershipContext/.test(shadow));
check("shadow result is not returned by public context APIs", !/AdminStaffAuthorityShadowResult/.test(context));
check("mismatch and unavailable logging is server-only", /admin_staff_authority_shadow_mismatch/.test(diagnostics) && /admin_staff_authority_shadow_unavailable/.test(diagnostics));
check("match emits no log", !/state === "match"[\s\S]*warn\(/.test(diagnostics));
check("diagnostic transport failure is caught", /function emitAdminStaffAuthorityShadowDiagnostic[\s\S]*try \{[\s\S]*\} catch \{/.test(shadow));
check("diagnostics contain no identity session or raw error", !/subject|email|jwt|cookie|authorization|access.?token|refresh.?token|raw.?error/i.test(diagnostics));
check("no client shadow surface is introduced", !/localStorage|response.?header|query.?parameter|debug.?page|browser.?banner|data-admin-shadow/i.test(shadow));
check("no persistent shadow log exists", !/insert|upsert|from\(|schema|migration|audit_log/i.test(shadow));
const unchangedPaths = [
  "apps/admin-web/auth/admin-current-permission-vocabulary.ts",
  "apps/admin-web/auth/admin-route-authorization.ts",
  "apps/admin-web/auth/admin-navigation-visibility.ts",
  "apps/admin-web/auth/admin-api-authorization.ts",
  "apps/admin-web/auth/admin-session-gate.ts",
  "apps/admin-web/auth/admin-route-registry.ts"
];
for (const file of unchangedPaths) check(`${path.basename(file)} remains unchanged or is an exact P2D-A successor seam`, p3bSuccessor || !changed.includes(file) || (p2dAPhase && P2D_A_APP_PATHS.includes(file)));
const vocabulary = read("apps/admin-web/auth/admin-current-permission-vocabulary.ts");
const currentKeys = [...vocabulary.matchAll(/"(admin[_.][a-z0-9_.]+)"/g)].map((match) => match[1]);
check("current permission vocabulary remains exact three", p3bSuccessor || JSON.stringify(currentKeys) === JSON.stringify(["admin_audit.read", "admin_context.read", "admin_restaurant_branch.status.write"]), currentKeys);
check("no Admin page or route-body changes outside exact P2D-A seams", p3bSuccessor || changed.filter((file) => /^apps\/admin-web\/(?:app|components)\//.test(file)).every((file) => p2dAPhase && P2D_A_APP_PATHS.includes(file)));
check("no mobile restaurant-web package or function changes", !changed.some((file) => /^(?:apps\/(?:mobile|restaurant-web)|packages|functions)\//.test(file)));
const pkg = JSON.parse(read("package.json"));
check("P2C package scripts are exact", pkg.scripts?.["test:staff-authority-p3-p6-p2c"] === "node scripts/staff-authority-p3-p6-p2c-guard.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2c-smoke"] === "node scripts/staff-authority-p3-p6-p2c-smoke.mjs" && pkg.scripts?.["test:staff-authority-p3-p6-p2c-mutations"] === "node scripts/staff-authority-p3-p6-p2c-mutations.mjs");
check("dependencies and lockfiles remain unchanged", JSON.stringify(pkg.dependencies ?? {}) === JSON.stringify(JSON.parse(git("show", `${PREDECESSOR}:package.json`)).dependencies ?? {}) && !changed.some((file) => /lock/i.test(file)));
check("bounded predecessor guards recognize exact P2C predecessor", changed.filter((file) => SUCCESSOR_AWARENESS.includes(file)).every((file) => read(file).includes(PREDECESSOR) && read(file).includes(SHADOW)));
check("legacy smoke awareness only stubs the server shadow", changed.filter((file) => TEST_AWARENESS.includes(file)).every((file) => read(file).includes('request === "./admin-staff-authority-shadow"')));
const implementationText = changed.filter((file) => file.startsWith("apps/") || file === "package.json").filter((file) => fs.existsSync(file)).map(read).join("\n");
check("no Development history repair or Production config", !/schema_migrations|supabase db push|migration repair|tastkind-development|production secret/i.test(implementationText));
const changedText = changed.filter((file) => fs.existsSync(file)).map(read).join("\n");
check("changed files contain no credential-shaped value", ![/github_pat_[A-Za-z0-9_]{20,}/, /gh[pousr]_[A-Za-z0-9]{20,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /sk-[A-Za-z0-9_-]{20,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/].some((pattern) => pattern.test(changedText)));

console.log("\n" + JSON.stringify({ suite: "staff-authority-p3-p6-p2c-guard", phase: candidate ? "candidate" : frozen ? "frozen_local" : pushed ? "pushed" : p2dAFrozen ? "p2d_a_frozen_local" : "invalid", total: checks.length, passed: checks.length - failures.length, failed: failures.length, failures: failures.map((item) => item.name), changedPaths: changed, migrationCount: migrations.length, developmentAccessed: false, productionAccessed: false, pushed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
