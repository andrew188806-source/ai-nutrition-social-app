"use client";

import { useEffect, useState } from "react";
import { PlatformAdminBranchStatus } from "../PlatformAdminBranchStatus";
import type { PlatformAdminBranchStatusPreview } from "../../view-models/platform-admin-branch-status";

const PREVIEW_STATES: ReadonlySet<string> = new Set([
  "ready", "unauthenticated", "permission_denied", "invalid_request", "target_not_found",
  "mutation_rejected", "dependency_unavailable", "internal_failure"
]);

/**
 * Canonical /admin host for the governed branch status control. The proven control and its API
 * (`/api/platform-admin/restaurant-branches/[branchId]/status`) are reused unchanged; this wrapper only
 * performs the initial cookie-session read that the control expects as its starting state.
 */
export function AdminBranchStatusWorkspace({ restaurantId, branchId }: Readonly<{
  restaurantId: string;
  branchId: string;
}>) {
  const [preview, setPreview] = useState<PlatformAdminBranchStatusPreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    (async () => {
      let next: PlatformAdminBranchStatusPreview;
      try {
        const response = await fetch(
          `/api/platform-admin/restaurant-branches/${encodeURIComponent(branchId)}/status?restaurantId=${encodeURIComponent(restaurantId)}`,
          { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } }
        );
        const body = await response.json() as { state?: unknown };
        next = typeof body?.state === "string" && PREVIEW_STATES.has(body.state)
          ? body as PlatformAdminBranchStatusPreview
          : { state: "dependency_unavailable" };
      } catch {
        next = { state: "dependency_unavailable" };
      }
      if (!cancelled) setPreview(next);
    })();
    return () => { cancelled = true; };
  }, [restaurantId, branchId]);

  if (preview === null) {
    return <p className="text-sm text-slate-600" role="status">正在讀取分店狀態…</p>;
  }
  return <PlatformAdminBranchStatus initialPreview={preview} key={`${restaurantId}/${branchId}`} />;
}
