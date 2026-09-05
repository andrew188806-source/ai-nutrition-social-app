import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
export const ORIGIN = 'bbe60548ea8e65abce22b4ed330980c4a856d3bb';
export const P1 = 'f699932897dd8493e4d4f510e4cd0562f22e2955';
export const SUBJECT = 'Activate Restaurant Owner availability control';
export const FILES = Object.freeze({
  types: 'apps/restaurant-web/runtime/restaurant-owner-availability.ts',
  client: 'apps/restaurant-web/runtime/restaurant-owner-availability-client.ts',
  repository: 'apps/restaurant-web/repositories/supabase/restaurant-owner-availability-repository.ts',
  runtime: 'apps/restaurant-web/server/restaurant-owner-availability-runtime.ts',
  route: 'apps/restaurant-web/app/api/restaurant/branches/[branchId]/menu-items/[branchMenuItemId]/availability/route.ts',
  component: 'apps/restaurant-web/components/menu/RestaurantOwnerAvailabilityControl.tsx',
  views: 'apps/restaurant-web/components/runtime/LiveRestaurantViews.tsx',
  harness: 'scripts/restaurant-owner-availability-ra-2b-p2-development-acceptance.mjs',
  docs: 'docs/restaurant-owner-availability-ra-2b-p2.md'
});
export const PATHS = Object.freeze([...Object.values(FILES), 'package.json', ...['contract','guard','smoke','mutations'].map(x=>`scripts/restaurant-owner-availability-ra-2b-p2-${x}.mjs`)].sort());
export const read = file => fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
export const sources = () => Object.fromEntries(Object.entries(FILES).map(([k,p])=>[k,read(p)]));
export function audit(s) {
  const checks=[]; const check=(name,pass)=>checks.push({name,pass:!!pass});
  const server=s.runtime+s.repository;
  const browser=s.client+s.component;
  const app=server+browser+s.types+s.route;
  check('canonical claims are the only identity entry',s.runtime.includes('getVerifiedRestaurantClaims()') && !/Bearer|authorization|localStorage|ownerId|userId|callerRole|role\s*===/.test(server));
  check('selected context is only a preview selector',s.runtime.includes('.preview(access.restaurant.id, branchId, branchMenuItemId)') && !/selected.*return.*ready|cookie.*ready/.test(server));
  check('live runtime requires supabase',s.runtime.includes('dataSource !== "supabase"'));
  check('repository is server-only',s.repository.startsWith('import "server-only";') && s.runtime.startsWith('import "server-only";'));
  check('fixed preview and mutation RPCs only',(s.repository.match(/client\.rpc\(/g)||[]).length===2
    && s.repository.includes('client.rpc(RESTAURANT_OWNER_AVAILABILITY_PREVIEW_RPC,')
    && s.repository.includes('client.rpc(RESTAURANT_OWNER_AVAILABILITY_MUTATION_RPC,')
    && s.types.includes('"restaurant_owner_preview_branch_menu_item_availability_v1"')
    && s.types.includes('"restaurant_owner_set_branch_menu_item_availability_v1"'));
  check('no direct table fallback or privileged existence prelookup', !/\.from\s*\(|\.select\s*\(|\.update\s*\(|branch_menu_items/.test(server));
  check('no service role fallback or generic RPC entry',!/service_role|serviceRole|secretKey|rpc\(request|rpc\(body|rpc\(input|rpc\(functionName/.test(app));
  check('browser has no privileged import or credentials',!/server\/|supabase|restaurant_internal|process\.env|repositories\/|sealed|\.rpc\(/i.test(browser));
  check('availability never touches or derives from sold-out',!/soldOut|sold_out|sold-out|SoldOut/.test(app));
  check('route exposes only GET and POST', /export async function GET/.test(s.route) && /export async function POST/.test(s.route) && !/export.*(?:PATCH|PUT|DELETE)/.test(s.route));
  check('route and responses are uncached',s.route.includes('dynamic = "force-dynamic"') && s.route.includes('revalidate = 0') && s.runtime.includes('private, no-store') && s.runtime.includes('Vary: "Cookie"'));
  check('GET and POST reject query authority',(s.runtime.match(/searchParams.keys\(\)/g)||[]).length===2);
  check('GET checks selector echoes',s.runtime.includes('result.branchId !== branchId') && s.runtime.includes('result.branchMenuItemId !== branchMenuItemId'));
  check('POST uses only mutation and canonical target derivation',s.runtime.split('export async function handleRestaurantOwnerAvailabilityMutationRequest')[1].includes('.mutate(branchMenuItemId, input)') && !s.runtime.split('export async function handleRestaurantOwnerAvailabilityMutationRequest')[1].includes('.preview('));
  check('body is stream bounded and JSON only',s.runtime.includes('request.body?.getReader()') && s.runtime.includes('await reader.cancel()') && s.runtime.includes('bytes > RESTAURANT_OWNER_AVAILABILITY_BODY_LIMIT') && s.runtime.includes('application/json'));
  check('version is never numerically coerced or incremented',!/(Number|parseInt|parseFloat|BigInt)\([^)]*(?:[Vv]ersion)|\+\s*(?:current|preview|input|value)\.[^;]*[Vv]ersion|[Vv]ersion\s*(?:\+|\+\+)|[Vv]ersion\s*:\s*\+/.test(app));
  check('browser sends exactly one POST',(s.client.match(/method: "POST"/g)||[]).length===1 && !/retry\(|changeAvailability\(current/.test(s.client));
  check('stale and uncertain use canonical GET',s.client.includes('const preview = await previewAvailability(current.branchId, current.branchMenuItemId)') && s.client.includes('if (state === "stale_state") return { preview,') && s.client.includes('preview.availability === nextAvailability'));
  check('no local success fabricated',!/(?:setPreview\(\{[^}]*state:\s*"ready"|preview:\s*\{[^}]*\.\.\.current)/s.test(browser));
  check('current write state comes only from preview',!/[Aa]vailabilityVersion/.test(s.views) && !/initialAvailability|props\.availability|offer\.availabilityVersion/.test(s.component));
  check('confirmation gates submit',s.component.includes('!confirmationOpen') && s.component.includes('role="alertdialog"') && s.component.includes('props.itemName') && s.component.includes('props.branchName') && s.component.includes('availabilityConsequences[next]'));
  check('same-state and duplicate clicks blocked',s.component.includes('pending.current ||') && s.component.includes('next === preview.availability') && s.client.includes('nextAvailability === current.availability'));
  check('preview failure disables live control',s.component.includes('if (preview.state !== "ready") return') && s.component.includes('<button disabled'));
  check('bounded three-state selector',s.component.includes('AVAILABILITIES.map') && s.component.includes('isAvailability(event.target.value)'));
  check('both independent controls composed only in live view',s.views.includes('<RestaurantOwnerAvailabilityControl key={offer.id}') && s.views.includes('<RestaurantOwnerSoldOutControl') && !/soldOut[^\n]*\?[^\n]*<RestaurantOwnerAvailabilityControl/.test(s.views.split('<RestaurantOwnerSoldOutControl')[1]??''));
  check('errors never expose raw data',!/result\.error\.(?:message|details)|json\([^)]*error|console\.|\.stack/.test(server));
  check('harness disabled by default and has distinct write gate',s.harness.includes('TASTKIND_RA2B_P2_DEVELOPMENT_PREFLIGHT') && s.harness.includes('TASTKIND_RA2B_P2_DEVELOPMENT_WRITE') && s.harness.includes('writeExecuted: false'));
  check('harness uses HTTP and protects ABA and independent audit',s.harness.includes('/availability') && s.harness.includes('ABA') && s.harness.includes('sold_out_audit') && !/updateUserById|signInWithPassword|\.rpc\(/.test(s.harness));
  return checks;
}

// Execute the shipped TypeScript with isolated transports; no network, credentials or DB needed.
export function loadApplication(s, {rpc,claims=async()=>({subject:'verified'}),access=async()=>({state:'selected',restaurant:{id:'restaurant-b'}}),mode='supabase',fetch: browserFetch}={}) {
  const cache={};
  const mocks={
    'server-only':{},
    '../auth/supabase-server': {getVerifiedRestaurantClaims:claims},
    '../../auth/supabase-server':{createRestaurantSupabaseServerClient:()=>({rpc})},
    '../config/restaurant-data-source':{getRestaurantDataSourceConfig:()=>({dataSource:mode})},
    '../runtime/restaurant-access-context':{loadRestaurantAccessContext:access}
  };
  const keys=Object.fromEntries(Object.entries(FILES).map(([k,v])=>[path.resolve(v),k]));
  function load(key) {
    if(cache[key])return cache[key].exports;
    const module={exports:{}};cache[key]=module;
    const code=ts.transpileModule(s[key],{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    const require=id=> {
      if(Object.hasOwn(mocks,id))return mocks[id];
      const dest=keys[path.resolve(path.dirname(FILES[key]),`${id}.ts`)];
      if(!dest)throw new Error(`Unapproved test import: ${id}`);
      return load(dest);
    };
    vm.runInNewContext(code,{module,exports:module.exports,require,Response,Request,URL,TextEncoder,TextDecoder,Uint8Array,fetch:browserFetch},{filename:FILES[key]});
    return module.exports;
  }
  return {types:load('types'),route:load('route'),client:load('client')};
}
export const fixture = Object.freeze({ok:true,state:'ready',branchMenuItemId:'item-b',branchId:'branch-b',menuItemId:'menu-b',availability:'available',availabilityVersion:'2'});
export const intent = Object.freeze({expectedAvailability:'available',nextAvailability:'limited',expectedVersion:'2'});
export async function behavior(s) {
  const checks=[]; const check=(name,pass)=>checks.push({name,pass:!!pass});
  let calls=[];let result={data:fixture,error:null};
  let identity={subject:'verified'};let context={state:'selected',restaurant:{id:'restaurant-b'}};
  const app=loadApplication(s,{rpc:async(name,args)=>{calls.push({name,args});return result;},claims:async()=>identity,access:async()=>context});
  const routeContext={params:{branchId:'branch-b',branchMenuItemId:'item-b'}};
  const url='http://localhost/api/restaurant/branches/branch-b/menu-items/item-b/availability';
  const send=(method,body=intent,extra={})=>app.route[method](new Request(url,{method,...(method==='POST'?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),...extra}),routeContext);
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  for(const v of ['0','2','9007199254740993','9223372036854775807']) check(`version ${v} remains valid string`,app.types.isDecimalVersion(v));
  for(const v of [2,null,'02','-1','2.0','2e1','9223372036854775808','',{},'+2',' 2'])check(`invalid version ${JSON.stringify(v)} denied`,!app.types.isDecimalVersion(v));
  for(const a of ['available','limited','unavailable'])check(`enum ${a} accepted`,!!app.types.parseMutationRequest({...intent,nextAvailability:a}));
  for(const a of ['paused','hidden','sold_out','disabled','draft','temporary_closed','other',null,1])check(`enum ${a} rejected`,!app.types.parseMutationRequest({...intent,nextAvailability:a}));
  for(const field of ['userId','ownerId','membershipId','role','permission','restaurantId','soldOut','soldOutVersion','price','branchSpecificStatus','patch'])check(`extra ${field} rejected`,!app.types.parseMutationRequest({...intent,[field]:'owner'}));
  for(const body of [null,[],{}, {...intent,expectedVersion:2}])check('malformed request rejected',!app.types.parseMutationRequest(body));
  for(const method of ['GET','POST']) {identity=null;calls=[];const r=await send(method);check(`unauthenticated ${method} 401 without RPC`,r.status===401 && calls.length===0);}
  identity={subject:'verified'};
  const badSession=loadApplication(s,{claims:async()=>null});
  check('malformed session denied', (await badSession.route.GET(new Request(url),routeContext)).status===401);
  for(const role of ['owner','manager','staff']) {
    identity={subject:'verified',role};result={data:{ok:false,errorCode:'permission_denied'}};
    for(const method of ['GET','POST'])check(`claim ${role} cannot grant ${method}`, (await send(method)).status===403);
  }
  context={state:'selected',restaurant:{id:'foreign-selector'}};result={data:{ok:false,errorCode:'target_not_found'}};
  check('selected context cannot grant preview',(await send('GET')).status===404);
  context={state:'selected',restaurant:{id:'restaurant-b'}};
  const failures={unauthenticated:401,permission_denied:403,target_not_found:404,stale_state:409,no_change:422,invalid_request:400};
  for(const [state,status]of Object.entries(failures)) {
    result={data:{ok:false,errorCode:state}};const r=await send('POST');check(`${state} maps to ${status}`,r.status===status && equal(await r.json(),{state}));
  }
  result={data:fixture,error:null};calls=[];
  let r=await send('GET');check('preview exact seven-field DTO',equal(await r.json(),fixture));
  check('preview no-store private response',r.headers.get('cache-control')==='private, no-store' && r.headers.get('vary')==='Cookie');
  check('only fixed preview RPC and three selectors',calls.length===1 && calls[0].name==='restaurant_owner_preview_branch_menu_item_availability_v1' && equal(calls[0].args,{p_restaurant_id:'restaurant-b',p_branch_id:'branch-b',p_branch_menu_item_id:'item-b'}));
  for(const extra of [{actor:'private'},{auditId:'private'},{availabilityVersion:2},{availability:'unknown'},{branchId:'other'}]){result={data:{...fixture,...extra}};check('malformed/private/mismatched preview fails closed',(await send('GET')).status===500);}
  result={data:{ok:false,errorCode:'new_error'}};check('unknown DB vocabulary fails closed',(await send('GET')).status===500);
  result={error:{message:'private SQL'}};r=await send('POST');check('transport errors redacted',r.status===503 && equal(await r.json(),{state:'dependency_unavailable'}));
  result={data:{ok:true,branchMenuItemId:'item-b',availability:'limited',availabilityVersion:'9007199254740993',auditId:'11111111-1111-4111-8111-111111111111'}};calls=[];
  r=await send('POST',{...intent,expectedVersion:'9007199254740992'});
  check('mutation strips audit and preserves big string',equal(await r.json(),{state:'ready',branchMenuItemId:'item-b',availability:'limited',availabilityVersion:'9007199254740993'}));
  check('POST only fixed mutation and exact arguments',calls.length===1 && calls[0].name==='restaurant_owner_set_branch_menu_item_availability_v1' && equal(calls[0].args,{p_branch_menu_item_id:'item-b',p_expected_availability:'available',p_next_availability:'limited',p_expected_version:'9007199254740992'}));
  for(const method of ['GET','POST'])check(`${method} rejects query authority`,(await app.route[method](new Request(url+'?role=owner',{method}),routeContext)).status===400);
  for(const extra of [{headers:{'Content-Type':'text/plain'}},{headers:{'Content-Type':'application/json','content-length':'999999'}},{body:'x'.repeat(2049)},{body:'{'}])check('bad or oversize body denied',(await send('POST',intent,extra)).status===400);
  for(const mode of ['mock','disabled','supabase-readonly']) {
    const disabled=loadApplication(s,{mode});check(`${mode} cannot reach live route`,(await disabled.route.GET(new Request(url),routeContext)).status===503);
  }
  // Cross-tenant and missing are indistinguishable, with no privileged table transport available.
  result={data:{ok:false,errorCode:'target_not_found'}};
  const foreign=await send('GET'); const absent=await send('GET');check('foreign and missing have identical public result',foreign.status===404 && equal(await foreign.json(),await absent.json()));
  for(const kind of ['stale','lost-applied','lost-unapplied','malformed','applied','denied','unknown']) {
    const traffic=[];
    const canonical={...fixture,availability:kind==='lost-unapplied'?'available':'limited',availabilityVersion:'3'};
    const browser=loadApplication(s,{fetch:async(_,init)=>{
      traffic.push(init);
      if(init.method==='GET')return Response.json(canonical);
      if(kind.startsWith('lost'))throw new Error('network lost');
      if(kind==='stale')return Response.json({state:'stale_state'},{status:409});
      if(kind==='denied')return Response.json({state:'permission_denied'},{status:403});
      if(kind==='malformed')return new Response('not json',{status:200});
      if(kind==='unknown')return Response.json({state:'novel'},{status:200});
      return Response.json({state:'ready',branchMenuItemId:'item-b',availability:'limited',availabilityVersion:'3'});
    }});
    const outcome=await browser.client.changeAvailability(fixture,'limited');
    check(`${kind} has exactly one POST`,traffic.filter(t=>t.method==='POST').length===1);
    check(`${kind} sends exact canonical request`,equal(JSON.parse(traffic[0].body),intent));
    check(`${kind} reconciles safely`,kind==='denied'?outcome.preview.state==='permission_denied' && traffic.length===1:equal(outcome.preview,canonical) && traffic.length===2 && traffic[1].method==='GET');
    if(kind==='lost-unapplied')check('unapplied asks fresh explicit action',outcome.notice.includes('明確操作'));
    if(kind==='stale')check('stale asks fresh confirmation',outcome.notice.includes('重新確認'));
  }
  const failedGet=loadApplication(s,{fetch:async()=>{throw new Error('GET disconnected');}}).client;
  check('failed GET never manufactures local success',(await failedGet.previewAvailability('branch-b','item-b')).state==='dependency_unavailable');
  const malformedGet=loadApplication(s,{fetch:async()=>Response.json({...fixture,auditId:'private'})}).client;
  check('browser rejects private preview extras',(await malformedGet.previewAvailability('branch-b','item-b')).state==='internal_failure');
  let fetched=0;const client=loadApplication(s,{fetch:async()=>{fetched++;return Response.json(fixture);}}).client;
  await client.changeAvailability(fixture,'available');check('same-state intent sends no POST or GET',fetched===0);
  for(const status of [401,403,404,503]) {
    const client=loadApplication(s,{fetch:async()=>Response.json(fixture,{status})}).client;
    check(`HTTP ${status} never enables control`,(await client.previewAvailability('branch-b','item-b')).state!=='ready');
  }
  return checks;
}
