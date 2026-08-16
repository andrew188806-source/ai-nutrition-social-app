#!/usr/bin/env node
// SR-2D-R1 deployability bridge generator.
//
// WHY THIS EXISTS. The Supabase Edge bundler resolves every import specifier literally: it opens the
// specifier as a file and does not append extensions or fall back to a directory index. The canonical
// Taste package under packages/shared/src/domain/taste-similarity/** uses extension-less, directory
// oriented relative specifiers ("../snapshot", "../comparison", ...), so any Edge function whose graph
// reaches it fails to bundle. SR-2D is the first phase to deploy a function that reaches it, through
// exactly one type-only import in supabase/functions/_shared/social-ranking/types.ts.
//
// WHAT THIS PRODUCES. One flattened, types-only artifact carrying the transitive TYPE closure of
// SharedTasteAdapterResult. It has NO import statements at all, so it presents zero module-resolution
// surface to the bundler — the same philosophy as scripts/build-taste-foundation-runtime.mjs, which
// removed the resolution surface rather than patching specifiers.
//
// WHAT IT DELIBERATELY DOES NOT CONTAIN. No runtime statement, no comparator, no ranking, exposure or
// profile projection implementation, and no independently authored policy. Value symbols reached only
// through `typeof` are emitted as ambient `declare const` with the checker's own type text, so their
// literal values remain canonical-source authority and are never re-stated here.
//
// The canonical package remains the single source of truth. This file is derived output.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);
const ts = require_("typescript");

const root = process.cwd();
export const BRIDGE_ENTRY_TYPE = "SharedTasteAdapterResult";
export const BRIDGE_SOURCE = "packages/shared/src/domain/taste-similarity/shared-adapter/types.ts";
export const BRIDGE_ARTIFACT = "supabase/functions/_shared/social-taste-types/sharedTasteAdapterTypes.generated.ts";
// The generator may read only the canonical Taste domain. Anything outside is a provenance failure.
export const BRIDGE_SOURCE_ROOT = "packages/shared/src/domain/taste-similarity/";

const BANNER = `// GENERATED - DO NOT EDIT.
//
// Source authority remains canonical packages/shared/src/domain/taste-similarity/**.
// Regenerate with: node scripts/build-social-taste-types-bridge.mjs
//
// Flattened, types-only Edge deployability bridge for ${BRIDGE_ENTRY_TYPE}. Contains no import
// statement, no runtime statement and no business algorithm: the Supabase Edge bundler resolves
// specifiers literally, so removing the module-resolution surface entirely is what makes the SR-2D
// Edge function deployable without altering any canonical Taste or Social implementation byte.
`;

function createProgram() {
  const entry = path.join(root, BRIDGE_SOURCE);
  return ts.createProgram([entry], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true
  });
}

// Collects every named type the entry type structurally depends on, plus every value symbol reached
// through a `typeof` query. Type aliases and interfaces are order-independent in TypeScript, so the
// emitted order is deterministic alphabetical rather than topological.
export function collectBridge() {
  const program = createProgram();
  const checker = program.getTypeChecker();
  const entryFile = program.getSourceFile(path.join(root, BRIDGE_SOURCE));
  if (!entryFile) throw new Error(`bridge source not found: ${BRIDGE_SOURCE}`);

  const typeDeclarations = new Map();
  const valueDeclarations = new Map();
  const sourceFiles = new Set();
  const pending = [];

  const declarationOf = (symbol) => (symbol?.declarations ?? [])[0];
  const alias = (symbol) =>
    symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;

  function relativeOf(node) {
    return path.relative(root, node.getSourceFile().fileName).replaceAll("\\", "/");
  }

  function enqueue(symbol) {
    const resolved = alias(symbol);
    const declaration = declarationOf(resolved);
    if (!declaration) return;
    const file = relativeOf(declaration);
    if (!file.startsWith(BRIDGE_SOURCE_ROOT)) return;
    sourceFiles.add(file);

    if (ts.isTypeAliasDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) {
      if (typeDeclarations.has(resolved.name)) return;
      typeDeclarations.set(resolved.name, declaration);
      pending.push(declaration);
      return;
    }
    if (ts.isVariableDeclaration(declaration)) {
      if (valueDeclarations.has(resolved.name)) return;
      // Only the TYPE of the constant crosses the bridge, never its literal value.
      valueDeclarations.set(resolved.name, checker.typeToString(
        checker.getTypeOfSymbolAtLocation(resolved, declaration),
        undefined,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType
      ));
    }
  }

  function scan(node) {
    if (ts.isTypeReferenceNode(node)) {
      let name = node.typeName;
      while (ts.isQualifiedName(name)) name = name.right;
      enqueue(checker.getSymbolAtLocation(name));
    } else if (ts.isTypeQueryNode(node)) {
      let name = node.exprName;
      while (ts.isQualifiedName(name)) name = name.right;
      enqueue(checker.getSymbolAtLocation(name));
    }
    ts.forEachChild(node, scan);
  }

  const entrySymbol = checker.getSymbolAtLocation(entryFile)
    ? checker.getExportsOfModule(checker.getSymbolAtLocation(entryFile)).find((s) => s.name === BRIDGE_ENTRY_TYPE)
    : undefined;
  if (!entrySymbol) throw new Error(`${BRIDGE_ENTRY_TYPE} is not exported by ${BRIDGE_SOURCE}`);
  enqueue(entrySymbol);
  while (pending.length > 0) scan(pending.pop());

  return { typeDeclarations, valueDeclarations, sourceFiles: [...sourceFiles].sort() };
}

export function renderBridge() {
  const { typeDeclarations, valueDeclarations, sourceFiles } = collectBridge();

  const constants = [...valueDeclarations.entries()].sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([name, type]) => `declare const ${name}: ${type};`);
  const types = [...typeDeclarations.entries()].sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([, declaration]) => {
      // This repository carries core.autocrlf=true with no .gitattributes, so canonical worktree text
      // may arrive CRLF. Normalizing to LF is what makes generation checkout-independent and lets the
      // guard compare generated bytes exactly.
      const text = declaration.getText().replaceAll("\r\n", "\n");
      return text.startsWith("export ") ? text : `export ${text}`;
    });

  const provenance = sourceFiles.map((file) => `//   ${file}`).join("\n");
  const output = `${BANNER}//
// Canonical source closure:
${provenance}

${constants.join("\n")}

${types.join("\n\n")}
`;
  // LF-only, exactly once, so the artifact bytes are identical on every checkout.
  return output.replaceAll("\r\n", "\n");
}

if (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = renderBridge();
  const target = path.join(root, BRIDGE_ARTIFACT);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
  console.log(JSON.stringify({
    generator: "build-social-taste-types-bridge",
    artifact: BRIDGE_ARTIFACT,
    bytes: Buffer.byteLength(output, "utf8")
  }, null, 2));
}
