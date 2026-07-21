import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION,
  createCommunityReputationScoringConsentIdempotencyKey,
  loadCommunityReputationScoringConsentClient,
  parseCommunityReputationScoringConsentMutationPayload,
  parseCommunityReputationScoringConsentPayload,
  updateCommunityReputationScoringConsentClient,
} from "../../lib/community-reputation-scoring-consent-client";

const originalFetch = globalThis.fetch;
const originalCrypto = globalThis.crypto;

function consent(overrides: Record<string, unknown> = {}) {
  return {
    enabled: false,
    revision: 0,
    consentVersion: COMMUNITY_REPUTATION_SCORING_CONSENT_VERSION,
    consentedAt: null,
    updatedAt: "2026-07-21T12:00:00.000Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: originalCrypto,
  });
});

describe("Community reputation scoring consent client", () => {
  it("accepts only the exact default-off consent contract", () => {
    const parsed = parseCommunityReputationScoringConsentPayload({
      ok: true,
      consent: consent(),
    });
    assert.equal(parsed?.enabled, false);
    assert.equal(parsed?.revision, 0);

    assert.equal(
      parseCommunityReputationScoringConsentPayload({
        ok: true,
        consent: { ...consent(), unexpected: true },
      }),
      null,
    );
    assert.equal(
      parseCommunityReputationScoringConsentPayload({
        ok: true,
        consent: consent({ consentVersion: "forged" }),
      }),
      null,
    );
    assert.equal(
      parseCommunityReputationScoringConsentPayload({
        ok: true,
        consent: consent({ updatedAt: "not-a-date" }),
      }),
      null,
    );
  });

  it("requires a decision timestamp when consent is enabled", () => {
    assert.equal(
      parseCommunityReputationScoringConsentPayload({
        ok: true,
        consent: consent({ enabled: true, revision: 1 }),
      }),
      null,
    );

    const parsed = parseCommunityReputationScoringConsentPayload({
      ok: true,
      consent: consent({
        enabled: true,
        revision: 1,
        consentedAt: "2026-07-21T11:59:00.000Z",
      }),
    });
    assert.equal(parsed?.enabled, true);
  });

  it("strictly parses mutation receipts and rejects contradictory replay state", () => {
    const parsed = parseCommunityReputationScoringConsentMutationPayload({
      ok: true,
      changed: true,
      replayed: false,
      consent: consent({
        enabled: true,
        revision: 1,
        consentedAt: "2026-07-21T11:59:00.000Z",
      }),
    });
    assert.equal(parsed?.changed, true);
    assert.equal(parsed?.consent.enabled, true);

    assert.equal(
      parseCommunityReputationScoringConsentMutationPayload({
        ok: true,
        changed: false,
        replayed: true,
        consent: consent(),
      }),
      null,
    );
    assert.equal(
      parseCommunityReputationScoringConsentMutationPayload({
        ok: true,
        changed: true,
        replayed: false,
        consent: consent(),
        score: 100,
      }),
      null,
    );
  });

  it("loads consent with same-origin no-store semantics", async () => {
    let request: { input: RequestInfo | URL; init?: RequestInit } | null = null;
    globalThis.fetch = (async (input, init) => {
      request = { input, init };
      return jsonResponse({ ok: true, consent: consent() });
    }) as typeof fetch;

    const loaded = await loadCommunityReputationScoringConsentClient();
    assert.equal(loaded.available, true);
    assert.equal(loaded.consent?.enabled, false);
    assert.equal(request?.input, "/api/community/profile?view=reputation-scoring-consent");
    assert.equal(request?.init?.method, "GET");
    assert.equal(request?.init?.credentials, "same-origin");
    assert.equal(request?.init?.cache, "no-store");
  });

  it("sends an exact revisioned PATCH with a secure idempotency key", async () => {
    let request: { input: RequestInfo | URL; init?: RequestInit } | null = null;
    globalThis.fetch = (async (input, init) => {
      request = { input, init };
      return jsonResponse({
        ok: true,
        changed: true,
        replayed: false,
        consent: consent({
          enabled: true,
          revision: 1,
          consentedAt: "2026-07-21T11:59:00.000Z",
        }),
      });
    }) as typeof fetch;

    const updated = await updateCommunityReputationScoringConsentClient({
      expectedRevision: 0,
      enabled: true,
      idempotencyKey: "community-reputation-consent-fixed-test-key",
    });
    assert.equal(updated.ok, true);
    assert.equal(request?.input, "/api/community/profile?view=reputation-scoring-consent");
    assert.equal(request?.init?.method, "PATCH");
    assert.equal(request?.init?.credentials, "same-origin");
    assert.equal(request?.init?.cache, "no-store");
    assert.equal(
      (request?.init?.headers as Record<string, string>)["Idempotency-Key"],
      "community-reputation-consent-fixed-test-key",
    );
    assert.deepEqual(JSON.parse(String(request?.init?.body)), {
      expectedRevision: 0,
      reputationScoringEnabled: true,
    });
  });

  it("maps stale revisions and reload-safe failures without optimistic success", async () => {
    globalThis.fetch = (async () =>
      jsonResponse(
        {
          ok: false,
          error: "community_reputation_scoring_consent_revision_conflict",
        },
        409,
      )) as typeof fetch;

    const updated = await updateCommunityReputationScoringConsentClient({
      expectedRevision: 2,
      enabled: false,
      idempotencyKey: "community-reputation-consent-conflict-key",
    });
    assert.deepEqual(updated, { ok: false, reason: "revision_conflict" });
  });

  it("requires cryptographic randomness for generated command identity", () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        randomUUID: () => "00000000-0000-4000-8000-000000000000",
      },
    });
    assert.equal(
      createCommunityReputationScoringConsentIdempotencyKey(),
      "community-reputation-consent-00000000-0000-4000-8000-000000000000",
    );
  });
});
