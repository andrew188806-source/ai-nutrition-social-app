#!/usr/bin/env node
// SR-2D-R1 authorized-repoint equivalence proof.
//
// The one authorized deployability delta to otherwise-frozen SR-2A authority is a single type-only
// import specifier in supabase/functions/_shared/social-ranking/types.ts. This proves that the delta
// is exactly one line, that it is exactly the authorized line, that the emitted runtime JavaScript is
// byte-identical before and after, and that the bridged type is structurally compatible with the
// canonical SharedTasteAdapterResult it replaces.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

export const SR2A_FROZEN_BASELINE = "b0673368b220c18c7c83fbf2e9bed350c8423d2e";
export const REPOINTED_FILE = "supabase/functions/_shared/social-ranking/types.ts";
export const CANONICAL_SPECIFIER = "../../../../packages/shared/src/domain/taste-similarity/shared-adapter/types.ts";
export const BRIDGE_SPECIFIER = "../social-taste-types/sharedTasteAdapterTypes.generated.ts";

function gitBytes(args) {
  const result = spawnSync("git", args, { cwd: root, encoding: null, windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed`);
  return result.stdout;
}
const lf = (value) => value.replaceAll("\r\n", "\n");
const emit = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext, removeComments: true }
}).outputText.trim();

export function proveRepointEquivalence() {
  // The SR-2A freeze commit is the immutable historical authority for this file.
  const before = lf(gitBytes(["cat-file", "blob", `${SR2A_FROZEN_BASELINE}:${REPOINTED_FILE}`]).toString("utf8"));
  const after = lf(fs.readFileSync(path.join(root, REPOINTED_FILE), "utf8"));

  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const changed = [];
  for (let index = 0; index < Math.max(beforeLines.length, afterLines.length); index += 1) {
    if (beforeLines[index] !== afterLines[index]) changed.push({ line: index + 1, before: beforeLines[index], after: afterLines[index] });
  }

  const onlyAuthorizedLineChanged =
    changed.length === 1 &&
    changed[0].line === 1 &&
    changed[0].before === `import type { SharedTasteAdapterResult } from "${CANONICAL_SPECIFIER}";` &&
    changed[0].after === `import type { SharedTasteAdapterResult } from "${BRIDGE_SPECIFIER}";`;

  const beforeEmit = emit(before);
  const afterEmit = emit(after);

  return Object.freeze({
    changedLineCount: changed.length,
    changed,
    onlyAuthorizedLineChanged,
    runtimeEmitBefore: beforeEmit,
    runtimeEmitAfter: afterEmit,
    runtimeEmitIdentical: beforeEmit === afterEmit,
    runtimeEmitIsTypeOnly: afterEmit === "export {};"
  });
}

// Structural compatibility: the bridged alias must resolve to the same type shape the canonical
// module exports, checked by the compiler rather than by string comparison.
export function proveTypeCompatibility() {
  const probe = path.join(root, "supabase/functions/_shared/social-taste-types/.sr2d-compat-probe.ts");
  const source = `import type { SharedTasteAdapterResult as Canonical } from "../../../../packages/shared/src/domain/taste-similarity/shared-adapter/types.ts";
import type { SharedTasteAdapterResult as Bridged } from "./sharedTasteAdapterTypes.generated.ts";
const toBridged = (value: Canonical): Bridged => value;
const toCanonical = (value: Bridged): Canonical => value;
export type Probe = [typeof toBridged, typeof toCanonical];
`;
  fs.writeFileSync(probe, source);
  try {
    const program = ts.createProgram([probe], {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true
    });
    const diagnostics = ts.getPreEmitDiagnostics(program)
      .filter((entry) => entry.file && entry.file.fileName.includes(".sr2d-compat-probe"))
      .map((entry) => ts.flattenDiagnosticMessageText(entry.messageText, " "));
    return Object.freeze({ mutuallyAssignable: diagnostics.length === 0, diagnostics });
  } finally {
    fs.rmSync(probe, { force: true });
  }
}

if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoint = proveRepointEquivalence();
  const compatibility = proveTypeCompatibility();
  const passed = repoint.onlyAuthorizedLineChanged
    && repoint.runtimeEmitIdentical
    && repoint.runtimeEmitIsTypeOnly
    && compatibility.mutuallyAssignable;
  console.log(JSON.stringify({
    suite: "social-candidate-sr2d-repoint-equivalence",
    status: passed ? "passed" : "failed",
    repoint,
    compatibility
  }, null, 2));
  process.exit(passed ? 0 : 1);
}
