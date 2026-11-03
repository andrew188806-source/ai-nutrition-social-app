// AUTH-RECOVERY exact leaves (consumer password recovery: AAL2/TOTP step-up and admin/staff refusal). OUTERMOST one-way successor on the R1-A main (be8f7000).
// The root (consumer-retention-persistence-smoke.mjs) pins this module's blob; this module pins every AUTH leaf by mode and blob with its main identity (base).
// No self or root hash. A leaf with base null is new on main.
import fs from 'node:fs';import path from 'node:path';
export const AUTH_BASE_COMMIT='be8f700080181b9519e1eb4e720791259e6d4743';
// <AUTH_FILES>
export const AUTH_FILES=Object.freeze({
  "apps/mobile/app/account-password.tsx": {
    "mode": "100644",
    "blob": "b93d154f0ea1b9791ede0a89cfc66a6d8ae09f7f",
    "base": "bcd9e69889b69f2e2fde7997fa28e0fcc64cab59",
    "baseMode": "100644"
  },
  "apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts": {
    "mode": "100644",
    "blob": "650e7d1ea0754e1333bc3d9f74bdafcdb0ec35df",
    "base": "4e969076c34c8f75f5a643161bf5c3b92051421c",
    "baseMode": "100644"
  },
  "apps/mobile/features/consumer-auth/emailOtpController.ts": {
    "mode": "100644",
    "blob": "d86f227c243242699544e0d84d5ac5b82402232c",
    "base": "be0f1448afb4a889b9acfb4791d7b7e5215b6d3e",
    "baseMode": "100644"
  },
  "apps/mobile/features/consumer-auth/errors.ts": {
    "mode": "100644",
    "blob": "06774d146de3bd08dae2d1f84cf570b0a8d58a8d",
    "base": "5044fcec3c6ceedc9e42420233bdb9e91bac84d0",
    "baseMode": "100644"
  },
  "apps/mobile/features/consumer-auth/ports.ts": {
    "mode": "100644",
    "blob": "61fa36acd12a9a8ef4ef18d4e845e91b55813afd",
    "base": "055b3386f6b631eb9afc80eb34a284ce9ee92273",
    "baseMode": "100644"
  },
  "apps/mobile/features/consumer-auth/supabaseAuthContracts.ts": {
    "mode": "100644",
    "blob": "546d4cc3ce3ac5ac71ad4f7b3129742ff9d8c4f1",
    "base": "065cd9d5993d7c8ccdb29242a3fc679215d0ac99",
    "baseMode": "100644"
  },
  "apps/mobile/features/consumer-auth/supabaseAuthMappers.ts": {
    "mode": "100644",
    "blob": "6a925ce220b568f4bb81f4c52763e7268c068280",
    "base": "7200b1476d4f732ecfa5ad26616ae18dff039814",
    "baseMode": "100644"
  },
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts": {
    "mode": "100644",
    "blob": "2cb8167941c4811ddb425f7504828fc9f97bb4d4",
    "base": "1ae9a4a9cd9b3279b3e8963c426846e9b0d9b09e",
    "baseMode": "100644"
  },
  "scripts/consumer-auth-recovery-smoke.mjs": {
    "mode": "100644",
    "blob": "fddf2adf2f6d01f7aceebf449ca477f312446708",
    "base": null,
    "baseMode": null
  },
  "scripts/consumer-retention-acquisition-resolve-smoke.mjs": {
    "mode": "100644",
    "blob": "300440407a4c666a6ab8cd2159086585ef857742",
    "base": "f732690348a1afae5da56421d16d893922a23aaf",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-billing-edge-smoke.mjs": {
    "mode": "100644",
    "blob": "44f1d56ca0764c7d95b697273d35bb4e1a71f69a",
    "base": "5e1e14cb022453f5acd49948c6c9afdf483dd7d8",
    "baseMode": "100644"
  }
});
// </AUTH_FILES>
export function authFilesState(git,root){
 const paths=Object.keys(AUTH_FILES);if(paths.length===0)return {state:'invalid',paths:[],violations:['auth:empty-record']};
 const staged=git(['ls-files','--stage','--',...paths]).trim().split('\n').filter(Boolean);const index=new Map(staged.map(v=>[v.slice(v.indexOf('\t')+1),v]));
 const present=paths.filter(p=>fs.existsSync(path.join(root,p)));const hashes=present.length?git(['hash-object','--',...present]).trim().split('\n'):[];const wt=new Map(present.map((p,i)=>[p,hashes[i]]));
 const exact=paths.every(p=>{const f=AUTH_FILES[p];return index.get(p)===f.mode+' '+f.blob+' 0\t'+p&&wt.get(p)===f.blob;});
 if(exact)return {state:'record',paths,violations:[]};
 const unchanged=paths.every(p=>{const f=AUTH_FILES[p];return f.base?index.get(p)===f.baseMode+' '+f.base+' 0\t'+p&&wt.get(p)===f.base:!index.has(p)&&!wt.has(p);});
 return unchanged?{state:'base',paths:[],violations:[]}:{state:'invalid',paths:[],violations:['auth:partial-byte-mode-index-worktree-mismatch',...paths.filter(p=>{const f=AUTH_FILES[p];return !(index.get(p)===f.mode+' '+f.blob+' 0\t'+p&&wt.get(p)===f.blob);}).map(p=>p+':auth-mismatch')]};
}
// Only after the complete record matches: the exact AUTH leaves are presented at their R1-A main identities (a new leaf disappears from the index view) to the older
// detectors, which run unchanged. Nothing else is altered: no source, index, worktree, assertion, unrelated path or application execution.
export function authPredecessorGit(git){return args=>{
 const out=git(args);
 if(args[0]==='ls-files'&&args.includes('--stage'))return out.split('\n').map(line=>{const at=line.indexOf('\t'),name=line.slice(at+1),f=AUTH_FILES[name];return at<0||!f?line:f.base?f.baseMode+' '+f.base+' 0\t'+name:'';}).filter(Boolean).join('\n')+'\n';
 if(args[0]==='hash-object'&&args.includes('--')){const names=args.slice(args.indexOf('--')+1),lines=out.trim().split('\n');return names.map((name,i)=>AUTH_FILES[name]?.base??lines[i]).join('\n')+'\n';}
 return out;
};}
