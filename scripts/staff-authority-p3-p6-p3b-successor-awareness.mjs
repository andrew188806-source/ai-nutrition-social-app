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
    if (!candidate && !frozen && !p3cCandidate && !p3cFrozen && !p3dCandidate && !p3dFrozen) return false;
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
    return changed.every((file) => allowed.has(file))
      && sha(P3A_MIGRATION) === P3A_SHA
      && (p3bState || p3cState || p3dState);
  } catch {
    return false;
  }
}
