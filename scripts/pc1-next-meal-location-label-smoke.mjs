#!/usr/bin/env node
// PC-1 B2: recommendation location label. Executes the REAL presenter formatter over the six locked
// cases and verifies both presentations (list and selected-candidate detail) use it. Local only.
import fs from "node:fs";
import path from "node:path";
import { createTsLoader } from "./gqa6r-ts-loader.mjs";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(pass || detail === undefined ? {} : { detail }) });
const { load } = createTsLoader();
const { formatNextMealLocationLine: f } = load("apps/mobile/features/next-meal-prototype/nextMealPrototypePresenter.ts");

// The live repository composes areaLabel as "branch · district" (supabaseConsumerNextMealRecommendationRepository).
const live = (restaurantName, branchName, district) => ({
  restaurantName, branchName, areaLabel: [branchName, district].filter(Boolean).join(" · ") || null
});

const cases = [
  ["B2-1 restaurant and branch differ -> both kept once, then district",
    f(live("[DEMO] 好廚測試餐館 01", "[DEMO] 示範分店 01", "大安區")), "[DEMO] 好廚測試餐館 01 · [DEMO] 示範分店 01 · 大安區"],
  ["B2-2 restaurant equals branch -> shown once",
    f(live("好廚健康碗", "好廚健康碗", "松山區")), "好廚健康碗 · 松山區"],
  ["B2-3 branch already inside areaLabel (the GQA-6 defect) -> never repeated",
    f({ restaurantName: "[DEMO] 好廚測試餐館 01", branchName: "[DEMO] 示範分店 01", areaLabel: "[DEMO] 示範分店 01 · 大安區" }),
    "[DEMO] 好廚測試餐館 01 · [DEMO] 示範分店 01 · 大安區"],
  ["B2-4 branch missing -> restaurant · district", f(live("好廚健康碗 Development", null, "大安區")), "好廚健康碗 Development · 大安區"],
  ["B2-5 district missing -> restaurant · branch", f(live("好廚健康碗 Development", "南京復興店", null)), "好廚健康碗 Development · 南京復興店"],
  ["B2-6 blank / whitespace labels are dropped",
    f({ restaurantName: "  好廚健康碗  ", branchName: "   ", areaLabel: " · 信義安和店 ·  · 大安區 " }), "好廚健康碗 · 信義安和店 · 大安區"],
  ["B2-7 nothing usable -> empty line", f({ restaurantName: " ", branchName: undefined, areaLabel: null }), ""]
];
for (const [name, actual, expected] of cases) check(name, actual === expected, { actual, expected });

const input = Object.freeze({ restaurantName: "R", branchName: "B", areaLabel: "B · D" });
f(input);
check("B2-8 the formatter is pure (input unchanged; canonical names never modified)",
  input.restaurantName === "R" && input.branchName === "B" && input.areaLabel === "B · D");

const content = fs.readFileSync(path.join(root, "apps/mobile/features/next-meal-prototype/NextMealPrototypeContent.tsx"), "utf8");
check("B2-9 the list line uses the formatter and appends calories AFTER the location (never deduped with it)",
  /\{\[formatNextMealLocationLine\(candidate\), candidate\.calorieLabel\]\.filter\(Boolean\)\.join\(" · "\)\}/.test(content));
check("B2-10 the selected-candidate detail line uses the same formatter",
  /<Text style=\{styles\.mealMeta\}>\{formatNextMealLocationLine\(selectedCandidate\)\}<\/Text>/.test(content));
check("B2-11 no presentation still concatenates restaurant, branch and areaLabel by hand",
  !/restaurantName, (selectedCandidate|candidate)\.branchName, (selectedCandidate|candidate)\.areaLabel/.test(content)
  && !/\[candidate\.restaurantName, candidate\.areaLabel/.test(content));
check("B2-12 identical labels with calories still show calories once, after the location",
  [f(live("好廚健康碗", "好廚健康碗", "松山區")), "520 kcal"].filter(Boolean).join(" · ") === "好廚健康碗 · 松山區 · 520 kcal");

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}${c.pass ? "" : `\n     detail: ${JSON.stringify(c.detail ?? null).slice(0, 400)}`}`);
console.log(JSON.stringify({ suite: "pc1-next-meal-location-label-smoke", total: checks.length, passed: checks.length - failed.length, failed: failed.length, networkUsed: false }));
process.exitCode = failed.length ? 1 : 0;
