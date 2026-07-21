"use client";

import Link from "next/link";
import {
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
import { useState } from "react";
import { getChallengeCycle } from "@/lib/community-challenges";
import { COMMUNITY_SAFETY_RULES } from "@/lib/community-leaderboard";

interface NavTileProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  status: "official" | "preview" | "locked";
}

const STATUS_LABEL: Record<NavTileProps["status"], string> = {
  official: "سرورمحور",
  preview: "پیش‌نمایش",
  locked: "قفل‌شده",
};

const STATUS_CLASS: Record<NavTileProps["status"], string> = {
  official: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  preview: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  locked: "border-slate-500/20 bg-slate-500/10 text-slate-400",
};

function NavTile({ href, icon, title, description, status }: NavTileProps) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-5 transition-all hover:border-cyan-300/20 hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-cyan-400"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-800">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-black text-white">{title}</p>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${STATUS_CLASS[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        <p className="mt-1 text-xs font-bold leading-6 text-slate-500">{description}</p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-600" />
    </Link>
  );
}

function ActiveChallengeCard() {
  const cycle = getChallengeCycle();
  const challenge = cycle.challenge;
  const official = challenge.id === "journal-reflection-week";

  return (
    <section className={`rounded-[24px] border p-5 ${official
      ? "border-violet-400/25 bg-violet-400/5"
      : "border-amber-400/20 bg-amber-400/5"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Flame className={official ? "h-5 w-5 text-violet-300" : "h-5 w-5 text-amber-300"} />
            <p className={official ? "font-black text-violet-200" : "font-black text-amber-200"}>
              چرخه جاری جامعه
            </p>
          </div>
          <h2 className="mt-3 text-lg font-black text-white">{challenge.title}</h2>
          <p className="mt-2 max-w-xl text-sm font-bold leading-7 text-slate-400">
            {challenge.objective}
          </p>
          <p className="mt-2 text-[10px] font-bold text-slate-600">
            شناسه چرخه: {cycle.weekKey}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${official
          ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
          : "border-amber-400/20 bg-amber-400/10 text-amber-200"}`}>
          {official ? "قابل ارزیابی با Evidence سرور" : "فقط پیش‌نمایش تمرین"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <p className="text-xs font-bold leading-6 text-slate-500">
          Join، Completion، XP و Badge فقط در صفحه رسمی Challenge و پس از بررسی سرور انجام می‌شوند.
        </p>
        <Link
          href="/academy/community/challenges"
          className="inline-flex items-center gap-1 rounded-2xl bg-violet-500 px-4 py-2.5 text-xs font-black text-white transition hover:bg-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
        >
          مشاهده وضعیت معتبر <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
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
            <li key={rule} className="flex items-start gap-2 text-xs font-bold leading-6 text-slate-400">
              <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-[9px] font-black text-emerald-300">
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
  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">جامعه آموزشی</h1>
          <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-slate-400">
            سطوح معتبر جامعه فقط از حساب، Consent و Evidence سرور استفاده می‌کنند؛ بخش‌های تکمیل‌نشده با برچسب روشن قفل یا Preview هستند.
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-400/10">
          <Users className="h-6 w-6 text-violet-300" />
        </div>
      </header>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs font-bold leading-6 text-amber-100/85">
          جامعه تک‌پی مشاوره مالی یا سیگنال ارائه نمی‌دهد. هیچ آمار، رتبه، Join یا پاداش Demo به‌عنوان نتیجه واقعی نمایش داده نمی‌شود.
        </p>
      </div>

      <ActiveChallengeCard />

      <section className="space-y-3" aria-label="بخش‌های جامعه تک‌پی">
        <NavTile
          href="/academy/community/journals"
          icon={<BookOpen className="h-5 w-5 text-cyan-300" />}
          title="ژورنال‌های مشترک"
          description="بازتاب‌های حریم‌خصوصی‌محور از Reflectionهای معتبر Trading Arena"
          status="official"
        />
        <NavTile
          href="/academy/community/challenges"
          icon={<Flame className="h-5 w-5 text-orange-300" />}
          title="چالش‌های هفتگی"
          description="یک Challenge رسمی ژورنال با Reward Exactly-Once؛ سایر تمرین‌ها قفل هستند"
          status="official"
        />
        <NavTile
          href="/academy/community/leaderboards"
          icon={<Trophy className="h-5 w-5 text-amber-300" />}
          title="رتبه‌بندی"
          description="تا ساخت Projection معتبر Reputation، هیچ رتبه رسمی صادر نمی‌شود"
          status="preview"
        />
        <NavTile
          href="/academy/community/groups"
          icon={<Users className="h-5 w-5 text-violet-300" />}
          title="گروه‌های مطالعاتی"
          description="کاتالوگ تجربه آینده؛ عضویت و فعالیت رسمی هنوز فعال نیست"
          status="preview"
        />
        <NavTile
          href="/academy/community/instructor"
          icon={<Layers className="h-5 w-5 text-emerald-300" />}
          title="نمای مدرس"
          description="اشتراک واقعی تا ساخت Role، Grant و Audit اختصاصی غیرفعال است"
          status="locked"
        />
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-slate-500/20 bg-slate-500/5 px-4 py-4">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="text-xs font-bold leading-6 text-slate-400">
          پروفایل عمومی، Consent، Challenge و Journal از صفحات اختصاصی حساب‌محور مدیریت می‌شوند؛ این Hub هیچ وضعیت کاربر را در مرورگر ذخیره یا تولید نمی‌کند.
        </p>
      </div>

      <SafetyRules />
    </div>
  );
}
