#!/usr/bin/env node
// Prepared only. Auth/session establishment and final sign-out remain separately authorized steps.
// No credential file access, Auth Admin operation, RPC bypass or direct business writes here.
const SUITE='restaurant-owner-availability-ra-2b-p2-development-acceptance';
if(process.env.TASTKIND_RA2B_P2_DEVELOPMENT_PREFLIGHT!=='1') {
  console.log(JSON.stringify({suite:SUITE,status:'skipped',writeExecuted: false,reason:'Development acceptance requires separate authorization'},null,2));
  process.exit(0);
}
const REF='msbgnnoorsoefuiwluye';
const target='dev-bmi-b-main', branch='dev-branch-b-main';
const token=process.env.SUPABASE_ACCESS_TOKEN;
const cookie=process.env.TASTKIND_RA2B_P2_SESSION_COOKIE;
const base=new URL(process.env.TASTKIND_RA2B_P2_RESTAURANT_BASE_URL??'');
// Session material must never be forwarded to a remotely supplied origin.
if(base.protocol!=='http:' || !['localhost','127.0.0.1'].includes(base.hostname)
  || base.username || base.password || base.search || base.hash || base.pathname!=='/')throw new Error('loopback Restaurant runtime required');
if(!token||!cookie)throw new Error('authorized Development session and Management credentials required');
const management=async(path,init={})=>{
  const response=await fetch(`https://api.supabase.com/v1/projects/${REF}${path}`,{
    ...init,redirect:'error',headers:{Authorization:`Bearer ${token}`,...init.headers}
  });
  if(!response.ok)throw new Error(`Development inspection failed (${response.status})`);
  return response.json();
};
const sql=query=>management('/database/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});
const snapshot=async()=> (await sql(`select bmi.restaurant_id, bmi.branch_id, bmi.availability,
 bmi.availability_version::text version, bmi.sold_out, bmi.sold_out_version::text sold_out_version,
 (select count(*)::int from restaurant_internal.branch_menu_item_availability_audit_log where branch_menu_item_id='${target}') audit_rows,
 (select count(*)::int from restaurant_internal.branch_menu_item_sold_out_audit_log where branch_menu_item_id='${target}') sold_out_audit,
 r.status restaurant_status,
 (select count(*)::int from public.consumer_public_restaurant_catalog_v1 where restaurant_id=r.id) public_rows,
 md5((to_jsonb(bmi)-'availability'-'availability_version')::text) target_other_fields,
 md5((select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text from public.restaurant_branches x)) branches_fingerprint,
 md5((select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text from public.branch_menu_items x where x.id<>'${target}')) other_items_fingerprint,
 md5((select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text from public.restaurants x)) restaurants_fingerprint,
 md5((select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text from restaurant_internal.branch_menu_item_sold_out_audit_log x)) sold_out_audit_fingerprint,
 md5((select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text from public.restaurant_memberships x)) memberships_fingerprint,
 md5((select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb)::text from public.restaurant_membership_branch_scopes x)) scopes_fingerprint,
 md5((select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)::text from public.restaurant_roles x)) roles_fingerprint
 from public.branch_menu_items bmi join public.restaurants r on r.id=bmi.restaurant_id where bmi.id='${target}';`))[0];
const endpoint=new URL(`/api/restaurant/branches/${branch}/menu-items/${target}/availability`,base);
const api=async(method,body)=>{
 const r=await fetch(endpoint,{method,redirect:'error',cache:'no-store',headers:{Accept:'application/json',Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 let result;try{result=await r.json();}catch{result={state:'internal_failure'};}
 return {status:r.status,result};
};
const checks=[];
const check=(name,pass)=>{checks.push({name,pass:!!pass});console.log(`${pass?'PASS':'FAIL'} ${checks.length} ${name}`);if(!pass)throw new Error(`Acceptance stopped: ${name}`);};
const expected=(p,a,v)=>p.status===200 && p.result.ok===true && p.result.state==='ready'
 && p.result.branchMenuItemId===target && p.result.branchId===branch && p.result.menuItemId==='dev-item-b-main'
 && p.result.availability===a && p.result.availabilityVersion===v
 && JSON.stringify(Object.keys(p.result).sort())===JSON.stringify(['availability','availabilityVersion','branchId','branchMenuItemId','menuItemId','ok','state']);
const body=(p,next)=>({expectedAvailability:p.availability,nextAvailability:next,expectedVersion:p.availabilityVersion});
const project=await management('');
check('Development project pin',project.id===REF && project.name==='tastkind-development');
const before=await snapshot();
check('hidden target identity and independent sold-out state',before?.restaurant_id==='dev-restaurant-hidden'
 && before.branch_id===branch && before.restaurant_status==='draft' && before.public_rows===0
 && before.sold_out===false && before.sold_out_version==='4' && before.sold_out_audit===4);
check('exact preflight; never restart a partly completed cycle',before.availability==='available' && before.version==='2' && before.audit_rows===2);
const original=await api('GET');check('HTTP preview available/2',expected(original,'available','2'));
let writeExecuted=false;
if(process.env.TASTKIND_RA2B_P2_DEVELOPMENT_WRITE==='1') {
  writeExecuted=true;
  let failure;
  try {
    const applied=await api('POST',body(original.result,'limited'));
    check('HTTP applies available/2 to limited/3',applied.status===200 && applied.result.state==='ready'
      && applied.result.availability==='limited' && applied.result.availabilityVersion==='3');
    const stale=await api('POST',body(original.result,'limited'));
    check('old version is stale 409',stale.status===409 && stale.result.state==='stale_state');
    const fresh=await api('GET');check('canonical refresh limited/3',expected(fresh,'limited','3'));
  } catch(error) {failure=error;}
  // Inspect before recovery even after an ambiguous response. No replay of the initial POST.
  const current=await api('GET');const state=await snapshot();
  if(expected(current,'limited','3') && state.availability==='limited' && state.version==='3' && state.audit_rows===3) {
    const recovered=await api('POST',body(current.result,'available'));
    check('canonical HTTP recovery available/4',recovered.status===200 && recovered.result.state==='ready'
      && recovered.result.availability==='available' && recovered.result.availabilityVersion==='4');
  } else check('unexpected recovery state requires manual inspection',false);
  const aba=await api('POST',body(original.result,'unavailable'));
  check('ABA original version 2 is stale',aba.status===409 && aba.result.state==='stale_state');
  const final=await api('GET');check('final exact HTTP preview available/4',expected(final,'available','4'));
  const after=await snapshot();
  check('exactly four availability audits; sold-out audit unchanged',after.availability==='available'
    && after.version==='4' && after.audit_rows===4 && after.sold_out===false && after.sold_out_version==='4' && after.sold_out_audit===4);
  for(const key of Object.keys(before).filter(k=>k.endsWith('_fingerprint')||k==='target_other_fields'||k==='restaurant_status'||k==='public_rows'))check(`${key} unchanged`,before[key]===after[key]);
  if(failure)throw failure;
}
console.log(JSON.stringify({suite:SUITE,status:'passed',total:checks.length,passed:checks.length,failed:0,writeExecuted,sessionCleanup:'operator must sign out and remove authorized temporary credentials'},null,2));
