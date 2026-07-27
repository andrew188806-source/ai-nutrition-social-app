// MI-E-C4: canonical binary-signature detection logic moved to @haocu/shared so Mobile's
// upload-time validation and the Edge Function's server-side revalidation are provably the same
// rule (see MI-E-C4 report §11 for why this was promoted). This file only re-exports — it is not
// a second definition. Behavior is unchanged from MI-E-C3-R1.
export { detectImageSignature, type BinaryImageSignatureMatch } from "@haocu/shared";
