#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const baseline = "846d76b4ada80c13a754d95dade3844ad0d3fda7";
const commitSubject = "Complete Consumer Runtime Phase 2Z-B3 planned meal mobile lifecycle";
const evidencePath = "docs/consumer-runtime-phase-2z/phase-2z-b3-development-validation-record.md";
const migration39 = "supabase/migrations/20260720020000_consumer_planned_meal_contract_v2.sql";
const migration40 = "supabase/migrations/20260721010000_consumer_planned_meal_version_conflict_sqlstate.sql";
const approvedB3D = [
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts", "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx",
  "apps/mobile/features/consumer-runtime/index.ts", "apps/mobile/features/planned-meal/types.ts",
  "apps/mobile/features/planned-meal/plannedMealStore.ts", "apps/mobile/features/planned-meal/PlannedMealComponents.tsx",
  "apps/mobile/features/planned-meal/index.ts", "apps/mobile/app/recommendation.tsx", "apps/mobile/app/meal-photo.tsx",
  "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts", "apps/mobile/app/today-intake.tsx", "apps/mobile/app/index.tsx",
  "lib/i18n/zh-TW.ts", "scripts/consumer-runtime-phase-2z-b3-d-mobile-planned-meal-guard.mjs",
  "scripts/consumer-runtime-phase-2z-b3-d-mobile-planned-meal-smoke.mjs"
];
const frozenB3BC1 = new Map(Object.entries({
  "apps/mobile/features/consumer-meals/types.ts":"a13caa15c6d355a492c22e5403be3ce5c0abe605e704af285abb8d069b4f32e5",
  "apps/mobile/features/consumer-meals/supabaseMealContracts.ts":"360ff9c4c9487d7ccb1c68a331ecc1059ec0140afb53e3d64cd741ee3d730bdd",
  "apps/mobile/features/consumer-meals/plannedMealMappers.ts":"3bafe442522b6c22cc9273da3b221efb44076f9eae4f96ac16709bc87872b7a8",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerPlannedMealsRepository.ts":"ed8de891d5552f58891681fb12c7d1efaa4834a4f1dab7c5a2f567d6ac1b82fc",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerPlannedMealsRepository.ts":"4d9f07e82852d098995c072493a7650217f68234fac8b921ec8d59ceef578870",
  "apps/mobile/features/consumer-meals/factories.ts":"b23b52953798d08798255e0c4731f97fdb98a5cb281c1b384c76fd6eb2d3a99e",
  "apps/mobile/features/consumer-meals/index.ts":"8c0a759ea00dd2c42cc720bba171c208df266dfd1b858120a9a0935fd4a5de95",
  [migration39]:"9a3dc8d1030498cc55bc056e66141777e28962dc1b42543c6474a6677e678e11",
  [migration40]:"07dbe94a2d82902f332447005e446f48a6f2c732ae450d6f23f15be62bccf572",
  "apps/mobile/features/consumer-meals/plannedMealV2Mappers.ts":"5d8ee1bef0ffb6c70db26413e4d18982592a4738fa7e9494af5ff97164a32e6d",
  "apps/mobile/features/consumer-meals/consumerPlannedMealV2Service.ts":"6e5847cfce7c2f80d57ce5060f792e94afd6f2b80a2346633d14c4a587a666b7",
  "apps/mobile/features/consumer-meals/adapters/supabaseConsumerPlannedMealV2Repository.ts":"899cb948d1a1ed89f58baf5215ee5aeb299ca7858dfa7bee714220d4dfcf35bd",
  "apps/mobile/features/consumer-meals/adapters/mockConsumerPlannedMealV2Repository.ts":"ff6a394191a358b81c646cde628ab4467bcb9f984c62d958097d2d30aa615d03",
  "apps/mobile/features/consumer-meals/adapters/supabaseDisabledConsumerPlannedMealV2Repository.ts":"443741b57fabdf3d7a4df52975b1587fed35e61da2776f54fa557c281d145201",
  "apps/mobile/features/consumer-runtime/consumerPlannedMealRuntime.ts":"a574d2176887213c02ed1a10d05d43fea6799c86731f2d2aedbc3684a674e713",
  "apps/mobile/features/consumer-runtime/consumerPlannedMealOperationStore.ts":"b02cbc96bd8782ee07f0b2ae0aea4666384e0a8f8e90b83e10a668a6ecdd445d",
  "apps/mobile/features/consumer-runtime/consumerPlannedMealMapper.ts":"d640efb3a366ad06d99d45d354bd1ae2a5711db3f03cde5a6495e8eda5978652",
  "scripts/consumer-runtime-phase-2z-b3-b-planned-meal-contract-guard.mjs":"43bd5d412b2d2f1d522c77fe4d9a1c5e4c70daf3b21ad8d378cc02c7cf5a6419",
  "scripts/consumer-runtime-phase-2z-b3-b-planned-meal-contract-smoke.mjs":"d14840d25c730f2ba30181f3921909873a595ab419e121b816efe6c365396550",
  "docs/consumer-runtime-phase-2z/phase-2z-b3-planned-meal-contract.md":"978f046ae4ae507ddd519a1aabdb4bf2446c72b55efe4c16c2752e3bb89e4ae7"
}));
const frozenB3DWithoutGuard = new Map(Object.entries({
  "apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts":"1b7812a74aa8037b551703dd4e237a7ea181854054f8fbd5a66d022ecd00ecb2",
  "apps/mobile/features/consumer-runtime/ConsumerRuntimeProvider.tsx":"7298f01e064c964f134004e1991c0809dcfc8dffe3f9c4a5ca348edfa39c8892",
  "apps/mobile/features/consumer-runtime/index.ts":"22aa9079d7dfc17de0e904f16965cf4e9981fd1d6f1c8ed2b7c5b8d09fc5400b",
  "apps/mobile/features/planned-meal/types.ts":"e68cf8e76c8e48cc679a42d45e249c604709c0a39ec0e454507bc979c07d4e87",
  "apps/mobile/features/planned-meal/plannedMealStore.ts":"a568d48cf5f76adfe4639f089eeac5243368ca4d3ba453be939666a79fc7ff2c",
  "apps/mobile/features/planned-meal/PlannedMealComponents.tsx":"a99182cc492339ecdf89121cffd7d85a43e7e642b2a00bad4be0fd8e489dcccd",
  "apps/mobile/features/planned-meal/index.ts":"c3bf32575cbb266999de0aa46917f6878e9daa9debdc915ccaf90018ea3fe1e9",
  "apps/mobile/app/recommendation.tsx":"49337a9d47d9ae3c6f1fb13884f7927318e70910dbf394f135421416ab0fe7dc",
  "apps/mobile/app/meal-photo.tsx":"c7a59034a5745d6877878510c5a6afc409abf0fda5655a4359d28d56df032987",
  "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts":"1eb99707e7995c7d48bf6691f9a8a9b4e658d6373aa7ec4805d7362b56e4863e",
  "apps/mobile/app/today-intake.tsx":"8697e1aa9a471e50f8da664e938e90771cb93b6ff62696b2fa5412080e17e68e",
  "apps/mobile/app/index.tsx":"90605d9b7ab7a396bb69b7a146b23759fa968cd56aeb2ba283dfeb9c0fa41ab1",
  "lib/i18n/zh-TW.ts":"447eabd2b82a57a340657cc947108050cbb756c4791b4298dda18a3ffb14ee9a",
  "scripts/consumer-runtime-phase-2z-b3-d-mobile-planned-meal-smoke.mjs":"346097acc48d1f8695337e918b6f8772e36a1de1e6445d124259920fecb1a239"
}));
const finalCandidates = new Set([...frozenB3BC1.keys(), ...approvedB3D, evidencePath]);
const checks=[]; const failures=[];
const git=(args)=>spawnSync("git",args,{cwd:root,encoding:"utf8",windowsHide:true});
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");
const sha=(file)=>createHash("sha256").update(fs.readFileSync(path.join(root,file))).digest("hex");
const record=(name,pass,detail)=>{const item={name,pass:Boolean(pass),detail};checks.push(item);if(!item.pass)failures.push(item);};
const changed=()=>git(["status","--porcelain=v1","-z","--untracked-files=all"]).stdout.split("\0").filter(Boolean).map((entry)=>entry.slice(3).replaceAll("\\","/"));
const tree=(commit,prefix)=>git(["ls-tree","-r","--name-only",commit,"--",prefix]).stdout.trim().split("\n").filter(Boolean);
const drift=(commit,files)=>files.filter((file)=>git(["diff","--quiet",commit,"--",file]).status!==0);
try {
  const currentHead=git(["rev-parse","HEAD"]).stdout.trim();
  const parent=git(["rev-parse","HEAD^"]).stdout.trim();
  const subject=git(["log","-1","--pretty=%s"]).stdout.trim();
  const preCommit=currentHead===baseline;
  const frozenCommit=parent===baseline&&subject===commitSubject;
  const worktree=changed();
  const manifest=preCommit?worktree:git(["diff","--name-only",baseline,"HEAD"]).stdout.trim().split("\n").filter(Boolean);
  const migrations=fs.readdirSync(path.join(root,"supabase/migrations")).filter((file)=>file.endsWith(".sql")).sort();
  const evidence=read(evidencePath); const composition=read(approvedB3D[0]); const provider=read(approvedB3D[1]);
  const recommendation=read("apps/mobile/app/recommendation.tsx"); const photo=read("apps/mobile/app/meal-photo.tsx");
  const todayModel=read("apps/mobile/features/consumer-meals/todayIntakeUiModel.ts"); const today=read("apps/mobile/app/today-intake.tsx");
  const home=read("apps/mobile/app/index.tsx"); const store=read("apps/mobile/features/planned-meal/plannedMealStore.ts"); const ui=[recommendation,photo,today,home].join("\n");
  record("branch is main",git(["branch","--show-current"]).stdout.trim()==="main");
  record("guard is in accepted pre-commit or final Frozen state",preCommit||frozenCommit,{currentHead,parent,subject});
  record("B1 B2-A and B2-B commits are ancestors",["424f99f7d62f102b2e6c902cde5224dc5d5241f3","171f7294c120c8ab0ec4c97c4ee657f6133d8f1b",baseline].every((commit)=>git(["merge-base","--is-ancestor",commit,"HEAD"]).status===0));
  record("final candidate inventory is exactly 36 paths",manifest.length===36&&finalCandidates.size===36&&manifest.every((file)=>finalCandidates.has(file)),manifest);
  record("worktree matches freeze lifecycle",preCommit?worktree.length===36:worktree.length===0,worktree);
  record("B3-B C1 20-path manifest is byte-equivalent",[...frozenB3BC1].every(([file,hash])=>fs.existsSync(path.join(root,file))&&sha(file)===hash));
  record("B3-D 14 immutable paths are byte-equivalent",[...frozenB3DWithoutGuard].every(([file,hash])=>fs.existsSync(path.join(root,file))&&sha(file)===hash));
  record("B3-D inventory remains exactly 15 approved paths",approvedB3D.length===15&&approvedB3D.every((file)=>manifest.includes(file)));
  record("freeze-only delta is exact",["scripts/consumer-runtime-phase-2z-b3-d-mobile-planned-meal-guard.mjs",evidencePath].every((file)=>manifest.includes(file)));
  record("staged diff is empty",git(["diff","--cached","--quiet"]).status===0);
  record("migration inventory is exactly 40",migrations.length===40,migrations.length);
  record("Migration 40 is latest",migrations.at(-1)===path.basename(migration40));
  record("Migration 39 SHA is exact",sha(migration39)===frozenB3BC1.get(migration39));
  record("Migration 40 SHA is exact",sha(migration40)===frozenB3BC1.get(migration40));
  const oldMigrations=tree(baseline,"supabase/migrations"); record("existing 38 migrations are byte-equivalent",oldMigrations.length===38&&drift(baseline,oldMigrations).length===0,drift(baseline,oldMigrations));
  record("package and lockfiles are unchanged",drift(baseline,["package.json",...tree(baseline,"").filter((file)=>/(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file))]).length===0);
  record("analysis.tsx is unchanged",drift(baseline,["apps/mobile/app/analysis.tsx"]).length===0);
  record("B1 Auth Profile backend is unchanged",drift(baseline,tree(baseline,"apps/mobile/features/consumer-auth")).length===0);
  record("B2 operation and mapper backend is unchanged",drift(baseline,["apps/mobile/features/consumer-runtime/consumerMealWriteMapper.ts","apps/mobile/features/consumer-runtime/consumerMealWriteRuntime.ts","apps/mobile/features/consumer-runtime/consumerMealWriteOperationStore.ts"]).length===0);
  record("composition uses one shared client graph",/createConsumerPlannedMealV2Service/.test(composition)&&/plannedMealRuntime/.test(composition)&&(composition.match(/new SupabaseConsumerClientFactory/g)??[]).length===1);
  record("UI receives no client repository or RPC capability",!/Supabase|Repository|\.rpc\s*\(|\.from\s*\(/.test(ui));
  record("formal create paths use Provider runtime",/runtime\.createPlannedMeal/.test(recommendation)&&/runtime\.createPlannedMeal/.test(photo)&&!/savePlannedDinner|getPlannedDinner/.test(recommendation)&&!/(?:savePlannedDinner|getPlannedDinner)\s*\(/.test(photo));
  record("trusted IDs fail closed to null",[recommendation,photo].every((source)=>["restaurantId: null","branchId: null","menuItemId: null"].every((value)=>source.includes(value))));
  record("Today uses canonical planned meals",/overview\.plannedMeals/.test(todayModel)&&!/getPlannedDinner|getConfirmedDinnerRecord|getAutoSettled/.test(todayModel));
  record("synthetic automatic settlement is disabled",/getAutoSettledPlannedDinnerRecord\(\)[\s\S]*return null/.test(store));
  record("cancel and conversion remain explicit planned-only gestures",/runtime\.cancelPlannedMeal/.test(today)&&/runtime\.convertPlannedMeal/.test(today)&&/canonicalStatus === "planned"/.test(today));
  record("Provider binds actor generation Profile timezone and shared revision",/actorGeneration/.test(provider)&&/profileTimezone/.test(provider)&&/consumerDataRevision/.test(provider)&&/mealDataRevision/.test(home)&&/mealDataRevision/.test(today));
  record("same-request retry and 24-hour TTL remain",/retryPendingPlannedMeal/.test(provider)&&/24 \* 60 \* 60 \* 1000/.test(read("apps/mobile/features/consumer-runtime/consumerPlannedMealOperationStore.ts")));
  record("no local fallback or summary persistence",!/(?:catch|!result\.ok)[\s\S]{0,160}(?:savePlannedDinner|clearPlannedDinner)/.test(recommendation+photo)&&!/persistAuthenticatedDaily|persistCurrentUserDaily/i.test(ui+provider+composition));
  const evidenceFacts=[
    "tastkind-development","msbgnnoorsoefuiwluye","ap-southeast-1","Local/remote migration parity: 40/40",
    "B3-D guard: 39/39 PASS twice","B3-D smoke: 35/35 PASS twice","remote=false","credentials=false",
    "B1 Auth/Profile smoke: 22/22 PASS","B2-A Idempotency smoke: 20/20 PASS","B2-B Meal Write smoke: 36/36 PASS","B3-B Planned Meal smoke: 31/31 PASS",
    "Final correction harness: 17/17 PASS","Runtime create/revision: PASS","Runtime different-key reconversion conflict: PASS","Runtime stale-version conflict: PASS","Runtime same-key ambiguity/restore/retry: PASS",
    "Signed-out RPC count: 0","Signed-out PostgREST/table/view count: 0","Planned Meals created: 5; cleaned: 5","Meal Records created: 2; cleaned: 2",
    "Daily nutrition summary writes: 0","Remaining controlled Planned Meals: 0","Remaining controlled Meal Records: 0","Controlled sessions: 0","persistentTestData=false",
    "Production was untouched","N4 was not executed","Phase 2V-F was untouched","PASS_READY_FOR_CODEX_B3_FREEZE"
  ];
  record("sanitized evidence contains every required fact",evidenceFacts.every((fact)=>evidence.includes(fact)),evidenceFacts.filter((fact)=>!evidence.includes(fact)));
  const disclosures=["SQL quoting error caused the controlled fixture email value to appear in command output","timing Proxy double-fired and produced four controlled orphan rows","subsequently identified and cleaned","Neither incident recurred in the final correction run","historical test-harness/operator incidents, not production implementation defects"];
  record("operator disclosures are complete",disclosures.every((fact)=>evidence.includes(fact)),disclosures.filter((fact)=>!evidence.includes(fact)));
  const forbiddenEvidence=[
    {name:"email value",pattern:/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i},
    {name:"JWT",pattern:/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/},
    {name:"complete UUID",pattern:/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i},
    {name:"secret value",pattern:/(?:password|access[_ -]?token|refresh[_ -]?token|secret|credential)\s*[:=]\s*[`'"]?[A-Za-z0-9_./+-]{8,}/i},
    {name:"personal profile value",pattern:/(?:display[_ -]?name|phone|address|birth(?:day|date))\s*[:=]/i}
  ];
  const leaks=forbiddenEvidence.filter(({pattern})=>pattern.test(evidence)).map(({name})=>name);
  record("evidence contains no identity credential or personal values",leaks.length===0,leaks);
  record("env local is ignored and untracked",git(["check-ignore","-q",".env.local"]).status===0&&!manifest.includes(".env.local")&&!worktree.includes(".env.local"));
  const candidateSource=[...finalCandidates].filter((file)=>fs.existsSync(path.join(root,file))).map(read).join("\n");
  record("candidate contains no JWT secret or service-role value",!/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+|service[_-]?role\s*[:=]\s*[`'"]?[A-Za-z0-9_.-]{12,}/i.test(candidateSource));
  record("Production N4 and Phase 2V-F are untouched",!manifest.some((file)=>/production|phase-2v|n4/i.test(file)));
  for(const check of checks)console.log(`${check.pass?"PASS":"FAIL"} ${check.name}${check.pass||check.detail===undefined?"":` ${JSON.stringify(check.detail)}`}`);
  console.log(`RESULT ${checks.length-failures.length}/${checks.length} ${failures.length?"FAIL":"PASS"}`);if(failures.length)process.exitCode=1;
}catch(error){console.error(error instanceof Error?error.stack:error);process.exitCode=1;}
