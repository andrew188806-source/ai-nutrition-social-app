# 機密處理（Secret Handling）

> **分類** `SECURITY_AUTHORITY` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26 · **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

## 規則

1. Repository 與文件只寫**變數名稱**，永不寫值。變數名稱清單見 [REQUIRED_ENV_NAMES](../04_DEPLOYMENT_ENVIRONMENTS/REQUIRED_ENV_NAMES.md)。
2. 永不提交、記錄、截圖或貼到對話的內容：密碼、資料庫連線字串、broker URL 的值、TOTP 秘密、QR、Factor ID、當下驗證碼、私人 API token、`service_role` 金鑰、個人存取 token（例如 Supabase access token）。
3. 值只存放在私有位置：Vercel 專案環境變數、Supabase function secrets、本機 `.env.local`（不進版控）。
4. Admin runtime **不得**有 `service_role` 金鑰或資料庫擁有者（`postgres`）憑證。
5. Step-Up broker 密碼只能經由受控變更輪替；輪替後第一次連線可能失敗一次（連線池延遲）。
6. Break-glass 連線字串（Development／Production 各一）只由憑證擁有者保存；CLI 會拒絕 `service_role`。
7. 互動式登入、TOTP 由本人操作；實作者不要求對方貼出任何憑證。
8. 非交接必要的識別碼（staff account UUID、Auth user ID、專案內部 ID）也不要寫進交接文件；以角色與程序描述。

## 發現疑似外洩時

立即停止、不要轉述內容；由憑證擁有者輪替該憑證；若在版控中出現，另行評估歷史清除（需 Planner 決定）。

## 來源

`docs/engineering-handoff.md`（Secrets）、`docs/deployment-local-access-matrix.md`、`docs/admin-authority-sop-zh-tw.md`。
