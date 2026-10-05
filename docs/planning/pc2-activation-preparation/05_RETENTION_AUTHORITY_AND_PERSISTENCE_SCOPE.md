> **Current corrective snapshot — 2026-10-04**：本輪僅修正 F2 native DDL authority／temporary builder 與 F1 predefined-role checks。原 R0-B acceptance 保留於 `26f9a136da4dc484e60a97828803f8c942452c62`；本輪 pre-commit gates 的有效逐項證據已齊備，新的 local candidate 尚待 Claude 獨立 reacceptance。§1–13 與下一個 2026-10-03 banner 均是原時點歷史，包含當時 superuser-only 限制；目前契約與 bindings 以 §14 為準。Hosted capabilities／套用歷史仍 pending；沒有 product writer、producer、部署或法律啟用。法律 **DRAFT / NOT ACTIVE**；activation pending。

> **Current implementation snapshot — 2026-10-03**：Owner 已批准 §13.1 的 server 首次成功保存 T0；本輪獲授權實作精確四檔 inactive foundation。Pre-commit local gates 為14成功／16負向／12 mutations PASS；尚不是獨立 acceptance，沒有 runtime capture／entitlement producer、產品顯示、回填或刪除接線。新增 migration 明確要求可信 DDL administrator；非 superuser apply 會 atomic fail closed，不以放寬 runtime 權限處理。§1–12 原 scope review、待批准敘述及 source ledger **逐 bytes 保留為歷史 snapshot**，本輪現況以 §13 為準。Local freeze 與 post-commit 結果另綁外部最終報告，不回寫本文件的歷史執行時點。法律 DRAFT / NOT ACTIVE；activation pending。

# R0-B — Authoritative Retention Persistence Scope Review

> **Final scope review（2026-10-03）**：本文件目前結果為 **READY_FOR_R0_B_FINAL_SCOPE_APPROVAL**，僅為提案待批准。§12與更新後§7.1是本次final契約／首包scope；其餘原review、source ledger、live設計與先前READY狀態保留為歷史snapshot，原§7.1全文在§12.9。四项缺口對inactive首包採「沒有已核定live producer／unknown不轉授權」的封閉契約；後續live接線的T0與權益語意仍未批准。本輪只更新05，未建立migration、scripts或產品能力。

Review date：2026-10-03（Asia/Taipei）。**READY_FOR_R0_B_IMPLEMENTATION_SCOPE_REVIEW** 僅表示本提案可交 Planner 審閱，不是施工、migration apply、Development acceptance 或 activation 授權。

建議先做 **R0-B-D：詳細日記 T0／grant authority persistence**，再做 **R0-B-Z：固定報表時區版本**；月度 grant 的實體接線需等 R1 有真正的 report identity。所有新增表、欄位、helper、角色、trigger 與工程 paths 均為 PROPOSED，這次只有本文件新增。

R0-A 純政策模組與 PC-2 local acceptance 維持通過。法律 **DRAFT / NOT ACTIVE**；activation pending。R0-C、R1–R5、OD-15、TD-10/AU19、P-7 仍未完成／OPEN。保存方向已確認，不再重問 14／180 天、六個月份、降級不縮 grant 或永久保存方向。

## 1. Git、證據適用性與分類

| 項目 | 本輪實際起點／限制 |
|---|---|
| Branch／HEAD | main；`3b1957e8dc459db6fdaa06bec873c1acc632ae9a`，正是 accepted R0-A candidate。 |
| HEAD parent／message | `308f2171164e719aff43d729bb19637cd3334538`；Fix retention timezone version consistency。 |
| 本機 origin/main | `b70884a013ac67486242fe5d11b9bfad1360032a`；ahead/behind 4/0。沒有 fetch，不代表即時遠端 branch 狀態。 |
| 起點 inventory | 3,341 tracked paths；142 migrations；tracked／staged diff empty，untracked empty。05 原不存在。 |
| Applicable AGENTS.md | repository、相關祖先與目標目錄未找到；查找紀錄保存在外部 evidence。 |
| 其他工作 | 保留 Demo Pool commits `f5b9ae0a982b7a2401c7d48e0c7b9387f4955bd7`、`308f2171164e719aff43d729bb19637cd3334538` 的 bytes／modes；未執行或重新驗收 Demo Pool。 |
| 本輪 write inventory | 只有 `docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md`；保持 untracked。 |
| Fresh／reused | Fresh＝本機 source／hash／Git／文件檢查；reused＝已接受 Owner A–F、PC-2 acceptance、R0-A 原驗收／修正／最終 reacceptance。沒有重跑 R0-A runtime gates 或產品驗證。 |

分類：**OWNER_CONFIRMED** 是 Owner 產品契約；**SOURCE_FACT** 是綁定本機 source 可讀出的行為，並不表示本輪 fresh runtime PASS；**PROPOSED** 是待審閱技術設計；**IMPLEMENTATION_NOT_PROVEN** 是本機 review 未證明的完整能力；**OWNER_DECISION_PENDING**／**TECHNICAL_SCOPE_PENDING**／**QUALIFIED_REVIEW_PENDING** 分別是未決語意、authority／施工方案與專業批准。沒有將 historical proposal 升格為已批准能力。

04 首段及§12.6 的 BLOCKED／reacceptance pending 是 corrective commit 當時的歷史狀態；其後的外部獨立 reacceptance 已通過。保留 04 原 bytes，不倒填歷史。原 f28867a 的三項同 timezoneVersion 矛盾及修正過程同樣保留。

外部報告均存在，原始 SHA-256 在§10。最終 reacceptance 對 exact 3b1957e 證明 59 probes（原56完整 outputs 不變、原3修復）、23 smoke cases／644 assertions、27 mutation controls、27補充 controls及純度；這些是**沿用既有驗收證據**，本輪沒有重新執行，也不是 persistence／DB／activation PASS。

## 2. 已確認契約與 source findings

### 2.1 已接受的契約（OWNER_CONFIRMED，C04 §2.1；A01–A03）

- 詳細日記保存從原始紀錄時間 T0 起算，UTC 連續24小時；Free 14天、Paid 180天，旅行／DST／編輯不重設。
- 建立時取得保存權益，現在 tier 決定顯示。Paid 建立後降級不縮期限，超14天且未到180天的 present detail 保留但隱藏；復訂只重顯仍保留資料。
- 未到期 Free detail 的可信升級延長到原始 T0＋180天；不是 upgrade time＋180天，不承諾恢復 collapsed／deleted detail。
- Free 月回顧是含當月的六個月份；Paid 取得及升級時仍在免費窗口內的現存回顧取得永久方向。降級不撤永久 grant，僅限顯示；復訂可看仍保留月份。
- 固定帳號報表時區，改版不重排歷史月份；UTC期限與月份歸屬分開。私人收藏永久方向、刪帳與適用刪除義務例外保持。
- 40/200 vs 50/150 quota、照片／training／logs／cache／backup 的具體期限仍 pending；不設定任何 draft TTL，不增加 training 用途。

### 2.2 時間、寫入與重試（SOURCE_FACT；具體引用見§10）

| 現有來源 | 實際用途與限制 | R0-B 缺口 |
|---|---|---|
| S02 lines5–17、21–43 | `meal_records`／items 已有精確 `occurred_at timestamptz`，不是只有日期；另有 `meal_date`、逐餐 timezone、`created_at`／`updated_at` default now()。 | 沒有 immutable `originalRecordedAt`、保存 acquisition 或 grant deadline。欄位存在不足以證明 T0。 |
| S14 lines24–25、60–89；S15／S16 | Client 拒絕 created／updated 等 server fields，但傳入 occurredAt、mealDate、timezone；mapper 把三種 timestamps 分別映射。 | Client validator 不是 DB authority；caller occurrence 不能直接取得保存 anchor／Paid／永久資格。 |
| S10 lines498–540、685–705 | 現行 legacy create 從 auth.uid() 取 actor、先 require_core；接收 caller `p_occurred_at`。INSERT 沒列 created_at，所以此 RPC 的 created_at 由 DB default 產生。 | DB default 是這條路徑的建立時間證據，不是所有 legacy row 的 immutable retention provenance，也未裁定它就是 Owner 的 T0。 |
| S04；S05 lines367–370；S06末段 | authenticated 可 owner SELECT；anon 撤銷；authenticated／anon 的 meals／items INSERT、UPDATE、DELETE 被明確撤銷。S03 owner-all RLS 不會自行授予 table privilege。 | 本機 migration chain 支持走 canonical RPC；不聲稱已遠端查核 ACL，privileged/operator 舊寫入仍需來源證明。 |
| S10 lines821–983 | v2 在 actor/request advisory lock 下比 fingerprint，已存在返回原 row；新建呼叫 legacy create，然後只更新 client_request_id／fingerprint。 | capture 必須只在第一次實際 INSERT，後續 UPDATE／同 key replay 不換 T0／acquisition／deadline。無 key 的 legacy create 不是跨請求 exactly-once，不能憑新 trigger 宣稱修好了它。 |
| S10 lines291–342 | planned conversion 有 owner row lock、expected_updated_at、conversion key；caller confirmation timestamp 成為 occurred_at，呼叫 v2，converted_at 為 server transaction timestamp。 | planned time、caller confirmation、轉換 receipt 與 T0 分開；不把更晚 conversion replay 当新 acquisition。 |
| S10 lines1582–1603、2602–2623；S07 | 新的 AI／manual finalization 共用 legacy create，之後更新 fingerprint／correction／ledger；current／post_hoc 描述用餐來源時間。 | 不讓 analysis time、correction updated_at、retake 或 ledger 更新重設原 T0；新 resource 與既有 resource replay 分開。 |

**IMPLEMENTATION_NOT_PROVEN**：可信歷史匯入／跨來源去重／不可改寫 T0 的 authority ledger。没有從本機 schema 推造真實帳戶資料、遠端缺表或已部署狀態。R0-B-D 不新增 import API；未來匯入必須有獨立驗證的原始事件，否則 quarantine，不把 caller 的過去日期當 T0。

### 2.3 會員來源與 server authority

S01 lines69–80 的 `subscription_entitlements` 有 user、plan_code、entitlement_source、source_reference、valid_from／until、status、created／updated。source_reference 可空，沒有本包所需 immutable event id、producer驗證、歷史完整性／修訂序列或逐餐 acquisition。

S08 只 grant authenticated SELECT；S03 line38 owner SELECT RLS；S10 lines22–23 加 PC-2 restrictive gate／core trigger。**不把 subscription table 寫入說成一般 Client 可自行操作。** 在本輪 bounded search（migrations／functions）中，沒有證明 canonical billing producer 或 Paid 升級 immutable-event writer；不等於遠端不存在。

S11 的 Social resolver 只讀四欄 `plan_code,status,valid_from,valid_until`，明確不讀 source/reference/id／timestamps；驗 actor predicate，錯誤不 fallback Free。S12 用 free／premium，premium 的 active／grace_period 且 now 在 inclusive validity 上界內，沒有 row 在這個 **Social-only** 契約可 resolved Free。這不能直接變成 retention 的歷史 Free／Paid acquisition 或永久權益。R0-B 不改 Social resolver、plan caps 或 billing；須先核定 retention adapter 的 plan/status/validity／complete-source 語意和可追溯 writer。

S09 lines100–128、S10 的 core RPC gate 是已接受 authority。core 是否 allow 由 active profile、正式 consent 或既有 preparation cohort／rollout 分支決定；不能把單一 training flag 重算成新 core rule。training withdrawal 是既有 canonical path，不等於刪 diary 或撤銷 grant。

S18 有 deletion request 狀態文字與 timestamps，沒有本輪可證明的完整 account／backup／processor rights disposition。rights read 失敗或未知 status 不能自動包成 `clear`。grant schema 不完成刪帳 executor，也不能讓永久 ledger 成為刪帳後無條件留存的新資料集。

### 2.4 月度 source 與 compatibility

S01 的 `consumer_preferences.timezone` 預設 Asia/Taipei；S03允許 owner-all，S10加 core gate。它是可變的偏好，沒有 fixed-report timezoneVersion、effective boundary 或 immutable歷史月份 registry。meal timezone 也不是帳號固定報表時區。

S17 建的是 daily_nutrition_summaries；S10 lines2797–2910 的 daily upsert 接收日期／timezone，按 user/local_date/timezone/calculation_version 更新。它不是 monthly report、永久 grant、完整全月證明或 detail收合。S19／S20 的 read window 也不是 retention persistence。

bounded search 在 migrations／functions／consumer-meals／consumer-auth 未找到 monthly review persistence、report_timezone/version、retention_grant／retained_until authority；標示 **IMPLEMENTATION_NOT_PROVEN**。R0-A 的 MonthBinding 與 MonthlyGrant 是純輸入型別，沒有因此產生表或合法 reportId。

A02 僅接受最多三位 fractional second 的 explicit-offset ISO instant；既有 PostgreSQL timestamptz 可有更高精度。新 metadata 需明定一次性的毫秒表示，保留原始時間／來源 precision，不可把舊 row silent rounding 當作已驗證 T0。A03以 Intl canonical zone 核對 aliases；資料庫 zone 名稱接受集合／tzdata 不可只用「目前 offset 相同」等同，須在實作包鎖 tooling／tzdata 與 parity evidence。[PostgreSQL datetime documentation](https://www.postgresql.org/docs/current/datatype-datetime.html)

## 3. 建議的最小持久化模型（PROPOSED；不是現有 schema）

選擇在既有私有 `consumer_internal` 增加 metadata，不把保存權益放進 UI、JWT user_metadata、餐點 note 或 client可寫欄位。**不修改 R0-A source／tests、不改既有142 migration bytes**。schema只透過另授權的新 forward migrations 建立；不建立 public任意 grant API。

### 3.1 R0-B-D：三個必要實體

| Proposed entity | 最小內容／constraint／必要性 |
|---|---|
| `consumer_internal.retention_owner_state` | 一個 owner row：authority revision、source coverage／unresolved狀態、已驗 producer版本及處理cursor。FK auth.users；提供不存在 entitlement row 時仍可序列化的 per-owner 鎖。不是另一份會員收費系統。 |
| `consumer_internal.retention_authority_events` | owner、source namespace＋upstream event id、immutable payload digest／source revision、effectiveAt、recordedAt、事件類型、verified tier at event、policyVersion、來源precision／驗證版本、處理receipt。Unique(owner,source namespace,event id)；相同id不同語意是 conflict，不能覆寫。append事件內容與可變處理狀態分欄，replayed結果須可追溯到實際grant revision。禁止保存 token、照片、完整餐點或 provider敏感raw payload。 |
| `consumer_internal.retention_detail_grants` | owner＋mealRecordId、immutable T0、capture來源／create event、acquisition tier／event／at、retainedUntil、extension事件引用、policyVersion、provenance、grant revision。允許明確 pending metadata，但 pending 沒有可使用的 acquisition／deadline；resolved grant 不以 NULL 或 Free預設模糊表示。 |

grant owner/resource以 composite FK 綁 `meal_records(id,user_id)`；因此 foundation migration 需補這對欄位的 UNIQUE supporting constraint／index（不是只加無 owner 的外鍵）。resolved deadline只允許 T0＋14×86,400秒或 T0＋180×86,400秒；Free延長必須有經驗证的 U<E14 evidence。資料庫 elapsed arithmetic 用 UTC epoch／秒／毫秒，不用依 session timezone 的 calendar-day interval。downgrade沒有減少deadline的write path。

T0、acquisition、source event content不能一般 UPDATE。extension只在已驗歷史事件、revision CAS與交易下單向提升，原acquisition不改；policyVersion固定到已接受 R0-A版本。寫入receipt帶old/newrevision、event identity與exact normalized grant digest；未commit沒有 persisted receipt。原event資料與audit留存本身仍受刪帳／適用義務，沒有「immutable所以永遠不可刪」的法律例外。

### 3.2 T0 capture 建議與未決 gate

**PROPOSED recommended mapping**：未來新的 canonical record 第一次 server接受時，記錄一次 server UTC毫秒 T0（在共同 INSERT 邊界捕捉明確 server instant），acquisition.at=T0。`occurred_at`继续代表用餐／補記時間，`created_at`继续保留既有 generic DB timestamp；不改這些欄位的舊用途。將「原始紀錄時間」映到first server record acceptance尚需 T0-1裁定，不能冒稱 Owner 已選定此實作。

方案以私有 AFTER INSERT capture helper 在同一 meal transaction 建 metadata／grant；不是Client提供 T0、Paid、deadline或proposal。初始化時保存原始capture instant及一次毫秒量化版本，所有後續adapter使用同一已持久化值；R0-A acquisition與T0必須同瞬，不能每次讀取重新 round 或截斷。DB clock不是 Client clock；鎖等待後的capture順序／event boundary要列入local驗收，不用updated_at代替。

如權益來源 unresolved、core／rights／protection不能證明，保留 pending capture並記錄原因，**不得自動授予Free14／Paid180或purge**。新metadata硬寫入失敗必須回滾同交易；不能meal成功卻丟capture。pending是保留既有RPC可用性的提案，並非已完成grant。啟用 resolved capture 前，AUTH-1／AUTH-2與local gates必須通過；若Planner要求未知source整筆create拒絕，須另核定相容性，不悄悄改既有RPC成功語意。

legacy key replay只讀既有record／receipt，不把缺metadata的既有row當新INSERT回填。現有legacy無key請求依既有語意可能新建另一餐；R0-B不從相似title／時間猜duplicate。import、離線merge、刪除後重建是否同resource，均不在本包暗中新增。

### 3.3 R0-B-Z／R0-B-M：月份 metadata，按依賴分開

| Proposed entity／範圍 | 設計與限制 |
|---|---|
| B-Z：`retention_report_zone_versions` | PK(owner,timezoneVersion)，保存raw timezone name、canonical zone identity、canonicalizer/tooling/tzdata version、effectiveAt及變更event來源；同版本只能一個canonical zone，row immutable。不同帳戶可各自有v1，不建立跨帳戶錯誤的global version registry。 |
| B-Z：account active-zone pointer | 在owner state增加指向已驗zone version的reference。初始zone與manual change先經TZ-1／TZ-2；普通偏好、旅遊／devicezone不能自動更新此pointer或重寫舊version。 |
| B-M：immutable report month binding | R1真實report owner/id FK、monthKey、raw timezone/version、monthBindingVersion、生成來源與collision狀態。不可現在造report placeholder，R1未定表名時不能凍結不存在的FK。binding先建立再grant；當月payload更新只改report版本，不換month identity。 |
| B-M：monthly grant | owner/reportId、acquisition事件／period、permanent boolean、可追溯promotion事件／period、policyVersion/revision；原始report binding完全匹配，permanent只能false→true，downgrade不能true→false。absence不是Paid permanent或「當時Free」。 |

B-Z可先驗version consistency，不代表B-M完成。B-M需R1存在report与歷史period來源；只promote可信upgrade當時六月份窗口內、實際存在且有合法grant的report。資料不存在／已刪／window外／來源不全不能產生永久grant。Paid current不能當作過去Paid period。

同version跨historical／active／acquisition／stored promotion／incoming promotion的canonicalzone都必須一致；合法不同versions保留。已保存的rawzone和period不能因alias canonicalization而覆寫：R0-A top grant與MonthBinding仍做raw equality，event signature也含raw period。aliases可接受，但event第一次admission的normalizedrepresentation要凍結，重播不得換rawalias製造或掩蓋EVENT_CONFLICT；不能靠同offset／wildcard豁免。

歷史monthKey／zone version不重排。manualchange發生在月界、跨回上一月份、同label不同版本collision及晚生成report的acquisition時點，尚需TZ-2／MONTH-1；未核定時structured unknown，不能當invalid history可刪或自行merge。免費六月份窗口是calendar labels含當月，不把六個月換成180天。

## 4. R0-A inputs／outputs 的 persistence 映射

| R0-A field／output（A01、A03） | 未來trusted來源與映射（PROPOSED） | 未知時行為／包界 |
|---|---|---|
| actorId／resourceId | authenticated entry取verified actor，DB join resource.owner；內部producer須有受限身份且event owner一致。 | body owner／JWT可改claims不是authority；cross-owner拒絕。 |
| policyVersion／evaluationInstant | 已接受policy版本；server transaction的一個明確evaluationInstant；不要混用多次clock讀值。 | invalid/future/不支持precision→unknown；沒有clientclockfallback。 |
| originalRecordedAt Fact | private capture T0，sourceIdentity=具體capture/event namespace，sourceRevision=不可變receipt/grantrevision，factAsOf不早於T0。 | legacy缺證→FACT_MISSING／PROVENANCE_UNKNOWN；不選updated_at／occurred_atfallback。 |
| acquiredGrant Fact | 已commit的detail／monthly grant＋事件references；已驗owner、anchor／deadline／tier／version／precision。 | 沒有grant→HISTORICAL_GRANT_MISSING，不由current Paid推造。 |
| action.create/acquisition | 真正newINSERT capture event；detail acquisition.at=T0；tier来自此時可信authority snapshot。 | 不能由caller宣稱newResource／resolved；未知用pendingmetadata，不執行有效grantwrite。 |
| action.upgrade/events | verified immutable Paid transition，排序effectiveAt＋canonical sequence，來源eventId／period保留；每resource processing receipt。 | read錯誤、conflict、sequencegap→pending，不丟掉historical event，不用現在Paid替代。 |
| currentEntitlement Fact | retention專用approved adapter讀完整來源，snapshot在evaluationInstant有效；free亦需complete coverage證明。 | Social empty-row規則不能直接偷渡；readfailure不是Free；Paid沒有歷史grant也不補。 |
| monthBinding／activeReportPeriod | R1 immutable report binding＋B-Z在evaluationInstant有效的accountzone version，明確period與月份。 | 同version矛盾→TIMEZONE_VERSION_CONFLICT；缺version／collision→unknown。 |
| coreEligibility Fact | 沿用S09 core_eligible/require_core，從一致transaction來源採樣；preparation cohort不是正式法律批准。 | deny不提供新的grant transition／顯示；unknown不升格allow；保留原PC-2規則。 |
| materialState／protection／rightsState Facts | owner-matched現存row／tombstone、已批准protection與rights adapter，current facts的factAsOf均等evaluationInstant。 | presence不是完整rights-clear；unknown protection不當none。R2/R5未完成時保留pending，不能抹除它們的依賴。 |
| retentionStatus／visibilityStatus | 從已commit grant与当前facts重新評估；兩軸分開，不將display當作DB刪除条件。 | R0-C才接產品讀取／顯示；B僅metadata，不改查詢結果。 |
| grantTransitionProposal | 只可作內部計算的待驗提案；DB再驗源revision／事件／權限／scope／不縮term才commit。 | A輸出persisted=false；只有額外交易receipt才說已持久化，不能修改A輸出型別假稱true。 |
| purgeAllowed | 永遠false；B不暴露purge能力。 | due、永久、unknown均不能授權刪除、收合或照片處置。 |

來源hash是binding，不是authentication。未來private helper不得接收未驗caller grant JSON直接落表；若採SQL實現少量detail grant持久化計算，必須以已接受R0-A作**獨立runtime parity oracle**，並驗exact grant／unknown/reason，而非只比table數量。SQL不能直接執行TS；本提案為保持record/grant同DB交易而選DB內authority，並不宣稱SQL parity現在已完成。04原候選Edge repository/service尚未凍結，這次選擇先不增加兩個Edge paths；如原子性或authority無法成立，停在scope revision，不暗中擴包。

## 5. Grant transitions、事件、冪等與併發（PROPOSED）

| Transition | 寫入條件與結果 |
|---|---|
| new captured＋resolved Free | acquisition.at=T0且source完整，首次create保存E14；deadline精確T0＋1,209,600,000ms。 |
| new captured＋resolved Paid | 首次create保存E180=T0＋15,552,000,000ms；event／source版本與tier snapshot一同commit。 |
| captured unresolved | metadata pending＋具體reason；沒有resolveddeadline，不稱E14到期或180已取得。後續只能用與原T0有關的已驗證event解決，不能拿更晚currenttier回填。 |
| Free未到期升級 | 可信U<E14、materialpresent、coreallow、rightsclear、protectionnone與revision一致；保留acquisition與T0，E單向延至T0＋180天，保存原U。 |
| downgrade／取消／會員到期 | 只更新current authority fact／revision；已得E180及monthly permanent不縮，不對hidden detail執行expiry。 |
| resubscribe／重複upgrade | 仍可依來源對符合條件的Free grant處理；已得E180不再延長，不能U＋180。event重播noop並回原receipt；present／expiry／provenance各自驗證。 |
| late delivery | 使用可信effectiveAt，不是receivedAt；U<E14可能在後處理，但不恢復已collapsed／deleted資料。event gap／未完成處理維持pending並阻止未來R3誤判；不能把「已收event」當「所有resources已extend」。 |
| exact／after expiry upgrade | U=E14或U>E14不延長Free grant；receipt記no-op原因，不誤當已恢復。 |
| monthly promotion | 有真report／grant，可信U的固定zone period內包含reportmonth；permanent false→true。同版本矛盾／缺period不能promotion。B-M另包執行。 |
| conflict／未知 | 同event不同payload、future event／T0、unknownsource、staleCAS、alias/version矛盾都拒絕或pending；不silentoverwrite、推永久、默認Free或purge。 |

1. per-owner authority row用unique key安全bootstrap，再鎖row；新creation與canonical entitlement producer必须遵守同一owner序列。沒有收費writer接入，不能只靠consumer側鎖宣稱沒有upgrade race。
2. unique事件identity＋payload语义digest分離：UTC同瞬、固定schema／版本、凍結period表達，真差異conflict。不要hash任意JSONpropertyorder使等價重播失敗，也不能忽略tier／owner／eventAt／period等權益欄位。
3. grant revision CAS＋rowlocks；處理receipt與grant在同transaction落地。事件未完整處理的owner/resource狀態不能回fully resolved；排序相同時點用canonical序列，來源缺序列／gap則pending，不以arrival順序猜有效Paid。
4. 保持transaction短，不在鎖內打billing/network/AI。owner→events／zone→grant按stable resource id鎖順序；若採共同INSERT hook，existing planned／finalization已持row/request/analysis locks的相容性必須實測鎖圖。upgrade不能在持owner/grant後逆向鎖meal造成deadlock；即使只普通讀material也須驗FK cascade／commit-order race，不把read snapshot當全域鎖。
5. 接入方案若無法保留此順序，停止並提exact forward RPC successor scope，不能直接重寫既有S10／PC-2harness。capture／producer／zone／retry每條writer都須納入相同規則；未覆蓋的writer是gate failure，不是acceptable bypass。
6. PC-2 consent／rollout／withdraw使用其既有locks，新的owner lock不能假稱已自動與它們互斥。需要跨state串行時，先證明可用的共同鎖順序及拒絕commit時eligibility race；否則相關事件pending，另提必要scope，不修改已接受authority。
7. 重試因connection／CAS／deadlock失敗只重播原event／request，atomic rollback不得留下false success receipt。部分batch outcome逐resource持久記錄；owner completion watermark只能在整個已證対象集合成功後前移。

locks必須由所有相關writer協作、使用一致顺序；rowlock与advisory lock不是來源认证。[PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)

## 6. Privileges、RLS與PC-2相容性（PROPOSED）

新私有metadata tables採ENABLE＋FORCE RLS，顯式owner／operation policies與最小GRANT；不對authenticated／anon／PUBLIC暴露INSERT／UPDATE／DELETE或internal helper EXECUTE。Client不得提交T0／Paid／永久grant，也不能把owner id傳進security definer繞隔離。選用受限no-login、non-BYPASSRLS authority role只持必要tables/functions權限，role ownership／migration-time memberships與撤銷需列逐項ACL gates，不藉postgres／service_role broad runtime權限概括通過。

canonical create的trigger context驗證實際NEW.owner、core及source，而不是只信auth.uid為某個存在帳戶。內部entitlement事件entry仅允許已核定producer role，核實source/owner/event，沒有自助Paid API。不同服務場景的owner授權要明確，不把authenticated的auth.uid規則生搬到無user session的producer。

RLS与GRANT分開核對；private schema不暴露API仍須ACL／RLS防線。[Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)

security definer functions採fully qualified references／trusted search_path，建function與revoke PUBLIC/default EXECUTE在同一transaction，防止暫時開放；definer身份可能繞RLS，仍需顯式owner與操作驗證。[PostgreSQL CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html)

S09準備cohort、current bundle／registry approval與canonicaltraining path不修改；不讓grant capture切換rollout enforcing或legal state。withdraw不縮已得grant、也不靠存grant讓core denied取得產品顯示。pending deletion／unknown rights會阻止新的有效transition，既有metadata不因deny被改成短期或抹除。

grant表的immutablecontent guard必須留出既有Auth deletion FK cascade的受控相容路徑；不能阻擋刪帳或把事件表永久保留。schema清理不等於完成R5及所有copies purge。本包沒有新的purge API／scheduler。

## 7. 最小候選施工 inventory 與完成標準

以下是**另需授權的候選清單**，不是這次write inventory。新的migration timestamp需施工前用既有CLI生成（`supabase migration new`），記錄實際兩個full filenames再凍結；下列尖括號不是檔案，也不是允許任意增加migration的glob。沒有建立SQL。

### 7.1 Final candidate：R0-B-IF inactive persistence foundation（4個精確候選paths；PROPOSED）

本節依 **AUTHORITY CONTRACT RESOLUTION AND FINAL SCOPE** 指令更新。原本5-path／2-migration capture方案完整保存於§12.9，沒有冒稱已批准或已實作。§3–9先前live提案與V01–V12驗收保留為後續integration參考；本首包以§12的inactive契約及IF／N／M gates為準。

| 順序／完整候選path | 必要性及精確邊界 |
|---|---|
| 1. `supabase/migrations/20261003062157_consumer_retention_inactive_persistence_foundation.sql`（新增） | 一個transaction建立獨立私有 `retention_internal`、sealed storage owner role、四張metadata表及僅約束新表的immutable／non-shrink guards、default-deny RLS與REVOKE。沒有meal capture、entitlement producer、public RPC、原表index／trigger／function變更或seed/backfill。 |
| 2. `scripts/consumer-retention-persistence-smoke.mjs`（新增） | disposable本機PostgreSQL的fresh／upgrade兩種apply、原authority catalog/data compatibility、private結構／constraints／原子rollback／ACL/RLS／inactive不生效驗收。完整IF01–IF14與N01–N16在§12.7；不是重新執行原PC-2／R0-A suite。 |
| 3. `scripts/consumer-retention-persistence-mutations.mjs`（新增） | disposablecopy／DB執行M01–M12：先正常setup PASS，再確認exact mutation生效及指定behavior CHECK偵測破壞，保存rawoutputs。不能用setupfailure代替detection，不能弱化原assertions或改既有harness。 |
| 4. `docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md`（本文件） | 保存final scope、設計／批准／實作分類及該施工輪實際證據；目前只有文件更新，未stage／commit。施工與commit需另授權。 |

**精確migration順序**：原142檔按目前既有lexical sequence全部先apply，最後是 `20260930174030_consumer_pc2_core_social_eligibility.sql`，再apply本候選migration一次。實作後預計共143檔；現在仍142，沒有建立SQL。

候選timestamp取本輪 `clock.curr_time` 的 `2026-10-03 06:21:57 UTC`，**僅保留完整檔名**；未執行 `supabase migration new`，不冒充CLI已生成檔案。因本輪禁止建立migration，施工前須再確認此name不碰撞／排序仍成立；若CLI生成名或successor migration使名稱／次序變更，先重綁exact inventory供批准，不靜默rename或新增第二份migration。

從2份收斂為1份的原因：共同INSERT capture、T0 acquisition與livegrant writer需要尚未就緒的authority；放入foundation會造成產品接線或真grant建立。本包只建一組私有structural objects，不需要第二份integration migration。原候選 `consumer_retention_detail_grant_capture`、對既有meal加supporting UNIQUE／FK及Edge repository/service都**不在最終首包inventory**，保留後續另包提案，不建立其檔名作授權。

**獨立完成標準**：IF／N／M的actual local DB gates、fresh／upgrade相容性、scope外frozen proof及獨立acceptance通過；新表空、無可用writer／producer、無真grant／legal seed、既有RPC行為及source/catalog identities不變。PASS名稱只能表示inactive foundation本機驗收，不表示automatic capture、upgrade、R0-C顯示、monthly persistence、purge或activation完成。

### 7.2 B-Z：後續固定zone registry（3個候選paths，獨立授權）

- `supabase/migrations/<CLI timestamp>_consumer_retention_report_zone_versions.sql`：私有version registry／active pointer／event/source bindings／受控zone変更；TZ-1／TZ-2先決。不生成報表。
- `scripts/consumer-retention-report-zone-smoke.mjs`：同version一致性、aliases、不同versions、月界／histbinding不可改的actualDB＋R0-A映射。
- `scripts/consumer-retention-report-zone-mutations.mjs`：version映射overwrite、offset/wildcard假alias、Client改pointer、cross-owner及rawevent replay差異。

上述需已接受B-D的事件／actor／revision基础；若只需要zone registry先施工，須另凍結可獨立用的最小authority依賴，不复制一套billing／locks。

### 7.3 B-M：R1真report存在後的monthly grant package（尚不可凍結完整inventory）

候選new forward migration slug `consumer_retention_monthly_grants`；候選scripts `scripts/consumer-retention-monthly-grant-smoke.mjs`、`scripts/consumer-retention-monthly-grant-mutations.mjs`。真正FK表／R1 materializer接線full path，须R1scope決定後列明，不提供可任意加檔的授權。只有metadata／grantwriter，不代R1生成／評分、不代R0-C顯示、不收合detail。

## 8. 必要驗收契約（PLANNED / NOT EXECUTED）

以下案例本輪只規劃，沒有localDB／Development／mutation執行。使用disposable本機DB與合成actors，紀錄tooling、appliedDDL/currentfunc hashes、exactcommands/exits、完整stdout/stderr、各case input/expected/actual／failed CHECK/runtime、before-afterDB／event inventories；Development另須明確授權，不能使用real members。

| Gate | Local acceptance／expected | Development acceptance（另授權） |
|---|---|---|
| V01 T0／create paths | 新legacy、v2、plannedconversion、AI／manualfinalization首次INSERT建立一次T0；無論callerbackdate／futuretimestamp／edit／fingerprintUPDATE都不換anchor。無可信T0來源只能pending。 | exactdeployedcandidate每條path用syntheticowner重放；實際ACL／clock/precision／trigger/currentRPC身份。 |
| V02 原子性與replay | capture／grant／item／analysislink任一失敗整交易rollback，無orphan grant/receipt；同v2 key／finalization replay原grant bytes相同；同key異payload拒絕。 | RPCretry／networktimeout後同key查receipt，只commit一次；legacy無key語意如實。 |
| V03 UTC／expiry | 14／180期限E−1ms／E／E＋1ms；同瞬offset、DST、跨年閏日；DB不同sessiontimezone結果一致；DB microsecond→A millisecond mapping無重新量化。 | 不同runtime/tooling source identities與DBprecision parity，不用手機time authority。 |
| V04 grant monotonicity | Paid建→Free期限仍E180；Free U<E14延至原T0＋180；U=E14／after不延；重复升級／復訂不重新起算；deleted／collapsed不恢復。 | canonicalproducer先證歷史event来源，再驗upgrade/downgrade/expiry/receivedlate；currentPaid不能补legacygrant。 |
| V05 source gaps | empty/unavailable/unknownplan、未核producer、stale/source revision、future／矛盾事件、缺rights／protection全部不造resolvedgrant。pending不是Free14或permanent。 | fakeclient／錯producer／未驗來源拒絕；realmember與billing更改不在fixtures。 |
| V06 identity／privileges | anon、authenticated direct DML／internal EXECUTE、wrongowner／mismatchedcompositeFK、requestcallergrant偽造均拒絕；role+GRANT+RLS+definer/search_path一起驗。 | syntheticA不能看／改B；REST/rawquery/internalRPC各入口ACL查證；不靠service_role迴避隔離。 |
| V07 events／CAS | identicalevent重播noop；異payload conflict；recordedAt不能冒充effectiveAt；out-of-order／gap pending。receipt、grantrevision及completioncursor不先報成功。 | source事件與canonicalproducerrevision連續性、並發更新下CAS重試及partialbatch恢复。 |
| V08 concurrency | createvsupgrade／兩upgrade／downgrade／existingplanned-finalizationlocks／consentwithdraw／deletionFK races；多resource稳定鎖顺序，无缩term／漏event／wrongowner；deadlocktimeoutrollback保留原bytes。 | 合成actors並發；只在另授權隔離Development操作；不把本機mutex當remotePASS。 |
| V09 recovery／legacy | crash每個receipt/grant写入點、重啟重播、source重新可用；legacy無T0/grant仍unknown，無automaticbackfill，不能以nowPaid補歷史。 | dry inventory＋明確backfill例外授權後才可能驗legacy；此包不执行backfill。 |
| V10 months／B-Z／B-M | 含當月六月份、跨年；Paid acquisition／Free-windowpromotion；降級永久不撤；同version矛盾unknown；合法aliases／不同versions；rawmonth/version不可重寫。R1report缺失拒絕。 | B-M需真R1report與binding；currentpartialupdate不換身份；zonechange/monthcollision與late report按已核定方案。 |
| V11 PC-2／rights | coredeny／unknown不得新有效transition或顯示；preparationcohort、legalbundle不變。withdraw不縮grant，AuthdeletionFK不被immutabletrigger阻斷；不宣稱清除全部copies。 | 既有core authority exactidentity，合法deny／withdraw／account cascade；不啟法律作fixture前置。 |
| V12 boundary／scope | 無purge／collapse／scheduler／photo／billing／法律activation／R0-Cquerywiring；scope外bytes/modes凍結；A輸出purgeAllowed始終false。 | 即使metadata部署也不宣稱retentiondisplay／purge／activationready；各後續包另acceptance。 |

DB runtime tests不能以source字串代替；mutation正常setup先通過，再驗變更實際生效及預定behaviorfailure，setup／apply／ACLconnection錯不能算negativecontrolPASS。受新migration影响的原有necessarychecks另列精確集合，不能因此重開已接受PC-2remediation、全面重跑478或修改其frozenharness。

## 9. 未決事項、歷史資料與rollout

### 9.1 真正design／實作gates（不重問已定保存方向）

| ID／分類 | 最小需回答事項／具體選項 | 阻擋範圍 |
|---|---|---|
| T0-1 OWNER_DECISION_PENDING | 「原始紀錄時間」在新server資料的映射：A（建議）首次可信server接受record的瞬間，calleroccurred_at只作餐時；B 經核定authority驗證的原始發生／import事件時間，需說明可信producer與不可改寫證明。不是任意callerdate。 | B-D resolved capture／acquisition實作；14/180／UTC／編輯不重設已定，不再選。 |
| AUTH-1 TECHNICAL_SCOPE_PENDING | 指認canonicalentitlementproducer及exactlocalpath／verifiedeventnamespace：A 使用可證來源的既有writer接入；B 只有internal syntheticcontract可先local驗收，realproducer另package。沒有源path不能假設billing完成。 | Real automaticcreate／upgrade grants與rollout；不阻擋本文件scope review。 |
| AUTH-2 TECHNICAL_SCOPE_PENDING | retention的free/premium→free/paid、active/grace/validity／event boundary、缺row何時可證completeFree，以及source revision/sequencegap的authority contract。既有Social-only語意可作候選但不自動通用。 | B-D resolved tier／歷史transition；需要Planner/authority-owner核定，不改費率或付費產品。 |
| TZ-1 TECHNICAL_SCOPE_PENDING | 首次固定reportzone：A server驗證一次owner選定帳號偏好並建立v1；B onboarding明確選zone再建立v1。現profiledefault不能充作所有歷史reportzone。 | B-Z／B-M；非B-D必要前置。 |
| TZ-2 OWNER_DECISION_PENDING＋TECHNICAL_SCOPE_PENDING | manualzone變更effectiveboundary：A 當期已綁月份保留，後續新report使用新version；B 另選明確生效instant，但須定同labelcollision／向後跨月處理。兩者均不重排histmonth，collision先unknown。 | B-Z livechange／B-M；不延伸旅行自动切換。 |
| MONTH-1 TECHNICAL_SCOPE_PENDING | R1 report真實身份、creation／late-generation與acquisitionperiod來源，以及同label/version冲突的current publication規則；保留已定Paid獲取永久方向，不能凭currentPaid批旧report。 | B-M integration；不塞入首包或猜報表算法。 |
| RIGHTS-1 TECHNICAL_SCOPE_PENDING／QUALIFIED_REVIEW_PENDING | core以既有authority；rights／protection來源完整性不足的條件先pending。確認可證newresource clear/protectionnone與legacyunknown邊界；全刪帳／copies disposition另R5專業批准。 | 受影響resolved transitions；本包不能填假clear以略过R2/R5。 |

first package最少需要T0-1＋AUTH-1／2及newresource rights/protection安全邊界；TZ-1／2、MONTH-1、quota、照片TTL不是B-D全數共通前置。Planner可先審exact internalfoundation方案，若只批准synthetic契約，其完成名稱／report必須明示未接真producer，不能替代整個R0-B實際authority完成。

### 9.2 新資料與legacy分開

新資料在真正INSERT capture後才可能有新的可信T0／acquisition；同key重播不是新資料。舊rows缺來源一律unresolved，不以created_at看起來像servertime、source_reference文字或目前Paid判定原acquisition。不縮legacy保留、不中斷其既有產品顯示來假裝R0-C已做，沒有purge。

歷史inventory需獨立授權：量化每owner/resource的capture／clock／sourcechain、grant與永久证据、duplicates／zonecollision、缺失原因；分read-onlydryrun、可驗backfillplan、Ownerexception／qualifiedreview、actualrollout。缺證時不得批量補Free14、Paid180／permanent。這次沒有遠端確認帳戶、tablecounts、帳號tier或資料內容，也沒有backfill。

### 9.3 Rollout與rollback（PROPOSED）

1. 先Plannerscope／OwnerT0／sourceauthority批准，CLI產生兩個exactmigration filenames再凍結inventory；localdisposableapply與independentacceptance後，Development另授權；法律publication／rollout與Production再各別批准。
2. Foundation additive private tables可先驗空schema＋syntheticevents，不讀真member建立歷史快照、不初始化假Paid／永久權益。capture未active或來源不合格的資料不能宣稱已授權retention。
3. 啟用時明定start／coverage boundary与producer version；記錄事件gap/pending receipts，監測grant/capture一致性但不存敏感完整餐點。rollout前後不能因目前Paid補首次coverage之前的歷史。
4. rollback優先disable新增writer/integration gate、撤銷新增entry privileges，保留已得到的合法grant／event identity與pendingreceipt，**不縮grant、不drop表丟證據、不reset原資料**。不把接受過grant的consumer倒回默認14天。
5. writer停用期間要保存合法來源事件或標記coveragegap；resume先以原identity/revision核對及重播，缺gap證據仍pending。不能silent現在tier回填或把沒有處理的upgrade視作不存在。
6. account deletion／retention of event audit必须按另核定rights處置；rollback不是使資料永久逃避刪除的理由。備份restore重現舊grant／已刪資料的處置在R5，不由本包宣稱完成。

### 9.4 後續包與publication的依賴

| Package／blocker | 接續方式與未完成能力 |
|---|---|
| R0-C | 用已驗servergrant/currentfacts接serverread/display與mobile，另解rawquerybypass／pagination；B metadata不使顯示14／180生效。 |
| R1 | 新monthlymaterializer／完整inputwatermark／reportidentity，依B-Z與固定月份；B-M隨真reportatomic绑定，不先造report。 |
| R2 | 私人savedmeal snapshot／quota裁決與protectionfacts；cataloguebookmark不免detail到期。 |
| R3 | 依B可信grant＋R1完整summary＋R2保護／rights批准才可收合；due與hidden不可混淆，unknown／pending sourceevent不授權purge。 |
| R4／R5 | 照片資產lineage／TTL、trainingwithdrawcopy、刪帳、logs/cache/backup/restore各自scope／Owner與qualified gates。 |
| OD-15、TD-10/AU19、P-7 | OPEN；photo prerequisite approval/governance与既有Developmentevidence差異保持，不由metadata／localPASS解決。 |
| Historical ordering conflict | 舊roadmap executionorder与laterimplementationcommits差異保留；按可證依賴提包，不倒改歷史或宣稱Owner已裁決。 |
| Publication／rollout | C01 readiness／C02發布與C03新增acceptance cases維持原status；legal drafts、registry、399現行月費／299未採用不改；不宣告activationreadinessPASS或live signupclosure。 |

## 10. Source identity ledger 與沿用證據

本輪sourcecommit統一為 `3b1957e8dc459db6fdaa06bec873c1acc632ae9a`。下列rawSHA-256不是GitobjectID；每項已對照起點manifest與committedblob。A01–A06及C04的bytes與acceptedcandidate一致；S系列sourcefacts在§2／3／6限定解讀，source存在不表示遠端已部署。本機readcopies與額外Gitblob/mode在持久externalsource-bindings.json，本文件也列出所有主要bindings。

| ID | 本機source（repository-relative identity） | Exact raw SHA-256 |
|---|---|---|
| C01 | [docs/planning/pc2-activation-preparation/01_OWNER_FACTS_AND_DECISIONS.md](</mnt/d/haocu app/ai-nutrition-social-mvp/docs/planning/pc2-activation-preparation/01_OWNER_FACTS_AND_DECISIONS.md>) | `77228b7a3d530a1c9175cdb860baa8258e23a5ff9dc7e4d84353b70b441866d5` |
| C02 | [docs/planning/pc2-activation-preparation/02_PUBLICATION_AND_ROLLOUT_PLAN.md](</mnt/d/haocu app/ai-nutrition-social-mvp/docs/planning/pc2-activation-preparation/02_PUBLICATION_AND_ROLLOUT_PLAN.md>) | `10c95e29a83fe41430da8ff249801ea427b9e641b3236a80791fa403499aea45` |
| C03 | [docs/planning/pc2-activation-preparation/03_DEVELOPMENT_ACCEPTANCE_RUNBOOK.md](</mnt/d/haocu app/ai-nutrition-social-mvp/docs/planning/pc2-activation-preparation/03_DEVELOPMENT_ACCEPTANCE_RUNBOOK.md>) | `337456c477255ba37f29a26aa064bd0c7a19e5b11cb15307e977c5f75ec2ac04` |
| C04 | [docs/planning/pc2-activation-preparation/04_RETENTION_CONTRACT_AND_ENGINEERING_SCOPE.md](</mnt/d/haocu app/ai-nutrition-social-mvp/docs/planning/pc2-activation-preparation/04_RETENTION_CONTRACT_AND_ENGINEERING_SCOPE.md>) | `681cf4d23facc548d65ffca413a7bbfcd040e30b8bfe0a02f47639b51efc44f9` |
| A01 | [packages/shared/src/domain/consumer-retention/types.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/packages/shared/src/domain/consumer-retention/types.ts>) | `410b69792efe8a9464162968059bb7e57c21e7130e7a5b31673715d440dea93d` |
| A02 | [packages/shared/src/domain/consumer-retention/policy.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/packages/shared/src/domain/consumer-retention/policy.ts>) | `cd12e822dfa255952a08fa306ff72395966f07cc9830d51bfa1fef3f0b1675b3` |
| A03 | [packages/shared/src/domain/consumer-retention/evaluate.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/packages/shared/src/domain/consumer-retention/evaluate.ts>) | `ba77da78b21f5ebb1c9d1bd1f1292f72401eb9feffd3424dfc52c22262f97112` |
| A04 | [packages/shared/src/domain/consumer-retention/index.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/packages/shared/src/domain/consumer-retention/index.ts>) | `d7bca68c68d56b77b0c3aa154b2fe524c5cc5ecffea75ef8a75912886a6de121` |
| A05 | [scripts/consumer-retention-policy-smoke.mjs](</mnt/d/haocu app/ai-nutrition-social-mvp/scripts/consumer-retention-policy-smoke.mjs>) | `13ff0d696d61b79eb1dd73a50ef62c2812d4680cf475f47922141e66d4b371be` |
| A06 | [scripts/consumer-retention-policy-mutations.mjs](</mnt/d/haocu app/ai-nutrition-social-mvp/scripts/consumer-retention-policy-mutations.mjs>) | `e4f9c226160249785bf157c489a7204f58246c5ac5369891fc06f27fba9715ea` |
| S01 | [supabase/migrations/20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712130300_consumer_schema_phase_1_3_consumer_preferences_and_goals.sql>) | `127a64fbd11a34f1629e2510345ba0c2feb1058011c75ffc687ae633336bcef2` |
| S02 | [supabase/migrations/20260712130400_consumer_schema_phase_1_3_meal_records.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712130400_consumer_schema_phase_1_3_meal_records.sql>) | `456f732f88b670c67d853323665c8d3b6c4b8c0825ce0b616d82fe5f8ee1e88e` |
| S03 | [supabase/migrations/20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712131400_consumer_schema_phase_1_3_consumer_rls_policy_drafts.sql>) | `9f0c923d9a47369dd3722bd3513c7b2c0c38ac5e63ad2501bcb7b77373830394` |
| S04 | [supabase/migrations/20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260713040100_consumer_schema_phase_1_3_authenticated_meal_read_grants.sql>) | `90433d9bffbee67302bdf37b5afa94bd2cf5b2720fe0f645487b746d5a81c60e` |
| S05 | [supabase/migrations/20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql>) | `63bf696df277191723ef856004ae0a7ec8e8bf069b52e7e068f076e1c1b1884d` |
| S06 | [supabase/migrations/20260720010000_consumer_meal_record_create_idempotency.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260720010000_consumer_meal_record_create_idempotency.sql>) | `703e724909a96ce7f63a9654ea155cad11d3dbfe5aec29aa99a7296ab16ffb14` |
| S07 | [supabase/migrations/20260724030000_meal_source_record_timing_contract_correction.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260724030000_meal_source_record_timing_contract_correction.sql>) | `84c689af239c530d9e98c1065041b1a4b332e63c09fcd0be0bc505eea5505b50` |
| S08 | [supabase/migrations/20260811030000_social_exposure_entitlement_authenticated_read.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260811030000_social_exposure_entitlement_authenticated_read.sql>) | `4b9667de8cc2f6933737c8677e131f2b5139ef8f005ed20da2ee06e1e17c9bad` |
| S09 | [supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260930174028_consumer_pc2_onboarding_consent_foundation.sql>) | `79fb7610b5e1d5428e2bd986eb6e8388c9d521e1dae9780436e21a283f61a313` |
| S10 | [supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260930174030_consumer_pc2_core_social_eligibility.sql>) | `242ed04e5d948727c8f26ef187e1cb0ea1803ab4eb7db5a4c709f80f19f7ce8d` |
| S11 | [supabase/functions/_shared/social-exposure/resolveEntitlement.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/functions/_shared/social-exposure/resolveEntitlement.ts>) | `09d5d8bc69b72782d59f935fe0aeb285b80aa101a1a7038d333c5fee885e6bc9` |
| S12 | [supabase/functions/_shared/social-exposure/policy.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/functions/_shared/social-exposure/policy.ts>) | `cef032e942ed0f66ccd6a2ba9a817133d19a107b316fba6047bd74bec12cd0f3` |
| S13 | [apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordWriteRepository.ts>) | `61a73dc23f596ddd7d464fab3b0955e447dddfda458c41bfe382b6cafa0842f6` |
| S14 | [apps/mobile/features/consumer-meals/writeValidation.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/apps/mobile/features/consumer-meals/writeValidation.ts>) | `165745ff59aa728e37b45335cbc0f0ac4eca2c281bf62337d28edeac8211a51e` |
| S15 | [apps/mobile/features/consumer-meals/supabaseMealContracts.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/apps/mobile/features/consumer-meals/supabaseMealContracts.ts>) | `360ff9c4c9487d7ccb1c68a331ecc1059ec0140afb53e3d64cd741ee3d730bdd` |
| S16 | [apps/mobile/features/consumer-meals/supabaseMealMappers.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/apps/mobile/features/consumer-meals/supabaseMealMappers.ts>) | `29bdcef0c68e86acd4a3869e20369499aa8fb5ac5d91fa0b62ac3f6f820b684a` |
| S17 | [supabase/migrations/20260712130700_consumer_schema_phase_1_3_planned_meals_and_daily_summaries.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712130700_consumer_schema_phase_1_3_planned_meals_and_daily_summaries.sql>) | `f641a23fd2659e396acebf4ac73cb1441ec6b4acd5d058b8d0f7bf872c933860` |
| S18 | [supabase/migrations/20260712131000_consumer_schema_phase_1_3_consumer_privacy_and_consents.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712131000_consumer_schema_phase_1_3_consumer_privacy_and_consents.sql>) | `b628503a5deafb547135b7fe7194065b61f21442f86a4eed6b5a3112e2a2a1aa` |
| S19 | [apps/mobile/features/consumer-meals/readRange.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/apps/mobile/features/consumer-meals/readRange.ts>) | `288e4faed15a8022f23d7d903ef9937d968c678eb23a4cbca47742bf38148f9a` |
| S20 | [apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/apps/mobile/features/consumer-meals/adapters/supabaseConsumerMealRecordsRepository.ts>) | `58626c7d8689303be8a28ac6dd033e223afc8ac0cb2c6b189fe501ebafc3f8ef` |

### 10.1 歷史／最終報告（reused，source/hash核對fresh）

- original_blocked：[報告](</mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-a-independent-acceptance-20261003/ACCEPTANCE_REPORT.md>)；raw SHA-256 `aa22cfb1371f0ae9f1fe1bb8eb04330004b58d3ec7ff45c0a422051ffb467b3b`。
- corrective：[報告](</mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-a-timezone-corrective-20261003/CORRECTIVE_REPORT.md>)；raw SHA-256 `ce0e7791f472cbbe3e809e963b704b0d94316dbafe17d71b4002261f11dd4c4d`。
- accepted_reacceptance：[報告](</mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-a-independent-reacceptance-20261003/REACCEPTANCE_REPORT.md>)；raw SHA-256 `5a46c50a1511c3137746c76f6333ede208a429f577b47c55c454f42c3f02457d`。

舊BLOCKED報告不是PASS；corrective READY不是獨立PASS；最終REACCEPTANCE_REPORT才是accepted exactcandidate依據。沒有把本輪planning當作重新執行59／644／27證據。R0-A的六個current source/test bindings對應C04 §12.5；其§11舊bindings是原f28867a，不要求覆寫歷史。

### 10.2 公開設計reference

本輪使用Supabase／Postgres設計skills，僅查公開官方文件，沒有projectAPI／遠端DB連線。已讀Supabase changelog（`.md`回應不支援，改讀HTML）；新publictable的API預設不能替代private-schema/GRANT/RLS設計。R0-B需local驗證實際版本／ACL，不從currentPostgreSQL官方文件標題推定本project就是該版本。[Supabase changelog](https://supabase.com/changelog)

引用RLS、SECURITY DEFINER／search_path、鎖與時間型別的官方資料只支持一般設計規則，不證明本project已實現這些新表。公開文檔版本資訊與laterlocalDBtargetidentity在施工時重核；不變更dependencies／遠端settings來配合提案。

## 11. 本輪focused checks與停止

Fresh focused checks只針對05與source bindings：本機reference存在及結論支持、classification／proposal邊界、30項本轮sourcebindings、R0-A current六項與historical54項來源binding、三份reportraw identities、UTF-8／whitespace／secret-pattern，以及唯一untrackedpath。

對照起點3,341trackedfiles的exactrawbytes、index(mode/blob/stage)與Git tracked modes，142migrations／原04／法律／registry／dependencies／所有產品及DemoPool均不得改變。Gitindex proof核對entries，不錯誤要求Gitindexrawhash永久相同。最終fresh核對結果／05rawSHA-256存放外部final proof與最終報告，避免在本文寫自己的hash造成循環binding。

持久本機evidence目錄：

`/mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-b-persistence-scope-review-20261003/`

其中start-state、start-index／trackedmanifest、source-readcopies、source-bindings、boundedsearch原stdout/stderr／commands、reused-reportbindings與focused／preservation proof支持本文件。主要結論、model／mapping／scope／cases／gates全部在本文件，不依賴/tmp存活。

**沒有 stage／commit／amend／fetch／push／deploy；沒有 product／schema／migration／RPC／backfill施工或遠端DB/Auth/Storage；沒有重跑已接受R0-A／PC-2驗證、478suites、webbuild或DBapply；沒有legalactivation。**

Return：**READY_FOR_R0_B_IMPLEMENTATION_SCOPE_REVIEW**。停止於Planner scope review，尚需§9的實際gates及新的exact施工授權。R0-A／PC-2 local acceptance維持通過；法律DRAFT / NOT ACTIVE，activation pending。

## 12. Final authority contract and inactive scope（2026-10-03；PROPOSED，待批准）

本節由本輪實際source review產生。不是Owner已批准具體implementation，也不是fresh runtime／DB PASS。起點HEAD、origin、4/0與原05 SHA均符合；R0-A exactcandidate bytes未變。新增source findings明確區分actual resolver／fixture writer／未就緒的可信producer。

### 12.1 四項缺口的final處理與可施工性結論

| 缺口 | source結論 | final首包契約 | 後續liveintegration gate |
|---|---|---|---|
| T0可信事件 | S02／S10有occurrence、serverdefaultcreated、updated；沒有immutable retention anchor。 | 只預備anchor／acquisition的儲存形狀及一致性約束；不選任何現有field做authority、不安裝capture、不寫真T0。 | T0-F：核定原始紀錄事件mapping及毫秒precision；真newINSERT＋grant同交易，replay/edit不換anchor。 |
| canonicalentitlementproducer | S11／F01只讀目前Socialclass；F04／F05等是fixtureDML，不是付款／trial／升級producer。 | **enabled producer set = empty**；沒有writer role會員、HTTP endpoint、public RPC或任意caller事件admission。 | ENT-F：verifiedproducer身份／scope、eventnamespace/version/time、receipt、coverage／排序／CAS接線。 |
| status／validity／完整性 | F02列active／expired／cancelled／grace_period；S11目前Social讀取邏輯；沒有歷史complete ledger。 | foundation provenance固定unknown、coverage固定unknown、authority_effective固定false；儲存fixture形狀不構成resolved fact。 | STATUS-F：source completeness与tier有效範圍、grace／trial／refund等語意核定後才能resolvedcurrent/history。 |
| rights／protection來源 | S18只有request結構；F03是restaurant／menu bookmarks；A01有rights／protection型別，但未證明完整producer。 | 不從emptyrequest／無bookmark推clear或none；不生成rights／protectionfacts、不准grant生效或purge。 | RIGHTS-F：scope完整／owner/resource/revision的rights/protection來源，與PC-2core一致；unknown停留pending。 |

**建議首包R0-B-IF可獨立實作／驗收，但仍須Planner批准§7.1精確scope**：structural storage、封閉ACL、inactive不生效與原authority相容可在本機disposableDB直接驗證，不需要用未批准T0、假的付款producer或legalactivation替它創造前置。這不等於四項live缺口已實現；live部分保持「來源未就緒→unknown／拒絕」契約。

### 12.2 T0的精確可信事件提案與來源映射（T0-F，未批准）

| 情境／actual source | 精確建議mapping與限制 |
|---|---|
| 正常新建：S10 lines498–540、685–705 | `occurred_at`＝用餐時間（caller input）；`created_at`＝本RPC的DB default建立timestamp；`updated_at`＝內容更新timestamp。建議將T0定為**首個canonical server transaction成功接受此new meal resource的原始capture事件**，在首次INSERT邊界記一次server UTC instant並寫私有`original_recorded_at`及acquisition.at。只有whole transactioncommit才有效；不是「收到HTTP」即取得grant。 |
| acquisition與權益snapshot | proposedcapture sourceIdentity=`canonical_meal_insert`＋resource/eventid，sourceRevision綁定當次transaction receipt／authority revision；原始servercaptureprecision另存證，一次量化到UTC毫秒，T0與acquisition.at同瞬。不得先用早一個clock讀值取tier再用另一時間造acquisition，必須證明producer事件與capture的commit排序。 |
| 有key重試：S10 lines821–983 | v2(actor,client_request_id) fingerprint完全相同→返回已存record/T0/acquisition；同key異payload→既有IDEMPOTENCY_KEY_CONFLICT，不建立第二grant。conversion/finalization各自既有receipt同理。第一次rollback沒有取得T0/grant；retry成功才有一次capture。 |
| 無key重複提交 | legacycreate沒有跨request去重契約。兩次成功可能是兩個resource，各有建立事件；不靠相似meal/time猜同一餐，也不能宣稱foundation修好了此路徑的exactly-once。新增dedupe須另scope。 |
| planned conversion | S10 lines291–342：planned_for、p_confirmation_timestamp及converted_at用途不同；conversion只有實際newrecord首次INSERT可能capture，replayedconversion不再起算。不以callerconfirmation作trustedanchor。 |
| AI／manual finalization | S10 lines1582–1603、2602–2623共用canonicallegacyinsert；analysis、confirmation、correction、fingerprint後續更新不是新的resourceacquisition，不重設T0。 |
| 修改用餐時間／一般編輯 | 保留occurred_at／mealDate的既有業務語意，原capture不可更改，期限仍從T0計算；不以updated_at reset，也不把newmeal_date重算anchor。 |
| 補登 | caller可記過去用餐時間，但「補登第一次server接受」與「歷史用餐瞬間」不同。如果Owner選server原始紀錄事件，仍取該resource首次接受；如果Owner意指用餐／原始外部紀錄事件，不能擅自改成server建立，需要可信producer證明而非caller timestamp。 |
| 匯入 | 本輪boundedsource未證明retention import authority。verified original-record event＋immutableidentity／signature/sourcechain才可能成T0；duplicate import重播同receipt，缺證quarantine。不直接把sourcefile中的date/created_at或目前Paid作歷史grant。 |
| 歷史record | missingcapture／actor/resource/source/eventprecision或矛盾→unknown；不默認occurred_at/created_at/updated_at，不以nowPaid补當時權益，無自动backfill／縮期限／purge。 |

**T0-F真正待Owner批准的單一語意**：原始紀錄時間是「首次canonicalserver接受此紀錄」還是「已驗證的原始外部／用餐記錄事件」？建議前者適用未來一般新建、後者只適用另批准verifiedimport；若Owner意指用餐瞬間，前者會改變expiry起點，必須明確批准。已定UTC／14／180天／降級不縮／編輯不reset不再重問。inactive首包只驗欄位等式，不因此選定這個語意。

### 12.3 Producer身份、授權、事件與receipt契約

| 實際存在的actor／來源 | 可證功能 | 不具備的authority |
|---|---|---|
| authenticatedconsumer＋S10canonicalRPC | 用auth.uid()及PC-2require_core建立meal；不是從body取得owner。 | 不能自指定Paid、永久、歷史acquisition、coveragecomplete、rights-clear或延長期限。 |
| S11／F01 Social resolver | owner-read四欄，目前輸出 `{class: free|premium}`，billing來源欄位被刻意排除。 | read結果不產生immutable權益事件／grant；不存在producerreceipt／historicalPaid證明。 |
| F04 `meal-buddy-demo-seed.mjs` lines348–355 | Developmentfixture，以管理SQL替syntheticviewer刪／寫fixture來源premiumrow。 | 非付款／trial／升級integration；fixture可重建，valid_from預設推前一天不是historyreceipt。未執行此脚本。 |
| F05 `social-candidate-sr2g-d-development-acceptance.mjs` lines204–210 | isolatedacceptancefixture插入premiumrow；其他sr2g-b及demo cleanup/report亦見本輪source search。 | 測試membership只服務該驗收；不能成R0-B realgrantproducer、sourceapproval或activation資料。 |
| futureapprovedcanonicalproducer | **尚未由本機source證明就緒**；不指定猜測的billing檔名、不創造integration存在。 | 本首包不配置credentials／service-rolebypass／新writer、trialpaymentAPI或productionbootstrap。 |

**Final inactive身份契約**：沒有可產生有效Consumerretention事件的runtimeactor。DBmigration/operator只能建立schema；synthetic資料只由disposableDB驗證operator產生，metadata強制unverified／held_inactive，不能被輸出為formalgrant。superuser可繞RLS是DB管理信任邊界，不把它寫成普通Client能力，也不聲稱阻止了惡意DB管理員。

**Future ENT-F admission契約（PROPOSED，不啟用）**：

1. approvedproducer以受限server身份認證，namespace／身份／版本與授權scope逐一registrybinding；只對其被授權的owner/domain產生事件，notClient tier／testfixture。沒有producerbinding就拒絕，不靠字串`verified`或hash認證。
2. event envelope至少含owner、source namespace、upstreameventid、schema/policyversion、canonicalsequence/sourceRevision、effectiveAt與receivedAt、tier/status/validity證據、eventpayload semanticdigest、produceridentity/version。detailcreate才含newresourcebinding；membershipupgrade可為owner事件，receipt逐resource分開。
3. event identity Unique(owner,source namespace,eventid)。相同id＋相同canonical語意digest是重播候選；相同id不同payload/tier/time/owner/version是conflict，不UPSERT改原內容。現在foundation只提供unique／immutable儲存約束，不承諾已有writer返回replayreceipt。
4. UTCeffectiveAt是权益有效瞬間，receivedAt只是接收時間；不可拿較晚receivedAt或現在Paid補歷史。未知／未來／offset或precision不合法／沒有來源timeproof→pending／拒絕。
5. event immutable content與逐resource receipt分表；receipt綁owner/event/resource/old-newrevision/proposedgrantdigest／outcome。未commit、sourcegap、core/rights/protectionunknown或materialunavailable不能`applied=true`。duplicate不advancecursor兩次。
6. owner行與source sequence串行、穩定resource鎖順序／revision CAS；producer、capture、upgrade所有writer遵守同一protocol。sequencegap或out-of-orderarrival須驗sourcecompleteness，不能只按receivedAt排序；同時點以canonicalsequence裁定。未知transition不要丟event或報fullyprocessed。
7. grant＋receipt＋completionwatermark同transaction；失敗atomicrollback，retry原event，不改T0／縮期限。historical U<E14可待驗後重播，但已collapsed/deleted不恢復，R3亦不能因pendingupgrade當作無權益直接purge。
8. 後續producerintegration须另列exactsourcepath／entrysignature／GRANT／RLS與必要T0／rights來源，再獨立acceptance。foundation不能用任意caller-suppliedentitlement或service_role直寫作替代。

### 12.4 Status／validity／completeness對照（SOURCE_FACT與PROPOSED分欄）

| 現有status或R0-Ainput | 可證語意／safeadapter契約 | Unknown／pending条件 |
|---|---|---|
| plan `free`／`premium` | F02／S12識別此兩code；retention `paid`映射premium僅為待核定PROPOSED，不新增`trial`code。 | unknowncode、未核producer、fixture／client來源→unresolved，不把讀到premium當歷史Paid。 |
| `active` | S11在premium且validitywindow內視為目前premium。future需有approvedsource完整snapshot，不能只看status。 | source/binding/validity不合法、overlap矛盾／未定sourcepriority→pending。 |
| `grace_period` | S11/S12目前仍承載premium；保留此source事實。retention是否採同有效權益需technical／必要Owner語意批准。 | 未核grace時間、missingend或只有目前row無historicalevent→pending，不做付費規則決策。 |
| `expired`／`cancelled` | S11不授目前premium；不撤既有E180或permanent。 | 不能據此把舊acquisition降成Free或縮deadline；歷史effectiveboundary未知仍unknown。 |
| validFrom／validUntil | S11現在上下界包含；A03 currentEntitlement亦允許now==validUntil；grant expiry則 `[T0,E)`，now==E到期，兩者不同。explicitnull上界需canonicalsource支持；A型別不允許undefined充null。 | 不默改成半開membershipinterval／永遠Paid；source當前row不能證明create時tier。validUntil<validFrom、futurefrom、invalidprecision皆拒絕。 |
| current `Tier=free|paid` | A01沒有unknowntier enum。合法currentFact须完整authority snapshot、來源有效範圍及current factAsOf==evaluationInstant。 | unresolved在adapter外層pending／nullfacts，不造tier=`unknown`或假Free占位，也不以now作validFrom編造歷史。 |
| 空entitlement rows | S11的Social-onlyempty结果為Free。futurecompleteFree需canonicalcoverage起点／截至evaluationInstant无gap、source健康、已知actorbaseline或明確Free事件。 | 空row本身不完整；readfailure／partialRLSview／未知producer不可轉Free14 acquisition。 |
| 多rows／事件順序 | future只由approvedcanonicalnamespace的revision／來源規則導出唯一當前snapshot；保留supportingeventidentities與scopecoverage。 | 未核sourcepriority、mutuallycontradictorygrant/status、gap／stale／重播異digest→pending，不擇有利Paid或短期限。 |
| Fact.provenance | A01只`resolved|unknown`；resolved要求認證producer＋owner/resource、sourceIdentity/revision、time與完整性。 | hash、nonnullmetadata、claimedproducer、來源row存在均不是proof；foundation强制unknown。 |
| material `present` | futureowner-matched且未deleted/collapsed的實體及版本；存在row可支持presence，不支持rights-clear。 | missingrow不一定是可信deleted；没有tombstone/來源snapshot→unknown；不得復活舊內容。 |
| material `collapsed|deleted|unknown` | collapsed/deleted須可信executor/tombstone/source版本；unknown保持unresolved。 | R3／R5 executor未完成，不從查不到或querylimit推collapsed/deleted。 |
| core `allow|deny|unknown` | S09 core_eligible／require_core是既有authority，保留cohort、registry／consent與rollout語意。coredeny限制新transition／顯示，不縮已得grant。 | sourcefailure／無同瞬snapshot→unknown；training flag或profileactive alone不是完整coreallow。 |
| rights `clear` | future需approvedrightsproducer／dispositionrevision，完整涵盖此actor/resource/用途的request／restriction狀態，在evaluationInstant有效；不是只查activeprofile。 | **目前未證明producer**；無requestrow、completed_at、空查詢／讀錯均不自動clear。 |
| rights `deletion_required` | 已驗request／accountstatus／restriction可支持限制性結果；F02/F08有deletion_requested/anonymizing/anonymized/deleted，S18有pendingrequest，先保守阻止transition／visibility並驗owner/版本。 | request_status是未受enum約束TEXT，不能把不認識status視已解決；`disabled`只支持coredeny，不足以肯定所有刪除义务；未驗來源返回unknown。 |
| protection `saved_meal` | futureR2明確private餐點snapshot／引用／revision；不把F03restaurant或menu bookmark當餐點保存豁免。 | 現在未證明R2producer；未核snapshot／quota／photo引用→unknown，不批permanentdiary/照片。 |
| protection `none`／`unknown` | none需approvedproducer證明該resource在完整scope中確無保護、含並發版本；unknown如實保留。 | **沒有protectionrecord不能推none，更不能推允許刪除**；新resource也需明確並發／引用契約，不能靠剛建row跳過來源。 |

monthlybinding／永久grant／reportzone仍按A01/A03、原§3.3，R1實體未存在時不能造ReportPeriod／reportId。所有purgeAllowed=false；due、hidden、permanent、unknown、rightsrestriction都不啟scheduler／delete。

STATUS-F的live實作仍需核定premium mapping、grace／cancel/refund/trial有效時點與完整Freebaseline，不能把技術閱讀說成Owner批准。inactive首包不判currenttier、不解consent／rights、不宣稱能產生resolved R0-Ainputs，因此上述未決事項不阻礙其structural驗收。

### 12.5 Final首包資料模型與完全inactive邊界（PROPOSED）

與原§3.1不同：使用**新的獨立私有 `retention_internal` schema**，不修改`consumer_internal`、public／Auth／Storage原objects。四表替代原三表＋混合receipt欄位，目的是讓oneevent有多resource receipts並防止event接收誤當全部grant已套用；同一foundation migration即可，不增第二份migration。

| Exact proposed table | 最小欄位與structural constraints |
|---|---|
| `retention_internal.owner_authority_state` | owner_user_id UUID PK、revision非負、mode固定`inactive`、coverage固定`unknown`、producer_binding固定NULL。初始無rows／無ownerbootstrap。UUID僅待驗identityclaim，不是Auth認證或有效member。 |
| `retention_internal.authority_events` | event_id UUID PK、owner/source_namespace/upstream_event_id、event_schema_version/policy_version、claimedproducer/revision／sequence（未知可空）、kind=`detail_create|paid_upgrade|entitlement_observation`、resource_id（create必填）、effective_at/received_at、tier／validity、semanticdigest、provenance固定`unknown`。unique owner/namespace/upstreamid；ownerFK至ownerstate；event identity/content immutable UPDATEguard；沒有producer已驗證欄位可被Client設true。 |
| `retention_internal.operation_receipts` | receipt_id、owner/event_id/resource_id、operationkind／idempotencykey、before/afterrevision、proposal digest、outcome=`held_inactive|rejected`、applied固定false。owner＋event的compositeFK防crossowner；unique owner/event/resource/operation，revision非負且held不宣稱advance有效grant；receiptcontent immutable。不是successful authority receipt。 |
| `retention_internal.detail_grants` | owner/resource PK、original_recorded_at、acquisition eventId/at/tier、retained_until、extension eventId/at（成對可空）、policyversion、revision、provenance固定`unknown`、authority_effective固定false。compositeFK到同owner/resource的createevent，必要的eventtype／at/tier supportingUNIQUE与FK；extension FK同owner的paid_upgrade事件。只允許已接受R0-A的validshape：acquisition.at=T0、Free14／Paid180、Freeextension U>=T0且U<E14至原T0+180、Paid無Freeextension。 |

所有precision／deadline使用explicitUTC毫秒、嚴格有效時間与acceptedpolicyversion；不要用sessioncalendar14days代替elapsed336hours。DB CHECK不能跨row偽查來源：事件kind／owner／at／tier／resource綁定使用上述compositeFK／UNIQUE，必要immutableguard只比較新表OLD/NEW，不讀public或newcallerbody。

new-table UPDATEguards精確保持owner/resource、T0/acquisition、policy／eventcontent／receiptimmutable，retainedUntil不減、grantrevision不倒退；合法Free延長shape仍需相應event，但其provenance unknown且無writer，**只作disposableteststructural候選，不變成真grant**。event／receipt immutability不承諾lawfuldeletion永遠禁止；runtime无DELETE/UPDATE權限，未增加任何deleteexecutor或跨表清理副作用。

**不新增Auth／meal_records FK、product supportingUNIQUE/index、producttrigger或RPC**：首包只驗privateowner/resource/event的內部一致性，不聲稱驗證實際Authactor或mealowner。liveintegration需要owner認證與實際resource compositeFK／transactionbinding時，必須另migration／scope批准；在此之前mode／provenance/effectiveness constants及無API／無writer共同阻止私有row成產品授權。此處不能只靠口頭`inactive`flag後開genericwriter。

scope內可建立兩個`SECURITY INVOKER`、emptysearch_path且fullyqualified的**新表constraint trigger functions**（event/receiptimmutable guard可共用一個，detailgrantimmutable/non-shrink一個）；不建立SECURITY DEFINER grantwriter／public RPC／HTTPentry。trigger只掛新私有表，不讀clock、network、billing、consent／rights或觸碰任何existingproducttable。

### 12.6 RLS／GRANT／REVOKE與operator邊界（PROPOSED）

- sealed owner role `consumer_retention_foundation_owner`：NOLOGIN、NOINHERIT、NOSUPERUSER、NOCREATEDB、NOCREATEROLE、NOBYPASSRLS。它只是newobjects storage owner，不是producer；沒有永久membership或`SET ROLE` path給runtime／existingroles。migration若為DDL臨時membership，必須同transaction revoke並查pg_auth_members證明無殘留。
- schema四表／constraints／兩個constrainttriggerfunctions由該role擁有；ENABLE＋FORCE RLS，**zero permissive runtime policies**。owner因FORCE RLS也不能常態讀／寫資料。不要因schema名稱私有就假定不暴露／安全。
- 明確REVOKE schemaUSAGE/CREATE、所有tableprivileges、functionEXECUTE及defaultPUBLICfunctionEXECUTE／defaulttableprivileges，對PUBLIC、anon、authenticated、authenticator、service_role與其他非owner角色不授新privileges。包含本機現有social/admin/restaurantauthorities；通過pg_namespace/pg_class/pg_proc ACL與rolesmembership完整matrix查證，不能只看這五個角色名稱。
- 不GRANT任何Client SELECT/DML，不建立「owner-read」policy或genericstatus/metadata更新API。沒有被啟用的producerprincipal、granttransitionfunction、seeduser、Paidrow、activebundle／registrypayload或capturehook。
- trustedDBsuperuser/migrationoperator本來可bypassRLS；不伪称RLS擋住它。operator只能在**可拋棄本機testDB**為驗收存syntheticUUID/events/candidategrants；productionfoundationmigration body必須零INSERT/UPDATE/DELETE、零fixtures。沒有正式seed或runtimebootstrap。
- runtimeCAS、producerenqueue／replay／grantapply、ownerlocks實作不在首包：storageunique及單DBtransaction能驗，不能將testoperatortransaction稱作已完成serverproducerprotocol。後續activation不可只是updateinactiveflag，需另forwardmigration建立verifiedsources/roles/policies／受控writer與既有PC-2/rights/ownershipgate後再批准。

這是本次inactive contract：無runtimewriter、無resolvedprovenance、無effectivegrant、無successfulgrantreceipt、無consumerfacts輸出。既有service_role的BYPASSRLS亦不能代替USAGE／tableGRANT；不得借它開broadwriteshortcut。schemas、GRANT與RLS需實際DB驗證；本輪只是規劃，沒有執行SQL。

### 12.7 精確成功、負向與mutation gates（全部PLANNED / NOT EXECUTED）

兩個scripts僅在另授權施工後新增／執行，保存逐項raw stdout/stderr、SQL／command、exit、SQLSTATE、CHECK identity、actualsource/DDL/bootstrap/tooling hashes及before-afterDBobservations。沿用F06/F07的existingPostgreSQL17／pg localcluster/bootstrap原理，**不執行或匯入會自動跑整個原suite的top-level腳本**，不改原bootstrap／harness；缺existingbinary/extensions/pg套件時BLOCKED，不安裝dependencies、不skip-as-pass。

建議script介面：`node scripts/consumer-retention-persistence-smoke.mjs --pg-bin <existing-local-bin> --out <persistent-external-dir>`；mutations同flags。此為未建立scripts的PROPOSED CLI，不是本輪命令或PASS。DB只連腳本自己建立的disposableUnixsocket／localhostport，拒絕外部DSN／remotehost；fixturedata只存該DB與不敏感rawreport，不留formalgrant／activation資料於repository。

| Success gate | Actual acceptance與必要觀測 |
|---|---|
| IF01 Fresh apply | 空disposablecluster＋hash-boundF07bootstrap，原142依序apply再candidate一次共143；不偷偷略migration、修改原seed法律或補已存在table來讓apply成功。bootstrap不等於remoteSupabase完整環境PASS。 |
| IF02 Upgrade apply | 獨立cluster先142，快照所有existingcatalog/data，加入candidate一次；與IF01新objects modes／constraints／roles／ACL一致。existing legal/registry、rolloutstate、cohort、subscription rows內容完全不變。 |
| IF03 No runtime rows | fresh／upgrade正常candidateapply後四張newtable rows=0；mode inactive、coverageunknown、无public functions／producttriggers／scheduledjobs／registryactivation。 |
| IF04 Ownership／ACL／RLS | 檢查exact四table與两privateconstraintfunctions／ownerrole flags，ENABLE/FORCE、zeroallowpolicies、no memberships及全部runtime角色schema/table/function權限；real authenticated/anon/service_role操作拒絕，不能只匹配DDL字串。 |
| IF05 Valid synthetic graphs | 在disposableoperator建立ownera/b claim、Free14／Paid180／Freeupgradevalidshape、heldreceipt，讀回exactUTC毫秒／eventreferences；所有provenanceunknown／effectivenessfalse／appliedfalse。這是test候選，未認證member或建立realgrant。 |
| IF06 Source bindings | acquisition／extension／receipt精確匹配owner/event/kind/resource/at/tier/version；hashrow不是verifiedproof，資料保存不提供任何consumerauthorityoutput。 |
| IF07 Anchor／term invariants | E14/E180與A02常數一致；edit/candidateUPDATE不得換acquisition/T0或縮E180；test合法structuralFreeupgrade不重算原T0。E是儲存shape，不執行到期／顯示／刪除。 |
| IF08 Identity uniqueness | duplicateowner/namespace/eventid與receiptkey由actualuniqueness拒絕；讀回原row不變。同semantic內容也只檢查storageunique，不宣稱已存在writer的replayAPI。 |
| IF09 Atomic rollback | transaction插event／candidategrant／heldreceipt中任一constraintfailure，全transactionrollback，無orphan／falseappliedreceipt。各crashpoint保存完整觀測。 |
| IF10 Local concurrency | 兩operatortransaction爭同event/receipt/grantkey，只有合法唯一graph／無lostupdate；revisionCAS測試是disposableSQL，不冒稱realproducer鎖規則已實作。 |
| IF11 Baseline authority compatibility | 前後snapshot所有scope外pg_get_functiondef/owner/ACL/RLS/policies/triggers/indexes/constraints/tablemodes及rows；consumer_internal/public/Auth/Storage originals完全一致。沿原inactivepreparationcohort合成fixture做create/v2/replay與deniedcore樣本，metadata仍0，不啟正式legal。 |
| IF12 Unknown boundary | 即使syntheticcandidate有Paid/e180形狀，unknownprovenance與inactive使它不能當resolvedFact。可用獨立小probe載A01/A03確認unknown拒絕／purgefalse，**不重跑已接受smoke／mutation套件**。沒有productread/export/writer可取代此邊界。 |
| IF13 Reversibility／residue | proposedfailed-DDLtransaction不留partialrole/schema/membership；tests結束關閉disposableclusters，fixture只在測試證據／DB內，repository无ignoredresidue。保存新DDLapply失败的raw而不是自行更改既有142。 |
| IF14 Frozen proof | 原3341trackedpaths rawbytes／Gitmode/blob/indexentries保持；新增inventory恰1migration＋2scripts及05。原142migration、R0-A6source/test＋04、PC-2guard、legal／registry、dependency／DemoPool固定hash不變；independentacceptance另輪。 |

| Negative gate | Exact violation及預期拒絕／不變觀測 |
|---|---|
| N01 | anon/authenticated/authenticator/service_role與其他runtimeprincipal對schema/newtable SELECT/INSERT/UPDATE/DELETE/TRUNCATE或privatefuncEXECUTE→permissiondenied或RLSdeny，fixture原rows不變。 |
| N02 | SETROLEstorageowner或新增membership／CREATEschema/table/function→原runtime無permission；RLSprobe若臨時localtestmembership，force仍deny；不得在candidateDDL開此membership。 |
| N03 | caller／testoperator把mode改active、coverage改resolved、producerbinding非NULL、provenance改resolved、effectiveness/applied=true→CHECKreject，不留下可用grant。 |
| N04 | grant／receipt引另一owner的event、wrongresource createevent、wrongkind、acquisitiontime/tier與event矛盾→FK/CHECKreject；不由目前Paid修正成合法。 |
| N05 | blanknamespace/eventid/schema/policy、unknownpolicy、badhexsemanticdigest、invalidtier/statusshape→CHECK/NOTNULL拒絕。recordsource字串合法亦不認證producer。 |
| N06 | DB型別／constraint拒絕非法instant、契約year外、未對齊毫秒的typed value或T0/acquisition不同瞬；使用不會先自動round的timestamptz欄位再CHECKprecision。PostgreSQL接受no-offset或自動normalize的字串時，不聲稱DB證明其原始offset；rawstring驗證屬後續produceradmission，本包接受的test候選仍provenanceunknown／inactive，不能變authoritativeT0。 |
| N07 | Free deadline錯一毫秒、Paid14、expiry從upgrade/updated_at重算、calendarDST偏移→CHECKreject。 |
| N08 | Free U=E14或after、U<T0、extension缺pairedtime/id、非Paid／otherowner upgrade或Paidacquisition附Freeextension→CHECK/FKreject。 |
| N09 | 將合法E180改回E14且同時清extension（其他shape仍coherent）→non-shrinkguard拒絕；retentionterm不能因downgrade縮。 |
| N10 | 另建同resource的coherent createevent後將grant整組T0/acquisition/event/deadline切到新event→immutableanchorguard拒絕，防重設而非只靠單欄FK巧合。 |
| N11 | UPDATEeventnamespace/id/time/tier/payloaddigest或receiptowner/outcome/idempotencybinding→immutableguard拒絕；重复id新digest不能overwrite。 |
| N12 | stale／倒退revision、receipt嘗試宣稱有效advance／applied成功→CHECK/guard拒絕；storage不存在eventgapresolution能力。 |
| N13 | 任何failedrow/transaction留下partialgrant/receipt、或者duplicatekeyaftererror以新event回寫→驗atomicstate為原样；不只看exceptionexit。 |
| N14 | fixture插入existingpublicsubscription／legalbundle、metadata轉formalgrant，或script接受remoteDSN→scope gateFAIL；candidate整體apply不允許任何real會員／activationseed。 |
| N15 | apply/setup/extension/roleconnection失敗→exit2或明確BLOCKED，保存runtimeerror；不計mutationdetectedPASS。 |
| N16 | existingfunction/ACL/trigger/policy/tableconstraint被改、migration順序跳過／hashchange、額外path／testresidue→frozen/compatibility gateFAIL；不改既有harness繞過。 |

| Mutation identity | Disposable mutation與必須由正常PASS變FAIL的行為CHECK |
|---|---|
| M01_RUNTIME_ACL | 單一newtable向authenticatedgrant讀寫／schemaUSAGE→IF04/N01發現runtime可存取。只在mutantcopy，正常foundation無授權。 |
| M02_RLS_DISABLE | 移除一table的RLS。localtestprobe臨時最小SELECT privilege後，normal0rows、mutant讀到syntheticrow→RLS_ROWS_HIDDENFAIL。probeprivilege只在disposableDB，不加回candidateSQL。 |
| M03_FORCE_RLS_REMOVE | 移除FORCE；disposabletest SETROLE newstorageowner，normal仍deny、mutantownerbypass讀row→OWNER_FORCE_DENYFAIL。 |
| M04_MEMBERSHIP_LEAK | 保留newownerrole的runtime／migrationmembership→NO_ROLE_MEMBERSHIPFAIL，actualSETROLE/ACLmatrix核實；notregexonly。 |
| M05_INACTIVE_CHECK_REMOVE | 去掉mode或effectiveness固定constraint，再由disposableoperatorsetactive/effective→INACTIVE_CANNOT_ACTIVATEFAIL。 |
| M06_PROVENANCE_CHECK_REMOVE | 去掉provenance固定unknownconstraint，再setresolved→NO_UNVERIFIED_TO_RESOLVEDFAIL。 |
| M07_OWNER_FK_REMOVE | 去掉receipt或grant owner/event compositebinding→wrongowner合法shape被收下→CROSS_OWNER_REJECTFAIL。 |
| M08_DEADLINE_CHECK_REMOVE | 去掉確切deadlineconstraint→Free/paid錯一毫秒被寫入→DEADLINE_EXACTFAIL；源graph保持正常，避免FKsetup先失敗。 |
| M09_NONSHRINK_GUARD_REMOVE | 去掉N09的guard而保留其他constraints，縮deadline且清extension仍coherent→TERM_NEVER_SHRINKSFAIL。 |
| M10_ANCHOR_GUARD_REMOVE | 去掉N10的anchorimmutableguard，用第二合法createevent整組重設→T0_NEVER_REBINDSFAIL。 |
| M11_EVENT_IMMUTABLE_REMOVE | 去掉event/receipt immutableguard，改未被FK引用的同owner事件語意digest或receiptsemantic欄位→EVENT_CONTENT_IMMUTABLEFAIL。 |
| M12_UNIQUE_REMOVE | 只移除event的UNIQUE(owner,source_namespace,upstream_event_id)，保留event_idPK與compositeFK所需UNIQUE；插入兩個不同event_id但相同upstreamidentity的coherent events→DUPLICATE_STORAGE_KEY_REJECTFAIL。normal是23505／原row不變，mutant實際容許duplicate；不能因FK/applysetup先失敗計PASS。 |

每mutation须copyexact143migrationsequence、hash-boundbootstrap、新scripts／normalgraph，mutation前正常controls先通過，保存target/path/before-afterrawhash／patch／sourceidentity。被mutant拿掉constraint也可能被另一constraint拒絕，這種測試沒有測到預定破壞，必須找出原因，不把仍exitnonzero算detected。new individualoutputs在evaluator前保存，避免summary失敗丟raw。

**Fresh apply與scope邊界**：這一輪完全不跑DB、typecheck、R0-A／PC-2套件、478suite或產品build。未來實作首包必跑上述fresh/upgrade DBgates；原authority功能以before-afteractualcatalog與少量canonicalRPCcompatcases證明，不能宣稱不重跑整套等於跳過必要checks。若需改既有guard／record才能接受新143inventory，停提exactscope，不自行擴path。

### 12.8 四項live契約批准與後續package依賴

首包最終scope由Planner批准；T0-F／ENT-F／STATUS-F／RIGHTS-F仍是**liveintegration前**的gates，不需為inactivefoundation先假造答案。首次capture、paidupgrade、Freebaselinecompleteness、rights-clear與protectionnone在未批准時全部不提供resolvedfacts。

真正Owner語意：T0-F的server原始紀錄與verified原始事件選擇；若grace/cancel/refund/trial的有效權益會改變既定產品規則，其時間／資格要另Owner批准。Technicalgates為canonicalproducer可證sourcepath、身份／sequence/timeproof、完整Free與rights/protectionregistry。14／180／六個月份／永久方向／降級不縮及UTC已定，沒有重新詢問。

後續live方案最少需newforwardmigration驗verifiedsource、actualAuth/mealownerbinding、core/rights/protection同瞬facts、atomiccapture/grantreceipt與allwriters鎖序；不能只放寬inactiveconstraint就啟用。B-Z／B-M、R0-C、R1–R5依原scope另批；月度永久grant不先造placeholderreport，photos／training／logs／cache／backupTTL及quota不在首包。OD-15、TD-10/AU19、P-7與歷史ordering/governanceconflicts保持OPEN／pending。

### 12.9 原§7.1完整歷史提案（verbatim，已被本輪首包替代）

以下原文是在先前producer未核定時的livecandidate，不是currentinventory或批准；保留其內容供追溯。除將此block移至本節，原review／sourceledger／原報告不倒填。

```markdown
### 7.1 建議首包 R0-B-D（5個候選paths，其中2個migration實際檔名待CLI）

| Candidate path | 用途／必要性 | 必要gates |
|---|---|---|
| `supabase/migrations/<CLI timestamp>_consumer_retention_authority_foundation.sql`（新增） | private三表、owner/resource composite FK與supporting UNIQUE、event/receipt/revision constraints、最小authority role/ACL/RLS、內部事件validation／grant transition helpers。不重建billing／不backfill。 | T0-1、AUTH-1、AUTH-2；owner isolation、provenance／precision、R0-A parity、Auth cascade與完整原migration相容。 |
| `supabase/migrations/<CLI timestamp>_consumer_retention_detail_grant_capture.sql`（新增） | 共同record INSERT capture hook，同transactionmetadata／grant；active/pending rollout gate，已知create/v2/conversion/finalization paths全覆蓋，無UPDATE reset。 | exact actual-writer／lock graph先證；RPC signatures／fingerprints／errors保持；capture failure atomic；沒有代替core gate或新Client API。若trigger不能滿足，停止重提scope。 |
| `scripts/consumer-retention-persistence-smoke.mjs`（新增） | local disposable DB讀取actual新DDL／functions，執行正向／並發／replay／rollback／typed grant映射與R0-A parity，保存rawoutputs与版本。 | 正常setup先通過；exact candidate bytes與DB role/tooling identities；不更新原R0-A smoke／PC-2scripts。 |
| `scripts/consumer-retention-persistence-mutations.mjs`（新增） | disposable DB／copies的negative controls：Client forge、wrong owner／tier／T0、event冲突／gap、deadline縮短、overwrite／aliasprecision錯、setup失敗區分。 | 實際mutation生效、normal→指定behavior failure、raw CHECK/runtime／exit／before-after hashes；不得修改既有mutation harness。 |
| `docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md`（後續更新本文件） | implementation前凍結exact names/decisions，之後區分runtime證據與歷史scope；本輪只新增提案，不記未執行PASS。 | 對新metadata承諾與不生效邊界保持一致，記postcommit和独立acceptance在該輪授權範圍。 |

這次**未凍結SQL欄位／function簽名、migration timestamp或producer實作path**；它們需Planner technical scope及Owner T0語意後才能形成可施工exact inventory。若AUTH-1需要新的billing producer／HTTP endpoint或既有writer path改動，列出真實full path另授權，不能塞進上述migration／test以繞範圍。若既有frozen guards／record bindings不接受新增migration，提出相容性差異，不改guard來使candidate通過。

**B-D local完成標準**：全部正常、負向、concurrency／failure gates與独立acceptance通过；server captured T0及grant/event receipt確實在同DB交易持久化；current tier與historicalgrant分開；unknown不造權益／purge；既有RPC功能／core／所有scope外bytes保留。內部synthetic producer契約通過只能叫local persistence foundation；沒有真canonicalproducer接入證據，不能宣稱automatic upgrade已生效。

這個package不修改mobile、R0-A四模組／兩測試、dependencies、142既有migrations、legal drafts／registry，也不承諾current UI開始顯示14／180天。新forwardmigration可對既有meals增加supporting key／trigger，必須在另授權schema施工／本機DBgate中驗證；目前沒有任何schema改動。
```

### 12.10 新source bindings、focused checks與停止

新增直接相關source（F01–F09）与本輪39項reviewbindings，均綁定同一HEAD `3b1957e8dc459db6fdaa06bec873c1acc632ae9a`；原§10的30項ledger完整保留。這些是freshread/hashcheck，不是執行fixture或fresh產品PASS。

| ID | Exact source | Raw SHA-256 |
|---|---|---|
| F01 | [supabase/functions/_shared/social-exposure/types.ts](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/functions/_shared/social-exposure/types.ts>) | `f7103b7325c965729e62ef42bf205479e66de031c7fbc71b479e9de6270dc69c` |
| F02 | [supabase/migrations/20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712130100_consumer_schema_phase_1_3_consumer_enums_and_helpers.sql>) | `0235e2e12a331e4fbd77bd68e056874a809e93345f9b42f33bc509ff7c516a1c` |
| F03 | [supabase/migrations/20260712130800_consumer_schema_phase_1_3_ratings_and_favorites.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712130800_consumer_schema_phase_1_3_ratings_and_favorites.sql>) | `baa8f3225eec4e1392e0707f8591bcc86c8e4e411c906a58f9a5821784b483d3` |
| F04 | [scripts/development/meal-buddy-demo-seed.mjs](</mnt/d/haocu app/ai-nutrition-social-mvp/scripts/development/meal-buddy-demo-seed.mjs>) | `e6d38446cc5b17b79c2d82fb32674ca96e122c294c17f88dca7e80610c4ab404` |
| F05 | [scripts/social-candidate-sr2g-d-development-acceptance.mjs](</mnt/d/haocu app/ai-nutrition-social-mvp/scripts/social-candidate-sr2g-d-development-acceptance.mjs>) | `a317846427c9307b8d55aeccd172ddea31494b5f83cc25c9c68c600aa4e6846e` |
| F06 | [scripts/pc2-consumer-onboarding-postgres.mjs](</mnt/d/haocu app/ai-nutrition-social-mvp/scripts/pc2-consumer-onboarding-postgres.mjs>) | `358180266cbd471d716bdbc6dff83e9cd7a2f09c229ff7bbcfa4ae6ebc8462cc` |
| F07 | [scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs](</mnt/d/haocu app/ai-nutrition-social-mvp/scripts/restaurant-owner-branch-temporal-ra-2h-p1-postgres-apply.mjs>) | `9fd0639abd9d66d84ade2aab76315e0d4dc3771f72cda2652450a4871b991e23` |
| F08 | [supabase/migrations/20260712130200_consumer_schema_phase_1_3_consumer_profiles.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260712130200_consumer_schema_phase_1_3_consumer_profiles.sql>) | `1738766e1cd2f5a81a51d44aee1899d17b761dfccb5f4be019d3ec1e08df2ac8` |
| F09 | [supabase/migrations/20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql](</mnt/d/haocu app/ai-nutrition-social-mvp/supabase/migrations/20260713030100_consumer_schema_phase_1_3_authenticated_profile_select_grant.sql>) | `333e00b5c0d357957516da8fdb29b6e62a9734354c0af17d99ad8bf7e75545b0` |

F04/F05只讀source分類，未存取其credentials／tmpmemberfixtures或執行遠端。F06/F07只讀localtooling/bootstrap，未執行任何DB／legalfixtureactivation。原independent／corrective／reacceptance報告继续沿用，未改其bytes或當時結論。

本輪唯一delta為05，原raw SHA-256 `d47a6629bc5da9331c5e80a4255c4240503e23c4d3b430eef405d9c9b143ceac`；最終hash由外部proof／finalreport提供，避免selfhash。source/readcopies、05before／exactdiff、原§7.1verbatimproof、Gitindex／trackedmanifest與focusedchecks持久保存於：

`/mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-b-final-authority-scope-20261003/`

Focusedchecks僅source支持與hashbindings、history保留、UTF-8／whitespace／secret-pattern、exactonepathdelta與其餘3341trackedrawbytes/Gitmodes/indexentries／142migrations不變；結果詳externalfinalproof。沒有stage／commit／fetch／push／deploy／remoteDB/Auth/Storage、SQL／script建立／apply、product/R0-C/R1–R5implementation或legalactivation。

Return：**READY_FOR_R0_B_FINAL_SCOPE_APPROVAL**。這是finalscope提案，不是已批准或已實作。R0-A／PC-2localacceptance維持通過；法律DRAFT / NOT ACTIVE，activationpending。停止於報告，等待Planner finalscope批准。

## 13. R0-B inactive foundation — approved implementation record（2026-10-03）

### 13.1 Owner T0 approval（OWNER_CONFIRMED；本輪新增，非歷史實作）

本輪 **R0-B — INACTIVE PERSISTENCE FOUNDATION IMPLEMENTATION** 明確批准：T0 是可信 server transaction **首次成功保存該筆紀錄**的時間；whole transaction commit 才形成有效 capture。今天補登昨天餐點，保存期限从今天首次成功保存起算，occurred_at 仍是用餐時間／報表歸屬。編輯、重試、重複提交、後續同步不重設 T0；Client 不得指定／改寫權威 anchor。UTC 連續24小時，Free14／Paid180天；未到期升級延至 **原 T0＋180天**，降級不縮已得期限。缺歷史 provenance 維持 unknown，不能從 created_at／updated_at／occurred_at 猜測或回填。

這取代 §9.1 T0-1、§12.2 T0-F 當時的語意 pending；原文保留是歷史，不能再把已回答問題列為待 Owner 決策。本輪仍 **沒有 server capture producer 或權益 producer 接線**，零正式 capture／grant。將來 verified import 也不能擅自換回 caller 的過去時間或推造歷史 grant，需另包 identity／dedupe／provenance 契約。

### 13.2 Exact implemented inventory and bindings

| Repository-relative path | Raw SHA-256 | 本輪用途 |
|---|---|---|
| `supabase/migrations/20261003062157_consumer_retention_inactive_persistence_foundation.sql` | `2eb6cc69865de7b01b98556de710a72ef0d8e0347755dec9725fb2c5d1d512ea` | 一個 forward DDL transaction；新的 private schema／owner／四表／兩個新表約束 guards。 |
| `scripts/consumer-retention-persistence-smoke.mjs` | `dc38d6326d6af83f894e38f1026975d6dc3f54ca18b78e1c73c898889d88e497` | 本機實際 fresh／upgrade apply、14成功與16負向、權限／rollback／並發／compatibility。 |
| `scripts/consumer-retention-persistence-mutations.mjs` | `caa1028af48fdb2d8bf47dffc1ac0310bbe278725a31580d8ed2969808b377bc` | 12個實際 candidate SQL mutations；正常 setup、DB observation、CHECK evaluator process、完整 raw 證據。 |
| `docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md` | 本文件自身 hash 僅記外部 final report；無 self-hash／循環 binding | 保留原 review／ledger／historical proposals，追加批准與實作證據。 |

本輪精確 inventory 為上述四個 **A** paths（05 是承接先前 untracked 的完整文件）。原142 migration bytes 不變；新增檔按核准名稱排在 `20260930174030_consumer_pc2_core_social_eligibility.sql` 之後，local inventory 共143。沒有新增第五個 path，沒有改 R0-A、dependencies、既有產品／harness、法律或 registry。

### 13.3 Actual storage and authority boundary（IMPLEMENTED_AND_EVIDENCED；local only）

| Actual object | 儲存形狀與實際限制 |
|---|---|
| `retention_internal.owner_authority_state` | UUID identity claim／非負 revision；mode=`inactive`、coverage=`unknown`、producer_binding=NULL。無 member bootstrap。 |
| `retention_internal.authority_events` | owner／namespace／upstream identity、schema=`retention-event-v1`、已接受 policy version、claimed producer/revision/sequence、kind/resource/timestamps/tier/validity、digest；provenance=`unknown`。自然鍵 UNIQUE 與 private owner FK；content UPDATE immutable。字串／digest 不認證 producer。 |
| `retention_internal.operation_receipts` | owner/event/resource/operation/idempotency/digest/revisions；outcome僅held_inactive或rejected，applied=false，after_revision=before_revision。Composite event-owner-kind-policy FK、create-resource FK（generated identity claim）、兩組 UNIQUE；content UPDATE immutable。不是成功 authority receipt。 |
| `retention_internal.detail_grants` | acquisition 綁相同 owner/resource/create-event/time/tier/policy；T0=acquisition_at。Free期限336 elapsed hours；Paid／合法 Free extension 為4320 elapsed hours。extension 綁同owner paid_upgrade，T0≤U<E14，不能用 upgrade time 重新起算。provenance=unknown，authority_effective=false。anchor/policy immutable，term不縮，changed revision必須前進。 |
| `retention_internal.reject_content_update()` | SECURITY INVOKER、empty search_path；只比較 event／receipt OLD/NEW，不讀產品、clock、network或其他 authority。 |
| `retention_internal.guard_detail_update()` | SECURITY INVOKER、empty search_path；只比較 private grant anchor／deadline／revision。 |

所有 timestamps 使用無 rounding typmod 的 timestamptz，加 finite、UTC year1–9999、毫秒對齊 CHECK。PostgreSQL 已把字串轉成 typed instant 後，不能證明原始 offset 或 producer 時間來源；raw input admission 仍是後續包。沒有用 session calendar days 或 updated_at 改期限。

四表與兩函式／schema 均由 `consumer_retention_foundation_owner` 擁有。NOLOGIN、NOINHERIT、NOSUPERUSER、NOCREATEDB、NOCREATEROLE、NOBYPASSRLS；**membership zero**。四表 ENABLE＋FORCE RLS、zero policies，owner read 亦0 rows。PUBLIC／anon／authenticated／authenticator／service_role／全部現有非 superuser application authority roles 無 schema USAGE/CREATE、table privileges 或 function EXECUTE；零 sequences。對新 objects 顯式 REVOKE，包括可能來自 DDL actor defaults 的 ACL；new owner default PUBLIC function EXECUTE 已撤銷。System superusers／內建管理權能不被誤稱一般 Client；未賦任何新權限。

**Actual DDL actor requirement**：PostgreSQL17 非 superuser CREATEROLE 自動生成由 bootstrap administrator 授出的 ADMIN membership；初次 ordinary REVOKE 後仍有一筆，IF04如實 FAIL。新 migration 在第一個 DDL 前核對 current_user 的 rolsuper；不是可信 DDL administrator 時以 `42501 / RETENTION_SEALED_OWNER_REQUIRES_DDL_ADMIN` 拒絕並 rollback，不能帶殘留 membership 成功。Local原142檔仍用原 bootstrap 的 non-superuser postgres apply；candidate由既有 disposable supabase_admin apply，同 transaction暫時 membership最終清空。沒有 SECURITY DEFINER／role escalation helper，沒有修改原 bootstrap、原角色 attributes 或既有 ACL。這是部署前須核對的 DDL execution 前提，**未證明或取得任何遠端 administrator 身份／部署能力**。[PostgreSQL17 role GRANT/REVOKE rules](https://www.postgresql.org/docs/17/sql-revoke.html)

沒有 Auth／meal_records FK、既有表 supporting index／trigger、public RPC、producer entry、payment/trial integration、monthly grant／report-zone registry、material/protection/rights producer、R0-C 查詢／顯示接線。UUID／shape validation不是實際 user/resource ownership 認證。Normal fresh／upgrade apply 后四表皆空；所有合成 graphs 僅在 disposable DB，測試後停止／刪除。

### 13.4 Actual pre-commit gates and raw evidence

Fresh local binary 是既有 Windows PostgreSQL17.6（含 pgcrypto／btree_gist）；Node **v24.15.0**、pg8.23.0。這與沿用 R0-A Node22.23.1環境不同，未捏造相同 tooling，也未重新執行其 accepted suites。工具 binary／bootstrap／candidate／loader raw hashes及 exact commands 存 tooling.json／SQL query ledger。現有 WSL17.6 缺 btree_gist 的 apply 記 SETUP_FAILED，沒有略過 predecessor、安裝 extension 或算 PASS。

兩個 scripts 實際 CLI：

```text
node scripts/consumer-retention-persistence-smoke.mjs --pg-bin <existing PostgreSQL17 binary directory> --out <external persistent evidence directory>
node scripts/consumer-retention-persistence-mutations.mjs --pg-bin <existing PostgreSQL17 binary directory> --out <external persistent evidence directory>
```

實際 Windows argv／完整 stdout/stderr與 exits在外部 `command.json`、`command.stdout`、`command.stderr`；每個 SQL query 的原文、arguments、完整 rows／SQLSTATE／runtime error先即時保存為sql-NNNNN.json。Script只建立自身的disposable localhost cluster，拒絕 DSN／host／未核 arguments，不連遠端。

| IF gate | Pre-commit local result／觀測 |
|---|---|
| IF01 | PASS：原142順序＋candidate，共143，實際 apply。 |
| IF02 | PASS：獨立 upgrade cluster＋representative legacy fixture；existing catalog/data/roles/membership/default ACL 完整相等，新表／columns／constraints／triggers／ownership／ACL 與fresh一致。 |
| IF03 | PASS：fresh／upgrade新四表0 rows，無 runtime seed／activation。 |
| IF04 | PASS：實際 sealed role flags／zero memberships、完整 app-role ACL matrix、ENABLE/FORCE RLS／zero policies；兩個 private INVOKER guards。 |
| IF05 | PASS：Free14、Paid180及Free extension三個合成候選；unknown／false／held沒有變正式grant。 |
| IF06 | PASS：normal unused resource graph可寫，owner/resource/event/kind/time/tier/policy bindings；N04逐項矛盾被拒。 |
| IF07 | PASS：DST session下仍originalT0＋15,552,000秒，合法 structural extension；N09／N10單独防縮期／重綁。 |
| IF08 | PASS：事件自然鍵、receipt key storage uniqueness，23505；不宣稱 writer replay API。 |
| IF09 | PASS：event/grant/receipt三個crashpoints，加invalid grant／invalid receipt的完整交易 rollback；前後graph exact equality。 |
| IF10 | PASS：兩operator transactions競 event／grant／receipt keys，各只有一筆，競爭者23505；revision CAS第一個1 row／第二個0。不是已實作 runtime producer。 |
| IF11 | PASS：scope外functions/ACL/policies/triggers/indices/constraints/table metadata/data與roles/default ACL frozen；legacy create、v2／same-key replay與incomplete core42501前後一致；metadata仍0，無法律fixture activation。 |
| IF12 | PASS：actual accepted module的小型獨立 unknown probe；合成Paid shape／unknown acquisition不能resolved，purgeAllowed=false，input不變／deterministic。非重跑R0-A套件。 |
| IF13 | PASS：intentional DDL division-by-zero22012 rollback無partial schema/role/membership；disposable cleanup有記錄。 |
| IF14 | PASS：原3341 tracked bytes／modes／index entries及原142／R0-A／法律／產品／Demo Pool不變；精確四paths。External raw manifest另確認全部bytes。 |

| Negative gate | Pre-commit result／拒絕與安全觀測 |
|---|---|
| N01 | PASS：全部現有 runtime principals實際DML/read/TRUNCATE／private EXECUTE denial；ACL matrix涵蓋四表／兩函式。 |
| N02 | PASS：非管理者 session identity實際SET ROLE／GRANT／CREATE schema/table/function denial；不能用管理者session換角權限冒充runtime。 |
| N03 | PASS：active/resolved/bound-producer/effective/applied嘗試23514；無正式grant。 |
| N04 | PASS：wrongowner/resource/kind/time/tier及receipt create-resource矛盾23503/23514。 |
| N05 | PASS：blank namespace/event/schema、unknown policy、bad digest/tier/validity23514。 |
| N06 | PASS：invalid typed time/date、infinity、year外、microsecond、T0/acquisition不一致被拒；不聲稱typed DB驗raw offset。 |
| N07 | PASS：錯1ms、Paid14、upgrade重算、calendar DST差异23514。 |
| N08 | PASS：U=E14／after／beforeT0、缺pair、wrong kind/owner、Paid original extension23503/23514。 |
| N09 | PASS：coherent E180→E14＋清extension仍由RETENTION_TERM_NEVER_SHRINKS拒絕。 |
| N10 | PASS：第二合法createevent整組重綁仍由RETENTION_ANCHOR_IMMUTABLE拒絕。 |
| N11 | PASS：未被grant FK引用的event digest、receipt digest UPDATE由RETENTION_CONTENT_IMMUTABLE拒絕。 |
| N12 | PASS：倒退/stale changed revision、receipt有效advance/applied宣稱被拒。 |
| N13 | PASS：五個failed transaction／constraint checkpoints，完整rows前後不變。 |
| N14 | PASS：candidate無seed／public authority DML，remoteDSN arguments被拒。 |
| N15 | PASS：實際子程序missing PG bin exit2/BLOCKED，raw保存，不算mutation detection。 |
| N16 | PASS：existing bytes/index／catalog與143排序來源未變，無額外paths。 |

| Mutation identity | Specific failed behavior CHECK | Actual evaluator exits normal / mutant |
|---|---|---|
| M01_RUNTIME_ACL | RUNTIME_DENY | 0 / 1；PASS detection |
| M02_RLS_DISABLE | RLS_ROWS_HIDDEN | 0 / 1；PASS detection |
| M03_FORCE_RLS_REMOVE | OWNER_FORCE_DENY | 0 / 1；PASS detection |
| M04_MEMBERSHIP_LEAK | NO_ROLE_MEMBERSHIP | 0 / 1；PASS detection |
| M05_INACTIVE_CHECK_REMOVE | INACTIVE_CANNOT_ACTIVATE | 0 / 1；PASS detection |
| M06_PROVENANCE_CHECK_REMOVE | NO_UNVERIFIED_TO_RESOLVED | 0 / 1；PASS detection |
| M07_OWNER_FK_REMOVE | CROSS_OWNER_REJECT | 0 / 1；PASS detection |
| M08_DEADLINE_CHECK_REMOVE | DEADLINE_EXACT | 0 / 1；PASS detection |
| M09_NONSHRINK_GUARD_REMOVE | TERM_NEVER_SHRINKS | 0 / 1；PASS detection |
| M10_ANCHOR_GUARD_REMOVE | T0_NEVER_REBINDS | 0 / 1；PASS detection |
| M11_EVENT_IMMUTABLE_REMOVE | EVENT_CONTENT_IMMUTABLE | 0 / 1；PASS detection |
| M12_UNIQUE_REMOVE | DUPLICATE_STORAGE_KEY_REJECT | 0 / 1；PASS detection |

每項 normal graph先實際成功，再apply不同SHA的mutant SQL到獨立DB，指定CHECK從PASS變FAIL；不是setup failure／baseline result replay／字串匹配替代runtime。Normal/mutantSQL完整保存；schema mutation1–12來源與目標before/after hashes、behavior.json、evaluator.stdout/stderr、evaluator.json與result.json逐項保存。Evaluator獨立process重新從**fresh DB observation**核對contract（不讀saved PASS flag），其OS exit0/1；主mutation suite exit0表示12個預期破壞均被偵測。DB基線template由本輪真正apply的142檔建立；clone只避免重建已證明相同predecessors，每一正常／mutant都實際apply candidate，不複用candidate結果。

### 13.5 Evidence provenance, freeze and pending acceptance

Persistent evidence root：

`/mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-b-inactive-foundation-implementation-20261003/`

Fresh：本輪Git/index/全tracked raw manifest、DDL/bootstrap/工具identities、fresh/upgrade apply、IF/N cases、12個actual mutations／independent evaluator processes、scope/encoding/whitespace/secret-pattern/prohibited-surface與外部proof。Pre-commit主要smoke證據是 `precommit-smoke-final/`，mutations是 `precommit-bound-mutations/`；最終freeze前binding／command-focused確認與後續postcommit實際results由外部 final report列明。首次setup／harness failures保留，不倒改為PASS；其中permission probe原管理者session、summary variable shadowing及DDL membership缺口均在本輪新paths內修正，原harness未動。

Reused：§10.1 R0-A accepted reacceptance與PC-2 local acceptance、既有Owner契約及39項source ledger。原六source/test＋04 bytes／modes不變是適用證明；沒有重跑R0-A accepted suites、PC-2 478 suites、web build、遠端或Development tests。

**Local implementation complete／independent acceptance pending**。本段在local freeze前保存；單一commit及postcommit focused IF/N/M重跑的實際SHA/exits由外部 FINAL_IMPLEMENTATION_REPORT.md綁定，不再修改本文件。任何postcommit failure須BLOCKED，不amend或新增corrective commit。Authority compatibility此小型集合NEW_REGRESSION=0，以catalog/data equality及各RPC outputs可比行為證明，不宣稱完整478-suite differential。

尚未存在／未證明：canonical capture及entitlement event producers、authenticated真实owner/resource binding、歷史coverage／Free baseline完整性、verified rights/protection sources、monthly grant與timezone registry、grant persistence至正式產品、R0-C顯示／查詢、R1–R5。T0語意已批准；producer／status／rights／後續TZ/月份/quota/照片及copies期限仍各自pending。不能只改mode／provenance constants啟用，需另forward integration migration／受限writers與獨立批准。

NO push/fetch/deploy／remoteDB/Auth/Storage／legal activation；無正式會員fixtures。原roadmap ordering與photo governance/Development evidence兩項歷史conflicts保留；OD-15、TD-10/AU19、P-7仍OPEN。R0-A／PC-2 local acceptance維持通過；法律DRAFT / NOT ACTIVE；activation pending。R0-B僅交**獨立本機驗收**，不是activation readiness。


## 14. F2 / F1 — authorized local deployment-authority corrective record（2026-10-04）

### 14.1 Authorization, exact scope and retained history

Owner 的 **R0-B — LOCAL DEPLOYMENT-AUTHORITY CORRECTIVE REMEDIATION** 批准精確四個既有 paths 的修正及一個新的 local corrective commit，不 amend 原 accepted commit。起點 main / HEAD `26f9a136da4dc484e60a97828803f8c942452c62`，parent `3b1957e8dc459db6fdaa06bec873c1acc632ae9a`；本機 origin/main `b70884a013ac67486242fe5d11b9bfad1360032a`，5/0，worktree clean / staged empty。這不是 Hosted rewrite／repair-history／deployment 授權。

| Exact existing path | Current raw SHA-256 / purpose |
|---|---|
| `supabase/migrations/20261003062157_consumer_retention_inactive_persistence_foundation.sql` | `8d315af1ee9854dc27e3f374280866636971d68c04633f29a01a44f3b56af956`；F2 native gate／transaction-local builder及F1 pre/postconditions。 |
| `scripts/consumer-retention-persistence-smoke.mjs` | `b3a238c416920b357a5cdb37d51eb85e9dcd5ce8161a4e83ab1ad05febc18924`；保留原契約，新增實際F1/F2 controls與raw bindings。 |
| `scripts/consumer-retention-persistence-mutations.mjs` | `9068c2caafe9e250b67fa40aea3fb1a44e49a33b387d285593719d5dca4da742`；保留原契約，新增實際F1/F2 controls與raw bindings。 |
| `docs/planning/pc2-activation-preparation/05_RETENTION_AUTHORITY_AND_PERSISTENCE_SCOPE.md` | 本文件 hash 僅記外部報告；保留原 bytes，prepend current status 與 append §14，無 self-hash。 |

四個變更都是 **M**；無第五個 path、無新 migration。143 個 migrations 中只有本輪第143檔改變，原142檔 immutable；scope 外 **3,341** tracked paths 的 raw bytes／blobs／modes 不變，包含兩個 Demo Pool commits、R0-A、PC-2、產品、dependencies、法律及 registry。Index 原 entries 在 stage 前保持不變；正常 stage / commit 只改這四份 entries，不能要求 index raw hash 提交後仍等於施工前。

原 acceptance `C:\Users\Mufan\acceptance-evidence\r0-b-independent-20261004\ACCEPTANCE_REPORT.md` 為 **R0_B_LOCAL_ACCEPTANCE_PASS at 26f9a13**。12個 key artifact raw hashes已核對；final 18 probes有效，probes-run1 / probes-run2作廢，不計入結果。§13.2–13.5 當時 hashes／SUPER gate／pending acceptance 逐 bytes保留，不把新結果寫回原時點。

Diagnosis `r0-b-deployment-authority-diagnosis-20261004/` 的完整 report、inventory、unapplied patch、632項artifact index與37項有效 observations已核對。37項是 **reused diagnosis evidence**（27 F2 /10 F1），不是本輪新candidate驗證數。SQL patch先在目前source `git apply --check` exit0，再apply；僅將 PROPOSED 註解更新為實際契約。Original storage body從CREATE SCHEMA至object ACL revoke block **exact bytes相同**，實際storage structure／fixtures亦相同。

### 14.2 F2 native authority and transaction-local builder（IMPLEMENTED_AND_EVIDENCED；local only）

Migration 在任何DDL前核對 **current_user=session_user**，catalog中的 native actor 必須 LOGIN，且為 SUPER，或 **當前database owner OID＋CREATEROLE**。這是已批准的 local administrator profile；不依postgres名稱／caller GUC／任意Paid／Client值放行。一般 CREATEROLE、service_role（即使測試賦CREATEROLE）、switched SET ROLE及偽造setting全部 `42501 / RETENTION_DDL_ACTOR_NOT_AUTHORIZED`。

同一 BEGIN / COMMIT：actor建立 NOLOGIN / NOINHERIT / NOSUPERUSER / NOCREATEDB / CREATEROLE / NOBYPASSRLS `consumer_retention_ddl_builder`，僅暫時授SET給native actor。Builder建立原sealed owner，暫時授owner INHERIT / SET給actor；原 storage body由actor完成。Builder撤銷自己授出的owner membership，actor DROP builder，消除PG17 bootstrap ADMIN edge；最後檢查owner作role、member或grantor均零membership。Builder不擁有SQL objects，沒有廣泛 DROP OWNED / REASSIGN OWNED。Quoted role identity取自session catalog，不由caller指定。

成功後builder不存在；owner所有flags false、零memberships、四表 ENABLE / FORCE RLS、零policies、schema/table/function ACL封閉，原 INVOKER guards／empty search_path unchanged。Native actor在seal後不能自grant owner、改owner LOGIN、讀private表或DROP schema（四項42501）。既有同名builder或owner以42710拒絕；OID／attributes保留，不接管或清除。重入不採用既有objects，rollback無builder residue。四個真實22012 fault points（builder建立、owner grant、storage建好、builder drop後）全部scope外catalog/data/roles/default ACL／membership parity，無partial schema/owner/builder。

另一個名稱的 native database owner＋CREATEROLE 與 native SUPER 亦成功；因此不是 role-name allowlist。授權的administrator仍屬database信任邊界，不能把此封閉runtime ACL誤稱可阻止malicious SUPER／未來另案DDL actor改安全設定。

### 14.3 F1 predefined capabilities / membership / INHERIT / SET / BYPASSRLS

不再以 `rolname NOT LIKE 'pg_%'` 略過整批內建角色。一般non-SUPER principals及其 ACL仍必須零runtime private權限；兩個有天然data權限的 `pg_read_all_data` / `pg_write_all_data` 單獨分類，不要求其自然 schema USAGE與data privileges為零。全角色matrix記錄flags及 MEMBER / USAGE(INHERIT) / SET，catalog edges記錄grantor / ADMIN / INHERIT / SET；另列所有可SET到BYPASSRLS identity的path。

Migration前／後兩次保守preflight：除兩個predefined data principals外，任何 non-SUPER principal直接或間接 MEMBER於任一data role，均 `42501 / RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE`。這包括latent non-inherited path；不宣稱每個MEMBER已洩漏，不自動REVOKE目標grants。未滿足此deployment prerequisite時拒絕，不設provider wildcard exemption。

Operator先證明四表均有coherent synthetic fixtures（2 owner、5 events、3 grants、1 receipt）；再各對read/write builtin及sealed owner，實際 SELECT / INSERT / UPDATE / DELETE，兩data角色另實際TRUNCATE。SELECT / UPDATE / DELETE為0或42501，INSERT為42501，builtin TRUNCATE為42501；owner自然TRUNCATE不受RLS，所以不拿它作FORCE-RLS row判據。Natural read/write privileges存在，private EXECUTE / CREATE / TRUNCATE不由data rights取得。試驗rollback後fixtures exact equality。

| New actual mutation | Expected failure identity / concrete effect |
|---|---|
| M13_DIRECT_BYPASS_READ | F1_DATA_MEMBERSHIP_SAFE；service_role直接INHERIT data read，實際讀2 rows。 |
| M14_DIRECT_BYPASS_WRITE | 同CHECK；直接INHERIT data write，實際INSERT 1 row。 |
| M15_INDIRECT_BYPASS_READ | 同CHECK；data→bridge→service_role，實際讀2 rows，edges明確存在。 |
| M16_SET_ONLY_LATENT | 同CHECK；MEMBER=true / INHERIT=false / SET=true，native讀42501，仍拒latent prerequisite，不冒稱已洩漏。 |
| M17_RUNTIME_SET_BYPASS | 同CHECK；authenticated實際SET到BYPASS data-bearing role，讀2 rows；BYPASS旗標不被誤當可INHERIT。 |

每個normal與mutant實際apply當前SQL到独立clone，填入非空graph，再保存DB observations；獨立child evaluator直接核對catalog／SQLSTATE／behavior，而不是saved pass flag。Normal exit0、mutant exit1、stderr empty；setup/runtime/evaluator異常為BLOCKED，從不算detection。Normal/mutant hashes不同，完整SQL／behavior／evaluator命令保存。所有global role mutations只在disposable cluster；每clone drop自身DB、移除自身測試roles與兩個明確fixture memberships，再比較完整membership catalog（含OIDs／grantor/options）與正常起點相等。

### 14.4 Precise CHECK mapping and valid local gate evidence

| Original CHECK / expectation | Current contract and reason |
|---|---|
| NONADMIN_DDL_DENIED：拒絕non-SUPER postgres | Identity保留，但probe改為真正未授權service_role；錯誤42501 RETENTION_DDL_ACTOR_NOT_AUTHORIZED。授權native database-owner＋CREATEROLE則成功；沒有blanket non-SUPER exemption。 |
| IF01 / IF02 / IF13：candidate原用SUPER apply | 正常fresh143與upgrade142＋candidate改native non-SUPER postgres；DDL rollback亦native。Trusted SUPER相容另外實測。 |
| IF04 / RUNTIME_DENY / N01 / N02 | 原app ACL／實際denials不弱化，角色掃描擴至非data builtin；predefined naturalrights另分類，全membership／SET paths另測。原runtime roles是新版受測集合的subset。 |
| M04_MEMBERSHIP_LEAK | 原REVOKE-from-postgres字串anchor消失；改為成功COMMIT後在自身clone由privileged fixture授owner給authenticated，NO_ROLE_MEMBERSHIP仍actual CHECK FAIL。不是postflight setup拒絕冒充detection。 |
| M01–M03 / M05–M12 | 原 corruption／behavior CHECK／normal0-mutant1 契約保留。 |
| New F1 / F2 controls | 18個F2＋6個F1 focused checks；另外IF14/N16 frozen proof。 |

**有效逐項 gates 已齊備：14 success /16 negative；原12 mutations＋5 new role-path mutations（17 unique controls）**。不是把中途失敗whole run改標PASS。`precommit-smoke-1` exit1：在IF01–IF13、N01–N15及有效behavior完成後，fault injector的JS replace把 `$$`解成`$`，owner-granted故障SQL以42601 setup失敗。`precommit-mutations-1` exit2：原12及M13有效後，global membership fixture未恢復導致下一normal setup被preflight正確拒絕。兩份raw/result保持原exit；不算那兩個setup失敗為安全detection。

授權scripts內的修正：literal replacement callback保持SQL `$$`，每clone精確membership restoration／parity。`precommit-authority-final` **exit0，26 checks**（18F2 /6F1 /IF14 /N16）；`precommit-mutations-affected` **exit0，6 affected controls**（M04、M13–M17），每clone restoration通過。已有效且邏輯未受後續修改的fresh／upgrade／原12mutation evidence沿用，不重跑整輪。Intermediate執行source從確切保存editor operations重建，raw SHA與tooling/execution hash完全相等，明確標RECONSTRUCTED，而非冒充當時capture的副本；最新focused sources完整bind當前三份bytes。

Full CLI仍可由兩個committed scripts重現14/16與完整17 mutations；programmatic `authorityControls(bin,rec)`與 `runMutations({bin,out,only:[known IDs]})`可重現本輪focused subset。`only`只能選既有control IDs，不開放DSN／remote host；預設ALL_17。Exact CLI沿用§13.4，外部focused runner僅import這些exports，無另外repository harness。

### 14.5 Meaningful differential and frozen evidence

與26f9a13：**22項完整observations exact相等**（IF02、IF03、IF05–IF12；N03–N14），包含constraints／times／unknown outputs／RPC compatibility及data rollback，不是只比PASS數。N01原runtime role集合仍完整涵蓋，原denials及新增denials均42501；N02 escalation亦42501。New native apply與original SUPER apply各在完整142 predecessor clone中實際執行，scope外catalog/data/roles/memberships/default ACL相等，new storage structure與coherent graph exact相等。Original storage body exact bytes相同。Fresh / upgrade authority compatibility保持不變。

**NEW_UNAUTHORIZED_REGRESSION = 0**，範圍限本次F1/F2與targeted authority集合；不宣称478-suite sweep或完整平台acceptance。F3 receipt future-writer binding／F4合法刪除边界不變，未擴成runtime writer或額外immutability承諾。

Tooling：既有 Windows PostgreSQL17.6、Node v24.15.0、pg8.23.0；未安裝／變更dependencies。每次bootstrap／binaries／actual SQL／scripts hash、完整commands/exits/raw SQL observations與mutation artifacts皆在persistent外部目錄。Original37 observations／Claude final18 probes／官方PG17與Supabase docs標REUSED；本轮actual candidate apply／controls／differential／hash/scope checks標FRESH。歷史2026-10-02 Hosted rolsuper=false報告仍僅historical reported observation，不是本輪remote read。

Persistent evidence root：

`/mnt/c/Users/Mufan/.codex/visualizations/2026/09/10/01a08bb5-886f-7e61-bfd3-a34b57cc6a2c/r0-b-deployment-authority-corrective-20261004/`

重要records：`before.json`、`sql-patch-apply-check.json`、`reused-acceptance-bindings.json`、`INTERMEDIATE_SOURCE_PROVENANCE.json`、`PRECOMMIT_GATE_AGGREGATE.json`、`BASELINE_CANDIDATE_DIFFERENTIAL.json`、`precommit-smoke-1/`、`precommit-mutations-1/`、`precommit-authority-final/`、`precommit-mutations-affected/`。提交及post-commit results僅追加外部 `FINAL_CORRECTIVE_REPORT.md` / `EVIDENCE_INDEX.json`，不再改寫本文件bytes或宣稱此pre-commit時點已完成post-commit。

### 14.6 Pending Hosted prerequisites and independent reacceptance

本機模型證明stock PG17.6下的已批准administrator／builder契約，不等同Hosted專案。未核對目標native connection actor、database-owner OID／CREATEROLE／LOGIN、CREATE/DROP ROLE／GRANT/REVOKE／SET能力、管理服務DDL hooks／reserved-role限制、全角色membership prerequisite、目標migration history／partial apply狀態。不能假設能取得Supabase SUPER。後續需另行授權目標facts／部署方案；不能以後置migration解決先行migration失敗，亦不能對已套用目標默默rewritesource或repair-history。現有可得證據未證明原migration已目標apply；本輪授權僅local candidate。

新candidate等待 **Claude independent reacceptance**，至少獨立重跑native fresh/upgrade、未授權actors／builder lifecycle／collision／rollback、全role paths與非空fixture F1 controls、actual17 mutations／failure identities、原14/16 contracts、targeted compatibility／source bindings／scope外 frozen bytes。不把implementer results当独立PASS。

原R0-B acceptance維持26f9a13；R0-A／PC-2 local acceptance維持通過。無runtime capture／entitlement producer、產品顯示接線、回填、monthly grants、R0-C／R1–R5、purge／刪除／training copies／legal activation。OD-15、TD-10/AU19、P-7 OPEN；原roadmap ordering與photo governance conflicts保留。法律 **DRAFT / NOT ACTIVE**；activation pending。NO fetch / push / deploy / remote DB / Auth / Storage。

## 15. R0-B-C1 same-transaction identity binding、atomic history 與 canonical entry — authorized local corrective record（2026-10-05）

### 15.1 Authorization、exact scope 與保留邊界

TastKind Owner 已批准 `FINAL_FOUR_PATH_PROPOSAL.md` 的交易內 identity binding、原子 migration history 設計與四檔本機 corrective scope，並附加驗收澄清。本輪只授權本機施工、可拋棄 PG17 驗證，以及全部 pre-commit gates 通過後的一個 corrective commit。不授權 Hosted 寫入、rehearsal、部署、history repair、ETL／匯出、CI／token 修改或法律啟用。

Parent / accepted candidate 為 `fc39891b88c16a1c0224234bd79839b71c0f73d5`。修改限於下列既有四檔（全部 M）：

- `supabase/migrations/20261003062157_consumer_retention_inactive_persistence_foundation.sql`
- `scripts/consumer-retention-persistence-smoke.mjs`
- `scripts/consumer-retention-persistence-mutations.mjs`
- 本文件（只追加本節；§1–§14 bytes 保留）

沒有第五檔、新 migration 或 dependency 變更。原 142 migrations、產品、法律、registry、Demo Pool 與其他 scope 外 bytes／modes 保持不變。

以下內容逐字保留：

- F2 原文（首 14 行）；
- migration 原 DDL 本體（原 27–216 行；`CREATE SCHEMA` 至 sealed-owner residue check）；
- FORCE RLS、ACL、sealed owner、builder lifecycle、T0／provenance、inactive／unknown 邊界。

Foundation 維持 inactive：無 producer、真實 grant、回填或刪除。

### 15.2 G1：DDL 前、同一交易內的模式與綁定（IMPLEMENTED；local only）

**執行順序：** `BEGIN;` 之後依序執行：

1. F2（原文）；
2. F1（批准管理邊界，§15.5）；
3. G1；
4. 送出 `R0B_DDL_BOUNDARY` notice；
5. 才開始第一個 DDL。

**模式判定：** G1 以明確 Supabase 平台 marker 判定模式，不以 OID 10 名稱判定（本機 harness 的 OID 10 也是 `supabase_admin`）。Marker 為：

- roles `pgbouncer`、`supabase_auth_admin`、`dashboard_user`、`supabase_read_only_user`、`supabase_etl_admin`；
- schema `supabase_migrations`；
- `supautils.reserved_roles` setting。

| 模式 | 適用條件（全部須成立） | 綁定內容 |
|---|---|---|
| `plain-local`（相容路徑） | 無 selector、無 manifest／nonce、上述 marker 一個都不存在 | logical F1 + 原 F2 + scope digest + G2 精確後狀態；不寫 history |
| `local-fixture` | selector=`local-fixture`；無 `pgbouncer`／`supabase_auth_admin`／`dashboard_user`／`supautils` marker；`tastkind_r0b_fixture.attestation` 由 OID 10 superuser 擁有且恰一列，nonce 與 manifest sha256 相符 | 完整 binding（含本機 OID）+ 原子 history |
| `hosted-development` | selector=`hosted-development`；manifest UTF-8 sha256 = migration 內嵌常數 `2630322532a4b2a2864dc3cdb8f01c8e6838ebe9ead85bc5719b3f4ef746e59c` | 完整 Hosted binding + 原子 history |

**Fail-closed 規則：** 下列情況全部在 DDL 前以 42501 拒絕，不會落入較寬鬆的 local fallback：

- 任一 marker 存在但無 selector（`R0B_PLATFORM_SELECTOR_REQUIRED`）；
- 有 manifest／nonce 但無 selector；
- selector 無效；
- Hosted manifest 不符；
- fixture 未 attest；
- fixture 出現在平台 marker 上。

因此 `db push`、Dashboard SQL editor、Management API 或任何不帶 selector 的路徑在 Hosted 一律 DDL 前拒絕。Supabase 本機 docker（`db reset`）亦屬平台型，同樣需要 selector。

**前狀態檢查：** retention roles 或 schema 已存在時，以 42710 `R0B_RETENTION_PRESENT` 在 DDL 前拒絕（不再嘗試 `CREATE ROLE`）。

**Bound 模式比較：** 在 bound 模式下，G1 以 `-- r0b:observe:begin/end` 之間的單一 SELECT 取得觀察值，並與 manifest 逐段比較：

- `target`（database／OID／owner）
- `actor`（session、current、OID）
- `roles`（全部 roles，含 OID、7 旗標、`valid_until` 以 UTC 微秒字串比較、`connection_limit`）
- `memberships`（全部 edges：member／role／grantor／ADMIN／INHERIT／SET）
- `functions`（42 個：schema／name／`pg_get_function_arguments`／OID／owner／config／ACL／SECURITY DEFINER／`sha256(pg_get_functiondef)`）
- `tableHooks`（28 tables：present 的 kind／owner／RLS／FORCE RLS／triggers 與 rules，以及 absent tables）
- `history`（`schema_migrations` 欄位與型別、全部 version 集合）

另有一條固定規則：bound tables 的 triggers 必須全部 enabled（`TABLE_HOOKS_DISABLED`）。這是因為核准證據沒有 enabled 狀態欄位，所以以固定規則 fail-closed 補足。

**比較的表示法：** 所有 rendering 都在 transaction-local `search_path=''` 與 `COLLATE "C"` 下進行，與核准 Hosted 證據的 qualified rendering 一致。任何不符都以 `R0B_PRESTATE_BINDING_MISMATCH <classes>` 拒絕。

**Hosted manifest：**

- 由下列已批准外部證據推導（每檔 sha256 皆固定）：identity snapshot `e839ee8f…`、32 RPC reconciliation `9028a618…`、helpers `8e9bac98…`、hook capture `2027d3d4…`／SQL `9198eeb5…`、history `f8bce7a7…`、history 欄位 `57a08fdd…`。
- 內容：88 roles／82 edges／42 functions／28 hook tables／66 versions。
- 以 canonical JSON（61,077 bytes）commit 於 `HOSTED_MANIFEST`。
- `deriveHostedManifest()` 可由同一組證據逐 byte 重建；不會自動 refresh。
- 本輪 Owner run 只比對到 75/88 roles、81/82 edges 的子集；完整矩陣於部署時在交易內重新比較。

**Source capture：** bound 模式以 `current_query()` 取得實際執行字串，並檢查：

- header 行恰出現一次；
- header 之前只能是 `SET tastkind.r0b_(target|manifest|fixture_nonce) = $r0b$…$r0b$;`（`R0B_SOURCE_PREFIX`／`R0B_SOURCE_CAPTURE`）；
- 自 header 至結尾即為實際執行的 migration source，並以 transaction-local setting 傳給 G2。

**Scope digest：** G1 計算 retention 範圍外的 catalog digest，並以 transaction-local setting 保存。涵蓋：

- 全部 roles 與 memberships；
- 非系統 schemas、relations、functions（prosrc／probin／args／rettype 的 sha256）；
- triggers、rules、policies、default ACLs、event triggers、extensions、publications；
- database ACL／owner。

### 15.3 G2：精確後狀態、漂移與原子 history

**漂移檢查：** G2 重算 scope digest。凡 G1 之後已提交的並行變更（roles、edges、functions、triggers…），都以 `R0B_POST_GUARD_DRIFT` 整筆 rollback。

**精確後狀態：** retention 後狀態 digest（`-- r0b:poststate:begin/end`）必須等於 `407d86c5d8dae1cfb0419d28b04519221707982298389c5b8859bc0be630dafc`，否則 `R0B_POST_STATE_MISMATCH expected=… observed=…`。Digest 涵蓋：

- schema owner／ACL；
- 4 tables 的 kind／owner／ACL／RLS／FORCE RLS／options；
- 全部欄位與 default／generated；
- constraints、indexes、triggers 與 enabled 狀態；
- 2 functions（含 `sha256(pg_get_functiondef)`）；
- policies 數；
- owner 的 default ACLs；
- owner 與 builder 的 role 旗標（builder 必須不存在）；
- 涉及兩者的 memberships 數（必須為 0）；
- owner 在 retention 以外擁有的物件數。

Digest 不含 OID 與 wildcard；新增內容不會被接受。

**History row（bound 模式）：** G2 之後、`COMMIT` 之前，寫入 `supabase_migrations.schema_migrations(version, name, statements)`。值為 `20261003062157`、`consumer_retention_inactive_persistence_foundation`、`ARRAY[實際執行 source]`。寫入後立即核對：

- 該 version 恰一列、name 精確；
- `statements` 為一維、下界 1、cardinality 1，`statements[1]` 等於實際 source；
- 可重現表示法 `encode(sha256(convert_to(statements[1],'UTF8')),'hex')` 等於 source 的 sha256，也就是 migration 檔案 raw bytes 的 SHA-256；
- 其他欄位等於宣告的 column default（無 default 則為 NULL）；
- 全部 version 集合等於 manifest 的 66 版加本版。

Entry 另外記錄 `array_to_json(statements)` 的 sha256 作為輔助表示。

**狀態分類（entry 唯讀判定）：**

| 狀態 | 條件 |
|---|---|
| ABSENT | 無 roles、無 schema、無 row，history 等於原集合 |
| APPLIED | 僅 owner、schema 存在、後狀態 digest 精確、row 精確（element sha256 等於檔案 sha256）、history 等於原集合加本版 |
| INCONSISTENT | 其他一切狀態（例如只有 row 或只有物件） |

**Entry 行為：**

- 在 ABSENT 時才執行一次。
- APPLIED 時 no-op（執行次數 0、DDL 0）。
- INCONSISTENT 時停止（DDL 0），不自動 repair。
- 交易失敗或 commit 結果不明時，以唯讀後檢判定；僅在 ABSENT 且原因已釐清時才重試。

### 15.4 Executor 事實與 canonical entry

**固定版 Supabase CLI 2.109.1 無法作為執行器：**

- `supabase.exe` `22c0f28f…`：`db query` 以 prepared statement 送出 SQL，server 對多語句回傳「cannot insert multiple commands into a prepared statement」，完全不執行（DDL 0）。已以真 binary 驗證（B11、E09）。
- `db push`（Go）因遠端獨有的 `20260903182941` 觸發 `ErrMissingLocal` 而中止；它會重組 URL 而丟棄 `sslmode`／`sslrootcert`；無法攜帶 selector；並且自己寫 history。

**Canonical entry：** `applyR0BHostedDevelopment()`，由 `runBoundEntry` 以 node-pg simple query 執行（同一 general client 已於 2026-10-05 Owner run 證明 actor 與 TLS）。Entry 拒絕下列任一情況，此時 connects 0、CLI 0、DDL 0：

- 缺 Owner 確認字串；
- password 不來自環境；
- 禁用參數（`push`、`--linked`、`--password`、`repair`…）；
- executor 不是 `node-pg`（CLI 先核對 binary hash，再以 incompatible 拒絕）；
- host／port／database 或 tenant 不符；
- 非 `verify-full`；
- 缺 CA 或 CA sha256 不等於 `700723…f3b7`；
- migration sha256 不等於 `R0B_MIGRATION_SHA256`；
- manifest sha256 不符。

連線後會核對憑證鏈的根指紋等於官方根 `80:70:25:AD…CA:FA`，不符則在任何 SQL 之前拒絕。

此 entry 不經本 script CLI 暴露。任何 Hosted 使用，以及「以 node-pg 取代 Owner 原選 CLI 作為執行器」，都須 Owner 另行批准。

### 15.5 F1：批准的管理讀取邊界

原 F1 拒絕所有非 superuser 的 predefined data membership，在 Hosted 必然失敗。新 F1（DDL 前後各一次，訊息仍為 `RETENTION_PREDEFINED_DATA_MEMBERSHIP_UNSAFE`）規則如下：

- 非 superuser 的 `pg_read_all_data` member 只能是已披露的 `postgres`、`cli_login_postgres`、`supabase_etl_admin`、`supabase_read_only_user`。
- 任何非 superuser 不得是 `pg_write_all_data` member。
- 六個 App runtime roots 不得為 superuser，也不得以 MEMBER 路徑到達任一 superuser、兩個 predefined data roles 或上述四個管理身分。

本機 smoke／mutation evaluator 同步採用相同規則。這是已批准的前瞻契約變更；本機舊 fixtures 沒有管理 member，觀察結果不變。

### 15.6 Gates、執行入口與差異規則

**CLI：** `node scripts/consumer-retention-persistence-smoke.mjs --pg-bin <PG17 bin> --out <外部目錄> --supabase-cli <supabase.exe 2.109.1> --hosted-evidence <核准證據根目錄>`；mutations 使用相同參數。仍只接受本機參數，DSN／host 一律拒絕（N14）。

**Smoke：** 原 14 success／16 negative 保留。N14 只允許 bound 模式那一條精確的 history INSERT。新增 B01–B12：

| Gate | 內容 |
|---|---|
| B01 | 靜態不變量 |
| B02 | Manifest 由證據逐 byte 重建 |
| B03 | Plain 相容路徑（明確條件） |
| B04 | 批准管理讀取被接受 |
| B05 | Fixture entry 原子套用 |
| B06 | 重試 APPLIED no-op |
| B07／B08 | 只有 row 或只有物件時為 INCONSISTENT，執行次數 0 |
| B09 | Fixture 四個錯誤注入點全部 rollback |
| B10 | Hosted 分支邏輯（常數替換，僅證明邏輯） |
| B11 | 真 CLI 不相容 |
| B12 | Hosted request 正向驗證（不連線） |

**Mutations：**

- 原 17 controls 保留。
- 其中 M02、M03、M05–M12（`COMMIT` 前改動 storage）先由 G2 以原始 mutant 拒絕並完整 rollback（`G2_RAW_STORAGE_MUTANTS_REJECTED`）。之後 mutant 改以其自身觀察到的後狀態 digest rebase，仍由原行為 evaluator 偵測，保留原意圖。
- M01、M04、M13–M17 在 G2 之後或 `COMMIT` 之後，不屬 G2 範圍。

**新增 binding controls：** 每項先保存原始 observation，再由獨立 evaluator process 判定。

| 類別 | Controls | 通過條件 |
|---|---|---|
| Entry | E01–E15（E08 四子項，共 18 項） | connects 0（E02 為 TLS-only 1 次）、queries 0、spawns 0 |
| SQL pre-DDL | S01–S38 | 錯誤 prefix 精確、DDL attempts 0、無 boundary notice、持久化狀態不變 |
| Post-guard drift | D01–D02（以 event trigger advisory pause 在 DDL 中注入並行變更） | 錯誤為 `R0B_POST_GUARD_DRIFT`、DDL attempts > 0、全部 rollback、無本次物件及 history row |

DDL attempts 以 `ddl_command_start` event trigger 呼叫 `nextval` 計數（sequence 不隨 rollback 回復）。Role 類 DDL 不觸發 event trigger，因此另以 boundary notice 確認 DDL 前已拒絕。Setup、parser、evaluator 錯誤一律 BLOCKED，不算偵測成功。

**Differential 範圍：** 只納入實際會套用本 migration 的既有 harness：

- 36 個 `*-postgres(-apply)` harness（全部讀取並套用 `supabase/migrations` 全序列）；
- 本 R0-B smoke 與 mutations。

在 `fc39891` baseline 與 candidate 兩個 bytes／hash 綁定的隔離 clone 中，以同一解析規則比較 failure identities、runtime causes 與 exit codes；`NEW_UNAUTHORIZED_REGRESSION` 必須為 0。實際結果記錄於外部 corrective report，不改寫本文件。

### 15.7 仍待 Hosted 另案批准的前置條件與限制

| # | 前置條件 |
|---|---|
| 1 | 執行器：Owner 原選 CLI 2.109.1 已證明不可行；改用 canonical entry（node-pg）須 Owner 批准 |
| 2 | Privileged automation：`SUPABASE_ACCESS_TOKEN`（CI `development` environment 與本機）可經 Management API 執行管理 SQL。Scope、持有人、Environment protection 與 App runtime 可達性仍 unknown |
| 3 | 傳輸：client→pooler TLS 已驗證；pooler→database 的 PostgreSQL TLS 為 false，其他傳輸保護 unknown。由 Owner 決定，不代為接受 |
| 4 | 部署前唯讀預檢：`schema_migrations` owner／INSERT 權限與欄位 default；完整 88/82 矩陣與全部 bindings 仍相等（只比較、不 refresh） |
| 5 | 另行授權的 Hosted rehearsal：在 actor 16388 下驗證 CREATE ROLE、ownership、GRANT、supautils／managed hooks；驗證後狀態 digest 與 trigger rendering 在 Hosted 的可攜性；驗證 history 寫入 |
| 6 | PC-2 ordering：PC-2 若先改動已綁定的 RPC，須重新綁定並重新批准 |
| 7 | 部署時段：避開 Demo Pool 排程，不得有並行管理 DDL；密碼由 Owner 輸入，用後輪替 |

**威脅模型：** 涵蓋誤用路徑、漂移與並行變更；不保證抵禦惡意 DBA 或 privileged token 持有者。

**殘餘空窗：** G2 至 `COMMIT` 之間，以及 shared catalog，由部署時段限制處理。

本節之後的 commit、post-commit 結果與 independent reacceptance 只追加於外部報告，不再改寫本文件 bytes。R0-B Hosted deployment 仍 BLOCKED；法律 **DRAFT / NOT ACTIVE**；activation pending。
