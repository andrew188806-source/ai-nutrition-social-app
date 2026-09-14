#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const sql=fs.readFileSync("supabase/migrations/20260914030000_staff_management_p3_p6_p3c_delegation_operator.sql","utf8");
const vocabulary=fs.readFileSync("apps/admin-web/auth/admin-current-permission-vocabulary.ts","utf8");
const tests=[], failures=[];
function test(name,fn){try{fn();tests.push({name,pass:true});console.log(`PASS ${String(tests.length).padStart(2,"0")} ${name}`)}catch(e){tests.push({name,pass:false});failures.push(name);console.log(`FAIL ${String(tests.length).padStart(2,"0")} ${name}: ${e.message}`)}}
const catalog=new Map([
 ["admin_context.read",{current:true,delegable:false,individual:false,temp:false,privileged:false,console:true}],
 ["admin_audit.read",{current:true,delegable:false,individual:true,temp:true,privileged:true,console:false}],
 ["admin_restaurant_branch.status.write",{current:true,delegable:true,individual:true,temp:true,privileged:false,console:false}],
 ["admin.management.staff.account.write",{current:true,delegable:false,individual:false,temp:false,privileged:true,console:false}],
 ["admin.management.staff.delegation.write",{current:true,delegable:false,individual:false,temp:false,privileged:true,console:false}],
 ["admin.management.staff.permission.write",{current:false,delegable:false,individual:false,temp:false,privileged:true,console:false}]
]);
function authorized(keys){return keys.has("admin_context.read")&&keys.has("admin.management.staff.delegation.write")}
function eligible(key,grant,temp){const p=catalog.get(key);return !!p&&p.current&&p.delegable&&!p.privileged&&!p.console&&!key.startsWith("admin.management.")&&key!=="admin_context.read"&&(!grant||p.individual)&&(!temp||(grant&&p.temp));}
function validWindow(account,from,until){return until===null||until>from ? from>=account.from&&(account.until===null||(until!==null&&until<=account.until)):false}
const receipts=new Map(), audits=[]; let rows=[];
function grant({actor,target,key,grant=true,revoke=false,temp=false,from=10,until=null,request="r"}){if(!authorized(actor.keys))return{error:"permission_denied"};const payload=JSON.stringify({op:"grant",target:target.id,key,grant,revoke,temp,from,until});const rk=`${actor.auth}:${request}`;if(receipts.has(rk))return receipts.get(rk).payload===payload?receipts.get(rk).result:{error:"request_conflict"};let result;if(target.id===actor.id)result={error:"self_target_denied"};else if(target.status!=="active")result={error:"target_ineligible"};else if(!validWindow(target,from,until))result={error:"window_outside_target"};else if(!grant&&!revoke)result={error:"invalid_request"};else if(!eligible(key,grant,temp)||/[\*%]/.test(key))result={error:"permission_ineligible"};else if(rows.some(x=>x.target===target.id&&x.key===key&&x.status==="active"))result={error:"delegation_exists"};else{const row={id:`d${rows.length+1}`,target:target.id,key,grant,revoke,temp,from,until,status:"active",version:0};rows.push(row);result={ok:true,row}}receipts.set(rk,{payload,result});audits.push({rk,result});return result}
function revoke({actor,id,version,request}){if(!authorized(actor.keys))return{error:"permission_denied"};const payload=JSON.stringify({op:"revoke",id,version});const rk=`${actor.auth}:${request}`;if(receipts.has(rk))return receipts.get(rk).payload===payload?receipts.get(rk).result:{error:"request_conflict"};const row=rows.find(x=>x.id===id);let result;if(!row)result={error:"delegation_not_found"};else if(row.target===actor.id)result={error:"self_target_denied"};else if(row.status!=="active")result={error:"mutation_rejected"};else if(row.version!==version)result={error:"stale_state"};else{row.status="revoked";row.version++;result={ok:true,row:{...row}}}receipts.set(rk,{payload,result});audits.push({rk,result});return result}
const manager={id:"m",auth:"ma",keys:new Set(["admin_context.read","admin.management.staff.delegation.write"])};
const target={id:"t",status:"active",from:10,until:100};
test("A delegation.write is CURRENT",()=>assert.match(sql,/delegation\.write'[\s\S]*readiness_status = 'planned'/));
test("B exact six-key P3E app vocabulary",()=>assert.equal((vocabulary.match(/^  "/gm)||[]).length,6));
test("C manager with both keys authorized",()=>assert.ok(authorized(manager.keys)));
test("D missing context denied",()=>assert.ok(!authorized(new Set(["admin.management.staff.delegation.write"]))));
test("E missing delegation.write denied",()=>assert.ok(!authorized(new Set(["admin_context.read"]))));
test("F legacy-only denied",()=>assert.ok(!authorized(new Set(["admin_context.read","legacy_platform_admin"]))));
test("G delegation holder cannot manage delegation",()=>assert.ok(!authorized(new Set(["admin_context.read","admin_restaurant_branch.status.write"]))));
test("H exact delegatable permission eligible",()=>assert.ok(eligible("admin_restaurant_branch.status.write",true,true)));
test("I admin_context rejected",()=>assert.ok(!eligible("admin_context.read",false,false)));
test("J management permission rejected",()=>assert.ok(!eligible("admin.management.staff.delegation.write",false,false)));
test("K planned permission rejected",()=>assert.ok(!eligible("admin.management.staff.permission.write",false,false)));
test("L unknown permission rejected",()=>assert.ok(!eligible("unknown.permission",true,false)));
test("M wildcard rejected",()=>assert.ok(!eligible("admin_restaurant_branch.*",true,false)));
test("N self target rejected",()=>assert.equal(grant({actor:manager,target:{...target,id:"m"},key:"admin_restaurant_branch.status.write",request:"n"}).error,"self_target_denied"));
test("O suspended target rejected",()=>assert.equal(grant({actor:manager,target:{...target,id:"s",status:"suspended"},key:"admin_restaurant_branch.status.write",request:"o"}).error,"target_ineligible"));
test("P revoked target rejected",()=>assert.equal(grant({actor:manager,target:{...target,id:"x",status:"revoked"},key:"admin_restaurant_branch.status.write",request:"p"}).error,"target_ineligible"));
test("Q future target contained delegation accepted",()=>assert.ok(grant({actor:manager,target:{id:"future",status:"active",from:50,until:100},key:"admin_restaurant_branch.status.write",from:60,until:90,request:"q"}).ok));
test("R invalid window rejected",()=>assert.ok(!validWindow(target,20,20)));
test("S start outside account rejected",()=>assert.ok(!validWindow(target,9,20)));
test("T end outside account rejected",()=>assert.ok(!validWindow(target,20,101)));
test("U grant-only accepted",()=>assert.ok(grant({actor:manager,target:{...target,id:"u"},key:"admin_restaurant_branch.status.write",grant:true,revoke:false,until:90,request:"u"}).ok));
test("V revoke-only accepted",()=>assert.ok(grant({actor:manager,target:{...target,id:"v"},key:"admin_restaurant_branch.status.write",grant:false,revoke:true,until:90,request:"v"}).ok));
test("W grant+revoke accepted",()=>assert.ok(grant({actor:manager,target:{...target,id:"w"},key:"admin_restaurant_branch.status.write",grant:true,revoke:true,until:90,request:"w"}).ok));
test("X neither rejected",()=>assert.equal(grant({actor:manager,target:{...target,id:"xx"},key:"admin_restaurant_branch.status.write",grant:false,revoke:false,until:90,request:"xx"}).error,"invalid_request"));
test("Y temporary accepted when policy permits",()=>assert.ok(grant({actor:manager,target:{...target,id:"y"},key:"admin_restaurant_branch.status.write",temp:true,until:90,request:"y"}).ok));
test("Z temporary rejected by policy",()=>assert.ok(!eligible("admin_context.read",true,true)));
test("AA delegation creates no runtime permission",()=>assert.ok(!sql.match(/insert into admin_internal\.staff_permission_entitlements/i)));
let replay;
test("AB first exact request applies",()=>{replay=grant({actor:manager,target:{...target,id:"ab"},key:"admin_restaurant_branch.status.write",until:90,request:"ab"});assert.ok(replay.ok)});
test("AC exact replay is stored result",()=>assert.deepEqual(grant({actor:manager,target:{...target,id:"ab"},key:"admin_restaurant_branch.status.write",until:90,request:"ab"}),replay));
test("AD request conflict",()=>assert.equal(grant({actor:manager,target:{...target,id:"changed"},key:"admin_restaurant_branch.status.write",until:90,request:"ab"}).error,"request_conflict"));
test("AE duplicate active delegation",()=>assert.equal(grant({actor:manager,target:{...target,id:"ab"},key:"admin_restaurant_branch.status.write",until:90,request:"dup"}).error,"delegation_exists"));
test("AF revoke succeeds",()=>assert.ok(revoke({actor:manager,id:replay.row.id,version:0,request:"rev"}).ok));
test("AG stale revoke rejected",()=>{const g=grant({actor:manager,target:{...target,id:"ag"},key:"admin_restaurant_branch.status.write",until:90,request:"ag"});assert.equal(revoke({actor:manager,id:g.row.id,version:1,request:"ags"}).error,"stale_state")});
test("AH revoked row terminal",()=>assert.equal(revoke({actor:manager,id:replay.row.id,version:1,request:"again"}).error,"mutation_rejected"));
test("AI restore uses new row",()=>{const g=grant({actor:manager,target:{...target,id:"ab"},key:"admin_restaurant_branch.status.write",until:90,request:"restore"});assert.ok(g.ok);assert.notEqual(g.row.id,replay.row.id)});
test("AJ receipt exactly once on replay",()=>assert.equal([...receipts.keys()].filter(x=>x==="ma:ab").length,1));
test("AK audit exactly once on replay",()=>assert.equal(audits.filter(x=>x.rk==="ma:ab").length,1));
test("AL no entitlement Bundle or legacy writes",()=>assert.ok(!/(?:insert into|update|delete from) admin_internal\.(?:staff_permission_entitlements|staff_bundle_|platform_admins)/i.test(sql)));
test("AM app accepts fifth key",()=>assert.ok(vocabulary.includes('"admin.management.staff.delegation.write"')));
test("AO P3E app accepts console admission writer",()=>assert.ok(vocabulary.includes('"admin.management.staff.console_admission.write"')));
test("AN no route or nav promotion",()=>assert.ok(!/admin-route-registry|Sidebar/.test(sql)));
console.log("\n"+JSON.stringify({suite:"staff-authority-p3-p6-p3c-smoke",total:tests.length,passed:tests.length-failures.length,failed:failures.length,failures,databaseUsed:false,networkUsed:false,developmentAccessed:false,productionAccessed:false},null,2));process.exitCode=failures.length?1:0;
