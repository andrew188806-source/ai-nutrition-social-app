import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import { cache } from "react";
import {
  isAuthSessionMissingError,
  type SupabaseClient
} from "@supabase/supabase-js";
import {
  PLATFORM_ADMIN_CONTEXT_FUNCTION,
  PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION,
  resolvePlatformAdminContext,
  type PlatformAdminContext,
  type PlatformAdminContextRow
} from "../server/platformAdminAuthority";
import { PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION } from "../server/platformAdminBranchStatusAuthority";
import { getAdminAuthConfig } from "../config/admin-auth";
import { resolveAdminAuthorityMode } from "./admin-authority-selector";
import {
  resolveCurrentAdminPermissionContext,
  type CurrentAdminPermissionContext,
  type CurrentAdminPermissionPredicateOutcome
} from "./admin-current-permission-context";
import {
  resolveAdminStaffPermissionSet,
  STAFF_PERMISSION_CONTEXT_FUNCTION,
  type AdminStaffPermissionAuthorityOutcome
} from "./admin-staff-permission-authority";
import { resolveAdminStaffAuthorityShadow } from "./admin-staff-authority-shadow";
import { createAdminSupabaseServerClient } from "./supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isContextRow(value: unknown): value is PlatformAdminContextRow {
  return typeof value === "object" && value !== null
    && typeof (value as PlatformAdminContextRow).role_key === "string"
    && typeof (value as PlatformAdminContextRow).permission_key === "string"
    && typeof (value as PlatformAdminContextRow).permission_scope === "string";
}

type VerifiedAdminAuthorityResolution = Readonly<{
  subject: string | null;
  context: PlatformAdminContext;
}>;

/** Distinguishes an expected absent session from an Auth authority failure. */
export function isMissingAdminAuthSessionError(error: unknown): boolean {
  return isAuthSessionMissingError(error);
}

async function resolveVerifiedAdminAuthority(client: SupabaseClient): Promise<VerifiedAdminAuthorityResolution> {
  let userResult: Awaited<ReturnType<typeof client.auth.getUser>>;
  try {
    userResult = await client.auth.getUser();
  } catch {
    return Object.freeze({
      subject: null,
      context: Object.freeze({ state: "unavailable" as const, reason: "authority_unreachable" as const })
    });
  }

  const subject = userResult.data.user?.id;
  if (
    typeof subject !== "string"
    || !UUID.test(subject)
    || userResult.data.user?.is_anonymous === true
  ) {
    if (
      userResult.error
      && !isMissingAdminAuthSessionError(userResult.error)
      && userResult.error.status !== 401
      && userResult.error.status !== 403
    ) {
      return Object.freeze({
        subject: null,
        context: Object.freeze({ state: "unavailable" as const, reason: "authority_unreachable" as const })
      });
    }
    return Object.freeze({ subject: null, context: resolvePlatformAdminContext({ ok: true, rows: [] }, false) });
  }

  try {
    const result = await client.rpc(PLATFORM_ADMIN_CONTEXT_FUNCTION);
    if (result.error || !Array.isArray(result.data) || !result.data.every(isContextRow)) {
      return Object.freeze({
        subject,
        context: resolvePlatformAdminContext({ ok: false, reason: "authority_rejected" }, true)
      });
    }
    return Object.freeze({
      subject,
      context: resolvePlatformAdminContext({ ok: true, rows: result.data }, true)
    });
  } catch {
    return Object.freeze({
      subject,
      context: resolvePlatformAdminContext({ ok: false, reason: "authority_unreachable" }, true)
    });
  }
}

export async function resolveVerifiedAdminContext(client: SupabaseClient): Promise<PlatformAdminContext> {
  return (await resolveVerifiedAdminAuthority(client)).context;
}

async function resolvePermissionsForAuthority(
  client: SupabaseClient,
  authority: VerifiedAdminAuthorityResolution
): Promise<CurrentAdminPermissionContext> {
  if (authority.subject === null) {
    return resolveCurrentAdminPermissionContext({
      subject: null,
      membershipContext: authority.context,
      branchStatusPermission: null
    });
  }

  const mode = resolveAdminAuthorityMode();
  if (mode.state === "unavailable") {
    return Object.freeze({ state: "unavailable" as const, reason: mode.reason });
  }

  if (
    authority.context.state !== "admin"
    || !authority.context.permissions.includes("admin_context.read")
  ) {
    return resolveCurrentAdminPermissionContext({
      subject: authority.subject,
      membershipContext: authority.context,
      branchStatusPermission: null
    });
  }

  if (mode.mode === "staff_permissions_legacy_admission") {
    let outcome: AdminStaffPermissionAuthorityOutcome;
    try {
      const result = await client.rpc(STAFF_PERMISSION_CONTEXT_FUNCTION);
      outcome = result.error
        ? Object.freeze({ ok: false as const, reason: "staff_authority_rejected" as const })
        : Object.freeze({ ok: true as const, data: result.data });
    } catch {
      outcome = Object.freeze({ ok: false as const, reason: "staff_authority_unreachable" as const });
    }
    const staffPermissions = resolveAdminStaffPermissionSet(outcome);
    if (staffPermissions.state !== "ready") return staffPermissions;
    return Object.freeze({
      state: "admin" as const,
      subject: authority.subject,
      roleKey: "platform_admin" as const,
      permissions: staffPermissions.permissions
    });
  }

  let branchStatusPermission: CurrentAdminPermissionPredicateOutcome | null = null;
  try {
    const result = await client.rpc(PLATFORM_ADMIN_HAS_PERMISSION_FUNCTION, {
      requested_permission_key: PLATFORM_ADMIN_BRANCH_STATUS_PERMISSION
    });
    branchStatusPermission = result.error || typeof result.data !== "boolean"
      ? Object.freeze({ ok: false as const, reason: "permission_authority_rejected" as const })
      : Object.freeze({ ok: true as const, granted: result.data });
  } catch {
    branchStatusPermission = Object.freeze({
      ok: false as const,
      reason: "permission_authority_unreachable" as const
    });
  }
  const authoritativeContext = resolveCurrentAdminPermissionContext({
    subject: authority.subject,
    membershipContext: authority.context,
    branchStatusPermission
  });
  await resolveAdminStaffAuthorityShadow(client, authoritativeContext);
  return authoritativeContext;
}

export async function resolveVerifiedAdminPermissionContext(
  client: SupabaseClient
): Promise<CurrentAdminPermissionContext> {
  return resolvePermissionsForAuthority(client, await resolveVerifiedAdminAuthority(client));
}

const getVerifiedAdminAuthorityRequest = cache(async (): Promise<Readonly<{
  client: SupabaseClient | null;
  authority: VerifiedAdminAuthorityResolution;
}>> => {
  noStore();
  const config = getAdminAuthConfig();
  if (config.state !== "ready") {
    return Object.freeze({
      client: null,
      authority: Object.freeze({
        subject: null,
        context: resolvePlatformAdminContext({ ok: false, reason: "authority_unreachable" }, true)
      })
    });
  }
  const client = createAdminSupabaseServerClient(config);
  return Object.freeze({ client, authority: await resolveVerifiedAdminAuthority(client) });
});

export const getVerifiedAdminContext = cache(async (): Promise<PlatformAdminContext> =>
  (await getVerifiedAdminAuthorityRequest()).authority.context
);

export const getVerifiedAdminPermissionContext = cache(async (): Promise<CurrentAdminPermissionContext> => {
  const request = await getVerifiedAdminAuthorityRequest();
  if (request.client === null) {
    return resolveCurrentAdminPermissionContext({
      subject: request.authority.subject,
      membershipContext: request.authority.context,
      branchStatusPermission: null
    });
  }
  return resolvePermissionsForAuthority(request.client, request.authority);
});
