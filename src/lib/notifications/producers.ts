import { createHash } from "crypto";
import type { PoolClient } from "pg";
import { Validate } from "../api-validation";
import {
  createInAppNotification,
  type InAppNotificationRequest,
  type NotificationCreationResult,
} from "./creation";
import type { NotificationPrincipal } from "./principal";

export const DOMAIN_NOTIFICATION_EVENT_TYPES = [
  "academy.lesson_available",
  "academy.assessment_completed",
  "academy.certificate_issued",
  "security.new_login",
  "security.credentials_changed",
  "security.session_revoked",
  "support.ticket_status_changed",
] as const;

export type DomainNotificationEventType =
  (typeof DOMAIN_NOTIFICATION_EVENT_TYPES)[number];

type BaseDomainEvent = {
  eventType: DomainNotificationEventType;
  eventId: string;
  tenantId: string;
  principalId: string;
  occurredAt: string;
  locale: "fa" | "en";
};

export type DomainNotificationEvent =
  | (BaseDomainEvent & {
      eventType: "academy.lesson_available";
      payload: { termId: string; lessonId: string };
    })
  | (BaseDomainEvent & {
      eventType: "academy.assessment_completed";
      payload: {
        assessmentId: string;
        outcome: "passed" | "failed";
      };
    })
  | (BaseDomainEvent & {
      eventType: "academy.certificate_issued";
      payload: { certificateId: string };
    })
  | (BaseDomainEvent & {
      eventType: "security.new_login";
      payload: Record<string, never>;
    })
  | (BaseDomainEvent & {
      eventType: "security.credentials_changed";
      payload: {
        credential: "password" | "passkey" | "two_factor";
      };
    })
  | (BaseDomainEvent & {
      eventType: "security.session_revoked";
      payload: { scope: "single_session" | "all_other_sessions" };
    })
  | (BaseDomainEvent & {
      eventType: "support.ticket_status_changed";
      payload: {
        ticketId: string;
        status: "received" | "in_progress" | "waiting_for_user" | "resolved";
      };
    });

const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]+$/;
const TENANT_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === required.length &&
    keys.every((key, index) => key === [...required].sort()[index])
  );
}

function validIdentifier(value: unknown, minimum = 1, maximum = 220): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    SAFE_IDENTIFIER.test(value)
  );
}

function validOccurredAt(value: unknown): value is string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return false;
  }
  return Date.parse(value) <= Date.now() + 5 * 60_000;
}

function parsePayload(
  eventType: DomainNotificationEventType,
  payload: unknown,
): DomainNotificationEvent["payload"] | null {
  if (!isPlainObject(payload)) return null;

  switch (eventType) {
    case "academy.lesson_available":
      if (
        !hasExactKeys(payload, ["lessonId", "termId"]) ||
        !validIdentifier(payload.lessonId, 1, 120) ||
        !validIdentifier(payload.termId, 1, 120)
      ) {
        return null;
      }
      return { lessonId: payload.lessonId, termId: payload.termId };

    case "academy.assessment_completed":
      if (
        !hasExactKeys(payload, ["assessmentId", "outcome"]) ||
        !validIdentifier(payload.assessmentId, 1, 120) ||
        (payload.outcome !== "passed" && payload.outcome !== "failed")
      ) {
        return null;
      }
      return {
        assessmentId: payload.assessmentId,
        outcome: payload.outcome,
      };

    case "academy.certificate_issued":
      if (
        !hasExactKeys(payload, ["certificateId"]) ||
        !validIdentifier(payload.certificateId, 1, 160)
      ) {
        return null;
      }
      return { certificateId: payload.certificateId };

    case "security.new_login":
      return hasExactKeys(payload, []) ? {} : null;

    case "security.credentials_changed":
      if (
        !hasExactKeys(payload, ["credential"]) ||
        !["password", "passkey", "two_factor"].includes(
          String(payload.credential),
        )
      ) {
        return null;
      }
      return {
        credential: payload.credential as
          | "password"
          | "passkey"
          | "two_factor",
      };

    case "security.session_revoked":
      if (
        !hasExactKeys(payload, ["scope"]) ||
        !["single_session", "all_other_sessions"].includes(
          String(payload.scope),
        )
      ) {
        return null;
      }
      return {
        scope: payload.scope as "single_session" | "all_other_sessions",
      };

    case "support.ticket_status_changed":
      if (
        !hasExactKeys(payload, ["status", "ticketId"]) ||
        !validIdentifier(payload.ticketId, 1, 160) ||
        ![
          "received",
          "in_progress",
          "waiting_for_user",
          "resolved",
        ].includes(String(payload.status))
      ) {
        return null;
      }
      return {
        ticketId: payload.ticketId,
        status: payload.status as
          | "received"
          | "in_progress"
          | "waiting_for_user"
          | "resolved",
      };
  }
}

export function parseDomainNotificationEvent(
  input: unknown,
): DomainNotificationEvent | null {
  if (!isPlainObject(input)) return null;
  if (
    !hasExactKeys(input, [
      "eventId",
      "eventType",
      "locale",
      "occurredAt",
      "payload",
      "principalId",
      "tenantId",
    ]) ||
    !DOMAIN_NOTIFICATION_EVENT_TYPES.includes(
      input.eventType as DomainNotificationEventType,
    ) ||
    !validIdentifier(input.eventId, 8, 200) ||
    typeof input.tenantId !== "string" ||
    !TENANT_ID.test(input.tenantId) ||
    !Validate.uuid(input.principalId) ||
    !validOccurredAt(input.occurredAt) ||
    (input.locale !== "fa" && input.locale !== "en")
  ) {
    return null;
  }

  const eventType = input.eventType as DomainNotificationEventType;
  const payload = parsePayload(eventType, input.payload);
  if (!payload) return null;

  return {
    eventType,
    eventId: input.eventId,
    tenantId: input.tenantId,
    principalId: input.principalId,
    occurredAt: new Date(input.occurredAt).toISOString(),
    locale: input.locale,
    payload,
  } as DomainNotificationEvent;
}

function expiresAt(occurredAt: string, days: number): string {
  return new Date(Date.parse(occurredAt) + days * 86_400_000).toISOString();
}

function correlationKey(event: DomainNotificationEvent): string {
  const digest = createHash("sha256").update(event.eventId).digest("hex");
  return `domain:${event.eventType}:${digest.slice(0, 40)}`;
}

function credentialLabel(
  credential: "password" | "passkey" | "two_factor",
  locale: "fa" | "en",
): string {
  const labels = {
    password: locale === "fa" ? "گذرواژه" : "password",
    passkey: locale === "fa" ? "کلید عبور" : "passkey",
    two_factor:
      locale === "fa" ? "ورود دومرحله‌ای" : "two-factor authentication",
  };
  return labels[credential];
}

function buildNotificationRequest(
  event: DomainNotificationEvent,
): InAppNotificationRequest {
  const isFa = event.locale === "fa";
  const common = {
    sourceType: event.eventType,
    sourceId: event.eventId,
    locale: event.locale,
    correlationKey: correlationKey(event),
    templateAvailable: true,
  } as const;

  switch (event.eventType) {
    case "academy.lesson_available":
      return {
        ...common,
        notificationClass: "academy",
        title: isFa ? "درس بعدی آماده است" : "Your next lesson is ready",
        body: isFa
          ? "می‌توانی مسیر یادگیری آکادمی را از همان نقطه ادامه بدهی."
          : "Continue your Academy learning journey from where you stopped.",
        actionUrl: "/academy/profile",
        urgency: "normal",
        priority: 3,
        cadence: "instant",
        expiresAt: expiresAt(event.occurredAt, 30),
        metadata: {
          templateId: "academy.lesson_available.v1",
          eventOccurredAt: event.occurredAt,
          termId: event.payload.termId,
          lessonId: event.payload.lessonId,
        },
      };

    case "academy.assessment_completed": {
      const passed = event.payload.outcome === "passed";
      return {
        ...common,
        notificationClass: "academy",
        title: isFa
          ? passed
            ? "ارزیابی با موفقیت ثبت شد"
            : "نتیجه ارزیابی آماده است"
          : passed
            ? "Assessment completed successfully"
            : "Your assessment result is ready",
        body: isFa
          ? passed
            ? "نتیجه در پیشرفت آکادمی ثبت شد و قدم بعدی آماده است."
            : "پاسخ‌ها را مرور کن و با تمرکز بیشتر دوباره ادامه بده."
          : passed
            ? "Your result is recorded and the next learning step is available."
            : "Review your answers and continue when you are ready.",
        actionUrl: "/academy/profile",
        urgency: "normal",
        priority: passed ? 4 : 3,
        cadence: "instant",
        expiresAt: expiresAt(event.occurredAt, 30),
        metadata: {
          templateId: "academy.assessment_completed.v1",
          eventOccurredAt: event.occurredAt,
          assessmentId: event.payload.assessmentId,
          outcome: event.payload.outcome,
        },
      };
    }

    case "academy.certificate_issued":
      return {
        ...common,
        notificationClass: "academy",
        title: isFa ? "گواهی آکادمی صادر شد" : "Your Academy certificate is ready",
        body: isFa
          ? "گواهی جدیدت در پروفایل آکادمی در دسترس است."
          : "Your new certificate is available in your Academy profile.",
        actionUrl: "/academy/certificates",
        urgency: "normal",
        priority: 5,
        cadence: "instant",
        expiresAt: expiresAt(event.occurredAt, 90),
        metadata: {
          templateId: "academy.certificate_issued.v1",
          eventOccurredAt: event.occurredAt,
          certificateId: event.payload.certificateId,
        },
      };

    case "security.new_login":
      return {
        ...common,
        notificationClass: "security_critical",
        title: isFa ? "ورود جدید به حساب" : "New account login",
        body: isFa
          ? "یک ورود جدید ثبت شد. اگر این فعالیت متعلق به تو نیست، فوراً نشست‌ها و امنیت حساب را بررسی کن."
          : "A new login was recorded. If this was not you, review sessions and account security immediately.",
        actionUrl: "/security",
        urgency: "high",
        priority: 9,
        cadence: "instant",
        expiresAt: expiresAt(event.occurredAt, 14),
        metadata: {
          templateId: "security.new_login.v1",
          eventOccurredAt: event.occurredAt,
        },
      };

    case "security.credentials_changed": {
      const label = credentialLabel(event.payload.credential, event.locale);
      return {
        ...common,
        notificationClass: "security_critical",
        title: isFa ? "تنظیمات امنیتی تغییر کرد" : "Security settings changed",
        body: isFa
          ? `${label} حساب تغییر کرد. اگر این تغییر را انجام ندادی، فوراً امنیت حساب را بررسی کن.`
          : `Your account ${label} changed. If you did not make this change, review account security immediately.`,
        actionUrl: "/security",
        urgency: "critical",
        priority: 10,
        cadence: "instant",
        expiresAt: expiresAt(event.occurredAt, 30),
        metadata: {
          templateId: "security.credentials_changed.v1",
          eventOccurredAt: event.occurredAt,
          credential: event.payload.credential,
        },
      };
    }

    case "security.session_revoked":
      return {
        ...common,
        notificationClass: "security_critical",
        title: isFa ? "نشست حساب بسته شد" : "Account session revoked",
        body: isFa
          ? "یک تغییر در نشست‌های فعال حساب ثبت شد. نشست‌های باقی‌مانده را بررسی کن."
          : "A change to active account sessions was recorded. Review the remaining sessions.",
        actionUrl: "/security",
        urgency: "high",
        priority: 8,
        cadence: "instant",
        expiresAt: expiresAt(event.occurredAt, 14),
        metadata: {
          templateId: "security.session_revoked.v1",
          eventOccurredAt: event.occurredAt,
          scope: event.payload.scope,
        },
      };

    case "support.ticket_status_changed": {
      const statusLabels = {
        received: isFa ? "دریافت شد" : "received",
        in_progress: isFa ? "در حال بررسی" : "in progress",
        waiting_for_user: isFa ? "منتظر پاسخ تو" : "waiting for your reply",
        resolved: isFa ? "حل شد" : "resolved",
      };
      return {
        ...common,
        notificationClass: "product_support",
        title: isFa ? "وضعیت درخواست پشتیبانی تغییر کرد" : "Support request updated",
        body: isFa
          ? `وضعیت درخواست پشتیبانی به «${statusLabels[event.payload.status]}» تغییر کرد.`
          : `Your support request is now ${statusLabels[event.payload.status]}.`,
        actionUrl: `/support/tickets/${encodeURIComponent(event.payload.ticketId)}`,
        urgency:
          event.payload.status === "waiting_for_user" ? "high" : "normal",
        priority: event.payload.status === "waiting_for_user" ? 6 : 4,
        cadence: "instant",
        expiresAt: expiresAt(event.occurredAt, 60),
        metadata: {
          templateId: "support.ticket_status_changed.v1",
          eventOccurredAt: event.occurredAt,
          ticketId: event.payload.ticketId,
          status: event.payload.status,
        },
      };
    }
  }
}

async function loadPrincipalForEvent(
  client: PoolClient,
  event: DomainNotificationEvent,
): Promise<NotificationPrincipal> {
  const result = await client.query<{
    id: string;
    tenant_id: string;
    account_id: string | null;
    student_id: string | null;
    email: string | null;
    status: NotificationPrincipal["status"];
    locale: "fa" | "en";
  }>(
    `SELECT id, tenant_id, account_id, student_id, email, status, locale
       FROM platform_principals
      WHERE tenant_id = $1 AND id = $2::uuid
      FOR SHARE`,
    [event.tenantId, event.principalId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("notification_event_principal_not_found");
  if (row.status !== "active") {
    throw new Error("notification_principal_inactive");
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    accountId: row.account_id,
    studentId: row.student_id,
    email: row.email,
    status: row.status,
    locale: row.locale,
  };
}

/**
 * Trusted internal producer boundary. It accepts only a runtime-validated domain
 * event and maps it to a controlled template before the policy/outbox runtime.
 * API routes, queue payloads and AI agents must not call createInAppNotification
 * directly with arbitrary title/body/class/urgency values.
 */
export async function produceDomainNotification(
  client: PoolClient,
  input: unknown,
  options: { now?: string } = {},
): Promise<NotificationCreationResult> {
  const event = parseDomainNotificationEvent(input);
  if (!event) throw new Error("notification_domain_event_invalid");

  const principal = await loadPrincipalForEvent(client, event);
  return createInAppNotification(
    client,
    principal,
    buildNotificationRequest(event),
    options,
  );
}
