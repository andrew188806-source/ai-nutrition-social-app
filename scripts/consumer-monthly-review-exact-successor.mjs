// R1-A exact leaves (owner-private monthly nutrition review v1). OUTERMOST one-way successor on the accepted ENT-W1 main (9b120e3b). The root
// (consumer-retention-persistence-smoke.mjs) pins this module's blob; this module pins every R1-A leaf by mode and blob with its main identity (base).
// No self or root hash. A leaf with base null is new on main.
import fs from 'node:fs';import path from 'node:path';
export const R1A_BASE_COMMIT='9b120e3baebde27183700282a4fe617af34806e1';
export const R1A_MIGRATION='20261030120000_consumer_monthly_nutrition_review.sql';
// <R1A_FILES>
export const R1A_FILES=Object.freeze({
  "apps/mobile/app/me.tsx": {
    "mode": "100644",
    "blob": "aaec5f6e55f723b27f34fc9d8264e9bf333a44e8",
    "base": "f7043eb2e993de0def5b28ba9f87851de7ce82aa",
    "baseMode": "100644"
  },
  "apps/mobile/features/consumer-monthly-review/MonthlyNutritionReviewCard.tsx": {
    "mode": "100644",
    "blob": "1bf6128b9a63443c0a760a465fb7246e426cfa83",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/consumer-monthly-review/copy.ts": {
    "mode": "100644",
    "blob": "ef15f63d0d9cb5b8109277ede5f6590d55ac27f0",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/consumer-monthly-review/factory.ts": {
    "mode": "100644",
    "blob": "ac3a9a84206600eb0e1e0a473b5ac8b9f66d38f6",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/consumer-monthly-review/featureFlags.ts": {
    "mode": "100644",
    "blob": "410a5f466582f0a232cbeb9fba0af07bdcb490fb",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/consumer-monthly-review/mapper.ts": {
    "mode": "100644",
    "blob": "41711972f1206d3d0154d5f4f9a6199856e32105",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/consumer-monthly-review/service.ts": {
    "mode": "100644",
    "blob": "9d380af11581ca70110538cca22c4bc67bef07d4",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/consumer-monthly-review/types.ts": {
    "mode": "100644",
    "blob": "0f0ee4c297d35bac1eb2e4ae2f325fa5c17ab7a2",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/consumer-monthly-review/viewModel.ts": {
    "mode": "100644",
    "blob": "8a8a1c78c9f07bece6bc6e944e866f0461cb649f",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx": {
    "mode": "100644",
    "blob": "4559d341aa07de6d7441c7ea1c0c57ffb0c17987",
    "base": "e6c4904673e490d95746eef2ed2b6940b96bc53f",
    "baseMode": "100644"
  },
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts": {
    "mode": "100644",
    "blob": "1ae9a4a9cd9b3279b3e8963c426846e9b0d9b09e",
    "base": "dbbd23d7bdb2ab0f4977f5c7414b9817f471fcef",
    "baseMode": "100644"
  },
  "docs/planning/pc2-activation-preparation/04_RETENTION_CONTRACT_AND_ENGINEERING_SCOPE.md": {
    "mode": "100644",
    "blob": "5b7485c4cbd4be3f6711573dafb34f000b5e4a19",
    "base": "c4ffd17115702650ce0975bb55f13a59fd83b5bd",
    "baseMode": "100644"
  },
  "scripts/consumer-monthly-review-mutations.mjs": {
    "mode": "100644",
    "blob": "871a1fa6f10e58a4dc07f8dc831a52958d75e48c",
    "base": null,
    "baseMode": null
  },
  "scripts/consumer-monthly-review-smoke.mjs": {
    "mode": "100644",
    "blob": "6586d91b42f6d27dc89420810ac431786a833ec3",
    "base": null,
    "baseMode": null
  },
  "scripts/consumer-retention-acquisition-resolve-smoke.mjs": {
    "mode": "100644",
    "blob": "f732690348a1afae5da56421d16d893922a23aaf",
    "base": "ab226d334e1ab73078eb2043f3ff0e947f520eee",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-billing-edge-smoke.mjs": {
    "mode": "100644",
    "blob": "5e1e14cb022453f5acd49948c6c9afdf483dd7d8",
    "base": "63554e248fc473388c181e03d95a40a1e1071029",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-capture-smoke.mjs": {
    "mode": "100644",
    "blob": "c71372d2dd104460349ef0256161f89c6d3f9e8b",
    "base": "72d58d55d5830e8da2df00c795166d8e31d61331",
    "baseMode": "100644"
  },
  "supabase/migrations/20261030120000_consumer_monthly_nutrition_review.sql": {
    "mode": "100644",
    "blob": "7b3bbc1998dc66de11b22f78d89b61b517c65c2c",
    "base": null,
    "baseMode": null
  }
});
// </R1A_FILES>
export function r1aFilesState(git,root){
 const paths=Object.keys(R1A_FILES);if(paths.length===0)return {state:'invalid',paths:[],violations:['r1a:empty-record']};
 const staged=git(['ls-files','--stage','--',...paths]).trim().split('\n').filter(Boolean);const index=new Map(staged.map(v=>[v.slice(v.indexOf('\t')+1),v]));
 const present=paths.filter(p=>fs.existsSync(path.join(root,p)));const hashes=present.length?git(['hash-object','--',...present]).trim().split('\n'):[];const wt=new Map(present.map((p,i)=>[p,hashes[i]]));
 const exact=paths.every(p=>{const f=R1A_FILES[p];return index.get(p)===f.mode+' '+f.blob+' 0\t'+p&&wt.get(p)===f.blob;});
 if(exact)return {state:'record',paths,violations:[]};
 const unchanged=paths.every(p=>{const f=R1A_FILES[p];return f.base?index.get(p)===f.baseMode+' '+f.base+' 0\t'+p&&wt.get(p)===f.base:!index.has(p)&&!wt.has(p);});
 return unchanged?{state:'base',paths:[],violations:[]}:{state:'invalid',paths:[],violations:['r1a:partial-byte-mode-index-worktree-mismatch',...paths.filter(p=>{const f=R1A_FILES[p];return !(index.get(p)===f.mode+' '+f.blob+' 0\t'+p&&wt.get(p)===f.blob);}).map(p=>p+':r1a-mismatch')]};
}
// Only after the complete record matches: the exact R1-A leaves are presented at their accepted main identities (a new leaf disappears from the index view) to the older
// detectors, which run unchanged. Nothing else is altered: no source, index, worktree, assertion, unrelated path or application execution.
export function r1aPredecessorGit(git){return args=>{
 const out=git(args);
 if(args[0]==='ls-files'&&args.includes('--stage'))return out.split('\n').map(line=>{const at=line.indexOf('\t'),name=line.slice(at+1),f=R1A_FILES[name];return at<0||!f?line:f.base?f.baseMode+' '+f.base+' 0\t'+name:'';}).filter(Boolean).join('\n')+'\n';
 if(args[0]==='hash-object'&&args.includes('--')){const names=args.slice(args.indexOf('--')+1),lines=out.trim().split('\n');return names.map((name,i)=>R1A_FILES[name]?.base??lines[i]).join('\n')+'\n';}
 return out;
};}
