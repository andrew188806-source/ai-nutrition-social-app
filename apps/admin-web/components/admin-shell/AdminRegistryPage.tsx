import Link from "next/link";
import {
  ADMIN_ROUTE_REGISTRY,
  ADMIN_TOP_LEVEL_WORKSPACE_IDS,
  ADMIN_WORKSPACE_SHORTCUTS,
  CROSS_RESTAURANT_QUEUE_COPY_ZH_TW,
  ENGINEERING_WORKSPACE_BOUNDARY,
  NUTRITION_ASSIGNMENT_PRECEDENCE,
  type AdminAvailability,
  type AdminRouteId
} from "../../auth/admin-route-registry";
import { AdminAvailabilityBadge } from "./AdminAvailabilityBadge";
import { getAdminDescendants, getAdminRoute } from "./admin-ia-navigation";
import { AdminRoutePlaceholder } from "./AdminRoutePlaceholder";
import { AdminWorkspaceHeader } from "./AdminWorkspaceHeader";

// RA-3-IA-P2-R2: multi-child hub pages that need the full workspace-landing
// layout (status counts + child module grid) even though they are not
// themselves one of the ten top-level workspaces.
const NESTED_HUB_ROUTE_IDS: readonly AdminRouteId[] = [
  "menu-management", "nutrition-standards", "nutrition-members", "nutrition-certification",
  "nutrition-my-work", "nutrition-assignments"
];

const descriptions: Readonly<Record<string, string>> = {
  dashboard: "管理後台的工作區目錄與接入狀態；本頁不呈現虛構營運指標。",
  "business-development": "潛在店家開發、洽談、合約與續約的商務拓展工作區；與平台營運（行銷）、餐廳營運各自獨立的權限領域。",
  operations: "行銷活動、推廣、廣告、贊助內容、曝光版位、行銷通知與成效的平台營運／行銷工作區。",
  restaurants: "先選擇餐廳，再管理其分店、菜單與餐點；跨店查詢僅為輔助的待處理佇列。",
  "menu-management": CROSS_RESTAURANT_QUEUE_COPY_ZH_TW,
  members: "以支援案件為界，只提供處理案件所需的最小會員資訊。",
  social: "以檢舉與安全案件為界，只提供處理案件所需的範圍資料。",
  nutrition: "營養師的專業工作台：我的工作、餐廳營養認證、會員營養管理、營養標準與評分與分派管理。",
  "nutrition-my-work": "我指派到的餐廳、案件與已授權會員；不是全平台瀏覽器。",
  "nutrition-standards": "營養評分依據、推薦判定規則與重要營養參數的治理設定；本階段僅為唯讀預覽，尚無可編輯設定。",
  "nutrition-members": "經會員明確同意授權後，Nutritionist 才能存取的會員營養管理工作區。",
  "nutrition-certification": "餐廳菜點的專業營養認證與遠端 Restaurant／Nutritionist 審核工作區。",
  "nutrition-assignments": "區域預設、餐廳／分店指定與單一案件 override 的分派管理；一般 Nutritionist 通常僅檢視「我的工作」，管理權限保留給經授權的 Nutrition Operations Lead。",
  audit: "例行稽核與未來資安管理的分層入口。",
  management: "角色、權限與平台設定的預定位置；目前尚無 UI 管理權限。",
  engineering: "系統健康、版本、工作佇列與安全化診斷的獨立工程工作區。"
};

const boundaryCopy: Readonly<Record<string, string>> = {
  "restaurant-verification": "店家驗證只代表店家身分／經營權確認，不代表營養認證、品質推薦、食安認證或過敏原認證。",
  "restaurant-about": "Restaurant About 是店家提供的介紹文字，不是平台營養認證。",
  "business-development": "商務拓展負責潛在店家開發、接觸、合約與續約；不負責平台行銷活動（屬於平台營運），也不是餐廳營運主檔的擁有者。轉換為正式合作店家後，商業紀錄會連結至同一個 canonical restaurant_id，不會建立第二筆餐廳主檔。本頁不呈現虛構的潛在店家數、成交率、合約金額或業績預測。",
  operations: "平台營運／行銷負責行銷活動、推廣、廣告、贊助內容、版位與行銷通知／成效；不負責店家開發或合約（屬於商務拓展），也不擁有餐廳主檔資料。行銷不會例行取得原始 push token、會員健康資料、會員用餐紀錄、私密社交內容、精確私密 GEO 或稽核／驗證秘密。本頁不呈現虛構的觸及、轉換率、CTR 或營收數字。",
  "operations-communications": "行銷通知／訊息活動是行銷排程意圖，不是推播基礎設施；推播的實際送達診斷屬於工程維運（推播診斷），行銷不會取得原始 push token，本階段也不會實際發送。",
  "menu-management": CROSS_RESTAURANT_QUEUE_COPY_ZH_TW,
  nutrition: "營養認證屬於獨立治理資訊；Nutritionist 的個人資料諮詢權限仍是未來、目的限定且需同意的權限。",
  "nutrition-my-work": "顯示指派給我的餐廳、案件與已授權會員；資料來源與既有的會員營養管理／認證功能相同，僅依指派範圍過濾檢視，不建立第二份資料或權限。",
  "nutrition-standards": "未來調整營養評分、推薦判定或重要參數皆須透過允許清單欄位、版本紀錄、稽核與有限的專業權限；本頁不提供任何可編輯設定，也不會直接開放推薦引擎設定或任意資料庫編輯。",
  "nutrition-members": "僅會員明確同意並指派給特定 Nutritionist 後，該會員才會出現在此清單；可調整欄位為固定允許清單，異動會記錄新舊值、原因、操作者與時間並可隨時撤銷存取，本頁不是全會員瀏覽器或健康資料搜尋工具。",
  "nutrition-certification": "餐點不會僅因存在就進入專業審查佇列；本階段僅代表工作區位置，未建立任何認證權限或資料寫入。",
  "nutrition-certification-remote-review": "遠端 Restaurant／Nutritionist 審核為未來工作流程；本階段不包含視訊、即時通訊、餐廳存取權限或任何營養資料寫入／認證異動。",
  "nutrition-assignments": `分派優先順序：${NUTRITION_ASSIGNMENT_PRECEDENCE.map((level) => level.zhTW).join(" → ")}；範圍較小的明確指定永遠覆蓋範圍較大的預設，區域預設不代表永久區域壟斷。一般 Nutritionist 僅能檢視「我的工作」；區域覆蓋、餐廳／分店分派、案件分派與工作量調整保留給經授權的 Nutrition Operations Lead 管理，本階段尚無資料庫角色與任何分派異動。取得餐廳／案件分派不代表自動取得該餐廳顧客的私密健康或營養資料，仍須會員個別明確同意；此分派也與商務拓展的業務歸屬（銷售負責人、合約續約）是各自獨立的權限領域。`,
  "nutrition-self-cooked-quality": "自煮辨識品質屬於專業營養估算準確度，不是餐廳菜單內容，因此保留在營養專業管理，而非餐廳營運的菜單管理；與「別名／辨識」等菜單身分品質是不同性質的工作。",
  members: "未來僅提供案件所需的最小資訊，不提供任意瀏覽會員或健康資料。",
  social: "未來僅提供檢舉／案件所需的範圍資料，不提供任意瀏覽聊天、精確位置或推播 token。",
  engineering: `工程診斷不代表可存取使用者私密內容。初始範圍僅限：${ENGINEERING_WORKSPACE_BOUNDARY.safeInitialAreas.join("、")}。`,
  management: "現有 trusted-operator grant/revoke functions 並未透過管理後台開放。"
};

const restaurantItemContextBoundary =
  "此餐點層級資料（營養資料／食材／過敏原／營養認證狀態）僅屬於此餐廳、此菜單與此餐點，不是跨店共用的全域管理頁面；跨店待處理事項請至跨店菜單工作台查詢，實際維護仍在對應的餐廳／菜單／餐點內完成。";

const staticRoute = (route: string) => !route.includes("[");

function statusCounts(entries: readonly { availability: AdminAvailability }[]) {
  return entries.reduce<Record<AdminAvailability, number>>(
    (counts, entry) => ({ ...counts, [entry.availability]: counts[entry.availability] + 1 }),
    { LIVE: 0, DEMO: 0, NOT_ENABLED: 0 }
  );
}

function WorkspaceLanding({ routeId }: { routeId: AdminRouteId }) {
  const entry = getAdminRoute(routeId);
  const descendants = getAdminDescendants(routeId);
  const modules = ADMIN_ROUTE_REGISTRY.filter((candidate) => candidate.parentId === routeId && candidate.navigationVisibility === "ORDINARY");
  const counts = statusCounts(descendants);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description={descriptions[routeId] ?? `${entry.zhTWLabel}的 canonical 工作位置。`} entry={entry} />
      {boundaryCopy[routeId] ? <p className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">{boundaryCopy[routeId]}</p> : null}
      {routeId === "restaurants" ? <RestaurantSelectionFlow /> : null}
      <section aria-labelledby="workspace-status" className="grid gap-3 sm:grid-cols-3">
        <h2 className="sr-only" id="workspace-status">工作區狀態統計</h2>
        {(["LIVE", "DEMO", "NOT_ENABLED"] as const).map((availability) => (
          <div className="rounded-xl border border-slate-200 bg-white p-4" key={availability}>
            <AdminAvailabilityBadge availability={availability} />
            <p className="mt-3 text-2xl font-bold text-slate-950">{counts[availability]}</p>
            <p className="text-xs text-slate-500">canonical modules</p>
          </div>
        ))}
      </section>
      <section aria-labelledby="workspace-modules" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-950" id="workspace-modules">子功能目錄</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => {
            const content = (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-bold text-slate-900">{module.zhTWLabel}</h3>
                  <AdminAvailabilityBadge availability={module.availability} />
                </div>
                <p className="mt-2 text-xs text-slate-500">{module.internalName}</p>
              </>
            );
            return staticRoute(module.route) ? (
              <Link className="rounded-lg border border-slate-200 p-4 hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500" href={module.route} key={module.id}>
                {content}
              </Link>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={module.id}>{content}</div>
            );
          })}
        </div>
      </section>
      <WorkspaceShortcuts sourceWorkspaceId={routeId} />
    </article>
  );
}

const RESTAURANT_SELECTION_STEPS = [
  { step: 1, zhTW: "選擇餐廳", description: "從餐廳清單找到要管理的餐廳。" },
  { step: 2, zhTW: "開啟餐廳詳情", description: "進入該餐廳的基本資料、聯絡資訊、分店與菜單。" },
  { step: 3, zhTW: "管理分店／菜單／餐點", description: "在該餐廳的脈絡下維護分店、菜單與餐點層級的食材、過敏原、營養資料與認證狀態。" }
] as const;

function RestaurantSelectionFlow() {
  return (
    <section aria-labelledby="restaurant-selection-flow" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950" id="restaurant-selection-flow">餐廳營運從「選擇餐廳」開始</h2>
      <p className="mt-1 text-xs text-slate-500">跨店查詢（跨店菜單工作台）是輔助佇列，不是主要入口；正式維護一律回到餐廳本身。</p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {RESTAURANT_SELECTION_STEPS.map((item) => (
          <li className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={item.step}>
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Step {item.step}</p>
            <p className="mt-1 font-bold text-slate-900">{item.zhTW}</p>
            <p className="mt-2 text-xs leading-5 text-slate-600">{item.description}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WorkspaceShortcuts({ sourceWorkspaceId }: { sourceWorkspaceId: AdminRouteId }) {
  const shortcuts = ADMIN_WORKSPACE_SHORTCUTS
    .filter((shortcut) => shortcut.sourceWorkspaceId === sourceWorkspaceId)
    .slice()
    .sort((left, right) => left.order - right.order);
  if (shortcuts.length === 0) return null;
  return (
    <section aria-labelledby="workspace-shortcuts" className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950" id="workspace-shortcuts">相關菜單資料快速連結</h2>
      <p className="mt-1 text-xs text-slate-500">這些連結指向餐廳營運的 canonical 功能，供專業審查時參考；不會另外建立第二份資料或權限。</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shortcuts.map((shortcut) => {
          const target = getAdminRoute(shortcut.targetRouteId);
          return (
            <Link className="rounded-lg border border-slate-200 p-4 hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500" href={target.route} key={shortcut.id}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold text-slate-900">{shortcut.label}</h3>
                <AdminAvailabilityBadge availability={target.availability} />
              </div>
              <p className="mt-2 text-xs text-slate-500">{target.internalName}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Dashboard() {
  const entry = getAdminRoute("dashboard");
  const workspaces = ADMIN_TOP_LEVEL_WORKSPACE_IDS.filter((id) => id !== "dashboard").map(getAdminRoute);
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description={descriptions.dashboard} entry={entry} />
      <section aria-labelledby="workspace-directory" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <h2 className="sr-only" id="workspace-directory">工作區目錄</h2>
        {workspaces.map((workspace) => {
          const counts = statusCounts(getAdminDescendants(workspace.id as AdminRouteId));
          return (
            <Link className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-sky-300 hover:shadow focus:outline-none focus:ring-2 focus:ring-sky-500" href={workspace.route} key={workspace.id}>
              <div className="flex items-start justify-between gap-3">
                <div><h3 className="font-bold text-slate-950">{workspace.zhTWLabel}</h3><p className="mt-1 text-xs text-slate-500">{workspace.internalName}</p></div>
                <AdminAvailabilityBadge availability={workspace.availability} />
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">正式 {counts.LIVE} · 示範 {counts.DEMO} · 尚未啟用 {counts.NOT_ENABLED}</p>
            </Link>
          );
        })}
      </section>
    </article>
  );
}

export function AdminRegistryPage({ routeId }: { routeId: AdminRouteId }) {
  if (routeId === "dashboard") return <Dashboard />;
  if (ADMIN_TOP_LEVEL_WORKSPACE_IDS.includes(routeId as typeof ADMIN_TOP_LEVEL_WORKSPACE_IDS[number]) || NESTED_HUB_ROUTE_IDS.includes(routeId)) {
    return <WorkspaceLanding routeId={routeId} />;
  }
  const entry = getAdminRoute(routeId);
  const ancestorBoundary = routeId.startsWith("member-") ? boundaryCopy.members
    : routeId.startsWith("social-") ? boundaryCopy.social
      : routeId.startsWith("business-development") ? boundaryCopy["business-development"]
        : routeId === "operations-communications" ? boundaryCopy["operations-communications"]
          : routeId.startsWith("operations-") ? boundaryCopy.operations
            : routeId.startsWith("menu-management-") ? boundaryCopy["menu-management"]
              : routeId.startsWith("restaurant-item-") || routeId === "restaurant-menu-item-detail" ? restaurantItemContextBoundary
                : routeId.startsWith("nutrition-my-work") ? boundaryCopy["nutrition-my-work"]
                  : routeId.startsWith("nutrition-standards-") ? boundaryCopy["nutrition-standards"]
                    : routeId === "nutrition-member-detail" ? boundaryCopy["nutrition-members"]
                      : routeId.startsWith("nutrition-certification-") ? boundaryCopy["nutrition-certification"]
                        : routeId.startsWith("nutrition-assignments") ? boundaryCopy["nutrition-assignments"]
                          : routeId.startsWith("nutrition-") ? boundaryCopy.nutrition
                            : undefined;
  return (
    <article className="space-y-5">
      <AdminWorkspaceHeader description={`${entry.zhTWLabel}的 canonical 工作位置。`} entry={entry} />
      <AdminRoutePlaceholder boundaryCopy={boundaryCopy[routeId] ?? ancestorBoundary} entry={entry} />
    </article>
  );
}

export function createAdminRegistryPage(routeId: AdminRouteId) {
  return function AdminCanonicalRoutePage() {
    return <AdminRegistryPage routeId={routeId} />;
  };
}

