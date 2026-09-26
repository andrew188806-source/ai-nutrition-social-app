# 資料庫遷移政策（Migration Policy）

> **分類** `ENGINEERING` · **狀態** `CANONICAL_CURRENT`（GQA-3 已接受） · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

執行中的規則由 `scripts/public-schema-data-api-grant-guard.mjs` 強制；本文件描述其語意。若本文件與 guard 不一致，以 guard 為準。

## 1. 歷史遷移（凍結）

- GQA-3 基準（`25157cb`）共有 **139** 個遷移檔，全部凍結。
- **不得就地修改、修補或重新命名**已套用的遷移；也不得刪除。
- `scripts/db-migration-baseline-manifest.json` 為每個檔案記錄 Git blob id 與「LF 正規化後的 SHA-256」，並有總和雜湊；任何編輯、刪除、改名或 blob 變更都會使 guard 失敗。
- 所有變更一律以**新的前向（forward）遷移檔**完成。
- 檔名必須符合 `YYYYMMDDHHMMSS_<snake_case>.sql`；時間戳必須唯一，且新檔必須排在最新歷史時間戳之後（決定性、唯一的順序）。

## 2. 新的 public 資料表必須宣告存取決策

每個在 `public` schema 新出現的資料表（CREATE、RENAME 進入、或 `SET SCHEMA` 移入）都必須在同一遷移檔中加上標記：

```sql
-- TASTKIND_DATA_API: public.<table> mode=<MODE> rls=<ENABLED|FORCED> [justification="..."]
```

修改既有 public 資料表的授權／RLS／政策時，使用 `-- TASTKIND_DATA_API_CHANGE: ...`。標記本身不夠：guard 會解析實際 SQL（包含 `DO` 區塊與 `EXECUTE` 字串），確認最終狀態與宣告一致。

| 模式 | guard 要求（摘要） |
| --- | --- |
| `SEALED_RPC_ONLY` | anon／authenticated 無任何權限；建立時必須明確 `REVOKE` anon 與 authenticated；沒有適用於用戶端角色（anon、authenticated、PUBLIC）的政策；`service_role` 也無權限；必須 `rls=FORCED` |
| `SERVER_ONLY` | anon／authenticated 無任何權限；建立時必須明確 `REVOKE` anon 與 authenticated；無用戶端政策；必須明確授權給 `service_role` 或具名的伺服器角色 |
| `AUTHENTICATED_READ` | anon 無權限；authenticated **只有** `SELECT`；必須有適用 authenticated 的 SELECT 政策；不得授權自訂角色 |
| `AUTHENTICATED_READ_WRITE` | anon 無權限；authenticated 有 `SELECT` 且至少一種寫入；每個被授權的操作都要有對應的 authenticated 政策；不得授權自訂角色 |
| `PUBLIC_READ` | 必須附 `justification="..."`（至少 12 字元）；anon **只有** `SELECT`；authenticated 至多 `SELECT`；必須有適用 anon 的 SELECT 政策；不得授權自訂角色 |

所有模式共同：必須啟用 RLS（`rls=FORCED` 時必須有 `FORCE ROW LEVEL SECURITY`）；PUBLIC 不得持有資料表權限；anon／authenticated／service_role 只能有 CRUD 權限（`TRUNCATE`、`REFERENCES`、`TRIGGER` 會被拒絕）。

## 3. 新遷移中一律禁止

- 廣泛授權：`GRANT ALL`、`... ON ALL TABLES|FUNCTIONS|SEQUENCES IN SCHEMA`。
- `ALTER DEFAULT PRIVILEGES ... GRANT`（預設權限只允許收窄的 REVOKE）。
- 未知的權限字詞。
- 對 public 資料表 `DISABLE ROW LEVEL SECURITY` 或 `NO FORCE ROW LEVEL SECURITY`。
- 另會「提報」：新 view、以及對 anon／PUBLIC 的 `EXECUTE` 授權（需人工審閱）。

本 repository 的慣例是**逐角色、逐表明確 GRANT**（包括 `service_role`），沒有全面性的預設權限。

## 4. 不可走的捷徑

- 不得以 `supabase migration repair`、手動寫入 `schema_migrations`、或遠端手動 SQL「對齊」歷史。
- 不得在 Development 執行 `supabase db push`：Development 的遷移歷史表只有 66 筆，與 139 個檔案不一致，push 會嘗試重建已存在的物件。見 [DEVELOPMENT](../04_DEPLOYMENT_ENVIRONMENTS/DEVELOPMENT.md)。
- **不得只從本地檔案推論遠端狀態。** 遠端授權、政策、預設權限必須 live 讀取驗證。

## 5. GQA-5 必須 live 對帳

`schema_migrations` 對 139 檔 manifest、public 資料表授權、`pg_default_acl`、RLS／FORCE、政策、函式 `EXECUTE`、anon／authenticated 的 REST／RPC 可達性、封存 schema／資料表不可達、Security Advisor。完整清單見 [EXTERNAL_RECHECK_REQUIRED](../11_DECISION_REGISTERS/EXTERNAL_RECHECK_REQUIRED.md)。

## 驗證指令

```bash
node scripts/public-schema-data-api-grant-guard.mjs
node scripts/public-schema-data-api-grant-mutations.mjs
node scripts/db-migration-baseline-manifest.mjs
node scripts/db-object-contract-scan.mjs
```
