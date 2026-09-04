#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { auditApplicationSources, readP2Sources } from "./restaurant-owner-sold-out-ra-2a-p2-contract.mjs";
import {
  P2_ORIGIN_MAIN, P2_P1, P2_R1, P2_P1_MIGRATION, P2_P1_MIGRATION_SHA256,
  P2_R1_MIGRATION, P2_R1_MIGRATION_SHA256, P2_PATHS, P2_PACKAGE_KEYS, P2_SUBJECT
} from "./restaurant-owner-sold-out-ra-2a-p2-successor-manifest.mjs";

const root = process.cwd();
const git = args => execFileSync("git", args, {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  stdio: ["ignore", "pipe", "ignore"]
}).trim();
const checks = [];
const check = (name, pass, detail) => { const row={name,pass:Boolean(pass),...(pass||detail===undefined?{}:{detail})}; checks.push(row); console.log(`${row.pass?"PASS":"FAIL"} ${checks.length} ${name}`); };
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file).toString("utf8").replace(/\r\n/g,"\n")).digest("hex");

check("origin main is frozen", git(["rev-parse","origin/main"]) === P2_ORIGIN_MAIN);
check("P1 is the frozen child of origin", git(["rev-parse",`${P2_P1}^`]) === P2_ORIGIN_MAIN);
check("R1 is the frozen child of P1", git(["rev-parse",`${P2_R1}^`]) === P2_P1);
const head=git(["rev-parse","HEAD"]);
check("HEAD is R1 while authoring or one P2 commit above it", head===P2_R1 || git(["rev-parse","HEAD^"])===P2_R1,head);
if(head!==P2_R1) check("the frozen P2 commit has the approved subject",git(["show","-s","--format=%s","HEAD"])===P2_SUBJECT);
check("P1 migration hash is frozen",hash(P2_P1_MIGRATION)===P2_P1_MIGRATION_SHA256);
check("R1 migration hash is frozen",hash(P2_R1_MIGRATION)===P2_R1_MIGRATION_SHA256);
check("P2 adds no migration",git(["ls-files","supabase/migrations/*.sql"]).split(/\r?\n/).filter(Boolean).length===95);

const changed = new Set([
  ...git(["diff","--name-only",P2_R1]).split(/\r?\n/).filter(Boolean),
  ...git(["ls-files","--others","--exclude-standard"]).split(/\r?\n/).filter(Boolean)
]);
check("every changed path is inside the P2 application allowlist",
  [...changed].every(file=>P2_PATHS.includes(file)),[...changed].filter(file=>!P2_PATHS.includes(file)));
check("every required P2 path exists",P2_PATHS.every(file=>fs.existsSync(file)),P2_PATHS.filter(file=>!fs.existsSync(file)));
check("P1 and R1 migrations are byte-unchanged from R1",git(["diff","--name-only",P2_R1,"--",P2_P1_MIGRATION,P2_R1_MIGRATION])==="");

const sources=readP2Sources(root);
for(const result of auditApplicationSources(sources)) check(result.name,result.pass);
const packageText=fs.readFileSync("package.json","utf8");
check("all four P2 package commands exist",P2_PACKAGE_KEYS.every(key=>packageText.includes(`"${key}"`)));
const authored=[...changed].filter(file=>fs.existsSync(file)&&fs.statSync(file).isFile()).map(file=>fs.readFileSync(file,"utf8")).join("\n");
check("P2 sources contain no credential-shaped material",
  !/(sb_secret_[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY)/.test(authored));
const forbiddenOperatorCommand = new RegExp([
  "supabase\\s+(db " + "push|functions " + "deploy)",
  "git\\s+" + "push",
  "--project" + "-ref",
  "Production " + "database"
].join("|"), "i");
check("P2 contains no deploy push or Production operator command", !forbiddenOperatorCommand.test(authored));

const failures=checks.filter(row=>!row.pass);
console.log(JSON.stringify({suite:"restaurant-owner-sold-out-ra-2a-p2-guard",total:checks.length,
  passed:checks.length-failures.length,failed:failures.length,failures},null,2));
if(failures.length)process.exitCode=1;
