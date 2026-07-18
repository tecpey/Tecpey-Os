"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, Eye, Info, Layers, Lock, TrendingDown, TrendingUp } from "lucide-react";
import {
  loadCommunityProfile,
  updatePrivacy,
  type CommunityProfile,
} from "@/lib/community-profile";
import { DIMENSION_LABELS, type BehavioralSnapshot } from "@/lib/behavioral-engine";
import { fetchBehavioralSnapshot } from "@/lib/behavioral-client";
import { computeMyLeaderboardScores } from "@/lib/community-leaderboard";
import { loadArenaState, computeArenaStats } from "@/lib/trading-arena";
import { getJournalCompletionRate } from "@/lib/trading-journal";
import { CONCEPT_NODES } from "@/lib/knowledge-graph";
import { loadProgress } from "@/lib/academy-progress";

// ─── Consent gate ─────────────────────────────────────────────────────────────

function ConsentGate({ profile, onConsent }: { profile: CommunityProfile; onConsent: (p: CommunityProfile) => void }) {
  return (
    <div className="rounded-[28px] border border-violet-400/20 bg-violet-400/5 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Eye className="h-6 w-6 text-violet-300" />
        <h2 className="font-black text-violet-200">نمای مدرس</h2>
      </div>
      <p className="text-sm font-bold leading-7 text-slate-300">
        این داشبورد نشان می‌دهد اگر یک مدرس یا منتور پروفایل شما را مشاهده کند، چه اطلاعاتی می‌بیند.
      </p>
      <div className="rounded-xl bg-slate-800/60 p-4 space-y-2">
        <p className="text-xs font-black text-slate-400">چه چیزهایی به اشتراک گذاشته می‌شود:</p>
        <ul className="space-y-1 text-xs font-bold text-slate-400">
          {[
            "امتیاز کلی رفتار یادگیری",
            "ضعیف‌ترین و قوی‌ترین ابعاد رفتاری (بدون جزئیات خصوصی)",
            "الگوهای ریسک در معاملات شبیه‌سازی‌شده",
            "نرخ تکمیل ژورنال",
            "پیشرفت در سناریوها",
            "مفاهیم ضعیف در نقشه دانش",
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-2"><CheckCircle className="h-3 w-3 text-emerald-400 shrink-0" />{item}</li>
          ))}
        </ul>
        <p className="text-xs font-black text-red-300 mt-2">چه چیزهایی به اشتراک گذاشته نمی‌شود: موجودی دقیق، پیام‌های خصوصی، اطلاعات شناسایی</p>
      </div>
      <button
        onClick={() => onConsent(updatePrivacy(profile, { mentorReviewConsent: true }))}
        className="w-full rounded-2xl bg-violet-500 py-3 text-sm font-black text-white hover:bg-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
      >
        فعال کردن نمای مدرس
      </button>
    </div>
  );
}

// ─── Metric block ─────────────────────────────────────────────────────────────

function MetricBlock({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-center">
      <p className={`text-xl font-black ${color ?? "text-slate-200"}`}>{value}</p>
      <p className="text-xs font-bold text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] font-bold text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Weak topic list ──────────────────────────────────────────────────────────

function WeakTopicsList({ completedLessons }: { completedLessons: Set<string> }) {
  const weakNodes = CONCEPT_NODES.filter((node) => {
    const lessonCompleted = [...completedLessons].some((id) => id.includes(`l${node.lessonIndex}`));
    return !lessonCompleted;
  }).slice(0, 6);

  if (weakNodes.length === 0) {
    return <p className="text-sm font-bold text-emerald-300">تمام مفاهیم ترم ۱ پوشش داده شده‌اند.</p>;
  }

  return (
    <div className="space-y-2">
      {weakNodes.map((node) => (
        <div key={node.id} className="flex items-center gap-3 rounded-xl border border-amber-400/10 bg-amber-400/5 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-black">{node.label}</p>
            <p className="text-xs font-bold text-slate-500">درس {node.lessonIndex} — ترم ۱</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Risk pattern bar ─────────────────────────────────────────────────────────

function RiskPatternBar({ label, rate, safe }: { label: string; rate: number; safe: boolean }) {
  const pct = Math.round(rate * 100);
  const color = safe ? (pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500") :
    (pct <= 20 ? "bg-emerald-500" : pct <= 40 ? "bg-amber-500" : "bg-red-500");
  const textColor = safe ? (pct >= 80 ? "text-emerald-300" : pct >= 50 ? "text-amber-300" : "text-red-300") :
    (pct <= 20 ? "text-emerald-300" : pct <= 40 ? "text-amber-300" : "text-red-300");
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs font-bold text-slate-400 text-right">{label}</span>
      <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-8 text-right text-xs font-black tabular-nums ${textColor}`}>{pct}٪</span>
    </div>
  );
}

// ─── Main InstructorDashboard ─────────────────────────────────────────────────

export function InstructorDashboard() {
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProfile(loadCommunityProfile());
    setLoaded(true);
  }, []);

  if (!loaded) return <div className="flex h-64 items-center justify-center text-sm font-bold text-slate-500">در حال بارگذاری...</div>;

  const hasConsent = profile?.privacy.mentorReviewConsent ?? false;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black">نمای مدرس</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">خلاصه پیشرفت از دیدگاه یک مدرس یا منتور</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/10">
          <Layers className="h-6 w-6 text-emerald-300" />
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5">
        <Info className="h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs font-bold text-amber-200">هیچ داده خصوصی‌ای بدون رضایت صریح شما به مدرسان نشان داده نمی‌شود.</p>
      </div>

      {!profile ? (
        <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-6 text-center">
          <Lock className="mx-auto h-8 w-8 text-amber-300 mb-3" />
          <p className="font-black text-amber-200">پروفایل جامعه لازم است</p>
        </div>
      ) : !hasConsent ? (
        <ConsentGate profile={profile} onConsent={setProfile} />
      ) : (
        <ConsentedView />
      )}
    </div>
  );
}

// ─── Full view after consent ──────────────────────────────────────────────────

function ConsentedView() {
  const [snapshot, setSnapshot] = useState<BehavioralSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    void fetchBehavioralSnapshot("fa", controller.signal)
      .then(setSnapshot)
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [reloadToken]);

  if (!snapshot) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3 text-sm font-bold text-slate-500">
        {loadError ? (
          <>
            <span className="text-amber-300">دریافت نمای رفتاری از سرور انجام نشد.</span>
            <button
              type="button"
              onClick={() => setReloadToken((value) => value + 1)}
              className="rounded-xl border border-cyan-300/30 px-4 py-2 text-xs font-black text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            >
              تلاش دوباره
            </button>
          </>
        ) : "در حال دریافت نمای مجاز از سرور..."}
      </div>
    );
  }

  const scores = computeMyLeaderboardScores();
  const arena = loadArenaState();
  const stats = computeArenaStats(arena);
  const progress = loadProgress();
  const journalRate = getJournalCompletionRate();
  const completedLessons = new Set(Object.keys(progress.completedLessons));

  // Top 2 weakest dimensions
  const sorted = [...snapshot.dimensions].sort((a, b) => a.score - b.score);
  const weakestDims = sorted.slice(0, 3);
  const strongestDims = [...snapshot.dimensions].sort((a, b) => b.score - a.score).slice(0, 2);

  return (
    <div className="space-y-6">
      {/* Student snapshot */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">خلاصه دانش‌آموز</p>
        <div className="grid grid-cols-3 gap-3">
          <MetricBlock label="امتیاز کلی" value={`${snapshot.overallScore}`} color={snapshot.overallScore >= 70 ? "text-emerald-300" : "text-amber-300"} />
          <MetricBlock label="انضباط" value={`${scores.discipline}`} sub="حد ضرر + streak" color="text-cyan-300" />
          <MetricBlock label="مدیریت ریسک" value={`${scores.riskManagement}`} sub="نرخ SL + anti-over-risk" color="text-violet-300" />
          <MetricBlock label="ژورنال" value={`${Math.round(journalRate * 100)}٪`} sub="تکمیل‌شده" color={journalRate >= 0.8 ? "text-emerald-300" : "text-amber-300"} />
          <MetricBlock label="سناریو" value={`${stats.scenariosPassed}/6`} color="text-amber-300" />
          <MetricBlock label="ثبات" value={`${scores.consistency}`} sub="streak + روزهای فعال" color="text-slate-200" />
        </div>
      </div>

      {/* Weak dimensions */}
      <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="h-5 w-5 text-amber-300" />
          <p className="font-black text-amber-200">ضعیف‌ترین ابعاد رفتاری</p>
        </div>
        <div className="space-y-3">
          {weakestDims.map((d) => (
            <div key={d.dimension} className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800">
                <span className="text-xs font-black text-red-300">{d.score}</span>
              </div>
              <div>
                <p className="text-sm font-black">{DIMENSION_LABELS[d.dimension]}</p>
                <p className="text-xs font-bold leading-6 text-slate-500">{d.actionSuggestion}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strong dimensions */}
      <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-400/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-5 w-5 text-emerald-300" />
          <p className="font-black text-emerald-200">قوی‌ترین ابعاد</p>
        </div>
        {strongestDims.map((d) => (
          <div key={d.dimension} className="flex items-center gap-3 mb-2">
            <span className="text-sm font-black text-emerald-300">{d.score}</span>
            <p className="text-sm font-bold text-slate-300">{DIMENSION_LABELS[d.dimension]}</p>
          </div>
        ))}
      </div>

      {/* Risk patterns */}
      {stats.totalTrades > 0 && (
        <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">الگوهای ریسک</p>
          <div className="space-y-2">
            <RiskPatternBar label="نرخ حد ضرر" rate={stats.stopLossRate} safe />
            <RiskPatternBar label="ریسک بیش از حد" rate={stats.overRiskRate} safe={false} />
            <RiskPatternBar label="معامله انتقامی" rate={stats.revengeTradeRate} safe={false} />
            <RiskPatternBar label="ورود تکانشی" rate={stats.impulseRate} safe={false} />
          </div>
        </div>
      )}

      {/* Weak topics */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">مفاهیم نیاز به تقویت</p>
        <WeakTopicsList completedLessons={completedLessons} />
      </div>

      {/* Disclaimer */}
      <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-4">
        <p className="text-xs font-bold text-slate-600 text-center">
          این داشبورد برای اهداف آموزشی است. هیچ مشاوره مالی در اینجا ارائه نمی‌شود.
        </p>
      </div>
    </div>
  );
}
