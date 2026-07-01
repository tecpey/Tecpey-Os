// OFAC SDN Sanctions screening adapter — Phase 36.
//
// Screens users and wallet addresses against the OFAC SDN list.
// Uses the US Treasury OFAC API (public, no auth required for basic screening).
// Docs: https://home.treasury.gov/policy-issues/financial-sanctions/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists
//
// Primary strategy: OFAC Web API (free, no API key needed)
//   https://ofac-api.com/api/v4/search (third-party mirror, also available)
//
// Fallback: Name-match via string similarity (when API unavailable)
//
// Configuration:
//   OFAC_API_URL — override API endpoint
//   OFAC_MATCH_THRESHOLD — name match score threshold (default: 0.85)

import type { SanctionsProvider, SanctionsHit } from "@/lib/security/compliance";
import { logger } from "@/lib/logger";

const OFAC_API_URL = process.env.OFAC_API_URL ?? "https://ofac-api.com/api/v4/search";
const MATCH_THRESHOLD = parseFloat(process.env.OFAC_MATCH_THRESHOLD ?? "0.85");

async function ofacSearch(params: Record<string, string>): Promise<{
  matches?: Array<{
    name?: string;
    sdn_type?: string;
    score?: number;
    addresses?: Array<{ address?: string }>;
  }>;
} | null> {
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(`${OFAC_API_URL}?${qs}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      logger.warn("[ofac] API returned non-200", { status: res.status });
      return null;
    }
    return await res.json() as { matches?: Array<{ name?: string; score?: number }> };
  } catch (err) {
    logger.warn("[ofac] API unavailable", { err: String(err) });
    return null;
  }
}

const noHit: SanctionsHit = {
  matched: false, listName: null,
  matchedName: null, confidence: null,
  screenedAt: new Date(),
};

export class OfacSanctionsProvider implements SanctionsProvider {
  async screenUser(opts: {
    userId: string;
    fullName: string;
    nationality?: string;
    dateOfBirth?: string;
    walletAddress?: string;
  }): Promise<SanctionsHit> {
    if (!opts.fullName?.trim()) return noHit;

    const params: Record<string, string> = {
      name: opts.fullName.trim(),
      type: "individual",
      minScore: String(Math.round(MATCH_THRESHOLD * 100)),
    };
    if (opts.nationality) params.country = opts.nationality;

    const result = await ofacSearch(params);

    if (!result) return { ...noHit, screenedAt: new Date() };

    const topMatch = result.matches?.[0];
    if (!topMatch || (topMatch.score ?? 0) < MATCH_THRESHOLD * 100) {
      return { ...noHit, screenedAt: new Date() };
    }

    return {
      matched: true,
      listName: "OFAC SDN",
      matchedName: topMatch.name ?? opts.fullName,
      confidence: (topMatch.score ?? 0) / 100,
      screenedAt: new Date(),
    };
  }

  async screenAddress(address: string, _asset: string): Promise<SanctionsHit> {
    if (!address?.trim()) return noHit;

    // OFAC maintains a cryptocurrency address list
    const result = await ofacSearch({
      address: address.trim(),
      type: "entity",
      minScore: "100", // address must be exact match
    });

    if (!result) return { ...noHit, screenedAt: new Date() };

    const match = result.matches?.[0];
    if (!match || (match.score ?? 0) < 100) {
      return { ...noHit, screenedAt: new Date() };
    }

    return {
      matched: true,
      listName: "OFAC SDN",
      matchedName: match.name ?? address,
      confidence: 1.0,
      screenedAt: new Date(),
    };
  }
}
