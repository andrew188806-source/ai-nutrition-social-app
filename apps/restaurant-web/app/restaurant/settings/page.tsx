import { DashboardShell } from "../../../components/DashboardShell";
import { Card, Section } from "../../../components/RestaurantCards";
import { getFutureEvents } from "../../../services/restaurantConsoleService";

export default function SettingsPage() {
  const events = getFutureEvents();
  return (
    <DashboardShell title="系統設定" subtitle="查看預留事件與未來資料結構，正式設定流程後續再接。">
      <Section title="預留事件">
        <Card>
          <div className="flex flex-wrap gap-2">
            {events.map((event) => (
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-bold text-stone-700" key={event.id}>
                {event.eventType}
              </span>
            ))}
          </div>
        </Card>
      </Section>
    </DashboardShell>
  );
}
