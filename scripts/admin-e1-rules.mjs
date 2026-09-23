import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

const ROOT = process.cwd();
export const BASELINE = "d88d1000a26810dfca0f70586f11e594b3a2e44a";
export const ROUTES = Object.freeze({
  "": ["redirect", "/admin"], "login": ["redirect", "/admin/login"],
  "pending-menu-items": ["redirect", "/admin/restaurants/menu-management/pending"],
  "data-quality": ["redirect", "/admin/restaurants/menu-management/data-quality"],
  "nutrition-review": ["redirect", "/admin/nutrition/certification/pending"],
  "audit-trail": ["redirect", "/admin/audit/platform-memberships"],
  "settings": ["redirect", "/admin/management/settings"],
  "ad-review": ["unavailable"], "sponsored": ["unavailable"],
  "verification": ["unavailable"], "duplicate-menu-items": ["unavailable"],
  "alias-review": ["unavailable"], "identification-audit": ["unavailable"],
  "social-governance": ["unavailable"], "self-cooked-audit": ["unavailable"],
  "consents": ["unavailable"], "esg": ["unavailable"],
  "exercise-governance": ["unavailable"], "data-access": ["unavailable"],
  "menu-review": ["gateway", "/admin/restaurants", "/admin/restaurants/menu-management/data-quality", "/admin/nutrition/certification/pending"],
  "tags": ["gateway", "/admin/restaurants/menu-management/data-quality", "/admin/social/policies"],
  "restaurant-review": ["gateway", "/admin/restaurants"]
});
export const FILES = Object.freeze({
  registry: "apps/admin-web/auth/admin-route-registry.ts",
  shell: "apps/admin-web/components/AdminShell.tsx",
  gateway: "apps/admin-web/components/LegacyAdminGateway.tsx",
  runtime: "apps/admin-web/server/adminStepUpRuntime.ts",
  broker: "apps/admin-web/server/adminStepUpBroker.ts",
  receipt: "supabase/migrations/20260916020000_staff_management_p3_p6_p3h_step_up_authority.sql",
  cors: "supabase/functions/meal-photo-analysis/cors.ts",
  index: "supabase/functions/meal-photo-analysis/index.ts",
  matrix: "docs/deployment-local-access-matrix.md",
  attrs: ".gitattributes",
  inventory: "docs/admin-operational-surface-inventory.md",
  registers: "docs/engineering-state-registers.md",
  handoff: "docs/engineering-handoff.md"
});
export function readSources() {
  const source = Object.fromEntries(Object.entries(FILES).map(([key,file]) => [key, fs.readFileSync(path.join(ROOT,file),"utf8")]));
  source.pages = Object.fromEntries(Object.keys(ROUTES).map((route) => [route, fs.readFileSync(path.join(ROOT,"apps/admin-web/app",route,"page.tsx"),"utf8")]));
  return source;
}
export function baselineFile(file) {
  const result = cp.spawnSync("git", ["show", `${BASELINE}:${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Cannot read baseline ${file}`);
  return result.stdout;
}
export function validateAdminE1(s, baseline) {
  const failures = [];
  const check = (pass, label) => { if (!pass) failures.push(label); };
  check(Object.keys(ROUTES).length === 22 && Object.keys(s.pages).sort().join("|") === Object.keys(ROUTES).sort().join("|"), "exact 22-route inventory");
  for (const [route, rule] of Object.entries(ROUTES)) {
    const page = s.pages[route] ?? "";
    const label = route || "/";
    check(!/mock[A-Z]|@haocu\/shared|\/services\/|\/repositories\/|AdminShell|adminRestaurantMockAdapter|getGovernanceSummary|list[A-Z]/.test(page), `${label} has no mock/legacy data path`);
    if (rule[0] === "redirect") check(page.includes(`redirect("${rule[1]}")`) && !/LegacyAdminGateway/.test(page), `${label} redirects to live successor`);
    if (rule[0] === "unavailable") check(page.includes("LegacyAdminGateway") && page.includes("unavailable=") && !page.includes("successors="), `${label} is unavailable with no data`);
    if (rule[0] === "gateway") {
      check(page.includes("LegacyAdminGateway") && rule.slice(1).every((href) => page.includes(`href: "${href}"`)) &&
        (page.match(/href: "/g) ?? []).length === rule.length - 1, `${label} links only to live successors`);
      if (route !== "menu-review") check(page.includes("unavailable="), `${label} discloses deferred scope`);
    }
  }
  check(s.gateway.includes("存取權限由各正式頁面驗證") && !/mock[A-Z]|@haocu\/shared|\/services\//.test(s.gateway), "gateway is data-free and points to canonical authority");
  check(s.registry === baseline.registry && s.shell === baseline.shell, "canonical registry and frozen inactive legacy nav unchanged");
  check(/const verificationTime = await readAdminStepUpDatabaseTime\(\)/.test(s.runtime)
    && s.runtime.indexOf("challengeAndVerify(input)") < s.runtime.indexOf("readAdminStepUpDatabaseTime()")
    && s.runtime.indexOf("readAdminStepUpDatabaseTime()") < s.runtime.indexOf("issueAdminStepUpReceipt({")
    && /verificationTime\.state !== "ready"/.test(s.runtime)
    && /const verifiedAt = verificationTime\.value/.test(s.runtime)
    && !/Date\.now\(\)\s*[-+]\s*\d{3,}|new Date\(Date\.now\(\)/.test(s.runtime), "AAL2 uses fail-closed database clock after challenge, before issuance");
  check(/select pg_catalog\.clock_timestamp\(\) as verified_at/.test(s.broker)
    && /if \(!pool\) return Object\.freeze\(\{ state: "unavailable"/.test(s.broker), "broker reads database clock without alternate grant");
  check(s.receipt === baseline.receipt && /issued_at >= verified_at\s+and expires_at = issued_at \+ interval '15 minutes'/.test(s.receipt)
    && /v_now >= v_receipt\.expires_at/.test(s.receipt)
    && /step_up_actor_mismatch/.test(s.receipt) && /step_up_session_mismatch/.test(s.receipt), "fixed window, expiry, subject and SQL gates unchanged");
  check(s.cors === baseline.cors && s.index === baseline.index && !s.cors.includes("haocu-demo.vercel.app"), "CORS source unchanged, no wildcard or hard-coded Demo origin");
  check(s.attrs.trim() === "* text=auto eol=lf", "minimal LF text policy");
  const preE2Matrix = s.matrix.includes("MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS=https://haocu-demo.vercel.app")
    && s.matrix.includes("https://haocu-demo.vercel.app/")
    && s.matrix.includes("PENDING_CLAUDE_LIVE_DISCOVERY")
    && s.matrix.includes("tastkind-development")
    && s.matrix.includes("msbgnnoorsoefuiwluye")
    && !/tastkind-production|production\.supabase\.co/i.test(s.matrix)
    && !/https:\/\/[^\s|`]*?(?:restaurant|admin)[^\s|`]*?\.vercel\.app/i.test(s.matrix);
  check(preE2Matrix || validateAdminE2R(s).length === 0,
    "matrix is exact pre-E2 handoff or exact E2R discovered transition");
  check(!/(?:password|totp_secret|service_role_key|recovery_secret)\s*[:=]\s*[^\s`]+/i.test(s.matrix+s.inventory+s.registers+s.handoff), "no Demo credential in E1 documentation");
  check(s.matrix.includes("Access-Control-Allow-Origin: *") && /no wildcard/i.test(s.matrix)
    && (preE2Matrix ? s.matrix.includes("Only then deploy/redeploy") : s.matrix.includes("before deployment")),
    "CORS handoff preserves exact origin and config-before-deploy order");
  check(s.inventory.includes("Remaining mock-backed Admin **user-facing root surfaces: zero**") && s.registers.includes("ADMIN-E1 local closure") && s.handoff.includes("ADMIN-E1 local handoff"), "inventory/register/handoff updated");
  return failures;
}

export const E2R_DEMO_URLS = Object.freeze({
  Consumer: "https://haocu-demo.vercel.app",
  Restaurant: "https://ai-nutrition-social-app-restaurant.vercel.app",
  Admin: "https://tastkind-admin-demo.vercel.app"
});
export const E2R_PRIMARY_STEPS = Object.freeze([
  "admin.management.read", "admin.management.staff.read", "admin.management.permissions.read",
  "admin.management.staff.account.write", "admin.management.staff.delegation.write",
  "admin.management.staff.console_admission.write", "admin.management.staff.permission.write", "admin_context.read"
]);

// Source-only E2R handoff contract. It records accepted evidence without probing a remote system.
export function validateAdminE2R(s) {
  const failures = [];
  const check = (pass, label) => { if (!pass) failures.push(label); };
  const matrix = s.matrix ?? "", registers = s.registers ?? "", handoff = s.handoff ?? "";
  const docs = `${matrix}\n${registers}\n${handoff}`;
  const remoteSource = BASELINE;
  const rows = Object.fromEntries(["Consumer", "Restaurant", "Admin"].map((surface) => [surface,
    matrix.split("\n").find((line) => line.startsWith(`| ${surface} |`)) ?? ""]));
  for (const [surface, url] of Object.entries(E2R_DEMO_URLS)) {
    const cells = rows[surface].split("|").map((part) => part.trim());
    check(cells[2] === `\`${url}\`` && cells[3] === `\`${remoteSource}\``,
      `${surface} exact fixed URL and pre-push remote source`);
  }
  const actualUrls = new Set([...matrix.matchAll(/https:\/\/[a-z0-9.-]+\.vercel\.app\b/g)].map((m) => m[0]));
  check(actualUrls.size === 3 && [...actualUrls].every((url) => Object.values(E2R_DEMO_URLS).includes(url)),
    "only three exact Demo hosts");
  check(matrix.includes("PUSH_REQUIRED_FOR_FIXED_DEMO") && matrix.includes("local freeze commit remains unpushed")
    && !/E1 (?:already |is )?remotely deployed|ADMIN-E1 deployed/i.test(matrix),
    "E1 remains local and a push is required");
  check([matrix, registers, handoff].every((doc) => doc.includes("WAITING_FOR_DEPLOYMENT_ENABLEMENT_AND_PRIMARY_RECOVERY"))
    && matrix.includes("ADMIN-E2 PARTIAL"), "E2 remains partial across handoff documents");
  check(matrix.includes("msbgnnoorsoefuiwluye") && matrix.includes("tastkind-development")
    && !/tastkind-production|production\.supabase\.co/i.test(docs),
    "Development backend is exact and Production backend is not substituted");
  check(matrix.includes("environment marker `development`") && matrix.includes("v44 → v45")
    && matrix.includes("verify_jwt = true") && matrix.includes("11/11 PASS")
    && matrix.includes("Consumer in-origin E2E passed") && matrix.includes("zero direct browser requests to `api.openai.com`")
    && matrix.includes("Temporary Consumer fixtures were cleaned"),
    "Consumer accepted CORS and in-origin evidence");
  check(matrix.includes("GLOBAL_QA_PERFORMANCE_DEBT") && matrix.includes("visual acceptance is **PENDING**")
    && matrix.includes("four approximately 7.1 MB") && matrix.includes("about 28 MB total"),
    "Consumer visual acceptance remains pending with font debt");
  check(rows.Restaurant.includes("307 → /login?reason=session")
    && rows.Restaurant.includes("NOT YET LIVE-PROVEN") && rows.Restaurant.includes("no Supabase ref or server secret"),
    "Restaurant session redirect and backend-linkage limit");
  check(rows.Admin.includes("/admin → /admin/login?error=configuration")
    && rows.Admin.includes("missing or invalid") && rows.Admin.includes("no secret leakage"),
    "Admin configuration blocker remains open");
  check(["TASTKIND_SUPABASE_URL", "TASTKIND_SUPABASE_PUBLISHABLE_KEY", "TASTKIND_ADMIN_AUTHORITY_MODE"]
    .every((name) => matrix.includes(`\`${name}\``))
    && matrix.includes("authority mode is **staff**")
    && !/TASTKIND_(?:SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|ADMIN_AUTHORITY_MODE)\s*=/.test(docs),
    "Admin environment names and staff mode, without values");
  check([matrix, registers, handoff].every((doc) => doc.includes("NOT PRIMARY READY"))
    && matrix.includes("Current founder status: NOT PRIMARY READY")
    && matrix.includes("active Platform Admin compatibility membership")
    && matrix.includes("`admin_context.read`, `admin_audit.read`, `admin_restaurant_branch.status.write`")
    && matrix.includes("no MFA factor"), "founder current authority is not falsely Primary Ready");
  const steps = [...matrix.matchAll(/^\| ([1-8]) \| (.+) \|$/gm)];
  check(steps.length === 8 && steps.every((match, index) => Number(match[1]) === index + 1
    && match[2].startsWith(`\`${E2R_PRIMARY_STEPS[index]}\``))
    && steps[6]?.[2].includes("explicit high-privilege confirmation phrase required")
    && steps[7]?.[2].includes("through canonical console admission"),
    "exact eight-step Primary wizard with permission.write confirmation");
  check(matrix.includes("live permission catalogue") && matrix.includes("`readiness_status = current`")
    && matrix.includes("`lifecycle_status = active`") && matrix.includes("`deferred = false`")
    && matrix.includes("Never grant PLANNED or deferred permissions")
    && matrix.includes("canonical privileged-permission flows")
    && matrix.includes("no direct table `INSERT`/`UPDATE`"),
    "current active non-deferred operational grants only");
  check(matrix.includes("ZERO usable PRIMARY READY accounts")
    && matrix.includes("solely to recover or create the first normal Primary")
    && matrix.includes("Break-glass must then be fully closed")
    && matrix.includes("founder must operate independently through normal Primary authority")
    && matrix.includes("must not persist as ordinary authority"),
    "Break-glass limited to first-Primary recovery and closure");
  check(matrix.includes("/admin/management/staff") && matrix.includes("RPC does not leak staff rows"),
    "lower-privilege no-data management read remains accepted");
  check(matrix.includes("Five obsolete `admin-a.acceptance.*` fixtures")
    && matrix.includes("7 → 2") && matrix.includes("470 → 475")
    && matrix.includes("founder authority hashes were unchanged"),
    "old ADMIN-A fixture cleanup is recorded without rerunning it");
  check(!/(?:password|totp_secret|service_role_key|recovery_secret|TASTKIND_P3H_BROKER_DATABASE_URL)\s*[:=]\s*[^\s`]+/i.test(docs)
    && !/sb_secret_[a-z0-9]+|service_role\s*=|BEGIN (?:RSA |EC )?PRIVATE KEY/i.test(docs),
    "no credential or private environment value in tracked handoff");
  return failures;
}
