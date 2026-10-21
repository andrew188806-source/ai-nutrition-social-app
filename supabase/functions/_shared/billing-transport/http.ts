// ENT-F2 small HTTP helpers shared by the three billing entrypoints. Generic bodies only: no echo of a payload, subject, owner, id or secret.
export function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
export const unavailableResponse = (): Response => jsonResponse(503, { status: "unavailable" });

// Reads at most `max` bytes of the ACTUAL body stream. The declared Content-Length is only an early refusal; it is never trusted to bound the read (a missing, wrong or understated header cannot make this read more than `max`).
// Returns null when the body is larger than `max`.
export async function readCappedBody(request: Request, max: number): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > max)) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) { await reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out;
}

// Constant-time comparison over the full length of the expected secret; a different length is rejected without comparing characters.
export function secretMatches(expected: string, presented: string | null): boolean {
  if (!presented || presented.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ presented.charCodeAt(index);
  }
  return difference === 0;
}
