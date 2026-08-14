// Compatibility re-export. The implementation moved to the shared server-only auth boundary so
// meal-photo-analysis and SR-1C cannot drift into two independent JWT trust implementations.
export {
  authenticateCaller,
  type AuthenticatedActor,
  type AuthOutcome
} from "../_shared/auth/authenticateCaller.ts";
