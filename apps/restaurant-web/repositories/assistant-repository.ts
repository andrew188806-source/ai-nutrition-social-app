import { restaurantConsoleMockAdapter } from "../adapters/mock/restaurant-console-mock-adapter";

export function listAssistantSuggestions() {
  return restaurantConsoleMockAdapter.assistantSuggestions;
}

export function listAssistantDrafts() {
  return restaurantConsoleMockAdapter.assistantDrafts;
}

export function listAuditLogs() {
  return restaurantConsoleMockAdapter.auditLogs;
}
