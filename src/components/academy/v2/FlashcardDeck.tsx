"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Brain, CheckCircle2, ChevronLeft, ChevronRight, RotateCcw, Sparkles } from "lucide-react";
import {
  type CardState,
  type ReviewGrade,
  daysUntilReview,
  getDueCards,
  loadDeck,
  reviewCard,
  saveDeck,
  upsertCard,
} from "@/lib/spaced-repetition";
import type { Flashcard } from "@/data/academy/term1Curriculum";

// ─── Session stats ────────────────────────────────────────────────────────────

type SessionStats = {
  reviewed: number;
  easy: number;
  medium: number;
  hard: number;
  again: number;
};

// ─── Grade button config ──────────────────────────────────────────────────────

type GradeConfig = { grade: ReviewGrade; label: string; color: string; sublabel: string };

const GRADES: GradeConfig[] = [
  { grade: 1, label: "نمی‌دانستم", sublabel: "دوباره فردا", color: "border-red-400/50 bg-red-400/10 hover:bg-red-400/20 text-red-200" },
  { grade: 3, label: "سخت بود", sublabel: "چند روز دیگر", color: "border-amber-400/50 bg-amber-400/10 hover:bg-amber-400/20 text-amber-200" },
  { grade: 4, label: "خوب بود", sublabel: "هفته آینده", color: "border-cyan-400/50 bg-cyan-400/10 hover:bg-cyan-400/20 text-cyan-200" },
  { grade: 5, label: "آسان بود", sublabel: "بیشتر از هفته دیگر", color: "border-emerald-400/50 bg-emerald-400/10 hover:bg-emerald-400/20 text-emerald-200" },
];

// ─── Individual card ──────────────────────────────────────────────────────────

function FlashcardFace({
  card,
  deck,
  flipped,
  onFlip,
  onGrade,
  totalDue,
  currentIndex,
}: {
  card: Flashcard;
  deck: CardState | undefined;
  flipped: boolean;
  onFlip: () => void;
  onGrade: (grade: ReviewGrade) => void;
  totalDue: number;
  currentIndex: number;
}) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!flipped || touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > 60 && dy < 50) {
      if (dx > 0) onGrade(5);   // swipe right → easy
      else onGrade(1);           // swipe left → hard
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const daysLeft = deck ? daysUntilReview(deck) : null;

  return (
    <div
      className="relative select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress */}
      <div className="mb-4 flex items-center justify-between text-xs font-black text-slate-500">
        <span>{currentIndex + 1} از {totalDue} کارت</span>
        {daysLeft !== null && daysLeft > 0 && (
          <span className="rounded-full bg-slate-800 px-3 py-1">
            {daysLeft} روز دیگر
          </span>
        )}
      </div>

      {/* Card body — flip on click */}
      <button
        onClick={onFlip}
        className={`relative h-64 w-full overflow-hidden rounded-[28px] border border-white/10 bg-slate-800/80 p-6 text-center shadow-2xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
          flipped ? "border-cyan-300/30 bg-slate-800" : "hover:border-white/20"
        }`}
        aria-label={flipped ? "مشاهده سؤال" : "نمایش جواب"}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
          {!flipped ? (
            <>
              <BookOpen className="h-8 w-8 text-slate-500" />
              <p className="text-lg font-black leading-8">{card.front}</p>
              <p className="text-xs font-bold text-slate-500">برای دیدن جواب کلیک کنید</p>
            </>
          ) : (
            <>
              <Brain className="h-8 w-8 text-cyan-400" />
              <p className="text-base font-black leading-7 text-cyan-100">{card.back}</p>
              <div className="mt-1 rounded-xl bg-slate-900/60 px-4 py-2">
                <p className="text-xs font-bold leading-6 text-slate-400">{card.example}</p>
              </div>
            </>
          )}
        </div>

        {/* Flip indicator */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <div className={`h-1 w-8 rounded-full transition-all ${flipped ? "bg-cyan-400" : "bg-slate-700"}`} />
        </div>
      </button>

      {/* Grade buttons — only visible after flip */}
      <div
        className={`mt-5 transition-all duration-300 ${
          flipped ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <p className="mb-3 text-center text-xs font-black text-slate-500">چقدر آسان بود؟</p>
        <div className="grid grid-cols-4 gap-2">
          {GRADES.map(({ grade, label, sublabel, color }) => (
            <button
              key={grade}
              onClick={() => onGrade(grade)}
              className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-xs font-black transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400 active:scale-95 ${color}`}
              aria-label={`ارزیابی: ${label}`}
            >
              <span>{label}</span>
              <span className="text-[10px] font-bold opacity-60">{sublabel}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-[10px] font-bold text-slate-600">
          کشیدن به راست = آسان · کشیدن به چپ = سخت
        </p>
      </div>
    </div>
  );
}

// ─── Session complete ─────────────────────────────────────────────────────────

function SessionComplete({ stats, onClose }: { stats: SessionStats; onClose: () => void }) {
  return (
    <div className="rounded-[32px] border border-cyan-300/20 bg-slate-900/80 p-8 text-center" dir="rtl">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-cyan-400/10">
        <Sparkles className="h-10 w-10 text-cyan-300" />
      </div>
      <h3 className="text-2xl font-black">جلسه تمام شد!</h3>
      <p className="mt-2 text-sm font-bold text-slate-400">{stats.reviewed} کارت مرور شد</p>

      <div className="mt-6 grid grid-cols-4 gap-3">
        <div className="rounded-2xl bg-emerald-400/10 p-3">
          <p className="text-xl font-black text-emerald-300">{stats.easy}</p>
          <p className="text-xs font-bold text-slate-400">آسان</p>
        </div>
        <div className="rounded-2xl bg-cyan-400/10 p-3">
          <p className="text-xl font-black text-cyan-300">{stats.medium}</p>
          <p className="text-xs font-bold text-slate-400">خوب</p>
        </div>
        <div className="rounded-2xl bg-amber-400/10 p-3">
          <p className="text-xl font-black text-amber-300">{stats.hard}</p>
          <p className="text-xs font-bold text-slate-400">سخت</p>
        </div>
        <div className="rounded-2xl bg-red-400/10 p-3">
          <p className="text-xl font-black text-red-300">{stats.again}</p>
          <p className="text-xs font-bold text-slate-400">نمی‌دانستم</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4">
        <p className="text-sm font-black text-cyan-300">مرور کارت‌ها در برنامه یادگیری شما ذخیره شد.</p>
      </div>

      <button
        onClick={onClose}
        className="mt-6 w-full rounded-2xl bg-slate-800 py-3 font-black text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        aria-label="بستن"
      >
        بازگشت به آکادمی
      </button>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function NoCardsDue({ totalCards }: { totalCards: number }) {
  return (
    <div className="rounded-[32px] border border-white/10 bg-slate-900/60 p-8 text-center" dir="rtl">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400/10">
        <CheckCircle2 className="h-10 w-10 text-emerald-300" />
      </div>
      <h3 className="text-xl font-black">برای امروز تمام شد!</h3>
      <p className="mt-3 text-sm font-bold leading-7 text-slate-400">
        {totalCards > 0
          ? `${totalCards} کارت داری — همه برای روزهای آینده زمان‌بندی شده‌اند.`
          : "هنوز کارتی اضافه نشده. درس‌ها را طی کن تا کارت‌ها اضافه شوند."}
      </p>
    </div>
  );
}

// ─── Main FlashcardDeck ───────────────────────────────────────────────────────

type FlashcardDeckProps = {
  flashcards: Flashcard[];
  /** Show only cards due today (default: true). Set to false for study-all mode. */
  dueOnly?: boolean;
  onClose?: () => void;
};

export function FlashcardDeck({ flashcards, dueOnly = true, onClose }: FlashcardDeckProps) {
  const [deck, setDeck] = useState<CardState[]>([]);
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState<SessionStats>({
    reviewed: 0, easy: 0, medium: 0, hard: 0, again: 0,
  });

  // Load deck and determine queue on mount
  useEffect(() => {
    const loaded = loadDeck();

    // Ensure all flashcard IDs have a card state
    let current = [...loaded];
    for (const fc of flashcards) {
      if (!current.some((c) => c.cardId === fc.id)) {
        current = [...current, {
          cardId: fc.id,
          repetitions: 0,
          easeFactor: 2.5,
          intervalDays: 0,
          nextReviewAt: Date.now(),
          lastGrade: -1,
          lastReviewedAt: null,
        }];
      }
    }
    setDeck(current);

    if (dueOnly) {
      const dueCardStates = getDueCards(current);
      const dueIds = new Set(dueCardStates.map((c) => c.cardId));
      setQueue(flashcards.filter((fc) => dueIds.has(fc.id)));
    } else {
      setQueue([...flashcards].sort(() => Math.random() - 0.5));
    }
  }, [flashcards, dueOnly]);

  const handleGrade = useCallback(
    (grade: ReviewGrade) => {
      const currentCard = queue[currentIndex];
      if (!currentCard) return;

      const cardState = deck.find((c) => c.cardId === currentCard.id);
      if (!cardState) return;

      const updated = reviewCard(cardState, grade);
      const newDeck = upsertCard(deck, updated);
      setDeck(newDeck);
      saveDeck(newDeck);

      // Update stats
      setStats((prev) => ({
        reviewed: prev.reviewed + 1,
        easy: grade >= 5 ? prev.easy + 1 : prev.easy,
        medium: grade === 4 ? prev.medium + 1 : prev.medium,
        hard: grade === 3 ? prev.hard + 1 : prev.hard,
        again: grade <= 2 ? prev.again + 1 : prev.again,
      }));

      const next = currentIndex + 1;
      if (next >= queue.length) {
        setDone(true);
      } else {
        setCurrentIndex(next);
        setFlipped(false);
      }
    },
    [currentIndex, deck, queue],
  );

  const currentCard = queue[currentIndex];
  const currentDeckState = currentCard ? deck.find((c) => c.cardId === currentCard.id) : undefined;

  // Session done
  if (done) {
    return <SessionComplete stats={stats} onClose={onClose ?? (() => undefined)} />;
  }

  // No cards due
  if (queue.length === 0) {
    return <NoCardsDue totalCards={deck.length} />;
  }

  return (
    <div className="rounded-[32px] border border-cyan-300/20 bg-slate-900/80 p-6" dir="rtl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-cyan-400" />
          <h3 className="font-black">مرور کارت‌ها</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-black text-cyan-300">
            {queue.length - currentIndex} باقی‌مانده
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 p-2 text-xs font-black text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
              aria-label="بستن"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation arrows for study-all mode */}
      {!dueOnly && (
        <div className="mb-4 flex justify-between">
          <button
            onClick={() => { if (currentIndex > 0) { setCurrentIndex(currentIndex - 1); setFlipped(false); } }}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:text-white disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            aria-label="کارت قبلی"
          >
            <ChevronRight className="h-4 w-4" />
            قبلی
          </button>
          <button
            onClick={() => { if (currentIndex < queue.length - 1) { setCurrentIndex(currentIndex + 1); setFlipped(false); } }}
            disabled={currentIndex === queue.length - 1}
            className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:text-white disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            aria-label="کارت بعدی"
          >
            بعدی
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      )}

      {currentCard && (
        <FlashcardFace
          card={currentCard}
          deck={currentDeckState}
          flipped={flipped}
          onFlip={() => setFlipped((v) => !v)}
          onGrade={handleGrade}
          totalDue={queue.length}
          currentIndex={currentIndex}
        />
      )}

      {/* Related terms */}
      {currentCard && currentCard.relatedTerms.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {currentCard.relatedTerms.map((term) => (
            <span
              key={term}
              className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold text-slate-400"
            >
              {term}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
