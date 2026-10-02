# PC-2 啟用準備：Development acceptance runbook

狀態：**PREPARATION ONLY — ALL REMOTE OPERATIONS NOT EXECUTED**。日期：2026-10-02。已接受基準：`main`，HEAD = `origin/main` = `8e749f60e4e76ac09bb57195af1793575f5ed0cf`，ahead/behind `0/0`，**PC_2_LOCAL_ACCEPTANCE_PASS / LOCAL_ACCEPTED_PUSHED**。本輪沒有 live signup closure。法律草案 **DRAFT / NOT ACTIVE**。

本 runbook 是未來另授權工作的審閱清單，不是 execution approval。所有 remote DB/Auth/Storage/Edge read、設定檢視、login、signup、consent、participation、migration、publication/rollout mutation 均 **NOT AUTHORIZED IN THIS PREPARATION TURN**。本輪不測連線、不讀遠端資料、不要求登入或憑證、不執行下列 SQL/RPC。

## 1. 來源、現況與 reuse

Source aliases F/G/U/R/L 及完整 paths/functions/line locations 在 [01 §2](01_OWNER_FACTS_AND_DECISIONS.md)。以下為額外 canonical surfaces：

| Source / exact location | 用途 |
| --- | --- |
| [supabaseConsumerAuthAdapter.ts](../../../apps/mobile/features/consumer-auth/adapters/supabaseConsumerAuthAdapter.ts) `signUp/completeEmailConfirmation` | Admission reread、只傳 email/password/`emailRedirectTo`、session 與 confirmation 分支、`exchangeCodeForSession(code)`。不讀 user_metadata 作權限。 |
| [supabaseConsumerClientFactory.ts](../../../apps/mobile/features/consumer-auth/supabaseConsumerClientFactory.ts) `getOrCreateClient` | `flowType:'pkce'`、`detectSessionInUrl:false`、既有 storage/session 契約；不開 broad direct writes。 |
| [authRedirect.ts](../../../apps/mobile/features/consumer-onboarding/authRedirect.ts) 兩函數；[auth-callback.tsx](../../../apps/mobile/app/auth-callback.tsx) | 精確 callback path/host/protocol、one code、無 fragment/error/credentials、SDK exchange 後由 actual actor resume/reread。 |
| [consumerRuntimeComposition.ts](../../../apps/mobile/features/consumer-runtime/consumerRuntimeComposition.ts) signupAdmission；[featureFlags.ts](../../../apps/mobile/features/consumer-auth/featureFlags.ts)／[supabaseConsumerEnvironment.ts](../../../apps/mobile/features/consumer-auth/supabaseConsumerEnvironment.ts) | Development runtime/actual project 配置；Auth/profile live 來源明確，不 fallback mock；true generic Supabase writes 被拒絕。 |
| [authenticateCaller.ts](../../../supabase/functions/_shared/auth/authenticateCaller.ts) | 真實 getUser 後用 user-scopedstate 讀取，`coreEligible!==true`或 DTO/DB error 拒絕，provider/privileged work 之前。 |
| [pc2-consumer-onboarding-postgres.mjs](../../../scripts/pc2-consumer-onboarding-postgres.mjs) checks/fixtures；[smoke.mjs](../../../scripts/pc2-consumer-onboarding-smoke.mjs) | 已接受 local DB/UX 契約來源。PG script 自行建立 disposable cluster、syntheticfixtures，**不是 remote apply 或 live acceptance 工具**。 |
| [validation.json](../../../scripts/pc2-consumer-onboarding-validation.json)、[second differential](../pc2-onboarding-preparation/pc2-second-remediation-differential.json)；外部 final report | 原 product/DB/build evidence 與 remediation/獨立 PASS 分層。外部 reportexact path/hash 在 01 §1。本輪沿用，不重跑 478 differential、acceptedproduct/DB/build 或其他 predecessor/GQA。 |

目前 RPC 直接提供 DB 正文；`approvedDocumentContent.ts`尚不存在，sharedmanifest 僅 placeholder。Public viewer 不是離線 fallback。F 只有 inactive rollout 與 empty registry；remote 是否 apply、project identity、email/redirect 配置 **UNKNOWN / TECHNICAL VERIFICATION REQUIRED UNDER SEPARATE AUTHORIZATION**。

## 2. 執行前的權限、帳號與證據規則

### 2.1 Actor / permissions

| 簡稱 | Actor、所需明確授權與範圍 |
| --- | --- |
| INV | Development operator 的受限 read-only DB/config inventory 權限；可核對 migration catalogue、private authority metadata 與 aggregate duplicates。Owner／project admin 另授權；不能拿 anon/authenticated 或 service_role 嘗試繞 private ACL。 |
| OP | 對指定 Development target 的 migration/approved binding/rollout/部署/config mutation 操作者。必須明確授權 exact project、paths/versions/時間/stop/cleanup；privilege 不足就停，不另 grant 自己。 |
| ANON | 已批准受控測試環境的 signed-out public client；只允許 `get_consumer_required_documents()`。不因此授權 Auth signup 或 protected state。 |
| MEMBER | 已核准 Development 測試成員、自有 session，不帶 foreign owner／JWT forge／user_metadata authority；每次 grant/withdraw/Social/data write 另列在測試 mutation authorization。 |
| REVIEW | 獨立 acceptance reviewer；核對 actual release/binding/raw outputs，不自己批准法律 bytes 或變更 expectations。 |

測試 session 可能寫 Auth state，UI 登入／signup／logout 都屬遠端操作。本輪不執行。尚無專案 identity、actor 或权限時，對應項目標 **NOT EXECUTED — PRECONDITION MISSING**，不是 PASS。

### 2.2 帳號類別（標籤不是實際 user ID）

- **L**：真實 foundation apply 時 capture 的唯一 active 原 profile/cohort 成員，只在另授權 inventory 後確認；不插 profile 假造 legacy。
- **N**：foundation capture 後建立的新 incomplete account，不能進 cohort；無 session 時不 provision 或 consent。
- **C/D**：有權參與 approved Development 測試的兩位成員，用於 current consent／Social pair cases；所有真實 grant 必須對正式批准 publication 作 explicit 選擇，不以 synthetic row 自動塞入。
- **X**：approved test inactive/deleted profile actor，既有 status 及 soft delete 操作須別授權，不能用真實一般會員做破壞測試。

成年負例用受控測試成員明確演練 false/unknown self-attestation，不招募實際未成年人測試，也不將模擬 false 作真實身分斷言。Disposable local fixtures 只能在隔離 copies/DB；`activateDisposableFixture`、synthetic approved rows、`set_config`偽 JWT、測試 trigger 均不可跑到 live Development 或 Production。

### 2.3 每項 receipt / cleanup

所有 I/A 項目保存：test ID、actual source commit/build/function hash、project identity 受限 reference、UTC instant 與 DB clock、actor pseudonym/role、pre/post canonical DTO、exact entry/args（redacted）、command/exit 或 HTTP/RPC outcome、完整**已移除敏感資訊**stdout/stderr、expected/actual failure identity 與 row count；區分 local reused／fresh Development／reported owner facts。Token/password/PKCE code/verifier/full callback query/raw JWT/個資訊息不進 repo 或公開 report。

負例必须先有同一 entry point 的 valid setup/positive control；permission/setup/config failure 不是預期 corruption/core denial。不能只憑 exit 或 generic error label 判 PASS：核對 DB SQLSTATE、response、actual canonical state、no unwanted writes／privileged work before denial。

**K0（共用 cleanup）**：關閉受控 session／browser，用另授權 logout；保留必要 receipt 但限制 access。無寫入者無 DB cleanup。**K1**：紀錄由哪個 case 新增的帳號/profile/consent/card/message/attestation，owner 核准 cleanup scope 後以既有 canonical 途徑處理；不清 withdrawn_at、不改歷史 accepted_at、不刪 registry、不重 capture cohort。**K2**：隔離 negative copies/fixtures 可銷毀；不觸正式 target。帳號 hard delete 會 cascade consent evidence，必須先核對保存政策、授權及證據，不能當任意 cleanup。

## 3. Inactive preparation acceptance（I0–I6）

這組只驗收 **inactive readiness**；不宣稱真實 signup、onboarding 或 grant 已開放。每項須有另授權的讀取／設定檢視／測試帳號操作範圍；本輪全部 **NOT EXECUTED**。

| ID / Preconditions | Actor / permission | Actual entry point | Expected result | Negative case | Evidence | Cleanup | Stop condition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I0：Owner 指定 Development project、執行者與受限範圍 | INV／REVIEW；只讀 metadata | 實際安裝 CLI 的本機 help；另授權 dashboard/config inventory；consumer environment source | 明確 target、實際 DB/extension 版本、client/Edge release；旗標不得混用 live identity/mock profile；不開 generic writes | 錯 project、缺配置、未知工具命令、以環境名猜 project | version/help、受限 project reference、redacted flag matrix；不記 key 值 | K0 | identity、权限或命令不可確認就停；不要求未授權登入 |
| I1：foundation 未 apply、INV 已授權 | INV；profile aggregate read；detail 另限定範圍 | §6.1 duplicate SELECT；F lines 3–8；衝突 owner 的 profile/status/FK inventory | duplicate groups=0 才可準備 apply；有衝突則列受限明細，不能選第一列 | duplicate；inactive/deleted 混合 rows；out-of-band profile | exact query、aggregate、pseudonymized mapping、apply 前 snapshot；local duplicate proof 僅 reuse | K0；不 merge/delete | 任一 duplicate 或缺完整 evidence，等逐組 remediation 授權，再查必要項目 |
| I2：I0/I1 通過；apply 是另一授權 | INV 先讀；OP 只做已批准 exact apply；REVIEW 核對 | Actual migration ledger/catalogue；F/G 兩件完整檔名見 01 §2；private tables、grants/RLS、public actor RPC | 與 142 source 逐項對帳，不只數量；UNIQUE、cohort、gates、Storage 都存在；六 private tables FORCE RLS，無 client raw access／write 擴權 | history drift、錯 body/overload、PUBLIC/anon 執行 protected RPC、private schema exposed、未知 role grants | hashes、完整 definitions、ACL/role/search_path、before/after counts、apply receipt；local PG95 不當 remote 證据 | K0；部分 apply 失敗依 02 §5 | conflict、未知 privileges、partial apply 即停；不盲推全部 142 或修 migration history |
| I3：I2 objects 已完成，rollout 仍 inactive | ANON＋L/N MEMBER；INV 受限 cohort read | `get_consumer_required_documents()`、`get_authenticated_consumer_participation_state()`；F cohort/core predicates | public available=false/bundle=null；L compatibility 不等於 completion/training/age；N core=false、compatibility=false；只有原 active profile binding 可保留 core | N 直接 complete/opt-in；X inactive/deleted；換 cohort profile ID 僅在 disposable copy 測 | actor DTO、role denial、no new rows、原 cohort/profile binding；X 不准 core | K0；mutation attempt K1；copy K2 | N 繼承 compatibility、inactive 准 core、假造 consent 即停 |
| I4：I3＋實際 client release/config | MEMBER／ANON；UI 操作與 direct RPC attempt 別授權 | `/login` signup、`/onboarding`；U controller/adapter；complete RPC | 已知 unavailable 不 call Auth signup；已建 N 等待/retry/logout；direct completion 22023，不留新 profile-only/consent | missing/malformed DTO；external Auth 已建立 incomplete account；unavailable 被當完成 | sanitized request trace、DTO、before/after row counts；不把 no-session 當送達證明 | K0/K1 | 自動完成／grant、已知 unavailable 仍 signup、partial writes 即停 |
| I5：I3 verified cohort＋受控 Social actions | L/N MEMBER；INV 限測試 rows | 四 participation RPC、adult attestation、state、G candidate authority | L preparation 保留原行為但不造 age/grant；N 不能 opt-in；L false age pause/deny Social，core compatibility 分開 | metadata 成年、N 有 profile 就當 legacy、paused 用 opt-in 自動 resume | age/core/participation DTO、timestamps、fresh candidate denial、cohort binding | K1；不清紀錄以假造舊狀態 | 自動成年、擴 cohort、silent resume 即停 |
| I6：I0 配置檢視已另授權；尚未正式 signup | INV／REVIEW；local negatives 僅 copy | `configuredConsumerAuthRedirect`、factory PKCE、callback route、email template/allowlist；`/account-support` | 精確 callback 與 app scheme/path 一致；same-browser verifier 契約；support pending contact 如實顯示；inactive 不稱 live confirmation PASS | 錯 callback、fragment token、duplicate code/error/foreign origin、placeholder contact 假稱送件 | redacted config reference、route/UX hashes、contact delivery 待驗項目；不存 code | K0/K2 | 設定／正式管道未明列 future gate；不重開 local PASS，亦不能進 activation |

## 4. Approved activation acceptance（A0–A13）

進入前必須有：01 Q1–Q10 所需 facts/decisions、qualified review、final clean publication bytes／獨立批准收據、新 activation delta 的獨立 local acceptance、I 組必要 readiness、明確 Development mutation/actor/data/cleanup 授權。**僅使用已正式批准的文件與 binding**；synthetic receipt 不得進 target。Owner 已審閱 02 §2 的單一 enforcement 限制與 §5 recovery 風險。

| ID / Preconditions | Actor / permission | Actual entry point | Expected result | Negative case | Evidence | Cleanup | Stop condition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A0：approved set、有效窗口已到、I2 通過、transition 另授權 | OP 指定 transition；INV/REVIEW 讀 binding | F document/approval/bundle/rollout/current_bundle；public document DTO 與 viewer | clean raw hash＝SQL UTF-8 content hash＝approval publication hash＝DTO content hash；三件 ID/type/version/zh-TW 正確；receipt authority/時間可核對；selected bundle 有效 | missing/partial/future/retired/wrong hash/unapproved/stale pointer 僅 copy；target 只讀有效性 | actual binding、DB UTC clock、external approval、raw artifacts/DTO/viewer parity；placeholder 不 promotion | K0；copy K2；immutable rows 不刪 | 任一未批准 bytes／時間不符／publication mismatch 即停；不以 enforcing=true 單獨判 PASS |
| A1：A0、approved signup actor；實際設定允許 session-issued branch | ANON→N；Auth create 明確許可 | `/login` create-account；adapter `auth.signUp`／observer；`/onboarding` | 有 session 只 resume actual owner state；未明確三項前不 complete/grant/Social；不傳 authority metadata | 先前 actor 的 late response、double-click/timeout、以 displayName metadata bootstrap | 有／無 session 分類、redacted response、actor generation、DTO、explicit 前無 rows | K1 | 自動接受、foreign actor late acceptance、未知結果假稱成功即停 |
| A2：A0、實際 confirmation-enabled branch、受控信箱與同 browser/device | N；signup/email confirmation/exchange 另授權 | check-email UX、真實確認信、精確 `/auth-callback`、`exchangeCodeForSession(code)` | 無 session 不寫 profile/consent；same-device verifier exchange 後 actual actor→onboarding reread；送達與 session 是兩份證據 | 錯 redirect、missing/expired/replayed code、fragment token、新 device 無 verifier、overlapping flow；observer 早於 callback | redacted email delivery、去 query 的 target path、exchange 類別、actual actor state、no early writes；password sign-in recovery 不稱 callback 成功 | K1；code/verifier/token 不保存 | 寄信、exchange 或 configured redirect 未證實則此 live gate NOT EXECUTED/BLOCKED |
| A3：A0、N confirmed session | MEMBER N；complete mutation 許可 | `complete_authenticated_consumer_account_onboarding`；§6 exact args；owner profile/consent SELECT | 三項 true→sole active profile＋三件 current consents atomic；blank name 用 opaque ID/label、BG/private/not willing；retry 保留舊值/timestamps，無 Social row | refusal、invalid name、stale/wrong version/hash、foreign owner parameter、concurrent completion；locale 固定 server zh-TW，不加不存在的參數 | 適用 rejection SQLSTATE、row counts、唯一 profile、timestamp parity、canonical reread；null actor 28000／anon protected 42501 | K1 | profile-only partial write、歷史時間改寫、auto Social、衝突被暗中刪選即停 |
| A4：A3 current C＋批准 refusal/withdraw 演練 | MEMBER C；withdraw、先建立 valid core positive；INV 受限 counts | 未勾 training 拒絕；withdraw RPC；state/owner consent SELECT | refusal 不建 grant；withdraw canonical training、pause opted_in；core=false；Terms/Privacy/legacy rows 不改；重複 withdrawal 不改 timestamp | duplicate/concurrent actions；Social pause 交易失敗 rollback 僅 copy，不向 target 裝 test trigger | lifecycle IDs/timestamps、DTO、canonical scope、實際 serialization order；不只 exit | K1/K2 | enforcing 已成立，withdrawn/incomplete 卻仍 core=true；pause/withdraw 分裂或 history 改寫即停 |
| A5：A4 paused、approved bundle 可用、C active profile | MEMBER C；grant/complete mutation | training-only `grant_authenticated_ai_training_consent`；Terms/Privacy 更新用 complete | new live lifecycle 保留 withdrawn row；idempotent one current grant；三件 current 才 core=true；Social 仍 paused | false explicit、old bundle/version/hash、缺 Terms/Privacy、concurrent duplicate grant、auto resume | lifecycle hashes/timestamps、pre/post DTO、原 history、no Social transition、unchecked controls | K1 | 改 history、多 live grants、silent resume 或餐廳商品圖授權推導即停 |
| A6：withdrawn/incomplete actor 與 valid positive C；A0/actual Edge verified | MEMBER 自有 session；controlled RPC/Storage/Edge actions 別授權 | G exact core RPCs、owner core-table SELECT、meal-analysis-photos Storage、shared-auth Consumer Edge | 有效 payload 也在 core gate 拒絕；predicate false；RLS SELECT 可 empty，不必 HTTP403；RPC42501、Edge auth denial 在 provider 前；owner filter 保留 | 繞 UI、stale claims、foreign row、invalid args 造成非預期拒絕；DTO/DB outage 僅 copy | positive→negative response/error identity、no writes/provider work、actual state；static assets 只 app gate | K1/K2 | setup/invalid-arg failure 被冒充 core denial、read/write/provider bypass 即停 |
| A7：A4 core=false；Q2 真實管道/流程已核定 | MEMBER；ANON public docs；private account request owner 驗證 | U `PC2_RECOVERY_ROUTES`、read/state/regrant/logout、正式 contact 流程 | core denial 不鎖 docs/state/regrant/logout/support；owner 驗證不依 training/age；聯絡有真收件證據；UI 無 submit/delete executor 就如實說明 | redirect loop、core gate 鎖 recovery、signed-out docs 阻擋、placeholder 被當已送件、cross-owner request | route trace、public document binding、approved contact receipt/責任人；不假稱 deletion pipeline | K0/K1 | recovery 不可用或營運承諾不可交付即停 live activation |
| A8：A3 current C、age unknown，D 作 pair | MEMBER C/D；attest 與 opt-in 分別授權 | adult(false/true) RPC、state、opt-in RPC、`/participation-settings` | unknown/false 拒 Social 但不阻 general current core；true 僅自我聲明、不 join；explicit opt-in 才 participating；false pause | metadata/local flag 成年、training 推成年/加入、candidate 無資格 | owner-bound policy/version/time、core/age/participation DTO、雙 subject candidate check | K1 | 年齡變一般 onboarding gate、self-attestation 稱 verified、unknown candidate 曝光即停 |
| A9：A8 qualified opted_in | MEMBER；四原 RPC／withdraw/regrant 各授權 | pause/resume/opt-out/opt-in；U invalidate/reread | pause 保留原 opted_in_at；paused opt-in 不 resume；explicit resume 才恢復；opt-out 刪 participation 為 absent；re-grant/true age 不 resume paused | stale card/ref、late list/chat result、actor/bundle switch、timeout uncertain 舊 cache | DTO/timestamps、cleared refs/cache/epochs、late-result discard、fresh denial；不承諾收回已下載 bytes | K1 | silent resume、uncertain local state 准 entry、retained 被說成已刪即停 |
| A10：C/D approved pair、cards/chat positive 已合法建立 | MEMBER C/D；existing card/pair/chat actions 與 INV retention read | card create/list/cancel、candidate list/profile、relationship/chat Edge；G canonical authorities | pause/opt-out/withdraw 後 fresh reads/send 拒絕或 empty；rows 保留；explicit 合法再參與後仍有效卡可重現；block/profile predicates 仍在 | stale opaque refs、另一方 withdraw/falseage/paused、直接 cardwriter 無 opted_in | valid positive→negative、雙 actor state、retained counts、opaque-ref hash、closed failure identity | K1；不隨意刪 retained rows | fresh 未授權 read/send、directwriter bypass、retained 被當持續可讀即停 |
| A11：A0、I3 cohort binding、Q10 通知/impact 批准 | INV/MEMBER L/N；REVIEW | F cohort/profile/rollout/current state；L explicit complete/age、既有 participation | enforcing 時 L 也需 exact B；不自動接受/成年；core、age、Social 分開；原 opted_in 具全資格才延續；paused re-grant 不 resume；N 永不 cohort | 提早切 true、無通知/rights 便 mass-lock、舊 profile/consent 冒新接受、測試 profile 假造 legacy | notices/undelivered 分類、cutover 前後受限 impact、每维度 evidence；無 grace 功能不 claim | K0/K1 | 既有會員影響未授權、造 rows、無通知或 recovery 即停，不自行繞 gate |
| A12：A0 actual positive；負例僅 disposable scope | REVIEW/INV target read；local copy tester | F immutability/current_bundle/accept_required；publication↔DTO；future exact activation recognition | actual binding 有效；copy partial/future/retired/wronghash/unapproved/stale 皆 deny、不寫入；immutable UPDATE/DELETE copy23514 | candidate 自算 hash 冒 approval、placeholderpromotion、enforcing/pointer 不 coherent、all-reject validator 無 positive | 完整 CHECK/runtime/SQLSTATE、執行 sourcehash、copy inventory；local 不能冒充當時 live | K0/K2 | 要破壞真 registry 才可測、approval 不独立、negative 只有 setupfail 即停 |
| A13：所有 applicable cases 有 receipts、排除與缺口明列 | REVIEW 獨立裁定；OP 只做已批准 cleanup | 同一 exact Development DB/Edge/client/publication；I/A matrix＋owner/legal/rollout evidence | 真實 confirmation-required 配置需 actualemail/PKCE evidence；其他分支只可標 local accepted reuse，不冒另一 remote 配置；無 materialunverified 才可能 liveclosure | 未執行當 PASS、inactive 當 signupPASS、local478 當 remote 驗收、Production 推論 | exact project/release/bundle/approval/effective/actors/commands/results/exclusions/cleanup；reported/reused/fresh 分列 | K0/K1，先留合法必要證據 | material 缺證則 LIVE_BLOCKED；原 localPASS 保留，不自推 Production/pipeline/OD-15 已關 |

## 4.1 Owner directions 的後續驗收案例（全部 NOT EXECUTED）

2026-10-02 Owner A–J 來源／證據類別見 [01 §4](01_OWNER_FACTS_AND_DECISIONS.md)，實際 source/gaps見其§8。以下 N01–N10 只是本runbook case標籤，不新增review IDs或產品authority。**inactive readiness**可準備契約／source／外部設定清單；**activation prerequisites**需公司事實、qualified review、批准正文與實際工程能力；**activated acceptance**只能在所有前提與精確別次授權成立後執行。未完成實作／外部核對的案例為 DEPENDENCY_BLOCKED，不能用 mock、價格文案、Owner事實或歷史PASS通關。

所有cases沿用§2 actor/evidence/K0–K2规则，只使用另批准的Owner／測試人員範圍；不新增real-member acceptance／deployment fixtures。每例先同entry validpositive，negative failure須核對authority及no unwantedwork；不能以setup failure代替預期拒絕。未有entrypoint時明標future authority待建，不造RPC名／fixture／新API。

| Case / 階段與前提 | 實際 source 可用部分／依賴 | Future expected 與 negative controls | 必要 evidence／actor／cleanup 與 stop |
| --- | --- | --- | --- |
| N01 日記查看與保存；inactive 契約核對 → 新 retention authority 後驗收 | `meal-log.tsx` 週窗、`readRange.ts` 31 天／100 筆上限、meal reader 的 owner/deleted filter；14/180 天方案契約尚未落地證明 | 按核准起算測 14/180 天邊界、free/Premium 切換及 direct request；server/UI 一致。跨 owner、時區切日、升降級、保留但限制查看作對照；查不到不能當實際刪除 | REVIEW/INV 先讀，MEMBER mutation 另授權；保存時間、權益與 DB/object 前後分類及完整結果；K0/K1。只有 UI 隱藏／mock 即 DEPENDENCY_BLOCKED |
| N02 月評分／永久私人收藏／額度；先解舊 demo 差異 | daily calculator/persistence 不是月評分；favorites SQL 為餐廳/menu item，不是 saved meal snapshot；40/200 與 50/150 文案差異見 01 §8 | 新 authority 後驗免費最近 6 個月／Premium 永久、到期 rollup 不重複或丟失彙整、私人收藏與刪除權分開；核准 40/200 quota、解除收藏／降級／併發上限。不得以餐廳收藏替代餐點快照證據 | O/L 邊界批准 → 新包 local acceptance → INV/MEMBER 別次授權；hash/tier/count/summary 與外 owner 不可讀證據，K1。無月度／餐點保存 authority 即 NOT EXECUTED |
| N03 原圖／縮圖／分析 staging 與入日記交接；retention prerequisite | private bucket path、upload/delete、analysis retake；purpose enum 不是 lifecycle，可靠 transfer/purge 未證明 | 按批准 manifest 分原圖、縮圖、staging、日記、training、cold storage、backup。入日記不被 staging purge 誤刪；測 orphan、失敗分析、retake、重試、併發 finalize、一般 unmount；失敗有重試／留證。24h/30d/90d 不作已批准 expected | INV 限 object metadata；MEMBER/OP 限批准測試範圍；各用途前後 hash/count/link、executor command/exit/實際結果，K1/K2。只有 best-effort delete 成功不稱 lifecycle PASS |
| N04 訓練 admission／去識別／撤回／刪帳／backup；future pipeline | F grant/withdraw＋Social pause 為已有契約；request 禁止 client trainingEligible；support 無 submit/delete；dataset/job/backup authority 尚缺 | Pipeline 建成後才驗照片/results/corrections；位置／健康／疾病只在不能直接間接識別且完成 review 時納入；identity/contact/chat 目前排除。姓名移除但位置×時間×疾病可回推、未批准用途／版本作負例。撤回依核定契約阻止新 admission、處理副本/jobs；完成模型不假稱逆轉；restore 不復活依法已刪／撤回資料 | L＋工程風險方法、lineage/test scope 先批准；INV/OP/MEMBER 用最小資料，不用真敏感個資 fixture；SQL/state、jobs/copies 前後及 restore suppression 證據，K1/K2。缺 pipeline 或不可識別性實證即 DEPENDENCY_BLOCKED |
| N05 provider 受託限制；inactive external inventory → activation prerequisite | config 支援 openai/mock/disabled；handler 驗 actor 後下載照片→OpenAI Responses、store:false；真實遠端 model/合同/地區未知 | 核對實際 vendor/contract/DPA/region/subprocessors/retention、不得自用訓練證據。不符 Owner 方向即停。Mock、inference 成功、store:false、SDK 名或儲值單不替代合同／ZDR／訓練限制；無新授權不送 provider request | Owner 合同／qualified review＋另授權 INV metadata；redacted reference/hash/date/責任人，K0。供應商資料流與限制證據不完整阻擋其 gate |
| N06 14 天 trial→399／月 auto-renew；commercial prerequisite | payment 回 mock/not_started；entitlement reader 只判有效窗，checkout/trial authority 未驗 | 訂閱前清楚呈現轉付費日期、399 金額、每月週期、取消方式並 explicit confirmation；只 signup／三份法律同意不能 charge。驗試用起算、paid transition、renewal、timeout retry、webhook idempotency、錯 owner/plan/stale quote；重領試用規則先定。399/990/1740/3000 期別與 trial default monthly 分開，299 不採用 | O/L/X＋新包 local acceptance 後，另批准 sandbox、時間控制、帳號／付款 scope；不用真扣款作 fixture。Redacted confirmation/transactions/idempotency/entitlements，K1；stub/mock 文案或 setup failure 非 PASS |
| N07 cancel／退款／權益；依 N06 的 commercial case | Subscription validity schema/read 存在，canonical cancel/refund writer 需新 scope | 取消停止 next charge、當期權益到 end、通常不 pro-rata；重複扣款／服務異常／法定退款分流程。平台 cutoff 前後、cancel/renewal race、重試、退款失敗、重播 webhook、外 owner 負例；不得以 no-refund 掩蓋法定例外 | Owner 渠道/cutoff＋L 例外、sandbox authority、MEMBER/OP 授權；charge absence、權益期限、退款 receipt 與 failure identity，K1。只有 expired reader 不能證明已停止扣款 |
| N08 trial 提醒＋條款/reconsent/eligibility Email/App 同步；新通知 authority 後驗收 | Existing Push event_kind 僅飯友邀請／訊息；preferences bool、confirmation email 不是提醒，scheduler/inbox 未驗 | 到期前 3 天提醒（具體渠道／排程證據待補）、前 1 天 App 通知及取消入口；重要條款／reconsent／資格 Email＋App 同步。測時區、retry/dedup、bounce、未送達、App offline、actor 切換、取消後狀態。提醒日不是通用 cutoff；實體 Push 若另用需獨立 receipt | 內容／責任／時程/L review、O/X cutoff 與新 authority；INV/OP/MEMBER 別次授權受控信箱／通知；redacted jobs/send/delivery/App 顯示／取消入口證據，K0/K1。缺必需渠道即 DEPENDENCY_BLOCKED |
| N09 早鳥本人／朋友兌換；future authority 後 commercial 驗收 | Governance PH-3 歷史價、Owner J 歷史 pack 引述；redeem executor／獨立 publication receipt 缺 | 批准後驗本人 3/6/12 個月、半年包朋友 1 個月／年包朋友 3 個月；創始支援包未列朋友權益，不補造。朋友碼 formal launch 後 3 個月到期；不折現／轉售／延期／stack。測錯 owner、重複／併發／過期；本人起算／延期未交付／launch date/timezone 未定不預填。早鳥 890/1680/2980 原價方向不等有效權益 | Owner 未明規則＋L/publication approval＋future code authority；redacted code hash／entitlement/reference/retry，不存可用碼，K1。缺批准起算／launch 不可計時 PASS |
| N10 餐廳 activation／合約／新成效退款；launch 合約→首月數據後新版 | BM-01 Activation Code、BM-02 refund、BM-03–07 attribution 為 operating model；Admin route NOT_ENABLED，contract/billing authority 缺 | 真 activation code 確認與 contract/payment receipt；有效啟動後自行反悔不退，合法例外分開。首月實際流量後才定 metrics/period/plan/未用未來月份/partial month/formula/claims/成本；新 contract version 批准後才測達標/未達、歸因不重複、錯 plan/period、反悔／第三方成本／退款重播。不得回填舊 contract 或編數字保證 | Owner 初始方案/terms＋L/X、新包獨立 acceptance；後續首月受限證據，INV/OP/MEMBER 均別次授權；版本/cost/refund receipt，K1。未知 metric 或缺 authority 即 DEPENDENCY_BLOCKED |

N 組缺口不重新開啟已接受 PC-2 local findings；仍阻擋對應正式 launch／training／權利承諾。I 組 inactive PASS 不是 N 組或 A 組 PASS；A 組 consent/signup PASS 不能代替收費／保存／通知能力。最小包與依賴見 01 §9、02 §7；**本輪只寫案例，沒有新 fixture、產品修改或驗收執行**。

## 5. Authority / target coverage 核對表

I2/A6/A10 應逐項記錄 remoteactualdefinition/grant 與 acceptedsourceparity；不是建新的 API 或 grant：

| Surface | 需核對的 intended boundary |
| --- | --- |
| `consumer_internal` 六表 | document_versions/document_approvals/required_bundles/rollout_state/preparation_cohort/social_age_qualifications；ENABLED＋FORCE RLS，postgres authority owner policy；client role 無 raw table access。僅有必要 Social authority schema usage/function grants，不擴到 Admin/Restaurant。 |
| Publicdocument/stateRPC | docs DTO 可 anon/authenticated；protected state authenticatedonly；PUBLIC/anon 不能 complete/grant/withdraw/attest；actor-only`consumer_core_eligible()`只為 authenticatedpredicate。 |
| `consumer_profiles` / `consumer_data_consents` | owner SELECT 與 UNIQUE(user_id)；無 clientINSERT/UPDATE/DELETE 擴權；legacy/other full uniqueness＋canonical training live partial uniqueness；history guard，FK cascade 仍在。 |
| Core tables（G lines14–49） | consumer_preferences、taste_profiles、dietary_restrictions、nutrition_goals、subscription_entitlements、meal_records、meal_record_items、meal_analyses、meal_corrections、meal_consumption_adjustments、meal_sharing_allocations、planned_meals、daily_nutrition_summaries、user_restaurant_ratings、user_menu_item_ratings、favorite_restaurants、favorite_menu_items、recommendation_sessions、recommendation_feedback：existingownership＋newrestrictivecore policy/write guard，不用 client 一個 bool 取代。 |
| Core RPCs | G 每個 `Exact core RPC` 的實際完整 signature/body；例如 `create_current_user_meal_record_v2`、`read_authenticated_allergy_settings_v1`、`read_authenticated_ingredient_avoidance_settings_v1`、`record_authenticated_recommendation_feedback_event`；`require_core(auth.uid())`在原 body 前，algorithms/idempotency 仍保留。不能用同名 differentoverload 略過核對。 |
| Storage / Edge | `storage.objects`對 meal-analysis-photos 的 restrictivecore gate；directStorage 是 user-scoped；Consumer Edge 的 verified getUser＋state predicate 在 privileged/provider work 之前，private Social execution role/grants 按既有 authority。其 actual releasedfunctions 全部部署 scope 須另批准。 |
| Social | `social_internal.authorized_candidates(uuid,uuid[])`雙 subject；`create_meal_buddy_card` core/age/opted_in；原四 public participation RPC；card/profile/pair/block/chatfresh checks 與 cache 收束。 |
| Recovery / static assets | Recovery routes 不受 core gate 但 private account 要 auth；support 沒有 request submit/delete backend；static catalogue 以 app navigation gate，已下載 asset 不能 server 回收。 |

## 6. Exact commands / SQL / RPC 契約（僅列出，未執行遠端）

上一輪 `command -v supabase` 未找到 WSL PATH 中的 CLI；沒有安裝／登入／升級，也沒有猜 Windows CLI identity。**因此不列任何未核對 installed help 的 remote CLI apply/deploy 命令**。未來 operator 先保存實際安裝的 version/top-level 與所需 subcommand `--help`，再凍結 exact argv/target；不能用先前 CLI2.109.1 歷史記錄當本機目前 help。不列含 projectref、connection string 或憑證的模板。

### 6.1 Remote read-only duplicate aggregate（NOT AUTHORIZED IN THIS PREPARATION TURN）

此 SELECT 僅由 I1 的 INV 在已核對 Development target 執行，基於 F `public.consumer_profiles.user_id` duplicate precondition；不輸出原 user IDs。不假設任何特定 remote CLI。

```sql
select count(*) as duplicate_owner_groups,
       coalesce(sum(profile_count), 0) as profiles_in_duplicate_groups
from (
  select user_id, count(*) as profile_count
  from public.consumer_profiles
  group by user_id
  having count(*) > 1
) as duplicate_owners;
```

Count=0 只表示此次 snapshot 沒有 duplicates；要按 I1/I2 記錄 apply 前 snapshot/actual UNIQUE 和 race precondition。有衝突才另授權受限 detail 與 remediation，不自選 first row、不清除資料。

### 6.2 Canonical DTO 讀取（REMOTE READ NOT AUTHORIZED IN THIS PREPARATION TURN）

SDK 方法依既有 U controller 和 F exact function；由 approved client/session 建立，以下不提供建連線/keys：

```ts
// ANON or MEMBER: only approved current documents, never raw private registry.
await client.rpc("get_consumer_required_documents");
// MEMBER only: the session actor, no caller-supplied user/profile ID.
await client.rpc("get_authenticated_consumer_participation_state");
```

### 6.3 Canonical mutation calls（NOT AUTHORIZED IN THIS PREPARATION TURN）

下列 keys 依 F 与 U controller，只有 A 項另授權後才可執行。`presented`必須來自當時**已批准/有效/current**DTO，保留 sorted exact ID/version/hash；不能用 draft／FIXTURE_DOCUMENTS／自行 guess version。Locale 由 server 固定 zh-TW，不加 supplied owner、metadata authority 或 new RPC。

```ts
const presented = bundle.documents
  .map(({ documentId, version, contentSha256 }) => ({ documentId, version, contentSha256 }))
  .sort((a, b) => a.documentId.localeCompare(b.documentId));
await client.rpc("complete_authenticated_consumer_account_onboarding", {
  p_bundle_version: bundle.bundleVersion,
  p_presented_documents: presented,
  p_accept_terms: explicitTerms,
  p_acknowledge_privacy: explicitPrivacy,
  p_grant_training: explicitTraining,
  p_display_name: displayName || null
});
await client.rpc("withdraw_authenticated_ai_training_consent");
await client.rpc("grant_authenticated_ai_training_consent", {
  p_bundle_version: bundle.bundleVersion,
  p_presented_documents: presented.filter(d => d.documentId === "ai-training-terms"),
  p_grant_training: explicitTraining
});
await client.rpc("attest_authenticated_social_adult", { p_attested_18_plus: explicitAdult });
// Each transition is its own explicit action; never execute this list as an enrollment sequence.
await client.rpc("opt_in_authenticated_social_participation");
await client.rpc("pause_authenticated_social_participation");
await client.rpc("resume_authenticated_social_participation");
await client.rpc("opt_out_authenticated_social_participation");
```

No raw registry activation SQL、Auth administration、DB migration push/deploy 命令在此提供。本 runbook 不是繞過 formal publication 的開關；新 exact activation migration/row transaction 只在 02 §3D/F 另授權 freeze/review 之後設計。

## 7. 官方技術規則查核（上一輪 preparation，2026-10-02；本輪未重跑）

只查公開官方文件，不讀任何 project 資料，沒有連 DB/Auth/Storage。Source 保持原 bytes，無 SDK/CLI/DB upgrade。

- [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)：code 需使用發起流程時儲存的 verifier，通常同 browser/device；code 有限效期且一次 exchange。A2 查实际 same-context exchange，過期/重播/缺 verifier 留 negative evidence，不用 fragment token 或宣稱 no-session 已寄達。Repo 保留 manual exchange 與`detectSessionInUrl:false`，不套官方示例改成 auto。新 overlapping flow 選項不在本輪引入。
- [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)：I6/A2 核對實際 allowlist/redirect 與 app 的 configured callback；remote identity 與 domain 仍待另授權查證，不用 wildcard 猜可用 target。
- [Supabase changelog index](https://supabase.com/changelog.md)已取得並檢視 breaking change 項。相關[PostgreSQL15.19/17.11 公告](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)涉及 pgcrypto/btree_gist 等條件性影響；I0/I2 先核對 actual server/extension/version 與適用性，不從原 PG17.6 local acceptance 推定 remote 版本，也不在此執行 upgrade/reindex。若 actual target 差異需另限定 verification，不整輪重跑已接受驗收。
- [Data API exposure change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)：I2 核對實際 schema exposure＋ACL/RLS，不假設建立 table 自動可訪問，亦不能為測試把 consumer_internal 加入 exposed schemas。

法律適用性不由此 runbook 決定；R §4 及 Q6/Q7 的 qualified review 須在啟用時核對適用法／期限。本輪不作合規認證，不把歷史法律查核當當日 qualified approval。

## 8. 本輪 focused validation 與停止點

三份既有 untracked 文件要核對 source/section/review-ID、產品核定決策、FACT/UNKNOWN/PROPOSED/法律與工程責任、local/live/DRAFT 邊界、exact three-file untracked scope、UTF-8/LF/no BOM/final newline/no trailing whitespace，以及全部 existing tracked raw bytes/hash 與 index 未變。這是文件 validation，不是新的 478 differential 或 live acceptance。

下一 gate 是 **READY_FOR_OWNER_DECISIONS_SYNC_REVIEW**：Planner/Owner 先審閱 01 §4 A–J 與剩餘 Q1–Q10、01 §8–9 source gaps/work packages、02 sequence/singleton 限制與 recovery 風險、本文 inactive/active cases。缺 owner facts/法律批准不阻擋這三份準備文件完成，卻仍阻擋 future activation。未來具體 remote/read/apply/activation/live acceptance 只有在相關 preconditions 成立且有新明確 authorization 時才能開始。

保持三份 untracked，不 stage/commit/push/deploy/remote operation/registry/legal activation；不更動產品、142 migrations、dependencies/scripts/records、三法律草案、原 preparation documents；不開始 PC-3/GQA-7/Group Table。

本輪 Owner sync focused checks：三份本機Markdown引用有效、Owner A–J證據標籤／價格／保存／照片backup邊界一致、訓練草案衝突與新方向分開、qualified review/publication/activation仍pending；實查untracked rawbytes，不只trackedgitdiff。起止全tracked/indexrawhashparity、142migrations與dependencies/legalbytes不變，freshsource/doc checks與reusedlocal478 evidence分列01§10。新增N01–N10全NOT EXECUTED／DEPENDENCY_BLOCKED，非liveacceptance。OD-15、TD-10/AU19、P-7保持OPEN。
