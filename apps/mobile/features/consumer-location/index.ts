// GEO-1B shared Mobile location authority.
//
// The one import surface for every future Geo consumer on the handset. GEO-1B mounts this in no
// screen: GEO-1C (AI recommendation narrowing) and GEO-1D (Meal Buddy narrowing) each decide where
// asking for location is justified, and both consume the SAME acquisition authority rather than
// calling the platform themselves.
//
// The component module is deliberately NOT re-exported here. Adding a `.tsx` export to a feature
// barrel breaks every Node-based harness that loads it, because react-native's entry point is Flow
// source and cannot be required — the frozen SR-2G-E1 barrel learned this the hard way. Screens
// import the component module directly.
export { ConsumerLocationController } from "./controller";
export { createExpoConsumerLocationDevicePort } from "./expoLocationPort";
export { useConsumerLocation } from "./useConsumerLocation";
export {
  CONSUMER_LOCATION_ACCURACY,
  CONSUMER_LOCATION_LATITUDE_MAX,
  CONSUMER_LOCATION_LATITUDE_MIN,
  CONSUMER_LOCATION_LONGITUDE_MAX,
  CONSUMER_LOCATION_LONGITUDE_MIN,
  CONSUMER_LOCATION_POLICY_VERSION,
  parseConsumerLocationPosition
} from "./types";
export type {
  ConsumerLocationDevicePort,
  ConsumerLocationErrorCode,
  ConsumerLocationPermission,
  ConsumerLocationPermissionStatus,
  ConsumerLocationPosition,
  ConsumerLocationState
} from "./types";
