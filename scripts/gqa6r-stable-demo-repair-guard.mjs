#!/usr/bin/env node
// GQA-6R Stable Demo repair guard: the exact successor record holds, and the repair's structural
// invariants are present in the product sources. Static only: no network, no database.
import fs from "node:fs";
import path from "node:path";
import { GQA6R_PRODUCT_PATHS, collectGqa6rRepairEvidence, matchesExactGqa6rRepair } from "./gqa6r-stable-demo-repair-manifest.mjs";

const root = process.cwd();
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, pass: Boolean(ok), ...(ok ? {} : { detail }) }); console.log(`${ok ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`); };
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const evidence = collectGqa6rRepairEvidence(root);

check("the product delta since 8f9c497 is exactly the recorded GQA-6R set with exactly the recorded bytes", matchesExactGqa6rRepair(evidence),
  { recorded: GQA6R_PRODUCT_PATHS.length, delta: evidence.productDelta.length, extra: evidence.productDelta.filter((f) => !GQA6R_PRODUCT_PATHS.includes(f)) });
check("the repair adds no migration and touches no database path", !GQA6R_PRODUCT_PATHS.some((f) => f.startsWith("supabase/migrations/") || f === "supabase/config.toml"));
check("the repair touches no Admin runtime and no shared copy / shared package", !GQA6R_PRODUCT_PATHS.some((f) => /^(apps\/admin-web|lib|packages)\//.test(f)));
const config = read("apps/mobile/features/consumer-runtime-config/consumerPublicRuntimeEnv.ts");
check("C-1: one literal public-runtime authority with fail-closed live-composition rule",
  /export function readConsumerPublicRuntimeEnv/.test(config) && /export function isLiveConsumerComposition/.test(config) && !/\.\.\.process\.env|globalThis/.test(config.replace(/\/\/[^\n]*/g, "")));
check("C-1B: the mock restaurant platform has a single live-composition gate",
  /if \(!mockRestaurantPlatformAllowed\(\)\) return EMPTY_SNAPSHOT;/.test(read("apps/mobile/adapters/mock/mobile-restaurant-mock-adapter.ts")));
const fns = GQA6R_PRODUCT_PATHS.filter((f) => /^supabase\/functions\/[a-z-]+\/index\.ts$/.test(f));
check("C-3: every changed Edge entrypoint only adds the shared browser CORS wrapper",
  fns.length === 9 && fns.every((f) => read(f).includes("Deno.serve(withConsumerBrowserCors(async (request: Request) => {")));
check("R-1: owner control preview reads are bounded to 4 in flight",
  /export const OWNER_CONTROL_READ_MAX_IN_FLIGHT = 4;/.test(read("apps/restaurant-web/runtime/restaurant-owner-control-read-limiter.ts")));

const failed = checks.filter((c) => !c.pass);
console.log(JSON.stringify({ suite: "gqa6r-stable-demo-repair-guard", total: checks.length, failed: failed.length, failures: failed, networkUsed: false, databaseUsed: false }));
process.exitCode = failed.length ? 1 : 0;
