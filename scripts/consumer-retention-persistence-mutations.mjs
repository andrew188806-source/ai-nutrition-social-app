#!/usr/bin/env node
// Actual candidate SQL mutations; setup errors are BLOCKED, never detections.
import fs from 'node:fs';import path from 'node:path';import child from 'node:child_process';import {fileURLToPath} from 'node:url';
import { ROOT,MIGRATION,OWNER,options,recorder,cluster,baseline,apply,graph,prepareBehavior,behavior,sha } from './consumer-retention-persistence-smoke.mjs';
// Independent process evaluates the freshly saved DB observation, not a saved PASS flag.
const EVALUATOR = String.raw`
const fs=require('node:fs');
try {
 const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8')),id=r.identity;
 let pass;
 if(id==='RUNTIME_DENY')pass=r.observed.every(x=>!x.usage&&!x.create&&!x.tables&&!x.functions);
 else if(id==='RLS_ROWS_HIDDEN'||id==='OWNER_FORCE_DENY')pass=r.observed.length===0;
 else if(id==='NO_ROLE_MEMBERSHIP')pass=r.observed.length===0&&r.denial.sqlstate==='42501';
 else {
  const contracts={INACTIVE_CANNOT_ACTIVATE:['23514','owner_mode_inactive'],NO_UNVERIFIED_TO_RESOLVED:['23514','event_provenance_unknown'],CROSS_OWNER_REJECT:['23503','receipt_owner_event_fk'],DEADLINE_EXACT:['23514','grant_deadline_exact'],DUPLICATE_STORAGE_KEY_REJECT:['23505',null],TERM_NEVER_SHRINKS:['23514','RETENTION_TERM_NEVER_SHRINKS'],T0_NEVER_REBINDS:['23514','RETENTION_ANCHOR_IMMUTABLE'],EVENT_CONTENT_IMMUTABLE:['23514','RETENTION_CONTENT_IMMUTABLE']};
  if(!contracts[id])throw Error('UNKNOWN_CONTROL');const [code,label]=contracts[id];
  pass=r.sqlstate===code&&(!label||r.constraint===label||r.message?.includes(label));
 }
 console.log('CHECK '+id+' '+(pass?'PASS':'FAIL'));process.exitCode=pass?0:1;
} catch(e){console.error(e.stack);process.exitCode=2;}
`;
const specs=[
 ['M01_RUNTIME_ACL','RUNTIME_DENY',s=>s.replace('COMMIT;','GRANT USAGE ON SCHEMA retention_internal TO authenticated;\nGRANT SELECT ON retention_internal.owner_authority_state TO authenticated;\nCOMMIT;')],
 ['M02_RLS_DISABLE','RLS_ROWS_HIDDEN',s=>s.replace('ALTER TABLE retention_internal.owner_authority_state ENABLE ROW LEVEL SECURITY;','-- mutation: RLS disabled')],
 ['M03_FORCE_RLS_REMOVE','OWNER_FORCE_DENY',s=>s.replace('ALTER TABLE retention_internal.owner_authority_state FORCE ROW LEVEL SECURITY;','-- mutation: FORCE removed')],
 ['M04_MEMBERSHIP_LEAK','NO_ROLE_MEMBERSHIP',s=>s.replace('REVOKE consumer_retention_foundation_owner FROM postgres;','GRANT consumer_retention_foundation_owner TO authenticated WITH INHERIT TRUE, SET TRUE;\nREVOKE consumer_retention_foundation_owner FROM postgres;')],
 ['M05_INACTIVE_CHECK_REMOVE','INACTIVE_CANNOT_ACTIVATE',s=>s.replace("CONSTRAINT owner_mode_inactive CHECK (mode = 'inactive')",'')],
 ['M06_PROVENANCE_CHECK_REMOVE','NO_UNVERIFIED_TO_RESOLVED',s=>s.replace("CONSTRAINT event_provenance_unknown CHECK (provenance = 'unknown')",'')],
 ['M07_OWNER_FK_REMOVE','CROSS_OWNER_REJECT',s=>s.replace(/ CONSTRAINT receipt_owner_event_fk FOREIGN KEY[^;]*?REFERENCES retention_internal.authority_events\(owner_user_id,event_id,kind,policy_version\),\n/,'')],
 ['M08_DEADLINE_CHECK_REMOVE','DEADLINE_EXACT',s=>s.replace(/,\n CONSTRAINT grant_deadline_exact CHECK \(retained_until = original_recorded_at \+\n   CASE[^;]*?END\)\n/,'\n')],
 ['M09_NONSHRINK_GUARD_REMOVE','TERM_NEVER_SHRINKS',s=>s.replace(/ IF NEW\.retained_until < OLD\.retained_until THEN\n[^;]*?;\n END IF;\n/,'')],
 ['M10_ANCHOR_GUARD_REMOVE','T0_NEVER_REBINDS',s=>s.replace(/ IF ROW\(NEW\.owner_user_id[\s\S]*?RETENTION_ANCHOR_IMMUTABLE[^;]*?;\n END IF;\n/,'')],
 ['M11_EVENT_IMMUTABLE_REMOVE','EVENT_CONTENT_IMMUTABLE',s=>s.replace(/CREATE TRIGGER immutable_event BEFORE UPDATE ON retention_internal.authority_events\n FOR EACH ROW EXECUTE FUNCTION retention_internal.reject_content_update\(\);/,'-- mutation: event guard removed')],
 ['M12_UNIQUE_REMOVE','DUPLICATE_STORAGE_KEY_REJECT',s=>s.replace(' CONSTRAINT event_upstream_unique UNIQUE (owner_user_id, source_namespace, upstream_event_id),\n','')]
];
export async function runMutations({bin,out}){
 const rec=recorder(out);rec.write('executed-source-bindings.json',{migrationSha256:sha(fs.readFileSync(path.join(ROOT,'supabase/migrations',MIGRATION))),smokeSha256:sha(fs.readFileSync(path.join(ROOT,'scripts/consumer-retention-persistence-smoke.mjs'))),mutationsSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))});let cl;const results=[];
 try{
  cl=await cluster(bin,rec);const db=await baseline(cl,rec);await db.end();cl.clients.delete(db);await cl.admin.end();cl.clients.delete(cl.admin);cl.admin=await cl.connect('template1');
  // The template is an actual complete 142-migration baseline, never candidate results.
  const source=fs.readFileSync(path.join(ROOT,'supabase/migrations',MIGRATION),'utf8');
  async function execute(database,sql,directory,identity){
   const r=recorder(directory);await rec.query(cl.admin,`create database ${database} template postgres owner postgres`);const operator=await cl.connect(database,'postgres'),admin=await cl.connect(database);
   try{await apply(admin,r,sql);await graph(admin,r);await prepareBehavior(admin,r);const b=await behavior(admin,r,identity);const observation=path.join(directory,'behavior.json');r.write('behavior.json',{identity,...b,sourceSha256:sha(sql)});const evaluation=child.spawnSync(process.execPath,['-e',EVALUATOR,observation],{encoding:'utf8',timeout:10000});fs.writeFileSync(path.join(directory,'evaluator.stdout'),evaluation.stdout??'');fs.writeFileSync(path.join(directory,'evaluator.stderr'),evaluation.stderr??'');r.write('evaluator.json',{command:[process.execPath,'-e',EVALUATOR,observation],exit:evaluation.status,evaluatorSha256:sha(EVALUATOR)});if(![0,1].includes(evaluation.status)||evaluation.status!==(b.pass?0:1))throw Error('EVALUATOR_SETUP_OR_PARITY '+identity);return {...b,processExit:evaluation.status};}
   finally{for(const c of [operator,admin]){await c.end();cl.clients.delete(c);}await rec.query(cl.admin,`drop database ${database}`);if((await rec.query(cl.admin,'select exists(select 1 from pg_roles where rolname=$1) present',[OWNER])).rows[0].present)await rec.query(cl.admin,`drop role ${OWNER}`);}
  }
  for(let i=0;i<specs.length;i++){
   const [id,identity,mutate]=specs[i],dir=path.join(out,id);fs.mkdirSync(dir,{recursive:true});
   const mutant=mutate(source);if(mutant===source)throw Error('MUTATION_NOT_APPLIED '+id);
   fs.writeFileSync(path.join(dir,'normal.sql'),source);fs.writeFileSync(path.join(dir,'mutant.sql'),mutant);
   const before=await execute(`normal_${i}`,source,path.join(dir,'normal'),identity);
   if(!before.pass)throw Error('NORMAL_SETUP_BEHAVIOR_FAILED '+id);
   // Save each raw observation before evaluation, so no summary error loses it.
   const after=await execute(`mutant_${i}`,mutant,path.join(dir,'mutant'),identity);
   const result={id,identity,normalExit:before.processExit,mutantExit:after.processExit,normal:before,mutant:after,normalSha256:sha(source),mutantSha256:sha(mutant),pass:before.pass&&!after.pass};
   fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2)+'\n');results.push(result);rec.check(id,result.pass,result);
  }
  rec.write('result.json',{status:'PASS',exitCode:0,controls:results.length,results});return 0;
 }catch(e){rec.write('result.json',{status:'BLOCKED',exitCode:2,error:e.message,stack:e.stack,results});console.error(e.stack);return 2;}finally{if(cl)await cl.stop();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){let code;try{code=await runMutations(options());}catch(e){console.error(e.stack);code=2;}process.exitCode=code;}
