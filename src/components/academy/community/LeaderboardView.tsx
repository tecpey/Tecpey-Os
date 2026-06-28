"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Info, Lock, Trophy } from "lucide-react";
import {
  loadCommunityProfile,
  type CommunityProfile,
} from "@/lib/community-profile";
import {
  getLeaderboard,
  computeMyLeaderboardScores,
  CATEGORY_LABEL,
  CATEGORY_DESCRIPTION,
  COMMUNITY_SAFETY_RULES,
  type LeaderboardCategory,
  type LeaderboardEntry,
} from "@/lib/community-leaderboard";

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, isMe }: { score: number; isMe: boolean }) {
  const color = isMe ? "bg-gradient-to-r from-cyan-500 to-violet-500" :
    score >= 70 ? "bg-emerald-500/60" :
    score >= 45 ? "bg-amber-500/60" :
    "bg-slate-600";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`w-8 text-right text-xs font-black tabular-nums ${isMe ? "text-cyan-300" : "text-slate-400"}`}>{score}</span>
    </div>
  );
}

// ─── Leaderboard row ──────────────────────────────────────────────────────────

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const rankColors = ["text-amber-300", "text-slate-300", "text-amber-600"];
  const rankColor = entry.rank <= 3 ? rankColors[entry.rank - 1] : "text-slate-600";
  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${entry.isMe ? "border-cyan-300/30 bg-cyan-400/5" : "border-white/10 bg-white/[0.02]"}`}>
      <span className={`w-5 text-center text-sm font-black ${rankColor}`}>{entry.rank}</span>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-xs font-black text-slate-300">
        {entry.avatarInitials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-black line-clamp-1 ${entry.isMe ? "text-cyan-200" : "text-slate-300"}`}>
            {entry.displayName}
          </p>
          {entry.isMe && <span className="rounded-full bg-cyan-400/20 px-1.5 py-0.5 text-[9px] font-black text-cyan-300">شما</span>}
          {entry.isDemo && <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">نمایشی</span>}
        </div>
        <p className="text-[10px] font-bold text-slate-600">{entry.anonymousId}</p>
      </div>
      <ScoreBar score={entry.score} isMe={entry.isMe} />
    </div>
  );
}

// ─── Score breakdown ──────────────────────────────────────────────────────────

function MyScoreBreakdown({ profile }: { profile: CommunityProfile }) {
  const scores = computeMyLeaderboardScores();
  const breakdown = [
    { label: "انضباط", score: scores.discipline, weight: "۲۵٪" },
    { label: "ثبات", score: scores.consistency, weight: "۲۰٪" },
    { label: "تسلط سناریو", score: scores.scenarioMastery, weight: "۲۰٪" },
    { label: "کیفیت ژورنال", score: scores.journalQuality, weight: "۱۵٪" },
    { label: "مدیریت ریسک", score: scores.riskManagement, weight: "۲۰٪" },
  ];

  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 text-sm font-black text-white">
          {profile.avatarInitials}
        </div>
        <div>
          <p className="font-black">{profile.displayName}</p>
          <p className="text-xs font-bold text-slate-500">امتیاز کلی: <span className="text-amber-300 font-black">{scores.overall}</span></p>
        </div>
      </div>
      <div className="space-y-2">
        {breakdown.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs font-bold text-slate-400 text-right">{item.label}</span>
            <div className="flex-1">
              <ScoreBar score={item.score} isMe />
            </div>
            <span className="w-7 text-right text-[10px] font-bold text-slate-600">{item.weight}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main LeaderboardView ─────────────────────────────────────────────────────

const CATEGORIES: LeaderboardCategory[] = [
  "overall", "discipline", "consistency", "scenario-mastery", "journal-quality", "risk-management",
];

export function LeaderboardView() {
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [activeCategory, setActiveCategory] = useState<LeaderboardCategory>("overall");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const p = loadCommunityProfile();
    setProfile(p);
    if (p) {
      setEntries(getLeaderboard(activeCategory, p.anonymousId, p.displayName, p.avatarInitials));
    }
    setLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profile) return;
    setEntries(getLeaderboard(activeCategory, profile.anonymousId, profile.displayName, profile.avatarInitials));
  }, [activeCategory, profile]);

  if (!loaded) return <div className="flex h-64 items-center justify-center text-sm font-bold text-slate-500">در حال بارگذاری...</div>;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black">رتبه‌بندی</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">براساس انضباط و رفتار — نه سود</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10">
          <Trophy className="h-6 w-6 text-amber-300" />
        </div>
      </div>

      {/* Anti-profit disclaimer */}
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
          <div>
            <p className="text-xs font-black text-emerald-300 mb-1">رتبه‌بندی TecPey: انضباط اول</p>
            <p className="text-xs font-bold text-emerald-200/80">
              در اینجا سود هرگز معیار رتبه‌بندی نیست. داشتن حد ضرر، نوشتن ژورنال، و کنترل FOMO ارزش بیشتری دارد.
            </p>
          </div>
        </div>
      </div>

      {/* Profile needed notice */}
      {!profile && (
        <div className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-5 text-center">
          <Lock className="mx-auto h-8 w-8 text-amber-300 mb-3" />
          <p className="font-black text-amber-200">پروفایل جامعه لازم است</p>
          <p className="mt-2 text-sm font-bold text-slate-400">برای مشاهده جایگاه خود در رتبه‌بندی، ابتدا به جامعه بپیوندید.</p>
        </div>
      )}

      {/* My score breakdown */}
      {profile && <MyScoreBreakdown profile={profile} />}

      {/* Category tabs */}
      <div>
        <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400 ${activeCategory === cat ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
              aria-pressed={activeCategory === cat}
            >
              {CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>
        <p className="mb-3 text-xs font-bold text-slate-600">{CATEGORY_DESCRIPTION[activeCategory]}</p>
      </div>

      {/* Leaderboard entries */}
      {profile ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <LeaderboardRow key={`${entry.anonymousId}-${entry.rank}`} entry={entry} />
          ))}
          <div className="flex items-center gap-2 pt-2">
            <span className="inline-block h-2 w-4 rounded-sm bg-slate-700" />
            <span className="text-xs font-bold text-slate-600">نمایشی — ورودی‌های دیگر شبیه‌سازی هستند</span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <span className="w-5 text-center text-sm font-black text-slate-600">{i + 1}</span>
              <div className="h-8 w-8 rounded-xl bg-slate-800" />
              <div className="flex-1 h-4 rounded-full bg-slate-800" />
              <div className="h-2 w-20 rounded-full bg-slate-800" />
            </div>
          ))}
        </div>
      )}

      {/* Safety rules */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-amber-300" />
          <p className="text-xs font-black text-amber-300">ممنوع در این جامعه</p>
        </div>
        <ul className="space-y-1">
          {COMMUNITY_SAFETY_RULES.slice(0, 4).map((rule, i) => (
            <li key={i} className="text-xs font-bold text-slate-500">• {rule}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
