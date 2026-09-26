#!/usr/bin/env node
// Negative and positive proof for the durable GQA-2 successor manifest and the historical guards that
// consume it. Evidence mutations are in memory. Topology proofs run against a throwaway shared clone in
// the OS temp directory (real later commits, real origin/main moves); this worktree is never written.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  GQA2_CLOSURE, GQA2_CLOSURE_PATHS, GQA2_CLOSURE_SUBJECT, GQA2_IMPLEMENTATION, GQA2_PREDECESSOR, GQA2_RUNTIME,
  GQA2_RUNTIME_PATHS, GQA2_SUBJECT, collectGqa2SuccessorEvidence, isAcceptedGqa2RuntimePath,
  matchesExactGqa2Successor
} from "./gqa-2-successor-manifest.mjs";

const evidence = collectGqa2SuccessorEvidence();
assert.equal(matchesExactGqa2Successor(evidence), true, "the durable GQA-2 successor holds for the current tree");

let killed = 0;
const recognized = ["current tree"];
const reject = (name, change) => {
  const candidate = structuredClone(evidence);
  change(candidate);
  assert.equal(matchesExactGqa2Successor(candidate), false, `survived: ${name}`);
  killed += 1;
  console.log(`KILLED ${String(killed).padStart(2, "0")} ${name}`);
};
const oneByte = (file) => (e) => { e.currentSha256[file] = "0".repeat(64); e.currentBlob[file] = "0".repeat(40); };
const later = (file) => (e) => { e.laterProductDelta.push(file); };
const R = (suffix) => GQA2_RUNTIME_PATHS.find((file) => file.endsWith(suffix));

// ---------------------------------------------------------------- evidence-level mutations
reject("one-byte change to /vip", oneByte(R("app/vip/page.tsx")));
reject("one-byte change to /verification", oneByte(R("app/verification/page.tsx")));
reject("one-byte change to DeferredCapabilityNotice", oneByte(R("DeferredCapabilityNotice.tsx")));
reject("one-byte change to staff roster page", oneByte("apps/admin-web/app/admin/management/staff/page.tsx"));
reject("one-byte change to staff detail page", oneByte("apps/admin-web/app/admin/management/staff/[staffAccountId]/page.tsx"));
reject("one-byte change to PrimaryWizard", oneByte(R("PrimaryWizard.tsx")));
reject("altered self-target helper", oneByte(R("admin-primary-wizard-target.ts")));
reject("altered roster-state helper", oneByte(R("admin-staff-roster-state.ts")));
reject("altered staff loading state", oneByte(R("staff/loading.tsx")));
reject("current bytes match but committed blob differs", (e) => { e.committedBlob[R("app/vip/page.tsx")] = "1".repeat(40); });
reject("extra Restaurant route", later("apps/restaurant-web/app/extra/page.tsx"));
reject("extra Admin management page", later("apps/admin-web/app/admin/management/extra/page.tsx"));
reject("Admin server change", later("apps/admin-web/server/adminStepUpMutationRuntime.ts"));
reject("Admin API change", later("apps/admin-web/app/api/admin/management/staff/mutations/route.ts"));
reject("Restaurant runtime change", later("apps/restaurant-web/runtime/restaurant-access-context.ts"));
reject("Restaurant server change", later("apps/restaurant-web/server/restaurant-catalog.ts"));
reject("Restaurant data/navigation change", later("apps/restaurant-web/data/navigation.ts"));
reject("Restaurant session middleware change", later("apps/restaurant-web/middleware.ts"));
reject("apps/mobile change", later("apps/mobile/app/extra.tsx"));
reject("lib change", later("lib/i18n/zh-TW.ts"));
reject("packages/shared change", later("packages/shared/src/extra.ts"));
reject("migration addition", later("supabase/migrations/20990101000000_extra.sql"));
reject("migration edit inside the accepted delta", (e) => { e.acceptedProductDelta.push("supabase/migrations/20260916030000_staff_management_p3_p6_p3i_management_read_authority.sql"); });
reject("permission vocabulary change", later("apps/admin-web/auth/admin-current-permission-vocabulary.ts"));
reject("permission vocabulary inside the accepted delta", (e) => { e.acceptedProductDelta.push("apps/admin-web/auth/admin-current-permission-vocabulary.ts"); });
reject("Primary exact-set change (PrimaryWizard bytes)", (e) => { e.currentSha256[R("PrimaryWizard.tsx")] = GQA2_RUNTIME[R("PrimaryWizard.tsx")].sha256.replace(/^./, "0"); });
reject("strong confirmation phrase change (PrimaryWizard blob)", (e) => { e.currentBlob[R("PrimaryWizard.tsx")] = GQA2_RUNTIME[R("PrimaryWizard.tsx")].blob.replace(/^./, "0"); });
reject("Break-glass control change", later("scripts/break-glass-control.mjs"));
reject("Break-glass migration change", later("supabase/migrations/20260915030000_staff_management_p3_p6_p3g_break_glass_control_plane.sql"));
reject("wildcard allow-list in implementation paths", (e) => { e.implementationPaths[0] = "apps/admin-web/**"; });
reject("wildcard allow-list in accepted delta", (e) => { e.acceptedProductDelta[0] = "apps/restaurant-web/*"; });
reject("prefix allow-list in accepted delta", (e) => { e.acceptedProductDelta[e.acceptedProductDelta.length - 1] = "apps/restaurant-web/"; });
reject("wrong predecessor", (e) => { e.implementationParent = "0".repeat(40); });
reject("forged implementation commit subject", (e) => { e.implementationSubject = "Different implementation"; });
reject("missing implementation commit (not in current history)", (e) => { e.implementationInHistory = false; });
reject("forged implementation path inventory (extra path)", (e) => { e.implementationPaths.push("apps/admin-web/app/admin/management/extra/page.tsx"); });
reject("forged implementation path inventory (test paths dropped)", (e) => { e.implementationPaths = e.implementationPaths.filter((file) => !file.startsWith("scripts/")); });
reject("missing runtime path in the accepted delta", (e) => { e.acceptedProductDelta.pop(); });
reject("missing original closure provenance", (e) => { e.closureInHistory = false; });
reject("closure provenance with wrong parent", (e) => { e.closureParent = GQA2_PREDECESSOR; });
reject("closure provenance with forged subject", (e) => { e.closureSubject = "Unrelated later work"; });
reject("closure provenance with an extra product path", (e) => { e.closurePaths.push("apps/admin-web/app/admin/x/page.tsx"); });
reject("closure provenance with a missing path", (e) => { e.closurePaths.pop(); });
reject("closure provenance with a wildcard path", (e) => { e.closurePaths[0] = "scripts/*"; });
reject("closure provenance absent from the evidence", (e) => { delete e.closurePaths; });
reject("changed dependency manifest", later("package.json"));
reject("changed lockfile", later("package-lock.json"));
reject("changed app package manifest", later("apps/admin-web/package.json"));
reject("GQA-1 frozen-runtime mutation (meal-log)", later("apps/mobile/app/meal-log.tsx"));
reject("GQA-1 frozen-runtime mutation (Group Table)", later("apps/mobile/app/group-tables.tsx"));
reject("untracked product file", later("apps/admin-web/app/admin/management/staff/untracked.tsx"));

// ---------------------------------------------------------------- real-history topology proofs
// A shared clone reads this repository's objects and writes only its own. Commits there are fixtures:
// none of their identities appear in, or are required by, the manifest.
const ROOT = process.cwd();
const HEAD = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const GQA3_FIXTURE_CHECKPOINT = "3069b1090a7f517a2f1c907f37d13b6d6aaa4cf1"; // a checkout point only, not a validity input
const tmp = mkdtempSync(path.join(os.tmpdir(), "gqa2-topology-"));
const repo = path.join(tmp, "repo");
const g = (...args) => execFileSync("git", ["-c", "user.name=GQA topology fixture", "-c", "user.email=fixture@example.invalid", ...args],
  { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 }).trim();
const holds = () => matchesExactGqa2Successor(collectGqa2SuccessorEvidence(repo));
const at = (ref) => { g("reset", "--quiet", "--hard"); g("clean", "-fdq"); g("checkout", "--quiet", "--detach", ref); };
const edit = (file, change) => { const p = path.join(repo, file); writeFileSync(p, change(readFileSync(p, "utf8"))); };
const put = (file, text) => writeFileSync(path.join(repo, file), text);
const replaceOnce = (needle, replacement) => (source) => {
  assert.ok(source.includes(needle), `fixture target missing: ${needle}`);
  return source.replace(needle, replacement);
};
const note = (source) => `${source}\n// later fixture edit\n`;
const commit = (subject) => { g("add", "-A"); g("commit", "--quiet", "-m", subject); return g("rev-parse", "HEAD"); };
const accept = (name) => {
  assert.equal(holds(), true, `legitimate history rejected: ${name}`);
  recognized.push(name);
  console.log(`ACCEPTED ${name}`);
};
const rejectReal = (name, mutate) => {
  at(HEAD);
  mutate();
  assert.equal(holds(), false, `survived: ${name}`);
  killed += 1;
  console.log(`KILLED ${String(killed).padStart(2, "0")} ${name} (real history)`);
};
const firstTracked = (dir) => g("ls-files", "--", dir).split(/\r?\n/).filter(Boolean)[0];

try {
  execFileSync("git", ["clone", "--quiet", "--shared", "--no-checkout", ROOT, repo], { stdio: ["ignore", "pipe", "pipe"] });
  g("checkout", "--quiet", "--detach", HEAD);

  // A / B / current: accepted historical checkpoints.
  at(GQA2_CLOSURE); accept("A. HEAD = 25157cb (GQA-2 closure)");
  at(GQA3_FIXTURE_CHECKPOINT); accept("B. HEAD = 3069b10 (GQA-3), no GQA-3 identity in the manifest");
  at(HEAD); accept("HEAD = current commit");

  // C / D: arbitrary later commits, any subject, including edits to GQA-2's own validator scripts.
  edit("scripts/gqa-2-closure-guard.mjs", note);
  commit("QA: arbitrary later validator tweak");
  accept("C. one arbitrary later scripts-only commit (edits gqa-2-closure-guard)");
  edit("scripts/gqa-2-successor-manifest.mjs", note);
  put("scripts/qa-later-fixture-guard.mjs", "// later QA guard fixture\n");
  commit("Improve parser coverage");
  put("docs/qa-later-fixture-note.md", "# later QA note\n");
  commit("Document handoff validation");
  edit("scripts/gqa-2-successor-mutations.mjs", note);
  edit("scripts/gqa-2-closure-rules.mjs", note);
  const tip = commit("Fix test defect in GQA-2 rules");
  accept("D. multiple arbitrary later scripts/docs commits (4 commits, 3 subjects unrelated to GQA)");

  // E / F: origin/main is not an input.
  g("update-ref", "refs/remotes/origin/main", tip);
  accept("E. origin/main advanced to the current HEAD");
  g("update-ref", "refs/remotes/origin/main", GQA2_CLOSURE);
  accept("F. origin/main behind the local HEAD (at 25157cb)");
  g("update-ref", "refs/remotes/origin/main", GQA2_PREDECESSOR);
  accept("origin/main behind GQA-2 entirely (at 8a16644)");

  // Uncommitted validator edits are machinery, not product state.
  edit("scripts/gqa-2-closure-guard.mjs", note);
  put("scripts/qa-untracked-fixture.mjs", "// untracked validator fixture\n");
  accept("uncommitted and untracked validator-script edits");

  // Provenance must be real ancestry.
  rejectReal("HEAD = 075a6f7 (original closure provenance missing)", () => at(GQA2_IMPLEMENTATION));
  rejectReal("HEAD = 8a16644 (implementation missing)", () => at(GQA2_PREDECESSOR));

  // Frozen runtime and boundary mutations, each committed after arbitrary later QA commits.
  const productCommit = (name, mutate) => rejectReal(name, () => {
    edit("scripts/gqa-2-closure-guard.mjs", note);
    commit("QA: later validator tweak");
    mutate();
    commit(`Later change: ${name}`);
    put("docs/qa-after.md", "# after\n");
    commit("Later docs");
  });
  const PW = "apps/admin-web/components/admin-shell/PrimaryWizard.tsx";
  productCommit("strong confirmation phrase change", () => edit(PW, replaceOnce("phrase: confirmPhrase", 'phrase: "confirm"')));
  productCommit("Primary exact permission-set change", () => edit(PW, replaceOnce('"admin.management.staff.permission.write"', '"admin.management.staff.permission.read"')));
  productCommit("self-target behavior change", () => edit("apps/admin-web/auth/admin-primary-wizard-target.ts", replaceOnce('return relation === "self";', "return false;")));
  productCommit("staff denial-state change", () => edit("apps/admin-web/auth/admin-staff-roster-state.ts", note));
  productCommit("/vip deferred-state change", () => edit("apps/restaurant-web/app/vip/page.tsx", note));
  productCommit("/verification deferred-state change", () => edit("apps/restaurant-web/app/verification/page.tsx", note));
  productCommit("Admin server authority change", () => edit(firstTracked("apps/admin-web/server"), note));
  productCommit("Admin API / Step-Up path change", () => edit(firstTracked("apps/admin-web/app/api"), note));
  productCommit("permission vocabulary change", () => edit("apps/admin-web/auth/admin-current-permission-vocabulary.ts", note));
  productCommit("Restaurant runtime change", () => edit(firstTracked("apps/restaurant-web/runtime"), note));
  productCommit("Restaurant data change", () => edit(firstTracked("apps/restaurant-web/data"), note));
  productCommit("Restaurant server change", () => edit(firstTracked("apps/restaurant-web/server"), note));
  productCommit("migration addition (P3F self_target_denied authority lives in migrations)", () => put("supabase/migrations/29991231000000_later_fixture.sql", "select 1;\n"));
  productCommit("Break-glass boundary change", () => edit("scripts/break-glass-control.mjs", note));
  productCommit("Consumer / GQA-1 frozen runtime change", () => edit("apps/mobile/app/meal-log.tsx", note));
  productCommit("lockfile change", () => edit("package-lock.json", (source) => `${source}\n`));
  rejectReal("uncommitted Admin server change", () => edit(firstTracked("apps/admin-web/server"), note));
  rejectReal("untracked Admin product file", () => put("apps/admin-web/app/admin/management/staff/untracked.tsx", "export {};\n"));
} finally {
  // Only the fixture directory is removed, and only if it contains no link that could escape it.
  const links = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) links.push(path.join(dir, entry.name));
      else if (entry.isDirectory()) walk(path.join(dir, entry.name));
    }
  };
  if (path.basename(tmp).startsWith("gqa2-topology-") && path.dirname(tmp) === path.resolve(os.tmpdir())) {
    walk(tmp);
    if (links.length === 0) rmSync(tmp, { recursive: true, force: true });
    else console.error(`fixture clone left in place (contains links): ${tmp}`);
  }
}

// The consumer predicate recognizes only the nine exact paths, and only when the successor holds.
assert.equal(isAcceptedGqa2RuntimePath("apps/restaurant-web/app/vip/page.tsx", true), true);
assert.equal(isAcceptedGqa2RuntimePath("apps/restaurant-web/app/vip/page.tsx", false), false);
for (const file of ["apps/restaurant-web/app/other/page.tsx", "apps/admin-web/app/admin/management/staff/extra.tsx",
  "apps/admin-web/**", "apps/restaurant-web/", "apps/mobile/app/meal-log.tsx"]) {
  assert.equal(isAcceptedGqa2RuntimePath(file, true), false, `non-exact path accepted: ${file}`);
  killed += 1;
}
// Every historical guard that consumes the manifest does so through the exact predicate only.
for (const file of ["scripts/platform-admin-ra-1a-guard.mjs", "scripts/staff-authority-p3-p6-p3i-guard.mjs",
  "scripts/staff-authority-p3-p6-p3j-guard.mjs", "scripts/admin-e1-guard.mjs", "scripts/admin-mrb-successor-manifest.mjs"]) {
  const source = readFileSync(file, "utf8");
  assert.ok(/isExactGqa2Successor\(/.test(source), `${file} uses the exact GQA-2 predicate`);
  assert.ok(!/["'`]apps\/[a-z-]+\/\*\*|startsWith\(["'`]apps\/restaurant-web\/["'`]\)\s*\|\|\s*exactGqa2/.test(source), `${file} has no wildcard or prefix GQA-2 allowance`);
}
// The manifest enumerates no later commit: no later identity, subject list or later-commit walk.
const manifestSource = readFileSync("scripts/gqa-2-successor-manifest.mjs", "utf8");
assert.ok(!/3069b10|Harden future public schema|GQA3_|laterCommits|rev-list/.test(manifestSource),
  "the GQA-2 manifest carries no later-commit identity or enumeration");
assert.equal(GQA2_SUBJECT, "Close GQA cross-surface truthfulness and build gaps");
assert.equal(GQA2_CLOSURE_SUBJECT, "Record GQA-2 exact successor guard compatibility");
assert.equal(GQA2_CLOSURE_PATHS.length, 11);
console.log(`GQA-2 successor mutations PASS: ${killed} rejected, ${recognized.length} legitimate histories recognized`);
