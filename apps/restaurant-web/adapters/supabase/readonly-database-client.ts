import type { ReadonlyResource } from "./readonly-resources";

export type ReadonlyFilterOperator = "eq" | "in";

export interface ReadonlyFilter {
  field: string;
  operator: ReadonlyFilterOperator;
  value: string | number | boolean | Array<string | number>;
}

export interface ReadonlyOrder {
  field: string;
  ascending?: boolean;
}

export interface ReadonlySelectOptions {
  select?: string;
  filters?: ReadonlyFilter[];
  order?: ReadonlyOrder;
  limit?: number;
  single?: "single" | "maybeSingle";
  accessToken?: string;
  timeoutMs?: number;
  operation?: string;
}

export interface ReadonlyDatabaseClient {
  select<T>(resource: ReadonlyResource, options?: ReadonlySelectOptions): Promise<T>;
}