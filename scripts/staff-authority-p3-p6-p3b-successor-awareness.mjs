import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";

const P3B_PREDECESSOR = "5590b3dd287247ea3b26983cb393339b0affa63c";
const P3B_HEAD = "55b5c2caadb0fb050b4450f69d2358266876d4ca";
const P3B_SUBJECT = "Add staff account management operators";
const P3B_MIGRATION = "supabase/migrations/20260914020000_staff_management_p3_p6_p3b_account_operator.sql";
const P3A_MIGRATION = "supabase/migrations/20260914010000_staff_management_p3_p6_p3a_authority_foundation.sql";
const P3A_SHA = "7f24c439f5c052d1912516e8b3328a9b24e3df5977ad20eaefdc9758303c2611";
const VOCABULARY = "apps/admin-web/auth/admin-current-permission-vocabulary.ts";
const VOCABULARY_SHA = "a19c9415b127792dfe394a9563ad8a0dc8ed0b65923327496540d095eab20b3c";
const P3C_SUBJECT = "Add staff delegation management operators";
const P3C_MIGRATION = "supabase/migrations/20260914030000_staff_management_p3_p6_p3c_delegation_operator.sql";
const P3C_VOCABULARY_SHA = "657b13cdd67ad0b0b72b202a16fef4a34d1da695962e33e706815037282c0df6";
const P3D_SUBJECT = "Add delegated staff permission operators";
const P3D_MIGRATION = "supabase/migrations/20260914040000_staff_management_p3_p6_p3d_delegated_permission_operator.sql";
const P3E_SUBJECT = "Add dedicated staff console admission authority";
const P3E_MIGRATION = "supabase/migrations/20260915010000_staff_management_p3_p6_p3e_console_admission_operator.sql";
const P3E_VOCABULARY_SHA = "337068a7c2284944589c5d885618afdc52e2f464785e0d81cda28bb4af7217b3";
const P3F_SUBJECT = "Add privileged staff permission operators";
const P3F_MIGRATION = "supabase/migrations/20260915020000_staff_management_p3_p6_p3f_privileged_permission_operator.sql";
const P3F_VOCABULARY_SHA = "3f6d4407f867ddce09fc327dfdd3932739a490d147ba8d4d49a33ea2188d8b52";
const P3G_BASELINE = "13d89a50bc05c3992332b245d6c47e05f2fe392f";
const P3G_SUBJECT = "Add break-glass bootstrap control plane";
const P3G_MIGRATION = "supabase/migrations/20260915030000_staff_management_p3_p6_p3g_break_glass_control_plane.sql";
const P3G_PATHS = [
  P3G_MIGRATION,
  "package-lock.json",
  "package.json",
  "scripts/break-glass-control.mjs",
  "scripts/staff-authority-p3-p6-p3g-guard.mjs",
  "scripts/staff-authority-p3-p6-p3g-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3g-mutations.mjs",
  "scripts/staff-authority-p3-p6-p3g-postgres.mjs",
  "scripts/staff-authority-p3-p6-p3b-successor-awareness.mjs",
  "scripts/staff-authority-p3-p6-p3b-guard.mjs",
  "scripts/staff-authority-p3-p6-p3c-guard.mjs",
  "scripts/staff-authority-p3-p6-p3d-guard.mjs",
  "scripts/staff-authority-p3-p6-p3e-guard.mjs",
  "scripts/staff-authority-p3-p6-p3f-guard.mjs",
];
const P3G_R1_BASELINE = "79cccc2a3bb2584401757d4620d0135e5e754675";
const P3G_R1_SUBJECT = "Make break-glass extension collation-independent";
const P3G_R1_MIGRATION = "supabase/migrations/20260916010000_staff_management_p3_p6_p3g_r1_extend_collation_repair.sql";
const P3G_R1_PATHS = [
  P3G_R1_MIGRATION,
  "scripts/staff-authority-p3-p6-p3g-r1-guard.mjs",
  "scripts/staff-authority-p3-p6-p3g-r1-mutations.mjs",
];
const P3H_BASELINE = "042209feb9c0fac9992f6fcc09c1348ef8a6251d";
const P3H_SUBJECT = "Add high-privilege step-up authority";
const P3H_MIGRATION = "supabase/migrations/20260916020000_staff_management_p3_p6_p3h_step_up_authority.sql";
const P3H_PATHS = [
  P3H_MIGRATION,
  "apps/admin-web/app/admin/login/actions.ts",
  "apps/admin-web/app/api/admin/management/staff/mutations/route.ts",
  "apps/admin-web/app/api/admin/step-up/clear/route.ts",
  "apps/admin-web/app/api/admin/step-up/enroll/route.ts",
  "apps/admin-web/app/api/admin/step-up/enroll/verify/route.ts",
  "apps/admin-web/app/api/admin/step-up/factors/route.ts",
  "apps/admin-web/app/api/admin/step-up/status/route.ts",
  "apps/admin-web/app/api/admin/step-up/verify/route.ts",
  "apps/admin-web/auth/admin-step-up-authorization.ts",
  "apps/admin-web/auth/admin-step-up-cookie.ts",
  "apps/admin-web/package.json",
  "apps/admin-web/server/adminStepUpBroker.ts",
  "apps/admin-web/server/adminStepUpMutationRuntime.ts",
  "apps/admin-web/server/adminStepUpRuntime.ts",
  "package-lock.json",
  "package.json",
  "scripts/staff-authority-p3-p6-p3h-guard.mjs",
  "scripts/staff-authority-p3-p6-p3h-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3h-mutations.mjs",
  "scripts/staff-authority-p3-p6-p3h-postgres.mjs",
  "scripts/staff-authority-p3-p6-p3h-server.mjs",
  "scripts/staff-authority-p3-p6-p3a-guard.mjs",
  "scripts/staff-authority-p3-p6-p3b-successor-awareness.mjs",
  "scripts/staff-authority-p3-p6-p3b-guard.mjs",
  "scripts/staff-authority-p3-p6-p3c-guard.mjs",
  "scripts/staff-authority-p3-p6-p3d-guard.mjs",
  "scripts/staff-authority-p3-p6-p3e-guard.mjs",
  "scripts/staff-authority-p3-p6-p3f-guard.mjs",
  "scripts/staff-authority-p3-p6-p3g-guard.mjs",
  "scripts/staff-authority-p3-p6-p3g-r1-guard.mjs",
];

const P3H_HEAD = "5746ea7a712a86f7adbd0bfb9a36c460df9efb0d";
const P3I_MIGRATION = "supabase/migrations/20260916030000_staff_management_p3_p6_p3i_management_read_authority.sql";
const P3J_MIGRATION = "supabase/migrations/20260916040000_staff_management_p3_p6_p3j_security_audit_read_authority.sql";
const P3K_VOCABULARY_SHA = "2a423be65bf08eed819015633ac78f519e4f07985d9ba27c2e625036811438a3";
const P3K_SUBJECT = "Close Admin authority validation gaps";
export const P3K_MANAGEMENT_PAGES = Object.freeze([
  "apps/admin-web/app/admin/management/staff/page.tsx",
  "apps/admin-web/app/admin/management/staff/[staffAccountId]/page.tsx",
  "apps/admin-web/app/admin/management/permissions/page.tsx",
  "apps/admin-web/app/admin/management/security-log/page.tsx",
  "apps/admin-web/app/admin/management/settings/page.tsx",
]);
const P3K_PATHS = [
  P3I_MIGRATION,
  P3J_MIGRATION,
  ...P3K_MANAGEMENT_PAGES,
  "apps/admin-web/app/api/admin/management/staff/authority/route.ts",
  "apps/admin-web/auth/admin-current-permission-vocabulary.ts",
  "apps/admin-web/auth/admin-route-registry.ts",
  "apps/admin-web/components/admin-shell/AdminManagementPage.tsx",
  "apps/admin-web/components/admin-shell/AdminRegistryPage.tsx",
  "apps/admin-web/components/admin-shell/LinkStaffAccountPanel.tsx",
  "apps/admin-web/components/admin-shell/PrimaryWizard.tsx",
  "apps/admin-web/components/admin-shell/SecuritySettingsPanel.tsx",
  "apps/admin-web/components/admin-shell/StaffAuthorityPanel.tsx",
  "apps/admin-web/components/admin-shell/StepUpCard.tsx",
  "apps/admin-web/components/admin-shell/adminMutationClient.ts",
  "apps/admin-web/server/adminManagementReadRuntime.ts",
  "apps/admin-web/server/adminStepUpMutationRuntime.ts",
  "docs/admin-authority-sop-zh-tw.md",
  "docs/engineering-handoff.md",
  "scripts/staff-authority-p3-p6-p3h-guard.mjs",
  "scripts/staff-authority-p3-p6-p3b-successor-awareness.mjs",
  "scripts/staff-authority-p3-p6-p3i-guard.mjs",
  "scripts/staff-authority-p3-p6-p3i-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3i-mutations.mjs",
  "scripts/staff-authority-p3-p6-p3j-guard.mjs",
  "scripts/staff-authority-p3-p6-p3j-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3j-mutations.mjs",
  "scripts/staff-authority-p3-p6-p3k-guard.mjs",
  "scripts/staff-authority-p3-p6-p3k-postgres.mjs",
];

export const P3B_SUCCESSOR_PATHS = Object.freeze([
  P3B_MIGRATION,
  VOCABULARY,
  "package.json",
  "scripts/staff-authority-p3-p6-p3b-guard.mjs",
  "scripts/staff-authority-p3-p6-p3b-smoke.mjs",
  "scripts/staff-authority-p3-p6-p3b-mutations.mjs",
  "scripts/staff-authority-p3-p6-p3b-successor-awareness.mjs",
  "scripts/staff-authority-p3-p6-p1a-guard.mjs",
  "scripts/staff-authority-p3-p6-p1b-guard.mjs",
  "scripts/staff-authority-p3-p6-p1c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2b-guard.mjs",
  "scripts/staff-authority-p3-p6-p2c-guard.mjs",
  "scripts/staff-authority-p3-p6-p2c-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-a-smoke.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-a-mutations.mjs",
  "scripts/staff-authority-p3-p6-p2d-b0-b-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b1-a-guard.mjs",
  "scripts/staff-authority-p3-p6-p2d-b1-b-guard.mjs",
  "scripts/staff-authority-p3-p6-p3a-guard.mjs",
  "scripts/staff-authority-p3-p6-p3a-smoke.mjs",
  "scripts/admin-current-permissions-p3-p2-smoke.mjs",
  "scripts/admin-ia-p2-r2-guard.mjs",
  "scripts/admin-session-p3-p1-guard.mjs",
  "scripts/admin-current-permissions-p3-p2-guard.mjs",
  "scripts/admin-route-authorization-p3-p3-guard.mjs",
  "scripts/admin-navigation-p3-p4-guard.mjs",
  "scripts/admin-api-session-p3-p5-guard.mjs",
  "scripts/admin-api-session-p3-p5-r1-guard.mjs"
  ,P3C_MIGRATION
  ,"scripts/staff-authority-p3-p6-p3c-guard.mjs"
  ,"scripts/staff-authority-p3-p6-p3c-smoke.mjs"
  ,"scripts/staff-authority-p3-p6-p3c-mutations.mjs"
  ,P3D_MIGRATION
  ,"scripts/staff-authority-p3-p6-p3d-guard.mjs"
  ,"scripts/staff-authority-p3-p6-p3d-smoke.mjs"
  ,"scripts/staff-authority-p3-p6-p3d-mutations.mjs"
  ,P3E_MIGRATION
  ,"scripts/staff-authority-p3-p6-p3e-guard.mjs"
  ,"scripts/staff-authority-p3-p6-p3e-smoke.mjs"
  ,"scripts/staff-authority-p3-p6-p3e-mutations.mjs"
  ,P3F_MIGRATION
  ,"scripts/staff-authority-p3-p6-p3f-guard.mjs"
  ,"scripts/staff-authority-p3-p6-p3f-smoke.mjs"
  ,"scripts/staff-authority-p3-p6-p3f-mutations.mjs"
  ,...P3G_PATHS
  ,...P3G_R1_PATHS
  ,...P3H_PATHS
  ,...P3K_PATHS
]);

export function isBoundedP3BSuccessor(root = process.cwd()) {
  const git = (...args) => child.execFileSync("git", args, {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
  }).trim();
  const lines = (value) => value.split(/\r?\n/).filter(Boolean);
  const sha = (file) => crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(root, file))).digest("hex");
  try {
    const head = git("rev-parse", "HEAD");
    const origin = git("rev-parse", "origin/main");
    const [behind, ahead] = git("rev-list", "--left-right", "--count", "origin/main...HEAD")
      .split(/\s+/).map(Number);
    const status = lines(git("status", "--porcelain=v1"));
    const candidate = head === P3B_PREDECESSOR && origin === P3B_PREDECESSOR
      && ahead === 0 && behind === 0;
    const frozen = head !== P3B_PREDECESSOR
      && git("rev-parse", "HEAD^") === P3B_PREDECESSOR
      && origin === P3B_PREDECESSOR && ahead === 1 && behind === 0
      && status.length === 0 && git("log", "-1", "--format=%s") === P3B_SUBJECT;
    const p3cCandidate = head === P3B_HEAD && origin === P3B_HEAD
      && ahead === 0 && behind === 0;
    const p3cFrozen = head !== P3B_HEAD
      && git("rev-parse", "HEAD^") === P3B_HEAD
      && origin === P3B_HEAD && ahead === 1 && behind === 0
      && status.length === 0 && git("log", "-1", "--format=%s") === P3C_SUBJECT;
    const p3dCandidate = head === "1a17400e1ebbc219cb4968f275cfabeef7030c21"
      && origin === head && ahead === 0 && behind === 0;
    const p3dFrozen = head !== "1a17400e1ebbc219cb4968f275cfabeef7030c21"
      && git("rev-parse", "HEAD^") === "1a17400e1ebbc219cb4968f275cfabeef7030c21"
      && origin === "1a17400e1ebbc219cb4968f275cfabeef7030c21"
      && ahead === 1 && behind === 0 && status.length === 0
      && git("log", "-1", "--format=%s") === P3D_SUBJECT;
    const p3eCandidate = head === "a384e9769556873105f06c15f88560ba4ab361d1"
      && origin === head && ahead === 0 && behind === 0;
    const p3eFrozen = head !== "a384e9769556873105f06c15f88560ba4ab361d1"
      && git("rev-parse", "HEAD^") === "a384e9769556873105f06c15f88560ba4ab361d1"
      && origin === "a384e9769556873105f06c15f88560ba4ab361d1"
      && ahead === 1 && behind === 0 && status.length === 0
      && git("log", "-1", "--format=%s") === P3E_SUBJECT;
    const p3fCandidate = head === "7139b2b14b19cb7033301c19a8f6700f3e1b6d34"
      && origin === head && ahead === 0 && behind === 0;
    const p3fFrozen = head !== "7139b2b14b19cb7033301c19a8f6700f3e1b6d34"
      && git("rev-parse", "HEAD^") === "7139b2b14b19cb7033301c19a8f6700f3e1b6d34"
      && origin === "7139b2b14b19cb7033301c19a8f6700f3e1b6d34"
      && ahead === 1 && behind === 0 && status.length === 0
      && git("log", "-1", "--format=%s") === P3F_SUBJECT;
    const p3gCandidate = head === P3G_BASELINE && origin === P3G_BASELINE
      && ahead === 0 && behind === 0;
    const p3gFrozen = head !== P3G_BASELINE
      && git("rev-parse", "HEAD^") === P3G_BASELINE
      && origin === P3G_BASELINE && ahead === 1 && behind === 0
      && status.length === 0 && git("log", "-1", "--format=%s") === P3G_SUBJECT;
    const p3gR1Candidate = head === P3G_R1_BASELINE && origin === P3G_BASELINE
      && ahead === 1 && behind === 0;
    const p3gR1Frozen = head !== P3G_R1_BASELINE
      && git("rev-parse", "HEAD^") === P3G_R1_BASELINE
      && origin === P3G_BASELINE && ahead === 2 && behind === 0
      && status.length === 0 && git("log", "-1", "--format=%s") === P3G_R1_SUBJECT;
    const p3hCandidate = head === P3H_BASELINE && origin === P3H_BASELINE
      && ahead === 0 && behind === 0;
    const p3hFrozen = head !== P3H_BASELINE
      && git("rev-parse", "HEAD^") === P3H_BASELINE
      && origin === P3H_BASELINE && ahead === 1 && behind === 0
      && status.length === 0 && git("log", "-1", "--format=%s") === P3H_SUBJECT;
    const p3kCandidate = head === "1f257b47137460066713c7ea73a0bdca6a61a629"
      && origin === P3H_HEAD && ahead === 12 && behind === 0;
    const p3kFrozen = head !== "1f257b47137460066713c7ea73a0bdca6a61a629"
      && git("rev-parse", "HEAD^") === "1f257b47137460066713c7ea73a0bdca6a61a629"
      && origin === P3H_HEAD && ahead === 13 && behind === 0
      && status.length === 0 && git("log", "-1", "--format=%s") === P3K_SUBJECT;
    if (!candidate && !frozen && !p3cCandidate && !p3cFrozen && !p3dCandidate && !p3dFrozen && !p3eCandidate && !p3eFrozen && !p3fCandidate && !p3fFrozen && !p3gCandidate && !p3gFrozen && !p3gR1Candidate && !p3gR1Frozen && !p3hCandidate && !p3hFrozen && !p3kCandidate && !p3kFrozen) return false;
    const changed = [...new Set([
      ...lines(git("diff", "--name-only", P3B_PREDECESSOR)),
      ...lines(git("ls-files", "--others", "--exclude-standard"))
    ])];
    const allowed = new Set(P3B_SUCCESSOR_PATHS);
    const migrations = fs.readdirSync(path.join(root, "supabase/migrations"))
      .filter((file) => file.endsWith(".sql")).sort();
    const p3bState = migrations.length === 118
      && migrations.at(-1) === path.basename(P3B_MIGRATION)
      && sha(VOCABULARY) === VOCABULARY_SHA;
    const p3cState = migrations.length === 119
      && migrations.at(-1) === path.basename(P3C_MIGRATION)
      && sha(VOCABULARY) === P3C_VOCABULARY_SHA;
    const p3dState = migrations.length === 120
      && migrations.at(-1) === path.basename(P3D_MIGRATION)
      && sha(VOCABULARY) === P3C_VOCABULARY_SHA;
    const p3eState = migrations.length === 121
      && migrations.at(-1) === path.basename(P3E_MIGRATION)
      && sha(VOCABULARY) === P3E_VOCABULARY_SHA;
    const p3fState = migrations.length === 122
      && migrations.at(-1) === path.basename(P3F_MIGRATION)
      && sha(VOCABULARY) === P3F_VOCABULARY_SHA;
    const p3gState = migrations.length === 123
      && migrations.at(-1) === path.basename(P3G_MIGRATION)
      && sha(VOCABULARY) === P3F_VOCABULARY_SHA;
    const p3gR1State = migrations.length === 124
      && migrations.at(-1) === path.basename(P3G_R1_MIGRATION)
      && sha(VOCABULARY) === P3F_VOCABULARY_SHA;
    const p3hState = migrations.length === 125
      && migrations.at(-1) === path.basename(P3H_MIGRATION)
      && sha(VOCABULARY) === P3F_VOCABULARY_SHA;
    const p3kState = migrations.length === 127
      && migrations.at(-1) === path.basename(P3J_MIGRATION)
      && fs.existsSync(path.join(root, P3I_MIGRATION))
      && sha(VOCABULARY) === P3K_VOCABULARY_SHA;
    return changed.every((file) => allowed.has(file))
      && sha(P3A_MIGRATION) === P3A_SHA
      && (p3bState || p3cState || p3dState || p3eState || p3fState || p3gState || p3gR1State || p3hState || p3kState);
  } catch {
    return false;
  }
}
