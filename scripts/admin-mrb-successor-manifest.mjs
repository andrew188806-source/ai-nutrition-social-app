// Exact ADMIN-MRB successor evidence for historical, source-only guards.
// The accepted implementation is immutable; this does not authorize future Admin work.
//
// Two shapes are recognized. The original local shape (origin/main still at the MRB predecessor) is
// unchanged. The pushed shape is history-durable: the MRB commit and its exact guard closure are in
// the current ancestry, and every product change after the MRB predecessor belongs either to MRB
// itself or to one of the exact later successors (GQA-1, GQA-2), each proven by its own manifest.
// Where GQA-2 legitimately rewrote an MRB file, only the exact GQA-2 bytes are accepted.
import crypto from "node:crypto";
import fs from "node:fs";
import child from "node:child_process";
import { GQA1_PRODUCT_PATHS, isExactGqa1Successor } from "./gqa-1-successor-manifest.mjs";
import { GQA2_RUNTIME, GQA2_RUNTIME_PATHS, isExactGqa2Successor } from "./gqa-2-successor-manifest.mjs";

export const MRB_PREDECESSOR = "2fe70443d9292a7fc9cddad0e717266b4996c3f3";
export const MRB_COMMIT = "7a4a3411b945f6e168cedf91711aa3cb2e0a2faa";
export const MRB_SUBJECT = "Add manager permission presets to Admin";
export const MRB_CLOSURE = "cb287bd33fc6cea858dcc0b2dce77de89506682e";
export const MRB_CLOSURE_SUBJECT = "Record ADMIN-MRB exact successor guard compatibility";
export const MRB_ROUTE = "apps/admin-web/app/api/admin/management/staff/preset-preview/route.ts";

export const MRB_PRODUCT_SHA256 = Object.freeze({
  "apps/admin-web/app/admin/management/staff/[staffAccountId]/page.tsx": "0ef81ebb8d76ac4e11fcc9a170109f87faf2b15454012453ab3f8d15f90eb662",
  [MRB_ROUTE]: "404844b184498de9b219962cbbdd481c2faad02b6d8af7532063c91518da4751",
  "apps/admin-web/auth/admin-manager-preset-flow.ts": "71a8dd37ecae8b760f5cb650a8127f00b41cd071ed93efb59dd1a68a0db655cf",
  "apps/admin-web/auth/admin-manager-presets.ts": "194f5e54ed202e3c3d5e7dd313c0d400861d584fae358a337ba22ab386489a7b",
  "apps/admin-web/components/admin-shell/ManagerPresetPanel.tsx": "59ee0b7700c78e618e2afbd4593fc832c56b686c1ca619390f8f70db0b10d8e2",
  "apps/admin-web/server/adminManagerPresetReadRuntime.ts": "6f5e57ec75dc2622fa1144e354316a531a924037035c07e5bcfb27c9edd25914"
});
export const MRB_PRODUCT_PATHS = Object.freeze(Object.keys(MRB_PRODUCT_SHA256));
export const MRB_COMMIT_SHA256 = Object.freeze({
  ...MRB_PRODUCT_SHA256,
  "docs/admin-manager-presets-mrb.md": "487b7274a300e289431ea0be9788c58c17f8a580b9360328af6b5852d9635827",
  "scripts/admin-e1-guard.mjs": "b5c4c3529834d4f85f4d964d684de7647999323ddc4033995a4f232200b94c9b",
  "scripts/admin-manager-presets-mrb-test.mjs": "1482bd009a72dac7f81550e829f0035fed1c6719d5592bcb602339af2d99a2d9"
});
export const MRB_COMMIT_PATHS = Object.freeze(Object.keys(MRB_COMMIT_SHA256));
export const MRB_CLOSURE_PATHS = Object.freeze([
  "scripts/admin-e1-guard.mjs",
  "scripts/admin-mrb-successor-manifest.mjs",
  "scripts/admin-mrb-successor-mutations.mjs",
  "scripts/admin-operational-review-queues-c-guard.mjs",
  "scripts/admin-menu-canonical-ui-b3-guard.mjs",
  "scripts/admin-restaurant-branch-canonical-ui-b2-guard.mjs",
  "scripts/platform-admin-ra-1a-guard.mjs"
]);

const samePaths = (actual, expected) =>
  actual.length === expected.length && actual.every((file, index) => file === expected[index]);
const uniqueSorted = (paths) => [...new Set(paths)].sort();

const PRODUCT_ROOT_LIST = Object.freeze(["apps/admin-web", "apps/mobile", "apps/restaurant-web", "supabase", "packages/shared", "lib"]);
const isProductPath = (file) => PRODUCT_ROOT_LIST.some((root) => file === root || file.startsWith(`${root}/`));
const exactPath = (file) => typeof file === "string" && file.length > 0 && !/[*?]/.test(file) && !file.endsWith("/");

/** The later exact successor that legitimately owns a post-MRB product path, or null. */
function laterSuccessorFor(file, evidence) {
  if (evidence.later?.gqa2 === true && GQA2_RUNTIME_PATHS.includes(file)) return "gqa2";
  if (evidence.later?.gqa1 === true && GQA1_PRODUCT_PATHS.includes(file)) return "gqa1";
  return null;
}

/** Pure predicate: every accepted path and digest is fixed above, never supplied by the caller. */
export function matchesExactMrbSuccessor(evidence) {
  if (evidence.mrbParent !== MRB_PREDECESSOR || evidence.mrbSubject !== MRB_SUBJECT) return false;
  if (!evidence.mrbCommitPaths.every(exactPath)
    || !samePaths(uniqueSorted(evidence.mrbCommitPaths), uniqueSorted(MRB_COMMIT_PATHS))) return false;
  for (const [file, expected] of Object.entries(MRB_COMMIT_SHA256)) {
    if (evidence.committedSha256[file] !== expected) return false;
  }
  if (evidence.origin === MRB_PREDECESSOR) {
    // Original local shape, unchanged.
    if (evidence.head !== MRB_COMMIT
      && (evidence.parent !== MRB_COMMIT || evidence.headSubject !== MRB_CLOSURE_SUBJECT)) return false;
    if (!samePaths(uniqueSorted(evidence.productDelta), uniqueSorted(MRB_PRODUCT_PATHS))) return false;
    if (!evidence.sinceMrbPaths.every((file) => MRB_CLOSURE_PATHS.includes(file))) return false;
    for (const file of MRB_PRODUCT_PATHS) {
      if (evidence.sourceSha256[file] !== MRB_PRODUCT_SHA256[file]) return false;
    }
    return true;
  }
  // Pushed, history-durable shape.
  if (evidence.mrbInHistory !== true || evidence.closureInHistory !== true
    || evidence.closureParent !== MRB_COMMIT || evidence.closureSubject !== MRB_CLOSURE_SUBJECT
    || !evidence.closurePaths.every(exactPath)
    || !samePaths(uniqueSorted(evidence.closurePaths), uniqueSorted(MRB_CLOSURE_PATHS))) return false;
  if (!evidence.productDelta.every(exactPath) || !evidence.sinceMrbPaths.every(exactPath)) return false;
  if (!MRB_PRODUCT_PATHS.every((file) => evidence.productDelta.includes(file))) return false;
  if (!evidence.productDelta.every((file) => MRB_PRODUCT_PATHS.includes(file) || laterSuccessorFor(file, evidence) !== null)) return false;
  if (!evidence.sinceMrbPaths.filter(isProductPath).every((file) => laterSuccessorFor(file, evidence) !== null)) return false;
  for (const file of MRB_PRODUCT_PATHS) {
    const expected = laterSuccessorFor(file, evidence) === "gqa2" ? GQA2_RUNTIME[file].sha256 : MRB_PRODUCT_SHA256[file];
    if (evidence.sourceSha256[file] !== expected) return false;
  }
  return true;
}

const root = process.cwd();
const git = (...args) => child.execFileSync("git", args, {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024
}).trim();
const lines = (value) => value ? value.split(/\r?\n/).filter(Boolean) : [];
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const PRODUCT_ROOTS = Object.freeze(["apps/admin-web", "apps/mobile", "apps/restaurant-web", "supabase", "packages/shared", "lib"]);

export function collectMrbSuccessorEvidence() {
  const head = git("rev-parse", "HEAD");
  const relevantUntracked = lines(git("ls-files", "--others", "--exclude-standard", "--", ...PRODUCT_ROOTS, "scripts"));
  const productUntracked = relevantUntracked.filter((file) => PRODUCT_ROOTS.some((root) => file === root || file.startsWith(`${root}/`)));
  const sourceSha256 = {}, committedSha256 = {};
  for (const file of MRB_COMMIT_PATHS) {
    sourceSha256[file] = fs.existsSync(file) ? sha(fs.readFileSync(file)) : null;
    committedSha256[file] = sha(child.execFileSync("git", ["show", `${MRB_COMMIT}:${file}`], {
      cwd: root, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024
    }));
  }
  const isAncestor = (ancestor) => child.spawnSync("git", ["merge-base", "--is-ancestor", ancestor, head],
    { cwd: root, stdio: "ignore" }).status === 0;
  const closureInHistory = isAncestor(MRB_CLOSURE);
  return Object.freeze({
    head,
    parent: head === MRB_COMMIT ? null : git("rev-parse", "HEAD^"),
    headSubject: git("log", "-1", "--format=%s"),
    origin: git("rev-parse", "origin/main"),
    mrbInHistory: isAncestor(MRB_COMMIT),
    closureInHistory,
    closureParent: closureInHistory ? git("rev-parse", `${MRB_CLOSURE}^`) : null,
    closureSubject: closureInHistory ? git("log", "-1", "--format=%s", MRB_CLOSURE) : null,
    closurePaths: closureInHistory ? lines(git("diff-tree", "--no-commit-id", "--name-only", "-r", MRB_CLOSURE)) : [],
    later: Object.freeze({ gqa1: isExactGqa1Successor(), gqa2: isExactGqa2Successor(root) }),
    mrbParent: git("rev-parse", `${MRB_COMMIT}^`),
    mrbSubject: git("log", "-1", "--format=%s", MRB_COMMIT),
    mrbCommitPaths: lines(git("diff-tree", "--no-commit-id", "--name-only", "-r", MRB_COMMIT)),
    productDelta: uniqueSorted([
      ...lines(git("diff", "--name-only", MRB_PREDECESSOR, "--", ...PRODUCT_ROOTS)),
      ...productUntracked
    ]),
    sinceMrbPaths: uniqueSorted([
      ...lines(git("diff", "--name-only", MRB_COMMIT)),
      ...relevantUntracked
    ]),
    sourceSha256,
    committedSha256
  });
}

export function isExactMrbSuccessor() {
  try { return matchesExactMrbSuccessor(collectMrbSuccessorEvidence()); }
  catch { return false; }
}

export function unexpectedMrbApiOrSupabase(changed, authorizedMigrations) {
  const accepted = isExactMrbSuccessor();
  return changed.filter((file) =>
    (/^apps\/admin-web\/app\/api\//.test(file) && !(accepted && file === MRB_ROUTE))
    || (file.startsWith("supabase/") && !authorizedMigrations.has(file))
  );
}
