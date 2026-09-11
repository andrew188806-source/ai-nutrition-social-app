import type { AdminRouteDefinition } from "../../auth/admin-route-registry";

const staffLabels: Readonly<Record<string, string>> = {
  PLATFORM_OPERATIONS: "平台營運", RESTAURANT_OPERATIONS: "餐廳營運", MEMBER_SUPPORT: "會員支援",
  SOCIAL_OPERATIONS: "社交安全", NUTRITION_OPERATIONS: "營養營運", DATA_CONTENT_QUALITY: "資料與內容品質",
  AUDIT_SECURITY: "稽核與資安", PLATFORM_MANAGEMENT: "平台管理", ENGINEERING_MAINTAINER: "工程維運",
  HIGHEST_PRIVILEGE_BREAK_GLASS: "緊急權限"
};

const dataClassLabels: Readonly<Record<string, string>> = {
  PUBLIC: "公開資料", RESTAURANT_OPERATIONAL: "餐廳營運資料", RESTAURANT_PRIVATE: "餐廳私密資料",
  MEMBER_ACCOUNT: "會員帳戶資料", USER_PRIVATE: "使用者私密資料", HEALTH_PERSONAL_NUTRITION: "健康／個人營養資料",
  PRIVATE_SOCIAL: "私密社交資料", SECURITY_AUTH: "資安／身分驗證資料", AUDIT: "稽核資料",
  ENGINEERING_DIAGNOSTIC: "工程診斷資料", BREAK_GLASS_ONLY: "僅限緊急權限資料"
};

const migrationCopy: Readonly<Record<AdminRouteDefinition["availability"], string>> = {
  LIVE: "正式權限已存在；正式介面將於後續搬移至此位置。",
  DEMO: "此區目前僅有示範流程，尚未接入正式權限與資料。",
  NOT_ENABLED: "此功能尚未接入正式資料。"
};

export function AdminRoutePlaceholder({ entry, boundaryCopy }: { entry: AdminRouteDefinition; boundaryCopy?: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <h2 className="text-base font-bold text-slate-900">遷移狀態</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{migrationCopy[entry.availability]}</p>
          {boundaryCopy ? (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{boundaryCopy}</p>
          ) : null}
        </div>
        <dl className="space-y-3 rounded-lg bg-slate-50 p-4 text-sm">
          <div>
            <dt className="font-semibold text-slate-500">預定工作人員</dt>
            <dd className="mt-1 text-slate-900">{entry.intendedStaffDomains.map((domain) => staffLabels[domain]).join("、") || "尚未指定"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">資料敏感度</dt>
            <dd className="mt-1 text-slate-900">{dataClassLabels[entry.dataClass]}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Canonical route</dt>
            <dd className="mt-1 break-all font-mono text-xs text-slate-700">{entry.route}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

