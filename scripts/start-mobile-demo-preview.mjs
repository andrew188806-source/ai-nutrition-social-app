import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mobileRoot = path.join(repoRoot, "apps", "mobile");
const extraArgs = process.argv.slice(2);

// Development-only, fully mock Consumer preview: exercises routing/rendering (e.g. the IP Codex
// screens) without any live Supabase Auth/session. `scripts/start-mobile.mjs` forwards this
// repository's LIVE Development configuration from `.env.local` and deliberately fails closed
// without a real project URL/key — it is not interchangeable with this launcher.
//
// Every value below is read directly from the repository's own already-public, already-committed
// `.env.example` (never `.env.local`), so this script can never diverge into an undocumented or
// invalid combination and never touches a real credential. If `.env.example`'s canonical mock
// values ever change, this launcher picks them up automatically rather than drifting from them.
const PUBLIC_PREFIX = "EXPO_PUBLIC_";
const envExamplePath = path.join(repoRoot, ".env.example");

function parseEnvFile(file) {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    out.set(name, value);
  }
  return out;
}

const declared = parseEnvFile(envExamplePath);
const mockEnv = new Map();
for (const [name, value] of declared) {
  if (!name.startsWith(PUBLIC_PREFIX)) continue;
  if (!value) continue; // placeholders left blank in .env.example (e.g. legacy aliases) stay unset
  mockEnv.set(name, value);
}

if (mockEnv.get("EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE") !== "mock") {
  console.error("Refusing to start: .env.example no longer declares EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE=mock.");
  console.error("This launcher only ever uses the repository's own documented mock composition — update it there, not here.");
  process.exit(1);
}

console.log("Mobile Demo Preview (mock Consumer composition, from .env.example)");
console.log(`  ${PUBLIC_PREFIX}* applied    : ${mockEnv.size}`);
console.log(`  auth source          : ${mockEnv.get("EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE")}`);
console.log(`  profile source       : ${mockEnv.get("EXPO_PUBLIC_TASTKIND_CONSUMER_PROFILE_SOURCE")}`);
console.log(`  supabase auth enabled: ${mockEnv.get("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_AUTH_ENABLED")}`);
console.log(`  writes enabled       : ${mockEnv.get("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED")}`);

function quoteCmdArg(value) {
  return /[\s"]/u.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

const command = process.platform === "win32" ? "cmd.exe" : "npx";
const args = process.platform === "win32"
  ? ["/d", "/s", "/c", ["npx", "expo", "start", ...extraArgs].map(quoteCmdArg).join(" ")]
  : ["expo", "start", ...extraArgs];

const child = spawn(command, args, {
  cwd: mobileRoot,
  env: {
    ...process.env,
    ...Object.fromEntries(mockEnv),
    EXPO_NO_DEPENDENCY_VALIDATION: "1"
  },
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
