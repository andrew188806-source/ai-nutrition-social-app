#!/usr/bin/env node
import child from "node:child_process";
import fs from "node:fs";
import {BASELINE,MIGRATION,PATHS,readMigration,auditSql} from "./platform-admin-ra-1c-p0-contract.mjs";
const git=(...a)=>child.execFileSync("git",["-c","core.safecrlf=false",...a],{encoding:"utf8",maxBuffer:64e6}).trim();
const checks=[]; const check=(name,pass,detail)=>checks.push({name,pass:Boolean(pass),...(pass?{}:{detail})});
check("HEAD descends directly from the RA-1C baseline",git("merge-base",BASELINE,"HEAD")===BASELINE);
check("origin/main remains the frozen baseline",git("rev-parse","origin/main")===BASELINE);
check("branch remains main",git("branch","--show-current")==="main");
const changed=[...new Set([...git("diff","--name-only",BASELINE).split(/\r?\n/),...git("ls-files","--others","--exclude-standard").split(/\r?\n/)])].filter(Boolean).sort();
check("exact P0 path allowlist",JSON.stringify(changed)===JSON.stringify([...PATHS].sort()),changed);
check("no deletion",git("diff","--name-only","--diff-filter=D",BASELINE)==="");
check("exactly one successor migration",changed.filter(x=>x.startsWith("supabase/migrations/")).length===1);
check("all 92 predecessor migrations are byte-identical",git("diff","--name-only",BASELINE,"--","supabase/migrations").split(/\r?\n/).filter(Boolean).every(x=>x===MIGRATION));
check("Development target is synthetic branch B",fs.readFileSync("scripts/platform-admin-ra-1c-p0-development-acceptance.mjs","utf8").includes('TARGET_BRANCH = "synthetic-fixture-branch-b"'));
const devHarness=fs.readFileSync("scripts/platform-admin-ra-1c-p0-development-acceptance.mjs","utf8");
check("protected Development branch is observation-only",!readMigration().includes("dev-branch-xinyi")
  && devHarness.includes('PROTECTED_BRANCH="dev-branch-xinyi"')
  && !/p_branch_id\s*:\s*PROTECTED_BRANCH/.test(devHarness));
for(const failure of auditSql(readMigration())) check(`SQL contract: ${failure}`,false);
check("SQL authority contract",auditSql(readMigration()).length===0,auditSql(readMigration()));
check("migration has no trailing whitespace",readMigration().split("\n").every(line=>!/\s+$/.test(line)));
const failures=checks.filter(x=>!x.pass); checks.forEach((x,i)=>console.log(`${x.pass?"PASS":"FAIL"} ${i+1} ${x.name}`));
console.log(JSON.stringify({suite:"platform-admin-ra-1c-p0-guard",total:checks.length,passed:checks.length-failures.length,failed:failures.length,failures,changedPaths:changed},null,2));
if(failures.length)process.exitCode=1;
