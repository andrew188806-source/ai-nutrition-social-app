import { DashboardShell } from "../../../components/DashboardShell";
import { Card, Section, StatusPill } from "../../../components/RestaurantCards";
import { getConsoleOverview } from "../../../services/restaurantConsoleService";

export default function LocationsPage() {
  const data = getConsoleOverview();
  return (
    <DashboardShell title="店家與分店" subtitle="查看店家基本資料與分店營運摘要。">
      <Section title={data.restaurant.name} subtitle={`${data.restaurant.legalName} · ${data.restaurant.city}`}>
        <div className="grid gap-4 md:grid-cols-3">
          {data.branchSummary.map((branch) => (
            <Card key={branch.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-stone-950">{branch.name}</h3>
                  <p className="mt-1 text-sm text-stone-500">{branch.address}</p>
                </div>
                <StatusPill tone={branch.isActive ? "good" : "muted"}>{branch.isActive ? "啟用" : "停用"}</StatusPill>
              </div>
              <p className="mt-4 text-sm font-bold text-teal-700">{branch.itemCount} 道餐點 · {branch.employees} 位人員</p>
            </Card>
          ))}
        </div>
      </Section>
    </DashboardShell>
  );
}
