#!/usr/bin/env node
// Disposable local PostgreSQL gate. It never connects to Development or Production.
import fs from "node:fs";import path from "node:path";import net from "node:net";import child from "node:child_process";import {createRequire} from "node:module";
const SUITE="restaurant-owner-public-social-links-ra-2i-p2-postgres-apply",ROOT=process.cwd(),MIGRATIONS=path.join(ROOT,"supabase/migrations"),CANDIDATE="20260910030000_restaurant_owner_public_social_links_authority.sql";
const PG_BIN=(process.env.RA2IP2_PG_BIN??process.env.RA2IP1B_PG_BIN??process.env.RA2HP1_PG_BIN)?.trim(),PG_MODULES=(process.env.RA2IP2_PG_MODULES??process.env.RA2IP1B_PG_MODULES??process.env.RA2HP1_PG_MODULES)?.trim();
if(!PG_BIN||!PG_MODULES||(!fs.existsSync(path.join(PG_BIN,"initdb.exe"))&&!fs.existsSync(path.join(PG_BIN,"initdb")))){console.log(JSON.stringify({suite:SUITE,status:"skipped",reason:"set RA2IP2_PG_BIN and RA2IP2_PG_MODULES"},null,2));process.exit(0)}
const exe=n=>path.join(PG_BIN,process.platform==="win32"?`${n}.exe`:n),{Client}=createRequire(path.join(PG_MODULES,"package.json"))("pg");
const source=fs.readFileSync(path.join(ROOT,"scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"),"utf8"),start=source.indexOf("const BOOTSTRAP = `")+"const BOOTSTRAP = `".length,end=source.indexOf("\n`;",start);
if(start<"const BOOTSTRAP = `".length||end<start)throw new Error("frozen PostgreSQL bootstrap unavailable");const BOOTSTRAP=source.slice(start,end);
const checks=[],failures=[];function check(name,pass,detail){const x={name,pass:!!pass,...(pass?{}:{detail})};checks.push(x);if(!x.pass)failures.push(x);console.log(`${x.pass?"PASS":"FAIL"} ${String(checks.length).padStart(2,"0")} ${name}`)}
function kill(pid){if(!pid)return;if(process.platform==="win32")child.spawnSync("taskkill",["/PID",String(pid),"/T","/F"],{stdio:"ignore",windowsHide:true});else try{process.kill(-pid,"SIGKILL")}catch{try{process.kill(pid,"SIGKILL")}catch{}}}
const port=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const a=s.address();s.close(()=>resolve(a.port))});s.on("error",reject)});
async function cluster(){const base=path.join(process.env.TEMP??process.env.TMPDIR??"/tmp","ra2ip2-apply"),dir=path.join(base,`data-${process.pid}-${Date.now()}`),log=`${dir}.log`;fs.mkdirSync(base,{recursive:true});const init=child.spawnSync(exe("initdb"),["-D",dir,"-U","supabase_admin","--encoding=UTF8","--locale=C","-A","trust"],{encoding:"utf8",windowsHide:true});if(init.status!==0)throw new Error(`initdb failed: ${init.stderr||init.stdout}`);const p=await port(),out=fs.openSync(log,"a"),proc=child.spawn(exe("postgres"),["-D",dir,"-p",String(p),"-c","listen_addresses=127.0.0.1","-c","fsync=off","-c","full_page_writes=off","-c","synchronous_commit=off"],{detached:true,windowsHide:true,stdio:["ignore",out,out]});proc.unref();let stopped=false;const stop=()=>{if(stopped)return;stopped=true;kill(proc.pid);try{fs.closeSync(out)}catch{}try{fs.rmSync(dir,{recursive:true,force:true})}catch{}try{fs.rmSync(log,{force:true})}catch{}};const deadline=Date.now()+90000;while(Date.now()<deadline){const c=new Client({host:"127.0.0.1",port:p,user:"supabase_admin",database:"postgres"});try{await c.connect();await c.query("select 1");await c.end();return{port:p,stop}}catch{try{await c.end()}catch{}await new Promise(r=>setTimeout(r,250))}}stop();throw new Error("PostgreSQL did not become ready")}
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222",STRANGER="44444444-4444-4444-8444-444444444444",WRITER="restaurant_owner_public_social_links_write_authority",AUDIT="restaurant_internal.restaurant_public_social_link_audit_log";
let db,admin,runner,applied=0;const watchdog=setTimeout(()=>{db?.stop();process.exit(1)},20*60*1000);watchdog.unref?.();process.on("exit",()=>db?.stop());
try{
  db=await cluster();admin=new Client({host:"127.0.0.1",port:db.port,user:"supabase_admin",database:"postgres"});await admin.connect();const q=async(sql,params)=>(await admin.query(sql,params)).rows;
  await admin.query(BOOTSTRAP);runner=new Client({host:"127.0.0.1",port:db.port,user:"postgres",database:"postgres"});await runner.connect();
  const identity=(await runner.query("select current_user,current_setting('is_superuser') superuser")).rows[0];check("runner is non-superuser",identity.current_user==="postgres"&&identity.superuser==="off",identity);
  const files=fs.readdirSync(MIGRATIONS).filter(f=>f.endsWith(".sql")).sort();
  for(const file of files){try{await runner.query(fs.readFileSync(path.join(MIGRATIONS,file),"utf8"));applied++}catch(error){check(`migration applies: ${file}`,false,{code:error.code,position:error.position,message:String(error.message).slice(0,500)});throw error}}
  check("full chain applies with P2 last",applied===files.length&&files.at(-1)===CANDIDATE,{applied,total:files.length,last:files.at(-1)});
  const privileges=(await q(`select
    has_table_privilege('authenticated','public.restaurant_public_social_links','INSERT') auth_insert,
    has_table_privilege('authenticated','public.restaurant_public_social_links','UPDATE') auth_update,
    has_table_privilege('authenticated','public.restaurant_public_social_links','DELETE') auth_delete,
    has_table_privilege($1,'public.restaurant_public_social_links','INSERT') writer_broad_insert,
    has_table_privilege($1,'public.restaurant_public_social_links','UPDATE') writer_broad_update,
    has_table_privilege($1,'public.restaurant_public_social_links','DELETE') writer_delete,
    has_column_privilege($1,'public.restaurant_public_social_links','public_url','UPDATE') url_update,
    has_column_privilege($1,'public.restaurant_public_social_links','restaurant_id','INSERT') restaurant_insert,
    has_column_privilege($1,'public.restaurant_public_social_links','provider','INSERT') provider_insert,
    has_column_privilege($1,'public.restaurant_public_social_links','public_url','INSERT') url_insert,
    has_column_privilege($1,'public.restaurant_public_social_links','public_url_version','INSERT') version_insert,
    has_column_privilege($1,'public.restaurant_public_social_links','public_url_version','UPDATE') version_update,
    has_table_privilege($1,'public.restaurants','UPDATE') restaurants_update,
    has_table_privilege($1,'public.restaurant_branches','UPDATE') branches_update`,[WRITER]))[0];
  check("authenticated has no direct social DML",!privileges.auth_insert&&!privileges.auth_update&&!privileges.auth_delete,privileges);
  check("sealed writer has only governed insert and URL update",!privileges.writer_broad_insert&&!privileges.writer_broad_update
    &&privileges.restaurant_insert&&privileges.provider_insert&&privileges.url_insert&&privileges.version_insert
    &&!privileges.writer_delete&&privileges.url_update&&!privileges.version_update
    &&!privileges.restaurants_update&&!privileges.branches_update,privileges);
  const acl=(await q(`select
    has_function_privilege('authenticated','public.restaurant_owner_preview_public_social_link_v1(text,text)','EXECUTE') preview_auth,
    has_function_privilege('anon','public.restaurant_owner_preview_public_social_link_v1(text,text)','EXECUTE') preview_anon,
    has_function_privilege('authenticated','public.restaurant_owner_set_public_social_link_v1(text,text,text,text,text,bigint)','EXECUTE') mutate_auth,
    has_function_privilege('anon','public.restaurant_owner_set_public_social_link_v1(text,text,text,text,text,bigint)','EXECUTE') mutate_anon,
    has_function_privilege('service_role','public.restaurant_owner_set_public_social_link_v1(text,text,text,text,text,bigint)','EXECUTE') mutate_service,
    has_table_privilege('authenticated',$1,'SELECT') audit_auth,
    has_table_privilege('anon',$1,'SELECT') audit_anon`,[AUDIT]))[0];
  check("RPC execution and audit ACL are exact",acl.preview_auth&&!acl.preview_anon&&acl.mutate_auth&&!acl.mutate_anon&&!acl.mutate_service&&!acl.audit_auth&&!acl.audit_anon,acl);
  const role=(await q("select rolcanlogin,rolinherit,rolbypassrls from pg_roles where rolname=$1",[WRITER]))[0];check("writer is NOLOGIN NOINHERIT NOBYPASSRLS",!role.rolcanlogin&&!role.rolinherit&&!role.rolbypassrls,role);
  await q("insert into auth.users(id,email) values ($1,'owner-a@invalid.test'),($2,'owner-b@invalid.test')",[A,B]);
  await q("insert into public.restaurants(id,name,status,public_website_url) values ('p2-a','A','active','https://a.example/'),('p2-b','B','active',null)");
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status,timezone_name,public_phone) values
    ('p2-ba','p2-a','A Branch','active','Asia/Taipei','02-1'),('p2-bb','p2-b','B Branch','active','Asia/Taipei',null)`);
  await q("insert into public.menus(id,restaurant_id,name,status) values ('p2-m','p2-a','Menu','published')");
  await q("insert into public.menu_categories(id,menu_id,name) values ('p2-c','p2-m','Main')");
  await q("insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values ('p2-i','p2-a','p2-c','Item','active')");
  await q("insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,sold_out,branch_specific_status) values ('p2-bi','p2-a','p2-ba','p2-i',100,'available',false,'available')");
  const users=await q("insert into public.restaurant_users(auth_user_id,login_status) values ($1,'enabled'),($2,'enabled') returning id,auth_user_id",[A,B]),roles=await q("select id,role_key from public.restaurant_roles"),owner=roles.find(r=>r.role_key==="owner").id;
  await q("insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values ($1,'p2-a',$3,'active'),($2,'p2-b',$3,'active')",[users.find(u=>u.auth_user_id===A).id,users.find(u=>u.auth_user_id===B).id,owner]);
  await q("grant anon,authenticated,service_role to postgres");
  const call=async(actor,sql,params)=>{const c=new Client({host:"127.0.0.1",port:db.port,user:"postgres",database:"postgres"});await c.connect();try{await c.query("begin");if(actor)await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await c.query("set local role authenticated");const out=(await c.query(sql,params)).rows[0].out;await c.query("commit");return out}catch(error){try{await c.query("rollback")}catch{}return{thrown:error.code}}finally{await c.end()}};
  const preview=(actor,restaurant,provider)=>call(actor,"select public.restaurant_owner_preview_public_social_link_v1($1,$2) out",[restaurant,provider]);
  const mutate=(actor,restaurant,provider,operation,expected,next,version)=>call(actor,"select public.restaurant_owner_set_public_social_link_v1($1,$2,$3,$4,$5,$6::bigint) out",[restaurant,provider,operation,expected,next,version]);
  const rows=()=>q("select restaurant_id,provider,public_url,public_url_version from public.restaurant_public_social_links order by provider");
  const auditCount=async()=>Number((await q(`select count(*) n from ${AUDIT}`))[0].n);
  const initial=await preview(A,"p2-a","instagram");check("absent provider previews NULL version 0",initial.ok&&initial.publicUrl===null&&initial.publicUrlVersion==="0",initial);
  check("arbitrary provider rejected",(await preview(A,"p2-a","other")).errorCode==="invalid_request");
  check("unauthenticated rejected",(await preview(null,"p2-a","instagram")).errorCode==="unauthenticated");
  check("foreign owner cannot spoof restaurant",(await preview(B,"p2-a","instagram")).errorCode==="target_not_found");
  check("stranger rejected",(await preview(STRANGER,"p2-a","instagram")).errorCode==="permission_denied");
  const catalogBefore=Number((await q("select count(*) n from public.consumer_public_restaurant_catalog_v4 where restaurant_id='p2-a'"))[0].n);
  const first=await mutate(A,"p2-a","instagram","set",null,"https://instagram.com/a?q=1#x","0");
  check("first SET creates version 1",first.ok&&first.publicUrlVersion==="1"&&(await rows()).length===1,first);
  check("published URL appears in separate projection",(await q("select public_url from public.consumer_public_restaurant_social_links_v1 where restaurant_id='p2-a' and provider='instagram'"))[0].public_url===first.publicUrl);
  const catalogAfter=Number((await q("select count(*) n from public.consumer_public_restaurant_catalog_v4 where restaurant_id='p2-a'"))[0].n);
  check("social SET leaves catalog cardinality unchanged",catalogAfter===catalogBefore,{catalogBefore,catalogAfter});
  const auditsAfterSet=await auditCount();check("identical SET is no_change",(await mutate(A,"p2-a","instagram","set",first.publicUrl,first.publicUrl,"1")).errorCode==="no_change");check("no_change writes no audit",await auditCount()===auditsAfterSet);
  const fb=await mutate(A,"p2-a","facebook","set",null,"https://facebook.com/a","0");check("provider states are independent",fb.ok&&(await rows()).length===2);
  check("wrong provider host rejected",(await mutate(A,"p2-a","youtube","set",null,"https://instagram.com/a","0")).errorCode==="invalid_request");
  for(const [name,url] of [["http","http://youtube.com/a"],["lookalike","https://evilyoutube.com/a"],["subdomain","https://help.youtube.com/a"],["credentials","https://u:p@youtube.com/a"],["control","https://youtube.com/\na"]])check(`${name} direct RPC URL rejected`,(await mutate(A,"p2-a","youtube","set",null,url,"0")).errorCode==="invalid_request");
  check("stale expected URL rejected",(await mutate(A,"p2-a","instagram","set",null,"https://instagram.com/b","1")).errorCode==="stale_state");
  check("stale version rejected",(await mutate(A,"p2-a","instagram","set",first.publicUrl,"https://instagram.com/b","0")).errorCode==="stale_state");
  check("wrong restaurant mutation rejected",(await mutate(B,"p2-a","instagram","set",first.publicUrl,"https://instagram.com/b","1")).errorCode==="target_not_found");
  const clear=await mutate(A,"p2-a","instagram","clear",first.publicUrl,null,"1"),afterClear=await rows();
  check("CLEAR stores NULL and preserves row at version 2",clear.ok&&clear.publicUrl===null&&clear.publicUrlVersion==="2"&&afterClear.find(r=>r.provider==="instagram")?.public_url===null,clear);
  check("cleared row absent from public projection",(await q("select count(*)::int n from public.consumer_public_restaurant_social_links_v1 where restaurant_id='p2-a' and provider='instagram'"))[0].n===0);
  check("CLEAR already NULL is no_change",(await mutate(A,"p2-a","instagram","clear",null,null,"2")).errorCode==="no_change");
  const beforeAbsent=(await rows()).length;check("CLEAR absent is no_change",(await mutate(A,"p2-a","youtube","clear",null,null,"0")).errorCode==="no_change");check("CLEAR absent creates no row",(await rows()).length===beforeAbsent);
  const again=await mutate(A,"p2-a","instagram","set",null,"https://www.instagram.com/a","2");check("SET after CLEAR preserves monotonic lineage",again.ok&&again.publicUrlVersion==="3",again);
  check("genuine SET/CLEAR audit count",(await auditCount())===4,{count:await auditCount()});
  const ownerRows=await call(A,"select jsonb_agg(x) out from public.restaurant_internal_restaurant_public_social_links_v1($1) x",["p2-a"]);check("owner read exposes initialized states and versions",Array.isArray(ownerRows)&&ownerRows.length===2,ownerRows);
  const invariant=(await q("select public_website_url from public.restaurants where id='p2-a'"))[0],phone=(await q("select public_phone from public.restaurant_branches where id='p2-ba'"))[0];
  check("P1B website and P1A phone remain unchanged",invariant.public_website_url==="https://a.example/"&&phone.public_phone==="02-1",{invariant,phone});
  const key=(await q("select count(*)::int n from information_schema.table_constraints where table_schema='public' and table_name='restaurant_public_social_links' and constraint_type in ('PRIMARY KEY','UNIQUE')"))[0].n;check("one restaurant/provider identity is unique",key>=1,key);
}catch(error){
  if(!failures.length)check("harness completes",false,{code:error.code,message:String(error.message).slice(0,500)});
}finally{
  try{await runner?.end()}catch{}
  try{await admin?.end()}catch{}
  db?.stop();clearTimeout(watchdog);
}
console.log(JSON.stringify({suite:SUITE,status:failures.length?"failed":"passed",database:"disposable local PostgreSQL",migrationsApplied:applied,total:checks.length,passed:checks.length-failures.length,failed:failures.length,developmentTouched:false,productionTouched:false},null,2));
process.exitCode=failures.length?1:0;
