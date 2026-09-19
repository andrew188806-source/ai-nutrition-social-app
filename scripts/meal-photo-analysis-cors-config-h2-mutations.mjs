#!/usr/bin/env node
// H2 mutation suite over cors.ts and index.ts. Every mutant must be KILLED (guard exits non-zero) and
// must really change the source (STALE = 0). Files are restored byte-for-byte in finally and on signals.
import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

const root = process.cwd();
const DIR = "supabase/functions/meal-photo-analysis";
const targets = { cors: path.join(root, DIR, "cors.ts"), index: path.join(root, DIR, "index.ts") };
const originals = Object.fromEntries(Object.entries(targets).map(([key, file]) => [key, fs.readFileSync(file)]));
const restore = () => { for (const [key, file] of Object.entries(targets)) { try { fs.writeFileSync(file, originals[key]); } catch { /* best effort */ } } };
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(signal, () => { restore(); process.exit(130); });
process.on("uncaughtException", (error) => { restore(); console.error(error); process.exit(1); });

const mutants = [
  ["cors", "accept a wildcard entry", (s) => s.replace("if (value && (HTTPS_ORIGIN.test(value)", 'if (value === "*" || (value && (HTTPS_ORIGIN.test(value)').replace("LOOPBACK_HTTP_ORIGIN.test(value))) origins.add(value);", "LOOPBACK_HTTP_ORIGIN.test(value)))) origins.add(value);")],
  ["cors", "accept plain http for any host", (s) => s.replace("const HTTPS_ORIGIN = /^https:\\/\\/", "const HTTPS_ORIGIN = /^https?:\\/\\/")],
  ["cors", "match by substring instead of exactly", (s) => s.replace("return origin !== null && allowed.has(origin);", "return origin !== null && [...allowed].some((value) => origin.includes(value));")],
  ["cors", "authorize everything when configuration is empty", (s) => s.replace("if (!raw) return origins;", "if (!raw) { origins.add(\"https://haocu-demo.vercel.app\"); return origins; }")],
  ["cors", "accept a path in a configured origin", (s) => s.replace("(?::\\d{1,5})?$/;\nconst LOOP", "(?::\\d{1,5})?(?:\\/.*)?$/;\nconst LOOP")],
  ["index", "reintroduce a hardcoded origin", (s) => s.replace("return isAllowedOrigin(request.headers.get(\"Origin\"), parseAllowedOrigins(Deno.env.get(MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS_ENV)));", "return request.headers.get(\"Origin\") === \"https://haocu-demo.vercel.app\";")],
  ["index", "answer every origin with a wildcard", (s) => s.replace("if (originAllowed(request)) headers.set(\"Access-Control-Allow-Origin\", request.headers.get(\"Origin\") as string);", "headers.set(\"Access-Control-Allow-Origin\", \"*\");")],
  ["index", "authorize the preflight regardless of origin", (s) => s.replace("const allowed = originAllowed(request)\n      && request.headers", "const allowed = true\n      && request.headers")],
  ["index", "drop the preflight method check", (s) => s.replace("&& request.headers.get(\"Access-Control-Request-Method\") === \"POST\"", "")],
  ["index", "read configuration once at load instead of per request", (s) => s.replace("function originAllowed(request: Request): boolean {\n  return isAllowedOrigin(request.headers.get(\"Origin\"), parseAllowedOrigins(Deno.env.get(MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS_ENV)));", "const frozenAllowlist = parseAllowedOrigins(Deno.env.get(MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS_ENV));\nfunction originAllowed(request: Request): boolean {\n  return isAllowedOrigin(request.headers.get(\"Origin\"), frozenAllowlist);")]
];

const results = [];
try {
  for (const [key, name, apply] of mutants) {
    const source = originals[key].toString("utf8");
    const mutated = apply(source);
    const stale = mutated === source;
    if (!stale) fs.writeFileSync(targets[key], mutated);
    const run = stale ? { status: 0 } : cp.spawnSync(process.execPath, ["scripts/meal-photo-analysis-cors-config-h2-guard.mjs"], { cwd: root, encoding: "utf8", timeout: 120000 });
    restore();
    const killed = !stale && run.status !== 0;
    results.push({ key, name, stale, killed });
    console.log(`${stale ? "STALE   " : killed ? "KILLED  " : "SURVIVED"} [${key}] ${name}`);
  }
} finally {
  restore();
}
const restored = Object.entries(targets).every(([key, file]) => fs.readFileSync(file).equals(originals[key]));
const survived = results.filter((r) => !r.stale && !r.killed).length, stale = results.filter((r) => r.stale).length;
console.log(JSON.stringify({ suite: "meal-photo-analysis-cors-config-h2-mutations", mutants: results.length, killed: results.filter((r) => r.killed).length, survived, stale, sourceRestored: restored }, null, 2));
process.exitCode = survived === 0 && stale === 0 && restored ? 0 : 1;
