#!/usr/bin/env node
// SR-1A — deterministic frozen-domain runtime generator.
//
// THE PROBLEM THIS SOLVES. The frozen taste foundation lives in `packages/shared` as raw TypeScript
// with EXTENSION-LESS relative imports (`export * from "./policy";`). A Deno-based server runtime
// resolves relative specifiers by exact path and cannot load them, and the repository has no
// bundler, no `deno.json` and no import map. SR-1 identified this as the first blocker.
//
// WHAT THIS DOES NOT DO. It does not edit one byte of frozen source, and it does not create a second
// scoring authority. The frozen modules remain the only place any rule is written; this script emits
// a DERIVED artifact whose every input is recorded by SHA-256 so the derivation can be re-checked
// mechanically at any time.
//
// WHY A SINGLE ZERO-IMPORT ARTIFACT. Each module is transpiled to CommonJS and wrapped in its own
// closure inside one ESM file with a tiny registry. That keeps every module's scope intact — several
// frozen modules privately define identically named helpers such as `compareCodeUnits`, so
// scope-hoisting concatenation would collide — while producing a file containing NO import statement
// at all. Removing the module-resolution surface entirely is what removes the Deno incompatibility:
// there is no specifier left to resolve.
//
// Deterministic by construction: sources are visited in sorted order, exports are emitted sorted, and
// nothing reads a clock, the environment or the network. Running it twice on unchanged sources
// produces byte-identical output, which is what the guard asserts.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");
const root = process.cwd();

// Canonical entry points. Both are frozen authority: the shared taste domain (TS-1 … TS-6) and the
// TS-2 row mappers, which take DATABASE ROW types and are therefore reusable by a server reader.
// `behaviorMappers.ts` is deliberately NOT an entry — it consumes Mobile domain types that carry
// nutrition snapshots the server must never read, so bundling it would work against data minimization.
const ENTRIES = [
  "packages/shared/src/domain/taste-similarity/index.ts",
  "apps/mobile/features/consumer-taste-profile/foundationMappers.ts"
];

const OUTPUT_MODULE = "supabase/functions/_shared/taste-foundation-runtime/tasteFoundation.generated.mjs";
const OUTPUT_PROVENANCE = "supabase/functions/_shared/taste-foundation-runtime/provenance.generated.json";

const toPosix = (value) => value.split(path.sep).join("/");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// This repository is checked out with `core.autocrlf=true`, so git materializes some frozen sources
// with CRLF while tooling writes LF. Hashing or embedding raw bytes would make both the artifact and
// its provenance depend on WHICH checkout produced the working tree — a temp-clone verification would
// then report drift that does not exist, and a real drift could hide behind a line-ending flip.
// Every source is therefore normalized to LF before it is transpiled, embedded or hashed.
const normalizeNewlines = (value) => value.replaceAll("\r\n", "\n");

function resolveModule(fromId, specifier) {
  const base = path.resolve(root, path.dirname(fromId), specifier);
  for (const suffix of ["", ".ts", "/index.ts"]) {
    const candidate = `${base}${suffix}`;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return toPosix(path.relative(root, candidate));
    }
  }
  throw new Error(`SR-1A generator: unresolved specifier ${specifier} from ${fromId}`);
}

// Collects the whole reachable graph. A bare (non-relative) specifier would mean an external runtime
// dependency, which would reintroduce exactly the resolution surface this artifact exists to remove,
// so it fails closed rather than emitting something Deno might not load.
function collectGraph(entries) {
  const sources = new Map();
  const pending = [...entries];
  while (pending.length > 0) {
    const id = pending.shift();
    if (sources.has(id)) continue;
    const text = normalizeNewlines(fs.readFileSync(path.join(root, id), "utf8"));
    sources.set(id, text);
    const info = ts.preProcessFile(text, true, true);
    for (const reference of info.importedFiles) {
      if (!reference.fileName.startsWith(".")) {
        throw new Error(`SR-1A generator: external specifier "${reference.fileName}" in ${id}`);
      }
      pending.push(resolveModule(id, reference.fileName));
    }
  }
  return new Map([...sources.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
}

function transpile(id, text) {
  const { outputText } = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, newLine: ts.NewLineKind.LineFeed },
    fileName: id
  });
  return outputText;
}

// Evaluates the graph once, purely to enumerate the entry modules' export names so the artifact can
// re-export them statically. This is a build-time read of the canonical source, never a second
// implementation of it.
function collectExportNames(sources, transpiled) {
  const cache = new Map();
  const load = (id) => {
    if (cache.has(id)) return cache.get(id).exports;
    const module = { exports: {} };
    cache.set(id, module);
    const localRequire = (specifier) => load(resolveModule(id, specifier));
    new Function("require", "module", "exports", transpiled.get(id))(localRequire, module, module.exports);
    return module.exports;
  };
  const names = new Set();
  for (const entry of ENTRIES) {
    for (const name of Object.keys(load(entry))) {
      if (name !== "__esModule") names.add(name);
    }
  }
  void sources;
  return [...names].sort();
}

const sources = collectGraph(ENTRIES);
const transpiled = new Map([...sources.entries()].map(([id, text]) => [id, transpile(id, text)]));
const exportNames = collectExportNames(sources, transpiled);

const provenanceEntries = [...sources.entries()].map(([id, text]) => ({ path: id, sha256: sha256(text) }));

const lines = [];
lines.push("// GENERATED FILE — DO NOT EDIT.");
lines.push("//");
lines.push("// Produced by scripts/build-taste-foundation-runtime.mjs from frozen canonical source.");
lines.push("// This artifact contains no import statement and no external dependency, so it presents no");
lines.push("// module-resolution surface to any ESM runtime. Every rule it executes is written in the frozen");
lines.push("// sources listed in provenance.generated.json and nowhere else; editing this file by hand would");
lines.push("// create a second authority and is detected by the SR-1A guard.");
lines.push("//");
lines.push(`// sourceCount: ${provenanceEntries.length}`);
for (const entry of provenanceEntries) lines.push(`// source: ${entry.path} sha256=${entry.sha256}`);
lines.push("");
lines.push("const __registry = new Map();");
lines.push("const __cache = new Map();");
lines.push("function __require(id) {");
lines.push("  if (__cache.has(id)) return __cache.get(id).exports;");
lines.push("  const factory = __registry.get(id);");
lines.push('  if (!factory) throw new Error("taste foundation runtime: unknown module " + id);');
lines.push("  const module = { exports: {} };");
lines.push("  __cache.set(id, module);");
lines.push("  factory(__require, module, module.exports);");
lines.push("  return module.exports;");
lines.push("}");
lines.push("");
for (const [id, code] of transpiled) {
  lines.push(`__registry.set(${JSON.stringify(id)}, (require, module, exports) => {`);
  lines.push(code.replace(/\r\n/g, "\n").replace(/\n+$/, ""));
  lines.push("});");
  lines.push("");
}
// Relative specifiers inside the wrapped modules are rewritten to canonical registry ids at load
// time by this shim, so the wrapped bodies stay byte-faithful to the transpiled canonical source.
lines.push("const __resolve = new Map(" + JSON.stringify(
  [...sources.keys()].map((id) => [id, Object.fromEntries(
    ts.preProcessFile(sources.get(id), true, true).importedFiles.map((reference) => [
      reference.fileName,
      resolveModule(id, reference.fileName)
    ])
  )])
) + ");");
lines.push("const __rawRequire = __require;");
lines.push("function __scopedRequire(fromId) {");
lines.push("  return (specifier) => __rawRequire(__resolve.get(fromId)[specifier]);");
lines.push("}");
lines.push("for (const [id, factory] of [...__registry.entries()]) {");
lines.push("  __registry.set(id, (_require, module, exports) => factory(__scopedRequire(id), module, exports));");
lines.push("}");
lines.push("");
for (const entry of ENTRIES) lines.push(`const __entry_${sha256(entry).slice(0, 12)} = __require(${JSON.stringify(entry)});`);
lines.push("");
lines.push("const __exports = Object.assign({}, " + ENTRIES.map((entry) => `__entry_${sha256(entry).slice(0, 12)}`).join(", ") + ");");
lines.push("");
for (const name of exportNames) lines.push(`export const ${name} = __exports[${JSON.stringify(name)}];`);
lines.push("");

const artifact = lines.join("\n");
const provenance = {
  generator: "scripts/build-taste-foundation-runtime.mjs",
  entries: ENTRIES,
  exportCount: exportNames.length,
  sources: provenanceEntries,
  artifactSha256: sha256(artifact)
};

if (process.argv.includes("--check")) {
  // The committed artifacts are read through the same LF normalization, because a checkout under
  // `core.autocrlf=true` rewrites them too. What must be proven is that the artifact still derives
  // from the frozen source — a claim about content, which git's line-ending policy does not change.
  const existingArtifact = normalizeNewlines(fs.readFileSync(path.join(root, OUTPUT_MODULE), "utf8"));
  const existingProvenance = normalizeNewlines(fs.readFileSync(path.join(root, OUTPUT_PROVENANCE), "utf8"));
  const artifactMatches = existingArtifact === artifact;
  const provenanceMatches = existingProvenance === `${JSON.stringify(provenance, null, 2)}\n`;
  console.log(JSON.stringify({ check: "taste-foundation-runtime", artifactMatches, provenanceMatches }, null, 2));
  process.exitCode = artifactMatches && provenanceMatches ? 0 : 1;
} else {
  fs.mkdirSync(path.join(root, path.dirname(OUTPUT_MODULE)), { recursive: true });
  fs.writeFileSync(path.join(root, OUTPUT_MODULE), artifact, "utf8");
  fs.writeFileSync(path.join(root, OUTPUT_PROVENANCE), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    generated: OUTPUT_MODULE,
    sourceCount: provenanceEntries.length,
    exportCount: exportNames.length,
    artifactSha256: provenance.artifactSha256
  }, null, 2));
}
