// TastKind actor-bound dispatch for the meal write RPCs — PURE module (no SDK import).
//
// Problem (measured): the identity that signs a request is chosen INSIDE the Supabase SDK
// (`fetchWithAuth` -> getSession) after every runtime check. A runtime owner/generation check can pass
// and the request can still go out under another account.
//
// Contract:
//   * The rpc proxy tags each guarded call with the operation owner the runtime registered for that
//     operation key (`x-tastkind-expected-user`); an unregistered key is tagged `__unbound__`.
//   * The fetch guard is installed as the SDK client's `global.fetch`, i.e. the INNER fetch that sees the
//     final Authorization header. It compares the bearer token's `sub` with the tag in the same
//     synchronous step that forwards the very same headers: the token that was verified is the token that
//     is sent. Mismatch, anon key, undecodable token, `__unbound__`, wrong target or wrong RPC => a
//     synthetic 409 `TKACT0` response and NO network call.
//   * The tag is stripped before forwarding and never reaches the server. Requests without the tag are
//     passed through untouched (Auth, Storage, other RPCs keep their behaviour).
//   * Decoding the token here is a client identity-consistency check only. It does not verify the token
//     and does not replace server JWT validation or any authority.

export const ACTOR_BINDING_HEADER = "x-tastkind-expected-user";
export const ACTOR_BINDING_UNBOUND = "__unbound__";
export const ACTOR_BINDING_MISMATCH_CODE = "TKACT0";
export const ACTOR_BINDING_MISMATCH_MESSAGE = "ACTOR_BINDING_MISMATCH";

export const ACTOR_BOUND_RPC_NAMES: readonly string[] = [
  "create_current_user_meal_record",
  "create_current_user_meal_record_v2",
  "finalize_current_user_meal_identification_v1"
];

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64UrlToUtf8(input: string): string | null {
  const clean = input.replace(/=+$/, "");
  if (!/^[A-Za-z0-9_-]*$/.test(clean) || clean.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | BASE64URL.indexOf(clean.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b >= 0xc0 && b < 0xe0 && i < bytes.length) out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i++] & 0x3f));
    else if (b >= 0xe0 && b < 0xf0 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i] & 0x3f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if (b >= 0xf0 && i + 2 < bytes.length) {
      const cp = ((b & 0x07) << 18) | ((bytes[i] & 0x3f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      i += 3;
      const v = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    } else return null;
  }
  return out;
}

// `Authorization: Bearer <jwt>` -> the `sub` claim, or null when absent/unparseable.
export function decodeBearerSubject(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  if (!match) return null;
  const parts = match[1].split(".");
  if (parts.length < 2) return null;
  const json = base64UrlToUtf8(parts[1]);
  if (json === null) return null;
  try {
    const claims = JSON.parse(json) as { sub?: unknown };
    return typeof claims.sub === "string" && claims.sub ? claims.sub : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Registry + rpc proxy
// ---------------------------------------------------------------------------------------------

// Local observation of one attempt (R-11, 2026-10-08): the guard records the idempotency key of every request it refuses (such a
// request never reaches the network). The registry records whether the SDK's rpc method was called for an operation at all. Neither
// is an error code or a message: they are what this device actually did, so they can PROVE "not dispatched". Bounded, in memory,
// single JS context (same assumption as the module-level ledger lock).
const refusedKeys = new Map<string, true>();
const REFUSED_KEYS_CAP = 64;
let forwardedCount = 0;

function recordRefusal(body: unknown): void {
  if (typeof body !== "string") return;
  try {
    const key = (JSON.parse(body) as { p_client_request_id?: unknown }).p_client_request_id;
    if (typeof key !== "string" || !key) return;
    refusedKeys.set(key, true);
    while (refusedKeys.size > REFUSED_KEYS_CAP) refusedKeys.delete(refusedKeys.keys().next().value as string);
  } catch {
    // an unreadable body records nothing: the refusal then stays unconfirmed and the outcome is treated as unknown
  }
}

export type ActorBindingObservation = { called: boolean; refused: boolean };

export type ActorBindingRegistry = {
  bind(opId: string, ownerActorKey: string): void;
  release(opId: string): void;
  ownerOf(opId: string): string | undefined;
  noteCall(opId: string): void;
  // Consumes the observation of the attempt that was just made.
  observe(opId: string): ActorBindingObservation;
};

export function createActorBindingRegistry(): ActorBindingRegistry {
  const owners = new Map<string, string>();
  const calls = new Set<string>();
  return {
    bind(opId, ownerActorKey) {
      owners.set(opId, ownerActorKey);
    },
    release(opId) {
      owners.delete(opId);
    },
    ownerOf(opId) {
      return owners.get(opId);
    },
    noteCall(opId) {
      calls.add(opId);
    },
    observe(opId) {
      return { called: calls.delete(opId), refused: refusedKeys.delete(opId) };
    }
  };
}

type RpcBuilderLike = { setHeader?: (name: string, value: string) => unknown };

// Returns an object that behaves like `client` but tags the guarded rpc calls. Everything else is
// forwarded untouched. A client whose rpc builder has no `setHeader` (test doubles) is left unchanged.
export function withActorBinding<T extends object>(client: T, registry: ActorBindingRegistry): T {
  const target = client as unknown as { rpc: (fn: string, args?: Record<string, unknown>, options?: unknown) => unknown };
  const proxy = Object.create(client) as { rpc: typeof target.rpc };
  proxy.rpc = (fn, args, options) => {
    const builder = options === undefined ? target.rpc(fn, args) : target.rpc(fn, args, options);
    if (!ACTOR_BOUND_RPC_NAMES.includes(fn)) return builder;
    const key = typeof args?.p_client_request_id === "string" ? (args.p_client_request_id as string) : null;
    if (key) registry.noteCall(key);
    const owner = key ? registry.ownerOf(key) : undefined;
    const tagged = builder as RpcBuilderLike;
    if (typeof tagged.setHeader !== "function") return builder;
    return tagged.setHeader(ACTOR_BINDING_HEADER, owner ?? ACTOR_BINDING_UNBOUND);
  };
  return proxy as unknown as T;
}

// ---------------------------------------------------------------------------------------------
// Fetch guard
// ---------------------------------------------------------------------------------------------

export type ActorBindingFetch = (input: unknown, init?: { headers?: unknown; method?: string } & Record<string, unknown>) => Promise<Response>;

function mismatchResponse(detail: string): Response {
  return new Response(
    JSON.stringify({ code: ACTOR_BINDING_MISMATCH_CODE, message: ACTOR_BINDING_MISMATCH_MESSAGE, details: detail, hint: "" }),
    { status: 409, headers: { "content-type": "application/json" } }
  );
}

function inScope(url: string, supabaseUrl: string): boolean {
  try {
    const target = new URL(url);
    const base = new URL(supabaseUrl);
    if (target.origin !== base.origin) return false;
    const prefix = `${base.pathname.replace(/\/$/, "")}/rest/v1/rpc/`;
    if (!target.pathname.startsWith(prefix)) return false;
    return ACTOR_BOUND_RPC_NAMES.includes(target.pathname.slice(prefix.length));
  } catch {
    return false;
  }
}

export function createActorBindingFetchGuard(options: { supabaseUrl: string; inner?: ActorBindingFetch }): ActorBindingFetch {
  const forward: ActorBindingFetch = (input, init) => {
    forwardedCount++;
    return (options.inner ?? ((i, n) => (globalThis.fetch as unknown as ActorBindingFetch)(i, n)))(input, init);
  };
  const decide: ActorBindingFetch = async (input, init) => {
    const initHeaders = init?.headers;
    const headers = new Headers(initHeaders as ConstructorParameters<typeof Headers>[0]);
    const expected = headers.get(ACTOR_BINDING_HEADER);
    // Requests that do not carry the tag are not ours: pass them through byte-for-byte.
    if (expected === null) return forward(input, init);

    const url = typeof input === "string" ? input : input instanceof URL ? input.href : null;
    const method = (init?.method ?? "GET").toUpperCase();
    if (url === null || method !== "POST" || !inScope(url, options.supabaseUrl)) return mismatchResponse("scope");
    if (expected === ACTOR_BINDING_UNBOUND || !expected) return mismatchResponse("unbound");

    const subject = decodeBearerSubject(headers.get("authorization"));
    if (subject === null || subject !== expected) return mismatchResponse("identity");

    // Same synchronous step: the verified headers object is the one that is sent (tag removed).
    headers.delete(ACTOR_BINDING_HEADER);
    return forward(input, { ...init, headers });
  };
  // A request that was decided WITHOUT being forwarded was refused by this guard and never reached the network: record its key so that a
  // later TKACT0 answer can be confirmed against what this device actually did (a concurrent forward only makes the record miss, which
  // leaves the outcome unknown — the safe direction).
  return async (input, init) => {
    const before = forwardedCount;
    const response = await decide(input, init);
    if (forwardedCount === before) recordRefusal(init?.body);
    return response;
  };
}
