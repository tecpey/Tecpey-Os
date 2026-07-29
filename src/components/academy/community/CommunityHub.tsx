"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Award,
  BookOpen,
  ChevronRight,
  Flame,
  Info,
  Layers,
  Lock,
  Shield,
  Trophy,
  Users,
} from "lucide-react";
import {
  createCommunityProfile,
  loadCommunityProfile,
  type CommunityProfile,
} from "@/lib/community-profile";
import { COMMUNITY_SAFETY_RULES } from "@/lib/community-leaderboard";
import { ReputationEvidencePanel } from "./ReputationEvidencePanel";

function ProfileSetup({ onCreate }: { onCreate: (profile: CommunityProfile) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleCreate = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("نام نمایشی باید حداقل ۲ کاراکتر باشد.");
      return;
    }
    if (trimmed.length > 30) {
      setError("نام نمایشی نباید بیشتر از ۳۰ کاراکتر باشد.");
      return;
    }
    onCreate(createCommunityProfile(trimmed));
  };

  return (
    <section className="space-y-5 rounded-[28px] border border-cyan-300/20 bg-slate-900 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-400/10">
          <Users className="h-5 w-5 text-cyan-300" />
        </div>
        <div>
          <h2 className="font-black">پروفایل نمایشی جامعه</h2>
          <p className="text-xs font-bold text-slate-400">فقط برای پیش‌نمایش رابط؛ Consent رسمی از حساب سرور می‌آید.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
        <div className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="text-xs font-bold leading-6 text-amber-200/80">
            این نام محلی هیچ دسترسی، رضایت، امتیاز، Completion یا وضعیت رسمی ایجاد نمی‌کند. تنظیمات رسمی Community فقط در PostgreSQL ذخیره می‌شوند.
          </p>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-black text-slate-400">نام مستعار نمایشی</label>
        <input
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => event.key === "Enter" && handleCreate()}
          maxLength={30}
          className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-200 placeholder-slate-600 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
          placeholder="مثلاً: آریا.تریدر"
          aria-label="نام نمایشی جامعه"
        />
        {error && <p className="mt-1 text-xs font-bold text-red-300">{error}</p>}
        <p className="mt-1 text-xs font-bold text-slate-600">از نام واقعی، ایمیل یا اطلاعات شخصی استفاده نکنید.</p>
      </div>

      <button
        type="button"
        onClick={handleCreate}
        disabled={name.trim().length < 2}
        className="w-full rounded-2xl bg-cyan-500 py-3 text-sm font-black text-white hover:bg-cyan-400 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-cyan-300"
      >
        ادامه پیش‌نمایش جامعه
      </button>
    </section>
  );
}

function OfficialChallengeCard() {
  return (
    <section className="rounded-[24px] border border-violet-400/20 bg-violet-400/5 p-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-violet-300" />
          <div>
            <p className="font-black text-violet-200">Challenge رسمی پایلوت</p>
            <p className="mt-1 text-[10px] font-bold text-violet-200/60">journal-reflection-week</p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black text-emerald-200">
          Server Authority
        </span>
      </div>
      <p className="font-black text-white">چالش بازتاب ژورنال</p>
      <p className="mt-2 text-sm font-bold leading-7 text-slate-400">
        عضویت، چرخه هفتگی، معاملات واجد شرایط و Reflectionها فقط از PostgreSQL و Evidence معتبر Trading Arena محاسبه می‌شوند.
      </p>
      <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
        <p className="text-xs font-bold leading-6 text-amber-100/75">
          XP، Badge و پاداش مالی هنوز غیرفعال‌اند. Hub هیچ Join یا Completion مرورگری ثبت نمی‌کند.
        </p>
      </div>
      <Link
        href="/academy/community/challenges"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-500 px-4 py-3 text-sm font-black text-white transition hover:bg-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
      >
        مشاهده وضعیت رسمی از سرور
        <ChevronRight className="h-4 w-4" />
      </Link>
    </section>
  );
}

interface NavTileProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}

function NavTile({ href, icon, title, description, badge }: NavTileProps) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-cyan-300/20 hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-cyan-400"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-800">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-black">{title}</p>
          {badge && (
            <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-[10px] font-black text-cyan-300">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs font-bold leading-6 text-slate-500">{description}</p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-600" />
    </Link>
  );
}

function SafetyRules() {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
      <button
        type="button"
        className="flex w-full items-center justify-between focus:outline-none focus:ring-2 focus:ring-emerald-400"
        onClick={() => setExpanded((value) => !value)}
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
          {COMMUNITY_SAFETY_RULES.map((rule, index) => (
            <li key={rule} className="flex items-start gap-2 text-xs font-bold text-slate-400">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-[9px] font-black text-emerald-300">
                {index + 1}
              </span>
              {rule}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CommunityHub() {
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProfile(loadCommunityProfile());
    setLoaded(true);
  }, []);

  if (!loaded) {
    return (
      <div className="flex h-64 items-center justify-center text-sm font-bold text-slate-500">
        در حال بارگذاری...
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">جامعه آموزشی</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">یادگیری اجتماعی، حریم‌خصوصی‌محور و مبتنی بر شواهد سرور</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-400/10">
          <Users className="h-6 w-6 text-violet-300" />
        </div>
      </header>

      <div className="flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs font-bold leading-6 text-amber-200">
          جامعه تک‌پی مشاوره مالی نمی‌دهد. وضعیت رسمی از Server Authority می‌آید؛ UI محلی منبع حقیقت نیست.
        </p>
      </div>

      {!profile ? (
        <ProfileSetup onCreate={setProfile} />
      ) : (
        <section className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-sm font-black text-white">
              {profile.displayName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="font-black text-white">{profile.displayName}</p>
              <p className="text-xs font-bold text-slate-500">پروفایل نمایشی محلی — بدون Authority رسمی</p>
            </div>
          </div>
        </section>
      )}

      <OfficialChallengeCard />
      <ReputationEvidencePanel />

      <section className="grid gap-3 sm:grid-cols-2">
        <NavTile
          href="/academy/community/journals"
          icon={<BookOpen className="h-5 w-5 text-cyan-300" />}
          title="ژورنال‌های مشترک"
          description="Feed معتبر و حریم‌خصوصی‌محور از Reflectionهای واقعی Arena"
          badge="Server"
        />
        <NavTile
          href="/academy/community/challenges"
          icon={<Flame className="h-5 w-5 text-orange-300" />}
          title="چالش‌های آموزشی"
          description="یک پایلوت رسمی؛ سایر تمرین‌ها تا تکمیل Evidence در حالت Preview"
          badge="Pilot"
        />
        <NavTile
          href="/academy/community/leaderboard"
          icon={<Trophy className="h-5 w-5 text-amber-300" />}
          title="جدول رتبه‌بندی"
          description="Evidence رسمی آماده است؛ Rank و Reward هنوز غیرفعال‌اند"
          badge="Evidence"
        />
        <NavTile
          href="/academy/community/instructors"
          icon={<Award className="h-5 w-5 text-violet-300" />}
          title="مرور با مدرس"
          description="تا Role/Grant Authority واقعی، اشتراک با مدرس فعال نیست"
          badge="Locked"
        />
        <NavTile
          href="/academy/trading-arena"
          icon={<Layers className="h-5 w-5 text-emerald-300" />}
          title="Trading Arena"
          description="تمرین معامله و تولید Reflection معتبر در محیط شبیه‌سازی"
        />
      </section>

      <SafetyRules />
    </div>
  );
}
