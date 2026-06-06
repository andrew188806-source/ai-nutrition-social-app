import { DashboardShell } from "../../components/DashboardShell";
import { Card, Section } from "../../components/RestaurantCards";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function RestaurantVipPage() {
  return (
    <DashboardShell title={zhTW.restaurant.vipTitle} subtitle={zhTW.restaurant.vipSubtitle}>
      <Section title={zhTW.restaurant.vipTitle} subtitle={zhTW.mobile.permissions.vipBody}>
        <div className="grid gap-4 md:grid-cols-2">
          {zhTW.restaurant.vipMembers.map((member) => (
            <Card key={member.name}>
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-bold text-stone-950">{member.name}</h2>
                <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">{member.consent}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-stone-600">{member.insight}</p>
            </Card>
          ))}
        </div>
      </Section>
    </DashboardShell>
  );
}
