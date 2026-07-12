import type { AssistantActionDraft, AssistantSuggestion, AuditLog } from "../../domain/restaurantDomain";

export const canonicalAssistantSuggestions: AssistantSuggestion[] = [
  { id: "assistant-suggestion-photo", prompt: "哪些餐點沒有照片？", category: "query" },
  { id: "assistant-suggestion-protein", prompt: "哪些餐點還沒填蛋白質？", category: "query" },
  { id: "assistant-suggestion-staff", prompt: "南西店現在有幾位員工？", category: "query" },
  { id: "assistant-suggestion-inactive", prompt: "哪些人員已停用但權限尚未移除？", category: "reminder" },
  { id: "assistant-suggestion-best-badge", prompt: "加入營養標誌後表現最好的餐點是哪一道？", category: "draft" }
];

export const canonicalAssistantDrafts: AssistantActionDraft[] = [
  {
    id: "draft-disable-iris-login",
    title: "停用 Iris 的後台登入權限",
    targetType: "employee",
    before: "員工狀態已停用，但 user-iris 仍可登入",
    after: "保留員工資料，將後台登入權限改為停用",
    status: "waiting_admin_confirmation"
  }
];

export const canonicalAuditLogs: AuditLog[] = [
  { id: "audit-pending-miso", actorUserId: "user-mina", actorName: "林敏娜", action: "對應現有餐點", targetType: "pending_menu_item", targetId: "pending-miso-chicken", result: "已儲存為對應草稿", note: "對應舒肥雞胸均衡碗", createdAt: "2026-07-09T12:20:00+08:00" },
  { id: "audit-salmon-badge", actorUserId: "user-grace", actorName: "Grace", action: "啟用營養標誌", targetType: "menu_item", targetId: "dish-haochu-2", result: "mock event 已建立", createdAt: "2026-06-06T10:00:00+08:00" }
];
