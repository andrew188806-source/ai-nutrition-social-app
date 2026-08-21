import type { ConsumerAuthPort } from "../consumer-auth";
import {
  REPLACE_SOCIAL_INTEREST_SETTINGS_RPC,
  SOCIAL_INTEREST_CATALOG_COLUMNS,
  SOCIAL_INTEREST_CATALOG_LABEL_TABLE,
  SOCIAL_INTEREST_CATALOG_TABLE,
  SOCIAL_INTEREST_LABEL_COLUMNS,
  SOCIAL_INTEREST_SELECTION_COLUMNS,
  SOCIAL_INTEREST_SETTINGS_LOCALE,
  SOCIAL_PROFILE_INTEREST_SELECTION_TABLE,
  type SupabaseSocialInterestSettingsClientLike
} from "./supabaseContracts";
import {
  SOCIAL_INTEREST_LIMITS,
  type SocialInterestCategory,
  type SocialInterestNamespace,
  type SocialInterestOption,
  type SocialInterestSettingsRepository,
  type SocialInterestSettingsResult,
  type SocialInterestSettingsSaveInput,
  type SocialInterestSettingsSaveResult,
  type SocialInterestSettingsSnapshot
} from "./types";

type CatalogRow = Readonly<{
  tagKey: string;
  namespace: SocialInterestNamespace;
  parentKey: string | null;
  depth: 0 | 1;
  selectable: boolean;
  displayOrder: number;
  active: boolean;
}>;

export class SupabaseSocialInterestSettingsRepository implements SocialInterestSettingsRepository {
  readonly source = "supabase-live" as const;

  constructor(
    private readonly authPort: ConsumerAuthPort,
    private readonly client: SupabaseSocialInterestSettingsClientLike
  ) {}

  async load(): Promise<SocialInterestSettingsResult<SocialInterestSettingsSnapshot>> {
    const session = await this.authPort.getCurrentSession();
    if (!session.ok || !session.value) return { ok: false, errorCode: "authentication_required" };

    let catalogResponse;
    let labelResponse;
    let selectionResponse;
    try {
      [catalogResponse, labelResponse, selectionResponse] = await Promise.all([
        this.client
          .from(SOCIAL_INTEREST_CATALOG_TABLE)
          .select(SOCIAL_INTEREST_CATALOG_COLUMNS)
          .order("namespace", { ascending: true })
          .order("display_order", { ascending: true })
          .order("tag_key", { ascending: true }),
        this.client
          .from(SOCIAL_INTEREST_CATALOG_LABEL_TABLE)
          .select(SOCIAL_INTEREST_LABEL_COLUMNS)
          .eq("locale", SOCIAL_INTEREST_SETTINGS_LOCALE),
        this.client
          .from(SOCIAL_PROFILE_INTEREST_SELECTION_TABLE)
          .select(SOCIAL_INTEREST_SELECTION_COLUMNS)
          .order("namespace", { ascending: true })
          .order("tag_key", { ascending: true })
      ]);
    } catch {
      return { ok: false, errorCode: "load_failed" };
    }
    if (catalogResponse.error || labelResponse.error || selectionResponse.error) {
      return { ok: false, errorCode: "load_failed" };
    }
    const parsed = parseLoadPayload(catalogResponse.data, labelResponse.data, selectionResponse.data);
    return parsed ? { ok: true, value: parsed } : { ok: false, errorCode: "invalid_server_response" };
  }

  async save(input: SocialInterestSettingsSaveInput): Promise<SocialInterestSettingsResult<SocialInterestSettingsSaveResult>> {
    const session = await this.authPort.getCurrentSession();
    if (!session.ok || !session.value) return { ok: false, errorCode: "authentication_required" };
    if (new Set(input.generalTagKeys).size > SOCIAL_INTEREST_LIMITS.general
      || new Set(input.foodTagKeys).size > SOCIAL_INTEREST_LIMITS.food) {
      return { ok: false, errorCode: "save_failed" };
    }

    let response;
    try {
      response = await this.client.rpc(REPLACE_SOCIAL_INTEREST_SETTINGS_RPC, {
        p_general_tag_keys: [...input.generalTagKeys],
        p_food_tag_keys: [...input.foodTagKeys]
      });
    } catch {
      return { ok: false, errorCode: "save_failed" };
    }
    if (response.error) return { ok: false, errorCode: "save_failed" };
    const parsed = parseSavePayload(response.data);
    return parsed ? { ok: true, value: parsed } : { ok: false, errorCode: "invalid_server_response" };
  }
}

export class DisabledSocialInterestSettingsRepository implements SocialInterestSettingsRepository {
  readonly source = "disabled" as const;
  async load(): Promise<SocialInterestSettingsResult<SocialInterestSettingsSnapshot>> {
    return { ok: false, errorCode: "configuration_error" };
  }
  async save(): Promise<SocialInterestSettingsResult<SocialInterestSettingsSaveResult>> {
    return { ok: false, errorCode: "configuration_error" };
  }
}

function parseLoadPayload(catalogValue: unknown, labelValue: unknown, selectionValue: unknown): SocialInterestSettingsSnapshot | null {
  if (!Array.isArray(catalogValue) || !Array.isArray(labelValue) || !Array.isArray(selectionValue)) return null;
  const catalogRows = catalogValue.map(parseCatalogRow);
  if (catalogRows.some((row) => !row)) return null;

  const labels = new Map<string, string>();
  for (const value of labelValue) {
    if (!isRecord(value) || !nonEmptyString(value.tag_key) || !nonEmptyString(value.label)) return null;
    if (labels.has(value.tag_key)) return null;
    labels.set(value.tag_key, value.label);
  }

  const rows = catalogRows as CatalogRow[];
  const byKey = new Map(rows.map((row) => [row.tagKey, row]));
  if (byKey.size !== rows.length || rows.some((row) => !labels.has(row.tagKey))) return null;

  const categories: Record<SocialInterestNamespace, SocialInterestCategory[]> = { general: [], food: [] };
  for (const categoryRow of rows.filter((row) => row.depth === 0)) {
    if (categoryRow.parentKey !== null || categoryRow.selectable) return null;
    const options: SocialInterestOption[] = [];
    for (const optionRow of rows.filter((row) => row.parentKey === categoryRow.tagKey)) {
      if (optionRow.depth !== 1 || optionRow.namespace !== categoryRow.namespace) return null;
      options.push(Object.freeze({
        tagKey: optionRow.tagKey,
        label: labels.get(optionRow.tagKey) as string,
        namespace: optionRow.namespace,
        active: optionRow.active,
        selectable: optionRow.selectable,
        displayOrder: optionRow.displayOrder
      }));
    }
    options.sort(compareDisplayOrder);
    categories[categoryRow.namespace].push(Object.freeze({
      tagKey: categoryRow.tagKey,
      label: labels.get(categoryRow.tagKey) as string,
      namespace: categoryRow.namespace,
      displayOrder: categoryRow.displayOrder,
      options: Object.freeze(options)
    }));
  }
  categories.general.sort(compareDisplayOrder);
  categories.food.sort(compareDisplayOrder);

  const children = rows.filter((row) => row.depth === 1);
  if (children.some((row) => !row.parentKey || !byKey.has(row.parentKey))) return null;

  const selected: Record<SocialInterestNamespace, string[]> = { general: [], food: [] };
  const seen = new Set<string>();
  for (const value of selectionValue) {
    if (!isRecord(value) || !nonEmptyString(value.tag_key) || !isNamespace(value.namespace) || seen.has(value.tag_key)) return null;
    const catalog = byKey.get(value.tag_key);
    if (!catalog || catalog.namespace !== value.namespace || !catalog.selectable || catalog.depth !== 1) return null;
    seen.add(value.tag_key);
    selected[value.namespace].push(value.tag_key);
  }
  for (const namespace of ["general", "food"] as const) {
    selected[namespace].sort((left, right) => compareDisplayOrder(byKey.get(left) as CatalogRow, byKey.get(right) as CatalogRow));
    if (selected[namespace].length > SOCIAL_INTEREST_LIMITS[namespace]) return null;
  }

  return Object.freeze({
    categories: Object.freeze({ general: Object.freeze(categories.general), food: Object.freeze(categories.food) }),
    selected: freezeSelection(selected)
  });
}

function parseSavePayload(value: unknown): SocialInterestSettingsSaveResult | null {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== "food_tag_keys,general_tag_keys") return null;
  const general = parseUniqueStringArray(value.general_tag_keys, SOCIAL_INTEREST_LIMITS.general);
  const food = parseUniqueStringArray(value.food_tag_keys, SOCIAL_INTEREST_LIMITS.food);
  if (!general || !food) return null;
  return Object.freeze({ generalTagKeys: Object.freeze(general), foodTagKeys: Object.freeze(food) });
}

function parseCatalogRow(value: unknown): CatalogRow | null {
  if (!isRecord(value) || !nonEmptyString(value.tag_key) || !isNamespace(value.namespace)) return null;
  if (value.parent_key !== null && !nonEmptyString(value.parent_key)) return null;
  if (value.depth !== 0 && value.depth !== 1) return null;
  if (typeof value.selectable !== "boolean" || typeof value.active !== "boolean") return null;
  if (!Number.isInteger(value.display_order) || (value.display_order as number) < 0) return null;
  return Object.freeze({
    tagKey: value.tag_key,
    namespace: value.namespace,
    parentKey: value.parent_key,
    depth: value.depth,
    selectable: value.selectable,
    displayOrder: value.display_order as number,
    active: value.active
  });
}

function parseUniqueStringArray(value: unknown, maximum: number): string[] | null {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) => !nonEmptyString(item))) return null;
  const items = value as string[];
  return new Set(items).size === items.length ? [...items] : null;
}

function freezeSelection(value: Record<SocialInterestNamespace, string[]>) {
  return Object.freeze({ general: Object.freeze([...value.general]), food: Object.freeze([...value.food]) });
}

function compareDisplayOrder(left: { displayOrder: number; tagKey: string }, right: { displayOrder: number; tagKey: string }) {
  return left.displayOrder - right.displayOrder || left.tagKey.localeCompare(right.tagKey);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNamespace(value: unknown): value is SocialInterestNamespace {
  return value === "general" || value === "food";
}
