#!/usr/bin/env node
// Initial executor content seal, not legal approval/activation or independent Planner acceptance.
// Default validates only. Explicit --seal rewrites this record after authorized candidate edits.
import fs from "node:fs";import path from "node:path";import {fileURLToPath} from "node:url";
import {PC2_BASELINE,PC2_ALL_PATHS,pc2ChangedPaths,rawSha,isExactPc2} from "./pc2-consumer-onboarding-manifest.mjs";
// PC2-SEAL-BEGIN
const seal = {
  "baseline": "30268ee4de59a8d8855c1dcaa01795d2f1ce33b1",
  "kind": "EXECUTOR_LOCAL_NOT_PLANNER_ACCEPTANCE",
  "sha256": {
    "apps/mobile/app/account-support.tsx": "c7311c84f3c3206c571315ddd8395743e869cfa51fb78c71a5cf8df6d6c61461",
    "apps/mobile/app/auth-callback.tsx": "369aed07e40aa467118184f96f5a5ba7884567e2e7c76ea5d3c629be0113a376",
    "apps/mobile/app/consent-document.tsx": "d45286b431a27eb17dfbcf864a41e34bdf05efb6f87fe7c75b042ae2e6992311",
    "apps/mobile/app/login.tsx": "9ac837230ce2c66e0d4a709d85f56e95bd82827485081faa1e79220113ff314b",
    "apps/mobile/app/me.tsx": "bfec268de51a6cd2c351146d8e31a7cf58c5245e07a4c6f6c1b1f96aa1d25091",
    "apps/mobile/app/onboarding.tsx": "fb6b7ad7ac6f136528c3ce49ebe415f7303e7c2853ac51b26788cdc719ffa2c6",
    "apps/mobile/app/participation-settings.tsx": "450c07df8afb8dcf416d2f0fdcf42f08a5e5c5c55b6cc2012d8813a30f7ec18d",
    "apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts": "306b237c0b802390d38334a8ba3cc7d452fb0fa35d28623da6e44d3213988e94",
    "apps/mobile/features/consumer-auth/adapters/supabaseConsumerProfileRepository.ts": "6a9b604d87637097be9cd145fb4a7a40c8085e3631751827f10723f0ec8aa25b",
    "apps/mobile/features/consumer-auth/sessionStateStore.ts": "993342024759ef2f9b8ff7b69d81212157a2a98e50b6d6c1523d1a9e59a291b6",
    "apps/mobile/features/consumer-auth/supabaseAuthContracts.ts": "4fd153d20635f7a86d77fd68c1bfab39ca2f02607564504523184c5efefe18d1",
    "apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts": "6a6760f33d18d775272a440c6095d0273c80cea5941b11d144c1caca401a2828",
    "apps/mobile/features/consumer-auth/supabaseProfileContracts.ts": "3ce0d7e7d7811568d8784837e635c233603fe8dead9edc273e10bf41779706cb",
    "apps/mobile/features/consumer-auth/supabaseProfileMappers.ts": "293b96db707d0d0d47814c58522ee5265366696f6b9f0e0191d75f023768b07c",
    "apps/mobile/features/consumer-onboarding/ConsumerOnboardingProvider.tsx": "93ffcf5ea9da848522b41ded3dd891d3b6310f5fd1cb9f6a0de283b0d3ff45fc",
    "apps/mobile/features/consumer-onboarding/OnboardingScreen.tsx": "41210141a5f03e146c45f5134342c1e5a4544f47a3cc745bacd7b18eb3d4edd1",
    "apps/mobile/features/consumer-onboarding/authRedirect.ts": "51c28bece9b0a0033d14c18af113434f9913300dc4ac5389b69b20ad04c09cc7",
    "apps/mobile/features/consumer-onboarding/controller.ts": "ac4542485762d2aafc5cdfa6cb53661da66a1d5afc16f2bac8010cf159d50fa2",
    "apps/mobile/features/consumer-onboarding/copy.ts": "ee1290ede7a110534a50404a44a36baad0dbdd70798ae028bfd734e936eeb385",
    "apps/mobile/features/consumer-onboarding/types.ts": "c45ebd0be61343a173154953a0934dd3abffabf5f537470a8031c09586f1226b",
    "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx": "d675fb3f98a7c17d2efc001d5c4fb85db2ff1139e2646fa5f7d96da51e858c29",
    "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts": "99d4638b9bb9ce7337672f6fd6cc11bb0db5f816c5923e5b39d3bafa63336c96",
    "docs/planning/pc2-onboarding-preparation/01_MEMBERSHIP_TERMS_DRAFT_ZH_TW.md": "0a8111c0f5c952c7f7e837f9f727d5d1b32abdca0188af822b31291df71ceefd",
    "docs/planning/pc2-onboarding-preparation/02_PRIVACY_POLICY_DRAFT_ZH_TW.md": "bbe9b4ce16549486f99820fa0246238c99a3f3bc7628cfd8745e610a26e3fe58",
    "docs/planning/pc2-onboarding-preparation/03_AI_TRAINING_TERMS_DRAFT_ZH_TW.md": "c6a5868d47c56f872fcef02a2a447218b3d0b8df4cbc63979aaa5654880918c4",
    "docs/planning/pc2-onboarding-preparation/04_CONSENT_RECORD_CONTRACT.md": "e46db5dd79f402a6d8112c73c7c3a49c4024b1bc4cb58c51868e9434a9ac4a72",
    "docs/planning/pc2-onboarding-preparation/05_PROFILE_ONBOARDING_SOCIAL_CONTRACT.md": "3f4cf5eab1b66c64e6038fb2e27f74390b03a7c42128475833dbdd9bc65c3d3d",
    "docs/planning/pc2-onboarding-preparation/06_MI_E_C1_SUCCESSOR_PLAN.md": "38a2294a5373be4964a20a99a72d4459249089fbdafc759a4e5526753b254144",
    "docs/planning/pc2-onboarding-preparation/07_OWNER_REVIEW_SHEET.md": "4f8d91b59831a96c3a754bb797396765d7e9f5019811cf7038070f0513304941",
    "scripts/admin-dashboard-social-policies-d-guard.mjs": "56078c25ae0e1ef8a65e2ac30bd69a68153ddc76c314e421b54ecc78797c312a",
    "scripts/admin-operational-read-permissions-ae1-guard.mjs": "9b6e943adece0b81e5e63a3ec4286b402a6e71ce03054a6b242799ecd2da2163",
    "scripts/admin-operational-review-queues-c-guard.mjs": "ef65e9d8cf93cecabb464864702e79eaf0ef993ba84691baa751811c0363ce5c",
    "scripts/canonical-restaurant-menu-phase-2w-e0-guard.mjs": "0e8586681831dad8a66c6cbc4231d318c083fef22dee50d22ac8f2ab9c7d5d43",
    "scripts/consumer-auth-phase-1c-guard.mjs": "03d753aa237120ec51b663727157df139efa000b19ee2652ec22dc5ea531254f",
    "scripts/consumer-favorites-phase-2x-a-guard.mjs": "eaad1780e99f0b5ae4e91d86a91217ccc34f7a0b54a2b7d640fa4272a4ee77db",
    "scripts/consumer-favorites-phase-2x-b-guard.mjs": "a701a84e0623e60cfcc28ee882ce29fe5e24a9dab621acce968bba67421a4dc7",
    "scripts/consumer-favorites-phase-2x-c-a-guard.mjs": "2c4016a7ddd9d7216fa3609ffc4e17dddd69a4204aa700c70fc578c39d9f05ae",
    "scripts/consumer-favorites-phase-2x-c-b-guard.mjs": "11038ae2f817d5f3ef2a74e121a045a837d759b58abce91b822b38e698c2d84a",
    "scripts/consumer-favorites-phase-2x-d-a-guard.mjs": "162a531cc856769a74a11697b28724a81164cfd7027e4a00e974e7387aa54ac5",
    "scripts/consumer-favorites-phase-2x-d-b-guard.mjs": "faef79fa53ac24830c93126028e18d4083e8d05e6f51fe78677670dc68cdd157",
    "scripts/consumer-favorites-phase-2x-e-guard.mjs": "90625b6a5609f6b0b2bb90d2fcb8cf268383b8303e242e506be51c2f38c2b1e5",
    "scripts/consumer-profile-phase-1d-guard.mjs": "1a5cbed7742d316c15f7169afe0bffeba25f8ad65742e0d0caa74a7c85b266d2",
    "scripts/consumer-ratings-phase-2w-a-guard.mjs": "aec829d4a10046745942cef2dbf890851514df47b07b2efc75ae4cadabf9ff04",
    "scripts/consumer-ratings-phase-2w-b-guard.mjs": "08237798712cd7dd1ae8ec24b407cdade54bf81fa07c6467ecb071781afc26bc",
    "scripts/consumer-ratings-phase-2w-c-guard.mjs": "9663eec8b4c07540844fdca68dff2a6c333db24669e7ffb69ed74e3c96187c5f",
    "scripts/consumer-ratings-phase-2w-e-guard.mjs": "8c7b9d4c8c4c34ba4aa6e385766aa82cb1db5d54143bf46ecf9579e514080e1d",
    "scripts/consumer-recommendation-feedback-phase-2y-e-guard.mjs": "127383aa4f872cd5eae73ca393f5bf3876abfdffae49ba83ff95c8e168f14511",
    "scripts/consumer-runtime-mi-e-c5-r1-capability-flags-guard.mjs": "ebc86a38652b71245be7019f21286332f7f4db3cd56d1ba15116ebf2ae965f0b",
    "scripts/consumer-runtime-mi-e-c5-r3-guard.mjs": "9477ae6c5a663661e3ade5adebb075bfcfabbf83868ce3168a5c61633d8488f2",
    "scripts/consumer-ux-u1-guard.mjs": "18b1101af50dcd853cc7d4263b2ea58b6a1f55a5a57ada38fb30806bf84a5470",
    "scripts/gqa5-restaurant-read-repair-manifest.mjs": "df7f08831b68731df220ce0f898c0571f73c7889d3b7328a4b2a1c28352188d9",
    "scripts/gqa6r-stable-demo-repair-guard.mjs": "75ecfd9d289ceb845d423e435f5649eb27a34d34760acc016948dcbb0dc1a197",
    "scripts/gqa6r-stable-demo-repair-manifest.mjs": "dc11beaebbf0f2419c2f94145d1fc1ac6c4297bd68d79539ee25c149b2f6f80b",
    "scripts/meal-identification-finalization-mi-e-c5-r2-ui-guard.mjs": "3ab628ece84ee52640571fc6d9fab68c9fb4ec1dd2c86dbb797b9e37fa8b0012",
    "scripts/meal-identification-finalization-mi-e-c5-r5-ui-guard.mjs": "7051211576cf9ecbc3f9256c4c2ad1897bf61c8cdb79f7ed4534b80f6cca2073",
    "scripts/meal-identification-mi-c-a-guard.mjs": "ecd2e65a3d9d5e2b478a9bee44f46231a05906d3d2c249f7b2d3abd3e2147e06",
    "scripts/meal-photo-gallery-mi-e-c5-r4-guard.mjs": "f766b4c15c3c7b7b0a75e161e6fedc08175655ce999fb8e517d7d48029bbd07c",
    "scripts/pc1-consumer-closure-guard.mjs": "6b046cedd1cd25cd2a1b2a0f1d30e19c7306918ebbd981b106f5e3a9abdc21d1",
    "scripts/pc1-consumer-closure-manifest.mjs": "c17332eebd35027e19f1841bfb21836d203baf71ce1034e76673d3c588c35ba0",
    "scripts/pc2-consumer-onboarding-differential.mjs": "8ef37829de9da89e1e346d2528b981c24c61eef89c2711a9ae087d4e42458981",
    "scripts/pc2-consumer-onboarding-fixtures.mjs": "201e66319f9d3b0911d6943fb04de9186018e86563f32d2c511f88e100685b71",
    "scripts/pc2-consumer-onboarding-guard.mjs": "5e651d1c212051ce740acde7adc3dba30bf172681012ff71055541c6e6744ed5",
    "scripts/pc2-consumer-onboarding-manifest.mjs": "e6058585171f513ee46b3cc9105210047560d6152de0bdce67c72957f6d6c264",
    "scripts/pc2-consumer-onboarding-mutations.mjs": "5c989fc6f5ba919073d1f0d7ef74776c61767842f5151ea526a7c64bd4bde87b",
    "scripts/pc2-consumer-onboarding-postgres.mjs": "358180266cbd471d716bdbc6dff83e9cd7a2f09c229ff7bbcfa4ae6ebc8462cc",
    "scripts/pc2-consumer-onboarding-smoke.mjs": "2790bb3ccbae17653d84d782989672dea740f6cf887ef68cbdf7020d21472125",
    "scripts/pc2-consumer-onboarding-validation.json": "837783d32b09428f6295549fd335889aeed1c5d2c60cd851d4dce837ffadf278",
    "scripts/restaurant-catalog-authoring-r2b-guard.mjs": "62bc3fa93876df037bac5bd9c147956feb7dd86d71c5a04acbd2d2e0f7e2961b",
    "scripts/restaurant-owner-availability-ra-2b-p2-guard.mjs": "768493bce357f929d1438da194023834f30b6baeba373f5353f19611270ba316",
    "scripts/restaurant-owner-branch-display-name-ra-2e-p1-guard.mjs": "66a9495124ddbe51b9929bf8326fbf6c4668be5301d70236ac24996627a89a63",
    "scripts/restaurant-owner-branch-menu-item-display-name-ra-2f-p1-guard.mjs": "01bc7f486b47364f19bad85bdc025b01b8d2153e7f17693970c1784f3bb01e22",
    "scripts/restaurant-owner-branch-temporal-ra-2h-p1-guard.mjs": "6c479a23f6231ba04541f0e461ba84d26357d1eba805a3a9c2dae01deda67a5e",
    "scripts/restaurant-owner-display-name-draft-visibility-r2e-guard.mjs": "d43cd94f5f0400d3a872ea39d0cac6e84656b8083c0978e9a2ba2c08266a6185",
    "scripts/restaurant-owner-price-ra-2c-p1-guard.mjs": "bb960b38164389ce516fed9c81b4b316ab99d7e6cd0f80456c1c1851c401667c",
    "scripts/restaurant-owner-visibility-ra-2d-p1-guard.mjs": "c5edcd29f4ed4ba47a73213fc4d159dff3193353945dfc009e956fb1a02aa95b",
    "scripts/social-candidate-sr2d-guard.mjs": "154f113173e9f8ee941e5cf1fa35c97d71baf877fe6cb9f5c0d3ec9559608c45",
    "scripts/social-candidate-sr2f-guard.mjs": "9940fb553a001029004b3c1add19c90a474a2cf11746aa296ea91e959986fc83",
    "scripts/social-taste-sr1d-guard.mjs": "309e1a9c986cd9895d6e332728d18b7ec4d9509c17ba6292b160b176d708eb2e",
    "scripts/taste-foundation-ts2d-guard.mjs": "ac340f1b1533a5666d069386e566d72d50373ac56b6cf65335016fd5627c7e15",
    "supabase/functions/_shared/auth/authenticateCaller.ts": "30ad4fb6327e811a33ffc83f2b4b0c85b1614ac35d48b2f58ea1830ede4dd15e",
    "supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql": "79fb7610b5e1d5428e2bd986eb6e8388c9d521e1dae9780436e21a283f61a313",
    "supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql": "242ed04e5d948727c8f26ef187e1cb0ea1803ab4eb7db5a4c709f80f19f7ce8d"
  }
};
// PC2-SEAL-END
export const PC2_LOCAL_SEAL=Object.freeze(seal);
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const root=process.cwd();
 if(process.argv.includes("--seal")){
  if(JSON.stringify(pc2ChangedPaths(root))!==JSON.stringify(PC2_ALL_PATHS))throw Error("Cannot seal a different inventory");
  const sha256=Object.fromEntries(PC2_ALL_PATHS.filter(p=>p!=="scripts/pc2-consumer-onboarding-record.mjs").map(p=>[p,rawSha(fs.readFileSync(path.join(root,p)))]));
  const next={baseline:PC2_BASELINE,kind:"EXECUTOR_LOCAL_NOT_PLANNER_ACCEPTANCE",sha256};const file=fileURLToPath(import.meta.url),source=fs.readFileSync(file,"utf8");
  fs.writeFileSync(file,source.replace(/\/\/ PC2-SEAL-BEGIN[\s\S]*?\/\/ PC2-SEAL-END/,"// PC2-SEAL-BEGIN\nconst seal = "+JSON.stringify(next,null,2)+";\n// PC2-SEAL-END"));console.log(JSON.stringify({sealed:Object.keys(sha256).length,legalApproval:false}));
 }else{const valid=isExactPc2(root);console.log(JSON.stringify({valid,rewritten:false,kind:seal.kind}));if(!valid)process.exitCode=1;}
}
