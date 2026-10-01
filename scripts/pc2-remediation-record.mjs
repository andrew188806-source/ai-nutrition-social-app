#!/usr/bin/env node
// Default validation never writes. --seal creates only this authorized supplemental record.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {PC2_IMPLEMENTATION,PC2_REMEDIATION_PATHS,rawSha,isExactPc2} from './pc2-consumer-onboarding-manifest.mjs';
const root=process.cwd(),record='scripts/pc2-remediation-record.json';
if(process.argv.includes('--seal')){
 const artifact='docs/planning/pc2-onboarding-preparation/pc2-remediation-raw-output.zip';
 const delta=[...new Set([...(fs.existsSync(artifact)?[artifact]:[]),...execFileSync('git',['diff','--name-only',PC2_IMPLEMENTATION],{encoding:'utf8'}).trim().split('\n'),...execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n')].filter(Boolean))].sort();
 if(JSON.stringify(delta)!==JSON.stringify(PC2_REMEDIATION_PATHS))throw Error('Supplement inventory differs from the frozen authorized paths');
 const sha256=Object.fromEntries(PC2_REMEDIATION_PATHS.filter(p=>p!==record).map(p=>[p,rawSha(fs.readFileSync(path.join(root,p)))]));
 fs.writeFileSync(record,JSON.stringify({implementation:PC2_IMPLEMENTATION,kind:'EXECUTOR_REMEDIATION_NOT_ACCEPTANCE',legalActive:false,independentAcceptance:false,sha256},null,2)+'\n');
 console.log(JSON.stringify({sealed:true,files:Object.keys(sha256).length,independentAcceptance:false}));
}else{const valid=isExactPc2(root);console.log(JSON.stringify({valid,rewritten:false,kind:'EXECUTOR_REMEDIATION_NOT_ACCEPTANCE'}));if(!valid)process.exitCode=1;}
