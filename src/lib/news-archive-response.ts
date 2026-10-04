import type { NewsArchivePresentationItem } from "../services/news/archive-presentation-authority";

// Validate fields consumed by archive rendering before committing a fetched day.
// This is a client continuity boundary, not publisher-rights or source authority.
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function calendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

function renderableItem(value: unknown): boolean {
  if (!record(value)) return false;
  const text = ["archiveId", "sourceName", "articleUrl", "publishedAt", "sourceTitle", "displayTitle", "displayLead", "displayBody", "thumbnailAlt", "translationStatus"];
  if (!text.every(key => typeof value[key] === "string")) return false;
  if (!value.archiveId || !Number.isFinite(Date.parse(value.publishedAt as string))) return false;
  if (!["translationPending", "publicSummaryAllowed", "persianEditorialAllowed", "thumbnailAttributionRequired"].every(key => typeof value[key] === "boolean")) return false;
  if (!["newsUrl", "thumbnailUrl"].every(key => value[key] === null || typeof value[key] === "string")) return false;
  const taxonomy = value.taxonomy;
  if (!record(taxonomy)) return false;
  return ["coinSymbols", "toolSlugs", "topicTags"].every(key => strings(taxonomy[key]));
}

export function parseNewsArchiveResponse(value: unknown, requestedDay: string): {
  day: string; today: string; items: NewsArchivePresentationItem[]; availableDays: string[];
} | null {
  if (!record(value) || value.day !== requestedDay || !calendarDay(value.day) || !calendarDay(value.today)) return null;
  if (!Array.isArray(value.archiveItems) || !value.archiveItems.every(renderableItem)) return null;
  if (!Array.isArray(value.availableDays) || !value.availableDays.every(calendarDay) || !value.availableDays.includes(requestedDay)) return null;
  const ids = value.archiveItems.map(item => item.archiveId);
  if (new Set(ids).size !== ids.length) return null;
  return { day: value.day, today: value.today, items: value.archiveItems, availableDays: value.availableDays };
}
