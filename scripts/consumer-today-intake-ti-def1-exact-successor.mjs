// TI-DEF-1 exact leaves (Today Intake shows recorded nutrition truthfully: real fiber, per-nutrient coverage, no fiber-based vegetable verdict).
// OUTERMOST one-way successor on the AUTH-RECOVERY main (00119821). The root (consumer-retention-persistence-smoke.mjs) pins this module's blob;
// this module pins every TI leaf by mode and blob with its main identity (base). No self or root hash. A leaf with base null is new on main.
import fs from 'node:fs';import path from 'node:path';
export const TI_BASE_COMMIT='0011982104f7fc1abb5a71b9c8f8670b67516688';
// <TI_FILES>
export const TI_FILES=Object.freeze({
  "apps/mobile/components/NutritionDetailReport.tsx": {
    "mode": "100644",
    "blob": "993c655df796559af4d4ff666914eeca4fe94da9",
    "base": "40788a58ed84604b88fa7735e260a647473d6895",
    "baseMode": "100644"
  },
  "apps/mobile/components/TodayNutritionSummaryCard.tsx": {
    "mode": "100644",
    "blob": "70521ad67718a5ae2d0c338184c7d55b3993a112",
    "base": "46ba19517a1af7fa45d71734d5c169b836092c56",
    "baseMode": "100644"
  },
  "apps/mobile/features/analysis/nutritionSummary.ts": {
    "mode": "100644",
    "blob": "e62e128ab6909951b6f079dde9e2ed9a7c7ddb4c",
    "base": "4ceb2263dfd69c8021d1182403b2eeee93b84776",
    "baseMode": "100644"
  },
  "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts": {
    "mode": "100644",
    "blob": "fb064e9be18c2affc8942e25285819db826040a4",
    "base": "a55cb50e335200a0689f8521e7b02d7e46bb9f46",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-acquisition-resolve-smoke.mjs": {
    "mode": "100644",
    "blob": "e34973a66a85af31ceee24f3d2cfa378d980a8ba",
    "base": "300440407a4c666a6ab8cd2159086585ef857742",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-billing-edge-smoke.mjs": {
    "mode": "100644",
    "blob": "c583125328be57f6f837b0a7faf2ee1a49954118",
    "base": "44f1d56ca0764c7d95b697273d35bb4e1a71f69a",
    "baseMode": "100644"
  },
  "scripts/consumer-today-intake-ti-def1-smoke.mjs": {
    "mode": "100644",
    "blob": "a4e47cf0cd13cca2da125d7e44b403f76978a7d1",
    "base": null,
    "baseMode": null
  }
});
// </TI_FILES>
export function tiFilesState(git,root){
 const paths=Object.keys(TI_FILES);if(paths.length===0)return {state:'invalid',paths:[],violations:['ti:empty-record']};
 const staged=git(['ls-files','--stage','--',...paths]).trim().split('\n').filter(Boolean);const index=new Map(staged.map(v=>[v.slice(v.indexOf('\t')+1),v]));
 const present=paths.filter(p=>fs.existsSync(path.join(root,p)));const hashes=present.length?git(['hash-object','--',...present]).trim().split('\n'):[];const wt=new Map(present.map((p,i)=>[p,hashes[i]]));
 const exact=paths.every(p=>{const f=TI_FILES[p];return index.get(p)===f.mode+' '+f.blob+' 0\t'+p&&wt.get(p)===f.blob;});
 if(exact)return {state:'record',paths,violations:[]};
 const unchanged=paths.every(p=>{const f=TI_FILES[p];return f.base?index.get(p)===f.baseMode+' '+f.base+' 0\t'+p&&wt.get(p)===f.base:!index.has(p)&&!wt.has(p);});
 return unchanged?{state:'base',paths:[],violations:[]}:{state:'invalid',paths:[],violations:['ti:partial-byte-mode-index-worktree-mismatch',...paths.filter(p=>{const f=TI_FILES[p];return !(index.get(p)===f.mode+' '+f.blob+' 0\t'+p&&wt.get(p)===f.blob);}).map(p=>p+':ti-mismatch')]};
}
// Only after the complete record matches: the exact TI leaves are presented at their AUTH-RECOVERY main identities (a new leaf disappears from the index view) to the
// older detectors, which run unchanged. Nothing else is altered: no source, index, worktree, assertion, unrelated path or application execution.
export function tiPredecessorGit(git){return args=>{
 const out=git(args);
 if(args[0]==='ls-files'&&args.includes('--stage'))return out.split('\n').map(line=>{const at=line.indexOf('\t'),name=line.slice(at+1),f=TI_FILES[name];return at<0||!f?line:f.base?f.baseMode+' '+f.base+' 0\t'+name:'';}).filter(Boolean).join('\n')+'\n';
 if(args[0]==='hash-object'&&args.includes('--')){const names=args.slice(args.indexOf('--')+1),lines=out.trim().split('\n');return names.map((name,i)=>TI_FILES[name]?.base??lines[i]).join('\n')+'\n';}
 return out;
};}
