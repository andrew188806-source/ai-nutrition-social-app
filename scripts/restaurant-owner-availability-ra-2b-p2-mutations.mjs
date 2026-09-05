#!/usr/bin/env node
import {sources,audit,behavior} from './restaurant-owner-availability-ra-2b-p2-contract.mjs';
const baseline=sources();
const mutants=[];
const replace=(name,key,from,to)=>mutants.push({name,key,apply:s=>{
 if(!s.includes(from))throw new Error(`mutation anchor missing: ${name}`);return s.replace(from,to);
}});
replace('trust role=owner','runtime','if (identity !== "verified")','if (role === "owner") return json({state:"ready"});\n  if (identity !== "verified")');
replace('trust caller userId','runtime','const identity = await verifiedIdentity();','const identity = userId ? "verified" : await verifiedIdentity();');
replace('selected cookie grants authority','runtime','.preview(access.restaurant.id, branchId, branchMenuItemId)','.preview(cookieGrantsAuthority, branchId, branchMenuItemId)');
replace('old menu read supplies version','views','const offers=','const availabilityVersion=offer.availabilityVersion;const offers=');
replace('direct SELECT fallback','repository','const result = await client.rpc','const leaked = await client.from("branch_menu_items").select();\n      const result = await client.rpc');
replace('direct UPDATE fallback','repository','const result = await client.rpc','await client.from("branch_menu_items").update(input);\n      const result = await client.rpc');
replace('service role fallback','repository','const client = createRestaurantSupabaseServerClient();','const client = service_role;');
replace('generic RPC accepted','repository','client.rpc(RESTAURANT_OWNER_AVAILABILITY_MUTATION_RPC,','client.rpc(functionName,');
replace('cross-tenant prelookup','runtime','const identity = await verifiedIdentity();','await client.from("branch_menu_items").select();\n  const identity = await verifiedIdentity();');
replace('version converted to Number','repository','p_expected_version: input.expectedVersion','p_expected_version: Number(input.expectedVersion)');
replace('client version incremented','client','expectedVersion: current.availabilityVersion','expectedVersion: current.availabilityVersion + 1');
replace('stale auto-resubmitted','client','if (state === "stale_state") return { preview,','if (state === "stale_state") return changeAvailability(current, nextAvailability);\n  if (false) return { preview,');
replace('uncertain blindly repeated','client','const preview = await previewAvailability(current.branchId, current.branchMenuItemId);','return changeAvailability(current, nextAvailability);\n  const preview = current;');
replace('live error becomes local success','client','return { state: "dependency_unavailable" };','return { ok: true, state: "ready", branchId, branchMenuItemId, menuItemId: "mock", availability: "available", availabilityVersion: "2" };');
replace('mock control enabled','runtime','dataSource !== "supabase"','dataSource === "disabled"');
replace('arbitrary enum accepted','types','return value === "available" || value === "limited" || value === "unavailable";','return typeof value === "string";');
replace('extra fields accepted','types','!hasExactKeys(value, ["expectedAvailability", "nextAvailability", "expectedVersion"])','false');
replace('availability modifies sold-out','repository','p_next_availability: input.nextAvailability','p_next_sold_out: true, p_next_availability: input.nextAvailability');
replace('availability inferred from sold-out','client','expectedAvailability: current.availability','expectedAvailability: current.soldOut ? "unavailable" : "available"');
replace('confirmation removed','component','!confirmationOpen || ','');
replace('raw DB error exposed','repository','throw new RestaurantOwnerAvailabilityTransportError()','throw new Error(result.error.message)');
replace('privileged import in browser','component','"use client";','"use client";\nimport "../../server/restaurant-owner-availability-runtime";');
replace('same-state POST enabled','client','!isAvailability(nextAvailability) || nextAvailability === current.availability','!isAvailability(nextAvailability)');
replace('preview 403 enables control','client','if (response.status !== 200) return failure(data, response.status);','');
const baseFailures=[...audit(baseline),...await behavior(baseline)].filter(c=>!c.pass);
if(baseFailures.length)throw new Error(`baseline fails: ${JSON.stringify(baseFailures)}`);
const results=[];
for(const m of mutants){
 const s={...baseline,[m.key]:m.apply(baseline[m.key])};
 let failures=audit(s).filter(c=>!c.pass);
 if(!failures.length) {
   try {failures=(await behavior(s)).filter(c=>!c.pass);}catch {failures=[{name:'shipped module execution failed closed'}];}
 }
 const killed=failures.length>0;results.push({name:m.name,killed,detectedBy:failures.map(f=>f.name)});
 console.log(`${killed?'KILLED':'SURVIVED'} ${m.name}`);
}
const survivors=results.filter(r=>!r.killed);
console.log(JSON.stringify({suite:'restaurant-owner-availability-ra-2b-p2-mutations',total:results.length,killed:results.length-survivors.length,survivors:survivors.length,results},null,2));
if(survivors.length)process.exitCode=1;
