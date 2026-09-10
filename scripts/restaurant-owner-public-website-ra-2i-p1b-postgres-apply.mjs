#!/usr/bin/env node
// Local disposable PostgreSQL only. No remote database or credentials.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";
import { createRequire } from "node:module";
const SUITE="restaurant-owner-public-website-ra-2i-p1b-postgres-apply";
const ROOT=process.cwd(); const MIGRATIONS=path.join(ROOT,"supabase/migrations");
const CANDIDATE="20260910020000_restaurant_owner_public_website_authority.sql";
const PG_BIN=(process.env.RA2IP1B_PG_BIN??process.env.RA2IP1A_PG_BIN??process.env.RA2HP1_PG_BIN)?.trim();
const PG_MODULES=(process.env.RA2IP1B_PG_MODULES??process.env.RA2IP1A_PG_MODULES??process.env.RA2HP1_PG_MODULES)?.trim();
if(!PG_BIN||!PG_MODULES||(!fs.existsSync(path.join(PG_BIN,"initdb.exe"))&&!fs.existsSync(path.join(PG_BIN,"initdb")))){
  console.log(JSON.stringify({suite:SUITE,status:"skipped",reason:"set RA2IP1B_PG_BIN and RA2IP1B_PG_MODULES"},null,2));process.exit(0);
}
const exe=(n)=>path.join(PG_BIN,process.platform==="win32"?`${n}.exe`:n);
const {Client}=createRequire(path.join(PG_MODULES,"package.json"))("pg");
const bootstrapSource=fs.readFileSync(path.join(ROOT,"scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs"),"utf8");
const bs=bootstrapSource.indexOf("const BOOTSTRAP = `")+"const BOOTSTRAP = `".length;
const be=bootstrapSource.indexOf("\n`;",bs);
if(bs<"const BOOTSTRAP = `".length||be<bs)throw new Error("frozen PostgreSQL bootstrap seam unavailable");
const BOOTSTRAP=bootstrapSource.slice(bs,be);
const checks=[];const failures=[];function check(n,p,d){const x={name:n,pass:!!p,...(p?{}:{detail:d})};checks.push(x);if(!x.pass)failures.push(x);console.log(`${x.pass?"PASS":"FAIL"} ${String(checks.length).padStart(2,"0")} ${n}`)}
function kill(pid){if(!pid)return;if(process.platform==="win32")child.spawnSync("taskkill",["/PID",String(pid),"/T","/F"],{stdio:"ignore",windowsHide:true});else try{process.kill(-pid,"SIGKILL")}catch{try{process.kill(pid,"SIGKILL")}catch{}}}
const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const a=s.address();s.close(()=>resolve(a.port))});s.on("error",reject)});
async function start(){
  const base=path.join(process.env.TEMP??process.env.TMPDIR??"/tmp","ra2ip1b-apply-gate");fs.mkdirSync(base,{recursive:true});
  const dir=path.join(base,`data-${process.pid}-${Date.now()}`),log=`${dir}.log`;
  const init=child.spawnSync(exe("initdb"),["-D",dir,"-U","supabase_admin","--encoding=UTF8","--locale=C","-A","trust"],{encoding:"utf8",windowsHide:true});
  if(init.status!==0)throw new Error(`initdb failed: ${init.stderr||init.stdout}`);
  const port=await freePort(),out=fs.openSync(log,"a");
  const proc=child.spawn(exe("postgres"),["-D",dir,"-p",String(port),"-c","listen_addresses=127.0.0.1","-c","fsync=off","-c","full_page_writes=off","-c","synchronous_commit=off"],{detached:true,windowsHide:true,stdio:["ignore",out,out]});proc.unref();
  let stopped=false;const stop=()=>{if(stopped)return;stopped=true;kill(proc.pid);try{fs.closeSync(out)}catch{}try{fs.rmSync(dir,{recursive:true,force:true})}catch{}try{fs.rmSync(log,{force:true})}catch{}};
  const deadline=Date.now()+90000;while(Date.now()<deadline){const c=new Client({host:"127.0.0.1",port,user:"supabase_admin",database:"postgres"});try{await c.connect();await c.query("select 1");await c.end();return{port,stop}}catch{try{await c.end()}catch{}await new Promise(r=>setTimeout(r,250))}}stop();throw new Error("PostgreSQL did not become ready");
}
const OWNER_A="11111111-1111-4111-8111-111111111111",OWNER_B="22222222-2222-4222-8222-222222222222",STRANGER="44444444-4444-4444-8444-444444444444";
const WRITER="restaurant_owner_public_website_write_authority",AUDIT="restaurant_internal.restaurant_public_website_audit_log";
let cluster,admin,runner,applied=0;const watchdog=setTimeout(()=>{cluster?.stop();process.exit(1)},20*60*1000);watchdog.unref?.();process.on("exit",()=>cluster?.stop());
try{
  cluster=await start();admin=new Client({host:"127.0.0.1",port:cluster.port,user:"supabase_admin",database:"postgres"});await admin.connect();
  const q=async(sql,params)=>(await admin.query(sql,params)).rows;
  await admin.query(BOOTSTRAP);runner=new Client({host:"127.0.0.1",port:cluster.port,user:"postgres",database:"postgres"});await runner.connect();
  const ident=(await runner.query("select current_user,current_setting('is_superuser') superuser")).rows[0];
  check("migration runner is non-superuser",ident.current_user==="postgres"&&ident.superuser==="off",ident);
  const files=fs.readdirSync(MIGRATIONS).filter(f=>f.endsWith(".sql")).sort();
  for(const file of files){try{await runner.query(fs.readFileSync(path.join(MIGRATIONS,file),"utf8"));applied++}catch(e){check(`migration applies: ${file}`,false,{code:e.code,position:e.position,message:String(e.message).slice(0,500)});throw e}}
  check("full chain applies with P1B last",applied===files.length&&files.at(-1)===CANDIDATE,{applied,total:files.length,last:files.at(-1)});
  const priv=(await q(`select
    has_table_privilege('authenticated','public.restaurants','UPDATE') auth_update,
    has_table_privilege($1,'public.restaurants','UPDATE') broad_update,
    has_column_privilege($1,'public.restaurants','public_website_url','UPDATE') website_update,
    has_column_privilege($1,'public.restaurants','public_website_url_version','UPDATE') version_update,
    has_column_privilege($1,'public.restaurants','name','UPDATE') name_update,
    has_column_privilege($1,'public.restaurants','city','UPDATE') city_update,
    has_column_privilege($1,'public.restaurants','category','UPDATE') category_update,
    has_column_privilege($1,'public.restaurants','tags','UPDATE') tags_update,
    has_table_privilege($1,'public.restaurant_branches','UPDATE') branch_update`,[WRITER]))[0];
  check("authenticated has no broad restaurants UPDATE",!priv.auth_update,priv);
  check("writer updates website only",priv.website_update&&!priv.broad_update&&!priv.version_update&&!priv.name_update&&!priv.city_update&&!priv.category_update&&!priv.tags_update&&!priv.branch_update,priv);
  const acl=(await q(`select
    has_function_privilege('authenticated','public.restaurant_owner_preview_public_website_v1(text)','EXECUTE') preview_auth,
    has_function_privilege('anon','public.restaurant_owner_preview_public_website_v1(text)','EXECUTE') preview_anon,
    has_function_privilege('authenticated','public.restaurant_owner_set_public_website_v1(text,text,text,text,bigint)','EXECUTE') mutate_auth,
    has_function_privilege('anon','public.restaurant_owner_set_public_website_v1(text,text,text,text,bigint)','EXECUTE') mutate_anon,
    has_function_privilege('service_role','public.restaurant_owner_set_public_website_v1(text,text,text,text,bigint)','EXECUTE') mutate_service,
    has_table_privilege('authenticated',$1,'SELECT') audit_auth,
    has_table_privilege('anon',$1,'SELECT') audit_anon,
    has_table_privilege('service_role',$1,'SELECT') audit_service`,[AUDIT]))[0];
  check("RPC and audit ACL are exact",acl.preview_auth&&!acl.preview_anon&&acl.mutate_auth&&!acl.mutate_anon&&!acl.mutate_service&&!acl.audit_auth&&!acl.audit_anon&&!acl.audit_service,acl);
  const flags=(await q("select rolcanlogin,rolinherit,rolbypassrls from pg_roles where rolname=$1",[WRITER]))[0];
  check("writer is sealed",!flags.rolcanlogin&&!flags.rolinherit&&!flags.rolbypassrls,flags);
  await q("insert into auth.users(id,email) values ($1,'a@invalid.test'),($2,'b@invalid.test')",[OWNER_A,OWNER_B]);
  await q("insert into public.restaurants(id,name,status) values ('p1b-a','A','active'),('p1b-b','B','active')");
  await q(`insert into public.restaurant_branches(id,restaurant_id,name,status,timezone_name) values
    ('p1b-ba','p1b-a','A Branch','active','Asia/Taipei'),('p1b-bb','p1b-b','B Branch','active','Asia/Taipei')`);
  await q("insert into public.menus(id,restaurant_id,name,status) values ('p1b-m','p1b-a','Menu','published')");
  await q("insert into public.menu_categories(id,menu_id,name) values ('p1b-c','p1b-m','Main')");
  await q("insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values ('p1b-i','p1b-a','p1b-c','Item','active')");
  await q("insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability,sold_out,branch_specific_status) values ('p1b-bi','p1b-a','p1b-ba','p1b-i',100,'available',false,'available')");
  const users=await q("insert into public.restaurant_users(auth_user_id,login_status) values ($1,'enabled'),($2,'enabled') returning id,auth_user_id",[OWNER_A,OWNER_B]);
  const roles=await q("select id,role_key from public.restaurant_roles");const owner=roles.find(r=>r.role_key==="owner").id;
  await q("insert into public.restaurant_memberships(restaurant_user_id,restaurant_id,role_id,status) values ($1,'p1b-a',$3,'active'),($2,'p1b-b',$3,'active')",[users.find(u=>u.auth_user_id===OWNER_A).id,users.find(u=>u.auth_user_id===OWNER_B).id,owner]);
  await q("grant anon,authenticated,service_role to postgres");
  const client=async(actor,sql,params)=>{const c=new Client({host:"127.0.0.1",port:cluster.port,user:"postgres",database:"postgres"});await c.connect();try{await c.query("begin");if(actor)await c.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);await c.query("set local role authenticated");const r=await c.query(sql,params);await c.query("commit");return r.rows[0].out}catch(e){try{await c.query("rollback")}catch{}return{thrown:e.code}}finally{await c.end()}};
  const preview=(actor,id)=>client(actor,"select public.restaurant_owner_preview_public_website_v1($1) out",[id]);
  const mutate=(actor,id,op,expected,next,version)=>client(actor,"select public.restaurant_owner_set_public_website_v1($1,$2,$3,$4,$5::bigint) out",[id,op,expected,next,version]);
  const row=async()=> (await q("select public_website_url,public_website_url_version,name,city,category,tags,status from public.restaurants where id='p1b-a'"))[0];
  const initial=await preview(OWNER_A,"p1b-a");check("owner previews NULL decimal version",initial.ok&&initial.publicWebsiteUrl===null&&initial.publicWebsiteUrlVersion==="0",initial);
  check("unauthenticated rejected",(await preview(null,"p1b-a")).errorCode==="unauthenticated");
  check("non-member rejected",(await preview(STRANGER,"p1b-a")).errorCode==="permission_denied");
  check("foreign owner cannot spoof target",(await preview(OWNER_B,"p1b-a")).errorCode==="target_not_found");
  const before=await row(),set=await mutate(OWNER_A,"p1b-a","set",null,"https://example.com/path?a=1#x","0"),after=await row();
  check("SET stores website and advances version",set.ok&&after.public_website_url==="https://example.com/path?a=1#x"&&after.public_website_url_version==="1",{set,after});
  check("website SET leaves restaurant fields unchanged",["name","city","category","tags","status"].every(k=>JSON.stringify(before[k])===JSON.stringify(after[k])),{before,after});
  check("catalog publishes website",(await q("select restaurant_public_website_url from public.consumer_public_restaurant_catalog_v4 where restaurant_id='p1b-a' limit 1"))[0].restaurant_public_website_url===set.publicWebsiteUrl);
  for(const [name,value] of [["empty",""],["whitespace","   "],["relative","/x"],["javascript","javascript:x"],["data","data:text/plain,x"],["file","file:///x"],["blob","blob:https://x/y"],["mailto","mailto:a@b"],["tel","tel:1"],["custom","x://y"],["credentials","https://u:p@example.com/"],["newline","https://example.com/\nx"],["tab","https://example.com/\tx"],["too long","https://example.com/"+"a".repeat(2048)]])check(`${name} rejected`,(await mutate(OWNER_A,"p1b-a","set",set.publicWebsiteUrl,value,"1")).errorCode==="invalid_request");
  check("stale value rejected",(await mutate(OWNER_A,"p1b-a","set",null,"https://example.org/","1")).errorCode==="stale_state");
  check("stale version rejected",(await mutate(OWNER_A,"p1b-a","set",set.publicWebsiteUrl,"https://example.org/","0")).errorCode==="stale_state");
  check("wrong restaurant mutation rejected",(await mutate(OWNER_B,"p1b-a","set",set.publicWebsiteUrl,"https://example.org/","1")).errorCode==="target_not_found");
  const clear=await mutate(OWNER_A,"p1b-a","clear",set.publicWebsiteUrl,null,"1");
  check("CLEAR stores NULL and advances version",clear.ok&&clear.publicWebsiteUrl===null&&(await row()).public_website_url===null,clear);
  check("CLEAR NULL is deterministic no_change",(await mutate(OWNER_A,"p1b-a","clear",null,null,clear.publicWebsiteUrlVersion)).errorCode==="no_change");
  check("NULL does not depublish catalog",(await q("select count(*)::int n from public.consumer_public_restaurant_catalog_v4 where restaurant_id='p1b-a'"))[0].n>0);
  check("SET and CLEAR audit receipts written",(await q(`select count(*)::int n from ${AUDIT} where restaurant_id='p1b-a' and action in ('SET','CLEAR')`))[0].n===2);
  const cols=await q("select table_name,column_name,ordinal_position from information_schema.columns where table_schema='public' and table_name in ('consumer_public_restaurant_catalog_v3','consumer_public_restaurant_catalog_v4') order by table_name,ordinal_position");
  const v3=cols.filter(r=>r.table_name.endsWith("v3")).map(r=>r.column_name),v4=cols.filter(r=>r.table_name.endsWith("v4")).map(r=>r.column_name);
  check("v4 is exactly v3 plus website",JSON.stringify(v4)===JSON.stringify([...v3,"restaurant_public_website_url"]),{v3,v4});
  check("owner read v2 exposes website version",(await q("select count(*)::int n from information_schema.routines where routine_schema='public' and routine_name='restaurant_internal_restaurants_v2'"))[0].n===1);
}catch(e){if(!failures.length)check("harness completed",false,{code:e.code,message:String(e.message).slice(0,500)})}finally{try{await runner?.end()}catch{}try{await admin?.end()}catch{}cluster?.stop();clearTimeout(watchdog)}
console.log(JSON.stringify({suite:SUITE,status:failures.length?"failed":"passed",database:"disposable local PostgreSQL",migrationsApplied:applied,total:checks.length,passed:checks.length-failures.length,failed:failures.length,developmentTouched:false,productionTouched:false},null,2));process.exitCode=failures.length?1:0;
