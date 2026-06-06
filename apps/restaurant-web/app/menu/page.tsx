import { DashboardShell } from "../../components/DashboardShell";
import { Card, Section, TagList } from "../../components/RestaurantCards";
import { zhTW } from "../../../../lib/i18n/zh-TW";

export default function RestaurantMenuPage() {
  return (
    <DashboardShell title={zhTW.restaurant.menuTitle} subtitle={zhTW.restaurant.menuSubtitle}>
      <Section title={zhTW.restaurant.menuTitle} subtitle={zhTW.restaurant.disclosureWorkflowTitle}>
        <div className="grid gap-4 md:grid-cols-2">
          {zhTW.restaurant.menuItems.map((item) => (
            <Card key={item.name}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-stone-950">{item.name}</h2>
                  <p className="mt-1 text-sm font-semibold text-teal-700">{item.price}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{item.status}</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-stone-600">{item.nutrition}</p>
              <div className="mt-4">
                <TagList tags={item.tags} />
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <h2 className="text-xl font-bold text-stone-950">{zhTW.restaurant.menuFormTitle}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {zhTW.restaurant.menuFormFields.map((field) => (
              <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-600" key={field}>
                {field}
              </div>
            ))}
          </div>
          <a className="mt-5 inline-block rounded-md bg-teal-700 px-4 py-3 text-sm font-bold text-white hover:bg-teal-800" href="#mock-ai-result">
            {zhTW.restaurant.mockAiButton}
          </a>
          <p className="mt-3 text-sm leading-6 text-stone-600" id="mock-ai-result">
            {zhTW.restaurant.mockAiResult}
          </p>
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-stone-950">{zhTW.restaurant.menuTagSelectionTitle}</h2>
          <div className="mt-4">
            <TagList tags={zhTW.restaurant.restaurantTags} />
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <h2 className="text-xl font-bold text-stone-950">{zhTW.restaurant.disclosureWorkflowTitle}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {zhTW.restaurant.disclosureWorkflow.map((step) => (
              <span className="rounded-full bg-stone-100 px-3 py-2 text-sm font-bold text-stone-700" key={step}>
                {step}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <h2 className="text-xl font-bold text-stone-950">{zhTW.restaurant.precisionSupportTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">{zhTW.restaurant.precisionSupportBody}</p>
        </Card>
      </div>
    </DashboardShell>
  );
}
