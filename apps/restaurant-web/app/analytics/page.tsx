import { DashboardShell } from "../../components/DashboardShell";
import { MetricCard, Section } from "../../components/RestaurantCards";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function RestaurantAnalyticsPage() {
  return (
    <DashboardShell title={zhTW.restaurant.analyticsTitle} subtitle={zhTW.restaurant.analyticsSubtitle}>
      <Section title={zhTW.restaurant.analyticsTitle} subtitle={zhTW.restaurant.mobileLoop}>
        <div className="grid gap-4 md:grid-cols-4">
          {zhTW.restaurant.analyticsCards.map((card) => (
            <MetricCard key={card.label} label={card.label} value={card.value} note={card.note} />
          ))}
        </div>
      </Section>
    </DashboardShell>
  );
}
