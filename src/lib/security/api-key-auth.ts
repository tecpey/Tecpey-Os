// HMAC-SHA256 API key request signing — Phase 35.
//
// Binance/Kraken-style request authentication for API key holders.
// Cookie session auth remains unchanged — this is an ALTERNATIVE auth path.
//
// Request headers required:
//   X-TECPEY-APIKEY:    tecpey_{prefix}_{body}
//   X-TECPEY-TIMESTAMP: Unix epoch milliseconds
//   X-TECPEY-SIGNATURE: HMAC-SHA256(signingKey, canonicalString).hex()
//
// Canonical string format:
//   METHOD\n
//   /path/to/endpoint\n
//   TIMESTAMP_MS\n
//   SHA256(requestBody or "")
//
// The signingKey is the API key plaintext itself (never stored server-side).
// On validation:
//   1. Timestamp window check (± 5 minutes)
//   2. Signature verification (HMAC-SHA256)
//   3. Nonce check (prevent replay within the window)
//   4. Permission + IP whitelist check via validateApiKey()
//
// Nonces are tracked in Redis with 5-minute TTL.

import { createHmac, createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { validateApiKey } from "./api-keys";
import { writeAudit } from "./audit-log";
import type { ApiKeyPermission, ApiKeyValidation } from "./api-keys";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/rate-limit";

// ── Constants ─────────────────────────────────────────────────────────────────

const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const NONCE_PREFIX = "tecpey:sig:nonce:";
const NONCE_TTL_S = 5 * 60; // 5 minutes

export type ApiKeyAuthResult =
  | (ApiKeyValidation & { valid: true; userId: string; keyId: string; signatureVerified: true })
  | { valid: false; reason: string; userId?: string; keyId?: string; signatureVerified: false; permissions: [] };

// ── Canonical string builder ──────────────────────────────────────────────────

export function buildCanonicalString(
  method: string,
  path: string,
  timestampMs: string,
  body: string,
): string {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  return `${method.toUpperCase()}\n${path}\n${timestampMs}\n${bodyHash}`;
}

// ── Nonce tracking ────────────────────────────────────────────────────────────

async function markNonceUsed(signature: string): Promise<boolean> {
  const r = globalThis.tecpeyRedisClient;
  if (!r) return false; // no Redis — can't track nonces (allow but log)
  const key = `${NONCE_PREFIX}${signature.slice(0, 64)}`;
  try {
    const result = await r.set(key, "1", "EX", NONCE_TTL_S, "NX");
    return result === "OK"; // NX: only set if not exists
  } catch {
    return false;
  }
}

// ── Signature verification ────────────────────────────────────────────────────

function verifySignature(
  rawApiKey: string,
  canonical: string,
  submittedSig: string,
): boolean {
  if (!submittedSig || submittedSig.length < 16) return false;
  const expected = createHmac("sha256", rawApiKey).update(canonical).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(submittedSig.toLowerCase(), "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ── Main validator ────────────────────────────────────────────────────────────

/**
 * Validate a signed API key request.
 *
 * Returns `{ valid: true, ... }` on success.
 * Returns `{ valid: false, reason: string }` on any failure.
 *
 * Body text should be the raw request body (before JSON.parse).
 * Pass "" for GET/DELETE requests with no body.
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

  const invalid = (reason: string, userId?: string, keyId?: string): ApiKeyAuthResult => ({
    valid: false, reason, userId, keyId,
    signatureVerified: false, permissions: [],
  });

  if (!rawKey || !timestampMs || !signature) {
    return invalid("missing_headers");
  }

  // 1. Timestamp window
  const ts = parseInt(timestampMs, 10);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_WINDOW_MS) {
    writeAudit({
      actorId: rawKey.slice(0, 20),
      action: "api_key_created", // using closest audit action for failed sig
      ip,
      metadata: { reason: "timestamp_expired", submittedTs: timestampMs },
    });
    return invalid("timestamp_expired");
  }

  // 2. Signature verification
  const url = new URL(req.url);
  const canonical = buildCanonicalString(req.method, url.pathname, timestampMs, rawBody);
  if (!verifySignature(rawKey, canonical, signature)) {
    writeAudit({
      actorId: rawKey.slice(0, 20),
      action: "api_key_created",
      ip,
      metadata: { reason: "invalid_signature", method: req.method, path: url.pathname },
    });
    return invalid("invalid_signature");
  }

  // 3. Nonce check (replay prevention)
  const hasRedis = Boolean(globalThis.tecpeyRedisClient);
  if (hasRedis) {
    const isNew = await markNonceUsed(signature);
    if (!isNew) {
      return invalid("replayed_request");
    }
  } else {
    logger.warn("[api-key-auth] Redis unavailable — nonce replay prevention disabled");
  }

  // 4. Permission + IP whitelist check
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
 * Check if a request carries API key auth headers.
 * Use this to decide whether to attempt API key auth vs session auth.
 */
export function hasApiKeyHeaders(req: NextRequest): boolean {
  return Boolean(
    req.headers.get("x-tecpey-apikey") &&
    req.headers.get("x-tecpey-timestamp") &&
    req.headers.get("x-tecpey-signature"),
  );
}
