import { readFileSync } from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const read=(relative)=>readFileSync(path.join(root,relative),"utf8");
const fail=(message)=>{throw new Error(`Phase 2V-D contract smoke: ${message}`);};
const mapper=read("apps/restaurant-web/runtime/restaurant-rpc-mappers.ts");
for(const mapping of [["restaurant_id","id"],["branch_id","id"],["menu_id","id"],["category_id","id"],["menu_item_id","id"],["branch_menu_item_id","id"],["nutrition_id","id"]])if(!mapper.includes(mapping[0]))fail(`mapper missing ${mapping[0]} → ${mapping[1]}`);
if(!mapper.includes("Cross-restaurant")||!mapper.includes("Non-current nutrition row rejected"))fail("tenant/current validation missing");
const reads=read("apps/restaurant-web/runtime/live-restaurant-reads.ts");
if((reads.match(/Promise\.all/g)??[]).length!==3)fail("parallel query budget contract changed");
if(/for\s*\([^)]*\)[\s\S]{0,120}repository\./.test(reads))fail("possible N+1 repository call found");
const factory=read("apps/restaurant-web/services/restaurant-runtime-service-factory.ts");
for(const mode of ['"mock"','"supabase"','"disabled"'])if(!factory.includes(mode))fail(`factory mode missing: ${mode}`);
if(/catch[\s\S]{0,180}(mock|getConsoleOverview|getMenuConsoleData)/.test(factory))fail("mock fallback detected");
console.log("Phase 2V-D contract smoke passed.");
