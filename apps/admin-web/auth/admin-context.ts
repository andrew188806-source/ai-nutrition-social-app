import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PLATFORM_ADMIN_CONTEXT_FUNCTION,
  resolvePlatformAdminContext,
  type PlatformAdminContext,
  type PlatformAdminContextRow
} from "../server/platformAdminAuthority";
import { getAdminAuthConfig } from "../config/admin-auth";
import { createAdminSupabaseServerClient } from "./supabase-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isContextRow(value: unknown): value is PlatformAdminContextRow {
  return typeof value === "object" && value !== null
    && typeof (value as PlatformAdminContextRow).role_key === "string"
    && typeof (value as PlatformAdminContextRow).permission_key === "string"
    && typeof (value as PlatformAdminContextRow).permission_scope === "string";
}

export async function resolveVerifiedAdminContext(client: SupabaseClient): Promise<PlatformAdminContext> {
  let userResult: Awaited<ReturnType<typeof client.auth.getUser>>;
  try {
    userResult = await client.auth.getUser();
  } catch {
    return Object.freeze({ state: "unavailable" as const, reason: "authority_unreachable" as const });
  }

  const subject = userResult.data.user?.id;
  if (
    typeof subject !== "string"
    || !UUID.test(subject)
    || userResult.data.user?.is_anonymous === true
  ) {
    if (userResult.error && userResult.error.status !== 401 && userResult.error.status !== 403) {
      return Object.freeze({ state: "unavailable" as const, reason: "authority_unreachable" as const });
    }
    return resolvePlatformAdminContext({ ok: true, rows: [] }, false);
  }

  try {
    const result = await client.rpc(PLATFORM_ADMIN_CONTEXT_FUNCTION);
    if (result.error || !Array.isArray(result.data) || !result.data.every(isContextRow)) {
      return resolvePlatformAdminContext({ ok: false, reason: "authority_rejected" }, true);
    }
    return resolvePlatformAdminContext({ ok: true, rows: result.data }, true);
  } catch {
    return resolvePlatformAdminContext({ ok: false, reason: "authority_unreachable" }, true);
  }
}

export const getVerifiedAdminContext = cache(async (): Promise<PlatformAdminContext> => {
  noStore();
  const config = getAdminAuthConfig();
  if (config.state !== "ready") {
    return resolvePlatformAdminContext({ ok: false, reason: "authority_unreachable" }, true);
  }
  return resolveVerifiedAdminContext(createAdminSupabaseServerClient(config));
});
