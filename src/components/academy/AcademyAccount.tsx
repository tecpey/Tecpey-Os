"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ShieldCheck, UserRound, GraduationCap, Crown, BrainCircuit, Search, Radio, Sparkles, CheckCircle2, Lock, Layers3 } from "lucide-react";
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
          <CapabilityCard
            Icon={BrainCircuit}
            title="Mentor Intelligence"
            text={isFa ? "منتور، حافظه سروری و شخصی‌سازی مبتنی بر شواهد همین حالا در معماری محصول وجود دارند." : "Mentor, server memory and evidence-aware personalization already exist in the product architecture."}
            state="live"
            stateLabel={isFa ? "فعال" : "Live"}
            href={`${base}/ai-guide`}
            hrefLabel={isFa ? "باز کردن منتور" : "Open Mentor"}
          />
          <CapabilityCard
            Icon={Search}
            title={isFa ? "پژوهش عمومی عمیق" : "Deep public research"}
            text={isFa ? "مسیر پژوهش منبع‌دار در backend پیاده شده، اما تا فعال‌شدن entitlement سروری Pro عمداً قفل است." : "The source-grounded research path exists in the backend, but stays deliberately locked until server-side Pro entitlement is live."}
            state="locked"
            stateLabel={isFa ? "قفل سروری" : "Server gated"}
          />
          <CapabilityCard
            Icon={Radio}
            title={isFa ? "هوشمندی خبر و شبکه‌های اجتماعی" : "News & social intelligence"}
            text={isFa ? "زیرساخت پژوهش وب و X در کنترل‌پلین وجود دارد؛ خروجی برای فهم روایت‌هاست، نه سیگنال خرید و فروش." : "Web/X research infrastructure exists in the control plane; its purpose is narrative understanding, not buy/sell signals."}
            state="preview"
            stateLabel={isFa ? "پیش‌نمایش محصول" : "Product preview"}
          />
          <CapabilityCard
            Icon={Sparkles}
            title={isFa ? "یادگیری تطبیقی" : "Adaptive learning"}
            text={isFa ? "Learning DNA و شواهد منتور مسیر را برای تمرین و توضیح شخصی‌تر آماده می‌کنند؛ تصمیم نهایی مسیر با کاربر است." : "Learning DNA and Mentor evidence prepare more personal practice and explanations; the learner remains the decision owner."}
            state="live"
            stateLabel={isFa ? "فونداسیون فعال" : "Foundation live"}
            href={`${base}/profile`}
            hrefLabel={isFa ? "مشاهده Learning DNA" : "View Learning DNA"}
          />
          <CapabilityCard
            Icon={Layers3}
            title="AI Model Lab"
            text={isFa ? "مسیریابی چندمدلی GPT، Claude، Grok و Perplexity در کنترل‌پلین وجود دارد؛ انتخاب مستقیم مدل برای کاربر هنوز فعال نشده است." : "Multi-model routing for GPT, Claude, Grok and Perplexity exists in the control plane; direct learner model selection is not enabled yet."}
            state="preview"
            stateLabel={isFa ? "در حال آماده‌سازی" : "In preparation"}
          />
          <CapabilityCard
            Icon={ShieldCheck}
            title="Market Intelligence"
            text={isFa ? "سطح آموزشی داده و زمینه بازار در دسترس است؛ تحلیل شخصی به معنی توصیه سرمایه‌گذاری یا پیش‌بینی تضمینی نیست." : "The educational market-data/context surface is available; personal context never means investment advice or a guaranteed forecast."}
            state="live"
            stateLabel={isFa ? "سطح آموزشی فعال" : "Learning surface live"}
            href={`${base}/market-intelligence`}
            hrefLabel={isFa ? "مشاهده Market Intelligence" : "Open Market Intelligence"}
          />
        </div>
        <div className="relative z-10 mt-6 grid gap-3 rounded-2xl border border-fg/10 bg-bg/70 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold">{isFa ? "مرز شفاف Pro" : "Clear Pro boundary"}</p>
            <p className="mt-1 text-xs leading-6 text-muted">{isFa ? "خرید، تمدید و لغو اشتراک عمومی Pro هنوز authority سروری فعال ندارد. بنابراین هیچ دکمه‌ای در این صفحه نمی‌تواند Pro را روی کلاینت فعال کند و پژوهش Premium هم fail-closed باقی می‌ماند." : "Public Pro purchase, renewal and cancellation do not yet have live server authority. No client control on this page can unlock Pro, and premium research remains fail-closed."}</p>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-200 lg:mt-0"><Lock className="h-4 w-4" aria-hidden="true"/>{isFa ? "پرداخت غیرفعال" : "Payments inactive"}</div>
        </div>
      </section>
    </div>
  </main>;
}

function CapabilityCard({
  Icon,
  title,
  text,
  state,
  stateLabel,
  href,
  hrefLabel,
}: {
  Icon: typeof BrainCircuit;
  title: string;
  text: string;
  state: "live" | "locked" | "preview";
  stateLabel: string;
  href?: string;
  hrefLabel?: string;
}) {
  const StateIcon = state === "live" ? CheckCircle2 : state === "locked" ? Lock : Sparkles;
  const stateClass = state === "live"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
    : state === "locked"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200"
      : "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-200";
  return <article className="rounded-[24px] border border-fg/10 bg-bg/60 p-4">
    <div className="flex items-start justify-between gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[.07]"><Icon className="h-5 w-5 text-cyan-600 dark:text-cyan-200" aria-hidden="true"/></span>
      <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stateClass}`}><StateIcon className="h-3.5 w-3.5" aria-hidden="true"/>{stateLabel}</span>
    </div>
    <h3 className="mt-3 font-semibold">{title}</h3>
    <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
    {href && hrefLabel ? <Link href={href} className="mt-3 inline-flex min-h-11 items-center rounded-xl px-1 text-sm font-semibold text-cyan-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 dark:text-cyan-200">{hrefLabel}</Link> : null}
  </article>;
}
