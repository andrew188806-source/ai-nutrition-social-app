import type { EmployeeBranchAssignment, EmployeeRoleAssignment, EmployeeTransferLog, RestaurantEmployee, RestaurantUser } from "../../domain/restaurantDomain";

export const canonicalRestaurantEmployees: RestaurantEmployee[] = [
  { id: "employee-mina", restaurantId: "restaurant-haochu-bowl", name: "林敏娜", title: "店長", phone: "0912-000-118", status: "active", defaultBranchId: "branch-nanjing", effectiveDate: "2026-06-01" },
  { id: "employee-grace", restaurantId: "restaurant-haochu-bowl", name: "周 Grace", title: "營養編輯", status: "active", defaultBranchId: "branch-xinyi", effectiveDate: "2026-06-03" },
  { id: "employee-hao", restaurantId: "restaurant-haochu-bowl", name: "陳浩", title: "門市夥伴", status: "active", defaultBranchId: "branch-beitou", effectiveDate: "2026-06-10" },
  { id: "employee-iris", restaurantId: "restaurant-haochu-bowl", name: "吳 Iris", title: "前店長", status: "inactive", defaultBranchId: "branch-nanjing", effectiveDate: "2026-05-01" }
];

export const canonicalRestaurantUsers: RestaurantUser[] = [
  { id: "user-mina", authUserId: "auth-mina", employeeId: "employee-mina", email: "mina@tastkind.example", displayName: "林敏娜", loginStatus: "enabled", permissionScope: "branch" },
  { id: "user-grace", authUserId: "auth-grace", employeeId: "employee-grace", email: "grace@tastkind.example", displayName: "Grace", loginStatus: "enabled", permissionScope: "restaurant" },
  { id: "user-iris", authUserId: "auth-iris", employeeId: "employee-iris", email: "iris@tastkind.example", displayName: "Iris", loginStatus: "enabled", permissionScope: "branch" }
];

export const canonicalEmployeeBranchAssignments: EmployeeBranchAssignment[] = [
  { id: "assignment-mina-nanjing", employeeId: "employee-mina", branchId: "branch-nanjing", effectiveDate: "2026-06-01" },
  { id: "assignment-grace-xinyi", employeeId: "employee-grace", branchId: "branch-xinyi", effectiveDate: "2026-06-03" },
  { id: "assignment-hao-beitou", employeeId: "employee-hao", branchId: "branch-beitou", effectiveDate: "2026-06-10" }
];

export const canonicalEmployeeRoleAssignments: EmployeeRoleAssignment[] = [
  { id: "role-mina-manager", employeeId: "employee-mina", role: "manager", scope: "branch", branchId: "branch-nanjing", effectiveDate: "2026-06-01" },
  { id: "role-grace-nutrition", employeeId: "employee-grace", role: "nutrition_editor", scope: "restaurant", effectiveDate: "2026-06-03" },
  { id: "role-hao-staff", employeeId: "employee-hao", role: "branch_staff", scope: "branch", branchId: "branch-beitou", effectiveDate: "2026-06-10" },
  { id: "role-iris-viewer", employeeId: "employee-iris", role: "viewer", scope: "branch", branchId: "branch-nanjing", effectiveDate: "2026-05-01" }
];

export const canonicalEmployeeTransferLogs: EmployeeTransferLog[] = [
  { id: "transfer-mina-20260601", employeeId: "employee-mina", fromBranchId: "branch-beitou", toBranchId: "branch-nanjing", operatorUserId: "user-mina", effectiveDate: "2026-06-01", note: "支援南西店營養菜單試營運" },
  { id: "transfer-hao-20260610", employeeId: "employee-hao", toBranchId: "branch-beitou", operatorUserId: "user-mina", effectiveDate: "2026-06-10", note: "新進門市夥伴分派" }
];
