import { getAdminCanonicalSnapshot } from "./admin-base-repository";

export const auditLogRepository = {
  listAuditLogs() {
    return getAdminCanonicalSnapshot().auditLogs;
  },
  listActionDrafts() {
    return getAdminCanonicalSnapshot().adminActionDrafts;
  }
};
