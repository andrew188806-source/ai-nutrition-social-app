import type { Interval, LedgerClass } from "./types.ts";

// Business-fact key of one ledger segment. Mirrors retention_billing.fact_key exactly: a 32-hex prefix of sha256(namespace|subject) (no provider identifier enters the ledger in clear), the class and the exact
// millisecond bounds. The hash function is injected so this module stays free of runtime-specific crypto.
export function factKey(sha256Hex: (utf8: string) => string, namespace: string, subjectRef: string, cls: LedgerClass, segment: Interval): string {
  return `${sha256Hex(`${namespace}|${subjectRef}`).slice(0, 32)}:${cls}:${segment[0]}:${segment[1]}`;
}
