import {
  parseGeocodeCoordinate,
  type GeocodeProviderOutcome,
  type RestaurantGeocodeProvider
} from "./types.ts";

// GEO-1C-P0 deterministic mock geocoder.
//
// WHY A MOCK IS THE WHOLE PROVIDER STORY THIS ROUND. No real geocoder is integrated, because
// durable storage rights for a vendor's returned coordinates are unsettled and this schema
// persists coordinates canonically. The mock exists to prove the LIFECYCLE end to end — claim,
// resolve, fail, invalidate, reject-stale — without committing the product to a vendor or to a
// licence it has not agreed.
//
// IT NEVER INVENTS A PLAUSIBLE LOCATION. A mock coordinate that looked like a real Taipei address
// would eventually be mistaken for one. Instead a known fixture address maps to a coordinate that
// is declared, and everything else fails with `provider_no_match`, which is exactly the negative
// case a synthetic address should produce.
export const MOCK_GEOCODE_PROVIDER_NAME = "mock" as const;

// Fixture addresses only. The key is the composed canonical address the database produced, so this
// table is meaningful only against known Development fixtures and resolves nothing else.
const FIXTURES: ReadonlyMap<string, Readonly<{ latitude: number; longitude: number; ref: string }>> =
  new Map([
    ["台北市 松山區 南京東路三段 100 號", { latitude: 25.052100, longitude: 121.543900, ref: "mock-fixture-nanjing" }],
    ["台北市 大安區 信義路四段 200 號", { latitude: 25.033200, longitude: 121.552800, ref: "mock-fixture-xinyi" }]
  ]);

export function createMockRestaurantGeocodeProvider(): RestaurantGeocodeProvider {
  return Object.freeze({
    name: MOCK_GEOCODE_PROVIDER_NAME,
    resolve(sourceAddress: string): Promise<GeocodeProviderOutcome> {
      const fixture = FIXTURES.get(sourceAddress.trim());
      if (!fixture) {
        // An address this mock does not know is not an error in the pipeline: it is a genuine
        // no-match, and the branch must end up `failed` with no coordinate.
        return Promise.resolve(Object.freeze({ ok: false, errorCode: "provider_no_match" } as const));
      }
      const coordinate = parseGeocodeCoordinate(fixture.latitude, fixture.longitude);
      if (!coordinate) {
        return Promise.resolve(Object.freeze({ ok: false, errorCode: "provider_invalid_response" } as const));
      }
      return Promise.resolve(Object.freeze({
        ok: true,
        value: Object.freeze({ coordinate, providerRef: fixture.ref })
      } as const));
    }
  });
}
