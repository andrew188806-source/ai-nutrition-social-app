# Handoff: 豪食友 (haocu) — AI 營養 × 飯友社交

A warm, friendly Traditional-Chinese mobile app for people who eat out and want to stay balanced: snap a meal → AI estimates nutrition → log it; find dining buddies (飯友) with similar tastes; form group tables (飯友桌); discover balanced restaurants; and track a monthly diet score. Tone is encouraging and calm-premium — never medical, never a dating app, never scolding.

> **Selected visual direction: Bright White / Warm Minimal (`snow`).** Ship this as the default and source of truth. Earlier warm-cream and dark presets remain in the code as optional themes but are NOT the target look.

---

## About the design files

The files in `reference/` are a **design prototype built in HTML + React (Babel-in-browser)**. They are a **visual & behavioral reference, not production code to copy**. Recreate these screens in an **Expo React Native** app using native idioms (`View`, `Text`, `Pressable`, `ScrollView`, `FlatList`, RN `StyleSheet`, `@react-navigation/bottom-tabs`, `@gorhom/bottom-sheet`, `react-native-svg`, Reanimated). Keep the visual design faithful; swap web mechanics for native equivalents.

Open `好廚 飲食日記.html` (filename kept for continuity; the in-app brand is **豪食友 haocu**). It loads the `app-*.jsx` modules in order: theme → data → cards → extra → analysis → restaurant → main. Read them for exact values — this README is the authoritative summary.

**Function preservation is the priority.** Do not drop any feature/entry point listed in §Feature entry-point map. If something is unclear, keep the function and give it a compact entry rather than removing it.

## Fidelity

**High-fidelity** for layout, type, spacing, radii, copy, interactions, and the `snow` color system. The prototype renders inside a 402×874 iOS frame; in the real app these are full-screen native screens (drop the bezel, use `SafeAreaView`).

---

## Tech mapping (web prototype → Expo RN)

| Prototype (web) | Expo React Native |
|---|---|
| iOS frame `IOSDevice` | the device — drop bezel; `SafeAreaView` |
| Sticky `AppHeader` (logo + bell + avatar) | custom header `View` |
| `BottomNav` (5 tabs, no FAB) | `@react-navigation/bottom-tabs` |
| Bottom-sheet modals (`Sheet`, `ShareModal`) | `@gorhom/bottom-sheet` |
| `OnboardingCoach` overlay | a full-screen modal / `Modal` over the tabs |
| Inline SVG `Icon` set | `react-native-svg` (port path data verbatim) |
| Donut `Ring` (SVG dash) | `react-native-svg` `Circle` + `strokeDasharray/Dashoffset` |
| CSS gradients | `expo-linear-gradient` |
| `backdrop-filter: blur` | `expo-blur` `BlurView` (header, nav, sheet scrim) |
| `box-shadow` | iOS `shadow*` / Android `elevation` |
| Mascot avatars (`<img src="mascots/*.png">`) | bundle the 8 PNGs as assets; `Image` |
| Google Fonts (Noto Sans TC, Baloo 2, Space Grotesk) | `expo-font` / `@expo-google-fonts/*` |
| `useTweaks` theme switcher | a `ThemeContext` (or hardcode `snow` defaults) |
| demo state | `useState` + optional `AsyncStorage` (plan flag, onboarding-seen flag) |

Camera/upload in 分析 is mocked (≈1.3s timeout → static result). Wire `expo-image-picker` / `expo-camera` + a real inference call; keep the same four UI states.

---

## Design tokens — `snow` (DEFAULT, ship this)

Bright warm-ivory canvas, white cards, **soft coral** for primary actions, **calm blue-gray** reserved for AI/analysis. Two accent families, kept distinct:
- **Food / social →** `primary` soft coral.
- **AI / analysis →** `ai` calm blue-gray (badges, confidence chips, scanning, the capture frame).
- **Green is functional only** (verified tick, fiber macro) — never a brand accent.
- **Premium-locked surfaces →** `blush` pale blush-gray.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#FBFAF5` | screen background (bright warm ivory) |
| `bg2` | `#F3F0E9` | inset panels, secondary surfaces, chips |
| `card` | `#FFFFFF` | cards |
| `primary` | `#E0806E` | soft coral — primary CTAs, active states, rings |
| `primaryDeep` | `#CC6552` | pressed/emphasis, numerals |
| `primarySoft` | `#FBEAE3` | soft coral chip/badge bg, selected segments |
| `accent` | `#D08C84` | coral-rose accent (gradients, carb bar) |
| `ai` | `#6E8CA9` | **AI/analysis accent — calm blue-gray** |
| `aiSoft` | `#EAEFF6` | AI panel/badge bg, capture-frame tint |
| `green` | `#8AAE97` | functional only: fiber macro, "real/verified" |
| `amber` | `#D5A267` | fat macro / warm accent |
| `ink` | `#2C2722` | primary text (warm charcoal) |
| `sub` | `#867C71` | secondary text (quiet, readable) |
| `faint` | `#AEA498` | tertiary text, metadata, placeholders |
| `line` | `#EEEAE2` | hairline borders |
| `track` | `#F1ECE4` | progress/ring track |
| `blush` | `#F0E9EA` | premium-locked veil |
| `heroFrom`→`heroTo` | `#FFFFFF` → `#FBEFEA` | hero/card gradient stops |
| `solid`/`solidText` | `ink` / `#fff` | neutral strong button (e.g. 加入今日飲食, 回首頁) |
| `shadowColor` | `#2C2722` | shadow tint |
| `shadowScale` | `0.5` | shadows are at half strength — soft & minimal |

Derived (in `makeTheme`): `r` (radius) default **22**; `rSm = r−8` (min 12); `rLg = r+8`; pills/avatars `999`. Shadows scale by `shadowScale`:
- `shadow`: `0 1px 2px rgba(sc,.01), 0 4px 14px rgba(sc,.02)`
- `shadowSoft`: `0 1px 3px rgba(sc,.0125), 0 3px 9px rgba(sc,.0125)`
- `shadowLift`: `0 8px 20px rgba(primaryDeep,.04)`
- `hexA(hex, alpha)` → rgba; port as a util. `dark` flag is `false` for `snow`.

### Optional theme presets (not the target look)
`PALETTES` also holds warm-cream variants (`peach`, `soft`, `sand`, `rose`, `mauve`, `berry`, `tech`) and a **dark** preset `ink` (墨韻深夜; `dark:true`, espresso surfaces, light text, `solid`/`solidText` inverted). Expose as optional theme settings only — **default stays `snow`**. The in-app Tweaks panel (`snow` 雪白極簡 / `soft` 柔桃奶霜 / `ink` 墨韻深夜) is a design tool, not a required app feature.

### Typography
- **Noto Sans TC** (400/500/700/900) — all Traditional-Chinese UI text; default `fontFamily`.
- **Space Grotesk** (500–700) — **default numeral font for `snow` (`numFont: 'sharp'`)**; crisp numerals for kcal/scores/%/weeks.
- **Baloo 2** (500–800) — rounded numeral alternative (`round`); used by the warm presets.
- Type ramp (px): screen title 25/800 · card title 17–19/800 · section header 15–19/800 · body 13.5/500–600 · sub 12.5 (`sub`) · micro 10–11 badges (`faint`) · big numerals 26–30/700 (display font).

### Icons
Custom 24×24 stroked SVG set in `app-theme.jsx` `Icon()`: `home, chart, buddies, plate, user, plus, share, heart, lock, spark, chevron, chevDown, clock, leaf, flame, camera, check, instagram, wall, bell, drop, star, target, arrowUp, pin, filter, edit, gear, upload, search, invite, bookmark, bell2, shield, eyeOff, chat, table4, cardPlus`. Port `d` data verbatim to `react-native-svg` `<Path>`; default stroke 2, round caps/joins. No emoji icons; a few decorative emoji appear in copy only (☀️🔥👏💪🙂😌) — keep as text.

### Mascots (strictly limited)
Eight felt-craft food-persona characters live in `reference/mascots/`: `protein, veggie, fastfood, dessert, balance, latenight, lowcarb, explorer` (`.png`). **Use them in exactly two places — nowhere else:**
1. **Anonymous Meal-Buddy avatars** — an anonymous buddy shows one mascot in place of a photo (buddy list, search results, invites, chat). One mascot per anon user.
2. **Onboarding / beginner guide** — `OnboardingCoach` shows one mascot at a time; and the **anonymous-mode avatar picker** in `EditProfileSheet` shows all 8 for selection.

Do **not** put mascots in meal cards, restaurant cards, the bottom nav, CTA buttons, empty-state decoration, or the home layout. The shared `PersonAvatar` component encapsulates the rule: `type==='anon' && mascot` → mascot image; real → gradient initial; anon without mascot → dashed circle + eye-off icon.

---

## Navigation

**Bottom tab bar, exactly 5 tabs, no center FAB:**

`首頁 (home) ｜ 分析 (analysis) ｜ 飯友 (buddies) ｜ 餐廳 (restaurant) ｜ 我的 (me)`

- Icons: `home, chart, buddies, plate, user`. Active = `primary` icon + `primaryDeep` 700 label + icon filled `rgba(primary,.12)`; inactive = `faint`.
- Tab bar: translucent `rgba(bg,.9)` + blur, top hairline `line`, bottom padding = safe-area inset.
- Switching tabs resets that screen's scroll to top.
- **Sharing is never in the nav** — it lives inside cards/sheets. No share tab, no FAB.

Global header (all tabs): translucent blurred bar; left = `豪` logo tile (gradient primary→accent) + "豪食友 haocu" wordmark + "AI 營養 × 飯友社交" microcopy; right = **bell** (opens Notifications, unread dot) + circular avatar "宜". Each tab scrolls its own content below.

---

## Feature entry-point map (preserve ALL)

Every item below has a live entry in the prototype. Keep each one reachable in RN.

### 首頁 Home — daily overview only (keep light)
`HomeScreen` (`app-main.jsx`) + cards (`app-cards.jsx`). Stack (gap 22):
1. **HomeHero** — "早安，宜蓁 ☀️" + date; "今天也**好好吃飯**"; one-line AI status with a blue-gray spark icon.
2. **TodaySummary** — header **今日營養摘要** + small **share** button (→ ShareModal). Calorie donut `Ring` 1180/1850, 4 macro bars (蛋白質/碳水/脂肪/纖維), footer "今天還可以吃 **670** 大卡".
3. **今天吃了什麼** header + **MealGrid** 2×2 (早餐420/午餐640/點心120/晚餐 預定) → each opens **MealDetail** sheet.
4. **ActionRow** — **拍照分析一餐** (→ 分析 tab) + **找飯友一起吃** (→ 飯友 tab).
5. Compact rows (do NOT expand inline): **ReminderRow** 今晚已安排 ✓ → PlannedDinner sheet; **JournalEntry** 飲食手札 → JournalCard sheet.
- Share entry = the 今日營養摘要 share button.

### 分析 Analysis — photo flow (`AnalysisScreen`)
Stage machine `idle → analyzing → result → added`.
- **ScreenTitle** 拍照分析; **今日快捷** chip row (今日摘要 / 今天吃了什麼 / 今晚預定 / 下一餐建議).
- **Photo capture** (178px): idle = dashed **AI** blue-gray frame + **AI 食物辨識** badge + camera; analyzing = spinner + "AI 正在分析你的餐點…"; result/added = gradient + plate + **AI 信心 92%** pill.
- **選第幾餐** segmented (早餐/午餐/晚餐/點心) + **開始分析** CTA.
- **result:** result card (dish + meal pill + big kcal) · 4 macro stat tiles · **候補餐點 / 以上皆非·手動修正** strip (candidate chips swap dish; dashed chip toggles a manual-correction field) · **食材拆解** list · AI note (blue-gray) · CTAs **加入今日飲食** (→ added) + **這餐想找人一起吃** (→ 飯友).
- **added:** success banner · **回首頁看今日摘要** · 再分析一餐. (建立飯友卡 entry after analysis is reachable via the 飯友 hand-off and the buddies CTA.)

### 飯友 Buddies (`BuddiesScreen` + sheets)
- **Status strip** quick actions: **飯友桌** (→ FourSeatSheet), **聊天** (unread badge → ChatSheet), **邀約與配對** (→ InvitesSheet), **建立飯友卡** (→ EditCardSheet), **搜尋飯友** (→ BuddySearchSheet).
- **(conditional) 你建立的飯友卡** banner — appears after a card is created from 餐廳 (新·等待加入 + restaurant name).
- **我的飯友卡** — gradient header, 編輯 (→ EditCardSheet), goal + taste tags.
- **今日推薦飯友** list of `BuddyCard`: avatar (real = initial; **anon = mascot**), 真人卡/匿名卡 badge, area·dist·time, 合拍 %, taste tags, in-card **邀請** (→ 已邀請). **真人卡 blurred + lock for Free** (→ premium sheet); **匿名卡 always visible**.
- **匿名卡 vs 真人卡** explainer + (Free) **升級解鎖真人卡配對**.
- **InvitesSheet**: segmented **收到 / 送出 / 已配對** (received/sent/matched). **FourSeatSheet**: create **4 / 6 / 8** person (6/8 Premium-locked → upgrade), active table seats + share, **即將開桌** (upcoming), **參加過的桌** (past), table invites. **ChatSheet**: threads (real/group/anon-mascot). **EditCardSheet**: taste chips, goal, time slot, 發布飯友卡.

### 餐廳 Restaurant (`RestaurantScreen`)
- **Location row** (台北·大安區 + 搜尋) — location entry.
- **Filter** chip scrollers: **餐別** + **類型** (active = `primarySoft`/`primaryDeep`).
- **推薦餐廳** list of `RestaurantCard`: image region (replace w/ photo), name + rating, cuisine·dist·price, **nutrition tag pills** (neutral `bg2` pills — NOT green), note, **建立飯友卡** button (→ 已建立). Tap card → **RestaurantDetailSheet**.
- **RestaurantDetailSheet**: detail + nutrition info + **建立飯友卡** (→ jumps to 飯友 with banner) + **在這間建立四人桌** (→ creates a table, shows in FourSeatSheet active list). Blue-check/verified info shown here.
- **Cross-tab flow:** 建立飯友卡 stores `createdRestaurantCard` + `createdCardId`, navigates to 飯友, banner appears. Preserve via shared store / nav param.

### 我的 Me (`ProfileScreen`)
- **Profile summary** — avatar, name (+PREMIUM badge if premium), goal, **編輯** (→ EditProfileSheet: anon/real mode, **mascot avatar picker**, health-goal mode), 3 stats (連續紀錄/本月分數/收藏).
- **Premium** — Free: **PremiumMini** → PremiumUpgrade sheet; Premium: status card.
- **本月飲食分數** — **MonthlyScore** card (month-score entry): donut + grade + trend + weekly bars + highlights.
- **收藏餐點** — Favorites scroller (查看全部).
- **美食日記** — JournalEntry row → **FoodDiarySheet** (historical: 每日紀錄 / 月摘要 / 精選餐點 TOP_MEALS / 評分 / 分享到限動·飯友牆 / 已安排紀錄). *Distinct from 首頁's live 今日營養 dashboard — Food Diary = history.*
- **飯友紀錄 / 餐桌紀錄** — reachable via InvitesSheet (matched) and FourSeatSheet (past tables).
- **設定** — list → **SettingsDetailSheet** per kind: 飲食目標, 提醒通知 (reminders/dinner/match toggles), 隱私與帳號 (verification status, data-consent, record visibility, privacy policy), 關於豪食友 (+ **新手導覽 重看** → replays OnboardingCoach).
- Footer **登出**.

---

## Sheets / modals (bottom sheets)
`Sheet`: rounded top `rLg`, max-height ~84%, grab handle, title + ✕, scrim `rgba(#2a1f22,.42)` + blur, slide-up `.32s cubic-bezier(.22,1,.36,1)`. Use `@gorhom/bottom-sheet`.

| Key | Title | Component |
|---|---|---|
| `meal` | 餐點分析 | `MealDetail` |
| `dinner` | 今晚的約 | `PlannedDinner` (揪團 → share) |
| `journal` | 飲食手札 | `JournalCard` |
| `premium` | 豪食友 Premium | `PremiumUpgrade` (Free/Premium preview + matrix + CTA) |
| `table` | 飯友桌 | `FourSeatSheet` (create 4/6/8, upcoming, past, invites) |
| `chat` | 聊天 | `ChatSheet` |
| `editcard` | 建立飯友卡 | `EditCardSheet` |
| `invites` | 邀約與配對 | `InvitesSheet` (received/sent/matched) |
| `restdetail` | 餐廳詳情 | `RestaurantDetailSheet` (create card + 4-person table) |
| `notif` | 通知 | `NotificationSheet` (match/buddy/table/accepted/reminder/dinner/premium; unread badge) |
| `diary` | 飲食日記 | `FoodDiarySheet` |
| `editprofile` | 編輯個人檔案 | `EditProfileSheet` (anon/real, mascot picker, goal) |
| `nextmeal` | 下一餐建議 | `NextMealSheet` (→ 餐廳) |
| `search` | 搜尋飯友 | `BuddySearchSheet` |
| `setting` | (per kind) | `SettingsDetailSheet` (+ onboarding replay) |
| `share` | — (centered modal) | `ShareModal` |

**OnboardingCoach** (overlay, not a Sheet): bottom-anchored card, ONE mascot at a time, 3 steps (拍照分析一餐 / 找飯友一起吃 / 建立飯友卡), 略過 / 下一步 / 開始使用. Shows on first run (gate with `AsyncStorage`), replayable from 設定 → 關於豪食友 → 新手導覽.

**ShareModal** — IG-story preview (hero, 豪食友 · date, donut, 達標 line), then **分享到限動** (IG gradient) + **貼到飯友牆** (outlined). Reached from 今日營養摘要 share, PlannedDinner/FourSeat 揪團. Always originates inside a card/sheet.

---

## Interactions & behavior
- **Tab switch** → swap screen, reset scroll to top.
- **分析** stage machine: 開始分析 → analyzing (~1.3s mock) → result; 加入今日飲食 → added; 再分析一餐 → idle. Replace timeout with real camera/upload + inference; keep the four states.
- **Candidate swap / manual correction**: candidate chip replaces dish; 以上皆非·手動修正 toggles an inline field.
- **Buddy invite**: per-card 邀請 → 已邀請 (local map by id).
- **Real-card lock**: Free → 真人卡 blurred + lock → premium sheet; 匿名卡 always open.
- **Table size lock**: 6/8-person tables gated for Free → upgrade.
- **Cross-tab 建立飯友卡 / 四人桌**: created from a `RestaurantCard` or RestaurantDetailSheet → stored in shared state → 飯友 banner / FourSeatSheet active list.
- **Notifications**: bell opens NotificationSheet; unread count drives the header badge (clears on open).
- **Onboarding**: first-run gate + replay from settings.
- **Animations**: sheet slide-up `.32s`; result reveal `kc-pop`; ring/bar fills `1s cubic-bezier(.22,1,.36,1)` on mount; spinner `.8s linear`. Use Reanimated; honor reduced-motion (`kc-bob`/`kc-cheer` disabled).
- **Premium preview toggle** in PremiumUpgrade flips the matrix; 我的/飯友 read the same `plan` flag.

## State management
Minimal global state (Context/Zustand or nav params):
- `plan: 'free' | 'premium'` — gates real cards, premium status, feature matrix, 6/8-person tables. Persist with `AsyncStorage` if desired.
- `tab` — navigator.
- `createdRestaurantCard` + `createdCardId` — restaurant→飯友 hand-off (banner + source-card 已建立). `createdTableRest` — restaurant→飯友桌 hand-off (active table).
- `onboardingSeen` — first-run flag (`AsyncStorage`).
- `notifRead` — unread badge.
- 分析 local: `stage, meal, dish, correcting`. 飯友 local: `invited` map, invites segment, table size. Theme: `palette` (default `snow`), `radius` (22), `numFont` (`sharp`).

Demo data in `app-data.jsx`: `USER, NUTRITION, MEALS, JOURNAL, FAVORITES, MONTHLY, BUDDIES, BUDDY_CARDS, MY_CARD, RESTAURANTS, REST_FILTERS, PROFILE, SETTINGS, TABLE, CHATS, INVITES, PAST_TABLES, TOP_MEALS, UPCOMING_TABLES, TABLE_INVITES, DAILY_RECORDS, PLANNED_HISTORY, MASCOTS, NOTIFICATIONS`. Replace with API/store models; keep the shapes as a starting schema. Anonymous buddy/invite/chat records carry a `mascot` id; real ones carry `avatar` (initial).

## Assets
- **Fonts**: Noto Sans TC, Space Grotesk (default numerals), Baloo 2 (alt) — bundle via `@expo-google-fonts/*`.
- **Mascots**: 8 PNGs in `reference/mascots/` — bundle as app assets; used only for anon avatars + onboarding.
- **Icons**: all custom SVG (no icon library) — port `Icon()` paths to `react-native-svg`.
- **Imagery**: meal/restaurant/favorite images are gradient placeholders; supply real photos (layouts reserve ~78–92px image regions + a 178px capture area).

## Files (in `reference/`)
- `好廚 飲食日記.html` — entry; loads modules theme → data → cards → extra → analysis → restaurant → main.
- `app-theme.jsx` — `PALETTES` (default `snow`), `makeTheme` (adds `dark`, `solid/solidText`, `shadowColor/Scale`), `Icon`, `hexA`.
- `app-data.jsx` — all demo content + `MASCOTS`, `NOTIFICATIONS`, tables/invites/records.
- `app-cards.jsx` — `Ring, SectionHeader, Card, HomeHero, TodaySummary, MealGrid, MealDetail, PlannedDinner, JournalCard, PersonAvatar`.
- `app-extra.jsx` — `MonthlyScore, Favorites, PremiumUpgrade, PremiumMini, Sheet, ActionRow, ReminderRow, JournalEntry, AnalyzeSheet, ShareModal, AppHeader, BottomNav, PlaceholderTab, NotificationSheet, FoodDiarySheet, EditProfileSheet, NextMealSheet, OnboardingCoach`.
- `app-analysis.jsx` — `AnalysisScreen (分析), BuddiesScreen (飯友), FourSeatSheet, ChatSheet, EditCardSheet, InvitesSheet, BuddySearchSheet, Chip, ScreenTitle, TasteTags`.
- `app-restaurant.jsx` — `RestaurantScreen (餐廳), ProfileScreen (我的), RestaurantDetailSheet, SettingsDetailSheet`.
- `app-main.jsx` — `App` root: tab state, sheet routing, cross-tab flows, onboarding gate, theme wiring (default `snow`/22/`sharp`).
- `ios-frame.jsx`, `tweaks-panel.jsx` — prototype scaffolding (frame is dark-aware via the `dark` prop; not needed in RN).

## Suggested RN structure
```
app/
  navigation/RootTabs.tsx                 // 5 tabs, no FAB
  screens/{Home,Analysis,Buddies,Restaurant,Me}Screen.tsx
  components/{Ring,Card,SectionHeader,Chip,TasteTags,PersonAvatar,MealCard,BuddyCard,RestaurantCard,...}.tsx
  sheets/{MealDetail,PlannedDinner,Journal,PremiumUpgrade,FourSeat,Chat,EditCard,Invites,RestaurantDetail,Notification,FoodDiary,EditProfile,NextMeal,Search,SettingsDetail,Share}.tsx
  onboarding/OnboardingCoach.tsx
  theme/{palettes.ts,ThemeProvider.tsx,icons.tsx}   // snow default
  store/{plan,buddyCard,onboarding,notif}.ts
  data/mock.ts                            // ports app-data.jsx shapes (incl. mascot ids)
  assets/mascots/*.png
```
Build theme + `Ring` + `Card` + `Icon` + `PersonAvatar` primitives first (lock the `snow` tokens + the food/AI accent split), then the 5 screens, then the sheets, then the cross-tab 建立飯友卡 / 飯友桌 flows, then onboarding + notifications.
