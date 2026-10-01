// Preserve actual CHECK identifiers and runtime causes from heterogeneous historical harnesses.
export function failureEvidence(stdout,stderr,exit){
 if(exit===0)return {verified:true,failedChecks:[]};
 const requiresPreconditionDiagnostic=stderr.includes("Baseline must pass before mutations run");
 stdout=stdout+"\n"+stderr;
 const objects=[];for(let i=0;i<stdout.length;i++){if(stdout[i]!=='{')continue;let depth=0,string=false,escaped=false;for(let j=i;j<stdout.length;j++){const c=stdout[j];if(string){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')string=false;}else if(c==='"')string=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){try{objects.push(JSON.parse(stdout.slice(i,j+1)));i=j;}catch{}break;}}}
 const names=new Set(),add=(prefix,value)=>{if(typeof value==='string'&&value.trim())names.add(prefix+value.trim());};
 for(const r of objects){
  for(const key of ['checks','results'])if(Array.isArray(r[key]))for(const c of r[key])if(c.pass===false||c.passed===false||c.killed===false||c.status==='failed'){
   add('CHECK:',c.name??c.check??c.id??c.mutation);for(const x of c.violations??[])add('CAUSE:',x);if(c.error)add('RUNTIME:',c.error);if(c.reason)add('CAUSE:',c.reason);if(c.stale)add('CAUSE:','mutation anchor did not apply');}
  for(const key of ['failedChecks','failures','issues','survivors','baselineFailures','survivorNames','stale'])if(Array.isArray(r[key]))for(const c of r[key]){if(typeof c==='string')add('CHECK:',c);else{add(key==='survivors'?'SURVIVOR:':key==='stale'?'STALE_ANCHOR:':'CHECK:',c.name??c.check??c.id??c.message);if(c.anchor)add('ANCHOR:',c.anchor);for(const x of c.violations??[])add('CAUSE:',x);if(c.error)add('RUNTIME:',c.error);if(c.reason)add('CAUSE:',c.reason);if(c.applied===false)add('CAUSE:','mutation did not apply');}}
  if(exit!==0){if(r.error)add('RUNTIME:',typeof r.error==='string'?r.error:JSON.stringify(r.error));if(r.reason&&!/^(failed|failure|error|1)$/i.test(String(r.reason)))add('RUNTIME:',r.reason);}
 }
 for(const line of stdout.split(/\r?\n/)){const m=line.match(/^FAIL(?:ED)?\s+(?:\d+\s+)?(.+)/);if(m)add('CHECK:',m[1]);const survivor=line.match(/^SURVIVED\s+(.+)/);if(survivor)add('SURVIVOR:',survivor[1]);const runtime=line.match(/^(?:[A-Za-z_$][\w$]*(?:Error|Exception)|Error)(?:\s*\[[^\]]+\])?:[^\r\n]+/);if(runtime)add('RUNTIME:',runtime[0]);}
 if(exit!==0&&names.size===0){const error=(stderr+'\n'+stdout).match(/(?:AssertionError(?:\s*\[[^\]]+\])?|TypeError|SyntaxError|ReferenceError|Error):[^\r\n]+/);if(error)add('RUNTIME:',error[0]);}
 if(requiresPreconditionDiagnostic)add("PRECONDITION:","Baseline must pass before mutations run");
 const verified=(exit===0||names.size>0)&&!requiresPreconditionDiagnostic;
 return {verified,requiresPreconditionDiagnostic,failedChecks:[...names].sort(),...(verified?{}:{unverifiedReason:'nonzero exit without a named assertion or concrete runtime cause; inspect raw output'})};
}
