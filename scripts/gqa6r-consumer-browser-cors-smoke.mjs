#!/usr/bin/env node
// GQA-6R C-3 smoke: the shared Consumer browser CORS wrapper and every browser-invoked Social / Meal Buddy
// / next-meal Edge Function entrypoint. Real TypeScript is transpiled and run in a vm context with only
// Deno.serve / Deno.env and each function's handler module stubbed. No network, no credential, no project.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const root = process.cwd();
const ts = createRequire(path.join(root, "package.json"))("typescript");
const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) }); };
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const compile = (source, file) => ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

const ALLOWED = "https://haocu-demo.vercel.app";
const LOCAL = "http://localhost:8081";
let configured = `${ALLOWED}, ${LOCAL}`;
const deno = { serve: () => undefined, env: { get: (name) => (name === "MEAL_PHOTO_ANALYSIS_ALLOWED_ORIGINS" ? configured : undefined) } };

function runModule(file, requireFn, extra = {}) {
  const m = { exports: {} };
  const context = vm.createContext({ Request, Response, Headers, Deno: deno, ...extra });
  vm.runInContext(`(function(require,module,exports){${compile(read(file), path.basename(file))}\n})`, context)(requireFn, m, m.exports);
  return m.exports;
}
const corsModule = runModule("supabase/functions/meal-photo-analysis/cors.ts", () => { throw new Error("cors.ts has no imports"); });
const helper = runModule("supabase/functions/_shared/consumer-browser-cors/index.ts", (id) => {
  if (id === "../../meal-photo-analysis/cors.ts") return corsModule;
  throw new Error(`unexpected import ${id}`);
});

const preflight = (origin, { method = "POST", headers = "authorization, apikey, content-type, x-client-info" } = {}) =>
  new Request("https://x.supabase.co/functions/v1/f", { method: "OPTIONS", headers: { ...(origin ? { Origin: origin } : {}), "Access-Control-Request-Method": method, "Access-Control-Request-Headers": headers } });
const post = (origin, auth = true) => new Request("https://x.supabase.co/functions/v1/f", { method: "POST", headers: { ...(origin ? { Origin: origin } : {}), ...(auth ? { Authorization: "Bearer test" } : {}), "Content-Type": "application/json" }, body: "{}" });

// Handler that behaves like a real function: 401 without a bearer, typed 422 on a marker, else 200.
let handlerCalls = 0;
const handler = async (request) => {
  handlerCalls += 1;
  if (!request.headers.get("Authorization")) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { "Content-Type": "application/json" } });
  if (request.headers.get("X-Test-Fail")) return new Response(JSON.stringify({ error: "invalid_request" }), { status: 422, headers: { "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
};
const wrapped = helper.withConsumerBrowserCors(handler);
const acao = (r) => r.headers.get("Access-Control-Allow-Origin");
const varyOrigin = (r) => (r.headers.get("Vary") ?? "").split(",").some((v) => v.trim().toLowerCase() === "origin");

{
  handlerCalls = 0;
  const r = await wrapped(preflight(ALLOWED));
  check("C3-1 allowed-origin OPTIONS -> 204 with allow-origin/methods/headers", r.status === 204 && acao(r) === ALLOWED
    && r.headers.get("Access-Control-Allow-Methods") === "POST, OPTIONS" && /authorization/.test(r.headers.get("Access-Control-Allow-Headers") ?? "") && varyOrigin(r));
  check("C3-2 preflight never reaches the function handler (no auth, no body)", handlerCalls === 0);
  const local = await wrapped(preflight(LOCAL));
  check("C3-3 configured loopback Development origin is accepted", local.status === 204 && acao(local) === LOCAL);
  const bad = await wrapped(preflight("https://evil.example.com"));
  check("C3-4 disallowed-origin OPTIONS -> 403 without allow-origin", bad.status === 403 && acao(bad) === null && varyOrigin(bad));
  const badMethod = await wrapped(preflight(ALLOWED, { method: "DELETE" }));
  const badHeader = await wrapped(preflight(ALLOWED, { headers: "authorization, x-evil" }));
  check("C3-5 unsupported method or header is refused at preflight", badMethod.status === 403 && badHeader.status === 403);
}
{
  const ok = await wrapped(post(ALLOWED));
  check("C3-6 authenticated request from an allowed origin: handler result + allow-origin + Vary", ok.status === 200 && acao(ok) === ALLOWED && varyOrigin(ok) && (await ok.json()).ok === true);
  const unauth = await wrapped(post(ALLOWED, false));
  check("C3-7 unauthenticated request: auth rejection is preserved (401) AND readable (allow-origin)", unauth.status === 401 && acao(unauth) === ALLOWED);
  const failing = new Request("https://x.supabase.co/functions/v1/f", { method: "POST", headers: { Origin: ALLOWED, Authorization: "Bearer t", "X-Test-Fail": "1" }, body: "{}" });
  const appErr = await wrapped(failing);
  check("C3-8 application error keeps its status and carries allow-origin", appErr.status === 422 && acao(appErr) === ALLOWED);
  const other = await wrapped(post("https://evil.example.com"));
  check("C3-9 a disallowed origin still gets the handler's normal auth path but no allow-origin", other.status === 200 && acao(other) === null);
  const server = await wrapped(post(null));
  check("C3-10 non-browser callers (no Origin) are unaffected: no allow-origin, auth unchanged", server.status === 200 && acao(server) === null);
}
{
  configured = "";
  const r = await wrapped(preflight(ALLOWED));
  configured = "*";
  const star = await wrapped(preflight(ALLOWED));
  configured = `${ALLOWED}, ${LOCAL}`;
  check("C3-11 missing allow-list authorizes no origin; '*' can never authorize", r.status === 403 && acao(r) === null && star.status === 403 && acao(star) === null);
}
const helperSource = read("supabase/functions/_shared/consumer-browser-cors/index.ts").replace(/^\s*\/\/[^\n]*$/gm, "");
check("C3-12 the helper reuses the canonical allow-list parser and env (no second policy, no wildcard, no logging)",
  /from "\.\.\/\.\.\/meal-photo-analysis\/cors\.ts"/.test(helperSource) && !/"\*"|console\.|Access-Control-Allow-Credentials/.test(helperSource));

// ---- every browser-invoked entrypoint is wrapped and behaves
const FUNCTIONS = ["meal-buddy-card-list", "meal-buddy-candidate-list", "meal-buddy-candidate-profile", "social-candidate-list",
  "meal-buddy-push-device", "meal-buddy-chat", "meal-buddy-card-create", "meal-buddy-relationship", "next-meal-geo-candidates"];
const NOT_BROWSER = ["meal-buddy-card-cancel", "meal-buddy-push-dispatch", "restaurant-geocode-dispatch", "social-candidate-provenance", "social-candidate-taste"];
for (const fn of FUNCTIONS) {
  const file = `supabase/functions/${fn}/index.ts`;
  const src = read(file);
  const shapeOk = src.split("Deno.serve(").length === 2 && src.includes("Deno.serve(withConsumerBrowserCors(async (request: Request) => {")
    && src.includes(`import { withConsumerBrowserCors } from "../_shared/consumer-browser-cors/index.ts";`);
  let served;
  const scenario = { throwInside: false };
  const stubModule = new Proxy({}, { get: (_t, name) => {
    if (typeof name !== "string") return undefined;
    if (name.startsWith("createDefault")) return () => ({});
    if (name.startsWith("process")) return async (request) => { if (scenario.throwInside) throw new Error("boom"); return request.headers.get("Authorization") ? new Response('{"ok":true}', { status: 200 }) : new Response('{"error":"unauthenticated"}', { status: 401 }); };
    if (name.startsWith("build")) return () => new Response('{"error":"server_unavailable"}', { status: 503 });
    return undefined;
  } });
  runModule(file, (id) => (id === "../_shared/consumer-browser-cors/index.ts" ? helper : stubModule), { Deno: { ...deno, serve: (cb) => { served = cb; } } });
  const pre = await served(preflight(ALLOWED));
  const ok = await served(post(ALLOWED));
  const unauth = await served(post(ALLOWED, false));
  scenario.throwInside = true;
  const crashed = await served(post(ALLOWED));
  check(`C3-F ${fn}: wrapped; preflight 204; success/401/server error all carry allow-origin`,
    shapeOk && pre.status === 204 && acao(pre) === ALLOWED && ok.status === 200 && acao(ok) === ALLOWED
    && unauth.status === 401 && acao(unauth) === ALLOWED && crashed.status === 503 && acao(crashed) === ALLOWED,
    { shapeOk, pre: pre.status, ok: ok.status, unauth: unauth.status, crashed: crashed.status });
}
for (const fn of NOT_BROWSER) {
  const file = `supabase/functions/${fn}/index.ts`;
  check(`C3-N ${fn}: not browser-invoked, left unchanged`, !fs.existsSync(path.join(root, file)) || !read(file).includes("withConsumerBrowserCors"));
}
check("C3-13 meal-photo-analysis keeps its own proven CORS entrypoint (not rewrapped)", !read("supabase/functions/meal-photo-analysis/index.ts").includes("withConsumerBrowserCors"));

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : `\n     detail: ${JSON.stringify(c.detail ?? null).slice(0, 400)}`}`);
console.log(JSON.stringify({ suite: "gqa6r-consumer-browser-cors-smoke", total: checks.length, passed: checks.length - failed.length, failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
