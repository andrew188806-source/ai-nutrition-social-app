// SYNTHETIC TEST ONLY. Never imported by Mobile, Edge, deployment migration or seed.
import { createHash } from "node:crypto";
export const FIXTURE_DOCUMENTS = Object.freeze([
  ["membership-terms", "membership_terms_acceptance"], ["privacy-policy", "privacy_policy_acknowledgment"], ["ai-training-terms", "ai_model_training_and_service_improvement"]
].map(([documentId, consentType]) => { const content = `SYNTHETIC DISPOSABLE PC2 TEST DOCUMENT ${documentId}; NOT OWNER APPROVED LEGAL TEXT`; return Object.freeze({ documentId, consentType, version: "synthetic-v1", content, contentSha256: createHash("sha256").update(content).digest("hex") }); }));
export const FIXTURE_BUNDLE = Object.freeze({ bundleVersion: "synthetic-disposable-pc2-v1", locale: "zh-TW", documents: FIXTURE_DOCUMENTS });
export const presented = (trainingOnly = false) => FIXTURE_DOCUMENTS.filter((d) => !trainingOnly || d.documentId === "ai-training-terms").map(({ documentId, version, contentSha256 }) => ({ documentId, version, contentSha256 })).sort((a, b) => a.documentId.localeCompare(b.documentId));
export async function activateDisposableFixture(db) {
  for (const d of FIXTURE_DOCUMENTS) {
    await db.query("insert into consumer_internal.document_versions(document_id,version,locale,consent_type,content_text,content_sha256) values($1,$2,'zh-TW',$3,$4,$5)", [d.documentId, d.version, d.consentType, d.content, d.contentSha256]);
    await db.query("insert into consumer_internal.document_approvals(document_id,version,locale,content_sha256,approval_reference,approved_at,publication_sha256,effective_at) values($1,$2,'zh-TW',$3,'SYNTHETIC-LOCAL-TEST-ONLY','2020-01-01',$3,'2020-01-02')", [d.documentId, d.version, d.contentSha256]);
  }
  await db.query("insert into consumer_internal.required_bundles(bundle_version,locale,terms_version,privacy_version,training_version,effective_at) values($1,'zh-TW','synthetic-v1','synthetic-v1','synthetic-v1','2020-01-02')", [FIXTURE_BUNDLE.bundleVersion]);
  await db.query("update consumer_internal.rollout_state set enforcing=true,bundle_version=$1", [FIXTURE_BUNDLE.bundleVersion]);
}
