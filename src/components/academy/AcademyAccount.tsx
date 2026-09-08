"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ShieldCheck, UserRound, GraduationCap, Crown } from "lucide-react";
import { resolveAcademyProfileReadState } from "@/lib/academy-profile-read-state";

type Profile = { display_name?: string; username?: string; avatar?: string; public_student_id?: string };
export function AcademyAccount({ locale }: { locale: "fa" | "en" }) {
  const isFa = locale === "fa";
  const base = isFa ? "/academy" : "/en/academy";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    let active = true;
    fetch("/api/academy-student-profile", { cache: "no-store" }).then(async response => {
      const body = await response.json();
      if (!active) return;
      const state = resolveAcademyProfileReadState<Profile>(response, body);
      if (state.status === "authenticated" && state.profile) { setProfile(state.profile as Profile); setStatus("ready"); }
      else setStatus(state.status === "unauthenticated" ? "guest" : state.status === "authenticated" ? "missing" : "error");
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [attempt]);
  const rows = [
    { href: `${base}/onboarding`, Icon: UserRound, title: isFa ? "پروفایل و هویت آموزشی" : "Learning identity", text: isFa ? "ویرایش نام، نام کاربری، آواتار و هدف یادگیری" : "Edit your name, username, avatar and learning goal" },
    { href: `${base}/notifications`, Icon: Bell, title: isFa ? "اعلان‌ها" : "Notifications", text: isFa ? "پیام‌های منتور، مسیر یادگیری و آرنا" : "Mentor, learning and Arena updates" },
    { href: `${base}/profile`, Icon: GraduationCap, title: isFa ? "مسیر و دستاوردهای من" : "My learning journey", text: isFa ? "پیشرفت ترم‌ها، مدارک و نشان‌های ثبت‌شده" : "Term progress, credentials and earned achievements" },
  ];
  return <main dir={isFa ? "rtl" : "ltr"} className="min-h-[70vh] bg-bg px-4 py-10 text-fg sm:px-6">
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-cyan-600 dark:text-cyan-200">{isFa ? "فضای شخصی تک‌پی" : "Your TecPey space"}</p>
      <h1 className="mt-2 text-3xl font-bold">{isFa ? "حساب کاربری" : "Account"}</h1>
      {status === "loading" ? <p role="status" className="mt-6">{isFa ? "در حال دریافت حساب…" : "Loading account…"}</p> : profile ? <div className="mt-6 flex items-center gap-3 border-b border-fg/10 pb-6">
        <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-cyan-400/10 text-2xl">{profile.avatar || "👤"}</span>
        <div><h2 className="font-semibold">{profile.display_name}</h2><p className="text-sm text-muted"><bdi>@{profile.username}</bdi></p></div>
      </div> : <p role="status" className="mt-6 text-sm leading-7">{status === "guest" ? (isFa ? "برای مدیریت حساب وارد شو." : "Sign in to manage your account.") : (isFa ? "اطلاعات حساب دریافت نشد. دوباره تلاش کن." : "Account information is unavailable. Please retry.")} <button type="button" className="min-h-11 px-2 underline" onClick={() => { setStatus("loading"); setAttempt(value => value + 1); }}>{isFa ? "تلاش دوباره" : "Retry"}</button>{status === "guest" || status === "missing" ? <Link className="underline" href={status === "guest" ? `${base}/login` : `${base}/onboarding`}>{isFa ? "ادامه" : "Continue"}</Link> : null}</p>}
      <div className="mt-6 divide-y divide-fg/10">{rows.map(({href,Icon,title,text}) => <Link key={href} href={href} className="flex min-h-20 items-center gap-4 rounded-xl px-3 py-4 transition-colors hover:bg-fg/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><Icon className="h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-200" aria-hidden="true"/><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted">{text}</p></div></Link>)}</div>
      <section className="mt-8 border-t border-fg/10 pt-6" aria-labelledby="account-verification">
        <h2 id="account-verification" className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5" aria-hidden="true"/>{isFa ? "احراز هویت" : "Identity verification"}</h2>
        <p className="mt-3 text-sm leading-7 text-muted">{isFa ? "پروفایل آموزشی، احراز هویت مالی محسوب نمی‌شود. فرایند ارسال مدارک هویتی هنوز در این حساب ارائه نشده است." : "A learning profile does not constitute financial identity verification. Document verification is not yet available in this account."}</p>
      </section>
      <section id="pro" className="mt-8 scroll-mt-28 rounded-2xl border border-cyan-400/25 p-6" aria-labelledby="account-pro">
        <h2 id="account-pro" className="flex items-center gap-2 font-semibold"><Crown className="h-5 w-5 text-cyan-600 dark:text-cyan-200" aria-hidden="true"/>TecPey Pro</h2>
        <p className="mt-3 text-sm leading-7 text-muted">{isFa ? "خرید و مدیریت اشتراک Pro هنوز فعال نشده است. جزئیات امکانات، قیمت و تمدید پیش از فعال‌شدن خرید در همین بخش نمایش داده می‌شود." : "Pro purchasing and subscription management are not active yet. Features, pricing and renewal details will appear here before purchase becomes available."}</p>
      </section>
    </div>
  </main>;
}
