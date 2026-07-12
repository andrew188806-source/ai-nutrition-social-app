import type { PendingMenuItemStatus } from "@haocu/shared/domain/restaurantDomain";
import { listAuditLogs } from "../repositories/assistant-repository";
import { listPendingMenuItems } from "../repositories/pending-item-repository";
import { getBranchName, getMenuItemName } from "./menu-service";
import { getRestaurantById } from "../repositories/restaurant-repository";

export const pendingStatusLabels: Record<PendingMenuItemStatus, string> = {
  pending: "待確認",
  matched_existing_item: "已對應現有餐點",
  confirmed_new_item: "已建立新餐點",
  rejected: "非本店餐點",
  needs_more_information: "需要更多資訊"
};

export function getPendingMenuItems() {
  return listPendingMenuItems().map((item) => ({
    ...item,
    restaurantName: getRestaurantById(item.restaurantId)?.name ?? "未知店家",
    branchName: getBranchName(item.branchId),
    suggestedItemName: getMenuItemName(item.aiSuggestedMenuItemId),
    statusLabel: pendingStatusLabels[item.status],
    auditTrail: listAuditLogs().filter((log) => log.targetId === item.id)
  }));
}
