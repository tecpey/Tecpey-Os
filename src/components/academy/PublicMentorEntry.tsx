"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  BrainCircuit,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

type ProfileStatus = "checking" | "absent" | "ready" | "unavailable";

export function PublicMentorEntry() {
  const pathname = usePathname() || "/";
  const isEnglish = pathname.startsWith("/en");
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("checking");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    const checkProfile = async () => {
      try {
        const response = await fetch("/api/academy-student-profile", {
          cache: "no-store",
          credentials: "include",
        });
        const data = await response.json();
        if (!active) return;
        setProfileStatus(data?.profile?.display_name ? "ready" : "absent");
      } catch {
        if (active) setProfileStatus("unavailable");
      }
    };

    void checkProfile();
    window.addEventListener("tecpey-academy-profile-ready", checkProfile);
    window.addEventListener("focus", checkProfile);

    return () => {
      active = false;
      window.removeEventListener("tecpey-academy-profile-ready", checkProfile);
      window.removeEventListener("focus", checkProfile);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        window.setTimeout(() => triggerRef.current?.focus(), 0);
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (profileStatus !== "absent") return null;

  const academyHref = isEnglish ? "/en/academy" : "/academy";
  const signupHref = isEnglish ? "/en/academy/signup" : "/academy/signup";
  const loginHref = isEnglish ? "/en/academy/login" : "/academy/login";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] left-3 z-[90] inline-flex max-w-[52vw] items-center justify-center gap-2 rounded-2xl border border-cyan-300/45 bg-slate-950/95 px-3 py-2.5 text-[10.5px] font-black text-cyan-50 shadow-[0_18px_60px_rgba(34,211,238,.30)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-cyan-950/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 sm:bottom-5 sm:left-5 sm:max-w-none sm:px-4 sm:py-3 sm:text-xs"
        aria-label={
          isEnglish
            ? "Discover TecPey AI learning mentor"
            : "آشنایی با منتور هوشمند آموزشی تک‌پی"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <BrainCircuit className="h-5 w-5 shrink-0 text-cyan-300" />
        <span className="truncate">
          {isEnglish ? "AI Learning Mentor" : "منتور هوشمند تک‌پی"}
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 p-2 backdrop-blur-sm sm:items-center sm:p-6"
          dir={isEnglish ? "ltr" : "rtl"}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
              window.setTimeout(() => triggerRef.current?.focus(), 0);
            }
          }}
        >
          <div
            ref={dialogRef}
            className="w-full max-w-[520px] overflow-hidden rounded-[28px] border border-cyan-300/25 bg-slate-950 text-white shadow-[0_30px_120px_rgba(0,0,0,.72)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-mentor-title"
            aria-describedby="public-mentor-description"
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-cyan-400/10 p-4 sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-200">
                  <Bot className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h2 id="public-mentor-title" className="text-base font-black sm:text-lg">
                    {isEnglish
                      ? "TecPey AI Learning Mentor"
                      : "منتور هوشمند آموزشی تک‌پی"}
                  </h2>
                  <p className="mt-1 text-xs font-bold text-cyan-100/75">
                    {isEnglish
                      ? "Personal guidance begins after your Academy profile"
                      : "راهنمایی شخصی پس از ساخت پروفایل آکادمی آغاز می‌شود"}
                  </p>
                </div>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => {
                  setOpen(false);
                  window.setTimeout(() => triggerRef.current?.focus(), 0);
                }}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 text-slate-200 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                aria-label={isEnglish ? "Close" : "بستن"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6">
              <div className="rounded-3xl border border-cyan-300/20 bg-white/[0.045] p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-1 h-5 w-5 shrink-0 text-cyan-300" />
                  <div>
                    <h3 className="font-black text-cyan-50">
                      {isEnglish
                        ? "A mentor connected to your real learning journey"
                        : "منتوری متصل به مسیر واقعی یادگیری تو"}
                    </h3>
                    <p id="public-mentor-description" className="mt-2 text-sm font-bold leading-7 text-slate-300">
                      {isEnglish
                        ? "After profile creation, the mentor can use your authorized Academy progress, quiz results, Arena practice and learning history to recommend the next safe step."
                        : "بعد از ساخت پروفایل، منتور می‌تواند با استفاده از پیشرفت مجاز آکادمی، نتیجه آزمون‌ها، تمرین‌های آرنا و سابقه یادگیری، قدم بعدی امن و متناسب با تو را پیشنهاد دهد."}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {[
                    isEnglish ? "Explain lessons and mistakes" : "توضیح درس‌ها و اشتباهات",
                    isEnglish ? "Build risk checklists" : "ساخت چک‌لیست مدیریت ریسک",
                    isEnglish ? "Review Arena behavior" : "مرور رفتار معاملاتی در آرنا",
                    isEnglish ? "Recommend the next lesson" : "پیشنهاد قدم بعدی یادگیری",
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-black text-slate-200"
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-300" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs font-bold leading-6 text-amber-50">
                {isEnglish
                  ? "The mentor is educational. It does not provide guaranteed-profit promises or direct buy/sell signals."
                  : "منتور ماهیت آموزشی دارد و وعده سود تضمینی یا سیگنال مستقیم خرید و فروش ارائه نمی‌کند."}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Link
                  href={signupHref}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-cyan-500 to-blue-600 px-5 py-3.5 text-sm font-black text-white shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <GraduationCap className="h-5 w-5" />
                  {isEnglish ? "Create Academy profile" : "ساخت پروفایل آکادمی"}
                </Link>
                <Link
                  href={loginHref}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.055] px-5 py-3.5 text-sm font-black text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  {isEnglish ? "Academy login" : "ورود به آکادمی"}
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </div>

              <Link
                href={academyHref}
                className="mt-4 inline-flex w-full items-center justify-center text-xs font-black text-cyan-200 transition hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                {isEnglish
                  ? "Explore the Academy before creating a profile"
                  : "قبل از ساخت پروفایل، آکادمی را ببین"}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
