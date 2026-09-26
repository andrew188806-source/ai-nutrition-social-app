# POS／收據整合（POS / Receipt Integration）

> **分類** `POST_MVP` · **狀態** `POST_MVP` / `DEFERRED`（未實作） · **最後對帳** 2026-09-26 · **機密** `PRIVATE_INTERNAL` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

> 目前沒有 POS 整合、原生 POS 或收據辨識；只有既有的 AI 餐點照片分析。

## POS 方向（ODR-023，`POS_DIRECTION_DECISION_DEFERRED`）

尚未在「整合現有 POS 供應商」、「TastKind 原生 POS／交易系統」或「混合」之間做選擇；依未來證據決定（整合成本、開發成本、交易量、餐廳採用、營運複雜度、結算對帳、資料控制、議價力、供應商依賴、長期經濟）。唯一固定限制：不要做出半套、會增加餐廳營運負擔的平行結帳流程。

## 收據辨識方向（ODR-024，`POST_MVP`）

1. 辨識餐廳 → 2. 把收據品項對到該餐廳既有目錄 → 3. 若有 Restaurant／POS 整合，將收據別名／POS 品項代碼對應到正式 `menu_item`／`branch_menu_item` → 4. 重用已知的營養／目錄資料 → 5. 目錄比對失敗或非目錄品項時，才以 OCR＋AI 估算作為備援。

- 沒有使用 TastKind POS 的餐廳，只要目錄已在 TastKind 內，仍可運作。
- 必須與任一 POS 方向相容。

## 與多人餐桌的關係

POS **不是**多人餐桌或桌菜模式推薦的前提（見 [GROUP_TABLE_FUTURE_PLAN](GROUP_TABLE_FUTURE_PLAN.md)）。

## 來源

`governance/OWNER_PRODUCT_DECISION_REGISTER.md` ODR-022～024；GQA-4 Planner brief（2026-09-26）。
