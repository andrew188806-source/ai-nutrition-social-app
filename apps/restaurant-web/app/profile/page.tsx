import { DashboardShell } from "../../components/DashboardShell";
import { Card, Section, TagList } from "../../components/RestaurantCards";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function RestaurantProfilePage() {
  return (
    <DashboardShell title={zhTW.restaurant.profileTitle} subtitle={zhTW.restaurant.profileSubtitle}>
      <div className="grid gap-4 md:grid-cols-2">
        {zhTW.restaurant.profileFields.map((field) => (
          <Card key={field.label}>
            <p className="text-sm font-semibold text-stone-500">{field.label}</p>
            <p className="mt-2 text-lg font-bold text-stone-950">{field.value}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <Section title={zhTW.restaurant.restaurantTagsTitle} subtitle={zhTW.restaurant.mobileLoop}>
          <Card>
            <TagList tags={zhTW.restaurant.restaurantTags} />
          </Card>
        </Section>
      </div>
    </DashboardShell>
  );
}
