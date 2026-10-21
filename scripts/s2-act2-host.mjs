const MUTS=JSON.parse(process.env.S2ACT2_MUT||'[]');function vmutate(s,f){for(const m of MUTS)if(f.split(String.fromCharCode(92)).join('/').endsWith(m.file)){if(!s.includes(m.from))throw Error('MUTATION_NOT_APPLIED '+m.id);s=s.split(m.from).join(m.to);}return s;}
// ACT2 author component host, reusing the prior ID1/ACT1 React/RN/router simulation.
// Synthetic transport/provider boundary; not a full App, device, or independent acceptance.
// Usage: node scripts/s2-act2-host.mjs <checkout> <NEW outJson>
process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_MEAL_BUDDY_CANDIDATE_SOURCE='supabase-live';
process.env.EXPO_PUBLIC_TASTKIND_ENVIRONMENT='development';

import fs from 'node:fs';import path from 'node:path';import{createRequire}from'node:module';import assert from'node:assert/strict';
import crypto from 'node:crypto';const checkout=process.argv[2],run=path.resolve(import.meta.dirname,'..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const root=path.resolve(process.argv[2]??checkout),require=createRequire(path.join(root,'package.json')),ts=require('typescript');
let current,routeParams={},runtime={mode:'supabase',state:{actorKey:'actor-a',actorGeneration:1}} ,nav=[],routeStack=['/social','/meal-buddies','/social-friends'];const cache=new Map(),errors=[];
const jsx=(type,props,key)=>({type,props:props??{},key});
const same=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
function slot(){const instance=current.instance,index=instance.cursor++;return{instance,index,previous:instance.hooks[index]};}
const React={useState(initial){const{instance,index,previous}=slot();if(!previous)instance.hooks[index]={value:typeof initial==='function'?initial():initial};return[instance.hooks[index].value,value=>{instance.hooks[index].value=typeof value==='function'?value(instance.hooks[index].value):value;instance.host.dirty=true;}];},useRef(initial){const s=slot();if(!s.previous)s.instance.hooks[s.index]={current:initial};return s.instance.hooks[s.index];},useMemo(factory,deps){const s=slot();if(!s.previous||!same(s.previous.deps,deps))s.instance.hooks[s.index]={value:factory(),deps};return s.instance.hooks[s.index].value;},useCallback(fn,deps){return React.useMemo(()=>fn,deps);},useEffect(fn,deps){const s=slot();if(!s.previous||!same(s.previous.deps,deps)){const hook={deps,cleanup:s.previous?.cleanup};s.instance.hooks[s.index]=hook;s.instance.host.effects.push(()=>{hook.cleanup?.();hook.cleanup=fn();});}}};
const router={dismissTo:r=>{nav.push({op:'dismissTo',route:r});const target=typeof r==='string'?r:r.pathname;const index=routeStack.lastIndexOf(target);if(index>=0)routeStack=routeStack.slice(0,index+1);else routeStack.splice(routeStack.length-1,1,target);},push:r=>nav.push({op:'push',route:r}),replace:r=>nav.push({op:'replace',route:r}),back:()=>nav.push({op:'back'}),canGoBack:()=>true};
const Expo={useRouter:()=>router,useLocalSearchParams:()=>routeParams,useFocusEffect(fn){const host=current.instance.host;React.useEffect(()=>{const entry={fn,cleanup:null};host.focusEntries.add(entry);if(host.focused)entry.cleanup=fn();return()=>{entry.cleanup?.();host.focusEntries.delete(entry);};},[fn]);}};
const leaf=(name)=>(props)=>jsx(name,props);
let identityReads=0;const demoCalls=[];const demoWrites=[];
const emptyStore={createMealBuddyCard:input=>{demoWrites.push(input);return{...input,id:'demo-fixture',createdAt:'demo-fixture'};},upsertMealBuddyCardWithQuota:()=>{},getMealBuddyCardId:v=>v.id,getPendingMatchRequest:()=>null,getActiveMealBuddyCards:()=>[],getMealBuddyChats:()=>[],getMealBuddyInvites:()=>[],getDailyVisibleUsage:()=>({used:0,limit:3}),getActiveCardUsage:()=>({general:{count:0,limit:1},restaurant:{count:0,limit:1}}),mockMatchedBuddies:[],mockGatheringRecords:{hosting:[],joined:[],ended:[]}};
let demoPlan='free',quotaMode='failed',testHandoff=null;
const mem=new Map();const storage={getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>{mem.set(k,String(v));},removeItem:k=>{mem.delete(k);}}; /* verifier change 2: in-memory storage */
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);const s=vmutate(fs.readFileSync(file,'utf8'),file),out=ts.transpileModule(s,{fileName:file,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,isolatedModules:true}});errors.push(...(out.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error));const req=name=>{
 if(name==='react')return React;if(name==='react/jsx-runtime')return{jsx,jsxs:jsx,Fragment:'Fragment'};
 if(name==='react-native')return{...Object.fromEntries(['Text','TextInput','View','Pressable','ActivityIndicator','Image','Modal','ScrollView','RefreshControl'].map(s=>[s,s])),StyleSheet:{create:v=>v,absoluteFill:{}}};
 if(name==='expo-router')return Expo;if(name==='expo-linear-gradient')return{LinearGradient:'LinearGradient'};if(name==='react-native-svg')return{__esModule:true,default:'Svg',Circle:'Circle'};
 if(name===JSON.parse(fs.readFileSync(path.join(root,'packages/shared/package.json'),'utf8')).name)return {...load(path.join(root,'packages/shared/src/domain/meal-buddy-candidate/validate.ts')),...load(path.join(root,'packages/shared/src/domain/stranger-exposure.ts'))};
 const mappings=JSON.parse(fs.readFileSync(path.join(root,'tsconfig.base.json'),'utf8')).compilerOptions.paths;let aliased=null;for(const [alias,targets]of Object.entries(mappings)){const wildcard=alias.endsWith('*'),prefix=wildcard?alias.slice(0,-1):alias;if(wildcard?name.startsWith(prefix):name===prefix){aliased=path.join(root,targets[0].replace('*',name.slice(prefix.length)));break;}}
 let p=(aliased??path.resolve(path.dirname(file),name)).replaceAll('\\','/');
 if(/\.(png|jpg)$/.test(p))return{assetPath:path.relative(root,p).replaceAll('\\','/'),sha256:sha(fs.readFileSync(p))};
 if(p.endsWith('/consumer-runtime'))return{useConsumerRuntime:()=>runtime};
 if(/components\/DemoUi$/.test(p))return{Card:'Card',SectionTitle:'SectionTitle',colors:{},UpgradePromptModal:leaf('UpgradePromptModal'),DemoModeToggle:leaf('DemoModeToggle')};
 if(p.endsWith('PlaceholderScreen')||p.endsWith('PlaceholderScreen.tsx'))return{PlaceholderScreen:'PlaceholderScreen'};
 if(p.endsWith('/theme/icons'))return{Icon:'Icon'};
 if(p.endsWith('/secureUuidProvider'))return{generateSecureUuidV4:()=> '00000000-0000-4000-8000-000000000001'};
 if(p.endsWith('/features/meal-buddy-card')){const actual=load(p+'/index.ts');return Object.fromEntries(Object.keys(actual).map(k=>[k,typeof actual[k]==='function'&&['getMealBuddyChats','getMealBuddyInvites','acceptMealBuddyInvite','declineMealBuddyInvite','createOrOpenMealSessionChat','addMealBuddyChatSystemMessage'].includes(k)?(...a)=>{demoCalls.push(k);return actual[k](...a);}:actual[k]]));}
 if(p.endsWith('/features/community-card-settings'))return{getCommunityCardSettings:(...a)=>{identityReads++;if(runtime.mode!=='mock')throw Error('LIVE_MUST_NOT_READ_DEMO_IDENTITY');return load(p+'/index.ts').getCommunityCardSettings(...a);}};
 if(p.endsWith('/features/display-resolvers'))return{resolveCommunityProfileDisplay:(...a)=>{identityReads++;if(runtime.mode!=='mock')throw Error('LIVE_MUST_NOT_READ_DEMO_IDENTITY');return load(p+'/index.ts').resolveCommunityProfileDisplay(...a);}};
 if(p.endsWith('/features/demo-user-plan'))return{useDemoUserPlan:()=>[demoPlan,()=>{}],getDemoUserPlan:()=>demoPlan};
 if(p.endsWith('/features/next-meal-prototype'))return{clearU1NextMealBuddyPrefill:()=>{},consumeU1NextMealBuddyPrefill:()=>testHandoff};
 if(p.endsWith('/lib/storage'))return{storage};
 if(p.endsWith('/consumer-location/ConsumerLocationProvider'))return{useConsumerLocationRuntime:()=>({state:{phase:'unsupported'},enable:async()=>false,refresh:async()=>false,clear:()=>{}})};
 if(p.endsWith('/useMealBuddyPush'))return{useMealBuddyPush:()=>({state:{phase:'signed_out'}})};
 if(p.endsWith('/MealBuddyPushPermissionCard'))return{MealBuddyPushPermissionCard:()=>null};
 if(p.endsWith('/useMealBuddyPushRouting'))return{useMealBuddyPushRouting:()=>{}};
 if(p.endsWith('/features/meal-buddy-card-create'))return{useMealBuddyOwnCardQuota:()=>({state:quotaMode!=='failed'?{phase:'ready',quota:{general:{used:quotaMode==='full'?1:0,limit:1},restaurant:{used:quotaMode==='full'?1:0,limit:1}}}:{phase:'failed'},applyFromCreate:()=>{}})};
 if(p.endsWith('/group-tables/GroupTableDeferred'))return{GroupTableDeferred:leaf('GroupTableDeferred')};
 for(const ext of['.ts','.tsx','/index.ts'])if(fs.existsSync(p+ext))return load(p+ext);if(fs.existsSync(p)&&fs.statSync(p).isFile())return load(p);throw Error('Unmocked module '+name+' from '+file);
 };new Function('require','module','exports',out.outputText)(req,m,m.exports);return m.exports;}

const feature=f=>load(path.join(root,'apps/mobile/features',f));
class Host{constructor(component){this.component=component;this.instances=new Map();this.focusEntries=new Set();this.effects=[];this.focused=true;this.dirty=true;this.render();}render(){this.dirty=false;const seen=new Set();const expand=(v,key='root')=>{if(v==null||typeof v==='boolean')return null;if(Array.isArray(v))return v.map((x,i)=>expand(x,key+'/'+(x?.key??i)));if(typeof v!=='object')return v;if(v.type==='Modal'&&!v.props.visible)return null;if(typeof v.type==='function'){const id=key+':'+v.type.name+':'+(v.key??'');let inst=this.instances.get(id);if(!inst){inst={hooks:[],host:this};this.instances.set(id,inst);}seen.add(id);inst.cursor=0;const old=current;current={instance:inst};const result=v.type(v.props);current=old;return expand(result,id);}return{...v,props:{...v.props,children:expand(v.props.children,key+'/children')}};};this.tree=expand(jsx(this.component,{}));for(const[id,inst]of this.instances)if(!seen.has(id)){for(const h of inst.hooks)h?.cleanup?.();this.instances.delete(id);}for(const effect of this.effects.splice(0))effect();}async flush(){for(let i=0;i<75;i++){await Promise.resolve();if(this.dirty)this.render();}}focus(value){this.focused=value;for(const e of this.focusEntries){e.cleanup?.();e.cleanup=value?e.fn():null;}}destroy(){for(const inst of this.instances.values())for(const h of inst.hooks)h?.cleanup?.();this.instances.clear();}}
function nodes(tree,test){if(tree==null)return[];if(Array.isArray(tree))return tree.flatMap(t=>nodes(t,test));if(typeof tree!=='object')return[];return[...(test(tree)?[tree]:[]),...nodes(tree.props.children,test)];}const text=t=>t==null?'':Array.isArray(t)?t.map(text).join('|'):typeof t==='object'?text(t.props.children):String(t);const label=n=>n.props.accessibilityLabel??text(n);
const find=(h,s)=>nodes(h.tree,n=>n.type==='Pressable').find(n=>label(n).replaceAll('|','')===s);async function tap(h,s,flush=true){const n=find(h,s);assert.ok(n,'Missing button '+s+' in '+text(h.tree));if(!n.props.disabled)n.props.onPress();if(flush)await h.flush();return n;}
async function type(h,s,value){const n=nodes(h.tree,n=>n.type==='TextInput'&&n.props.accessibilityLabel===s)[0];assert.ok(n,'Missing input '+s);if(n.props.editable!==false)n.props.onChangeText(value);await h.flush();}

const results=[];const check=(name,ok)=>{results.push({name,pass:!!ok});console.log((ok?'PASS ':'FAIL ')+name);};
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
let actor='actor-a',held=null,failNext=false,empty=false;const settings=new Map();const calls=[];
const version='stranger-exposure-v1',revision='00000000-0000-4000-8000-000000000001',sourceRef='mbc1.'+'s'.repeat(40),candidateRef='str1.'+'r'.repeat(60);
const catalog=load(path.join(root,'lib/i18n/zh-TW.ts')).zhTW.mobile.communityCardSettings.mascots;
const candidate={ref:candidateRef,label:'匿名飯友',mascotAvatarKey:catalog[2].assetKey,card:{diningDate:'2026-10-21',mealPeriod:'dinner',intentionType:'chat_first',restaurant:null},interests:{generalCategoryKeys:[],generalOverflowCount:0,foodCategoryKeys:[],foodOverflowCount:0}};
const auth={getCurrentSession:async()=>({ok:true,value:actor?{user:{userId:actor}}:null})};
const success=data=>({data,error:null});
const client={auth:{getSession:async()=>({data:{session:actor?{user:{id:actor},access_token:'jwt-'+actor}:null},error:null})},functions:{invoke:async(name,options)=>{
 const target=options.headers?.Authorization?.slice(11)??actor;calls.push({name,target,body:options.body,header:options.headers});
 if(held&&held.operation===options.body.operation){const d=held;held=null;return d.promise;}
 if(failNext){failNext=false;return {data:null,error:new Error('test_failure')};}
 if(name==='stranger-exposure'){
  const body=options.body;let state=settings.get(target)??{enabled:false,revision:null,identity:'mascot_ready'};
  if(body.operation==='set'){state={...state,enabled:body.enabled,revision};settings.set(target,state);}
  if(body.operation==='read'||body.operation==='set')return success({policyVersion:version,settings:state});
  if(body.operation==='discover')return success({policyVersion:version,candidates:empty?[]:[candidate],identityBlocked:false});
  if(body.operation==='profile')return success({policyVersion:version,profile:candidate});
  if(body.operation==='send')return success({policyVersion:version,relationshipRef:'mbr1.'+'a'.repeat(40),state:'outgoing_pending'});
 }
 if(name==='meal-buddy-card-list')return success({cards:[{sourceCardRef:sourceRef,cardType:'general',intentionType:'chat_first',restaurantId:null,diningDate:'2026-10-21',mealPeriod:'dinner',foodContextTagKey:null}]});
 if(name==='meal-buddy-relationship')return success({policyVersion:'meal-buddy-relationship-v1',relationships:[]});
 throw Error('Unexpected request '+name);
}}};
feature('stranger-exposure/repository.ts').bindStrangerRuntime(auth,client);
feature('meal-buddy-candidates/runtimeBinding.ts').bindMealBuddyCandidateRuntimeDependencies({authPort:auth,mealBuddyClient:client,catalogClient:{from:()=>({select:()=>({eq:async()=>({data:[],error:null})})})}});
feature('meal-buddy-relationships/runtimeBinding.ts').bindMealBuddyRelationshipRuntimeDependencies({authPort:auth,client});
const Home=load(path.join(root,'apps/mobile/app/meal-buddies.tsx')).default;
const Section=feature('stranger-exposure/StrangerExposureSection.tsx').StrangerExposureSection;
let props={actorKey:'actor-a',actorGeneration:1,onFriends:()=>nav.push('friends'),onRecommend:()=>nav.push('recommend')};
const Screen=()=>jsx(Section,props);const content=h=>text(h.tree);
const scenario=async(name,fn)=>{try{await fn();}catch(e){results.push({name:'HARNESS_ERROR '+name,pass:false,error:e.stack});console.error(e.stack);}};
await scenario('host workflow',async()=>{
 const h=new Host(Screen);check('H01 first render loading and no prior candidate',content(h).includes('正在向服務確認')&&!content(h).includes('匿名飯友'));await h.flush();
 check('H02 default off hides source/candidate cards',content(h).includes('陌生曝光已停止')&&!content(h).includes('使用飯友卡'));
 await tap(h,'開啟陌生曝光');check('H03 explicit set then real own-card adapter',content(h).includes('陌生曝光已開啟')&&content(h).includes('使用飯友卡'));
 await tap(h,'使用飯友卡 2026-10-21 dinner');check('H04 real DTO anonymous candidate',content(h).includes('匿名飯友')&&!!find(h,'送出好友邀請'));
 const asset=feature('social-candidates/mascotAdapter.ts').resolveSocialCandidateMascot(candidate.mascotAvatarKey);const expected=load(path.join(root,'apps/mobile/theme/components.tsx')).getMascotSource(asset.mascotId);
 check('H05 canonical platform mascot asset',nodes(h.tree,n=>n.type==='Image').some(n=>JSON.stringify(n.props.source)===JSON.stringify(expected)));
 await tap(h,'查看飯友卡');check('H06 profile uses stranger ref',calls.at(-1).body.ref===candidateRef&&content(h).includes('匿名飯友'));
 const send=find(h,'送出好友邀請').props.onPress;send();send();await h.flush();check('H07 duplicate click only one server send',calls.filter(x=>x.body.operation==='send').length===1&&content(h).includes('伺服器確認'));
 await tap(h,'查看邀請與聊天');check('H08 accepted existing friend entry navigation',nav.at(-1)==='friends');
 await tap(h,'停止陌生曝光');check('H09 stop hides cards and candidates',content(h).includes('陌生曝光已停止')&&!content(h).includes('匿名飯友')&&!content(h).includes('使用飯友卡'));
 await tap(h,'開啟陌生曝光');empty=true;await tap(h,'使用飯友卡 2026-10-21 dinner');check('H10 successful empty separated',content(h).includes('這次成功查詢沒有'));
 empty=false;failNext=true;await tap(h,'使用飯友卡 2026-10-21 dinner');check('H11 error is not empty/fake success',content(h).includes('尚未確認')&&!content(h).includes('這次成功查詢沒有')&&!content(h).includes('伺服器確認'));
 await tap(h,'重新讀取');check('H12 retry re-reads actual state',content(h).includes('使用飯友卡'));
 await tap(h,'使用飯友卡 2026-10-21 dinner');const staleSend=find(h,'送出好友邀請').props.onPress;const staleReturn=find(h,'返回好友').props.onPress;
 actor='actor-b';props={...props,actorKey:actor,actorGeneration:2};h.render();check('H13 actor switch first render no prior identity/ref',!content(h).includes('匿名飯友')&&!find(h,'送出好友邀請'));await h.flush();const before=calls.length;staleSend();await h.flush();check('H14 disposed actor stale action never dispatches',calls.length===before);const beforeNav=nav.length;staleReturn();check('H23 old navigation callback cannot affect new actor',nav.length===beforeNav);
 check('H15 new actor not auto-enabled',content(h).includes('陌生曝光已停止'));h.destroy();
});
await scenario('late responses',async()=>{
 actor='actor-a';props={...props,actorKey:actor,actorGeneration:3};const h=new Host(Screen);await h.flush();held={operation:'discover',...defer()};const delayed=held;await tap(h,'使用飯友卡 2026-10-21 dinner');
 await tap(h,'停止陌生曝光');delayed.resolve(success({policyVersion:version,candidates:[candidate],identityBlocked:false}));await h.flush();check('H16 stop epoch discards delayed candidates',content(h).includes('陌生曝光已停止')&&!content(h).includes('匿名飯友'));const controllers=[...h.instances.values()].flatMap(i=>i.hooks.map(x=>x?.value).filter(v=>v&&typeof v.getState==='function'));check('H24 no hidden late refs retained after stop',controllers.length>0&&controllers.every(c=>c.getState().candidates===null));
 await tap(h,'開啟陌生曝光');held={operation:'discover',...defer()};const delayed2=held;await tap(h,'使用飯友卡 2026-10-21 dinner');actor='actor-b';props={...props,actorKey:actor,actorGeneration:4};h.render();await h.flush();delayed2.resolve(success({policyVersion:version,candidates:[candidate],identityBlocked:false}));await h.flush();check('H17 actor switch rejects late response',!content(h).includes('匿名飯友')&&content(h).includes('陌生曝光已停止'));h.destroy();
});
await scenario('Home boundary',async()=>{
 actor='actor-b';runtime={mode:'supabase',state:{actorKey:actor,actorGeneration:4}};routeParams={section:'discover'};const h=new Host(Home);await h.flush();check('H18 actual Home discovery mounts real exposure section',content(h).includes('這是常駐探索入口')&&content(h).includes('陌生曝光已停止'));check('H19 no legacy list or demo writes',!calls.some(x=>x.name==='meal-buddy-candidate-list')&&demoCalls.length===0&&demoWrites.length===0);
 routeParams={section:'gatherings'};h.render();await h.flush();check('H20 ACT1 physical gatherings still unavailable',nodes(h.tree,n=>n.type==='SectionTitle'&&n.props.title==='飯局功能尚未提供').length===1&&content(h).includes('這不是查無飯局')&&!content(h).includes('里歐的高蛋白午餐'));h.destroy();
});
check('H21 pinned per-actor JWT for every stranger request',calls.filter(x=>x.name==='stranger-exposure').every(x=>x.header?.Authorization==='Bearer jwt-'+x.target));
check('H22 no TS transpile setup diagnostics',errors.length===0);
fs.writeFileSync(process.argv[3],JSON.stringify({layer:'COMPONENT_HOST_SIMULATED_REACT_RN_TRANSPORT_REAL_PRODUCT_MODULES',results,calls,fullApp:false,device:false},null,2));if(results.some(x=>!x.pass))process.exitCode=1;
