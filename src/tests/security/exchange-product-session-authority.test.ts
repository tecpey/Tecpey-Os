import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SignJWT } from "jose";
import {
  EXCHANGE_PRODUCT_SESSION_AUDIENCE,
  EXCHANGE_PRODUCT_SESSION_ISSUER,
  EXCHANGE_PRODUCT_SESSION_TYP,
  ExchangeProductSessionError,
  createExchangeProductSessionAuthority,
  exchangeSessionRegistryOwner,
  resolveExchangeProductSessionSecret,
} from "../../lib/security/exchange-product-session-authority";

const NOW = new Date("2026-09-06T12:00:00.000Z");
const PRINCIPAL_ID = "11111111-1111-4111-8111-111111111111";
const EXCHANGE_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const JTI = "33333333-3333-4333-8333-333333333333";
const SECRET_TEXT = "exchange-session-test-secret-with-more-than-32-bytes-v1";
const SECRET = new TextEncoder().encode(SECRET_TEXT);

function authority(input?: {
  registered?: boolean;
  verdict?: "active" | "revoked" | "unavailable";
  secret?: Uint8Array;
}) {
  const registrations: Array<Record<string, unknown>> = [];
  const instance = createExchangeProductSessionAuthority({
    now: () => new Date(NOW),
    randomJti: () => JTI,
    resolveSecret: () => input?.secret ?? SECRET,
    register: async (registration) => {
      registrations.push(registration as unknown as Record<string, unknown>);
      return input?.registered ?? true;
    },
    revocationVerdict: async () => input?.verdict ?? "active",
  });
  return { instance, registrations };
}

function issueInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tecpey",
    principalId: PRINCIPAL_ID,
    exchangeProductAccountId: EXCHANGE_ACCOUNT_ID,
    assurance: "aal2" as const,
    authenticationMethods: ["pwd", "totp"],
    authenticatedAt: new Date(NOW.getTime() - 60_000),
    financialStepUpAt: new Date(NOW.getTime() - 30_000),
    deviceInfo: "test-device",
    ip: "127.0.0.1",
    ...overrides,
  };
}

async function rejectsCode(
  action: Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(action, (error: unknown) =>
    error instanceof ExchangeProductSessionError && error.code === code,
  );
}

describe("Exchange product session authority", () => {
  it("fails closed on missing or weak production secrets", () => {
    assert.throws(
      () => resolveExchangeProductSessionSecret({ nodeEnv: "production", envValue: "" }),
      (error: unknown) =>
        error instanceof ExchangeProductSessionError &&
        error.code === "exchange_session_secret_missing",
    );
    assert.throws(
      () => resolveExchangeProductSessionSecret({ nodeEnv: "production", envValue: "short" }),
      (error: unknown) =>
        error instanceof ExchangeProductSessionError &&
        error.code === "exchange_session_secret_too_short",
    );
  });

  it("issues only after durable registration and namespaces Exchange registry ownership", async () => {
    const { instance, registrations } = authority();
    const issued = await instance.issue(issueInput());

    assert.equal(registrations.length, 1);
    assert.equal(
      registrations[0].userId,
      exchangeSessionRegistryOwner({ tenantId: "tecpey", principalId: PRINCIPAL_ID }),
    );
    assert.equal(registrations[0].jti, JTI);
    assert.equal(issued.session.tenantId, "tecpey");
    assert.equal(issued.session.principalId, PRINCIPAL_ID);
    assert.equal(issued.session.exchangeProductAccountId, EXCHANGE_ACCOUNT_ID);
    assert.equal(issued.session.assurance, "aal2");
    assert.deepEqual(issued.session.authenticationMethods, ["pwd", "totp"]);
  });

  it("refuses to return a usable token when durable session evidence cannot be written", async () => {
    const { instance } = authority({ registered: false });
    await rejectsCode(
      instance.issue(issueInput()),
      "exchange_session_registration_unavailable",
    );
  });

  it("round-trips a valid Exchange session with exact issuer, audience, typ and revocation authority", async () => {
    const { instance } = authority();
    const issued = await instance.issue(issueInput());
    const verified = await instance.verify(issued.token);

    assert.equal(verified.jti, JTI);
    assert.equal(verified.principalId, PRINCIPAL_ID);
    assert.equal(verified.exchangeProductAccountId, EXCHANGE_ACCOUNT_ID);
    assert.equal(verified.assurance, "aal2");
    assert.equal(verified.financialStepUpAt?.toISOString(), "2026-09-06T11:59:30.000Z");
  });

  it("rejects Core-like or wrong-audience credentials even when signed with the Exchange secret", async () => {
    const { instance } = authority();
    const coreLike = await new SignJWT({
      role: "unified",
      v: 1,
      tenant_id: "tecpey",
      exchange_product_account_id: EXCHANGE_ACCOUNT_ID,
      assurance: "aal2",
      amr: ["pwd", "totp"],
      auth_time: Math.floor(NOW.getTime() / 1000),
      financial_step_up_at: Math.floor(NOW.getTime() / 1000),
    })
      .setProtectedHeader({ alg: "HS256", typ: EXCHANGE_PRODUCT_SESSION_TYP })
      .setIssuer(EXCHANGE_PRODUCT_SESSION_ISSUER)
      .setAudience(EXCHANGE_PRODUCT_SESSION_AUDIENCE)
      .setSubject(PRINCIPAL_ID)
      .setJti(JTI)
      .setIssuedAt(Math.floor(NOW.getTime() / 1000))
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 900)
      .sign(SECRET);
    await rejectsCode(instance.verify(coreLike), "exchange_session_invalid");

    const wrongAudience = await new SignJWT({
      role: "exchange_product_session",
      v: 1,
      tenant_id: "tecpey",
      exchange_product_account_id: EXCHANGE_ACCOUNT_ID,
      assurance: "aal2",
      amr: ["pwd", "totp"],
      auth_time: Math.floor(NOW.getTime() / 1000),
      financial_step_up_at: Math.floor(NOW.getTime() / 1000),
    })
      .setProtectedHeader({ alg: "HS256", typ: EXCHANGE_PRODUCT_SESSION_TYP })
      .setIssuer(EXCHANGE_PRODUCT_SESSION_ISSUER)
      .setAudience("urn:tecpey:core:bff")
      .setSubject(PRINCIPAL_ID)
      .setJti(JTI)
      .setIssuedAt(Math.floor(NOW.getTime() / 1000))
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 900)
      .sign(SECRET);
    await rejectsCode(instance.verify(wrongAudience), "exchange_session_invalid");
  });

  it("rejects an Exchange token under a different product secret", async () => {
    const { instance: issuer } = authority();
    const issued = await issuer.issue(issueInput());
    const { instance: verifier } = authority({
      secret: new TextEncoder().encode(
        "a-completely-different-exchange-session-secret-over-32-bytes",
      ),
    });
    await rejectsCode(verifier.verify(issued.token), "exchange_session_invalid");
  });

  it("fails closed when strict revocation evidence is revoked or unavailable", async () => {
    const { instance: issuer } = authority();
    const issued = await issuer.issue(issueInput());

    const { instance: revoked } = authority({ verdict: "revoked" });
    await rejectsCode(revoked.verify(issued.token), "exchange_session_revoked");

    const { instance: unavailable } = authority({ verdict: "unavailable" });
    await rejectsCode(
      unavailable.verify(issued.token),
      "exchange_session_revocation_unavailable",
    );
  });

  it("requires a second authentication method before an AAL2 session can be issued", async () => {
    const { instance } = authority();
    await rejectsCode(
      instance.issue(issueInput({ authenticationMethods: ["pwd"] })),
      "exchange_session_aal2_method_required",
    );
  });

  it("requires fresh AAL2 step-up for financial authorization", async () => {
    const { instance } = authority();
    const valid = (await instance.issue(issueInput())).session;
    assert.doesNotThrow(() => instance.assertFinancialStepUp(valid, { now: NOW }));

    const noStepUp = (await instance.issue(issueInput({
      assurance: "aal1",
      authenticationMethods: ["pwd"],
      financialStepUpAt: null,
    }))).session;
    assert.throws(
      () => instance.assertFinancialStepUp(noStepUp, { now: NOW }),
      (error: unknown) =>
        error instanceof ExchangeProductSessionError &&
        error.code === "exchange_session_assurance_insufficient",
    );

    const stale = (await instance.issue(issueInput({
      authenticatedAt: new Date(NOW.getTime() - 10 * 60_000),
      financialStepUpAt: new Date(NOW.getTime() - 6 * 60_000),
    }))).session;
    assert.throws(
      () => instance.assertFinancialStepUp(stale, { now: NOW }),
      (error: unknown) =>
        error instanceof ExchangeProductSessionError &&
        error.code === "exchange_session_step_up_stale",
    );
  });
});
