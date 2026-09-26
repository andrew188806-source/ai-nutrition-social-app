/**
 * Presentation state for the Platform Management staff roster.
 *
 * `staff_management_list_staff_v1` returns zero rows both for an authorized caller
 * with no staff accounts and for a caller without `admin.management.staff.read`.
 * The page therefore decides denial from the verified permission context before
 * any read, so a denied caller never sees an "empty roster" that looks like success.
 * The database remains the authority; this only chooses what the UI may claim.
 */
export const STAFF_ROSTER_READ_PERMISSION = "admin.management.staff.read" as const;

export type StaffRosterState<Row> =
  | Readonly<{ state: "permission_denied" }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "authorized_empty" }>
  | Readonly<{ state: "authorized_with_data"; rows: readonly Row[] }>;

export function canReadStaffRoster(permissions: readonly string[]): boolean {
  return permissions.includes(STAFF_ROSTER_READ_PERMISSION);
}

export function resolveStaffRosterState<Row>(input: Readonly<{
  canRead: boolean;
  error: unknown;
  data: unknown;
}>): StaffRosterState<Row> {
  // Denial wins over any payload: a denied caller is never shown rows or a count.
  if (!input.canRead) return Object.freeze({ state: "permission_denied" as const });
  if (input.error) return Object.freeze({ state: "unavailable" as const });
  // The roster RPC returns an array; anything else is not proof of an empty roster.
  if (!Array.isArray(input.data)) return Object.freeze({ state: "unavailable" as const });
  if (input.data.length === 0) return Object.freeze({ state: "authorized_empty" as const });
  return Object.freeze({ state: "authorized_with_data" as const, rows: Object.freeze([...input.data] as Row[]) });
}
