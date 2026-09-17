import type { CodexAsset, CodexCatalog, CodexCharacter, CodexIp, CodexSeries, CodexSeriesEntry } from "./types";

// ---------------------------------------------------------------------------------------------
// DEMO / MOCK — DEVELOPMENT ONLY.
//
// No formal TastKind product has shipped yet. This dataset exists solely to exercise the Series
// Gallery → Series Detail → Series Entry Detail flow end to end before real product data exists.
// It must never be mistaken for a real catalog: every id is prefixed `demo-`, every displayName
// carries a〔DEMO〕marker, and CODEX_MOCK_DATA_LABEL below is the single flag a consuming screen
// should check before rendering any "this is placeholder data" notice.
//
// Asset art is reused from `apps/mobile/assets/mascots/*` (see the platform asset registry) purely
// as placeholder imagery — those files belong to an unrelated, frozen personality-avatar system
// (`SystemMascot` / `mascotAvatarKey`) and are referenced here only by their raw image bytes, not
// through that system's types or ids. See docs/ip-codex-scale-system.md.
// ---------------------------------------------------------------------------------------------

export const CODEX_MOCK_DATA_LABEL = "DEMO" as const;

const DEMO_VISUAL_BOUNDS = { top: 0.08, right: 0.08, bottom: 0.05, left: 0.08 } as const;
const DEMO_RESOLUTION = { width: 4724, height: 4725 } as const;

function demoAsset(id: string, path: string, displayName: string): CodexAsset {
  return {
    id,
    path,
    viewType: "front",
    altText: `〔DEMO〕${displayName}`,
    resolution: DEMO_RESOLUTION,
    visualBounds: DEMO_VISUAL_BOUNDS
  };
}

export const CODEX_MOCK_IP: CodexIp = {
  id: "demo-ip-tastkind",
  displayName: "〔DEMO〕好廚圖鑑",
  status: "active",
  description: "示範用 IP，尚無正式商品；用於驗證 Series-first 圖鑑架構。"
};

const CHARACTER_SEED: ReadonlyArray<{ id: string; asset: string; name: string; description: string }> = [
  { id: "demo-char-balance", asset: "balance", name: "〔DEMO〕平衡使者", description: "示範角色：均衡飲食主題。" },
  { id: "demo-char-dessert", asset: "dessert", name: "〔DEMO〕甜點精靈", description: "示範角色：甜點主題。" },
  { id: "demo-char-explorer", asset: "explorer", name: "〔DEMO〕探索先鋒", description: "示範角色：新奇料理探索主題。" },
  { id: "demo-char-fastfood", asset: "fastfood", name: "〔DEMO〕速食夥伴", description: "示範角色：速食主題。" },
  { id: "demo-char-latenight", asset: "latenight", name: "〔DEMO〕夜貓子", description: "示範角色：宵夜主題。" },
  { id: "demo-char-lowcarb", asset: "lowcarb", name: "〔DEMO〕輕碳使者", description: "示範角色：低碳飲食主題。" },
  { id: "demo-char-protein", asset: "protein", name: "〔DEMO〕蛋白衛士", description: "示範角色：高蛋白飲食主題。" },
  { id: "demo-char-veggie", asset: "veggie", name: "〔DEMO〕蔬活精靈", description: "示範角色：蔬食主題。" }
];

export const CODEX_MOCK_CHARACTERS: readonly CodexCharacter[] = CHARACTER_SEED.map((seed) => ({
  id: seed.id,
  ipId: CODEX_MOCK_IP.id,
  displayName: seed.name,
  status: "active",
  description: seed.description,
  canonicalAsset: demoAsset(`${seed.id}-canonical`, seed.asset, seed.name.replace("〔DEMO〕", ""))
}));

function character(id: string) {
  const found = CHARACTER_SEED.find((seed) => seed.id === id);
  if (!found) throw new Error(`unknown demo character id: ${id}`);
  return found;
}

export const CODEX_MOCK_SERIES: readonly CodexSeries[] = [
  {
    id: "demo-series-breakfast",
    ipId: CODEX_MOCK_IP.id,
    displayName: "〔DEMO〕早餐系列",
    status: "active",
    description: "示範系列：早餐主題收藏。",
    coverAsset: demoAsset("demo-series-breakfast-cover", "balance", "早餐系列"),
    sortOrder: 0
  },
  {
    id: "demo-series-night-market",
    ipId: CODEX_MOCK_IP.id,
    displayName: "〔DEMO〕夜市系列",
    status: "active",
    description: "示範系列：夜市小吃主題收藏。",
    coverAsset: demoAsset("demo-series-night-market-cover", "latenight", "夜市系列"),
    sortOrder: 1
  },
  {
    id: "demo-series-holiday",
    ipId: CODEX_MOCK_IP.id,
    displayName: "〔DEMO〕聖誕限定系列",
    status: "active",
    description: "示範系列：節慶限定收藏，示範同一角色跨系列出現。",
    coverAsset: demoAsset("demo-series-holiday-cover", "dessert", "聖誕限定系列"),
    sortOrder: 2
  }
];

function entry(params: {
  id: string;
  seriesId: string;
  characterId: string;
  relativeScale?: number;
  dimensions?: { height: number; width?: number; depth?: number; unit: "mm" | "cm" };
  sortOrder: number;
}): CodexSeriesEntry {
  const seed = character(params.characterId);
  return {
    id: params.id,
    seriesId: params.seriesId,
    characterId: params.characterId,
    displayName: seed.name,
    description: seed.description,
    status: "active",
    primaryAsset: demoAsset(`${params.id}-primary`, seed.asset, seed.name.replace("〔DEMO〕", "")),
    relativeScale: params.relativeScale,
    physicalDimensions: params.dimensions,
    sortOrder: params.sortOrder
  };
}

export const CODEX_MOCK_ENTRIES: readonly CodexSeriesEntry[] = [
  // 早餐系列 — five entries; two (explorer, protein) also reappear below in other Series.
  entry({ id: "demo-entry-breakfast-balance", seriesId: "demo-series-breakfast", characterId: "demo-char-balance", relativeScale: 1.0, dimensions: { height: 80, width: 45, depth: 30, unit: "mm" }, sortOrder: 0 }),
  entry({ id: "demo-entry-breakfast-veggie", seriesId: "demo-series-breakfast", characterId: "demo-char-veggie", relativeScale: 0.85, dimensions: { height: 68, width: 40, depth: 28, unit: "mm" }, sortOrder: 1 }),
  entry({ id: "demo-entry-breakfast-protein", seriesId: "demo-series-breakfast", characterId: "demo-char-protein", relativeScale: 1.2, dimensions: { height: 96, width: 50, depth: 34, unit: "mm" }, sortOrder: 2 }),
  entry({ id: "demo-entry-breakfast-explorer", seriesId: "demo-series-breakfast", characterId: "demo-char-explorer", relativeScale: 1.05, sortOrder: 3 }),
  entry({ id: "demo-entry-breakfast-dessert", seriesId: "demo-series-breakfast", characterId: "demo-char-dessert", relativeScale: 0.9, sortOrder: 4 }),

  // 夜市系列 — five entries; explorer and protein reappear here with DIFFERENT scale/description
  // from their 早餐系列 appearance above, proving Character identity is independent of Series entry.
  entry({ id: "demo-entry-night-market-latenight", seriesId: "demo-series-night-market", characterId: "demo-char-latenight", relativeScale: 1.0, dimensions: { height: 88, width: 48, depth: 32, unit: "mm" }, sortOrder: 0 }),
  entry({ id: "demo-entry-night-market-fastfood", seriesId: "demo-series-night-market", characterId: "demo-char-fastfood", relativeScale: 1.3, dimensions: { height: 104, width: 55, depth: 38, unit: "mm" }, sortOrder: 1 }),
  entry({ id: "demo-entry-night-market-explorer", seriesId: "demo-series-night-market", characterId: "demo-char-explorer", relativeScale: 0.78, sortOrder: 2 }),
  entry({ id: "demo-entry-night-market-lowcarb", seriesId: "demo-series-night-market", characterId: "demo-char-lowcarb", relativeScale: 1.1, sortOrder: 3 }),
  entry({ id: "demo-entry-night-market-protein", seriesId: "demo-series-night-market", characterId: "demo-char-protein", relativeScale: 1.4, sortOrder: 4 }),

  // 聖誕限定系列 — four entries, all four characters reappear from earlier Series (dessert,
  // balance, veggie, latenight), each with its own limited-edition scale here.
  entry({ id: "demo-entry-holiday-dessert", seriesId: "demo-series-holiday", characterId: "demo-char-dessert", relativeScale: 1.5, dimensions: { height: 112, width: 58, depth: 40, unit: "mm" }, sortOrder: 0 }),
  entry({ id: "demo-entry-holiday-balance", seriesId: "demo-series-holiday", characterId: "demo-char-balance", relativeScale: 1.1, sortOrder: 1 }),
  entry({ id: "demo-entry-holiday-veggie", seriesId: "demo-series-holiday", characterId: "demo-char-veggie", relativeScale: 0.95, sortOrder: 2 }),
  entry({ id: "demo-entry-holiday-latenight", seriesId: "demo-series-holiday", characterId: "demo-char-latenight", relativeScale: 1.25, sortOrder: 3 })
];

export const CODEX_MOCK_CATALOG: CodexCatalog = {
  ips: [CODEX_MOCK_IP],
  characters: CODEX_MOCK_CHARACTERS,
  series: CODEX_MOCK_SERIES,
  entries: CODEX_MOCK_ENTRIES
};
