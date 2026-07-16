import "server-only";

import {
  SupabaseConfigurationError,
  SupabaseHttpError,
  SupabaseQueryError,
  SupabaseRequestTimeoutError
} from "./errors";
import type { ReadonlyDatabaseClient, ReadonlyFilter, ReadonlySelectOptions } from "./readonly-database-client";
import { READONLY_ORDER_FIELDS, type ReadonlyResource } from "./readonly-resources";

export interface FetchRestClientOptions {
  supabaseUrl: string;
  publishableKey: string;
  fetchImpl?: typeof fetch;
  defaultTimeoutMs?: number;
}

function normalizeBaseUrl(supabaseUrl: string): string {
  const trimmed = supabaseUrl.replace(/\/+$/, "");
  if (!trimmed) throw new SupabaseConfigurationError("TASTKIND_SUPABASE_URL is required for REST transport.");
  return `${trimmed}/rest/v1`;
}

function encodeFilter(filter: ReadonlyFilter): string {
  if (filter.operator === "eq") return `eq.${String(filter.value)}`;
  if (filter.operator === "in") {
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    return `in.(${values.map((value) => String(value)).join(",")})`;
  }
  throw new SupabaseQueryError(`Unsupported readonly filter operator for ${filter.field}.`);
}

function assertSafeOrder(resource: ReadonlyResource, field: string): void {
  if (!READONLY_ORDER_FIELDS[resource].includes(field)) {
    throw new SupabaseQueryError(`Unsupported readonly order field ${field} for ${resource}.`);
  }
}

function isArrayExpected(options?: ReadonlySelectOptions): boolean {
  return options?.single !== "single" && options?.single !== "maybeSingle";
}

export class FetchRestClient implements ReadonlyDatabaseClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly publishableKey: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: FetchRestClientOptions) {
    if (!options.publishableKey) throw new SupabaseConfigurationError("TASTKIND_SUPABASE_PUBLISHABLE_KEY is required for REST transport.");
    this.baseUrl = normalizeBaseUrl(options.supabaseUrl);
    this.publishableKey = options.publishableKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 8000;
  }

  async select<T>(resource: ReadonlyResource, options: ReadonlySelectOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/${resource}`);
    const searchParams: URLSearchParams = url.searchParams;
    searchParams.set("select", options.select ?? "*");
    for (const filter of options.filters ?? []) {
      searchParams.set(filter.field, encodeFilter(filter));
    }
    if (options.order) {
      assertSafeOrder(resource, options.order.field);
      searchParams.set("order", `${options.order.field}.${options.order.ascending === false ? "desc" : "asc"}`);
    }
    if (options.limit !== undefined) {
      if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 1000) {
        throw new SupabaseQueryError(`Invalid readonly limit for ${resource}.`);
      }
      searchParams.set("limit", String(options.limit));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.defaultTimeoutMs);
    const headers: Record<string, string> = {
      apikey: this.publishableKey,
      Accept: "application/json"
    };
    if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new SupabaseHttpError(`Readonly REST request failed for ${resource}.`, response.status, resource);
      }

      const body = (await response.json()) as unknown;
      if (isArrayExpected(options) && !Array.isArray(body)) {
        throw new SupabaseQueryError(`Readonly REST response for ${resource} must be an array.`);
      }
      if (options.single === "maybeSingle" && Array.isArray(body)) {
        return ((body[0] ?? null) as T);
      }
      if (options.single === "single" && Array.isArray(body)) {
        if (!body[0]) throw new SupabaseQueryError(`Readonly REST single response for ${resource} was empty.`);
        return body[0] as T;
      }
      return body as T;
    } catch (error) {
      if (error instanceof SupabaseHttpError || error instanceof SupabaseQueryError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new SupabaseRequestTimeoutError(`Readonly REST request timed out for ${resource}.`, resource);
      }
      throw new SupabaseQueryError(`Readonly REST request failed for ${resource}.`, error);
    } finally {
      clearTimeout(timeout);
    }
  }
}
