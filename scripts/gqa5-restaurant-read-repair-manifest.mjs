// Exact successor record for the GQA-5 Restaurant catalogue read repair (one forward migration).
// Historical guards that freeze supabase/ recognize this ONE file, and only while its bytes are exactly
// these. It is not an allow-list for later migrations: any other new migration, or any byte change to
// this one, still breaks recognition.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// A composed successor may set aside ONLY its exact two migrations; the pure historical matcher stays frozen.
const { isExactPc2, PC2_MIGRATIONS_PATHS } = await import("./pc2-consumer-onboarding-manifest.mjs").catch(error => {
  if (error.code === "ERR_MODULE_NOT_FOUND" && error.message.includes("pc2-consumer-onboarding-manifest.mjs")) return { isExactPc2: () => false, PC2_MIGRATIONS_PATHS: [] };
  throw error;
});
export const GQA5_REPAIR_MIGRATION = "supabase/migrations/20260927010000_restaurant_catalog_read_rls_plan_repair.sql";
export const GQA5_REPAIR_FILE = path.basename(GQA5_REPAIR_MIGRATION);
/** SHA-256 of the LF-normalized bytes and the Git blob id of the accepted file. */
export const GQA5_REPAIR_SHA256 = "7adc3910d36272b1fcf3b5164fcc5b48920ced03a9fe54f24a575bf522a9d4af";
export const GQA5_REPAIR_BLOB = "3f8b2115664b3eccfe4a376359f65e4f00fa2394";
/** The accepted file sits directly after the last historical migration of the GQA-3 baseline (139 files). */
export const GQA5_REPAIR_PREDECESSOR_MIGRATION = "20260921010000_admin_dashboard_social_policy_reads_d.sql";
export const GQA5_HISTORICAL_MIGRATION_COUNT = 139;

const lfSha256 = (bytes) => createHash("sha256").update(bytes.toString("utf8").replace(/\r\n/g, "\n")).digest("hex");

/** Pure predicate over collected evidence; the accepted identity is fixed above. */
export function matchesExactGqa5RestaurantReadRepair(evidence) {
  if (!evidence || evidence.exists !== true) return false;
  if (evidence.sha256 !== GQA5_REPAIR_SHA256 || evidence.blob !== GQA5_REPAIR_BLOB) return false;
  const files = evidence.migrationFiles;
  if (!Array.isArray(files) || files.length !== GQA5_HISTORICAL_MIGRATION_COUNT + 1) return false;
  return files.at(-1) === GQA5_REPAIR_FILE && files.at(-2) === GQA5_REPAIR_PREDECESSOR_MIGRATION;
}

export function collectGqa5RepairEvidence(root = process.cwd()) {
  const file = path.join(root, GQA5_REPAIR_MIGRATION);
  const exists = existsSync(file);
  const pc2MigrationNames = new Set(isExactPc2(root) ? PC2_MIGRATIONS_PATHS.map(file => path.basename(file)) : []);
  return {
    exists,
    sha256: exists ? lfSha256(readFileSync(file)) : null,
    blob: exists ? execFileSync("git", ["hash-object", "--", GQA5_REPAIR_MIGRATION], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() : null,
    migrationFiles: readdirSync(path.join(root, "supabase/migrations")).filter((f) => f.endsWith(".sql") && !pc2MigrationNames.has(f)).sort()
  };
}

export function isExactGqa5RestaurantReadRepair(root = process.cwd()) {
  try { return matchesExactGqa5RestaurantReadRepair(collectGqa5RepairEvidence(root)); }
  catch { return false; }
}

/** The single later supabase/ path a frozen-root guard may accept, and only while it is exact. */
export function acceptedGqa5RepairPaths(root = process.cwd()) {
  return isExactGqa5RestaurantReadRepair(root) ? [GQA5_REPAIR_MIGRATION] : [];
}
