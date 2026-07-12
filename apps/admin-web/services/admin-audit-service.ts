import { auditLogRepository } from "../repositories/audit-log-repository";
import type { AuditLogViewModel } from "../view-models/admin-governance-view-models";

export const adminAuditService = {
  listAuditLogs(): AuditLogViewModel[] {
    return auditLogRepository.listAuditLogs().map((log) => ({
      id: log.id,
      actorName: log.actorName,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      result: log.result,
      note: log.note,
      createdAt: log.createdAt
    }));
  },

  listActionDrafts() {
    return auditLogRepository.listActionDrafts();
  }
};
