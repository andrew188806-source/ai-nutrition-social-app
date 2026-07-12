import { restaurantConsoleMockAdapter } from "../adapters/mock/restaurant-console-mock-adapter";

export function listEmployees(restaurantId = "restaurant-haochu-bowl") {
  return restaurantConsoleMockAdapter.employees.filter((employee) => employee.restaurantId === restaurantId);
}

export function listRestaurantUsers() {
  return restaurantConsoleMockAdapter.users;
}

export function listEmployeeBranchAssignments() {
  return restaurantConsoleMockAdapter.branchAssignments;
}

export function listEmployeeRoleAssignments() {
  return restaurantConsoleMockAdapter.roleAssignments;
}

export function listEmployeeTransferLogs() {
  return restaurantConsoleMockAdapter.transferLogs;
}
