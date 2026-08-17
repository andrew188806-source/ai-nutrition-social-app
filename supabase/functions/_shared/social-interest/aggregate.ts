// SR-2C-R1 canonical interest aggregation and compact-card derivation.
//
// Pure and deterministic: no clock, no randomness, no network, no database, no Taste, no ranking.
// The single ordering authority is the catalog's display_order, carried through the projection.

import {
  SOCIAL_INTEREST_COMPACT_VISIBLE,
  type SocialCompactInterestLine,
  type SocialCompactInterests,
  type SocialInterestRow,
  type SocialInterestTag,
  type SocialProfileInterestCategories,
  type SocialProfileInterests
} from "./types.ts";

// Rows arrive already ordered by the projection, but sorting here makes the helper independent of
// that guarantee: a caller assembling rows from anywhere still gets the canonical order.
function ordered(rows: readonly SocialInterestRow[]): readonly SocialInterestRow[] {
  return [...rows].sort((left, right) =>
    left.display_order - right.display_order || left.tag_key.localeCompare(right.tag_key));
}

function tagsOf(rows: readonly SocialInterestRow[], namespace: string): readonly SocialInterestTag[] {
  return Object.freeze(
    ordered(rows.filter((row) => row.namespace === namespace)).map((row) =>
      Object.freeze({ tagKey: row.tag_key, categoryKey: row.category_key }))
  );
}

// The complete fine-grained selections. Never truncated: the compact card's three-category limit is
// a presentation constraint applied later and separately.
export function collectProfileInterests(
  rows: readonly SocialInterestRow[]
): SocialProfileInterests {
  return Object.freeze({
    publicInterestTags: tagsOf(rows, "general"),
    foodInterestTags: tagsOf(rows, "food")
  });
}

// Unique top-level categories in catalog display order. Two fine tags under one category collapse to
// a single entry, so a duplicate top category is not representable.
function uniqueCategories(tags: readonly SocialInterestTag[]): readonly string[] {
  const seen = new Set<string>();
  const categories: string[] = [];
  for (const tag of tags) {
    if (seen.has(tag.categoryKey)) continue;
    seen.add(tag.categoryKey);
    categories.push(tag.categoryKey);
  }
  return Object.freeze(categories);
}

export function aggregateInterestCategories(
  interests: SocialProfileInterests
): SocialProfileInterestCategories {
  return Object.freeze({
    publicInterestCategories: uniqueCategories(interests.publicInterestTags),
    foodInterestCategories: uniqueCategories(interests.foodInterestTags)
  });
}

// One compact line: the first three categories plus a derived overflow count. Nothing here is
// persisted, and the caller still holds the complete category list and the complete fine tags.
function compactLine(categories: readonly string[]): SocialCompactInterestLine {
  return Object.freeze({
    visibleCategories: Object.freeze(categories.slice(0, SOCIAL_INTEREST_COMPACT_VISIBLE)),
    overflowCount: Math.max(categories.length - SOCIAL_INTEREST_COMPACT_VISIBLE, 0)
  });
}

export function deriveCompactInterests(
  categories: SocialProfileInterestCategories
): SocialCompactInterests {
  return Object.freeze({
    publicInterests: compactLine(categories.publicInterestCategories),
    foodInterests: compactLine(categories.foodInterestCategories)
  });
}
