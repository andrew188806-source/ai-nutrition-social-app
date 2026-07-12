import { DashboardShell } from "../../../components/DashboardShell";
import { Card, EmptyState, Section } from "../../../components/RestaurantCards";

export default function MediaPage() {
  return (
    <DashboardShell title="圖片與文件" subtitle="第一階段保留圖片與文件整理入口，後續可串 Supabase Storage。">
      <Section title="圖片與文件">
        <Card>
          <EmptyState title="尚未串接檔案儲存" body="餐點照片會先在 mock data 呈現，正式檔案流程留待後續串接。" />
        </Card>
      </Section>
    </DashboardShell>
  );
}
