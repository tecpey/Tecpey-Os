// Compliance provider interfaces — Phase 34.
//
// Architecture only. No providers implemented.
// These interfaces define the contract for compliance integrations
// planned for Phase 36+ (KYC: Sumsub/Jumio; AML: Chainalysis; Sanctions: Ofac).
//
// Design principles (FATF Travel Rule, MiCA, FinCEN compliance):
//   - KYC gate: identity verification before trading above thresholds
//   - AML screening: transaction monitoring against known patterns
//   - Sanctions screening: real-time check against OFAC/UN/EU lists
//   - Travel Rule: counterparty information for transfers above $3K (US) / 1K EUR (EU)
//
// All providers are injected, not imported directly. This enables:
//   - Easy swapping of providers (Sumsub → Jumio)
//   - Test doubles in integration tests
//   - Graceful degradation if a provider is unavailable

// ── KYC Provider ─────────────────────────────────────────────────────────────

export type KycStatus = "not_started" | "pending" | "approved" | "rejected" | "expired";

export type KycLevel = "basic" | "standard" | "enhanced";

export type KycResult = {
  status: KycStatus;
  level: KycLevel;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  rejectionReason: string | null;
  documentCountry: string | null;
};

export interface KYCProvider {
  /** Initiate a KYC session. Returns a URL to redirect the user to. */
  createSession(userId: string, returnUrl: string): Promise<{ sessionId: string; redirectUrl: string }>;

  /** Fetch current KYC status for a user. */
  getStatus(userId: string): Promise<KycResult>;

  /** Handle provider webhook. Returns the processed userId if relevant. */
  handleWebhook(payload: unknown, signature: string): Promise<{ userId: string; status: KycStatus } | null>;
}

// ── AML Provider ─────────────────────────────────────────────────────────────

export type AmlRiskScore = "low" | "medium" | "high" | "blocked";

export type AmlScreeningResult = {
  riskScore: AmlRiskScore;
  flags: string[];
  requiresReview: boolean;
  screenedAt: Date;
};

export interface AMLProvider {
  /** Screen a deposit/withdrawal transaction for AML risk. */
  screenTransaction(opts: {
    userId: string;
    txId: string;
    asset: string;
    amount: string;
    direction: "deposit" | "withdrawal";
    counterpartyAddress?: string;
  }): Promise<AmlScreeningResult>;

  /** Continuous monitoring alert handler. */
  handleAlert(payload: unknown): Promise<{ userId: string; riskScore: AmlRiskScore } | null>;
}

// ── Sanctions Provider ────────────────────────────────────────────────────────

export type SanctionsHit = {
  matched: boolean;
  listName: string | null;      // e.g. "OFAC SDN", "UN Consolidated"
  matchedName: string | null;
  confidence: number | null;    // 0–1
  screenedAt: Date;
};

export interface SanctionsProvider {
  /** Screen a user by name/nationality/DOB. */
  screenUser(opts: {
    userId: string;
    fullName: string;
    nationality?: string;
    dateOfBirth?: string;   // ISO 8601
    walletAddress?: string;
  }): Promise<SanctionsHit>;

  /** Screen a wallet address against known sanctioned addresses. */
  screenAddress(address: string, asset: string): Promise<SanctionsHit>;
}

// ── Travel Rule Provider ──────────────────────────────────────────────────────

export type TravelRuleStatus = "not_required" | "pending" | "completed" | "failed";

export type TravelRuleResult = {
  status: TravelRuleStatus;
  originatorInfo?: {
    name: string;
    accountNumber: string;
    geographicAddress?: string;
  };
  beneficiaryInfo?: {
    name: string;
    accountNumber: string;
    vasp?: string;          // Virtual Asset Service Provider
  };
  completedAt: Date | null;
};

export interface TravelRuleProvider {
  /** Submit travel rule data for an outgoing transfer. */
  submitTransfer(opts: {
    txId: string;
    asset: string;
    amount: string;
    originatorUserId: string;
    destinationAddress: string;
    destinationVasp?: string;
  }): Promise<TravelRuleResult>;

  /** Check if a transfer requires travel rule compliance. */
  isRequired(amountUsd: number): boolean;
}

// ── Compliance Registry (DI container) ───────────────────────────────────────

export type ComplianceProviders = {
  kyc?: KYCProvider;
  aml?: AMLProvider;
  sanctions?: SanctionsProvider;
  travelRule?: TravelRuleProvider;
};

declare global {
  var tecpeyComplianceProviders: ComplianceProviders | undefined;
}

export function getComplianceProviders(): ComplianceProviders {
  return globalThis.tecpeyComplianceProviders ?? {};
}

export function registerComplianceProviders(providers: ComplianceProviders): void {
  globalThis.tecpeyComplianceProviders = {
    ...(globalThis.tecpeyComplianceProviders ?? {}),
    ...providers,
  };
}
