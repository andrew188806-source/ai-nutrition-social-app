# PC-2 Activation Preparation — Retention Contract and Minimum Engineering Scope

初次 review：2026-10-02；Owner 決策同步及 R0-A 本機實作：2026-10-03（Asia/Taipei）。目前狀態：**READY_FOR_R0_A_LOCAL_ACCEPTANCE**（須完成本輪單一本機 freeze 及 post-commit gates；結果與 commit identity 由最終報告提供）；獨立 R0-A acceptance 尚待完成，非法律批准或 runtime activation authorization。

§1–10 保留先前文件 review／scope freeze 的歷史 snapshot；其中「本輪」、PROPOSED／PLANNED／未執行指該文件同步階段。最新 R0-A 授權、實際六檔純模組／測試與本機驗證在§11，不回寫歷史時點為已完成。本次完整 commit inventory 為六個新增 source/test paths 加本文件，恰七檔。

**PC-2 local acceptance 維持通過；法律 DRAFT / NOT ACTIVE；activation pending。OD-15、TD-10/AU19、P-7 維持 OPEN。** 本輪沒有重新開啟已接受的 validation remediation。R0-A 純政策本機實作見§11；R0-B／R0-C、R1–R5、產品接線與遠端工程均未執行。

## 1. Review identity、範圍與證據用語

| 項目 | 記錄 |
|---|---|
| 已 pushed 文件 baseline | `b70884a013ac67486242fe5d11b9bfad1360032a` — `Document PC-2 activation owner decisions and readiness`。 |
| 2026-10-02 初次 review 開始讀取 refs | branch `main`；HEAD／本機 origin/main 均為 b70884a；ahead/behind `0/0`。狀態核對是分次讀取，期間另一聊天室完成 commit，不冒稱 atomic snapshot。 |
| 2026-10-02 初次 review 看到的既有工作 | 兩個 untracked：`scripts/demo-meal-buddy-pool-top-up.mjs`、`scripts/demo-meal-buddy-pool-top-up-guard.mjs`；當時 tracked／staged diff 無內容。它們不是本輪 scope。 |
| 2026-10-02 review 期間的外部 commit | `f5b9ae0a982b7a2401c7d48e0c7b9387f4955bd7` — `Automate Development Meal Buddy demo pool maintenance`。delta 恰為上述兩個新增 scripts；b70884a 仍為 ancestor。未由本輪 stage／commit／執行／修改。 |
| 本文件綁定的 source HEAD | `f5b9ae0a982b7a2401c7d48e0c7b9387f4955bd7`；本機 origin/main 仍 b70884a，ahead/behind `1/0`。原有 46 個及本輪新增 8 個，合計 54 個相關 source 的 exact raw SHA-256／Git blob identities 見§10。相關 source 在外部 commit 前後未改變，故結論可沿用。 |
| 在該 HEAD 的 inventory | 3,333 tracked paths；142 migrations；staged empty；在建立 04 前 untracked empty。未 fetch，不據此宣稱即時遠端狀態。 |
| Applicable instructions | repository 及其祖先、docs、planning、target directory 未找到 applicable AGENTS.md。 |
| 2026-10-03 本輪唯一修改 | 既有 untracked `docs/planning/pc2-activation-preparation/04_RETENTION_CONTRACT_AND_ENGINEERING_SCOPE.md`；不新增第二份文件。修改前 raw SHA-256 `73e304977c9b2c7965bb06140ae76ef5de57d15e88144b38a2e475fc6e8e6aa7`；完整初次 review、historical evidence、S01–S46 ledger 保留。 |
| 2026-10-03 起點 | main；HEAD f5b9ae0；本機 origin/main b70884a；ahead/behind 1/0；tracked diff／staged empty；untracked 只有 04。兩個 Demo Pool scripts 屬另一聊天室 f5b9ae0，bytes/modes/identity 保持。 |
| 本輪決策來源 | Owner 直接指令 **RETENTION — OWNER DECISIONS SYNC AND R0 SCOPE FREEZE** §3 A–F（2026-10-03），不是先前 committed approval 或已實作證據。 |

S01–S54 是§10 的 source identities。完整讀取 01–04，原三文件 raw hashes 未變；保留其當時 findings。本輪 04 取代相應 pending 選項，不回寫 01–03 或歷史驗收。新增 record timestamp/write provenance 核對，沿用原資料流證據；沿既有 meal-log/readRange、每日 persistence、favorites、upload/retake、analysis persistence、consent/entitlement、rights UI 與直接相關歷史文件追蹤。本次 targeted search 沒有找到相應月度 rollup／retention purge executor；這是限定 source 範圍的 **IMPLEMENTATION_NOT_PROVEN**，不是遠端資源不存在的結論。

| Label | 本文件的意義 |
|---|---|
| OWNER_CONFIRMED | 先前 Owner 文件承接的方向，或本輪 Owner 直接指令明確的新規則；逐項標來源與日期，不表示法律批准、部署或 executor 已驗收。 |
| HISTORICAL_PROPOSAL | 歷史草案／設計方向；未取得當前有效批准，不可作 runtime default。 |
| IMPLEMENTED_AND_EVIDENCED | 本機 source 存在所述行為／schema，已綁定 exact bytes；此 review 不增加 fresh product 或 Development PASS。 |
| IMPLEMENTATION_NOT_PROVEN | 本次資料流未證明所述完整能力；不以 UI 文案、欄位存在或 best-effort 操作補足。 |
| OWNER_DECISION_PENDING | 已定方向之外，仍需 Owner 決定可執行語意。 |
| QUALIFIED_REVIEW_PENDING | 保存／刪除義務、可識別性、處理者契約、留證與例外需專業審閱；本文件不作法律結論。 |

## 2. 決策與 source evidence

| ID／分類 | 保存契約或能力 | 版本、來源及限制 |
|---|---|---|
| RC-01 OWNER_CONFIRMED | Free 詳細 14×24h／Paid180×24h，UTC 原始紀錄瞬間 T0 起算；旅行不改期限。建立取得保存權益，現在 tier 決定顯示；降級不縮既得期限；Free 尚未到期升級延至 T0＋180 天，不從升級重算。 | S01／S33／S43 是歷史 14/180 方向；**本輪 Owner A–C（2026-10-03）**補足時間／保存與顯示／升級契約，非 source 已實作。T0 實際 authority binding 見§2.2；不另造永久每日 detail dataset。 |
| RC-02 OWNER_CONFIRMED | Free 六個月份含當月；當月可更新。Paid 取得／升級時仍在免費六個月保存範圍者永久保存，降級不撤永久 grant，只隱藏 window 外；復訂可看保留月份。固定帳號報表 timezone，manualchange 不重排／歸月歷史。 | S01／S33 是歷史方向；**本輪 Owner D–E（2026-10-03）**補足 acquisition/display/month binding。月度內容／評分算法、生成及永久保存 executor 仍 pending；永久受刪帳／適用刪除義務。 |
| RC-03 OWNER_CONFIRMED | 收藏餐點私人永久保存方向；非收藏詳細到期收合為月度摘要。 | S01 §4 C；S33 lines 1111、1321。私人收藏不授權公開、餐廳商用或訓練；永久不免除刪帳／適用刪除義務，亦不保證所有照片原檔永久。 |
| RC-04 OWNER_DECISION_PENDING | 歷史 40/200 與 refinedLogic50/150 矛盾保留，本輪不決定 canonical quota、不改產品值。 | S01 §4 C 歷史承接及 S33 兩組文案均保留；本輪 Owner F 明確保持 quota 待裁決。計數單位／取消／降級／server quota 仍 pending，不將歷史值升格為本輪已批准 quota。 |
| RC-05 HISTORICAL_PROPOSAL／OWNER_DECISION_PENDING | Photo Lifecycle／AI Data Governance 的 2026-08-04 方向分 diary、staging、training、cold storage、delete、backup。 | 日期與方向來源是 S01 的 Owner 歷史承接；沒有重新取得當時原始批准 receipt。24 小時 staging／30 天刪除／90 天 backup 仍 proposal，不是本輪批准期限。S42／S45／S46 的 Alpha 文件只提出政策／job／restore backlog，不能補出數值或 operational PASS。 |
| RC-06 IMPLEMENTED_AND_EVIDENCED | 詳細 meals：verified session owner filter、deleted_at=null、meal_date query bounds；meal_records／items 有 occurred_at、meal_date／timezone 及 nutrition／portion snapshots。 | S04 `dateWindow`／previousWeek；S05 `resolveMealReadRange` max 31 days／100 rows；S06 lines 34–61；S13。單次 query 範圍不限制總歷史年齡，不含 paid retention policy。 |
| RC-07 IMPLEMENTED_AND_EVIDENCED／IMPLEMENTATION_NOT_PROVEN | 每日計算與原子 persistence 已有；月度報告、6 個月／永久保存及到期收合尚未證明。 | S07–S10、S14、S16、S22。S07 lines 37–51 單日取最多 100 records，不能用作「整日完整」certificate；S08 optional corrections／consumptionAdjustments 另路徑會回 rule unavailable，不能推論全部 correction finalization 不支援。需追蹤當前 item snapshots，再驗完整重算。 |
| RC-08 IMPLEMENTED_AND_EVIDENCED／IMPLEMENTATION_NOT_PROVEN | favorites 已有 canonical restaurant／menu item add、remove、ownership、locking、idempotent writes；私人完整餐點快照／tier quota／照片保護尚未證明。 | S11、S12、S15；remove 以 removed_at 表達，非所有副本物理 purge。不得把 catalogue bookmark 當 meal favorite exemption；不得把餐廳來源資料一同到期刪除。 |
| RC-09 IMPLEMENTED_AND_EVIDENCED／IMPLEMENTATION_NOT_PROVEN | private photo bucket、actor/request/original 路徑、upload duplicate recovery、owner delete 與 retake best-effort 存在；可靠 lifecycle executor 尚未證明。 | S19–S26、S30、S41。S19 有 nullable staging_expires_at，S30 claim/completion 沒寫該值；欄位非 TTL scheduler。S41 finalization 連結 analysis→meal_record，不等於轉為永久 diary asset。purpose enum 明確不是排他 lifecycle state。 |
| RC-10 IMPLEMENTED_AND_EVIDENCED／QUALIFIED_REVIEW_PENDING | AI adapter 發送 image input 並指定 store:false；不證明處理者整體 retention、供應商禁訓練或 ZDR 契約。 | S27–S30；S29 line 92。只讀 local source，未讀 secrets／遠端 settings；不得從請求欄位導出 processor logs、cache、subprocessor 或備份的期限。Owner 已定第三方僅受託處理、不自用訓練，契約／實際設定仍待核對（S01 B）。 |
| RC-11 IMPLEMENTED_AND_EVIDENCED／IMPLEMENTATION_NOT_PROVEN | Canonical training grant／withdraw、core denial／Social pause 是已接受 PC-2 能力；dataset、training job 停止、模型影響及全副本刪除尚未證明。 | S21 `withdraw_authenticated_ai_training_consent`、S22；S26 拒絕 client training flags。withdraw 不等於刪除 diary；diary 收藏不等於 training grant。S32 rights UI 不是提交／刪帳 executor；Auth FK cascade 不等於 Storage／processor／backup 刪除。 |
| RC-12 IMPLEMENTED_AND_EVIDENCED／IMPLEMENTATION_NOT_PROVEN | subscription_entitlements 與 verified actor Social-only resolver 存在；建立保存 grant／升級歷史、月永久 acquisition 及 retention 顯示接線未證明。 | S17／S31／S40 及 S47–S54、S22 current RPC。Owner B–D 的權益時點已定；adapter source／validity 與 provenance 是技術 contract pending，不改 Social authority、不從現在 Paid 推歷史。 |

### 2.1 本輪新 Owner 決策（2026-10-03；全部 OWNER_CONFIRMED）

本節保存本輪新規則，不冒充 IMPLEMENTED_AND_EVIDENCED，不回寫初次 review 或法律草案；具體字段/API/表/版本名是 PROPOSED。

| Owner 項 | 確認規則及不可推導事項 |
|---|---|
| A：UTC／24h | 原始紀錄瞬間 T0 起算，Free14 天／Paid180 天，每天連續 24h，內部 UTC；旅行/手機時區不改期限。不是 calendar midnight，也不是 updated_at。T0 到實際 source 事件的 mapping 未證明，不能任選 caller timestamp。 |
| B：保存≠顯示 | 建立時取得保存資格；Paid 建立保留滿 T0＋180 天。降級 Free 只顯示最近 14 天；較早但仍未到既得期限的 detail 保留但隱藏。降級不縮期限，保存期內復訂 Paid 可重顯仍保留的 detail。失去顯示資格不授權刪除。 |
| C：Free 升級 | 有可信升級事件時，尚未到期 Free detail 延至 T0＋180 天，不是 upgradeAt＋180 天。重複升級不重置 anchor；不復原已收合／刪除 detail。缺 timestamp/grant/event 證明不靠現在 Paid 補歷史。 |
| D：月回顧 | Free 顯示含當月最近六月份：十月→五月至十月，當月可持續更新。Paid 期間取得回顧永久保存；降級不撤永久 grant，仅隱藏六月份外歷史；復訂重顯保留月份。升級把仍在免費六個月保存範圍的回顧轉永久；不憑空生成不存在／已清除回顧。 |
| E：固定報表時區 | 固定帳號 report timezone；不自動隨旅行/手機改變。日後更改 report timezone，歷史月份保留原 identity/歸屬/排序，不重新歸月。UTC 詳細期限與 calendar month 歸屬不同；需要 historical month/zone/version binding。 |
| F：保留邊界 | 私人收藏永久方向保留，仍受刪帳／適用刪除義務。照片、training copies、logs、cache、backup/restore 期限未核定；不採 24h/30d/90d draft。40/200 vs 50/150 quota 仍 pending；不新增訓練用途、不批准法律文件。 |

### 2.2 Source 核對：timestamp、權益 provenance 與 month binding

| 項目 | IMPLEMENTED_AND_EVIDENCED source 事實 | IMPLEMENTATION_NOT_PROVEN／技術邊界 |
|---|---|---|
| 並非只有日期 | S13 同時有 occurred_at timestamptz、meal_date date、timezone 及 created_at/updated_at timestamptz；S49 select、S50 mapper、S54 types 分開保留三 timestamp。 | 尚未證明有 immutable、authority-bound retention T0；日期不能補成 midnight instant。 |
| 用餐時間與 server 建立 | S48 lines71–79 把 input.occurredAt 傳為 p_occurred_at；S52 是 client 格式/餐日匹配 validation，非 server clock。S22 lines685–705 的 create INSERT 不列 created_at，S13 default now()產生該 DB row 建立时间。 | occurred_at 是 caller meal/record timing 資料，不能無條件當可信 T0。created_at**可能**可綁首次 server 接受 record，但本輪不批准二者等義；import、延後登錄、planned conversion、analysis→meal finalization 的 original event 及 legacy backfill 須 R0-B 接線前裁定。 |
| 編輯與 updated_at | S13/S50 將 updated_at 與 created_at 分開；S22 finalization/correction 使用更新欄位，沒有保存 renewal grant。 | Owner 已確認編輯不續期。immutableT0/monotonicgrant storage enforcement 未證明，不能用 updated_at／重分析／登入／復訂時間替换 anchor。 |
| membership 來源 | S17 有 plan_code、entitlement_source、status、valid_from/valid_until、source_reference；S31 verified actor 只選 plan/status/validity。S40 僅限 Social，premium active/grace_period；now>valid_until 才過期。 | canonical rows 是候選 fact source，不等於歷史 retention grant；billing 與有效 upgrade 事件未證明。retention adapter 信任/validity 契約須另 review，不改 Social-only resolver、不用 UI toggle/client tier/JWT user_metadata。 |
| 建立／升級保存歷史 | 查 S13、S17、S22 current create authority、meal read/write chain 及 142migrations，targeted keywords 未找到 retention_grant/retained_until/permanent_retention 等相應 metadata。 | 現在的 membership 或 validity rows 不能單獨證明此 record 建立時 180 天或曾於未到期時升級。缺 provenance 回 unknown，不猜 14 天可刪／180 天／永久已取得。 |
| report timezone/月 binding | S17 consumer_preferences.timezone、S53 consumer_profiles.timezone 是通用設定；S13 是每餐 timezone；S14 daily summary 有 local_date/timezone/version。 | 不足以證明 fixed report zone version＋immutable monthly identity；未找到 report_timezone/report_month binding。舊 report 不能重新按 current profile timezone 歸月。 |
| monthly 生成／更新 | S07–S10/S14/S16/S22 是每日計算/atomic persistence；S33 有 monthly 文案。 | relevant source 未證明 monthly materialization/update/score、六月份保存或永久 grant。R0-A 只評估已解讀 facts；R1 獨立生成，不查遠端、不宣稱不存在遠端資源。 |

**Schema 結論**：純 R0-A 不需 migration。真正履行 B–E 需要 authoritative T0/provenance、acquired retention deadline／upgrade 歷史、monthly 永久 grant、固定 report timezone 與 historical month/version 持久化；目前 source 未證明 schema 已足夠。新增表 vs additive fields、交易/ACL/event 順序/回填是 PROPOSED，未由 Owner 核准具體 implementation。

## 3. 歷史／目前矛盾與裁決事項

| Conflict | 精確差異及影響 | 本輪處理／裁決者 |
|---|---|---|
| CT-01 文案 quota／保存差異 | S33 主日記 14／180、40／200；refinedLogic lines 2094、2120、2125–2126：詳細 1 個月、未收藏超過 50 筆先封存／摘要、收藏 50／150。S01、S38 targeted canonical review 未找到有效後續改額度紀錄。 | 保留兩組 bytes；後者標 HISTORICAL_PROPOSAL，不改成 Owner 批准。Owner／Planner 須確認顯示契約與計數單位；既有承接的 40／200 不重新選數字。 |
| CT-02 收合與升級恢復（歷史差異保留，新契約已收斂） | S33 lines1172/1315 曾寫「14 天前已收合」且升級可看 180 天；初次 review 因摘要不能重建已刪 detail 列 pending。 | 本輪 Owner B/C 已決定：Paid 建立／有效未到期升級取得 180 天，降級只隱藏不縮期限，復訂只重顯仍保留 detail；不復原已收合／刪除。歷史文案與 source 差異保留，不宣布工程已完成，storage/executor 仍另 scope。 |
| CT-03 收藏概念差異 | S43 歷史 PRD 叫 favorite_meals；S15 實際是 favorite_restaurants／favorite_menu_items；目前 source 無已保存餐點 snapshot 的同一身份。 | Owner 決定收藏單位（餐點／卡片、包含何種資料）；工程新 authority 另授權。不得把菜單或餐廳 favorite 就視為所有相關日記免過期。 |
| CT-04 照片批准 vs Dev 證據 | S35 C-028／C-029 要求先批准 retention；S36 TD-10、S39 AU19／P-7 保留 prerequisite/governance 缺口；S01 承接已有 Development acceptance。 | 兩種 evidence 並存，不用後來 Dev acceptance 倒填 approval。OD-15、TD-10/AU19、P-7 OPEN；有權 Owner／qualified reviewer 才能 reconciliation。 |
| CT-05 舊 roadmap ordering vs 後來 commits 的歷史差異 | 舊 roadmap 與後續 commits 的不同仍保留。**當前 S39 D-05／§5 S02 已明記 AU18 resolved by sequencing decision，S38 Sequencing decision（brief §9）記載後續順序。** 舊文件未改，不能把它當目前施工順序，亦不能把目前 register 狀態誤寫成仍 unresolved。 | 本輪只記錄歷史與後續有權決策的不同版本，不自行重新裁決或重做 reconciliation。Roadmap 的治理記錄不批准 retention；照片 AU19／TD-10 仍 OPEN，不隨 AU18 狀態關閉。 |
| CT-06 訓練方向與法律草案 | S01 §4 D：位置／健康／疾病可評估的前提是不能直接或間接識別；現存 training draft 有排除文字。姓名刪除不足以消除位置／時間／疾病組合風險。 | Owner 規劃方向與 DRAFT 原 bytes 分開；QUALIFIED_REVIEW_PENDING。此文件不改法律、不開 training admission、不把 grant 當擴類別批准。 |
| CT-07 deletion／audit／restore | S18 owner FK ON DELETE CASCADE，S35 C-043 的匿名 aggregate／留證是 review proposal；DB cascade 並不消除 private Storage refs、訓練副本或 backup。 | table/object/job/processor-by-purpose disposition 與合適 consent/audit 留證 pending；不批准匿名 aggregate 永久保留、不聲稱刪帳已閉環。 |

## 4. 保存矩陣

日記 UTC/24h、保存/顯示分離、升級延長、月度含當月/永久取得和固定 report timezone 已由本輪 Owner 確認；其餘逐列 pending。timestamp 到 T0 的權威 mapping 仍需 source 證明，不給其他用途補猜期限。永久指合法目的仍成立時的保存方向；刪帳、適用刪除、撤回特定用途及留證例外要逐用途處理，不是無條件永存。矩陣不授權任何 purge。

| 資料種類／用途 | 權益影響／起算事件 | 保留、收合、刪除 | 撤回 training／刪帳關係 | 實際 source／工程缺口與分類 |
|---|---|---|---|---|
| 詳細飲食紀錄（同一 diary dataset） | UTC 可信原始 T0＋14/180×24h；建立／未到期升級取得保存 grant，现在 tier 決定顯示 | Paid180 天降級不縮，超 14 天保留但隱藏；有效 Free 升級延至 T0＋180，不從升級重算；復訂不復原 collapsed/deleted。到期仍需先完整摘要，本輪無 purge | training 撤回≠刪 diary；刪帳／適用義務按用途處理；收藏另 contract | Owner A–C 本輪確認；S13/S22/S47–S52 有 timestamp/create；T0 權威 binding、grant persistence、display wiring、R3 collapse 未實作。 |
| 每日彙總（營養 totals／counts） | 已有 local_date／timezone／version／source_cutoff；沒有獨立已批准永久每日權益 | 可為讀取／重算及月摘要 input；自己的 TTL、是否收合後保留／最小欄位 pending；不得永久留所有逐日詳細繞過 RC-01 | owner/date linked totals 仍可識別；withdraw 與核心用途分開，刪帳須處置 | S07–S10、S14、S16；atomic persistence implemented；完備性、daily TTL／月生成 NOT_PROVEN。 |
| 月度摘要／評分／報告 | fixed account report timezone＋historical month/version；Free 六月份含當月（十月→五月–十月），UTC detail 期限不同 | 當月更新；Paid 取得／升級時 free 範圍內現存 report 轉永久，降級不撤 grant 但隱藏範圍外，復訂看 retainedhistory；Free 超 window executor 待後包 | user/month 可識別；永久仍受刪帳／適用刪除，不以 training 同意授保存 grant | Owner D/E 已確認；S17/S53 generic timezone 非 report binding；R1 生成、grant、display NOT_PROVEN，營養平均非正式 grade。 |
| 收藏餐點及引用資料（私人 meal snapshot） | 永久方向保留；40/200 vs 50/150 quota、計數單位／取消／降級 pending | snapshot 與引用保護需批准，不推所有原圖永久、不當 catalogue favorite 為 diary 免期 | 不授權訓練／公開／商用；刪帳／適用刪除保留，不刪 public restaurant 來源 | S11/S12/S15 仍是 bookmarks；R2 snapshot/quota 未實作，非 R0-A 範圍。 |
| 照片原檔（分析／diary） | upload timestamp、request identity 存在；入 diary 時點／各目的期限 pending；不由 Paid／收藏永久直接推定 | staging→diary 保護引用／原檔 vs reduced representation／cold archive／purge pending；獨立目的可同時成立 | training 撤回僅終止相應用途，core diary 合法保存另判；刪帳／處理者副本／留證需 manifest | S19、S20、S23–S26、S30、S41；private owner Storage implemented；purpose enum 非 lifecycle；R4/R5。 |
| 縮圖／衍生圖片（顯示／分享） | 生成事件、與原檔關聯、格式／meta、TTL pending | parent lineage／引用數、replacement／expiry／cache purge 要一併治理；不得擅自採更長 TTL | 私人 thumbnail 可識別；原檔刪除後副本是否保留須批准；撤回／刪帳 disposition 分用途 | S45 backlog；本次 upload/analysis 流未證明 thumbnail job／lineage／purge；NOT_PROVEN。 |
| 上傳 staging／暫存（辨識前後） | uploadedAt 已有；staging_expires_at nullable；成功、失敗／重試、入 diary 起算 pending | retake best-effort 不保證 delete；先排除已引用／processing／retries 才 orphan cleanup；24 小時只是 HISTORICAL_PROPOSAL | withdraw 後 core Storage gate 可能拒絕 client delete，不能依賴 client 作 rights purge；刪帳需 canonical rights lane | S19–S25、S30；current claim 未寫 expiry；executor NOT_PROVEN；R4/R5。 |
| AI 服務處理資料（傳輸 image、辨識結果、供應商 processing/logs） | request／response 事件；第三方保存依契約／settings pending，不指定天數 | store:false 有 source evidence；supplier own-model training 禁止是 Owner 方向；DPA、subprocessors、processing copies deletion verification pending | 處理目的／供應商義務與 training grant 分開；withdraw／刪帳不能只刪本機 analysis row | S27–S30、S01 B；local request minimization implemented；外部 lifecycle QUALIFIED_REVIEW_PENDING／NOT_PROVEN。 |
| 訓練用途副本／dataset snapshots／模型關聯 | 新 admission 時的有效用途版本／grant、withdraw 事件須可驗；期限與撤回效力 pending | eligibility、de-identification、dataset/job lineage、撤回 suppression／removal、既有 model 處置需決策；不把即時 consent boolean 永久烙印 | training withdrawal 必須可終止未來使用且處理既有副本；對完成訓練的處置不得承諾未證明能力；diary 不自動消失 | S21、S26；consent 已接受，但 dataset／job／model remediation NOT_PROVEN；R5、qualified review。 |
| Logs（app/AI/audit）副本 | log event；purpose／欄位／留證起算 pending | 最小欄位、敏感 payload 排除、TTL／legal hold／刪除權限 pending；無任意 30/90 天 | audit 法定留證 vs personal-data deletion 必須逐目的處理，不推定 FK cascade 足夠 | S34、S35、S42；只在所查 provider path 有避免 image dataUrl logs 的 source 約束；全 logs inventory/TTL NOT_PROVEN。 |
| Cache／裝置暫存／CDN 衍生副本 | cache creation／invalidate event；TTL pending，非 UI reset | server/client／object ref／signed URL 已發出後的 invalidate／reload／expiry 明確規劃；不將 unmount 當 purge | withdrawn/deleted 後禁止重新供應或再導出副本；撤回哪種核心 access 另按用途 | S23–S25、S34；全 cache 清理與 offline copy inventory NOT_PROVEN；R4/R5。 |
| Backup／restore／cold 副本 | snapshot、restore／cold transition event；期限 pending（90 天未批准） | 配置盤點、到期、delete suppression ledger 與 restore-before-serving gate；cold != deleted | 不能從 backup restore 復活已撤回 training 副本或已刪 owner；合法留證範圍／隔離與例外待審 | S34、S35、S46；只有歷史 backlog，未查遠端 backup；executor／rehearsal NOT_PROVEN／QUALIFIED_REVIEW_PENDING。 |

## 5. Lifecycle 邊界：已回答與真正待決項目

原 Q1–Q4 保留議題 identity，但本輪 Owner 規則已取代原選項；不再要求 Owner 重答。

| ID／狀態 | 最新契約及技術邊界 | Gate |
|---|---|---|
| Q1 OWNER_CONFIRMED | UTC T0＋N×24h，不按 meal_date 午夜／裝置 zone。驗收提案使用半開 interval [T0,E)，now=E 是到期，不是已刪除。T0 事件／DB 欄位 mapping 尚未證明。 | R0-A 純 factcontract 可先驗；來源 mapping 與 immutable 持久化是 R0-B，不再問 UTC／天數。 |
| Q2 OWNER_CONFIRMED | 六月份含當月，十月→五月–十月；當月可更新。Paid 取得／有效 window 內升級轉永久，降級不撤 grant；payload/grade 與缺資料規則仍 Q6。 | R0-A calendar contract，R1 生成与保存另 scope。 |
| Q3 OWNER_CONFIRMED | 建立取得保存權益、現在 tier 決定顯示，是兩軸契約不是二擇一。Paid detail180／monthly 永久 grant 不因降級減少。可信 membership source/event 順序與 factfreshness 仍技術 pending。 | R0-A 分軸型別/puretransition；R0-B/C 來源/ACL/交易接線，不從 currenttier 補歷史。 |
| Q4 OWNER_CONFIRMED | 降級後仍保存的 Paid detail 復訂可重顯；尚未到期 Free 升級延至 T0＋180。沒有已收合／刪除復原授權；hidden≠expired/deleted。 | R0-B 保存 grant，R0-C 顯示，R3 另做 storage/executor；不重問是否重建已刪。 |
| Q5 OWNER_DECISION_PENDING | 私人收藏 snapshot／照片欄位、取消/到期競態/grace、降級超 quota、40/200 vs50/150 仍待裁決；不得自行把詳細 Free14daywindow 套成獨立收藏 surface 規則。 | R2/R3；未知 favorite 不當 false 可刪，非 R0-A blocker。 |
| Q6 OWNER_DECISION_PENDING／QUALIFIED_REVIEW_PENDING | Monthly totals/averages vsgrade 公式、partial/final、missingday、latecorrections、最小可識別内容；固定 reportzone 初始化權威、manualchange effectiveboundary、mixedversion 同月 identity 碰撞與 legacy binding 未定。 | R1／R0-B；R0-A 以已解讀 immutablemonthkey 與 activeReportMonth 作 input，缺 binding 回 unknown，不生成 report。 |
| Q7 OWNER_DECISION_PENDING／QUALIFIED_REVIEW_PENDING | 各照片 original/thumbnail/staging/diary/training/cold 期限、交接/orphan/retake/引用保護 pending；24h/30d/90d 不採。 | R4，非第一包 blocker。 |
| Q8 OWNER_DECISION_PENDING／QUALIFIED_REVIEW_PENDING | trainingwithdraw 的 futureadmission／副本/jobs/model 處置、core 保存与 rights 請求／刪帳／匿名／留證／渠道/時限；本輪不增 training 用途。 | R5；不重做 PC-2withdraw，不能靠縮 grant 假裝處理撤回。 |
| Q9 OWNER_DECISION_PENDING／QUALIFIED_REVIEW_PENDING | backup/restore suppression、log/cache TTL、legalhold；owner/月摘要可識別，restore 不得復活 deleted/withdrawn 副本。 | R5；不默認 90 天，不在 R0 設 jobs。 |



### 必須保留的 execution invariants（後續設計／驗收要求，非現有已證明能力）

1. **Summary-before-collapse**：不能等月底才產生第一份摘要，因 Free 14 天可能月中就到期。先按月 checkpoint／貢獻 ledger 證明完整及版本，再使 detail 失去可恢復資訊；每日 100-row input 不足以證明完備，必須 pagination／完整 server read 或可驗 completeness。不能累加每日 total 後重跑再加一次。
2. **再跑與失敗恢復**：同 owner／month／source watermark／policy version 的操作要 idempotent；允許晚到 correction 重算但不得 double count；summary failure 不刪 detail，expiry failure 保留可重試 record，不假報 purge complete。跨 DB／Storage 不可假装單一 transaction，需可稽核 outbox／receipt 或批准等效設計。
3. **競態**：expiry、favorite／unfavorite、meal/correction write、membership transition、withdraw／delete 必須在權威交易重新驗 owner/state/version。降級/顯示 window 縮減不撤保存 grant；升級只延長有效 grant 且 deadline 仍錨定 T0。相同 snapshot 的候選計畫不是最終 permission；不能沿用過時已收藏=false 或已授權 training=true。刪帳 tombstone／suppression 需攔重建及 restore，範圍與留證待批准。
4. **多用途與引用**：diary／training／commercial 是 independent purposes；不能單一狀態覆蓋另一目的。private meal favorite、catalogue favorite、shared catalogue 原資料分開；清 staging 不得刪 finalized meal 仍用的 photo，刪 private meal 也不授權刪 restaurant catalogue。
5. **權利流程可達**：S22 的 core gate 對 meal-analysis Storage 有 restrictive policy；withdraw 後以同 user token 做 best-effort remove 可能被拒，不能以此當刪除義務閉環，也不能開 service-role 全域 bypass。後續 rights authority 必須經獨立 scope／ACL 審閱，在 core denial 下仍可提出與完成適當權利請求。
6. **復原不等於匿名**：不可逆 rollup 無法重建原 bytes；可識別月摘要仍需 access/deletion controls。backup restore 不得重新供應刪除內容或重新 admission 已撤回資料。

## 6. 可獨立施工／驗收的最小工程包（PROPOSED，未執行）

以下精確 paths 都是 **施工前待確認 candidate inventory**，不是本輪新增授權；新 migration 必須在該包授權時給出具體檔名，不捏造 timestamp。不得原地修改已 frozen migrations／PC-2 guards／records 來擴能力。每包另經 Planner exact scope、Owner/qualified gates 與獨立 acceptance；不合併成一次全平台工程。

### R0-A — UTC 保存／顯示分離的純政策契約（建議第一包，PROPOSED）

第一包候選 inventory**恰為六個新增 paths**，不包含 migration、productwiring 或 executors。以下檔名／exports／metadata 字段均是技術提案，Owner A–F 批准的是產品規則。本輪不新增這六檔。

| Exact candidate path | 每檔用途 |
|---|---|
| `packages/shared/src/domain/consumer-retention/types.ts` | 已解讀 T0、actor/resource/source/versionbinding、acquiredgrant、currententitlement、monthlyidentity/zone/version、physicalstate、structuredunknown 與分軸 retention/display 輸出型別；不創建資料來源。 |
| `packages/shared/src/domain/consumer-retention/policy.ts` | 版本化 Owner A–F：24h、14/180、六月份含當月、grant 不縮減及合法 upgrade/monthlypromotion 規則；不放 photoTTL、quota 或 legaldefaults。 |
| `packages/shared/src/domain/consumer-retention/evaluate.ts` | 純 detail/monthlyevaluation 與 granttransition**proposal**；沒有 DB/Storage/network/filesystemwrite、Date.now、scheduler/deletecallback 或 authbypass。 |
| `packages/shared/src/domain/consumer-retention/index.ts` | 只 export 上述 contract；不修改現有 app imports／Socialresolver／PC-2authority。 |
| `scripts/consumer-retention-policy-smoke.mjs` | 使用 existing 本地 TSloader 與合成 facts 執行 actualcandidateexports，按§6.1 獨立 expectedvalues／unknownreasons 驗收，不只查 source 字串。 |
| `scripts/consumer-retention-policy-mutations.mjs` | disposablecopy 負向 controls 須拒絕錯誤期限、重置 anchor、降級縮 grant、monthoff-by-one、復活已刪、unknownfallback 與偷接 I/O；完整 individualrawoutputs 立即保存。 |

**R0-A 不需要 schema/migration**，不改 package/dependencies/lockfiles、既有 guards/harness 或 142migrations，不新增 server endpoint。正式施工前確認 existingruntime/TSloader 可直接載入六檔；若需要第七 path 或 dependency，先另提 scope，不能擴第一包。驗收 scripts 是未來提案，本輪不得建立。

#### Inputs（名稱和 shape 為 PROPOSED）

- Policy/Owner-decision 版本；可信`evaluationInstant`，帶 explicitoffset 並可正規化 UTC，函式不得讀裝置 clock/timezone 或 Date.now。
- 已解讀`actorBinding/resourceBinding/sourceIdentity/sourceRevision/factAsOf/provenanceState`。純函式能驗結構／身份一致性／時間與版本，**type brand、hash 或 verified=true 本身不證明 authority**。未來 adapter 須從已驗 actor、canonicalDB/事件生成 facts，不把 HTTP body 直接包裝作 trusted；來源認證不在 R0-A 假完成。
- `originalRecordedAt=T0`及 immutable 事件來源。`occurredAt/createdAt/updatedAt/mealDate`保持不同 source 欄位；缺 T0 不得自動擇一或補 midnight。無 offset／無效／未來 T0／identity 矛盾→unknown/invalid。
- `acquiredRetentionGrant`：detail 建立时 14/180 資格、原 anchor、deadline、當時有效 tier/source、policy/event 版本與可信後續 upgradeevents；monthly 為 free-window 或已取得 permanentgrant 及證據。缺歷史 grant 不能由現在 Paid 推造。
- Pure create proposal另需`eventKind=create`、可信`acquisitionEventId/acquiredAt/entitlementAtAcquisition/sourceRevision`與新resource identity；此event沒有舊grant時可計算T0＋14/180或月度永久的**待持久化提案**，不得把legacy缺歷史當新create。`eventKind=upgrade`必須有先前有效grant与可信upgrade事件；downgrade不撤既得grant。create時的tier與evaluation時的currenttier分開，不用currenttier冒充entitlementAtAcquisition。
- `currentEffectiveEntitlement`：serververified 目前 free/paid/unknown、validity/版本。Social-only 來源必須另 adaptercontract；sourcefailure 不 fallbackfree；UItoggle、clienttier、user-editableJWTclaims 不是 authority。
- `materialState`：present/collapsed/deleted/unknown、合法保護/referencefacts。已收合/刪除不復活；未知 favorite 不當 false，私人收藏的 snapshot／顯示／quota 未決部分回 pending，不自決獨立收藏 surface 規則。
- Monthly 既有`reportIdentity/monthKey(YYYY-MM)/reportTimezoneSnapshot/reportTimezoneVersion/monthBindingVersion`、acquisition/permanentevents，以及可信的固定帳號 reporttimezone/version 與`activeReportMonth`。Currentzonechange 不能重寫舊 monthkey／排序／歸屬；混合版本碰撞、缺 binding→unknown，不自行合併歷史。
- `coreEligibility`與 rights/deletion 狀態是已接受 PC-2authority 的 allow/deny/unknownfacts，不重算或替換 consentbundle/traininggrant。Coredeny 可擋顯示/寫入，但不借此縮既得 180/permanentgrant；trainingwithdraw 與 core 保存／rights 處置仍分開。

#### Outputs 及不變條件

分開回傳`retentionStatus`（within_acquired_term/due/permanent/unknown）與`visibilityStatus`（visible/hidden_by_current_tier/expired/material_unavailable/core_denied/unknown），並保留 T0/deadline/monthbinding/policyversion 及 structuredunknownreason。`grantTransitionProposal`表示 create/extend/promote/noop/pending 的純計算，**不是已寫入／有效授權 receipt**。不以一個 expired 布林兼任顯示與刪除。

1. 一天 86,400,000ms；14 天 1,209,600,000ms、180 天 15,552,000,000ms。Expiry 提案採 `[T0,E)`，`now=E`為到期，不是已 purged。Free 顯示的最近 14 天也以 T0/UTC 計算；不是 updated_at／traveldate。
2. Paid 建立 E=T0＋180day，降級 Free 只改 displaywindow，**E 不縮**；超 14 天但未到 180 的 presentdetail 保留且 hidden。Paid 復訂只能看仍被保留、未到期且 coreallowed 的 detail；不能由現在 Paid 补出 missinghistoricalgrant。
3. 可信有效 upgrade U<E_existing 且 detail 未收合／刪除：Free 延至 T0＋180day，非 U＋180day；重複事件／多次升級不重置 anchor 或 doubleextend。`U=E_existing`已非尚未到期。若後來才處理但有可信歷史 U，須驗 event 來源／順序和 material；不拿現在 tier 代替事件，亂序／矛盾回 unknown。
4. ActiveReportMonth 為 2026-10 時 Freewindow 是 2026-05…10，六個含當月。Paid 取得或可信 upgrade 當時仍在 free 六月份保存範圍的現存 review 可提案 promotepermanent；Downgrade 不撤永久，僅 hidden，復訂重顯 retainedmaterial。不對 window 外缺 grant／不存在／已清除 review 造永久歷史或生成 report。
5. UTCexpiry 與 calendarreportmonth 分開。函式驗現成 immutablemonth/zone/versionfacts，不從 currentprofiletimezone 重新歸月，不做 manualzonechange/backfill；更新當月 payload 不改 monthidentity。缺可信 activeMonth/zonebinding 即 unknown，不自行指定初始 zone 或合併版本。
6. 所有輸出均`purgeAllowed=false`或等效無刪除能力；due 只表示後續 R1/protection/rights/qualifiedgates 未完。Unknown 不轉 Free14 可刪、Paid180/permanent 已取得；不處置 photo/training/log/cache/backup、不啟法律 registry，不越過 PC-2coredeny。

**完成標準**：精確六 path、政策與版本綁定、§6.1actualcandidate 輸出/negativecontrols/unknown-failureidentity、完整 commands/rawoutputs/noI/O/frozenexistingproductproof 與獨立本機 acceptance 通過。當前只是 PLANNED / NOT EXECUTED。不能只靠 exitcode、source 字串或鏡像 implementation 作 expected；setupfailure 不是 negativecontrol 成功。重用 existingrunner，不更新 PC-2harness/seal，不重跑無影響 478suite。

**Development 邊界**：R0-A 沒有 DB/Storage/部署/realmember 接線，DBfreshapply/livefixture 不適用，N/A 不是 PASS。另授權跨環境重播時只用同合成 factvectors 核對版本/output/no-write；R0-B/C 權威交易/RLS/displayintegration 另驗，本輪無遠端操作。

**首包完成仍未生效**：realT0/grant 歷史持久化、升級 writer、monthlygenerator/permanentstorage、server/UI 顯示 gates、collapse/purge/photo/training/rights/backup 及法律 activation 均不因純函式完成而生效。

### R0 分層與持久化／接線需求（第一包外，仍 PROPOSED）

| 層 | 真正需求／候選 paths／schema | 前置与驗收 |
|---|---|---|
| R0-A purecontract | 上述六 path，無 schema/migration 或 runtimewiring。 | Owner 規則已足；provenance 缺失要能顯示 unknown，不 default 造 authority。 |
| R0-B create/upgrade 持久化 | 後續候選新 `supabase/functions/_shared/consumer-retention/retentionGrantRepository.ts`、`supabase/functions/_shared/consumer-retention/retentionGrantService.ts`；可能接 S22 既有 create/finalize 的**新 forward successor**。需要 immutableT0/provenance、acquireddeadline/tier/event、upgradehistory、monthlypermanentgrant 及 reportzone/monthversion。Newmigration 具體 path 未凍結，另授權 schema 包以 CLI 產生再列 exactname；表 vsadditivefield 未定，不能修改舊 142migration。 | T0/source mapping、可信 membership 事件/時點/CAS、legacy 未知不縮/不偽回填、reportzone 初始化/變更 effectiveboundary/版本碰撞先 review。Creategrant 與 record 原子、upgrade 不縮/不重置、重跑幂等；Monthlygrant 只綁存在 report，不以 R1 未建就造 reports。PC-2coreauthority 保留。 |
| R0-C 顯示接線 | 後續候選現有 `apps/mobile/features/consumer-meals/readRange.ts`、`apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts`、`apps/mobile/features/consumer-meals/supabaseMealContracts.ts`、`apps/mobile/features/consumer-meals/supabaseMealMappers.ts`、`apps/mobile/app/meal-log.tsx`；serverreader/RPC 新 migration 或 endpoint 的 exactpaths 待方案 review，mobile-onlyfilter 不足以 enforce。 | R0-B 有效保存 facts、serververified 現在 tier 與 PC-2state、完整分頁；retainedbuthidden 不刪，復訂只讀 retainedpresent。Own/crossowner、coredeny、expired/rawquerybypass、sourcefailure 與 membershiprace 獨立 Development 驗收；monthlydisplay 依 R1，不入 R0-A。 |
| R1–R5 | 原月度 materialization、收藏 snapshot、到期 executor、photo 與 rights/training/backup 包保留，各自 schema/authorityinventory。 | 不打包進 R0-A；Owner/qualifiedpending 按各包 gates，先後以真实 dependency 而非一輪全部實作。 |

### 6.1 R0-A 原驗收規劃（scope freeze 時 PLANNED / NOT EXECUTED；本輪 runtime 結果見§11）

每項以合成來源明確的 fixtures 執行 actualcandidateexports；保存 command/exit/runtime 和 sourcehash/完整 stdout-stderr/expected-actual 值及 unknownreason。不得用 setupfailed 當 rejection、不得只看 exitcode、不得把 planning 稱 PASS。沒有 realmemberfixture。

| ID | 情境 | 預期 |
|---|---|---|
| AC01 到期邊界 | T0=2026-10-01T00:00:00Z；E14=2026-10-15T00:00:00Z；E180=2027-03-30T00:00:00Z。測 E−1ms/E/E＋1ms。 | 前 within，正好/後 due 且不能顯示 expireddetail；purgeAllowed 永 false；180 不換成 6calendar months。 |
| AC02 同瞬 offset | T0 的 Z、+08:00 與−07:00 三種等價表示。 | UTCanchor/deadline/display 一致；現 clientwriteValidation 僅 Z 格式不因此改 product，本純 contract 驗 offset 正規化。 |
| AC03 旅行與 DST | T0/now/grant 同一瞬間，換 device/travelzone，跨 DST±1h。 | detailexpiry 完全不改；report 只受固定已綁定 zone 影響，非手機 zone。 |
| AC04 編輯 | updated_at／用餐內容多次改，T0/grant 不變。 | 不重置期限；missingT0 不改用 updated_at 或 lastanalysis。 |
| AC05 Paid 建立→Free | Paid 建 180grant，day30Free 且 present；另 day10。 | day30 保留但 hidden，E180 不縮；day10 合法 coreallow 可顯示。 |
| AC06 Free 到期前升級 | FreeE14，可信 U=T0＋13day 且 present。 | extendproposal 到 T0＋180，不是 U＋180；尚未持久化不冒稱 actualgrant。 |
| AC07 重複／邊界升級 | 同 event 重播、之後再 upgrade；U=E14／U>E14。 | 不重置/doubleextend；正好及後到期 Free 不提升；矛盾或亂序缺證→unknown。 |
| AC08 復訂 | 已取得 180grant，day100Free→Paid；另 day181/missinghistory。 | 重顯仍 retainedpresent；已過期/缺 grant 不恢復或推造 180。 |
| AC09 已收合／刪除 | 原有 grant 但 materialcollapsed/deleted，會員升級。 | material_unavailable，不復活，不用 monthlyaverage 偽造 detail。 |
| AC10 六月份跨年 | activeMonth=2026-10 與 2027-01。 | 分別 May–Oct、Aug–Jan，首/末含、前一月排除；currentmonth 可 partialupdate 而 identity 不變。 |
| AC11 monthly 升級永久 | existingFreereview 在可信 upgrade 當時六月份 window 內；另 window 外/不存在/unknownhistory。 | 合格者 promoteproposalpermanent；Paid 建立 review 亦 permanent；不能現在 Paid 造缺失或 window 外歷史。 |
| AC12 monthly 降級／復訂 | 舊 Paidpermanentreport 在當前 Freewindow 外。 | Freehidden 但 permanentgrant 不撤；復訂 present 可顯示，rights/deletion 例外仍擋復活。 |
| AC13 reportzone 改版 | 舊 reportmonthkey/zone v1；帳號 manualchange v2／travel；同 month 內容更新。 | 不重排/歸月歷史，binding 保持；缺 binding 或版本碰撞 unknown，不默認 currentzone 回填。 |
| AC14 provenance 缺失／矛盾 | T0/offset、actor/resource/source、grant、event 序列、tier、month/zoneversion 逐個缺失/矛盾。 | structuredunknown/invalid；不是 Free14 可刪或 Paid 永久；合法 unmutatedsetup 先核對。 |
| AC15 無 sideeffect 與 consent | due/permanent/unknown 各結果，coredeny/unknown、withdraw、inactivelegal。 | 不 DB/Storage/network/filewrite/clock/scheduler/delete/photo 處置/法律啟用；retentiondisplay 不能越過 PC-2coredeny，不改 training 用途或縮既得 grant。 |
| AC16 建立grant提案 | 已驗create事件、T0與acquisition時Free/Paid事實；另legacy只有現在Paid但無acquisition證據。 | 前者detail分別T0＋14/180，Paid取得monthly提案永久；未寫入前非actualgrant。後者unknown，不偽作新create、Paid180／永久或歷史證明。 |

Mutation 驗收要拒絕 14→13、180→179、UTCinstant 按 localday、upgrade 重算 anchor、降級 180→14、permanent→free、六 monthoff-by-one、currenttier 推 historicalgrant、deleted→present、unknown→destructive 與偷接 I/O。首次執行與每份 individualoutput 即時保存，不把 totals 或 summary 造為未保存 case 證據。Purecontrols 不復用/修改原 PC-2mutationharness。



### R1 — 私人月度摘要 materialization（先不收合／刪 detail）

- **問題與行為**：對可證完整的 owner meals 建立 versioned monthly partial/final snapshot，支援月中 checkpoint、晚到 correction、重跑與 month read；與現有 daily cache 分開。先做 aggregation，不因完成 R1 就執行 14／180 天 expiry。
- **Candidate paths**：新 `packages/shared/src/domain/consumer-monthly-summary/types.ts`、`calculator.ts`；新 `apps/mobile/features/consumer-meals/consumerMonthlyNutritionSummaryService.ts`、`adapters/supabaseConsumerMonthlyNutritionSummaryRepository.ts`；可能需改現有 `apps/mobile/features/consumer-meals/types.ts`、`readRange.ts`、`adapters/supabaseConsumerMealRecordsRepository.ts` 作可信 pagination/completeness（不得只調大 limit）。候選 `scripts/consumer-monthly-summary-smoke.mjs`、`scripts/consumer-monthly-summary-mutations.mjs`。先證明全量 server read 是否讓 mobile 改動不必要，再收斂 exact paths。
- **Schema／migration**：預期需要新 monthly snapshot／contribution/version/ownership/current binding 及原子 materialization authority；具體表／migration 檔名／ACL／current G gate compatibility 在新包施工前確認。不能改 S14／S16／S22 歷史 bytes，不能藉新表 bypass PC-2 core eligibility。
- **前置**：R0-A 政策與 grant contract、Q6、Owner E 固定 report timezone／historical month version、完整 source／correction mapping；monthly score 若未批准只能稱營養摘要，不能宣稱已交付評分。
- **Local／Development cases**：month 內>100 records、月底與短月、多 timezone、部分日缺資料、missing vs 零、nutrition snapshot/version、portion/consumed ratio、合法 correction 後重算、同 watermark 重跑無 double count。Development 在獨立授權的隔離合成 actors 驗 own/cross-owner read-write、RLS/RPC、合法 denied core、atomic failure 保留舊 current，並證明全量 input。
- **Negative／recovery**：truncated page、stale watermark、unknown algorithm、correction/read/write failure、並發版本競爭都不得當 complete；失敗不能刪 meal，重試只發布一次；monthly user link 仍 private，非 public aggregate。
- **完成標準／不含**：可追溯完整 input 與版本、checkpoint/final 分清、atomic current publication 及獨立 acceptance；不含 detail expiry／photo delete／scores 未批准公式／forever daily storage。R1 可獨立交付，是 destructive collapse 的必要前置。

### R2 — 私人收藏餐點 snapshot 與 quota authority

- **問題與行為**：新增「收藏此餐」的穩定 snapshot 身份／必要引用，與 restaurant/menu bookmark 分開；在可信 actor／quota 下 add/remove/restore；向 R3 提供可驗保護 fact。不先清除任何超 quota 既存資料。
- **Candidate paths**：新 `apps/mobile/features/consumer-favorites/consumerSavedMealService.ts`、`adapters/supabaseConsumerSavedMealRepository.ts`；可能改 `apps/mobile/features/consumer-favorites/types.ts`、`apps/mobile/app/meal-log.tsx`、`lib/i18n/zh-TW.ts`（只在另授權 scope 更正文案）；新 `scripts/consumer-saved-meal-smoke.mjs`、`scripts/consumer-saved-meal-mutations.mjs`。新表／RPC forward migration exact 名施工前確認，不修改既有 S12／S15。
- **Schema／migration**：預期需要 saved meal snapshots＋references、canonical quota 與版本／locking；若 reuse 既有 schema 可完整滿足需先舉證，不能稱 bookmark 已足夠。
- **前置**：Q5 的保存單位／snapshotted 欄位／cancel/restore/降級、Owner 裁決 40/200 vs50/150 quota 及 canonical 適用單位；含原圖保存期限要等待 Q7，否則明確只保存批准 metadata 不可承諾 photo 永久。
- **Local／Development cases**：同餐重試只一個 active snapshot、quota 邊界、不同 owner 隔離、restaurant/menu 日後改變不抹除既存批准 snapshot、bookmark 不自動免日記到期；Development 合成 fixtures 驗 RLS／RPC／tier 可信來源。
- **Negative／recovery**：並發收藏超 quota、失效 catalogue 引用、quota/tier 讀失敗、期限與 add/remove 交錯、取消恢復重試、source 已收合／已刪餐，不建立虚假完整 snapshot；transaction 失敗無部分引用。
- **完成標準／不含**：private exact snapshot/引用、quota/idempotency/owner isolation 及獨立 acceptance；不含 catalogue 來源刪除、訓練／商用 grant、未知原圖永久或 R3 purge。

### R3 — 詳細資料收合／到期 executor（依賴 R0＋R1＋R2）

- **問題與行為**：真正履行非收藏 14／180 天到期行為；summary 完整發布後，只對真正保存期限到期且無合法保護的 detail 按另批准 storage/不可逆處置執行。Paid 已取得 180 天／有效升級已取得 180 天的 hidden detail 不能因降級或超 14 天收合；復訂只重顯仍被保留內容，對齊本輪 Q4。執行前重驗 owner/tier/favorite/state/version。
- **Candidate paths**：新 `supabase/functions/consumer-retention/index.ts`、`handler.ts`；新 `supabase/functions/_shared/consumer-retention/plan.ts`、`execute.ts`；候選現有 mobile `readRange.ts`、`supabaseConsumerMealRecordsRepository.ts` 作一致 read contract；新 `scripts/consumer-retention-executor-smoke.mjs`、`scripts/consumer-retention-executor-mutations.mjs`。forward migration／scheduler／transaction ledger exact paths 另 scope；不得用 user-visible query limit 代替 DBauthority。
- **Schema／migration**：預期需要 per-operation idempotency、source watermark、state/tombstone 或最小 ledger、protected references 及精確 ACL；archive/purge 模式決定欄位；合法 acquiredgrant/upgradehistory 是 authority input，currentdisplaytier 不是 purge 依據。如何避免 audit 永久存個餐副本仍需 review。
- **前置**：R0-B grant provenance、R1 completeness、R2 protection、已確認 Q4 與 pendingQ5、所有待刪 relation disposition、合法保存／刪除 review、operator 與排程授權；照片不隨 mealrow 被草率刪，未決引用阻止相應 destructive action。
- **Local／Development cases**：due/not-due/free/paid/favorite、摘要故障無刪除、月中 checkpoint、upgrade/downgrade/expiry、並發 favorite/write/delete、每個 crashpoint 重跑無 doublecount/錯刪；Development 隔離 syntheticDB 驗原子性／權限、read contract、完整 receipts，不觸碰真實会员。
- **Negative／recovery**：unknown entitlement/favorite、partial summary、stale candidate、權限失敗、job 重複／租約失效都停止相應操作；失敗與成功 receipt 不可混淆，retry 不使用過期 authorization。
- **完成標準／不含**：Owner 批准 mode、loss/restore 語意、完整先摘要後收合、race/idempotency/權限及獨立 acceptance；照片、training、全帳號 rights／backup 非此包自動完成，亦非 activationPASS。

### R4 — Photo asset manifest foundation；cleanup 另設 gate

- **問題與行為**：先建立 original/thumbnail/staging/diary 多用途引用、analysis→meal/assetlineage 與 promotion/recovery 記錄；此 foundation 可獨立驗收但不刪。只有 Q7 及 qualified approval 後另授權 orphan/expiry executor，不能在一包悄悄啟動未批 TTL。
- **Candidate paths**：新 `packages/shared/src/domain/consumer-photo-lifecycle/types.ts`；新 `supabase/functions/_shared/consumer-photo-lifecycle/manifest.ts`、`promotion.ts`；候選現有 `apps/mobile/features/meal-photo-upload/adapters/supabaseMealPhotoUploadRepository.ts`、`apps/mobile/features/analysis/useMealPhotoUpload.ts`、`apps/mobile/app/analysis.tsx`、`supabase/functions/meal-photo-analysis/persistence.ts` 作可靠 assethandoff。cleanup 若获批再新增 `supabase/functions/consumer-photo-cleanup/index.ts`、`handler.ts`；驗收候選 `scripts/consumer-photo-lifecycle-smoke.mjs`、`scripts/consumer-photo-lifecycle-mutations.mjs`。不得將這些 latercleanup 路径算入 foundation 既授權 inventory。
- **Schema／migration**：預期新 manifest／references／operationreceipt 及 owner/用途 authority；不同 purpose 不是單個排他 state。当前 image_object_ref/staging_expires_at 不足夠；新 migrationexact 名待施工 scope，舊 finalizationbytes 保留。
- **前置**：foundation 的資料分類/引用 owner 批准；實際清理另外需 Q7、OD-15／TD-10／AU19／P-7 中相應 retention 批准、processor/backup 边界 qualified review。未知 TTL 仍 pending。
- **Local／Development cases**：upload 成功但 response 丟失／analysis 失敗／finalization 成功／retake／duplicate／promotioncrash；两 purpose 并存、last-reference 與並發 favorite、thumbnail 再生。Developmentsyntheticownedobjects 驗證 owner 隔离／immutablepaths／引用保護與 loss/retry；不真實用户、不得現在執行。
- **Negative／recovery**：activeprocessing／finalizeddiary 引用不能当 orphan；交接失敗原物保留；跨 ownerpath 拒绝；withdraw 後 coredeniedclientdelete 不得当 purgecomplete；DBreceipt 成功但 Storage 失敗必须繼續可重试且不假報全删。
- **完成標准／不含**：foundation 完成僅 lineage 與 promotion 可靠，不是 purge ready；cleanup 另验期限/删错保護/確認 receipt。training/admission/model、restaurantcommerciallicensing、fullbackup 治理不含。

### R5 — Rights、training-copy suppression 與 restore closure（分段授權）

- **問題與行為**：先提供可達的 withdraw/delete 請求與目的/副本清單，再做未來 admission/job suppression、現有 dataset/processor 处置 receipt 及 restore 前 suppression。每段獨立 exactscope 和 acceptance；不把 PC-2withdraw 重做，也不自动開啟訓練。
- **Candidate paths**：新 `supabase/functions/consumer-data-rights/index.ts`、`handler.ts`；新 `supabase/functions/_shared/consumer-data-rights/disposition.ts`、`suppression.ts`；候選現有 `apps/mobile/app/account-support.tsx` 作請求入口；新 `scripts/consumer-data-rights-smoke.mjs`、`scripts/consumer-data-rights-mutations.mjs`。dataset/backup/processorintegration 實際不存在或尚未盘点，paths 必须在相應後续階段发现後明確授權，不能虚构现成 pipeline。
- **Schema／migration**：預期請求/目的 receipt、最小 suppression/tombstone/auditbinding 及受限 rightsauthority；consentFKcascade/留證矛盾须解决。既有 PC-2F/G/guard 原 bytes 不改，不能以 coredenial 当無法處理權利請求的理由。
- **前置**：Q8/Q9、Owner 渠道/权責/時限、qualified review 保留/匿名/留證/模型影响、實際 processor/backup 配置證據；dataset 能力未存在则验明確拒绝與 NO_TRAINING，不假做已執行副本刪除。
- **Local／Development cases**：撤回立即影响新 admission/inflight 重验、重復 request、帳戶关闭後仍可处置、training 用途與 diary 合法保存区分、跨 owner 拒绝；syntheticrestore 重播先 suppression 再開放讀取/訓練，刪除不復活。provider/backup 真實驗證需另外明確授權與無真實会员测试界限。
- **Negative／recovery**：processor 不可達、Storage 失敗、consent/source 已刪除、舊 backup、佇列晚到、legalhold conflict 保持部分/待審狀態不得報 complete；retry 與 receipt 幂等不新增使用權限。
- **完成標准／不含**：逐 purpose/副本 manifest 與可核對 receipts、可達 rightsflow、restore gate 及獨立 acceptance。模型已訓練影响只報實際批准/實现能力，非默認 unlearning 承诺；未開啟 legal/registry 或 futureall-purposegrant。

## 7. 第一包建議、完成標準與真正 blockers

**第一包為 R0-A，精確六 paths 見§6。** Owner A–F 已足以決定第一包政策，不再問原 Q1/Q2/Q3 A/B，也不把保存/顯示分離、降級不撤 grant 或升級延長列為 Owner pending。Pure/no-migration/no-runtime/no-delete，只評估已解讀 facts 與 unknowncontract。

Planner 需接受六 path/typedfacts/transitionproposal/no-I/O/§6.1 驗收範圍，再另授權施工。施工前本機 preflight 確認 existing TS/testloader 可用、candidatepaths 無他人工作；若需要第七 path、依賴或改既有 harness，先提 scope 差異。本輪沒有未回答的 Owner 保存方向阻擋 R0-A。Actualauthoritymetadata 缺失會使 realworld facts 回 unknown，這是第一包必須如實表達的限制，不能 default 補授權。

後續接線真正 gates（不塞入第一包）：

- R0-B：T0 在 create/import/finalize 的原始事件到字段 mapping、immutablebinding、acquiredgrant/upgradeevent 歷史、可信 membership 時點/CAS 順序；legacy 如何保持 unknown 而不縮期限。created_at 可能作 serverfirst-record 來源，但另 source 裁定，不默認 occurred_at／clientclock。
- R0-B/R1：固定 reportzone 初始化與 manualchange 有效邊界、每份歷史 monthbinding、混合版本同月 identity/late-generation 契約；monthly 資料模型未存在。這些是 technicalproposal/source 接線 gate，不撤 Owner E、不要求再選 UTC 規則。
- R0-C：serverread/display 權限與 PC-2core eligibility、分頁、hidden 不刪及 own/cross-owner 保护；不是 mobile-only 範圍。Socialentitlement 來源需 retentionadaptercontract，不能擴 frozenSocial-only 權限。
- R1–R5：Q5–Q9 的 quota/snapshot/月内容/照片/rights/backup/qualifiedreview 仍分包 pending。第一個 grant 持久化包是 R0-B；monthly 生成包是 R1。R0-A 完成不宣告 retention、training、activationready。



## 8. 與 publication／rollout 及其他 prerequisites 的關係

S02 规划必须先完成實際能力、qualified review 與 publication/version/hash/approvalbinding，再按已核定流程发布。S03 的 retention/training/backup/rights 新增驗收案例仍**未執行**；本文件只是將其拆成可施工 scope，不改原 runbook 為 PASS。實際實现後，應另授權更新正式 candidate 正文與證據，再獨立 review，不能修改已凍結草案來配合本轮結论。

| Dependency | 本轮狀態／後续 gate |
|---|---|
| OD-15 | OPEN：真實餐点照片保存及同意/法律文字批准不能由 privatebucket、best-effortremove 或 Owner 日记方向代替。 |
| TD-10/AU19 | OPEN：retentionapproval/governancerecord 與既有 Development acceptance 差異待有权 owner 處理；本轮只記錄。 |
| P-7 | OPEN：Productionretention/legal 批准 blocker；localacceptance、push 或 scope 文档均不关闭。 |
| Processor／training 可識別性 | 契约、subprocessors、實際 settings、dataset/job/restore 風險需 qualified review 和授權驗證；store:false 不是全部通過。 |
| Membership／billing | current 月费 399、299 未采用；billing、trial/取消/退款權益實现另 scope。R0 讀取明確 fact，不顺便實施支付；价格/planUI 不是 authority。 |
| Publication／rollout | 原已核定 formalbundle 與 enforcementbinding 保持；不能為收集同意绕過 inactivelegalregistry，不宣告 live signupclosure 或 activationreadinessPASS。 |

## 9. 先前文件同步的 Focused checks、provenance 與範圍保護

- 本輪 fresh：完整讀取 01–04 及 rawhash，Git/inventory/ancestor、原 46source 及新增 8source rawhash/committedblobbinding；A–F 與 RC/matrix/Q1–Q4/R0/R3 一致性；localreferences、UTF-8/LF/whitespace/secretpatterns、04-only delta、3,333 個既有 trackedpaths bytes/modes/indexentries、142migrations 及 Demo Pool 兩 scripts 保留核對。本輪只宣告文件 focusedchecks，不宣告 productPASS。
- Reused：2026-10-02 資料流 review／歷史保存提案／矛盾、原 01–03 及 S01–S46ledger、未受影響 R1–R5 和已接受 PC-2localacceptance。新 Owner A–F 不冒充歷史已驗；未重跑 478suite/productbuild/typecheck/DBfreshapply/產品 mutations/Development 驗收。
- Exactdelta：只修改既有 untracked04，起始 SHA-256 `73e304977c9b2c7965bb06140ae76ef5de57d15e88144b38a2e475fc6e8e6aa7`；保存全文 readcopy 和 exactbefore/afterpatch 於 repo 外。原 review 與歷史/sourceevidence 保留，按新規則更新 affectedsections，不清空重建，不新增 repository 文件。
- Preservation：對照起點 3,333trackedpaths 的 rawbytes/modes 与 index(mode/blob/stage)entries，04 以外未被本輪改動；staged 仍空。142migrations、Demo Pool 兩 scripts、原三文件、product/dependencies/legal/registry 不改。比較 entries 與 sourceidentity，不錯誤 freezeGitindexrawfilehash。
- 禁止操作：沒有新增 guard/harness/testscripts、stage/commit/amend/fetch/push/deploy、remoteDB/Auth/Storage/ManagementAPI、legalactivation、產品/schema 施工、Demo Pool 執行、PC-3/GQA-7/GroupTable。
- 全部§6.1 仍 PLANNED / NOT EXECUTED；READY_FOR_R0_IMPLEMENTATION_SCOPE_REVIEW 是提案可供 Plannerreview，不是施工或 activation 批准。PC-2localacceptance 保持；法律 DRAFT / NOT ACTIVE、activationpending；OD-15、TD-10/AU19、P-7 OPEN。



## 10. Source identity ledger

以下均為 f5b9ae0 source HEAD 的原始文件 SHA-256（不是 GitobjectID）及對應 committedblob；它们也是 pushed b70884a 中的相同 source bytes。Source 引用支持範圍见§2–6；一個 source 有實现不表示其中整套 historicalbacklog 已完成。三原文件 metadata 保留其撰寫时的 8e749baseline，不回寫历史為本轮版本。

| ID | 本机 source path | Raw SHA-256 | Git blob identity |
|---|---|---|---|
| S01 | [docs/planning/pc2-activation-preparation/01_OWNER_FACTS_AND_DECISIONS.md](../../../docs/planning/pc2-activation-preparation/01_OWNER_FACTS_AND_DECISIONS.md) | `77228b7a3d530a1c9175cdb860baa8258e23a5ff9dc7e4d84353b70b441866d5` | `da56e7a61c0408609dde3c47016dec1cfe475d81` |
| S02 | [docs/planning/pc2-activation-preparation/02_PUBLICATION_AND_ROLLOUT_PLAN.md](../../../docs/planning/pc2-activation-preparation/02_PUBLICATION_AND_ROLLOUT_PLAN.md) | `10c95e29a83fe41430da8ff249801ea427b9e641b3236a80791fa403499aea45` | `2027c15dd1b45033b38d88f586d9b530977fdf8c` |
| S03 | [docs/planning/pc2-activation-preparation/03_DEVELOPMENT_ACCEPTANCE_RUNBOOK.md](../../../docs/planning/pc2-activation-preparation/03_DEVELOPMENT_ACCEPTANCE_RUNBOOK.md) | `337456c477255ba37f29a26aa064bd0c7a19e5b11cb15307e977c5f75ec2ac04` | `1f95f0d7e2530848d4819717dd8498128a705d39` |
| S04 | [apps/mobile/app/meal-log.tsx](../../../apps/mobile/app/meal-log.tsx) | `ffce4681085636a4a756680b9b64f5c105e98cc443ca399f46686b0bfb4a996b` | `8ab16575c42cc570fbdda0b4b27da1b23349d038` |
| S05 | [apps/mobile/features/consumer-meals/readRange.ts](../../../apps/mobile/features/consumer-meals/readRange.ts) | `288e4faed15a8022f23d7d903ef9937d968c678eb23a4cbca47742bf38148f9a` | `34160bae7be9f6075864515177fb5b0ed31585b3` |
| S06 | [apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts](../../../apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts) | `58626c7d8689303be8a28ac6dd033e223afc8ac0cb2c6b189fe501ebafc3f8ef` | `431f910c1bf2bd7c577f560442e8dd96131dba11` |
| S07 | [apps/mobile/features/consumer-meals/consumerDailyNutritionSummaryPersistenceService.ts](../../../apps/mobile/features/consumer-meals/consumerDailyNutritionSummaryPersistenceService.ts) | `06223e545170afceb94e321ea3864648f4d8ade9a5d85b410e97651d223f67a0` | `4eeebdd98e12f47d7381cd9df817639ed78e0734` |
| S08 | [apps/mobile/features/consumer-meals/dailyNutritionSummaryCalculator.ts](../../../apps/mobile/features/consumer-meals/dailyNutritionSummaryCalculator.ts) | `d7b0b9f6d6ec71683ef6e3a96bc090f331731ebd9122e493ce0d8cb024ffd982` | `81913649f96eafc27c7450e2873092391fd66408` |
| S09 | [apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryRepository.ts](../../../apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryRepository.ts) | `05b5db7efbe093f0eed4ef54f79256861d5b638e84f761f2478d93b1a103c0e1` | `29745f44298ed85ccbd451e3d3a7b0bb5307800d` |
| S10 | [apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryPersistenceRepository.ts](../../../apps/mobile/features/consumer-meals/adapters/supabaseConsumerDailyNutritionSummaryPersistenceRepository.ts) | `4f55a3dc9dc9541cee051378a8e411ea56fe70d0248706739b7ccb47e1ccd5a3` | `54df2a53b4284c12d0c28ab289630d05519415fe` |
| S11 | [apps/mobile/features/consumer-favorites/consumerFavoriteService.ts](../../../apps/mobile/features/consumer-favorites/consumerFavoriteService.ts) | `d348a561731e246af66981286bcb69dbf0304f1be7703ef5a5e65e774e0a9e29` | `1136a488f6d96a87aa1d68839b9dd07e517a7929` |
| S12 | [supabase/migrations/20260718020000_consumer_favorites_atomic_write.sql](../../../supabase/migrations/20260718020000_consumer_favorites_atomic_write.sql) | `63257e599b51551a4425eb03b26a5a21319c97fafeb9e7fad08a8c4ec8311475` | `9318b7f38486a2073261d42fdf38525c81e64434` |
| S13 | [supabase/migrations/20260712130400_consumer_schema_phase_1_3_meal_records.sql](../../../supabase/migrations/20260712130400_consumer_schema_phase_1_3_meal_records.sql) | `456f732f88b670c67d853323665c8d3b6c4b8c0825ce0b616d82fe5f8ee1e88e` | `428ea97336b45c911038ed7d8d9f4c71af4eae3f` |
| S14 | [supabase/migrations/20260712130700_consumer_schema_phase_1_3_planned_meals_and_daily_summaries.sql](../../../supabase/migrations/20260712130700_consumer_schema_phase_1_3_planned_meals_and_daily_summaries.sql) | `f641a23fd2659e396acebf4ac73cb1441ec6b4acd5d058b8d0f7bf872c933860` | `600b10bc611fdf97128dd7bb9c807489293ee066` |
| S15 | [supabase/migrations/20260712130800_consumer_schema_phase_1_3_ratings_and_favorites.sql](../../../supabase/migrations/20260712130800_consumer_schema_phase_1_3_ratings_and_favorites.sql) | `baa8f3225eec4e1392e0707f8591bcc86c8e4e411c906a58f9a5821784b483d3` | `ea828b27771ffb30968c8280e57d83e940475a23` |
| S16 | [supabase/migrations/20260713070100_consumer_schema_phase_1_3_atomic_daily_summary_persistence_function.sql](../../../supabase/migrations/20260713070100_consumer_schema_phase_1_3_atomic_daily_summary_persistence_function.sql) | `88d2fcb0bf162ffd1a9ce815b039586d79c464f50ddd72e2fdd1f39d96fedd6c` | `a745c529627b13412e45045d76d99b61ca45286d` |
| S17 | [supabase/migrations/20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql](../../../supabase/migrations/20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql) | `127a64fbd11a34f1629e2510345ba0c2feb1058011c75ffc687ae633336bcef2` | `aa98855c8b48847c66a79c09670fce0e7fcbc00e` |
| S18 | [supabase/migrations/20260712131000_consumer_schema_phase_1_3_consumer_privacy_and_consents.sql](../../../supabase/migrations/20260712131000_consumer_schema_phase_1_3_consumer_privacy_and_consents.sql) | `b628503a5deafb547135b7fe7194065b61f21442f86a4eed6b5a3112e2a2a1aa` | `69a06c481f529225066a349f57fad16ab2889e0a` |
| S19 | [supabase/migrations/20260725010000_meal_photo_analysis_meal_analyses_additive_columns.sql](../../../supabase/migrations/20260725010000_meal_photo_analysis_meal_analyses_additive_columns.sql) | `51d3ee42112d0f6edba0fa9215d41b28642b252731d7f335d31166c343e3fcdc` | `e15837b3253f7b502099861b350104b8c1bce8ed` |
| S20 | [supabase/migrations/20260725030000_meal_photo_analysis_private_storage_bucket.sql](../../../supabase/migrations/20260725030000_meal_photo_analysis_private_storage_bucket.sql) | `7185bdd28290ff9262bce2bc42ceddd706498108f5482209798c7338f6f58ae9` | `f15094244aefd223c97be7080362999588b498a8` |
| S21 | [supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql](../../../supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql) | `79fb7610b5e1d5428e2bd986eb6e8388c9d521e1dae9780436e21a283f61a313` | `ffdf9adb5730b1148fcecf98d0896825e1ab97ef` |
| S22 | [supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql](../../../supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql) | `242ed04e5d948727c8f26ef187e1cb0ea1803ab4eb7db5a4c709f80f19f7ce8d` | `919fe65d6bb7f511a133a3e5986e7281e84ed50f` |
| S23 | [apps/mobile/features/meal-photo-upload/adapters/supabaseMealPhotoUploadRepository.ts](../../../apps/mobile/features/meal-photo-upload/adapters/supabaseMealPhotoUploadRepository.ts) | `91f6da6fbbacce939b4c5d7f8fe0aaca7cba263e49b2ac041eb3218ab6f71910` | `60dcf498825a5fe0671ccc17d0966de0b85c2ca3` |
| S24 | [apps/mobile/app/analysis.tsx](../../../apps/mobile/app/analysis.tsx) | `23ae50fe756d36b71d589dcf1f8d785408b3aab223c5a7260789029d618659c4` | `d457db39b5b4653f27a2bb7a0385654c0f2d6cfd` |
| S25 | [apps/mobile/features/analysis/useMealPhotoUpload.ts](../../../apps/mobile/features/analysis/useMealPhotoUpload.ts) | `e9b276f3aa6e74bb4723649757af979e66109a9838f2cb936c15791acbd566d5` | `80ebc5749156caa5261370ae87a42a922e231c64` |
| S26 | [packages/shared/src/domain/meal-photo-analysis/types.ts](../../../packages/shared/src/domain/meal-photo-analysis/types.ts) | `c2a2b978724f7d7771caa2889491f23fa8e57c717b038ce75bdd27bf0025c925` | `a1b00311587bc085f51857d297e1654be1e40db7` |
| S27 | [supabase/functions/meal-photo-analysis/config.ts](../../../supabase/functions/meal-photo-analysis/config.ts) | `340584b192988263bcbce8666dcfacd6401985e7caaf4813534164e1f5bde97c` | `81edfc8e1aef79bbf660161c175b1b4c6da9b610` |
| S28 | [supabase/functions/meal-photo-analysis/handler.ts](../../../supabase/functions/meal-photo-analysis/handler.ts) | `cc47c72be5ad6465a021b5e04a26339c2e03d6a6985b972a518a9881111914fc` | `a52eb3ef0378cfaeee774b03adbd1b6ab2cba8aa` |
| S29 | [supabase/functions/meal-photo-analysis/openaiProvider.ts](../../../supabase/functions/meal-photo-analysis/openaiProvider.ts) | `b71473572a1d91922be1a5751514d0351ea5abb7e59410c35cd7511e525114e0` | `ccbd6f28826408b4b485e822fd20d61fbcad5684` |
| S30 | [supabase/functions/meal-photo-analysis/persistence.ts](../../../supabase/functions/meal-photo-analysis/persistence.ts) | `3b20b5ef1607258ca78a5fac9773742246425096acc708154c95342489060b34` | `6952635348066639a525cf07f59eb484830afaf0` |
| S31 | [supabase/functions/_shared/social-exposure/resolveEntitlement.ts](../../../supabase/functions/_shared/social-exposure/resolveEntitlement.ts) | `09d5d8bc69b72782d59f935fe0aeb285b80aa101a1a7038d333c5fee885e6bc9` | `b6b096318a19366e7f5145d2186a9b8821d67f4c` |
| S32 | [apps/mobile/app/account-support.tsx](../../../apps/mobile/app/account-support.tsx) | `c7311c84f3c3206c571315ddd8395743e869cfa51fb78c71a5cf8df6d6c61461` | `626e6b2ff529755ee3a0e6676deb8b3b6697d2c8` |
| S33 | [lib/i18n/zh-TW.ts](../../../lib/i18n/zh-TW.ts) | `e403d6d3c73ab01a99f6353d0334a9229882ee760f20eb8509c95995ec6ddbf7` | `4509409bb02446d97e5b4f59d244152b2f5bd4b0` |
| S34 | [docs/consumer-schema-privacy-classification.md](../../../docs/consumer-schema-privacy-classification.md) | `bac7d8c2f25a3d8329870eb8cbaa1f0ffabb089a7e8f6fa02dfae90abf6783bd` | `e99cf7d703494afac64840b0f00b79ca92a49525` |
| S35 | [docs/consumer-schema-decision-register.md](../../../docs/consumer-schema-decision-register.md) | `3e4c5e3490851bd5ae14e8f461f1740b19a67ba8acf70223a73fe79588a113eb` | `77340a566002a28a55c0ad5d214e4c5d69a1ecb0` |
| S36 | [docs/engineering-state-registers.md](../../../docs/engineering-state-registers.md) | `3e9105c2a8323568a93b6fc23bd1cceda2256a3ce156aa175eef394cded43ec7` | `741198f7a8e72089b5f4ac462050b825f51d2b12` |
| S37 | [docs/handoff/11_DECISION_REGISTERS/OPEN_DECISIONS.md](../../../docs/handoff/11_DECISION_REGISTERS/OPEN_DECISIONS.md) | `adc7b73fd4b65cbb30e532d046a7dbd262fc233882c063f6b3ee195fcc8797af` | `7f92f8caa205a811885ba4b6c0e4e6c60b44ecbc` |
| S38 | [governance/OWNER_PRODUCT_DECISION_REGISTER.md](../../../governance/OWNER_PRODUCT_DECISION_REGISTER.md) | `38e11017db05cb4ae1d1cec97e2748a4fd165ecd79afb7eff8a5ca6d442813ac` | `44c7d32858f96dfeef16b54b5b838cc67080ffe2` |
| S39 | [governance/RECONCILIATION_2026-09-19.md](../../../governance/RECONCILIATION_2026-09-19.md) | `9be67fc5828bd1454a6e64239ce3621d5fd57c50fdd2b33f184977d0a5bb84e9` | `e6b77a7441fe9e36796d0fbca0cd0e6777a07807` |
| S40 | [supabase/functions/_shared/social-exposure/policy.ts](../../../supabase/functions/_shared/social-exposure/policy.ts) | `cef032e942ed0f66ccd6a2ba9a817133d19a107b316fba6047bd74bec12cd0f3` | `85c8b79f411a48ff7ec9b0b85f62f38979288385` |
| S41 | [supabase/migrations/20260803010000_finalize_meal_identification_v3_ledger_restaurant_identity.sql](../../../supabase/migrations/20260803010000_finalize_meal_identification_v3_ledger_restaurant_identity.sql) | `d33c3981463b323e049119bcfe6e268006c4c3c5cb7c90912c4d270c4bab5238` | `7a54285f517458cd86dd76acbc473d811d6922df` |
| S42 | [docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/14_Compliance/006_DATA_RETENTION_POLICY.md](../../../docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/14_Compliance/006_DATA_RETENTION_POLICY.md) | `492a1f24b5816b91ba35e3fa3eb78a68c06d68720a95536056abeda5c25c3246` | `f90bcae20aa4097f225d863dae43b31106e9a88e` |
| S43 | [docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/02_PRD/010_FOOD_DIARY_PRD.md](../../../docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/02_PRD/010_FOOD_DIARY_PRD.md) | `24e0053fdd45ea70b1055cc78a2b323c27b5ebefc65f6d1c444fee62e8919392` | `5c98d037c1c8dff2c937583d73d1802435d4d6ec` |
| S44 | [docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/02_PRD/009_PREMIUM_PRD.md](../../../docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/02_PRD/009_PREMIUM_PRD.md) | `b127b179771255f96491e6c142aafc96bfa20b2b9ee0a7ecdf4d725fef7847d6` | `c0c6799554ac9bb7a82a3ba288f8ad0299655406` |
| S45 | [docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/11_Infrastructure/003_STORAGE_INFRASTRUCTURE.md](../../../docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/11_Infrastructure/003_STORAGE_INFRASTRUCTURE.md) | `b98fb7827350fc9c6d15473b798c6799c71a38ac5bcb100d4875e2cdb57a707b` | `032b8837472b26f551404a760d2c83b9a428b5e3` |
| S46 | [docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/11_Infrastructure/008_BACKUP_AND_RECOVERY.md](../../../docs/Haocu_OS_Master_Repository_v2.0_alpha10_final_editorial_consolidation/11_Infrastructure/008_BACKUP_AND_RECOVERY.md) | `bf465dd7a6a21654b23a020ebebfacc23fdede996d6d54f27ed21cbad756b952` | `0c8eb533c9276d37ab2cc1c3712ba8466632d83b` |

### 本輪新增source bindings（S47–S54）

| ID | 本機 source path | Raw SHA-256 | Git blob identity |
|---|---|---|---|
| S47 | [apps/mobile/features/consumer-meals/consumerMealRecordWriteService.ts](../../../apps/mobile/features/consumer-meals/consumerMealRecordWriteService.ts) | `df30ea49d8a8d1b6d2467829f7d17b7fd8137d619ecb16e9235b59dc5775bcf9` | `c9d01688df0db2dfd647d40461a2e8b9bbd143e1` |
| S48 | [apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts](../../../apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts) | `61a73dc23f596ddd7d464fab3b0955e447dddfda458c41bfe382b6cafa0842f6` | `a7d76d832e2deb4126f67f8ba4d845c73f744cae` |
| S49 | [apps/mobile/features/consumer-meals/supabaseMealContracts.ts](../../../apps/mobile/features/consumer-meals/supabaseMealContracts.ts) | `360ff9c4c9487d7ccb1c68a331ecc1059ec0140afb53e3d64cd741ee3d730bdd` | `fb7dc422655617c5eea53aac780970775e9b8f8f` |
| S50 | [apps/mobile/features/consumer-meals/supabaseMealMappers.ts](../../../apps/mobile/features/consumer-meals/supabaseMealMappers.ts) | `29bdcef0c68e86acd4a3869e20369499aa8fb5ac5d91fa0b62ac3f6f820b684a` | `f6bea1457ef0f3f7c807fa80b1f574ed4944ea6b` |
| S51 | [supabase/migrations/20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql](../../../supabase/migrations/20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql) | `63bf696df277191723ef856004ae0a7ec8e8bf069b52e7e068f076e1c1b1884d` | `288ebbbcc41dbdadf3fee8556fb62b6a401f2c4f` |
| S52 | [apps/mobile/features/consumer-meals/writeValidation.ts](../../../apps/mobile/features/consumer-meals/writeValidation.ts) | `165745ff59aa728e37b45335cbc0f0ac4eca2c281bf62337d28edeac8211a51e` | `8a757420bc41d1e823820a143473170707ddbdda` |
| S53 | [supabase/migrations/20260712130200_consumer_schema_phase_1_3_consumer_profiles.sql](../../../supabase/migrations/20260712130200_consumer_schema_phase_1_3_consumer_profiles.sql) | `1738766e1cd2f5a81a51d44aee1899d17b761dfccb5f4be019d3ec1e08df2ac8` | `ba43a73a8a97ee01d2713dcdcf46ceee9a5b1ebf` |
| S54 | [apps/mobile/features/consumer-meals/types.ts](../../../apps/mobile/features/consumer-meals/types.ts) | `0a621e5b7a90b12a86a1bf4dd0709381e1be34153e6068416a79c73136d0bb57` | `803676dcc4764f2c0dd101f18ba599d62ec2776f` |

本輪 2026-10-03 external evidence 在`retention-r0-scope-sync-20261003`：起點 inventory/bytes、完整 01–04readcopies、54-sourcebindings、exactdelta 與 focusedchecks。新證據不是歷史 review 或產品 PASS。

本轮外部诊断證據保存於 Codex workspace 的 `pc2-retention-scope-review-20261002` 目录；本文件已包含主要結论、矩阵、scope、gates 和 source hashes，不依赖/tmp 或外部報告才能理解/審阅。本文不自寫自己的 hash 以避免循环 binding；finalreport 给出實際 raw SHA-256。

先前 scope-freeze Return：**READY_FOR_R0_IMPLEMENTATION_SCOPE_REVIEW**。該階段停止於 Planner review；本次 R0-A 指令已明確授權以下七檔本機實作與單一 commit，最新結果見§11。PC-2 local acceptance 維持通過，法律 DRAFT / NOT ACTIVE，activation pending，OD-15、TD-10/AU19、P-7 OPEN。


## 11. R0-A 純政策實作與 fresh 本機驗證（2026-10-03）

### 11.1 授權、起點與 exact inventory

來源為 Owner 直接指令 **R0-A — PURE CONSUMER RETENTION POLICY CONTRACT**（2026-10-03）。授權本節六個新增 source/test paths 及既有本文件，恰七檔，建立一個且僅一個 local commit。起點 branch main，HEAD `f5b9ae0a982b7a2401c7d48e0c7b9387f4955bd7`，本機 origin/main `b70884a013ac67486242fe5d11b9bfad1360032a`，ahead/behind 1/0；tracked/staged diff empty，untracked 只有本文件。指定起始文件 raw SHA-256 `bd0977f365b45d6f88c53d9b44dab08f8a0f22c9f32ff7c77174caaa48101735` 完全符合。六個 source/test paths 原均不存在，scope 及祖先未發現 applicable AGENTS.md；保留 Demo Pool commit，未執行其腳本。

| Exact source/test path | 最終 raw SHA-256 | 行為／用途 |
|---|---|---|
| [packages/shared/src/domain/consumer-retention/types.ts](../../../packages/shared/src/domain/consumer-retention/types.ts) | `410b69792efe8a9464162968059bb7e57c21e7130e7a5b31673715d440dea93d` | readonly fact／identity／grant／period／action／分軸 result 型別；不是 authority authentication。 |
| [packages/shared/src/domain/consumer-retention/policy.ts](../../../packages/shared/src/domain/consumer-retention/policy.ts) | `cd12e822dfa255952a08fa306ff72395966f07cc9830d51bfa1fef3f0b1675b3` | Owner A–F policy version、14/180×24h、six calendar labels、嚴格 explicit-offset instant、明確 report timezone。 |
| [packages/shared/src/domain/consumer-retention/evaluate.ts](../../../packages/shared/src/domain/consumer-retention/evaluate.ts) | `bd2b3605edaa715f996ca1c04e44826b8cf357ca568d499a77d1cd6203675712` | pure evaluateConsumerRetention、grant validation/create/extend/promote proposal、structured unknown 與 display/rights/core 邊界。 |
| [packages/shared/src/domain/consumer-retention/index.ts](../../../packages/shared/src/domain/consumer-retention/index.ts) | `d7bca68c68d56b77b0c3aa154b2fe524c5cc5ecffea75ef8a75912886a6de121` | 僅本模組 exports，未修改 package exports 或既有產品接線。 |
| [scripts/consumer-retention-policy-smoke.mjs](../../../scripts/consumer-retention-policy-smoke.mjs) | `5b749f7019116cd101bdf3909c3437969a26a3810cfa25760b6a11044ec70d15` | actual-source TypeScript VM loader、strict typecheck、16 組 runtime cases、每 case 即時保存 expected/actual/errors。 |
| [scripts/consumer-retention-policy-mutations.mjs](../../../scripts/consumer-retention-policy-mutations.mjs) | `6a8d2cd94a4a57aa9b1da124b4046edbebcfd04c2aaaafb701b2dc676503f76c` | 20 個隔離 actual-candidate mutations；unmutated setup 先通過，核對具體 failure identity／exit，保留 raw evidence。 |

第七檔即 `docs/planning/pc2-activation-preparation/04_RETENTION_CONTRACT_AND_ENGINEERING_SCOPE.md`；保留既有 review、CT-01–CT-07、Q5–Q9、S01–S54 ledger 與後續 packages。本文件不綁自己的 hash／未產生的 commit SHA，避免循環 evidence；二者放最終報告。六檔 hash 綁定此次實際 source/test bytes，非歷史 commit 驗證。

### 11.2 實際 contract／authority 限制

`CONSUMER_RETENTION_POLICY_VERSION = consumer-retention-owner-2026-10-03-v1`。`evaluateConsumerRetention` 接收明確 evaluationInstant、actor/resource、Fact<T>（sourceIdentity/revision/asOf/provenance）、immutable T0 或 MonthBinding、已取得 Grant、目前 Entitlement、material/protection/core/rights、evaluate/create/upgrade Action。支援毫秒精度 ISO instant，Z 或已知 ±HH:MM；拒絕非法日期、未標 offset、-00:00 未知 offset、閏秒及超過三位的小數。UTC elapsed 24h 不用 calendar day／裝置 timezone，T0 不讀 updated_at/created_at/occurred_at fallback。現狀 facts 要與 evaluationInstant 同瞬；historical facts/event 必須不晚於來源 factAsOf，事件序列／重播衝突驗證。不把 stale/current membership 補成歷史 grant。

Detail grant 由 acquisition tier／T0／deadline／policy version 驗證；Free 已延長者須有 U<E14 的歷史 extension，deadline 必須仍 T0+180。降級僅限 display，不縮已取得期限。升級／復訂／編輯不重新起算；now=E 為 due；同 event 重播 noop，signature以UTC同瞬和固定語意欄位排序判定，不因等價offset／propertyorder變化假報衝突；真正衝突或亂序 unknown。輸出deadline正規化UTC。保留期仍 present 的 Paid detail，Free 過14天 hidden，Paid 重顯；collapsed/deleted 不復活。延後處理可信 U<E 的升級仍可計算提案，但 current status 仍使用**已持久化 input grant**，不提前報成已取得180天。

Monthly 以既有 reportId/monthKey/timezone/timezoneVersion/monthBindingVersion/collision 的 immutable binding 評估；active period 與 acquisition/promotion period 以各自明確 zone 和時間驗證，六月份包含當月、跨年不加180天。永久 acquisition/promotion 有歷史證明才承認；降級不撤 permanent，只限制顯示。當前 zone version 不覆寫舊 report 歸月；collision／缺 binding unknown，不幫 legacy 重新分月或生成報告。當月 payload 更新不改 month identity。

Output 分開 retentionStatus、visibilityStatus、originalRecordedAt/deadline/month binding、structured reasons、grantTransitionProposal。Create/extend/promote 僅 proposal，`persisted=false`，不當成有效 receipt；missing acquiredGrant 的 legacy evaluate/upgrade 回 `HISTORICAL_GRANT_MISSING`，不能把現在 Paid 當 acquisition。Create 另需 newResource/acquisition event，且 core allow、rights clear、protection none；純函式仍**不能證明 newResource/resolved/sourceIdentity 來自 authority**，caller 不能藉輸入標籤取得 server permission。未來 R0-B/C 必須從 verified actor／canonical sources 和交易取得、驗新資源／事件並持久化；不把 HTTP body 包裝為 trusted facts。

Core deny／unknown 擋顯示；deletion_required 為 rights_restricted，永久 direction 不蓋過 rights。Training consent 不重新判定、不增加用途，withdraw 不縮 diary grant。私人收藏／unknown protection 的独立保存及顯示 contract 未定時明確 pending/unknown，未造 permanent diary/photo exemption，未採 quota40/200或50/150。所有 results `purgeAllowed=false`，不提供 grant writer、delete/collapse、photo處置、scheduler、DB/Auth/Storage/network/file IO 或法律啟用；due 不是刪除許可。

### 11.3 Tooling、commands 與 fresh execution

既有本機 Node v22.23.1；已安裝 TypeScript 5.9.3，compiler `node_modules/typescript/lib/typescript.js`。唯讀確認既有 `scripts/consumer-runtime-mi-e-c5-r1-capability-flags-smoke.mjs` 的 transpileModule/CommonJS VM 慣例；本輪沿用 compiler／loader 原理，未安裝依賴、改 manifest/lockfile/tsconfig 或既有 harness。Loader 僅讀四個 exact module paths，relative imports 限 module，拒 external imports；VM 不提供 process/console、network／timer traps，Date 無參數及 Date.now 會失敗。執行的是 candidate exports，不是 source-text replay。

Strict typecheck 使用 ts.createProgram 四檔，strict/noEmit、ES2022/ESNext/Bundler、types=[]、lib.es2022及Intl、skipLibCheck=false；只檢查本包，不重跑產品 build 或無關478 suites。Mutation runtime 使用相同 transpile loader，checkTypes=false，讓行為破壞（含本包沒有的 fetch/Date.now）實際執行並被行為／IO traps 拒絕；syntax/import/setup failure exit2永不算成功 negative control。

以下 fresh commands 在 repository root 執行，stdout/stderr 保存於 `/tmp/r0-a-20261003`，主結論與 bindings 在本文件，不以 /tmp 存活作驗收前置。每個 runSmoke case 在 evaluator 返回前寫自己的 ACxx.json（expected/actual/check identities、message、stack、exit）；每個 mutation raw.json 先保存後才做 control evaluator，另有每檔 before/after hash 和 exact in-process runSmoke command。16 cases 全部續跑，某 case failed不會early-exit整份suite。

| Command／gate | Exit | 實際結果 |
|---|---|---|
| `node scripts/consumer-retention-policy-smoke.mjs packages/shared/src/domain/consumer-retention /tmp/r0-a-20261003/smoke-reviewed-offset` | 0 | Strict typecheck diagnostics=[]；16/16 cases，525 assertions，ioAttempts=[]。完整 stdout/stderr及result.json；source hashes與§11.1相符。 |
| `node scripts/consumer-retention-policy-mutations.mjs packages/shared/src/domain/consumer-retention /tmp/r0-a-20261003/mutations-reviewed-offset` | 0 | 正常 candidate setup先16/16 PASS，20/20 behavioral negative controls成立；每份 corrupted candidate exit1並有下表具體failure。原candidate hash unchanged。 |
| `node /tmp/r0-a-20261003/focused-checks.mjs` | 0 | 四production modules的TS AST查imports/global IO/implicitDate/timezone；七paths UTF-8/LF/noBOM/EOF、trailing whitespace、secret patterns；未見缺口。 |
| 54-source bindings＋起點 frozen bytes/index comparison | 0 | 54引用存在且raw SHA-256/Gitblob符合§10；3,333原tracked raw bytes/modes及原index(mode/blob/stage)entries全未變；142migrations未變。 |

首次初稿 strict typecheck 曾exit2（Upgrade泛型推導），已於authorized evaluate.ts修正；沒有當成runtime PASS。增加monthly persisted-promotion/create-denied case後，兩個mutation descriptors原先預期較晚CHECK，fresh candidate實際先觸發 `PERSISTED_MONTH_PROMOTION`／`UNKNOWN_VISIBILITY`，該次mutation gate exit1如實保留於mutations-final。只把descriptor對到更早且同契約的實際failure，不改／弱化任何assertion；最後 reviewed完整group已exit0。提交前offset複核另確認deadline raw表示與同event不同offsetsignature缺口，修正僅在原授權evaluate.ts與兩tests；新增M19/M20後16cases/525assertions與20controls fresh重跑exit0。這不是歷史review重播，也不是新增productregression或PC-2remediation。

### 11.4 AC01–AC16 實際 cases

| Case | 覆蓋與實際結果 | Assertions | Exit |
|---|---|---|---|
| AC01 | PASS — Free/Paid E−1ms/E/E+1，E14=2026-10-15、E180=2027-03-30，due不可顯示/不可purge。 | 30 | 0 |
| AC02 | PASS — Z/+08/−07 同瞬T0、evaluationInstant及deadline；deadline輸出正規化UTC，anchor/display一致。 | 21 | 0 |
| AC03 | PASS — 跨日、跨年、2024閏日、DST開始/結束、三travelzones，elapsed期限一致。 | 48 | 0 |
| AC04 | PASS — updatedAt/occurredAt變動不續期；缺T0仍unknown。 | 9 | 0 |
| AC05 | PASS — Paid grant day10/day30降級：E180不縮、day30hidden。 | 10 | 0 |
| AC06 | PASS — U=day13延到原T0+180，output acquired E14不假寫入，persisted=false。 | 6 | 0 |
| AC07 | PASS — 相同event及等價offset重播、後續upgrades、持久化extension後等價offset noop、U=E/之後不延長、event衝突/乱序拒。 | 30 | 0 |
| AC08 | PASS — day100Paid重顯，day181expired，missinggrant不從Paid補歷史。 | 12 | 0 |
| AC09 | PASS — collapsed/deleted不顯示、不延長、不復活。 | 8 | 0 |
| AC10 | PASS — May–Oct/Aug–Jan六月份，首/末含、之前一月due，partialupdateidentity不變。 | 26 | 0 |
| AC11 | PASS — window內promote、window外noop、missinggrant/已刪report不能造永久。 | 16 | 0 |
| AC12 | PASS — Paid永久降級hidden/復訂visible、rights限制；持久化Free→永久promotion重播不撤/不重做。 | 21 | 0 |
| AC13 | PASS — UTCv1舊report/currentLAzonev2/travel不改歷史binding；collision/missingversionunknown。 | 15 | 0 |
| AC14 | PASS — 缺/矛盾actor/resource/source/revision/provenance/T0/deadline/tier/policy/period/month/zone/grant/illegaloffset和dates均structuredunknown。 | 204 | 0 |
| AC15 | PASS — deep-frozen inputs每次byte-equivalent；core deny/unknown不顯示、trainingwithdraw不縮grant、favorites pending、VM ioAttempts=[]。 | 19 | 0 |
| AC16 | PASS — create acquisitionFree/Paid不受相反currenttier替代；detail14/180、monthlyFree/永久proposal；legacy缺grantunknown；core/rights/protection拒create。 | 50 | 0 |

這些是本輪 R0-A synthetic local checks；獨立 acceptance 尚未執行。原 S03 的 Development/retention/training/backup/rights cases未執行，沒有回寫為 PASS。

### 11.5 Actual-source mutation identities

每份只改 repository外四TS檔隔離副本中的exact target一次，before/after SHA-256及四檔copyinventory在individual control.json；unmutated正常setup PASS前提成立。判定要求phase=CANDIDATE_EXECUTED、candidate exit1、對應ACxx與具體failedCHECK/runtimeerror；不以failtotal或setupfail判定。

| Control | Corruption／target | Failed case／實際failure identity | Candidate exit | Control |
|---|---|---|---|---|
| M01_FREE_13 | `policy.ts` actual bytes mutation | AC01 / `Error: CHECK_FAILED:DEADLINE_free` | 1 | PASS |
| M02_PAID_179 | `policy.ts` actual bytes mutation | AC01 / `Error: CHECK_FAILED:DEADLINE_paid` | 1 | PASS |
| M03_LOCAL_INSTANT | `policy.ts` actual bytes mutation | AC02 / `Error: CHECK_FAILED:DEADLINE_OFFSET_CANONICAL` | 1 | PASS |
| M04_UPGRADE_RESET | `evaluate.ts` actual bytes mutation | AC06 / `Error: CHECK_FAILED:UPGRADE_ORIGINAL_ANCHOR` | 1 | PASS |
| M05_DOWNGRADE_SHRINK | `evaluate.ts` actual bytes mutation | AC05 / `Error: CHECK_FAILED:DOWNGRADE_NONSHRINKING` | 1 | PASS |
| M06_DISPLAY_COUPLED | `evaluate.ts` actual bytes mutation | AC05 / `Error: CHECK_FAILED:DISPLAY_SEPARATE` | 1 | PASS |
| M07_REVOKE_PERMANENT | `evaluate.ts` actual bytes mutation | AC12 / `Error: CHECK_FAILED:PERSISTED_MONTH_PROMOTION` | 1 | PASS |
| M08_SEVEN_MONTHS | `policy.ts` actual bytes mutation | AC10 / `Error: CHECK_FAILED:SIX_MONTHS_INCLUDING_CURRENT` | 1 | PASS |
| M09_EXCLUDE_CURRENT | `policy.ts` actual bytes mutation | AC10 / `Error: CHECK_FAILED:SIX_MONTHS_INCLUDING_CURRENT` | 1 | PASS |
| M10_INFER_HISTORY | `evaluate.ts` actual bytes mutation | AC08 / `Error: CHECK_FAILED:UNKNOWN_RETENTION` | 1 | PASS |
| M11_RESURRECT | `evaluate.ts` actual bytes mutation | AC09 / `Error: CHECK_FAILED:NO_RESURRECTION` | 1 | PASS |
| M12_PURGE_UNKNOWN | `evaluate.ts` actual bytes mutation | AC14 / `Error: CHECK_FAILED:PURGE_FORBIDDEN` | 1 | PASS |
| M13_EXPIRED_UPGRADE | `evaluate.ts` actual bytes mutation | AC07 / `Error: CHECK_FAILED:EXPIRY_UPGRADE_NO_EXTENSION` | 1 | PASS |
| M14_FETCH_IO | `evaluate.ts` actual bytes mutation | AC01 / `Error: IO_FORBIDDEN:fetch` | 1 | PASS |
| M15_CLOCK_IO | `evaluate.ts` actual bytes mutation | AC01 / `Error: IO_FORBIDDEN:Date.now` | 1 | PASS |
| M16_CORE_BYPASS | `evaluate.ts` actual bytes mutation | AC15 / `Error: CHECK_FAILED:CORE_ELIGIBILITY_BOUNDARY` | 1 | PASS |
| M18_CREATE_CORE_BYPASS | `evaluate.ts` actual bytes mutation | AC16 / `Error: CHECK_FAILED:UNKNOWN_VISIBILITY` | 1 | PASS |
| M17_REMAP_HISTORY | `evaluate.ts` actual bytes mutation | AC13 / `Error: CHECK_FAILED:HISTORICAL_ZONE_IMMUTABLE` | 1 | PASS |
| M19_RAW_EVENT_IDENTITY | `evaluate.ts` actual bytes mutation | AC07 / `Error: CHECK_FAILED:EQUIVALENT_UPGRADE_REPLAY` | 1 | PASS |
| M20_RAW_DEADLINE | `evaluate.ts` actual bytes mutation | AC02 / `Error: CHECK_FAILED:DEADLINE_OFFSET_CANONICAL` | 1 | PASS |

M01/M02改14→13/180→179；M03把offset UTC還原改localinstant；M04從upgrade時點重算180；M05降級縮180；M06把retained當visible；M07降級撤永久；M08/M09七月份/排當月；M10從currenttier捏造歷史；M11已刪/收合變visible；M12unknown可purge；M13到期瞬間仍升級；M14/M15偷接fetch/clock；M16跳coregate；M17用新zone覆舊binding；M18跳createcore/rights/protectiongate；M19把同瞬offset／不同propertyorder當event衝突；M20輸出未正規化deadline。No network實際發送；IO trap在VM內先throw。所有individual完整observations、failure stacks及expected/actual保留，不從parenttotals重建證據。

### 11.6 Frozen scope、提交 gates 與未生效能力

本輪fresh frozen proof為所有3,333原tracked paths的raw bytes/modes，以及原index(mode/blob/stage)entries對照；S01–S54 raw/sourceblob仍符合，142 migrations全未改。包含DemoPool兩scripts、原01–03、產品、dependencies/manifests/lockfiles、法律草案與registry。Stage/commit只允許§11.1六檔加本文件，恰7個A paths。正常stage會改index，因此只比較原entries，不freezeindex原始檔案hash。

提交使用已確認Owner Windows Git設定來源 `/mnt/c/Users/Mufan/.gitconfig` 的name/email（經git config --file --includes核對），必要時单次 -c，不修改global。提交前exactinventory、raw/stagedhash、cached diff check及outsidefrozenproof須全過；提交後必重跑smoke/mutations、committed/worktreehashes、exactdelta/diffcheck、originaltree/indexentries/modes和scope外rawbytes/finalGit。此文件僅記錄precommit執行結果與postcommit必須gate；最終報告提供成功commit及freshpostcommit結果，不為寫SHA再改committedbytes，不amend／第二commit。

**尚未生效**：R0-B authoritative T0/event/membership/retentiongrant/timezone/month版本持久化、legacybackfill与原子写入；R0-C server/UI顯示/RLS/read authority；R1monthlymaterialization、R2私人收藏/quota、R3collapse/purge、R4photo、R5rights/trainingcopies/log/cache/backup/restore。未新增migration、schema、scheduler或runtimewiring；realworld缺authoritymetadata仍unknown。Q5–Q9及qualifiedreview保持pending，40/200vs50/150未裁决，照片/训练/backup期限未採用draft数字，OD-15、TD-10/AU19、P-7 OPEN。

Reused evidence：已接受PC-2 local acceptance、Owner A–F規則、先前資料流review／CT差異／原source ledger；本輪不把它們宣稱fresh產品PASS，不重跑478 suites/DBfreshapply/build/Development。Fresh evidence：本節實際candidate/loader/typecheck/smoke/mutations、encoding/purity/inventory/54hash/frozenproof。沒有push/fetch/deploy、remoteDB/Auth/Storage/ManagementAPI、legal/registryactivation；不執行DemoPool、PC-3/GQA-7/GroupTable。

Return：**READY_FOR_R0_A_LOCAL_ACCEPTANCE**（單一本機freeze及postcommit成功後由最終報告確認）。PC-2 local acceptance維持通過；R0-A independent acceptance尚待完成，法律DRAFT / NOT ACTIVE，activationpending。停止於報告，等待獨立acceptance。
