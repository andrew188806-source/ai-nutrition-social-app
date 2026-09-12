#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";

const PREDECESSOR = "a3acc21a7eec4ba8051f30bcb7b470a2b2770551";
const SUBJECT = "Add Admin browser session gate";
const P3_P1_HEAD = "a75412a3da1cdf52c37732864975ad926da067f6";
const P3_P2_SUBJECT = "Resolve current Admin permissions";
const P3_P2_HEAD = "ab59cdc13317ee70482ae168923ac45f9b016906";
const P3_P3_SUBJECT = "Enforce current Admin route permissions";
const P3_P3_HEAD = "abb747551a9dd5c97988b44cff0c16f6f555eed8";
const P3_P4_SUBJECT = "Filter Admin navigation by current permissions";
const P3_P4_HEAD = "61256ade3bb8e92d57264bc9ef322f6a351825c4";
const P3_P5_SUBJECT = "Allow Admin APIs from browser sessions";
const P3_P5_HEAD = "2ddc6eadeb344d40cba57958874a808fb79dc19d";
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
const walk = (directory) => fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
  const target = path.posix.join(directory, entry.name);
  return entry.isDirectory() ? walk(target) : [target];
});
const checks = [];
const check = (name, pass, detail) => {
  const item = { name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) };
  checks.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!item.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 1000)}`);
};

const head = git("rev-parse", "HEAD");
const origin = git("rev-parse", "origin/main");
const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD").split(/\s+/).map(Number);
const status = git("status", "--short");
const candidate = head === PREDECESSOR && origin === PREDECESSOR && ahead === 0 && behind === 0;
const frozen = head !== PREDECESSOR && git("rev-parse", "HEAD^") === PREDECESSOR && origin === PREDECESSOR
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === SUBJECT && git("status", "--short") === "";
const pushed = head === P3_P1_HEAD && origin === P3_P1_HEAD && ahead === 0 && behind === 0;
const p3P2Frozen = head !== P3_P1_HEAD && git("rev-parse", "HEAD^") === P3_P1_HEAD && origin === P3_P1_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P2_SUBJECT && git("status", "--short") === "";
const p3P2Pushed = head === P3_P2_HEAD && origin === P3_P2_HEAD && ahead === 0 && behind === 0;
const p3P3Frozen = head !== P3_P2_HEAD && git("rev-parse", "HEAD^") === P3_P2_HEAD && origin === P3_P2_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P3_SUBJECT && git("status", "--short") === "";
const p3P3Pushed = head === P3_P3_HEAD && origin === P3_P3_HEAD && ahead === 0 && behind === 0;
const p3P4Frozen = head !== P3_P3_HEAD && git("rev-parse", "HEAD^") === P3_P3_HEAD && origin === P3_P3_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P4_SUBJECT && git("status", "--short") === "";
const p3P4Pushed = head === P3_P4_HEAD && origin === P3_P4_HEAD && ahead === 0 && behind === 0;
const p3P5Frozen = head !== P3_P4_HEAD && git("rev-parse", "HEAD^") === P3_P4_HEAD && origin === P3_P4_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P3_P5_SUBJECT && git("status", "--short") === "";
const p3P5R1Candidate = head === P3_P5_HEAD && origin === P3_P4_HEAD && ahead === 1 && behind === 0;
const p3P5R1Frozen = head !== P3_P5_HEAD && git("rev-parse", "HEAD^") === P3_P5_HEAD && origin === P3_P4_HEAD
  && ahead === 2 && behind === 0 && git("log", "-1", "--format=%s") === P3_P5_R1_SUBJECT && git("status", "--short") === "";
const p1aCandidate = head === P3_P5_R1_HEAD && origin === P3_P5_R1_HEAD && ahead === 0 && behind === 0;
const p1aFrozen = head !== P3_P5_R1_HEAD && git("rev-parse", "HEAD^") === P3_P5_R1_HEAD && origin === P3_P5_R1_HEAD
  && ahead === 1 && behind === 0 && git("log", "-1", "--format=%s") === P1A_SUBJECT && git("status", "--short") === "";
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
const p3P5R1Phase = p3P5R1Candidate || p3P5R1Frozen || p1aPhase;
const p3P5Phase = p3P4Pushed || p3P5Frozen || p3P5R1Phase;
const p3P2Phase = pushed || p3P2Frozen || p3P2Pushed || p3P3Frozen || p3P3Pushed || p3P4Frozen || p3P5Phase;
check("baseline predecessor through the exact P3-P5 successor is recognized", candidate || frozen || p3P2Phase, { head, origin, ahead, behind });

const adminPackage = JSON.parse(read("apps/admin-web/package.json"));
const predecessorPackage = JSON.parse(git("show", `${PREDECESSOR}:apps/admin-web/package.json`));
check("Admin pins @supabase/ssr 0.12.3", adminPackage.dependencies?.["@supabase/ssr"] === "0.12.3");
check("Admin pins @supabase/supabase-js 2.110.6", adminPackage.dependencies?.["@supabase/supabase-js"] === "2.110.6");
const expectedDependencies = { ...predecessorPackage.dependencies, "@supabase/ssr": "0.12.3", "@supabase/supabase-js": "2.110.6" };
check("no unrelated Admin dependency changed", JSON.stringify(adminPackage.dependencies) === JSON.stringify(Object.fromEntries(Object.entries(expectedDependencies).sort()))
  || Object.entries(expectedDependencies).every(([key, value]) => adminPackage.dependencies?.[key] === value)
    && Object.keys(adminPackage.dependencies ?? {}).length === Object.keys(expectedDependencies).length);
check("Next and React versions are unchanged", ["next", "react", "react-dom"].every((key) => adminPackage.dependencies[key] === predecessorPackage.dependencies[key]));

const lock = JSON.parse(read("package-lock.json"));
const predecessorLock = JSON.parse(git("show", `${PREDECESSOR}:package-lock.json`));
const authorizedLockPrefixes = [
  "apps/admin-web/node_modules/@supabase/ssr",
  "apps/admin-web/node_modules/@supabase/supabase-js"
];
const normalizedAdminLockEntry = structuredClone(lock.packages["apps/admin-web"]);
delete normalizedAdminLockEntry.dependencies["@supabase/ssr"];
delete normalizedAdminLockEntry.dependencies["@supabase/supabase-js"];
const unauthorizedLockEntries = [...new Set([
  ...Object.keys(predecessorLock.packages),
  ...Object.keys(lock.packages)
])].filter((key) => {
  if (key === "apps/admin-web") {
    return JSON.stringify(normalizedAdminLockEntry) !== JSON.stringify(predecessorLock.packages[key]);
  }
  if (authorizedLockPrefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}/`))) {
    return predecessorLock.packages[key] !== undefined || lock.packages[key] === undefined;
  }
  return JSON.stringify(lock.packages[key]) !== JSON.stringify(predecessorLock.packages[key]);
});
check("lockfile churn is limited to the two Admin Supabase dependencies", unauthorizedLockEntries.length === 0, unauthorizedLockEntries);

const serverClient = read("apps/admin-web/auth/supabase-server.ts");
const authConfig = read("apps/admin-web/config/admin-auth.ts");
const context = read("apps/admin-web/auth/admin-context.ts");
const gate = read("apps/admin-web/auth/admin-session-gate.ts");
const cookies = read("apps/admin-web/auth/admin-auth-cookie.ts");
const loginAction = read("apps/admin-web/app/admin/login/actions.ts");
const loginPage = read("apps/admin-web/app/admin/login/page.tsx");
const middleware = read("apps/admin-web/middleware.ts");
const factory = read("apps/admin-web/components/admin-shell/AdminRegistryPage.tsx");
const shell = read("apps/admin-web/components/admin-shell/AdminShell.tsx");
const adminLayout = read("apps/admin-web/app/admin/layout.tsx");
const newAuthSources = [serverClient, authConfig, context, gate, cookies, loginAction, loginPage, middleware].join("\n");

check("Admin server client is server-only", serverClient.startsWith('import "server-only";'));
check("server client uses createServerClient and next cookies", serverClient.includes("createServerClient") && serverClient.includes('from "next/headers"'));
check("only publishable Admin configuration is used", authConfig.includes("TASTKIND_SUPABASE_PUBLISHABLE_KEY") && !newAuthSources.includes("TASTKIND_SUPABASE_SERVICE_ROLE_KEY"));
check("configuration fails closed without import-time throw", authConfig.includes('state: "unavailable"') && !/^throw /m.test(authConfig));
check("verified identity uses auth.getUser", serverClient.includes("auth.getUser()") && context.includes("client.auth.getUser()"));
check("email is not used by context authority", !context.toLowerCase().includes("email"));
check("existing resolvePlatformAdminContext is reused", context.includes("resolvePlatformAdminContext"));
check("existing current-context RPC constant is reused", context.includes("PLATFORM_ADMIN_CONTEXT_FUNCTION"));
check("protected pages are forced to request-time authorization", context.includes("unstable_noStore") && context.includes("noStore()"));
check("admin_context.read is mandatory", gate.includes('permissions.includes("admin_context.read")'));
check("unauthenticated is distinct", gate.includes('context.state === "unauthenticated"') && gate.includes('state: "redirect_login"'));
check("not_admin is distinct", gate.includes('context.state === "not_admin"') && gate.includes('state: "access_denied"'));
check("unavailable is distinct", gate.includes('context.state === "unavailable"') && gate.includes('state: "authority_unavailable"'));

check("login uses a server action", loginAction.startsWith('"use server";') && loginPage.includes("action={signInAdmin}"));
check("login accepts only email and password fields", loginPage.includes('name="email"') && loginPage.includes('name="password"'));
check("no public signup, reset, magic-link, OAuth, or SSO flow", !/signUp\s*\(|resetPassword|signInWithOtp|signInWithOAuth|sso/i.test(newAuthSources));
check("non-admin login clears the local Admin session", loginAction.indexOf("clearAdminSession(client)") < loginAction.indexOf('error=not_admin'));
check("sign-out action exists and is visible in the shell", loginAction.includes("export async function signOutAdmin") && shell.includes("action={signOutAdmin}"));

check("Admin cookie namespace is explicit and isolated", cookies.includes('"tastkind-admin-auth"') && !cookies.includes("tastkind_restaurant_selection"));
check("Admin cookies use root path, SameSite Lax, HttpOnly and production Secure", ['path: "/"', 'sameSite: "lax"', "httpOnly: true", "secure: isProduction"].every((value) => cookies.includes(value)));
check("no broad cookie Domain is configured", !/\bdomain\s*:\s*["'`]/i.test(cookies));
check("no manual token storage or query token", !/localStorage|sessionStorage|access[_-]?token.*searchParams|refresh[_-]?token.*searchParams/i.test(newAuthSources));
check("no Restaurant authority coupling", !/restaurant-access-context|selection-cookie|restaurant-owner|supabase-service-server/i.test(newAuthSources));

check("middleware refresh exists", middleware.includes("auth.getClaims()") && middleware.includes("response.cookies.set"));
check("middleware includes Admin login and avoids its redirect loop", middleware.includes('["/admin/:path*"]') && middleware.includes('entry.id === "admin-login"'));
check("middleware performs no DB role or permission decision", !/admin_context\.read|platform_admin_current_context|platform_admin_has_permission|\.rpc\s*\(/.test(middleware));
check("unknown Admin paths bypass auth transformation", middleware.includes("if (!routeMatch") && exists("apps/admin-web/app/admin/not-found.tsx"));

check("canonical page factory performs server authorization before content", factory.includes("await getVerifiedAdminContext()")
  && factory.indexOf("await getVerifiedAdminContext()") < factory.indexOf("<AdminShell")
  && factory.indexOf("await getVerifiedAdminContext()") < factory.indexOf("<AdminRegistryPage routeId={routeId}"));
check("canonical gate is server-side", !factory.startsWith('"use client"') && !gate.startsWith('"use client"'));
check("Sidebar shell renders only after the membership gate allows", !adminLayout.includes("AdminShell")
  && factory.indexOf("decision.state") < factory.indexOf("<AdminShell"));
const pages = walk("apps/admin-web/app/admin").filter((file) => file.endsWith("/page.tsx"));
const protectedPages = pages.filter((file) => file !== "apps/admin-web/app/admin/login/page.tsx");
const escapedPages = protectedPages.filter((file) => !read(file).includes("createAdminRegistryPage"));
check("every canonical protected page uses the shared factory", escapedPages.length === 0, escapedPages);
check("dashboard is protected", read("apps/admin-web/app/admin/page.tsx").includes('createAdminRegistryPage("dashboard")'));
check("contextual dynamic routes are protected", protectedPages.filter((file) => file.includes("[")).every((file) => read(file).includes("createAdminRegistryPage")));
check("login remains outside protected content factory", !loginPage.includes("createAdminRegistryPage") && !loginPage.includes("getVerifiedAdminContext"));
check("unknown-route component is byte-identical to predecessor", read("apps/admin-web/app/admin/not-found.tsx").trimEnd() === git("show", `${PREDECESSOR}:apps/admin-web/app/admin/not-found.tsx`).replace(/\r\n/g, "\n").trimEnd());

check("Sidebar is unfiltered in P3-P1 or consumes exact P3-P4 server visibility", (p3P3Pushed || p3P4Frozen || p3P5Phase)
  ? read("apps/admin-web/components/admin-shell/AdminSidebar.tsx").includes("buildAdminScaffoldNavigation(visibleRouteIds, linkRouteIds)")
  : read("apps/admin-web/components/admin-shell/AdminSidebar.tsx").includes("buildAdminScaffoldNavigation()"));
const predecessorRegistry = git("show", `${PREDECESSOR}:apps/admin-web/auth/admin-route-registry.ts`).replace(/\r\n/g, "\n");
const expectedP3P2Registry = predecessorRegistry
  .replace("/**", 'import {\n  CURRENT_ADMIN_PERMISSION_KEYS,\n  type CurrentAdminPermissionKey\n} from "./admin-current-permission-vocabulary";\n\nexport { CURRENT_ADMIN_PERMISSION_KEYS };\nexport type { CurrentAdminPermissionKey };\n\n/**')
  .replace('export const CURRENT_ADMIN_PERMISSION_KEYS = [\n  "admin_context.read",\n  "admin_audit.read",\n  "admin_restaurant_branch.status.write"\n] as const satisfies readonly AdminPermissionKey[];\n\n', "");
check("permission registry is historical or has only the exact P3-P2 vocabulary extraction", p3P2Phase
  ? read("apps/admin-web/auth/admin-route-registry.ts").trimEnd() === expectedP3P2Registry.trimEnd()
  : read("apps/admin-web/auth/admin-route-registry.ts").trimEnd() === predecessorRegistry.trimEnd());

const acceptedApis = [
  "apps/admin-web/app/api/platform-admin/audit/route.ts",
  "apps/admin-web/app/api/platform-admin/restaurant-branches/[branchId]/status/route.ts",
  "apps/admin-web/server/platformAdminAuditRuntime.ts",
  "apps/admin-web/server/platformAdminAuditRead.ts",
  "apps/admin-web/server/platformAdminAuditTransport.ts",
  "apps/admin-web/server/platformAdminBranchStatusRuntime.ts",
  "apps/admin-web/server/platformAdminBranchStatusTransport.ts",
  "apps/admin-web/server/platformAdminBranchStatusAuthority.ts"
];
const preservedBearerApis = acceptedApis.filter((file) => !file.endsWith("Runtime.ts"));
check("accepted Admin APIs remain bearer-compatible through exact P3-P5 composition", p3P5Phase
  ? preservedBearerApis.every((file) => read(file).trimEnd() === git("show", `${PREDECESSOR}:${file}`).replace(/\r\n/g, "\n").trimEnd())
    && acceptedApis.filter((file) => file.endsWith("Runtime.ts")).every((file) => read(file).includes("resolveAdminApiAuthorization"))
  : acceptedApis.every((file) => read(file).trimEnd() === git("show", `${PREDECESSOR}:${file}`).replace(/\r\n/g, "\n").trimEnd()));
const changedMigrations = lines(git("diff", "--name-only", PREDECESSOR, "--", "supabase/migrations"));
check("no database migration changed except the exact P1A successor", changedMigrations.every((file) => p1aPhase && (file === P1A_MIGRATION || (p1bPhase && file === P1B_MIGRATION) || (p1cPhase && file === P1C_MIGRATION) || (p2aPhase && file === P2A_MIGRATION) || (p2bPhase && file === P2B_MIGRATION))), changedMigrations);

const changed = new Set([...lines(git("diff", "--name-only", PREDECESSOR)), ...lines(git("ls-files", "--others", "--exclude-standard"))]);
const allowed = (file) => file === "package.json" || file === "package-lock.json"
  || file === "apps/admin-web/package.json" || file === "apps/admin-web/middleware.ts"
  || file === "apps/admin-web/app/admin/layout.tsx"
  || file.startsWith("apps/admin-web/auth/") || file.startsWith("apps/admin-web/config/")
  || file.startsWith("apps/admin-web/app/admin/login/") || file.startsWith("apps/admin-web/components/admin-shell/")
  || file === "scripts/admin-session-p3-p1-guard.mjs" || file === "scripts/admin-session-p3-p1-smoke.mjs"
  || file === "scripts/admin-current-permissions-p3-p2-guard.mjs" || file === "scripts/admin-current-permissions-p3-p2-smoke.mjs"
  || file === "scripts/admin-route-authorization-p3-p3-guard.mjs" || file === "scripts/admin-route-authorization-p3-p3-smoke.mjs"
  || file === "scripts/admin-navigation-p3-p4-guard.mjs" || file === "scripts/admin-navigation-p3-p4-smoke.mjs"
  || file === "apps/admin-web/server/platformAdminAuditRuntime.ts"
  || file === "apps/admin-web/server/platformAdminBranchStatusRuntime.ts"
  || file === "scripts/admin-api-session-p3-p5-guard.mjs" || file === "scripts/admin-api-session-p3-p5-smoke.mjs"
  || file === "scripts/admin-api-session-p3-p5-r1-guard.mjs" || file === "scripts/admin-api-session-p3-p5-r1-smoke.mjs"
  || (p1aPhase && P1A_PATHS.includes(file))
  || (p1bPhase && P1B_PATHS.includes(file))
  || (p1cPhase && P1C_PATHS.includes(file))
  || (p2aPhase && P2A_PATHS.includes(file))
  || (p2bPhase && P2B_PATHS.includes(file))
  || ["scripts/admin-ia-p1-guard.mjs", "scripts/admin-ia-p2-guard.mjs", "scripts/admin-ia-p2-r1-guard.mjs", "scripts/admin-ia-p2-r2-guard.mjs"].includes(file);
const outOfScope = [...changed].filter((file) => !allowed(file));
check("diff is within the authorized P3-P1 boundary", outOfScope.length === 0, outOfScope);

const secretPatterns = [/sb_secret_[A-Za-z0-9_-]+/, /service_role\s*[:=]\s*["'][^"']+/i, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/];
check("changed sources contain no secret value pattern", !secretPatterns.some((pattern) => pattern.test([...changed].filter(exists).map(read).join("\n"))));

const failures = checks.filter((item) => !item.pass);
console.log("\n" + JSON.stringify({
  suite: "admin-session-p3-p1-guard",
  phase: candidate ? "candidate" : frozen ? "frozen_local" : pushed ? "p3_p1_pushed" : p3P2Frozen ? "p3_p2_frozen_local"
    : p3P2Pushed ? "p3_p2_pushed" : p3P3Frozen ? "p3_p3_frozen_local"
      : p3P3Pushed ? "p3_p3_pushed" : p3P4Frozen ? "p3_p4_frozen_local"
        : p3P4Pushed ? "p3_p4_pushed" : p3P5Frozen ? "p3_p5_frozen_local"
          : p3P5R1Candidate ? "p3_p5_r1_candidate" : p3P5R1Frozen ? "p3_p5_r1_frozen_local" : p1aCandidate ? "p1a_candidate" : p1aFrozen ? "p1a_frozen_local" : p1bCandidate ? "p1b_candidate" : p1bFrozen ? "p1b_frozen_local" : p1cCandidate ? "p1c_candidate" : p1cFrozen ? "p1c_frozen_local" : p2aCandidate ? "p2a_candidate" : p2aFrozen ? "p2a_frozen_local" : p2bCandidate ? "p2b_candidate" : p2bFrozen ? "p2b_frozen_local" : p1cPushed ? "p1c_pushed" : "invalid",
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  protectedCanonicalPages: protectedPages.length,
  changedPathCount: changed.size,
  failures
}, null, 2));
if (failures.length) process.exitCode = 1;
