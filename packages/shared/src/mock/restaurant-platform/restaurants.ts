import type { Restaurant, RestaurantBranch } from "../../domain/restaurantDomain";

export const canonicalRestaurants: Restaurant[] = [
  {
    id: "restaurant-haochu-bowl",
    name: "好廚 TastKind",
    legalName: "好廚餐飲平台股份有限公司",
    city: "台北市",
    category: "健康碗",
    tags: ["藍勾勾認證", "高蛋白", "均衡推薦"],
    plan: "growth",
    status: "active"
  },
  {
    id: "restaurant-mori-veggie",
    name: "森日蔬食廚房",
    legalName: "森日蔬食廚房股份有限公司",
    city: "台北市",
    category: "蔬食",
    tags: ["蔬食選項", "低卡選項", "高蛋白"],
    plan: "demo",
    status: "active"
  },
  {
    id: "restaurant-mountain-protein",
    name: "山線蛋白餐盒",
    legalName: "山線蛋白餐盒有限公司",
    city: "台北市",
    category: "蛋白餐盒",
    tags: ["高蛋白", "運動餐", "均衡推薦"],
    plan: "demo",
    status: "active"
  },
  {
    id: "restaurant-noodle-soup",
    name: "春暖麵線屋",
    legalName: "春暖麵線屋",
    city: "台北市",
    category: "麵食",
    tags: ["暖胃主食", "低脂選項", "均衡推薦"],
    plan: "demo",
    status: "active"
  },
  {
    id: "restaurant-cafe-balance",
    name: "平衡輕食咖啡",
    legalName: "平衡輕食咖啡有限公司",
    city: "台北市",
    category: "輕食咖啡",
    tags: ["低卡選項", "早午餐", "咖啡飲品"],
    plan: "demo",
    status: "active"
  }
];

export const canonicalBranches: RestaurantBranch[] = [
  { id: "branch-nanjing", restaurantId: "restaurant-haochu-bowl", name: "南京門市", district: "中山區", address: "台北市南京東路 16 號", isActive: true },
  { id: "branch-beitou", restaurantId: "restaurant-haochu-bowl", name: "北投門市", district: "北投區", address: "台北市北投健康路 22 號", isActive: true },
  { id: "branch-xinyi", restaurantId: "restaurant-haochu-bowl", name: "信義門市", district: "信義區", address: "台北市信義健康街 11 號", isActive: true },
  { id: "branch-mori-da-an", restaurantId: "restaurant-mori-veggie", name: "大安森林店", district: "大安森林公園", address: "台北市大安區森林南路 8 號", isActive: true },
  { id: "branch-mountain-songshan", restaurantId: "restaurant-mountain-protein", name: "松山店", district: "松山區", address: "台北市松山區健康路 30 號", isActive: true },
  { id: "branch-noodle-zhongshan", restaurantId: "restaurant-noodle-soup", name: "中山店", district: "中山區", address: "台北市中山區春暖街 5 號", isActive: true },
  { id: "branch-cafe-da-an", restaurantId: "restaurant-cafe-balance", name: "大安店", district: "大安區", address: "台北市大安區平衡街 12 號", isActive: true }
];
