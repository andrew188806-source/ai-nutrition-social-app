#!/usr/bin/env node
// H1 mutation suite: each mutant must be KILLED (guard exits non-zero) and must actually change the
// source (STALE = 0). The environment reader is restored byte-for-byte in a finally block and on
// process signals; run this only from a clean worktree and check `git status` afterwards.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

const root = process.cwd();
const FILE = "apps/mobile/features/consumer-auth/supabaseConsumerEnvironment.ts";
const abs = path.join(root, FILE);
const original = fs.readFileSync(abs);
const text = original.toString("utf8");
const restore = () => { try { fs.writeFileSync(abs, original); } catch { /* best effort */ } };
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(signal, () => { restore(); process.exit(130); });
process.on("uncaughtException", (error) => { restore(); console.error(error); process.exit(1); });

const HTTPS = "/^https:\\/\\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\\d{1,5})?\\/?$/";
const LOOP = "/^http:\\/\\/(?:localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d{1,5})?\\/?$/";
const mutants = [
  ["re-pin the project by equality", (s) => s.replace("return HTTPS_ORIGIN.test(value)", 'if (value !== "https://' + ["msbgnnoo", "rsoefuiwluye"].join("") + '.supabase.co") return null; return HTTPS_ORIGIN.test(value)')],
  ["drop the publishable-key requirement", (s) => s.replace("|| !publishableKey) return {}", ") return {}")],
  ["accept plain http for any host", (s) => s.replace(LOOP, "/^http:\\/\\/[a-z.-]+(?::\\d{1,5})?\\/?$/")],
  ["accept userinfo/path/query in the URL", (s) => s.replace(HTTPS, "/^https:\\/\\/.+$/")],
  ["remove the development-mode release gate", (s) => s.replace('env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT !== "development" || ', "")],
  ["let an invalid canonical URL fall back to the legacy URL", (s) => s.replace("acceptedProjectUrl(env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL)", "(acceptedProjectUrl(env.EXPO_PUBLIC_TASTKIND_CONSUMER_SUPABASE_URL) ?? acceptedProjectUrl(env.EXPO_PUBLIC_SUPABASE_URL))")],
  ["stop trimming the publishable key", (s) => s.replace("?.trim();\n  if (env.EXPO", ";\n  if (env.EXPO")]
];

const results = [];
try {
  for (const [name, apply] of mutants) {
    const mutated = apply(text);
    const stale = mutated === text;
    if (!stale) fs.writeFileSync(abs, mutated);
    const run = stale ? { status: 0 } : cp.spawnSync(process.execPath, ["scripts/consumer-runtime-env-decoupling-h1-guard.mjs"], { cwd: root, encoding: "utf8", timeout: 120000 });
    restore();
    results.push({ name, stale, killed: !stale && run.status !== 0 });
    console.log(`${stale ? "STALE " : results.at(-1).killed ? "KILLED" : "SURVIVED"} ${name}`);
  }
} finally {
  restore();
}
const restored = fs.readFileSync(abs).equals(original);
const survived = results.filter((r) => !r.stale && !r.killed).length;
const stale = results.filter((r) => r.stale).length;
console.log(JSON.stringify({ suite: "consumer-runtime-env-decoupling-h1-mutations", mutants: results.length, killed: results.filter((r) => r.killed).length, survived, stale, sourceRestored: restored }, null, 2));
process.exitCode = survived === 0 && stale === 0 && restored ? 0 : 1;
