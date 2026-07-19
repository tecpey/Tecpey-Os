"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { LessonPlayerV2 } from "./LessonPlayerV2";
import { hydrateProgress, refreshProgress } from "@/lib/academy-progress";
import type { Lesson } from "@/data/academy/term1Curriculum";

type Props = { lesson: Lesson; nextPath: string };
type HydrationStatus = "loading" | "ready" | "error";

export function LessonPlayerV2Client({ lesson, nextPath }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<HydrationStatus>("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    void hydrateProgress("fa")
      .then(() => {
        if (active) setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [lesson.id]);

  const retry = async () => {
    setStatus("loading");
    try {
      await refreshProgress("fa");
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  };

  if (status === "loading") {
    return (
      <div
        className="rounded-[28px] border border-cyan-300/20 bg-slate-900/80 p-8 text-center text-cyan-100"
        role="status"
        dir="rtl"
      >
        <LoaderCircle className="mx-auto h-7 w-7 animate-spin" />
        <p className="mt-3 text-sm font-black">در حال بازیابی پیشرفت رسمی شما از سرور تک‌پی…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        className="rounded-[28px] border border-red-300/30 bg-red-400/10 p-6 text-center text-red-100"
        role="alert"
        dir="rtl"
      >
        <p className="text-sm font-black leading-7">
          پیشرفت رسمی حساب بازیابی نشد؛ برای جلوگیری از نمایش وضعیت اشتباه، درس هنوز بارگذاری نمی‌شود.
        </p>
        <button
          type="button"
          onClick={() => void retry()}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-300/15 px-4 py-2 text-xs font-black hover:bg-red-300/25 focus:outline-none focus:ring-2 focus:ring-red-300"
        >
          <RefreshCw className="h-4 w-4" /> تلاش دوباره
        </button>
      </div>
    );
  }

  return (
    <LessonPlayerV2
      lesson={lesson}
      onComplete={() => undefined}
      onNext={() => router.push(nextPath)}
    />
  );
}
