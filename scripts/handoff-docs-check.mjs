#!/usr/bin/env node
// GQA-4 static check for the canonical handoff tree (docs/handoff). Read-only: no network, no database.
// Checks: required files, relative links, master-index coverage, one canonical home per topic,
// decision-register links and counts, document headers, secret-shaped values, stale "current SHA" claims.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const HANDOFF = "docs/handoff";
const REQUIRED = {
  "00_INDEX": ["MASTER_HANDOFF_INDEX", "DECISION_STATUS_INDEX", "SOURCE_OF_TRUTH_MAP"],
  "01_PRODUCT": ["PRODUCT_ROADMAP", "MVP_SCOPE", "CONSUMER_PRODUCT", "RESTAURANT_PRODUCT", "ADMIN_PRODUCT", "SOCIAL_PRODUCT", "POST_MVP_PRODUCT"],
  "02_ENGINEERING": ["ENGINEERING_HANDOFF", "ARCHITECTURE", "REPOSITORY_STATE", "MIGRATION_POLICY", "TEST_GUARD_ACCEPTANCE", "TECHNICAL_DEBT", "DEVELOPMENT_WORKFLOW"],
  "03_SECURITY_AUTHORITY": ["ADMIN_AUTHORITY", "PRIMARY_STEPUP_BREAKGLASS", "RESTAURANT_TENANCY", "SOCIAL_AUTHORITY", "SECRET_HANDLING"],
  "04_DEPLOYMENT_ENVIRONMENTS": ["ENVIRONMENT_MATRIX", "DEVELOPMENT", "STABLE_DEMOS", "HOSTING_VERCEL_SUPABASE", "REQUIRED_ENV_NAMES"],
  "05_FINANCE": ["FINANCE_PRODUCT_ROADMAP", "FUNDRAISING_ROUNDS", "CROWDFUNDING_PRESALE", "SUBSIDIES_LOANS", "FINANCIAL_ASSUMPTIONS"],
  "06_CORPORATE_LEGAL": ["CORPORATE_STRUCTURE", "TAIWAN_ENTITY", "GLOBAL_TOPCO", "GOVERNANCE", "PROFESSIONAL_ADVICE_REQUIRED"],
  "07_IP_PATENT": ["IP_OWNERSHIP", "PATENT_STATUS", "LICENSING_TRANSFER_OPTIONS", "IP_COST_RESPONSIBILITY"],
  "08_BUSINESS_MONETIZATION": ["BUSINESS_MODEL", "REVENUE_MODEL", "RESTAURANT_PRICING", "EARLY_BIRD_FOUNDING_RESTAURANTS", "ADVERTISING_MONETIZATION"],
  "09_OPERATIONS_GTM": ["MARKET_VALIDATION", "RESTAURANT_ACQUISITION", "USER_ACQUISITION", "CROWDFUNDING_LAUNCH", "OPERATING_ASSUMPTIONS"],
  "10_POST_MVP": ["GROUP_TABLE_INVENTORY", "GROUP_TABLE_FUTURE_PLAN", "COLLECTIBLES_MARKETPLACE", "POINTS_ECONOMY", "POS_RECEIPT_INTEGRATION", "OTHER_DEFERRED_FEATURES"],
  "11_DECISION_REGISTERS": ["FROZEN_DECISIONS", "OPEN_DECISIONS", "SUPERSEDED_DECISIONS", "EXTERNAL_RECHECK_REQUIRED"]
};
// Topics the source-of-truth map must cover, each in exactly one row.
const REQUIRED_TOPICS = [
  "產品路線圖", "MVP 範圍", "Consumer", "Restaurant", "Admin", "Social", "工程流程", "Repository 正式 SHA", "遷移政策",
  "Admin 權限", "Primary／Step-Up／Break-glass", "Restaurant 租戶", "Social 權限", "部署", "環境變數",
  "財務 × 產品路線圖", "股權募資輪次", "群眾募資", "補助／貸款", "公司架構", "台灣法人", "Delaware 母公司",
  "專利歸屬", "專利成本責任", "專利授權／轉讓方向", "商業模式", "餐廳變現／定價", "創始方案", "廣告", "市場驗證",
  "餐廳開發", "多人餐桌（Group Table）", "桌菜模式", "收藏品", "市集", "點數", "POS／收據", "未決事項", "已取代事項"
];
const ACCEPTED_FULL_SHAS = new Set(["44101e938c1dfa030a97e906971a04394757762b", "25157cbb9c2fa41d516265bac665e5230740712b"]);

const failures = [];
const checks = [];
const check = (name, ok, detail) => { checks.push(name); if (!ok) failures.push({ name, detail }); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : entry.name.endsWith(".md") ? [`${dir}/${entry.name}`] : []);

// 1. Required files, and nothing unexpected.
const required = Object.entries(REQUIRED).flatMap(([dir, names]) => names.map((name) => `${HANDOFF}/${dir}/${name}.md`));
const present = walk(HANDOFF).sort();
const missing = required.filter((file) => !fs.existsSync(path.join(ROOT, file)));
check("required handoff files exist", missing.length === 0, missing);
const extra = present.filter((file) => !required.includes(file));
check("no unregistered handoff files", extra.length === 0, extra);

// 2. Relative links resolve (handoff tree plus the edited pointers).
const linkSources = [...present, "docs/DOCUMENT_STATUS_INDEX.md", "governance/README.md", "README.md"];
const broken = [];
const linksOf = (text) => [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
for (const file of linkSources) {
  for (const href of linksOf(read(file))) {
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const target = path.normalize(path.join(path.dirname(file), decodeURI(href.split("#")[0])));
    if (!fs.existsSync(path.join(ROOT, target))) broken.push(`${file} -> ${href}`);
  }
}
check("all relative links resolve", broken.length === 0, broken);

// 3. Every canonical document is linked from the master index; entry points link to it.
const master = read(`${HANDOFF}/00_INDEX/MASTER_HANDOFF_INDEX.md`);
const masterTargets = new Set(linksOf(master).map((href) => path.normalize(path.join(`${HANDOFF}/00_INDEX`, href))));
const notIndexed = required.filter((file) => !masterTargets.has(path.normalize(file)));
check("every canonical document appears in MASTER_HANDOFF_INDEX", notIndexed.length === 0, notIndexed);
for (const file of ["README.md", "docs/DOCUMENT_STATUS_INDEX.md", "governance/README.md"]) {
  check(`${file} points to the master index`, read(file).includes("handoff/00_INDEX/MASTER_HANDOFF_INDEX.md"), file);
}

// 4. Source-of-truth map: required topics, each in exactly one row, each with a canonical link.
const sot = read(`${HANDOFF}/00_INDEX/SOURCE_OF_TRUTH_MAP.md`);
const topicSection = sot.split("## 2.")[0];
const rows = topicSection.split("\n").filter((line) => line.startsWith("| ") && !/^\|\s*(主題|---)/.test(line));
const topics = rows.map((line) => line.split("|")[1].trim());
const dupTopics = topics.filter((topic, index) => topics.indexOf(topic) !== index);
check("each topic has exactly one canonical row", dupTopics.length === 0, dupTopics);
const missingTopics = REQUIRED_TOPICS.filter((topic) => !topics.includes(topic));
check("source-of-truth map covers every required topic", missingTopics.length === 0, missingTopics);
const rowsWithoutHome = rows.filter((line) => !/\]\(\.\.\/\d\d_[A-Z_]+\/[A-Z_]+\.md\)|\]\([A-Z_]+\.md\)/.test(line.split("|")[2] ?? ""));
check("every topic row names a canonical handoff home", rowsWithoutHome.length === 0, rowsWithoutHome.map((line) => line.slice(0, 60)));

// 5. Decision registers: every entry links to a canonical source; index counts match.
const registerRows = (file, prefix) => read(`${HANDOFF}/11_DECISION_REGISTERS/${file}.md`).split("\n").filter((line) => line.startsWith(`| ${prefix}`));
const registers = { FROZEN_DECISIONS: "FD-", OPEN_DECISIONS: "OD-", SUPERSEDED_DECISIONS: "SD-", EXTERNAL_RECHECK_REQUIRED: "ER-" };
const counts = {};
for (const [file, prefix] of Object.entries(registers)) {
  const entries = registerRows(file, prefix);
  counts[file] = entries.length;
  const ids = entries.map((line) => line.split("|")[1].trim());
  check(`${file} ids are unique`, new Set(ids).size === ids.length, ids);
  const unlinked = entries.filter((line) => !/\]\([^)]+\.md\)/.test(line));
  check(`${file} entries link to a canonical source`, unlinked.length === 0, unlinked.map((line) => line.slice(0, 50)));
}
const statusIndex = read(`${HANDOFF}/00_INDEX/DECISION_STATUS_INDEX.md`);
for (const [status, file] of [["FROZEN", "FROZEN_DECISIONS"], ["OPEN", "OPEN_DECISIONS"], ["SUPERSEDED", "SUPERSEDED_DECISIONS"], ["EXTERNAL_RECHECK_REQUIRED", "EXTERNAL_RECHECK_REQUIRED"]]) {
  const line = statusIndex.split("\n").find((l) => l.startsWith(`| \`${status}\` |`)) ?? "";
  const stated = Number(line.split("|")[3]?.trim());
  check(`DECISION_STATUS_INDEX count for ${status} matches the register`, stated === counts[file], { stated, actual: counts[file] });
}

// 6. Headers: category, status, reconciled date; business-layer files carry the vendor-export marker.
const PRIVATE_DIRS = ["00_INDEX", "05_FINANCE", "06_CORPORATE_LEGAL", "07_IP_PATENT", "08_BUSINESS_MONETIZATION", "09_OPERATIONS_GTM", "11_DECISION_REGISTERS"];
for (const file of required) {
  const head = read(file).split("\n").slice(0, 4).join("\n");
  check(`${file} header`, /\*\*分類\*\*/.test(head) && /\*\*狀態\*\*/.test(head) && /最後對帳/.test(head), file);
  if (PRIVATE_DIRS.some((dir) => file.includes(`/${dir}/`))) {
    check(`${file} vendor-export marker`, head.includes("NOT_FOR_VENDOR_EXPORT_BY_DEFAULT"), file);
  }
}

// 7. Secret-shaped values and unnecessary identifiers.
const SECRET_PATTERNS = [
  /postgres(?:ql)?:\/\/[^\s'"`]+:[^\s'"`]+@/i, /sb_secret_[A-Za-z0-9_-]{8,}/, /sbp_[A-Za-z0-9]{20,}/, /eyJ[A-Za-z0-9_-]{20,}\./,
  /otpauth:\/\//i, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bsk-[A-Za-z0-9]{20,}/, /(?:password|passwd|secret|token)\s*[:=]\s*[^\s`|]{6,}/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, /msbgnnoorsoefuiwluye/
];
const leaks = [];
for (const file of present) {
  const text = read(file);
  for (const pattern of SECRET_PATTERNS) if (pattern.test(text)) leaks.push(`${file}: ${pattern}`);
}
check("no secret-shaped value, UUID or project ref in the handoff", leaks.length === 0, leaks);

// 8. Stale canonical-SHA claims: full SHAs are only the accepted provenance; 31b55d3 only as last-recorded.
const staleShas = [];
for (const file of present) {
  const lines = read(file).split("\n");
  for (const line of lines) {
    for (const sha of line.match(/\b[0-9a-f]{40}\b/g) ?? []) if (!ACCEPTED_FULL_SHAS.has(sha)) staleShas.push(`${file}: ${sha}`);
    if (line.includes("31b55d3") && !/最後|ADMIN-E|舊|取代|SUPERSEDED|last/i.test(line)) staleShas.push(`${file}: 31b55d3 presented as current`);
  }
}
check("no stale canonical SHA claim", staleShas.length === 0, staleShas);

console.log(JSON.stringify({ suite: "handoff-docs-check", files: present.length, total: checks.length, failed: failures.length,
  registerCounts: counts, failures, networkUsed: false, databaseUsed: false }, null, 2));
process.exitCode = failures.length ? 1 : 0;
