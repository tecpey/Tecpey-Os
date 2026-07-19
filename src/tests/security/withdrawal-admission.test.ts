import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type {
  AMLProvider,
  ComplianceProviders,
  KYCProvider,
  SanctionsProvider,
} from "../../lib/security/compliance";
import {
  canonicalizeWithdrawalCommand,
  evaluateWithdrawalCompliance,
  validateWithdrawalDestination,
} from "../../lib/security/withdrawal-admission-authority";

const originalProviders = globalThis.tecpeyComplianceProviders;
const originalRealWithdrawals = process.env.TECPEY_REAL_WITHDRAWALS_ENABLED;

afterEach(() => {
  globalThis.tecpeyComplianceProviders = originalProviders;
  if (originalRealWithdrawals === undefined) {
    delete process.env.TECPEY_REAL_WITHDRAWALS_ENABLED;
  } else {
    process.env.TECPEY_REAL_WITHDRAWALS_ENABLED = originalRealWithdrawals;
  }
});

function command(overrides: Partial<{
  userId: string;
  asset: string;
  amount: string;
  destinationAddress: string;
  destinationTag: string | null;
  network: string;
  idempotencyKey: string;
}> = {}) {
  return canonicalizeWithdrawalCommand({
    userId: "user-1",
    asset: "ETH",
    amount: "1",
    destinationAddress: `0x${"a".repeat(40)}`,
    destinationTag: null,
    network: "ethereum",
    idempotencyKey: "withdrawal-test-key-0001",
    ...overrides,
  });
}

function passingProviders(overrides: Partial<ComplianceProviders> = {}): ComplianceProviders {
  const kyc: KYCProvider = {
    async createSession() {
      return { sessionId: "session", redirectUrl: "https://kyc.invalid" };
    },
    async getStatus() {
      return {
        status: "approved",
        level: "enhanced",
        verifiedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000),
        rejectionReason: null,
        documentCountry: "AE",
      };
    },
    async handleWebhook() {
      return null;
    },
  };
  const aml: AMLProvider = {
    async screenTransaction() {
      return {
        riskScore: "low",
        flags: [],
        requiresReview: false,
        screenedAt: new Date(),
      };
    },
    async handleAlert() {
      return null;
    },
  };
  const sanctions: SanctionsProvider = {
    async screenUser() {
      return {
        matched: false,
        listName: null,
        matchedName: null,
        confidence: 0,
        screenedAt: new Date(),
      };
    },
    async screenAddress() {
      return {
        matched: false,
        listName: null,
        matchedName: null,
        confidence: 0,
        screenedAt: new Date(),
      };
    },
  };
  return { kyc, aml, sanctions, ...overrides };
}

describe("Withdrawal admission command authority", () => {
  it("preserves significant integer zeroes and canonicalizes fixed decimals", () => {
    const integer = command({ amount: "100.000000000000000000" });
    assert.equal(integer.ok, true);
    if (integer.ok) assert.equal(integer.command.amount, "100");

    const fraction = command({ amount: "0001.230000000000000000" });
    assert.equal(fraction.ok, true);
    if (fraction.ok) assert.equal(fraction.command.amount, "1.23");
  });

  it("rejects precision, asset-network and destination-tag mismatches", () => {
    assert.deepEqual(command({ amount: "0.0000000000000000001" }), {
      ok: false,
      reason: "amount_precision_exceeded",
    });
    assert.deepEqual(command({ asset: "BTC", network: "ethereum" }), {
      ok: false,
      reason: "asset_network_mismatch",
    });
    assert.equal(
      validateWithdrawalDestination({
        asset: "XRP",
        network: "ripple",
        address: `r${"a".repeat(24)}`,
        destinationTag: null,
      }),
      "destination_tag_required",
    );
  });

  it("changes the request hash when any security-relevant field changes", () => {
    const first = command();
    const second = command({ destinationAddress: `0x${"b".repeat(40)}` });
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (first.ok && second.ok) assert.notEqual(first.requestHash, second.requestHash);
  });
});

describe("Withdrawal compliance fail-closed authority", () => {
  it("provider outage never approves a withdrawal", async () => {
    globalThis.tecpeyComplianceProviders = {};
    process.env.TECPEY_REAL_WITHDRAWALS_ENABLED = "1";
    const result = await evaluateWithdrawalCompliance({
      withdrawalId: "withdrawal-provider-outage",
      userId: "user-1",
      asset: "ETH",
      amount: "1",
      destinationAddress: `0x${"a".repeat(40)}`,
    });
    assert.equal(result.state, "compliance_review");
    assert.equal(result.reason, "compliance_evidence_incomplete");
  });

  it("malformed and throwing providers never become low-risk evidence", async () => {
    const providers = passingProviders({
      aml: {
        async screenTransaction() {
          throw new Error("provider_down");
        },
        async handleAlert() {
          return null;
        },
      },
    });
    globalThis.tecpeyComplianceProviders = providers;
    process.env.TECPEY_REAL_WITHDRAWALS_ENABLED = "1";
    const result = await evaluateWithdrawalCompliance({
      withdrawalId: "withdrawal-aml-outage",
      userId: "user-1",
      asset: "ETH",
      amount: "1",
      destinationAddress: `0x${"a".repeat(40)}`,
    });
    assert.equal(result.state, "compliance_review");
    assert.notEqual(result.amlRisk, "low");
  });

  it("sanctions match blocks before custody execution", async () => {
    const base = passingProviders();
    globalThis.tecpeyComplianceProviders = {
      ...base,
      sanctions: {
        async screenUser() {
          return {
            matched: true,
            listName: "OFAC SDN",
            matchedName: "Matched Entity",
            confidence: 0.99,
            screenedAt: new Date(),
          };
        },
        async screenAddress() {
          return {
            matched: true,
            listName: "OFAC SDN",
            matchedName: "Matched Address",
            confidence: 0.99,
            screenedAt: new Date(),
          };
        },
      },
    };
    const result = await evaluateWithdrawalCompliance({
      withdrawalId: "withdrawal-sanctions",
      userId: "user-1",
      asset: "ETH",
      amount: "1",
      destinationAddress: `0x${"a".repeat(40)}`,
    });
    assert.equal(result.state, "blocked");
    assert.equal(result.reason, "sanctions_match");
  });

  it("custody launch gate keeps otherwise passing controls in review", async () => {
    globalThis.tecpeyComplianceProviders = passingProviders();
    delete process.env.TECPEY_REAL_WITHDRAWALS_ENABLED;
    const result = await evaluateWithdrawalCompliance({
      withdrawalId: "withdrawal-custody-gate",
      userId: "user-1",
      asset: "ETH",
      amount: "1",
      destinationAddress: `0x${"a".repeat(40)}`,
    });
    assert.equal(result.state, "compliance_review");
    assert.equal(result.reason, "custody_launch_gate_disabled");
  });
});

it("browser security facts are explicitly rejected at the route boundary", async () => {
  const source = await readFile(
    "src/app/api/auth/withdraw/route.ts",
    "utf8",
  );
  assert.match(source, /client_security_facts_forbidden/);
  assert.match(source, /amountUsd/);
  assert.match(source, /twoFaVerified/);
  assert.doesNotMatch(source, /amountUsd:\s*body\.amountUsd/);
  assert.doesNotMatch(source, /twoFaVerified:\s*body\.twoFaVerified/);
});
