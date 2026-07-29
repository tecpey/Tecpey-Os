// Chainalysis KYT (Know Your Transaction) AML adapter — Phase 36.
//
// Chainalysis is the leading AML tool for crypto exchanges (Binance, Coinbase, Kraken).
// Docs: https://docs.chainalysis.com/api/kyt/
//
// Configuration:
//   CHAINALYSIS_API_KEY — REST API key
//   CHAINALYSIS_BASE_URL — override for staging (default: https://api.chainalysis.com)
//
// Graceful degradation: if not configured, returns riskScore="low" and logs.

import type { AMLProvider, AmlRiskScore, AmlScreeningResult } from "@/lib/security/compliance";
import { logger } from "@/lib/logger";

const BASE_URL = process.env.CHAINALYSIS_BASE_URL ?? "https://api.chainalysis.com";

function isConfigured(): boolean {
  return Boolean(process.env.CHAINALYSIS_API_KEY);
}

function headers(): Record<string, string> {
  return {
    "Token": process.env.CHAINALYSIS_API_KEY!,
    "Content-Type": "application/json",
  };
}

async function kytFetch<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      logger.warn("[chainalysis] API error", { status: res.status, path });
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.error("[chainalysis] fetch failed", { path, err: String(err) });
    return null;
  }
}

function mapRisk(rating: string | undefined): AmlRiskScore {
  switch (rating?.toLowerCase()) {
    case "low": return "low";
    case "medium": return "medium";
    case "high": return "high";
    case "severe": return "blocked";
    default: return "low";
  }
}

export class ChainalysisAmlProvider implements AMLProvider {
  async screenTransaction(opts: {
    userId: string;
    txId: string;
    asset: string;
    amount: string;
    direction: "deposit" | "withdrawal";
    counterpartyAddress?: string;
  }): Promise<AmlScreeningResult> {
    const noRisk: AmlScreeningResult = {
      riskScore: "low", flags: [], requiresReview: false, screenedAt: new Date(),
    };

    if (!isConfigured()) {
      logger.warn("[chainalysis] not configured — skipping AML screen");
      return noRisk;
    }

    // KYT uses two endpoints: register transfer, then get risk
    const transferType = opts.direction === "deposit"
      ? "RECEIVED" : "SENT";

    // Register transfer
    const registerData = await kytFetch<{ externalId: string }>(
      "POST",
      "/api/kyt/v2/transfers",
      {
        network: opts.asset.toLowerCase(),
        asset: opts.asset,
        transferReference: opts.txId,
        direction: transferType,
        assetAmount: parseFloat(opts.amount),
        counterpartyAddresses: opts.counterpartyAddress
          ? [{ address: opts.counterpartyAddress }]
          : [],
      },
    );

    if (!registerData?.externalId) return noRisk;

    // Get risk summary
    const risk = await kytFetch<{
      rating?: string;
      riskIndicators?: Array<{ category: string }>;
      requiresReview?: boolean;
    }>(
      "GET",
      `/api/kyt/v2/transfers/${registerData.externalId}/summary`,
    );

    return {
      riskScore: mapRisk(risk?.rating),
      flags: risk?.riskIndicators?.map((r) => r.category) ?? [],
      requiresReview: risk?.requiresReview ?? false,
      screenedAt: new Date(),
    };
  }

  async handleAlert(
    payload: unknown,
  ): Promise<{ userId: string; riskScore: AmlRiskScore } | null> {
    if (!isConfigured()) return null;

    const data = payload as {
      userId?: string;
      rating?: string;
      transferReference?: string;
    };

    if (!data.userId) return null;

    return {
      userId: data.userId,
      riskScore: mapRisk(data.rating),
    };
  }
}
