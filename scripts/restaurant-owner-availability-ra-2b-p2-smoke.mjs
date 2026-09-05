#!/usr/bin/env node
import {sources,audit,behavior} from './restaurant-owner-availability-ra-2b-p2-contract.mjs';
const s=sources();const checks=[...audit(s),...await behavior(s)];
checks.forEach((c,i)=>console.log(`${c.pass?'PASS':'FAIL'} ${i+1} ${c.name}`));
const failures=checks.filter(c=>!c.pass);
console.log(JSON.stringify({suite:'restaurant-owner-availability-ra-2b-p2-smoke',total:checks.length,passed:checks.length-failures.length,failed:failures.length,failures},null,2));
if(failures.length)process.exitCode=1;
