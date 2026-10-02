# PC-2 啟用準備：Publication 與既有會員 rollout 計畫

狀態：**PROPOSED — PREPARATION ONLY — NOT AUTHORIZED TO EXECUTE**。日期：2026-10-02。基準 `main`，HEAD = `origin/main` = `8e749f60e4e76ac09bb57195af1793575f5ed0cf`，ahead/behind `0/0`。已是 **PC_2_LOCAL_ACCEPTANCE_PASS / LOCAL_ACCEPTED_PUSHED**；三法律草案仍 **DRAFT / NOT ACTIVE**，live signup 未 closure。

Owner facts、已核定決策、未決問題與來源層級集中於 [01](01_OWNER_FACTS_AND_DECISIONS.md) §1–10。本文引用剩餘 Q1–Q10，不重複問 owner 選 B／年齡範圍。Development 操作驗收項目見 [03](03_DEVELOPMENT_ACCEPTANCE_RUNBOOK.md)。

## 0. Owner decision sync（2026-10-02；規劃方向不是啟用批准）

Owner A–J 的完整來源／證據類別、未決 facts 與 source gaps 集中於 [01 §4–9](01_OWNER_FACTS_AND_DECISIONS.md)。台灣公司營運方向已定，名稱／統編／地址／設立承接及公司批准權仍 pending；聯絡管道尚未建立，公司成立後指定處理責任。初期 Owner 最終核准、穩定聘法務後交接，是流程方向，未取代公司授權、qualified review 或 exact-byte approval。

Only-photo-AI-prepaid 與 only-owner/tester/no-external-member 是 **Owner-stated fact**，非合約設定、遠端帳號盤點或同意證據。E/F/G 必須另授權核對實際 account classifications／duplicates；測試人員亦須逐人明確接受正式三件文件及獨立 Social 成年聲明，不補造 cohort、consent 或 age。

重要條款／reconsent／服務資格切換用 **Email＋App 內同步**；先取得實際通知內容、時區／窗口、送達／未達重試、responsibility與recovery證據，再進 F。現有飯友 Push 事件不支援此合約，不能假稱已傳送或以 reminder 當 grant。Owner 未要求 real-member fixtures；不得新增。

訓練新增方向允許精準位置／健康／疾病 **僅在不能直接或間接識別個人條件下** 納入；身分／聯絡排除、聊天目前排除。A 草案 §3 的位置／健康排除與新規劃衝突須由 A 的法律審閱解決；本輪不改三草案。每次 future data/use 擴充先具體範圍與必要性、工程識別風險／法律 review、clean bytes版本／approval binding、告知及必要同意；不是現有會員授權或 blanket future scope。供應商僅受託、不得自用訓練須合同／設定核實；`store:false` 不足。

C 的 14/180 天日記、6 個月／永久月評分、私人永久收藏與歷史 40/200 額度是產品方向，原圖／縮圖／staging／training copies／刪帳／backup／restore 需各別交付。24h/30d/90d 仍 proposal；UI query/隱藏/重置不能取代 executor。01 §8 記錄矛盾舊 demo 文案，不因本輪決策編輯產品。

首次正式註冊計畫 **付費會員＋餐廳收費同步啟用**；故正式 commercial launch 需 §7 額外依賴，不得先把 signup closure／local consent PASS 稱為 launch-ready。399／990／1,740／3,000（NT$）保留，299 **NOT ADOPTED / HISTORY ONLY**，早鳥原價不改。14 天試用→399monthly auto-renew、explicit訂閱確認、取消 next charge／當期保權益及例外退款，是新方向，現有 payment stub 未落地。取消截止以平台核實，-3提醒／-1App取消入口不是截止時間。歷史 earlybird本人/朋友 duration與正式上市後3個月朋友碼規則見01 §4 J；本人起算、延期未交付和獨立批准仍缺。

餐廳正式啟動後自行反悔不退款；unused-future-month 成效退款例外待新合約，metrics/period 首個營運月實際流量後另定。無數字／公式／現成 guarantees，不回填歷史 Activation Code／業績契約。首期 launch 不可出售未定的成效保證；若商業 launch 要求先提供此保證，須重新排列依賴或等待資料與新批准，不能用假設數字通過 gate。

## 1. 本計畫採用的 actual contracts

以下 F/G/L/U 對應 [01 §2 source table](01_OWNER_FACTS_AND_DECISIONS.md)。工程歷史提案與目前 source 必須分開：

| Contract / exact source location | 當前實作與計畫後果 |
| --- | --- |
| F `document_versions`，lines 13–22 | 每個 `(document_id,version,locale)` 固定 `consent_type`、完整 `content_text` 與 SHA-256(UTF-8 exact bytes)。DB digest 不對文字做 LF normalization；hash 不是 approval。 |
| F `document_approvals`，lines 23–30 | FK 精確 bind ID/version/locale/hash；`publication_sha256=content_sha256`；`effective_at>=approved_at`；approval reference 非空。不查外部 receipt 的真實權限，所以必須在獨立 approval/release 審閱核實，不能用自填 reference 取得核准。 |
| F `required_bundles` / `rollout_state`，lines 31–47 | Bundle 精確指定 Terms/Privacy/Training 三件、`zh-TW`、effective/retired time；singleton rollout 指定一個 bundle，default `enforcing=false,bundle_version=null`。無 per-user enforcement、通知期限或 grace timer。 |
| F immutable triggers，lines 63–70 | Document、approval、bundle 都不能 UPDATE/DELETE，包含 effective/retired metadata。不能靠修改同 identity 的正文或日期修錯；後續 replacement identity/transition 必須新批准與另授權。 |
| F `current_bundle()`，lines 82–93 | 必須 `r.enforcing`，selected bundle 與全部三件 approval 的時間有效、hash 一致、exact count=3 才有 DTO。它不從 shared manifest 的 `active` label 推導真實批准。 |
| F `has_current_consents/core_eligible/social_qualified`，lines 94–111 | Exact current per-document `doc:<id>@<version>`、`zh-TW`、未撤回。Only inactive preparation 可由 captured cohort 保留 baseline compatibility。Enforcing 時無 legacy exemption；Social 還需當期成人自我聲明及 participation/current pair conditions。 |
| F `accept_required/owner_lock`，lines 112–117、170–185 | rollout singleton row SHARE → owner consent lock；exact presented bundle＋sorted document ID/version/hash；不得把 stale submission 換新版本。版本/locale 由 current server bundle 決定，沒有客戶端 supplied owner。 |
| F complete/grant/withdraw，lines 186–231 | 三項 explicit true，consent＋sole active profile 同一交易；withdraw canonical training 並 pause Social；re-grant 新 lifecycle，不 resume Social。Terms/Privacy 不被清除，unrelated/legacy namespace uniqueness 保留。 |
| G `authorized_candidates/create_meal_buddy_card` / restrictive gates | Actor 與 candidate 的 current core/age/participation/profile/block 仍須成立；新 direct card writer 已 gate。Pause/opt-out/withdraw 的 retained records 不代表可讀／可聊，沒有刪資料承諾。 |
| U `controller.ts/types.ts/consent-document.tsx` | **目前正文來自 `get_consumer_required_documents()` 的 DB DTO**，viewer 用 Text 顯示 content/identity。Parser 查完整三件／格式；不是離線 Markdown mirror，也沒有自行重算正文 digest。Server DB constraint/digest 是現行 runtime binding，release acceptance 還須比對正式 publication bytes。 |
| Shared [types.ts](../../../packages/shared/src/domain/consumer-consent/types.ts)；L §3.2 | Shared registry 僅 `development_placeholder`。`approvedDocumentContent.ts` 與三個 `docs/legal/consumer/...` 尚未建立；L 所述生成 mirror 是提案，不能寫成已存在的 runtime 依賴。未來 exact activation ledger 必須決定其實際使用/同步方式，不能以加 active 字串或 populated hash helper 當批准。 |

Migration source 中 zero document/approval/bundle rows，inactive rollout；本輪沒有檢查遠端 rows、設定或部署版本。Raw source、local accepted 行為與遠端現況不能互換。

## 2. 不能分開的 gate 與時間限制

**Formal runtime document availability 與 enforcement 使用同一 singleton。** 在 `enforcing=false` 時，即使先插 approved rows，`current_bundle()` 仍 null；正式 onboarding/re-grant 不可用。當 `enforcing=true` 且有效 bundle 成立時，所有 captured legacy owners 立即依 current exact consents/age 判定，不再有 compatibility。

因此本計畫可以先完成通知、static publication、approval 記錄及 inactive readiness；不能宣稱可先用現行 RPC 收集既有會員正式同意，再另切 enforcement，也不能從批准的 future-effective bundle 推導 grace period。`enforcing=true`＋future/retired/missing bundle 會先失去 legacy compatibility，documents/core 都拒絕；不能提早切 true 等 effective time 自動到來。

Owner 選定 D-01 必須容納 engineering readiness。若未就緒而要改 effective instant，immutable approval/bundle bytes 不能原地調時；回到新的 identity/approval/review gate。本輪不選日期／通知期／寬限期。若 owner 要逐 cohort pilot、先 consent 後 enforcement 或獨立排程，這是 **現有實作不支持的 future scope proposal**，先停並另授權，不加快捷开關。

已有 `opted_in` 且 true age/current core 均成立的會員可以延續其原 participation；沒有製造新 opt-in。現有 paused 必須 explicit resume、absent 必須 explicit opt-in。Withdrawal 或 false age 自動 pause；re-grant/true age 不恢復這個 paused state。通知與 core reconsent、age attestation、Social transition 是三件不同的 evidence。

## 3. Proposed sequence A–G

實際依賴：**A → B → C → D 的批准凍結**；**E 的 remote read-only inventory 可於另授權後與 A–C 平行，但 apply/ready 必須在 F 前完成**；**D/E/通知及 exact activation delta acceptance → F → G**。批准凍結與 runtime effective activation 分開記錄。下面任何 remote read/mutation 都 **NOT AUTHORIZED IN THIS PREPARATION TURN**。

### A. 法律文件事實補齊與 qualified review

| 欄位 | 計畫 |
| --- | --- |
| Preconditions | 01 §4 A–J 已答方向＋Q1–Q8 尚缺事實、公司成立後 qualified review；已核定 B、Social-only 18+、醫療限制保持；未知欄位仍 OWNER INPUT REQUIRED。 |
| Exact target surfaces | R §1–5、三草案 T/P/A；OF-01–05、PC-02–17 中尚未核准者及 OD-15/TD-10/AU19/P-7。這些本輪原 bytes 不改。 |
| 執行者／authorization | Owner 資料責任人、qualified legal reviewer、另授權工程 metadata reviewer；必須另外明確授權原稿修訂／設定查證。 |
| Evidence | 事實來源/日期、範圍/限制、legal review receipt、可交付營運程序；台灣公司成立／承接證據及 Owner 公司批准權；處理者/地區不從 SDK 推測；training location/health 草案差異、保存／退款／預售／訂閱需修清單；不附 secrets。 |
| Stop／rollback | 不可核對主體/管道、實作不能交付承諾、需要新 consent/age/rights 功能時停在缺口與 exact scope proposal，仍不批准草案。 |
| Next gate | Owner 確認 facts/policy；法律列明 final wording/限制，進 B。 |

### B. Final clean publication bytes

| 欄位 | 計畫 |
| --- | --- |
| Preconditions | A 完成；文件 version、locale、預定 effective 資訊已協調；pending appendix 不能直接發布。 |
| Exact local targets | L §3.2 擬定 `docs/legal/consumer/membership-terms/v1.zh-TW.md`、`docs/legal/consumer/privacy-policy/v1.zh-TW.md`、`docs/legal/consumer/ai-training-terms/v1.zh-TW.md`；**尚不存在、未授權建立**。若改版本須先凍結新 exact ledger。 |
| 執行者／authorization | 經授權 legal editor/executor，產生可 review clean artifacts；本輪不產生或編輯三份法律文件。 |
| Evidence | 完整 final title/ID/version/locale/effective text、已補 operator/contact/disclosures，移除 DRAFT/markers/appendix/未選方案/待補；strict UTF-8/LF/no BOM/final newline/no trailing whitespace；SHA-256 exact raw bytes，放外部 receipt，不 self-hash。 |
| Stop／rollback | 發現漏 facts、文案與 B/recovery/age/training scope 相抵、encoding 或 hash 不一致，停止待編修；draft hash 或 renderer HTML hash 不可 substitute。 |
| Next gate | 对完整 final clean bytes 獨立 approval；任何再編輯使舊 approval 不適用。 |

### C. Owner approval 與 publication binding

| 欄位 | 計畫 |
| --- | --- |
| Preconditions | B artifacts 已固定；有權批准者及 legal review 可核實；不能自核 candidate record。 |
| Exact targets | Final legal artifacts；外部 immutable approval receipt；未來 F `document_versions` / `document_approvals` 的完整三件 binding。Published location/承載方式由 exact activation ledger 記錄，本輪不猜 domain。 |
| 執行者／authorization | 具公司授權的 Owner（未來法務交接另留證）＋legal reviewer 批准 exact bytes；executor 只核對／搬運經批准內容。真實網站發布、approval rows insert 均需別次 mutation authorization。 |
| Evidence | ID/version/locale/raw hash、批准人 authority/日期/reference/範圍、publication raw hash、required B 後果；candidate 自算 hash 或非空 approval_reference 不代表批准。 |
| Stop／rollback | Receipt 身分／內容不可查、publication 與批准 bytes 不等，停止；不把 synthetic fixture receipt 用作 owner approval。尚未 runtime active 可維持 preparation，既有 immutable rows 不改寫。 |
| Next gate | Approved final set 可稱 DOCUMENTS_APPROVED_NOT_ACTIVATED；進 D/E exact release planning。 |

### D. Effective time 與 exact required bundle 凍結

| 欄位 | 計畫 |
| --- | --- |
| Preconditions | C 的三份 exact approval；Q9/Q10 timing/impact owner 核定；E readiness 可在窗口前交付。 |
| Exact targets | F `required_bundles`、`rollout_state.bundle_version`；approved timestamps、三件固定 ID/versions、`zh-TW`、publication hashes；L §2 successor gate／shared placeholder 保留。 |
| 執行者／authorization | Owner/法律決定 effective time；Planner/executor 凍結 later exact activation migration、source/inventory/review evidence；本輪不生成 migration、不 reseal。 |
| Evidence | UTC instant＋顯示時區、各 `approved_at<=effective_at`，所有 bundle/doc 有效區間含執行窗口；單一 selected bundle，raw artifact↔SQL text↔DTO viewer parity。Approval、binding insert、rollout transition 的新 exact delta 及獨立審閱。 |
| Stop／rollback | 未達時間、版本混搭、partial/retired bundle、演算法/產品 scope 外更改、missing new successor evidence，停。不能把 shared helper 的 filled hashes 當完整核准。 |
| Next gate | 新 publication/activation delta 的 local independent acceptance，E readiness，Q10 通知完成，才授權 F transition。原 PC-2 local PASS 保持，不重跑原 478 sweep。 |

Activation 需要新的受審閱 delta；既有 114-path seal 不批准任何未來法律/registry bytes。L §2 的 MI-E-C1 exact successor 與 proposed activation validator names 是契約提案，不能假稱已建置；新增 exact paths/CLI-generated migration name 要在後續授權前列出。若採 DB DTO 作唯一 runtime 正文，需明記與已批准 legal files 的生成/binding/approval 證據；若採 module mirror，需另授權其 source、viewer 與 parity validation。兩者不能形成各自編輯的法律真相，不能用未正式 publication 的 DTO 快捷啟用。

### E. Development migration / inactive readiness acceptance

| 欄位 | 計畫 |
| --- | --- |
| Preconditions | 有明確 Development project identity、remote read-only scope/permission；別次 apply 授權；不能由名稱/環境旗標猜實際 project。 |
| Exact targets | Remote `public.consumer_profiles` duplicate inventory；migration history/actual definitions 與本 repo 142 份逐項對帳；兩件 F/G migration；六 private tables／grants／RLS；實際 Consumer Edge releases、mobile/web build/redirect。 |
| 執行者／authorization | 經授權 Development operator/inventory reviewer，先 read-only；duplicates 每組單獨 remediation approval，不能先 apply 再選一列。DB/Auth/Storage/Edge/config 任何 mutation 都需別次明確授權。 |
| Evidence | Pseudonymized conflicts、沒有自動 merge/delete；實際 history/roles/objects/source hash；inactive `enforcing=false,bundle_version=null`、zero seed legal rows、captured cohort 原 profile IDs；新 incomplete 拒絕、不繼承 legacy；readiness cases I0–I6（03）。 |
| Stop／rollback | History drift、unknown grant、UNIQUE 衝突、post-baseline owner 被誤分類、錯 project、非預期 remote rows 即停。Migration begin/commit 各自交易，不能宣稱兩檔／多次部署天然原子；foundation 已成功而 gates 失敗需受控 forward repair，不刪 schema/資料或 rerun cohort capture。 |
| Next gate | Inactive readiness PASS；不稱 real signup PASS、不收 synthetic consent、不因此關閉法律/governance。 |

特別是 `preparation_cohort` 的 capture 发生在 **實際 apply foundation 時**，不是 repo commit 時。要在 apply 前記錄現有 owners/profile IDs 與預期 cohort；不在真實 target 用測試插 profile 再 capture 來假造 legacy。已 apply 過不可重 capture；remote duplicates/readiness 不由本機 zero duplicates 推定。

### F. Existing-user rollout 與 enforcement activation

| 欄位 | 計畫 |
| --- | --- |
| Preconditions | C/D exactapproved publication＆新 delta local acceptance、E inactive readiness；Q8/Q10 已定 Email＋App 內通知的實際運作與送達、membership 影響、窗口和 recovery operations 可交付；受控 Owner／測試人員有合法範圍及另授權帳號核對，仍須正式三件同意／Social 成年聲明；不得推定 Owner 說無外部會員即 inventory 完成。 |
| Exact targets | Approved document/approval/bundle inserts（若尚未做）；指定 rollout singleton `enforcing/bundle_version`；Consumer DB/Edge/client 一致 release。通知不寫 consent/age；future transition transaction 需依 F row lock boundary 設計並獨立 review。 |
| 執行者／authorization | Owner rollout decision＋Development operator exact mutation authorization；限定 Development、bundle ID/時刻、執行者、測試帳號及 stop/recovery policy。**NOT AUTHORIZED IN THIS PREPARATION TURN**。 |
| Evidence | 真實通知內容/送達或未達記錄；切換前後 DTO、legacy core/age/participation 分類、UTC DB clock/selected effectivebundle；transaction/row-count receipt；每會員 explicit consent/age 與既有 participation 不混寫。 |
| Stop／rollback | 未核准／未 effective／publications mismatch、操作角色不足、recovery 不能用、預期外鎖帳、client/server 不一致即停，不繼續 signup closure。回復限制見 §5。 |
| Next gate | Approved activation acceptance（03 A0–A13）；不因 rollout row 變 true 便稱 PASS。 |

通知期可在 runtime switch 前安排，但本計畫不指定時長。現有程式不能在 preparation 先收正式新 consent；切換後缺三項者 core 拒絕，缺 adult 者 Social 拒絕，保留 recovery。Owner 必須知悉此影響與合法通知義務；如不同意此能力邊界，先提出另案而非默默加 grace。

### G. Live acceptance / signup closure

| 欄位 | 計畫 |
| --- | --- |
| Preconditions | F transition 合法完成；same exact build/DB/Edge/approval set，configured callback 與 email 送達路徑可驗收；approved/受控測試人員，不使用 disposable synthetic bundles 當 target 設定。 |
| Exact targets | `/login` signup、`/auth-callback` PKCE、`/onboarding` exact consent、F public DTO/writerRPC、core RPC/Storage/Edge、Social 原 entrypoints 與 `/account-support` recovery。 |
| 執行者／authorization | 獨立 Development acceptance reviewer＋有明確帳號/資料 mutation 授權的 executor；匿名 read 與 Auth 讀取也需其 scope。本輪完全不執行。 |
| Evidence | 明確區分 session-issued 與 no-session/confirmation 實際分支，實際 configuredredirect、唯一 profile/原子 consents、refusal/withdraw/regrant、server directdenial 和 retainedrecord/cacheread；每項 command/actor/exit/response/source identity/redactedraw。 |
| Stop／rollback | 任一 actual source/target 不符、實際 email/callback 未證實、負控制只 setup failure、history loss、silent Social resume、必需 recovery 不運作，維持 live gate BLOCKED。 |
| Next gate | 獨立 LIVE acceptance 才可能記 DEVELOPMENT_ACTIVATED_LIVE_ACCEPTED／signup closure；Production、治理 blockers、training/deletion/reporting/billing 各另有批准，不能自推 PRODUCT_CLOSURE。 |

## 4. Fail-closed 與會員證據界線

- Signup adapter 的 admission 會 reread `get_consumer_required_documents()`；已知 unavailable／callback 缺失時不呼叫 `auth.signUp`。這不是關閉 Supabase Auth public signup endpoint 的保證，外部呼叫可建立 incomplete Auth account，DB consent/provisioning 仍拒絕。
- Incomplete new account 不加入 capturedcohort；profile 存在也不等於完成。Inactive preparation 的 legacycompatibility 不等於同意新文件、訓練 grant 或成年；inactive/deletedprofiles 仍不准 core。
- Enforcing with 缺失／partial／future／retired／invalidbinding 時無 current bundle，completion 與 core 拒絕；不 fallbackplaceholder 或轉換旧 acceptance。同一交易完整 validate、失败不留 profile-only 新寫入。
- Static publishedapproved 文檔可獨立閱讀，但現行 `/consent-document` 只讀 currentDTO，outage/inactive 時是 unavailable，沒有內建離線 fallback。正式 documents/rightscontact 的 outage 可用性要列入 future release/readiness，不把尚未建立的 static website 說成現有入口。
- Refusal 不寫 training；withdraw 有歷史＋pause；regrant 僅 currentexact bytes，仍須其他 requiredconsents，沒有 Social implicit resume、餐廳商品圖授權或 training pipeline。
- Pause/optout/withdraw 保留 relationships/messages/cards；fresh server reads 重新授權；clientinvalidate/late-resultdiscard 不能承諾收回已下載 bytes、取消所有 in-flight work 或抹除 backup。

## 5. Stop / recovery 限制（不執行）

| 發生點 | 可準備的實際回復方式／限制 |
| --- | --- |
| 未插 registry、未切換 | 保持原 preparation；移回審閱／補 facts，未發生會員 grant。不可把草稿發布試看當批准。 |
| 某 migration / binding transaction 失敗 | 未 commit 交易本身 rollback；已 commit F/G/approved immutable rows 不自動消失。先記錄 actual state，別次授權 forward fix／new identity；不 reset 資料、disable immutable trigger 或重跑 capture。 |
| `enforcing=true` 但 bundle 無效／未 effective | Currentbundle 為 null，保留 deny，停止新增 acceptance 與 liveclosure；管理 read/recovery 不加 core gate。修 approved binding/部署/可用文件需獨立 review 和 authorization；不拿 fixture 填缺口。 |
| 已 active 後 client/Edgeoutage | 保存已記 consents/withdrawals；先停止受影響驗收、保留證據與可用 rights/logout。部署回退不得去掉 PC-2servergates 或權利入口；targetrelease/recovery 方案另授權。 |
| 擬將`enforcing=false`當 undo | **不是安全通用 rollback**：current bundle 變 null，正式 onboarding/regrant 停止，capturedcohort 可恢復 compatibility，可能重新允許已撤回者 core／缺 age 者 Social；row 切換不自動 undowithdrawpause。除非 owner/法律/安全 review 明確批准此影響，不能使用。 |
| 更換 bundle 或日期 | Immutable rows 不改，current pointer 換到其他 bundle 也可能使 consentsoutdated/core denial，並不是無影響 rollback；必須新的批准、通知／impactreview、exact scope 及 acceptance。 |

沒有資料 rollback 可以替會員補造 grant、清 withdrawn_at、預設成年、重建/自動 resume Social，或撤销已送通知。本計畫沒有一個未核准的「開啟服務」命令。

## 6. 本輪停止點與下一 authorization

本輪只有本文件與 01/03，三份均 untracked；原產品/migrations/scripts/records/legal/preparation bytes 不改，不 stage/commit/push/deploy/remote DB/Auth/Storage/activation。下一個**具體 gate**：READY_FOR_OWNER_DECISIONS_SYNC_REVIEW；Planner/Owner 審閱已答 A–J 與剩餘 Q1–Q10＋單一 enforcement/effective 限制及 recovery 風險，補 facts 並安排 qualified review。

後續分開授權：(1)可核對 Developmentidentity 的 remote 只讀 duplicate/history/config inventory；(2)經 owner/法律確認後的 finalcleanpublicationexact bytes 制作與獨立 approval；(3)精確 activationdelta 實作/localacceptance；(4)通過 preconditions 才授權 Developmentapply/transition/liveacceptance。這些授權並未由本輪計畫授予。

## 7. 正式註冊＋同步收費的額外依賴（NOT IMPLEMENTED / NOT EXECUTED）

A–G 是 consent/publication/Development 規劃，不包辦金流、保存、訓練、營運或正式商業啟用。依 01 §8 source review，最小依賴如下；每一施工／外部核對／驗收皆另授權，不能以新增計畫自動開服務。

| Gate | 必要交付與依賴；不能跳過的驗證 |
| --- | --- |
| 商業／營運設計 | 公司／contact/rights ownership、渠道與平台 cutoff、初始餐廳方案價格、earlybird起算／延期未交付、取消／退款／消費法定例外完成 O/L/X review。價格保留方向不是 checkout readiness。 |
| Subscription authority | 14day trial 起算、轉付費日期／399每月／期別／取消方式及 explicit confirmation；付款授權不得由 legal consent/signup推導。伺服器付費／webhook idempotency、續訂／失敗、cancel停止 next charge且當期權益至end、dupe-charge/service/statutory refunds、presale redeem分支須新包獨立驗收。399/990/1740/3000 duration plans與trial default monthly分開，早鳥原價及friendcode不混入自動續訂。 |
| 通知 authority | 重要terms/reconsent/eligibility Email＋App同步，trial前3天提醒及前1天App通知／取消入口；時區、排程、送達／未達重試、取消/withdraw後通知狀態及帳號隔離。不得宣稱existing MealBuddy Push等於試用Email或App inbox；email confirmation亦非付款提醒。 |
| 餐廳 launch authority | Activation Code／商業合約確認／費用／交付／退款操作最小scope，保留歷史BM契約。新unusedfuture-month成效例外須首月數據後訂metrics/period/適用方案/公式/claims/成本規則並新批准；launch前無已生效成效保證。 |
| 保存／權利 readiness | 日記查看與真保存/收合、永久收藏vs原圖、staging／縮圖／訓練副本／backup/restore／rights渠道；先補retention approval、解Dev evidence vs prerequisite record conflict，不把本機daily persistence或UI文案當完成。future training管線另gate，未有不可識別性實證不啟動location/health/disease資料使用。 |
| 最終 release review | 上述交付與相應新local independent acceptance、另授權inactive/activated/commercial案例03 §4.1，加A–G exactpublication/enforcement與測試consents，再由獨立review裁定。現況legal DRAFT/NOT ACTIVE、OD-15/TD-10/AU19/P-7 OPEN，沒有activation readiness PASS。 |

成效指標須等正式營運首月資料，因此「首次launch」與「後續成效條款新版」是兩個依賴階段；不得藉此自選初始餐廳條款，實際方案及是否承諾成效仍交Owner／legal下一gate。通知、收費或future training scope都不能解耦F的formal documents/enforcement singleton，更不能在inactive先收正式consent。
