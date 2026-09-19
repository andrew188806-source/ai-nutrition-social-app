#!/usr/bin/env node
// H2 (pre-Admin hardening): meal-photo-analysis browser origins are an explicit, configuration-driven
// allowlist. Executes the REAL entrypoint (index.ts) and REAL allowlist module (cors.ts) in a VM with
// only Deno.serve/Deno.env and the handler injected. No network, no credentials, no wildcard.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const root = process.cwd();
const ts = createRequire(path.join(root, "package.json"))("typescript");
const DIR = "supabase/functions/meal-photo-analysis";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const checks = [];
function check(pass, name, detail) {
  const item = { name, pass: Boolean(pass), ...(!pass && detail !== undefined ? { detail } : {}) };
  checks.push(item);
  console.log(`${item.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
}
const compile = (source, file) => ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---- static ------------------------------------------------------------------------------------
const indexSource = read(`${DIR}/index.ts`), corsSource = read(`${DIR}/cors.ts`);
const indexCode = strip(indexSource), corsCode = strip(corsSource);
check(!/https?:\/\/[a-z0-9]/i.test(indexCode) && !/vercel\.app|haocu-demo/i.test(indexCode), "the entrypoint hardcodes no hostname or origin");
check(!/vercel\.app|haocu-demo/i.test(corsCode), "the allowlist module hardcodes no deployment host");
check(!/Access-Control-Allow-Origin["'`,\s:]+["'`]\*/.test(indexCode) && !/=\s*["']\*["']/.test(indexCode), "no wildcard Access-Control-Allow-Origin exists in the entrypoint");
check(/from "\.\/cors\.ts"/.test(indexCode) && /Deno\.env\.get\(MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS_ENV\)/.test(indexCode), "the entrypoint reads the allowlist from Deno.env through cors.ts");
check((indexCode.match(/Access-Control-Allow-Origin/g) ?? []).length === 1, "Access-Control-Allow-Origin is set in exactly one place");
check(/MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS/.test(corsSource) && /authorizes NO browser origin/.test(corsSource) && /scheme:\/\/host\[:port\]/.test(corsSource), "cors.ts documents the variable, its format and the missing/empty behaviour");
check(fs.existsSync(path.join(root, "docs/engineering-state-registers.md")) && /MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS/.test(read("docs/engineering-state-registers.md")), "the engineering registers document the allowlist variable and its Development value");

// ---- unit: parser -------------------------------------------------------------------------------
const cors = (() => { const m = { exports: {} }; vm.runInNewContext(`(function(module,exports){${compile(corsSource, "cors.ts")}\n})`, {})(m, m.exports); return m.exports; })();
const parse = (raw) => [...cors.parseAllowedOrigins(raw)].sort();
check(parse(undefined).length === 0 && parse(null).length === 0 && parse("").length === 0 && parse("  ").length === 0, "missing/empty configuration yields an empty allowlist");
check(JSON.stringify(parse("https://a.example, https://b.example\nhttps://c.example")) === JSON.stringify(["https://a.example", "https://b.example", "https://c.example"]), "commas and whitespace both separate origins");
check(JSON.stringify(parse("HTTPS://A.Example/")) === JSON.stringify(["https://a.example"]), "configured values are lower-cased and a trailing slash is stripped");
check(JSON.stringify(parse("http://localhost:8081,http://127.0.0.1:19006")) === JSON.stringify(["http://127.0.0.1:19006", "http://localhost:8081"]), "http is accepted for loopback hosts");
for (const bad of ["*", "null", "https://*.example.com", "http://a.example", "a.example", "https://a.example/path", "https://a.example?x=1", "https://user@a.example", "ftp://a.example", "https://", "https://.a", "javascript:alert(1)"]) {
  check(parse(bad).length === 0, `invalid entry authorizes nothing: ${bad}`);
}
check(JSON.stringify(parse("*, https://ok.example")) === JSON.stringify(["https://ok.example"]), "an invalid entry does not poison valid ones and never widens them");
check(cors.isAllowedOrigin(null, cors.parseAllowedOrigins("https://a.example")) === false && cors.isAllowedOrigin("https://a.example", cors.parseAllowedOrigins("https://a.example")) === true && cors.isAllowedOrigin("https://a.example.evil.test", cors.parseAllowedOrigins("https://a.example")) === false && cors.isAllowedOrigin("https://xa.example", cors.parseAllowedOrigins("https://a.example")) === false,
  "matching is exact (no substring or suffix match)");

// ---- behavioural: real entrypoint ---------------------------------------------------------------
let serve = null;
let configured;
let handlerCalls = 0;
const errorsModule = { buildErrorResponse: () => new Response("internal", { status: 500 }) };
const handlerModule = { createDefaultDependencies: () => ({}), processMealPhotoAnalysisRequest: async () => { handlerCalls++; return new Response("ok", { status: 200, headers: { Vary: "Accept" } }); } };
const context = vm.createContext({ Request, Response, Headers, Deno: { serve: (callback) => { serve = callback; }, env: { get: (name) => (name === cors.MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS_ENV ? configured : undefined) } } });
const entry = { exports: {} };
vm.runInContext(`(function(require,module,exports){${compile(indexSource, "index.ts")}\n})`, context)((id) => {
  if (id === "./errors.ts") return errorsModule;
  if (id === "./handler.ts") return handlerModule;
  if (id === "./cors.ts") return cors;
  throw new Error(`unexpected dependency ${id}`);
}, entry, entry.exports);
check(typeof serve === "function", "the entrypoint registers a Deno.serve handler");

const HEADERS = "authorization, apikey, content-type, x-client-info";
const req = (method, origin, extra = {}) => new Request("https://function.test/meal-photo-analysis", { method, headers: { ...(origin === undefined ? {} : { Origin: origin }), ...extra }, ...(method === "POST" ? { body: "{}" } : {}) });
const preflight = (origin, extra = {}) => serve(req("OPTIONS", origin, { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": HEADERS, ...extra }));
const acao = (response) => response.headers.get("Access-Control-Allow-Origin");

configured = "https://app.example.com, https://preview.example.com";
{
  const ok = await preflight("https://app.example.com");
  check(ok.status === 204 && acao(ok) === "https://app.example.com" && ok.headers.get("Vary") === "Origin" && ok.headers.get("Access-Control-Allow-Methods") === "POST, OPTIONS" && ok.headers.get("Access-Control-Allow-Headers") === HEADERS, "allowed origin: preflight 204 with exact origin echo, Vary, methods and headers");
  const second = await preflight("https://preview.example.com");
  check(second.status === 204 && acao(second) === "https://preview.example.com", "a second configured origin (preview/production domain) is authorized without source edits");
  const bad = await preflight("https://evil.example.net");
  check(bad.status === 403 && acao(bad) === null && bad.headers.get("Access-Control-Allow-Methods") === null, "disallowed origin: preflight 403 with no CORS authorization");
  check(acao(await preflight("null")) === null && (await preflight("null")).status === 403, "the opaque 'null' origin is refused");
  const post = await serve(req("POST", "https://app.example.com"));
  check(post.status === 200 && acao(post) === "https://app.example.com" && post.headers.get("Vary") === "Accept, Origin", "allowed origin: POST reaches the handler and carries the exact origin");
  const before = handlerCalls;
  const badPost = await serve(req("POST", "https://evil.example.net"));
  check(badPost.status === 200 && acao(badPost) === null && handlerCalls === before + 1, "disallowed origin: POST still enters the auth boundary but receives no browser authorization");
  const server = await serve(req("POST", undefined));
  check(server.status === 200 && acao(server) === null, "no Origin (server-to-server): request proceeds, no CORS header (existing behaviour preserved)");
  check((await preflight(undefined)).status === 403, "a preflight without an Origin is refused");
  check((await serve(req("OPTIONS", "https://app.example.com", { "Access-Control-Request-Method": "DELETE" }))).status === 403, "allowed origin but wrong method: preflight refused");
  check((await preflight("https://app.example.com", { "Access-Control-Request-Headers": "x-unapproved" })).status === 403, "allowed origin but unapproved header: preflight refused");
  const anyWildcard = [ok, second, post, bad, badPost, server].some((response) => acao(response) === "*");
  check(!anyWildcard, "no response ever carries a wildcard Access-Control-Allow-Origin");
}
// configuration semantics
configured = undefined;
{
  const legacy = await preflight("https://haocu-demo.vercel.app");
  const post = await serve(req("POST", "https://haocu-demo.vercel.app"));
  check(legacy.status === 403 && acao(legacy) === null && acao(post) === null, "missing configuration authorizes NO browser origin (no residual hardcoded default)");
}
configured = "";
check(acao(await preflight("https://app.example.com")) === null, "empty configuration authorizes no origin");
configured = "*";
check(acao(await preflight("https://app.example.com")) === null && acao(await preflight("*")) === null, "a '*' configuration value cannot widen access to any origin");
configured = "https://a.example";
const first = await preflight("https://a.example");
configured = "https://b.example";
const rotated = await preflight("https://a.example"), newOne = await preflight("https://b.example");
check(first.status === 204 && rotated.status === 403 && newOne.status === 204, "configuration is re-read per request (a rotated value takes effect without redeploy)");
configured = "http://localhost:8081";
check((await preflight("http://localhost:8081")).status === 204, "local development origin works when configured");

const failed = checks.filter((item) => !item.pass);
console.log(JSON.stringify({ suite: "meal-photo-analysis-cors-config-h2-guard", total: checks.length, passed: checks.length - failed.length, failed: failed.length, failures: failed }, null, 2));
process.exitCode = failed.length ? 1 : 0;
