import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAiIntelligenceEventEnvelope,
  intelligenceEventIdempotencyKey,
  validateAiIntelligenceEventEnvelope,
  type AiIntelligenceEventEnvelope,
} from "../../lib/ai/intelligence-event-contract";

const occurredAt = "2026-09-09T10:00:00.000Z";
const recordedAt = "2026-09-09T10:00:01.000Z";

function publicEvent(overrides: Partial<Parameters<typeof createAiIntelligenceEventEnvelope>[0]> = {}) {
  return createAiIntelligenceEventEnvelope({
    eventType: "news.article.captured.v1",
    occurredAt,
    recordedAt,
    aggregateType: "news_article",
    aggregateId: "article:abc",
    resourceVersion: "sha256:0123456789abcdef",
    correlationId: "capture:run-1",
    dataClass: "public",
    payload: {
      resourceRef: "archive:abc",
      locale: "en",
      evidenceRefs: ["source:publisher"],
      status: "captured",
      reasonCodes: [],
    },
    ...overrides,
  });
}

describe("AI intelligence event contract", () => {
  it("creates a canonical envelope that validates without mutation", () => {
    const event = publicEvent();
    assert.doesNotThrow(() => validateAiIntelligenceEventEnvelope(event));
    assert.equal(event.schemaVersion, 1);
    assert.equal(event.dataClass, "public");
    assert.equal(event.tenantId, null);
    assert.equal(event.workspaceId, null);
    assert.match(event.payloadHash, /^[0-9a-f]{64}$/);
    assert.match(event.idempotencyKey, /^[0-9a-f]{64}$/);
  });

  it("binds idempotency to tenant and workspace scope", () => {
    const first = intelligenceEventIdempotencyKey({
      eventType: "knowledge.promoted.v1",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      aggregateType: "knowledge",
      aggregateId: "btc-halving",
      resourceVersion: "v1",
      status: "promoted",
      dataClass: "approved_platform_content",
    });
    const second = intelligenceEventIdempotencyKey({
      eventType: "knowledge.promoted.v1",
      tenantId: "tenant-b",
      workspaceId: "workspace-a",
      aggregateType: "knowledge",
      aggregateId: "btc-halving",
      resourceVersion: "v1",
      status: "promoted",
      dataClass: "approved_platform_content",
    });
    const third = intelligenceEventIdempotencyKey({
      eventType: "knowledge.promoted.v1",
      tenantId: "tenant-a",
      workspaceId: "workspace-b",
      aggregateType: "knowledge",
      aggregateId: "btc-halving",
      resourceVersion: "v1",
      status: "promoted",
      dataClass: "approved_platform_content",
    });
    assert.notEqual(first, second);
    assert.notEqual(first, third);
  });

  it("requires complete tenant/workspace scope for private and restricted events", () => {
    assert.throws(
      () => createAiIntelligenceEventEnvelope({
        eventType: "mentor.profile.refresh_requested.v1",
        occurredAt,
        recordedAt,
        tenantId: "tecpey",
        workspaceId: null,
        aggregateType: "mentor_profile",
        aggregateId: "student:123",
        resourceVersion: "v1",
        correlationId: "mentor:req-1",
        dataClass: "private_user",
        payload: {
          resourceRef: "student:123",
          locale: "fa",
          evidenceRefs: [],
          status: "requested",
          reasonCodes: [],
        },
      }),
      /ai_intelligence_event_scope_partial/,
    );

    assert.throws(
      () => createAiIntelligenceEventEnvelope({
        eventType: "mentor.profile.refresh_requested.v1",
        occurredAt,
        recordedAt,
        aggregateType: "mentor_profile",
        aggregateId: "student:123",
        resourceVersion: "v1",
        correlationId: "mentor:req-1",
        dataClass: "private_user",
        payload: {
          resourceRef: "student:123",
          locale: "fa",
          evidenceRefs: [],
          status: "requested",
          reasonCodes: [],
        },
      }),
      /ai_intelligence_event_sensitive_scope_required/,
    );
  });

  it("rejects payload tampering even when the event otherwise looks valid", () => {
    const event = publicEvent();
    const tampered = {
      ...event,
      payload: {
        ...event.payload,
        status: "published",
      },
    } as AiIntelligenceEventEnvelope;
    assert.throws(
      () => validateAiIntelligenceEventEnvelope(tampered),
      /payload_hash_invalid|idempotency_mismatch/,
    );
  });

  it("rejects non-canonical timestamps and recorded-before-occurred events", () => {
    const event = publicEvent();
    assert.throws(
      () => validateAiIntelligenceEventEnvelope({
        ...event,
        occurredAt: "2026-09-09T10:00:00Z",
      }),
      /timestamp_not_canonical/,
    );

    assert.throws(
      () => createAiIntelligenceEventEnvelope({
        ...{
          eventType: "news.article.captured.v1" as const,
          occurredAt: "2026-09-09T10:00:01.000Z",
          recordedAt: "2026-09-09T10:00:00.000Z",
          aggregateType: "news_article",
          aggregateId: "article:abc",
          resourceVersion: "v1",
          correlationId: "capture:run-1",
          dataClass: "public" as const,
          payload: {
            resourceRef: "archive:abc",
            locale: "en",
            evidenceRefs: [],
            status: "captured",
            reasonCodes: [],
          },
        },
      }),
      /ai_intelligence_event_recorded_before_occurred/,
    );
  });
});
