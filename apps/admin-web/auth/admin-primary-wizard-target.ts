/**
 * Client-side pre-warning for the Primary Wizard target.
 *
 * P3B-P3F `self_target_denied` in the database is the canonical rule and stays
 * the final authority. This helper only lets the UI refuse to start a run that is
 * already known to target the actor's own staff account.
 *
 * Staff accounts are unique per Auth user (`staff_accounts_auth_user_id_key`), so
 * comparing the verified actor subject with the target's Auth user ID is the same
 * as comparing staff account IDs. When the target's Auth user ID is not readable
 * (the actor lacks `admin.management.staff.read`), the relation is "unknown": the
 * UI does not guess and the backend decides.
 */
export type PrimaryWizardTargetRelation = "self" | "other" | "unknown";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolvePrimaryWizardTargetRelation(input: Readonly<{
  actorSubject: string | null | undefined;
  targetAuthUserId: string | null | undefined;
}>): PrimaryWizardTargetRelation {
  const actor = input.actorSubject, target = input.targetAuthUserId;
  if (typeof actor !== "string" || typeof target !== "string" || !UUID.test(actor) || !UUID.test(target)) {
    return "unknown";
  }
  return actor.toLowerCase() === target.toLowerCase() ? "self" : "other";
}

export function isPrimaryWizardSelfTargetBlocked(relation: PrimaryWizardTargetRelation): boolean {
  return relation === "self";
}
