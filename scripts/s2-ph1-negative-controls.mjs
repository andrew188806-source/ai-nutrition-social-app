// No PG. Real Deno codec mutation + actual feature host mutations. Only explicit observed
// assertion failures detect; timeout/setup/crash never count. A normal green control is mandatory.
import fs from 'node:fs';import path from 'node:path';import cp from 'node:child_process';import assert from 'node:assert/strict';
const root=process.cwd(),arg=n=>process.argv[process.argv.indexOf(n)+1],out=path.resolve(arg('--out')),deno=arg('--deno');if(!process.argv.includes('--out')||!process.argv.includes('--deno'))throw Error('--out NEW and --deno required');fs.mkdirSync(out);
const rows=[];
function run(id,exe,args,env={},expected=null){const r=cp.spawnSync(exe,args,{cwd:root,encoding:'utf8',timeout:90000,windowsHide:true,maxBuffer:4e6,env:{...process.env,...env}}),raw=(r.stdout??'')+(r.stderr??'');fs.writeFileSync(path.join(out,id+'.txt'),raw);const normal=!r.error&&r.status===0,detected=!!expected&&!r.error&&r.status===1&&raw.includes(expected);const row={id,status:r.error?'BLOCKED_SETUP_OR_TIMEOUT':expected?detected?'DETECTED':'NOT_DETECTED':normal?'GREEN':'FAILED_CONTROL',exit:r.status,error:r.error?.message,expected};rows.push(row);assert.ok(expected?detected:normal,id+' '+row.status);}
try{
 run('media-green',process.execPath,['scripts/s2-ph1-media-smoke.mjs']);
 run('media-stale-generation',process.execPath,['scripts/s2-ph1-media-smoke.mjs'],{PH1_MEDIA_MUTATION:'remove-epoch-guard'},'FAIL late picker after dispose/reactivate cannot restore old generation');
 run('host-green',process.execPath,['scripts/s2-ph1-host.mjs',root,path.join(out,'host-green.json')]);
 run('host-unkeyed-account',process.execPath,['scripts/s2-ph1-host.mjs',root,path.join(out,'host-mutant.json')],{PH1_HOST_MUTATION:'unkeyed-actor'},'FAIL account switch first render contains no old pixels');
 const fixture=path.join(out,'codec-fixture'),photo=path.join(fixture,'supabase/functions/profile-photo'),shared=path.join(fixture,'supabase/functions/_shared/profile-photo');fs.mkdirSync(photo,{recursive:true});fs.mkdirSync(shared,{recursive:true});
 for(const f of ['codec.test.ts','deno.json','deno.lock'])fs.copyFileSync(path.join(root,'supabase/functions/profile-photo',f),path.join(photo,f));const codec=path.join(root,'supabase/functions/_shared/profile-photo/imageCodec.ts'),target=path.join(shared,'imageCodec.ts'),original=fs.readFileSync(codec,'utf8');fs.writeFileSync(target,original);
 const args=['test','--config='+path.join(photo,'deno.json'),path.join(photo,'codec.test.ts')];run('codec-green',deno,args);
 assert.equal(original.split('switch(head.orientation)').length,2,'one applied orientation mutant');fs.writeFileSync(target,original.replace('switch(head.orientation)','switch(Number(1))'));
 run('codec-ignores-orientation',deno,args,{},'error: Error: orientation pixels 2');fs.writeFileSync(target,original);run('codec-restored-green',deno,args);
}finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({rows,mutationDetectionExcludesSetupCrashTimeout:true,device:'UNVERIFIED'},null,2));}
