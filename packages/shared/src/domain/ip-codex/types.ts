// IP／吉祥物圖鑑＋比例尺 — canonical domain model.
//
// Series-first collectible codex: an IP has many Series; a Series has many SeriesEntry rows; each
// SeriesEntry is one collectible appearance of a Character inside that Series. Character identity is
// deliberately separate from Series membership (no `Character.seriesId`) because the same Character
// must be able to appear in multiple Series over time (a seasonal release, a crossover, a reprint)
// with its own artwork, relative scale and physical dimensions per appearance.
//
// Five distinct size concepts exist in this domain and must never collapse into one `size` field:
//   A. CodexRelativeScale      — dimensionless, Series-scoped comparison ratio
//   B. CodexPhysicalDimensions — the real product's physical size, once one exists
//   C. UI display size          — a rendering-layer concern; not part of this domain model at all
//   D. CodexAssetResolution     — the source image's intrinsic pixel dimensions
//   E. CodexVisualBounds        — normalized inset locating the visual subject within the asset canvas

export type CodexEntityStatus = "active" | "planned" | "archived";

export type CodexAssetViewType = "front" | "back" | "left" | "right" | "three-quarter" | "detail";

/** D. The asset's own intrinsic pixel resolution — never a stand-in for physical or display size. */
export interface CodexAssetResolution {
  readonly width: number;
  readonly height: number;
}

/**
 * E. Normalized (0..1) inset from each edge of the asset canvas locating the actual visual subject,
 * for art that carries transparent padding. A relative-scale comparison must anchor on the visual
 * subject, not the raw canvas, once bounds are known; omitted means "not yet measured."
 */
export interface CodexVisualBounds {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface CodexAsset {
  readonly id: string;
  /** Opaque asset key resolved to a real image source by the platform-specific asset registry. */
  readonly path: string;
  readonly viewType: CodexAssetViewType;
  readonly altText: string;
  readonly resolution?: CodexAssetResolution;
  readonly visualBounds?: CodexVisualBounds;
}

/** A. Dimensionless comparison ratio, meaningful only against other entries in the same Series. Must be > 0. */
export type CodexRelativeScale = number;

export type CodexDimensionUnit = "mm" | "cm";

/** B. The real product's physical size. Unknown until a formal product exists — never guessed. */
export interface CodexPhysicalDimensions {
  readonly height: number;
  readonly width?: number;
  readonly depth?: number;
  readonly unit: CodexDimensionUnit;
}

export interface CodexIp {
  readonly id: string;
  readonly displayName: string;
  readonly status: CodexEntityStatus;
  readonly description?: string;
  readonly primaryAsset?: CodexAsset;
}

/** Character identity. Intentionally carries no `seriesId` — see module header. */
export interface CodexCharacter {
  readonly id: string;
  readonly ipId: string;
  readonly displayName: string;
  readonly status: CodexEntityStatus;
  readonly description?: string;
  readonly canonicalAsset?: CodexAsset;
}

/** A collectible Series — the primary Consumer navigation entity (Series-first UX). */
export interface CodexSeries {
  readonly id: string;
  readonly ipId: string;
  readonly displayName: string;
  readonly coverAsset: CodexAsset;
  readonly status: CodexEntityStatus;
  readonly description?: string;
  readonly sortOrder?: number;
}

/** One collectible appearance of a Character inside a Series — the core catalog unit. */
export interface CodexSeriesEntry {
  readonly id: string;
  readonly seriesId: string;
  readonly characterId: string;
  readonly primaryAsset: CodexAsset;
  readonly status: CodexEntityStatus;
  readonly displayName?: string;
  readonly description?: string;
  readonly referenceAssets?: readonly CodexAsset[];
  readonly relativeScale?: CodexRelativeScale;
  readonly physicalDimensions?: CodexPhysicalDimensions;
  readonly sortOrder?: number;
}

export interface CodexCatalog {
  readonly ips: readonly CodexIp[];
  readonly characters: readonly CodexCharacter[];
  readonly series: readonly CodexSeries[];
  readonly entries: readonly CodexSeriesEntry[];
}
