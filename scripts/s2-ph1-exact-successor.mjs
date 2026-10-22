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
    "blob": "6c1d0bf3488c6a2f6617fe927c0cebb41a806322",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/profile-photo/controller.ts": {
    "mode": "100644",
    "blob": "12e387caf93690daf0390b30aa9e8ef5bd485149",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/profile-photo/media.ts": {
    "mode": "100644",
    "blob": "f392cc0e433a9f3145c0b10c92cbc559ae76114b",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/profile-photo/repository.ts": {
    "mode": "100644",
    "blob": "973b13cabbeacc81a5dc6d99e3b15277af4ee608",
    "base": null,
    "baseMode": null
  },
  "packages/shared/src/domain/profile-photo.ts": {
    "mode": "100644",
    "blob": "0a3ad1e6a05b569e5c00fc3b984c91880bfd5393",
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
    "blob": "c9a24da00e3958100f09edfa7d7de10ba0ff5347",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-ph1-host.mjs": {
    "mode": "100644",
    "blob": "3349a64be8871675dc1684aa5ee7807f9ef949d1",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-ph1-media-smoke.mjs": {
    "mode": "100644",
    "blob": "ba25884e8a0949e0e124160fbdbb41d9d59197c9",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-ph1-negative-controls.mjs": {
    "mode": "100644",
    "blob": "3ef88a247c5a5d1bcb26c95086c961cb30dacaae",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-ph1-postgres.mjs": {
    "mode": "100644",
    "blob": "424e8365ceb0582a7bed757a3050d5a5b3f2de9f",
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
    "blob": "7bf779c74e4c41bfa9c4224a09c87d8f3ec7a2ce",
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
    "blob": "745a7eb9b995261b50d9f54545ca88c184302d71",
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
  "supabase/functions/profile-photo/handler.test.ts": {
    "mode": "100644",
    "blob": "cce53d627d29542c0d535f24449c5caeaeadc655",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/handler.ts": {
    "mode": "100644",
    "blob": "09be5543d4fea8b72c6f0149af2fb927447b1839",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/index.ts": {
    "mode": "100644",
    "blob": "6efddb93efc2afcfa635f8c9f9c97684deb0efcb",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/profile-photo/pg.test.ts": {
    "mode": "100644",
    "blob": "30a62bf8da91de22745eed676bdd5ae1024c33b9",
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

