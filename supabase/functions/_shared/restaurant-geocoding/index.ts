// GEO-1C-P0 restaurant geocoding barrel.
//
// The one import surface for coordinate resolution. Recommendation and Social code must never
// import it: resolution is operational work driven by a dispatcher, and a consumer that geocoded at
// request time would be re-deriving an answer the database already owns.
export {
  GEOCODE_LATITUDE_MAX,
  GEOCODE_LATITUDE_MIN,
  GEOCODE_LONGITUDE_MAX,
  GEOCODE_LONGITUDE_MIN,
  RESTAURANT_GEOCODING_POLICY_VERSION,
  parseGeocodeCoordinate
} from "./types.ts";
export type {
  GeocodeCompletionOutcome,
  GeocodeCoordinate,
  GeocodeDispatchSummary,
  GeocodeProviderErrorCode,
  GeocodeProviderOutcome,
  GeocodeProviderResult,
  GeocodeWorkItem,
  RestaurantGeocodeProvider
} from "./types.ts";
export { MOCK_GEOCODE_PROVIDER_NAME, createMockRestaurantGeocodeProvider } from "./mockProvider.ts";
export { ExecutorRestaurantGeocodeRepository, type RestaurantGeocodeRepository } from "./repository.ts";
export { RestaurantGeocodeDispatchService } from "./service.ts";
