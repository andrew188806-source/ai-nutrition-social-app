import { listAssistantDrafts, listAssistantSuggestions, listAuditLogs } from "../repositories/assistant-repository";
import { listRestaurantUsers } from "../repositories/employee-repository";
import { getStaffConsoleData } from "./employee-service";
import { getPendingMenuItems } from "./pending-item-service";

export function getAssistantConsoleData() {
  const staff = getStaffConsoleData();
  const users = listRestaurantUsers();
  return {
    suggestions: listAssistantSuggestions(),
    drafts: listAssistantDrafts(),
    pendingItems: getPendingMenuItems().slice(0, 3),
    auditLogs: listAuditLogs(),
    inactiveUsers: staff.employees
      .filter((employee) => employee.status === "inactive")
      .flatMap((employee) => users.filter((user) => user.employeeId === employee.id && user.loginStatus === "enabled"))
  };
}
