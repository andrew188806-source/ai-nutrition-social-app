import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authorityPath = "docs/runtime-integration-phase-2v-e/p2v-perf-001-plan-metric-semantics-authority.json";
const contractPath = "docs/runtime-integration-phase-2v-e/p2v-perf-001-plan-metric-semantics-contract.md";
const guardPath = "scripts/restaurant-performance-p2v-perf-001a-d1-plan-metric-semantics-guard.mjs";
const basePath = "docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json";
const frozenPaths = [basePath,"docs/runtime-integration-phase-2v-e/performance-and-query-plan-contract.md","scripts/restaurant-performance-p2v-perf-001a-authority-guard.mjs"];
const candidates = [authorityPath,contractPath,guardPath].sort();
const baseCommit = "b95d92ef58bc956bac1fb32cfb09b77309645b47";
const baseSha = "4bfc94a5085a537c3faff97deb8329800f8171e506cbe37c0308a66035a24ade";
const frozenShas = new Map([[basePath,baseSha],[frozenPaths[1],"81af13e4078a7ed820a7088472ab449b00bc50514fdeef11fdeaecc4170e28f2"],[frozenPaths[2],"dc18308ff9735fabf266cef0f4591a34bf099bf2527753146000baddee319292"]]);
const fields = ["maxEstimateRatio","maxFanout","maxNestedLoopRows","maxSortMemoryKb","maxHashMemoryKb"];
const read = (p) => fs.readFileSync(path.join(root,p),"utf8");
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const git = (args, allow=false) => { const r=spawnSync("git",args,{cwd:root,encoding:"utf8"}); if(!allow&&r.status!==0)throw new Error(r.stderr); return r; };
const authority = JSON.parse(read(authorityPath));
const baseText = read(basePath);
const base = JSON.parse(baseText);
const contract = read(contractPath);

class MetricError extends Error { constructor(code,path=""){super(code);this.code=code;this.path=path;} }
const at=(object,pathParts)=>pathParts.reduce((v,k)=>v?.[k],object);
function number(object,pathParts,label,policy=authority.evaluator.numericPolicy){const v=at(object,pathParts);if(v===undefined)throw new MetricError(policy.missing==="fail"?"missing-field":"invalid-policy",label);if(policy.type!=="json-number"||policy.finite!==true||policy.minimum!==0||typeof v!=="number"||!Number.isFinite(v)||v<0)throw new MetricError("invalid-number",label);return v;}
function collection(object,pathParts,label,missing="empty"){const v=at(object,pathParts);if(v===undefined&&missing==="empty")return [];if(!Array.isArray(v))throw new MetricError(v===undefined?"missing-field":"malformed-structure",label);return v;}
function nodes(plan){const out=[];const visit=(node,p)=>{if(!node||typeof node!=="object"||Array.isArray(node))throw new MetricError("malformed-structure",p);out.push({node,path:p});const plans=node.Plans;if(plans!==undefined&&!Array.isArray(plans))throw new MetricError("malformed-structure",`${p}.Plans`);for(let i=0;i<(plans??[]).length;i++)visit(plans[i],`${p}.Plans[${i}]`);};visit(plan,"Plan");return out;}
function effective(node,rowPath,loopsPath,label){return number(node,rowPath,`${label}.${rowPath.join(".")}`)*number(node,loopsPath,`${label}.${loopsPath.join(".")}`);}
function aggregate(values,operator){if(operator!=="max")throw new MetricError("unknown-aggregation",operator);return values.length?Math.max(...values):0;}
function compare(value,threshold,operator){if(operator!=="<=")throw new MetricError("unknown-comparison",operator);return value<=threshold;}
function finish(nodeValues,observations,participants,threshold,spill,nodeAggregation,a){const value=aggregate(nodeValues,nodeAggregation);return {value,spill,observations,participants,pass:!spill&&compare(value,threshold,a.evaluator.runs.program.comparison)};}
function workerRule(program,a){const id=program.workerExecutionRule;if(typeof id!=="string")throw new MetricError("missing-worker-execution-rule");const rule=a.evaluator.workerExecutionRules?.[id];if(!rule)throw new MetricError("unknown-worker-execution-rule",id);return rule;}
function workerParticipants(node,path,program,a){const rule=workerRule(program,a);const raw=at(node,rule.workersPath);if(raw===undefined&&rule.absentCollection!=="no-worker-observations")throw new MetricError("unknown-absent-collection-disposition");const records=collection(node,rule.workersPath,`${path}.${rule.workersPath.join(".")}`);if(records.length===0&&rule.emptyCollection!=="no-worker-observations")throw new MetricError("unknown-empty-collection-disposition");if(rule.participantAggregation!==program.participants.aggregation||rule.leaderWorkerComposition!=="independent-observations-max-never-sum")throw new MetricError("worker-composition-conflict");return records.map((record,index)=>{if(!record||typeof record!=="object"||Array.isArray(record))throw new MetricError("malformed-structure",`${path}.worker[${index}]`);const identity=number(record,rule.recordIdentityPath,`${path}.worker[${index}].identity`,rule.numericPolicy);const execution=number(record,rule.executionPath,`${path}.worker[${identity}].execution`,rule.numericPolicy);if(rule.predicate.kind!=="numeric-compare"||rule.predicate.operator!==">"||rule.predicate.value!==0)throw new MetricError("unknown-execution-predicate",program.workerExecutionRule);if(execution===0){if(rule.zeroExecution!=="unexecuted-no-runtime-fields-no-observation-contribution-zero")throw new MetricError("unknown-zero-execution-disposition");return {value:record,label:`worker:${identity}`,executed:false};}if(rule.positiveExecution!=="executed-runtime-fields-required")throw new MetricError("unknown-positive-execution-disposition");return {value:record,label:`worker:${identity}`,executed:true};});}
function participantAggregate(values,program){if(program.participants.leader!=="node")throw new MetricError("unknown-leader-source");return aggregate(values,program.participants.aggregation);}

function evaluate(metric,plan,threshold,a=authority){
  const program=a.metrics[metric]?.program;if(!program)throw new MetricError("missing-program",metric);
  try {
    if(program.kind==="node-symmetric-ratio-max"){
      if(program.nodeTypes!=="*"||program.scaleBothByLoops!==true||program.parallelRows!=="leader-only")throw new MetricError("invalid-program-operand",metric);const observations=nodes(plan).map(({node,path})=>{const loops=number(node,program.loopsPath,`${path}.loops`);const planned=number(node,program.plannedPath,`${path}.planned`)*loops;const actual=number(node,program.actualPath,`${path}.actual`)*loops;if(planned===0&&actual===0)return program.bothZero;if(planned===0||actual===0){if(program.oneZero!=="fail-infinity")throw new MetricError("unknown-zero-disposition",path);throw new MetricError("infinite-ratio",path);}return Math.max(planned/actual,actual/planned);});return finish(observations,observations,[],threshold,false,program.nodeAggregation,a);
    }
    if(program.kind==="edge-directed-ratio-max"){
      if(program.edges!=="direct-Plans"||program.numerator!=="child-effective-rows"||program.denominator!=="parent-effective-rows"||program.parallelRows!=="leader-only")throw new MetricError("invalid-program-operand",metric);const observations=[];for(const {node,path} of nodes(plan))for(let i=0;i<(node.Plans??[]).length;i++){const child=node.Plans[i];if(program.excludedChildParentRelationships.includes(at(child,program.childRelationshipPath)))continue;const den=effective(node,program.parentActualPath,program.parentLoopsPath,path);const num=effective(child,program.childActualPath,program.childLoopsPath,`${path}.Plans[${i}]`);if(num===0&&den===0)observations.push(program.bothZero);else if(den===0){if(program.positiveOverZero!=="fail-infinity")throw new MetricError("unknown-zero-disposition",path);throw new MetricError("infinite-ratio",path);}else observations.push(num/den);}return finish(observations,observations,[],threshold,false,program.edgeAggregation,a);
    }
    if(program.kind==="nested-inner-effective-rows-max"){
      if(program.parallelRows!=="leader-only")throw new MetricError("invalid-program-operand",metric);const observations=[];for(const {node,path} of nodes(plan))if(program.nodeTypes.includes(node["Node Type"])){if(!Array.isArray(node.Plans)||node.Plans.length<=program.innerChildIndex)throw new MetricError("missing-field",`${path}.Plans[${program.innerChildIndex}]`);observations.push(effective(node.Plans[program.innerChildIndex],program.actualPath,program.loopsPath,`${path}.Plans[${program.innerChildIndex}]`));}return finish(observations,observations,[],threshold,false,program.nodeAggregation,a);
    }
    if(program.kind==="sort-participant-memory-max"){
      if(program.disk!=="fail-spill"||program.unit!=="kB")throw new MetricError("invalid-program-operand",metric);const observations=[],participants=[],nodeValues=[];let spill=false;for(const {node,path} of nodes(plan)){const isSort=program.sort.nodeTypes.includes(node["Node Type"]),isIncremental=program.incremental.nodeTypes.includes(node["Node Type"]);if(!isSort&&!isIncremental)continue;const loops=number(node,program.loopsPath,`${path}.loops`);if(loops===0){participants.push("leader:unexecuted");nodeValues.push(0);continue;}const participantValues=[];const records=[{value:node,label:"leader",executed:true},...workerParticipants(node,path,program,a)];for(const participant of records){if(!participant.executed){participants.push(`${participant.label}:unexecuted`);continue;}participants.push(`${participant.label}:executed`);const value=participant.value,label=`${path}.${participant.label}`;if(isSort){const used=number(value,program.sort.usedPath,`${label}.used`);const type=at(value,program.sort.typePath);if(type===undefined)throw new MetricError("missing-field",`${label}.type`);if(typeof type!=="string")throw new MetricError("malformed-field",`${label}.type`);if(type===program.sort.memoryType){observations.push(used);participantValues.push(used);}else if(type===program.sort.diskType){observations.push(0);participantValues.push(0);spill=true;}else throw new MetricError("invalid-sort-space-type",label);}else{let found=false;for(const groupPath of program.incremental.groups){const groupValue=at(value,groupPath);if(groupValue===undefined)continue;found=true;const groupLabel=groupPath.join(".");const memory=at(groupValue,program.incremental.memoryPeakSuffix);if(memory!==undefined){const used=number(groupValue,program.incremental.memoryPeakSuffix,`${label}.${groupLabel}.memory`);observations.push(used);participantValues.push(used);}const disk=at(groupValue,program.incremental.diskPeakSuffix);if(disk!==undefined&&number(groupValue,program.incremental.diskPeakSuffix,`${label}.${groupLabel}.disk`)>0)spill=true;}if(!found)throw new MetricError("missing-field",`${label}.incremental-groups`);}}nodeValues.push(participantAggregate(participantValues,program));}return finish(nodeValues,observations,participants,threshold,spill,program.nodeAggregation,a);
    }
    if(program.kind==="hash-participant-memory-max"){
      if(program.unit!=="kB"||program.spill.verdict!=="fail-spill")throw new MetricError("invalid-program-operand",metric);const observations=[],participants=[],nodeValues=[];let spill=false;for(const {node,path} of nodes(plan)){const q=program.qualifiers.find(x=>x.nodeType===node["Node Type"]&&(!x.strategies||x.strategies.includes(at(node,x.strategyPath))));if(!q)continue;const loops=number(node,program.loopsPath,`${path}.loops`);if(loops===0){participants.push("leader:unexecuted");nodeValues.push(0);continue;}const participantValues=[];const records=[{value:node,label:"leader",executed:true},...workerParticipants(node,path,program,a)];for(const participant of records){if(!participant.executed){participants.push(`${participant.label}:unexecuted`);continue;}participants.push(`${participant.label}:executed`);const label=`${path}.${participant.label}`;const memory=number(participant.value,q.memoryPath,`${label}.memory`);observations.push(memory);participantValues.push(memory);const batches=number(participant.value,q.batchesPath,`${label}.batches`);if(batches>program.spill.batchesGreaterThan)spill=true;if(q.diskPath&&number(participant.value,q.diskPath,`${label}.disk`)>program.spill.diskGreaterThan)spill=true;}nodeValues.push(participantAggregate(participantValues,program));}return finish(nodeValues,observations,participants,threshold,spill,program.nodeAggregation,a);
    }
    throw new MetricError("unknown-program",program.kind);
  } catch(error){if(error instanceof MetricError)return {error:error.code,path:error.path,pass:false};throw error;}
}

const exactKeys=(object,keys)=>object&&typeof object==="object"&&!Array.isArray(object)&&same(Object.keys(object).sort(),[...keys].sort());
function validateProgram(metric,p,a){
  if(!p||typeof p.kind!=="string")return false;
  if(p.kind==="node-symmetric-ratio-max")return exactKeys(p,["kind","nodeTypes","plannedPath","actualPath","loopsPath","scaleBothByLoops","bothZero","oneZero","parallelRows","nodeAggregation"]);
  if(p.kind==="edge-directed-ratio-max")return exactKeys(p,["kind","edges","childRelationshipPath","excludedChildParentRelationships","parentActualPath","parentLoopsPath","childActualPath","childLoopsPath","numerator","denominator","bothZero","positiveOverZero","parallelRows","edgeAggregation"]);
  if(p.kind==="nested-inner-effective-rows-max")return exactKeys(p,["kind","nodeTypes","innerChildIndex","actualPath","loopsPath","parallelRows","nodeAggregation"]);
  if(p.kind==="sort-participant-memory-max")return exactKeys(p,["kind","loopsPath","workerExecutionRule","participants","sort","incremental","nodeAggregation","unit","disk"])&&exactKeys(p.participants,["leader","aggregation"])&&exactKeys(p.sort,["nodeTypes","usedPath","typePath","memoryType","diskType"])&&exactKeys(p.incremental,["nodeTypes","groups","memoryPeakSuffix","diskPeakSuffix"])&&Boolean(a.evaluator.workerExecutionRules?.[p.workerExecutionRule]);
  if(p.kind==="hash-participant-memory-max")return exactKeys(p,["kind","qualifiers","loopsPath","workerExecutionRule","participants","nodeAggregation","unit","spill"])&&exactKeys(p.participants,["leader","aggregation"])&&exactKeys(p.spill,["batchesGreaterThan","diskGreaterThan","verdict"])&&p.qualifiers.every(q=>exactKeys(q,q.strategies?["nodeType","strategyPath","strategies","memoryPath","batchesPath","diskPath"]:["nodeType","memoryPath","batchesPath","diskPath"]))&&Boolean(a.evaluator.workerExecutionRules?.[p.workerExecutionRule]);
  return false;
}

function validateAuthority(a){
  const issues=[];const add=(ok,code)=>{if(!ok)issues.push(code);};
  add(a.schema==="tastkind.p2v-perf.plan-metric-semantics"&&a.version===1&&a.clarificationId==="P2V-PERF-001A-D1","identity");
  add(a.baseAuthority?.commit===baseCommit&&a.baseAuthority?.path===basePath&&a.baseAuthority?.sha256===baseSha&&a.baseAuthority?.postgresMajor===17,"base-binding");
  add(same(a.composition?.thresholdFields,fields)&&same(Object.keys(a.metrics??{}),fields),"five-field-bijection");
  add(/only for the five fields/.test(a.composition?.precedence??"")&&/base authority remains normative/i.test(a.composition?.precedence??"")&&/fails closed/.test(a.composition?.conflict??""),"precedence");
  const np=a.evaluator?.numericPolicy;add(np?.type==="json-number"&&np.finite===true&&np.minimum===0&&np.missing==="fail"&&np.negative==="fail"&&np.nonFinite==="fail"&&np.malformed==="fail","numeric-fail-closed");
  const wr=a.evaluator?.workerExecutionRules?.["worker-actual-loops-positive"];const referencedWorkerRules=new Set([a.metrics?.maxSortMemoryKb?.program?.workerExecutionRule,a.metrics?.maxHashMemoryKb?.program?.workerExecutionRule]);add(exactKeys(a.evaluator?.workerExecutionRules,["worker-actual-loops-positive"])&&referencedWorkerRules.size===1&&referencedWorkerRules.has("worker-actual-loops-positive")&&exactKeys(wr,["workersPath","recordIdentityPath","executionPath","predicate","numericPolicy","absentCollection","emptyCollection","zeroExecution","positiveExecution","invalidExecution","participantAggregation","leaderWorkerComposition"])&&same(wr.workersPath,["Workers"])&&same(wr.recordIdentityPath,["Worker Number"])&&same(wr.executionPath,["Actual Loops"])&&exactKeys(wr.predicate,["kind","operator","value"])&&wr.predicate.kind==="numeric-compare"&&wr.predicate.operator===">"&&wr.predicate.value===0&&same(wr.numericPolicy,np)&&wr.absentCollection==="no-worker-observations"&&wr.emptyCollection==="no-worker-observations"&&wr.zeroExecution==="unexecuted-no-runtime-fields-no-observation-contribution-zero"&&wr.positiveExecution==="executed-runtime-fields-required"&&wr.invalidExecution==="fail-closed"&&wr.participantAggregation==="max"&&wr.leaderWorkerComposition==="independent-observations-max-never-sum","worker-execution-semantics");
  const rp=a.evaluator?.runs?.program;add(rp?.track==="inner"&&same(rp.measuredRunIndexes,["cold",1,2,3,4,5,6,7])&&rp.warmupsIncluded===false&&rp.runAggregation==="all-pass"&&rp.diagnosticValueAggregation==="max","run-aggregation");
  add(rp?.comparison==="<="&&rp.equality==="pass"&&rp.missingEvidence==="fail"&&rp.mandatoryFailure==="suite-fail"&&rp.diagnosticFailure==="record-not-suite-gate","comparison-disposition");
  const ep=a.metrics?.maxEstimateRatio?.program;add(ep?.scaleBothByLoops===true&&ep.bothZero===1&&ep.oneZero==="fail-infinity"&&ep.parallelRows==="leader-only"&&ep.nodeAggregation==="max","estimate-semantics");
  const fp=a.metrics?.maxFanout?.program;add(fp?.edges==="direct-Plans"&&fp.numerator==="child-effective-rows"&&fp.denominator==="parent-effective-rows"&&same(fp.excludedChildParentRelationships,["InitPlan","SubPlan"])&&fp.edgeAggregation==="max","fanout-semantics");
  const npg=a.metrics?.maxNestedLoopRows?.program;add(npg?.innerChildIndex===1&&npg.parallelRows==="leader-only"&&npg.nodeAggregation==="max","nested-semantics");
  const sp=a.metrics?.maxSortMemoryKb?.program;add(sp?.workerExecutionRule==="worker-actual-loops-positive"&&sp?.participants?.aggregation==="max"&&sp.nodeAggregation==="max"&&sp.disk==="fail-spill"&&same(sp.sort?.nodeTypes,["Sort"])&&same(sp.incremental?.nodeTypes,["Incremental Sort"]),"sort-semantics");
  const hp=a.metrics?.maxHashMemoryKb?.program;add(hp?.workerExecutionRule==="worker-actual-loops-positive"&&hp?.participants?.aggregation==="max"&&hp.nodeAggregation==="max"&&hp.spill?.batchesGreaterThan===1&&hp.spill?.diskGreaterThan===0,"hash-semantics");
  add(fields.every(f=>validateProgram(f,a.metrics?.[f]?.program,a)),"program-schema");
  add(fields.every(f=>Array.isArray(a.metrics[f]?.diagnostic)&&a.metrics[f].diagnostic.includes("verdict")&&a.metrics[f].diagnostic.includes("threshold")),"diagnostic-schema");
  return issues;
}

function fixtureResults(a=authority){return a.fixtures.map(f=>{const actual=evaluate(f.metric,f.plan,f.threshold,a);const valueOk=f.expected.value===undefined||Math.abs(actual.value-f.expected.value)<1e-9;const errorOk=f.expected.error===undefined||actual.error===f.expected.error;const pathOk=f.expected.path===undefined||actual.path===f.expected.path;const spillOk=f.expected.spill===undefined||actual.spill===f.expected.spill;const observationsOk=f.expected.observations===undefined||same(actual.observations,f.expected.observations);const participantsOk=f.expected.participants===undefined||same(actual.participants,f.expected.participants);return {id:f.id,pass:valueOk&&errorOk&&pathOk&&spillOk&&observationsOk&&participantsOk&&actual.pass===f.expected.pass,actual};});}
function snapshot(){const status=git(["status","--porcelain=v1","--untracked-files=all"]).stdout.split(/\r?\n/).filter(Boolean);return {branch:git(["branch","--show-current"]).stdout.trim(),head:git(["rev-parse","HEAD"]).stdout.trim(),staged:git(["diff","--cached","--quiet"],true).status!==0,entries:status.map(x=>({status:x.slice(0,2),path:x.slice(3)})),protected:git(["diff","--name-only","HEAD","--","supabase/migrations","apps","packages","lib","package.json","package-lock.json",...frozenPaths]).stdout.split(/\r?\n/).filter(Boolean)};}
function validateSnapshot(s){const issues=[];if(s.branch!=="main")issues.push("branch");if(s.head!==baseCommit)issues.push("head");if(s.staged)issues.push("staged");if(!same(s.entries.map(x=>x.path).sort(),candidates))issues.push("candidate-inventory");if(s.entries.some(x=>x.status!=="??"))issues.push("candidate-status");if(s.protected.length)issues.push("protected-path");return issues;}

const checks=[];const record=(name,pass,detail)=>{checks.push({name,pass});console.log(`${pass?"PASS":"FAIL"} ${name}${detail===undefined?"":` ${JSON.stringify(detail)}`}`);};
record("clarification identity base commit digest PostgreSQL major",validateAuthority(authority).filter(x=>["identity","base-binding"].includes(x)).length===0);
record("five threshold fields form exact ordered bijection",!validateAuthority(authority).includes("five-field-bijection"));
record("precedence and composition fail closed",!validateAuthority(authority).includes("precedence"));
record("numeric missing negative malformed and non-finite rules fail closed",!validateAuthority(authority).includes("numeric-fail-closed"));
record("cold and seven warm inner runs use all-pass max-diagnostic aggregation",!validateAuthority(authority).includes("run-aggregation"));
record("threshold equality mandatory diagnostic and missing-evidence dispositions exact",!validateAuthority(authority).includes("comparison-disposition"));
record("estimate loop zero parallel and multi-node semantics executable",!validateAuthority(authority).includes("estimate-semantics"));
record("fan-out edge basis exclusions zero and aggregation executable",!validateAuthority(authority).includes("fanout-semantics"));
record("nested-loop inner processed row semantics executable",!validateAuthority(authority).includes("nested-semantics"));
record("sort leader worker incremental memory and spill semantics executable",!validateAuthority(authority).includes("sort-semantics"));
record("hash leader worker aggregate memory batch and disk semantics executable",!validateAuthority(authority).includes("hash-semantics"));
record("diagnostic evidence fields complete",!validateAuthority(authority).includes("diagnostic-schema"));
const fixtures=fixtureResults();for(const fixture of fixtures)record(`fixture ${fixture.id}`,fixture.pass,fixture.actual);
record("all executable plan fixtures pass",fixtures.every(x=>x.pass),`${fixtures.filter(x=>x.pass).length}/${fixtures.length}`);
record("base authority digest is exact",sha(baseText)===baseSha);
record("all three Frozen authority files are byte-identical",frozenPaths.every(p=>sha(read(p))===frozenShas.get(p)));
const migrationFiles=fs.readdirSync(path.join(root,"supabase/migrations")).filter(x=>x.endsWith(".sql")).sort();
record("migration inventory is exactly 41 and formal baseline sorts first",migrationFiles.length===41&&migrationFiles[0]==="20260712120000_create_restaurant_platform_baseline.sql",migrationFiles.length);
record("all migrations are byte-identical to base commit",migrationFiles.every(f=>git(["hash-object",`supabase/migrations/${f}`]).stdout.trim()===git(["rev-parse",`${baseCommit}:supabase/migrations/${f}`]).stdout.trim()));
const baseFields=Object.keys(base.thresholdProfiles).flatMap(p=>Object.keys(base.thresholdProfiles[p].inner??{})).filter((x,i,a)=>a.indexOf(x)===i);
record("base authority supplies all five unchanged profile fields",fields.every(f=>baseFields.includes(f))&&Object.keys(base.thresholdProfiles).length===9&&base.cases.length===35);
record("human contract binds base five fields and worker execution semantics",contract.includes("P2V-PERF-001A-D1")&&contract.includes(baseCommit)&&contract.includes(baseSha)&&fields.every(f=>contract.includes(`\`${f}\``))&&contract.includes('["Workers"]')&&contract.includes('["Worker Number"]')&&contract.includes('["Actual Loops"]')&&/Actual Loops == 0/.test(contract)&&/positive `Actual Loops`/.test(contract));
const snap=snapshot();record("Git branch HEAD staging candidate inventory and protected paths exact",validateSnapshot(snap).length===0,validateSnapshot(snap));
const contaminationPattern=new RegExp(["postgres","(?:ql)?",":\\/\\/","|sb_","secret_","|ey","J[A-Za-z0-9_-]{20,}","|-----BEGIN [A-Z ]*PRIVATE ","KEY-----","|service[_-]?","role\\s*[:=]","|pass","word\\s*[:=]"].join(""),"i");
record("candidate content has no secret remote connection or database artifact",!contaminationPattern.test(read(authorityPath)+contract+read(guardPath))&&candidates.every(p=>!/(?:PG_VERSION|postmaster\.pid|\.sql|\.dump|\.log)$/.test(p)));

if(process.argv.includes("--self-test")){
  const results=[];const mutation=(name,change,code)=>{const a=clone(authority);change(a);const pass=validateAuthority(a).includes(code);results.push(pass);console.log(`${pass?"PASS":"FAIL"} SELFTEST ${name}`);};
  const behavior=(name,pass)=>{results.push(pass);console.log(`${pass?"PASS":"FAIL"} SELFTEST ${name}`);};
  mutation("wrong base authority SHA",a=>a.baseAuthority.sha256="0".repeat(64),"base-binding");
  mutation("wrong five field names",a=>a.composition.thresholdFields[0]="wrongField","five-field-bijection");
  mutation("removed zero semantics",a=>delete a.metrics.maxEstimateRatio.program.bothZero,"estimate-semantics");
  mutation("removed per-loop rule",a=>a.metrics.maxEstimateRatio.program.scaleBothByLoops=false,"estimate-semantics");
  mutation("removed fan-out basis",a=>delete a.metrics.maxFanout.program.denominator,"fanout-semantics");
  mutation("removed multiple-node aggregation",a=>delete a.metrics.maxNestedLoopRows.program.nodeAggregation,"nested-semantics");
  mutation("removed parallel aggregation",a=>delete a.metrics.maxEstimateRatio.program.parallelRows,"estimate-semantics");
  mutation("removed cold warm aggregation",a=>a.evaluator.runs.program.measuredRunIndexes=[1,2,3,4,5,6,7],"run-aggregation");
  mutation("sort worker double counting",a=>a.metrics.maxSortMemoryKb.program.participants.aggregation="sum","sort-semantics");
  mutation("hash worker double counting",a=>a.metrics.maxHashMemoryKb.program.participants.aggregation="sum","hash-semantics");
  mutation("missing non-finite fail closed",a=>a.evaluator.numericPolicy.nonFinite="ignore","numeric-fail-closed");
  mutation("missing threshold comparison",a=>delete a.evaluator.runs.program.comparison,"comparison-disposition");
  const thresholdMutation=baseText.replace('"maxEstimateRatio":10','"maxEstimateRatio":11');const thresholdPass=thresholdMutation!==baseText&&sha(thresholdMutation)!==baseSha;results.push(thresholdPass);console.log(`${thresholdPass?"PASS":"FAIL"} SELFTEST modified original threshold detected by base digest`);
  const caseMutation=baseText.replace('"classification":"mandatory"','"classification":"diagnostic"');const casePass=caseMutation!==baseText&&sha(caseMutation)!==baseSha;results.push(casePass);console.log(`${casePass?"PASS":"FAIL"} SELFTEST modified case classification detected by base digest`);
  const frozenPass=sha(baseText+" ")!==baseSha;results.push(frozenPass);console.log(`${frozenPass?"PASS":"FAIL"} SELFTEST modified Frozen authority detected`);
  const extra=clone(snap);extra.entries.push({status:"??",path:"extra.txt"});const extraPass=validateSnapshot(extra).includes("candidate-inventory");results.push(extraPass);console.log(`${extraPass?"PASS":"FAIL"} SELFTEST extra candidate rejected`);
  const protectedSnap=clone(snap);protectedSnap.protected.push("supabase/migrations/example.sql");const protectedPass=validateSnapshot(protectedSnap).includes("protected-path");results.push(protectedPass);console.log(`${protectedPass?"PASS":"FAIL"} SELFTEST protected migration RPC index path rejected`);
  mutation("missing worker execution rule",a=>delete a.evaluator.workerExecutionRules["worker-actual-loops-positive"],"worker-execution-semantics");
  mutation("missing worker execution path",a=>delete a.evaluator.workerExecutionRules["worker-actual-loops-positive"].executionPath,"worker-execution-semantics");
  mutation("wrong worker execution path",a=>a.evaluator.workerExecutionRules["worker-actual-loops-positive"].executionPath=["Wrong Loops"],"worker-execution-semantics");
  const wrongExecution=clone(authority);wrongExecution.evaluator.workerExecutionRules["worker-actual-loops-positive"].executionPath=["Wrong Loops"];behavior("wrong worker execution path changes fixture result",fixtureResults(wrongExecution).some(x=>x.id==="hash-worker-executed-included"&&!x.pass));
  mutation("missing zero execution disposition",a=>delete a.evaluator.workerExecutionRules["worker-actual-loops-positive"].zeroExecution,"worker-execution-semantics");
  mutation("missing positive execution disposition",a=>delete a.evaluator.workerExecutionRules["worker-actual-loops-positive"].positiveExecution,"worker-execution-semantics");
  behavior("executed worker missing evidence fails closed",evaluate("maxSortMemoryKb",{"Node Type":"Sort","Actual Loops":1,"Sort Space Used":1,"Sort Space Type":"Memory","Workers":[{"Worker Number":0,"Actual Loops":1}]},10).error==="missing-field");
  behavior("unexecuted worker missing evidence is skipped",evaluate("maxHashMemoryKb",{"Node Type":"Hash","Actual Loops":1,"Peak Memory Usage":1,"Hash Batches":1,"Workers":[{"Worker Number":0,"Actual Loops":0}]},10).pass===true);
  const wrongWorkers=clone(authority);wrongWorkers.evaluator.workerExecutionRules["worker-actual-loops-positive"].workersPath=["Wrong Workers"];behavior("wrong workersPath changes fixture result instead of using fallback",fixtureResults(wrongWorkers).some(x=>x.id==="sort-worker-executed-included"&&!x.pass));
  const infiniteWorker={"Node Type":"Hash","Actual Loops":1,"Peak Memory Usage":1,"Hash Batches":1,"Workers":[{"Worker Number":0,"Actual Loops":Infinity}]};behavior("non-finite worker execution fails closed process locally",evaluate("maxHashMemoryKb",infiniteWorker,10).error==="invalid-number");
  mutation("unknown DSL opcode",a=>a.metrics.maxSortMemoryKb.program.kind="unknown-worker-memory-opcode","program-schema");
  mutation("declared unused operand rejected",a=>a.metrics.maxHashMemoryKb.program.unusedOperand=["Never Used"],"program-schema");
  mutation("declared worker execution rule must be referenced",a=>a.evaluator.workerExecutionRules["unused-worker-rule"]=clone(a.evaluator.workerExecutionRules["worker-actual-loops-positive"]),"worker-execution-semantics");
  console.log(`SELFTEST RESULT ${results.filter(Boolean).length}/${results.length} ${results.every(Boolean)?"PASS":"FAIL"}`);if(!results.every(Boolean))process.exitCode=1;
}
const failed=checks.filter(x=>!x.pass);console.log(`RESULT ${checks.length-failed.length}/${checks.length} ${failed.length?"FAIL":"PASS"}`);if(failed.length)process.exitCode=1;
