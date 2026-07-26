// Pure comparison extracted out of useMealPhotoUpload so it's independently testable without a
// React environment. This is the exact rule that protects against a stale upload completion
// overwriting a newer photo's session (analysisRequestId/captureGeneration mismatch) or
// polluting a different actor's state after sign-out/actor switch (actorKey/actorGeneration
// mismatch) — see MI-E-C3 report for the four-way equality rationale.
export type MealPhotoUploadExpectedContext = {
  analysisRequestId: string | null;
  captureGeneration: number;
  actorKey: string | null;
  actorGeneration: number;
};

export function isMealPhotoUploadResultStillCurrent(
  expected: MealPhotoUploadExpectedContext,
  actual: MealPhotoUploadExpectedContext
): boolean {
  return (
    expected.analysisRequestId === actual.analysisRequestId &&
    expected.captureGeneration === actual.captureGeneration &&
    expected.actorKey === actual.actorKey &&
    expected.actorGeneration === actual.actorGeneration
  );
}
