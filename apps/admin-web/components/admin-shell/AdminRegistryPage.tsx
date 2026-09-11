import Link from "next/link";
import {
  ADMIN_ROUTE_REGISTRY,
  ADMIN_TOP_LEVEL_WORKSPACE_IDS,
  ENGINEERING_WORKSPACE_BOUNDARY,
  type AdminAvailability,
  type AdminRouteId
} from "../../auth/admin-route-registry";
import { AdminAvailabilityBadge } from "./AdminAvailabilityBadge";
import { getAdminDescendants, getAdminRoute } from "./admin-ia-navigation";
import { AdminRoutePlaceholder } from "./AdminRoutePlaceholder";
import { AdminWorkspaceHeader } from "./AdminWorkspaceHeader";

const descriptions: Readonly<Record<string, string>> = {
  dashboard: "管理後台的工作區目錄與接入狀態；本頁不呈現虛構營運指標。",
  operations: "廣告、贊助內容與平台層級營運工作的預定位置。",
  restaurants: "餐廳驗證、審查、菜單、分店與營運資料的工作區。",
  members: "以支援案件為界，只提供處理案件所需的最小會員資訊。",
  social: "以檢舉與安全案件為界，只提供處理案件所需的範圍資料。",
  nutrition: "營養審查、辨識品質與內容治理的獨立工作區。",
  "data-quality": "菜單品項、別名、重複資料、推薦與標籤品質的工作區。",
  audit: "例行稽核與未來資安管理的分層入口。",
  management: "角色、權限與平台設定的預定位置；目前尚無 UI 管理權限。",
  engineering: "系統健康、版本、工作佇列與安全化診斷的獨立工程工作區。"
};

const boundaryCopy: Readonly<Record<string, string>> = {
  "restaurant-verification": "店家驗證只代表店家身分／經營權確認，不代表營養認證、品質推薦、食安認證或過敏原認證。",
  "restaurant-about": "Restaurant About 是店家提供的介紹文字，不是平台營養認證。",
  nutrition: "營養認證屬於獨立治理資訊；Nutritionist 的個人資料諮詢權限仍是未來、目的限定且需同意的權限。",
  members: "未來僅提供案件所需的最小資訊，不提供任意瀏覽會員或健康資料。",
  social: "未來僅提供檢舉／案件所需的範圍資料，不提供任意瀏覽聊天、精確位置或推播 token。",
  engineering: `工程診斷不代表可存取使用者私密內容。初始範圍僅限：${ENGINEERING_WORKSPACE_BOUNDARY.safeInitialAreas.join("、")}。`,
  management: "現有 trusted-operator grant/revoke functions 並未透過管理後台開放。"
};

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
    </article>
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
  if (ADMIN_TOP_LEVEL_WORKSPACE_IDS.includes(routeId as typeof ADMIN_TOP_LEVEL_WORKSPACE_IDS[number]) || routeId === "data-quality") {
    return <WorkspaceLanding routeId={routeId} />;
  }
  const entry = getAdminRoute(routeId);
  const ancestorBoundary = routeId.startsWith("member-") ? boundaryCopy.members
    : routeId.startsWith("social-") ? boundaryCopy.social
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

