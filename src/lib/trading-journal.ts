/**
 * Trading Arena V2 — Trade Journal.
 * Every simulated trade can have a pre-entry plan and post-trade reflection.
 */

export const JOURNAL_STORAGE_KEY = "tecpey-trading-journal";

export type EmotionalState =
  | "calm"
  | "anxious"
  | "confident"
  | "fearful"
  | "greedy"
  | "neutral";

export type MistakeTag =
  | "impulse-entry"
  | "no-stop-loss"
  | "over-risk"
  | "fomo"
  | "revenge-trade"
  | "early-exit"
  | "late-exit"
  | "poor-sizing"
  | "ignored-plan"
  | "emotional-decision";

export interface JournalEntry {
  id: string;
  positionId: string;
  asset: string;
  entryPrice: number;
  usdtValue: number;
  // Pre-trade (filled before opening)
  preTradePlan: string;
  entryReason: string;
  riskAmount: number;
  emotionalState: EmotionalState;
  expectedOutcome: string;
  // Post-trade (filled after closing)
  postReflection: string;
  mistakeTags: MistakeTag[];
  lessonLearned: string;
  completedAt: number | null;
  createdAt: number;
}

export type JournalEntryInput = Omit<JournalEntry, "id" | "completedAt" | "createdAt">;

export function createJournalEntry(input: JournalEntryInput): JournalEntry {
  return {
    ...input,
    id: `j-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    completedAt: null,
    createdAt: Date.now(),
  };
}

export function loadJournal(): JournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as JournalEntry[];
  } catch { /* ignore */ }
  return [];
}

function saveJournal(entries: JournalEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries));
  } catch { /* quota */ }
}

export function saveJournalEntry(entry: JournalEntry): void {
  const entries = loadJournal();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) entries[idx] = entry;
  else entries.unshift(entry);
  saveJournal(entries);
}

export function completeJournalEntry(
  entryId: string,
  reflection: { postReflection: string; mistakeTags: MistakeTag[]; lessonLearned: string },
): JournalEntry | null {
  const entries = loadJournal();
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return null;
  const completed: JournalEntry = {
    ...entry,
    ...reflection,
    completedAt: Date.now(),
  };
  const idx = entries.findIndex((e) => e.id === entryId);
  entries[idx] = completed;
  saveJournal(entries);
  return completed;
}

export function getJournalCompletionRate(): number {
  const entries = loadJournal();
  if (entries.length === 0) return 0;
  const completed = entries.filter((e) => e.completedAt !== null).length;
  return completed / entries.length;
}

export const EMOTIONAL_STATE_LABEL: Record<EmotionalState, string> = {
  calm: "آرام",
  anxious: "نگران",
  confident: "مطمئن",
  fearful: "ترسیده",
  greedy: "طمعکار",
  neutral: "خنثی",
};

export const MISTAKE_TAG_LABEL: Record<MistakeTag, string> = {
  "impulse-entry": "ورود تکانشی",
  "no-stop-loss": "بدون حد ضرر",
  "over-risk": "ریسک بیش از حد",
  "fomo": "ورود از روی FOMO",
  "revenge-trade": "معامله انتقامی",
  "early-exit": "خروج زودهنگام",
  "late-exit": "خروج دیرهنگام",
  "poor-sizing": "اندازه نامناسب",
  "ignored-plan": "نادیده گرفتن برنامه",
  "emotional-decision": "تصمیم احساسی",
};
