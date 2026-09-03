import "server-only";

// RA-1A: the server-only Platform Admin authorization contract.
//
// This module is the TypeScript statement of the boundary the RA-1A migration creates. It holds no
// client, performs no I/O and reads no environment: RA-1B supplies a transport and calls
// `resolvePlatformAdminContext` with the rows the database returned. Keeping the contract free of a
// transport is deliberate — the authority must be reviewable, testable and importable without
// deciding how Admin Web talks to Supabase.
//
// WHAT IS AUTHORITATIVE HERE. The closed permission vocabulary, the refusal states, and the rule
// that a Platform Admin context is only ever DERIVED from a server response about the verified
// caller. Nothing in this file accepts an actor id, a user id or a role from a caller, because the
// database function that produces these rows accepts none either.
//
// WHAT IS NOT HERE. No console capability, no data projection, no write. RA-1A grants the right to
// ask "am I a Platform Admin"; it grants nothing to do afterwards.

/** The client-callable read boundary created by the RA-1A migration. */
export const PLATFORM_ADMIN_CONTEXT_FUNCTION = "platform_admin_current_context_v1" as const;
export const PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION = "platform_admin_has_permission_v1" as const;
export const PLATFORM_ADMIN_AUDIT_LOG_FUNCTION = "platform_admin_audit_log_v1" as const;

/** The private schema those functions read. Never reachable through the Data API. */
export const PLATFORM_ADMIN_PRIVATE_SCHEMA = "admin_internal" as const;

/**
 * The only platform role RA-1A defines. A future Nutritionist, support agent or break-glass
 * authority is a separate decision and must extend both this list and the migration's CHECK.
 */
export const PLATFORM_ADMIN_ROLE_KEYS = Object.freeze(["platform_admin"] as const);
export type PlatformAdminRoleKey = (typeof PLATFORM_ADMIN_ROLE_KEYS)[number];

/**
 * The closed RA-1A permission vocabulary. Read-only on purpose: there is no write, create, update,
 * delete, approve or manage key, so no Platform Admin mutation can be expressed until a later round
 * widens this list and the matching database CHECK together.
 */
export const PLATFORM_ADMIN_PERMISSION_KEYS = Object.freeze([
  "admin_context.read",
  "admin_audit.read"
] as const);
export type PlatformAdminPermissionKey = (typeof PLATFORM_ADMIN_PERMISSION_KEYS)[number];

export const PLATFORM_ADMIN_PERMISSION_SCOPES = Object.freeze(["self", "platform"] as const);
export type PlatformAdminPermissionScope = (typeof PLATFORM_ADMIN_PERMISSION_SCOPES)[number];

/** One row of `public.platform_admin_current_context_v1()`. */
export type PlatformAdminContextRow = Readonly<{
  role_key: string;
  permission_key: string;
  permission_scope: string;
}>;

/**
 * The resolved authorization state.
 *
 * `not_admin` is the ordinary answer for every signed-in non-admin and is NOT an error: the database
 * function simply returns no rows. `unavailable` is a genuine authority failure and must never be
 * treated as `not_admin`, and never as admin — both directions fail closed, but they are different
 * facts and a console must be able to say which happened.
 */
export type PlatformAdminContext =
  | Readonly<{ state: "admin"; roleKey: PlatformAdminRoleKey; permissions: readonly PlatformAdminPermissionKey[] }>
  | Readonly<{ state: "not_admin" }>
  | Readonly<{ state: "unauthenticated" }>
  | Readonly<{ state: "unavailable"; reason: PlatformAdminUnavailableReason }>;

export type PlatformAdminUnavailableReason =
  | "authority_unreachable"
  | "authority_rejected"
  | "unrecognized_role"
  | "unrecognized_permission"
  | "inconsistent_role";

export type PlatformAdminAuthorityOutcome =
  | Readonly<{ ok: true; rows: readonly PlatformAdminContextRow[] }>
  | Readonly<{ ok: false; reason: "authority_unreachable" | "authority_rejected" }>;

const isRoleKey = (value: string): value is PlatformAdminRoleKey =>
  (PLATFORM_ADMIN_ROLE_KEYS as readonly string[]).includes(value);
const isPermissionKey = (value: string): value is PlatformAdminPermissionKey =>
  (PLATFORM_ADMIN_PERMISSION_KEYS as readonly string[]).includes(value);

/**
 * Derives the authorization state from what the verified-caller function returned.
 *
 * Fails closed in every ambiguous direction. An unknown role key or permission key is `unavailable`,
 * never a silently narrowed admin: a value this build does not recognise means the database and the
 * application disagree about the vocabulary, and guessing which side is right is exactly how a
 * privilege boundary erodes.
 */
export function resolvePlatformAdminContext(
  outcome: PlatformAdminAuthorityOutcome,
  hasVerifiedIdentity: boolean
): PlatformAdminContext {
  if (!hasVerifiedIdentity) return Object.freeze({ state: "unauthenticated" as const });
  if (!outcome.ok) return Object.freeze({ state: "unavailable" as const, reason: outcome.reason });
  if (outcome.rows.length === 0) return Object.freeze({ state: "not_admin" as const });

  const roleKeys = new Set(outcome.rows.map((row) => row.role_key));
  if (roleKeys.size !== 1) {
    return Object.freeze({ state: "unavailable" as const, reason: "inconsistent_role" as const });
  }
  const [roleKey] = [...roleKeys];
  if (roleKey === undefined || !isRoleKey(roleKey)) {
    return Object.freeze({ state: "unavailable" as const, reason: "unrecognized_role" as const });
  }
  const permissions: PlatformAdminPermissionKey[] = [];
  for (const row of outcome.rows) {
    if (!isPermissionKey(row.permission_key)) {
      return Object.freeze({ state: "unavailable" as const, reason: "unrecognized_permission" as const });
    }
    if (!permissions.includes(row.permission_key)) permissions.push(row.permission_key);
  }
  return Object.freeze({
    state: "admin" as const,
    roleKey,
    permissions: Object.freeze([...permissions].sort())
  });
}

/** True only for an active Platform Admin holding this exact permission. */
export function platformAdminHasPermission(
  context: PlatformAdminContext,
  permissionKey: PlatformAdminPermissionKey
): boolean {
  return context.state === "admin" && context.permissions.includes(permissionKey);
}

/**
 * The Admin console's own gate. Anything other than an active admin with the required permission is
 * refused; `not_admin`, `unauthenticated` and `unavailable` all deny.
 */
export function assertPlatformAdminPermission(
  context: PlatformAdminContext,
  permissionKey: PlatformAdminPermissionKey
): Readonly<{ allowed: boolean; refusal: PlatformAdminContext["state"] | null }> {
  if (platformAdminHasPermission(context, permissionKey)) {
    return Object.freeze({ allowed: true, refusal: null });
  }
  return Object.freeze({ allowed: false, refusal: context.state });
}
