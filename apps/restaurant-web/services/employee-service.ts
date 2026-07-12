import type { EmployeeRole } from "@haocu/shared/domain/restaurantDomain";
import { getBranchById, listBranches } from "../repositories/branch-repository";
import { listEmployeeBranchAssignments, listEmployeeRoleAssignments, listEmployees, listEmployeeTransferLogs, listRestaurantUsers } from "../repositories/employee-repository";

export const roleLabels: Record<EmployeeRole, string> = {
  owner: "店主",
  manager: "店長",
  nutrition_editor: "營養編輯",
  branch_staff: "門市夥伴",
  viewer: "唯讀查看",
  platform_admin: "平台管理員"
};

function branchName(branchId?: string) {
  if (!branchId) return "全部分店";
  return getBranchById(branchId)?.name ?? "未知分店";
}

function employeeRole(employeeId: string) {
  return listEmployeeRoleAssignments().find((assignment) => assignment.employeeId === employeeId);
}

export function getStaffConsoleData() {
  const users = listRestaurantUsers();
  const roleAssignments = listEmployeeRoleAssignments();
  return {
    branches: listBranches(),
    employees: listEmployees().map((employee) => {
      const role = employeeRole(employee.id);
      const user = users.find((item) => item.employeeId === employee.id);
      return {
        ...employee,
        hasConsoleAccess: user?.loginStatus === "enabled",
        role: role?.role ?? "viewer",
        branchName: branchName(employee.defaultBranchId),
        roleLabel: roleLabels[role?.role ?? "viewer"],
        loginState: user?.loginStatus === "enabled" ? "有後台登入" : "無後台登入"
      };
    }),
    users,
    assignments: listEmployeeBranchAssignments().map((assignment) => {
      const employee = listEmployees().find((item) => item.id === assignment.employeeId);
      const role = roleAssignments.find((item) => item.employeeId === assignment.employeeId && item.branchId === assignment.branchId) ?? roleAssignments.find((item) => item.employeeId === assignment.employeeId);
      return {
        ...assignment,
        employeeName: employee?.name ?? "未知員工",
        branchName: branchName(assignment.branchId),
        roleLabel: roleLabels[role?.role ?? "viewer"]
      };
    }),
    transfers: listEmployeeTransferLogs().map((log) => {
      const employee = listEmployees().find((item) => item.id === log.employeeId);
      const operator = users.find((user) => user.id === log.operatorUserId);
      return {
        ...log,
        employeeName: employee?.name ?? "未知員工",
        operator: operator?.displayName ?? "未知操作者",
        fromBranchName: branchName(log.fromBranchId),
        toBranchName: branchName(log.toBranchId)
      };
    })
  };
}
