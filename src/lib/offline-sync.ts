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
  source: "web" | "android" | "ios" | "pwa";
  locale: "fa" | "en";
  clientCreatedAt: string;
  payload: Record<string, unknown>;
};

export type OfflineSyncResult = {
  id: string;
  status: "committed" | "rejected" | "retryable";
  reason?: string;
  replayed?: boolean;
  learningEventId?: string;
  committedAt?: string;
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
const OFFLINE_ID_PATTERN = /^[A-Za-z0-9._:-]{8,160}$/;
const MAX_PAYLOAD_BYTES = 16 * 1024;

export function sanitizeOfflineText(value: unknown, max = 500) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function sanitizeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return null;
  if (typeof value === "string") return sanitizeOfflineText(value, 1200);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeJsonValue(entry, depth + 1));
  }
  if (value && typeof value === "object") {
    const safe: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      const cleanKey = sanitizeOfflineText(key, 60).replace(/[^a-zA-Z0-9_.:-]/g, "_");
      if (cleanKey) safe[cleanKey] = sanitizeJsonValue(entry, depth + 1);
    }
    return safe;
  }
  return null;
}

function sanitizePayload(
  payload: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; reason: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: true, value: {} };
  }
  try {
    const raw = JSON.stringify(payload);
    if (Buffer.byteLength(raw, "utf8") > MAX_PAYLOAD_BYTES) {
      return { ok: false, reason: "payload_too_large" };
    }
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
  return {
    ok: true,
    value: sanitizeJsonValue(payload) as Record<string, unknown>,
  };
}

export function normalizeOfflineSyncItem(
  input: unknown,
):
  | { ok: true; item: OfflineSyncItem }
  | { ok: false; reason: string; id?: string } {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const id = sanitizeOfflineText(raw.id, 160);
  if (!id) return { ok: false, reason: "missing_id" };
  if (!OFFLINE_ID_PATTERN.test(id)) return { ok: false, reason: "invalid_id", id };

  const eventType = sanitizeOfflineText(raw.eventType, 80) as OfflineEventType;
  if (serverOnlyEvents.has(eventType)) return { ok: false, reason: "server_event_only", id };
  if (!allowedOfflineEvents.has(eventType)) return { ok: false, reason: "invalid_event", id };

  const locale = sanitizeOfflineText(raw.locale, 8) === "en" ? "en" : "fa";
  const sourceRaw = sanitizeOfflineText(raw.source, 24);
  const source =
    sourceRaw === "android" || sourceRaw === "ios" || sourceRaw === "pwa"
      ? sourceRaw
      : "web";

  const rawCreatedAt = sanitizeOfflineText(raw.clientCreatedAt, 40);
  const parsedCreatedAt = Date.parse(rawCreatedAt);
  if (!rawCreatedAt || !Number.isFinite(parsedCreatedAt)) {
    return { ok: false, reason: "invalid_client_created_at", id };
  }
  const clientCreatedAt = new Date(parsedCreatedAt).toISOString();

  const payload = sanitizePayload(raw.payload);
  if (!payload.ok) return { ok: false, reason: payload.reason, id };

  return {
    ok: true,
    item: { id, eventType, source, locale, clientCreatedAt, payload: payload.value },
  };
}

export function offlineManifest(locale: "fa" | "en" = "fa") {
  const isFa = locale === "fa";
  return {
    version: "phase4-offline-foundation-v2",
    locale,
    offlineReady: [
      { key: "lessons", label: isFa ? "درس‌های ذخیره‌شده" : "Saved lessons", requiresServerValidation: false },
      { key: "notes", label: isFa ? "یادداشت‌ها" : "Notes", requiresServerValidation: false },
      { key: "journal", label: isFa ? "ژورنال تمرین" : "Practice journal", requiresServerValidation: false },
      { key: "replay", label: isFa ? "تمرین Replay ذخیره‌شده" : "Saved replay practice", requiresServerValidation: false },
    ],
    onlineRequired: [
      { key: "auth", label: isFa ? "ورود و نشست امن" : "Secure login session" },
      { key: "certificate", label: isFa ? "صدور و استعلام مدرک" : "Certificate issue and verify" },
      { key: "finalExam", label: isFa ? "آزمون نهایی ترم" : "Final term exam" },
      { key: "mentorAi", label: isFa ? "منتور هوشمند زنده" : "Live AI mentor" },
      { key: "ranking", label: isFa ? "رتبه‌بندی و Hall of Fame" : "Rankings and Hall of Fame" },
    ],
    allowedClientEvents: offlineClientEvents,
  };
}
