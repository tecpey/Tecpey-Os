import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SignJWT } from "jose";
import {
  EXCHANGE_PRODUCT_SESSION_AUDIENCE,
  EXCHANGE_PRODUCT_SESSION_ISSUER,
  EXCHANGE_PRODUCT_SESSION_TYP,
  ExchangeProductSessionError,
  createExchangeProductSessionAuthority,
} from "../../lib/security/exchange-product-session-authority";

const NOW = new Date("2026-09-06T12:00:00.000Z");
const PRINCIPAL_ID = "11111111-1111-4111-8111-111111111111";
const EXCHANGE_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const JTI = "33333333-3333-4333-8333-333333333333";
const SECRET = new TextEncoder().encode(
  "exchange-session-aal2-regression-secret-more-than-32-bytes-v1",
);

function authority() {
  return createExchangeProductSessionAuthority({
    now: () => new Date(NOW),
    randomJti: () => JTI,
    resolveSecret: () => SECRET,
    register: async () => true,
    revocationVerdict: async () => "active",
  });
}

async function rejectsAal2(action: Promise<unknown>) {
  await assert.rejects(
    action,
    (error: unknown) =>
      error instanceof ExchangeProductSessionError &&
      error.code === "exchange_session_aal2_method_required",
  );
}

describe("Exchange AAL2 multi-method regression", () => {
  it("refuses issuance when a caller labels one OTP method as AAL2", async () => {
    await rejectsAal2(
      authority().issue({
        tenantId: "tecpey",
        principalId: PRINCIPAL_ID,
        exchangeProductAccountId: EXCHANGE_ACCOUNT_ID,
        assurance: "aal2",
        authenticationMethods: ["totp"],
        authenticatedAt: new Date(NOW.getTime() - 60_000),
        financialStepUpAt: new Date(NOW.getTime() - 30_000),
      }),
    );
  });

  it("refuses verification of a forged single-method AAL2 Exchange token", async () => {
    const token = await new SignJWT({
      role: "exchange_product_session",
      v: 1,
      tenant_id: "tecpey",
      exchange_product_account_id: EXCHANGE_ACCOUNT_ID,
      assurance: "aal2",
      amr: ["totp"],
      auth_time: Math.floor((NOW.getTime() - 60_000) / 1000),
      financial_step_up_at: Math.floor((NOW.getTime() - 30_000) / 1000),
    })
      .setProtectedHeader({ alg: "HS256", typ: EXCHANGE_PRODUCT_SESSION_TYP })
      .setIssuer(EXCHANGE_PRODUCT_SESSION_ISSUER)
      .setAudience(EXCHANGE_PRODUCT_SESSION_AUDIENCE)
      .setSubject(PRINCIPAL_ID)
      .setJti(JTI)
      .setIssuedAt(Math.floor(NOW.getTime() / 1000))
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 900)
      .sign(SECRET);

    await rejectsAal2(authority().verify(token));
  });
});
