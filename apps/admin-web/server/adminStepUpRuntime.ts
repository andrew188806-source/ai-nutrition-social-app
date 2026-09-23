import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  ADMIN_STEP_UP_OPERATION_CLASS,
  clearAdminStepUpCookie,
  hashAdminStepUpSecret,
  readAdminStepUpCookie,
  setAdminStepUpCookie
} from "../auth/admin-step-up-cookie";
import {
  authorizeAdminStepUpRequest,
  type AdminStepUpAuthorization,
  type AdminStepUpSession
} from "../auth/admin-step-up-authorization";
import { getAdminAuthConfig } from "../config/admin-auth";
import {
  issueAdminStepUpReceipt,
  readAdminStepUpDatabaseTime,
  readAdminStepUpReceiptStatus,
  revokeAdminStepUpReceipt
} from "./adminStepUpBroker";

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff"
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[0-9]{6,8}$/;
const BODY_LIMIT = 4096;

type SafeError =
  | "authorization_header_rejected" | "cross_site" | "unauthenticated"
  | "step_up_broker_unavailable" | "totp_factor_required"
  | "totp_verification_failed" | "step_up_aal2_required"
  | "step_up_actor_mismatch" | "step_up_session_mismatch" | "invalid_request";

function json(body: object, status = 200): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS });
}

function authFailure(result: Exclude<AdminStepUpAuthorization, { state: "authorized" }>): Response {
  const status = result.state === "unauthenticated" ? 401
    : result.state === "unavailable" ? 503 : 403;
  const error: SafeError = result.state === "unavailable"
    ? "step_up_broker_unavailable" : result.state;
  return json({ ok: false, error }, status);
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return null;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > BODY_LIMIT)) return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > BODY_LIMIT) return null;
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
  } catch { return null; }
}

async function authorize(request: Request): Promise<AdminStepUpSession | Response> {
  const result = await authorizeAdminStepUpRequest(request);
  return result.state === "authorized" ? result.session : authFailure(result);
}

function factorView(factor: Readonly<Record<string, unknown>>) {
  return Object.freeze({
    factorId: typeof factor.id === "string" ? factor.id : "",
    status: factor.status === "verified" ? "verified" as const : "unverified" as const,
    label: typeof factor.friendly_name === "string"
      ? factor.friendly_name.slice(0, 80) : "Authenticator app",
    createdAt: typeof factor.created_at === "string" ? factor.created_at : null
  });
}

export async function handleAdminStepUpFactorStatus(request: Request): Promise<Response> {
  const authorized = await authorize(request);
  if (authorized instanceof Response) return authorized;
  try {
    const factors = await authorized.client.auth.mfa.listFactors();
    if (factors.error) return json({ ok: false, error: "step_up_broker_unavailable" }, 503);
    const all = factors.data.all.filter((factor) => factor.factor_type === "totp");
    return json({ ok: true, factors: all.map((factor) => factorView(factor)) });
  } catch { return json({ ok: false, error: "step_up_broker_unavailable" }, 503); }
}

export async function handleAdminStepUpEnroll(request: Request): Promise<Response> {
  const authorized = await authorize(request);
  if (authorized instanceof Response) return authorized;
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "invalid_request" }, 400);
  const friendlyName = body.friendlyName;
  if (friendlyName !== undefined && (typeof friendlyName !== "string"
    || friendlyName.trim().length < 1 || friendlyName.trim().length > 80)) {
    return json({ ok: false, error: "invalid_request" }, 400);
  }
  try {
    const result = await authorized.client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: typeof friendlyName === "string" ? friendlyName.trim() : "TastKind Admin"
    });
    if (result.error || result.data.type !== "totp") {
      return json({ ok: false, error: "totp_verification_failed" }, 422);
    }
    return json({ ok: true, enrollment: {
      factorId: result.data.id,
      qrCode: result.data.totp.qr_code,
      secret: result.data.totp.secret,
      uri: result.data.totp.uri
    } });
  } catch { return json({ ok: false, error: "step_up_broker_unavailable" }, 503); }
}

async function verifyFactorInput(request: Request): Promise<Readonly<{ factorId: string; code: string }> | null> {
  const body = await readBody(request);
  if (!body || typeof body.factorId !== "string" || !UUID.test(body.factorId)
    || typeof body.code !== "string" || !CODE.test(body.code)) return null;
  return Object.freeze({ factorId: body.factorId, code: body.code });
}

export async function handleAdminStepUpEnrollVerify(request: Request): Promise<Response> {
  const authorized = await authorize(request);
  if (authorized instanceof Response) return authorized;
  const input = await verifyFactorInput(request);
  if (!input) return json({ ok: false, error: "invalid_request" }, 400);
  try {
    const factors = await authorized.client.auth.mfa.listFactors();
    const factor = factors.data?.all.find((candidate) => candidate.id === input.factorId
      && candidate.factor_type === "totp" && candidate.status === "unverified");
    if (factors.error || !factor) return json({ ok: false, error: "totp_factor_required" }, 422);
    const verified = await authorized.client.auth.mfa.challengeAndVerify(input);
    if (verified.error) return json({ ok: false, error: "totp_verification_failed" }, 422);
    // Enrollment verification deliberately does not issue a receipt. A separate fresh challenge
    // is required for the privileged window.
    return json({ ok: true, factorId: input.factorId, receiptIssued: false });
  } catch { return json({ ok: false, error: "totp_verification_failed" }, 422); }
}

export async function handleAdminStepUpFreshVerify(request: Request): Promise<Response> {
  const authorized = await authorize(request);
  if (authorized instanceof Response) return authorized;
  const input = await verifyFactorInput(request);
  if (!input) return json({ ok: false, error: "invalid_request" }, 400);

  try {
    const factors = await authorized.client.auth.mfa.listFactors();
    const factor = factors.data?.totp.find((candidate) => candidate.id === input.factorId);
    if (factors.error || !factor) return json({ ok: false, error: "totp_factor_required" }, 422);
    const verified = await authorized.client.auth.mfa.challengeAndVerify(input);
    if (verified.error) return json({ ok: false, error: "totp_verification_failed" }, 422);
    const verificationTime = await readAdminStepUpDatabaseTime();
    if (verificationTime.state !== "ready") {
      return json({ ok: false, error: "step_up_broker_unavailable" }, 503);
    }
    const verifiedAt = verificationTime.value;

    const [userResult, sessionResult] = await Promise.all([
      authorized.client.auth.getUser(),
      authorized.client.auth.getSession()
    ]);
    const freshSession = sessionResult.data.session;
    if (userResult.error || sessionResult.error || !freshSession || !userResult.data.user) {
      return json({ ok: false, error: "unauthenticated" }, 401);
    }
    const claimsResult = await authorized.client.auth.getClaims(freshSession.access_token);
    const claims = claimsResult.data?.claims;
    if (claimsResult.error || !claims) return json({ ok: false, error: "unauthenticated" }, 401);
    if (userResult.data.user.id !== authorized.actorId || claims.sub !== authorized.actorId) {
      return json({ ok: false, error: "step_up_actor_mismatch" }, 403);
    }
    if (claims.session_id !== authorized.sessionId) {
      return json({ ok: false, error: "step_up_session_mismatch" }, 403);
    }
    if (claims.aal !== "aal2") return json({ ok: false, error: "step_up_aal2_required" }, 403);

    const secret = randomBytes(32).toString("base64url");
    const issued = await issueAdminStepUpReceipt({
      actorId: authorized.actorId,
      sessionId: authorized.sessionId,
      secretHash: hashAdminStepUpSecret(secret),
      factorIdentifierHash: createHash("sha256").update(input.factorId, "utf8").digest("hex"),
      verifiedAt,
      requestId: randomUUID()
    });
    if (issued.state !== "ready") {
      return json({ ok: false, error: "step_up_broker_unavailable" }, 503);
    }
    const config = getAdminAuthConfig();
    setAdminStepUpCookie(issued.value.receiptId, secret, config.isProduction);
    const remainingSeconds = Math.max(0, Math.min(900,
      Math.floor((Date.parse(issued.value.expiresAt) - Date.now()) / 1000)));
    return json({ ok: true, receiptId: issued.value.receiptId,
      expiresAt: issued.value.expiresAt, remainingSeconds,
      operationClass: issued.value.operationClass, method: issued.value.stepUpMethod });
  } catch { return json({ ok: false, error: "totp_verification_failed" }, 422); }
}

export async function handleAdminStepUpStatus(request: Request): Promise<Response> {
  const authorized = await authorize(request);
  if (authorized instanceof Response) return authorized;
  const receipt = readAdminStepUpCookie();
  if (!receipt) return json({ ok: true, active: false });
  const status = await readAdminStepUpReceiptStatus({
    receiptId: receipt.receiptId, actorId: authorized.actorId,
    sessionId: authorized.sessionId, proofHash: hashAdminStepUpSecret(receipt.secret)
  });
  if (status.state !== "ready") return json({ ok: false, error: "step_up_broker_unavailable" }, 503);
  if (!status.value.active || !status.value.expiresAt
    || status.value.operationClass !== ADMIN_STEP_UP_OPERATION_CLASS) {
    clearAdminStepUpCookie();
    return json({ ok: true, active: false });
  }
  return json({ ok: true, active: true, expiresAt: status.value.expiresAt,
    remainingSeconds: Math.max(0, Math.min(900,
      Math.floor((Date.parse(status.value.expiresAt) - Date.now()) / 1000))),
    operationClass: status.value.operationClass, method: status.value.stepUpMethod });
}

export async function handleAdminStepUpClear(request: Request): Promise<Response> {
  const authorized = await authorize(request);
  if (authorized instanceof Response) return authorized;
  const receipt = readAdminStepUpCookie();
  if (receipt) await revokeAdminStepUpReceipt({
    receiptId: receipt.receiptId, actorId: authorized.actorId, sessionId: authorized.sessionId
  });
  clearAdminStepUpCookie();
  return json({ ok: true, active: false });
}
