# Primary／Step-Up／Break-glass

> **分類** `SECURITY_AUTHORITY` · **狀態** `CANONICAL_CURRENT`（`FROZEN`） · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

本文件只描述架構與規則。**不含**任何密碼、TOTP 秘密、QR、Factor ID、驗證碼或連線字串。操作步驟見 `docs/admin-authority-sop-zh-tw.md`。

## Primary Permission Manager

- 最高權限，但**不是資料庫角色**：它是「該帳號同時持有下列八個有效授權」的顯示用推導狀態（PRIMARY READY）。
- 精確八鍵：`admin.management.read`、`admin.management.staff.read`、`admin.management.permissions.read`、`admin.management.staff.account.write`、`admin.management.staff.delegation.write`、`admin.management.staff.console_admission.write`、`admin.management.staff.permission.write`（需輸入明確的高權限確認片語）、`admin_context.read`（經由正式的主控台准入）。
- **不會**被經理級模板（MRB）自動包含。
- 建立方式：八步驟 Primary 精靈；每步驟前後重新讀取實際有效權限，可中斷後續跑。

## Step-Up（P3H）

- TOTP＋AAL2。成功驗證後由資料庫發出 15 分鐘、不延展的收據；特權變更必須帶有效收據。
- 收據只能經由一個權限極窄的 Postgres broker 登入角色發出（永久保留、只屬於收據發行角色，不能執行任何 staff 變更函式，也不能切換到封存角色）。
- 收據以 HttpOnly cookie 保存；ADMIN-E1 起以資料庫時間作為驗證時間，避免應用程式時鐘超前造成間歇性失敗。
- **沒有「只靠密碼」就能恢復 Step-Up 的路徑**（刻意設計）。恢復順序：持有同一 TOTP 秘密的另一裝置 → 另一位 Primary → Break-glass。

## Break-glass（P3G）

- 獨立的緊急恢復路徑，**不是一般 Admin 權限**；由資料庫擁有者層級的 CLI 控制平面操作（`scripts/break-glass-control.mjs`），`service_role` 憑證會被拒絕。
- 有時效（單次啟用含延長有上限）、範圍窄、全程稽核；關閉後緊急授權立即撤銷。
- Break-glass 不預先提供、也不繞過 Step-Up。

## 第一位 Primary 的建立是「跨主體」的

`self_target_denied` 不變：Break-glass 不能讓行為者授予自己 Primary。正確流程是用一次有時效的 Break-glass 啟用，連結並裝備**另一位**正當的 staff 身分成為獨立 Primary；該 Primary 以自己的 TOTP 與 Step-Up，透過一般的跨帳號 P3F／P3E 操作授權原行為者，然後關閉啟用。**不要在自己的帳號上執行 Primary 精靈。**

Development 目前有兩位可用的 Primary、沒有進行中的 Break-glass 啟用（ADMIN-E 最終結案時的 live 狀態；GQA-5 重查）。只有在 Development **沒有任何** PRIMARY READY 帳號時，才可再次使用此恢復路徑，且必須完整關閉。

## 來源

`docs/deployment-local-access-matrix.md`（First Primary bootstrap）、`docs/engineering-handoff.md`（Admin Authority）、`docs/admin-authority-sop-zh-tw.md`。
