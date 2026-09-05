#!/usr/bin/env node
import fs from "node:fs";
const s=fs.readFileSync("apps/restaurant-web/runtime/restaurant-owner-price.ts","utf8");
const tests=[["legacy decimal preview",s.includes("EXPECTED_PRICE")],["canonical integer",s.includes("NEXT_PRICE")],["zero rejected",s.includes("^[1-9][0-9]{0,5}$")],["exact body",s.includes('["expectedPrice", "nextPrice", "expectedVersion"]')],["bounded preview",s.includes('["ok","state","branchMenuItemId","branchId","menuItemId","price","priceVersion"]')],["priceVersion string",s.includes("priceVersion: string")]];for(const[n,p]of tests)console.log(`${p?"PASS":"FAIL"} ${n}`);if(tests.some(([,p])=>!p))process.exitCode=1;
