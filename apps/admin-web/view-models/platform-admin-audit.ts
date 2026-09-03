/** Browser-safe RA-1B projection. No identity, membership, reason or database metadata. */
export type PlatformAdminAuditEvent = Readonly<{
  action: "grant_platform_admin" | "revoke_platform_admin";
  outcome: "granted" | "revoked" | "rejected";
  role: "platform_admin";
  occurredAt: string;
}>;

export type PlatformAdminAuditResult =
  | Readonly<{
      state: "ready";
      events: readonly PlatformAdminAuditEvent[];
      page: number;
      pageSize: number;
      hasNextPage: boolean;
      sourceWindow: 500;
    }>
  | Readonly<{ state: "unauthenticated" | "forbidden" | "unavailable" | "invalid_request" }>;
