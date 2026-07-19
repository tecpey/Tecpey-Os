import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNotificationRequest,
  parseNotificationProducerEvent,
  type AcademyAssessmentCompletedEvent,
  type AcademyCertificateIssuedEvent,
  type AcademyLessonAvailableEvent,
  type SecurityNewLoginEvent,
  type SupportTicketStatusChangedEvent,
} from "../lib/notifications/producers";

const principalId = "11111111-1111-4111-8111-111111111111";

function base(locale: "fa" | "en") {
  return {
    tenantId: "tecpey",
    principalId,
    occurredAt: "2026-07-19T12:00:00.000Z",
    locale,
    version: 1 as const,
  };
}

function lesson(locale: "fa" | "en", termNumber = 1): AcademyLessonAvailableEvent {
  return {
    ...base(locale),
    id: `academy-lesson-${locale}-${termNumber}`,
    type: "academy.lesson_available",
    payload: {
      termNumber,
      lessonSlug: "risk-foundations",
      lessonTitle: locale === "fa" ? "مبانی مدیریت ریسک" : "Risk foundations",
    },
  };
}

test("producer v1 accepts only the seven current Academy terms", () => {
  assert.ok(parseNotificationProducerEvent(lesson("fa", 7)));
  assert.equal(parseNotificationProducerEvent(lesson("fa", 8)), null);
});

test("producer text fields reject unsafe control characters", () => {
  const event = lesson("fa");
  assert.equal(
    parseNotificationProducerEvent({
      ...event,
      payload: { ...event.payload, lessonTitle: "عنوان\u0000ناامن" },
    }),
    null,
  );
});

test("English templates resolve to existing English surfaces", () => {
  const lessonEvent = lesson("en");
  const assessment: AcademyAssessmentCompletedEvent = {
    ...base("en"),
    id: "assessment-event-en",
    type: "academy.assessment_completed",
    payload: {
      assessmentId: "assessment-1",
      title: "Risk assessment",
      score: 92,
      passed: true,
    },
  };
  const certificate: AcademyCertificateIssuedEvent = {
    ...base("en"),
    id: "certificate-event-en",
    type: "academy.certificate_issued",
    payload: { certificateId: "certificate-1", title: "Term One" },
  };
  const security: SecurityNewLoginEvent = {
    ...base("en"),
    id: "security-event-en",
    type: "security.new_login",
    payload: {},
  };
  const support: SupportTicketStatusChangedEvent = {
    ...base("en"),
    id: "support-event-en",
    type: "support.ticket_status_changed",
    payload: { ticketId: "ticket-12345678", status: "in_progress" },
  };

  assert.equal(buildNotificationRequest(lessonEvent).actionUrl, "/en/academy/profile");
  assert.equal(buildNotificationRequest(assessment).actionUrl, "/en/academy/profile");
  assert.equal(buildNotificationRequest(certificate).actionUrl, "/en/academy/certificates");
  assert.equal(buildNotificationRequest(security).actionUrl, "/en/security");
  assert.equal(buildNotificationRequest(support).actionUrl, "/en/support");
});
