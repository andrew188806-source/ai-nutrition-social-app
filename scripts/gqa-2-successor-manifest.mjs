// Exact GQA-2 successor evidence for historical, source-only guards.
// This recognizes one accepted implementation (075a6f7) by commit identity, exact paths and exact
// bytes. It is not an allow-list for later work: any later product change breaks recognition, and any
// later commit that edits GQA-2's own guard files must be one of the recorded guard-only successors.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export const GQA2_PREDECESSOR = "8a166442b0ab11abe16559d857eeb1b4b9739407";
export const GQA2_IMPLEMENTATION = "075a6f7728ac8c85e535493995562b522a273d77";
export const GQA2_SUBJECT = "Close GQA cross-surface truthfulness and build gaps";
export const GQA2_CLOSURE_SUBJECT = "Record GQA-2 exact successor guard compatibility";

/** Frozen product/runtime bytes at 075a6f7: SHA-256 of the file bytes and the Git blob id. */
export const GQA2_RUNTIME = Object.freeze({
  "apps/admin-web/app/admin/management/staff/[staffAccountId]/page.tsx": Object.freeze({
    sha256: "853ae0f12e9728e5b13df8d4bc8452937ecbfcdbf1fbf1af37a5ec09decb800f", blob: "943bd417cb1f33144b1babe024d0834d4915920a" }),
  "apps/admin-web/app/admin/management/staff/loading.tsx": Object.freeze({
    sha256: "ed25a6343888e736cca35c7b04c259201d2072a9bd1109bc219e05b3b1981a31", blob: "3b41912456d2386de30042ba2aacade7454ae2ec" }),
  "apps/admin-web/app/admin/management/staff/page.tsx": Object.freeze({
    sha256: "a7189fa3f1ef0afbdf3fbc5505d4b4d3f7453a3577df6af2c0963daa2203bba1", blob: "32974bd24f0cf327d97c956aa05c5aae6f7e515a" }),
  "apps/admin-web/auth/admin-primary-wizard-target.ts": Object.freeze({
    sha256: "10ddca260f396423fd310f9d8a80b51500840ec3ee8d6cbac4075b5641083396", blob: "567720d447ccdb6c928c12decdd4001c9df23851" }),
  "apps/admin-web/auth/admin-staff-roster-state.ts": Object.freeze({
    sha256: "5198866da3173653ea51c57434dadfaee02e6e483a85046848c068b4eb6568d0", blob: "7f8575c2562ea9fd5e3c1c4b02944dc1f7f59c8c" }),
  "apps/admin-web/components/admin-shell/PrimaryWizard.tsx": Object.freeze({
    sha256: "de666691c4230a13ed2c959e17d8f15839aa9c8f2ba86052afd694e073d8666b", blob: "283e60479a186541989d91e96fc86f2906129254" }),
  "apps/restaurant-web/app/verification/page.tsx": Object.freeze({
    sha256: "dea0dd16095e5b7dcc8af48e21a95f184e2095848550ff39e03128de979aec55", blob: "a061e5c9c122c8798962d2185063fd8fc3f73f90" }),
  "apps/restaurant-web/app/vip/page.tsx": Object.freeze({
    sha256: "b8617b261743a4f286548a1dd7d6010a2d7e614ff52bdb5cfec5f52c2d4f5c7a", blob: "0c288e3f9a7c9f2e1920c0098ab3d08127a3115f" }),
  "apps/restaurant-web/components/runtime/DeferredCapabilityNotice.tsx": Object.freeze({
    sha256: "3483040b0a7cd5f1b6c4a072220527988d9fd96a08a4c74e8bcfe5540a059675", blob: "4bb2ba0e1215ab12c5cff8262b6c03affb029e51" })
});
export const GQA2_RUNTIME_PATHS = Object.freeze(Object.keys(GQA2_RUNTIME).sort());
export const GQA2_RESTAURANT_PATHS = Object.freeze(GQA2_RUNTIME_PATHS.filter((file) => file.startsWith("apps/restaurant-web/")));
export const GQA2_ADMIN_PATHS = Object.freeze(GQA2_RUNTIME_PATHS.filter((file) => file.startsWith("apps/admin-web/")));
export const GQA2_TEST_PATHS = Object.freeze([
  "scripts/gqa-2-closure-guard.mjs",
  "scripts/gqa-2-closure-mutations.mjs",
  "scripts/gqa-2-closure-rules.mjs"
]);
export const GQA2_IMPLEMENTATION_PATHS = Object.freeze([...GQA2_RUNTIME_PATHS, ...GQA2_TEST_PATHS].sort());
/** The exact guard-only closure commit that follows 075a6f7 (identified by parent, subject and paths). */
export const GQA2_CLOSURE_PATHS = Object.freeze([
  "scripts/admin-e1-guard.mjs",
  "scripts/admin-mrb-successor-manifest.mjs",
  "scripts/admin-mrb-successor-mutations.mjs",
  "scripts/gqa-1-successor-manifest.mjs",
  "scripts/gqa-1-successor-mutations.mjs",
  "scripts/gqa-2-closure-guard.mjs",
  "scripts/gqa-2-successor-manifest.mjs",
  "scripts/gqa-2-successor-mutations.mjs",
  "scripts/platform-admin-ra-1a-guard.mjs",
  "scripts/staff-authority-p3-p6-p3i-guard.mjs",
  "scripts/staff-authority-p3-p6-p3j-guard.mjs"
].sort());

/** GQA-2's own guard files. A later commit touching any of them must match a recorded successor exactly. */
export const GQA2_GUARDED_PATHS = Object.freeze([...new Set([...GQA2_CLOSURE_PATHS, ...GQA2_TEST_PATHS])].sort());
/** GQA-3 (Data API GRANT hardening): guard-only, on top of the GQA-2 closure (25157cb). */
export const GQA3_PARENT = "25157cbb9c2fa41d516265bac665e5230740712b";
export const GQA3_SUBJECT = "Harden future public schema migration contracts";
export const GQA3_PATHS = Object.freeze([
  "scripts/db-contract-sql.mjs",
  "scripts/db-migration-baseline-manifest.json",
  "scripts/db-migration-baseline-manifest.mjs",
  "scripts/db-object-contract-scan.mjs",
  "scripts/gqa-2-closure-guard.mjs",
  "scripts/gqa-2-successor-manifest.mjs",
  "scripts/gqa-2-successor-mutations.mjs",
  "scripts/public-schema-data-api-grant-guard.mjs",
  "scripts/public-schema-data-api-grant-mutations.mjs"
].sort());
/** Recorded guard-only successor identities; each may appear at most once in history. */
export const GQA2_GUARD_SUCCESSORS = Object.freeze([
  Object.freeze({ parent: GQA2_IMPLEMENTATION, subject: GQA2_CLOSURE_SUBJECT, paths: GQA2_CLOSURE_PATHS }),
  Object.freeze({ parent: GQA3_PARENT, subject: GQA3_SUBJECT, paths: GQA3_PATHS })
]);

/** Everything that is product, schema, authority or dependency. Nothing here may move after 075a6f7. */
export const GQA2_FROZEN_ROOTS = Object.freeze([
  "apps", "lib", "packages", "supabase", "package.json", "package-lock.json", "scripts/break-glass-control.mjs"
]);
/** Named boundaries the accepted delta must not touch (asserted separately for a readable proof). */
export const GQA2_BOUNDARIES = Object.freeze({
  migrations: (file) => file.startsWith("supabase/"),
  mobile: (file) => file.startsWith("apps/mobile/"),
  lib: (file) => file.startsWith("lib/"),
  packages: (file) => file.startsWith("packages/"),
  adminAuthority: (file) => /^apps\/admin-web\/(server|app\/api|config)\//.test(file) || file === "apps/admin-web/middleware.ts"
    || /^apps\/admin-web\/auth\/(admin-current-permission-vocabulary|admin-route-registry|admin-manager-presets|admin-manager-preset-flow|admin-step-up-[a-z-]+|admin-context|supabase-server)\.ts$/.test(file),
  restaurantRuntime: (file) => /^apps\/restaurant-web\/(runtime|server|data|repositories|services|adapters|auth|config)\//.test(file)
    || file === "apps/restaurant-web/middleware.ts" || /^apps\/restaurant-web\/app\/(api|login|restaurant)\//.test(file),
  dependencies: (file) => /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file),
  breakGlass: (file) => /break-glass/.test(file)
});

const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const sorted = (paths) => [...new Set(paths)].sort();
const samePaths = (actual, expected) => {
  const a = sorted(actual), e = sorted(expected);
  return a.length === e.length && a.every((file, index) => file === e[index]);
};
// Next dynamic segments use literal brackets; only glob wildcards and directory prefixes are refused.
const exactPath = (file) => typeof file === "string" && file.length > 0 && !/[*?]/.test(file) && !file.endsWith("/");

/**
 * Pure predicate over collected evidence. Accepted identities, paths and digests are constants above;
 * the caller can never widen them.
 */
export function matchesExactGqa2Successor(evidence) {
  if (!evidence || evidence.implementationParent !== GQA2_PREDECESSOR
    || evidence.implementationSubject !== GQA2_SUBJECT) return false;
  if (!Array.isArray(evidence.implementationPaths) || !evidence.implementationPaths.every(exactPath)
    || !samePaths(evidence.implementationPaths, GQA2_IMPLEMENTATION_PATHS)) return false;
  // The accepted product delta is exactly the nine runtime files: nothing else under the frozen roots.
  if (!Array.isArray(evidence.acceptedProductDelta) || !evidence.acceptedProductDelta.every(exactPath)
    || !samePaths(evidence.acceptedProductDelta, GQA2_RUNTIME_PATHS)) return false;
  for (const predicate of Object.values(GQA2_BOUNDARIES)) {
    if (evidence.acceptedProductDelta.some(predicate)) return false;
  }
  // The implementation must be in the current history, and nothing product-side may move after it.
  if (evidence.implementationInHistory !== true) return false;
  if (!Array.isArray(evidence.laterProductDelta) || evidence.laterProductDelta.length !== 0) return false;
  // Exact committed and current bytes for every frozen runtime file.
  for (const [file, pin] of Object.entries(GQA2_RUNTIME)) {
    if (evidence.committedBlob?.[file] !== pin.blob || evidence.currentBlob?.[file] !== pin.blob
      || evidence.currentSha256?.[file] !== pin.sha256) return false;
  }
  // A later commit that edits a GQA-2 guard file must be exactly one recorded successor, each used once.
  // Later commits that touch neither product nor guard files are outside GQA-2's authority.
  const consumed = new Set();
  const identityOf = (commit) => GQA2_GUARD_SUCCESSORS.findIndex((known) => commit.parent === known.parent
    && commit.subject === known.subject && samePaths(commit.paths, known.paths));
  for (const commit of evidence.laterCommits ?? []) {
    if (!commit || !Array.isArray(commit.paths) || !commit.paths.every(exactPath)) return false;
    if (!commit.paths.some((file) => GQA2_GUARDED_PATHS.includes(file))) continue;
    const index = identityOf(commit);
    if (index < 0 || consumed.has(index)) return false;
    consumed.add(index);
  }
  // Uncommitted guard edits are only the pending, not-yet-recorded successor built on the current HEAD.
  const dirty = evidence.dirtyGuardedPaths ?? [];
  if (!Array.isArray(dirty) || !dirty.every(exactPath)) return false;
  if (dirty.length > 0 && !GQA2_GUARD_SUCCESSORS.some((known, index) => !consumed.has(index)
    && known.parent === evidence.head && dirty.every((file) => known.paths.includes(file)))) return false;
  return true;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function collectGqa2SuccessorEvidence(root = process.cwd()) {
  const git = (...args) => execFileSync("git", args, {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024
  }).trim();
  const head = git("rev-parse", "HEAD");
  const implementationInHistory = spawnSync("git", ["merge-base", "--is-ancestor", GQA2_IMPLEMENTATION, head],
    { cwd: root, stdio: "ignore" }).status === 0;
  const untracked = lines(git("ls-files", "--others", "--exclude-standard", "--", ...GQA2_FROZEN_ROOTS));
  const committedBlob = {}, currentBlob = {}, currentSha256 = {};
  for (const file of GQA2_RUNTIME_PATHS) {
    committedBlob[file] = git("rev-parse", `${GQA2_IMPLEMENTATION}:${file}`);
    currentBlob[file] = existsSync(`${root}/${file}`) ? git("hash-object", "--", file) : null;
    currentSha256[file] = existsSync(`${root}/${file}`) ? sha256(readFileSync(`${root}/${file}`)) : null;
  }
  const laterCommits = implementationInHistory
    ? lines(git("rev-list", "--reverse", `${GQA2_IMPLEMENTATION}..HEAD`)).map((sha) => ({
      sha,
      parent: git("rev-parse", `${sha}^`),
      subject: git("log", "-1", "--format=%s", sha),
      paths: lines(git("diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", sha))
    }))
    : [];
  const dirtyGuardedPaths = sorted([
    ...lines(git("diff", "--name-only", "--no-renames", "HEAD", "--", ...GQA2_GUARDED_PATHS)),
    ...lines(git("ls-files", "--others", "--exclude-standard", "--", ...GQA2_GUARDED_PATHS))
  ]);
  return {
    head,
    implementationInHistory,
    implementationParent: git("rev-parse", `${GQA2_IMPLEMENTATION}^`),
    implementationSubject: git("log", "-1", "--format=%s", GQA2_IMPLEMENTATION),
    implementationPaths: lines(git("diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", GQA2_IMPLEMENTATION)),
    acceptedProductDelta: lines(git("diff", "--name-only", "--no-renames", GQA2_PREDECESSOR, GQA2_IMPLEMENTATION, "--", ...GQA2_FROZEN_ROOTS)),
    laterProductDelta: sorted([
      ...(implementationInHistory ? lines(git("diff", "--name-only", "--no-renames", GQA2_IMPLEMENTATION, "--", ...GQA2_FROZEN_ROOTS)) : ["<implementation not in history>"]),
      ...untracked
    ]),
    committedBlob,
    currentBlob,
    currentSha256,
    laterCommits,
    dirtyGuardedPaths
  };
}

export function isExactGqa2Successor(root = process.cwd()) {
  try { return matchesExactGqa2Successor(collectGqa2SuccessorEvidence(root)); }
  catch { return false; }
}

/** True only for one of the nine accepted runtime paths, and only when the exact successor holds. */
export function isAcceptedGqa2RuntimePath(file, accepted) {
  return accepted === true && GQA2_RUNTIME_PATHS.includes(file);
}
