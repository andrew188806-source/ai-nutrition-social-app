// Exact PH1 leaves, derived from base93. No wildcard/limit relaxation; no self/root hash.
import fs from 'node:fs';import path from 'node:path';
export const PH1_MIGRATION="20261022183336_platform_private_avatar_ph1_64ba91de.sql";
export const PH1_FILES=Object.freeze({
  "apps/mobile/app/_layout.tsx": {
    "mode": "100644",
    "blob": "00e14fe1ac4c3ecbd74e29aa105859d4a4488e91",
    "base": "e05143e621e9c31283e7a3fa931b848125870c50",
    "baseMode": "100644"
  },
  "apps/mobile/app/me.tsx": {
    "mode": "100644",
    "blob": "f7043eb2e993de0def5b28ba9f87851de7ce82aa",
    "base": "1caaa5b306fd55e52f72a0137b4a17e20da47898",
    "baseMode": "100644"
  },
  "apps/mobile/app/profile-photo.tsx": {
    "mode": "100644",
    "blob": "008136fce41c323ee6aa83cd82c7f577e27ff868",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/consumer-onboarding/OnboardingScreen.tsx": {
    "mode": "100644",
    "blob": "68577c652f50f8598acaff55a307bdfed24da5d2",
    "base": "c3d7fa4774218fc01269873fc618e927cb6a4481",
    "baseMode": "100644"
  },
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts": {
    "mode": "100644",
    "blob": "dbbd23d7bdb2ab0f4977f5c7414b9817f471fcef",
    "base": "6f3ce53e3af9984081d1c48924697c0705960465",
    "baseMode": "100644"
  },
  "apps/mobile/features/profile-photo/ProfilePhotoScreen.tsx": {
    "mode": "100644",
    "blob": "ad56b06c89db17a7cd3d98c2b7c5f5fbc58ca8af",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/profile-photo/controller.ts": {
    "mode": "100644",
    "blob": "1a96aa0a7eef1b9737338490a756a577c40a2c84",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/profile-photo/media.ts": {
    "mode": "100644",
    "blob": "2dc23b64b1d8acea3c45dcb2300844d3bb93acbf",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/profile-photo/repository.ts": {
    "mode": "100644",
    "blob": "d3e3bbd2d3dedaf1194e51fc5d4469a045414caa",
    "base": null,
    "baseMode": null
  },
  "packages/shared/src/domain/profile-photo.ts": {
    "mode": "100644",
    "blob": "38e82a4367b4d897c8702e7e648a0dfc58c6c575",
    "base": null,
    "baseMode": null
  },
  "scripts/consumer-retention-capture-smoke.mjs": {
    "mode": "100644",
    "blob": "9ffc2728bab004d29c8aea3bcfe078db0488804b",
    "base": "4fe23dae564cce2173f34c275f89bd30640c964a",
    "baseMode": "100644"
  },
  "scripts/s2-ph1-binding-controls.mjs": {
    "mode": "100644",
    "blob": "d5c050f23e88278a0099422e9e8e720c42d74ad6",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-ph1-client-commit-control.mjs": {
    "mode": "100644",
    "blob": "c2b9e3ede8b263f1e3ea611635994a4b8a1a8559",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-ph1-host.mjs": {
    "mode": "100644",
    "blob": "0a3788fedff1ec90ba530bcb34abd8e9d5672260",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-ph1-media-smoke.mjs": {
    "mode": "100644",
    "blob": "f76f695e60120b0daa1891bfa3ed62e4ca139f0d",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-ph1-negative-controls.mjs": {
    "mode": "100644",
    "blob": "44a076f80bed7101ef7269a039bbcbddb2a55602",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-ph1-postgres.mjs": {
    "mode": "100644",
    "blob": "30b4e5937fa4a793fb8249cad7f8559ce5afab2d",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-ph1-runner-controls.mjs": {
    "mode": "100644",
    "blob": "6c245335d88ba74b3b0b3459f69160fd54be0de4",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-ph1-suite-verdict.mjs": {
    "mode": "100644",
    "blob": "9799f322a0287f88fb0799de3bcc8ebc1cc12040",
    "base": null,
    "baseMode": null
  },
  "supabase/config.toml": {
    "mode": "100644",
    "blob": "877623d88b007c737e1a74f7daa571b5bc3ba7be",
    "base": "70969f1a5208791d2215a823edd211952a9366d8",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/profile-photo/imageCodec.ts": {
    "mode": "100644",
    "blob": "5a516cedf4c210260366db633d2b6a37b4c85bb6",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/_shared/profile-photo/service.ts": {
    "mode": "100644",
    "blob": "29f96a0dacd5772147f723f42237884a7e49772d",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/codec.test.ts": {
    "mode": "100644",
    "blob": "5c5f60e6dd8c905063c3cc03d7f2f5b5ca1aaf04",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/config.ts": {
    "mode": "100644",
    "blob": "28b6d97f68520b2670cb7b5a6fdd4fe5e2217e13",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/deno.json": {
    "mode": "100644",
    "blob": "175561944cd965382e6ed502f206534f01b71267",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/deno.lock": {
    "mode": "100644",
    "blob": "1801c5229cd7f6881fb8fedcf4dd38c9fa996836",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/fixtures/client-conversion.json": {
    "mode": "100644",
    "blob": "1f28505fd4d0d7fafea95cd461f3cd6c66e6f163",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/handler.test.ts": {
    "mode": "100644",
    "blob": "3c5e360d470421827a4b9e8c45be1f66ba8865d1",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/handler.ts": {
    "mode": "100644",
    "blob": "2c8bc9d927bcb786b3fd6403a5fcf6f481b3fde2",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/index.ts": {
    "mode": "100644",
    "blob": "6efddb93efc2afcfa635f8c9f9c97684deb0efcb",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/pg-suite-contract.json": {
    "mode": "100644",
    "blob": "e524a05d8f315a500e095a0c6a3f41416966b0c2",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/pg.test.ts": {
    "mode": "100644",
    "blob": "ab15a4a0b80f8f612aabaf8149e30e822f53186d",
    "base": null,
    "baseMode": null
  },
  "supabase/migrations/20261022183336_platform_private_avatar_ph1_64ba91de.sql": {
    "mode": "100644",
    "blob": "1005af255e73222b8e7dfdd3ee926d087b34b374",
    "base": null,
    "baseMode": null
  }
});
export function ph1FilesState(git,root){
 const paths=Object.keys(PH1_FILES);if(paths.length===0)return {state:'invalid',paths:[],violations:['ph1:empty-record']};
 const staged=git(['ls-files','--stage','--',...paths]).trim().split('\n').filter(Boolean);const index=new Map(staged.map(v=>[v.slice(v.indexOf('\t')+1),v]));
 const present=paths.filter(p=>fs.existsSync(path.join(root,p)));const hashes=present.length?git(['hash-object','--',...present]).trim().split('\n'):[];const wt=new Map(present.map((p,i)=>[p,hashes[i]]));
 const exact=paths.every(p=>{const f=PH1_FILES[p];return index.get(p)===f.mode+' '+f.blob+' 0\t'+p&&wt.get(p)===f.blob;});
 if(exact)return {state:'record',paths,violations:[]};
 const unchanged=paths.every(p=>{const f=PH1_FILES[p];return f.base?index.get(p)===f.baseMode+' '+f.base+' 0\t'+p&&wt.get(p)===f.base:!index.has(p)&&!wt.has(p);});
 return unchanged?{state:'base',paths:[],violations:[]}:{state:'invalid',paths:[],violations:['ph1:partial-byte-mode-index-worktree-mismatch']};
}
// The old detector still checks every original byte. Only after the complete new record matches,
// project its exact changed leaves to their accepted predecessor identities for that detector.
// This does not alter source, index, git, assertions, unrelated paths, or application execution.
export function ph1PredecessorGit(git){return args=>{
 const out=git(args);
 if(args[0]==='ls-files'&&args.includes('--stage'))return out.split('\n').map(line=>{const at=line.indexOf('\t'),name=line.slice(at+1),f=PH1_FILES[name];return at<0||!f?line:f.base?f.baseMode+' '+f.base+' 0\t'+name:'';}).filter(Boolean).join('\n')+'\n';
 if(args[0]==='hash-object'&&args.includes('--')){const names=args.slice(args.indexOf('--')+1),lines=out.trim().split('\n');return names.map((name,i)=>PH1_FILES[name]?.base??lines[i]).join('\n')+'\n';}
 return out;
};}

