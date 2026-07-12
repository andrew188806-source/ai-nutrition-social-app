import { DashboardShell } from "../../../components/DashboardShell";
import { Card } from "../../../components/RestaurantCards";

export default function OrdersPreviewPage() {
  return (
    <DashboardShell title="訂單與餐桌系統" subtitle="第二階段預告頁。">
      <Card className="border-dashed border-stone-300 bg-stone-50 text-center">
        <p className="text-2xl font-black text-stone-700">尚未開放</p>
        <p className="mt-3 text-sm leading-6 text-stone-500">本頁不實作訂單流程、付款、出餐、桌號或訂單狀態。</p>
      </Card>
    </DashboardShell>
  );
}
