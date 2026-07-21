import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authorityPath = "docs/runtime-integration-phase-2v-e/p2v-perf-001-dataset-semantics-authority.json";
const contractPath = "docs/runtime-integration-phase-2v-e/p2v-perf-001-dataset-semantics-contract.md";
const guardPath = "scripts/restaurant-performance-p2v-perf-001b-dataset-semantics-guard.mjs";
const basePath = "docs/runtime-integration-phase-2v-e/p2v-perf-001-representative-scale-authority.json";
const baseContractPath = "docs/runtime-integration-phase-2v-e/performance-and-query-plan-contract.md";
const baseGuardPath = "scripts/restaurant-performance-p2v-perf-001a-authority-guard.mjs";
const planPath = "docs/runtime-integration-phase-2v-e/p2v-perf-001-plan-metric-semantics-authority.json";
const planContractPath = "docs/runtime-integration-phase-2v-e/p2v-perf-001-plan-metric-semantics-contract.md";
const planGuardPath = "scripts/restaurant-performance-p2v-perf-001a-d1-plan-metric-semantics-guard.mjs";
const migrationPath = "supabase/migrations/20260712120000_create_restaurant_platform_baseline.sql";
const baseCommit = "26035d2b7a18c974ab76ba0a79565eab803a2199";
const selfTestTokenVariable = "P2V_PERF_001B_GUARD_SELF_TEST_TOKEN";
const isolatedTemporaryRoot = fs.realpathSync(process.platform === "win32" ? os.tmpdir() : "/tmp");
const candidates = [authorityPath, contractPath, guardPath].sort();
const frozen = new Map([
  [basePath, "4bfc94a5085a537c3faff97deb8329800f8171e506cbe37c0308a66035a24ade"],
  [baseContractPath, "81af13e4078a7ed820a7088472ab449b00bc50514fdeef11fdeaecc4170e28f2"],
  [baseGuardPath, "dc18308ff9735fabf266cef0f4591a34bf099bf2527753146000baddee319292"],
  [planPath, "ce9236f9a5855b041fa9edb8dc667378e8303168a12b782a1a52510cf1a22067"],
  [planContractPath, "a9429e148c7bbfdb3e13465847a8ef60aafbc8d864344ce8dae8b67fa09ab7c4"],
  [planGuardPath, "137744cc9282333c691a22e206bec04e32fd540015cc7e6b303f218917687f00"]
]);

const read = file => fs.readFileSync(path.join(root, file), "utf8");
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const clone = value => structuredClone(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && same(Object.keys(value).sort(), [...keys].sort());
const git = (args, allowFailure = false) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || result.error?.message || "git failed");
  return result;
};

const cliArgs = process.argv.slice(2);
const selfTestParent = cliArgs.length === 1 && cliArgs[0] === "--self-test";
const selfTestChild = cliArgs[0] === "--self-test-child" && cliArgs[1] === "--self-test-authority" && cliArgs.length === 3;
if (cliArgs.length !== 0 && !selfTestParent && !selfTestChild) throw new Error("invalid guard invocation");

const selfTestAuthorityPath = (() => {
  if (!selfTestChild) return null;
  const token = process.env[selfTestTokenVariable] ?? "";
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error("invalid self-test token");
  const candidate = path.resolve(cliArgs[2]);
  const temporaryRoot = isolatedTemporaryRoot;
  const candidateParent = fs.realpathSync(path.dirname(candidate));
  const relativeParent = path.relative(temporaryRoot, candidateParent);
  const candidateStat = fs.lstatSync(candidate);
  const realCandidate = fs.realpathSync(candidate);
  if (relativeParent.startsWith("..") || path.isAbsolute(relativeParent) || !path.basename(candidateParent).startsWith(`p2v-perf-001b-${token}-`) || path.basename(candidate) !== "authority.json" || candidateStat.isSymbolicLink() || !candidateStat.isFile() || path.dirname(realCandidate) !== candidateParent || path.basename(realCandidate) !== "authority.json") {
    throw new Error("self-test authority must be an isolated temporary authority");
  }
  return candidate;
})();

const authorityText = selfTestAuthorityPath === null ? read(authorityPath) : fs.readFileSync(selfTestAuthorityPath, "utf8");
const authority = JSON.parse(authorityText);
const contract = read(contractPath);
const base = JSON.parse(read(basePath));
const plan = JSON.parse(read(planPath));
const migration = read(migrationPath);
if (selfTestChild) console.log(`SELFTEST CHILD INPUT ${JSON.stringify({ mode: "self-test-child", authoritySha256: digest(authorityText) })}`);

class DslError extends Error {}
const integer = (value, label) => {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) throw new DslError(`invalid integer ${label}`);
  return value;
};
const tenantClassValue = (program, tenantOrdinal) => {
  if (!exactKeys(program, ["kind", "maxTenantOrdinal", "maxValue", "noiseValue"]) || program.kind !== "tenant-class-value") throw new DslError("invalid tenant-class-value program");
  return tenantOrdinal === program.maxTenantOrdinal ? program.maxValue : program.noiseValue;
};
const domainCounts = (a, tenantOrdinal) => ({
  menus: tenantClassValue(a.domains.menuOrdinal.countProgram, tenantOrdinal),
  itemsPerMenu: tenantClassValue(a.domains.itemWithinMenu.countProgram, tenantOrdinal)
});
const itemOrdinal = (a, tenantOrdinal, menuOrdinal, itemWithinMenu) => {
  const program = a.domains.tenantLocalItemOrdinal.program;
  if (!exactKeys(program, ["kind", "outerCounter", "innerCounter", "innerCountDomain"]) || program.kind !== "row-major-index-2d") throw new DslError("invalid item ordinal program");
  const counts = domainCounts(a, tenantOrdinal);
  if (menuOrdinal >= counts.menus || itemWithinMenu >= counts.itemsPerMenu) throw new DslError("item counter outside domain");
  return menuOrdinal * counts.itemsPerMenu + itemWithinMenu;
};
const itemFields = (a, tenantOrdinal, menuOrdinal, itemWithinMenu) => {
  const program = a.programs["A-menu-items-name-and-allergens"];
  if (!exactKeys(program, ["kind", "counter", "nameIdentifier", "nameTemplate", "modulus", "remainderMapping"]) || program.kind !== "item-parity-fields") throw new DslError("invalid item field program");
  const ordinal = itemOrdinal(a, tenantOrdinal, menuOrdinal, itemWithinMenu);
  const padding = a.domains.tenantLocalItemOrdinal.paddedIdentifier;
  if (!exactKeys(padding, ["name", "kind", "width", "pad"]) || padding.kind !== "decimal-left-pad") throw new DslError("invalid padding program");
  const identifier = String(ordinal).padStart(padding.width, padding.pad);
  const allergens = program.remainderMapping[String(ordinal % program.modulus)];
  if (!Array.isArray(allergens)) throw new DslError("missing allergen remainder");
  return { tenantLocalItemOrdinal: ordinal, itemOrdinal5: identifier, name: program.nameTemplate.replace("${itemOrdinal5}", identifier), allergens };
};
const nutritionFields = (a, tenantLocalItemOrdinal, nutritionVersion, itemStatus) => {
  integer(tenantLocalItemOrdinal, "tenantLocalItemOrdinal"); integer(nutritionVersion, "nutritionVersion");
  if (nutritionVersion === 1) return clone(a.programs["history-version"].fields);
  if (nutritionVersion !== 0) throw new DslError("unknown nutrition version");
  if (itemStatus === "active") {
    const program = a.programs["B-C-version0-active-source-and-status"];
    if (program.kind !== "shared-item-parity-fields" || program.counter !== "tenantLocalItemOrdinal" || program.sharedCounterRequired !== true) throw new DslError("invalid active parity program");
    const remainder = String(tenantLocalItemOrdinal % program.modulus);
    return { source: program.fields.source[remainder], verified_status: program.fields.verified_status[remainder] };
  }
  if (["draft", "archived"].includes(itemStatus)) {
    const program = a.programs["C-D-version0-non-active-source-and-status"];
    if (program.kind !== "fixed-and-item-parity-fields" || program.counter !== "tenantLocalItemOrdinal") throw new DslError("invalid non-active program");
    const remainder = String(tenantLocalItemOrdinal % program.modulus);
    return { ...program.fixedFields, verified_status: program.parityFields.verified_status[remainder] };
  }
  throw new DslError("unknown item status");
};
const nutritionOrdinal = (a, tenantOrdinal, tenantLocalItemOrdinal, nutritionVersion) => {
  const program = a.programs["F-menu-item-nutrition-updated-at"].rowOrdinalProgram;
  if (!exactKeys(program, ["kind", "tenantCounter", "itemCounter", "versionCounter", "maxTenantOrdinal", "maxTenantItemCount", "noiseTenantItemCount", "versionsPerItem", "noiseTenantBaseRows", "noiseTenantOrdinalOffset"]) || program.kind !== "piecewise-tenant-item-version-index") throw new DslError("invalid nutrition ordinal program");
  if (nutritionVersion >= program.versionsPerItem) throw new DslError("version outside domain");
  const itemCount = tenantOrdinal === program.maxTenantOrdinal ? program.maxTenantItemCount : program.noiseTenantItemCount;
  if (tenantLocalItemOrdinal >= itemCount) throw new DslError("item outside tenant domain");
  return tenantOrdinal === program.maxTenantOrdinal
    ? tenantLocalItemOrdinal * program.versionsPerItem + nutritionVersion
    : program.noiseTenantBaseRows + (tenantOrdinal - program.noiseTenantOrdinalOffset) * program.noiseTenantItemCount * program.versionsPerItem + tenantLocalItemOrdinal * program.versionsPerItem + nutritionVersion;
};
const timestamp = (program, ordinal) => {
  if (program.kind !== "timestamp-from-row-ordinal" || program.rowOrdinalScope !== "table" || program.rowOrdinalBase !== 0 || program.intervalUnit !== "second") throw new DslError("invalid timestamp program");
  return new Date(Date.parse(program.baseTimestamp) + ordinal * program.intervalMultiplier * 1000).toISOString();
};

function validateStructure(a) {
  const issues = []; const add = (pass, code) => { if (!pass) issues.push(code); };
  add(exactKeys(a, ["schema", "version", "clarificationId", "baseAuthority", "planMetricClarification", "composition", "evaluator", "domains", "generationLoops", "programs", "schemaCompatibility", "fixtures"]), "top-level-schema");
  add(a.schema === "tastkind.p2v-perf.dataset-semantics" && a.version === 1 && a.clarificationId === "P2V-PERF-001B-DATASET-SEMANTICS-C1", "identity");
  add(a.baseAuthority?.commit === baseCommit && a.baseAuthority?.path === basePath && a.baseAuthority?.sha256 === frozen.get(basePath) && a.baseAuthority?.authorityId === base.authorityId && a.baseAuthority?.postgresVersion === "17.6" && a.baseAuthority?.seed === base.seed, "base-binding");
  add(a.planMetricClarification?.path === planPath && a.planMetricClarification?.sha256 === frozen.get(planPath) && a.planMetricClarification?.contractSha256 === frozen.get(planContractPath) && a.planMetricClarification?.guardSha256 === frozen.get(planGuardPath), "plan-binding");
  const resolved = ["menu_items.name.ordinalIdentifier", "menu_items.allergens", "menu_item_nutrition.version0.active.source", "menu_item_nutrition.version0.active.verified_status", "menu_item_nutrition.version0.nonActive.source", "menu_item_nutrition.version0.nonActive.verified_status", "restaurants.created_at", "menu_item_nutrition.updated_at"];
  add(same(a.composition?.resolvedFields, resolved) && /only for the A-F/.test(a.composition?.precedence ?? "") && /fails closed/.test(a.composition?.conflict ?? ""), "scope-precedence");
  add(exactKeys(a.evaluator, ["language", "integerPolicy", "undefinedIdentifier", "unknownOpcode", "unknownOperand", "missingOperand", "unusedOperand"]) && exactKeys(a.evaluator?.integerPolicy, ["type", "finite", "integer", "minimum", "missing", "negative", "nonFinite", "malformed"]) && a.evaluator?.language === "P2V_DATASET_DSL_1" && Object.values(a.evaluator).slice(2).every(value => value === "fail-closed"), "evaluator-policy");
  add(exactKeys(a.domains, ["tenantOrdinal", "menuOrdinal", "itemWithinMenu", "tenantLocalItemOrdinal", "nutritionVersion"]), "domain-inventory");
  add(exactKeys(a.domains.tenantOrdinal, ["scope", "base", "minimum", "maximum", "count", "order"]) && a.domains.tenantOrdinal?.scope === "dataset" && a.domains.tenantOrdinal?.base === 0 && a.domains.tenantOrdinal?.minimum === 0 && a.domains.tenantOrdinal?.maximum === 49 && a.domains.tenantOrdinal?.count === 50 && a.domains.tenantOrdinal?.order === "ascending", "tenant-domain");
  add(exactKeys(a.domains.menuOrdinal, ["scope", "base", "order", "countProgram"]) && a.domains.menuOrdinal?.scope === "tenant" && a.domains.menuOrdinal?.base === 0 && a.domains.menuOrdinal?.order === "ascending", "menu-domain");
  add(exactKeys(a.domains.itemWithinMenu, ["scope", "base", "order", "countProgram"]) && a.domains.itemWithinMenu?.scope === "menu" && a.domains.itemWithinMenu?.base === 0 && a.domains.itemWithinMenu?.order === "ascending", "item-within-domain");
  add(exactKeys(a.domains.tenantLocalItemOrdinal, ["scope", "base", "order", "program", "paddedIdentifier"]) && a.domains.tenantLocalItemOrdinal?.scope === "tenant" && a.domains.tenantLocalItemOrdinal?.base === 0 && a.domains.tenantLocalItemOrdinal?.order === "ascending" && a.domains.tenantLocalItemOrdinal?.paddedIdentifier?.name === "itemOrdinal5", "item-domain");
  add(exactKeys(a.domains.nutritionVersion, ["scope", "base", "minimum", "maximum", "count", "order", "meaning"]) && a.domains.nutritionVersion?.scope === "menu-item" && a.domains.nutritionVersion?.base === 0 && a.domains.nutritionVersion?.minimum === 0 && a.domains.nutritionVersion?.maximum === 1 && a.domains.nutritionVersion?.count === 2 && a.domains.nutritionVersion?.order === "ascending", "version-domain");
  add(same(a.generationLoops?.menu_items?.counters, ["tenantOrdinal", "menuOrdinal", "itemWithinMenu"]) && same(a.generationLoops?.menu_items?.orders, ["ascending", "ascending", "ascending"]), "item-loop");
  add(same(a.generationLoops?.menu_item_nutrition?.counters, ["tenantOrdinal", "menuOrdinal", "itemWithinMenu", "nutritionVersion"]) && same(a.generationLoops?.menu_item_nutrition?.orders, ["ascending", "ascending", "ascending", "ascending"]), "nutrition-loop");
  add(exactKeys(a.programs, ["A-menu-items-name-and-allergens", "B-C-version0-active-source-and-status", "C-D-version0-non-active-source-and-status", "history-version", "E-restaurants-created-at", "F-menu-item-nutrition-updated-at"]), "program-inventory");
  const ap = a.programs?.["A-menu-items-name-and-allergens"], active = a.programs?.["B-C-version0-active-source-and-status"], nonActive = a.programs?.["C-D-version0-non-active-source-and-status"], history = a.programs?.["history-version"], e = a.programs?.["E-restaurants-created-at"];
  add(exactKeys(ap, ["kind", "counter", "nameIdentifier", "nameTemplate", "modulus", "remainderMapping"]) && exactKeys(active, ["kind", "appliesWhen", "counter", "modulus", "fields", "sharedCounterRequired"]) && exactKeys(nonActive, ["kind", "appliesWhen", "fixedFields", "counter", "modulus", "parityFields"]) && exactKeys(history, ["kind", "appliesWhen", "fields"]) && exactKeys(e, ["kind", "table", "rowOrdinalProgram", "rowOrdinalScope", "rowOrdinalBase", "baseTimestamp", "intervalUnit", "intervalMultiplier", "enumeration", "examples"]), "program-schema");
  const f = a.programs?.["F-menu-item-nutrition-updated-at"];
  add(f?.rowOrdinalMinimum === 0 && f?.rowOrdinalMaximum === 11039 && f?.rowCount === 11040 && f?.strides?.nutritionVersion === 1 && f?.strides?.tenantLocalItemOrdinal === 2 && f?.strides?.maxTenant === 3200 && f?.strides?.noiseTenant === 160, "nutrition-strides");
  const candidateText = JSON.stringify(a);
  add(!candidateText.includes("tenantOrdinal5") && !/\b(?:even|odd|alternates)\b/i.test(candidateText), "ambiguous-language");
  return issues;
}

function fullEnumeration(a) {
  const itemRows = []; const nutritionRows = [];
  for (let tenantOrdinal = 0; tenantOrdinal < a.domains.tenantOrdinal.count; tenantOrdinal += 1) {
    const counts = domainCounts(a, tenantOrdinal);
    for (let menuOrdinal = 0; menuOrdinal < counts.menus; menuOrdinal += 1) {
      for (let itemWithinMenu = 0; itemWithinMenu < counts.itemsPerMenu; itemWithinMenu += 1) {
        const item = itemFields(a, tenantOrdinal, menuOrdinal, itemWithinMenu);
        const activeLimit = tenantOrdinal === 0 ? 180 : 32;
        const draftLimit = tenantOrdinal === 0 ? 190 : 36;
        const itemStatus = itemWithinMenu < activeLimit ? "active" : itemWithinMenu < draftLimit ? "draft" : "archived";
        itemRows.push({ tenantOrdinal, menuOrdinal, itemWithinMenu, itemStatus, ...item });
        for (let version = 0; version < 2; version += 1) {
          const rowOrdinal = nutritionOrdinal(a, tenantOrdinal, item.tenantLocalItemOrdinal, version);
          nutritionRows.push({ tenantOrdinal, tenantLocalItemOrdinal: item.tenantLocalItemOrdinal, version, rowOrdinal, updated_at: timestamp(a.programs["F-menu-item-nutrition-updated-at"], rowOrdinal), ...nutritionFields(a, item.tenantLocalItemOrdinal, version, itemStatus) });
        }
      }
    }
  }
  return { itemRows, nutritionRows };
}

const constraintValues = (column, table = "menu_item_nutrition") => {
  const tableStart = migration.indexOf(`CREATE TABLE public.${table}`);
  const tableEnd = migration.indexOf(";", tableStart);
  const body = migration.slice(tableStart, tableEnd);
  const match = body.match(new RegExp(`${column}\\s+text[^\\n]*CHECK \\(.*?${column} IN \\(([^)]+)\\)`, "s"));
  if (!match) throw new Error(`constraint not found: ${table}.${column}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(value => value[1]);
};

const checks = []; const record = (name, pass, detail) => { checks.push({ name, pass }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`); };
const structuralIssues = validateStructure(authority);
record("machine authority structure is closed complete and valid", structuralIssues.length === 0, structuralIssues);
if (structuralIssues.length === 0) {
record("machine identity base and plan clarification bindings exact", !structuralIssues.some(issue => ["identity", "base-binding", "plan-binding"].includes(issue)));
record("closed scope precedence preserves every non A-F obligation", !structuralIssues.includes("scope-precedence"));
record("DSL fail-closed policies and exact domain inventory", !structuralIssues.some(issue => ["evaluator-policy", "domain-inventory"].includes(issue)));
record("all counters have explicit zero base scope and ascending order", !structuralIssues.some(issue => ["tenant-domain", "menu-domain", "item-within-domain", "item-domain", "version-domain"].includes(issue)));
record("item and nutrition loop nesting is exact", !structuralIssues.some(issue => ["item-loop", "nutrition-loop"].includes(issue)));
record("program inventory is exact and has no undefined identifier or ambiguous parity prose", !structuralIssues.some(issue => ["program-inventory", "ambiguous-language"].includes(issue)));
record("formal baseline admits exact item statuses", same(constraintValues("status", "menu_items"), authority.schemaCompatibility.menuItemStatuses));
record("formal baseline admits exact nutrition source literals including pending", same(constraintValues("source"), authority.schemaCompatibility.nutritionSources));
record("formal baseline admits exact verified status literals", same(constraintValues("verified_status"), authority.schemaCompatibility.nutritionVerifiedStatuses));
record("all Frozen base and plan files retain exact digests", [...frozen].every(([file, expected]) => digest(read(file)) === expected));
record("base invariant counts cases classifications profiles and generation order unchanged", authority.composition.preservedBaseInvariants.tenants === base.dataset.tenants && authority.composition.preservedBaseInvariants.items === base.dataset.global.items && authority.composition.preservedBaseInvariants.nutritionRows === base.dataset.global.nutritionRows && authority.composition.preservedBaseInvariants.currentNutritionRows === base.dataset.global.currentNutritionRows && authority.composition.preservedBaseInvariants.publicViewEligibleNutritionRows === base.dataset.global.publicViewEligibleNutritionRows && authority.composition.preservedBaseInvariants.cases === base.cases.length && authority.composition.preservedBaseInvariants.mandatoryCases === base.cases.filter(value => value.classification === "mandatory").length && authority.composition.preservedBaseInvariants.diagnosticCases === base.cases.filter(value => value.classification === "diagnostic").length && authority.composition.preservedBaseInvariants.thresholdProfiles === Object.keys(base.thresholdProfiles).length && authority.composition.preservedBaseInvariants.generationOrderEntries === base.generation.generationOrder.length);
record("plan metric field inventory and semantics remain untouched", plan.schema === "tastkind.p2v-perf.plan-metric-semantics" && plan.version === 1 && Object.keys(plan.metrics).length === 5);

let enumeration;
try { enumeration = fullEnumeration(authority); } catch (error) { enumeration = { error: error.message, itemRows: [], nutritionRows: [] }; }
record("full item enumeration is exactly 5520 rows", enumeration.itemRows.length === 5520, enumeration.error);
record("tenant-local item ordinals are contiguous and unique per tenant", enumeration.itemRows.length === 5520 && [...new Set(enumeration.itemRows.map(row => `${row.tenantOrdinal}:${row.tenantLocalItemOrdinal}`))].length === 5520 && enumeration.itemRows.every(row => row.tenantLocalItemOrdinal >= 0 && row.tenantLocalItemOrdinal < (row.tenantOrdinal === 0 ? 1600 : 80)));
record("allergen mapping uses tenant-local item parity and exact text arrays", enumeration.itemRows.every(row => same(row.allergens, row.tenantLocalItemOrdinal % 2 === 0 ? [] : ["soy"])));
record("itemOrdinal5 names are five-digit tenant-local identifiers", enumeration.itemRows.every(row => row.itemOrdinal5 === String(row.tenantLocalItemOrdinal).padStart(5, "0") && row.name === `perf-item-${row.itemOrdinal5}`));
record("full nutrition enumeration is exactly 11040 rows", enumeration.nutritionRows.length === 11040);
const ordinals = enumeration.nutritionRows.map(row => row.rowOrdinal).sort((a, b) => a - b);
record("nutrition table ordinals are unique contiguous zero through 11039", ordinals.length === 11040 && new Set(ordinals).size === 11040 && ordinals.every((value, index) => value === index));
const isActiveItem = row => {
  const itemsPerMenu = row.tenantOrdinal === 0 ? 200 : 40;
  const activeLimit = row.tenantOrdinal === 0 ? 180 : 32;
  return row.tenantLocalItemOrdinal % itemsPerMenu < activeLimit;
};
record("active current source and status share exact tenant-local parity", enumeration.nutritionRows.filter(row => row.version === 0 && isActiveItem(row)).every(row => row.source === (row.tenantLocalItemOrdinal % 2 === 0 ? "restaurant_verified" : "ai_estimated") && row.verified_status === (row.tenantLocalItemOrdinal % 2 === 0 ? "verified" : "ai_estimated")));
record("non-active current source is pending and status uses exact parity", enumeration.nutritionRows.filter(row => row.version === 0 && !isActiveItem(row)).every(row => row.source === "pending" && row.verified_status === (row.tenantLocalItemOrdinal % 2 === 0 ? "pending_review" : "rejected")));
record("history version fixed fields are exact", enumeration.nutritionRows.filter(row => row.version === 1).every(row => row.source === "admin_verified" && row.verified_status === "rejected" && row.is_current === false));
record("public eligible arithmetic remains 4256", enumeration.nutritionRows.filter(row => row.version === 0 && row.tenantOrdinal <= 44 && ["verified", "ai_estimated"].includes(row.verified_status)).length === 4256);
const restaurantProgram = authority.programs["E-restaurants-created-at"];
record("restaurant row ordinal and timestamp boundaries exact", restaurantProgram.examples.every(example => timestamp(restaurantProgram, example.rowOrdinal) === example.timestamp) && restaurantProgram.examples[0].rowOrdinal === 0 && restaurantProgram.examples.at(-1).rowOrdinal === 49);
const nutritionProgram = authority.programs["F-menu-item-nutrition-updated-at"];
record("nutrition formula strides row count and boundaries exact", !structuralIssues.includes("nutrition-strides") && nutritionProgram.examples.every(example => nutritionOrdinal(authority, example.tenantOrdinal, example.tenantLocalItemOrdinal, example.nutritionVersion) === example.rowOrdinal && timestamp(nutritionProgram, example.rowOrdinal) === example.timestamp));
record("all executable fixtures pass", authority.fixtures.every(fixture => {
  if (fixture.input.menuOrdinal !== undefined) {
    const actual = itemFields(authority, fixture.input.tenantOrdinal, fixture.input.menuOrdinal, fixture.input.itemWithinMenu);
    return Object.entries(fixture.expected).every(([key, value]) => same(actual[key], value));
  }
  const actual = nutritionFields(authority, fixture.input.tenantLocalItemOrdinal, fixture.input.nutritionVersion, fixture.input.itemStatus);
  return Object.entries(fixture.expected).every(([key, value]) => same(actual[key], value));
}), `${authority.fixtures.length}/${authority.fixtures.length}`);
record("human contract binds machine identity and every A-F decision", contract.includes("tastkind.p2v-perf.dataset-semantics") && contract.includes("P2V_DATASET_DSL_1") && contract.includes("tenantLocalItemOrdinal") && contract.includes("itemOrdinal5") && contract.includes("restaurant_verified") && contract.includes("pending_review") && contract.includes("source=admin_verified") && contract.includes("11039") && contract.includes("2026-01-01T03:03:59.000Z"));

const status = git(["status", "--porcelain=v1", "--untracked-files=all"]).stdout.split(/\r?\n/).filter(Boolean);
const protectedDiff = git(["diff", "--name-only", "HEAD", "--", "supabase/migrations", "apps", "packages", "lib", "package.json", "package-lock.json", basePath, baseContractPath, baseGuardPath, planPath, planContractPath, planGuardPath]).stdout.split(/\r?\n/).filter(Boolean);
record("branch HEAD staging and exact three-candidate inventory", git(["branch", "--show-current"]).stdout.trim() === "main" && git(["rev-parse", "HEAD"]).stdout.trim() === baseCommit && git(["diff", "--cached", "--quiet"], true).status === 0 && same(status.map(value => value.slice(3)).sort(), candidates) && status.every(value => value.startsWith("??")));
record("migrations protected code package and Frozen chain unchanged", fs.readdirSync(path.join(root, "supabase/migrations")).filter(file => file.endsWith(".sql")).length === 41 && protectedDiff.length === 0, protectedDiff);
record("candidate content contains no secret credential remote target or runtime artifact", !/(?:postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20,}\.|-----BEGIN [A-Z ]*PRIVATE KEY-----|service[_-]?role\s*[:=]|password\s*[:=]|supabase\.co)/i.test(authorityText + contract + read(guardPath)));
}

if (selfTestParent) {
  const tests = []; const mutation = (name, change, code) => { const value = clone(authority); change(value); const pass = validateStructure(value).includes(code); tests.push(pass); console.log(`${pass ? "PASS" : "FAIL"} SELFTEST ${name}`); };
  mutation("missing A-F field", value => value.composition.resolvedFields.pop(), "scope-precedence");
  mutation("undefined tenant domain", value => delete value.domains.tenantOrdinal.scope, "tenant-domain");
  mutation("one-based item counter", value => value.domains.itemWithinMenu.base = 1, "item-within-domain");
  mutation("wrong menu direction", value => value.domains.menuOrdinal.order = "descending", "menu-domain");
  mutation("wrong item loop nesting", value => value.generationLoops.menu_items.counters.reverse(), "item-loop");
  mutation("wrong nutrition version order", value => value.generationLoops.menu_item_nutrition.orders[3] = "descending", "nutrition-loop");
  mutation("undefined old identifier", value => value.programs["A-menu-items-name-and-allergens"].nameIdentifier = "tenantOrdinal5", "ambiguous-language");
  mutation("bare alternates language", value => value.composition.conflict = "alternates", "ambiguous-language");
  mutation("missing program", value => delete value.programs["history-version"], "program-inventory");
  mutation("extra program", value => value.programs.extra = {}, "program-inventory");
  mutation("extra nested operand", value => value.programs["A-menu-items-name-and-allergens"].unused = true, "program-schema");
  mutation("wrong nutrition row count", value => value.programs["F-menu-item-nutrition-updated-at"].rowCount = 11039, "nutrition-strides");
  mutation("wrong version stride", value => value.programs["F-menu-item-nutrition-updated-at"].strides.nutritionVersion = 2, "nutrition-strides");
  mutation("wrong item stride", value => value.programs["F-menu-item-nutrition-updated-at"].strides.tenantLocalItemOrdinal = 1, "nutrition-strides");
  mutation("wrong max tenant stride", value => value.programs["F-menu-item-nutrition-updated-at"].strides.maxTenant = 3199, "nutrition-strides");
  mutation("wrong noise tenant stride", value => value.programs["F-menu-item-nutrition-updated-at"].strides.noiseTenant = 159, "nutrition-strides");
  mutation("wrong base binding", value => value.baseAuthority.sha256 = "0".repeat(64), "base-binding");
  mutation("wrong plan binding", value => value.planMetricClarification.sha256 = "0".repeat(64), "plan-binding");
  mutation("unknown top-level operand", value => value.unused = true, "top-level-schema");
  const behavior = (name, pass) => { tests.push(pass); console.log(`${pass ? "PASS" : "FAIL"} SELFTEST ${name}`); };
  const wrongParity = clone(authority); wrongParity.programs["B-C-version0-active-source-and-status"].fields.source["0"] = "ai_estimated"; behavior("active source parity mutation changes result", nutritionFields(wrongParity, 0, 0, "active").source !== "restaurant_verified");
  const wrongPath = clone(authority); wrongPath.programs["F-menu-item-nutrition-updated-at"].rowOrdinalProgram.noiseTenantBaseRows = 3199; behavior("nutrition prefix mutation breaks contiguous ordinals", (() => { try { const rows = fullEnumeration(wrongPath).nutritionRows.map(row => row.rowOrdinal); return new Set(rows).size !== 11040; } catch { return true; } })());
  behavior("non-integer input fails closed", (() => { try { nutritionFields(authority, "1", 0, "active"); return false; } catch { return true; } })());
  console.log(`SELFTEST RESULT ${tests.filter(Boolean).length}/${tests.length} ${tests.every(Boolean) ? "PASS" : "FAIL"}`);

  const sourceDigest = digest(read(authorityPath));
  const processTests = [
    {
      name: "unknown top-level operand",
      path: "/unused",
      expectedIssue: "top-level-schema",
      mutate: value => { value.unused = true; },
      mutationEvidence: value => ({ present: Object.hasOwn(value, "unused"), value: value.unused }),
      mutationApplied: value => Object.hasOwn(value, "unused") && value.unused === true
    },
    {
      name: "unknown program operand",
      path: "/programs/A-menu-items-name-and-allergens/unused",
      expectedIssue: "program-schema",
      mutate: value => { value.programs["A-menu-items-name-and-allergens"].unused = true; },
      mutationEvidence: value => ({ present: Object.hasOwn(value.programs["A-menu-items-name-and-allergens"], "unused"), value: value.programs["A-menu-items-name-and-allergens"].unused }),
      mutationApplied: value => Object.hasOwn(value.programs["A-menu-items-name-and-allergens"], "unused") && value.programs["A-menu-items-name-and-allergens"].unused === true
    },
    {
      name: "missing required field",
      path: "/planMetricClarification",
      expectedIssue: "top-level-schema",
      mutate: value => { delete value.planMetricClarification; },
      mutationEvidence: value => ({ present: Object.hasOwn(value, "planMetricClarification") }),
      mutationApplied: value => !Object.hasOwn(value, "planMetricClarification")
    },
    {
      name: "wrong required type",
      path: "/domains/tenantOrdinal/count",
      expectedIssue: "tenant-domain",
      mutate: value => { value.domains.tenantOrdinal.count = "50"; },
      mutationEvidence: value => ({ present: Object.hasOwn(value.domains.tenantOrdinal, "count"), type: typeof value.domains.tenantOrdinal.count, value: value.domains.tenantOrdinal.count }),
      mutationApplied: value => value.domains.tenantOrdinal.count === "50"
    },
    {
      name: "unknown nested operand",
      path: "/evaluator/integerPolicy/unused",
      expectedIssue: "evaluator-policy",
      mutate: value => { value.evaluator.integerPolicy.unused = true; },
      mutationEvidence: value => ({ present: Object.hasOwn(value.evaluator.integerPolicy, "unused"), value: value.evaluator.integerPolicy.unused }),
      mutationApplied: value => Object.hasOwn(value.evaluator.integerPolicy, "unused") && value.evaluator.integerPolicy.unused === true
    }
  ];
  const processResults = processTests.map(test => {
    const token = crypto.randomBytes(16).toString("hex");
    const temporaryDirectory = fs.mkdtempSync(path.join(isolatedTemporaryRoot, `p2v-perf-001b-${token}-`));
    const temporaryAuthority = path.join(temporaryDirectory, "authority.json");
    const mutated = clone(authority);
    test.mutate(mutated);
    const serializedMutation = `${JSON.stringify(mutated, null, 2)}\n`;
    const expectedAuthorityDigest = digest(serializedMutation);
    const mutationObservedBeforeWrite = test.mutationApplied(mutated);
    let child;
    let mutationObservedAfterWrite = false;
    let mutationEvidence;
    try {
      const descriptor = fs.openSync(temporaryAuthority, "wx", 0o600);
      try {
        fs.writeFileSync(descriptor, serializedMutation, { encoding: "utf8" });
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      const persistedMutation = JSON.parse(fs.readFileSync(temporaryAuthority, "utf8"));
      mutationObservedAfterWrite = test.mutationApplied(persistedMutation);
      mutationEvidence = test.mutationEvidence(persistedMutation);
      child = spawnSync(process.execPath, [path.join(root, guardPath), "--self-test-child", "--self-test-authority", temporaryAuthority], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, [selfTestTokenVariable]: token }
      });
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
    const stdout = child?.stdout ?? "";
    const stderr = child?.stderr ?? "";
    const childInput = (() => {
      const match = stdout.match(/^SELFTEST CHILD INPUT (\{[^\n]+\})$/m);
      if (!match) return null;
      try { return JSON.parse(match[1]); } catch { return null; }
    })();
    const actualIssues = (() => {
      const match = stdout.match(/^FAIL machine authority structure is closed complete and valid (\[[^\n]+\])$/m);
      if (!match) return [];
      try { return JSON.parse(match[1]); } catch { return []; }
    })();
    const fullPass = /^RESULT \d+\/\d+ PASS$/m.test(stdout);
    const cleaned = !fs.existsSync(temporaryDirectory);
    const sourceDigestAfter = digest(read(authorityPath));
    const originalUnchanged = sourceDigestAfter === sourceDigest;
    const childStarted = child?.error === undefined && Number.isInteger(child?.status);
    const inputVerified = childInput?.mode === "self-test-child" && childInput?.authoritySha256 === expectedAuthorityDigest;
    const pass = mutationObservedBeforeWrite && mutationObservedAfterWrite && childStarted && inputVerified && child.status !== 0 && actualIssues.length > 0 && actualIssues.includes(test.expectedIssue) && !fullPass && stderr.length === 0 && cleaned && originalUnchanged;
    console.log(`${pass ? "PASS" : "FAIL"} E2E ${test.name} ${JSON.stringify({ path: test.path, mutationEvidence, argumentShape: ["--self-test-child", "--self-test-authority", "<token-bound-temp>/authority.json"], expectedIssue: test.expectedIssue, actualIssues, mutationObservedBeforeWrite, mutationObservedAfterWrite, childStarted, inputVerified, exitCode: child?.status, signal: child?.signal ?? null, spawnError: child?.error === undefined ? null : { code: child.error.code, message: child.error.message }, childStdout: stdout, childStderr: stderr, fullPass, canonicalSha256Before: sourceDigest, canonicalSha256After: sourceDigestAfter, cleaned })}`);
    return pass;
  });
  console.log(`E2E RESULT ${processResults.filter(Boolean).length}/${processResults.length} ${processResults.every(Boolean) ? "PASS" : "FAIL"}`);
  if (!tests.every(Boolean) || !processResults.every(Boolean)) process.exitCode = 1;
}

const failed = checks.filter(check => !check.pass);
console.log(`RESULT ${checks.length - failed.length}/${checks.length} ${failed.length ? "FAIL" : "PASS"}`);
if (failed.length) process.exitCode = 1;
