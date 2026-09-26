# 凍結決定（Frozen Decisions）

> **分類** `DECISION_REGISTER` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · `NOT_FOR_VENDOR_EXPORT_BY_DEFAULT` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

只收錄**有證據、已接受或已凍結**的決定。討論中或方向性的項目不在此處（見 [DECISION_STATUS_INDEX](../00_INDEX/DECISION_STATUS_INDEX.md)、[OPEN_DECISIONS](OPEN_DECISIONS.md)）。

| ID | 主題 | 決定 | 生效 | 正式來源 | 分類 | 取代 |
| --- | --- | --- | --- | --- | --- | --- |
| FD-01 | 最高權限能力 | 最高權限／緊急權限是必要、有限、可稽核、可撤銷的能力，與一般 Admin、餐廳、消費者分開（已實作並凍結） | 2026-09-11（ODR-001） | [ADMIN_AUTHORITY](../03_SECURITY_AUTHORITY/ADMIN_AUTHORITY.md) | SECURITY_AUTHORITY | v3.0.1「未開始」 |
| FD-02 | Admin Authority 凍結 | Admin Authority 完成並凍結，不重開 | 2026-09-19（ODR-007） | [ADMIN_AUTHORITY](../03_SECURITY_AUTHORITY/ADMIN_AUTHORITY.md) | SECURITY_AUTHORITY | — |
| FD-03 | `self_target_denied` | P3B–P3F 拒絕以自己為目標；第一位 Primary 的建立是跨主體的 | ADMIN-E 結案（2026-09-25） | [PRIMARY_STEPUP_BREAKGLASS](../03_SECURITY_AUTHORITY/PRIMARY_STEPUP_BREAKGLASS.md) | SECURITY_AUTHORITY | — |
| FD-04 | Primary 精確八鍵 | Primary 是八個有效授權的推導狀態，不是 DB 角色；不被經理級模板自動包含 | Admin Authority 凍結 | [PRIMARY_STEPUP_BREAKGLASS](../03_SECURITY_AUTHORITY/PRIMARY_STEPUP_BREAKGLASS.md) | SECURITY_AUTHORITY | — |
| FD-05 | 經理級模板（MRB） | 模板是 UI／應用層預設，逐一權限走既有路徑；APPLY／只新增；不是 DB 角色、萬用權限或繞過 | 2026-09-25（`7a4a341`） | [ADMIN_PRODUCT](../01_PRODUCT/ADMIN_PRODUCT.md) | PRODUCT | — |
| FD-06 | Admin IA 分離 | Restaurant 營運、平台管理、工程維護概念分離；權限不靠隱藏 UI | ODR-008 | [ADMIN_PRODUCT](../01_PRODUCT/ADMIN_PRODUCT.md) | PRODUCT | — |
| FD-07 | 社交入口 | 所有正式配對入口經由飯友卡 | 2026-09-11（ODR-002） | [SOCIAL_PRODUCT](../01_PRODUCT/SOCIAL_PRODUCT.md) | PRODUCT | — |
| FD-08 | 飯友情境 | 使用者不手選隱藏情境分類；情境來自所選的具體推薦／菜品 | ODR-012 | [SOCIAL_PRODUCT](../01_PRODUCT/SOCIAL_PRODUCT.md) | PRODUCT | — |
| FD-09 | Consumer 範圍 | Consumer 主要功能範圍凍結；只允許既有功能內的演算法／規則調整 | ODR-011 | [MVP_SCOPE](../01_PRODUCT/MVP_SCOPE.md) | PRODUCT | — |
| FD-10 | 餐廳自助目錄 | 餐廳自行維護菜單目錄；平台人員不是例行輸入者 | ODR-003 | [RESTAURANT_PRODUCT](../01_PRODUCT/RESTAURANT_PRODUCT.md) | PRODUCT | — |
| FD-11 | 租戶內菜名 | `menu_items.name` 是餐廳租戶內正式菜名；Owner 權限不含營養驗證、徽章、平台分類 | ODR-004 | [RESTAURANT_TENANCY](../03_SECURITY_AUTHORITY/RESTAURANT_TENANCY.md) | SECURITY_AUTHORITY | — |
| FD-12 | 草稿與可見性 | 新菜單／菜品從 draft 開始；營養不是可見性前提，但影響推薦資格 | ODR-005 | [RESTAURANT_PRODUCT](../01_PRODUCT/RESTAURANT_PRODUCT.md) | PRODUCT | — |
| FD-13 | IP 圖鑑 | 系列優先；角色獨立於系列 | ODR-009 | [CONSUMER_PRODUCT](../01_PRODUCT/CONSUMER_PRODUCT.md) | PRODUCT | — |
| FD-14 | 多人餐桌 | Post-MVP；實作前需盤點（GT-I 已完成） | ODR-013 | [GROUP_TABLE_INVENTORY](../10_POST_MVP/GROUP_TABLE_INVENTORY.md) | POST_MVP | 「多人餐桌屬 MVP」 |
| FD-15 | 桌菜模式意圖 | 中式合菜；推薦單位是菜品組合；過敏／限制不可被平均；不以 POS 為前提；現在不實作 | GQA-4 brief | [GROUP_TABLE_FUTURE_PLAN](../10_POST_MVP/GROUP_TABLE_FUTURE_PLAN.md) | POST_MVP | — |
| FD-16 | 創始餐廳配額 | 首次上架／拍攝 100 道、有上限；美食趣報導移除 | ODR-025 | [EARLY_BIRD_FOUNDING_RESTAURANTS](../08_BUSINESS_MONETIZATION/EARLY_BIRD_FOUNDING_RESTAURANTS.md) | BUSINESS_MONETIZATION | 15 道／吃到飽／美食趣報導 |
| FD-17 | 品牌／IP 規則 | 授權外部 IP 永遠不成為 TastKind 品牌身分 | ODR-026 | [BUSINESS_MODEL](../08_BUSINESS_MONETIZATION/BUSINESS_MODEL.md) | BUSINESS_MONETIZATION | — |
| FD-18 | 交易變現原則 | 只對 TastKind 帶來並經 TastKind 路徑完成的交易變現 | ODR-022 | [BUSINESS_MODEL](../08_BUSINESS_MONETIZATION/BUSINESS_MODEL.md) | BUSINESS_MONETIZATION | — |
| FD-19 | 牽引力誠信 | 不得捏造或暗示已證實的用戶、餐廳、轉換、留存或驗證 | ODR-027 | [MARKET_VALIDATION](../09_OPERATIONS_GTM/MARKET_VALIDATION.md) | OPERATIONS_GTM | — |
| FD-20 | 餐廳點數 | 餐廳初期不加入 TastKind 共享點數；餐廳專屬點數延後 | ODR-021 | [POINTS_ECONOMY](../10_POST_MVP/POINTS_ECONOMY.md) | POST_MVP | 較早的餐廳點數草案 |
| FD-21 | 歷史遷移凍結 | 139 個歷史遷移不得就地修改／修補；只能新增前向遷移 | GQA-3（`3069b10`） | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) | ENGINEERING | — |
| FD-22 | Data API 宣告 | 新 public 資料表必須宣告存取模式與 RLS，並由 guard 驗證實際 SQL | GQA-3（`3069b10`） | [MIGRATION_POLICY](../02_ENGINEERING/MIGRATION_POLICY.md) | ENGINEERING | — |
| FD-23 | 耐久驗證模型 | GQA-1／GQA-2 的有效性只依出處、凍結產品位元組與邊界；不依後續提交身分 | GQA-3（`cba7d90`、`44101e9`） | [TEST_GUARD_ACCEPTANCE](../02_ENGINEERING/TEST_GUARD_ACCEPTANCE.md) | ENGINEERING | 身分列舉模型 |
| FD-24 | QA 結案 | GQA-1、GQA-2、GQA-3 已結案、凍結、推送 | 2026-09-26 | [REPOSITORY_STATE](../02_ENGINEERING/REPOSITORY_STATE.md) | ENGINEERING | — |
| FD-25 | Production 後端 | 目前營運狀態為**未啟用**；Vercel Production 目標可指向 Development | 目前 | [ENVIRONMENT_MATRIX](../04_DEPLOYMENT_ENVIRONMENTS/ENVIRONMENT_MATRIX.md) | DEPLOYMENT_ENVIRONMENT | — |
| FD-26 | 階段順序 | 已結案階段不因無證據理由重開；GQA-4 → GQA-5 → GQA-6 → GQA-7 → Post-MVP 多人餐桌 | 2026-09-26 | [PRODUCT_ROADMAP](../01_PRODUCT/PRODUCT_ROADMAP.md) | PRODUCT | 舊 runtime roadmap「目前 2V」 |
