# Admin 產品（Platform Admin Product）

> **分類** `PRODUCT` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

平台 Admin 後台：`apps/admin-web`（Next.js 14）。本文件只談功能面；權限架構（Primary、Step-Up、Break-glass、P3E／P3F／P3H）見 [ADMIN_AUTHORITY](../03_SECURITY_AUTHORITY/ADMIN_AUTHORITY.md) 與 [PRIMARY_STEPUP_BREAKGLASS](../03_SECURITY_AUTHORITY/PRIMARY_STEPUP_BREAKGLASS.md)。

## 資訊架構原則（ODR-008）

Restaurant 營運管理、平台管理、工程／維護三者概念分離；權限從不只靠「隱藏 UI」。可執行的路由登錄表 `apps/admin-web/auth/admin-route-registry.ts` 是路由狀態的唯一來源（優先於文字版 IA 文件）。

## 現行功能區（ADMIN-A～E，`LIVE_ACCEPTED`，Development）

| 功能區 | 說明 |
| --- | --- |
| 儀表板讀取 | 受保護的計數面板（需對應權限） |
| Restaurant 營運讀取 | 餐廳、分店、介紹、聯絡、GEO、營業時間、菜單、菜品 |
| 菜單管理佇列 | 待處理（pending）、資料品質（data-quality） |
| 營養待審 | 營養認證待審清單（唯讀） |
| 社交政策 | Social Policies 讀取 |
| 稽核 | 平台成員稽核（platform-memberships） |
| 人員管理 | `/admin/management`：人員清單、個別詳情、權限目錄、設定（TOTP／Step-Up）、安全紀錄 |
| Primary 建立精靈 | 八步驟精靈，建立另一位 Primary Permission Manager |
| 經理級權限模板（MRB） | 見下節 |

GQA-2（`CLOSED / FROZEN / PUSHED`）補上：人員清單的「無權限」與「已授權但為空」與「無法取得」三種狀態分開顯示；Primary 精靈在目標為自己時預先警示（後端 `self_target_denied` 仍是最終權威）。

## 經理級權限模板 MRB（`LOCAL_ACCEPTED`，已推送；Development live 狀態待 GQA-5 確認）

- 六個版本化模板：`highest_management_operational_v1`、`platform_operations_manager_v1`、`restaurant_operations_manager_v1`、`nutrition_manager_v1`、`social_safety_manager_v1`、`audit_security_manager_v1`（精確內容：`apps/admin-web/auth/admin-manager-presets.ts`）。
- 模板是 **UI／應用層預設組合**，展開成逐一的個別權限。**不是**資料庫角色、萬用權限、自動 Primary，也不能繞過任何檢查。
- 套用語意：**APPLY／只新增（ADD-only）**。需輸入 `APPLY <preset_id> TO <staff_account_id>`、有效的新 TOTP Step-Up；每個缺少的權限各自走既有 P3F 授權路徑、各自稽核；遇到第一個拒絕即停止，不回滾已成功者，也不自動撤銷。
- 前置條件：`admin_context.read` 走 P3E 主控台准入；`admin_restaurant_branch.status.write` 需先走一般授權路徑；`highest_management_operational_v1` 只給已是 Primary 的帳號。
- `admin.management.staff.bundle.write` 仍為 PLANNED。

## 舊版路由（22 個 legacy root）

ADMIN-E1 後：7 個轉址到 live 頁面、3 個為如實的分流閘道、12 個明確顯示「無法使用／無資料」；**沒有任何 mock 營運資料**。

## 延後／未開放

`business-development` 工作區（9 條 `NOT_ENABLED` 路由，無 schema；範圍未決，見 [OPEN_DECISIONS](../11_DECISION_REGISTERS/OPEN_DECISIONS.md)）、角色／Bundle 管理、營養師角色、Passkey。

## 來源

`docs/engineering-handoff.md`、`docs/admin-operational-surface-inventory.md`、`docs/admin-manager-presets-mrb.md`、`docs/deployment-local-access-matrix.md`；MRB 提交 `7a4a341`；GQA-2 提交 `075a6f7`。
