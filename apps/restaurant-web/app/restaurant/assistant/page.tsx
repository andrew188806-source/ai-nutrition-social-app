import { DashboardShell } from "../../../components/DashboardShell";
import { AssistantConsole } from "../../../components/assistant/AssistantConsole";

export default function AssistantPage() {
  return (
    <DashboardShell title="店務助手" subtitle="第一階段支援查詢、提醒、操作導引、待處理摘要與產生草稿。">
      <AssistantConsole />
    </DashboardShell>
  );
}
