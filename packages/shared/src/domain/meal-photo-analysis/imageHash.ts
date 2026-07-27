// MI-E-C4: shared so both the Edge Function (server-side revalidation) and this repo's own tests
// compute the identical SHA-256 hex digest via the same code path. Uses the standard Web Crypto
// API (globalThis.crypto.subtle), available natively in both the Deno Edge Runtime and modern
// Node — no extra dependency.
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // crypto.subtle.digest requires an ArrayBuffer-backed view under TypeScript's stricter
  // ArrayBufferView<ArrayBuffer> typing. A plain .slice() over the exact byte range is correct
  // regardless of byteOffset/byteLength and never includes bytes outside the intended view.
  const exact = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", exact);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
