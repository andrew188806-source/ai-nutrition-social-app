#!/usr/bin/env node
import { auditApplicationSources, readP2Sources } from "./restaurant-owner-sold-out-ra-2a-p2-contract.mjs";

const original=readP2Sources();
const baselineFailures=auditApplicationSources(original).filter(row=>!row.pass);
if(baselineFailures.length) {
  console.error(`FAIL baseline contract: ${baselineFailures.map(row=>row.name).join(", ")}`);
  process.exit(1);
}

const mutants=[];
function add(name,file,from,to){mutants.push({name,file,from,to});}
add("trust role=owner","runtime","import \"server-only\";","import \"server-only\";\nconst callerRole = \"owner\"; if (callerRole === \"owner\") void 0;");
add("trust manager role","runtime","import \"server-only\";","import \"server-only\";\nconst role = \"manager\"; if (role === \"manager\") void 0;");
add("trust staff role","runtime","import \"server-only\";","import \"server-only\";\nconst role = \"staff\"; if (role === \"staff\") void 0;");
add("trust caller userId","runtime","import \"server-only\";","import \"server-only\";\nconst userId = \"caller\";");
add("selected cookie grants POST authority","runtime","export async function handleRestaurantOwnerSoldOutMutationRequest(\n  request: Request,\n  branchInput: unknown,\n  branchMenuItemInput: unknown\n): Promise<Response> {\n  const branchId","export async function handleRestaurantOwnerSoldOutMutationRequest(\n  request: Request,\n  branchInput: unknown,\n  branchMenuItemInput: unknown\n): Promise<Response> {\n  const selected = await loadRestaurantAccessContext();\n  if (selected.state === \"selected\") return json({ state: \"permission_denied\" });\n  const branchId");
add("old menu read supplies soldOutVersion","views","  const categories=new Map","  const soldOutVersion = \"2\"; void soldOutVersion;\n  const categories=new Map");
add("direct SELECT fallback","repository","      const result = await client.rpc(RESTAURANT_OWNER_SOLD_OUT_PREVIEW_RPC, {","      client.from(\"branch_menu_items\").select(\"*\");\n      const result = await client.rpc(RESTAURANT_OWNER_SOLD_OUT_PREVIEW_RPC, {");
add("direct UPDATE fallback","repository","      const result = await client.rpc(RESTAURANT_OWNER_SOLD_OUT_MUTATION_RPC, {","      client.from(\"branch_menu_items\").update({ sold_out: true });\n      const result = await client.rpc(RESTAURANT_OWNER_SOLD_OUT_MUTATION_RPC, {");
add("service role fallback","repository","import \"server-only\";","import \"server-only\";\nconst key = process.env.SUPABASE_SERVICE_ROLE;");
add("generic RPC name accepted","repository","client.rpc(RESTAURANT_OWNER_SOLD_OUT_MUTATION_RPC, {","client.rpc(name, {");
add("cross-tenant preview prelookup","runtime","    // branchId is deliberately not sent to the mutation RPC.","    await createRestaurantOwnerSoldOutRepository().preview(\"caller-restaurant\", branchId, branchMenuItemId);\n    // branchId is deliberately not sent to the mutation RPC.");
add("caller restaurantId accepted","types","[\"expectedSoldOut\", \"nextSoldOut\", \"expectedVersion\"]","[\"expectedSoldOut\", \"nextSoldOut\", \"expectedVersion\", \"restaurantId\"]");
add("branchId sent as authority","repository","        p_branch_menu_item_id: branchMenuItemId,\n        p_expected_sold_out:","        p_branch_menu_item_id: branchMenuItemId,\n        p_branch_id: branchMenuItemId,\n        p_expected_sold_out:");
add("version converted to Number","component","      expectedVersion: preview.soldOutVersion","      expectedVersion: String(Number(preview.soldOutVersion))");
add("version incremented client-side","component","      expectedVersion: preview.soldOutVersion","      expectedVersion: preview.soldOutVersion + 1");
add("stale automatically resubmitted","component","        setNotice(\"此餐點已由其他操作變更。已重新讀取，請依最新狀態重新確認。 \");","        void submit();\n        setNotice(\"此餐點已由其他操作變更。已重新讀取，請依最新狀態重新確認。 \");");
add("uncertain POST blindly repeated","component","    const current = await refresh();","    const current = await refresh();\n    void submit();");
add("live failure becomes React ready success","component","    } catch {\n      const result = { state: \"dependency_unavailable\" } as const;","    } catch {\n      const result = { ok: true, state: \"ready\", branchMenuItemId: props.branchMenuItemId, branchId: props.branchId, menuItemId: \"fake\", soldOut: false, soldOutVersion: \"0\" } as const;");
add("mock record accepted as live target","menuPage","import { MenuListPanel }","import { RestaurantOwnerSoldOutControl } from \"../../../components/menu/RestaurantOwnerSoldOutControl\";\nimport { MenuListPanel }");
add("confirmation removed","component","onClick={() => setConfirmationOpen(true)}","onClick={() => void submit()}");
add("arbitrary body accepted","types","if (!isRecord(value) || !hasExactKeys(value, [\"expectedSoldOut\", \"nextSoldOut\", \"expectedVersion\"])) return null;","if (!isRecord(value)) return null;");
add("raw DB error exposed","runtime","  catch { return \"dependency_unavailable\"; }","  catch (error) { console.error(error.message); return \"dependency_unavailable\"; }");
add("privileged module browser-imported","component","import { useEffect, useState } from \"react\";","import { useEffect, useState } from \"react\";\nimport { createRestaurantSupabaseServerClient } from \"../../auth/supabase-server\";");

let killed=0;
for(const mutant of mutants){
  if(!original[mutant.file].includes(mutant.from)){
    console.log(`FAIL ${mutant.name}: mutation anchor absent`);continue;
  }
  const changed={...original,[mutant.file]:original[mutant.file].replace(mutant.from,mutant.to)};
  const failures=auditApplicationSources(changed).filter(row=>!row.pass);
  const dead=failures.length>0;
  if(dead)killed+=1;
  console.log(`${dead?"PASS":"FAIL"} ${mutant.name}${dead?` killed by: ${failures.map(row=>row.name).join(" | ")}`:" survived"}`);
}
console.log(JSON.stringify({suite:"restaurant-owner-sold-out-ra-2a-p2-mutations",total:mutants.length,
  killed,survivors:mutants.length-killed},null,2));
if(killed!==mutants.length)process.exitCode=1;
