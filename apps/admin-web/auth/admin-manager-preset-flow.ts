import {
  CURRENT_ADMIN_PERMISSION_KEYS,
  type CurrentAdminPermissionKey
} from "./admin-current-permission-vocabulary";
import {
  MANAGER_PRESETS,
  PRIMARY_READY_PERMISSION_KEYS,
  managerPresetManifestIsValid,
  type ManagerPreset
} from "./admin-manager-presets";

export type PresetEntitlement = Readonly<{
  permissionKey: string;
  status: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
}>;
export type PresetCatalogRow = Readonly<{
  permission_key: string;
  lifecycle_status: string;
  readiness_status: string;
  privileged_only: boolean;
  ordinary_supervisor_delegable: boolean;
  console_admission_required: boolean;
}>;
export type PresetSnapshot = Readonly<{
  entitlements: readonly PresetEntitlement[];
  catalog: readonly PresetCatalogRow[];
}>;
export type PresetUnavailableReason =
  | "ordinary_grant_required"
  | "catalog_unavailable" | "not_p3f_eligible";
export type PresetDiff = Readonly<{
  held: readonly CurrentAdminPermissionKey[];
  missing: readonly CurrentAdminPermissionKey[];
  consoleAdmission: readonly CurrentAdminPermissionKey[];
  unavailable: readonly Readonly<{ key: CurrentAdminPermissionKey; reason: PresetUnavailableReason }>[];
  prerequisite: "primary_required" | null;
  state: "complete" | "partial" | "not_applied";
}>;

const CURRENT = new Set<string>(CURRENT_ADMIN_PERMISSION_KEYS);
const BRANCH_STATUS = "admin_restaurant_branch.status.write";

export function effectivePresetKeys(snapshot: PresetSnapshot, now = Date.now()): ReadonlySet<string> {
  return new Set(snapshot.entitlements.filter((entry) =>
    entry.status === "active"
    && Number.isFinite(Date.parse(entry.effectiveFrom))
    && Date.parse(entry.effectiveFrom) <= now
    && (entry.effectiveUntil === null
      || (Number.isFinite(Date.parse(entry.effectiveUntil)) && Date.parse(entry.effectiveUntil) > now))
  ).map((entry) => entry.permissionKey));
}

export function computeManagerPresetDiff(
  preset: ManagerPreset,
  snapshot: PresetSnapshot,
  now = Date.now()
): PresetDiff {
  const effective = effectivePresetKeys(snapshot, now);
  const catalog = new Map(snapshot.catalog.map((row) => [row.permission_key, row]));
  const held: CurrentAdminPermissionKey[] = [];
  const missing: CurrentAdminPermissionKey[] = [];
  const consoleAdmission: CurrentAdminPermissionKey[] = [];
  const unavailable: { key: CurrentAdminPermissionKey; reason: PresetUnavailableReason }[] = [];
  for (const key of preset.permissionKeys) {
    const row = catalog.get(key);
    if (!CURRENT.has(key) || !row || row.lifecycle_status !== "active" || row.readiness_status !== "current") {
      unavailable.push({ key, reason: "catalog_unavailable" });
    } else if (effective.has(key)) {
      held.push(key);
    } else if (key === "admin_context.read") {
      consoleAdmission.push(key);
    } else if (key === BRANCH_STATUS) {
      // This CURRENT key is ordinary-delegable, not privileged-only. P3F refuses it.
      unavailable.push({ key, reason: "ordinary_grant_required" });
    } else if (!row.privileged_only || row.ordinary_supervisor_delegable || row.console_admission_required) {
      unavailable.push({ key, reason: "not_p3f_eligible" });
    } else {
      missing.push(key);
    }
  }
  const prerequisite = preset.requiresPrimary && !PRIMARY_READY_PERMISSION_KEYS.every((key) => effective.has(key))
    ? "primary_required" as const : null;
  return Object.freeze({
    held: Object.freeze(held), missing: Object.freeze(missing),
    consoleAdmission: Object.freeze(consoleAdmission), unavailable: Object.freeze(unavailable),
    prerequisite,
    state: held.length === preset.permissionKeys.length ? "complete" as const
      : held.length ? "partial" as const : "not_applied" as const
  });
}

export function managerPresetConfirmation(preset: ManagerPreset, staffAccountId: string): string {
  return `APPLY ${preset.id} TO ${staffAccountId}`;
}

export type PresetMutationOutcome =
  | Readonly<{ kind: "applied" }>
  | Readonly<{ kind: "rejected"; errorCode: string }>
  | Readonly<{ kind: "step_up_required" }>
  | Readonly<{ kind: "failed"; error: string }>;
export type PresetApplyDependencies = Readonly<{
  readSnapshot: () => Promise<PresetSnapshot | null>;
  hasFreshStepUp: () => Promise<boolean>;
  grantConsoleAdmission: (reasonCode: string) => Promise<PresetMutationOutcome>;
  grantPrivileged: (key: CurrentAdminPermissionKey, reasonCode: string) => Promise<PresetMutationOutcome>;
}>;
export type PresetApplyResult = Readonly<{
  kind: "complete" | "blocked" | "failed" | "step_up_required";
  applied: readonly CurrentAdminPermissionKey[];
  failedPermission: CurrentAdminPermissionKey | null;
  reason: string | null;
  diff: PresetDiff | null;
}>;

/** Client orchestration only. Each grant is independently authorized and audited by P3F/P3H. */
export async function applyManagerPreset(input: Readonly<{
  preset: ManagerPreset;
  staffAccountId: string;
  confirmation: string;
  actorCanWrite: boolean;
  actorCanConsoleAdmission: boolean;
  selfTarget: boolean;
}>, dependencies: PresetApplyDependencies): Promise<PresetApplyResult> {
  const applied: CurrentAdminPermissionKey[] = [];
  const result = (kind: PresetApplyResult["kind"], reason: string | null,
    failedPermission: CurrentAdminPermissionKey | null, diff: PresetDiff | null): PresetApplyResult =>
    Object.freeze({ kind, applied: Object.freeze([...applied]), failedPermission, reason, diff });
  if (!managerPresetManifestIsValid()
    || MANAGER_PRESETS.find((item) => item.id === input.preset.id) !== input.preset) {
    return result("blocked", "invalid_manifest", null, null);
  }
  if (!input.actorCanWrite) return result("blocked", "permission_write_required", null, null);
  if (input.selfTarget) return result("blocked", "self_target_denied", null, null);
  if (input.confirmation !== managerPresetConfirmation(input.preset, input.staffAccountId)) {
    return result("blocked", "confirmation_required", null, null);
  }
  let snapshot: PresetSnapshot | null;
  try { snapshot = await dependencies.readSnapshot(); }
  catch { snapshot = null; }
  if (!snapshot) return result("blocked", "authority_unavailable", null, null);
  let diff = computeManagerPresetDiff(input.preset, snapshot);
  if (diff.prerequisite || diff.unavailable.length) return result("blocked", "prerequisite_or_catalog_unavailable", null, diff);
  if (diff.consoleAdmission.length && !input.actorCanConsoleAdmission) {
    return result("blocked", "console_admission_write_required", null, diff);
  }
  if (diff.missing.length === 0 && diff.consoleAdmission.length === 0) return result("complete", null, null, diff);
  let stepUpActive = false;
  try { stepUpActive = await dependencies.hasFreshStepUp(); }
  catch { /* unavailable is fail-closed */ }
  if (!stepUpActive) return result("step_up_required", "step_up_required", null, diff);

  if (diff.consoleAdmission.length) {
    let outcome: PresetMutationOutcome;
    try { outcome = await dependencies.grantConsoleAdmission(input.preset.reasonCode); }
    catch { outcome = { kind: "failed", error: "network_unavailable" }; }
    if (outcome.kind !== "applied") {
      const kind = outcome.kind === "step_up_required" ? "step_up_required" : "failed";
      const reason = outcome.kind === "rejected" ? outcome.errorCode
        : outcome.kind === "failed" ? outcome.error : "step_up_required";
      return result(kind, reason, "admin_context.read", diff);
    }
    applied.push("admin_context.read");
    try { snapshot = await dependencies.readSnapshot(); }
    catch { snapshot = null; }
    if (!snapshot) return result("failed", "post_grant_authority_unavailable", "admin_context.read", null);
    diff = computeManagerPresetDiff(input.preset, snapshot);
    if (!diff.held.includes("admin_context.read")) {
      return result("failed", "post_grant_not_effective", "admin_context.read", diff);
    }
    if (diff.prerequisite || diff.unavailable.length) {
      return result("blocked", "prerequisite_or_catalog_unavailable", null, diff);
    }
  }

  // The initial diff and every successful refresh use server-fresh target authority.
  // A failed write stops the sequence; successful earlier writes remain individually audited.
  for (const key of input.preset.permissionKeys) {
    if (!diff.missing.includes(key)) continue;
    let outcome: PresetMutationOutcome;
    try { outcome = await dependencies.grantPrivileged(key, input.preset.reasonCode); }
    catch { outcome = { kind: "failed", error: "network_unavailable" }; }
    if (outcome.kind !== "applied") {
      const kind = outcome.kind === "step_up_required" ? "step_up_required" : "failed";
      const reason = outcome.kind === "rejected" ? outcome.errorCode
        : outcome.kind === "failed" ? outcome.error : "step_up_required";
      return result(kind, reason, key, diff);
    }
    applied.push(key);
    try { snapshot = await dependencies.readSnapshot(); }
    catch { snapshot = null; }
    if (!snapshot) return result("failed", "post_grant_authority_unavailable", key, null);
    diff = computeManagerPresetDiff(input.preset, snapshot);
    if (!diff.held.includes(key)) return result("failed", "post_grant_not_effective", key, diff);
    if (diff.prerequisite || diff.unavailable.length) {
      return result("blocked", "prerequisite_or_catalog_unavailable", null, diff);
    }
  }
  return diff.missing.length === 0 && diff.consoleAdmission.length === 0
    ? result("complete", null, null, diff)
    : result("failed", "remaining_permissions_unverified", diff.missing[0], diff);
}
