import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root=path.resolve(import.meta.dirname,"..");
const git=(args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
const fail=(message)=>{ throw new Error(`Phase 2V-D preflight: ${message}`); };
if(git(["branch","--show-current"])!=="main") fail("branch must remain main");
if(git(["rev-parse","HEAD"])!=="6b96a3f6aa9e5d055a40ce1733fabd647b312189") fail("unexpected HEAD");
if(git(["diff","--cached","--name-only"])) fail("staged diff must remain empty");
const migrations=readdirSync(path.join(root,"supabase/migrations")).filter(name=>name.endsWith(".sql")).sort();
if(migrations.length!==33||migrations.at(-1)!=="20260716060000_restore_restaurant_internal_reader_set_option.sql") fail("migration baseline changed");
const frozen=git(["diff","--name-only","--","docs/runtime-integration-phase-2v-a","docs/runtime-integration-phase-2v-b","docs/runtime-integration-phase-2v-c","supabase/migrations"]);
if(frozen) fail(`frozen artifact changed: ${frozen}`);
console.log("Phase 2V-D preflight guard passed.");
