"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Award,
  BookOpen,
  ChevronRight,
  Flame,
  Info,
  Layers,
  Lock,
  Shield,
  Star,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import {
  loadCommunityProfile,
  createCommunityProfile,
  type CommunityProfile,
} from "@/lib/community-profile";
import {
  getCurrentChallenge,
  loadParticipation,
  joinChallenge,
} from "@/lib/community-challenges";
import { computeMyLeaderboardScores } from "@/lib/community-leaderboard";
import { COMMUNITY_SAFETY_RULES } from "@/lib/community-leaderboard";

// ─── Profile setup ────────────────────────────────────────────────────────────

function ProfileSetup({ onCreate }: { onCreate: (profile: CommunityProfile) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleCreate = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) { setError("نام نمایشی باید حداقل ۲ کاراکتر باشد."); return; }
    if (trimmed.length > 30) { setError("نام نمایشی نباید بیشتر از ۳۰ کاراکتر باشد."); return; }
    const profile = createCommunityProfile(trimmed);
    onCreate(profile);
  };

  return (
    <div className="rounded-[28px] border border-cyan-300/20 bg-slate-900 p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/10">
          <Users className="h-5 w-5 text-cyan-300" />
        </div>
        <div>
          <h2 className="font-black">پروفایل جامعه</h2>
          <p className="text-xs font-bold text-slate-400">یک نام نمایشی عمومی انتخاب کنید</p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div>
            <p className="text-xs font-black text-amber-300 mb-1">حریم خصوصی — پیش‌فرض: خصوصی</p>
            <p className="text-xs font-bold text-amber-200/80">
              همه تنظیمات اشتراک‌گذاری به صورت پیش‌فرض غیرفعال هستند. شما کنترل کامل دارید.
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-black text-slate-400">نام نمایشی (مستعار)</label>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          maxLength={30}
          className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-200 placeholder-slate-600 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
          placeholder="مثلاً: آریا.تریدر یا TraderB"
          aria-label="نام نمایشی جامعه"
        />
        {error && <p className="mt-1 text-xs font-bold text-red-300">{error}</p>}
        <p className="mt-1 text-xs font-bold text-slate-600">از نام واقعی، ایمیل، یا اطلاعات شخصی استفاده نکنید.</p>
      </div>

      <button
        onClick={handleCreate}
        disabled={name.trim().length < 2}
        className="w-full rounded-2xl bg-cyan-500 py-3 text-sm font-black text-white hover:bg-cyan-400 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-cyan-300"
      >
        ورود به جامعه تک‌پی
      </button>
    </div>
  );
}

// ─── Quick score widget ───────────────────────────────────────────────────────

function MyScoreWidget() {
  const scores = computeMyLeaderboardScores();
  const items = [
    { label: "انضباط", score: scores.discipline, color: "text-cyan-300" },
    { label: "ثبات", score: scores.consistency, color: "text-violet-300" },
    { label: "ریسک", score: scores.riskManagement, color: "text-emerald-300" },
    { label: "کلی", score: scores.overall, color: "text-amber-300" },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-800/60 p-3 text-center">
          <p className={`text-xl font-black ${item.color}`}>{item.score}</p>
          <p className="text-[10px] font-bold text-slate-500">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Active challenge card ────────────────────────────────────────────────────

function ActiveChallengeCard({ profileExists }: { profileExists: boolean }) {
  const challenge = getCurrentChallenge();
  const participation = loadParticipation();
  const isJoined = participation.some((p) => p.challengeId === challenge.id);
  const [joined, setJoined] = useState(isJoined);

  const DIFF_COLOR = { beginner: "text-emerald-300", intermediate: "text-amber-300", advanced: "text-red-300" };

  return (
    <div className="rounded-[24px] border border-violet-400/20 bg-violet-400/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-violet-300" />
          <p className="font-black text-violet-200">چالش این هفته</p>
        </div>
        <span className={`text-xs font-black ${DIFF_COLOR[challenge.difficulty]}`}>{challenge.difficulty === "beginner" ? "مبتدی" : challenge.difficulty === "intermediate" ? "متوسط" : "پیشرفته"}</span>
      </div>
      <p className="font-black mb-1">{challenge.title}</p>
      <p className="text-sm font-bold leading-7 text-slate-400 mb-3">{challenge.objective}</p>
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-violet-400/20 px-3 py-1 text-xs font-black text-violet-300">
          +{challenge.reward.xpBonus} XP
        </span>
        <button
          onClick={() => { if (profileExists) { joinChallenge(challenge.id); setJoined(true); } }}
          disabled={joined || !profileExists}
          className={`rounded-2xl px-4 py-2 text-xs font-black focus:outline-none focus:ring-2 focus:ring-violet-400 ${
            joined ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300" :
            !profileExists ? "opacity-40 cursor-not-allowed border border-white/10 text-slate-400" :
            "bg-violet-500 text-white hover:bg-violet-400"
          }`}
        >
          {joined ? "✓ عضو شدید" : !profileExists ? "پروفایل لازم است" : "شرکت در چالش"}
        </button>
      </div>
      {!profileExists && (
        <p className="mt-2 text-xs font-bold text-slate-600">برای شرکت در چالش‌ها، ابتدا پروفایل جامعه بسازید.</p>
      )}
    </div>
  );
}

// ─── Navigation tiles ─────────────────────────────────────────────────────────

interface NavTileProps { href: string; icon: React.ReactNode; title: string; description: string; badge?: string }
function NavTile({ href, icon, title, description, badge }: NavTileProps) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 hover:border-cyan-300/20 hover:bg-white/[0.05] transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-800">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-black">{title}</p>
          {badge && <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-[10px] font-black text-cyan-300">{badge}</span>}
        </div>
        <p className="mt-0.5 text-xs font-bold text-slate-500">{description}</p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-600" />
    </Link>
  );
}

// ─── Safety rules ─────────────────────────────────────────────────────────────

function SafetyRules() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
      <button
        className="flex w-full items-center justify-between focus:outline-none"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-emerald-300" />
          <p className="font-black text-emerald-200">قوانین ایمنی جامعه</p>
        </div>
        <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && (
        <ul className="mt-4 space-y-2">
          {COMMUNITY_SAFETY_RULES.map((rule, i) => (
            <li key={i} className="flex items-start gap-2 text-xs font-bold text-slate-400">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-[9px] font-black text-emerald-300">{i + 1}</span>
              {rule}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main hub ─────────────────────────────────────────────────────────────────

export function CommunityHub() {
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProfile(loadCommunityProfile());
    setLoaded(true);
  }, []);

  if (!loaded) {
    return <div className="flex h-64 items-center justify-center text-sm font-bold text-slate-500">در حال بارگذاری...</div>;
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black">جامعه آموزشی</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">یادگیری اجتماعی، حریم‌خصوصی‌محور</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-400/10">
          <Users className="h-6 w-6 text-violet-300" />
        </div>
      </div>

      {/* Safety note */}
      <div className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5">
        <Info className="h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs font-bold text-amber-200">جامعه تک‌پی مشاوره مالی نمی‌دهد. رتبه‌بندی فقط براساس انضباط — نه سود.</p>
      </div>

      {/* Profile setup or profile info */}
      {!profile ? (
        <ProfileSetup onCreate={(p) => setProfile(p)} />
      ) : (
        <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-sm font-black text-white">
              {profile.avatarInitials}
            </div>
            <div>
              <p className="font-black">{profile.displayName}</p>
              <p className="text-xs font-bold text-slate-500">ID: {profile.anonymousId}</p>
            </div>
            <div className="mr-auto flex items-center gap-1.5">
              {profile.privacy.leaderboardVisible ? (
                <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-black text-emerald-300">عمومی</span>
              ) : (
                <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-black text-slate-400">خصوصی</span>
              )}
            </div>
          </div>
          <MyScoreWidget />
          <Link href="/academy/community/leaderboards" className="mt-4 flex items-center justify-center gap-1 text-xs font-black text-cyan-300 hover:underline">
            مشاهده رتبه‌بندی کامل <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Active challenge */}
      <ActiveChallengeCard profileExists={!!profile} />

      {/* Navigation */}
      <div className="space-y-3">
        <NavTile
          href="/academy/community/leaderboards"
          icon={<Trophy className="h-5 w-5 text-amber-300" />}
          title="رتبه‌بندی"
          description="۶ لیدربورد براساس انضباط، ثبات، ریسک و ژورنال"
          badge="جدید"
        />
        <NavTile
          href="/academy/community/challenges"
          icon={<Flame className="h-5 w-5 text-orange-300" />}
          title="چالش‌های هفتگی"
          description="۵ چالش آموزشی که هر هفته تغییر می‌کنند"
        />
        <NavTile
          href="/academy/community/groups"
          icon={<Users className="h-5 w-5 text-violet-300" />}
          title="گروه‌های مطالعاتی"
          description="۵ گروه تخصصی برای یادگیری مشترک"
        />
        <NavTile
          href="/academy/community/journals"
          icon={<BookOpen className="h-5 w-5 text-cyan-300" />}
          title="ژورنال‌های مشترک"
          description="بازتاب‌های گمنام از یادگیرندگان دیگر (اختیاری)"
        />
        <NavTile
          href="/academy/community/instructor"
          icon={<Layers className="h-5 w-5 text-emerald-300" />}
          title="نمای مدرس"
          description="خلاصه پیشرفت خود از دیدگاه یک مدرس"
        />
      </div>

      {/* Community stats (demo) */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">جامعه تک‌پی — آمار این هفته</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "دانش‌آموز فعال", value: "۱۸۴", icon: <Users className="h-4 w-4 text-cyan-300" /> },
            { label: "سناریو پاس‌شده", value: "۴۲۳", icon: <Award className="h-4 w-4 text-emerald-300" /> },
            { label: "ژورنال ثبت‌شده", value: "۶۱۷", icon: <Zap className="h-4 w-4 text-amber-300" /> },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/10 bg-slate-800/60 p-3 text-center">
              <div className="flex justify-center mb-1">{stat.icon}</div>
              <p className="text-lg font-black">{stat.value}</p>
              <p className="text-[10px] font-bold text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[10px] font-bold text-slate-600">* این آمار نمایشی است — داده‌های واقعی با اتصال backend فعال می‌شوند</p>
      </div>

      {/* Safety rules */}
      <SafetyRules />
    </div>
  );
}
