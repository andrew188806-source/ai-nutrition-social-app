import type { RestaurantGeocodeRepository } from "./repository.ts";
import {
  RESTAURANT_GEOCODING_POLICY_VERSION,
  parseGeocodeCoordinate,
  type GeocodeDispatchSummary,
  type RestaurantGeocodeProvider
} from "./types.ts";

// GEO-1C-P0 dispatch service.
//
// Claim a bounded batch, ask the provider about one composed address at a time, and hand the answer
// back with the fingerprint it was claimed under. It decides nothing about staleness or retries:
// the database rejects a stale completion and the claim itself enforces the attempt bound, so this
// service cannot loosen either by accident.
//
// A provider failure is recorded and never fatal. Resolution is operational work; it must not be
// able to take anything else down with it.
export class RestaurantGeocodeDispatchService {
  constructor(
    private readonly repository: RestaurantGeocodeRepository,
    private readonly provider: RestaurantGeocodeProvider
  ) {}

  async dispatch(limit: number, maxAttempts: number): Promise<GeocodeDispatchSummary> {
    const items = await this.repository.claim(limit, maxAttempts);
    let resolved = 0;
    let failed = 0;
    let rejectedStale = 0;

    for (const item of items) {
      let outcome;
      try {
        const answer = await this.provider.resolve(item.sourceAddress);
        if (!answer.ok) {
          outcome = await this.repository.fail(item, answer.errorCode);
        } else {
          // Re-validated at this boundary rather than trusted: a provider adapter is the one part of
          // this pipeline that talks to something outside the system.
          const coordinate = parseGeocodeCoordinate(
            answer.value.coordinate.latitude, answer.value.coordinate.longitude);
          outcome = coordinate === null
            ? await this.repository.fail(item, "provider_invalid_response")
            : await this.repository.complete(
              item, coordinate.latitude, coordinate.longitude,
              this.provider.name, answer.value.providerRef);
        }
      } catch {
        // A provider that throws is a provider that is unavailable. The branch keeps its address
        // and its remaining attempt budget.
        outcome = await this.repository.fail(item, "provider_unavailable");
      }

      if (outcome === "resolved") resolved += 1;
      else if (outcome === "failed") failed += 1;
      else if (outcome === "rejected_stale") rejectedStale += 1;
    }

    return Object.freeze({
      policyVersion: RESTAURANT_GEOCODING_POLICY_VERSION,
      provider: this.provider.name,
      claimed: items.length,
      resolved,
      failed,
      rejectedStale
    });
  }
}
