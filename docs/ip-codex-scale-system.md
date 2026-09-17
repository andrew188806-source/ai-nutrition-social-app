# IP／吉祥物圖鑑＋比例尺系統（Phase 1）

Series-first collectible codex for TastKind's own IP/mascot line, consumed by `apps/mobile`. No
formal product exists yet — this document covers the domain model, the DEMO dataset that exercises
it today, and the exact contract a real product batch must satisfy to go live with **no further
architecture changes**.

## Canonical UX: Series-first, not Character-first

```
圖鑑首頁 (Series Gallery)
  → 選擇 Series
    → Series Detail (entries in that Series + scale comparison)
      → 點擊 Entry
        → Series Entry Detail
```

The primary mental model is "what series do I have, and what's in it" — **not** "here's a
character, which products is it in." A Character screen is not part of this phase.

## Domain model

Source: `packages/shared/src/domain/ip-codex/` (barrel: `IpCodexDomain` namespace export from
`@haocu/shared`).

```
CodexIp
 └─ CodexCharacter (ipId, NO seriesId — identity only)
 └─ CodexSeries (ipId)
     └─ CodexSeriesEntry (seriesId, characterId, primaryAsset, relativeScale?, physicalDimensions?)
```

**`CodexCharacter` deliberately carries no `seriesId`.** The same Character must be able to appear
in multiple Series over time (a seasonal drop, a crossover, a reprint), each appearance with its own
artwork, relative scale, physical dimensions and description. `CodexSeriesEntry` is the join row that
represents one such appearance — it is the actual "collectible unit," not `CodexCharacter`.

`packages/shared/src/domain/ip-codex/validate.ts` — `validateCodexCatalog(catalog)` — is the single
authority for catalog integrity: unique IDs, valid Series/Character references, no orphan entries,
`relativeScale > 0`, `physicalDimensions` components `> 0`, valid dimension units, and (as a positive
invariant, not just an absence-of-error) that at least one Character actually appears in more than
one Series. `scripts/ip-codex-catalog-validate.mjs` (`npm run test:ip-codex-catalog`) runs it against
the live dataset plus an asset-path-resolvability cross-check against the mobile asset registry.

`packages/shared/src/domain/ip-codex/queries.ts` has the read helpers every screen uses:
`listSeries`, `getSeries`, `listEntriesForSeries`, `getSeriesEntry`, `getCharacter`,
`listOtherAppearances`, `entryCountForSeries`.

## Five size concepts — never merge them into one `size` field

| Concept | Type | Meaning |
|---|---|---|
| A. 相對比例 | `CodexSeriesEntry.relativeScale?: number` | Dimensionless, meaningful only against other entries in the *same* Series. `1.0` is an arbitrary baseline, not a real unit. |
| B. 實體尺寸 | `CodexSeriesEntry.physicalDimensions?: { height, width?, depth?, unit: "mm"\|"cm" }` | The real product's physical size. `undefined` until a formal product exists — never guessed or defaulted. |
| C. UI 顯示尺寸 | `CodexDisplayVariant` (`"thumbnail" \| "compact" \| "card" \| "detail" \| "hero"`) in `apps/mobile/features/ip-codex/CodexAssetImage.tsx` | Pure rendering-layer token. Not part of the domain model at all. |
| D. Pixel resolution | `CodexAsset.resolution?: { width, height }` | The source image file's own intrinsic pixel size. |
| E. Visual bounds | `CodexAsset.visualBounds?: { top, right, bottom, left }` (normalized 0..1) | Locates the actual visual subject inside a canvas that carries transparent padding, so a scale comparison can eventually anchor on the subject rather than the raw canvas. Present today as DEMO/estimated values on every mock asset — architecture supports it; no asset has been precisely measured yet. |

## Asset contract

`CodexAsset { id, path, viewType, altText, resolution?, visualBounds? }`. `path` is an **opaque
domain-layer key** — the domain package (`packages/shared`) never imports React Native or holds a
`require()` result. Only `apps/mobile/features/ip-codex/assetRegistry.ts` knows how a `path` string
resolves to real image bytes (`resolveCodexAssetSource`, `isResolvableCodexAssetPath`). A future
platform (web, admin tooling) implements its own registry against the same `path` keys without
touching the domain layer.

`viewType` is `"front" | "back" | "left" | "right" | "three-quarter" | "detail"` — present now so a
future closed-set visual-recognition pipeline has multi-angle reference images to train against.
`referenceAssets?: CodexAsset[]` on a `CodexSeriesEntry` holds any of those beyond the primary image.
**No recognition pipeline is implemented in this phase.**

## Rendering: `CodexAssetImage`

The single shared renderer (`apps/mobile/features/ip-codex/CodexAssetImage.tsx`). Never stretches:
the container keeps the asset's own aspect ratio (`resolution.width / resolution.height`, falling
back to 1:1 when unknown) and the `<Image>` itself is additionally `resizeMode="contain"`. Takes
either a `variant` (fixed UI-size token) or an explicit `scaleHeight` (pixels) — the latter is how
`CodexScaleComparison.tsx` renders `relativeScale` proportionally against one shared baseline height,
never uniformly resizing every entry to the same height.

## DEMO dataset — clearly labelled, never mistaken for real data

`packages/shared/src/domain/ip-codex/mockData.ts`, flagged by `CODEX_MOCK_DATA_LABEL = "DEMO"` and
every id prefixed `demo-`, every display name wrapped `〔DEMO〕`. 1 IP, 8 Characters, 3 Series, 14
Series Entries. Deliberately **6 of the 8 Characters appear in two different Series** each with a
different `relativeScale`/description, so the many-to-many Character↔Series relationship is actually
exercised, not just declared possible — this is asserted by the validator (§ above), not merely
hoped true. Some entries carry `physicalDimensions`, some deliberately omit it, to exercise both the
"has real dimensions" and "dimensions unknown" render paths in Entry Detail.

Art is reused from `apps/mobile/assets/mascots/*.png` purely for image bytes — **not** through that
directory's own system. Those 8 files back a separate, frozen, already-shipped feature
(`SystemMascot` / `mascotAvatarKey`, a personality-avatar picker for anonymous community profiles;
see `apps/mobile/theme/components.tsx`, `apps/mobile/features/community-card-settings/`). The Codex
domain layer and `assetRegistry.ts` import raw file bytes only and never reference `SystemMascot`,
`mascotAvatarKey`, or any type from that system. Reusing the word **"mascot"** for the new domain was
deliberately avoided for this reason — everything here is named `Codex*` / `Series*` / `Character`.

## Screens (`apps/mobile/app/codex/**`)

- `codex/index.tsx` — Series Gallery. Cover art, name, entry count per Series.
- `codex/[seriesId]/index.tsx` — Series Detail: hero art, `CodexScaleComparison` (all entries, shared
  baseline), entry grid.
- `codex/[seriesId]/[entryId].tsx` — Series Entry Detail: full art, Series name, Character name (only
  shown if distinct from the entry's own display name), relative scale, physical dimensions (or an
  explicit "尚未提供" fallback line — never a blank or fabricated value), description, and an
  optional "也出現在其他系列" row driven by `listOtherAppearances`.

Entry point: `apps/mobile/app/me.tsx`'s new "IP 圖鑑" row (a `〔示範資料〕` badge, matching the
existing "我做的料理" not-yet-real-feature pattern already used on that screen).

Routing follows the existing Expo Router convention exactly (`meal-buddy-candidate-profile/[x].tsx`
etc.) — explicit `<Stack.Screen>` entries were added to `apps/mobile/app/_layout.tsx`.

## Formal product data onboarding contract

Once real product data exists, only data/asset work is required — **no page, route, renderer, or
domain type should need to change.**

**Series — required:** id, name, cover asset, IP relationship. *Recommended:* description, sortOrder.

**Character — required:** id, name, IP relationship. *Recommended:* canonical asset, description.

**Series Entry — required:** id, Series id, Character id, primary image, display name.
*Recommended:* relativeScale, physicalDimensions, description, sortOrder, additional reference
images. *Optional / future:* variant, edition, release metadata, recognition metadata (multiple
`viewType` reference assets, precisely measured `visualBounds`).

**Rollout steps:** import/author Series → import or reuse Characters → create Series Entries → attach
real assets → fill `relativeScale` → fill `physicalDimensions` where a real product exists → attach
additional reference images → set `CODEX_MOCK_DATA_LABEL`-gated demo dataset to unused / remove the
mock import from the screens.

## Explicitly out of scope this phase

Ownership, collection-binding, permanent QR ownership, Product Instance ownership, ownership
transfer, secondhand trading, marketplace, wallet, platform points, restaurant points, payment,
commerce, full AI visual-recognition runtime, Restaurant/Admin codex management tooling. See the
governing brief for the full list — all Post-MVP or a later phase.

## Database policy

No new table or migration was added. Per the governing brief's explicit instruction, this phase uses
a local/static typed catalog registry (`mockData.ts`) rather than provisioning persistence ahead of
a real product existing. If a future phase needs live/admin-editable catalog data, that is a new,
separately-authorized round — not an extension of this one.
