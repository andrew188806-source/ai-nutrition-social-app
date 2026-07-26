// UUID-shaped analysisRequestId generator. Matches the well-formed-UUID expectation documented
// on @haocu/shared's buildMealPhotoAnalysisObjectPath (enforced by a future Edge Function, not
// this round). Uses Math.random rather than a crypto CSPRNG — consistent with this repo's
// existing client-side id generators (generateMealId/generatePhotoId in features/calorie-sharing)
// — since this value is a Storage path segment governed by Storage RLS + auth.uid(), not a
// security token or capability secret.
export function generateMealPhotoAnalysisRequestId(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const section = (length: number) => Array.from({ length }, hex).join("");
  const variant = ((Math.floor(Math.random() * 4) + 8) as 8 | 9 | 10 | 11).toString(16);
  return `${section(8)}-${section(4)}-4${section(3)}-${variant}${section(3)}-${section(12)}`;
}
