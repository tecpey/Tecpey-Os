export type ReflectionEntry = {
  lessonId: string;
  text: string;
  revision: number;
  savedAt: number;
  updatedAt: number;
};

export type ReflectionMap = Record<string, ReflectionEntry>;

const MAX_REFLECTIONS = 1000;
const MAX_TEXT_LENGTH = 5000;
const MAX_LESSON_ID_LENGTH = 180;

export function normalizeLessonId(value: unknown): string | null {
  const lessonId = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, MAX_LESSON_ID_LENGTH);
  return lessonId && /^[\p{L}\p{N}._:/-]+$/u.test(lessonId) ? lessonId : null;
}

export function normalizeReflectionText(value: unknown): string | null {
  const text = String(value ?? "")
    .replace(/[\u0000\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
  return text.length > 0 ? text : null;
}

function isReflectionEntry(value: unknown): value is ReflectionEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ReflectionEntry>;
  return (
    normalizeLessonId(entry.lessonId) !== null &&
    normalizeReflectionText(entry.text) !== null &&
    Number.isInteger(entry.revision) &&
    Number(entry.revision) >= 1 &&
    Number.isFinite(entry.savedAt) &&
    Number.isFinite(entry.updatedAt)
  );
}

export function normalizeReflectionMap(value: unknown): ReflectionMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ReflectionMap = {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_REFLECTIONS);
  for (const [key, raw] of entries) {
    if (!isReflectionEntry(raw)) continue;
    const lessonId = normalizeLessonId(key);
    if (!lessonId || lessonId !== raw.lessonId) continue;
    result[lessonId] = {
      lessonId,
      text: normalizeReflectionText(raw.text) as string,
      revision: Math.max(1, Math.round(raw.revision)),
      savedAt: Number(raw.savedAt),
      updatedAt: Number(raw.updatedAt),
    };
  }
  return result;
}

export function saveReflectionEntry(
  current: ReflectionMap,
  lessonId: string,
  text: string,
  now = Date.now(),
): ReflectionEntry {
  const existing = current[lessonId];
  return {
    lessonId,
    text,
    revision: (existing?.revision ?? 0) + 1,
    savedAt: existing?.savedAt ?? now,
    updatedAt: now,
  };
}
