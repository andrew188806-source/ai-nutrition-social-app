export interface ConsoleNavItem {
  href: string;
  label: string;
  phaseTwo?: boolean;
  children?: Array<{ href: string; label: string; phaseTwo?: boolean }>;
}

// R1 operational-surface closure: an item is `phaseTwo` when its route is not yet
// connected to any real capability (still a DeferredPage / "唯讀模組尚未連接" stub),
// not only when it is a genuinely later product phase like orders/tables. The route,
// component and future spec are all preserved — this only controls what the primary
// MVP navigation surface presents as available today. See docs/engineering-handoff.md.
export const consoleNavItems: ConsoleNavItem[] = [
  { href: "/restaurant", label: "首頁" },
  { href: "/restaurant/locations", label: "店家與分店" },
  {
    href: "/restaurant/menu",
    label: "菜單管理",
    children: [
      { href: "/restaurant/menu", label: "菜單列表" },
      { href: "/restaurant/menu/items", label: "餐點管理" },
      { href: "/restaurant/menu/pending-items", label: "待確認餐點", phaseTwo: true }
    ]
  },
  { href: "/restaurant/nutrition", label: "營養管理" },
  {
    href: "/restaurant/analytics",
    label: "成效分析",
    phaseTwo: true,
    children: [
      { href: "/restaurant/analytics/exposure", label: "曝光來源" },
      { href: "/restaurant/analytics/nutrition-badge", label: "營養標誌成效" },
      { href: "/restaurant/analytics/menu-performance", label: "餐點表現" }
    ]
  },
  {
    href: "/restaurant/staff",
    label: "人員與權限",
    phaseTwo: true,
    children: [
      { href: "/restaurant/staff", label: "人員列表" },
      { href: "/restaurant/staff/branches", label: "分店配置" },
      { href: "/restaurant/staff/roles", label: "職位與權限" },
      { href: "/restaurant/staff/transfers", label: "調動紀錄" }
    ]
  },
  { href: "/restaurant/assistant", label: "店務助手", phaseTwo: true },
  { href: "/restaurant/media", label: "圖片與文件", phaseTwo: true },
  { href: "/restaurant/settings", label: "系統設定" },
  { href: "/restaurant/orders-preview", label: "訂單與餐桌系統", phaseTwo: true }
];
