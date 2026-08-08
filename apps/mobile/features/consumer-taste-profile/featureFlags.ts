import type { ConsumerTasteProfileRuntimeFlags } from "./types";

export function getConsumerTasteProfileRuntimeFlags(_env: Record<string, string | undefined> = {}): ConsumerTasteProfileRuntimeFlags {
  return {
    foundationSource: "supabase-prepared",
    foundationActivation: "deferred",
    liveFoundationReadsEnabled: false,
    sourceState: { status: "deferred", evidenceCount: 0, reason: "acl_activation_pending" },
    issues: []
  };
}
