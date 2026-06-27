/**
 * Adaptive Review Scheduler
 *
 * Combines SM-2 due cards, quiz failures (from academy-progress),
 * knowledge graph recommendations, and behavioral scores to produce
 * a prioritized, personalized review queue.
 */

import { loadDeck, getDueCards } from "@/lib/spaced-repetition";
import { loadProgress } from "@/lib/academy-progress";
import { getConceptStatusMap, getConceptRecommendations, CONCEPT_NODES } from "@/lib/knowledge-graph";
import { TERM1 } from "@/data/academy/term1Curriculum";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReviewItemType = "flashcard" | "lesson-review" | "concept-prereq" | "quiz-retry" | "reflection";

export type ReviewQueueItem = {
  id: string;
  type: ReviewItemType;
  title: string;
  description: string;
  estimatedMinutes: number;
  priority: number;         // 1 = highest
  href: string;
  urgent: boolean;
};

export type SmartReviewQueue = {
  items: ReviewQueueItem[];
  totalMinutes: number;
  dueFlashcards: number;
  conceptsToReview: number;
  generatedAt: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function allFlashcards() {
  return TERM1.modules.flatMap((m) => m.lessons.flatMap((l) => l.flashcards));
}

function flashcardById(cardId: string) {
  return allFlashcards().find((f) => f.id === cardId);
}

function getLessonByIndex(idx: number) {
  for (const mod of TERM1.modules) {
    const lesson = mod.lessons.find((l) => l.lessonIndex === idx);
    if (lesson) return lesson;
  }
  return null;
}

function getLessonHref(termSlug: string, lessonIndex: number) {
  return `/academy/learn/${termSlug}/${lessonIndex}`;
}

// ─── Main function ────────────────────────────────────────────────────────────

export function buildSmartReviewQueue(): SmartReviewQueue {
  if (typeof window === "undefined") {
    return { items: [], totalMinutes: 0, dueFlashcards: 0, conceptsToReview: 0, generatedAt: Date.now() };
  }

  const deck = loadDeck();
  const progress = loadProgress();
  const items: ReviewQueueItem[] = [];

  // ── 1. SM-2 due flashcards (highest priority) ─────────────────────────────
  const dueCards = getDueCards(deck);
  let dueFlashcards = 0;
  for (const card of dueCards.slice(0, 10)) {
    const flashcard = flashcardById(card.cardId);
    if (!flashcard) continue;
    dueFlashcards++;
    items.push({
      id: `fc-${card.cardId}`,
      type: "flashcard",
      title: flashcard.front,
      description: `آخرین نمره: ${card.lastGrade >= 0 ? card.lastGrade : "مرور نشده"} — موعد مرور رسیده`,
      estimatedMinutes: 1,
      priority: 1,
      href: "/academy/flashcards",
      urgent: card.nextReviewAt < Date.now() - 24 * 60 * 60 * 1000,
    });
  }

  // Batch: if many due cards, add a single batch item instead
  if (dueCards.length > 3) {
    items.push({
      id: "flashcard-batch",
      type: "flashcard",
      title: `مرور ${dueCards.length} فلش‌کارت امروز`,
      description: "فلش‌کارت‌های موعد رسیده را مرور کنید",
      estimatedMinutes: Math.ceil(dueCards.length * 0.5),
      priority: 1,
      href: "/academy/flashcards",
      urgent: dueCards.length >= 5,
    });
  }

  // ── 2. Low-scoring lessons (quiz-retry) ───────────────────────────────────
  const lessonScoreMap: Record<number, number> = {};
  const completedLessonIndices: number[] = [];

  for (const lesson of Object.values(progress.completedLessons)) {
    const allLessons = TERM1.modules.flatMap((m) => m.lessons);
    const lessonData = allLessons.find((l) => l.id === lesson.lessonId);
    if (lessonData) {
      lessonScoreMap[lessonData.lessonIndex] = Math.max(
        lessonScoreMap[lessonData.lessonIndex] ?? 0,
        lesson.score,
      );
      if (!completedLessonIndices.includes(lessonData.lessonIndex)) {
        completedLessonIndices.push(lessonData.lessonIndex);
      }
    }
  }

  for (const [idxStr, score] of Object.entries(lessonScoreMap)) {
    const idx = Number(idxStr);
    if (score < 80) {
      const lesson = getLessonByIndex(idx);
      if (!lesson) continue;
      items.push({
        id: `quiz-retry-${idx}`,
        type: "quiz-retry",
        title: `مرور درس ${idx}: ${lesson.title}`,
        description: `نمره فعلی ${score}٪ — نیاز به مرور مجدد`,
        estimatedMinutes: lesson.estimatedMinutes,
        priority: 2,
        href: getLessonHref(TERM1.slug, idx),
        urgent: score < 60,
      });
    }
  }

  // ── 3. Knowledge graph: prerequisite recommendations ───────────────────────
  const { mastered, weak } = getConceptStatusMap(completedLessonIndices, lessonScoreMap);
  const conceptRecs = getConceptRecommendations(weak, mastered);
  let conceptsToReview = 0;

  for (const rec of conceptRecs.slice(0, 4)) {
    const node = CONCEPT_NODES.find((n) => n.id === rec.conceptId);
    if (!node) continue;
    conceptsToReview++;
    const lesson = getLessonByIndex(node.lessonIndex);
    items.push({
      id: `prereq-${rec.conceptId}`,
      type: "concept-prereq",
      title: `مرور مفهوم: ${rec.label}`,
      description: rec.reason,
      estimatedMinutes: lesson?.estimatedMinutes ?? 5,
      priority: 2,
      href: getLessonHref(TERM1.slug, node.lessonIndex),
      urgent: false,
    });
  }

  // ── 4. Missing reflections ────────────────────────────────────────────────
  for (const lesson of TERM1.modules.flatMap((m) => m.lessons)) {
    if (!completedLessonIndices.includes(lesson.lessonIndex)) continue;
    try {
      const ref = localStorage.getItem(`tecpey-reflection-${lesson.id}`);
      if (!ref || (JSON.parse(ref) as { text?: string }).text?.trim().length === 0) {
        items.push({
          id: `reflection-${lesson.id}`,
          type: "reflection",
          title: `بازتاب درس ${lesson.lessonIndex}: ${lesson.title}`,
          description: "بازتاب یادگیری ثبت نشده است",
          estimatedMinutes: 3,
          priority: 3,
          href: getLessonHref(TERM1.slug, lesson.lessonIndex),
          urgent: false,
        });
      }
    } catch { /* ignore */ }
  }

  // ── 5. Next unstarted lesson ──────────────────────────────────────────────
  const allLessons = TERM1.modules.flatMap((m) => m.lessons);
  const nextLesson = allLessons.find((l) => !completedLessonIndices.includes(l.lessonIndex));
  if (nextLesson) {
    items.push({
      id: `next-lesson-${nextLesson.id}`,
      type: "lesson-review",
      title: `درس جدید: ${nextLesson.title}`,
      description: nextLesson.subtitle,
      estimatedMinutes: nextLesson.estimatedMinutes,
      priority: 4,
      href: getLessonHref(TERM1.slug, nextLesson.lessonIndex),
      urgent: false,
    });
  }

  // Deduplicate by id, sort by priority
  const seen = new Set<string>();
  const dedupedItems = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).sort((a, b) => a.priority - b.priority || (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));

  const totalMinutes = dedupedItems.reduce((s, i) => s + i.estimatedMinutes, 0);

  return {
    items: dedupedItems.slice(0, 8),
    totalMinutes,
    dueFlashcards,
    conceptsToReview,
    generatedAt: Date.now(),
  };
}
