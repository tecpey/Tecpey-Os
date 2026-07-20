"use client";

import { Award, Clock, Flame, Info, Shield } from "lucide-react";
import {
  WEEKLY_CHALLENGES,
  getCurrentChallenge,
  getNextChallenge,
  getCurrentWeekNumber,
  DIFFICULTY_LABEL,
  FOCUS_LABEL,
  type Challenge,
} from "@/lib/community-challenges";

const DIFFICULTY_COLOR = {
  beginner: "text-emerald-300",
  intermediate: "text-amber-300",
  advanced: "text-red-300",
};

function ChallengePreviewCard({
  challenge,
  active = false,
}: {
  challenge: Challenge;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded-[24px] border p-5 ${
        active
          ? "border-violet-400/30 bg-violet-400/5"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`text-xs font-black ${DIFFICULTY_COLOR[challenge.difficulty]}`}>
              {DIFFICULTY_LABEL[challenge.difficulty]}
            </span>
            <span className="text-xs font-bold text-slate-600">·</span>
            <span className="text-xs font-black text-violet-300">
              {FOCUS_LABEL[challenge.focus]}
            </span>
            <span className="text-xs font-bold text-slate-600">·</span>
            <span className="flex items-center gap-1 text-xs font-bold text-slate-500">
              <Clock className="h-3 w-3" />
              {challenge.estimatedMinutes} دقیقه
            </span>
          </div>
          <h2 className="text-lg font-black">{challenge.title}</h2>
        </div>
        <Award className="h-5 w-5 shrink-0 text-amber-300" />
      </div>

      <p className="mt-3 text-sm font-bold leading-7 text-slate-300">
        {challenge.objective}
      </p>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-black text-slate-500">قوانین تمرین:</p>
        {challenge.rules.map((rule, index) => (
          <div key={rule} className="flex items-start gap-2 text-xs font-bold text-slate-400">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-400/20 text-[9px] font-black text-violet-300">
              {index + 1}
            </span>
            {rule}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <p className="text-xs font-bold text-emerald-200">
          {challenge.responsibleTradingNote}
        </p>
      </div>
    </div>
  );
}

export function ChallengeCenter() {
  const currentChallenge = getCurrentChallenge();
  const nextChallenge = getNextChallenge();
  const weekNumber = getCurrentWeekNumber();
  const otherChallenges = WEEKLY_CHALLENGES.filter(
    (challenge) => challenge.id !== currentChallenge.id && challenge.id !== nextChallenge.id,
  );

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black">چالش‌های هفتگی</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">
            کاتالوگ تمرین تا اتصال کامل تکمیل و امتیازدهی به authority سرور
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-400/10">
          <Flame className="h-6 w-6 text-orange-300" />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs font-bold leading-6 text-amber-200">
          این صفحه فعلاً فقط پیش‌نمایش تمرین‌هاست. تکمیل، امتیاز، XP و پاداش رسمی از
          داده مرورگر محاسبه نمی‌شود و پس از اتصال به شواهد تأییدشده سرور فعال خواهد شد.
        </p>
      </div>

      <section>
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
          هفته {weekNumber} — تمرین فعال
        </p>
        <ChallengePreviewCard challenge={currentChallenge} active />
      </section>

      <section>
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
          هفته آینده
        </p>
        <ChallengePreviewCard challenge={nextChallenge} />
      </section>

      <section>
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">
          سایر تمرین‌ها
        </p>
        <div className="space-y-3">
          {otherChallenges.map((challenge) => (
            <ChallengePreviewCard key={challenge.id} challenge={challenge} />
          ))}
        </div>
      </section>
    </div>
  );
}
