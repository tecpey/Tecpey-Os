"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Eye,
  Info,
  Layers,
  Lock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  DIMENSION_LABELS,
  type BehavioralSnapshot,
} from "@/lib/behavioral-engine";
import { fetchBehavioralSnapshot } from "@/lib/behavioral-client";

function MetricBlock({
  label,
  value,
  sub,
  tone = "text-slate-200",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-center">
      <p className={`text-xl font-black ${tone}`}>{value}</p>
      <p className="mt-0.5 text-xs font-bold text-slate-400">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] font-bold text-slate-600">{sub}</p>}
    </div>
  );
}

function DimensionList({
  title,
  items,
  direction,
}: {
  title: string;
  items: BehavioralSnapshot["dimensions"];
  direction: "strong" | "weak";
}) {
  const Icon = direction === "strong" ? TrendingUp : TrendingDown;
  const tone = direction === "strong" ? "text-emerald-300" : "text-amber-300";
  const border = direction === "strong" ? "border-emerald-400/20" : "border-amber-400/20";
  const background = direction === "strong" ? "bg-emerald-400/5" : "bg-amber-400/5";

  return (
    <div className={`rounded-[24px] border ${border} ${background} p-5`}>
      <div className="mb-4 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${tone}`} />
        <p className={`font-black ${tone}`}>{title}</p>
      </div>
      <div className="space-y-3">
        {items.map((dimension) => (
          <div key={dimension.dimension} className="rounded-xl border border-white/10 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-200">
                {DIMENSION_LABELS[dimension.dimension]}
              </p>
              <span className={`text-sm font-black ${tone}`}>{dimension.score}</span>
            </div>
            <p className="mt-1 text-xs font-bold leading-6 text-slate-500">
              {dimension.actionSuggestion}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InstructorDashboard() {
  const [snapshot, setSnapshot] = useState<BehavioralSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    void fetchBehavioralSnapshot("fa", controller.signal)
      .then(setSnapshot)
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [reloadToken]);

  const sorted = snapshot
    ? [...snapshot.dimensions].sort((left, right) => left.score - right.score)
    : [];
  const weakest = sorted.slice(0, 3);
  const strongest = [...sorted].reverse().slice(0, 2);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black">نمای مدرس</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">
            پیش‌نمایش شخصی بر اساس evidence معتبر سرور
          </p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/10">
          <Layers className="h-6 w-6 text-emerald-300" />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs font-bold leading-6 text-amber-200">
          اشتراک واقعی با مدرس تا ایجاد consent و دسترسی سرورمحور غیرفعال است. تنظیمات
          localStorage نمی‌توانند مجوز مشاهده ایجاد کنند و آمار Arena، ژورنال، رتبه یا
          چالش مرورگر در این صفحه evidence رسمی محسوب نمی‌شود.
        </p>
      </div>

      {!snapshot ? (
        <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-[24px] border border-white/10 bg-slate-900/40 text-sm font-bold text-slate-500">
          {loadError ? (
            <>
              <AlertTriangle className="h-6 w-6 text-amber-300" />
              <span className="text-amber-300">دریافت evidence رفتاری از سرور انجام نشد.</span>
              <button
                type="button"
                onClick={() => setReloadToken((value) => value + 1)}
                className="flex items-center gap-2 rounded-xl border border-cyan-300/30 px-4 py-2 text-xs font-black text-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                تلاش دوباره
              </button>
            </>
          ) : (
            <>
              <Eye className="h-6 w-6 text-cyan-300" />
              در حال دریافت نمای معتبر از سرور...
            </>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
            <div className="mb-4 flex items-center gap-2">
              <Info className="h-4 w-4 text-cyan-300" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                خلاصه تأییدشده
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricBlock
                label="امتیاز کلی"
                value={String(snapshot.overallScore)}
                sub={`کیفیت داده: ${snapshot.dataQuality}`}
                tone={snapshot.overallScore >= 70 ? "text-emerald-300" : "text-amber-300"}
              />
              <MetricBlock
                label="سرعت یادگیری"
                value={String(snapshot.learningVelocity)}
                sub="از رویدادهای سرور"
                tone="text-cyan-300"
              />
              <MetricBlock
                label="قوی‌ترین بُعد"
                value={snapshot.strongestDimension ? DIMENSION_LABELS[snapshot.strongestDimension] : "—"}
                tone="text-emerald-300"
              />
              <MetricBlock
                label="نیازمند تمرکز"
                value={snapshot.weakestDimension ? DIMENSION_LABELS[snapshot.weakestDimension] : "—"}
                tone="text-amber-300"
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DimensionList title="نقاط قوت" items={strongest} direction="strong" />
            <DimensionList title="اولویت‌های بهبود" items={weakest} direction="weak" />
          </div>
        </>
      )}
    </div>
  );
}
