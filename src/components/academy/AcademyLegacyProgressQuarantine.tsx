"use client";

import { useEffect, useState } from "react";
import { ArchiveRestore, Loader2 } from "lucide-react";

type Locale = "fa" | "en";

function parseLegacyJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { unreadable: true };
  }
}

export function AcademyLegacyProgressQuarantine({
  slug,
  locale = "fa",
}: {
  slug: string;
  locale?: Locale;
}) {
  const [state, setState] = useState<"idle" | "importing" | "done" | "error">("idle");
  const isFa = locale === "fa";

  useEffect(() => {
    let active = true;
    const migrate = async () => {
      const termNumber = Number(slug.match(/term-(\d+)/)?.[1] ?? 1);
      const lessonKey = `tecpey-lesson-progress-${locale}-${slug}`;
      const termKey = `tecpey-academy-reading-term-${termNumber}`;
      const [lessonRaw, termRaw] = [lessonKey, termKey].map((key) => window.localStorage.getItem(key));
      if (!lessonRaw && !termRaw) return;
      if (active) setState("importing");
      try {
        const response = await fetch("/api/academy-state", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            locale,
            legacySnapshot: {
              schema: "browser_academy_progress_v1",
              slug,
              lessonProgress: parseLegacyJson(lessonRaw),
              termSummary: parseLegacyJson(termRaw),
            },
          }),
        });
        if (!response.ok) {
          if (response.status === 401) return;
          throw new Error("legacy_progress_quarantine_failed");
        }
        [lessonKey, termKey].forEach((key) => window.localStorage.removeItem(key));
        if (active) setState("done");
      } catch {
        if (active) setState("error");
      }
    };
    void migrate();
    return () => {
      active = false;
    };
  }, [locale, slug]);

  if (state === "idle") return null;
  return (
    <div className={`mt-6 flex items-start gap-3 rounded-2xl border p-4 text-xs font-bold leading-6 ${state === "error" ? "border-amber-300/30 bg-amber-500/10 text-amber-800 dark:text-amber-100" : "border-slate-300/30 bg-slate-500/10 text-slate-700 dark:text-slate-200"}`}>
      {state === "importing" ? <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin" /> : <ArchiveRestore className="mt-1 h-4 w-4 shrink-0" />}
      <span>
        {state === "importing"
          ? isFa ? "در حال انتقال نسخه قدیمی پیشرفت به بخش قرنطینه برای بررسی؛ این داده هیچ XP یا قبولی ایجاد نمی‌کند." : "Moving legacy progress into review quarantine; it cannot grant XP or completion."
          : state === "done"
            ? isFa ? "نسخه قدیمی برای بررسی حفظ و از مرورگر حذف شد. فقط پیشرفت تأییدشده سرور معتبر است." : "Legacy progress was preserved for review and removed from the browser. Only server-verified progress is authoritative."
            : isFa ? "انتقال نسخه قدیمی انجام نشد. این داده همچنان هیچ اختیار آموزشی یا XP ندارد." : "Legacy import did not complete. The data still has no completion or XP authority."}
      </span>
    </div>
  );
}
