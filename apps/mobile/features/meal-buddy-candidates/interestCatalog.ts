// SR-2G-E1 compact interest presentation.
//
// LABELS COME FROM THE CANONICAL CATALOG, NOT FROM MOBILE. SR-2C-R1 made `tag_key` the identity and
// put every localized string in public.social_interest_catalog_label, which `authenticated` may
// already read. This module therefore resolves labels through that one canonical source instead of
// maintaining a second hard-coded key→label map that would silently drift from the server's taxonomy.
//
// The compact model here is PURE PRESENTATION over what SR-2G-D already decided. It never chooses
// which categories are visible, never re-orders them and never recomputes the overflow: the server
// sent at most three keys in canonical catalog order plus a derived remainder, and this module only
// turns that into labels and one "+N" string. The "+N" is built for display and is never persisted,
// transmitted or written back.

export type SupabaseInterestCatalogClientLike = {
  from(table: "social_interest_catalog_label"): {
    select(columns: "tag_key, label"): {
      eq(column: "locale", value: string): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};

export const INTEREST_CATALOG_LABEL_TABLE = "social_interest_catalog_label" as const;
export const INTEREST_CATALOG_LABEL_COLUMNS = "tag_key, label" as const;
export const INTEREST_CATALOG_DEFAULT_LOCALE = "zh-TW" as const;

export type InterestCategoryLabels = ReadonlyMap<string, string>;

export type InterestCatalogOutcome =
  | { ok: true; value: InterestCategoryLabels }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Reads the canonical localized labels once. This is a read of PUBLIC catalog vocabulary — it
// carries no user, no candidate and no interest SELECTION, so it discloses nothing about anybody.
export async function loadInterestCategoryLabels(
  client: SupabaseInterestCatalogClientLike,
  locale: string = INTEREST_CATALOG_DEFAULT_LOCALE
): Promise<InterestCatalogOutcome> {
  let outcome: { data: unknown; error: unknown };
  try {
    outcome = await client
      .from(INTEREST_CATALOG_LABEL_TABLE)
      .select(INTEREST_CATALOG_LABEL_COLUMNS)
      .eq("locale", locale);
  } catch {
    return { ok: false, reason: "interest catalog read failed" };
  }
  if (outcome.error !== null && outcome.error !== undefined) {
    return { ok: false, reason: "interest catalog read returned an error" };
  }
  if (!Array.isArray(outcome.data)) return { ok: false, reason: "interest catalog payload is not an array" };

  const labels = new Map<string, string>();
  for (const row of outcome.data) {
    if (!isRecord(row)) return { ok: false, reason: "interest catalog row is not an object" };
    const { tag_key: tagKey, label } = row;
    if (typeof tagKey !== "string" || tagKey.length === 0) return { ok: false, reason: "interest catalog row has no tag_key" };
    if (typeof label !== "string" || label.length === 0) return { ok: false, reason: "interest catalog row has no label" };
    labels.set(tagKey, label);
  }
  return { ok: true, value: labels };
}

// A key with no catalog label falls back to the key itself rather than to an invented string. A
// missing translation should look like a catalog gap, not like a different category.
export function resolveInterestCategoryLabel(labels: InterestCategoryLabels, categoryKey: string): string {
  return labels.get(categoryKey) ?? categoryKey;
}

export type CompactInterestLine = Readonly<{
  chips: readonly string[];
  overflowLabel: string | null;
}>;

// One visual line: the server's visible categories as labels, plus at most one trailing overflow
// chip. The caller renders this on a single row and lets it truncate; it must never wrap the
// remainder onto a second row, which is precisely what the overflow chip exists to prevent.
export function buildCompactInterestLine(
  categoryKeys: readonly string[],
  overflowCount: number,
  labels: InterestCategoryLabels
): CompactInterestLine {
  const chips = categoryKeys.map((key) => resolveInterestCategoryLabel(labels, key));
  return Object.freeze({
    chips: Object.freeze(chips),
    overflowLabel: overflowCount > 0 ? `+${overflowCount}` : null
  });
}
