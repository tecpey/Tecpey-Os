// Sumsub KYC adapter — Phase 36.
//
// Sumsub is the leading KYC provider for crypto exchanges (Binance, Huobi, KuCoin).
// Docs: https://docs.sumsub.com/
//
// Configuration:
//   SUMSUB_APP_TOKEN — API app token
//   SUMSUB_SECRET_KEY — HMAC signing secret
//   SUMSUB_BASE_URL — override for staging (default: https://api.sumsub.com)
//
// Graceful degradation: if not configured, returns status="not_started" and logs.
// Auth: HMAC-SHA256 signed headers (X-App-Token, X-App-Access-Sig, X-App-Access-Ts).

import { createHmac } from "crypto";
import type { KYCProvider, KycResult, KycStatus } from "@/lib/security/compliance";
import { logger } from "@/lib/logger";

const BASE_URL = process.env.SUMSUB_BASE_URL ?? "https://api.sumsub.com";
const LEVEL_NAME = process.env.SUMSUB_LEVEL_NAME ?? "basic-kyc-level";

function isConfigured(): boolean {
  return Boolean(process.env.SUMSUB_APP_TOKEN && process.env.SUMSUB_SECRET_KEY);
}

function signRequest(secret: string, ts: number, method: string, path: string, body: string): string {
  const msg = `${ts}${method.toUpperCase()}${path}${body}`;
  return createHmac("sha256", secret).update(msg).digest("hex");
}

function authHeaders(method: string, path: string, body = ""): Record<string, string> {
  const ts = Math.floor(Date.now() / 1000);
  const token = process.env.SUMSUB_APP_TOKEN!;
  const secret = process.env.SUMSUB_SECRET_KEY!;
  return {
    "X-App-Token": token,
    "X-App-Access-Sig": signRequest(secret, ts, method, path, body),
    "X-App-Access-Ts": String(ts),
    "Content-Type": "application/json",
  };
}

async function sumsubFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T | null> {
  const bodyStr = body ? JSON.stringify(body) : "";
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: authHeaders(method, path, bodyStr),
      body: bodyStr || undefined,
    });
    if (!res.ok) {
      logger.warn("[sumsub] API error", { status: res.status, path });
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.error("[sumsub] fetch failed", { path, err: String(err) });
    return null;
  }
}

// Map Sumsub review status to our KycStatus
function mapStatus(sumsubStatus: string | undefined): KycStatus {
  switch (sumsubStatus) {
    case "completed": return "approved";
    case "onHold": return "pending";
    case "declined": return "rejected";
    case "pending": return "pending";
    default: return "not_started";
  }
}

export class SumsubKycProvider implements KYCProvider {
  async createSession(
    userId: string,
    returnUrl: string,
  ): Promise<{ sessionId: string; redirectUrl: string }> {
    if (!isConfigured()) {
      if (process.env.NODE_ENV === "production") {
        logger.error("[sumsub] not configured in production — KYC sessions blocked");
        throw new Error("kyc_not_configured");
      }
      logger.warn("[sumsub] not configured — skipping KYC session creation");
      return { sessionId: `mock_${userId}`, redirectUrl: returnUrl };
    }

    const path = `/resources/accessTokens?userId=${encodeURIComponent(userId)}&levelName=${encodeURIComponent(LEVEL_NAME)}&ttlInSecs=3600`;
    const data = await sumsubFetch<{ token: string }>("POST", path);
    if (!data?.token) throw new Error("sumsub_session_failed");

    return {
      sessionId: data.token,
      redirectUrl: `https://cockpit.sumsub.com/idensic/l/#/${data.token}`,
    };
  }

  async getStatus(userId: string): Promise<KycResult> {
    const notStarted: KycResult = {
      status: "not_started", level: "basic",
      verifiedAt: null, expiresAt: null,
      rejectionReason: null, documentCountry: null,
    };

    if (!isConfigured()) return notStarted;

    const path = `/resources/applicants/-;externalUserId=${encodeURIComponent(userId)}/one`;
    const data = await sumsubFetch<{
      review?: { reviewStatus?: string; reviewResult?: { reviewAnswer?: string } };
      fixedInfo?: { country?: string };
      createdAt?: string;
    }>("GET", path);

    if (!data) return notStarted;

    const rawStatus = data.review?.reviewStatus;
    const status = mapStatus(rawStatus);

    return {
      status,
      level: "basic",
      verifiedAt: status === "approved" ? new Date() : null,
      expiresAt: null,
      rejectionReason: data.review?.reviewResult?.reviewAnswer ?? null,
      documentCountry: data.fixedInfo?.country ?? null,
    };
  }

  async handleWebhook(
    payload: unknown,
    signature: string,
  ): Promise<{ userId: string; status: KycStatus } | null> {
    if (!isConfigured()) return null;

    // Verify webhook signature
    const secret = process.env.SUMSUB_SECRET_KEY!;
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    if (expected !== signature) {
      logger.warn("[sumsub] webhook signature mismatch");
      return null;
    }

    const data = payload as { externalUserId?: string; reviewStatus?: string };
    if (!data.externalUserId) return null;

    return {
      userId: data.externalUserId,
      status: mapStatus(data.reviewStatus),
    };
  }
}
