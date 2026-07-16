import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const app=path.join(root,"apps/restaurant-web");
const read=(relative)=>readFileSync(path.join(root,relative),"utf8");
const fail=(message)=>{ throw new Error(`Phase 2V-D guard: ${message}`); };
function walk(directory){return readdirSync(directory).flatMap(name=>{const full=path.join(directory,name);if(["node_modules",".next"].includes(name))return[];return statSync(full).isDirectory()?walk(full):[full];});}

const pkg=JSON.parse(read("apps/restaurant-web/package.json"));
if(pkg.dependencies?.["@supabase/supabase-js"]!=="2.110.6"||pkg.dependencies?.["@supabase/ssr"]!=="0.12.3") fail("Supabase dependencies must use exact pins");
const lock=JSON.parse(read("package-lock.json"));

const sources=walk(app).filter(file=>/\.(ts|tsx)$/.test(file));
const combined=sources.map(file=>readFileSync(file,"utf8")).join("\n");
if(/service_role/i.test(combined)) fail("service_role dependency found");
if(/getSession\s*\(/.test(combined)) fail("getSession authorization found");
for(const file of sources){const source=readFileSync(file,"utf8");if(/^["']use client["']/m.test(source)&&/(accessToken|refreshToken|localStorage)/.test(source))fail(`client token/session storage found in ${file}`);}

const middleware=read("apps/restaurant-web/middleware.ts");
const layout=read("apps/restaurant-web/app/restaurant/layout.tsx");
if(!middleware.includes("getClaims()")||!read("apps/restaurant-web/auth/supabase-server.ts").includes("getClaims()")) fail("getClaims contract missing");
if(!layout.includes("loadRestaurantAccessContext")||!layout.includes("getVerifiedRestaurantClaims")) fail("protected restaurant claims/layout composition missing");
const access=read("apps/restaurant-web/runtime/restaurant-access-context.ts");
if(/restaurants\s*\[\s*0\s*\]/.test(access)) fail("first-membership shortcut found");
if(!access.includes("SELECTED_RESTAURANT_COOKIE")||!access.includes("restaurants.find")) fail("selection cookie is not revalidated");

const repository=read("apps/restaurant-web/repositories/supabase/restaurant-owner-rpc-repository.ts");
const rpcNames=[...repository.matchAll(/"(restaurant_internal_[a-z0-9_]+)"/g)].map(match=>match[1]);
if(new Set(rpcNames).size!==7||rpcNames.length!==7) fail("internal RPC allowlist must contain exactly seven names");
if(/\.from\s*\(/.test(repository)||/\.select\s*\(/.test(repository)) fail("raw internal read found in RPC repository");
if(!repository.startsWith('import "server-only"')) fail("RPC repository is not server-only");
if(!read("apps/restaurant-web/config/restaurant-data-source.ts").includes('"mock" | "supabase" | "disabled"')) fail("explicit data-source modes missing");
if(!combined.includes("Demo data —")) fail("visible Demo marker missing");
if(/fallbackToMock|readonlyFallbackToMock/.test(combined)) fail("Supabase-to-mock fallback remains");

const redirects={"apps/restaurant-web/app/menu/page.tsx":"/restaurant/menu","apps/restaurant-web/app/analytics/page.tsx":"/restaurant/analytics","apps/restaurant-web/app/profile/page.tsx":"/restaurant/settings"};
for(const [file,target] of Object.entries(redirects))if(!read(file).includes(`redirect("${target}")`))fail(`legacy redirect missing: ${file}`);
const deferred=["menu/pending-items","menu/items/new","analytics","analytics/exposure","analytics/menu-performance","analytics/nutrition-badge","staff","staff/branches","staff/roles","staff/transfers","assistant","settings","media","orders-preview"];
for(const route of deferred)if(!read(`apps/restaurant-web/app/restaurant/${route}/page.tsx`).includes("DeferredPage"))fail(`deferred route is not unavailable: ${route}`);
if(/\.(insert|update|upsert|delete)\s*\(/.test(repository)||/restaurant_internal_\w*(write|create|update|delete)/.test(repository))fail("write path found");
const docs=read("docs/runtime-integration-phase-2v-d/known-issues-and-deferrals.md");
for(const id of ["P2V-B-KI-001","P2V-B-DV-001","P2V-C-TR-001","P2V-C-DI-002","P2V-C-DD-001","P2V-C-PD-001","P2V-PERF-001","P2V-D-AUTH-001","P2V-D-PKG-001","P2V-D-CTX-001","P2V-D-RPC-001","P2V-D-FB-001","P2V-D-UI-001","P2V-D-BOUNDARY-001","P2V-D-DV-001","P2V-D-REG-001","P2V-D-PKG-002","P2V-D-PERF-002"])if(!docs.includes(id))fail(`issue missing: ${id}`);
if(lock.packages?.["apps/restaurant-web/node_modules/@supabase/supabase-js"]?.version!=="2.110.6") fail("Restaurant supabase-js lock resolution missing");
if(lock.packages?.["apps/restaurant-web/node_modules/@supabase/ssr"]?.version!=="0.12.3") fail("Restaurant SSR lock resolution missing");
if(lock.packages?.["apps/mobile/node_modules/@supabase/supabase-js"]?.version!=="2.110.2") fail("Mobile Supabase resolution changed");
console.log("Phase 2V-D implementation guard passed.");
