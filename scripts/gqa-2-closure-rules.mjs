// GQA-2 source and behaviour rules. Local only: no network, no database, no environment secrets.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const GQA2_BASELINE = "8a166442b0ab11abe16559d857eeb1b4b9739407";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FILES = Object.freeze({
  vip: "apps/restaurant-web/app/vip/page.tsx",
  verification: "apps/restaurant-web/app/verification/page.tsx",
  notice: "apps/restaurant-web/components/runtime/DeferredCapabilityNotice.tsx",
  restaurantNav: "apps/restaurant-web/data/navigation.ts",
  restaurantShell: "apps/restaurant-web/components/DashboardShell.tsx",
  restaurantHome: "apps/restaurant-web/components/dashboard/DashboardHome.tsx",
  restaurantMiddleware: "apps/restaurant-web/middleware.ts",
  staffPage: "apps/admin-web/app/admin/management/staff/page.tsx",
  staffLoading: "apps/admin-web/app/admin/management/staff/loading.tsx",
  rosterState: "apps/admin-web/auth/admin-staff-roster-state.ts",
  wizard: "apps/admin-web/components/admin-shell/PrimaryWizard.tsx",
  wizardTarget: "apps/admin-web/auth/admin-primary-wizard-target.ts",
  detailPage: "apps/admin-web/app/admin/management/staff/[staffAccountId]/page.tsx"
});
export const PRIMARY_EIGHT = Object.freeze([
  "admin.management.read", "admin.management.staff.read", "admin.management.permissions.read",
  "admin.management.staff.account.write", "admin.management.staff.delegation.write",
  "admin.management.staff.console_admission.write", "admin.management.staff.permission.write", "admin_context.read"
]);

export function readGqa2Sources(root = ROOT) {
  return Object.fromEntries(Object.entries(FILES).map(([key, file]) => {
    const full = path.join(root, file);
    return [key, fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null];
  }));
}

const between = (source, start, end) => {
  const i = source.indexOf(start);
  if (i < 0) return "";
  const j = source.indexOf(end, i + start.length);
  return source.slice(i, j < 0 ? undefined : j);
};

/** Static source contract. Returns the list of failed check labels. */
export function validateGqa2(s) {
  const failures = [];
  const check = (pass, label) => { if (!pass) failures.push(label); };
  const text = (value) => value ?? "";

  // ---------------------------------------------------------------- Restaurant R1
  const fakeVip = /zhTW|vipMembers|vipBody|已同意|匿名會員|consent|insight|DashboardShell|\.map\(/;
  const fakeVerification = /zhTW|verificationStatus|verificationSteps|已送出|等待平台審核|審核中|已通過|DashboardShell|\.map\(/;
  check(s.vip !== null && /DeferredCapabilityNotice/.test(text(s.vip)) && /尚未啟用/.test(text(s.vip)) && !fakeVip.test(text(s.vip)),
    "R1 /vip route exists and renders only a truthful not-enabled notice (no members, consent or subscription state)");
  check(s.verification !== null && /DeferredCapabilityNotice/.test(text(s.verification)) && /尚未啟用/.test(text(s.verification))
    && !fakeVerification.test(text(s.verification)),
    "R1 /verification route exists and renders only a truthful not-enabled notice (no submission or review status)");
  check(s.notice !== null && /尚未啟用/.test(text(s.notice)) && !/<form|<button|<input|action=|fetch\(|\.rpc\(|\.from\(|onClick/.test(text(s.notice))
    && [...text(s.notice).matchAll(/href="([^"]+)"/g)].every((m) => m[1] === "/restaurant"),
    "R1 deferred notice has no controls, no data access and links only to the session-gated console");
  const restaurantSurfaces = [s.restaurantNav, s.restaurantShell, s.restaurantHome, s.vip, s.verification, s.notice].map(text).join("\n");
  check(!/["'`]\/(?:vip|verification)(?:[?#"'`/])/.test(restaurantSurfaces),
    "R1 current Restaurant navigation and cards do not advertise /vip or /verification as operational");
  check(/matcher:\s*\["\/",\s*"\/restaurant\/:path\*",\s*"\/login"\]/.test(text(s.restaurantMiddleware)),
    "R1 Restaurant session middleware scope unchanged");

  // ---------------------------------------------------------------- Admin A1
  const page = text(s.staffPage);
  const gateIndex = page.indexOf("if (!canRead) return resolveStaffRosterState");
  const rpcIndex = page.indexOf('.rpc("staff_management_list_staff_v1")');
  check(gateIndex > 0 && rpcIndex > gateIndex, "A1 a caller without staff-read is never sent to the roster read");
  check(/canRead=\{canReadStaffRoster\(context\.permissions\)\}/.test(page),
    "A1 staff-read decision comes from the verified permission context");
  const denied = between(page, 'roster.state === "permission_denied"', 'roster.state === "unavailable"');
  check(denied.length > 0 && /data-staff-roster-state="permission_denied"/.test(denied)
    && !/rows|length|staff_account_id|auth_user_id|\{roster|目前沒有人員帳號/.test(denied.replace('roster.state === "permission_denied"', "")),
    "A1 denied state renders no rows, count, identity or empty-success copy");
  check((page.match(/目前沒有人員帳號/g) ?? []).length === 1
    && /roster\.state === "authorized_empty"[\s\S]{0,400}目前沒有人員帳號/.test(page),
    "A1 empty-success copy appears only for an authorized empty roster");
  check(["permission_denied", "unavailable", "authorized_empty", "authorized_with_data"]
    .every((state) => page.includes(`data-staff-roster-state="${state}"`)),
    "A1 four distinct rendered roster states");
  check(s.staffLoading !== null && /data-staff-roster-state="loading"/.test(text(s.staffLoading))
    && !/\d|rows|length/.test(text(s.staffLoading).replace(/className="[^"]*"/g, "")),
    "A1 loading state exists and shows no count");
  check(/<LinkStaffAccountPanel \/>/.test(page), "A1 link-staff form (independently authorized) remains available");

  // ---------------------------------------------------------------- Admin A2
  const wizard = text(s.wizard);
  const keys = [...between(wizard, "export const PRIMARY_READY_KEYS = [", "] as const").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  check(JSON.stringify(keys) === JSON.stringify(PRIMARY_EIGHT), "A2 Primary exact eight-key set unchanged");
  check(wizard.includes("GRANT admin.management.staff.permission.write TO {staffAccountId}")
    && wizard.includes('permissionKey: "admin.management.staff.permission.write", phrase: confirmPhrase'),
    "A2 strong permission.write confirmation phrase unchanged");
  check(/<StepUpCard \/>/.test(wizard) && wizard.includes('submitMutation(\n    "grant_privileged_permission"')
    && wizard.includes('submitMutation("grant_console_admission"'),
    "A2 Step-Up card and the canonical P3F/P3E mutation lanes remain");
  const runStart = wizard.indexOf("const runFrom = useCallback(async () => {");
  const guard = wizard.indexOf("if (selfTargetBlocked)", runStart);
  const firstRun = wizard.indexOf("step.run(staffAccountId)", runStart);
  check(runStart > 0 && guard > runStart && firstRun > guard, "A2 a known self-target run stops before any mutation");
  check(/disabled=\{running \|\| ready \|\| selfTargetBlocked\}/.test(wizard), "A2 known self-target cannot submit");
  check(/const selfTargetBlocked = isPrimaryWizardSelfTargetBlocked\(targetRelation\)/.test(wizard)
    && /data-primary-wizard-self-target="blocked"/.test(wizard),
    "A2 known self-target shows a warning");
  check(/targetRelation = "unknown"/.test(wizard), "A2 an undetermined relation defaults to backend authority, not a guess");
  const detail = text(s.detailPage);
  check(/resolvePrimaryWizardTargetRelation\(\{\s*actorSubject,\s*targetAuthUserId: detail\?\.auth_user_id\s*\}\)/.test(detail)
    && /<PrimaryWizard staffAccountId=\{staffAccountId\} targetRelation=\{targetRelation\} \/>/.test(detail),
    "A2 relation uses the verified actor subject and the target's stable Auth user ID");
  return failures;
}

function loadTs(file, sourceOverride) {
  const require = createRequire(path.join(ROOT, "package.json"));
  const ts = require("typescript");
  const source = sourceOverride ?? fs.readFileSync(path.join(ROOT, file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports, Object, Array, JSON });
  return module.exports;
}

/** Behavioural contract of the pure helpers. Returns failed labels. */
export function behaviourGqa2(overrides = {}) {
  const failures = [];
  const check = (pass, label) => { if (!pass) failures.push(label); };
  let roster, target;
  try {
    roster = loadTs(FILES.rosterState, overrides.rosterState);
    target = loadTs(FILES.wizardTarget, overrides.wizardTarget);
  } catch (error) { return [`helpers load: ${String(error?.message ?? error).slice(0, 120)}`]; }
  const row = { staff_account_id: "11111111-1111-4111-8111-111111111111", auth_user_id: "22222222-2222-4222-8222-222222222222" };
  const deniedWithRows = roster.resolveStaffRosterState({ canRead: false, error: null, data: [row, row] });
  check(deniedWithRows.state === "permission_denied" && JSON.stringify(Object.keys(deniedWithRows)) === '["state"]'
    && !JSON.stringify(deniedWithRows).includes("1111"),
    "A1 denied state carries no rows, count or identity even if a payload exists");
  check(roster.resolveStaffRosterState({ canRead: false, error: { message: "x" }, data: null }).state === "permission_denied",
    "A1 denial is distinct from, and wins over, an error");
  check(roster.resolveStaffRosterState({ canRead: true, error: null, data: [] }).state === "authorized_empty",
    "A1 authorized empty roster");
  const withData = roster.resolveStaffRosterState({ canRead: true, error: null, data: [row] });
  check(withData.state === "authorized_with_data" && withData.rows.length === 1, "A1 authorized roster with data");
  check(roster.resolveStaffRosterState({ canRead: true, error: { message: "x" }, data: null }).state === "unavailable"
    && roster.resolveStaffRosterState({ canRead: true, error: null, data: null }).state === "unavailable"
    && roster.resolveStaffRosterState({ canRead: true, error: null, data: {} }).state === "unavailable",
    "A1 unavailable/error is distinct from denied and from empty");
  check(roster.canReadStaffRoster(["admin_context.read", "admin.management.staff.read"]) === true
    && roster.canReadStaffRoster(["admin_context.read", "admin.management.read"]) === false
    && roster.canReadStaffRoster(["admin.management.staff.read.extra"]) === false,
    "A1 roster read requires the exact existing staff-read key");
  const a = "33333333-3333-4333-8333-333333333333", b = "44444444-4444-4444-8444-444444444444";
  const rel = target.resolvePrimaryWizardTargetRelation;
  check(rel({ actorSubject: a, targetAuthUserId: a }) === "self" && rel({ actorSubject: a, targetAuthUserId: a.toUpperCase() }) === "self"
    && target.isPrimaryWizardSelfTargetBlocked("self") === true,
    "A2 deterministic self-target is detected and blocked");
  check(rel({ actorSubject: a, targetAuthUserId: b }) === "other" && target.isPrimaryWizardSelfTargetBlocked("other") === false,
    "A2 non-self target remains available");
  check(rel({ actorSubject: a, targetAuthUserId: null }) === "unknown" && rel({ actorSubject: a, targetAuthUserId: undefined }) === "unknown"
    && rel({ actorSubject: "not-a-uuid", targetAuthUserId: "not-a-uuid" }) === "unknown"
    && target.isPrimaryWizardSelfTargetBlocked("unknown") === false,
    "A2 undetermined target is not guessed; backend stays final authority");
  return failures;
}
