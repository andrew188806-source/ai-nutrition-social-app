import { getAdminCanonicalSnapshot } from "./admin-base-repository";

export const menuItemGovernanceRepository = {
  listMenuItems() {
    return getAdminCanonicalSnapshot().menuItems;
  },
  listBranchMenuItems() {
    return getAdminCanonicalSnapshot().branchMenuItems;
  },
  listAliases() {
    return getAdminCanonicalSnapshot().menuItemAliases;
  },
  listIngredients() {
    return getAdminCanonicalSnapshot().menuItemIngredients;
  },
  listMergeCandidates() {
    return getAdminCanonicalSnapshot().menuItemMergeCandidates;
  },
  listActionDrafts() {
    return getAdminCanonicalSnapshot().adminActionDrafts;
  }
};
