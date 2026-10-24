import {assessDenoSuite} from './s2-ph1-suite-verdict.mjs';
// Fresh local PostgreSQL 17 integration. No Hosted access, secrets, skips or assumed PASS.
// Provider authentication is an injected synthetic boundary; production handlers/services/SQL run.
// Global heavy-PG lock is mandatory and held by this PID until all owned PG processes exit.
import fs from "node:fs";import path from "node:path";import net from "node:net";import child from "node:child_process";import assert from "node:assert/strict";import {createRequire} from "node:module";import {randomUUID,createHash} from "node:crypto";
const root=process.cwd(),arg=n=>process.argv[process.argv.indexOf(n)+1],bin=arg("--pg-bin"),out=path.resolve(arg("--out"));
if(!process.argv.includes("--pg-bin")||!process.argv.includes("--out"))throw Error("--pg-bin and NEW --out are required");
const shared=process.env.TK_PARALLEL_ROOT??"D:/tastkind-parallel-20261017",lock=path.join(shared,"LOCKS","pg-heavy.lock"),token=randomUUID();
fs.mkdirSync(path.dirname(lock),{recursive:true});
try{fs.mkdirSync(lock);}catch(e){if(e.code==="EEXIST")throw Error("PG_LOCK_BUSY: another line holds "+lock);throw e;}
fs.writeFileSync(path.join(lock,"holder.json"),JSON.stringify({line:"social",holder:token,pid:process.pid,workdir:root,command:"s2-ph1-postgres.mjs",startedUtc:new Date().toISOString()},null,2));
const require_=createRequire(import.meta.url),{Client}=require_("pg");
const exe=n=>path.join(bin,n+(process.platform==="win32"?".exe":""));
const run=(n,args)=>{const fd=fs.openSync(path.join(out,"tool-"+n+"-"+Date.now()+".log"),"w");let r;try{r=child.spawnSync(exe(n),args,{stdio:["ignore",fd,fd],timeout:180000,windowsHide:true});}finally{fs.closeSync(fd);}if(r.status!==0)throw Error(n+" failed: "+r.stderr+" "+r.stdout);return n==="postgres"?child.execFileSync(exe(n),["--version"],{encoding:"utf8",windowsHide:true}):"";};
const checks=[],connections=new Set();let started=false,ownsOut=false,port,su,db,failed=null;
const check=(name,pass,detail=null)=>{checks.push({name,pass:!!pass,detail});console.log((pass?"PASS ":"FAIL ")+name);assert.ok(pass,name+" "+JSON.stringify(detail));};
const connect=async user=>{const c=new Client({host:"127.0.0.1",port,user,database:"postgres",connectionTimeoutMillis:10000});c.on("error",()=>{});await c.connect();connections.add(c);return c;};
const close=async c=>{await c.end();connections.delete(c);};
const LEGACY='00000000-0000-4000-8000-000000000104';
try{
 fs.mkdirSync(out);ownsOut=true;
 const sourceGit=args=>child.execFileSync('git',['-c','safe.directory='+root,...args],{cwd:root,encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
 const testedFiles=sourceGit(['ls-files','--','apps/mobile/features/profile-photo','packages/shared/src/domain/profile-photo.ts','supabase/functions/profile-photo','supabase/functions/_shared/profile-photo','supabase/functions/_shared/social-runtime-transport','scripts/s2-ph1*','supabase/config.toml']).split('\n').filter(Boolean);
 fs.writeFileSync(path.join(out,'execution-source.json'),JSON.stringify({head:sourceGit(['rev-parse','HEAD']),tree:sourceGit(['rev-parse','HEAD^{tree}']),parents:sourceGit(['show','-s','--format=%P','HEAD']),dirty:sourceGit(['status','--porcelain=v1','-uall'])!=='',files:testedFiles.map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')}))},null,2));
const version=run("postgres",["--version"]);check("PostgreSQL17 required",/PostgreSQL\) 17\./.test(version),version);
 port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on("error",reject);s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 run("initdb",["-D",path.join(out,"data"),"-U","supabase_admin","--encoding=UTF8","--locale=C","-A","trust","--no-sync"]);
 run("pg_ctl",["-D",path.join(out,"data"),"-l",path.join(out,"postgres.log"),"-o","-p "+port+" -c listen_addresses=127.0.0.1 -c fsync=off -c shared_buffers=16MB -c max_connections=25","start"]);started=true;
 su=await connect("supabase_admin");
 const bootstrapSource=fs.readFileSync(path.join(root,"scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"),"utf8"),marker="const BOOTSTRAP = `",start=bootstrapSource.indexOf(marker)+marker.length;
 assert.ok(start>=marker.length);await su.query(bootstrapSource.slice(start,bootstrapSource.indexOf("\n`;",start)));
 // Match real Supabase Auth schema fields absent from this repository's small legacy test stub.
 await su.query("alter table auth.users add column phone text unique,add column phone_confirmed_at timestamptz,add column banned_until timestamptz,add column deleted_at timestamptz,add column email_confirmed_at timestamptz,add column is_anonymous boolean not null default false;create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));grant select on auth.sessions to postgres;alter role postgres bypassrls;");
 // Standard Auth claims function required by the accepted Demo predecessor; no claims are fabricated.
 await su.query(`create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;`);
 db=await connect("postgres");

 const migrations=fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql')).sort();
 const sources=new Map(migrations.map(name=>[name,fs.readFileSync(path.join(root,'supabase/migrations',name))]));
 const base='93bf0f416ef9b6cecc506c5336e9c18fadbb2bf1',forward='20261022183336_platform_private_avatar_ph1_64ba91de.sql';
 const entries=child.execFileSync('git',['ls-tree','-r',base,'--','supabase/migrations'],{cwd:root,encoding:'utf8'}).trim().split('\n').map(line=>{const [head,file]=line.split('\t');return {mode:head.split(' ')[0],blob:head.split(' ')[2],name:path.basename(file)};});
 const prefix=entries.filter(e=>e.name.endsWith('.sql')).sort((a,b)=>a.name.localeCompare(b.name));
 check('PH1 exact 152 accepted predecessor blobs and unique ordered forward tail',prefix.length===152&&JSON.stringify(migrations)===JSON.stringify([...prefix.map(e=>e.name),forward])&&prefix.every(e=>{const bytes=sources.get(e.name);return e.mode==='100644'&&createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex')===e.blob;}));
 fs.writeFileSync(path.join(out,'predecessor-pins.json'),JSON.stringify({base,prefix,forward},null,2));

 for(const name of migrations){if(name==='20260930174028_consumer_pc2_onboarding_consent_foundation.sql'){await su.query("insert into auth.users(id,email) values($1,'legacy@synthetic.invalid')",[LEGACY]);await db.query("insert into public.consumer_profiles(user_id,profile_id,display_name,anonymous_display_name,mascot_avatar_key) values($1,'test-legacy','Legacy','Legacy','BG')",[LEGACY]);}const installer=/consumer_retention_entitlement_authority|consumer_retention_acquisition_record|consumer_retention_registry_seal|consumer_retention_billing_fact_ingest/.test(name)?su:db;try{await installer.query(sources.get(name).toString('utf8'));}catch(e){throw Error('MIGRATION '+name+' '+e.code+' '+e.message);}}
 check('PH1 fresh sorted153 full migration chain applies',migrations.length===153);
 const inputs=migrations.map(name=>({name,sha256:createHash('sha256').update(sources.get(name)).digest('hex')}));fs.writeFileSync(path.join(out,'migration-inputs.json'),JSON.stringify(inputs,null,2));
 await su.query('create role social_test_executor login noinherit;grant social_runtime_executor to social_test_executor with inherit false,set true;');

 const deno=arg('--deno');if(!process.argv.includes('--deno'))throw Error('--deno required');
 // Run the actual Deno handler + codec + DB transport. Only Auth provider identity is synthetic.
 const result=child.spawnSync(deno,['test','--allow-read='+root,'--allow-run='+process.execPath,'--allow-env','--allow-net=127.0.0.1','--config=supabase/functions/profile-photo/deno.json','--lock=supabase/functions/profile-photo/deno.lock','supabase/functions/profile-photo/pg.test.ts'],{cwd:root,env:{...process.env,PH1_TEST_PG_PORT:String(port),PH1_TEST_NODE:process.execPath},encoding:'utf8',timeout:180000,maxBuffer:12e6});
 fs.writeFileSync(path.join(out,'deno-tests.stdout.txt'),result.stdout??'');fs.writeFileSync(path.join(out,'deno-tests.stderr.txt'),result.stderr??'');
 const contract=JSON.parse(fs.readFileSync(path.join(root,'supabase/functions/profile-photo/pg-suite-contract.json'),'utf8')),verdict=assessDenoSuite(result,contract);
 fs.writeFileSync(path.join(out,'deno-suite-verdict.json'),JSON.stringify(verdict,null,2));
 check('PH1 real Deno/PG suite completed normally',verdict.pass,{status:result.status,error:String(result.error??''),verdict,stdout:result.stdout,stderr:result.stderr});
 if(!verdict.pass)throw Error('PH1_DENO_SUITE_NOT_COMPLETE');
}catch(e){failed={message:e.message,stack:e.stack};console.error(e.stack);process.exitCode=1;}
finally{
 for(const c of [...connections])try{await close(c);}catch{}
 if(started)try{run("pg_ctl",["-D",path.join(out,"data"),"-m","fast","stop"]);started=false;}catch(e){failed??={message:"PG_STOP_FAILED "+e.message};process.exitCode=1;}
 if(ownsOut)fs.writeFileSync(path.join(out,"result.json"),JSON.stringify({status:failed?"FAIL_OR_BLOCKED":"PASS",checks,failed,authProviderVerified:false,denoNetworkVerified:false,uiDeviceVerified:false,hosted:false,lockToken:token},null,2));
 // Only release our exact holder after our PG instance has stopped.
 if(!started&&JSON.parse(fs.readFileSync(path.join(lock,"holder.json"),"utf8")).holder===token){fs.unlinkSync(path.join(lock,"holder.json"));fs.rmdirSync(lock);}
 console.log(JSON.stringify({status:failed?"FAIL_OR_BLOCKED":"PASS",checks:checks.length,passed:checks.filter(c=>c.pass).length,failed,output:out}));
}
