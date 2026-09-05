#!/usr/bin/env node
import fs from 'node:fs';
import cp from 'node:child_process';
import crypto from 'node:crypto';
import {ORIGIN,P1,SUBJECT,PATHS,FILES,read,sources,audit} from './restaurant-owner-availability-ra-2b-p2-contract.mjs';
import {B1_FROZEN_MIGRATIONS,B1_MIGRATION,B1_MIGRATION_SHA256,SECRET_SHAPE} from './restaurant-owner-availability-ra-2b-p1-contract.mjs';
import {discoverRepositoryRoleDefinitions,auditRepositoryRoleDefinitions} from './platform-admin-ra-1c-r1-contract.mjs';
const git=args=>cp.execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const lines=s=>s?s.split(/\r?\n/):[];
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const checks=audit(sources());const check=(name,pass)=>checks.push({name,pass:!!pass});
const head=git(['rev-parse','HEAD']),origin=git(['rev-parse','origin/main']);
const [behind,ahead]=git(['rev-list','--left-right','--count','origin/main...HEAD']).split(/\s+/).map(Number);
const candidate=head===P1;
check('pushed baseline exact',origin===ORIGIN);
check('P1 parent exact',git(['rev-parse',`${P1}^`])===ORIGIN);
check('candidate or exactly one P2 freeze on P1',behind===0 && (candidate?ahead===1:ahead===2 && git(['rev-parse','HEAD^'])===P1 && git(['log','-1','--format=%s'])===SUBJECT));
check('nothing staged',git(['diff','--cached','--name-only'])==='');
const changes=[...new Set([...lines(git(['diff','--name-only',P1])),...lines(git(['ls-files','--others','--exclude-standard']))])].sort();
check('exact application-only successor scope',JSON.stringify(changes)===JSON.stringify(PATHS));
check('frozen worktree clean',candidate||git(['status','--porcelain'])==='');
check('no frozen file changed outside live composition and package additions',changes.every(f=>PATHS.includes(f)) && changes.every(f=>!f.startsWith('supabase/')));
const count=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).length;
check('migration inventory remains 96',count===96);
const definitions=discoverRepositoryRoleDefinitions();
const successors=[
  {role:'restaurant_owner_branch_menu_item_write_authority',migration:B1_FROZEN_MIGRATIONS[0].path},
  {role:'restaurant_owner_branch_menu_item_availability_write_authority',migration:B1_MIGRATION}
];
check('role inventory is the frozen nineteen plus two explicitly pinned Owner authorities',definitions.length===21
  && successors.every(expected=>definitions.filter(d=>d.role===expected.role && d.migration===expected.migration).length===1)
  && auditRepositoryRoleDefinitions(definitions.filter(d=>!successors.some(e=>e.role===d.role))).every(c=>c.pass));
check('historically superseded Meal Buddy candidate surface remains byte-identical to P1',
  git(['diff',P1,'--name-only','--','apps/mobile/features/meal-buddy-candidates'])==='');

for(const item of [{path:B1_MIGRATION,sha256:B1_MIGRATION_SHA256},...B1_FROZEN_MIGRATIONS])check(`frozen migration ${item.path}`,sha(read(item.path))===item.sha256);
const old=JSON.parse(git(['show',`${P1}:package.json`]));const current=JSON.parse(read('package.json'));
check('all existing package commands preserved',Object.entries(old.scripts).every(([k,v])=>current.scripts[k]===v));
const expectedKeys=['','-smoke','-mutations','-development'].map(s=>`test:restaurant-owner-availability-ra-2b-p2${s}`);
check('exactly four P2 package commands added',JSON.stringify(Object.keys(current.scripts).filter(k=>!Object.hasOwn(old.scripts,k)).sort())===JSON.stringify(expectedKeys.sort()));
const stripped={...current,scripts:old.scripts};check('package dependencies and unrelated fields unchanged',JSON.stringify(stripped)===JSON.stringify(old));
const oldViews=git(['show',`${P1}:${FILES.views}`]).replace(/\r\n/g,'\n');
const restored=read(FILES.views).replace('import { RestaurantOwnerAvailabilityControl } from "../menu/RestaurantOwnerAvailabilityControl";\n','')
 .replace('<RestaurantOwnerAvailabilityControl key={offer.id} branchId={offer.branchId} branchMenuItemId={offer.id} branchName={branchNames.get(offer.branchId)??"授權分店"} itemName={item.name}/>','');
check('sold-out live composition and other views byte-preserved',restored.trim()===oldViews.trim());
const frozenPaths=lines(git(['ls-tree','-r','--name-only',P1]));
const touchedFrozen=changes.filter(f=>frozenPaths.includes(f));
check('every frozen predecessor file preserved except approved composition/package',JSON.stringify(touchedFrozen.sort())===JSON.stringify([FILES.views,'package.json'].sort()));
check('secret scan on all successor sources',PATHS.every(p=>!SECRET_SHAPE.test(read(p))));
check('mock pages never render availability control',!read('apps/restaurant-web/components/menu/MenuListPanel.tsx').includes('RestaurantOwnerAvailabilityControl'));
check('old menu page still chooses live control only on supabase runtime',read('apps/restaurant-web/app/restaurant/menu/page.tsx').includes('if (runtime.mode === "supabase")'));
check('diff whitespace clean',cp.spawnSync('git',['diff','--check',P1],{encoding:'utf8'}).status===0);
checks.forEach((c,i)=>console.log(`${c.pass?'PASS':'FAIL'} ${i+1} ${c.name}`));
const failures=checks.filter(c=>!c.pass);
console.log(JSON.stringify({suite:'restaurant-owner-availability-ra-2b-p2-guard',total:checks.length,passed:checks.length-failures.length,failed:failures.length,failures,head,origin,ahead,behind,migrations:count},null,2));
if(failures.length)process.exitCode=1;
