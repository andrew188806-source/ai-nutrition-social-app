// ENT-W1 exact leaves (retention line). OUTERMOST one-way successor on the accepted PH1 main (9d4d50c5). The root (consumer-retention-persistence-smoke.mjs) pins this module's blob; this module pins
// every ENT-W1 leaf by mode and blob with its main identity (base). No self or root hash. A leaf with base null is new on main.
import fs from 'node:fs';import path from 'node:path';
export const ENTW1_BASE_COMMIT='9d4d50c5026df1335c385cd387ddd83f7a435278';
export const ENTW1_MIGRATION='20261025010000_consumer_retention_acquisition_resolve_sweep.sql';
// <ENTW1_FILES>
export const ENTW1_FILES=Object.freeze({
  "docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md": {
    "mode": "100644",
    "blob": "26b66d9bb26a3b92c91b1c0ca6aa9f066f4dffbd",
    "base": "7eda851906fc3f4a03917ea0f68a03a9e924b8a6",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-acquisition-resolve-deno/index.ts": {
    "mode": "100644",
    "blob": "a7cca848055eb7304a0cd6a67f669c5da1b15a8b",
    "base": null,
    "baseMode": null
  },
  "scripts/consumer-retention-acquisition-resolve-deno/pg.ts": {
    "mode": "100644",
    "blob": "662f7cf2358bd85df1da132ee88f0a944a3bc8bd",
    "base": null,
    "baseMode": null
  },
  "scripts/consumer-retention-acquisition-resolve-deno/pure.ts": {
    "mode": "100644",
    "blob": "de4cfe7b80592020e662f44e9afdde10ed3ca6bd",
    "base": null,
    "baseMode": null
  },
  "scripts/consumer-retention-acquisition-resolve-mutations.mjs": {
    "mode": "100644",
    "blob": "2c90ea34424919293c2b2330adc56017927e44b4",
    "base": null,
    "baseMode": null
  },
  "scripts/consumer-retention-acquisition-resolve-smoke.mjs": {
    "mode": "100644",
    "blob": "ab226d334e1ab73078eb2043f3ff0e947f520eee",
    "base": null,
    "baseMode": null
  },
  "scripts/consumer-retention-acquisition-smoke.mjs": {
    "mode": "100644",
    "blob": "e7fa676df754ae12ec89bf0b458e79b452460a4c",
    "base": "8b626ea882450eec8f8688ac35acb7a03e209ff5",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-billing-edge-smoke.mjs": {
    "mode": "100644",
    "blob": "63554e248fc473388c181e03d95a40a1e1071029",
    "base": "2c693e963b5b62df0bb04d62a5cad9310c1696a6",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-capture-smoke.mjs": {
    "mode": "100644",
    "blob": "72d58d55d5830e8da2df00c795166d8e31d61331",
    "base": "79ff724a72bb10786af04c0d019e3ac9bcf5feff",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/acquisition-resolve/sql.ts": {
    "mode": "100644",
    "blob": "b0eaa9c1d7f56e66689411bc6ea8f070c85b807e",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/_shared/acquisition-resolve/worker.ts": {
    "mode": "100644",
    "blob": "9d74b3e9adcb7b0adb91f216df381d725196268b",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/retention-acquisition-resolve/config.ts": {
    "mode": "100644",
    "blob": "d570660ae034cd69bd1f120f52d983fd79b7b790",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/retention-acquisition-resolve/handler.ts": {
    "mode": "100644",
    "blob": "2914c2c116f28f30e8d4c3a0053d4ed2dc8a7501",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/retention-acquisition-resolve/index.ts": {
    "mode": "100644",
    "blob": "91613f8337c41d44b639d644e41392118ee52023",
    "base": null,
    "baseMode": null
  },
  "supabase/migrations/20261025010000_consumer_retention_acquisition_resolve_sweep.sql": {
    "mode": "100644",
    "blob": "d19d5d63a8e54477df465efdb34c50c5c61c0af4",
    "base": null,
    "baseMode": null
  }
});
// </ENTW1_FILES>
// <ENTW1_WIRING>
// The ONLY files under apps/, packages/ and supabase/functions/ that may name the acquisition schema or the resolver (names), and the ONLY module references that resolve into the ENT-W1 modules
// (edges, importer -> resolved target, as computed by the acquisition smoke's scanWiring). The acquisition smoke's P14 accepts exactly these, and only while the complete ENT-W1 record is exact; otherwise none, as before.
export const ENTW1_WIRING=Object.freeze({names:Object.freeze(["supabase/functions/_shared/acquisition-resolve/sql.ts"]),edges:Object.freeze(["supabase/functions/_shared/acquisition-resolve/worker.ts -> supabase/functions/_shared/acquisition-resolve/sql.ts","supabase/functions/retention-acquisition-resolve/handler.ts -> supabase/functions/_shared/acquisition-resolve/worker.ts","supabase/functions/retention-acquisition-resolve/handler.ts -> supabase/functions/retention-acquisition-resolve/config.ts","supabase/functions/retention-acquisition-resolve/index.ts -> supabase/functions/retention-acquisition-resolve/handler.ts"])});
// </ENTW1_WIRING>
export function entw1FilesState(git,root){
 const paths=Object.keys(ENTW1_FILES);if(paths.length===0)return {state:'invalid',paths:[],violations:['entw1:empty-record']};
 const staged=git(['ls-files','--stage','--',...paths]).trim().split('\n').filter(Boolean);const index=new Map(staged.map(v=>[v.slice(v.indexOf('\t')+1),v]));
 const present=paths.filter(p=>fs.existsSync(path.join(root,p)));const hashes=present.length?git(['hash-object','--',...present]).trim().split('\n'):[];const wt=new Map(present.map((p,i)=>[p,hashes[i]]));
 const exact=paths.every(p=>{const f=ENTW1_FILES[p];return index.get(p)===f.mode+' '+f.blob+' 0\t'+p&&wt.get(p)===f.blob;});
 if(exact)return {state:'record',paths,violations:[]};
 const unchanged=paths.every(p=>{const f=ENTW1_FILES[p];return f.base?index.get(p)===f.baseMode+' '+f.base+' 0\t'+p&&wt.get(p)===f.base:!index.has(p)&&!wt.has(p);});
 return unchanged?{state:'base',paths:[],violations:[]}:{state:'invalid',paths:[],violations:['entw1:partial-byte-mode-index-worktree-mismatch',...paths.filter(p=>{const f=ENTW1_FILES[p];return !(index.get(p)===f.mode+' '+f.blob+' 0\t'+p&&wt.get(p)===f.blob);}).map(p=>p+':entw1-mismatch')]};
}
// Only after the complete record matches: the exact ENT-W1 leaves are presented at their accepted main identities (a new leaf disappears from the index view) to the older detectors, which run unchanged.
// Nothing else is altered: no source, index, worktree, assertion, unrelated path or application execution.
export function entw1PredecessorGit(git){return args=>{
 const out=git(args);
 if(args[0]==='ls-files'&&args.includes('--stage'))return out.split('\n').map(line=>{const at=line.indexOf('\t'),name=line.slice(at+1),f=ENTW1_FILES[name];return at<0||!f?line:f.base?f.baseMode+' '+f.base+' 0\t'+name:'';}).filter(Boolean).join('\n')+'\n';
 if(args[0]==='hash-object'&&args.includes('--')){const names=args.slice(args.indexOf('--')+1),lines=out.trim().split('\n');return names.map((name,i)=>ENTW1_FILES[name]?.base??lines[i]).join('\n')+'\n';}
 return out;
};}
