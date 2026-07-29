"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Brain } from "lucide-react";
import { FlashcardDeck } from "./FlashcardDeck";
import { TERM1, extractFlashcardIds } from "@/data/academy/term1Curriculum";
import { loadDeck, getDueCards } from "@/lib/spaced-repetition";
import { useEffect, useState } from "react";
import type { Flashcard } from "@/data/academy/term1Curriculum";

const ALL_FLASHCARDS: Flashcard[] = TERM1.modules.flatMap((m) => m.lessons.flatMap((l) => l.flashcards));
const ALL_IDS = extractFlashcardIds(TERM1);

export function FlashcardsPageClient() {
  const [dueCount, setDueCount] = useState(0);
  const [totalCount, setTotalCount] = useState(ALL_IDS.length);
  const [mode, setMode] = useState<"due" | "all" | null>(null);

  useEffect(() => {
    const deck = loadDeck();
    setDueCount(getDueCards(deck).length);
    setTotalCount(ALL_IDS.length);
  }, []);

  if (mode) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setMode(null)}
          className="flex items-center gap-2 text-sm font-black text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 rounded-lg px-2 py-1"
          aria-label="بازگشت"
        >
          <ArrowRight className="h-4 w-4" />
          بازگشت
        </button>
        <FlashcardDeck
          flashcards={ALL_FLASHCARDS}
          dueOnly={mode === "due"}
          onClose={() => setMode(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-400/10">
          <Brain className="h-8 w-8 text-violet-300" />
        </div>
        <h1 className="text-2xl font-black">مرور فلش‌کارت‌ها</h1>
        <p className="mt-2 text-sm font-bold text-slate-400">
          حافظه بلندمدت با الگوریتم SM-2
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4 text-center">
          <p className="text-3xl font-black text-cyan-300">{dueCount}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">کارت امروز</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-center">
          <p className="text-3xl font-black text-slate-200">{totalCount}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">کل کارت‌ها</p>
        </div>
      </div>

      {/* Mode buttons */}
      <div className="space-y-3">
        <button
          onClick={() => setMode("due")}
          disabled={dueCount === 0}
          className="flex w-full items-center gap-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-5 text-right hover:bg-cyan-400/10 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all"
          aria-label="مرور کارت‌های امروز"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/20">
            <Brain className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="flex-1">
            <p className="font-black">مرور امروز</p>
            <p className="text-xs font-bold text-slate-400">
              {dueCount > 0 ? `${dueCount} کارت منتظر مرور` : "کارتی برای امروز نداری"}
            </p>
          </div>
          <span className="text-xs font-black text-cyan-300">{dueCount}</span>
        </button>

        <button
          onClick={() => setMode("all")}
          disabled={ALL_FLASHCARDS.length === 0}
          className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-slate-800/60 p-5 text-right hover:bg-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all"
          aria-label="مرور همه کارت‌ها"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-700">
            <BookOpen className="h-5 w-5 text-slate-300" />
          </div>
          <div className="flex-1">
            <p className="font-black">مرور همه</p>
            <p className="text-xs font-bold text-slate-400">بدون محدودیت زمان‌بندی</p>
          </div>
          <span className="text-xs font-black text-slate-400">{totalCount}</span>
        </button>
      </div>

      {/* Back to academy */}
      <div className="text-center pt-2">
        <Link
          href="/academy"
          className="text-sm font-black text-slate-500 hover:text-white transition-colors"
        >
          بازگشت به آکادمی
        </Link>
      </div>
    </div>
  );
}
