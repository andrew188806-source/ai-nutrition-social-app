#!/usr/bin/env node
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const migration = read("supabase/migrations/20260910050000_restaurant_url_server_only_mutation_authority.sql");
const helper = read("apps/restaurant-web/auth/supabase-service-server.ts");
const websiteRuntime = read("apps/restaurant-web/server/restaurant-owner-public-website-runtime.ts");
const socialRuntime = read("apps/restaurant-web/server/restaurant-owner-public-social-links-runtime.ts");
const websiteRepository = read("apps/restaurant-web/repositories/supabase/restaurant-owner-public-website-repository.ts");
const socialRepository = read("apps/restaurant-web/repositories/supabase/restaurant-owner-public-social-links-repository.ts");
const websiteContract = read("apps/restaurant-web/runtime/restaurant-owner-public-website.ts");
const socialContract = read("apps/restaurant-web/runtime/restaurant-owner-public-social-links.ts");
const env = read(".env.example");
const packageJson = JSON.parse(read("package.json"));
const clientReachable = [
  "apps/restaurant-web/runtime/restaurant-owner-public-website-client.ts",
  "apps/restaurant-web/runtime/restaurant-owner-public-social-links-client.ts",
  "apps/restaurant-web/components/settings/RestaurantOwnerPublicWebsiteControl.tsx",
  "apps/restaurant-web/components/settings/RestaurantOwnerPublicSocialLinksControl.tsx"
].map(read).join("\n");
const checks = [];
const check = (name, pass) => { checks.push([name, Boolean(pass)]); console.log(`${pass ? "PASS" : "FAIL"} ${name}`); };

check("successor migration sorts last", fs.readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql")).sort().at(-1) === "20260910050000_restaurant_url_server_only_mutation_authority.sql");
check("old website mutation execute revoked", /revoke all on function public\.restaurant_owner_set_public_website_v1[\s\S]*?from public, anon, authenticated, authenticator, service_role/.test(migration));
check("old social mutation execute revoked", /revoke all on function public\.restaurant_owner_set_public_social_link_v1[\s\S]*?from public, anon, authenticated, authenticator, service_role/.test(migration));
check("website v2 execute is service-only", /grant execute on function public\.restaurant_owner_set_public_website_v2[\s\S]*?to service_role/.test(migration) && !/grant execute on function public\.restaurant_owner_set_public_website_v2[\s\S]*?to (authenticated|anon)/.test(migration));
check("social v2 execute is service-only", /grant execute on function public\.restaurant_owner_set_public_social_link_v2[\s\S]*?to service_role/.test(migration) && !/grant execute on function public\.restaurant_owner_set_public_social_link_v2[\s\S]*?to (authenticated|anon)/.test(migration));
check("v2 functions retain sealed owners", migration.includes("owner to restaurant_owner_public_website_write_authority") && migration.includes("owner to restaurant_owner_public_social_links_write_authority"));
check("RLS stays on and actor-scoped", migration.includes("restaurant_internal.restaurant_url_actor_v1()") && !/disable row level security|no force row level security/i.test(migration));
check("actor context is transaction-local and cleared", (migration.match(/set_config\('restaurant\.url_mutation_actor',[^\n]+true\)/g) ?? []).length >= 6 && (migration.match(/set_config\('restaurant\.url_mutation_actor', '', true\)/g) ?? []).length === 4);
check("verified route claims supply actor", websiteRuntime.includes("auth.subject, access.restaurant.id") && socialRuntime.includes("a.subject,access.restaurant.id"));
check("browser DTOs contain no actor", !/actorAuthUserId|actor_auth_user_id|p_actor_auth_user_id/.test(clientReachable));
check("repositories use v2 actor argument", websiteRepository.includes("p_actor_auth_user_id: actorAuthUserId") && socialRepository.includes("p_actor_auth_user_id:actorAuthUserId"));
check("preview remains user-scoped", websiteRepository.includes("client.rpc(RESTAURANT_OWNER_PUBLIC_WEBSITE_PREVIEW_RPC") && socialRepository.includes("client.rpc(RESTAURANT_OWNER_PUBLIC_SOCIAL_PREVIEW_RPC"));
check("service helper is server-only", helper.startsWith('import "server-only";') && helper.includes('from "@supabase/supabase-js"'));
check("service helper disables auth persistence", helper.includes("autoRefreshToken: false") && helper.includes("detectSessionInUrl: false") && helper.includes("persistSession: false"));
check("no client module imports service helper", !clientReachable.includes("supabase-service-server"));
check("no public service credential", !/NEXT_PUBLIC_[A-Z0-9_]*(SERVICE|SECRET)|EXPO_PUBLIC_[A-Z0-9_]*(SERVICE|SECRET)/.test(`${helper}\n${env}`));
check("example secret is empty", /^TASTKIND_SUPABASE_SERVICE_ROLE_KEY=\s*$/m.test(env));
check("runtime selects v2 RPC names", websiteContract.includes('"restaurant_owner_set_public_website_v2"') && socialContract.includes('"restaurant_owner_set_public_social_link_v2"'));
check("P1B and P2 canonicalizers remain WHATWG URL based", websiteContract.includes("new URL(trimmed)") && socialContract.includes("new URL(trimmed)"));
check("no P1A or unrelated authority touched", !/public_phone|restaurant_branches|geo|temporal|meal_buddy|recommendation/i.test(migration));
check("four dedicated R2 scripts registered", ["test:restaurant-url-mutation-authority-ra-2i-r2", "test:restaurant-url-mutation-authority-ra-2i-r2-smoke", "test:restaurant-url-mutation-authority-ra-2i-r2-mutations", "test:restaurant-url-mutation-authority-ra-2i-r2-postgres"].every((key) => typeof packageJson.scripts[key] === "string"));

const failed = checks.filter(([, pass]) => !pass);
console.log(JSON.stringify({ suite: "ra-2i-url-r2-guard", total: checks.length, passed: checks.length - failed.length, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
