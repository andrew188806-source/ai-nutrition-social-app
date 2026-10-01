#!/usr/bin/env node
// Runs the complete local package guard/smoke/mutation/validation inventory once in TWO isolated trees.
// Writes reports only outside the product tree. No remote/live/deployment suite is admitted.
import fs from "node:fs";import path from "node:path";import {execFileSync,spawn} from "node:child_process";
const arg=n=>process.argv[process.argv.indexOf(n)+1];
const baseline=arg("--baseline-dir"),candidate=arg("--candidate-dir"),output=arg("--output"),preload=process.argv.includes("--preload")?arg("--preload"):null;
if(!baseline||!candidate||!output||path.resolve(baseline)===path.resolve(candidate)||path.resolve(baseline)===process.cwd()||path.resolve(candidate)===process.cwd())throw Error("Two separate isolated clone directories and external report are required");
const entries=Object.entries(JSON.parse(fs.readFileSync(path.join(baseline,"package.json"),"utf8")).scripts).filter(([key,cmd])=>/guard|smoke|mutation|validate/.test(key+" "+cmd));
entries.push(["pc2:predecessor:pc1-guard","node scripts/pc1-consumer-closure-guard.mjs"],["pc2:predecessor:gqa6r-guard","node scripts/gqa6r-stable-demo-repair-guard.mjs"]);
const selected=entries.filter(([name,cmd])=>/^node scripts\/[\w.-]+\.mjs(?: --mock-contract)?$/.test(cmd)&&(!/live|remote|development/i.test(name+" "+cmd)||/ --mock-contract$/.test(cmd)));
const omitted=entries.filter(e=>!selected.includes(e)).map(([name,command])=>({name,command,reason:"live/development execution excluded by task authorization"}));
function identity(stdout,stderr,exit){let report=null;for(const m of stdout.matchAll(/(?:^|\n)\s*\{/g)){try{const r=JSON.parse(stdout.slice(m.index).trim());if(r&&typeof r==="object")report=r;}catch{}}
 const found=[];if(report){if(Array.isArray(report.checks))for(const c of report.checks)if(c.pass===false||c.passed===false)found.push(String(c.name??c.check??c.id));for(const field of ["failedChecks","failures","issues"])if(Array.isArray(report[field]))for(const c of report[field])found.push(typeof c==="string"?c:String(c.name??c.check??c.id??c.message));}
 if(!found.length&&exit!==0){const error=(stderr.match(/(?:Error|TypeError|SyntaxError):[^\r\n]+/)??stdout.match(/(?:Error|TypeError|SyntaxError):[^\r\n]+/))?.[0];found.push(error??`UNREPORTED_FAILURE:${report?.reason??report?.status??exit}`);}
 return [...new Set(found)].sort();
}
const untracked=tree=>execFileSync("git",["ls-files","--others","--exclude-standard"],{cwd:tree,encoding:"utf8"}).split(/\r?\n/).filter(Boolean);
const progress={};function run(tree,name,command){const initial=new Set(untracked(tree));return new Promise(resolve=>{const argv=command.split(" ").slice(1),env={...process.env,...(preload?{NODE_OPTIONS:`--require ${preload}`}:{})};let stdout="",stderr="";const p=spawn(process.execPath,argv,{cwd:tree,env,stdio:["ignore","pipe","pipe"],detached:process.platform!=="win32"});const timer=setTimeout(()=>{if(process.platform!=="win32"){try{process.kill(-p.pid,"SIGKILL");}catch{}}else p.kill("SIGKILL");},600000);p.stdout.on("data",b=>stdout+=b);p.stderr.on("data",b=>stderr+=b);p.on("close",code=>{clearTimeout(timer);const exit=code??124;const created=untracked(tree).filter(p=>!initial.has(p));for(const p of created)fs.rmSync(path.join(tree,p),{force:true});const record={name,command,exit,failedChecks:identity(stdout,stderr,exit),removedTestResidue:created};progress[tree]=(progress[tree]??0)+1;fs.writeFileSync(output+".progress.json",JSON.stringify(progress));fs.writeFileSync(path.join(output+".logs",path.basename(tree)+"-"+name.replace(/[^\w.-]/g,"_")+".log"),stdout+stderr);resolve(record);});});}
fs.mkdirSync(output+".logs",{recursive:true});
async function sweep(tree,prior=[]){
 const byName=new Map(prior.map(r=>[r.name,r]));
 for(const r of prior)if(!selected.some(([name,cmd])=>name===r.name&&cmd===r.command))throw Error("Completed command is outside current exact selection: "+r.name);
 const records=[];for(const [name,cmd] of selected){const existing=byName.get(name);records.push(existing??await run(tree,name,cmd));}return records;
}
const extensionFile=process.argv.includes("--extend-completed-report")?arg("--extend-completed-report"):null;
const reusedFile=extensionFile??(process.argv.includes("--reuse-baseline-report")?arg("--reuse-baseline-report"):null);
let before,after;
if(reusedFile){
 const old=JSON.parse(fs.readFileSync(reusedFile,"utf8"));
 const head=execFileSync("git",["rev-parse","HEAD"],{cwd:baseline,encoding:"utf8"}).trim();
 const delta=execFileSync("git",["diff","HEAD","--name-only"],{cwd:baseline,encoding:"utf8"}).trim();
 if(head!==old.baseline||head!=="30268ee4de59a8d8855c1dcaa01795d2f1ce33b1"||delta||untracked(baseline).length)throw Error("Reused baseline must still be the clean required snapshot");
 if(!extensionFile&&(old.suites!==selected.length||JSON.stringify(old.baselineResults.map(r=>[r.name,r.command]))!==JSON.stringify(selected)))throw Error("Reused baseline suite commands differ");
 if(!old.baselineResults.every(r=>Number.isInteger(r.exit)&&Array.isArray(r.failedChecks)))throw Error("Invalid baseline result record");
 if(extensionFile){
  const refresh=process.argv.includes("--refresh-candidate-regressions");
  if((old.NEW_REGRESSION!==0&&!refresh)||old.candidateResults.length!==old.baselineResults.length)throw Error("Complete prior pairs required; regressions must be explicitly refreshed");
  if(refresh&&(!Array.isArray(old.newRegressions)||old.newRegressions.length!==old.NEW_REGRESSION||old.newRegressions.some(n=>!old.candidateResults.some(r=>r.name===n.name))))throw Error("Invalid affected-command evidence");
  const allowedPrior=records=>records.filter(r=>{
   if(selected.some(([name,cmd])=>name===r.name&&cmd===r.command))return true;
   if(omitted.some(x=>x.name===r.name&&x.command===r.command))return false;
   throw Error("Unknown previously completed command: "+r.name);
  });
  [before,after]=await Promise.all([sweep(baseline,allowedPrior(old.baselineResults)),sweep(candidate,allowedPrior(old.candidateResults).filter(r=>!refresh||!old.newRegressions.some(n=>n.name===r.name)))]);
 }else {before=old.baselineResults;after=await sweep(candidate);}
}else [before,after]=await Promise.all([sweep(baseline),sweep(candidate)]);
// Identity normalization is limited to the two explicitly owned isolated source roots.
const normalizeIdentity=value=>value.split(baseline).join("<ISOLATED_TREE>").split(candidate).join("<ISOLATED_TREE>");
for(const record of [...before,...after])record.failedChecks=record.failedChecks.map(normalizeIdentity).sort();
const regressions=[],resolved=[],parity=[];for(let i=0;i<before.length;i++){const b=before[i],c=after[i],newChecks=c.failedChecks.filter(n=>!b.failedChecks.includes(n)),oldChecks=b.failedChecks.filter(n=>!c.failedChecks.includes(n));if(newChecks.length)regressions.push({name:c.name,newChecks,baseline:b.failedChecks,candidate:c.failedChecks});if(oldChecks.length)resolved.push({name:c.name,checks:oldChecks});if(b.exit!==0&&c.exit!==0&&JSON.stringify(b.failedChecks)===JSON.stringify(c.failedChecks))parity.push({name:c.name,failedChecks:c.failedChecks});}
const report={baseline:"30268ee4de59a8d8855c1dcaa01795d2f1ce33b1",candidate:"isolated exact working candidate",suites:selected.length,baselineEvidence:reusedFile?{reusedReport:reusedFile,sha256:(await import("node:crypto")).createHash("sha256").update(fs.readFileSync(reusedFile)).digest("hex"),reason:extensionFile?"completed unaffected pairs reused; rerun only missing or explicitly demonstrated affected candidate commands; product and migration bytes unchanged; output flushing and exact successor recognition repaired":"unchanged clean baseline; candidate changed after demonstrated findings"}:null,excluded:omitted,baselineResults:before,candidateResults:after,exactInheritedFailureParity:parity,resolvedFailures:resolved,newRegressions:regressions,NEW_REGRESSION:regressions.length};fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({suites:report.suites,baselineFailed:before.filter(r=>r.exit!==0).length,candidateFailed:after.filter(r=>r.exit!==0).length,inheritedExactParity:parity.length,NEW_REGRESSION:regressions.length,regressions}));if(regressions.length)process.exitCode=1;
