#!/usr/bin/env node
import { auditApplicationSources, modelRequest, modelUncertain, modelVersion, readP2Sources }
  from "./restaurant-owner-sold-out-ra-2a-p2-contract.mjs";

const checks=[];
const check=(name,pass)=>{checks.push({name,pass:Boolean(pass)});console.log(`${pass?"PASS":"FAIL"} ${checks.length} ${name}`);};
for(const result of auditApplicationSources(readP2Sources())) check(result.name,result.pass);

check("version zero is valid",modelVersion("0"));
check("version two is valid",modelVersion("2"));
check("maximum bigint is valid",modelVersion("9223372036854775807"));
check("overflow bigint is invalid",!modelVersion("9223372036854775808"));
check("numeric version is invalid",!modelVersion(2));
check("negative version is invalid",!modelVersion("-1"));
check("leading-zero version is invalid",!modelVersion("02"));
check("decimal version is invalid",!modelVersion("2.0"));
const valid={expectedSoldOut:false,nextSoldOut:true,expectedVersion:"2"};
check("exact request is valid",modelRequest(valid));
for(const [name,value] of [
  ["null request",null],
  ["unknown field",{...valid,role:"owner"}],
  ["caller user id",{...valid,userId:"caller"}],
  ["caller restaurant authority",{...valid,restaurantId:"restaurant"}],
  ["price patch",{...valid,price:1}],
  ["availability patch",{...valid,availability:"available"}],
  ["null boolean",{...valid,nextSoldOut:null}],
  ["string boolean",{...valid,nextSoldOut:"true"}],
  ["numeric expected version",{...valid,expectedVersion:2}]
]) check(`${name} is rejected`,!modelRequest(value));
check("uncertain applied result reconciles",modelUncertain({state:"ready",soldOut:true},true)==="reconciled");
check("uncertain unapplied result requires explicit retry",modelUncertain({state:"ready",soldOut:false},true)==="explicit_retry_required");
check("unavailable reconciliation requires explicit retry",modelUncertain({state:"dependency_unavailable"},true)==="explicit_retry_required");

const failures=checks.filter(row=>!row.pass);
console.log(JSON.stringify({suite:"restaurant-owner-sold-out-ra-2a-p2-smoke",total:checks.length,
  passed:checks.length-failures.length,failed:failures.length,failures},null,2));
if(failures.length)process.exitCode=1;
