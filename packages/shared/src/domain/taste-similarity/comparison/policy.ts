import { TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION } from "../snapshot";

// TS-3E — the CANONICAL COMPARISON BUNDLE authority.
//
// This version describes the COMPOSITION contract only: which components the bundle carries, how
// their metadata is unified, and how their reason codes are merged. It says nothing about how any
// component scores anything, because this module computes no score.
//
// It therefore moves independently of the three component policies. A component policy bump does not
// bump this one, and this one does not bump any of them — which is exactly the property that lets a
// consumer reason about "the shape I receive" separately from "how each number was produced".
export const TASTE_COMPARISON_BUNDLE_VERSION = "taste-comparison-bundle-v1" as const;

// The only snapshot schema this bundle assembles. Derived from the frozen TS-2 constant, never
// re-declared, so the bundle and the components can never disagree about which schema is supported.
export const TASTE_COMPARISON_SUPPORTED_SNAPSHOT_SCHEMA_VERSION = TASTE_PROFILE_SNAPSHOT_SCHEMA_VERSION;
