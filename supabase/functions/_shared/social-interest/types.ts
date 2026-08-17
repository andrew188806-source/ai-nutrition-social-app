// SR-2C-R1 public Social interest DTOs.
//
// Everything here is PUBLIC, USER-DECLARED presentation data. Nothing in this module is Taste
// similarity, ranking input, Meal Buddy eligibility, inference, health, nutrition, dietary
// restriction or allergy data, and nothing may be re-derived into any of those.

export const SOCIAL_INTEREST_NAMESPACES = Object.freeze(["general", "food"] as const);
export type SocialInterestNamespace = (typeof SOCIAL_INTEREST_NAMESPACES)[number];

// Frozen SR-2C-R1 profile-settings selection limits. Per profile, never per card.
export const SOCIAL_INTEREST_MAX_GENERAL = 8;
export const SOCIAL_INTEREST_MAX_FOOD = 5;

// The compact Meal Buddy card shows at most three top-level categories per namespace on one line.
// This is a PRESENTATION constraint only; canonical selections are never truncated to it.
export const SOCIAL_INTEREST_COMPACT_VISIBLE = 3;

// One row of the interest projection primitive. `category_key` is supplied by the server so a client
// never derives a parent relationship from a localized label.
export type SocialInterestRow = Readonly<{
  exposure_ordinal: number;
  namespace: string;
  tag_key: string;
  category_key: string;
  display_order: number;
}>;

// A single selected fine-grained tag. Identity is the stable key; no surrogate row id exists here.
export type SocialInterestTag = Readonly<{
  tagKey: string;
  categoryKey: string;
}>;

// The complete fine-grained selections for one profile. Absent selections are an empty array —
// never null, never a fabricated default, never an inferred fallback.
export type SocialProfileInterests = Readonly<{
  publicInterestTags: readonly SocialInterestTag[];
  foodInterestTags: readonly SocialInterestTag[];
}>;

// Unique top-level categories, in canonical catalog display order. Used by the compact card.
export type SocialProfileInterestCategories = Readonly<{
  publicInterestCategories: readonly string[];
  foodInterestCategories: readonly string[];
}>;

// One compact card line. `overflowCount` is DERIVED at read time and is never persisted; there is no
// "+N" catalog tag and no stored compact result anywhere.
export type SocialCompactInterestLine = Readonly<{
  visibleCategories: readonly string[];
  overflowCount: number;
}>;

export type SocialCompactInterests = Readonly<{
  publicInterests: SocialCompactInterestLine;
  foodInterests: SocialCompactInterestLine;
}>;
