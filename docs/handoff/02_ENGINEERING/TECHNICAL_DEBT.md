# 技術債（Technical Debt）

> **分類** `ENGINEERING` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

完整的 TD-xx 證據在 `docs/engineering-state-registers.md` §2。本表是目前有效的精選清單。`LIVE_RECHECK_NEEDED` 表示事實來自過去的 live 觀察，本輪**沒有**重新驗證。

| # | 項目 | 狀態 | 參考 |
| --- | --- | --- | --- |
| 1 | Consumer 初次載入 4 個約 7.1 MB 的 Noto Sans TC 網頁字型（約 28 MB），慢速網路下阻擋畫面 | `GLOBAL_QA_PERFORMANCE_DEBT` | TD-24 |
| 2 | Restaurant Demo 函式區域最後記錄為 `iad1`，Development 資料庫在新加坡區域（Admin 已設 `sin1`） | `TECH_DEBT` · `LIVE_RECHECK_NEEDED`（GQA-6） | 部署矩陣 |
| 3 | 實體裝置推播送達與點擊行為未驗收；Social 不是 FINAL CLOSED | `TECH_DEBT`（依產品決定延後） | TD-05 |
| 4 | 沒有正式地理編碼供應商（僅 mock；`RESTAURANT_GEOCODING_PROVIDER` 預設 `disabled`） | `PRODUCT_DECISION_REQUIRED` | TD-11 |
| 5 | 一個以 `res***` 開頭的舊 staff 帳號狀態待確認 | `LIVE_RECHECK_NEEDED`（GQA-5） | GQA-4 brief |
| 6 | Development 遷移歷史漂移（`schema_migrations` 66 筆 vs 139 檔） | `TECH_DEBT` · GQA-5 對帳 | TD-01 |
| 7 | 歷史階段 guard 在目前 HEAD 失敗（設計使然） | `INHERITED` | [TEST_GUARD_ACCEPTANCE](TEST_GUARD_ACCEPTANCE.md) |
| 8 | Expo Web export／Metro 本地驗證限制 | 待確認是否仍適用 · `LIVE_RECHECK_NEEDED`（GQA-6） | GQA-4 brief |
| 9 | 沒有 CI、lint、pre-commit hook，也沒有 `engines`／`packageManager`／`.nvmrc`（2026-09-26 仍屬實） | `TECH_DEBT` | TD-04 |
| 10 | 7 個 `POSSIBLY_DEAD` 資料庫物件（社交封鎖、參與 opt-in／pause／resume／opt-out RPC、`replace_authenticated_social_interests`） | `OPEN`，僅報告不刪除 | GQA-3 掃描 |
| 11 | 10 個 `UNKNOWN` 資料庫物件（`consumer_meal_record_owner_view`、`restaurant_consumer_aggregate_metrics`、`restaurant_membership_branch_scopes`、`meal_buddy_menu_item_food_context_mapping`、`meal_buddy_chat_channels`、`meal_buddy_push_devices`、兩個過敏原字典 view、目錄 v2／v3） | `OPEN`，僅報告不刪除 | GQA-3 掃描 |
| 12 | 平台預設權限（`pg_default_acl`）未 live 驗證；靜態分析看不到 Supabase 平台預設 | `LIVE_RECHECK_NEEDED`（GQA-5） | [MIGRATION_POLICY](MIGRATION_POLICY.md) |
| 13 | Development Security Advisor 不乾淨（S3–S7 待強化／複查；未發現權限繞過） | `TECH_DEBT` · `LIVE_RECHECK_NEEDED` | TD-18、registers §9 |
| 14 | Production 從未啟用 | `TECH_DEBT` | TD-03 |
| 15 | Restaurant mock 模式與 `packages/services` 的付款／推播 placeholder 仍在出貨程式中 | `TECH_DEBT` | TD-13 |
| 16 | 超大檔案（`analysis.tsx` 約 3,469 行、`meal-buddies.tsx` 約 3,141 行等） | `TECH_DEBT` | TD-14 |
| 17 | 單一 zh-TW 語系模組、部分舊 mock 有編碼損壞 | `TECH_DEBT` | TD-15 |
| 18 | Social executor transport 仍在伺服器端固定 Development 專案 | `TECH_DEBT` | TD-19 |
| 19 | Break-glass CLI 以原始連線的 live 驗收未完全重做（已用相同授權面演練） | `TECH_DEBT` | TD-08 |
| 20 | `.env.example` 註解描述 H1 之前的閘門（因凍結 guard 未修改） | `DOCUMENTATION_GAP` | TD-21 |
| 21 | 同意書／法律文字仍為 placeholder；實際餐點照片保存未獲核准 | `PRODUCT_DECISION_REQUIRED` | TD-10 |

## 已解決（不要再列為債）

- Primary 精靈缺少「目標為自己」警示、base Admin 人員清單顯示空白：**GQA-2 已修正**（預先警示；拒絕／空白／無法取得三態分開）。
- 舊 ADMIN-A 測試帳號殘留：已撤銷（TD-23 `CLOSED`）。
- Consumer 固定 Development 專案（TD-02）、`meal-photo-analysis` CORS（TD-20）：`CLOSED`。
