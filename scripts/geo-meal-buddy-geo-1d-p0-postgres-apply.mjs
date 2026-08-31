#!/usr/bin/env node
// GEO-1D-P0 disposable PostgreSQL 17.6 gate. Uses the repository bootstrap and official psql
// transport because the approved WSL runtime contains no Node pg module.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import child from "node:child_process";

const SUITE="geo-meal-buddy-geo-1d-p0-postgres-apply";
const ROOT=process.cwd();const MIGRATIONS=path.join(ROOT,"supabase/migrations");
const BASELINE_LAST="20260902010000_user_ingredient_avoidance_setting_authority.sql";
const TARGET="20260903010000_meal_buddy_card_branch_context_authority.sql";
const argument=(name)=>process.argv.find((value)=>value.startsWith(`${name}=`))?.slice(name.length+1);
const PG_BIN=(argument("--pg-bin")??process.env.GEO1DP0_PG_BIN
  ??"/home/mufan/tastkind-pg17.6/install/bin").trim();
const exe=(name)=>path.join(PG_BIN,process.platform==="win32"?`${name}.exe`:name);
if(!fs.existsSync(exe("initdb"))||!fs.existsSync(exe("postgres"))||!fs.existsSync(exe("psql"))){
  console.log(JSON.stringify({suite:SUITE,status:"skipped",reason:"approved PostgreSQL 17 runtime is unavailable",
    transport:"psql",networkUsed:false,developmentTouched:false,productionTouched:false},null,2));
  process.exit(0);
}
const predecessor=fs.readFileSync(path.join(ROOT,"scripts/recommendation-rec-b-p1-postgres-apply.mjs"),"utf8");
const bootstrapMatch=predecessor.match(/const BOOTSTRAP = `([\s\S]*?)`;\r?\n\r?\nconst ACTIVE/);
if(!bootstrapMatch)throw new Error("PostgreSQL bootstrap authority not found");
const BOOTSTRAP=bootstrapMatch[1];

const checks=[];const failures=[];
function check(name,pass,detail){const item={name,pass:Boolean(pass),...(pass?{}:{detail})};
  checks.push(item);if(!item.pass)failures.push(item);
  console.log(`${item.pass?"PASS":"FAIL"} ${String(checks.length).padStart(2,"0")} ${name}`);}
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();
  server.listen(0,"127.0.0.1",()=>{const {port}=server.address();server.close(()=>resolve(port));});
  server.on("error",reject);});
const workRoot=path.join(process.env.TMPDIR??"/tmp","geo1dp0-apply-gate");
fs.mkdirSync(workRoot,{recursive:true});
for(const entry of fs.readdirSync(workRoot))if(entry.startsWith("geo1dp0-data-"))
  fs.rmSync(path.join(workRoot,entry),{recursive:true,force:true});
const dataDir=path.join(workRoot,`geo1dp0-data-${process.pid}-${Date.now()}`);
const logFile=`${dataDir}.log`;const port=await freePort();let started=false;let applied=0;
let candidateMigrations=[];let unexpectedError=null;

function psql(user,{sql,file,allowFailure=false}){
  const args=["-h","127.0.0.1","-p",String(port),"-U",user,"-d","postgres",
    "-v","ON_ERROR_STOP=1","-X","-q","-A","-t"];
  if(file)args.push("-f",file);else if(sql!==undefined)args.push("-c",sql);
  const result=child.spawnSync(exe("psql"),args,{encoding:"utf8",windowsHide:true,maxBuffer:64*1024*1024});
  const outcome={ok:result.status===0,status:result.status,stdout:(result.stdout??"").trim(),
    stderr:(result.stderr??"").trim()};
  if(!outcome.ok&&!allowFailure)throw Object.assign(new Error(outcome.stderr||outcome.stdout),{code:"PSQL"});
  return outcome;
}
const value=(user,sql)=>psql(user,{sql}).stdout.split(/\r?\n/).filter(Boolean).at(-1)??"";
const json=(user,sql)=>JSON.parse(value(user,sql));

try{
  const init=child.spawnSync(exe("initdb"),["-D",dataDir,"-U","supabase_admin",
    "--encoding=UTF8","--locale=C","-A","trust"],{encoding:"utf8",windowsHide:true});
  if(init.status!==0)throw new Error(init.stderr||init.stdout);
  const start=child.spawnSync(exe("pg_ctl"),["-D",dataDir,"-l",logFile,"-o",
    `-p ${port} -c listen_addresses=127.0.0.1 -c fsync=off -c full_page_writes=off -c synchronous_commit=off`,
    "-w","start"],{encoding:"utf8",windowsHide:true});
  if(start.status!==0)throw new Error(start.stderr||start.stdout);started=true;
  psql("supabase_admin",{sql:BOOTSTRAP});
  const identity=json("postgres",`select pg_catalog.json_build_object(
    'current_user',current_user,'superuser',current_setting('is_superuser'))::text`);
  check("migrations run as postgres without superuser bypass",
    identity.current_user==="postgres"&&identity.superuser==="off",identity);

  const files=fs.readdirSync(MIGRATIONS).filter((file)=>file.endsWith(".sql")).sort();
  for(const file of files){
    const outcome=psql("postgres",{file:path.join(MIGRATIONS,file),allowFailure:true});
    if(!outcome.ok){check(`migration applies through COMMIT: ${file}`,false,
      outcome.stderr.slice(-1200));throw new Error(outcome.stderr);}
    applied++;if(file>BASELINE_LAST)candidateMigrations.push(file);
  }
  check("all 91 migrations apply through COMMIT",applied===91&&applied===files.length,{applied,total:files.length});
  check("round contributes exactly one additive migration",
    JSON.stringify(candidateMigrations)===JSON.stringify([TARGET]),candidateMigrations);

  const table=json("supabase_admin",`select pg_catalog.row_to_json(x)::text from (
    select c.relrowsecurity,c.relforcerowsecurity,r.rolname as owner
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_roles r on r.oid=c.relowner
    where n.nspname='social_internal' and c.relname='meal_buddy_card_branch_context') x`);
  check("binding table is private forced-RLS and sealed-writer-owned",
    table.relrowsecurity&&table.relforcerowsecurity&&table.owner==="meal_buddy_card_write_authority",table);
  const columns=json("supabase_admin",`select coalesce(pg_catalog.json_agg(column_name order by ordinal_position),'[]'::json)
    from information_schema.columns where table_schema='social_internal'
    and table_name='meal_buddy_card_branch_context'`);
  check("binding relation has exact identity columns",
    JSON.stringify(columns)===JSON.stringify(["card_id","restaurant_id","branch_id","created_at"]),columns);
  const role=json("supabase_admin",`select pg_catalog.row_to_json(x)::text from (
    select rolcanlogin,rolinherit,rolbypassrls,rolsuper from pg_catalog.pg_roles
    where rolname='meal_buddy_card_write_authority') x`);
  check("writer remains NOLOGIN NOINHERIT NOBYPASSRLS nonsuperuser",
    !role.rolcanlogin&&!role.rolinherit&&!role.rolbypassrls&&!role.rolsuper,role);
  const acl=json("supabase_admin",`select pg_catalog.row_to_json(x)::text from (select
    has_table_privilege('anon','social_internal.meal_buddy_card_branch_context','select') anon_read,
    has_table_privilege('authenticated','social_internal.meal_buddy_card_branch_context','select') auth_read,
    has_table_privilege('authenticated','social_internal.meal_buddy_card_branch_context','insert') auth_insert,
    has_table_privilege('service_role','social_internal.meal_buddy_card_branch_context','select') service_read,
    has_table_privilege('social_runtime_executor','social_internal.meal_buddy_card_branch_context','select') executor_read,
    has_function_privilege('social_runtime_executor','social_internal.read_meal_buddy_card_branch_context(uuid[])','execute') executor_function,
    has_function_privilege('authenticated','social_internal.read_meal_buddy_card_branch_context(uuid[])','execute') auth_function) x`);
  check("clients and executor have no direct table access",
    !acl.anon_read&&!acl.auth_read&&!acl.auth_insert&&!acl.service_read&&!acl.executor_read,acl);
  check("only server executor reaches the read seam",acl.executor_function&&!acl.auth_function,acl);

  const actor="00000000-0000-4000-8000-0000000000a1";
  psql("supabase_admin",{sql:`insert into auth.users(id,email) values ('${actor}','geo1dp0@example.test');
    insert into public.restaurants(id,name,status) values
      ('geo1dp0-r1','Same restaurant','active'),('geo1dp0-r2','Other restaurant','active');
    insert into public.restaurant_branches(id,restaurant_id,name,status) values
      ('geo1dp0-a','geo1dp0-r1','Branch A','active'),
      ('geo1dp0-b','geo1dp0-r1','Branch B','active'),
      ('geo1dp0-x','geo1dp0-r2','Unrelated','active');
    insert into public.menus(id,restaurant_id,name,status) values
      ('geo1dp0-menu','geo1dp0-r1','Menu','published');
    insert into public.menu_categories(id,menu_id,name) values
      ('geo1dp0-cat','geo1dp0-menu','Category');
    insert into public.menu_items(id,restaurant_id,menu_category_id,name,status) values
      ('geo1dp0-item','geo1dp0-r1','geo1dp0-cat','Shared meal','active');
    insert into public.branch_menu_items(id,restaurant_id,branch_id,menu_item_id,price,availability) values
      ('geo1dp0-offer-a','geo1dp0-r1','geo1dp0-a','geo1dp0-item',100,'available'),
      ('geo1dp0-offer-b','geo1dp0-r1','geo1dp0-b','geo1dp0-item',100,'available');`});
  const invokeSql=(offer,restaurant,branch)=>`select
    social_internal.create_meal_buddy_card_from_recommendation_with_branch_context(
    '${actor}'::uuid,'restaurant','chat_first','${restaurant}',null,(current_date+1)::date,
    'dinner',null,10,10,null,'${offer}','geo1dp0-item','${restaurant}','${branch}')::text`;
  const before=Number(value("supabase_admin",
    `select count(*) from public.meal_buddy_cards where owner_user_id='${actor}'`));
  const createdA=JSON.parse(value("social_runtime_executor",invokeSql("geo1dp0-offer-a","geo1dp0-r1","geo1dp0-a")));
  const cardA=createdA.card.id;
  const bindingA=json("supabase_admin",`select pg_catalog.row_to_json(x)::text from (
    select card_id::text,restaurant_id,branch_id from social_internal.meal_buddy_card_branch_context
    where card_id='${cardA}') x`);
  check("validated Branch A binds exactly Branch A",
    createdA.ok&&bindingA.card_id===cardA&&bindingA.restaurant_id==="geo1dp0-r1"
      &&bindingA.branch_id==="geo1dp0-a",bindingA);
  check("same-restaurant Branch B cannot drift into Branch A binding",
    Number(value("supabase_admin",`select count(*) from social_internal.meal_buddy_card_branch_context
      where card_id='${cardA}'`))===1&&bindingA.branch_id!=="geo1dp0-b");
  const readA=value("social_runtime_executor",`select branch_id from
    social_internal.read_meal_buddy_card_branch_context(array['${cardA}'::uuid])`);
  check("sealed read seam returns exact branch identity",readA==="geo1dp0-a",readA);

  const mismatch=psql("social_runtime_executor",{sql:invokeSql("geo1dp0-offer-a","geo1dp0-r1","geo1dp0-x"),allowFailure:true});
  check("mismatched restaurant branch is rejected",
    !mismatch.ok&&/INVALID_RECOMMENDATION_IDENTITY/.test(mismatch.stderr),mismatch.stderr);
  check("card failure leaves no card or binding residue",
    Number(value("supabase_admin",`select count(*) from public.meal_buddy_cards where owner_user_id='${actor}'`))===before+1
    &&Number(value("supabase_admin","select count(*) from social_internal.meal_buddy_card_branch_context"))===1);

  const duplicate=psql("supabase_admin",{sql:`insert into social_internal.meal_buddy_card_branch_context
    (card_id,restaurant_id,branch_id) values ('${cardA}','geo1dp0-r1','geo1dp0-b')`,allowFailure:true});
  check("duplicate card binding is rejected",!duplicate.ok&&/duplicate key/.test(duplicate.stderr),duplicate.stderr);
  const unrelatedCard=value("supabase_admin",`insert into public.meal_buddy_cards
    (owner_user_id,card_type,intention_type,restaurant_id,dining_date,meal_period,expires_at)
    values ('${actor}','restaurant','chat_first','geo1dp0-r1',current_date+1,'dinner',now()+interval '2 day')
    returning id::text`);
  const unrelated=psql("supabase_admin",{sql:`insert into social_internal.meal_buddy_card_branch_context
    (card_id,restaurant_id,branch_id) values ('${unrelatedCard}','geo1dp0-r2','geo1dp0-x')`,allowFailure:true});
  check("unrelated card and branch restaurant is rejected",!unrelated.ok&&/foreign key/.test(unrelated.stderr),unrelated.stderr);

  psql("supabase_admin",{sql:`create function social_internal.geo1dp0_force_binding_failure()
    returns trigger language plpgsql as $$ begin raise exception 'FORCED_BINDING_FAILURE'; end $$;
    create trigger geo1dp0_force_binding_failure before insert on social_internal.meal_buddy_card_branch_context
    for each row execute function social_internal.geo1dp0_force_binding_failure();`});
  const cardCount=Number(value("supabase_admin","select count(*) from public.meal_buddy_cards"));
  const bindingCount=Number(value("supabase_admin","select count(*) from social_internal.meal_buddy_card_branch_context"));
  const forced=psql("social_runtime_executor",{sql:invokeSql("geo1dp0-offer-b","geo1dp0-r1","geo1dp0-b"),allowFailure:true});
  check("forced binding failure aborts action",!forced.ok&&/FORCED_BINDING_FAILURE/.test(forced.stderr),forced.stderr);
  check("binding failure rolls back nested card insert",
    Number(value("supabase_admin","select count(*) from public.meal_buddy_cards"))===cardCount
    &&Number(value("supabase_admin","select count(*) from social_internal.meal_buddy_card_branch_context"))===bindingCount);
  psql("supabase_admin",{sql:`drop trigger geo1dp0_force_binding_failure
    on social_internal.meal_buddy_card_branch_context;
    drop function social_internal.geo1dp0_force_binding_failure();`});

  const direct=JSON.parse(value("social_runtime_executor",`select
    social_internal.create_meal_buddy_card_from_recommendation_with_branch_context(
    '${actor}'::uuid,'general','chat_first',null,null,(current_date+1)::date,'dinner',null,
    10,10,null,null,null,null,null)::text`));
  const unknown=Number(value("social_runtime_executor",`select count(*) from
    social_internal.read_meal_buddy_card_branch_context(array['${direct.card.id}'::uuid])`));
  check("direct historical-compatible card remains valid and branch-unknown",direct.ok&&unknown===0);
  const listed=JSON.parse(value("social_runtime_executor",
    `select social_internal.list_owned_meal_buddy_cards_with_context('${actor}'::uuid)::text`));
  check("existing non-GEO list reads bound and unbound cards without branch disclosure",
    listed.cards.some((card)=>card.id===cardA)&&listed.cards.some((card)=>card.id===direct.card.id)
    &&listed.cards.every((card)=>!("branch_id" in card)));

  psql("supabase_admin",{sql:"grant authenticated, anon to postgres"});
  const authRead=psql("postgres",{sql:`begin; set local role authenticated;
    select * from social_internal.meal_buddy_card_branch_context; commit`,allowFailure:true});
  const authWrite=psql("postgres",{sql:`begin; set local role authenticated;
    insert into social_internal.meal_buddy_card_branch_context
    (card_id,restaurant_id,branch_id) values ('${direct.card.id}','geo1dp0-r1','geo1dp0-a'); commit`,allowFailure:true});
  check("authenticated client cannot read private binding",!authRead.ok&&/permission denied/.test(authRead.stderr),authRead.stderr);
  check("authenticated client cannot mutate private binding",!authWrite.ok&&/permission denied/.test(authWrite.stderr),authWrite.stderr);
  psql("supabase_admin",{sql:`delete from public.meal_buddy_cards where id='${cardA}'`});
  check("binding is cleaned only when its card is deleted",
    Number(value("supabase_admin",`select count(*) from social_internal.meal_buddy_card_branch_context
      where card_id='${cardA}'`))===0);
}catch(error){
  unexpectedError={name:error.name,code:error.code??null,message:String(error.message).slice(0,1600)};
  if(failures.length===0)check("harness completed without unexpected error",false,unexpectedError);
}finally{
  if(started)child.spawnSync(exe("pg_ctl"),["-D",dataDir,"-m","immediate","-w","stop"],
    {encoding:"utf8",windowsHide:true});
  fs.rmSync(dataDir,{recursive:true,force:true});try{fs.rmSync(logFile,{force:true});}catch{}
}
check("disposable PostgreSQL cluster leaves zero data-directory residue",
  !fs.existsSync(dataDir),fs.existsSync(dataDir)?dataDir:null);
console.log("\n"+JSON.stringify({suite:SUITE,status:failures.length?"failed":"passed",
  total:checks.length,passed:checks.length-failures.length,failed:failures.length,
  failures:failures.map((item)=>item.name),unexpectedError,
  postgres:child.spawnSync(exe("postgres"),["--version"],{encoding:"utf8"}).stdout.trim(),
  transport:"psql",migrationRunner:"postgres non-superuser",appliedMigrations:applied,
  candidateMigrations,networkUsed:false,developmentTouched:false,productionTouched:false},null,2));
if(failures.length)process.exit(1);
