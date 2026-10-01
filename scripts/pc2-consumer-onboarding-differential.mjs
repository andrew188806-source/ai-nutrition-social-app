#!/usr/bin/env node
// Fresh complete local differential. Historical baseline and actual candidate are separate trees.
import fs from 'node:fs';import path from 'node:path';import {execFileSync,spawn,spawnSync} from 'node:child_process';import {createHash}from'node:crypto';
import {failureEvidence}from'./pc2-remediation-failure-evidence.mjs';
import {isExactPc2}from'./pc2-consumer-onboarding-manifest.mjs';
const arg=n=>process.argv[process.argv.indexOf(n)+1],baseline=arg('--baseline-dir'),candidate=arg('--candidate-dir'),output=arg('--output'),preload=arg('--preload');
if(!baseline||!candidate||!output||[baseline,candidate].some(p=>path.resolve(p)===process.cwd())||path.resolve(baseline)===path.resolve(candidate))throw Error('Separate disposable trees and external output are required');
const suiteTimeoutMs=process.argv.includes('--suite-timeout-ms')?Number(arg('--suite-timeout-ms')):600000;
if(!Number.isInteger(suiteTimeoutMs)||suiteTimeoutMs<600000||suiteTimeoutMs>3600000)throw Error('Invalid explicit local suite timeout');
const candidateTrees=[candidate,...(process.argv.includes('--candidate-replicas')?arg('--candidate-replicas').split(','):[])];
if(new Set([baseline,...candidateTrees].map(p=>path.resolve(p))).size!==candidateTrees.length+1||candidateTrees.some(p=>path.resolve(p)===process.cwd()))throw Error('Candidate replicas must be distinct owned disposable trees');
const sha=b=>createHash('sha256').update(b).digest('hex'),git=(tree,...args)=>execFileSync('git',args,{cwd:tree,encoding:'utf8',maxBuffer:64*1024*1024}).trim(),lines=s=>s.split(/\r?\n/).filter(Boolean),untracked=t=>lines(git(t,'ls-files','--others','--exclude-standard'));
if(git(baseline,'rev-parse','HEAD')!=='30268ee4de59a8d8855c1dcaa01795d2f1ce33b1'||git(baseline,'status','--porcelain'))throw Error('Baseline must be the exact clean historical snapshot');
const entries=Object.entries(JSON.parse(fs.readFileSync(path.join(baseline,'package.json'))).scripts).filter(([key,cmd])=>/guard|smoke|mutation|validate/.test(key+' '+cmd));
entries.push(['pc2:predecessor:pc1-guard','node scripts/pc1-consumer-closure-guard.mjs'],['pc2:predecessor:gqa6r-guard','node scripts/gqa6r-stable-demo-repair-guard.mjs']);
const selected=entries.filter(([name,cmd])=>/^node scripts\/[\w.-]+\.mjs(?: --mock-contract)?$/.test(cmd)&&(!/live|remote|development/i.test(name+' '+cmd)||/ --mock-contract$/.test(cmd)));
const excluded=entries.filter(e=>!selected.includes(e)).map(([name,command])=>({name,command,reason:'live/Development execution not authorized'}));
if(selected.length!==478||excluded.length!==24)throw Error('Verified 478/24 command inventory changed; investigate before execution');
function sourceIdentity(tree){const files=[...new Set([...lines(git(tree,'ls-files')), ...untracked(tree)])].sort();const sha256=Object.fromEntries(files.map(p=>[p,fs.existsSync(path.join(tree,p))?sha(fs.readFileSync(path.join(tree,p))):null]));return{head:git(tree,'rev-parse','HEAD'),workingPayloadSha256:sha(JSON.stringify(sha256)),sha256};}
const sources={baseline:sourceIdentity(baseline),candidate:sourceIdentity(candidate)},progress={},logDir=output+'.logs';fs.mkdirSync(logDir,{recursive:true});
const candidateReplicas=candidateTrees.map(tree=>({tree,...sourceIdentity(tree)}));
for(const replica of candidateReplicas)if(replica.head!==sources.candidate.head||replica.workingPayloadSha256!==sources.candidate.workingPayloadSha256||!isExactPc2(replica.tree))throw Error('Replica must carry exactly the same sealed candidate payload: '+replica.tree);
function run(tree,kind,name,command){const before=new Set(untracked(tree));return new Promise((resolve,reject)=>{
 const argv=command.split(' ').slice(1),env={...process.env,SUPABASE_ACCESS_TOKEN:'',...(preload?{NODE_OPTIONS:'--require '+preload}:{})};let stdout='',stderr='',timedOut=false;
 const child=spawn(process.execPath,argv,{cwd:tree,env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
 const timer=setTimeout(()=>{timedOut=true;try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGKILL');}catch{}},suiteTimeoutMs);
 child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);
 child.on('close',(code,signal)=>{clearTimeout(timer);const exit=code??124;if(timedOut)stderr+='\nError: suite exceeded the '+(suiteTimeoutMs/1000)+' second local execution timeout\n';
 const created=untracked(tree).filter(p=>!before.has(p));for(const p of created){if(fs.statSync(path.join(tree,p)).isFile())fs.rmSync(path.join(tree,p));else throw Error('Unexpected test residue: '+p);}
 let preconditionDiagnostic=null;
 if(stderr.includes('Baseline must pass before mutations run')&&argv[0]==='scripts/platform-admin-ra-1c-p1-mutations.mjs'){
  const source='import {readSources,auditSources,runSmoke} from "./scripts/platform-admin-ra-1c-p1-contract.mjs";const sources=readSources();const audit=auditSources(sources).filter(c=>!c.pass);const failed=audit.length?audit:(await runSmoke(sources)).filter(c=>!c.pass);console.log(JSON.stringify({kind:"original_mutation_precondition",failedChecks:failed.map(c=>c.name)}));';
  const diagnosticArgs=['--input-type=module','-e',source],d=spawnSync(process.execPath,diagnosticArgs,{cwd:tree,env,encoding:'utf8',maxBuffer:32*1024*1024,timeout:120000});
  preconditionDiagnostic={command:[process.execPath,...diagnosticArgs],exit:d.status,stdout:d.stdout??'',stderr:d.stderr??'',source:{path:'scripts/platform-admin-ra-1c-p1-contract.mjs',sha256:sha(fs.readFileSync(path.join(tree,'scripts/platform-admin-ra-1c-p1-contract.mjs')))},origin:'FRESH_LOCAL_CAUSE_DIAGNOSTIC'};
 }
 const log=kind+'-' +name.replace(/[^\w.-]/g,'_')+'.json',bytes=JSON.stringify({command,exit,signal,stdout,stderr,preconditionDiagnostic},null,2)+'\n';fs.writeFileSync(path.join(logDir,log),bytes);
 const failure=failureEvidence(stdout,stderr,exit);
 if(preconditionDiagnostic){const cause=failureEvidence(preconditionDiagnostic.stdout,preconditionDiagnostic.stderr,1);failure.failedChecks=[...new Set([...failure.failedChecks,...cause.failedChecks])].sort();failure.verified=preconditionDiagnostic.exit===0&&cause.failedChecks.length>0;if(failure.verified)delete failure.unverifiedReason;}
 const record={name,command,exit,signal,...failure,preconditionDiagnostic,sourceIdentity:{head:sources[kind].head,workingPayloadSha256:sources[kind].workingPayloadSha256},executedSourceIdentity:{script:argv[0],sha256:sha(fs.readFileSync(path.join(tree,argv[0]))),cwdRole:kind,controlledTree:tree,substitution:false,preloaderSha256:preload?sha(fs.readFileSync(preload)):null},rawOutput:{artifact:'pc2-remediation-raw-output.zip',entry:log,sha256:sha(bytes)},evidenceOrigin:'FRESH_LOCAL_EXECUTION',reuseProvenance:null,removedTestResidue:created};
 progress[kind]=(progress[kind]??0)+1;fs.writeFileSync(output+'.progress.json',JSON.stringify(progress));resolve(record);
 });
});}
async function candidateSweep(){
 const completed=new Map();let nextIndex=0;
 await Promise.all(candidateTrees.map(async(tree)=>{
  for(;;){const i=nextIndex++;if(i>=selected.length)break;const[name,command]=selected[i];const row=await run(tree,'candidate',name,command);if(completed.has(name))throw Error('Duplicate candidate execution: '+name);completed.set(name,row);fs.writeFileSync(output+'.candidate.partial.json',JSON.stringify(selected.filter(([n])=>completed.has(n)).map(([n])=>completed.get(n))));}
 }));
 if(completed.size!==478)throw Error('Incomplete candidate execution inventory');
 return selected.map(([name])=>completed.get(name));
}
let priorBaseline=[];
if(process.argv.includes('--reuse-baseline-partial')){
 const priorPath=arg('--reuse-baseline-partial'),priorBytes=fs.readFileSync(priorPath),priorLogs=priorPath.replace(/\.baseline\.partial\.json$/,'')+'.logs';
 priorBaseline=JSON.parse(priorBytes);const allowed=new Map(selected);
 for(const row of priorBaseline){
  if(allowed.get(row.name)!==row.command||row.sourceIdentity?.head!==sources.baseline.head||row.sourceIdentity?.workingPayloadSha256!==sources.baseline.workingPayloadSha256||row.executedSourceIdentity?.sha256!==sources.baseline.sha256[row.executedSourceIdentity?.script]||row.executedSourceIdentity?.preloaderSha256!==(preload?sha(fs.readFileSync(preload)):null)||row.verified!==true)throw Error('Baseline reuse provenance invalid: '+row.name);
  const bytes=fs.readFileSync(path.join(priorLogs,row.rawOutput.entry));if(sha(bytes)!==row.rawOutput.sha256)throw Error('Baseline raw output hash mismatch: '+row.name);
  fs.writeFileSync(path.join(logDir,row.rawOutput.entry),bytes);
  row.evidenceOrigin='REUSED_VALID_BASELINE_EXECUTION';row.reuseProvenance={partialReportSha256:sha(priorBytes),rawArtifactEntry:row.rawOutput.entry,rawSha256:row.rawOutput.sha256,reason:'Immutable clean baseline source identity, executed script, preloader and raw output hashes verified; candidate results are never reused.'};
 }
}
async function baselineSweep(){const completed=new Map(priorBaseline.map(r=>[r.name,r])),rows=[];for(const[name,command]of selected){rows.push(completed.get(name)??await run(baseline,'baseline',name,command));fs.writeFileSync(output+'.baseline.partial.json',JSON.stringify(rows));}return rows;}
const [before,after]=await Promise.all([baselineSweep(),candidateSweep()]);
// Normalize only the two controlled roots; retained raw output carries the original strings.
const normalize=s=>[baseline,...candidateTrees].reduce((value,tree)=>value.split(tree).join('<ISOLATED_TREE>'),s);
for(const r of [...before,...after])r.failedChecks=r.failedChecks.map(normalize).sort();
const regressions=[],resolved=[],parity=[],unverified=[];
for(let i=0;i<before.length;i++){const b=before[i],c=after[i];if(!b.verified||!c.verified){unverified.push({name:c.name,baseline:b.unverifiedReason,candidate:c.unverifiedReason});continue;}const added=c.failedChecks.filter(n=>!b.failedChecks.includes(n)),removed=b.failedChecks.filter(n=>!c.failedChecks.includes(n));if(added.length||c.exit!==0&&b.exit===0)regressions.push({name:c.name,newChecks:added,baseline:b.failedChecks,candidate:c.failedChecks,baselineExit:b.exit,candidateExit:c.exit});if(removed.length)resolved.push({name:c.name,checks:removed});if(b.exit!==0&&c.exit!==0&&JSON.stringify(b.failedChecks)===JSON.stringify(c.failedChecks))parity.push({name:c.name,failedChecks:c.failedChecks});}
const report={kind:'EXECUTOR_REMEDIATION_NOT_ACCEPTANCE',baseline:sources.baseline.head,candidate:sources.candidate.head,sourceIdentities:sources,candidateReplicas,executionLimits:{suiteTimeoutMs,candidateWorkers:candidateTrees.length,perTreeSerial:true},suites:selected.length,selectedInventory:selected.map(([name,command])=>({name,command})),excluded,earlier482:{status:'UNSUPPORTED_HISTORICAL_COUNT',reason:'No exact 482 command inventory is available; superseded by this verified 478 local / 24 excluded inventory.'},baselineResults:before,candidateResults:after,exactInheritedFailureParity:parity,resolvedFailures:resolved,newRegressions:regressions,unverified,NEW_REGRESSION:regressions.length,allFailureVectorsVerified:unverified.length===0,independentAcceptance:false};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({suites:478,excluded:24,baselineFailed:before.filter(r=>r.exit!==0).length,candidateFailed:after.filter(r=>r.exit!==0).length,NEW_REGRESSION:regressions.length,unverified:unverified.length,regressions}));if(regressions.length||unverified.length)process.exitCode=1;
