#!/usr/bin/env node
// Disposable PostgreSQL only. Candidate metadata never constitutes Consumer authority.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import child from 'node:child_process';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MIGRATION = '20261003062157_consumer_retention_inactive_persistence_foundation.sql';
export const OWNER = 'consumer_retention_foundation_owner';
export const TABLES = ['owner_authority_state','authority_events','operation_receipts','detail_grants'];
export const VERSION = 'consumer-retention-owner-2026-10-03-v1';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const T0 = '2026-03-01T12:00:00.000Z';
export const E14 = '2026-03-15T12:00:00.000Z';
export const E180 = '2026-08-28T12:00:00.000Z';
export function options(argv = process.argv.slice(2)) {
  const allowed = ['--pg-bin','--out'];
  if(argv.length % 2 || argv.some((v,i)=>i%2===0&&!allowed.includes(v))) throw Error('LOCAL_ONLY_ARGUMENTS: only --pg-bin and --out; no DSN/host');
  const a=Object.fromEntries(Array.from({length:argv.length/2},(_,i)=>[argv[i*2],argv[i*2+1]]));
  if(!a['--pg-bin']||!a['--out']) throw Error('Existing PostgreSQL 17 binary and external --out are required');
  const out=path.resolve(a['--out']);
  if(out===ROOT||out.startsWith(ROOT+path.sep))throw Error('EVIDENCE_OUTSIDE_REPOSITORY_REQUIRED');
  return {bin:path.resolve(a['--pg-bin']),out};
}
export function recorder(out) {
  fs.mkdirSync(out,{recursive:true});
  let ordinal=0;const checks=[];
  const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
  const check=(id,pass,observed)=>{const v={id,pass:!!pass,observed};checks.push(v);write(`check-${id}.json`,v);console.log(`CHECK ${id} ${pass?'PASS':'FAIL'}`);if(!pass){const e=Error(id);e.behavior=true;throw e;}return v;};
  const query=async(c,text,values=[])=>{
    const n=++ordinal;try {const r=await c.query(text,values);write(`sql-${String(n).padStart(5,'0')}.json`,{text,values,exit:0,rows:Array.isArray(r)?r.map(v=>v.rows):r.rows});return r;}
    catch(e){write(`sql-${String(n).padStart(5,'0')}.json`,{text,values,exit:1,sqlstate:e.code,error:e.message,detail:e.detail,constraint:e.constraint});throw e;}
  };
  const reject=async(c,text,values,codes=['23514'],message)=>{
    await query(c,'SAVEPOINT negative_control');
    let error;try{await query(c,text,values);}catch(e){error=e;}
    await query(c,'ROLLBACK TO SAVEPOINT negative_control');await query(c,'RELEASE SAVEPOINT negative_control');
    return {pass:!!error&&codes.includes(error.code)&&(!message||error.message.includes(message)),sqlstate:error?.code,message:error?.message,constraint:error?.constraint};
  };
  return {out,write,check,query,reject,checks};
}
export async function cluster(bin,rec) {
  const exe=n=>path.join(bin,process.platform==='win32'?n+'.exe':n);
  const run=(n,args)=>{const stem=path.join(rec.out,`tool-${n}-${Date.now()}`),out=fs.openSync(stem+'.stdout','w'),err=fs.openSync(stem+'.stderr','w');let r;try{r=child.spawnSync(exe(n),args,{stdio:['ignore',out,err],timeout:60000});}finally{fs.closeSync(out);fs.closeSync(err);}const stdout=fs.readFileSync(stem+'.stdout','utf8'),stderr=fs.readFileSync(stem+'.stderr','utf8');rec.write(path.basename(stem)+'.json',{command:[exe(n),...args],exit:r.status,stdout,stderr,error:r.error?.message});if(r.status!==0)throw Error(`SETUP_${n}: ${stderr} ${r.error?.message??''}`);return stdout;};
  const version=run('postgres',['--version']);if(!/PostgreSQL\) 17\./.test(version))throw Error('PostgreSQL 17 required');
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'retention-local-pg-')),data=path.join(base,'data');
  const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  const {Client}=createRequire(path.join(ROOT,'package.json'))('pg');let started=false;const clients=new Set();
  const stop=async()=>{for(const c of clients){try{await c.end();}catch{}}clients.clear();if(started){run('pg_ctl',['-D',data,'-m','immediate','stop']);started=false;}if(fs.existsSync(path.join(base,'postgres.log')))fs.copyFileSync(path.join(base,'postgres.log'),path.join(rec.out,'postgres.log'));fs.rmSync(base,{recursive:true,force:true});rec.write('cleanup.json',{removed:!fs.existsSync(base),base});};
  try{
    run('initdb',['-D',data,'-U','supabase_admin','--encoding=UTF8','--locale=C','-A','trust']);
    run('pg_ctl',['-D',data,'-l',path.join(base,'postgres.log'),'-o',`-p ${port} -c listen_addresses=127.0.0.1 -c fsync=off`,'start']);started=true;
    const connect=async(database='postgres',user='supabase_admin')=>{const c=new Client({host:'127.0.0.1',port,user,database,connectionTimeoutMillis:5000});await c.connect();clients.add(c);return c;};
    const admin=await connect();const source=fs.readFileSync(path.join(ROOT,'scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs'),'utf8');
    const marker='const BOOTSTRAP = `',begin=source.indexOf(marker)+marker.length,end=source.indexOf('\n`;',begin);
    if(begin<marker.length||end<begin)throw Error('BOOTSTRAP_PARSE');const bootstrap=source.slice(begin,end);
    rec.write('tooling.json',{version,node:process.version,pg:createRequire(path.join(ROOT,'package.json'))('pg/package.json').version,bin,binaries:Object.fromEntries(['postgres','initdb','pg_ctl'].map(n=>[n,sha(fs.readFileSync(exe(n)))])),bootstrapSha256:sha(bootstrap),bootstrapSourceSha256:sha(source),smokeSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url))),migrationSha256:sha(fs.readFileSync(path.join(ROOT,'supabase/migrations',MIGRATION)))});
    await rec.query(admin,bootstrap);await rec.query(admin,'create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));grant select on auth.sessions to postgres;');
    return {admin,connect,stop,clients,port,base};
  }catch(e){await stop();throw e;}
}
export async function baseline(cl,rec,{legacy=false}={}){
  const files=fs.readdirSync(path.join(ROOT,'supabase/migrations')).filter(n=>n.endsWith('.sql')).sort();
  if(files.length!==143||files.at(-1)!==MIGRATION)throw Error('MIGRATION_INVENTORY');
  const predecessors=files.filter(n=>n!==MIGRATION);rec.write('migration-inventory.json',files.map(n=>({path:n,sha256:sha(fs.readFileSync(path.join(ROOT,'supabase/migrations',n)))})));
  const db=await cl.connect('postgres','postgres');
  for(const n of predecessors){
    if(legacy&&n==='20260930174028_consumer_pc2_onboarding_consent_foundation.sql'){
      await rec.query(cl.admin,"insert into auth.users(id,email) values($1,'retention-legacy@synthetic.invalid'),($2,'retention-incomplete@synthetic.invalid')",[uuid(910),uuid(911)]);
      await rec.query(db,"insert into public.consumer_profiles(user_id,profile_id,display_name,anonymous_display_name,mascot_avatar_key) values($1,'retention-synthetic-legacy','Synthetic legacy','Synthetic legacy','BG')",[uuid(910)]);
    }
    try{await rec.query(db,fs.readFileSync(path.join(ROOT,'supabase/migrations',n),'utf8'));}catch(e){throw Error(`BASELINE_APPLY ${n} ${e.code} ${e.message}`);}
  }
  return db;
}
export async function apply(db,rec,sql=fs.readFileSync(path.join(ROOT,'supabase/migrations',MIGRATION),'utf8')){try{await rec.query(db,sql);}catch(e){await db.query('ROLLBACK');throw e;}}
export async function snapshot(c,rec){
  const catalog=(await rec.query(c,`SELECT 'schema' k,nspname name,jsonb_build_array(pg_get_userbyid(nspowner),nspacl) v FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema','retention_internal')
 UNION ALL SELECT 'table',n.nspname||'.'||c.relname,jsonb_build_array(c.relkind,pg_get_userbyid(c.relowner),c.relacl,c.relrowsecurity,c.relforcerowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname NOT IN ('information_schema','retention_internal')
 UNION ALL SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_array(pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl,p.proconfig) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname NOT LIKE 'pg_%' AND n.nspname NOT IN ('information_schema','retention_internal')
 UNION ALL SELECT 'constraint',n.nspname||'.'||c.conname||':'||c.conrelid::regclass::text,to_jsonb(pg_get_constraintdef(c.oid)) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname NOT IN ('information_schema','retention_internal')
 UNION ALL SELECT 'index',schemaname||'.'||indexname,to_jsonb(indexdef) FROM pg_indexes WHERE schemaname NOT LIKE 'pg_%' AND schemaname NOT IN ('information_schema','retention_internal')
 UNION ALL SELECT 'policy',schemaname||'.'||tablename||'.'||policyname,to_jsonb(p) FROM pg_policies p WHERE schemaname<>'retention_internal'
 UNION ALL SELECT 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,jsonb_build_array(pg_get_triggerdef(t.oid),t.tgenabled) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname NOT IN ('information_schema','retention_internal') ORDER BY 1,2,3`)).rows;
  const defaultAcl=(await rec.query(c,"select pg_get_userbyid(defaclrole) role,case when defaclnamespace=0 then '' else defaclnamespace::regnamespace::text end namespace,defaclobjtype,defaclacl from pg_default_acl where defaclrole<>coalesce((select oid from pg_roles where rolname=$1),0) order by 1,2,3",[OWNER])).rows;const data={};const tables=(await rec.query(c,"select schemaname,tablename from pg_tables where schemaname not like 'pg_%' and schemaname not in ('information_schema','retention_internal') order by 1,2")).rows;
  for(const t of tables){const q=s=>'"'+s.replaceAll('"','""')+'"';data[`${t.schemaname}.${t.tablename}`]=(await rec.query(c,`select to_jsonb(t) row from ${q(t.schemaname)}.${q(t.tablename)} t order by to_jsonb(t)::text`)).rows;}
  const roles=(await rec.query(c,"select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls from pg_roles where rolname<>$1 order by rolname",[OWNER])).rows;
  const membership=(await rec.query(c,"select pg_get_userbyid(roleid) role,pg_get_userbyid(member) member,pg_get_userbyid(grantor) grantor,admin_option,inherit_option,set_option from pg_auth_members where roleid<>coalesce((select oid from pg_roles where rolname=$1),0) order by 1,2,3",[OWNER])).rows;
  return {catalog,data,roles,membership,defaultAcl};
}
export async function structure(c,rec){
  const tables=(await rec.query(c,"select relname,pg_get_userbyid(relowner) owner,relrowsecurity,relforcerowsecurity,relacl from pg_class where relnamespace='retention_internal'::regnamespace and relkind='r' order by relname")).rows;
  const functions=(await rec.query(c,"select proname,pg_get_userbyid(proowner) owner,prosecdef,proconfig,proacl from pg_proc where pronamespace='retention_internal'::regnamespace order by proname")).rows;
  const role=(await rec.query(c,"select rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls from pg_roles where rolname=$1",[OWNER])).rows;
  const memberships=(await rec.query(c,"select * from pg_auth_members where roleid=(select oid from pg_roles where rolname=$1) or member=(select oid from pg_roles where rolname=$1)",[OWNER])).rows;
  const policies=(await rec.query(c,"select * from pg_policies where schemaname='retention_internal'")).rows;
  const acl=(await rec.query(c,`select r.rolname,has_schema_privilege(r.oid,'retention_internal','USAGE') usage,has_schema_privilege(r.oid,'retention_internal','CREATE') "create",
 exists(select 1 from pg_class c where c.relnamespace='retention_internal'::regnamespace and (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))) tables,
 exists(select 1 from pg_proc p where p.pronamespace='retention_internal'::regnamespace and has_function_privilege(r.oid,p.oid,'EXECUTE')) functions
 from pg_roles r where not r.rolsuper and r.rolname not in ('pg_read_all_data','pg_write_all_data') and r.rolname<>$1 order by 1`,[OWNER])).rows;
  const schema=(await rec.query(c,"select pg_get_userbyid(nspowner) owner,nspacl from pg_namespace where nspname='retention_internal'")).rows;
  const sequences=(await rec.query(c,"select relname from pg_class where relnamespace='retention_internal'::regnamespace and relkind='S'")).rows;
  const constraints=(await rec.query(c,"select c.conrelid::regclass::text relation,c.conname,pg_get_constraintdef(c.oid) definition from pg_constraint c where c.connamespace='retention_internal'::regnamespace order by 1,2")).rows;const columns=(await rec.query(c,"select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) expression from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='retention_internal'::regnamespace and c.relkind='r' and a.attnum>0 and not a.attisdropped order by 1,a.attnum")).rows;const triggers=(await rec.query(c,"select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='retention_internal'::regnamespace and not t.tgisinternal order by 1,2")).rows;return {tables,functions,role,memberships,policies,acl,schema,sequences,constraints,columns,triggers};
}

export const BUILDER = 'consumer_retention_ddl_builder';
export const ACCEPTED = '26f9a136da4dc484e60a97828803f8c942452c62';
export async function rolePaths(c,rec){
  const matrix=(await rec.query(c,`select r.rolname,r.rolsuper,r.rolinherit,r.rolcanlogin,r.rolbypassrls,
 pg_has_role(r.oid,'pg_read_all_data','MEMBER') read_member,pg_has_role(r.oid,'pg_read_all_data','USAGE') read_inherit,pg_has_role(r.oid,'pg_read_all_data','SET') read_set,
 pg_has_role(r.oid,'pg_write_all_data','MEMBER') write_member,pg_has_role(r.oid,'pg_write_all_data','USAGE') write_inherit,pg_has_role(r.oid,'pg_write_all_data','SET') write_set
 from pg_roles r order by r.rolname`)).rows;
  const edges=(await rec.query(c,'select pg_get_userbyid(roleid) role,pg_get_userbyid(member) member,pg_get_userbyid(grantor) grantor,admin_option,inherit_option,set_option from pg_auth_members order by 1,2,3')).rows;
  const switchBypass=(await rec.query(c,`select a.rolname actor,b.rolname execution_role,
 pg_has_role(a.oid,b.oid,'USAGE') inherited,pg_has_role(a.oid,b.oid,'SET') switchable,
 pg_has_role(b.oid,'pg_read_all_data','USAGE') read_inherit,pg_has_role(b.oid,'pg_write_all_data','USAGE') write_inherit
 from pg_roles a cross join pg_roles b where not a.rolsuper and b.rolbypassrls and pg_has_role(a.oid,b.oid,'SET') order by 1,2`)).rows;
  return {matrix,edges,switchBypass};
}
export const unsafeDataMembers = rows => rows.filter(r=>!r.rolsuper&&!['pg_read_all_data','pg_write_all_data'].includes(r.rolname)&&(r.read_member||r.write_member));
export async function dataRoleBehavior(c,rec){
  const paths=await rolePaths(c,rec),access=[];
  // Catalog membership is a conservative prerequisite, not proof of immediate access.
  // Probe both the native BYPASS actor and each distinct switchable data-bearing BYPASS identity.
  const targets=[{actor:'service_role',execution_role:'service_role'},...paths.switchBypass.filter(r=>r.actor==='authenticated'&&(r.read_inherit||r.write_inherit))];
  for(const target of targets){
    const observation=await isolated(c,rec,async()=>{
      await rec.query(c,`set local session authorization "${target.actor}"`);
      if(target.actor!==target.execution_role)await rec.query(c,`set local role "${target.execution_role}"`);
      const q=async(sql,values=[])=>{await rec.query(c,'SAVEPOINT access_probe');let result;try{const r=await rec.query(c,sql,values);result={rowCount:r.rowCount,rows:r.rows};}catch(e){result={sqlstate:e.code,error:e.message};}await rec.query(c,'ROLLBACK TO SAVEPOINT access_probe');await rec.query(c,'RELEASE SAVEPOINT access_probe');return result;};
      return {target,read:await q('select * from retention_internal.owner_authority_state'),write:await q("insert into retention_internal.owner_authority_state values($1,0,'inactive','unknown',null)",[uuid(999)])};
    });access.push(observation);
  }
  return {pass:unsafeDataMembers(paths.matrix).length===0,observed:paths.matrix,edges:paths.edges,switchBypass:paths.switchBypass,access};
}
export async function predefinedControls(c,rec){
  const before=await privateRows(c,rec),paths=await rolePaths(c,rec);
  rec.check('F1_NORMAL_MEMBERSHIP_SAFE',TABLES.every(t=>before[t].length>0)&&unsafeDataMembers(paths.matrix).length===0,{fixtures:before,paths});
  const capabilities=(await rec.query(c,`select r.rolname,has_schema_privilege(r.oid,'retention_internal','USAGE') usage,has_schema_privilege(r.oid,'retention_internal','CREATE') "create",
 bool_and(has_table_privilege(r.oid,t.oid,'SELECT')) read_all,bool_and(has_table_privilege(r.oid,t.oid,'INSERT,UPDATE,DELETE')) write_all,
 bool_or(has_table_privilege(r.oid,t.oid,'TRUNCATE')) truncate_any,
 exists(select 1 from pg_proc p where p.pronamespace='retention_internal'::regnamespace and has_function_privilege(r.oid,p.oid,'EXECUTE')) functions
 from pg_roles r cross join pg_class t where r.rolname in ('pg_read_all_data','pg_write_all_data') and t.relnamespace='retention_internal'::regnamespace and t.relkind='r' group by r.oid,r.rolname order by 1`)).rows;
  rec.check('F1_BUILTIN_NATURAL_PRIVILEGES',capabilities.length===2&&capabilities.every(v=>v.usage&&!v.create&&!v.truncate_any&&!v.functions&&(v.rolname==='pg_read_all_data'?v.read_all&&!v.write_all:v.write_all&&!v.read_all)),capabilities);
  const results=[];
  for(const role of ['pg_read_all_data','pg_write_all_data',OWNER])for(const table of TABLES){
    const row=before[table][0].row,keys=Object.keys(row).filter(k=>k!=='creation_resource_id');
    const result=await isolated(c,rec,async()=>{
      await rec.query(c,`set local role ${role}`);
      const attempt=async(sql,values=[])=>{await rec.query(c,'SAVEPOINT builtin_probe');let v;try{const a=await rec.query(c,sql,values);v={rowCount:a.rowCount,rows:a.rows};}catch(e){v={sqlstate:e.code,error:e.message};}await rec.query(c,'ROLLBACK TO SAVEPOINT builtin_probe');await rec.query(c,'RELEASE SAVEPOINT builtin_probe');return v;};
      return {role,table,select:await attempt(`select * from retention_internal.${table}`),insert:await attempt(`insert into retention_internal.${table} (${keys}) values(${keys.map((_,i)=>'$'+(i+1))})`,keys.map(k=>row[k])),update:await attempt(`update retention_internal.${table} set ${keys[0]}=${keys[0]}`),delete:await attempt(`delete from retention_internal.${table}`),truncate:role===OWNER?null:await attempt(`truncate retention_internal.${table}`)};
    });results.push(result);
  }
  const invisible=v=>v.sqlstate==='42501'||v.rowCount===0;
  rec.check('F1_NONEMPTY_FORCE_RLS',results.every(v=>invisible(v.select)&&v.insert.sqlstate==='42501'&&invisible(v.update)&&invisible(v.delete)&&(v.truncate===null||v.truncate.sqlstate==='42501')),results);
  rec.check('F1_BUILTIN_ROLLBACK_PARITY',JSON.stringify(before)===JSON.stringify(await privateRows(c,rec)),before);
  const b=await dataRoleBehavior(c,rec);rec.check('F1_DATA_MEMBERSHIP_SAFE',b.pass,b);
}
export async function authorityControls(bin,rec){
  // All clone mutations below live only in this disposable cluster. No target DSN is accepted.
  const cl=await cluster(bin,rec);const opened=[];
  try{
    const base=await baseline(cl,rec);await base.end();cl.clients.delete(base);await cl.admin.end();cl.clients.delete(cl.admin);cl.admin=await cl.connect('template1');
    const sql=fs.readFileSync(path.join(ROOT,'supabase/migrations',MIGRATION),'utf8');
    const previous=child.spawnSync('git',['show',`${ACCEPTED}:supabase/migrations/${MIGRATION}`],{cwd:ROOT,encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}});if(previous.status!==0)throw Error('ACCEPTED_SOURCE_UNAVAILABLE');
    const old=previous.stdout;if(sha(old)!=='2eb6cc69865de7b01b98556de710a72ef0d8e0347755dec9725fb2c5d1d512ea')throw Error('ACCEPTED_SOURCE_HASH');
    const storage=v=>v.slice(v.indexOf('CREATE SCHEMA retention_internal'),v.indexOf('\n',v.indexOf('END $$;',v.indexOf('-- Revoke even grants')))+1);
    rec.check('F2_STORAGE_BODY_IDENTICAL',storage(old)===storage(sql),{acceptedSha256:sha(old),candidateSha256:sha(sql),storageSha256:sha(storage(sql))});
    let ordinal=0,oldStructure,oldRows;
    async function clone(label,fn){
      const name=`retention_authority_${ordinal++}`;await rec.query(cl.admin,`create database ${name} template postgres owner postgres`);
      const admin=await cl.connect(name),native=await cl.connect(name,'postgres');opened.push(admin,native);
      try{return await fn({admin,native,name});}
      finally{
        for(const c of [admin,native]){await c.end();cl.clients.delete(c);}
        await rec.query(cl.admin,`drop database ${name}`);
        for(const role of [OWNER,BUILDER,'retention_ordinary_creator','retention_ddl_manager'])if((await rec.query(cl.admin,'select exists(select 1 from pg_roles where rolname=$1) present',[role])).rows[0].present)await rec.query(cl.admin,`drop role ${role}`);
      }
    }
    const errorOf=async(c,source)=>{try{await apply(c,rec,source);return null;}catch(e){return {code:e.code,message:e.message};}};
    await clone('original',async({admin,native})=>{
      const denied=await errorOf(native,old);rec.check('F2_ORIGINAL_NATIVE_REFUSAL',denied?.code==='42501'&&denied.message==='RETENTION_SEALED_OWNER_REQUIRES_DDL_ADMIN',denied);
      await apply(admin,rec,old);oldStructure=await structure(admin,rec);await graph(admin,rec);oldRows=await privateRows(admin,rec);rec.write('accepted-storage.json',{structure:oldStructure,rows:oldRows});
    });
    await clone('native',async({admin,native})=>{
      const before=await snapshot(admin,rec);await apply(native,rec,sql);const after=await snapshot(admin,rec),st=await structure(admin,rec);
      const absent=(await rec.query(admin,'select not exists(select 1 from pg_roles where rolname=$1) absent',[BUILDER])).rows[0].absent;
      await graph(admin,rec);const rows=await privateRows(admin,rec);
      rec.check('F2_NATIVE_NONSUPER_SUCCESS',absent&&st.memberships.length===0&&JSON.stringify(before)===JSON.stringify(after),{actor:(await rec.query(native,'select current_user,session_user')).rows,structure:st,scopeParity:JSON.stringify(before)===JSON.stringify(after),builderAbsent:absent});
      await predefinedControls(admin,rec);
      rec.check('F2_STORAGE_DIFFERENTIAL',JSON.stringify(oldStructure)===JSON.stringify(st)&&JSON.stringify(oldRows)===JSON.stringify(rows),{oldStructure,st,oldRows,rows});
      const denied=[];for(const text of [`grant ${OWNER} to postgres`,`alter role ${OWNER} login`,'select * from retention_internal.owner_authority_state','drop schema retention_internal cascade']){try{await rec.query(native,text);denied.push({text,accepted:true});}catch(e){denied.push({text,code:e.code,message:e.message});}}
      rec.check('F2_POSTSEAL_ACTOR_DENIED',denied.every(v=>v.code==='42501'),denied);
      const beforeRetry=await snapshot(admin,rec),retry=await errorOf(native,sql),afterRetry=await snapshot(admin,rec);
      rec.check('F2_REENTRY_NO_ADOPTION',retry?.code==='42710'&&JSON.stringify(beforeRetry)===JSON.stringify(afterRetry)&&JSON.stringify(rows)===JSON.stringify(await privateRows(admin,rec))&&!(await rec.query(admin,'select exists(select 1 from pg_roles where rolname=$1) present',[BUILDER])).rows[0].present,{retry,beforeRetry,afterRetry});
    });
    await clone('super',async({admin})=>{await apply(admin,rec,sql);const st=await structure(admin,rec);rec.check('F2_NATIVE_SUPER_COMPATIBLE',st.memberships.length===0&&JSON.stringify(st)===JSON.stringify(oldStructure),st);});
    await clone('different-name',async({admin,name})=>{
      await rec.query(cl.admin,'create role retention_ddl_manager login nosuperuser createrole nocreatedb nobypassrls');await rec.query(cl.admin,`alter database ${name} owner to retention_ddl_manager`);
      const actor=await cl.connect(name,'retention_ddl_manager');try{await apply(actor,rec,sql);}finally{await actor.end();cl.clients.delete(actor);}const st=await structure(admin,rec);rec.check('F2_NATIVE_OTHER_NAME',st.memberships.length===0&&st.role.every(r=>Object.values(r).every(v=>v===false)),st);
    });
    await clone('unauthorized',async({admin,name})=>{
      await rec.query(cl.admin,'create role retention_ordinary_creator login nosuperuser createrole nocreatedb nobypassrls');
      const actor=await cl.connect(name,'retention_ordinary_creator');try{const error=await errorOf(actor,sql);rec.check('F2_ORDINARY_CREATEROLE_DENIED',error?.code==='42501'&&error.message==='RETENTION_DDL_ACTOR_NOT_AUTHORIZED',error);}finally{await actor.end();cl.clients.delete(actor);}
      for(const [id,setup] of [['F2_SERVICE_CREATEROLE_DENIED','set local session authorization service_role'],['F2_SET_ROLE_SPOOF_DENIED','set local role postgres'],['F2_CALLER_SETTING_DENIED',"set local session authorization authenticated;set local app.ddl_admin='true'"]]){
        const result=await isolated(admin,rec,async()=>{if(id==='F2_SERVICE_CREATEROLE_DENIED')await rec.query(admin,'alter role service_role createrole');await rec.query(admin,setup);return rec.reject(admin,sql,[],['42501'],'RETENTION_DDL_ACTOR_NOT_AUTHORIZED');});rec.check(id,result.pass,result);
      }
    });
    const anchors=[['builder-created',`CREATE ROLE ${BUILDER} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;`],['owner-granted',`GRANT ${OWNER} TO %I WITH INHERIT TRUE, SET TRUE',session_user);\nEND $$;`],['storage-built','CREATE TRIGGER immutable_detail BEFORE UPDATE ON retention_internal.detail_grants\n FOR EACH ROW EXECUTE FUNCTION retention_internal.guard_detail_update();'],['builder-dropped',`DROP ROLE ${BUILDER};`]];
    for(const [label,anchor] of anchors)await clone(label,async({admin,native})=>{
      if(!sql.includes(anchor))throw Error('FAULT_ANCHOR_MISSING '+label);const before=await snapshot(admin,rec),mutant=sql.replace(anchor,()=>anchor+'\nSELECT 1/0;'),error=await errorOf(native,mutant),after=await snapshot(admin,rec);
      const roles=(await rec.query(admin,'select rolname from pg_roles where rolname in ($1,$2)',[OWNER,BUILDER])).rows;const schema=(await rec.query(admin,"select to_regnamespace('retention_internal') is null absent")).rows[0].absent;
      rec.check('F2_ROLLBACK_'+label.toUpperCase().replaceAll('-','_'),error?.code==='22012'&&schema&&roles.length===0&&JSON.stringify(before)===JSON.stringify(after),{error,roles,schema,before,after,normalSha256:sha(sql),mutantSha256:sha(mutant)});
    });
    for(const role of [BUILDER,OWNER])await clone('collision',async({admin,native})=>{
      await rec.query(admin,`create role ${role} nologin`);const existing=(await rec.query(admin,'select oid,rolname,rolcanlogin,rolcreaterole from pg_roles where rolname=$1',[role])).rows;
      const before=await snapshot(admin,rec),error=await errorOf(native,sql),after=await snapshot(admin,rec),present=(await rec.query(admin,'select oid,rolname,rolcanlogin,rolcreaterole from pg_roles where rolname=$1',[role])).rows;
      rec.check('F2_COLLISION_'+(role===BUILDER?'BUILDER':'OWNER'),error?.code==='42710'&&JSON.stringify(existing)===JSON.stringify(present)&&JSON.stringify(before)===JSON.stringify(after)&&(await rec.query(admin,"select to_regnamespace('retention_internal') is null absent")).rows[0].absent,{error,existing,present,before,after});
    });
    await clone('unsafe-prerequisite',async({admin,native})=>{
      await rec.query(admin,'grant pg_read_all_data to service_role with inherit true,set true');const before=await snapshot(admin,rec),error=await errorOf(native,sql),after=await snapshot(admin,rec);const result={error,before,after};await rec.query(admin,'revoke pg_read_all_data from service_role');
      rec.check('F1_PREAPPLY_UNSAFE_DENIED',result.error?.code==='42501'&&result.error.message==='RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE'&&JSON.stringify(result.before)===JSON.stringify(result.after),result);
    });
    rec.write('result.json',{status:'PASS',exitCode:0,checks:rec.checks.map(c=>({id:c.id,pass:c.pass}))});
  }finally{await cl.stop();}
}

export async function event(c,rec,n,{owner=1,resource=100,kind='detail_create',tier='free',at=T0,upstream=String(n),...changes}={}){
  const row={event_id:uuid(n),owner_user_id:uuid(owner),source_namespace:'synthetic-local',upstream_event_id:upstream,event_schema_version:'retention-event-v1',policy_version:VERSION,kind,resource_id:resource===null?null:uuid(resource),effective_at:at,received_at:at,tier,validity:'unknown',semantic_digest:'a'.repeat(64),provenance:'unknown',...changes};
  return insert(c,rec,'authority_events',row);
}
export async function insert(c,rec,table,row){const keys=Object.keys(row);return rec.query(c,`insert into retention_internal.${table} (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));}
export function grantRow({resource=100,eventId=10,tier='free',at=T0,until=E14,extensionId=null,extensionAt=null,...extra}={}){
  return {owner_user_id:uuid(1),resource_id:uuid(resource),original_recorded_at:at,acquisition_event_id:uuid(eventId),acquisition_at:at,acquisition_tier:tier,acquisition_kind:'detail_create',retained_until:until,extension_event_id:extensionId===null?null:uuid(extensionId),extension_at:extensionAt,extension_kind:'paid_upgrade',extension_tier:'paid',policy_version:VERSION,revision:0,provenance:'unknown',authority_effective:false,...extra};
}
export function receiptRow({id=30,owner=1,eventId=10,resource=100,...extra}={}){return {receipt_id:uuid(id),owner_user_id:uuid(owner),event_id:uuid(eventId),resource_id:uuid(resource),event_kind:'detail_create',policy_version:VERSION,operation_kind:'detail_create',idempotency_key:'synthetic-'+id,before_revision:0,after_revision:0,proposal_digest:'b'.repeat(64),outcome:'held_inactive',applied:false,...extra};}
export async function graph(c,rec){
  await rec.query(c,"insert into retention_internal.owner_authority_state values($1,0,'inactive','unknown',null),($2,0,'inactive','unknown',null)",[uuid(1),uuid(2)]);
  await event(c,rec,10);await event(c,rec,11,{resource:101,tier:'paid'});await event(c,rec,12,{resource:102});await event(c,rec,13,{kind:'paid_upgrade',tier:'paid',resource:null,at:'2026-03-03T12:00:00.000Z'});await event(c,rec,14,{kind:'entitlement_observation',resource:null});
  await insert(c,rec,'detail_grants',grantRow());await insert(c,rec,'detail_grants',grantRow({resource:101,eventId:11,tier:'paid',until:E180}));await insert(c,rec,'detail_grants',grantRow({resource:102,eventId:12,until:E180,extensionId:13,extensionAt:'2026-03-03T12:00:00.000Z'}));await insert(c,rec,'operation_receipts',receiptRow());
}
export async function isolated(c,rec,fn){await rec.query(c,'BEGIN');try{return await fn();}finally{await rec.query(c,'ROLLBACK');}}
export async function rejectInsert(c,rec,table,row,codes=['23514'],message){return isolated(c,rec,async()=>{const keys=Object.keys(row);return rec.reject(c,`insert into retention_internal.${table} (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row),codes,message);});}
export async function behavior(c,rec,id){
  if(id==='F1_DATA_MEMBERSHIP_SAFE')return dataRoleBehavior(c,rec);
  if(id==='NO_ROLE_MEMBERSHIP'){const s=await structure(c,rec);const denial=await isolated(c,rec,async()=>{await rec.query(c,'set local session authorization authenticated');return rec.reject(c,`set local role ${OWNER}`,[],['42501']);});return {pass:s.memberships.length===0&&denial.pass,observed:s.memberships,denial};}
  if(id==='RUNTIME_DENY'){const s=await structure(c,rec);return {pass:s.acl.every(r=>!r.usage&&!r.create&&!r.tables&&!r.functions),observed:s.acl};}
  if(id==='RLS_ROWS_HIDDEN')return isolated(c,rec,async()=>{await rec.query(c,'grant usage on schema retention_internal to authenticated;grant select on retention_internal.owner_authority_state to authenticated;set local role authenticated');const rows=(await rec.query(c,'select * from retention_internal.owner_authority_state')).rows;return {pass:rows.length===0,observed:rows};});
  if(id==='OWNER_FORCE_DENY')return isolated(c,rec,async()=>{await rec.query(c,`set local role ${OWNER}`);const rows=(await rec.query(c,'select * from retention_internal.owner_authority_state')).rows;return {pass:rows.length===0,observed:rows};});
  const sql={
    INACTIVE_CANNOT_ACTIVATE:"update retention_internal.owner_authority_state set mode='active' where owner_user_id=$1",
    NO_UNVERIFIED_TO_RESOLVED:"update retention_internal.authority_events set provenance='resolved' where event_id=$1",
    TERM_NEVER_SHRINKS:"update retention_internal.detail_grants set retained_until=$2,extension_event_id=null,extension_at=null,revision=revision+1 where resource_id=$1",
    T0_NEVER_REBINDS:"update retention_internal.detail_grants set original_recorded_at=$2,acquisition_at=$2,acquisition_event_id=$3,retained_until=$4,revision=revision+1 where resource_id=$1",
    EVENT_CONTENT_IMMUTABLE:"update retention_internal.authority_events set semantic_digest=$2 where event_id=$1"
  };
  if(id==='NO_UNVERIFIED_TO_RESOLVED')return rejectInsert(c,rec,'authority_events',{event_id:uuid(71),owner_user_id:uuid(1),source_namespace:'synthetic',upstream_event_id:'resolved-probe',event_schema_version:'retention-event-v1',policy_version:VERSION,kind:'entitlement_observation',effective_at:T0,received_at:T0,tier:'free',validity:'unknown',semantic_digest:'a'.repeat(64),provenance:'resolved'});
  if(id==='CROSS_OWNER_REJECT')return rejectInsert(c,rec,'operation_receipts',receiptRow({id:31,owner:2,eventId:13,event_kind:'paid_upgrade',operation_kind:'detail_extend'}),['23503']);
  if(id==='DEADLINE_EXACT')return rejectInsert(c,rec,'detail_grants',grantRow({resource:103,eventId:15,until:'2026-03-15T12:00:00.001Z'}));
  if(id==='DUPLICATE_STORAGE_KEY_REJECT')return isolated(c,rec,async()=>{await rec.query(c,'SAVEPOINT negative_control');let e;try{await event(c,rec,72,{kind:'entitlement_observation',resource:null,upstream:'14'});}catch(x){e=x;}await rec.query(c,'ROLLBACK TO SAVEPOINT negative_control');return {pass:e?.code==='23505',sqlstate:e?.code,message:e?.message};});
  const args={INACTIVE_CANNOT_ACTIVATE:[uuid(1)],TERM_NEVER_SHRINKS:[uuid(102),E14],T0_NEVER_REBINDS:[uuid(100),'2026-03-02T12:00:00.000Z',uuid(16),'2026-03-16T12:00:00.000Z'],EVENT_CONTENT_IMMUTABLE:[uuid(14),'c'.repeat(64)]};
  const message={TERM_NEVER_SHRINKS:'RETENTION_TERM_NEVER_SHRINKS',T0_NEVER_REBINDS:'RETENTION_ANCHOR_IMMUTABLE',EVENT_CONTENT_IMMUTABLE:'RETENTION_CONTENT_IMMUTABLE'};
  return isolated(c,rec,()=>rec.reject(c,sql[id],args[id],['23514'],message[id]));
}
export async function prepareBehavior(c,rec){await event(c,rec,15,{resource:103});await event(c,rec,16,{resource:100,at:'2026-03-02T12:00:00.000Z'});}
export async function compatibility(c,rec){
  const results={};
  await isolated(c,rec,async()=>{
    await rec.query(c,"select set_config('request.jwt.claim.sub',$1,true)",[uuid(910)]);await rec.query(c,'set local role authenticated');
    const state=(await rec.query(c,'select public.get_authenticated_consumer_participation_state() s')).rows[0].s;
    results.legacyCore=state.coreEligible&&state.preparationCompatibility&&!state.onboardingComplete;
    const items=JSON.stringify([{displayName:'SYNTHETIC local food',nutritionSource:'manual',nutrition:{calories:100,protein:5,carbohydrates:15,fat:2,fiber:1}}]);
    const legacy=(await rec.query(c,"select public.create_current_user_meal_record('lunch',$1,$2,'Asia/Taipei','SYNTHETIC retention',null,'manual',$3) s",[T0,'2026-03-01',items])).rows[0].s;
    const sql="select public.create_current_user_meal_record_v2('lunch',$1,$2,$3,'Asia/Taipei','SYNTHETIC retention v2',null,'manual',$4) s";
    const args=[T0,'2026-03-01',uuid(912),items];const a=(await rec.query(c,sql,args)).rows[0].s,b=(await rec.query(c,sql,args)).rows[0].s;
    results.legacyCreated=!!legacy;results.replay=JSON.stringify(a)===JSON.stringify(b);results.exactRows=(await rec.query(c,'select count(*)::int n from public.meal_records')).rows[0].n===2;
  });
  await isolated(c,rec,async()=>{await rec.query(c,"select set_config('request.jwt.claim.sub',$1,true)",[uuid(911)]);await rec.query(c,'set local role authenticated');results.incompleteDenied=(await rec.reject(c,"select public.create_current_user_meal_record('lunch',$1,$2,'UTC','SYNTHETIC denied')",[T0,'2026-03-01'],['42501'])).pass;});
  return results;
}
export async function privateRows(c,rec){const result={};for(const t of TABLES)result[t]=(await rec.query(c,`select to_jsonb(t) row from retention_internal.${t} t order by to_jsonb(t)::text`)).rows;return result;}
export async function negatives(c,rec){
  const check=rec.check,update=async(sql,values=[],codes=['23514'],message)=>isolated(c,rec,()=>rec.reject(c,sql,values,codes,message));
  const all=items=>items.every(x=>x.pass);
  const roles=(await structure(c,rec)).acl.map(r=>r.rolname),denials=[];
  for(const role of roles.filter(r=>r!=='postgres')){
    for(const sql of ['select * from retention_internal.owner_authority_state',`insert into retention_internal.owner_authority_state values('${uuid(9)}',0,'inactive','unknown',null)`,'update retention_internal.owner_authority_state set revision=1','delete from retention_internal.owner_authority_state','truncate retention_internal.owner_authority_state','select retention_internal.reject_content_update()','select retention_internal.guard_detail_update()']){
      denials.push(await isolated(c,rec,async()=>{await rec.query(c,`set local session authorization "${role.replaceAll('"','""')}"`);return rec.reject(c,sql,[],['42501']);}));
    }
  }
  check('N01',all(denials)&&denials.length>0,{roles,denials});
  const escalation=[];for(const role of roles.filter(r=>r!=='postgres'))for(const sql of [`set local role ${OWNER}`,`grant ${OWNER} to "${role}"`,'create schema retention_unauthorized','create table retention_internal.unauthorized(id int)',"create function retention_internal.unauthorized() returns int language sql as 'select 1'"])escalation.push(await isolated(c,rec,async()=>{await rec.query(c,`set local session authorization "${role}"`);return rec.reject(c,sql,[],['42501']);}));
  check('N02',all(escalation),escalation);
  const inactive=[];for(const [table,col,value] of [['owner_authority_state','mode',"'active'"],['owner_authority_state','coverage',"'resolved'"],['owner_authority_state','producer_binding',"'trusted'"],['detail_grants','provenance',"'resolved'"],['detail_grants','authority_effective','true'],['operation_receipts','applied','true']])inactive.push(await update(`update retention_internal.${table} set ${col}=${value}`));
  check('N03',all(inactive),inactive);
  const wrong=[];for(const changes of [{owner_user_id:uuid(2)},{resource_id:uuid(104)},{acquisition_event_id:uuid(14)},{acquisition_kind:'paid_upgrade'},{acquisition_tier:'paid',retained_until:E180},{original_recorded_at:'2026-03-02T12:00:00.000Z',acquisition_at:'2026-03-02T12:00:00.000Z',retained_until:'2026-03-16T12:00:00.000Z'}])wrong.push(await rejectInsert(c,rec,'detail_grants',grantRow({resource:103,eventId:15,...changes}),['23503','23514']));
  wrong.push(await rejectInsert(c,rec,'operation_receipts',receiptRow({id:32,resource:104}),['23503']));check('N04',all(wrong),wrong);
  const shape=[];for(const [col,value] of [['source_namespace',' '],['upstream_event_id',''],['event_schema_version',''],['policy_version','unknown'],['semantic_digest','not-a-sha'],['tier','premium'],['validity','resolved']])shape.push(await isolated(c,rec,async()=>{await rec.query(c,'SAVEPOINT negative_control');let error;try{await event(c,rec,70,{kind:'entitlement_observation',resource:null,[col]:value});}catch(e){error=e;}await rec.query(c,'ROLLBACK TO SAVEPOINT negative_control');return {pass:error?.code==='23514',sqlstate:error?.code,constraint:error?.constraint};}));check('N05',all(shape),shape);
  const times=[];for(const value of ['not-a-time','2026-02-30T12:00:00Z','infinity','0001-01-01 BC','10000-01-01T00:00:00Z','2026-03-01T12:00:00.000001Z'])times.push(await isolated(c,rec,async()=>{await rec.query(c,'SAVEPOINT negative_control');let error;try{await event(c,rec,70,{kind:'entitlement_observation',resource:null,at:value});}catch(e){error=e;}await rec.query(c,'ROLLBACK TO SAVEPOINT negative_control');return {pass:['23514','22007','22008'].includes(error?.code),sqlstate:error?.code,message:error?.message};}));times.push(await rejectInsert(c,rec,'detail_grants',grantRow({resource:103,eventId:15,acquisition_at:'2026-03-01T12:00:00.001Z'})));check('N06',all(times),{times,rawOffsetAuthority:false});
  const deadlines=[];for(const until of ['2026-03-15T12:00:00.001Z','2026-03-15T12:00:00.000Z','2026-08-30T12:00:00.000Z','2026-03-15T11:00:00.000Z'])deadlines.push(await rejectInsert(c,rec,'detail_grants',grantRow({resource:103,eventId:15,tier:until===E14?'paid':'free',until})));check('N07',all(deadlines),deadlines);
  const extension=[];await event(c,rec,81,{owner:2,kind:'paid_upgrade',tier:'paid',resource:null,at:'2026-03-03T12:00:00.000Z'});extension.push(await rejectInsert(c,rec,'detail_grants',grantRow({resource:103,eventId:15,until:E180,extensionId:81,extensionAt:'2026-03-03T12:00:00.000Z'}),['23503']));
  for(const at of [E14,'2026-03-16T12:00:00.000Z','2026-02-28T12:00:00.000Z'])extension.push(await isolated(c,rec,async()=>{await event(c,rec,80,{kind:'paid_upgrade',tier:'paid',resource:null,at});const row=grantRow({resource:103,eventId:15,until:E180,extensionId:80,extensionAt:at});const keys=Object.keys(row);return rec.reject(c,`insert into retention_internal.detail_grants (${keys}) values(${keys.map((_,i)=>'$'+(i+1))})`,Object.values(row));}));
  for(const changes of [{extension_event_id:null,extension_at:T0},{extension_event_id:uuid(13),extension_at:null},{extension_event_id:uuid(14),extension_at:T0},{owner_user_id:uuid(2),extension_event_id:uuid(13),extension_at:'2026-03-03T12:00:00.000Z'},{acquisition_tier:'paid',extension_event_id:uuid(13),extension_at:'2026-03-03T12:00:00.000Z'}])extension.push(await rejectInsert(c,rec,'detail_grants',grantRow({resource:103,eventId:15,until:E180,...changes}),['23514','23503']));check('N08',all(extension),extension);
  for(const [id,target] of [['N09','TERM_NEVER_SHRINKS'],['N10','T0_NEVER_REBINDS'],['N11','EVENT_CONTENT_IMMUTABLE']]){const b=await behavior(c,rec,target);if(id==='N11'){const extra=await update("update retention_internal.operation_receipts set proposal_digest=$1",['d'.repeat(64)],['23514'],'RETENTION_CONTENT_IMMUTABLE');check(id,b.pass&&extra.pass,{b,extra});}else check(id,b.pass,b);}
  const revision=[];revision.push(await update('update retention_internal.detail_grants set revision=-1'));revision.push(await update('update retention_internal.detail_grants set retained_until=$1,extension_event_id=$2,extension_at=$3 where resource_id=$4',[E180,uuid(13),'2026-03-03T12:00:00.000Z',uuid(100)],['23514'],'RETENTION_REVISION_CONFLICT'));revision.push(await rejectInsert(c,rec,'operation_receipts',receiptRow({id:32,after_revision:1})));check('N12',all(revision),revision);
  const before=await privateRows(c,rec),crashes=[];
  for(const point of ['event','grant','receipt','invalid_grant','invalid_receipt']){await rec.query(c,'BEGIN');try{await event(c,rec,90,{resource:190});if(point!=='event')await insert(c,rec,'detail_grants',grantRow({resource:190,eventId:90,...(point==='invalid_grant'?{until:'2026-03-15T12:00:00.001Z'}:{})}));if(['receipt','invalid_receipt'].includes(point))await insert(c,rec,'operation_receipts',receiptRow({id:90,eventId:90,resource:190,...(point==='invalid_receipt'?{applied:true}:{})}));await rec.query(c,"insert into retention_internal.owner_authority_state values($1,-1,'inactive','unknown',null)",[uuid(99)]);}catch(e){crashes.push({point,sqlstate:e.code,pass:e.code==='23514'});}finally{await rec.query(c,'ROLLBACK');}crashes.at(-1).unchanged=JSON.stringify(before)===JSON.stringify(await privateRows(c,rec));}
  check('N13',all(crashes)&&crashes.every(x=>x.unchanged),crashes);check('IF09',true,crashes);
  let remoteRejected=false;try{options(['--pg-bin','existing','--out',rec.out,'--dsn','postgres://remote.invalid/db']);}catch(e){remoteRejected=e.message.startsWith('LOCAL_ONLY_ARGUMENTS');}
  const ddl=fs.readFileSync(path.join(ROOT,'supabase/migrations',MIGRATION),'utf8').replace(/--[^\n]*/g,'');const noSeeds=!/\b(insert\s+into|delete\s+from|update\s+(public|auth|consumer_internal)\.)/i.test(ddl);check('N14',remoteRejected&&noSeeds,{remoteRejected,noSeeds});
  const faultOut=path.join(rec.out,'setup-fault');const fault=child.spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--pg-bin',path.join(rec.out,'absent-pg-bin'),'--out',faultOut],{encoding:'utf8',timeout:15000});rec.write('setup-fault-command.json',{command:[process.execPath,fileURLToPath(import.meta.url),'--pg-bin',path.join(rec.out,'absent-pg-bin'),'--out',faultOut],exit:fault.status,stdout:fault.stdout,stderr:fault.stderr});check('N15',fault.status===2&&JSON.parse(fs.readFileSync(path.join(faultOut,'result.json'),'utf8')).status==='BLOCKED',{exit:fault.status,output:faultOut});
}
export function classify(e){return e.behavior?1:2;}
export async function unknownBoundary(rec){
  const ts=createRequire(path.join(ROOT,'package.json'))('typescript'),cache=new Map();const moduleRoot=path.join(ROOT,'packages/shared/src/domain/consumer-retention');
  const context=vm.createContext({Date,Intl});
  function load(file){const absolute=path.join(moduleRoot,file+'.ts');if(cache.has(absolute))return cache.get(absolute).exports;const module={exports:{}};cache.set(absolute,module);const source=fs.readFileSync(absolute,'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInContext(`(function(require,module,exports){${code}\n})`,context)(request=>{if(!/^\.\/(types|policy|evaluate)$/.test(request))throw Error('SCOPE_IMPORT');return load(request.slice(2));},module,module.exports);return module.exports;}
  const fact=value=>({binding:{actorId:uuid(1),resourceId:uuid(101),sourceIdentity:'synthetic-held',sourceRevision:'0',factAsOf:T0,provenance:'unknown'},value});
  const input={actorId:uuid(1),resourceId:uuid(101),policyVersion:VERSION,evaluationInstant:T0,resourceKind:'detail',action:{kind:'evaluate'},originalRecordedAt:fact(T0),materialState:fact('present'),protection:fact('unknown'),coreEligibility:fact('unknown'),rightsState:fact('unknown'),currentEntitlement:fact({tier:'paid',validFrom:T0,validUntil:null}),acquiredGrant:fact({kind:'detail',policyVersion:VERSION,originalRecordedAt:T0,acquisition:{eventId:uuid(11),at:T0,tier:'paid'},retainedUntil:E180})};
  const grantUnknown=structuredClone(input);for(const value of Object.values(grantUnknown)){if(value?.binding)value.binding.provenance='resolved';}grantUnknown.acquiredGrant.binding.provenance='unknown';const unknownGrant=load('index').evaluateConsumerRetention(grantUnknown);const before=JSON.stringify(input),a=load('index').evaluateConsumerRetention(input),b=load('index').evaluateConsumerRetention(input);rec.check('IF12',unknownGrant.retentionStatus==='unknown'&&!unknownGrant.purgeAllowed&&unknownGrant.reasons.some(x=>x.code==='PROVENANCE_UNKNOWN'&&x.field==='acquiredGrant')&&a.retentionStatus==='unknown'&&a.visibilityStatus==='unknown'&&!a.purgeAllowed&&a.grantTransitionProposal.kind==='pending'&&a.reasons.some(x=>x.code==='PROVENANCE_UNKNOWN')&&JSON.stringify(a)===JSON.stringify(b)&&before===JSON.stringify(input),{input,a,b,grantUnknown,unknownGrant,sourceHashes:Object.fromEntries(['types','policy','evaluate','index'].map(n=>[n,sha(fs.readFileSync(path.join(moduleRoot,n+'.ts')))]))});
}
export function frozen(rec){
  const git=args=>{const p=child.spawnSync('git',args,{cwd:ROOT,encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}});if(p.status)throw Error(`GIT_READ ${args} ${p.stderr}`);return p.stdout;};
  const candidate=['supabase/migrations/'+MIGRATION,'scripts/consumer-retention-persistence-smoke.mjs','scripts/consumer-retention-persistence-mutations.mjs','docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md'];
  // The accepted R0-A tree remains the frozen reference even after the additive commit.
  const baseline='3b1957e8dc459db6fdaa06bec873c1acc632ae9a';const entries=git(['ls-tree','-r',baseline]).trim().split('\n').map(l=>{const [m,p]=l.split('\t');const [mode,,blob]=m.split(' ');return {path:p,mode,blob};});
  const index=new Map(git(['ls-files','--stage']).trim().split('\n').map(l=>{const [m,p]=l.split('\t');const [mode,blob,stage]=m.split(' ');return [p,{mode,blob,stage}];}));
  const violations=[];for(const e of entries){const i=index.get(e.path);if(!i||i.mode!==e.mode||i.blob!==e.blob||i.stage!=='0')violations.push(e.path+':index');}
  const diff=git(['diff',baseline,'--name-only']);for(const p of diff.trim().split('\n').filter(Boolean))if(!candidate.includes(p))violations.push(p+':tracked');
  const untracked=git(['ls-files','--others','--exclude-standard']).trim().split('\n').filter(Boolean);for(const p of untracked)if(!candidate.includes(p))violations.push(p+':untracked');
  rec.check('IF14',entries.length===3341&&violations.length===0,{baseline,tracked:entries.length,violations,candidate,untracked});rec.check('N16',violations.length===0,{violations});
}
export async function concurrency(cl,c,rec){
  const a=await cl.connect(),b=await cl.connect();await rec.query(a,'BEGIN');await rec.query(b,"BEGIN;set local statement_timeout='8s'");
  await event(a,rec,95,{kind:'entitlement_observation',resource:null,upstream:'concurrent-identity'});
  const attempt=event(b,rec,96,{kind:'entitlement_observation',resource:null,upstream:'concurrent-identity'}).then(()=>({accepted:true}),e=>({sqlstate:e.code}));
  await rec.query(a,'COMMIT');const result=await attempt;await rec.query(b,'ROLLBACK');
  const unique=(await rec.query(c,"select count(*)::int n from retention_internal.authority_events where upstream_event_id='concurrent-identity'")).rows[0].n;
  await rec.query(a,'BEGIN');await rec.query(b,'BEGIN');const first=await rec.query(a,'update retention_internal.detail_grants set revision=revision+1 where resource_id=$1 and revision=0',[uuid(100)]);const next=rec.query(b,'update retention_internal.detail_grants set revision=revision+1 where resource_id=$1 and revision=0',[uuid(100)]);await rec.query(a,'COMMIT');const second=await next;await rec.query(b,'COMMIT');
  await event(c,rec,17,{resource:104});
  const keyResults=[];
  for(const table of ['detail_grants','operation_receipts']){
    await rec.query(a,'BEGIN');await rec.query(b,"BEGIN;set local statement_timeout='8s'");
    const row=table==='detail_grants'?grantRow({resource:104,eventId:17}):receiptRow({id:97,eventId:13,resource:104,event_kind:'paid_upgrade',operation_kind:'detail_extend',idempotency_key:'concurrent-receipt'});
    await insert(a,rec,table,row);
    const competing=insert(b,rec,table,table==='operation_receipts'?{...row,receipt_id:uuid(98)}:row).then(()=>({accepted:true}),e=>({sqlstate:e.code}));
    await rec.query(a,'COMMIT');const observed=await competing;await rec.query(b,'ROLLBACK');
    const count=(await rec.query(c,`select count(*)::int n from retention_internal.${table} where resource_id=$1`,[uuid(104)])).rows[0].n;
    keyResults.push({table,observed,count});
  }
  rec.check('IF10',result.sqlstate==='23505'&&unique===1&&first.rowCount===1&&second.rowCount===0&&keyResults.every(r=>r.observed.sqlstate==='23505'&&r.count===1),{result,unique,first:first.rowCount,second:second.rowCount,keyResults,boundary:'operator SQL CAS only; no runtime writer'});
}
export async function runSmoke({bin,out}){
  const rec=recorder(out);let cl;
  try{
    cl=await cluster(bin,rec);const db=await baseline(cl,rec);await apply(db,rec);rec.check('IF01',true,{migrations:143,actor:'native postgres NOSUPERUSER / database owner / CREATEROLE'});
    const deniedDdl=await isolated(cl.admin,rec,async()=>{await rec.query(cl.admin,'set local session authorization service_role');return rec.reject(cl.admin,fs.readFileSync(path.join(ROOT,'supabase/migrations',MIGRATION),'utf8'),[],['42501'],'RETENTION_DDL_ACTOR_NOT_AUTHORIZED');});rec.check('NONADMIN_DDL_DENIED',deniedDdl.pass,deniedDdl);const normalStructure=await structure(cl.admin,rec);const beforeRows=await privateRows(cl.admin,rec);rec.check('IF03',Object.values(beforeRows).every(v=>!v.length),beforeRows);
    rec.check('IF04',normalStructure.tables.length===4&&normalStructure.tables.every(t=>t.owner===OWNER&&t.relrowsecurity&&t.relforcerowsecurity)&&normalStructure.functions.length===2&&normalStructure.functions.every(f=>f.owner===OWNER&&!f.prosecdef&&f.proconfig.includes('search_path=""'))&&normalStructure.role.length===1&&Object.values(normalStructure.role[0]).every(v=>v===false)&&normalStructure.memberships.length===0&&normalStructure.policies.length===0&&normalStructure.acl.every(r=>!r.usage&&!r.create&&!r.tables&&!r.functions)&&normalStructure.schema[0].owner===OWNER&&!normalStructure.sequences.length,normalStructure);
    await graph(cl.admin,rec);await prepareBehavior(cl.admin,rec);await predefinedControls(cl.admin,rec);
    const rows=await privateRows(cl.admin,rec);rec.check('IF05',rows.detail_grants.length===3&&rows.detail_grants.every(r=>r.row.provenance==='unknown'&&!r.row.authority_effective)&&rows.operation_receipts.every(r=>!r.row.applied),rows);
    // A normal valid resource must be insertable before its corruption probes.
    await isolated(cl.admin,rec,()=>insert(cl.admin,rec,'detail_grants',grantRow({resource:103,eventId:15})));rec.check('IF06',true,{validUnusedResource:103,rows});
    await isolated(cl.admin,rec,async()=>{await rec.query(cl.admin,"set local timezone='America/New_York'");await rec.query(cl.admin,'update retention_internal.detail_grants set retained_until=$1,extension_event_id=$2,extension_at=$3,revision=revision+1 where resource_id=$4',[E180,uuid(13),'2026-03-03T12:00:00.000Z',uuid(100)]);const row=(await rec.query(cl.admin,'select retained_until-original_recorded_at term,extract(epoch from retained_until-original_recorded_at) seconds from retention_internal.detail_grants where resource_id=$1',[uuid(100)])).rows[0];rec.check('IF07',Number(row.seconds)===15552000,row);});
    const ev=await behavior(cl.admin,rec,'DUPLICATE_STORAGE_KEY_REJECT'),receipt=await rejectInsert(cl.admin,rec,'operation_receipts',receiptRow({id:33}),['23505']);rec.check('IF08',ev.pass&&receipt.pass,{ev,receipt});
    for(const id of ['RUNTIME_DENY','RLS_ROWS_HIDDEN','OWNER_FORCE_DENY','NO_ROLE_MEMBERSHIP','INACTIVE_CANNOT_ACTIVATE','NO_UNVERIFIED_TO_RESOLVED','CROSS_OWNER_REJECT','DEADLINE_EXACT','TERM_NEVER_SHRINKS','T0_NEVER_REBINDS','EVENT_CONTENT_IMMUTABLE']){const result=await behavior(cl.admin,rec,id);rec.check(id,result.pass,result);}
    await negatives(cl.admin,rec);await concurrency(cl,cl.admin,rec);await unknownBoundary(rec);await cl.stop();cl=null;
    const upgrade=recorder(path.join(out,'upgrade'));cl=await cluster(bin,upgrade);const upgradeDb=await baseline(cl,upgrade,{legacy:true});const compatibilityBefore=await compatibility(cl.admin,upgrade),before=await snapshot(cl.admin,upgrade);upgrade.write('before.json',before);
    await apply(upgradeDb,upgrade);const after=await snapshot(cl.admin,upgrade),compatibilityAfter=await compatibility(cl.admin,upgrade);upgrade.write('after.json',after);
    const upgradeStructure=await structure(cl.admin,upgrade);rec.check('IF02',JSON.stringify(before)===JSON.stringify(after)&&JSON.stringify(normalStructure)===JSON.stringify(upgradeStructure),{catalogDataParity:JSON.stringify(before)===JSON.stringify(after),newStructureParity:JSON.stringify(normalStructure)===JSON.stringify(upgradeStructure)});
    const empty=await privateRows(cl.admin,upgrade);rec.check('IF11',JSON.stringify(compatibilityBefore)===JSON.stringify(compatibilityAfter)&&Object.values(compatibilityAfter).every(Boolean)&&Object.values(empty).every(v=>!v.length),{compatibilityBefore,compatibilityAfter,empty});
    await cl.stop();cl=null;
    const failed=recorder(path.join(out,'ddl-rollback'));cl=await cluster(bin,failed);const failedDb=await baseline(cl,failed);const sql=fs.readFileSync(path.join(ROOT,'supabase/migrations',MIGRATION),'utf8').replace('COMMIT;','SELECT 1/0;\nCOMMIT;');let error;try{await apply(failedDb,failed,sql);}catch(e){error=e;}
    const absence=(await failed.query(cl.admin,"select to_regnamespace('retention_internal') is null schema_absent,not exists(select 1 from pg_roles where rolname=$1) role_absent",[OWNER])).rows[0];rec.check('IF13',error?.code==='22012'&&absence.schema_absent&&absence.role_absent,{sqlstate:error?.code,absence});await cl.stop();cl=null;
    await authorityControls(bin,recorder(path.join(out,'authority-controls')));frozen(rec);const successes=rec.checks.filter(c=>/^IF[0-9]{2}$/.test(c.id)),negativeChecks=rec.checks.filter(c=>/^N[0-9]{2}$/.test(c.id));if(successes.length!==14||negativeChecks.length!==16||[...successes,...negativeChecks].some(c=>!c.pass))throw Error('REQUIRED_GATE_INVENTORY');rec.write('result.json',{status:'PASS',exitCode:0,successes:successes.length,negatives:negativeChecks.length,checks:rec.checks.map(c=>({id:c.id,pass:c.pass}))});return 0;
  }catch(e){const exitCode=classify(e);rec.write('result.json',{status:'BLOCKED',exitCode,error:e.message,stack:e.stack});console.error(e.stack);return exitCode;}finally{if(cl)await cl.stop();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){let code;try{code=await runSmoke(options());}catch(e){console.error(e.stack);code=2;}process.exitCode=code;}
