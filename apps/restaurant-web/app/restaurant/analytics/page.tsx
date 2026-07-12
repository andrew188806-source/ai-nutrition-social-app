import Link from "next/link";
import { DashboardShell } from "../../../components/DashboardShell";
import { Card, Section } from "../../../components/RestaurantCards";

const links = [
  { href: "/restaurant/analytics/exposure", title: "曝光來源", body: "查看我的城市、AI 推薦、搜尋與飯友配對等來源。" },
  { href: "/restaurant/analytics/nutrition-badge", title: "營養標誌成效", body: "比較同一道菜加入標誌前後的觀察變化。" },
  { href: "/restaurant/analytics/menu-performance", title: "餐點表現", body: "查看瀏覽、收藏、加入訂單與推薦曝光。" }
];

export default function AnalyticsIndexPage() {
  return (
    <DashboardShell title="成效分析" subtitle="第一階段聚焦曝光、營養標誌與餐點表現，不建立完整訂單流程。">
      <Section title="分析模組">
        <div className="grid gap-4 md:grid-cols-3">
          {links.map((link) => (
            <Link href={link.href} key={link.href}>
              <Card className="h-full hover:border-teal-200 hover:bg-teal-50/40">
                <h3 className="font-black text-stone-950">{link.title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-600">{link.body}</p>
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </DashboardShell>
  );
}
