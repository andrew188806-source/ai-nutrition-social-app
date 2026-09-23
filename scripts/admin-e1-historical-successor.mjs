// Exact ADMIN-E1 local successor fixture for historical phase guards.
// This is a source pin, not permission to accept arbitrary later work.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child from "node:child_process";

export const E1_PARENT = "d88d1000a26810dfca0f70586f11e594b3a2e44a";
export const E1_ORIGINAL_COMMIT = "6fc51e3cbacf9a1fbbe6aac246d05c6916d1abec";
export const E1_SOURCE_SHA256 = Object.freeze({
  '.gitattributes': "d60f352d0db1404c70afb4bb8b2ca3fd1c610572aa40720e8a0b7baa7885418c",
  'apps/admin-web/app/ad-review/page.tsx': "203ffc10850f69431b668319e8089c51a21c0162507884b4b2b8a5f805d521eb",
  'apps/admin-web/app/alias-review/page.tsx': "77f255a1b4c6bd873b031be367c3ff40f56ce39655d492ac02599938b8b030e0",
  'apps/admin-web/app/audit-trail/page.tsx': "1f76354a4f6df8e021b09891afb725f403de9bcaf214e7a2d65a93937adae0b1",
  'apps/admin-web/app/consents/page.tsx': "7213c70cd177907fe6b825849d69c628b1a3e4d2ed7c2706a55cfdeeb74e8ac4",
  'apps/admin-web/app/data-access/page.tsx': "0be5c18711a32f15e6bd12541d0d355b042fcdca9f82be715da47573fcb8c5e3",
  'apps/admin-web/app/data-quality/page.tsx': "c2660858414afe4add44d28c00e993a28fa16d9680a2baffbb0c7435877e06aa",
  'apps/admin-web/app/duplicate-menu-items/page.tsx': "f7df504ec75a86ad5892e2e2a95b342f57fe2246aa4d7764b1481a90137b7205",
  'apps/admin-web/app/esg/page.tsx': "ea30aa236a735326ffe65f96ef16ef7bea6e3d66cc9b9f7b6567a10390dbcab6",
  'apps/admin-web/app/exercise-governance/page.tsx': "6bca0586a074c74f26b03029ecc573a53176c0d7db53abca52ab15283172f890",
  'apps/admin-web/app/identification-audit/page.tsx': "851e765f3b180282cf42ff5cd4c1c7e427eaa6a795a7c76aa7555acb7d5a6b4e",
  'apps/admin-web/app/login/page.tsx': "42a0fdc55bfef3de5e64d54f0cb735db33ea64e0c6b949a5b5bdcb894f7638b5",
  'apps/admin-web/app/menu-review/page.tsx': "213f32c44aa39314a1278e4bd8d32b175d49d72bd62aa875fd0978f7a182ecf6",
  'apps/admin-web/app/nutrition-review/page.tsx': "a1f0611ce448f10061cf68b0ee02acedf11779031f391e4efa106b6d2a1447cd",
  'apps/admin-web/app/page.tsx': "1241e9c63423f4c16d3efb19c5da49f4a1d4aa97f29f37736b4534447e704bf5",
  'apps/admin-web/app/pending-menu-items/page.tsx': "2ad600fd4e8cd9136543f9d3a283f48497838dc83a14c44defb9e4a895950a5d",
  'apps/admin-web/app/restaurant-review/page.tsx': "e73c79b8328956086b98f1816b9ab2279501178e429df332b99db71b832dd39c",
  'apps/admin-web/app/self-cooked-audit/page.tsx': "c033899476eb5bb70878fa3af827ad1e50e203135761d84dd7ad50f4119a24ff",
  'apps/admin-web/app/settings/page.tsx': "32e4c513c195cbc31b31320e1ab40d26769c50a8c65e979a4ef0c480a8b9ac03",
  'apps/admin-web/app/social-governance/page.tsx': "c4828c28510d19423a643623fb57895e234213216afa6d7e5995a3386a91c37f",
  'apps/admin-web/app/sponsored/page.tsx': "f95c2dc38e167a6e78e96927dd1a191283f8f3afa19e7f902935719041a8560d",
  'apps/admin-web/app/tags/page.tsx': "fd48765f930a27e72d85016021adefe150a4026e46615fc6da7755fd11ee397d",
  'apps/admin-web/app/verification/page.tsx': "2e76918876f807deaabe56b1a38f192964e5e28f358fa5361fec9d2f41a7acfa",
  'apps/admin-web/components/LegacyAdminGateway.tsx': "3f68b152d8c43076672bc021ae7e4d4d40413544a92dcb11facb3f8e50fb0621",
  'apps/admin-web/server/adminStepUpBroker.ts': "238c5399b0bb90f763b497782d85125125116b462d48eb8c08a285a0a04c2ae0",
  'apps/admin-web/server/adminStepUpRuntime.ts': "3e819531f8464704e9a9f3b2ceb7569049165f1f949b7336ac7dab3870fc79d9",
  'docs/DOCUMENT_STATUS_INDEX.md': "323b8adb61670ae9499f33956b97142658b99cc1fcd2c69c6fcdc59f310c9317",
  'docs/admin-operational-surface-inventory.md': "5540934c2b50b679681fe409deaf20f3fcece47c11bb54f774ce77c0f481167c",
  'docs/deployment-local-access-matrix.md': "48fe9a652eee15c609461d40bcaab3a3cc1d8f205c61c2ed78565ab4daa64e04",
  'docs/engineering-handoff.md': "1e4db378a0d25b9251ef3813a82f39f9f219965f102bc2bd42316b3149977483",
  'docs/engineering-state-registers.md': "0368958c104c9784a1cb3fd9f970395d9a7165adec83de61d3b0c78fb1c8df6d",
  'package.json': "36e89e0d367f5947973f7487d7baf6d435d22b473a6ed28fe52b156456778050",
  'scripts/admin-e1-clock-smoke.mjs': "8f3508547df09bddf027672670c5dd658323efd948d6819b895e6ac4a91c4021",
  'scripts/admin-e1-guard.mjs': "d86c5c83034e9b8d425c670e276d29acda6ad2f3a24f42534521d8fae16cdc43",
  'scripts/admin-e1-mutations.mjs': "b5938e0927c5469337ee6882c3c5c8cf25471a8e8c0e7fa3d719e69a0e98de3e",
  'scripts/admin-e1-rules.mjs': "213675d2c472a6afe7f4b8276c92f1eb23afe0cbd81649fd47438af94052f1d6",
});
export const E1_SOURCE_PATHS = Object.freeze(Object.keys(E1_SOURCE_SHA256));
// The only accepted successor to the original E1 handoff is this exact E2R
// documentation/validator transition. All other E1 source digests stay pinned.
export const E2R_TRANSITION_SHA256 = Object.freeze({
  'docs/deployment-local-access-matrix.md': "e6054986786f24b4f521278266489b32bc06535571f99ccf4370ed3e21ae700a",
  'docs/engineering-handoff.md': "df8b706f7f80fd4114e698f3c753bb31de8fc0950c764ee47f0bb39458e2389f",
  'docs/engineering-state-registers.md': "66bf0c220d0a58ba4e63d7bc2bfa2c0c433f12252a3c957eb8b792c1a9945d93",
  'scripts/admin-e1-rules.mjs': "39a2dcc615a5fed9b0362effeb09dcef595948c329f64ed1e170a1e5150513e9",
});
export const E1_CLOSURE_GUARD_PATHS = Object.freeze([
  'scripts/platform-admin-ra-1a-guard.mjs',
  'scripts/platform-admin-ra-1b-contract.mjs',
  'scripts/admin-operational-read-permissions-ae1-guard.mjs',
  'scripts/admin-restaurant-operational-read-foundation-b1-guard.mjs',
  'scripts/admin-restaurant-branch-canonical-ui-b2-guard.mjs',
  'scripts/admin-menu-canonical-ui-b3-guard.mjs',
  'scripts/admin-operational-review-queues-c-guard.mjs',
  'scripts/admin-e1-historical-successor.mjs',
  'scripts/admin-e1-historical-closure-mutations.mjs',
  'scripts/admin-e2r-guard.mjs',
  'scripts/admin-e2r-mutations.mjs',
]);

const root = process.cwd();
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const git = (...args) => child.execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
export function matchesE1Source(file, source) {
  return Object.hasOwn(E1_SOURCE_SHA256, file)
    && hash(source) === E1_SOURCE_SHA256[file];
}
export function exactAdminE1SuccessorState() {
  try {
    if (git("rev-parse", "HEAD^") !== E1_PARENT || git("rev-parse", "origin/main") !== E1_PARENT) return null;
    if (git("rev-list", "--left-right", "--count", "HEAD...origin/main") !== "1\t0") return null;
    for (const [state, overrides] of [["pre-e2", {}], ["e2r", E2R_TRANSITION_SHA256]]) {
      if (E1_SOURCE_PATHS.every((file) =>
        fs.existsSync(path.join(root, file))
        && hash(fs.readFileSync(path.join(root, file))) === (overrides[file] ?? E1_SOURCE_SHA256[file])
      )) return state;
    }
    return null;
  } catch { return null; }
}
export function isExactAdminE1Successor() {
  return exactAdminE1SuccessorState() !== null;
}
export function unexpectedSuccessorPaths(changed, historicalAllowed) {
  const allowed = new Set(historicalAllowed);
  if (isExactAdminE1Successor()) {
    for (const file of [...E1_SOURCE_PATHS, ...E1_CLOSURE_GUARD_PATHS]) allowed.add(file);
  }
  return [...changed].filter((file) => !allowed.has(file));
}
