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

type VerifiedAdminIdentityResolution =
  | Readonly<{ subject: string; context: null }>
  | Readonly<{ subject: null; context: PlatformAdminContext }>;

/** Distinguishes an expected absent session from an Auth authority failure. */
export function isMissingAdminAuthSessionError(error: unknown): boolean {
  return isAuthSessionMissingError(error);
}

async function resolveVerifiedAdminIdentity(client: SupabaseClient): Promise<VerifiedAdminIdentityResolution> {
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

  return Object.freeze({ subject, context: null });
}

async function resolveLegacyAdminAuthority(
  client: SupabaseClient,
  identity: VerifiedAdminIdentityResolution
): Promise<VerifiedAdminAuthorityResolution> {
  if (identity.subject === null) {
    return Object.freeze({ subject: null, context: identity.context });
  }
  try {
    const result = await client.rpc(PLATFORM_ADMIN_CONTEXT_FUNCTION);
    if (result.error || !Array.isArray(result.data) || !result.data.every(isContextRow)) {
      return Object.freeze({
        subject: identity.subject,
        context: resolvePlatformAdminContext({ ok: false, reason: "authority_rejected" }, true)
      });
    }
    return Object.freeze({
      subject: identity.subject,
      context: resolvePlatformAdminContext({ ok: true, rows: result.data }, true)
    });
  } catch {
    return Object.freeze({
      subject: identity.subject,
      context: resolvePlatformAdminContext({ ok: false, reason: "authority_unreachable" }, true)
    });
  }
}

async function resolveVerifiedAdminAuthority(client: SupabaseClient): Promise<VerifiedAdminAuthorityResolution> {
  return resolveLegacyAdminAuthority(client, await resolveVerifiedAdminIdentity(client));
}

export async function resolveVerifiedAdminContext(client: SupabaseClient): Promise<PlatformAdminContext> {
  return (await resolveVerifiedAdminAuthority(client)).context;
}

async function resolvePermissionsForAuthority(
  client: SupabaseClient,
  authority: VerifiedAdminAuthorityResolution,
  mode: "legacy" | "staff_permissions_legacy_admission"
): Promise<CurrentAdminPermissionContext> {
  if (authority.subject === null) {
    return resolveCurrentAdminPermissionContext({
      subject: null,
      membershipContext: authority.context,
      branchStatusPermission: null
    });
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

  if (mode === "staff_permissions_legacy_admission") {
    return resolveStaffAdminPermissionContext(client, authority.subject, "legacy");
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

async function resolveStaffAdminPermissionContext(
  client: SupabaseClient,
  subject: string,
  admissionAuthority: "legacy" | "staff"
): Promise<CurrentAdminPermissionContext> {
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
    subject,
    admissionAuthority,
    permissions: staffPermissions.permissions
  });
}

async function resolvePermissionsForIdentity(
  client: SupabaseClient,
  identity: VerifiedAdminIdentityResolution
): Promise<CurrentAdminPermissionContext> {
  if (identity.subject === null) {
    return resolveCurrentAdminPermissionContext({
      subject: null,
      membershipContext: identity.context,
      branchStatusPermission: null
    });
  }
  const mode = resolveAdminAuthorityMode();
  if (mode.state === "unavailable") {
    return Object.freeze({ state: "unavailable" as const, reason: mode.reason });
  }
  if (mode.mode === "staff") {
    return resolveStaffAdminPermissionContext(client, identity.subject, "staff");
  }
  const authority = await resolveLegacyAdminAuthority(client, identity);
  return resolvePermissionsForAuthority(client, authority, mode.mode);
}

export async function resolveVerifiedAdminPermissionContext(
  client: SupabaseClient
): Promise<CurrentAdminPermissionContext> {
  return resolvePermissionsForIdentity(client, await resolveVerifiedAdminIdentity(client));
}

type VerifiedAdminAuthorityRequest =
  | Readonly<{ client: null; identity: Readonly<{ subject: null; context: PlatformAdminContext }> }>
  | Readonly<{ client: SupabaseClient; identity: VerifiedAdminIdentityResolution }>;

const getVerifiedAdminAuthorityRequest = cache(async (): Promise<VerifiedAdminAuthorityRequest> => {
  noStore();
  const config = getAdminAuthConfig();
  if (config.state !== "ready") {
    return Object.freeze({
      client: null,
      identity: Object.freeze({
        subject: null,
        context: resolvePlatformAdminContext({ ok: false, reason: "authority_unreachable" }, true)
      })
    });
  }
  const client = createAdminSupabaseServerClient(config);
  return Object.freeze({ client, identity: await resolveVerifiedAdminIdentity(client) });
});

export const getVerifiedAdminContext = cache(async (): Promise<PlatformAdminContext> => {
  const request = await getVerifiedAdminAuthorityRequest();
  if (request.client === null) return request.identity.context;
  return (await resolveLegacyAdminAuthority(request.client, request.identity)).context;
});

export const getVerifiedAdminPermissionContext = cache(async (): Promise<CurrentAdminPermissionContext> => {
  const request = await getVerifiedAdminAuthorityRequest();
  if (request.client === null) {
    return resolveCurrentAdminPermissionContext({
      subject: request.identity.subject,
      membershipContext: request.identity.context,
      branchStatusPermission: null
    });
  }
  return resolvePermissionsForIdentity(request.client, request.identity);
});
