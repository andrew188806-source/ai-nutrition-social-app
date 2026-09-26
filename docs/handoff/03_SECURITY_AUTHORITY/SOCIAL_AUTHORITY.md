# Social 授權與隱私（Social Authority）

> **分類** `SECURITY_AUTHORITY` · **狀態** `CANONICAL_CURRENT`（`FROZEN` for source＋Development E2E） · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

產品意圖見 [SOCIAL_PRODUCT](../01_PRODUCT/SOCIAL_PRODUCT.md)。多人餐桌的未來授權**不是**現行 Social 授權（見 [GROUP_TABLE_FUTURE_PLAN](../10_POST_MVP/GROUP_TABLE_FUTURE_PLAN.md)）。

| 主題 | 現況 |
| --- | --- |
| 參與（participation） | 使用者可加入、暫停、恢復、退出社交配對；未參與者不會成為候選 |
| 封鎖（block） | 以「方向性儲存、對稱評估」實作：任一方向存在封鎖即拒絕該配對的候選評估；只有封鎖者可解除；使用者無法得知自己被誰封鎖（只能讀自己的封鎖清單）。邀請／接受沿用同一候選授權重新檢查（`20260810010000`、`20260810030000`、`20260823010000`） |
| 候選／曝光 | 候選依正式排序產生，曝光數受方案上限（Free 3／Premium 10）限制；只使用授權過的配對資料 |
| 關係 | 經邀請建立的雙人關係；支援解除好友 |
| 聊天／即時 | 僅限關係內雙方；Realtime 以資料庫授權函式判斷頻道存取 |
| 推播 | 裝置權限、outbox／dispatcher、實際 Expo 供應商往返、無效 token 退役已驗收；**實體裝置送達與點擊未驗收** |
| Meal Buddy 情境 | 以食物目錄鍵（由推薦帶入）做情境比對，不是由使用者手選分類 |
| 識別參照 | 對外使用不透明參照（candidate／card／relationship／chat ref），不暴露內部 ID |

## 隱私與安全邊界

- 社交私有資料在 `social_internal` 封存 schema，由封存角色擁有的 SECURITY DEFINER 函式存取；新函式預設不對 PUBLIC 開放執行。
- 社交興趣查詢表已啟用 RLS（H4），anon 無權限。
- Social executor transport 仍固定 Development 專案（TD-19，技術債）。

## 來源

`docs/engineering-state-registers.md`（§1、TD-05、TD-19、§9）、`supabase/migrations/202608*`、`supabase/functions/meal-buddy-*`。
