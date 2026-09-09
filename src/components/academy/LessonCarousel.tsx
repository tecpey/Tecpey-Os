"use client";
import { useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function LessonCarousel({ children, locale }: { children: ReactNode; locale: "fa" | "en" }) {
  const track = useRef<HTMLDivElement>(null);
  const isFa = locale === "fa";
  function move(forward: boolean) {
    const element = track.current;
    if (!element) return;
    element.scrollBy({ left: element.clientWidth * .94 * (forward ? 1 : -1) * (isFa ? -1 : 1), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  const Previous = isFa ? ArrowRight : ArrowLeft;
  const Next = isFa ? ArrowLeft : ArrowRight;
  return <div className="min-w-0">
    <div className="mb-3 flex items-center justify-between gap-3">
      <p id={`lesson-carousel-help-${locale}`} className="text-sm text-slate-600 dark:text-slate-300">{isFa ? "درس‌ها را افقی مرور کن یا از فهرست، درس دلخواهت را باز کن." : "Browse lessons horizontally or choose a lesson from the contents."}</p>
      <div className="flex shrink-0 gap-1">
        <button type="button" onClick={() => move(false)} aria-label={isFa ? "درس قبلی" : "Previous lesson"} className="grid h-11 w-11 place-items-center rounded-full border border-cyan-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><Previous className="h-5 w-5" aria-hidden="true" /></button>
        <button type="button" onClick={() => move(true)} aria-label={isFa ? "درس بعدی" : "Next lesson"} className="grid h-11 w-11 place-items-center rounded-full border border-cyan-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"><Next className="h-5 w-5" aria-hidden="true" /></button>
      </div>
    </div>
    <div ref={track} role="region" aria-label={isFa ? "درس‌های ترم" : "Term lessons"} aria-describedby={`lesson-carousel-help-${locale}`} tabIndex={0} dir={isFa ? "rtl" : "ltr"} className="grid snap-x snap-proximity auto-cols-[94%] grid-flow-col items-start gap-4 overflow-x-auto overscroll-x-contain pb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 [&>article]:min-w-0 [&>article]:snap-start">{children}</div>
  </div>;
}
