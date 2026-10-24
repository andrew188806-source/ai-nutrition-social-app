// A process exit is not proof of a suite. No setup/crash/timeout is a product detector.
export function assessDenoSuite(result,contract){
 const stdout=String(result.stdout??'').replace(/\x1b\[[0-9;]*m/g,''),reasons=[];
 if(result.error||result.signal||result.status!==0)reasons.push('child-not-normal-zero-exit');
 const summaries=[...stdout.matchAll(/^ok \| (\d+) passed \| (\d+) failed(?: \| (\d+) ignored)?(?: \| (\d+) filtered out)? \([^\r\n]+\)$/gm)];
 if(summaries.length!==1||Number(summaries[0]?.[1])!==1||Number(summaries[0]?.[2])!==0||Number(summaries[0]?.[3]??0)!==0||Number(summaries[0]?.[4]??0)!==0)reasons.push('missing-or-noncomplete-Deno-summary');
 const registered=[...stdout.matchAll(/^running (\d+) tests? from /gm)].map(x=>Number(x[1]));if(registered.reduce((a,b)=>a+b,0)!==1||registered.length!==1)reasons.push('unexpected-test-registration');
 if(!stdout.includes(contract.testName+' ... ok ('))reasons.push('required-named-test-not-completed');
 const parse=(prefix)=>stdout.split(/\r?\n/).map(x=>x.trim()).filter(x=>x.startsWith(prefix)).map(x=>{try{return JSON.parse(x.slice(prefix.length));}catch{return null;}});
 const assertions=parse('PH1_ASSERT '),complete=parse('PH1_SUITE_COMPLETE ');
 if(assertions.length!==contract.assertions.length||assertions.some((x,i)=>!x||x.id!==contract.assertions[i]?.id||x.name!==contract.assertions[i]?.name||x.pass!==true))reasons.push('required-assertions-not-completed-in-order');
 if(complete.length!==1||complete[0]?.testName!==contract.testName||complete[0]?.checks!==contract.assertions.length)reasons.push('missing-final-suite-receipt');
 return {pass:reasons.length===0,classification:reasons.length?'FAIL_OR_BLOCKED_NOT_A_PRODUCT_DETECTOR':'EXECUTED_COMPLETE',reasons,assertions:assertions.length,expectedAssertions:contract.assertions.length,testName:contract.testName};
}
