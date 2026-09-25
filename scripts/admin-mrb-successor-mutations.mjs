#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  collectMrbSuccessorEvidence, matchesExactMrbSuccessor,
  MRB_COMMIT, MRB_CLOSURE_SUBJECT, MRB_PRODUCT_PATHS, MRB_ROUTE
} from "./admin-mrb-successor-manifest.mjs";

const original = collectMrbSuccessorEvidence();
assert.equal(matchesExactMrbSuccessor(original), true, "the frozen local MRB successor is recognized");
const altered = (change) => { const evidence = structuredClone(original); change(evidence); return evidence; };
assert.equal(matchesExactMrbSuccessor(altered((e) => {
  e.head = "1111111111111111111111111111111111111111";
  e.parent = MRB_COMMIT;
  e.headSubject = MRB_CLOSURE_SUBJECT;
})), true, "the exact one-commit guard-closure topology is recognized");
const reject = (name, change) => {
  assert.equal(matchesExactMrbSuccessor(altered(change)), false, name);
  console.log(`PASS rejects ${name}`);
};
const changedHash = (file) => crypto.createHash("sha256")
  .update(fs.readFileSync(file)).update("one meaningful byte").digest("hex");
const panel = "apps/admin-web/components/admin-shell/ManagerPresetPanel.tsx";
const manifest = "apps/admin-web/auth/admin-manager-presets.ts";
reject("one-byte preset-preview route change", (e) => { e.sourceSha256[MRB_ROUTE] = changedHash(MRB_ROUTE); });
reject("ManagerPresetPanel change", (e) => { e.sourceSha256[panel] = changedHash(panel); });
reject("preset manifest change", (e) => { e.sourceSha256[manifest] = changedHash(manifest); });
reject("extra arbitrary Admin API route", (e) => {
  e.productDelta.push("apps/admin-web/app/api/admin/arbitrary/route.ts");
  e.sinceMrbPaths.push("apps/admin-web/app/api/admin/arbitrary/route.ts");
});
reject("extra arbitrary Admin component", (e) => {
  e.productDelta.push("apps/admin-web/components/admin-shell/Arbitrary.tsx");
  e.sinceMrbPaths.push("apps/admin-web/components/admin-shell/Arbitrary.tsx");
});
reject("extra arbitrary Admin page", (e) => {
  e.productDelta.push("apps/admin-web/app/admin/arbitrary/page.tsx");
  e.sinceMrbPaths.push("apps/admin-web/app/admin/arbitrary/page.tsx");
});
reject("new Supabase migration", (e) => { e.productDelta.push("supabase/migrations/99999999999999_unapproved.sql"); });
reject("changed historical migration", (e) => { e.productDelta.push("supabase/migrations/20260904010000_platform_admin_authority.sql"); });
reject("Consumer shared-code delta", (e) => { e.productDelta.push("packages/shared/src/changed.ts"); });
reject("Restaurant delta", (e) => { e.productDelta.push("apps/restaurant-web/changed.ts"); });
reject("Mobile delta", (e) => { e.productDelta.push("apps/mobile/changed.ts"); });
reject("wildcard successor path", (e) => {
  e.productDelta[e.productDelta.indexOf(MRB_PRODUCT_PATHS[0])] = "apps/admin-web/**";
});
reject("prefix successor path", (e) => {
  e.mrbCommitPaths[e.mrbCommitPaths.indexOf(MRB_ROUTE)] = "apps/admin-web/app/api/";
});
reject("unrelated successor commit identity", (e) => {
  e.head = "0000000000000000000000000000000000000000";
  e.parent = "0000000000000000000000000000000000000000";
});
reject("wrong MRB predecessor", (e) => { e.mrbParent = MRB_COMMIT; });
reject("wrong MRB commit path inventory", (e) => { e.mrbCommitPaths.push("apps/admin-web/app/api/admin/extra/route.ts"); });
reject("later unrecognized Admin API path", (e) => {
  e.sinceMrbPaths.push("apps/admin-web/app/api/admin/unrecognized/route.ts");
});
console.log("ADMIN-MRB exact successor mutation proof PASS");
