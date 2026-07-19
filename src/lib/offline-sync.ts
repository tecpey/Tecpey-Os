export type OfflineEventType =
  | "lesson_viewed"
  | "lesson_note_saved"
  | "journal_created"
  | "replay_practice_saved"
  | "practice_quiz_attempted"
  | "notification_opened";

export type OfflineSyncItem = {
  id: string;
  eventType: OfflineEventType;
  source: "web" | "pwa" | "android" | "ios";
  locale: "fa" | "en";
  clientCreatedAt: string;
  payload: Record<string, unknown>;
};

export type OfflineSyncResult = {
  id: string;
  status: "accepted" | "rejected";
  reason?: string;
  replayed?: boolean;
  learningEventId?: string;
};

export const offlineClientEvents: OfflineEventType[] = [
  "lesson_viewed",
  "lesson_note_saved",
  "journal_created",
  "replay_practice_saved",
  "practice_quiz_attempted",
  "notification_opened",
];

const allowedOfflineEvents = new Set<OfflineEventType>(offlineClientEvents);
const serverOnlyEvents = new Set([
  "lesson_completed",
  "term_unlocked",
  "certificate_issued",
  "badge_earned",
  "rank_changed",
  "final_exam_passed",
  "arena_trade_verified",
]);
const CLIENT_EVENT_ID_RE = /^[A-Za-z0-9._:-]{8,200}$/;
const MAX_PAYLOAD_BYTES = 8_000;
const MAX_PAST_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function sanitizeOfflineText(value: unknown, max = 500) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cloneBoundedPayload(
  payload: unknown,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  try {
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, "utf8") > MAX_PAYLOAD_BYTES) return null;
    const parsed = JSON.parse(serialized) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function normalizeOfflineSyncItem(
  input: unknown,
):
  | { ok: true; item: OfflineSyncItem }
  | { ok: false; reason: string; id?: string } {
  const raw =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const id = sanitizeOfflineText(raw.id, 200);
  if (!CLIENT_EVENT_ID_RE.test(id)) {
    return { ok: false, reason: "invalid_event_id", id: id || undefined };
  }

  const eventType = sanitizeOfflineText(raw.eventType, 80) as OfflineEventType;
  if (serverOnlyEvents.has(eventType)) {
    return { ok: false, reason: "server_event_only", id };
  }
  if (!allowedOfflineEvents.has(eventType)) {
    return { ok: false, reason: "invalid_event", id };
  }

  const sourceRaw = sanitizeOfflineText(raw.source, 24);
  const source: OfflineSyncItem["source"] =
    sourceRaw === "android" ||
    sourceRaw === "ios" ||
    sourceRaw === "pwa"
      ? sourceRaw
      : "web";
  const locale = sanitizeOfflineText(raw.locale, 8) === "en" ? "en" : "fa";

  const clientCreatedAtRaw = sanitizeOfflineText(raw.clientCreatedAt, 40);
  const clientCreatedAtMs = Date.parse(clientCreatedAtRaw);
  const now = Date.now();
  if (
    !Number.isFinite(clientCreatedAtMs) ||
    clientCreatedAtMs > now + MAX_FUTURE_SKEW_MS ||
    clientCreatedAtMs < now - MAX_PAST_AGE_MS
  ) {
    return { ok: false, reason: "invalid_client_timestamp", id };
  }

  const payload = cloneBoundedPayload(raw.payload);
  if (!payload) return { ok: false, reason: "invalid_payload", id };

  return {
    ok: true,
    item: {
      id,
      eventType,
      source,
      locale,
      clientCreatedAt: new Date(clientCreatedAtMs).toISOString(),
      payload,
    },
  };
}

export function offlineManifest(locale: "fa" | "en" = "fa") {
  const isFa = locale === "fa";
  return {
    version: "phase4-offline-foundation-v2",
    locale,
    offlineReady: [
      {
        key: "lessons",
        label: isFa ? "درس‌های ذخیره‌شده" : "Saved lessons",
        requiresServerValidation: false,
      },
      {
        key: "notes",
        label: isFa ? "یادداشت‌ها" : "Notes",
        requiresServerValidation: false,
      },
      {
        key: "journal",
        label: isFa ? "ژورنال تمرین" : "Practice journal",
        requiresServerValidation: false,
      },
      {
        key: "replay",
        label: isFa ? "تمرین Replay ذخیره‌شده" : "Saved replay practice",
        requiresServerValidation: false,
      },
    ],
    onlineRequired: [
      {
        key: "auth",
        label: isFa ? "ورود و نشست امن" : "Secure login session",
      },
      {
        key: "certificate",
        label: isFa ? "صدور و استعلام مدرک" : "Certificate issue and verify",
      },
      {
        key: "finalExam",
        label: isFa ? "آزمون نهایی ترم" : "Final term exam",
      },
      {
        key: "mentorAi",
        label: isFa ? "منتور هوشمند زنده" : "Live AI mentor",
      },
      {
        key: "ranking",
        label: isFa ? "رتبه‌بندی و Hall of Fame" : "Rankings and Hall of Fame",
      },
    ],
    allowedClientEvents: offlineClientEvents,
  };
}
