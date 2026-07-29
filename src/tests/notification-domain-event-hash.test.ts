import assert from "node:assert/strict";
import test from "node:test";
import { hashNotificationDomainEvent } from "../lib/notifications/domain-event-hash";
import type { SupportTicketStatusChangedEvent } from "../lib/notifications/producers";

const base = {
  id: "support-event:canonical-hash-test",
  tenantId: "tecpey",
  principalId: "11111111-1111-4111-8111-111111111111",
  occurredAt: "2026-07-19T12:00:00.000Z",
  locale: "fa" as const,
  version: 1 as const,
  type: "support.ticket_status_changed" as const,
};

test("domain event fingerprint is independent of object key insertion order", () => {
  const first: SupportTicketStatusChangedEvent = {
    ...base,
    payload: { ticketId: "ticket-12345678", status: "received" },
  };
  const second = {
    ...base,
    payload: { status: "received", ticketId: "ticket-12345678" },
  } as SupportTicketStatusChangedEvent;

  assert.equal(
    hashNotificationDomainEvent(first),
    hashNotificationDomainEvent(second),
  );
});

test("domain event fingerprint changes when validated semantic content changes", () => {
  const received: SupportTicketStatusChangedEvent = {
    ...base,
    payload: { ticketId: "ticket-12345678", status: "received" },
  };
  const resolved: SupportTicketStatusChangedEvent = {
    ...base,
    payload: { ticketId: "ticket-12345678", status: "resolved" },
  };

  assert.notEqual(
    hashNotificationDomainEvent(received),
    hashNotificationDomainEvent(resolved),
  );
});
