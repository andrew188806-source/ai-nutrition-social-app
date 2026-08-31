#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import child from "node:child_process";
import crypto from "node:crypto";
import {
  GEO1D_BASELINE, GEO1D_BASELINE_SUBJECT, GEO1D_COMMIT_SUBJECT,
  GEO1D_P0_MIGRATION, GEO1D_P0_MIGRATION_SHA256, GEO1D_PATHS,
  auditGeo1dSources, classifyGeo1dLifecycle, createGeo1dManifest
} from "./geo-meal-buddy-geo-1d-successor-manifest.mjs";

const root=process.cwd(); const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");
const git=(args)=>child.execFileSync("git",args,{cwd:root,encoding:"utf8",stdio:["ignore","pipe","pipe"],maxBuffer:64*1024*1024}).trim();
const lines=(value)=>value?value.split(/\r?\n/).filter(Boolean):[];
const checks=[]; const failures=[];
function check(name,pass,detail){const item={name,pass:Boolean(pass),...(pass||detail===undefined?{}:{detail})};checks.push(item);if(!item.pass)failures.push(item);console.log(`${item.pass?"PASS":"FAIL"} ${String(checks.length).padStart(2,"0")} ${name}`);}

const head=git(["rev-parse","HEAD"]), originHead=git(["rev-parse","origin/main"]);
const [behind,ahead]=git(["rev-list","--left-right","--count","origin/main...HEAD"]).split(/\s+/).map(Number);
const stagedPaths=lines(git(["diff","--cached","--name-only"]));
const worktreePaths=[...new Set([...lines(git(["diff","--name-only"])),...lines(git(["ls-files","--others","--exclude-standard"]))])].sort();
const deltaPaths=head===GEO1D_BASELINE?[]:lines(git(["diff-tree","--no-commit-id","--name-only","--no-renames","-r","HEAD"]));
const lifecycle=classifyGeo1dLifecycle({head,originHead,behind,ahead,stagedPaths,worktreePaths,deltaPaths,
  parent:head===GEO1D_BASELINE?null:git(["rev-parse","HEAD^"]),deleted:lines(git(["diff","--name-only","--diff-filter=D"])).length>0});
const sources=Object.fromEntries(GEO1D_PATHS.filter((file)=>fs.existsSync(path.join(root,file))).map((file)=>[file,read(file)]));
sources["supabase/functions/_shared/geo-api/repository.ts"]=read("supabase/functions/_shared/geo-api/repository.ts");
const violations=auditGeo1dSources(sources);
const packageJson=JSON.parse(read("package.json"));
const migrationBytes=fs.readFileSync(path.join(root,GEO1D_P0_MIGRATION));

check("lifecycle is exact GEO-1D candidate or freeze",lifecycle.valid,lifecycle.phase);
check("branch remains main",git(["branch","--show-current"])==="main");
check("baseline subject is exact",git(["show","-s","--format=%s",GEO1D_BASELINE])===GEO1D_BASELINE_SUBJECT);
check("origin is exact pushed baseline or pushed freeze",originHead===GEO1D_BASELINE||lifecycle.phase==="frozen_pushed",originHead);
check("nothing is staged",stagedPaths.length===0,stagedPaths);
check("manifest is sorted unique wildcard-free and present",JSON.stringify(GEO1D_PATHS)===JSON.stringify([...GEO1D_PATHS].sort())
  &&new Set(GEO1D_PATHS).size===GEO1D_PATHS.length&&GEO1D_PATHS.every((file)=>!/[?*]/.test(file)&&fs.existsSync(path.join(root,file))));
check("dirty or freeze delta equals exact manifest",JSON.stringify(lifecycle.manifest)===JSON.stringify(GEO1D_PATHS),{actual:lifecycle.manifest,expected:GEO1D_PATHS});
check("GEO-1D adds no migration",git(["diff","--name-only",GEO1D_BASELINE,"--","supabase/migrations"]).length===0);
check("migration count remains frozen at 91",fs.readdirSync(path.join(root,"supabase/migrations")).filter((file)=>file.endsWith(".sql")).length===91);
check("P0 exact branch migration SHA remains frozen",crypto.createHash("sha256").update(migrationBytes).digest("hex")===GEO1D_P0_MIGRATION_SHA256);
check("all frozen migration bytes are unchanged",git(["diff","--quiet",GEO1D_BASELINE,"--","supabase/migrations"])==="");
check("source audit has zero violations",violations.length===0,violations);
check("P0 branch reader is reused but P0 migration is not edited",/read_meal_buddy_card_branch_context/.test(sources["supabase/functions/_shared/meal-buddy-candidate-api/readCandidateCards.ts"])
  &&!GEO1D_PATHS.includes(GEO1D_P0_MIGRATION));
check("GEO-1A repository and GEO-1C 5km policy are imports, not copies",/ExecutorGeoRepository/.test(sources["supabase/functions/_shared/meal-buddy-candidate-api/compose.ts"])
  &&/NEXT_MEAL_GEO_RADIUS_METERS/.test(sources["supabase/functions/_shared/meal-buddy-candidate-api/compose.ts"]));
check("frozen Social pool and Meal Context primitives remain the upstream source",/canonical_meal_buddy_context_candidates/.test(sources["supabase/functions/_shared/meal-buddy-candidate-api/readCandidateCards.ts"])
  &&/composeMealBuddyContextRanking/.test(sources["supabase/functions/_shared/meal-buddy-candidate-api/compose.ts"]));
const composePipeline=sources["supabase/functions/_shared/meal-buddy-candidate-api/compose.ts"].slice(
  sources["supabase/functions/_shared/meal-buddy-candidate-api/compose.ts"].indexOf("const baseSelectedCards"));
check("exposure stays downstream of GEO",composePipeline.indexOf("applyMealBuddyGeoEligibility")>=0
  &&composePipeline.indexOf("applyMealBuddyGeoEligibility")<composePipeline.indexOf("applySocialExposure"));
check("invite relationship chat push and unfriend paths are absent from manifest",!GEO1D_PATHS.some((file)=>/invite|relationship|chat|push|unfriend/.test(file)));
check("public shared Meal Buddy DTO validator remains frozen",!GEO1D_PATHS.some((file)=>file.startsWith("packages/shared/")));
check("no Production or deployment path is present",!GEO1D_PATHS.some((file)=>/production|deploy|\.github\//i.test(file)));
check("dedicated package commands are exact",packageJson.scripts?.["test:geo-meal-buddy-geo-1d"]==="node scripts/geo-meal-buddy-geo-1d-guard.mjs"
  &&packageJson.scripts?.["test:geo-meal-buddy-geo-1d-smoke"]==="node scripts/geo-meal-buddy-geo-1d-smoke.mjs"
  &&packageJson.scripts?.["test:geo-meal-buddy-geo-1d-mutations"]==="node scripts/geo-meal-buddy-geo-1d-mutations.mjs");
check("manifest bytes have no CRLF BOM NUL or replacement character",GEO1D_PATHS.every((file)=>{const bytes=fs.readFileSync(path.join(root,file)),value=bytes.toString("utf8");return !bytes.includes(Buffer.from("\r\n"))&&!bytes.includes(0)&&!value.includes(String.fromCharCode(0xfffd))&&!(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf);}));
if(lifecycle.phase!=="candidate")check("freeze subject is exact",git(["log","-1","--format=%s"])===GEO1D_COMMIT_SUBJECT);
const manifest=createGeo1dManifest((file)=>fs.readFileSync(path.join(root,file)));
check("raw-byte manifest covers exact paths",manifest.entries.length===GEO1D_PATHS.length&&manifest.entries.every((entry,index)=>entry.path===GEO1D_PATHS[index]&&/^[0-9a-f]{64}$/.test(entry.sha256)));

console.log(JSON.stringify({suite:"geo-meal-buddy-geo-1d-guard",lifecycle:lifecycle.phase,total:checks.length,passed:checks.length-failures.length,failed:failures.length,failures:failures.map((item)=>item.name),manifestPaths:GEO1D_PATHS.length,canonicalManifestSha256:manifest.aggregateSha256,migrationAdded:false,networkUsed:false,databaseUsed:false,productionTouched:false},null,2));
if(failures.length)process.exitCode=1;
