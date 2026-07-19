import { createHash } from "crypto";
import type { PoolClient } from "pg";
import type { NotificationCreationResult } from "./creation";
import { createInAppNotification } from "./creation";
import type { NotificationPrincipal } from "./principal";

type NotificationProducerEventBase = {
  id: string;
  tenantId: string;
  principalId: string;
  occurredAt: string;
  locale: "fa" | "en";
  version: 1;
};

export type AcademyLessonAvailableEvent = NotificationProducerEventBase & {
  type: "academy.lesson_available";
  payload: {
    termNumber: number;
    lessonSlug: string;
    lessonTitle: string;
  };
};

export type AcademyAssessmentCompletedEvent = NotificationProducerEventBase & {
  type: "academy.assessment_completed";
  payload: {
    assessmentId: string;
    title: string;
    score: number;
    passed: boolean;
  };
};

export type AcademyCertificateIssuedEvent = NotificationProducerEventBase & {
  type: "academy.certificate_issued";
  payload: {
    certificateId: string;
    title: string;
  };
};

export type SecurityNewLoginEvent = NotificationProducerEventBase & {
  type: "security.new_login";
  payload: Record<string, never>;
};

export type SecurityCredentialChangedEvent = NotificationProducerEventBase & {
  type: "security.credential_changed";
  payload: {
    credential: "password" | "passkey" | "two_factor";
  };
};

export type SecuritySessionRevokedEvent = NotificationProducerEventBase & {
  type: "security.session_revoked";
  payload: {
    scope: "one" | "all_other" | "all";
  };
};

export type SupportTicketStatusChangedEvent = NotificationProducerEventBase & {
  type: "support.ticket_status_changed";
  payload: {
    ticketId: string;
    status: "received" | "in_progress" | "waiting_for_user" | "resolved" | "closed";
  };
};

export type NotificationProducerEvent =
  | AcademyLessonAvailableEvent
  | AcademyAssessmentCompletedEvent
  | AcademyCertificateIssuedEvent
  | SecurityNewLoginEvent
  | SecurityCredentialChangedEvent
  | SecuritySessionRevokedEvent
  | SupportTicketStatusChangedEvent;

const ROOT_KEYS = [
  "id",
  "tenantId",
  "principalId",
  "occurredAt",
  "locale",
  "version",
  "type",
  "payload",
] as const;

const TEMPLATE_IDS = {
  lessonAvailable: "academy.lesson-available.v1",
  assessmentCompleted: "academy.assessment-completed.v1",
  certificateIssued: "academy.certificate-issued.v1",
  securityNewLogin: "security.new-login.v1",
  securityCredentialChanged: "security.credential-changed.v1",
  securitySessionRevoked: "security.session-revoked.v1",
  supportTicketStatusChanged: "support.ticket-status-changed.v1",
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function text(
  value: unknown,
  minimum: number,
  maximum: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= minimum && normalized.length <= maximum
    ? normalized
    : null;
}

function uuid(value: unknown): string | null {
  const normalized = text(value, 36, 36);
  return normalized &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalized,
    )
    ? normalized.toLowerCase()
    : null;
}

function eventId(value: unknown): string | null {
  const normalized = text(value, 8, 180);
  return normalized && /^[A-Za-z0-9._:-]+$/.test(normalized)
    ? normalized
    : null;
}

function occurredAt(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  const normalized = new Date(value).toISOString();
  if (normalized !== value) return null;
  if (Date.parse(normalized) > Date.now() + 5 * 60_000) return null;
  return normalized;
}

function locale(value: unknown): "fa" | "en" | null {
  return value === "fa" || value === "en" ? value : null;
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  return Number.isInteger(value) &&
    Number(value) >= minimum &&
    Number(value) <= maximum
    ? Number(value)
    : null;
}

function validatedPayloadHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function parseRoot(value: unknown) {
  if (!isPlainObject(value) || !hasExactKeys(value, ROOT_KEYS)) return null;
  const id = eventId(value.id);
  const tenantId = text(value.tenantId, 1, 100);
  const principalId = uuid(value.principalId);
  const occurred = occurredAt(value.occurredAt);
  const selectedLocale = locale(value.locale);
  if (
    !id ||
    !tenantId ||
    !principalId ||
    !occurred ||
    !selectedLocale ||
    value.version !== 1 ||
    typeof value.type !== "string" ||
    !isPlainObject(value.payload)
  ) {
    return null;
  }
  return {
    id,
    tenantId,
    principalId,
    occurredAt: occurred,
    locale: selectedLocale,
    version: 1 as const,
    type: value.type,
    payload: value.payload,
  };
}

export function parseNotificationProducerEvent(
  value: unknown,
): NotificationProducerEvent | null {
  const root = parseRoot(value);
  if (!root) return null;

  switch (root.type) {
    case "academy.lesson_available": {
      if (!hasExactKeys(root.payload, ["termNumber", "lessonSlug", "lessonTitle"])) {
        return null;
      }
      const termNumber = integer(root.payload.termNumber, 1, 100);
      const lessonSlug = text(root.payload.lessonSlug, 1, 120);
      const lessonTitle = text(root.payload.lessonTitle, 1, 160);
      return termNumber && lessonSlug && lessonTitle
        ? {
            ...root,
            type: root.type,
            payload: { termNumber, lessonSlug, lessonTitle },
          }
        : null;
    }
    case "academy.assessment_completed": {
      if (!hasExactKeys(root.payload, ["assessmentId", "title", "score", "passed"])) {
        return null;
      }
      const assessmentId = text(root.payload.assessmentId, 1, 180);
      const title = text(root.payload.title, 1, 160);
      const score = integer(root.payload.score, 0, 100);
      return assessmentId &&
        title &&
        score !== null &&
        typeof root.payload.passed === "boolean"
        ? {
            ...root,
            type: root.type,
            payload: {
              assessmentId,
              title,
              score,
              passed: root.payload.passed,
            },
          }
        : null;
    }
    case "academy.certificate_issued": {
      if (!hasExactKeys(root.payload, ["certificateId", "title"])) return null;
      const certificateId = text(root.payload.certificateId, 1, 180);
      const title = text(root.payload.title, 1, 160);
      return certificateId && title
        ? { ...root, type: root.type, payload: { certificateId, title } }
        : null;
    }
    case "security.new_login":
      return hasExactKeys(root.payload, [])
        ? { ...root, type: root.type, payload: {} }
        : null;
    case "security.credential_changed": {
      if (!hasExactKeys(root.payload, ["credential"])) return null;
      const credential = root.payload.credential;
      return credential === "password" ||
        credential === "passkey" ||
        credential === "two_factor"
        ? { ...root, type: root.type, payload: { credential } }
        : null;
    }
    case "security.session_revoked": {
      if (!hasExactKeys(root.payload, ["scope"])) return null;
      const scope = root.payload.scope;
      return scope === "one" || scope === "all_other" || scope === "all"
        ? { ...root, type: root.type, payload: { scope } }
        : null;
    }
    case "support.ticket_status_changed": {
      if (!hasExactKeys(root.payload, ["ticketId", "status"])) return null;
      const ticketId = text(root.payload.ticketId, 1, 180);
      const status = root.payload.status;
      return ticketId &&
        (status === "received" ||
          status === "in_progress" ||
          status === "waiting_for_user" ||
          status === "resolved" ||
          status === "closed")
        ? { ...root, type: root.type, payload: { ticketId, status } }
        : null;
    }
    default:
      return null;
  }
}

function expiresAt(
  event: NotificationProducerEvent,
  milliseconds: number,
): string {
  return new Date(Date.parse(event.occurredAt) + milliseconds).toISOString();
}

function credentialLabel(
  localeValue: "fa" | "en",
  credential: SecurityCredentialChangedEvent["payload"]["credential"],
): string {
  const labels = {
    fa: {
      password: "رمز عبور",
      passkey: "کلید عبور",
      two_factor: "تأیید دومرحله‌ای",
    },
    en: {
      password: "password",
      passkey: "passkey",
      two_factor: "two-factor authentication",
    },
  } as const;
  return labels[localeValue][credential];
}

function supportStatusLabel(
  localeValue: "fa" | "en",
  status: SupportTicketStatusChangedEvent["payload"]["status"],
): string {
  const labels = {
    fa: {
      received: "دریافت شد",
      in_progress: "در حال بررسی است",
      waiting_for_user: "منتظر پاسخ شماست",
      resolved: "حل شد",
      closed: "بسته شد",
    },
    en: {
      received: "was received",
      in_progress: "is under review",
      waiting_for_user: "is waiting for your response",
      resolved: "was resolved",
      closed: "was closed",
    },
  } as const;
  return labels[localeValue][status];
}

export function buildNotificationRequest(event: NotificationProducerEvent) {
  const fa = event.locale === "fa";
  const base = {
    sourceType: event.type,
    sourceId: event.id,
    locale: event.locale,
    cadence: "instant" as const,
    correlationKey: `${event.type}:${event.id}`,
    templateAvailable: true,
    metadata: {
      producerEventId: event.id,
      producerEventType: event.type,
      producerEventVersion: event.version,
      producerOccurredAt: event.occurredAt,
      producerPayloadHash: validatedPayloadHash(event.payload),
    },
  };

  switch (event.type) {
    case "academy.lesson_available":
      return {
        ...base,
        notificationClass: "academy" as const,
        title: fa
          ? "درس بعدی آکادمی آماده است"
          : "Your next Academy lesson is ready",
        body: fa
          ? `«${event.payload.lessonTitle}» در ترم ${event.payload.termNumber.toLocaleString("fa-IR")} آماده ادامه است.`
          : `“${event.payload.lessonTitle}” is ready in term ${event.payload.termNumber}.`,
        actionUrl: `/academy/term-${event.payload.termNumber}`,
        urgency: "normal" as const,
        priority: 3,
        expiresAt: expiresAt(event, 7 * 24 * 60 * 60_000),
        metadata: {
          ...base.metadata,
          templateId: TEMPLATE_IDS.lessonAvailable,
        },
      };
    case "academy.assessment_completed":
      return {
        ...base,
        notificationClass: "academy" as const,
        title: fa ? "نتیجه ارزیابی ثبت شد" : "Assessment result recorded",
        body: fa
          ? `نتیجه «${event.payload.title}» با امتیاز ${event.payload.score.toLocaleString("fa-IR")} ثبت شد${event.payload.passed ? " و با موفقیت گذرانده شد." : "."}`
          : `Your result for “${event.payload.title}” was recorded with a score of ${event.payload.score}${event.payload.passed ? " and marked as passed." : "."}`,
        actionUrl: "/academy/profile",
        urgency: "normal" as const,
        priority: event.payload.passed ? 3 : 4,
        expiresAt: expiresAt(event, 30 * 24 * 60 * 60_000),
        metadata: {
          ...base.metadata,
          templateId: TEMPLATE_IDS.assessmentCompleted,
        },
      };
    case "academy.certificate_issued":
      return {
        ...base,
        notificationClass: "academy" as const,
        title: fa ? "گواهی آکادمی صادر شد" : "Academy certificate issued",
        body: fa
          ? `گواهی «${event.payload.title}» صادر شد و در پروفایل آموزشی شما آماده مشاهده است.`
          : `Your “${event.payload.title}” certificate is ready in your learning profile.`,
        actionUrl: "/academy/certificates",
        urgency: "normal" as const,
        priority: 4,
        expiresAt: expiresAt(event, 365 * 24 * 60 * 60_000),
        metadata: {
          ...base.metadata,
          templateId: TEMPLATE_IDS.certificateIssued,
        },
      };
    case "security.new_login":
      return {
        ...base,
        notificationClass: "security_critical" as const,
        title: fa
          ? "ورود جدید به حساب تک‌پی"
          : "New sign-in to your TecPey account",
        body: fa
          ? "یک ورود جدید ثبت شد. اگر این فعالیت متعلق به شما نیست، نشست‌ها و تنظیمات امنیتی را بررسی کنید."
          : "A new sign-in was recorded. If this was not you, review your sessions and security settings.",
        actionUrl: "/academy/security",
        urgency: "critical" as const,
        priority: 10,
        expiresAt: expiresAt(event, 7 * 24 * 60 * 60_000),
        metadata: {
          ...base.metadata,
          templateId: TEMPLATE_IDS.securityNewLogin,
        },
      };
    case "security.credential_changed": {
      const label = credentialLabel(event.locale, event.payload.credential);
      return {
        ...base,
        notificationClass: "security_critical" as const,
        title: fa ? `${label} تغییر کرد` : `Your ${label} changed`,
        body: fa
          ? "اگر این تغییر را انجام نداده‌اید، فوراً نشست‌های فعال و امنیت حساب را بررسی کنید."
          : "If you did not make this change, review active sessions and account security immediately.",
        actionUrl: "/academy/security",
        urgency: "critical" as const,
        priority: 10,
        expiresAt: expiresAt(event, 30 * 24 * 60 * 60_000),
        metadata: {
          ...base.metadata,
          templateId: TEMPLATE_IDS.securityCredentialChanged,
        },
      };
    }
    case "security.session_revoked":
      return {
        ...base,
        notificationClass: "security_critical" as const,
        title: fa ? "نشست حساب لغو شد" : "Account session revoked",
        body: fa
          ? "یک یا چند نشست حساب بر اساس درخواست امنیتی لغو شد. امنیت حساب را بررسی کنید."
          : "One or more account sessions were revoked following a security action. Review account security.",
        actionUrl: "/academy/security",
        urgency: "critical" as const,
        priority: 9,
        expiresAt: expiresAt(event, 30 * 24 * 60 * 60_000),
        metadata: {
          ...base.metadata,
          templateId: TEMPLATE_IDS.securitySessionRevoked,
        },
      };
    case "support.ticket_status_changed": {
      const status = supportStatusLabel(event.locale, event.payload.status);
      return {
        ...base,
        notificationClass: "product_support" as const,
        title: fa
          ? "وضعیت درخواست پشتیبانی تغییر کرد"
          : "Support request status changed",
        body: fa
          ? `درخواست پشتیبانی ${event.payload.ticketId.slice(0, 8)} اکنون «${status}».`
          : `Support request ${event.payload.ticketId.slice(0, 8)} ${status}.`,
        actionUrl: "/support",
        urgency:
          event.payload.status === "waiting_for_user"
            ? ("high" as const)
            : ("normal" as const),
        priority: event.payload.status === "waiting_for_user" ? 6 : 4,
        expiresAt: expiresAt(event, 30 * 24 * 60 * 60_000),
        metadata: {
          ...base.metadata,
          templateId: TEMPLATE_IDS.supportTicketStatusChanged,
        },
      };
    }
  }
}

type PrincipalRow = {
  id: string;
  tenant_id: string;
  account_id: string | null;
  student_id: string | null;
  status: NotificationPrincipal["status"];
  locale: "fa" | "en";
};

async function loadPrincipalForEvent(
  client: PoolClient,
  tenantId: string,
  principalId: string,
): Promise<NotificationPrincipal> {
  const result = await client.query<PrincipalRow>(
    `SELECT id, tenant_id, account_id, student_id, status, locale
       FROM platform_principals
      WHERE tenant_id = $1 AND id = $2::uuid
      LIMIT 1
      FOR SHARE`,
    [tenantId, principalId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("notification_principal_not_found");
  if (row.status !== "active") throw new Error("notification_principal_inactive");
  return {
    id: row.id,
    tenantId: row.tenant_id,
    accountId: row.account_id,
    studentId: row.student_id,
    status: row.status,
    locale: row.locale,
  };
}

/**
 * Trusted internal producer boundary. Callers provide only a versioned domain
 * event; templates, class, urgency, action URL, expiry, policy evaluation and
 * outbox creation remain server-owned. Event time is retained as provenance;
 * current processing time remains the sole policy authority.
 */
export async function produceDomainNotification(
  client: PoolClient,
  rawEvent: unknown,
): Promise<NotificationCreationResult> {
  const event = parseNotificationProducerEvent(rawEvent);
  if (!event) throw new Error("notification_domain_event_invalid");
  const principal = await loadPrincipalForEvent(
    client,
    event.tenantId,
    event.principalId,
  );
  if (event.locale !== principal.locale) {
    throw new Error("notification_event_locale_mismatch");
  }
  const request = buildNotificationRequest(event);
  return createInAppNotification(client, principal, request);
}
