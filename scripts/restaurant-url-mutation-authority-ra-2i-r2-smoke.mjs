#!/usr/bin/env node
import fs from "node:fs";
import ts from "typescript";

async function moduleFrom(path) {
  const js = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const website = await moduleFrom("apps/restaurant-web/runtime/restaurant-owner-public-website.ts");
const social = await moduleFrom("apps/restaurant-web/runtime/restaurant-owner-public-social-links.ts");
const checks = [];
const check = (name, pass) => { checks.push([name, Boolean(pass)]); console.log(`${pass ? "PASS" : "FAIL"} ${name}`); };
const websiteSet = (url, expected = null, version = "0") => ({ operation: "set", expectedPublicWebsiteUrl: expected, nextPublicWebsiteUrl: url, expectedVersion: version });
const socialSet = (url, expected = null, version = "0") => ({ action: "set", url, expectedUrl: expected, expectedVersion: version });

check("website dot segments canonicalize", website.parsePublicWebsiteInput(websiteSet("https://example.com/a/../b"))?.nextPublicWebsiteUrl === "https://example.com/b");
check("website HTTP remains HTTP", website.parsePublicWebsiteInput(websiteSet("http://EXAMPLE.com/a/../b"))?.nextPublicWebsiteUrl === "http://example.com/b");
check("social dot segments canonicalize", social.parsePublicSocialInput("instagram", socialSet("https://instagram.com/a/../b"))?.url === "https://instagram.com/b");
check("social HTTP remains rejected", social.parsePublicSocialInput("instagram", socialSet("http://instagram.com/a")) === null);
check("social provider binding remains exact", social.parsePublicSocialInput("instagram", socialSet("https://facebook.com/a")) === null);
check("website mutation RPC is v2", website.RESTAURANT_OWNER_PUBLIC_WEBSITE_MUTATION_RPC === "restaurant_owner_set_public_website_v2");
check("social mutation RPC is v2", social.RESTAURANT_OWNER_PUBLIC_SOCIAL_MUTATION_RPC === "restaurant_owner_set_public_social_link_v2");
check("preview RPCs remain v1", website.RESTAURANT_OWNER_PUBLIC_WEBSITE_PREVIEW_RPC.endsWith("_v1") && social.RESTAURANT_OWNER_PUBLIC_SOCIAL_PREVIEW_RPC.endsWith("_v1"));
check("canonical equivalent website SET converges", website.parsePublicWebsiteInput(websiteSet("https://example.com/a/../b", "https://example.com/b", "8"))?.nextPublicWebsiteUrl === "https://example.com/b");
check("canonical equivalent social SET converges", social.parsePublicSocialInput("instagram", socialSet("https://instagram.com/a/../b", "https://instagram.com/b", "8"))?.url === "https://instagram.com/b");

const failed = checks.filter(([, pass]) => !pass);
console.log(JSON.stringify({ suite: "ra-2i-url-r2-smoke", total: checks.length, passed: checks.length - failed.length, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
