#!/usr/bin/env node
// Default is read-only. Explicit --seal binds this addendum, never rewrites historical records.
import fs from 'node:fs';import path from 'node:path';
import {PC2_FIRST_REMEDIATION,PC2_SECOND_PATHS,pc2SecondChangedPaths,isExactPc2,rawSha} from './pc2-consumer-onboarding-manifest.mjs';
const root=process.cwd(),own='scripts/pc2-second-remediation-record.json';
if(process.argv.includes('--seal')){
 if(JSON.stringify(pc2SecondChangedPaths(root))!==JSON.stringify(PC2_SECOND_PATHS))throw Error('Second exact inventory mismatch');
 const sha256=Object.fromEntries(PC2_SECOND_PATHS.filter(p=>p!==own).map(p=>[p,rawSha(fs.readFileSync(path.join(root,p)))]));
 fs.writeFileSync(own,JSON.stringify({baseline:PC2_FIRST_REMEDIATION,kind:'EXECUTOR_SECOND_REMEDIATION_NOT_ACCEPTANCE',provenance:'RECONSTRUCTED_FROM_COMMITTED_SOURCE_AND_FRESH_EXECUTION',independentAcceptance:false,legalActive:false,sha256},null,2)+'\n');
 console.log(JSON.stringify({sealed:true,paths:PC2_SECOND_PATHS.length,independentAcceptance:false}));
}else{const valid=isExactPc2(root);console.log(JSON.stringify({valid,rewritten:false,independentAcceptance:false}));if(!valid)process.exitCode=1;}
