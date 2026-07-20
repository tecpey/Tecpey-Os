/**
 * Smart Review projection boundary.
 *
 * The previous implementation built personalized Mentor decisions directly
 * from browser-owned progress, flashcards and reflection browser storage. That
 * data is not official evidence. Until the server review authority is exposed,
 * this module returns an explicit unavailable projection rather than silently
 * personalizing Mentor or scholarship-facing surfaces from browser state.
 */

export type ReviewItemType =
  | "flashcard"
  | "lesson-review"
  | "concept-prereq"
  | "quiz-retry"
  | "reflection";

export type ReviewQueueItem = {
  id: string;
  type: ReviewItemType;
  title: string;
  description: string;
  estimatedMinutes: number;
  priority: number;
  href: string;
  urgent: boolean;
};

export type SmartReviewQueue = {
  items: ReviewQueueItem[];
  totalMinutes: number;
  dueFlashcards: number;
  conceptsToReview: number;
  generatedAt: number;
  authority: "server-required";
};

export function buildSmartReviewQueue(): SmartReviewQueue {
  return {
    items: [],
    totalMinutes: 0,
    dueFlashcards: 0,
    conceptsToReview: 0,
    generatedAt: Date.now(),
    authority: "server-required",
  };
}
