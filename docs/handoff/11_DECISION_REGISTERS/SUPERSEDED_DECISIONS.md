# 已被取代的決定與說法（Superseded Decisions）

> **分類** `DECISION_REGISTER` · **狀態** `CANONICAL_CURRENT` · **最後對帳** 2026-09-26（repository `44101e9`）· **機密** `PRIVATE_INTERNAL` · `NOT_FOR_VENDOR_EXPORT_BY_DEFAULT` · 入口：[MASTER_HANDOFF_INDEX](../00_INDEX/MASTER_HANDOFF_INDEX.md)

收錄可能造成誤解的舊決定或舊說法。每一項都指向取代它的正式文件。舊文件保留作為證據，不刪除。

| ID | 舊決定／說法 | 出現位置 | 取代為 | 正式文件 |
| --- | --- | --- | --- | --- |
| SD-01 | 以 NT$3M／NT$5M 作為股權募資目標 | 舊募資規劃 | 第一輪規劃 NT$25M／20M／15M、約 15%（規劃假設） | [FUNDRAISING_ROUNDS](../05_FINANCE/FUNDRAISING_ROUNDS.md) |
| SD-02 | 年度創始方案首次上架 15 道 | 2026-07 價格文件、募資計畫 v1、產品介紹 v1.2 | 100 道、有上限 | [EARLY_BIRD_FOUNDING_RESTAURANTS](../08_BUSINESS_MONETIZATION/EARLY_BIRD_FOUNDING_RESTAURANTS.md) |
| SD-03 | 首次上架拍攝「吃到飽」／無限量 | 2026-07 價格文件 | 100 道、有上限；不得再用此措辭 | [EARLY_BIRD_FOUNDING_RESTAURANTS](../08_BUSINESS_MONETIZATION/EARLY_BIRD_FOUNDING_RESTAURANTS.md) |
| SD-04 | 方案包含美食趣報導 | 募資計畫 v1、產品介紹 v1.2 | 已移除 | [EARLY_BIRD_FOUNDING_RESTAURANTS](../08_BUSINESS_MONETIZATION/EARLY_BIRD_FOUNDING_RESTAURANTS.md) |
| SD-05 | 多人餐桌屬 MVP／接近 MVP | root `ROADMAP.md`、Alpha 10 | `POST_MVP` | [GROUP_TABLE_INVENTORY](../10_POST_MVP/GROUP_TABLE_INVENTORY.md) |
| SD-06 | 最高權限「尚未開始」；Admin 為骨架；Restaurant 唯讀／部分完成 | v3.0.1 治理包、root `README.md`、`ENGINEER_HANDOFF.md` | Admin Authority 與 Restaurant 自助皆已完成並凍結 | [ADMIN_AUTHORITY](../03_SECURITY_AUTHORITY/ADMIN_AUTHORITY.md)、[RESTAURANT_PRODUCT](../01_PRODUCT/RESTAURANT_PRODUCT.md) |
| SD-07 | Admin IA「55 個位置、3 個 CURRENT 權限、管理與 Break-glass 未啟用」 | `docs/admin-information-architecture-ra-3-ia-p1.md` | 以可執行路由登錄表為準；平台管理 live | [ADMIN_PRODUCT](../01_PRODUCT/ADMIN_PRODUCT.md) |
| SD-08 | 22 個舊 Admin 根路由顯示 mock 資料、未受中介層保護（TD-06） | `docs/engineering-state-registers.md` TD-06 | ADMIN-E1：轉址／閘道／不可用，無 mock 資料 | [ADMIN_PRODUCT](../01_PRODUCT/ADMIN_PRODUCT.md) |
| SD-09 | 舊的「目前正式 SHA」：`9d68eab`、`8af3fb7`、`d88d100`、`500c122`；以 `31b55d3` 為目前遠端部署 | root `README.md`、治理包、`docs/DOCUMENT_STATUS_INDEX.md`、部署矩陣 | 正式出處 `44101e9`；遠端 SHA 待 GQA-6 | [REPOSITORY_STATE](../02_ENGINEERING/REPOSITORY_STATE.md)、[STABLE_DEMOS](../04_DEPLOYMENT_ENVIRONMENTS/STABLE_DEMOS.md) |
| SD-10 | 舊遷移數量（91／109／133） | root 文件、v3.0.1 包、2026-09-19 對帳 | 139（GQA-3 基準） | [REPOSITORY_STATE](../02_ENGINEERING/REPOSITORY_STATE.md) |
| SD-11 | Runtime Integration「目前階段為 2V、N4 受阻」 | `docs/tastkind-runtime-integration-roadmap.md` §3 | 2V–2Z 完成；階段名稱仍有效 | [PRODUCT_ROADMAP](../01_PRODUCT/PRODUCT_ROADMAP.md) |
| SD-12 | Step-Up broker「每次驗收新建、驗收後刪除」 | `docs/engineering-handoff.md`（Secrets 段） | broker 登入角色是**永久**執行期基礎設施 | [PRIMARY_STEPUP_BREAKGLASS](../03_SECURITY_AUTHORITY/PRIMARY_STEPUP_BREAKGLASS.md) |
| SD-13 | 小型債：Primary 精靈無自我目標警示；base Admin 看到空白人員清單 | `docs/engineering-handoff.md`、registers（ADMIN-E 段） | GQA-2 已修正 | [ADMIN_PRODUCT](../01_PRODUCT/ADMIN_PRODUCT.md) |
| SD-14 | 下一個 Admin 階段是「非權限營運功能」 | `docs/engineering-handoff.md`、ODR-007 | ADMIN-A～E 已完成；現為 GQA 序列 | [PRODUCT_ROADMAP](../01_PRODUCT/PRODUCT_ROADMAP.md) |
| SD-15 | Consumer 假 82 分、種子日記、日記頁 mock 卡片 | GQA-1 之前的 Consumer | GQA-1 已移除 | [CONSUMER_PRODUCT](../01_PRODUCT/CONSUMER_PRODUCT.md) |
| SD-16 | 「社交上限＝每日機會／付費方案」 | Alpha 10 | 曝光上限 3／10、卡片配額為政策數值，不代表帳單 | [SOCIAL_PRODUCT](../01_PRODUCT/SOCIAL_PRODUCT.md) |
| SD-17 | QR 為 MVP 流程 | 歷史文件 | 永久 QR 屬未來收藏品個體（Post-MVP） | [COLLECTIBLES_MARKETPLACE](../10_POST_MVP/COLLECTIBLES_MARKETPLACE.md) |
| SD-18 | GQA-2 後繼以「列舉後續提交身分」辨識（`3069b10` 版本） | `scripts/gqa-2-successor-manifest.mjs`（`3069b10`） | 耐久模型（`cba7d90`） | [TEST_GUARD_ACCEPTANCE](../02_ENGINEERING/TEST_GUARD_ACCEPTANCE.md) |
| SD-19 | GQA-1 後續編輯需符合 GQA-2 結案身分；釘住 truthfulness guard 位元組 | `scripts/gqa-1-successor-manifest.mjs`（`cba7d90` 以前） | 耐久模型（`44101e9`） | [TEST_GUARD_ACCEPTANCE](../02_ENGINEERING/TEST_GUARD_ACCEPTANCE.md) |
| SD-20 | 治理層「不記錄創辦人私人的專利資料」（2026-09-19） | `governance/README.md`、`governance/RECONCILIATION_2026-09-19.md` §7 | GQA-4 brief 指示在交接中記錄高層級的專利歸屬與成本狀態；個人財務結構細節仍不記錄 | [IP_OWNERSHIP](../07_IP_PATENT/IP_OWNERSHIP.md) |
| SD-21 | 全面性的舊 Runtime 後端整合順序（「Recommended Backend Integration Order」等 mock 時代段落） | `docs/engineering-handoff.md` 前段 | 已由 live runtime 取代（該段已標 `HISTORICAL`） | [ARCHITECTURE](../02_ENGINEERING/ARCHITECTURE.md) |
