// Test harness resolution of the existing @haocu/shared workspace source; no product/dependency edit.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),Module=require('node:module');
const native=Module._load,root=process.cwd(),actualTs=require(path.join(root,'node_modules/typescript')),cache=new Map();
// Transparent cache of the existing pure single-file compiler, keyed by ALL source/options/version bytes.
// Mutation bytes get a different key. No compiler, diagnostics or product source is replaced.
const crypto=require('node:crypto'),cacheDir=process.env.PC2_TRANSPILE_CACHE||'/tmp/pc2-remediation-transpile-cache';fs.mkdirSync(cacheDir,{recursive:true});
function transpile(input,options){if(options?.transformers)return actualTs.transpileModule(input,options);const key=crypto.createHash('sha256').update(actualTs.version+'\n'+input+'\n'+JSON.stringify(options)).digest('hex'),file=path.join(cacheDir,key+'.json');try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{}const value=actualTs.transpileModule(input,options);try{const tmp=file+'.'+process.pid;fs.writeFileSync(tmp,JSON.stringify(value));fs.renameSync(tmp,file);}catch{}return value;}
const ts=new Proxy(actualTs,{get(target,key){return key==='transpileModule'?transpile:target[key];}});
function load(file){if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const req=name=>{if(name==='@haocu/shared')return load(path.join(root,'packages/shared/src/index.ts'));if(name.startsWith('.')){const p=path.resolve(path.dirname(file),name);const found=[p,p+'.ts',path.join(p,'index.ts')].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());if(found&&found.endsWith('.ts'))return load(found);}return Module.createRequire(file)(name);};
 vm.runInThisContext('(function(exports,require,module,__filename,__dirname){'+source+'\n})',{filename:file})(m.exports,req,m,file,path.dirname(file));return m.exports;
}
Module._load=function(name,parent,isMain){if(name==='typescript')return ts;if(name==='@haocu/shared')return load(path.join(root,'packages/shared/src/index.ts'));return native.apply(this,arguments);};
