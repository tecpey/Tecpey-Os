"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";

export function TermAccessGuard({ termNumber, locale = "fa", children }: { termNumber: number; locale?: "fa" | "en"; children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [hasAcademyProfile, setHasAcademyProfile] = useState(false);
  const isFa = locale === "fa";

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const profileResponse = await fetch("/api/academy-student-profile", { cache: "no-store" });
        const profileData = await profileResponse.json();
        const profileReady = Boolean(profileData?.profile?.display_name);
        if (!active) return;
        setHasAcademyProfile(profileReady);
        if (!profileReady) {
          setAllowed(false);
          setReady(true);
          return;
        }
        if (termNumber <= 1) {
          setAllowed(true);
          setReady(true);
          return;
        }
        const response = await fetch(`/api/academy-term-progress?locale=${locale}`, { cache: "no-store" });
        if (!active) return;
        if (!response.ok) {
          setAllowed(false);
          setReady(true);
          return;
        }
        const data = await response.json();
        const terms = Array.isArray(data?.terms) ? data.terms : [];
        setAllowed(terms.some((item: { term_number?: number; status?: string }) => Number(item.term_number) === termNumber - 1 && item.status === "passed"));
      } catch {
        if (active) setAllowed(false);
      } finally {
        if (active) setReady(true);
      }
    };
    void check();
    window.addEventListener("tecpey-academy-progress-updated", check);
    window.addEventListener("focus", check);
    return () => {
      active = false;
      window.removeEventListener("tecpey-academy-progress-updated", check);
      window.removeEventListener("focus", check);
    };
  }, [termNumber, locale]);

  if (!ready) {
    return <section className="rounded-[30px] border border-cyan-300/20 bg-cyan-500/10 p-6 text-sm font-black">{isFa ? "در حال بررسی دسترسی آموزشی…" : "Checking learning access…"}</section>;
  }

  if (!allowed) {
    const needsProfile = !hasAcademyProfile;
    return (
      <section className="rounded-[34px] border border-amber-300/30 bg-amber-50 p-7 text-center dark:bg-amber-300/10">
        <Lock className="mx-auto h-10 w-10 text-amber-500" />
        <h2 className="mt-4 text-2xl font-black text-slate-950 dark:text-white">{needsProfile ? (isFa ? "اول پروفایل آکادمی را بساز" : "Create your academy profile first") : (isFa ? "این ترم هنوز باز نشده است" : "This term is locked")}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-bold leading-8 text-slate-700 dark:text-slate-200">
          {needsProfile
            ? (isFa ? "برای ورود به ترم‌ها، استفاده از منتور و ذخیره پیشرفت، باید هویت آموزشی آکادمی ساخته شود." : "To enter terms, use the mentor and save progress, create your academy learning identity first.")
            : (isFa ? `برای ورود به ترم ${termNumber}، آزمون ترم ${termNumber - 1} باید در پرونده آموزشی تک‌پی با وضعیت قبول‌شده ثبت شود.` : `To access term ${termNumber}, term ${termNumber - 1} must be officially saved as passed in your TecPey learning record.`)}
        </p>
        <Link href={needsProfile ? (isFa ? "/academy/onboarding" : "/en/academy/onboarding") : (isFa ? `/academy/term-${termNumber - 1}` : `/en/academy/term-${termNumber - 1}`)} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-black text-white">
          <ShieldCheck className="h-4 w-4" /> {needsProfile ? (isFa ? "ساخت پروفایل آکادمی" : "Create academy profile") : (isFa ? "بازگشت به ترم قبلی" : "Back to previous term")}
        </Link>
      </section>
    );
  }

  return <>{children}</>;
}
