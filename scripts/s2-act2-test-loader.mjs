// Local test loader: executes repository production TypeScript in Node without rewriting source.
// Only provider boundary imports are replaced; tests inject auth and a real PG transaction driver.
// This does NOT verify Supabase JWT verification, Deno serving, CORS or a deployed network.
import fs from "node:fs";import path from "node:path";import {createRequire} from "node:module";
const require_=createRequire(import.meta.url),ts=require_("typescript"),cache=new Map();
export function load(file){
 file=path.resolve(file);if(file.endsWith(".mjs"))return require_(file);const normalized=file.replaceAll("\\","/");
 if(normalized.endsWith("/_shared/auth/authenticateCaller.ts"))return {authenticateCaller:()=>{throw Error("test_auth_must_be_injected");}};
 if(normalized.endsWith("/social-runtime-transport/denoPostgresExecutorTransport.ts"))return {createDenoSocialRuntimeExecutorTransport:()=>{throw Error("test_pg_driver_must_be_injected");}};
 if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},fileName:file}).outputText;
 const localRequire=name=>{
  if(name==="npm:@supabase/supabase-js@2")return {createClient:()=>{throw Error("provider_must_be_injected")}};
  if(!name.startsWith("."))return require_(name);
  const base=path.resolve(path.dirname(file),name),resolved=[base,base+".ts",base+".tsx",path.join(base,"index.ts")].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
  if(!resolved)throw Error("unresolved "+name+" from "+file);
  return load(resolved);
 };
 try{new Function("require","module","exports",code)(localRequire,module,module.exports);}catch(e){e.message=file+": "+e.message;throw e;}return module.exports;
}
