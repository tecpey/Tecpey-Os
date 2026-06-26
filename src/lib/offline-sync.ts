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
  status: "accepted" | "rejected";
  reason?: string;
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

export function sanitizeOfflineText(value: unknown, max = 500) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function sanitizePayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>).slice(0, 30)) {
    const cleanKey = sanitizeOfflineText(key, 60).replace(/[^a-zA-Z0-9_.:-]/g, "_");
    if (!cleanKey) continue;
    if (typeof value === "string") safe[cleanKey] = sanitizeOfflineText(value, 1200);
    else if (typeof value === "number" && Number.isFinite(value)) safe[cleanKey] = value;
    else if (typeof value === "boolean") safe[cleanKey] = value;
    else if (value === null) safe[cleanKey] = null;
    else if (typeof value === "object") safe[cleanKey] = JSON.parse(JSON.stringify(value).slice(0, 1200));
  }
  return safe;
}

export function normalizeOfflineSyncItem(input: unknown): { ok: true; item: OfflineSyncItem } | { ok: false; reason: string; id?: string } {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const id = sanitizeOfflineText(raw.id, 120) || cryptoSafeId();
  const eventType = sanitizeOfflineText(raw.eventType, 80) as OfflineEventType;
  if (serverOnlyEvents.has(eventType)) return { ok: false, reason: "server_event_only", id };
  if (!allowedOfflineEvents.has(eventType)) return { ok: false, reason: "invalid_event", id };
  const locale = sanitizeOfflineText(raw.locale, 8) === "en" ? "en" : "fa";
  const sourceRaw = sanitizeOfflineText(raw.source, 24);
  const source = sourceRaw === "android" || sourceRaw === "ios" || sourceRaw === "pwa" ? sourceRaw : "web";
  const clientCreatedAt = sanitizeOfflineText(raw.clientCreatedAt, 40) || new Date().toISOString();
  const payload = sanitizePayload(raw.payload);
  return { ok: true, item: { id, eventType, source, locale, clientCreatedAt, payload } };
}

export function offlineManifest(locale: "fa" | "en" = "fa") {
  const isFa = locale === "fa";
  return {
    version: "phase4-offline-foundation-v1",
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

function cryptoSafeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `offline_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
