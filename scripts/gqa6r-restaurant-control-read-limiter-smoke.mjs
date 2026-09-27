#!/usr/bin/env node
// GQA-6R R-1 smoke: the Restaurant owner control-read limiter bounds in-flight preview GETs to 4, delivers
// every caller its own result, surfaces failures truthfully, settles all loads and never touches writes.
// Real module (transpile-only) with a stubbed global fetch. No network.
import fs from "node:fs";
import path from "node:path";
import { createTsLoader } from "./gqa6r-ts-loader.mjs";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => { checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) }); };
const { load } = createTsLoader();
const limiterModule = load("apps/restaurant-web/runtime/restaurant-owner-control-read-limiter.ts");
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

check("R1-1 the bound is exactly 4", limiterModule.OWNER_CONTROL_READ_MAX_IN_FLIGHT === 4);
{
  const limiter = limiterModule.createConcurrencyLimiter(4);
  let active = 0, peak = 0; const started = [];
  const tasks = Array.from({ length: 22 }, (_, i) => limiter.run(async () => {
    active += 1; peak = Math.max(peak, active); started.push(i);
    await new Promise((resolve) => setTimeout(resolve, 2 + (i % 3)));
    active -= 1;
    if (i === 7) throw new Error(`fail-${i}`);
    return `result-${i}`;
  }).then((value) => ({ i, ok: true, value }), (error) => ({ i, ok: false, error: error.message })));
  await tick();
  check("R1-2 at most 4 requests are ever in flight (22 queued like the items page)", limiter.inFlight <= 4 && peak <= 4);
  const results = await Promise.all(tasks);
  check("R1-3 every request eventually settles (no permanently pending item)", results.length === 22 && limiter.inFlight === 0 && limiter.queued === 0);
  check("R1-4 each caller receives exactly its own result (state mapping preserved)", results.every((r) => r.i === 7 || (r.ok && r.value === `result-${r.i}`)));
  check("R1-5 a failed request surfaces to its own caller and does not stall the queue", !results[7].ok && results[7].error === "fail-7" && results.filter((r) => r.ok).length === 21);
  check("R1-6 queued work starts in FIFO order", started.join() === Array.from({ length: 22 }, (_, i) => i).join());
  check("R1-7 the bound was actually exercised (not trivially serial)", peak === 4, peak);
}
{
  const limiter = limiterModule.createConcurrencyLimiter(4);
  const sync = await limiter.run(() => { throw new Error("sync"); }).catch((error) => error.message);
  const after = await limiter.run(async () => "ok");
  check("R1-8 a synchronously throwing task rejects its caller and releases its slot", sync === "sync" && after === "ok" && limiter.inFlight === 0);
}
{
  let active = 0, peak = 0; const seen = [];
  globalThis.fetch = async (url, init) => {
    active += 1; peak = Math.max(peak, active); seen.push([String(url), init?.method]);
    await new Promise((resolve) => setTimeout(resolve, 3));
    active -= 1;
    return new Response(JSON.stringify({ url: String(url) }), { status: 200 });
  };
  const urls = Array.from({ length: 22 }, (_, i) => `/api/restaurant/branches/b/menu-items/i${i}/price`);
  const bodies = await Promise.all(urls.map((u) => limiterModule.ownerControlReadFetch(u, { method: "GET" }).then((r) => r.json())));
  check("R1-9 ownerControlReadFetch bounds real fetch calls to 4 and maps each response to its URL", peak <= 4 && bodies.every((b, i) => b.url === urls[i]) && seen.every(([, m]) => m === "GET"), { peak });
}
// ---- the five preview GETs use the limiter; every mutation POST is untouched
const SITES = {
  "apps/restaurant-web/components/menu/RestaurantOwnerSoldOutControl.tsx": 1,
  "apps/restaurant-web/runtime/restaurant-owner-availability-client.ts": 1,
  "apps/restaurant-web/runtime/restaurant-owner-menu-item-display-name-client.ts": 1,
  "apps/restaurant-web/runtime/restaurant-owner-price-client.ts": 1,
  "apps/restaurant-web/runtime/restaurant-owner-visibility-client.ts": 1
};
for (const [file, expected] of Object.entries(SITES)) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  const limited = (src.match(/await ownerControlReadFetch\(/g) ?? []).length;
  const postsUnlimited = [...src.matchAll(/ownerControlReadFetch\([^)]*\)[^;]*method:\s*"POST"/g)].length === 0;
  const postStillPlain = /await fetch\([^;]*method:\s*"POST"/.test(src.replace(/\s+/g, " "));
  check(`R1-S ${path.basename(file)}: exactly the preview GET is bounded; POST mutation unchanged`, limited === expected && postsUnlimited && postStillPlain, { limited });
}

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : `\n     detail: ${JSON.stringify(c.detail ?? null).slice(0, 300)}`}`);
console.log(JSON.stringify({ suite: "gqa6r-restaurant-control-read-limiter-smoke", total: checks.length, passed: checks.length - failed.length, failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
