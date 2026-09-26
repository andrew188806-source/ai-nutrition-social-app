# Admin 權限架構（Admin Authority）

> **分類** `SECURITY_AUTHORITY` · **狀態** `CANONICAL_CURRENT`（Admin Authority `FROZEN`） · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

Primary、Step-Up、Break-glass 的細節見 [PRIMARY_STEPUP_BREAKGLASS](PRIMARY_STEPUP_BREAKGLASS.md)；操作程序見 `docs/admin-authority-sop-zh-tw.md`（《最高權限開啟 SOP》）。功能面見 [ADMIN_PRODUCT](../01_PRODUCT/ADMIN_PRODUCT.md)。

## 核心原則

- 權限 = 一個 staff account 的有效授權列（entitlement rows）加總，**永遠如此**。沒有 `primary_admin` 超級使用者，也沒有萬用權限。
- 每個 RPC 與寫入各自重新檢查自己的權限；頁面顯示或隱藏不構成安全邊界（ODR-008）。
- Admin Authority 已完成並凍結，不重開（ODR-007）。

## 分層（由下而上，`admin_internal` schema）

| 層 | 職責 |
| --- | --- |
| P1／P2 | 基礎資料表（staff accounts、entitlements、permission catalog、delegations）與有效權限解析 |
| P3B | staff 帳號生命週期（連結、停權、恢復、撤銷） |
| P3C／P3D | 一般委派授權 |
| **P3E** | 主控台准入（console admission，`admin_context.read`） |
| **P3F** | 特權直接授權（privileged permission grant） |
| P3G | Break-glass 緊急控制平面（獨立、僅限資料庫擁有者） |
| **P3H** | Step-Up 權威本身：TOTP＋AAL2、資料庫收據、受限 broker |
| P3I／P3J | 管理讀取權限與安全紀錄讀取（封存唯讀角色） |

P3B–P3F 的受保護 `_v1` 函式只能由 Step-Up 閘門角色執行；對外只開放 `_v2` 包裝函式，且每個包裝函式第一步就驗證有效的 Step-Up 收據。`_v2` 只有 `authenticated` 可執行（H3 強化後；anon、PUBLIC、`service_role` 皆無）。

## 不變條件（不可放寬）

- **`self_target_denied`**：P3B–P3F 都拒絕以自己為目標的操作。
- 沒有廣泛繞過：不存在跳過 Step-Up、權限檢查或稽核的路徑。
- 經理級模板（MRB）只是 UI 預設組合，展開成逐一權限並走既有 P3F／P3E 路徑，**不是**資料庫角色（見 [ADMIN_PRODUCT](../01_PRODUCT/ADMIN_PRODUCT.md)）。
- 權限字彙（permission vocabulary）不因 UI 變更而擴增；`PLANNED` 與 `deferred` 的權限鍵不得授予。

## 已知延後（非缺陷）

角色／Bundle 管理（`admin.management.roles.read` 無資料庫對應）、Passkey／WebAuthn（TOTP 為 MVP 驗證器）、以 UI 刪除他人 TOTP factor。

## 來源

`docs/engineering-handoff.md`（Admin Authority）、`docs/engineering-state-registers.md` §1.2／§9、`docs/admin-authority-sop-zh-tw.md`。
