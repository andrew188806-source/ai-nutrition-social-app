#!/usr/bin/env node
import fs from "node:fs";import child from "node:child_process";
import {ORIGIN,PARENT,MIGRATION,MIGRATION_R1,PATHS,SUBJECT} from "./restaurant-owner-public-social-links-ra-2i-p2-contract.mjs";
const read=p=>fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n"),git=a=>child.execFileSync("git",a,{encoding:"utf8"}).trim(),lines=v=>v?v.split(/\r?\n/).filter(Boolean).sort():[];
const head=git(["rev-parse","HEAD"]),frozen=head!==PARENT;
const manifest=frozen?lines(git(["diff-tree","--no-commit-id","--name-only","--no-renames","-r","HEAD"])):[...new Set([...lines(git(["diff","--name-only"])),...lines(git(["ls-files","--others","--exclude-standard"]))])].sort();
const sql=read(MIGRATION),bare=sql.replace(/^\s*--.*$/gm,""),scripts=JSON.parse(read("package.json")).scripts;
const r1Sql=read(MIGRATION_R1),r1Bare=r1Sql.replace(/^\s*--.*$/gm,"");
const tests=[];const check=(n,p)=>{tests.push([n,!!p]);console.log(`${p?"PASS":"FAIL"} ${n}`)};

// Original P2 authority invariants (unchanged; read from the already-frozen P2 migration).
check("origin/main unchanged (P2 not yet pushed)",git(["rev-parse","origin/main"])===ORIGIN);
check("candidate or bounded R1 freeze commit",frozen?git(["rev-parse","HEAD^"])===PARENT&&git(["log","-1","--pretty=%s"])===SUBJECT:head===PARENT);
check("exact R1 path manifest",JSON.stringify(manifest)===JSON.stringify([...PATHS].sort()));
check("four dedicated gates registered",["test:restaurant-owner-public-social-links-ra-2i-p2","test:restaurant-owner-public-social-links-ra-2i-p2-smoke","test:restaurant-owner-public-social-links-ra-2i-p2-mutations","test:restaurant-owner-public-social-links-ra-2i-p2-postgres"].every(k=>typeof scripts[k]==="string"));
check("child row model not restaurant columns",sql.includes("create table public.restaurant_public_social_links")&&!/alter table public\.restaurants[\s\S]*add column[^;]*(instagram|facebook|social)/i.test(bare));
check("exact composite identity",sql.includes("primary key(restaurant_id,provider)"));
check("exact six-provider constraint",(sql.match(/'instagram','facebook','line','threads','tiktok','youtube'/g)??[]).length>=4&&!bare.includes("'other'"));
check("CLEAR keeps row",sql.includes("update public.restaurant_public_social_links set public_url=v_next")&&!/delete from public\.restaurant_public_social_links/i.test(bare));
check("separate permission and sealed role",sql.includes("restaurant.profile.public_social_links.write")&&/create role restaurant_owner_public_social_links_write_authority\s+nologin noinherit nobypassrls/.test(sql));
check("INSERT and URL-only UPDATE",sql.includes("grant insert(restaurant_id,provider,public_url,public_url_version)")&&sql.includes("grant update(public_url)")&&!/grant delete/i.test(bare));
check("restrictive tenant RLS",(sql.match(/restaurant_social_links_tenant_(select|insert|update)/g)??[]).length>=3);
check("sealed security definer RPCs",(sql.match(/security definer\nset search_path='' set row_security='on'/g)??[]).length===2);
check("CAS and no change",sql.includes("v_current is distinct from p_expected_public_url")&&sql.includes("v_version<>p_expected_version")&&sql.includes("'no_change'"));
check("branchless provider audit",sql.includes("restaurant_public_social_link_audit_log")&&!/create table restaurant_internal\.restaurant_public_social_link_audit_log[\s\S]{0,900}branch_id/.test(sql));
check("row-shaped owner read",sql.includes("restaurant_internal_restaurant_public_social_links_v1")&&sql.includes("public_url_version::text"));
check("separate public projection",sql.includes("consumer_public_restaurant_social_links_v1")&&sql.includes("where public_url is not null"));
check("catalog v4 never changed",!sql.includes("create view public.consumer_public_restaurant_catalog_v4"));
check("website and phone never assigned",!/set\s+(public_website_url|public_phone)\s*=/i.test(bare));
check("no generic profile or JSON model",!/profile_json|contact_json|jsonb\s+(not null|null)|\bpatch\b/i.test(bare));

// RA-2I-P2-R1: canonical social URL storage closure.
check("R1 successor migration exists and sorts last",fs.readdirSync("supabase/migrations").filter(f=>f.endsWith(".sql")).sort().at(-1)===MIGRATION_R1.split("/").at(-1));
check("R1 replaces the shared canonical-host validator (composition, not duplication)",r1Sql.includes("create or replace function restaurant_internal.restaurant_public_social_link_url_allowed_v1"));
check("R1 host comparison is now case-sensitive against the canonical allowlist",!r1Sql.includes("pg_catalog.lower(")&&r1Sql.includes("=any(case p_provider"));
check("R1 scheme comparison remains the pre-existing case-sensitive check",r1Sql.includes("pg_catalog.left(p_url,8)='https://'"));
check("R1 self-validates rejection of case-variant host and scheme",r1Sql.includes("case-variant host still passes")&&r1Sql.includes("case-variant scheme still passes"));
check("R1 preserves the sealed writer's EXECUTE grant (no re-grant needed by design)",r1Sql.includes("has_function_privilege(")&&r1Sql.includes("restaurant_owner_public_social_links_write_authority"));
check("R1 does not touch P1A phone or P1B website authority",!/public_phone|public_website_url/i.test(r1Bare));
check("R1 does not touch restaurant_branches or public.restaurants",!/alter table (public\.restaurant_branches|public\.restaurants)/i.test(r1Bare));
check("R1 introduces no new role, grant, or RLS policy (pure logic tightening)",!/create role|create policy|^\s*grant /im.test(r1Bare));
check("R1 no credentials",!/service_role[^\n]{0,40}(key|secret)\s*[:=]|-----BEGIN PRIVATE KEY-----/i.test(PATHS.filter((p)=>!p.endsWith("ra-2i-p2-guard.mjs")).map(read).join("\n")));

const failed=tests.filter(([,p])=>!p);console.log(JSON.stringify({suite:"ra-2i-p2-r1-guard",total:tests.length,passed:tests.length-failed.length,failed:failed.length},null,2));if(failed.length)process.exitCode=1;
