#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import {
  collectMrbSuccessorEvidence, matchesExactMrbSuccessor,
  MRB_COMMIT, MRB_CLOSURE, MRB_CLOSURE_SUBJECT, MRB_PREDECESSOR, MRB_PRODUCT_PATHS, MRB_PRODUCT_SHA256, MRB_ROUTE
} from "./admin-mrb-successor-manifest.mjs";
import { GQA2_RUNTIME } from "./gqa-2-successor-manifest.mjs";

const DETAIL = "apps/admin-web/app/admin/management/staff/[staffAccountId]/page.tsx";
const pushed = collectMrbSuccessorEvidence();
assert.equal(matchesExactMrbSuccessor(pushed), true, "the pushed MRB -> GQA-1 -> GQA-2 chain is recognized");
// The original local shape (origin still at the MRB predecessor), rebuilt from the pinned constants.
const local = {
  ...structuredClone(pushed),
  origin: MRB_PREDECESSOR, head: MRB_COMMIT, parent: null,
  productDelta: [...MRB_PRODUCT_PATHS], sinceMrbPaths: [],
  sourceSha256: { ...structuredClone(pushed).sourceSha256, ...MRB_PRODUCT_SHA256 }
};
assert.equal(matchesExactMrbSuccessor(local), true, "the original local MRB shape is still recognized");
const altered = (base, change) => { const evidence = structuredClone(base); change(evidence); return evidence; };
assert.equal(matchesExactMrbSuccessor(altered(local, (e) => {
  e.head = "1111111111111111111111111111111111111111";
  e.parent = MRB_COMMIT;
  e.headSubject = MRB_CLOSURE_SUBJECT;
})), true, "the exact one-commit guard-closure topology is recognized");
let rejected = 0;
const reject = (name, change, base = pushed) => {
  assert.equal(matchesExactMrbSuccessor(altered(base, change)), false, name);
  rejected += 1;
  console.log(`PASS rejects ${name}`);
};
const changedHash = (file) => crypto.createHash("sha256")
  .update(fs.readFileSync(file)).update("one meaningful byte").digest("hex");
const panel = "apps/admin-web/components/admin-shell/ManagerPresetPanel.tsx";
const manifest = "apps/admin-web/auth/admin-manager-presets.ts";
for (const [label, base] of [["pushed", pushed], ["local", local]]) {
  reject(`${label}: one-byte preset-preview route change`, (e) => { e.sourceSha256[MRB_ROUTE] = changedHash(MRB_ROUTE); }, base);
  reject(`${label}: ManagerPresetPanel change`, (e) => { e.sourceSha256[panel] = changedHash(panel); }, base);
  reject(`${label}: preset manifest change`, (e) => { e.sourceSha256[manifest] = changedHash(manifest); }, base);
  reject(`${label}: extra arbitrary Admin API route`, (e) => {
    e.productDelta.push("apps/admin-web/app/api/admin/arbitrary/route.ts");
    e.sinceMrbPaths.push("apps/admin-web/app/api/admin/arbitrary/route.ts");
  }, base);
  reject(`${label}: extra arbitrary Admin component`, (e) => {
    e.productDelta.push("apps/admin-web/components/admin-shell/Arbitrary.tsx");
    e.sinceMrbPaths.push("apps/admin-web/components/admin-shell/Arbitrary.tsx");
  }, base);
  reject(`${label}: extra arbitrary Admin page`, (e) => {
    e.productDelta.push("apps/admin-web/app/admin/arbitrary/page.tsx");
    e.sinceMrbPaths.push("apps/admin-web/app/admin/arbitrary/page.tsx");
  }, base);
  reject(`${label}: new Supabase migration`, (e) => { e.productDelta.push("supabase/migrations/99999999999999_unapproved.sql"); }, base);
  reject(`${label}: changed historical migration`, (e) => { e.productDelta.push("supabase/migrations/20260904010000_platform_admin_authority.sql"); }, base);
  reject(`${label}: Consumer shared-code delta`, (e) => { e.productDelta.push("packages/shared/src/changed.ts"); }, base);
  reject(`${label}: Restaurant delta`, (e) => { e.productDelta.push("apps/restaurant-web/changed.ts"); }, base);
  reject(`${label}: Mobile delta`, (e) => { e.productDelta.push("apps/mobile/changed.ts"); }, base);
  reject(`${label}: wildcard successor path`, (e) => {
    e.productDelta[e.productDelta.indexOf(MRB_PRODUCT_PATHS[0])] = "apps/admin-web/**";
  }, base);
  reject(`${label}: prefix successor path`, (e) => {
    e.mrbCommitPaths[e.mrbCommitPaths.indexOf(MRB_ROUTE)] = "apps/admin-web/app/api/";
  }, base);
  reject(`${label}: wrong MRB predecessor`, (e) => { e.mrbParent = MRB_COMMIT; }, base);
  reject(`${label}: wrong MRB commit path inventory`, (e) => { e.mrbCommitPaths.push("apps/admin-web/app/api/admin/extra/route.ts"); }, base);
  reject(`${label}: later unrecognized Admin API path`, (e) => {
    e.sinceMrbPaths.push("apps/admin-web/app/api/admin/unrecognized/route.ts");
    e.productDelta.push("apps/admin-web/app/api/admin/unrecognized/route.ts");
  }, base);
}
reject("local: unrelated successor commit identity", (e) => {
  e.head = "0000000000000000000000000000000000000000";
  e.parent = "0000000000000000000000000000000000000000";
}, local);
// Pushed-history chain: identities and exact GQA-2 ownership of the one shared MRB file.
reject("pushed: MRB commit not in current history", (e) => { e.mrbInHistory = false; });
reject("pushed: MRB guard closure not in current history", (e) => { e.closureInHistory = false; });
reject("pushed: wrong MRB closure parent", (e) => { e.closureParent = MRB_CLOSURE; });
reject("pushed: wrong MRB closure subject", (e) => { e.closureSubject = "Unrelated change"; });
reject("pushed: MRB closure with extra path", (e) => { e.closurePaths.push("apps/admin-web/app/admin/extra/page.tsx"); });
reject("pushed: GQA-2 not proven exact", (e) => { e.later.gqa2 = false; });
reject("pushed: GQA-1 not proven exact", (e) => { e.later.gqa1 = false; });
reject("pushed: staff detail page keeps the pre-GQA-2 MRB hash", (e) => { e.sourceSha256[DETAIL] = MRB_PRODUCT_SHA256[DETAIL]; });
reject("pushed: one-byte change to the GQA-2 staff detail page", (e) => { e.sourceSha256[DETAIL] = changedHash(DETAIL); });
reject("pushed: arbitrary later Restaurant path", (e) => {
  e.productDelta.push("apps/restaurant-web/app/extra/page.tsx"); e.sinceMrbPaths.push("apps/restaurant-web/app/extra/page.tsx");
});
reject("pushed: arbitrary later Mobile path", (e) => {
  e.productDelta.push("apps/mobile/app/extra.tsx"); e.sinceMrbPaths.push("apps/mobile/app/extra.tsx");
});
assert.equal(pushed.sourceSha256[DETAIL], GQA2_RUNTIME[DETAIL].sha256, "the staff detail page is exactly the accepted GQA-2 bytes");
console.log(`ADMIN-MRB exact successor mutation proof PASS (${rejected} mutations rejected; local and pushed shapes recognized)`);
