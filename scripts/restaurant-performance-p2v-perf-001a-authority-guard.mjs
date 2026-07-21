import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authorityPath = "docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json";
const contractPath = "docs/runtime-integration-phase-2v-e/performance-and-query-plan-contract.md";
const guardPath = "scripts/restaurant-performance-p2v-perf-001a-authority-guard.mjs";
const expectedCandidates = [authorityPath, contractPath, guardPath].sort();
const baselineHead = "4df4bee8537843f371770cf3543c7ab9a2193f15";
const expectedFunctions = [
  "restaurant_current_access_context_v1", "restaurant_internal_restaurants_v1",
  "restaurant_internal_branches_v1", "restaurant_internal_menus_v1",
  "restaurant_internal_menu_categories_v1", "restaurant_internal_menu_items_v1",
  "restaurant_internal_branch_menu_items_v1", "restaurant_internal_current_nutrition_v1"
];
const expectedActors = Array.from({ length: 9 }, (_, index) => `A${String(index + 1).padStart(2, "0")}`);
const expectedCases = ["C01","C02","R01","R02","B01","B02","M01","M02","K01","K02","I01","I02","I03","J01","J02","J03","N01","N02","N03",...Array.from({length:10},(_,i)=>`D${String(i+1).padStart(2,"0")}`),...Array.from({length:6},(_,i)=>`P${String(i+1).padStart(2,"0")}`)];
const expectedProfiles = ["accessTypical","accessWorst","smallTypical","smallWorst","itemsWorst","branchItemsWorst","nutritionWorst","denial","pageDiagnostic"];
const expectedGenerationOrder = ["auth.users","restaurants","restaurant_branches","menus","menu_categories","menu_items","branch_menu_items","menu_item_nutrition","restaurant_users","restaurant_roles","role_permissions","restaurant_memberships","restaurant_membership_branch_scopes"];
const expectedActorOrdinals = {A01:0,A02:1,A03:2,A04:3,A05:4,A06:5,A07:6,A08:7,A09:8};
const expectedMembershipOverrides = [
  [0,0,"A01",0],[0,10,"A02",1],[0,45,"A03",2],[1,1,"A04",3],
  ...Array.from({length:10},(_,index)=>[index+1,0,"A05",4]),
  [49,0,"A07",6],[0,80,"A08",7],[0,1,"A09",8]
].map(([tenantOrdinal,membershipOrdinal,actorId,userOrdinal])=>({tenantOrdinal,membershipOrdinal,actorId,userOrdinal}));
const expectedNonMemberOrdinals = [5,...Array.from({length:20},(_,index)=>680+index)];
const expectedRowOrder = {
  "auth.users":"id ASC by lowercase UUID UTF-8 bytes", restaurants:"id ASC by text UTF-8 bytes", restaurant_branches:"id ASC by text UTF-8 bytes", menus:"id ASC by text UTF-8 bytes", menu_categories:"id ASC by text UTF-8 bytes", menu_items:"id ASC by text UTF-8 bytes", branch_menu_items:"id ASC by text UTF-8 bytes", menu_item_nutrition:"id ASC by text UTF-8 bytes", restaurant_users:"id ASC by lowercase UUID UTF-8 bytes", restaurant_roles:"id ASC by lowercase UUID UTF-8 bytes", role_permissions:"role_id, permission_key, permission_scope ASC by lowercase UUID then text UTF-8 bytes", restaurant_memberships:"id ASC by lowercase UUID UTF-8 bytes", restaurant_membership_branch_scopes:"id ASC by lowercase UUID UTF-8 bytes"
};
const expectedHashColumns = {
  "auth.users":["id","email"], restaurants:["id","name","legal_name","city","category","tags","plan","status","created_at"], restaurant_branches:["id","restaurant_id","name","district","address","status","is_active"], menus:["id","restaurant_id","name","status"], menu_categories:["id","menu_id","name","sort_order"], menu_items:["id","restaurant_id","menu_category_id","name","description","image_url","tag_ids","allergens","status","nutrition_id","nutrition_badge_status","badge_enabled"], branch_menu_items:["id","restaurant_id","branch_id","menu_item_id","price","availability","sold_out","branch_specific_name","branch_specific_description","branch_specific_status"], menu_item_nutrition:["id","menu_item_id","calories","protein","carbohydrates","fat","fiber","sugar","sodium","saturated_fat","serving_size","source","confidence_score","verified_status","is_current","updated_at"], restaurant_users:["id","auth_user_id","login_status","created_at","updated_at"], restaurant_roles:["id","role_key","display_name","status"], role_permissions:["role_id","permission_key","permission_scope"], restaurant_memberships:["id","restaurant_user_id","restaurant_id","role_id","status","created_at","updated_at"], restaurant_membership_branch_scopes:["id","membership_id","branch_id","status","created_at","updated_at"]
};
const expectedMeta = {
  restaurant_current_access_context_v1: { input:[], output:["restaurant_id","role_key","permission_key","permission_scope","branch_id"], identity:["restaurant_id","permission_key","permission_scope","branch_id"], tables:["restaurant_users","restaurant_memberships","restaurant_roles","role_permissions","restaurant_membership_branch_scopes","restaurant_branches"], dependencies:[], filter:"request actor UUID plus enabled restaurant user, active membership, active role, frozen permissions and same-tenant active branch scope" },
  restaurant_internal_restaurants_v1: { input:[], output:["restaurant_id","name","city","category","status"], identity:["restaurant_id"], tables:["restaurants"], dependencies:["restaurant_current_access_context_v1"], filter:"access_context.read with self scope joined to restaurants.id" },
  restaurant_internal_branches_v1: { input:[{name:"p_restaurant_id",type:"text"}], output:["branch_id","restaurant_id","name","district","address","status"], identity:["branch_id"], tables:["restaurant_branches"], dependencies:["restaurant_current_access_context_v1"], filter:"matching restaurant selector and restaurant-wide or exact assigned-branch permission" },
  restaurant_internal_menus_v1: { input:[{name:"p_restaurant_id",type:"text"}], output:["menu_id","restaurant_id","name","status"], identity:["menu_id"], tables:["menus","menu_categories","menu_items","branch_menu_items","restaurant_branches"], dependencies:["restaurant_current_access_context_v1"], filter:"matching restaurant selector plus restaurant-wide scope or assigned-branch item reachability" },
  restaurant_internal_menu_categories_v1: { input:[{name:"p_restaurant_id",type:"text"}], output:["category_id","menu_id","restaurant_id","name","sort_order"], identity:["category_id"], tables:["menu_categories","menus","menu_items","branch_menu_items","restaurant_branches"], dependencies:["restaurant_current_access_context_v1"], filter:"menu-derived tenant selector plus restaurant-wide scope or assigned-branch item reachability" },
  restaurant_internal_menu_items_v1: { input:[{name:"p_restaurant_id",type:"text"}], output:["menu_item_id","restaurant_id","menu_category_id","name","description","image_url","allergens","status","nutrition_badge_status"], identity:["menu_item_id"], tables:["menu_items","menu_categories","menus","branch_menu_items","restaurant_branches"], dependencies:["restaurant_current_access_context_v1"], filter:"item/category/menu tenant agreement plus restaurant-wide scope or assigned-branch reachability" },
  restaurant_internal_branch_menu_items_v1: { input:[{name:"p_restaurant_id",type:"text"}], output:["branch_menu_item_id","restaurant_id","branch_id","menu_item_id","price","availability","sold_out","branch_specific_name","branch_specific_description","branch_specific_status"], identity:["branch_menu_item_id"], tables:["branch_menu_items","restaurant_branches","menu_items","menu_categories","menus"], dependencies:["restaurant_current_access_context_v1"], filter:"branch/item/category/menu same-tenant chain plus restaurant-wide or exact assigned branch scope" },
  restaurant_internal_current_nutrition_v1: { input:[{name:"p_restaurant_id",type:"text"}], output:["nutrition_id","restaurant_id","menu_item_id","calories","protein","carbohydrates","fat","fiber","sugar","sodium","saturated_fat","serving_size","verified_status","is_current"], identity:["nutrition_id"], tables:["menu_item_nutrition","menu_items","menu_categories","menus","branch_menu_items","restaurant_branches"], dependencies:["restaurant_current_access_context_v1"], filter:"current nutrition with item/category/menu tenant agreement plus restaurant-wide or assigned-branch reachability" }
};

const text = (relative) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
const authority = JSON.parse(text(authorityPath));
const contract = text(contractPath);
const clone = (value) => JSON.parse(JSON.stringify(value));
const exactInteger = (value) => Number.isInteger(value) && value >= 0;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sorted = (values) => [...values].sort();
const uniqueExact = (actual, expected) => actual.length === new Set(actual).size && same(sorted(actual), sorted(expected));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function git(args, allowFailure = false) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  return result;
}

function parseUuid(value) { return Buffer.from(value.replaceAll("-", ""), "hex"); }
function uuidv5(name, namespace) {
  const bytes = crypto.createHash("sha1").update(parseUuid(namespace)).update(name, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function lexSql(source, { target = null, replace = false } = {}) {
  const tokens = [];
  let output = "";
  let targetCount = 0;
  let index = 0;
  const isStart = (char) => char !== undefined && (/[A-Za-z_]/.test(char) || char.charCodeAt(0) > 127);
  const isPart = (char) => char !== undefined && (/[A-Za-z0-9_$]/.test(char) || char.charCodeAt(0) > 127);
  const copyUntil = (end) => { output += source.slice(index, end); index = end; };
  while (index < source.length) {
    const start = index;
    if (source.startsWith("--", index)) {
      const end = source.indexOf("\n", index + 2);
      copyUntil(end < 0 ? source.length : end + 1);
      continue;
    }
    if (source.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < source.length && depth) {
        if (source.startsWith("/*", index)) { depth += 1; index += 2; }
        else if (source.startsWith("*/", index)) { depth -= 1; index += 2; }
        else index += 1;
      }
      if (depth) throw new Error("unterminated block comment");
      output += source.slice(start, index);
      continue;
    }
    const escapedPrefix = (source[index] === "E" || source[index] === "e") && source[index + 1] === "'" ? 1 :
      ((source[index] === "U" || source[index] === "u") && source[index + 1] === "&" && source[index + 2] === "'" ? 2 : 0);
    if (source[index] === "'" || escapedPrefix) {
      const quote = index + escapedPrefix;
      index = quote + 1;
      while (index < source.length) {
        if (escapedPrefix && source[index] === "\\") { index += Math.min(2, source.length - index); continue; }
        if (source[index] === "'" && source[index + 1] === "'") { index += 2; continue; }
        if (source[index] === "'") { index += 1; break; }
        index += 1;
      }
      if (source[index - 1] !== "'") throw new Error("unterminated string");
      output += source.slice(start, index);
      continue;
    }
    if (source[index] === '"') {
      index += 1;
      while (index < source.length) {
        if (source[index] === '"' && source[index + 1] === '"') { index += 2; continue; }
        if (source[index] === '"') { index += 1; break; }
        index += 1;
      }
      if (source[index - 1] !== '"') throw new Error("unterminated quoted identifier");
      output += source.slice(start, index);
      continue;
    }
    if (source[index] === "$") {
      const parameter = source.slice(index).match(/^\$[0-9]+/);
      if (parameter) {
        index += parameter[0].length;
        tokens.push({ type:"parameter", value:parameter[0] });
        output += parameter[0];
        continue;
      }
      const dollar = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (dollar) {
        const delimiter = dollar[0];
        const end = source.indexOf(delimiter, index + delimiter.length);
        if (end < 0) throw new Error("unterminated dollar quote");
        index = end + delimiter.length;
        output += source.slice(start, index);
        continue;
      }
    }
    if (isStart(source[index])) {
      index += 1;
      while (isPart(source[index])) index += 1;
      const original = source.slice(start, index);
      const folded = original.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
      tokens.push({ type:"identifier", value:folded, original });
      if (target && folded === target.toLowerCase()) {
        targetCount += 1;
        output += replace ? "$1" : original;
      } else output += original;
      continue;
    }
    const char = source[index++];
    if (!/\s/.test(char)) tokens.push({ type:"punctuation", value:char });
    output += char;
  }
  return { tokens, output, targetCount };
}

function extractFunction(source, name) {
  const signature = `CREATE FUNCTION public.${name}(`;
  const start = source.indexOf(signature);
  if (start < 0 || source.indexOf(signature, start + signature.length) >= 0) throw new Error(`${name} signature missing or duplicate`);
  const open = start + signature.length - 1;
  let depth = 0;
  let close = -1;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") { depth -= 1; if (depth === 0) { close = index; break; } }
  }
  if (close < 0) throw new Error(`${name} arguments unterminated`);
  const inputText = source.slice(open + 1, close).trim();
  const input = inputText ? inputText.split(",").map((entry) => { const [argName, ...type] = entry.trim().split(/\s+/); return { name:argName, type:type.join(" ") }; }) : [];
  const header = source.slice(close + 1, source.indexOf("AS ", close));
  const returns = header.match(/RETURNS\s+TABLE\s*\(([\s\S]*?)\)\s*LANGUAGE/i);
  if (!returns) throw new Error(`${name} RETURNS TABLE missing`);
  const output = returns[1].split(",").map((entry) => entry.trim().split(/\s+/)[0]);
  const asOffset = source.indexOf("AS ", close);
  const delimiterMatch = source.slice(asOffset).match(/^AS\s+(\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)\n/);
  if (!delimiterMatch) throw new Error(`${name} AS dollar delimiter missing`);
  const delimiter = delimiterMatch[1];
  const bodyStart = asOffset + delimiterMatch[0].length;
  const bodyEnd = source.indexOf(`\n${delimiter};`, bodyStart);
  if (bodyEnd < 0) throw new Error(`${name} closing delimiter missing`);
  const body = source.slice(bodyStart, bodyEnd);
  const lexed = lexSql(body);
  const tables = new Set();
  const dependencies = new Set();
  for (let i = 0; i < lexed.tokens.length - 3; i += 1) {
    const lead = lexed.tokens[i];
    if (lead.type !== "identifier" || !["from","join"].includes(lead.value)) continue;
    const schema = lexed.tokens[i + 1], dot = lexed.tokens[i + 2], relation = lexed.tokens[i + 3];
    if (schema?.value !== "public" || dot?.value !== "." || relation?.type !== "identifier") continue;
    if (lexed.tokens[i + 4]?.value === "(") dependencies.add(relation.value);
    else tables.add(relation.value);
  }
  const keywords = new Set(lexed.tokens.filter((token) => token.type === "identifier").map((token) => token.value));
  return { input, output, body, tables:sorted(tables), dependencies:sorted(dependencies), hasSort:keywords.has("order"), hasLimit:keywords.has("limit"), hasOffset:keywords.has("offset") };
}

const migrationFiles = fs.readdirSync(path.join(root, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
const allMigrationSql = migrationFiles.map((name) => text(`supabase/migrations/${name}`)).join("\n");
function indexExists(name) {
  if (new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${name}\\b`, "i").test(allMigrationSql)) return true;
  if (new RegExp(`CONSTRAINT\\s+${name}\\s+(?:PRIMARY\\s+KEY|UNIQUE)\\b`, "i").test(allMigrationSql)) return true;
  if (name.endsWith("_pkey")) {
    const table = name.slice(0, -5);
    return new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+public\\.${table}\\s*\\([\\s\\S]*?PRIMARY\\s+KEY`, "i").test(allMigrationSql);
  }
  if (name === "branch_menu_items_branch_id_menu_item_id_key") return /CREATE\s+TABLE\s+public\.branch_menu_items[\s\S]*?UNIQUE\s*\(branch_id,\s*menu_item_id\)/i.test(allMigrationSql);
  return false;
}

function currentGitSnapshot() {
  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]).stdout.split("\n").filter(Boolean);
  return {
    branch: git(["branch", "--show-current"]).stdout.trim(),
    head: git(["rev-parse", "HEAD"]).stdout.trim(),
    stagedEmpty: git(["diff", "--cached", "--quiet"], true).status === 0,
    entries: status.map((line) => ({ status:line.slice(0,2), path:line.slice(3) })),
    protectedPaths: git(["diff", "--name-only", "HEAD", "--", "supabase/migrations", "apps", "packages", "lib", "package.json", "package-lock.json"]).stdout.split("\n").filter(Boolean)
  };
}

function validateGitSnapshot(snapshot) {
  const issues = [];
  if (snapshot.branch !== "main") issues.push("git-branch");
  if (snapshot.head !== baselineHead) issues.push("git-head");
  if (!snapshot.stagedEmpty) issues.push("git-staged");
  if (!same(sorted(snapshot.entries.map((entry) => entry.path)), expectedCandidates)) issues.push("git-candidate");
  if (snapshot.entries.some((entry) => ![" M","??"].includes(entry.status))) issues.push("git-status-kind");
  if (snapshot.protectedPaths.length) issues.push("git-protected");
  return issues;
}

function derivedActorTuples(a) {
  const d = a.dataset;
  const assigned = new Set([0,1,2,3,4]);
  let reachableItems = 0;
  let reachableBranchItems = 0;
  const reachableCategories = new Set();
  const reachableMenus = new Set();
  for (let item = 0; item < d.maxTenant.items; item += 1) {
    const links = Array.from({length:d.maxTenant.itemBranchLinks},(_,link)=>(item+link)%d.maxTenant.branches);
    if (links.some((branch) => assigned.has(branch))) {
      reachableItems += 1;
      const menu = Math.floor(item / d.maxTenant.itemsPerMenu);
      const within = item % d.maxTenant.itemsPerMenu;
      reachableMenus.add(menu);
      reachableCategories.add(`${menu}:${within % d.maxTenant.categoriesPerMenu}`);
    }
    reachableBranchItems += links.filter((branch) => assigned.has(branch)).length;
  }
  const permissionSource = text("supabase/migrations/20260715050000_create_restaurant_membership_foundation.sql");
  const roleRows = [...permissionSource.matchAll(/\('(owner|manager|staff)',\s*'([^']+)',\s*'(self|restaurant|branch)'\)/g)].map((match) => ({role:match[1],scope:match[3]}));
  const accessRows = (role, branches, tenants=1) => roleRows.filter((row)=>row.role===role).reduce((count,row)=>count+(row.scope==="branch"?branches:1),0)*tenants;
  const maxOwner = {access:accessRows("owner",0),restaurants:1,branches:20,menus:8,categories:96,items:1600,branchItems:16000,nutrition:1600};
  const maxManager = {access:accessRows("manager",5),restaurants:1,branches:5,menus:reachableMenus.size,categories:reachableCategories.size,items:reachableItems,branchItems:reachableBranchItems,nutrition:reachableItems};
  const maxStaff = {...maxManager,access:accessRows("staff",5)};
  const typical = {access:accessRows("owner",0),restaurants:1,branches:4,menus:2,categories:8,items:80,branchItems:240,nutrition:80};
  const zero = {access:0,restaurants:0,branches:0,menus:0,categories:0,items:0,branchItems:0,nutrition:0};
  return { A01:maxOwner, A02:maxManager, A03:maxStaff, A04:typical, A05:{...typical,access:accessRows("owner",0,10),restaurants:10}, A06:zero, A07:typical, A08:zero, A09:zero };
}

function deriveIdentityGraph(a) {
  const pad = (value,width) => String(value).padStart(width,"0");
  const actorAtOrdinal = new Map(Object.entries(expectedActorOrdinals).map(([actorId,ordinal])=>[ordinal,actorId]));
  const users = Array.from({length:700},(_,userOrdinal)=>{
    const actorId=actorAtOrdinal.get(userOrdinal)??null;
    const authName=actorId?`${a.seed}:auth-actor:${actorId}`:`${a.seed}:auth-fill:${pad(userOrdinal,3)}`;
    const restaurantName=actorId?`${a.seed}:restaurant-user:${actorId}`:`${a.seed}:restaurant-user-fill:${pad(userOrdinal,3)}`;
    const authId=uuidv5(authName,a.uuidNamespace);
    return {userOrdinal,actorId,authName,authId,email:`perf-auth-${pad(userOrdinal,3)}@example.invalid`,restaurantName,restaurantUserId:uuidv5(restaurantName,a.uuidNamespace),restaurantAuthUserId:authId};
  });
  const overrideBySlot=new Map(expectedMembershipOverrides.map((entry)=>[`${entry.tenantOrdinal}:${entry.membershipOrdinal}`,entry]));
  const slots=[];
  for(let tenantOrdinal=0;tenantOrdinal<50;tenantOrdinal+=1){
    const count=tenantOrdinal===0?100:12;
    for(let membershipOrdinal=0;membershipOrdinal<count;membershipOrdinal+=1){
      const membershipSerial=tenantOrdinal===0?membershipOrdinal:100+(tenantOrdinal-1)*12+membershipOrdinal;
      slots.push({tenantOrdinal,membershipOrdinal,membershipSerial});
    }
  }
  const nonOverrideSerials=slots.filter((slot)=>!overrideBySlot.has(`${slot.tenantOrdinal}:${slot.membershipOrdinal}`)).map((slot)=>slot.membershipSerial);
  const nonOverrideRank=new Map(nonOverrideSerials.map((serial,rank)=>[serial,rank]));
  const memberships=slots.map((slot)=>{
    const override=overrideBySlot.get(`${slot.tenantOrdinal}:${slot.membershipOrdinal}`);
    const userOrdinal=override?.userOrdinal??9+nonOverrideRank.get(slot.membershipSerial);
    const membershipName=`${a.seed}:membership:${pad(slot.tenantOrdinal,2)}:${pad(slot.membershipOrdinal,3)}`;
    return {...slot,userOrdinal,actorId:override?.actorId??null,membershipName,membershipId:uuidv5(membershipName,a.uuidNamespace),restaurantUserId:users[userOrdinal]?.restaurantUserId};
  });
  const membershipIds=new Set(memberships.map((entry)=>entry.membershipId));
  const branchIds=new Set();
  for(let tenantOrdinal=0;tenantOrdinal<50;tenantOrdinal+=1){
    const count=tenantOrdinal===0?20:4;
    for(let branchOrdinal=0;branchOrdinal<count;branchOrdinal+=1) branchIds.add(uuidv5(`${a.seed}:branch:${pad(tenantOrdinal,2)}:${pad(branchOrdinal,2)}`,a.uuidNamespace));
  }
  const scopes=[];
  const addScope=(tenantOrdinal,membershipOrdinal,scopeOrdinal,status,branchOrdinal)=>{
    const membershipId=uuidv5(`${a.seed}:membership:${pad(tenantOrdinal,2)}:${pad(membershipOrdinal,3)}`,a.uuidNamespace);
    const branchId=uuidv5(`${a.seed}:branch:${pad(tenantOrdinal,2)}:${pad(branchOrdinal,2)}`,a.uuidNamespace);
    const scopeName=`${a.seed}:scope:${pad(tenantOrdinal,2)}:${pad(membershipOrdinal,3)}:${pad(scopeOrdinal,2)}:${status}`;
    scopes.push({tenantOrdinal,membershipOrdinal,scopeOrdinal,status,branchOrdinal,membershipId,branchId,scopeId:uuidv5(scopeName,a.uuidNamespace)});
  };
  for(let membershipOrdinal=10;membershipOrdinal<=79;membershipOrdinal+=1){
    const actorOverride=membershipOrdinal===10||membershipOrdinal===45;
    const start=(membershipOrdinal-10)%18;
    for(let j=0;j<5;j+=1) addScope(0,membershipOrdinal,j,"active",actorOverride?j:(start+j)%18);
  }
  for(let membershipOrdinal=10;membershipOrdinal<=59;membershipOrdinal+=1){
    const start=(membershipOrdinal-10)%18;
    addScope(0,membershipOrdinal,5,"inactive",membershipOrdinal===45?5:(start+5)%18);
  }
  for(let tenantOrdinal=1;tenantOrdinal<50;tenantOrdinal+=1){
    for(let membershipOrdinal=2;membershipOrdinal<=7;membershipOrdinal+=1) for(let j=0;j<2;j+=1) addScope(tenantOrdinal,membershipOrdinal,j,"active",(membershipOrdinal+j)%3);
    for(let membershipOrdinal=8;membershipOrdinal<=11;membershipOrdinal+=1) addScope(tenantOrdinal,membershipOrdinal,0,"inactive",membershipOrdinal%4);
  }
  return {users,memberships,scopes,membershipIds,branchIds};
}

function validateIdentityGraph(graph) {
  const issues=[];
  const unique=(values)=>new Set(values).size===values.length;
  if(graph.users.length!==700||!unique(graph.users.map((entry)=>entry.authName))||!unique(graph.users.map((entry)=>entry.authId))||!unique(graph.users.map((entry)=>entry.email))) issues.push("identity-auth-generated");
  const authIds=new Set(graph.users.map((entry)=>entry.authId));
  const restaurantUserIds=new Set(graph.users.map((entry)=>entry.restaurantUserId));
  if(!unique(graph.users.map((entry)=>entry.restaurantName))||!unique(graph.users.map((entry)=>entry.restaurantUserId))||!unique(graph.users.map((entry)=>entry.restaurantAuthUserId))||graph.users.some((entry)=>!authIds.has(entry.restaurantAuthUserId)||entry.restaurantAuthUserId!==entry.authId)) issues.push("identity-restaurant-generated");
  const membershipUsers=new Map();
  for(const membership of graph.memberships) membershipUsers.set(membership.userOrdinal,(membershipUsers.get(membership.userOrdinal)??0)+1);
  if(graph.memberships.length!==688||new Set(graph.memberships.map((entry)=>entry.membershipSerial)).size!==688||new Set(graph.memberships.map((entry)=>entry.membershipId)).size!==688||graph.memberships.some((entry)=>!restaurantUserIds.has(entry.restaurantUserId))) issues.push("identity-membership-generated");
  if(membershipUsers.size!==679||membershipUsers.get(4)!==10||[...membershipUsers].some(([ordinal,count])=>ordinal!==4&&count!==1)) issues.push("identity-membership-duplicates");
  const nonMembers=graph.users.map((entry)=>entry.userOrdinal).filter((ordinal)=>!membershipUsers.has(ordinal));
  if(!same(nonMembers,expectedNonMemberOrdinals)) issues.push("identity-nonmembers-generated");
  const membershipBranchPairs=graph.scopes.map((entry)=>`${entry.membershipId}:${entry.branchId}`);
  if(graph.scopes.length!==1184||new Set(graph.scopes.map((entry)=>entry.scopeId)).size!==1184||new Set(membershipBranchPairs).size!==1184||graph.scopes.some((entry)=>!graph.membershipIds.has(entry.membershipId)||!graph.branchIds.has(entry.branchId))) issues.push("identity-scopes-generated");
  return issues;
}

function validateAuthority(a) {
  const issues = [];
  const add = (condition, code) => { if (!condition) issues.push(code); };
  add(a.authorityId === "P2V-PERF-001A-C1" && a.baselineHead === baselineHead && a.seed === 2026072101 && a.postgresVersion === "17.6", "identity");
  add(a.productionSla === false, "production-sla");
  add(a.suiteRepetitions === 2 && a.warmupRunsPerTrack === 2 && a.measuredWarmRunsPerTrack === 7, "run-counts");
  add(uniqueExact(a.functions.map((entry)=>entry.name), expectedFunctions), "function-set");
  add(uniqueExact(a.actors.map((entry)=>entry.actorId), expectedActors), "actor-set");
  add(uniqueExact(a.cases.map((entry)=>entry.caseId), expectedCases), "case-set");
  add(a.cases.length === 35, "case-count");
  add(uniqueExact(Object.keys(a.thresholdProfiles), expectedProfiles), "profile-set");

  const d = a.dataset, max = d.maxTenant, noise = d.eachNoiseTenant, global = d.global;
  add(d.representativeTenants + d.noiseTenants === d.tenants && d.activeTenants + d.pausedTenants + d.draftTenants + d.archivedTenants === d.tenants, "arithmetic-tenants");
  add(max.activeBranches + max.inactiveBranches === max.branches && noise.activeBranches + noise.inactiveBranches === noise.branches && max.publishedMenus + max.draftMenus === max.menus && noise.publishedMenus + noise.draftMenus === noise.menus, "arithmetic-status");
  add(max.categories === max.menus*max.categoriesPerMenu && noise.categories === noise.menus*noise.categoriesPerMenu && max.items === max.menus*max.itemsPerMenu && noise.items === noise.menus*noise.itemsPerMenu, "arithmetic-shape");
  add(max.activeItems + max.draftItems + max.archivedItems === max.items && noise.activeItems + noise.draftItems + noise.archivedItems === noise.items, "arithmetic-items");
  add(max.branchMenuItems === max.items*max.itemBranchLinks && noise.branchMenuItems === noise.items*noise.itemBranchLinks && max.nutritionRows === max.items*max.nutritionVersionsPerItem && noise.nutritionRows === noise.items*noise.nutritionVersionsPerItem, "arithmetic-relations");
  add(max.activeOwnerMemberships+max.activeManagerMemberships+max.activeStaffMemberships+max.inactiveMemberships+max.suspendedMemberships+max.revokedMemberships===max.memberships && noise.activeOwnerMemberships+noise.activeManagerMemberships+noise.activeStaffMemberships+noise.inactiveMemberships+noise.suspendedMemberships+noise.revokedMemberships===noise.memberships, "arithmetic-memberships");
  add(max.activeBranchScopes+max.inactiveBranchScopes===max.branchScopes && noise.activeBranchScopes+noise.inactiveBranchScopes===noise.branchScopes && max.activeBranchScopes===(max.activeManagerMemberships+max.activeStaffMemberships)*max.activeBranchScopesPerScopedMember && noise.activeBranchScopes===(noise.activeManagerMemberships+noise.activeStaffMemberships)*noise.activeBranchScopesPerScopedMember, "arithmetic-scopes");
  const derivedGlobal = {restaurants:1+d.noiseTenants,branches:max.branches+d.noiseTenants*noise.branches,menus:max.menus+d.noiseTenants*noise.menus,categories:max.categories+d.noiseTenants*noise.categories,items:max.items+d.noiseTenants*noise.items,branchMenuItems:max.branchMenuItems+d.noiseTenants*noise.branchMenuItems,nutritionRows:max.nutritionRows+d.noiseTenants*noise.nutritionRows,currentNutritionRows:max.currentNutritionRows+d.noiseTenants*noise.currentNutritionRows,memberships:max.memberships+d.noiseTenants*noise.memberships,branchScopes:max.branchScopes+d.noiseTenants*noise.branchScopes};
  add(Object.entries(derivedGlobal).every(([key,value])=>global[key]===value), "arithmetic-global");
  add(global.publicViewEligibleNutritionRows===max.publicViewEligibleNutritionRows+(d.activeTenants-1)*noise.activeItems, "arithmetic-public");
  add(global.distinctUsersWithMembership===global.memberships-(10-1) && global.restaurantUsers===global.distinctUsersWithMembership+global.enabledNonMemberUsers && global.authUsers===global.restaurantUsers && global.enabledRestaurantUsers===global.restaurantUsers-global.disabledRestaurantUsers, "arithmetic-users");
  const mapping=a.generation.identityMapping??{};
  add(same(mapping.userOrdinalDomain,{base:0,minimum:0,maximum:699,count:700})&&same(mapping.actorReservedOrdinals,expectedActorOrdinals)&&same(mapping.authUsers?.fillerOrdinalDomain,{minimum:9,maximum:699,count:691})&&same(mapping.restaurantUsers?.fillerOrdinalDomain,{minimum:9,maximum:699,count:691}), "identity-ordinal-contract");
  add(mapping.authUsers?.actorNameInput==="`${seed}:auth-actor:${actorId}` for reserved ordinal actorId A01-A09"&&mapping.authUsers?.fillerNameInput==="`${seed}:auth-fill:${userOrdinal3}` where userOrdinal3 is the zero-based user ordinal padded to exactly three decimal digits"&&mapping.authUsers?.email==="`perf-auth-${userOrdinal3}@example.invalid` for every ordinal 000-699"&&/700 unique UUIDv5/.test(mapping.authUsers?.collisionRule??""), "identity-auth-contract");
  add(mapping.restaurantUsers?.actorNameInput==="`${seed}:restaurant-user:${actorId}` for reserved ordinal actorId A01-A09"&&mapping.restaurantUsers?.fillerNameInput==="`${seed}:restaurant-user-fill:${userOrdinal3}`"&&mapping.restaurantUsers?.authPairing==="restaurant_users row at userOrdinal u has auth_user_id equal to auth.users.id at the same userOrdinal u"&&/700 unique auth_user_id/.test(mapping.restaurantUsers?.collisionRule??""), "identity-restaurant-contract");
  add(mapping.membershipEnumeration?.serialFormula==="tenant 0: membershipSerial=membershipOrdinal; tenant 1-49: membershipSerial=100+(tenantOrdinal-1)*12+membershipOrdinal"&&same(mapping.membershipEnumeration?.serialDomain,{minimum:0,maximum:687,count:688})&&mapping.membershipEnumeration?.uuidNameInput==="`${seed}:membership:${tenantOrdinal2}:${membershipOrdinal3}`", "identity-membership-contract");
  add(same(mapping.membershipUserOverrides,expectedMembershipOverrides)&&/671 ranks 0-670 map bijectively to user ordinals 9-679/.test(mapping.nonOverrideMembershipUserRule??"")&&/Only A05\/userOrdinal 4/.test(mapping.duplicateException??""), "identity-membership-overrides");
  add(same(mapping.nonMemberUserOrdinals,expectedNonMemberOrdinals)&&/700 total user ordinals minus 679 membership-user ordinals = 21/.test(mapping.nonMemberDerivation??""), "identity-nonmember-contract");
  const identityGraph=deriveIdentityGraph(a);
  issues.push(...validateIdentityGraph(identityGraph));
  const foundation = text("supabase/migrations/20260715050000_create_restaurant_membership_foundation.sql");
  add((foundation.match(/\('(?:owner|manager|staff)',\s*'(?:access_context|restaurant|branch|menu|nutrition)\.read',\s*'(?:self|restaurant|branch)'\)/g)??[]).length===global.rolePermissions && (foundation.match(/'00000000-0000-4000-8000-00000000000[123]'/g)??[]).length>=global.restaurantRoles, "source-role-permissions");

  const targetSpecs = [["maxTenant",0],["noiseTenant01",1],["noiseTenant49",49]];
  add(targetSpecs.every(([key,ordinal])=>a.targets[key].uuidName===`${a.seed}:restaurant:${String(ordinal).padStart(2,"0")}` && a.targets[key].restaurantUuid===uuidv5(a.targets[key].uuidName,a.uuidNamespace)), "target-uuid");
  const actorLocations = {A01:[0,0],A02:[0,10],A03:[0,45],A04:[1,1],A05:[1,0],A07:[49,0],A08:[0,80],A09:[0,1]};
  const actorStates={A01:["owner","active","enabled"],A02:["manager","active","enabled"],A03:["staff","active","enabled"],A04:["owner","active","enabled"],A05:["owner","active","enabled"],A06:[null,null,"enabled"],A07:["owner","active","enabled"],A08:["owner","inactive","enabled"],A09:["owner","active","disabled"]};
  const derivedTuples = derivedActorTuples(a);
  add(a.actors.every((actor)=>actor.authUserUuid===uuidv5(`${a.seed}:auth-actor:${actor.actorId}`,a.uuidNamespace) && actor.restaurantUserUuid===uuidv5(`${a.seed}:restaurant-user:${actor.actorId}`,a.uuidNamespace)), "actor-uuid");
  add(a.actors.every((actor)=>{const loc=actorLocations[actor.actorId];return !loc ? actor.membershipUuid===null : actor.membershipUuid===uuidv5(`${a.seed}:membership:${String(loc[0]).padStart(2,"0")}:${String(loc[1]).padStart(3,"0")}`,a.uuidNamespace);}), "actor-membership");
  add(a.actors.every((actor)=>same([actor.role,actor.membershipStatus,actor.loginStatus],actorStates[actor.actorId])&&same(actor.membershipLocation,actorLocations[actor.actorId]?{tenantOrdinal:actorLocations[actor.actorId][0],membershipOrdinal:actorLocations[actor.actorId][1]}:null)), "actor-state");
  add(a.actors.every((actor)=>same(actor.expected,derivedTuples[actor.actorId])), "actor-derivation");
  const branches = Array.from({length:5},(_,ordinal)=>uuidv5(`${a.seed}:branch:00:${String(ordinal).padStart(2,"0")}`,a.uuidNamespace));
  add(["A02","A03"].every((id)=>same(a.actors.find((actor)=>actor.actorId===id).branchUuids,branches)), "actor-branches");
  add(same(a.actors.find((actor)=>actor.actorId==="A05").portfolioTenantOrdinals,[1,2,3,4,5,6,7,8,9,10]), "actor-portfolio");

  const parsedFunctions = new Map();
  for (const fn of a.functions) {
    let parsed;
    try { parsed = extractFunction(text(fn.migration), fn.name); parsedFunctions.set(fn.name, parsed); } catch { issues.push("source-function-parse"); continue; }
    const expected = expectedMeta[fn.name];
    add(same(fn.input,expected.input) && same(parsed.input,expected.input), "source-input");
    add(same(fn.output,expected.output) && same(parsed.output,expected.output), "source-output");
    add(same(fn.identityKey,expected.identity), "source-identity");
    add(same(sorted(fn.tables),sorted(expected.tables)) && same(parsed.tables,sorted(expected.tables)), "source-tables");
    add(same(sorted(fn.functionDependencies),sorted(expected.dependencies)) && same(parsed.dependencies,sorted(expected.dependencies)), "source-dependencies");
    add(fn.filter===expected.filter, "source-filter");
    add(fn.sort==="none" && fn.pagination==="none" && !parsed.hasSort && !parsed.hasLimit && !parsed.hasOffset, "source-sort-pagination");
    add(sha256(parsed.body)===fn.bodySha256, "body-hash");
    const tokenized = lexSql(parsed.body,{target:"p_restaurant_id"});
    add(tokenized.targetCount===fn.parameterTokens, "parameter-count");
    const replaced = lexSql(parsed.body,{target:"p_restaurant_id",replace:true});
    add(lexSql(replaced.output,{target:"p_restaurant_id"}).targetCount===0, "parameter-replacement");
    add(fn.expectedIndexes.every(indexExists), "source-index");
  }

  const functionByName = new Map(a.functions.map((entry)=>[entry.name,entry]));
  const actorById = new Map(a.actors.map((entry)=>[entry.actorId,entry]));
  const profileByName = a.thresholdProfiles;
  const noArgument = new Set(["restaurant_current_access_context_v1","restaurant_internal_restaurants_v1"]);
  const noiseCases = new Set(["B01","M01","K01","I01","J01","N01"]);
  const maxParameterized = new Set(["B02","M02","K02","I02","I03","J02","J03","N02","N03","D03","D04","D05","D06","D07","D08","P01","P02","P03","P04","P05","P06"]);
  add(a.cases.every((entry)=>functionByName.has(entry.functionName)&&actorById.has(entry.actorId)&&profileByName[entry.thresholdProfile]), "case-reference");
  add(a.cases.every((entry)=>["mandatory","diagnostic"].includes(entry.classification)), "case-classification");
  add(a.cases.filter((entry)=>entry.classification==="mandatory").length===29 && a.cases.filter((entry)=>entry.classification==="diagnostic").length===6, "case-class-count");
  add(a.cases.every((entry)=>typeof entry.purpose==="string"&&entry.purpose.length>0&&typeof entry.expectedAuthorizationDisposition==="string"), "case-purpose");
  add(a.cases.every((entry)=>{if(noArgument.has(entry.functionName))return same(entry.arguments,{})&&entry.targetRestaurantUuid===null; const expected=noiseCases.has(entry.caseId)?a.targets.noiseTenant01.restaurantUuid:a.targets.maxTenant.restaurantUuid; return same(entry.arguments,{p_restaurant_id:expected})&&entry.targetRestaurantUuid===expected;}), "case-argument");
  add(a.cases.every((entry)=>entry.classification==="mandatory"?(entry.outerEvidenceRequired&&entry.innerEvidenceRequired&&entry.authorizationEvidenceRequired):(!entry.outerEvidenceRequired&&entry.innerEvidenceRequired&&!entry.authorizationEvidenceRequired)), "case-evidence");
  add(a.cases.filter((entry)=>entry.classification==="diagnostic").every((entry)=>entry.page?.limit===100&&exactInteger(entry.page.offset)), "case-page");
  const fieldByFunction = {restaurant_current_access_context_v1:"access",restaurant_internal_restaurants_v1:"restaurants",restaurant_internal_branches_v1:"branches",restaurant_internal_menus_v1:"menus",restaurant_internal_menu_categories_v1:"categories",restaurant_internal_menu_items_v1:"items",restaurant_internal_branch_menu_items_v1:"branchItems",restaurant_internal_current_nutrition_v1:"nutrition"};
  add(a.cases.every((entry)=>{if(entry.classification==="diagnostic")return entry.expectedRows===100; if(entry.caseId.startsWith("D"))return entry.expectedRows===0; return entry.expectedRows===derivedTuples[entry.actorId][fieldByFunction[entry.functionName]];}), "case-expected-rows");

  const outerFields=["coldExecutionMs","warmMedianExecutionMs","warmMaxExecutionMs","maxPlanningMs","maxSharedHitBlocks","maxColdReadBlocks","maxWarmReadBlocks","maxLocalHitBlocks","maxLocalReadBlocks","maxTempReadBlocks","maxTempWrittenBlocks"];
  const innerFields=[...outerFields,"maxEstimateRatio","maxRowsRemoved","maxFanout","maxNestedLoopRows","maxSortMemoryKb","maxHashMemoryKb"];
  add(Object.entries(profileByName).every(([name,profile])=>(name==="pageDiagnostic"?profile.outer===null:outerFields.every((field)=>exactInteger(profile.outer?.[field])))&&innerFields.every((field)=>exactInteger(profile.inner?.[field]))&&["maxRows","maxPayloadBytes"].every((field)=>exactInteger(profile.result?.[field]))), "threshold-fields");
  add(Object.values(profileByName).every((profile)=>profile.inner.maxLocalHitBlocks===0&&profile.inner.maxLocalReadBlocks===0&&profile.inner.maxTempReadBlocks===0&&profile.inner.maxTempWrittenBlocks===0&&(!profile.outer||(profile.outer.maxLocalHitBlocks===0&&profile.outer.maxLocalReadBlocks===0&&profile.outer.maxTempReadBlocks===0&&profile.outer.maxTempWrittenBlocks===0))), "threshold-zero-buffers");
  add(a.cases.every((entry)=>entry.expectedRows<=profileByName[entry.thresholdProfile].result.maxRows), "threshold-row-cap");

  const e=a.execution;
  add(/seven measured(?: exact)? outer/.test(e.outerTrack.join(" "))&&/seven measured(?: exact)? inner/.test(e.innerTrack.join(" "))&&/different restart cycles/.test(e.coldBoundary)&&/OS\/page-cache\/device cold is not claimed/.test(e.coldBoundary), "cold-tracks");
  add(e.analyze.commands.length===3&&/after semantic hash/.test(e.analyze.timing)&&/pg_class\.reltuples/.test(e.relationSize.primarySource)&&/never choose/.test(e.relationSize.generatedCountCrossCheck), "analyze-relation-size");
  add(/Schema and Relation Name/.test(e.planRelationResolution.baseNode)&&/Actual Loops/.test(e.sequentialScanAlgorithm.effectiveExecutions)&&/>512/.test(e.sequentialScanAlgorithm.largeRepeated)&&/>=0\.25/.test(e.sequentialScanAlgorithm.largeSingle)&&/zero returned/.test(e.sequentialScanAlgorithm.zeroReturn), "scan-algorithm");
  add(/jsonb_agg/.test(e.payload)&&/identityKey/.test(e.payload)&&/UTF8/.test(e.payload), "payload-definition");
  add(e.lexer.states.length>=11&&/arbitrarily nested/.test(e.lexer.states.join(" "))&&/replace only those token spans/.test(e.lexer.replacement)&&/exactly one text parameter/.test(e.lexer.binding), "lexer-contract");
  add(/Only exact outer/.test(e.authorizationEvidence)&&/Inner plans never substitute/.test(e.authorizationEvidence)&&/does not fail the mandatory suite/.test(e.diagnosticDisposition)&&/both fresh suites must pass/.test(e.mandatoryDisposition), "evidence-disposition");
  add(/repository-external/.test(e.artifacts), "artifact-boundary");
  const generation=a.generation, tableKeys=Object.keys(generation.tables), semantic=generation.semanticHash??{};
  add(same(generation.generationOrder,expectedGenerationOrder)&&uniqueExact(generation.generationOrder,expectedGenerationOrder)&&uniqueExact(tableKeys,expectedGenerationOrder), "generation-order");
  add(same(semantic.tableOrder,expectedGenerationOrder)&&same(semantic.tableOrder,generation.generationOrder), "semantic-table-order");
  add(same(semantic.rowOrder,expectedRowOrder)&&Object.values(semantic.rowOrder??{}).every((value)=>typeof value==="string"&&value.length>0), "semantic-row-order");
  add(same(semantic.includedColumns,expectedHashColumns)&&Object.keys(semantic.includedColumns??{}).every((key)=>tableKeys.includes(key)), "semantic-columns");
  add(/RFC 8785/.test(semantic.envelope??"")&&/64 lowercase hexadecimal/.test(semantic.algorithm??"")&&/no trailing LF/.test(semantic.bytes??"")&&/UUIDs are lowercase/.test(semantic.scalarCanonicalization??"")&&/SQL numeric is a JSON string/.test(semantic.scalarCanonicalization??"")&&/separate table objects/.test(semantic.seedRows??""), "semantic-canonicalization");
  add(tableKeys.every((key)=>typeof generation.tables[key].rowFormula==="string"&&typeof generation.tables[key].primaryKey==="string")&&/categoryOrdinal = itemWithinMenu mod categoriesPerMenu/.test(generation.tables.menu_items.foreignKeys.menu_category_id)&&/4256/.test(generation.tables.menu_item_nutrition.eligibilityDerivation), "field-generation");
  add(/scopeOrdinal is j=0\.\.4/.test(generation.tables.restaurant_membership_branch_scopes.primaryKey)&&/A03 membership ordinal 45 uses branch ordinal 5/.test(generation.tables.restaurant_membership_branch_scopes.fields.maxInactive)&&/scopeSerial/.test(generation.tables.restaurant_membership_branch_scopes.fields.created_at), "scope-generation-contract");
  add(a.generation.prohibitions.includes("service_role capability")&&!/postgres(?:ql)?:\/\//i.test(JSON.stringify(a)), "security-boundary");
  add(!/1249|1,249/.test(JSON.stringify(a.thresholdProfiles))&&/not\s+extrapolated/.test(contract), "small-fixture-boundary");
  add(/not a cloud or final Production SLA/.test(contract)&&/different restart\s+cycles/.test(contract)&&/35 unique cases/.test(contract), "markdown-sync");
  return [...new Set(issues)];
}

const checks = [];
function record(name, pass, detail) {
  checks.push({name,pass});
  console.log(`${pass?"PASS":"FAIL"} ${name}${detail===undefined?"":` ${JSON.stringify(detail)}`}`);
}

const gitSnapshot = currentGitSnapshot();
const gitIssues = validateGitSnapshot(gitSnapshot);
const authorityIssues = validateAuthority(authority);
const groups = [
  ["Git branch HEAD staged and exact candidate inventory",["git-branch","git-head","git-staged","git-candidate","git-status-kind"]],
  ["protected migration RPC index schema and application paths unchanged",["git-protected"]],
  ["authority identity seed PostgreSQL and non-SLA boundary",["identity","production-sla","run-counts"]],
  ["exact unique function actor case and profile sets",["function-set","actor-set","case-set","case-count","profile-set"]],
  ["tenant status and shape arithmetic",["arithmetic-tenants","arithmetic-status","arithmetic-shape","arithmetic-items"]],
  ["relation membership and scope arithmetic",["arithmetic-relations","arithmetic-memberships","arithmetic-scopes"]],
  ["global public nutrition and user arithmetic",["arithmetic-global","arithmetic-public","arithmetic-users"]],
  ["700-user ordinal actor filler and formula contracts are exact",["identity-ordinal-contract","identity-auth-contract","identity-restaurant-contract"]],
  ["all 700 Auth identities are independently generated unique and collision-free",["identity-auth-generated"]],
  ["all 700 restaurant-user identities and Auth pairings are independently valid",["identity-restaurant-generated"]],
  ["all 688 membership serial UUID and user allocations are independently valid",["identity-membership-contract","identity-membership-overrides","identity-membership-generated","identity-membership-duplicates"]],
  ["exact 21 non-member identities are the independently derived complement",["identity-nonmember-contract","identity-nonmembers-generated"]],
  ["all 1184 scope PK FK and membership-branch pairs are independently valid",["identity-scopes-generated","scope-generation-contract"]],
  ["frozen roles and permissions independently counted",["source-role-permissions"]],
  ["literal target UUIDs independently derived",["target-uuid"]],
  ["actor UUID membership role state and tuple derivation",["actor-uuid","actor-membership","actor-state","actor-derivation"]],
  ["A02 A03 branches and A05 portfolio independently derived",["actor-branches","actor-portfolio"]],
  ["frozen function parser succeeds",["source-function-parse"]],
  ["frozen inputs outputs and identity keys match",["source-input","source-output","source-identity"]],
  ["frozen tables dependencies and filters match",["source-tables","source-dependencies","source-filter"]],
  ["frozen sort and pagination absence matches",["source-sort-pagination"]],
  ["body hashes match before transformation",["body-hash"]],
  ["lexer-aware parameter counts and replacements match",["parameter-count","parameter-replacement"]],
  ["every declared index exists in frozen migrations",["source-index"]],
  ["all cases resolve exact actor function profile references",["case-reference"]],
  ["all 35 classifications and evidence obligations are exact",["case-classification","case-class-count","case-evidence"]],
  ["all cases have exact executable arguments",["case-argument"]],
  ["case purposes pages and authorization dispositions are complete",["case-purpose","case-page"]],
  ["case expected rows are independently derived",["case-expected-rows"]],
  ["outer inner result threshold schemas are complete",["threshold-fields"]],
  ["local and temp buffer limits are exact zero",["threshold-zero-buffers"]],
  ["case row caps resolve and are sufficient",["threshold-row-cap"]],
  ["outer and inner cold tracks are separate and complete",["cold-tracks"]],
  ["ANALYZE and relation-size authority are executable",["analyze-relation-size"]],
  ["sequential scan algorithm is executable",["scan-algorithm"]],
  ["canonical payload definition is executable",["payload-definition"]],
  ["SQL lexer contract covers required states",["lexer-contract"]],
  ["outer inner authorization and diagnostic dispositions are separate",["evidence-disposition"]],
  ["13 generation-order entries exactly biject table keys",["generation-order"]],
  ["semantic hash table and deterministic row order are exact",["semantic-table-order","semantic-row-order"]],
  ["semantic hash columns scalar serialization and bytes are executable",["semantic-columns","semantic-canonicalization"]],
  ["field-level generation scope uniqueness and artifact boundary are complete",["field-generation","scope-generation-contract","artifact-boundary"]],
  ["security and small-fixture boundaries hold",["security-boundary","small-fixture-boundary"]],
  ["Markdown and JSON authority are synchronized",["markdown-sync"]]
];
for (const [name,codes] of groups) {
  const present = codes.filter((code)=>gitIssues.includes(code)||authorityIssues.includes(code));
  record(name,present.length===0,present);
}
record("migration inventory is exactly 41",migrationFiles.length===41,migrationFiles.length);
record("formal baseline migration sorts first",migrationFiles[0]==="20260712120000_create_restaurant_platform_baseline.sql",migrationFiles[0]);
const migrationDrift=migrationFiles.filter((name)=>{const relative=`supabase/migrations/${name}`;const frozen=git(["rev-parse",`HEAD:${relative}`],true);const live=git(["hash-object",`--path=${relative}`,relative],true);return frozen.status!==0||live.status!==0||frozen.stdout.trim()!==live.stdout.trim();});
record("all 41 migrations are byte-identical to HEAD",migrationDrift.length===0,migrationDrift);

const lexerFixture = [
  "p_restaurant_id P_RESTAURANT_ID longer_p_restaurant_id",
  "'p_restaurant_id' E'p_restaurant_id\\\\n' U&'p_restaurant_id' \"p_restaurant_id\"",
  "-- p_restaurant_id\n/* p_restaurant_id /* nested p_restaurant_id */ end */",
  "$tag$p_restaurant_id$tag$ $$p_restaurant_id$$ $1"
].join("\n");
const fixture = lexSql(lexerFixture,{target:"p_restaurant_id",replace:true});
record("lexer fixtures count only two real identifiers",fixture.targetCount===2,fixture.targetCount);
record("lexer fixtures preserve comments literals quotes dollar quotes and longer identifiers",fixture.output.includes("longer_p_restaurant_id")&&fixture.output.includes("$tag$p_restaurant_id$tag$")&&fixture.output.includes("/* nested p_restaurant_id */")&&lexSql(fixture.output,{target:"p_restaurant_id"}).targetCount===0);

if (process.argv.includes("--self-test")) {
  const mutationChecks=[];
  const mutation=(name,mutate,code)=>{const value=clone(authority);mutate(value);const pass=validateAuthority(value).includes(code);mutationChecks.push(pass);console.log(`${pass?"PASS":"FAIL"} SELFTEST ${name}`);};
  const graphMutation=(name,mutate,code)=>{const graph=deriveIdentityGraph(authority);mutate(graph);const pass=validateIdentityGraph(graph).includes(code);mutationChecks.push(pass);console.log(`${pass?"PASS":"FAIL"} SELFTEST ${name}`);};
  mutation("missing non-actor Auth UUID formula",(value)=>{delete value.generation.identityMapping.authUsers.fillerNameInput;},"identity-auth-contract");
  mutation("changed filler ordinal base",(value)=>{value.generation.identityMapping.userOrdinalDomain.base=1;},"identity-ordinal-contract");
  mutation("actor filler ordinal collision",(value)=>{value.generation.identityMapping.authUsers.fillerOrdinalDomain.minimum=8;},"identity-ordinal-contract");
  mutation("wrong restaurant-user UUID name input",(value)=>{value.generation.identityMapping.restaurantUsers.fillerNameInput="wrong";},"identity-restaurant-contract");
  mutation("wrong Auth restaurant-user pairing rule",(value)=>{value.generation.identityMapping.restaurantUsers.authPairing="previous ordinal";},"identity-restaurant-contract");
  graphMutation("duplicate restaurant-user auth_user_id",(graph)=>{graph.users[10].restaurantAuthUserId=graph.users[9].restaurantAuthUserId;},"identity-restaurant-generated");
  mutation("wrong membership-user allocation",(value)=>{value.generation.identityMapping.membershipUserOverrides[0].userOrdinal=9;},"identity-membership-overrides");
  graphMutation("membership mapped to nonexistent restaurant-user",(graph)=>{graph.memberships[2].restaurantUserId="00000000-0000-0000-0000-000000000000";},"identity-membership-generated");
  mutation("wrong non-member count",(value)=>{value.generation.identityMapping.nonMemberUserOrdinals.pop();},"identity-nonmember-contract");
  mutation("wrong non-member identity set",(value)=>{value.generation.identityMapping.nonMemberUserOrdinals[0]=6;},"identity-nonmember-contract");
  mutation("missing generation-order table",(value)=>{value.generation.generationOrder.pop();},"generation-order");
  mutation("combined roles permissions generation-order entry",(value)=>{value.generation.generationOrder.splice(9,2,"restaurant_roles and role_permissions from migration seed");},"generation-order");
  mutation("duplicate generation-order key",(value)=>{value.generation.generationOrder[10]=value.generation.generationOrder[9];},"generation-order");
  mutation("extra generation-order key",(value)=>{value.generation.generationOrder.push("extra_table");},"generation-order");
  mutation("generation-order key absent from tables",(value)=>{value.generation.generationOrder[0]="missing_table";},"generation-order");
  mutation("wrong semantic-hash table order",(value)=>{[value.generation.semanticHash.tableOrder[0],value.generation.semanticHash.tableOrder[1]]=[value.generation.semanticHash.tableOrder[1],value.generation.semanticHash.tableOrder[0]];},"semantic-table-order");
  mutation("missing deterministic row order",(value)=>{delete value.generation.semanticHash.rowOrder["auth.users"];},"semantic-row-order");
  mutation("duplicate case ID",(value)=>{value.cases[1].caseId=value.cases[0].caseId;},"case-set");
  mutation("missing mandatory classification",(value)=>{delete value.cases[0].classification;},"case-classification");
  mutation("wrong exact parameter",(value)=>{value.cases.find((entry)=>entry.caseId==="B01").arguments.p_restaurant_id="wrong";},"case-argument");
  mutation("wrong dataset arithmetic",(value)=>{value.dataset.global.items+=1;},"arithmetic-global");
  mutation("wrong actor expected rows",(value)=>{value.actors[1].expected.items+=1;},"actor-derivation");
  mutation("nonexistent migration index",(value)=>{value.functions[0].expectedIndexes.push("missing_index_for_selftest");},"source-index");
  mutation("wrong RPC body hash",(value)=>{value.functions[0].bodySha256="0".repeat(64);},"body-hash");
  const extraSnapshot=clone(gitSnapshot);extraSnapshot.entries.push({status:"??",path:"unexpected.txt"});
  const extraPass=validateGitSnapshot(extraSnapshot).includes("git-candidate");mutationChecks.push(extraPass);console.log(`${extraPass?"PASS":"FAIL"} SELFTEST extra candidate path`);
  const protectedSnapshot=clone(gitSnapshot);protectedSnapshot.protectedPaths.push("apps/restaurant-web/example.ts");
  const protectedPass=validateGitSnapshot(protectedSnapshot).includes("git-protected");mutationChecks.push(protectedPass);console.log(`${protectedPass?"PASS":"FAIL"} SELFTEST modified protected path`);
  const literalOnly=lexSql("'p_restaurant_id' -- p_restaurant_id\n/* outer /* p_restaurant_id */ */ $x$p_restaurant_id$x$",{target:"p_restaurant_id"});
  const lexerPass=literalOnly.targetCount===0;mutationChecks.push(lexerPass);console.log(`${lexerPass?"PASS":"FAIL"} SELFTEST literal comment nested block and dollar quote exclusion`);
  console.log(`SELFTEST RESULT ${mutationChecks.filter(Boolean).length}/${mutationChecks.length} ${mutationChecks.every(Boolean)?"PASS":"FAIL"}`);
  if (!mutationChecks.every(Boolean)) process.exitCode=1;
}

const failed=checks.filter((entry)=>!entry.pass);
console.log(`RESULT ${checks.length-failed.length}/${checks.length} ${failed.length?"FAIL":"PASS"}`);
if (failed.length) process.exitCode=1;
