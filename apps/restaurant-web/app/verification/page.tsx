import { DashboardShell } from "../../components/DashboardShell";
import { Card } from "../../components/RestaurantCards";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function RestaurantVerificationPage() {
  return (
    <DashboardShell title={zhTW.restaurant.verificationTitle} subtitle={zhTW.restaurant.verificationSubtitle}>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">{zhTW.restaurant.blueBadgeNote}</div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {zhTW.restaurant.verificationSteps.map((step) => (
          <Card key={step.title}>
            <h2 className="text-lg font-bold text-stone-950">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">{step.body}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <Card>
          <p className="text-lg font-bold text-teal-800">{zhTW.restaurant.verificationStatus}</p>
        </Card>
      </div>
    </DashboardShell>
  );
}
