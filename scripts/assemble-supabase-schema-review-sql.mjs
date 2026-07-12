import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const draftsDir = path.join(root, "docs", "supabase-schema-drafts");
const outDir = path.join(root, "docs", "supabase-schema-review", "generated");
fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(draftsDir).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
const now = new Date().toISOString();
const sections = [
  "-- REVIEW ONLY - assembled frozen schema baseline for disposable DB review.",
  "-- Do not run against production or shared development databases.",
  "-- Source: docs/supabase-schema-drafts/001-015.",
  `-- Generated at: ${now}`,
  ""
];

for (const file of files) {
  const fullPath = path.join(draftsDir, file);
  sections.push("-- ============================================================");
  sections.push(`-- Source file: docs/supabase-schema-drafts/${file}`);
  sections.push("-- ============================================================");
  sections.push(fs.readFileSync(fullPath, "utf8"));
  sections.push("");
}

const sqlPath = path.join(outDir, "schema-review-baseline.sql");
fs.writeFileSync(sqlPath, sections.join("\n"), "utf8");

const manifest = {
  generatedAt: now,
  purpose: "review-only disposable DB schema apply candidate",
  warning: "Do not run against production or shared development databases.",
  sourceDirectory: "docs/supabase-schema-drafts",
  outputSql: "docs/supabase-schema-review/generated/schema-review-baseline.sql",
  files
};
fs.writeFileSync(path.join(outDir, "schema-review-baseline-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify(manifest, null, 2));
