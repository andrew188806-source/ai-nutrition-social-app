import { listBranches } from "../repositories/branch-repository";
import { listRestaurants } from "../repositories/restaurant-repository";
import { getStaffConsoleData } from "./employee-service";
import { getMenuItemPerformance } from "./analytics-service";

export function getRestaurantBranchSummary() {
  const staff = getStaffConsoleData();
  const menuItems = getMenuItemPerformance();
  return listBranches().map((branch) => ({
    ...branch,
    itemCount: menuItems.filter((item) => item.branchNames.includes(branch.name)).length,
    employees: staff.employees.filter((employee) => employee.defaultBranchId === branch.id && employee.status === "active").length
  }));
}

export function getPrimaryRestaurant() {
  return listRestaurants()[0];
}
