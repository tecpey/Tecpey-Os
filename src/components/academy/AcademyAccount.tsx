"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ShieldCheck, UserRound, GraduationCap, Crown, BrainCircuit, Search, Radio, Sparkles } from "lucide-react";
import { LivingMentorAvatar } from "@/components/mentor/LivingMentorAvatar";
import { resolveAcademyProfileReadState } from "@/lib/academy-profile-read-state";
import { MentorPrivacyControls } from "@/components/academy/MentorPrivacyControls";

type Profile = {
  display_name?: string;
  username?: string;
  avatar?: string;
  photo_url?: string | null;
  public_student_id?: string;
};

export function AcademyAccount({ locale }: { locale: "fa" | "en" }) {
  const isFa = locale === "fa";
  const base = isFa ? "/academy" : "/en/academy";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;
    fetch("/api/academy-student-profile", { cache: "no-store", credentials: "include" }).then(async response => {
      const body = await response.json();
      if (!active) return;
      const state = resolveAcademyProfileReadState<Profile>(response, body);
      if (state.status === "authenticated" && state.profile) {
        setProfile(state.profile as Profile);
        setStatus("ready");
      } else {
        setStatus(state.status === "unauthenticated" ? "guest" : state.status === "authenticated" ? "missing" : "error");
      }
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [attempt]);

  const rows = [
    {
      href: `${base}/onboarding`,
      Icon: UserRound,
      title: isFa ? "ویرایش پروفایل" : "Edit profile",
      text: isFa ? "عکس شخصی، آواتار، نام، تاریخ تولد، جنسیت، کشور و هدف یادگیری" : "Photo, avatar, name, birth date, gender, country and learning goal",
    },
    {
      href: `${base}/notifications`,
      Icon: Bell,
      title: isFa ? "اعلان‌ها" : "Notifications",
      text: isFa ? "پیام‌های منتور، مسیر یادگیری و آرنا" : "Mentor, learning and Arena updates",
    },
    {
      href: `${base}/profile`,
      Icon: GraduationCap,
      title: isFa ? "مسیر و دستاوردهای من" : "My learning journey",
      text: isFa ? "پیشرفت ترم‌ها، مدارک و نشان‌های ثبت‌شده" : "Term progress, credentials and earned achievements",
    },
  ];

  return <main dir={isFa ? "rtl" : "ltr"} className="min-h-[70vh] bg-bg px-4 py-10 text-fg sm:px-6">
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-cyan-800 dark:text-cyan-200">{isFa ? "فضای شخصی تک‌پی" : "Your TecPey space"}</p>
      <h1 className="mt-2 text-3xl font-bold">{isFa ? "حساب کاربری" : "Account"}</h1>
      {status === "loading" ? (
        <p role="status" className="mt-6">{isFa ? "در حال دریافت حساب…" : "Loading account…"}</p>
      ) : profile ? (
        <div className="mt-6 flex items-center gap-3 border-b border-fg/10 pb-6">
          <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-cyan-400/10 text-2xl">
            {profile.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- #619: private same-origin account photo is intentionally not image-optimizer proxied.
              <img src={profile.photo_url} alt="" className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- #687: static same-origin TecPey identity fallback.
              <img src="/assets/tecpey-default-profile.svg" alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-semibold">{profile.display_name}</h2>
            <p className="truncate text-sm text-muted"><bdi>@{profile.username}</bdi></p>
            {profile.public_student_id ? <p className="mt-1 truncate text-xs text-cyan-700 dark:text-cyan-200"><bdi>{profile.public_student_id}</bdi></p> : null}
          </div>
        </div>
      ) : (
        <p role="status" className="mt-6 text-sm leading-7">
          {status === "guest" ? (isFa ? "برای مدیریت حساب وارد شو." : "Sign in to manage your account.") : (isFa ? "اطلاعات حساب دریافت نشد. دوباره تلاش کن." : "Account information is unavailable. Please retry.")}
          <button type="button" className="inline-flex min-h-11 items-center rounded-lg px-2 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" onClick={() => { setStatus("loading"); setAttempt(value => value + 1); }}>{isFa ? "تلاش دوباره" : "Retry"}</button>
          {status === "guest" || status === "missing" ? <Link className="inline-flex min-h-11 items-center rounded-lg px-2 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400" href={status === "guest" ? `${base}/login` : `${base}/onboarding`}>{isFa ? "ادامه" : "Continue"}</Link> : null}
        </p>
      )}
      <div className="mt-6 divide-y divide-fg/10">{rows.map(({href,Icon,title,text}) => <Link key={href} href={href} className="flex min-h-20 items-center gap-4 rounded-xl px-3 py-4 transition-colors hover:bg-fg/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><Icon className="h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-200" aria-hidden="true"/><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted">{text}</p></div></Link>)}</div>
      <section className="mt-8 border-t border-fg/10 pt-6" aria-labelledby="account-verification">
        <h2 id="account-verification" className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5" aria-hidden="true"/>{isFa ? "احراز هویت" : "Identity verification"}</h2>
        <p className="mt-3 text-sm leading-7 text-muted">{isFa ? "پروفایل آموزشی، احراز هویت مالی محسوب نمی‌شود. ایمیل و موبایل تأییدشده از حساب خوانده می‌شوند و تغییرشان مسیر امنیتی مستقل دارد." : "A learning profile is not financial identity verification. Verified email and mobile are read from the account and use a separate secure change flow."}</p>
      </section>
      <MentorPrivacyControls locale={locale} />
      <section id="pro" className="relative mt-10 scroll-mt-28 overflow-hidden rounded-[32px] border border-cyan-400/25 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.16),transparent_42%)] p-6 sm:p-8" aria-labelledby="account-pro">
        <div className="relative z-10 grid gap-7 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-cyan-700 dark:text-cyan-200"><Crown className="h-4 w-4" aria-hidden="true"/>TECPEY PRO</p>
            <h2 id="account-pro" className="mt-3 text-2xl font-bold leading-relaxed">{isFa ? "عمق بیشتر برای یادگیری، تحقیق و درک بازار" : "Go deeper in learning, research and market understanding"}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">{isFa ? "Pro فقط «چت بیشتر» نیست؛ لایه هوشمند پیشرفته تک‌پی برای منتور شخصی‌تر، پژوهش مستند، تحلیل زمینه بازار و فهم گفتگوهای اجتماعی است." : "Pro is not simply more chat. It is TecPey’s advanced intelligence layer for a more personal mentor, sourced research, market context and social conversation intelligence."}</p>
          </div>
          <LivingMentorAvatar act="celebrate_effort" locale={locale} size="stage" decorative />
        </div>
        <div className="relative z-10 mt-6 grid gap-3 sm:grid-cols-2">
          {[
            [BrainCircuit, isFa ? "Mentor Pro" : "Mentor Pro", isFa ? "راهنمایی شخصی‌تر بر پایه مسیر و شواهد یادگیری" : "More personal guidance grounded in your learning journey"],
            [Search, isFa ? "پژوهش عمیق" : "Deep Research", isFa ? "بررسی چندمرحله‌ای منابع و دیدگاه‌های متفاوت" : "Multi-step research across sources and competing views"],
            [Radio, isFa ? "نبض شبکه‌های اجتماعی" : "Social Intelligence", isFa ? "درک روایت‌ها و گفتگوهای عمومی؛ نه سیگنال خرید و فروش" : "Understand public narratives and conversations—not trading signals"],
            [Sparkles, isFa ? "یادگیری تطبیقی" : "Adaptive Learning", isFa ? "تمرین، مرور و توضیح متناسب با نقاط نیازمند تمرین" : "Practice, review and explanations adapted to learning needs"],
          ].map(([Icon, title, text]) => {
            const FeatureIcon = Icon as typeof BrainCircuit;
            return <article key={String(title)} className="rounded-2xl border border-fg/10 bg-bg/60 p-4 backdrop-blur-sm"><FeatureIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-200" aria-hidden="true"/><h3 className="mt-3 font-semibold">{String(title)}</h3><p className="mt-1 text-sm leading-6 text-muted">{String(text)}</p></article>;
          })}
        </div>
        <div className="relative z-10 mt-6 rounded-2xl border border-fg/10 bg-bg/70 p-4">
          <p className="text-sm font-semibold">{isFa ? "پیش‌نمایش Pro" : "Pro preview"}</p>
          <p className="mt-1 text-xs leading-6 text-muted">{isFa ? "خرید و مدیریت اشتراک هنوز فعال نشده است. قیمت، دوره تمدید و شرایط دقیق پیش از فعال‌شدن پرداخت در همین بخش نمایش داده می‌شود؛ هیچ خریدی از این پیش‌نمایش انجام نمی‌شود." : "Purchasing and subscription management are not active yet. Pricing, renewal and exact terms will appear here before payments are enabled; this preview cannot place an order."}</p>
        </div>
      </section>
    </div>
  </main>;
}
