// Legacy HMAC-SHA256 API-key request signing adapter — Phase 35.
//
// Repository status:
//   - no active route or service imports this adapter;
//   - API-key credential lifecycle mutations use the transaction-coupled
//     authority in `api-keys.ts` and `sensitive_mutation_audit_events`;
//   - rejection events below are explicitly non-authoritative telemetry and
//     must never be interpreted as mutation evidence;
//   - activating signed API-key authentication requires a separate reviewed
//     route, nonce, authorization and audit authority change.
//
// Request headers expected by the dormant adapter:
//   X-TECPEY-APIKEY:    tecpey_{prefix}_{body}
//   X-TECPEY-TIMESTAMP: Unix epoch milliseconds
//   X-TECPEY-SIGNATURE: HMAC-SHA256(signingKey, canonicalString).hex()
//
// Canonical string format:
//   METHOD\n/path/to/endpoint\nTIMESTAMP_MS\nSHA256(requestBody or "")
//
// Nonces are tracked in Redis with a five-minute TTL. Production rejects a
// signed request when this replay-protection store is unavailable.

import { createHmac, createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { writeAudit } from "./audit-log";
import { validateApiKey } from "./api-keys";
import type { ApiKeyPermission, ApiKeyValidation } from "./api-keys";

export const LEGACY_SIGNED_API_KEY_AUTHORITY =
  "inactive-non-authoritative" as const;

const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;
const NONCE_PREFIX = "tecpey:sig:nonce:";
const NONCE_TTL_S = 5 * 60;

export type ApiKeyAuthResult =
  | (ApiKeyValidation & {
      valid: true;
      userId: string;
      keyId: string;
      signatureVerified: true;
    })
  | {
      valid: false;
      reason: string;
      userId?: string;
      keyId?: string;
      signatureVerified: false;
      permissions: [];
    };

export function buildCanonicalString(
  method: string,
  path: string,
  timestampMs: string,
  body: string,
): string {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  return `${method.toUpperCase()}\n${path}\n${timestampMs}\n${bodyHash}`;
}

type NonceMarkResult = "stored" | "replayed" | "unavailable";

async function markNonceUsed(signature: string): Promise<NonceMarkResult> {
  const redis = globalThis.tecpeyRedisClient;
  if (!redis) return "unavailable";
  const key = `${NONCE_PREFIX}${signature.slice(0, 64)}`;
  try {
    const result = await redis.set(key, "1", "EX", NONCE_TTL_S, "NX");
    return result === "OK" ? "stored" : "replayed";
  } catch (error) {
    logger.warn("[api-key-auth] Redis nonce write failed", {
      error: String(error),
    });
    return "unavailable";
  }
}

function verifySignature(
  rawApiKey: string,
  canonical: string,
  submittedSignature: string,
): boolean {
  if (!submittedSignature || submittedSignature.length < 16) return false;
  const expected = createHmac("sha256", rawApiKey)
    .update(canonical)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const submittedBuffer = Buffer.from(submittedSignature.toLowerCase(), "hex");
  if (expectedBuffer.length !== submittedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, submittedBuffer);
}

function credentialFingerprint(rawApiKey: string): string {
  return createHash("sha256")
    .update("tecpey-legacy-signed-api-key-telemetry-v1\0")
    .update(rawApiKey)
    .digest("hex");
}

type RejectionReason = "timestamp_outside_window" | "invalid_signature";

function recordRejectedSignedRequest(input: {
  rawApiKey: string;
  reason: RejectionReason;
  ip: string;
  method?: string;
  path?: string;
  timestampClass?: "invalid" | "past_outside_window" | "future_outside_window";
}): void {
  const fingerprint = credentialFingerprint(input.rawApiKey);
  writeAudit({
    actorId: fingerprint,
    action: "api_key_auth_rejected",
    resourceType: "api_key_credential_fingerprint",
    resourceId: fingerprint,
    ip: input.ip,
    metadata: {
      authority: LEGACY_SIGNED_API_KEY_AUTHORITY,
      telemetryVersion: "legacy-signed-api-key-rejection-v1",
      reason: input.reason,
      ...(input.method ? { method: input.method.slice(0, 16) } : {}),
      ...(input.path ? { path: input.path.slice(0, 256) } : {}),
      ...(input.timestampClass
        ? { timestampClass: input.timestampClass }
        : {}),
    },
  });
}

/**
 * Validate a signed API-key request through the dormant legacy adapter.
 *
 * Returns `{ valid: true, ... }` on success and a bounded rejection result on
 * failure. Body text must be the raw request body before JSON parsing.
 *
 * @deprecated No active route may invoke this adapter without a separately
 * reviewed activation authority.
 */
export async function validateSignedApiKeyRequest(
  req: NextRequest,
  requiredPermission: ApiKeyPermission,
  rawBody: string,
): Promise<ApiKeyAuthResult> {
  const rawKey = req.headers.get("x-tecpey-apikey") ?? "";
  const timestampMs = req.headers.get("x-tecpey-timestamp") ?? "";
  const signature = req.headers.get("x-tecpey-signature") ?? "";
  const ip = getClientIp(req);

  const invalid = (
    reason: string,
    userId?: string,
    keyId?: string,
  ): ApiKeyAuthResult => ({
    valid: false,
    reason,
    userId,
    keyId,
    signatureVerified: false,
    permissions: [],
  });

  if (!rawKey || !timestampMs || !signature) {
    return invalid("missing_headers");
  }

  const now = Date.now();
  const timestamp = Number.parseInt(timestampMs, 10);
  if (
    !Number.isFinite(timestamp) ||
    Math.abs(now - timestamp) > TIMESTAMP_WINDOW_MS
  ) {
    recordRejectedSignedRequest({
      rawApiKey: rawKey,
      reason: "timestamp_outside_window",
      ip,
      timestampClass: !Number.isFinite(timestamp)
        ? "invalid"
        : timestamp > now
          ? "future_outside_window"
          : "past_outside_window",
    });
    return invalid("timestamp_expired");
  }

  const url = new URL(req.url);
  const canonical = buildCanonicalString(
    req.method,
    url.pathname,
    timestampMs,
    rawBody,
  );
  if (!verifySignature(rawKey, canonical, signature)) {
    recordRejectedSignedRequest({
      rawApiKey: rawKey,
      reason: "invalid_signature",
      ip,
      method: req.method.toUpperCase(),
      path: url.pathname,
    });
    return invalid("invalid_signature");
  }

  const nonceResult = await markNonceUsed(signature);
  if (nonceResult === "replayed") {
    return invalid("replayed_request");
  }
  if (nonceResult === "unavailable") {
    if (process.env.NODE_ENV === "production") {
      logger.error(
        "[api-key-auth] Redis unavailable — rejecting signed API request",
      );
      return invalid("nonce_store_unavailable");
    }
    logger.warn(
      "[api-key-auth] Redis unavailable — nonce replay prevention disabled",
    );
  }

  const validation = await validateApiKey(rawKey, requiredPermission, ip);
  if (!validation.valid) {
    return {
      valid: false as const,
      reason: validation.reason ?? "validation_failed",
      userId: validation.userId ?? undefined,
      keyId: validation.keyId ?? undefined,
      signatureVerified: false as const,
      permissions: [] as [],
    };
  }

  return {
    valid: true as const,
    userId: validation.userId!,
    keyId: validation.keyId!,
    permissions: validation.permissions,
    signatureVerified: true as const,
  };
}

/**
 * Detect whether the dormant adapter's headers are present.
 *
 * @deprecated Header presence alone never activates this authentication path.
 */
export function hasApiKeyHeaders(req: NextRequest): boolean {
  return Boolean(
    req.headers.get("x-tecpey-apikey") &&
      req.headers.get("x-tecpey-timestamp") &&
      req.headers.get("x-tecpey-signature"),
  );
}
