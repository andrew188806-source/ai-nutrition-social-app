#!/usr/bin/env node
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260910050000_restaurant_url_server_only_mutation_authority.sql");
const helper = read("apps/restaurant-web/auth/supabase-service-server.ts");
const websiteRuntime = read("apps/restaurant-web/server/restaurant-owner-public-website-runtime.ts");
const socialRuntime = read("apps/restaurant-web/server/restaurant-owner-public-social-links-runtime.ts");
const websiteRepository = read("apps/restaurant-web/repositories/supabase/restaurant-owner-public-website-repository.ts");
const socialRepository = read("apps/restaurant-web/repositories/supabase/restaurant-owner-public-social-links-repository.ts");
const tests = [
  ["old website authenticated bypass killed", migration.includes("restaurant_owner_set_public_website_v1") && migration.includes("from public, anon, authenticated, authenticator, service_role")],
  ["old social authenticated bypass killed", migration.includes("restaurant_owner_set_public_social_link_v1") && migration.match(/restaurant_owner_set_public_social_link_v1[\s\S]*from public, anon, authenticated, authenticator, service_role/)],
  ["removing service-only grant is detected", migration.includes("to service_role;")],
  ["removing transaction-local flag is detected", (migration.match(/set_config\('restaurant\.url_mutation_actor',[^\n]+true\)/g) ?? []).length >= 6],
  ["removing context cleanup is detected", (migration.match(/set_config\('restaurant\.url_mutation_actor', '', true\)/g) ?? []).length === 4],
  ["website actor provenance is detected", websiteRuntime.includes("auth.subject") && websiteRepository.includes("p_actor_auth_user_id: actorAuthUserId")],
  ["social actor provenance is detected", socialRuntime.includes("a.subject") && socialRepository.includes("p_actor_auth_user_id:actorAuthUserId")],
  ["service secret persistence is disabled", ["autoRefreshToken: false", "detectSessionInUrl: false", "persistSession: false"].every((x) => helper.includes(x))],
  ["sealed website owner is detected", migration.includes("owner to restaurant_owner_public_website_write_authority")],
  ["sealed social owner is detected", migration.includes("owner to restaurant_owner_public_social_links_write_authority")],
  ["audit actor is end-user actor", (migration.match(/values \(p_actor_auth_user_id,/g) ?? []).length === 2],
  ["RLS actor helper is consumed by both families", (migration.match(/caller\.auth_user_id = restaurant_internal\.restaurant_url_actor_v1\(\)/g) ?? []).length === 7]
];
for (const [name, pass] of tests) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
const failed = tests.filter(([, pass]) => !pass);
console.log(JSON.stringify({ suite: "ra-2i-url-r2-mutations", total: tests.length, killed: tests.length - failed.length, survivors: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
