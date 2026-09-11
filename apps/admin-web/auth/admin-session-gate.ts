import type { PlatformAdminContext } from "../server/platformAdminAuthority";

export type AdminSessionGateDecision =
  | Readonly<{ state: "allow" }>
  | Readonly<{ state: "redirect_login" }>
  | Readonly<{ state: "access_denied" }>
  | Readonly<{ state: "authority_unavailable" }>;

export function decideAdminSessionGate(context: PlatformAdminContext): AdminSessionGateDecision {
  if (context.state === "unauthenticated") return { state: "redirect_login" };
  if (context.state === "unavailable") return { state: "authority_unavailable" };
  if (context.state === "not_admin") return { state: "access_denied" };
  return context.permissions.includes("admin_context.read")
    ? { state: "allow" }
    : { state: "access_denied" };
}
