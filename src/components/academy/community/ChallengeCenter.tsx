"use client";

import { useEffect, useState } from "react";
import { Award, CheckCircle, ChevronRight, Clock, Flame, Info, Shield } from "lucide-react";
import {
  WEEKLY_CHALLENGES,
  getCurrentChallenge,
  getNextChallenge,
  getCurrentWeekNumber,
  loadParticipation,
  joinChallenge,
  markChallengeComplete,
  DIFFICULTY_LABEL,
  FOCUS_LABEL,
  type Challenge,
  type ChallengeParticipation,
} from "@/lib/community-challenges";
import { loadArenaState, computeArenaStats } from "@/lib/trading-arena";
import { getJournalCompletionRate } from "@/lib/trading-journal";

// ─── Check completion ─────────────────────────────────────────────────────────

function checkChallengeCompletion(challenge: Challenge): { complete: boolean; score: number } {
  const arena = loadArenaState();
  const stats = computeArenaStats(arena);
  const { completionCriteria } = challenge;

  if (completionCriteria.type === "scenario-pass") {
    const passed = arena.scenarioProgress[completionCriteria.scenarioId] === "passed";
    return { complete: passed, score: passed ? 100 : 0 };
  }
  if (completionCriteria.type === "stop-loss-rate") {
    const rate = stats.stopLossRate;
    const complete = stats.totalTrades >= 3 && rate >= completionCriteria.minRate;
    return { complete, score: Math.round(rate * 100) };
  }
  if (completionCriteria.type === "journal-rate") {
    const rate = getJournalCompletionRate();
    const complete = rate >= completionCriteria.minRate;
    return { complete, score: Math.round(rate * 100) };
  }
  return { complete: false, score: 0 };
}

// ─── Active challenge ─────────────────────────────────────────────────────────

function ActiveChallengePanel({ challenge }: { challenge: Challenge }) {
  const weekNum = getCurrentWeekNumber();
  const participation = loadParticipation();
  const myEntry = participation.find((p) => p.challengeId === challenge.id && p.weekNumber === weekNum);

  const { complete } = checkChallengeCompletion(challenge);
  const [joined, setJoined] = useState(!!myEntry);
  const [completed, setCompleted] = useState(myEntry?.completedAt != null || complete);

  const handleJoin = () => {
    joinChallenge(challenge.id);
    setJoined(true);
  };

  const handleCheckCompletion = () => {
    const { complete: isComplete, score: finalScore } = checkChallengeCompletion(challenge);
    if (isComplete) {
      markChallengeComplete(challenge.id, finalScore);
      setCompleted(true);
    }
  };

  const DIFF_COLOR = { beginner: "text-emerald-300", intermediate: "text-amber-300", advanced: "text-red-300" };

  return (
    <div className="rounded-[24px] border border-violet-400/30 bg-violet-400/5 p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-black ${DIFF_COLOR[challenge.difficulty]}`}>{DIFFICULTY_LABEL[challenge.difficulty]}</span>
            <span className="text-xs font-bold text-slate-600">·</span>
            <span className="text-xs font-black text-violet-300">{FOCUS_LABEL[challenge.focus]}</span>
            <span className="text-xs font-bold text-slate-600">·</span>
            <span className="text-xs font-bold text-slate-500">{challenge.estimatedMinutes} دقیقه</span>
          </div>
          <h2 className="text-xl font-black">{challenge.title}</h2>
        </div>
        {completed && <CheckCircle className="h-7 w-7 text-emerald-300 shrink-0" />}
      </div>

      <p className="text-sm font-bold leading-7 text-slate-300">{challenge.objective}</p>

      <div className="space-y-2">
        <p className="text-xs font-black text-slate-500">قوانین:</p>
        {challenge.rules.map((rule, i) => (
          <div key={i} className="flex items-start gap-2 text-xs font-bold text-slate-400">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-violet-400/20 text-[9px] font-black text-violet-300">{i + 1}</span>
            {rule}
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-slate-800/60 p-3">
        <p className="text-xs font-black text-slate-500 mb-1">نحوه امتیازدهی:</p>
        <p className="text-xs font-bold text-slate-300">{challenge.scoringMethod}</p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-amber-300" />
          <span className="text-sm font-black text-amber-300">{challenge.reward.label}</span>
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-black text-amber-300">+{challenge.reward.xpBonus} XP</span>
        </div>
      </div>

      {/* Responsible trading note */}
      <div className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3">
        <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
        <p className="text-xs font-bold text-emerald-200">{challenge.responsibleTradingNote}</p>
      </div>

      {/* Actions */}
      {completed ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 py-3">
          <CheckCircle className="h-5 w-5 text-emerald-300" />
          <p className="font-black text-emerald-200">چالش تکمیل شد!</p>
        </div>
      ) : !joined ? (
        <button
          onClick={handleJoin}
          className="w-full rounded-2xl bg-violet-500 py-3 text-sm font-black text-white hover:bg-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
        >
          شرکت در چالش
        </button>
      ) : (
        <button
          onClick={handleCheckCompletion}
          className="w-full rounded-2xl border border-cyan-300/20 bg-cyan-400/5 py-3 text-sm font-black text-cyan-200 hover:bg-cyan-400/10 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        >
          بررسی تکمیل <ChevronRight className="inline h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── Challenge history ────────────────────────────────────────────────────────

function ChallengeHistoryCard({ challenge, entry }: { challenge: Challenge; entry: ChallengeParticipation | undefined }) {
  const completed = entry?.completedAt != null;
  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${completed ? "border-emerald-400/20 bg-emerald-400/5" : "border-white/10 bg-white/[0.02]"}`}>
      {completed ? <CheckCircle className="h-5 w-5 text-emerald-300 shrink-0" /> : <Clock className="h-5 w-5 text-slate-600 shrink-0" />}
      <div className="flex-1">
        <p className={`text-sm font-black ${completed ? "text-emerald-200" : "text-slate-400"}`}>{challenge.title}</p>
        <p className="text-xs font-bold text-slate-600">{FOCUS_LABEL[challenge.focus]}</p>
      </div>
      {entry && (
        <span className={`text-sm font-black ${completed ? "text-emerald-300" : "text-slate-600"}`}>
          {entry.score}
        </span>
      )}
    </div>
  );
}

// ─── Main ChallengeCenter ─────────────────────────────────────────────────────

export function ChallengeCenter() {
  const [participation, setParticipation] = useState<ChallengeParticipation[]>([]);
  const currentChallenge = getCurrentChallenge();
  const nextChallenge = getNextChallenge();
  const weekNum = getCurrentWeekNumber();

  useEffect(() => {
    setParticipation(loadParticipation());
  }, []);

  const pastChallenges = WEEKLY_CHALLENGES.filter((c) => c.id !== currentChallenge.id);
  const completedCount = participation.filter((p) => p.completedAt != null).length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black">چالش‌های هفتگی</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">یادگیری ساختارمند — هر هفته یک چالش جدید</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-400/10">
          <Flame className="h-6 w-6 text-orange-300" />
        </div>
      </div>

      {/* Safety note */}
      <div className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5">
        <Info className="h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs font-bold text-amber-200">همه چالش‌ها با شبیه‌ساز تک‌پی هستند. سرمایه واقعی درگیر نیست.</p>
      </div>

      {/* Progress bar */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-4">
        <div className="mb-2 flex justify-between text-xs font-black">
          <span className="text-slate-400">چالش‌های تکمیل شده</span>
          <span className="text-cyan-300">{completedCount} از {WEEKLY_CHALLENGES.length}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-500 transition-all" style={{ width: `${(completedCount / WEEKLY_CHALLENGES.length) * 100}%` }} />
        </div>
      </div>

      {/* Active challenge */}
      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">هفته {weekNum} — چالش فعال</p>
        <ActiveChallengePanel challenge={currentChallenge} />
      </div>

      {/* Next week preview */}
      <div className="rounded-[24px] border border-white/10 bg-slate-800/40 p-5">
        <p className="mb-2 text-xs font-black text-slate-500">هفته آینده:</p>
        <p className="font-black text-slate-300">{nextChallenge.title}</p>
        <p className="mt-1 text-xs font-bold text-slate-500">{nextChallenge.objective}</p>
      </div>

      {/* Challenge history */}
      <div>
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">سایر چالش‌ها</p>
        <div className="space-y-2">
          {pastChallenges.map((challenge) => {
            const entry = participation.find((p) => p.challengeId === challenge.id);
            return <ChallengeHistoryCard key={challenge.id} challenge={challenge} entry={entry} />;
          })}
        </div>
      </div>
    </div>
  );
}
