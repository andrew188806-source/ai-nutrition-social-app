# Consumer 產品（Consumer Product）

> **分類** `PRODUCT` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

Consumer App：`apps/mobile`（Expo／React Native＋Expo Web）。社交功能另見 [SOCIAL_PRODUCT](SOCIAL_PRODUCT.md)。

## 現行功能

| 功能 | 狀態 | 備註 |
| --- | --- | --- |
| 帳號／個人資料（Auth／Profile） | `LIVE_ACCEPTED` | Consumer Runtime Phases 1A–2Z |
| 下一餐推薦（`/recommendation`）與具體菜品推薦 | `LIVE_ACCEPTED` | 推薦管線：GEO → 過敏 → 食材忌口 → 時段 → 營養 → 口味；限制條件是「資格閘門」，不是排序分數，缺資料時採保守排除（fail closed） |
| 候選不足時的替代（candidate fallback） | `LIVE_ACCEPTED` | 見 `docs/recommendation/*` 凍結契約 |
| 今日攝取（Today Intake） | `LIVE_ACCEPTED`；GQA-1 修正 | 已移除假 82 分與個人化的靜態建議，改為一般飲食提醒 |
| 飲食紀錄／食物日記（`/meal-log`） | `LIVE_ACCEPTED`；GQA-1 修正 | 讀取正式持久化紀錄；無種子日記來源、無固定歷史 demo 日期 |
| AI 餐點照片分析 | `LIVE_ACCEPTED` | 私有 Storage、伺服器端外部多模態供應商（非自有模型）、使用者確認後才定稿 |
| 推薦修正／重新計算（correction／selection） | `LIVE_ACCEPTED` | 推薦回饋與餐點修正資料 runtime |
| 評分（餐廳／菜品） | `LIVE_ACCEPTED`（資料 runtime） | 各畫面入口以 repository 為準 |
| 收藏（Favorites） | `LIVE_ACCEPTED` | 以正式 `menu_item` 目標為基礎（canonical target），日記頁不提供新增／移除收藏 |
| 餐廳／菜單目錄瀏覽 | `LIVE_ACCEPTED` | 只顯示已發布且符合分店供應條件的內容，見 [RESTAURANT_TENANCY](../03_SECURITY_AUTHORITY/RESTAURANT_TENANCY.md) |
| GEO 位置 | `LIVE_ACCEPTED`（目前支援範圍） | 前景、單次工作階段取得位置；距離由資料庫計算；**無正式地理編碼供應商**（僅 mock），見 [TECHNICAL_DEBT](../02_ENGINEERING/TECHNICAL_DEBT.md) |
| 過敏／食材忌口設定 | `LIVE_ACCEPTED` | 私有設定，不是排序輸入 |
| IP 圖鑑（`/codex`） | `IMPLEMENTED`（靜態 demo 資料） | 系列優先（Series-first）；實體商品維度尚無真實資料 |

## GQA-1 真實性狀態（`CLOSED / FROZEN / PUSHED`）

- 日記使用正式持久化紀錄；沒有種子日記、沒有 mock `MealFoodCard` 執行路徑。
- 沒有假的數字分數（82 分）或假裝個人化的靜態建議。
- 多人餐桌路由（`/group-tables`）只顯示「延後」相容頁面；**不是現行功能**。
- 驗證：`scripts/gqa-1-truthfulness-guard.mjs`、`scripts/gqa-1-successor-manifest.mjs`（規則直接檢查產品原始碼）。

## 不要假設

- 不要把多人餐桌 mock 描述成現行 MVP 功能（見 [GROUP_TABLE_INVENTORY](../10_POST_MVP/GROUP_TABLE_INVENTORY.md)）。
- Consumer 字型載入過大（約 28 MB）仍是效能債；慢速網路的完整視覺驗收未通過。
- 推薦與營養數值是估算；不可宣稱醫療效果。

## 來源

`docs/engineering-handoff.md`、`docs/engineering-state-registers.md` §1、`docs/recommendation/*`、`docs/consumer-runtime-phase-2*/*`（凍結契約）；GQA-1 提交 `03cec4f`、`8a16644`、`44101e9`。
