"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle,
  ChevronRight,
  Clock,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  loadJournal,
  completeJournalEntry,
  EMOTIONAL_STATE_LABEL,
  MISTAKE_TAG_LABEL,
  type JournalEntry,
  type MistakeTag,
} from "@/lib/trading-journal";

// ─── Post-trade form ──────────────────────────────────────────────────────────

interface PostTradeFormProps {
  entry: JournalEntry;
  onComplete: (entry: JournalEntry) => void;
}

function PostTradeForm({ entry, onComplete }: PostTradeFormProps) {
  const [reflection, setReflection] = useState("");
  const [tags, setTags] = useState<MistakeTag[]>([]);
  const [lesson, setLesson] = useState("");

  const ALL_TAGS = Object.keys(MISTAKE_TAG_LABEL) as MistakeTag[];

  const toggleTag = (tag: MistakeTag) => {
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const handleSubmit = () => {
    if (!reflection.trim()) return;
    const completed = completeJournalEntry(entry.id, {
      postReflection: reflection,
      mistakeTags: tags,
      lessonLearned: lesson,
    });
    if (completed) onComplete(completed);
  };

  return (
    <div className="rounded-[24px] border border-violet-400/20 bg-violet-400/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-violet-300" />
        <h3 className="font-black text-violet-200">بازتاب پس از معامله</h3>
      </div>
      <div className="rounded-xl bg-slate-800/60 p-3 text-xs font-bold text-slate-400 space-y-1">
        <p>دارایی: <span className="text-slate-200">{entry.asset}</span></p>
        <p>ورود: <span className="text-slate-200">${entry.entryPrice.toFixed(2)}</span></p>
        <p>مبلغ: <span className="text-slate-200">${entry.usdtValue.toFixed(2)}</span></p>
        <p>برنامه اولیه: <span className="text-slate-200">{entry.preTradePlan || "ثبت نشده"}</span></p>
        <p>حالت احساسی: <span className="text-slate-200">{EMOTIONAL_STATE_LABEL[entry.emotionalState]}</span></p>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-black text-slate-400">چه اتفاقی افتاد؟</label>
        <textarea
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-xl border border-white/10 bg-slate-800 p-3 text-sm font-bold text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="نتیجه معامله، احساسات، تفاوت با برنامه..."
        />
      </div>
      <div>
        <label className="mb-2 block text-xs font-black text-slate-400">برچسب اشتباهات (اختیاری)</label>
        <div className="flex flex-wrap gap-2">
          {ALL_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-black transition-all ${tags.includes(tag) ? "border-amber-400/40 bg-amber-400/20 text-amber-200" : "border-white/10 text-slate-500 hover:text-slate-300"}`}
              aria-pressed={tags.includes(tag)}
            >
              {MISTAKE_TAG_LABEL[tag]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-black text-slate-400">درس کلیدی</label>
        <input
          type="text"
          value={lesson}
          onChange={(e) => setLesson(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="یک چیزی که یاد گرفتم..."
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={!reflection.trim()}
        className="w-full rounded-2xl bg-violet-500 py-3 text-sm font-black text-white hover:bg-violet-400 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-violet-300"
      >
        ذخیره بازتاب
      </button>
    </div>
  );
}

// ─── Journal entry detail ─────────────────────────────────────────────────────

function JournalEntryDetail({ entry, onComplete }: { entry: JournalEntry; onComplete: (e: JournalEntry) => void }) {
  const [showPostForm, setShowPostForm] = useState(false);
  const needsReflection = entry.completedAt === null;

  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-black">{entry.asset}</span>
            {entry.completedAt ? (
              <CheckCircle className="h-4 w-4 text-emerald-300" />
            ) : (
              <Clock className="h-4 w-4 text-amber-300" />
            )}
          </div>
          <p className="text-xs font-bold text-slate-500">
            {new Date(entry.createdAt).toLocaleDateString("fa-IR")}
          </p>
        </div>
        <div className="text-right text-xs font-bold text-slate-500">
          <p>ورود: ${entry.entryPrice.toFixed(2)}</p>
          <p>${entry.usdtValue.toFixed(0)} USDT</p>
        </div>
      </div>

      {entry.preTradePlan && (
        <div className="rounded-xl bg-slate-800/60 p-3">
          <p className="text-xs font-black text-slate-500 mb-1">برنامه پیش از معامله</p>
          <p className="text-sm font-bold text-slate-300">{entry.preTradePlan}</p>
        </div>
      )}

      <div className="flex gap-2">
        <span className="rounded-full border border-white/10 bg-slate-800 px-2.5 py-1 text-[11px] font-black text-slate-400">
          {EMOTIONAL_STATE_LABEL[entry.emotionalState]}
        </span>
      </div>

      {entry.completedAt && (
        <>
          {entry.postReflection && (
            <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-3">
              <p className="text-xs font-black text-violet-300 mb-1">بازتاب</p>
              <p className="text-sm font-bold leading-7 text-slate-300">{entry.postReflection}</p>
            </div>
          )}
          {entry.mistakeTags.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-black text-slate-500">برچسب اشتباهات</p>
              <div className="flex flex-wrap gap-2">
                {entry.mistakeTags.map((tag) => (
                  <span key={tag} className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-black text-amber-300">
                    {MISTAKE_TAG_LABEL[tag]}
                  </span>
                ))}
              </div>
            </div>
          )}
          {entry.lessonLearned && (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
              <p className="text-xs font-black text-emerald-300 mb-1">درس کلیدی</p>
              <p className="text-sm font-bold text-emerald-200">{entry.lessonLearned}</p>
            </div>
          )}
        </>
      )}

      {needsReflection && !showPostForm && (
        <button
          onClick={() => setShowPostForm(true)}
          className="w-full rounded-2xl border border-violet-400/20 py-2.5 text-sm font-black text-violet-300 hover:bg-violet-400/5 focus:outline-none focus:ring-2 focus:ring-violet-400"
        >
          + ثبت بازتاب پس از معامله
        </button>
      )}

      {needsReflection && showPostForm && (
        <PostTradeForm entry={entry} onComplete={(e) => { onComplete(e); setShowPostForm(false); }} />
      )}
    </div>
  );
}

// ─── Mistake pattern summary ──────────────────────────────────────────────────

function MistakePatternSummary({ entries }: { entries: JournalEntry[] }) {
  const allTags = entries.filter((e) => e.completedAt).flatMap((e) => e.mistakeTags);
  if (allTags.length === 0) return null;

  const counts = allTags.reduce<Record<MistakeTag, number>>((acc, tag) => {
    acc[tag] = (acc[tag] ?? 0) + 1;
    return acc;
  }, {} as Record<MistakeTag, number>);
  const sorted = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 5) as [MistakeTag, number][];

  return (
    <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-5 w-5 text-amber-300" />
        <h3 className="font-black text-amber-200">الگوهای مکرر اشتباه</h3>
      </div>
      <div className="space-y-2">
        {sorted.map(([tag, count]) => (
          <div key={tag} className="flex items-center gap-3">
            <span className="flex-1 text-sm font-bold text-slate-300">{MISTAKE_TAG_LABEL[tag]}</span>
            <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${(count / allTags.length) * 100}%` }} />
            </div>
            <span className="w-8 text-right text-xs font-black text-slate-400">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Journal Page ────────────────────────────────────────────────────────

export function JournalView() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  useEffect(() => {
    setEntries(loadJournal());
  }, []);

  const handleComplete = (updated: JournalEntry) => {
    setEntries((prev) => prev.map((e) => e.id === updated.id ? updated : e));
  };

  const pendingReflections = entries.filter((e) => e.completedAt === null).length;
  const completedReflections = entries.filter((e) => e.completedAt !== null).length;
  const completionRate = entries.length > 0 ? Math.round((completedReflections / entries.length) * 100) : 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black">ژورنال معاملاتی</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">ثبت و بازتاب هر معامله برای یادگیری بهتر</p>
        </div>
        <Link href="/academy/trading-arena" className="flex items-center gap-1 text-xs font-black text-slate-400 hover:text-white focus:outline-none">
          <ChevronRight className="h-3 w-3 rotate-180" /> آرنا
        </Link>
      </div>

      {/* Stats */}
      {entries.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-center">
            <p className="text-xl font-black text-slate-200">{entries.length}</p>
            <p className="text-xs font-bold text-slate-500">معامله ثبت شده</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-center">
            <p className="text-xl font-black text-emerald-300">{completionRate}٪</p>
            <p className="text-xs font-bold text-slate-500">بازتاب‌های کامل</p>
          </div>
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-center">
            <p className="text-xl font-black text-amber-300">{pendingReflections}</p>
            <p className="text-xs font-bold text-slate-500">منتظر بازتاب</p>
          </div>
        </div>
      )}

      {/* Mistake pattern */}
      <MistakePatternSummary entries={entries} />

      {/* Pending reflections first */}
      {pendingReflections > 0 && (
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-amber-300">نیاز به بازتاب</p>
          <div className="space-y-4">
            {entries.filter((e) => !e.completedAt).map((entry) => (
              <JournalEntryDetail key={entry.id} entry={entry} onComplete={handleComplete} />
            ))}
          </div>
        </div>
      )}

      {/* Completed entries */}
      {completedReflections > 0 && (
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">بازتاب‌های کامل</p>
          <div className="space-y-4">
            {entries.filter((e) => e.completedAt).map((entry) => (
              <JournalEntryDetail key={entry.id} entry={entry} onComplete={handleComplete} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-white/10 p-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-600 mb-3" />
          <p className="font-black text-slate-400">ژورنال خالی است</p>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-600">هر بار که معامله می‌کنید، می‌توانید یک برنامه پیش از معامله ثبت کنید.<br />بعد از بستن موقعیت، بازتاب اضافه کنید.</p>
          <Link
            href="/academy/trading-arena"
            className="mt-4 inline-flex items-center gap-1 rounded-2xl bg-slate-800 px-4 py-2 text-sm font-black text-slate-300 hover:text-white"
          >
            رفتن به آرنا <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Education note */}
      <div className="rounded-2xl border border-cyan-300/10 bg-cyan-400/5 p-4">
        <div className="flex items-start gap-2">
          <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          <div>
            <p className="text-xs font-black text-cyan-300 mb-1">چرا ژورنال مهم است؟</p>
            <p className="text-sm font-bold leading-7 text-slate-400">
              بهترین معامله‌گران جهان ژورنال می‌نویسند. ثبت احساسات و اشتباهات باعث می‌شود الگوهای رفتاری خود را بشناسید و کمتر آن‌ها را تکرار کنید.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-white/5 bg-slate-900/40 p-3 text-center">
        <TrendingDown className="h-4 w-4 shrink-0 text-slate-600" />
        <p className="text-xs font-bold text-slate-600">این ژورنال فقط برای یادگیری است. هیچ توصیه مالی‌ای نیست.</p>
      </div>
    </div>
  );
}
