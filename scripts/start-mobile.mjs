import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mobileRoot = path.join(repoRoot, "apps", "mobile");
const extraArgs = process.argv.slice(2);

// MI-E-C5-R7-C4-R1 — Development Mobile env forwarding.
//
// Expo loads .env* from the EXPO PROJECT ROOT, which is apps/mobile. This repository keeps its local
// Development configuration at the MONOREPO ROOT (.env.local), which is what every Node-based
// harness reads. The two never met: `expo start` ran from apps/mobile, found no env file, and every
// EXPO_PUBLIC_* value was undefined in the bundle. Consumer auth then defaulted to "mock", which
// silently forced mock photo analysis and a disabled Restaurant Catalog on a real device — a
// Development runtime that looked live but was not.
//
// This launcher closes that gap by forwarding the repo-root values into the Expo child process
// BEFORE bundling. process.env wins over .env files in Expo's loader, so nothing is written to disk
// and apps/mobile stays free of env files.
//
// Only EXPO_PUBLIC_* keys are forwarded. Everything else in .env.local — service-role keys, provider
// API keys, test-account passwords — is deliberately left behind: EXPO_PUBLIC_* is the public,
// bundle-inlined namespace, and anything outside it has no business reaching a client bundle.
// Values are never printed; only names, non-sensitive source modes and the project ref are reported.
const PUBLIC_PREFIX = "EXPO_PUBLIC_";
const ENV_FILES = [".env.local", ".env"];

function parseEnvFile(file) {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  for (const rawLine of fs.readFileSync(file, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!value) continue;
    out.set(name, value);
  }
  return out;
}

// Earlier files win, matching dotenv/Expo precedence: .env.local overrides .env.
const loaded = new Map();
const sourcesUsed = [];
for (const candidate of ENV_FILES) {
  const file = path.join(repoRoot, candidate);
  const parsed = parseEnvFile(file);
  if (parsed.size === 0) continue;
  sourcesUsed.push(candidate);
  for (const [name, value] of parsed) {
    if (!loaded.has(name)) loaded.set(name, value);
  }
}

const forwarded = new Map();
for (const [name, value] of loaded) {
  if (!name.startsWith(PUBLIC_PREFIX)) continue;
  // A real process-level override (e.g. CI) still wins over the file.
  if (process.env[name]) continue;
  forwarded.set(name, value);
}

const effective = (name) => process.env[name] ?? forwarded.get(name);
const url = effective("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL") ?? effective("EXPO_PUBLIC_SUPABASE_URL");
const publishableKey =
  effective("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY") ?? effective("EXPO_PUBLIC_SUPABASE_ANON_KEY");
const projectRef = (url ?? "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const environment = effective("EXPO_PUBLIC_TASTKIND_ENVIRONMENT") ?? "development";

// Fail closed. Starting with no public configuration is exactly how this round's Development runtime
// silently degraded to mock mode, so an empty or unusable configuration is an error, never a
// fallback. Report names and modes only.
const preflightErrors = [];
if (forwarded.size === 0 && !url) {
  preflightErrors.push(
    `No ${PUBLIC_PREFIX}* configuration found. Expected one of ${ENV_FILES.join(" / ")} at the repository root.`
  );
}
if (!url) preflightErrors.push("Missing consumer Supabase URL (EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL).");
if (!publishableKey) {
  preflightErrors.push(
    "Missing consumer Supabase publishable key (EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY)."
  );
}
if (url && !projectRef) preflightErrors.push("Consumer Supabase URL is not a recognizable https://<ref>.supabase.co project URL.");
if (environment !== "development") {
  preflightErrors.push(`Refusing to start: EXPO_PUBLIC_TASTKIND_ENVIRONMENT is "${environment}". This launcher is Development-only.`);
}

console.log("Mobile Development preflight");
console.log(`  env source(s)        : ${sourcesUsed.length ? sourcesUsed.join(", ") : "none"}`);
console.log(`  ${PUBLIC_PREFIX}* forwarded : ${forwarded.size}`);
console.log(`  project ref          : ${projectRef ?? "UNRESOLVED"}`);
console.log(`  environment          : ${environment}`);
console.log(`  supabase url         : ${url ? "present" : "MISSING"}`);
console.log(`  publishable key      : ${publishableKey ? "present" : "MISSING"}`);
console.log(`  auth source          : ${effective("EXPO_PUBLIC_TASTKIND_CONSUMER_AUTH_SOURCE") ?? "unset"}`);
console.log(`  analysis source      : ${effective("EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_ANALYSIS_SOURCE") ?? "unset"}`);
console.log(`  upload source        : ${effective("EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_PHOTO_UPLOAD_SOURCE") ?? "unset"}`);
console.log(`  catalog source       : ${effective("EXPO_PUBLIC_TASTKIND_CONSUMER_RESTAURANT_CATALOG_SOURCE") ?? "unset"}`);
console.log(`  writes enabled       : ${effective("EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_WRITES_ENABLED") ?? "unset"}`);

if (preflightErrors.length) {
  console.error("\nMobile Development preflight FAILED:");
  for (const message of preflightErrors) console.error(`  - ${message}`);
  console.error("\nNot starting Expo. Fix the Development configuration rather than falling back to mock mode.");
  process.exit(1);
}

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
    ...Object.fromEntries(forwarded),
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
