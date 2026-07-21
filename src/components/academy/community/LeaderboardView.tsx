"use client";

import { AlertTriangle, Info, Lock, ShieldCheck, Trophy } from "lucide-react";
import {
  CATEGORY_DESCRIPTION,
  CATEGORY_LABEL,
  COMMUNITY_SAFETY_RULES,
  type LeaderboardCategory,
} from "@/lib/community-leaderboard";
import { JournalDisciplineScorePanel } from "./JournalDisciplineScorePanel";
import { ReputationEvidencePanel } from "./ReputationEvidencePanel";

const CATEGORIES: LeaderboardCategory[] = [
  "overall",
  "discipline",
  "consistency",
  "scenario-mastery",
  "journal-quality",
  "risk-management",
];

export function LeaderboardView() {
  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">اعتبار مبتنی بر شواهد</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">
            Evidence و Score خصوصی فعال‌اند؛ رتبه‌بندی عمومی هنوز سیاست مصوب ندارد.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10">
          <Trophy className="h-6 w-6 text-amber-300" />
        </div>
      </header>

      <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
          <div>
            <p className="mb-1 text-xs font-black text-cyan-100">Evidence قبل از Ranking</p>
            <p className="text-xs font-bold leading-6 text-cyan-100/70">
              Finalizationهای رسمی Challenge به‌صورت Append-only ثبت می‌شوند. تنها Policy فعال، Score خصوصی انضباط ژورنال است؛ Rank، Reward، بورسیه و تصمیم Mentor همچنان غیرفعال‌اند.
            </p>
          </div>
        </div>
      </section>

      <ReputationEvidencePanel />
      <JournalDisciplineScorePanel />

      <section className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-start gap-3">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-black text-slate-200">دسته‌های سیاست رتبه‌بندی</p>
              <span className="rounded-full border border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-[10px] font-black text-slate-500">
                Locked
              </span>
            </div>
            <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
              این دسته‌ها Taxonomy آینده محصول هستند. Score خصوصی انضباط ژورنال به هیچ جایگاه عمومی تبدیل نمی‌شود.
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES.map((category) => (
            <div
              key={category}
              className="rounded-2xl border border-white/5 bg-slate-950/40 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-300">{CATEGORY_LABEL[category]}</p>
                <span className="rounded-full border border-slate-500/20 px-2 py-0.5 text-[9px] font-black text-slate-600">
                  بدون رتبه
                </span>
              </div>
              <p className="mt-2 text-[11px] font-bold leading-5 text-slate-600">
                {CATEGORY_DESCRIPTION[category]}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[24px] border border-violet-400/15 bg-violet-400/5 p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" />
          <div>
            <p className="font-black text-violet-100">شرایط لازم پیش از فعال‌شدن Leaderboard</p>
            <p className="mt-2 text-xs font-bold leading-6 text-violet-100/65">
              Cohort eligibility، حداقل جمعیت، Privacy threshold، Tie policy، Anti-gaming، Bias review، Appeal، نسخه‌بندی و Rollback باید در Slice مستقل تصویب و تست شوند.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-white/10 bg-slate-900/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-300" />
          <p className="text-xs font-black text-amber-300">قواعد ایمنی این صفحه</p>
        </div>
        <ul className="space-y-1.5">
          {COMMUNITY_SAFETY_RULES.map((rule) => (
            <li key={rule} className="text-xs font-bold leading-5 text-slate-500">
              • {rule}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
