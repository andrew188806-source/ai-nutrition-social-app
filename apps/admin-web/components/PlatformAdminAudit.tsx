import type { PlatformAdminAuditResult } from "../view-models/platform-admin-audit";
import { CardGrid, DetailCard, GovernanceNote } from "./GovernanceUi";

const refusals = {
  unauthenticated: "請使用已驗證的管理員身分存取稽核紀錄。目前登入頁仍為示範介面。",
  forbidden: "目前身分沒有讀取平台管理員稽核紀錄的權限。",
  unavailable: "平台管理員稽核紀錄目前無法使用。",
  invalid_request: "分頁參數無效，請回到第一頁。"
};

export function PlatformAdminAudit({ result }: { result: PlatformAdminAuditResult }) {
  if (result.state !== "ready") {
    return <div role="status"><GovernanceNote>{refusals[result.state]}</GovernanceNote></div>;
  }
  const pageHref = (page: number) => `/audit-trail?page=${page}&pageSize=${result.pageSize}`;
  return (
    <div className="grid gap-5">
      <GovernanceNote>正式資料：平台管理員授權與撤銷紀錄。僅顯示最新 500 筆範圍；新增紀錄可能使分頁位置變動。</GovernanceNote>
      {result.events.length === 0 && <p role="status">此頁沒有平台管理員生命週期紀錄。</p>}
      <CardGrid>
        {result.events.map((event, index) => (
          <DetailCard key={`${result.page}-${index}`}
            title={event.action === "grant_platform_admin" ? "授予平台管理員權限" : "撤銷平台管理員權限"}
            subtitle="平台管理員"
            items={[
              { label: "結果", value: { granted: "已授權", revoked: "已撤銷", rejected: "已拒絕" }[event.outcome] },
              { label: "時間", value: event.occurredAt }
            ]}
          />
        ))}
      </CardGrid>
      <nav aria-label="稽核紀錄分頁" className="flex items-center gap-5">
        {result.page > 1 && <a href={pageHref(result.page - 1)}>上一頁</a>}
        <span>第 {result.page} 頁 · 每頁最多 {result.pageSize} 筆</span>
        {result.hasNextPage && <a href={pageHref(result.page + 1)}>下一頁</a>}
      </nav>
    </div>
  );
}
