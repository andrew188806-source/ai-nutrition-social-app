import { generateSecureUuidV4 } from "../consumer-runtime/secureUuidProvider";
import { storage } from "../../lib/storage";
import { MEAL_BUDDY_PUSH_INSTALL_STORAGE_KEY } from "./types";

// The per-INSTALLATION identity. It deliberately identifies the app installation and never the
// person: it is minted before anybody signs in, survives sign-out, and is reused by whichever
// account is signed in so that one handset holds one registration rather than accumulating them.
// It is not a secret and carries no Social meaning, so keeping it on the device is safe.
export function resolveMealBuddyPushInstallId(): string {
  const existing = storage.getItem(MEAL_BUDDY_PUSH_INSTALL_STORAGE_KEY);
  if (typeof existing === "string" && /^[A-Za-z0-9-]{8,200}$/.test(existing)) return existing;
  const created = generateSecureUuidV4();
  storage.setItem(MEAL_BUDDY_PUSH_INSTALL_STORAGE_KEY, created);
  return created;
}
