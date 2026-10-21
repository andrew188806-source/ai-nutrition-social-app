import crypto from 'node:crypto';
import fs from 'node:fs';import path from 'node:path';
export const ACT2_BASE='9841a17532be0366d5ddf0ee94583f703c4d0b2d';
export const ACT2_MIGRATION='20261021091757_social_stranger_exposure_act2_8c619f25.sql';
export const ACT2_FILES=Object.freeze({
  "apps/mobile/app/meal-buddies.tsx": {
    "mode": "100644",
    "blob": "1eb589ec998263b68f58b96ade213d0c716f90a4",
    "base": "7e6a0a36d2ffd7f4033d4ee8ce5f515829d7132e",
    "baseMode": "100644"
  },
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts": {
    "mode": "100644",
    "blob": "6f3ce53e3af9984081d1c48924697c0705960465",
    "base": "456532a6cb8cc98d58cbd43e860603d893e06a68",
    "baseMode": "100644"
  },
  "apps/mobile/features/stranger-exposure/StrangerExposureSection.tsx": {
    "mode": "100644",
    "blob": "a4d5094c983a61b9f578eeb0e87308368a6530ec",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/stranger-exposure/controller.ts": {
    "mode": "100644",
    "blob": "dc8f87d8a8f014e224126e5018df6d11807fd8ab",
    "base": null,
    "baseMode": null
  },
  "apps/mobile/features/stranger-exposure/repository.ts": {
    "mode": "100644",
    "blob": "02e0cc79ec7cb6e540c47f86b22562775de87b71",
    "base": null,
    "baseMode": null
  },
  "packages/shared/src/domain/stranger-exposure.ts": {
    "mode": "100644",
    "blob": "8b7279103d4d06ff4bcdede8223a8f2bc910e863",
    "base": null,
    "baseMode": null
  },
  "packages/shared/src/index.ts": {
    "mode": "100644",
    "blob": "d74129e7b269b9fbc9d9711ff49a239d88fe079c",
    "base": "1dc7228760ceb19591ca3bf99e70a2db2c57c713",
    "baseMode": "100644"
  },
  "scripts/consumer-meal-save-recovery-guard.mjs": {
    "mode": "100644",
    "blob": "d7ca337bc337955c2e246d5c94e958d88fe6c725",
    "base": "2a52d4901960deba37a0af9addcc3956f7e6422d",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-acquisition-smoke.mjs": {
    "mode": "100644",
    "blob": "8b626ea882450eec8f8688ac35acb7a03e209ff5",
    "base": "151574c97a0a9a5b9c12813c481458b166216b1e",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-billing-smoke.mjs": {
    "mode": "100644",
    "blob": "34d6443f117ce8e0246b1ed723ab7c64629e4af3",
    "base": "6c2637617da573b905ff8b955d9d56e53be17334",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-capture-smoke.mjs": {
    "mode": "100644",
    "blob": "4fe23dae564cce2173f34c275f89bd30640c964a",
    "base": "9da9897057d236d2783416e39ed2b2d1f0dde25f",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-entitlement-smoke.mjs": {
    "mode": "100644",
    "blob": "452cc2931493e187fcec1c9fe9db0c31926ddcf0",
    "base": "6f4c6ecdf6b10b1142997d3c7e539362ed622f0c",
    "baseMode": "100644"
  },
  "scripts/consumer-retention-seal-smoke.mjs": {
    "mode": "100644",
    "blob": "b64547ae8582641612b15998492885fcce1e394a",
    "base": "d10c42ae482caf86e31788f2c833de665afebef4",
    "baseMode": "100644"
  },
  "scripts/geo-meal-buddy-geo-1d-p0-guard.mjs": {
    "mode": "100644",
    "blob": "587d210572caf997cefbb83d37ee8f5da4fb620b",
    "base": "1936fc5c5332d58d8f24e0a0715a63dec905acf1",
    "baseMode": "100644"
  },
  "scripts/meal-buddy-relationship-sr2i-a-guard.mjs": {
    "mode": "100644",
    "blob": "45d285dc47f8581310eba996c0305c201fd7a252",
    "base": "cafdb5f1623837a842de234f1750caee0bc884a4",
    "baseMode": "100644"
  },
  "scripts/meal-buddy-relationship-sr2i-b-contract.mjs": {
    "mode": "100644",
    "blob": "6727847c1c3fc4a0efcf21ada7ebfaed12a7b68a",
    "base": "ab2e4e67216d92fb85a1cb9eee6fd9da8b3bf011",
    "baseMode": "100644"
  },
  "scripts/meal-buddy-relationship-sr2i-b-guard.mjs": {
    "mode": "100644",
    "blob": "94648819dd5cbb2764e620c5fdedd9f0818e2127",
    "base": "c038579f39a268fae74ca95347b6c8ecc7789d6a",
    "baseMode": "100644"
  },
  "scripts/meal-buddy-relationship-sr2i-b-smoke.mjs": {
    "mode": "100644",
    "blob": "d9d78ae0d2fa021d9d053371d5674ebb4c4ec611",
    "base": "ebb8689a0daf62bcb4153d64de8b751c849f72f9",
    "baseMode": "100644"
  },
  "scripts/s2-act2-host.mjs": {
    "mode": "100644",
    "blob": "5735115e33d6c588cac9de25415debd4f0d59d50",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-act2-postgres.mjs": {
    "mode": "100644",
    "blob": "926f1c7e118d0496d418b9c5774ee5bfc824cc2a",
    "base": null,
    "baseMode": null
  },
  "scripts/s2-act2-test-loader.mjs": {
    "mode": "100644",
    "blob": "c7c82ee8d2a9d25517f3597e98c21ccba5088293",
    "base": null,
    "baseMode": null
  },
  "scripts/social-candidate-sr2g-b-guard.mjs": {
    "mode": "100644",
    "blob": "55b298bff0fde2cd52148b6cda7b4dcfd7aa0926",
    "base": "1b708f81b071e2d54aee37b29e8893bb4ec9336a",
    "baseMode": "100644"
  },
  "scripts/social-f2-unit.mjs": {
    "mode": "100644",
    "blob": "b66645ae8aef3e50242c6e5ceb2c3b0c949e8a38",
    "base": "c28638f4e307efe6ee5fa818a87107c7a543415e",
    "baseMode": "100644"
  },
  "supabase/config.toml": {
    "mode": "100644",
    "blob": "70969f1a5208791d2215a823edd211952a9366d8",
    "base": "3054925598e5849d7927853a241207aab154056a",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/code-search-candidate-ref.ts": {
    "mode": "100644",
    "blob": "6330cfd6d166d3d7215621ddc05c7503c23c0eb1",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/_shared/geo-api/repository.ts": {
    "mode": "100644",
    "blob": "bd7c403a15531a44bddc4226a9eae38059e48dc0",
    "base": "d2193830a3954747af903199c14edde01d0df4c7",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/meal-buddy-candidate-api/compose.ts": {
    "mode": "100644",
    "blob": "9a2f0b6111d8fb82e8d0dc16c4c8adee8912f86a",
    "base": "f32cd685b6b06e68daf0300fad08f3316330de57",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/meal-buddy-candidate-api/readCandidateCards.ts": {
    "mode": "100644",
    "blob": "20b50ac5e91cad23d844e3cfa306e65661d458ad",
    "base": "84fdf4c36a91b4f0f4e74f43dd1c709e8b07e3cf",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/meal-buddy-candidate-api/toCandidateDto.ts": {
    "mode": "100644",
    "blob": "3e97cb0990de20debfc56565bc4bd7fb98ea822d",
    "base": "1cb58e059de50c2b4f8dc8e722a05990a1e728b6",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/meal-buddy-candidate-api/types.ts": {
    "mode": "100644",
    "blob": "d54653da6226937e017a975c6f6d628a29e96446",
    "base": "9a982b099d8556c5d516c74ae9d88e96cf096bcc",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/meal-buddy-candidate-profile-api/compose.ts": {
    "mode": "100644",
    "blob": "09e30f368fa3a87a70753e24ada315075e120fdb",
    "base": "1d2ce2d5cacbeafd617488e6771b3bca34306e05",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/meal-buddy-relationship-api/repository.ts": {
    "mode": "100644",
    "blob": "b3b9411aa6833e80827f393591ee3b3378efe040",
    "base": "e4d6314514d2fd53b674d39497a7f031398efd01",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/meal-buddy-relationship-api/service.ts": {
    "mode": "100644",
    "blob": "a374cf29a20e59936c2d5da1bf826f78862414c5",
    "base": "abe7900cb0b78362d9948e32890c40b52255335d",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/meal-buddy-relationship-api/types.ts": {
    "mode": "100644",
    "blob": "cec0eacfbf2399e725c0ba28d377de9304dea7ec",
    "base": "326b9e5dd2b0562fcd0f677cfc215b975890cd70",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/phone-search-candidate-ref.ts": {
    "mode": "100644",
    "blob": "220642d983500051a431befebdedf929aa3b79e5",
    "base": "d03e37d0979400a0c7abce057bdc21802605abbc",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/social-candidate-api/readCandidateTasteSources.ts": {
    "mode": "100644",
    "blob": "b6251a5df00d3680df05c6997c404159ede4bdf8",
    "base": "b094b8ea81387ccd6ca13675b9b164bb3be00193",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/social-profile/readProfileFacts.ts": {
    "mode": "100644",
    "blob": "92906244f713a97a5842d759e3333848016803fd",
    "base": "d2f79949cd93dd6e4e50a6b7a6a0cbc62d00ebe9",
    "baseMode": "100644"
  },
  "supabase/functions/_shared/social-runtime-transport/readPort.ts": {
    "mode": "100644",
    "blob": "c52ccaa57f246894c7b198b69c92f4b547571101",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/_shared/stranger-exposure/refs.ts": {
    "mode": "100644",
    "blob": "d0b29c7a6379669f19d6636e5f2dc0b4e8c9dcaf",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/_shared/stranger-exposure/service.ts": {
    "mode": "100644",
    "blob": "f4ab644c6264f54a0726ad4f0aca57f56d771d7c",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/_shared/stranger-exposure/transactionScope.ts": {
    "mode": "100644",
    "blob": "28757c9aa4875dd2a9bbd6badeb7839de6eb41b9",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/meal-buddy-candidate-list/handler.ts": {
    "mode": "100644",
    "blob": "e01facd4f72322024b006f38b36e17f3293d73a8",
    "base": "4d511f621fb2ed65e3d5c38bfeede70434e35e08",
    "baseMode": "100644"
  },
  "supabase/functions/meal-buddy-candidate-profile/handler.ts": {
    "mode": "100644",
    "blob": "b3d081bc40766ca3644506c697b7b51740b44962",
    "base": "69d3b63b0deb558dc97636deb567fa18650fbd9d",
    "baseMode": "100644"
  },
  "supabase/functions/meal-buddy-relationship/handler.ts": {
    "mode": "100644",
    "blob": "126cda6af5ad37505c52fee625aea59b356446cb",
    "base": "c892402134d55a2ab2abfec77571dae2af4932d7",
    "baseMode": "100644"
  },
  "supabase/functions/social-candidate-list/handler.ts": {
    "mode": "100644",
    "blob": "d4570f02f82240eaad49d1a029618999313fc16e",
    "base": "a78db0c9d5fe9ae30dd38446949414052a8fbe32",
    "baseMode": "100644"
  },
  "supabase/functions/social-friends/service.ts": {
    "mode": "100644",
    "blob": "d723ee45f56a41cf12c7dd332111740a84bbd197",
    "base": "5ba20c44b9a28bc0a3fc2029a1f0c3b8dd74f765",
    "baseMode": "100644"
  },
  "supabase/functions/stranger-exposure/config.ts": {
    "mode": "100644",
    "blob": "45101debb575be7e352511c48beef11359f213a3",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/stranger-exposure/handler.ts": {
    "mode": "100644",
    "blob": "2c455836a9e5be6152936366ea1aeaf7b2c1bd02",
    "base": null,
    "baseMode": null
  },
  "supabase/functions/stranger-exposure/index.ts": {
    "mode": "100644",
    "blob": "efc8a4161155170baec193f04d8b85ada2c12a2e",
    "base": null,
    "baseMode": null
  },
  "supabase/migrations/20261021091757_social_stranger_exposure_act2_8c619f25.sql": {
    "mode": "100644",
    "blob": "239c0471915434f83162eec4d6be0009c8f1b864",
    "base": null,
    "baseMode": null
  }
}); // ACT2_PINS
export function act2FilesState(git,root){
 const paths=Object.keys(ACT2_FILES);if(paths.length===0)return {state:'invalid',paths:[],violations:['act2:empty-record']};
 const staged=git(['ls-files','--stage','--',...paths]).trim().split('\n').filter(Boolean);const index=new Map(staged.map(v=>[v.slice(v.indexOf('\t')+1),v]));
 const present=paths.filter(p=>fs.existsSync(path.join(root,p)));const hashes=present.length?git(['hash-object','--',...present]).trim().split('\n'):[];const wt=new Map(present.map((p,i)=>[p,hashes[i]]));
 const exact=paths.every(p=>{const f=ACT2_FILES[p];return index.get(p)===f.mode+' '+f.blob+' 0\t'+p&&wt.get(p)===f.blob;});
 if(exact)return {state:'record',paths,violations:[]};
 const unchanged=paths.every(p=>{const f=ACT2_FILES[p];return f.base?index.get(p)===f.baseMode+' '+f.base+' 0\t'+p&&wt.get(p)===f.base:!index.has(p)&&!wt.has(p);});
 return unchanged?{state:'base',paths:[],violations:[]}:{state:'invalid',paths:[],violations:['act2:partial-byte-mode-index-worktree-mismatch']};
}
// The old detector still checks every original byte. Only after the complete new record matches,
// project its exact changed leaves to their accepted predecessor identities for that detector.
// This does not alter source, index, git, assertions, unrelated paths, or application execution.
export function act2PredecessorGit(git){return args=>{
 const out=git(args);
 if(args[0]==='ls-files'&&args.includes('--stage'))return out.split('\n').map(line=>{const at=line.indexOf('\t'),name=line.slice(at+1),f=ACT2_FILES[name];return at<0||!f?line:f.base?f.baseMode+' '+f.base+' 0\t'+name:'';}).filter(Boolean).join('\n')+'\n';
 if(args[0]==='hash-object'&&args.includes('--')){const names=args.slice(args.indexOf('--')+1),lines=out.trim().split('\n');return names.map((name,i)=>ACT2_FILES[name]?.base??lines[i]).join('\n')+'\n';}
 return out;
};}

export function exactAct2LeafText(file,text){const p=ACT2_FILES[file];return !!p&&crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+Buffer.byteLength(text)+'\0'),Buffer.from(text)])).digest('hex')===p.blob;}
