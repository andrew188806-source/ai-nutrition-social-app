#!/usr/bin/env node
// Negative proof for the exact GQA-2 successor manifest and the historical guards that consume it.
// In-memory only: evidence objects and source strings are altered, never files.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GQA2_CLOSURE_PATHS, GQA2_CLOSURE_SUBJECT, GQA2_IMPLEMENTATION, GQA2_PREDECESSOR, GQA2_RUNTIME,
  GQA2_RUNTIME_PATHS, GQA2_SUBJECT, collectGqa2SuccessorEvidence, isAcceptedGqa2RuntimePath,
  matchesExactGqa2Successor
} from "./gqa-2-successor-manifest.mjs";

const evidence = collectGqa2SuccessorEvidence();
assert.equal(matchesExactGqa2Successor(evidence), true, "the exact GQA-2 implementation is recognized");
const exactClosure = Object.freeze({ sha: "c".repeat(40), parent: GQA2_IMPLEMENTATION, subject: GQA2_CLOSURE_SUBJECT, paths: [...GQA2_CLOSURE_PATHS] });
assert.equal(matchesExactGqa2Successor({ ...structuredClone(evidence), laterCommits: [exactClosure] }), true,
  "the exact guard-only closure commit is recognized");

let killed = 0;
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
reject("prefix allow-list in closure paths", (e) => { e.laterCommits = [{ ...exactClosure, paths: ["scripts/"] }]; });
reject("wrong predecessor", (e) => { e.implementationParent = "0".repeat(40); });
reject("wrong implementation commit subject", (e) => { e.implementationSubject = "Different implementation"; });
reject("implementation not in current history", (e) => { e.implementationInHistory = false; });
reject("extra path in the implementation commit", (e) => { e.implementationPaths.push("apps/admin-web/app/admin/management/extra/page.tsx"); });
reject("missing runtime path in the accepted delta", (e) => { e.acceptedProductDelta.pop(); });
reject("unrelated successor commit accepted", (e) => { e.laterCommits = [{ ...exactClosure, subject: "Unrelated later work" }]; });
reject("closure commit with wrong parent", (e) => { e.laterCommits = [{ ...exactClosure, parent: GQA2_PREDECESSOR }]; });
reject("closure commit with an extra product path", (e) => { e.laterCommits = [{ ...exactClosure, paths: [...GQA2_CLOSURE_PATHS, "apps/admin-web/app/admin/x/page.tsx"] }]; });
reject("second later commit", (e) => { e.laterCommits = [exactClosure, { ...exactClosure, sha: "d".repeat(40) }]; });
reject("changed dependency manifest", later("package.json"));
reject("changed lockfile", later("package-lock.json"));
reject("changed app package manifest", later("apps/admin-web/package.json"));
reject("GQA-1 frozen-runtime mutation (meal-log)", later("apps/mobile/app/meal-log.tsx"));
reject("GQA-1 frozen-runtime mutation (Group Table)", later("apps/mobile/app/group-tables.tsx"));
reject("untracked product file", later("apps/admin-web/app/admin/management/staff/untracked.tsx"));

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
assert.equal(GQA2_SUBJECT, "Close GQA cross-surface truthfulness and build gaps");
console.log(`GQA-2 successor mutations PASS: ${killed} rejected, 2 exact shapes recognized`);
