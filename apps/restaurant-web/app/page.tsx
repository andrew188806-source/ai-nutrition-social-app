import { DashboardShell } from "../components/DashboardShell";
import { Card, MetricCard, Section } from "../components/RestaurantCards";
import { zhTW } from "../../../lib/i18n/zh-TW";

export default function RestaurantOverviewPage() {
  return (
    <DashboardShell title={zhTW.restaurant.overviewTitle} subtitle={zhTW.restaurant.overviewSubtitle}>
      <div className="grid gap-4 md:grid-cols-4">
        {zhTW.restaurant.overviewCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} note={card.note} />
        ))}
      </div>

      <div className="mt-6">
        <Section title={zhTW.restaurant.mobileLoopTitle} subtitle={zhTW.restaurant.mobileLoop}>
          <Card>
            <p className="text-sm font-semibold leading-6 text-stone-700">{zhTW.restaurant.blueBadgeNote}</p>
          </Card>
        </Section>
      </div>
    </DashboardShell>
  );
}
