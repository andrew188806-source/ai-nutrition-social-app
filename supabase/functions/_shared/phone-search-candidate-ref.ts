import type { SocialCandidateRefCipher, SocialCandidateRefClaims } from "./social-candidate-ref/types.ts";
import { SOCIAL_CANDIDATE_REF_CONTRACT_ERROR } from "./social-candidate-ref/policy.ts";

// Auth UUIDs cannot have this value. AES-GCM AAD authenticates the server-selected phone source.
// Keep the frozen scr1 envelope/key/TTL unchanged; no client DTO can choose a source.
const phoneActor = (actor: string): string => "friend-phone-search-v1|" + actor;

export function sealPhoneSearchCandidateRef(
  cipher: SocialCandidateRefCipher, actor: string, target: string, now: Date
): Promise<string> {
  return cipher.seal(phoneActor(actor), target, now);
}

export async function openInviteCandidateRef(
  cipher: SocialCandidateRefCipher, actor: string, token: string, now: Date
): Promise<Readonly<{ claims: SocialCandidateRefClaims; phoneSearch: boolean }>> {
  try {
    return Object.freeze({ claims: await cipher.open(actor, token, now), phoneSearch: false });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== SOCIAL_CANDIDATE_REF_CONTRACT_ERROR) throw error;
  }
  return Object.freeze({ claims: await cipher.open(phoneActor(actor), token, now), phoneSearch: true });
}
