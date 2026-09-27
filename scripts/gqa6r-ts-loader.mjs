// GQA-6R test loader: executes REAL repository TypeScript modules in Node (transpile-only, CommonJS),
// with only the named platform-native modules stubbed. Same approach as the MI-E-C5-R7-C4-R1 smoke.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export function createTsLoader({ root = process.cwd(), stubs = {} } = {}) {
  const requireFromRoot = createRequire(path.join(root, "package.json"));
  const requireFromMobile = createRequire(path.join(root, "apps/mobile/package.json"));
  const ts = requireFromRoot("typescript");
  const cache = new Map();

  const requireBare = (id) => {
    if (Object.hasOwn(stubs, id)) return stubs[id];
    if (id === "@haocu/shared" || id.startsWith("@haocu/shared/")) {
      const rest = id === "@haocu/shared" ? "" : id.slice("@haocu/shared/".length);
      const base = path.join(root, "packages/shared/src", rest);
      for (const candidate of [`${base}.ts`, path.join(base, "index.ts")]) {
        if (fs.existsSync(candidate)) return load(path.relative(root, candidate));
      }
    }
    try { return requireFromRoot(id); } catch { return requireFromMobile(id); }
  };

  function load(relative) {
    const resolved = path.resolve(root, relative);
    if (cache.has(resolved)) return cache.get(resolved);
    const source = fs.readFileSync(resolved, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
      fileName: relative
    });
    const module = { exports: {} };
    cache.set(resolved, module.exports);
    const localRequire = (id) => {
      if (!id.startsWith(".")) return requireBare(id);
      const base = path.resolve(path.dirname(resolved), id);
      // Deno-style specifiers already carry their extension; app-style specifiers do not.
      const explicit = /\.(ts|tsx)$/.test(base) ? [base] : [];
      for (const candidate of [...explicit, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
        if (fs.existsSync(candidate)) return load(path.relative(root, candidate));
      }
      throw new Error(`unresolved ${id} from ${relative}`);
    };
    new Function("require", "module", "exports", outputText)(localRequire, module, module.exports);
    cache.set(resolved, module.exports);
    return module.exports;
  }

  return { load, clear: () => cache.clear() };
}

// Replace process.env's EXPO_PUBLIC_* / TASTKIND_* keys with exactly `env` for the duration of fn.
export async function withProcessEnv(env, fn) {
  const saved = {};
  for (const key of Object.keys(process.env)) {
    if (/^(EXPO_PUBLIC_|TASTKIND_)/.test(key)) { saved[key] = process.env[key]; delete process.env[key]; }
  }
  for (const [key, value] of Object.entries(env)) if (value !== undefined) process.env[key] = value;
  try { return await fn(); }
  finally {
    for (const key of Object.keys(process.env)) if (/^(EXPO_PUBLIC_|TASTKIND_)/.test(key)) delete process.env[key];
    Object.assign(process.env, saved);
  }
}
