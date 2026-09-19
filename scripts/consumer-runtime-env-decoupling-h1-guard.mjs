#!/usr/bin/env node
// H1 (pre-Admin hardening): the Consumer runtime must obtain its Supabase project from configuration
// only. Static scan (no compiled-in project identity in app runtime source) plus behavioural checks of
// the real environment reader, executed from its own source. No network, no database, no credentials.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import cp from "node:child_process";

const root = process.cwd();
const req = createRequire(path.join(root, "package.json"));
const ts = req("typescript");
const ENV_FILE = "apps/mobile/features/consumer-auth/supabaseConsumerEnvironment.ts";
const DEV_REF = ["msbgnnoo", "rsoefuiwluye"].join(""); // built at runtime so this guard never carries the literal itself
const checks = [];
function check(pass, name, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const tracked = cp.spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout.split(/\r?\n/).filter(Boolean);

// ---- static: no project identity in app runtime source -------------------------------------------
const source = read(ENV_FILE);
check(!source.includes(DEV_REF), "the Consumer environment reader contains no project reference");
check(!/\.supabase\.co/.test(source.replace(/\/\/[^\n]*/g, "")), "the reader names no Supabase hostname in executable code");
check(!/\bnew URL\b/.test(source), "the reader does not depend on the platform URL parser");
check(/EXPO_PUBLIC_TASTKIND_ENVIRONMENT\s*!==\s*"development"/.test(source),
  "the explicit development-mode release gate is retained (mode gate is separate from project identity)");
const runtimeSources = tracked.filter((file) => /^(apps\/mobile|packages)\//.test(file) && /\.(ts|tsx|js|jsx|json)$/.test(file) && !/\/(node_modules|dist|\.expo)\//.test(file));
const offenders = runtimeSources.filter((file) => read(file).includes(DEV_REF));
check(offenders.length === 0, "no tracked file under apps/mobile or packages carries the project reference", offenders);
const importers = tracked.filter((file) => file.startsWith("apps/mobile/") && /\.(ts|tsx)$/.test(file) && read(file).includes("getSupabaseConsumerEnvironment"));
check(importers.length >= 8, "every Consumer composition still reads the environment through the single reader", importers.length);

// ---- behavioural: execute the real reader ---------------------------------------------------------
const output = ts.transpileModule(source, { fileName: ENV_FILE, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(`(function(module,exports,require){${output}\n})`, { process: { env: {} } })(mod, mod.exports, () => ({}));
const read_ = mod.exports.getSupabaseConsumerEnvironment;
check(typeof read_ === "function", "the reader module loads and exports getSupabaseConsumerEnvironment");
const KEY = "PUBLIC_TEST_PUBLISHABLE_VALUE_NOT_A_CREDENTIAL";
const base = (over = {}) => ({ EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development", EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://example-project.supabase.co", EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY: KEY, ...over });
const empty = (result) => result && result.url === undefined && result.publishableKey === undefined;

const dev = read_(base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: `https://${DEV_REF}.supabase.co` }));
check(dev.url === `https://${DEV_REF}.supabase.co` && dev.publishableKey === KEY, "the current Development configuration still initializes (project supplied by configuration)");
const other = read_(base());
check(other.url === "https://example-project.supabase.co" && other.publishableKey === KEY, "a different well-formed project supplied by configuration is used exactly as configured (no compiled-in pin)");
check(read_(base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://example-project.supabase.co/" })).url === "https://example-project.supabase.co/", "a trailing slash is accepted");
check(read_(base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "http://127.0.0.1:54321" })).url === "http://127.0.0.1:54321", "plain http is accepted for a loopback host only");
check(read_(base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://Custom-Domain.Example.com" })).url === "https://Custom-Domain.Example.com", "a custom HTTPS domain is accepted (no vendor hostname requirement)");

// fail closed
const refused = [
  ["missing URL", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: undefined })],
  ["blank URL", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "   " })],
  ["missing key", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY: undefined })],
  ["blank key", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY: "  " })],
  ["missing mode", base({ EXPO_PUBLIC_TASTKIND_ENVIRONMENT: undefined })],
  ["production mode", base({ EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "production" })],
  ["unknown mode", base({ EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "Development" })],
  ["http non-loopback", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "http://example-project.supabase.co" })],
  ["URL path", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://example-project.supabase.co/rest/v1" })],
  ["URL query", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://example-project.supabase.co?x=1" })],
  ["URL fragment", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://example-project.supabase.co#f" })],
  ["URL userinfo", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://user@example-project.supabase.co" })],
  ["non-URL text", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "example-project" })],
  ["javascript scheme", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "javascript:alert(1)" })],
  ["ftp scheme", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "ftp://example-project.supabase.co" })],
  ["scheme only", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://" })],
  ["leading-dot host", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://.example.com" })],
  ["whitespace inside", base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://exam ple.supabase.co" })],
  ["empty environment", {}]
];
for (const [label, env] of refused) check(empty(read_(env)), `fail closed: ${label} yields an empty environment (client factory then refuses to construct)`);

// legacy alias semantics preserved
const legacy = { EXPO_PUBLIC_TASTKIND_ENVIRONMENT: "development", EXPO_PUBLIC_SUPABASE_URL: "https://legacy-project.supabase.co", EXPO_PUBLIC_SUPABASE_ANON_KEY: KEY };
check(read_(legacy).url === "https://legacy-project.supabase.co", "the legacy alias variables remain honoured");
check(empty(read_({ ...legacy, EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL: "https://user@bad.example.com", EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY: KEY })),
  "an invalid canonical URL cannot fall back to a valid legacy URL");
check(read_(base({ EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_PUBLISHABLE_KEY: `  ${KEY}  ` })).publishableKey === KEY, "the publishable key is trimmed");

// classification of the remaining Development-project constant (reported, not modified here)
const executor = "supabase/functions/_shared/social-runtime-transport/executorTransportConfig.ts";
check(tracked.includes(executor) && !tracked.some((file) => file.startsWith("apps/") && read(file).includes("SOCIAL_RUNTIME_DEVELOPMENT_PROJECT_REF")),
  "the separate server-side Social executor transport constant is not reachable from any app runtime (out of H1 scope)");

const failed = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "consumer-runtime-env-decoupling-h1-guard", total: checks.length, passed: checks.length - failed.length, failed: failed.length, failures: failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
