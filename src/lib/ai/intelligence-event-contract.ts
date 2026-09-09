import { createHash, randomUUID } from "node:crypto";

import type { AiDataClass } from "./control-plane-catalog";

export const AI_INTELLIGENCE_EVENT_TYPES = [
  "news.article.captured.v1",
  "news.article.localized.v1",
  "news.article.published.v1",
  "growth.signal.accepted.v1",
  "content.publication_candidate.created.v1",
  "content.published.v1",
  "knowledge.candidate.created.v1",
  "knowledge.promoted.v1",
  "mentor.knowledge.refresh_requested.v1",
  "mentor.profile.refresh_requested.v1",
] as const;

export type AiIntelligenceEventType =
  (typeof AI_INTELLIGENCE_EVENT_TYPES)[number];

export type AiIntelligenceEventPayload = Readonly<{
  resourceRef: string;
  locale: string | null;
  evidenceRefs: readonly string[];
  status: string;
  reasonCodes: readonly string[];
}>;

export type AiIntelligenceEventEnvelope = Readonly<{
  eventId: string;
  eventType: AiIntelligenceEventType;
  schemaVersion: 1;
  occurredAt: string;
  recordedAt: string;
  tenantId: string | null;
  workspaceId: string | null;
  aggregateType: string;
  aggregateId: string;
  resourceVersion: string;
  correlationId: string;
  causationId: string | null;
  idempotencyKey: string;
  dataClass: AiDataClass;
  payloadHash: string;
  payload: AiIntelligenceEventPayload;
}>;

const SAFE_TOKEN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedToken(value: string, field: string, max = 256): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max || !SAFE_TOKEN.test(normalized)) {
    throw new Error(`ai_intelligence_event_${field}_invalid`);
  }
  return normalized;
}

function safeScope(
  value: string | null | undefined,
  field: "tenant_id" | "workspace_id",
): string | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  return boundedToken(value, field, 160);
}

function assertScopePolicy(input: {
  tenantId: string | null;
  workspaceId: string | null;
  dataClass: AiDataClass;
}): void {
  if ((input.tenantId === null) !== (input.workspaceId === null)) {
    throw new Error("ai_intelligence_event_scope_partial");
  }
  if (
    (input.dataClass === "private_user" || input.dataClass === "restricted_admin") &&
    (input.tenantId === null || input.workspaceId === null)
  ) {
    throw new Error("ai_intelligence_event_sensitive_scope_required");
  }
}

function safeLocale(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(normalized)) {
    throw new Error("ai_intelligence_event_locale_invalid");
  }
  return normalized;
}

function safeCodes(values: readonly string[], field: string, maxItems: number): readonly string[] {
  if (values.length > maxItems) throw new Error(`ai_intelligence_event_${field}_too_many`);
  const normalized = values.map((value) => boundedToken(value, field, 160));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`ai_intelligence_event_${field}_duplicate`);
  }
  return Object.freeze([...normalized].sort());
}

function validIso(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`ai_intelligence_event_${field}_invalid`);
  return new Date(parsed).toISOString();
}

function hashPayload(payload: AiIntelligenceEventPayload): string {
  return createHash("sha256")
    .update("tecpey-intelligence-event-payload:v1\0")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function intelligenceEventIdempotencyKey(input: {
  eventType: AiIntelligenceEventType;
  tenantId?: string | null;
  workspaceId?: string | null;
  aggregateType: string;
  aggregateId: string;
  resourceVersion: string;
  status: string;
  dataClass: AiDataClass;
}): string {
  const tenantId = safeScope(input.tenantId, "tenant_id");
  const workspaceId = safeScope(input.workspaceId, "workspace_id");
  assertScopePolicy({ tenantId, workspaceId, dataClass: input.dataClass });
  const canonical = [
    input.eventType,
    input.dataClass,
    tenantId ?? "global",
    workspaceId ?? "global",
    boundedToken(input.aggregateType, "aggregate_type", 120),
    boundedToken(input.aggregateId, "aggregate_id", 256),
    boundedToken(input.resourceVersion, "resource_version", 256),
    boundedToken(input.status, "status", 120),
  ].join("\0");
  return createHash("sha256")
    .update("tecpey-intelligence-event-idempotency:v2\0")
    .update(canonical)
    .digest("hex");
}

export function createAiIntelligenceEventEnvelope(input: {
  eventType: AiIntelligenceEventType;
  occurredAt: string;
  tenantId?: string | null;
  workspaceId?: string | null;
  aggregateType: string;
  aggregateId: string;
  resourceVersion: string;
  correlationId: string;
  causationId?: string | null;
  dataClass: AiDataClass;
  payload: AiIntelligenceEventPayload;
  eventId?: string;
  recordedAt?: string;
}): AiIntelligenceEventEnvelope {
  const eventId = input.eventId ?? randomUUID();
  if (!UUID.test(eventId)) throw new Error("ai_intelligence_event_id_invalid");
  const tenantId = safeScope(input.tenantId, "tenant_id");
  const workspaceId = safeScope(input.workspaceId, "workspace_id");
  assertScopePolicy({ tenantId, workspaceId, dataClass: input.dataClass });

  const occurredAt = validIso(input.occurredAt, "occurred_at");
  const recordedAt = validIso(input.recordedAt ?? new Date().toISOString(), "recorded_at");
  if (Date.parse(recordedAt) < Date.parse(occurredAt)) {
    throw new Error("ai_intelligence_event_recorded_before_occurred");
  }

  const correlationId = boundedToken(input.correlationId, "correlation_id", 256);
  const aggregateType = boundedToken(input.aggregateType, "aggregate_type", 120);
  const aggregateId = boundedToken(input.aggregateId, "aggregate_id", 256);
  const resourceVersion = boundedToken(input.resourceVersion, "resource_version", 256);
  const status = boundedToken(input.payload.status, "status", 120);
  const payload: AiIntelligenceEventPayload = Object.freeze({
    resourceRef: boundedToken(input.payload.resourceRef, "resource_ref", 256),
    locale: safeLocale(input.payload.locale),
    evidenceRefs: safeCodes(input.payload.evidenceRefs, "evidence_ref", 40),
    status,
    reasonCodes: safeCodes(input.payload.reasonCodes, "reason_code", 40),
  });
  const idempotencyKey = intelligenceEventIdempotencyKey({
    eventType: input.eventType,
    tenantId,
    workspaceId,
    aggregateType,
    aggregateId,
    resourceVersion,
    status,
    dataClass: input.dataClass,
  });
  const causationId = input.causationId?.trim() || null;
  if (causationId !== null && !UUID.test(causationId) && !HEX_64.test(causationId)) {
    throw new Error("ai_intelligence_event_causation_id_invalid");
  }

  return Object.freeze({
    eventId,
    eventType: input.eventType,
    schemaVersion: 1,
    occurredAt,
    recordedAt,
    tenantId,
    workspaceId,
    aggregateType,
    aggregateId,
    resourceVersion,
    correlationId,
    causationId,
    idempotencyKey,
    dataClass: input.dataClass,
    payloadHash: hashPayload(payload),
    payload,
  });
}

export function validateAiIntelligenceEventEnvelope(
  event: AiIntelligenceEventEnvelope,
): void {
  if (!AI_INTELLIGENCE_EVENT_TYPES.includes(event.eventType)) {
    throw new Error("ai_intelligence_event_type_invalid");
  }
  if (event.schemaVersion !== 1) throw new Error("ai_intelligence_event_schema_version_invalid");
  if (!UUID.test(event.eventId)) throw new Error("ai_intelligence_event_id_invalid");

  const tenantId = safeScope(event.tenantId, "tenant_id");
  const workspaceId = safeScope(event.workspaceId, "workspace_id");
  if (tenantId !== event.tenantId || workspaceId !== event.workspaceId) {
    throw new Error("ai_intelligence_event_scope_not_canonical");
  }
  assertScopePolicy({ tenantId, workspaceId, dataClass: event.dataClass });
  if (boundedToken(event.aggregateType, "aggregate_type", 120) !== event.aggregateType) {
    throw new Error("ai_intelligence_event_aggregate_type_not_canonical");
  }
  if (boundedToken(event.aggregateId, "aggregate_id", 256) !== event.aggregateId) {
    throw new Error("ai_intelligence_event_aggregate_id_not_canonical");
  }
  if (boundedToken(event.resourceVersion, "resource_version", 256) !== event.resourceVersion) {
    throw new Error("ai_intelligence_event_resource_version_not_canonical");
  }
  if (boundedToken(event.correlationId, "correlation_id", 256) !== event.correlationId) {
    throw new Error("ai_intelligence_event_correlation_id_not_canonical");
  }
  if (
    event.causationId !== null &&
    !UUID.test(event.causationId) &&
    !HEX_64.test(event.causationId)
  ) {
    throw new Error("ai_intelligence_event_causation_id_invalid");
  }

  const canonicalPayload: AiIntelligenceEventPayload = Object.freeze({
    resourceRef: boundedToken(event.payload.resourceRef, "resource_ref", 256),
    locale: safeLocale(event.payload.locale),
    evidenceRefs: safeCodes(event.payload.evidenceRefs, "evidence_ref", 40),
    status: boundedToken(event.payload.status, "status", 120),
    reasonCodes: safeCodes(event.payload.reasonCodes, "reason_code", 40),
  });
  if (JSON.stringify(canonicalPayload) !== JSON.stringify(event.payload)) {
    throw new Error("ai_intelligence_event_payload_not_canonical");
  }
  if (!HEX_64.test(event.payloadHash) || event.payloadHash !== hashPayload(canonicalPayload)) {
    throw new Error("ai_intelligence_event_payload_hash_invalid");
  }

  const expectedIdempotency = intelligenceEventIdempotencyKey({
    eventType: event.eventType,
    tenantId,
    workspaceId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    resourceVersion: event.resourceVersion,
    status: event.payload.status,
    dataClass: event.dataClass,
  });
  if (!HEX_64.test(event.idempotencyKey) || expectedIdempotency !== event.idempotencyKey) {
    throw new Error("ai_intelligence_event_idempotency_mismatch");
  }

  const occurredAt = validIso(event.occurredAt, "occurred_at");
  const recordedAt = validIso(event.recordedAt, "recorded_at");
  if (occurredAt !== event.occurredAt || recordedAt !== event.recordedAt) {
    throw new Error("ai_intelligence_event_timestamp_not_canonical");
  }
  if (Date.parse(recordedAt) < Date.parse(occurredAt)) {
    throw new Error("ai_intelligence_event_recorded_before_occurred");
  }
}
