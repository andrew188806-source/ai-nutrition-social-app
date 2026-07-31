#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const checks = [];
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function expect(condition, name) {
  if (!condition) throw new Error(`FAIL [${name}]`);
  checks.push({ name, pass: true });
}

function transpiledProviderSource() {
  const absolute = path.resolve(root, "apps/mobile/features/consumer-runtime/secureUuidProvider.ts");
  const source = fs.readFileSync(absolute, "utf8");
  return {
    absolute,
    output: ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
    }).outputText
  };
}

// Loads a fresh instance of the real provider module with a given require("expo-crypto") behavior,
// runs `fn(provider)` while globalThis.crypto is set to `webCrypto` for the ENTIRE call (not just
// the module load), then restores the original globalThis.crypto no matter what fn does.
function withMockedRuntime(webCrypto, requireExpoCrypto, fn) {
  const { absolute, output } = transpiledProviderSource();
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: webCrypto, configurable: true });
  try {
    const mod = { exports: {} };
    const localRequire = (request) => {
      if (request === "expo-crypto") return requireExpoCrypto();
      throw new Error(`Smoke refused unexpected require: ${request}`);
    };
    const wrapper = vm.runInThisContext(`(function(require,module,exports){${output}\n})`, { filename: absolute });
    wrapper(localRequire, mod, mod.exports);
    return fn(mod.exports);
  } finally {
    if (originalDescriptor) Object.defineProperty(globalThis, "crypto", originalDescriptor);
    else delete globalThis.crypto;
  }
}

// Scenario 1: native Web Crypto randomUUID available (Node's real environment, and any browser).
{
  const id = withMockedRuntime(
    { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
    () => { throw new Error("expo-crypto must not be reached when crypto.randomUUID exists"); },
    (provider) => provider.generateSecureUuidV4()
  );
  expect(id === "11111111-1111-4111-8111-111111111111", "layer 1 (crypto.randomUUID) used when present, expo-crypto never touched");
}

// Scenario 2: randomUUID absent, getRandomValues available (older engines / some polyfills).
{
  const id = withMockedRuntime(
    {
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i += 1) arr[i] = i;
        return arr;
      }
    },
    () => { throw new Error("expo-crypto must not be reached when crypto.getRandomValues exists"); },
    (provider) => provider.generateSecureUuidV4()
  );
  expect(UUID_V4_RE.test(id), "layer 2 (crypto.getRandomValues) produces a spec-valid v4 UUID");
}

// Scenario 3: THE PHYSICAL-DEVICE CASE — no global.crypto at all (Hermes/Expo Go), only expo-crypto
// available, exactly as confirmed present on a real Expo Go iOS runtime.
{
  const id = withMockedRuntime(
    undefined,
    () => ({ randomUUID: () => "22222222-2222-4222-8222-222222222222" }),
    (provider) => provider.generateSecureUuidV4()
  );
  expect(
    id === "22222222-2222-4222-8222-222222222222",
    "layer 3 (expo-crypto.randomUUID) used when global.crypto is entirely absent — the exact Hermes/Expo Go condition that crashed physical-device R3"
  );
}

// Scenario 3b: global.crypto absent AND expo-crypto only exposes getRandomValues (not randomUUID).
{
  const id = withMockedRuntime(
    undefined,
    () => ({
      getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i += 1) arr[i] = (i * 7) % 256;
        return arr;
      }
    }),
    (provider) => provider.generateSecureUuidV4()
  );
  expect(UUID_V4_RE.test(id), "layer 3 fallback (expo-crypto.getRandomValues) produces a spec-valid v4 UUID under simulated Hermes");
}

// Scenario 4: every provider absent — global.crypto undefined AND require("expo-crypto") itself
// throws, exactly matching the real, empirically-confirmed Node failure
// ("Cannot find package 'expo-modules-core'"). Must fail closed, never silently degrade to
// Math.random/Date.now/a deterministic string.
{
  let threw = false;
  let message = "";
  try {
    withMockedRuntime(
      undefined,
      () => { throw new Error("Cannot find package 'expo-modules-core'"); },
      (provider) => provider.generateSecureUuidV4()
    );
  } catch (error) {
    threw = true;
    message = String(error?.message ?? error);
  }
  expect(threw, "all providers absent: generateSecureUuidV4 throws rather than returning any value");
  expect(message === "Secure UUID generation unavailable.", "throws the exact fail-closed message, not a masked/rewrapped error");
}

// Scenario 5: uniqueness — two calls under the real, unmocked Node environment never collide.
{
  const [a, b] = withMockedRuntime(
    globalThis.crypto,
    () => { throw new Error("expo-crypto must not be reached in the real Node environment"); },
    (provider) => [provider.generateSecureUuidV4(), provider.generateSecureUuidV4()]
  );
  expect(UUID_V4_RE.test(a) && UUID_V4_RE.test(b), "real Node environment (no mocking) produces spec-valid v4 UUIDs");
  expect(a !== b, "two consecutive calls never collide");
}

// Scenario 6: no weak fallback exists anywhere in the source text itself — a static safety net in
// case a future edit reintroduces one without any of the above tests noticing (e.g. a caught
// exception silently swapped to Math.random instead of rethrowing).
{
  const src = fs.readFileSync(path.resolve(root, "apps/mobile/features/consumer-runtime/secureUuidProvider.ts"), "utf8");
  expect(!/Math\.random\(/.test(src), "no Math.random() call anywhere in the canonical provider");
  expect(!/Date\.now\(\)\.toString/.test(src), "no Date.now()-derived identifier anywhere in the canonical provider");
}

console.log(JSON.stringify({
  phase: "MI-E-C5-R3 Secure UUID Provider Smoke (simulated Hermes-absent-global-crypto included)",
  status: "passed",
  totalChecks: checks.length,
  passed: checks.length,
  failed: 0,
  checks,
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false
}, null, 2));
