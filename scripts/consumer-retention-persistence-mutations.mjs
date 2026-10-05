#!/usr/bin/env node
// Actual candidate SQL mutations; setup errors are BLOCKED, never detections.
import fs from 'node:fs';import path from 'node:path';import child from 'node:child_process';import {fileURLToPath} from 'node:url';
import { ROOT,MIGRATION,OWNER,options,recorder,cluster,baseline,apply,graph,prepareBehavior,behavior,sha,
  installProbe,installHistory,ddlAttempts,captureManifest,persisted,composeExecution,HOSTED_MANIFEST,R0B_VERSION,R0B_NAME,PROBE_PAUSE_LOCK,
  bindingCluster,fixtureClone,execute,validHostedRequest,LOCAL_TEST_ENV,applyR0BHostedDevelopment,migrationSource } from './consumer-retention-persistence-smoke.mjs';
// Independent process evaluates the freshly saved DB observation, not a saved PASS flag.
const EVALUATOR = String.raw`
const fs=require('node:fs');
try {
 const r=JSON.parse(fs.readFileSync(process.argv[1],'utf8')),id=r.identity;
 let pass;
 if(id==='RUNTIME_DENY')pass=r.observed.every(x=>!x.usage&&!x.create&&!x.tables&&!x.functions);
 else if(id==='RLS_ROWS_HIDDEN'||id==='OWNER_FORCE_DENY')pass=r.observed.length===0;
 else if(id==='F1_DATA_MEMBERSHIP_SAFE'){if(!Array.isArray(r.observed)||!r.observed.length||r.observed.some(x=>typeof x.rolsuper!=='boolean'||typeof x.read_member!=='boolean'||typeof x.write_member!=='boolean'))throw Error('INVALID_ROLE_MATRIX');pass=r.observed.every(x=>x.rolsuper||['pg_read_all_data','pg_write_all_data'].includes(x.rolname)||(!x.write_member&&(!x.read_member||['postgres','cli_login_postgres','supabase_etl_admin','supabase_read_only_user'].includes(x.rolname))));}
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
 ['M04_MEMBERSHIP_LEAK','NO_ROLE_MEMBERSHIP',s=>s+'\n-- Privileged post-apply configuration corruption in a disposable clone.\nGRANT consumer_retention_foundation_owner TO authenticated WITH INHERIT TRUE, SET TRUE;\n'],
 ['M05_INACTIVE_CHECK_REMOVE','INACTIVE_CANNOT_ACTIVATE',s=>s.replace("CONSTRAINT owner_mode_inactive CHECK (mode = 'inactive')",'')],
 ['M06_PROVENANCE_CHECK_REMOVE','NO_UNVERIFIED_TO_RESOLVED',s=>s.replace("CONSTRAINT event_provenance_unknown CHECK (provenance = 'unknown')",'')],
 ['M07_OWNER_FK_REMOVE','CROSS_OWNER_REJECT',s=>s.replace(/ CONSTRAINT receipt_owner_event_fk FOREIGN KEY[^;]*?REFERENCES retention_internal.authority_events\(owner_user_id,event_id,kind,policy_version\),\n/,'')],
 ['M08_DEADLINE_CHECK_REMOVE','DEADLINE_EXACT',s=>s.replace(/,\n CONSTRAINT grant_deadline_exact CHECK \(retained_until = original_recorded_at \+\n   CASE[^;]*?END\)\n/,'\n')],
 ['M09_NONSHRINK_GUARD_REMOVE','TERM_NEVER_SHRINKS',s=>s.replace(/ IF NEW\.retained_until < OLD\.retained_until THEN\n[^;]*?;\n END IF;\n/,'')],
 ['M10_ANCHOR_GUARD_REMOVE','T0_NEVER_REBINDS',s=>s.replace(/ IF ROW\(NEW\.owner_user_id[\s\S]*?RETENTION_ANCHOR_IMMUTABLE[^;]*?;\n END IF;\n/,'')],
 ['M11_EVENT_IMMUTABLE_REMOVE','EVENT_CONTENT_IMMUTABLE',s=>s.replace(/CREATE TRIGGER immutable_event BEFORE UPDATE ON retention_internal.authority_events\n FOR EACH ROW EXECUTE FUNCTION retention_internal.reject_content_update\(\);/,'-- mutation: event guard removed')],
 ['M12_UNIQUE_REMOVE','DUPLICATE_STORAGE_KEY_REJECT',s=>s.replace(' CONSTRAINT event_upstream_unique UNIQUE (owner_user_id, source_namespace, upstream_event_id),\n','')],
 ['M13_DIRECT_BYPASS_READ','F1_DATA_MEMBERSHIP_SAFE',s=>s+'\nGRANT pg_read_all_data TO service_role WITH INHERIT TRUE, SET TRUE;\n'],
 ['M14_DIRECT_BYPASS_WRITE','F1_DATA_MEMBERSHIP_SAFE',s=>s+'\nGRANT pg_write_all_data TO service_role WITH INHERIT TRUE, SET TRUE;\n'],
 ['M15_INDIRECT_BYPASS_READ','F1_DATA_MEMBERSHIP_SAFE',s=>s+'\nCREATE ROLE retention_mutation_bridge NOLOGIN;\nGRANT pg_read_all_data TO retention_mutation_bridge WITH INHERIT TRUE, SET TRUE;\nGRANT retention_mutation_bridge TO service_role WITH INHERIT TRUE, SET TRUE;\n'],
 ['M16_SET_ONLY_LATENT','F1_DATA_MEMBERSHIP_SAFE',s=>s+'\nGRANT pg_read_all_data TO service_role WITH INHERIT FALSE, SET TRUE;\n'],
 ['M17_RUNTIME_SET_BYPASS','F1_DATA_MEMBERSHIP_SAFE',s=>s+'\nCREATE ROLE retention_mutation_bypass NOLOGIN BYPASSRLS;\nGRANT pg_read_all_data TO retention_mutation_bypass WITH INHERIT TRUE, SET TRUE;\nGRANT retention_mutation_bypass TO authenticated WITH INHERIT FALSE, SET TRUE;\n']
];
// R0-B-C1 binding controls. Each control saves its raw observation before an independent
// evaluator process judges it; setup / harness errors are BLOCKED, never detections.
const BINDING_EVALUATOR = String.raw`
const fs=require('node:fs');
try{
 const o=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));let pass;
 const none=p=>p&&p.roles===0&&p.schema===false&&(p.history_rows===null||p.history_rows===0);
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(o.level==='entry')pass=o.result&&o.result.status==='ENTRY_REJECTED'&&o.result.code===o.expected&&o.spawns===0&&o.queries===0&&(o.expected==='TLS_ROOT_NOT_PINNED'?o.connects===1:o.connects===0);
 else if(o.level==='sql')pass=!!o.error&&typeof o.error.message==='string'&&o.error.message.startsWith(o.expected)&&o.ddlAttempts===0&&o.boundary===false&&same(o.persistedBefore,o.persistedAfter)&&o.persistedAfter.roles===0&&o.persistedAfter.schema===o.persistedBefore.schema;
 else if(o.level==='drift')pass=!!o.error&&o.error.message.startsWith('R0B_POST_GUARD_DRIFT')&&o.ddlAttempts>0&&o.boundary===true&&o.paused===true&&none(o.persistedAfter);
 else throw Error('UNKNOWN_LEVEL');
 console.log('CHECK '+o.id+' '+(pass?'PASS':'FAIL'));process.exitCode=pass?0:1;
}catch(e){console.error(e.stack);process.exitCode=2;}
`;
const ENTRY_CONTROLS=[
 ['R0B_E01_CA_HASH','CA_HASH_MISMATCH',(r,t)=>{const f=path.join(t,'not-official-ca.crt');fs.writeFileSync(f,'-----BEGIN CERTIFICATE-----\nnot-the-official-root\n-----END CERTIFICATE-----\n');r.caPath=f;}],
 ['R0B_E02_ROOT_NOT_PINNED','TLS_ROOT_NOT_PINNED',null],
 ['R0B_E03_SSLMODE','TLS_MODE_NOT_VERIFY_FULL',r=>{r.sslmode='require';}],
 ['R0B_E04_ROOTCERT_MISSING','ROOT_CERT_MISSING',r=>{delete r.caPath;}],
 ['R0B_E05_HOST','TARGET_MISMATCH',r=>{r.target.host='aws-0-ap-southeast-1.pooler.supabase.com.invalid';}],
 ['R0B_E06_TENANT','TENANT_MISMATCH',r=>{r.target.user='postgres.notthedevelopmentref';}],
 ['R0B_E07_CLI_BINARY_HASH','CLI_BINARY_MISMATCH',(r,t)=>{const f=path.join(t,'fake-supabase.exe');fs.writeFileSync(f,'not the pinned binary');r.executor='supabase-cli';r.cliPath=f;}],
 ['R0B_E08_ARGV_PUSH','FORBIDDEN_EXECUTOR_ARGUMENT',r=>{r.argv=['db','push'];}],
 ['R0B_E08_ARGV_LINKED','FORBIDDEN_EXECUTOR_ARGUMENT',r=>{r.argv=['db','query','--linked'];}],
 ['R0B_E08_ARGV_PASSWORD','FORBIDDEN_EXECUTOR_ARGUMENT',r=>{r.argv=['db','push','--password','x'];}],
 ['R0B_E08_ARGV_REPAIR','FORBIDDEN_EXECUTOR_ARGUMENT',r=>{r.argv=['migration','repair'];}],
 ['R0B_E09_EXECUTOR_CLI_INCOMPATIBLE','EXECUTOR_CLI_MULTI_STATEMENT_UNSUPPORTED',(r,t,cli)=>{r.executor='supabase-cli';r.cliPath=cli;}],
 ['R0B_E10_MIGRATION_HASH','MIGRATION_HASH_MISMATCH',r=>{r.sourceText=r.sourceText.replace('-- R0-B-C1 binding guard G2','-- R0-B-C1 binding guard G2.');}],
 ['R0B_E11_MANIFEST_TAMPER','MANIFEST_HASH_MISMATCH',r=>{r.manifestText=r.manifestText.replace('"16388"','"16389"');}],
 ['R0B_E12_CONFIRMATION','CONFIRMATION_REQUIRED',r=>{delete r.confirm;}],
 ['R0B_E13_PASSWORD_ARGUMENT','PASSWORD_MUST_COME_FROM_ENV',r=>{r.password='local-placeholder';}],
 ['R0B_E14_PASSWORD_MISSING','PASSWORD_MISSING_FROM_ENV',null],
 ['R0B_E15_EXECUTOR_UNKNOWN','EXECUTOR_NOT_APPROVED',r=>{r.executor='management-api';}]
];
// [id, expected message prefix, options, mutate({admin,native,f,extraRoles,name}) -> {sql?, client?}]
const SQL_CONTROLS=[
 ...['pgbouncer','supabase_auth_admin','dashboard_user','supabase_read_only_user','supabase_etl_admin'].map((role,i)=>[`R0B_S0${i+1}_MARKER_ROLE_${role.toUpperCase()}`,'R0B_PLATFORM_SELECTOR_REQUIRED',{fixture:false},async({admin,extraRoles,source})=>{extraRoles.add(role);await admin.query(`CREATE ROLE ${role} NOLOGIN`);return {sql:source};}]),
 ['R0B_S06_MARKER_HISTORY_SCHEMA','R0B_PLATFORM_SELECTOR_REQUIRED',{fixture:false},async({admin,source})=>{await installHistory(admin,[]);return {sql:source};}],
 ['R0B_S07_MARKER_SUPAUTILS_SETTING','R0B_PLATFORM_SELECTOR_REQUIRED',{fixture:false,databaseSettings:["supautils.reserved_roles = 'r0b_probe'"]},async({source})=>({sql:source})],
 ['R0B_S08_HOSTED_MANIFEST_TAMPER','R0B_HOSTED_MANIFEST_NOT_BOUND',{fixture:'history'},async({source})=>({sql:composeExecution({selector:'hosted-development',manifestText:HOSTED_MANIFEST.replace('"16388"','"16389"'),source})})],
 ['R0B_S09_HOSTED_MANIFEST_ON_LOCAL','R0B_PRESTATE_BINDING_MISMATCH',{fixture:'history'},async({source})=>({sql:composeExecution({selector:'hosted-development',manifestText:HOSTED_MANIFEST,source})})],
 ['R0B_S10_FIXTURE_UNATTESTED','R0B_FIXTURE_NOT_ATTESTED',{fixture:'history'},async({native,source})=>{const m=await captureManifest(native,{source});return {sql:composeExecution({selector:'local-fixture',manifestText:m,nonce:'0'.repeat(32),source})};}],
 ['R0B_S11_FIXTURE_NONSUPER_ATTESTATION','R0B_FIXTURE_NOT_ATTESTED',{fixture:true},async({admin,f,source})=>{await admin.query('ALTER TABLE tastkind_r0b_fixture.attestation OWNER TO postgres');return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S12_FIXTURE_NONCE_MISMATCH','R0B_FIXTURE_NOT_ATTESTED',{fixture:true},async({f,source})=>({sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:'f'.repeat(32),source})})],
 ['R0B_S13_FIXTURE_ON_PLATFORM','R0B_FIXTURE_ON_PLATFORM',{fixture:true},async({admin,f,extraRoles,source})=>{extraRoles.add('pgbouncer');await admin.query('CREATE ROLE pgbouncer NOLOGIN');return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S14_BINDINGS_WITHOUT_SELECTOR','R0B_SELECTOR_MISSING_WITH_BINDINGS',{fixture:true},async({f,source})=>({sql:composeExecution({selector:null,manifestText:f.manifestText,source})})],
 ['R0B_S15_SELECTOR_INVALID','R0B_SELECTOR_INVALID',{fixture:true},async({f,source})=>({sql:composeExecution({selector:'production',manifestText:f.manifestText,source})})],
 ['R0B_S16_SET_ROLE_ACTOR','RETENTION_DDL_ACTOR_NOT_AUTHORIZED',{fixture:true},async({admin,f,source})=>{await admin.query('SET ROLE postgres');return {client:admin,sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S17_OWNER_WITHOUT_CREATEROLE','RETENTION_DDL_ACTOR_NOT_AUTHORIZED',{fixture:true,restore:'ALTER ROLE postgres CREATEROLE'},async({admin,f,source})=>{await admin.query('ALTER ROLE postgres NOCREATEROLE');return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S18_NONOWNER_CREATEROLE','RETENTION_DDL_ACTOR_NOT_AUTHORIZED',{fixture:true},async({admin,open,f,extraRoles,source})=>{extraRoles.add('r0b_other_creator');await admin.query('CREATE ROLE r0b_other_creator LOGIN CREATEROLE');return {client:await open('r0b_other_creator'),sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S19_ROLE_OID_DRIFT','R0B_PRESTATE_BINDING_MISMATCH ROLES',{fixture:true,preRoles:['r0b_bound_probe']},async({admin,f,source})=>{await admin.query('DROP ROLE r0b_bound_probe');await admin.query('CREATE ROLE r0b_bound_probe NOLOGIN');return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S20_EXTRA_ROLE','R0B_PRESTATE_BINDING_MISMATCH ROLES',{fixture:true},async({admin,f,extraRoles,source})=>{extraRoles.add('r0b_extra_probe');await admin.query('CREATE ROLE r0b_extra_probe NOLOGIN');return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S21_MISSING_ROLE','R0B_PRESTATE_BINDING_MISMATCH ROLES',{fixture:true,preRoles:['r0b_bound_probe']},async({admin,f,source})=>{await admin.query('DROP ROLE r0b_bound_probe');return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S22_EDGE_OPTION','R0B_PRESTATE_BINDING_MISMATCH MEMBERSHIPS',{fixture:true,preRoles:['r0b_edge_parent','r0b_edge_child'],preSql:'GRANT r0b_edge_parent TO r0b_edge_child WITH INHERIT FALSE, SET FALSE'},async({admin,f,source})=>{await admin.query('GRANT r0b_edge_parent TO r0b_edge_child WITH SET TRUE');return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S23_EDGE_GRANTOR','R0B_PRESTATE_BINDING_MISMATCH MEMBERSHIPS',{fixture:true,preRoles:['r0b_edge_parent','r0b_edge_child'],preSql:'GRANT r0b_edge_parent TO r0b_edge_child WITH INHERIT FALSE, SET FALSE;GRANT r0b_edge_parent TO postgres WITH ADMIN OPTION, INHERIT FALSE, SET FALSE'},async({admin,f,source})=>{await admin.query('GRANT r0b_edge_parent TO r0b_edge_child WITH INHERIT FALSE, SET FALSE GRANTED BY postgres');return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S24_FUNCTION_DEFINITION','R0B_PRESTATE_BINDING_MISMATCH FUNCTIONS',{fixture:true},async({admin,f,source})=>{await admin.query(`ALTER FUNCTION ${boundFunction(f)} COST 9999`);return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S25_FUNCTION_OWNER','R0B_PRESTATE_BINDING_MISMATCH FUNCTIONS',{fixture:true},async({admin,f,source})=>{await admin.query(`ALTER FUNCTION ${boundFunction(f)} OWNER TO service_role`);return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S26_FUNCTION_ACL','R0B_PRESTATE_BINDING_MISMATCH FUNCTIONS',{fixture:true},async({admin,f,source})=>{await admin.query(`GRANT EXECUTE ON FUNCTION ${boundFunction(f)} TO supabase_storage_admin`);return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S27_FUNCTION_SEARCH_PATH','R0B_PRESTATE_BINDING_MISMATCH FUNCTIONS',{fixture:true},async({admin,f,source})=>{await admin.query(`ALTER FUNCTION ${boundFunction(f)} SET search_path = public`);return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S28_FUNCTION_SECURITY','R0B_PRESTATE_BINDING_MISMATCH FUNCTIONS',{fixture:true},async({admin,f,source})=>{const fn=JSON.parse(f.manifestText).functions.find(x=>!x.missing&&x.schema==='public');await admin.query(`ALTER FUNCTION ${boundFunction(f)} ${fn.security_definer?'SECURITY INVOKER':'SECURITY DEFINER'}`);return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S29_TRIGGER_DISABLED','R0B_PRESTATE_BINDING_MISMATCH TABLE_HOOKS_DISABLED',{fixture:true},async({admin,f,source})=>{const t=boundTrigger(f);await admin.query(`ALTER TABLE "${t.schema}"."${t.table}" DISABLE TRIGGER "${t.trigger}"`);return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S30_TRIGGER_REPLACED','R0B_PRESTATE_BINDING_MISMATCH TABLE_HOOKS',{fixture:true},async({admin,f,source})=>{const t=boundTrigger(f);await admin.query(`ALTER TRIGGER "${t.trigger}" ON "${t.schema}"."${t.table}" RENAME TO "${t.trigger}_r0b_replaced"`);return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S31_HISTORY_EXTRA_VERSION','R0B_PRESTATE_BINDING_MISMATCH HISTORY',{fixture:true},async({admin,f,source})=>{await admin.query("INSERT INTO supabase_migrations.schema_migrations(version) VALUES('20990101000000')");return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S32_HISTORY_TARGET_ROW_PRESENT','R0B_PRESTATE_BINDING_MISMATCH HISTORY',{fixture:true},async({admin,f,source})=>{await admin.query('INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES($1,$2)',[R0B_VERSION,R0B_NAME]);return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S33_HISTORY_COLUMN_TYPE','R0B_PRESTATE_BINDING_MISMATCH HISTORY',{fixture:true},async({admin,f,source})=>{await admin.query('ALTER TABLE supabase_migrations.schema_migrations ALTER COLUMN name TYPE varchar(200)');return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S34_RETENTION_PRESENT','R0B_RETENTION_PRESENT',{fixture:true},async({admin,f,source})=>{await admin.query('CREATE SCHEMA retention_internal');return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})};}],
 ['R0B_S35_SOURCE_PREFIX','R0B_SOURCE_PREFIX',{fixture:true},async({f,source})=>({sql:'SELECT 1;\n'+composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source})})],
 ['R0B_S36_SOURCE_DUPLICATE_HEADER','R0B_SOURCE_CAPTURE',{fixture:true},async({admin,f,source})=>{const nonce='-- R0-B inactive storage only.';await admin.query('UPDATE tastkind_r0b_fixture.attestation SET nonce=$1',[nonce]);return {sql:composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce,source})};}],
 ['R0B_S37_RUNTIME_TO_MANAGEMENT','RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE',{fixture:false,restore:'REVOKE postgres FROM authenticated'},async({admin,source})=>{await admin.query('GRANT postgres TO authenticated WITH INHERIT FALSE, SET FALSE');return {sql:source};}],
 ['R0B_S38_UNAPPROVED_DATA_MEMBER','RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE',{fixture:false},async({admin,extraRoles,source})=>{extraRoles.add('r0b_unapproved_reader');await admin.query('CREATE ROLE r0b_unapproved_reader NOLOGIN');await admin.query('GRANT pg_read_all_data TO r0b_unapproved_reader');return {sql:source};}]
];
const DRIFT_CONTROLS=[
 ['R0B_D01_CONCURRENT_ROLE','r0b_drift_role',async({admin,extraRoles})=>{extraRoles.add('r0b_drift_role');await admin.query('CREATE ROLE r0b_drift_role NOLOGIN');}],
 ['R0B_D02_CONCURRENT_FUNCTION_ACL',null,async({admin,f})=>{await admin.query(`GRANT EXECUTE ON FUNCTION ${boundFunction(f)} TO supabase_realtime_admin`);}]
];
function boundFunction(f){const fn=JSON.parse(f.manifestText).functions.find(x=>!x.missing&&x.schema==='public');if(!fn)throw Error('SETUP_NO_BOUND_FUNCTION');return `"${fn.schema}"."${fn.name}"(${fn.arguments.split(',').map(a=>a.trim()).filter(Boolean).map(a=>a.replace(/\s+DEFAULT\s+.*$/i,'')).join(', ')})`;}
function boundTrigger(f){const t=JSON.parse(f.manifestText).tableHooks.find(x=>!x.absent&&x.triggers&&x.triggers.length);if(!t)throw Error('SETUP_NO_BOUND_TRIGGER');return {schema:t.schema,table:t.table,trigger:t.triggers[0].name};}
const BINDING_IDS=[...ENTRY_CONTROLS.map(c=>c[0]),...SQL_CONTROLS.map(c=>c[0]),...DRIFT_CONTROLS.map(c=>c[0])];
async function evaluateIndependently(dir,observation){
 fs.writeFileSync(path.join(dir,'observation.json'),JSON.stringify(observation,null,2)+'\n');
 const ev=child.spawnSync(process.execPath,['-e',BINDING_EVALUATOR,path.join(dir,'observation.json')],{encoding:'utf8',timeout:10000});
 fs.writeFileSync(path.join(dir,'evaluator.stdout'),ev.stdout??'');fs.writeFileSync(path.join(dir,'evaluator.stderr'),ev.stderr??'');
 fs.writeFileSync(path.join(dir,'evaluator.json'),JSON.stringify({exit:ev.status,evaluatorSha256:sha(BINDING_EVALUATOR)},null,2)+'\n');
 if(![0,1].includes(ev.status))throw Error('BINDING_EVALUATOR_SETUP '+observation.id);
 return ev.status===0;
}
export async function runBindingControls({bin,out,cli,evidence,only}){
 const rec=recorder(out);const results=[];const source=migrationSource();
 const selected=id=>!only||only.includes(id);
 if(!evidence)throw Error('BINDING_CONTROLS_REQUIRE --hosted-evidence');
 // Entry level: no database, no CLI process may be touched.
 for(const [id,expected,mutate] of ENTRY_CONTROLS){
  if(!selected(id))continue;const dir=path.join(out,id);fs.mkdirSync(dir,{recursive:true});
  if(id==='R0B_E09_EXECUTOR_CLI_INCOMPATIBLE'&&!cli)throw Error('BINDING_CONTROLS_REQUIRE --supabase-cli');
  const request=structuredClone(validHostedRequest(evidence,source));if(mutate)mutate(request,dir,cli);
  const env=id==='R0B_E14_PASSWORD_MISSING'?{}:LOCAL_TEST_ENV;let connects=0,queries=0,spawns=0;
  const spawnSync=child.spawnSync,spawn=child.spawn;child.spawnSync=(...a)=>{spawns++;return spawnSync(...a);};child.spawn=(...a)=>{spawns++;return spawn(...a);};
  const clientFactory=()=>{connects++;return {connect:async()=>{},end:async()=>{},on(){},query:async()=>{queries++;throw Error('NO_QUERY_EXPECTED');},connection:{stream:{authorized:true,getPeerCertificate:()=>{const root={fingerprint256:'00:00:00:00',issuerCertificate:null};root.issuerCertificate=root;return {fingerprint256:'AA:AA',issuerCertificate:root};}}}};};
  let result;try{result=await applyR0BHostedDevelopment(request,{clientFactory,env});}finally{child.spawnSync=spawnSync;child.spawn=spawn;}
  const observation={id,level:'entry',expected,result,connects,queries,spawns,requestShape:Object.keys(request).sort()};
  const pass=await evaluateIndependently(dir,observation);results.push({id,pass});rec.check(id,pass,observation);
 }
 const cl=await bindingCluster(bin,rec);
 try{
  for(const [id,expected,options,mutate] of SQL_CONTROLS){
   if(!selected(id))continue;const dir=path.join(out,id);fs.mkdirSync(dir,{recursive:true});
   const observation=await cl.binding(async ctx=>{
    const {admin,native}=ctx;
    for(const r of options.preRoles??[]){ctx.extraRoles.add(r);await admin.query(`CREATE ROLE ${r} NOLOGIN`);}
    if(options.preSql)await admin.query(options.preSql);
    let f=null;if(options.fixture===true)f=await fixtureClone({admin,native});else if(options.fixture==='history'){await installProbe(admin);await installHistory(admin,JSON.parse(HOSTED_MANIFEST).history.versions);}else await installProbe(admin);
    let run;try{run=await mutate({...ctx,f,source});
     const client=run.client??native;const persistedBefore=await persisted(admin);const before=await ddlAttempts(admin);
     const r=await execute(client,run.sql);const after=await ddlAttempts(admin),persistedAfter=await persisted(admin);
     return {id,level:'sql',expected,error:r.error,boundary:r.boundary,notices:r.notices,ddlAttempts:after-before,persistedBefore,persistedAfter,composedSha256:sha(run.sql)};}
    finally{if(options.restore)await admin.query(options.restore).catch(()=>{});await admin.query('RESET ROLE').catch(()=>{});}
   },{label:id,databaseSettings:options.databaseSettings??[]});
   const pass=await evaluateIndependently(dir,observation);results.push({id,pass});rec.check(id,pass,observation);
  }
  for(const [id,,drift] of DRIFT_CONTROLS){
   if(!selected(id))continue;const dir=path.join(out,id);fs.mkdirSync(dir,{recursive:true});
   const observation=await cl.binding(async ctx=>{
    const {admin,open}=ctx;const f=await fixtureClone(ctx);const persistedBefore=await persisted(admin);const before=await ddlAttempts(admin);
    const runner=await open('postgres'),locker=await open('supabase_admin');
    try{
     await locker.query('SELECT pg_catalog.pg_advisory_lock($1)',[PROBE_PAUSE_LOCK]);
     const pending=execute(runner,composeExecution({selector:'local-fixture',manifestText:f.manifestText,nonce:f.nonce,source}));
     let paused=false;for(let i=0;i<200&&!paused;i++){paused=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_locks WHERE locktype='advisory' AND objid=$1 AND NOT granted) w",[PROBE_PAUSE_LOCK])).rows[0].w;if(!paused)await new Promise(r=>setTimeout(r,100));}
     if(paused)await drift({...ctx,f});
     await locker.query('SELECT pg_catalog.pg_advisory_unlock($1)',[PROBE_PAUSE_LOCK]);
     const r=await pending;const after=await ddlAttempts(admin),persistedAfter=await persisted(admin);
     return {id,level:'drift',error:r.error,boundary:r.boundary,notices:r.notices,paused,ddlAttempts:after-before,persistedBefore,persistedAfter};
    }finally{await runner.end().catch(()=>{});await locker.end().catch(()=>{});}
   },{label:id,databaseSettings:["tastkind_probe.pause = 'on'"]});
   const pass=await evaluateIndependently(dir,observation);results.push({id,pass});rec.check(id,pass,observation);
  }
 }finally{await cl.stop();}
 rec.write('binding-result.json',{status:'PASS',controls:results.length,results});
 return results;
}

// R0-B-C1: storage mutants made before COMMIT are rejected by G2 itself. Each raw rejection is recorded,
// then the mutant is rebased onto its own observed post-state digest so the original behavioral
// detector is still exercised. Raw G2 rejection is additional evidence, never a substitute.
const G2_EXPECTED_DETECTION=['M02_RLS_DISABLE','M03_FORCE_RLS_REMOVE','M05_INACTIVE_CHECK_REMOVE','M06_PROVENANCE_CHECK_REMOVE','M07_OWNER_FK_REMOVE','M08_DEADLINE_CHECK_REMOVE','M09_NONSHRINK_GUARD_REMOVE','M10_ANCHOR_GUARD_REMOVE','M11_EVENT_IMMUTABLE_REMOVE','M12_UNIQUE_REMOVE'];
export async function runMutations({bin,out,only,cli,evidence}){
 if(only&&(!Array.isArray(only)||!only.length||only.some(id=>!specs.some(s=>s[0]===id)&&!BINDING_IDS.includes(id))))throw Error('UNKNOWN_LOCAL_MUTATION_SELECTION');
 const rec=recorder(out);rec.write('executed-source-bindings.json',{migrationSha256:sha(fs.readFileSync(path.join(ROOT,'supabase/migrations',MIGRATION))),smokeSha256:sha(fs.readFileSync(path.join(ROOT,'scripts/consumer-retention-persistence-smoke.mjs'))),mutationsSha256:sha(fs.readFileSync(fileURLToPath(import.meta.url)))});let cl;const results=[];
 try{
  cl=await cluster(bin,rec);const db=await baseline(cl,rec);await db.end();cl.clients.delete(db);await cl.admin.end();cl.clients.delete(cl.admin);cl.admin=await cl.connect('template1');
  // The template is an actual complete 142-migration baseline, never candidate results.
  const source=fs.readFileSync(path.join(ROOT,'supabase/migrations',MIGRATION),'utf8');
  async function execute(database,sql,directory,identity){
   const r=recorder(directory);const membersBefore=(await rec.query(cl.admin,'select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members order by 1,2,3')).rows;await rec.query(cl.admin,`create database ${database} template postgres owner postgres`);const operator=await cl.connect(database,'postgres'),admin=await cl.connect(database);
   try{await apply(admin,r,sql);await graph(admin,r);await prepareBehavior(admin,r);const b=await behavior(admin,r,identity);const observation=path.join(directory,'behavior.json');r.write('behavior.json',{identity,...b,sourceSha256:sha(sql)});const evaluation=child.spawnSync(process.execPath,['-e',EVALUATOR,observation],{encoding:'utf8',timeout:10000});fs.writeFileSync(path.join(directory,'evaluator.stdout'),evaluation.stdout??'');fs.writeFileSync(path.join(directory,'evaluator.stderr'),evaluation.stderr??'');r.write('evaluator.json',{command:[process.execPath,'-e',EVALUATOR,observation],exit:evaluation.status,evaluatorSha256:sha(EVALUATOR)});if(![0,1].includes(evaluation.status)||evaluation.status!==(b.pass?0:1))throw Error('EVALUATOR_SETUP_OR_PARITY '+identity);return {...b,processExit:evaluation.status};}
   finally{for(const c of [operator,admin]){await c.end();cl.clients.delete(c);}await rec.query(cl.admin,`drop database ${database}`);if((await rec.query(cl.admin,'select exists(select 1 from pg_roles where rolname=$1) present',[OWNER])).rows[0].present)await rec.query(cl.admin,`drop role ${OWNER}`);for(const role of ['retention_mutation_bridge','retention_mutation_bypass'])if((await rec.query(cl.admin,'select exists(select 1 from pg_roles where rolname=$1) present',[role])).rows[0].present)await rec.query(cl.admin,`drop role ${role}`);await rec.query(cl.admin,'revoke pg_read_all_data,pg_write_all_data from service_role');const membersAfter=(await rec.query(cl.admin,'select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members order by 1,2,3')).rows;r.check('CLONE_MEMBERSHIP_RESTORED',JSON.stringify(membersBefore)===JSON.stringify(membersAfter),{membersBefore,membersAfter});}
  }
  async function g2Probe(database,sql,directory){
   const r=recorder(directory);const membersBefore=(await rec.query(cl.admin,'select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members order by 1,2,3')).rows;await rec.query(cl.admin,`create database ${database} template postgres owner postgres`);const admin=await cl.connect(database);let error=null,p=null;
   try{try{await apply(admin,r,sql);}catch(e){error={code:e.code,message:e.message};}p=await persisted(admin);}
   finally{await admin.end();cl.clients.delete(admin);await rec.query(cl.admin,`drop database ${database}`);for(const role of [OWNER,'consumer_retention_ddl_builder','retention_mutation_bridge','retention_mutation_bypass'])if((await rec.query(cl.admin,'select exists(select 1 from pg_roles where rolname=$1) present',[role])).rows[0].present)await rec.query(cl.admin,`drop role ${role}`);await rec.query(cl.admin,'revoke pg_read_all_data,pg_write_all_data from service_role');
    const membersAfter=(await rec.query(cl.admin,'select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members order by 1,2,3')).rows;r.check('G2_PROBE_MEMBERSHIP_RESTORED',JSON.stringify(membersBefore)===JSON.stringify(membersAfter),{membersBefore,membersAfter});}
   const m=/^R0B_POST_STATE_MISMATCH expected=([0-9a-f]{64}) observed=([0-9a-f]{64})$/.exec(error?.message??'');const v={detected:!!m,expected:m?.[1]??null,observed:m?.[2]??null,error,persisted:p,sourceSha256:sha(sql)};r.write('g2-raw.json',v);return v;
  }
  const g2Raw=[];
  for(let i=0;i<specs.length;i++){
   const [id,identity,mutate]=specs[i];if(only&&!only.includes(id))continue;const dir=path.join(out,id);fs.mkdirSync(dir,{recursive:true});
   const raw=mutate(source);if(raw===source)throw Error('MUTATION_NOT_APPLIED '+id);
   const g2=await g2Probe(`g2_${i}`,raw,path.join(dir,'g2-raw'));g2Raw.push({id,...g2});
   if(g2.error&&!g2.detected)throw Error('G2_PROBE_UNEXPECTED_ERROR '+id+' '+g2.error.message);
   const mutant=g2.detected?raw.split(g2.expected).join(g2.observed):raw;fs.writeFileSync(path.join(dir,'raw-mutant.sql'),raw);
   fs.writeFileSync(path.join(dir,'normal.sql'),source);fs.writeFileSync(path.join(dir,'mutant.sql'),mutant);
   const before=await execute(`normal_${i}`,source,path.join(dir,'normal'),identity);
   if(!before.pass)throw Error('NORMAL_SETUP_BEHAVIOR_FAILED '+id);
   // Save each raw observation before evaluation, so no summary error loses it.
   const after=await execute(`mutant_${i}`,mutant,path.join(dir,'mutant'),identity);
   if(id.startsWith('M1')&&i>=12){const service=after.access.find(x=>x.target.actor==='service_role'),catalog=after.observed.find(x=>x.rolname==='service_role');const explicit={M13_DIRECT_BYPASS_READ:()=>service.read.rowCount===2&&catalog.read_inherit,M14_DIRECT_BYPASS_WRITE:()=>service.write.rowCount===1&&catalog.write_inherit,M15_INDIRECT_BYPASS_READ:()=>service.read.rowCount===2&&after.edges.some(x=>x.role==='retention_mutation_bridge'),M16_SET_ONLY_LATENT:()=>service.read.sqlstate==='42501'&&catalog.read_member&&!catalog.read_inherit&&catalog.read_set,M17_RUNTIME_SET_BYPASS:()=>after.access.some(x=>x.target.actor==='authenticated'&&x.target.execution_role==='retention_mutation_bypass'&&x.read.rowCount===2)};if(!explicit[id]())throw Error('ROLE_PATH_EFFECT_NOT_PROVEN '+id);}
   const result={id,identity,normalExit:before.processExit,mutantExit:after.processExit,normal:before,mutant:after,normalSha256:sha(source),rawMutantSha256:sha(raw),mutantSha256:sha(mutant),g2RawDetected:g2.detected,rebased:mutant!==raw,pass:before.pass&&!after.pass};
   fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(result,null,2)+'\n');results.push(result);rec.check(id,result.pass,result);
  }
  const g2Check=g2Raw.map(x=>({id:x.id,detected:x.detected,expected:G2_EXPECTED_DETECTION.includes(x.id),rolledBack:!!x.persisted&&x.persisted.roles===0&&x.persisted.schema===false}));
  if(g2Raw.length)rec.check('G2_RAW_STORAGE_MUTANTS_REJECTED',g2Check.every(x=>x.detected===x.expected&&(!x.detected||x.rolledBack)),g2Check);
  let binding=[];if(!only||only.some(id=>BINDING_IDS.includes(id)))binding=await runBindingControls({bin,out:path.join(out,'binding'),cli,evidence,only});
  rec.write('result.json',{status:'PASS',exitCode:0,controls:results.length,bindingControls:binding.length,selection:only??'ALL_17_PLUS_BINDING',results,binding,g2Raw:g2Check});return 0;
 }catch(e){rec.write('result.json',{status:'BLOCKED',exitCode:2,error:e.message,stack:e.stack,results});console.error(e.stack);return 2;}finally{if(cl)await cl.stop();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){let code;try{code=await runMutations(options());}catch(e){console.error(e.stack);code=2;}process.exitCode=code;}
