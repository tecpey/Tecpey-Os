"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import type { ArenaExecutionAsset } from "@/lib/trading-arena-execution-v2";

type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Resolution = "1" | "5" | "15" | "60" | "240" | "1D";
const RESOLUTIONS: Resolution[] = ["1", "5", "15", "60", "240", "1D"];

function pathFor(values: number[], width: number, height: number): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, Number.EPSILON);
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function ArenaMarketChart({ asset, livePrice, locale = "fa" }: {
  asset: ArenaExecutionAsset;
  livePrice: string | null;
  locale?: "fa" | "en";
}) {
  const isFa = locale === "fa";
  const [resolution, setResolution] = useState<Resolution>("15");
  const [bars, setBars] = useState<Bar[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    fetch(`/api/trading-arena/market-bars?asset=${asset}&resolution=${resolution}&countBack=240`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("market-bars");
        const payload = await response.json() as { details?: { bars?: Bar[] }; bars?: Bar[] };
        const next = payload.details?.bars ?? payload.bars;
        if (!Array.isArray(next) || next.length === 0) throw new Error("market-bars");
        setBars(next);
        setState("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setBars([]);
        setState("error");
      });
    return () => controller.abort();
  }, [asset, resolution, refresh]);

  const displayBars = useMemo(() => {
    if (!livePrice || bars.length === 0) return bars;
    const price = Number(livePrice);
    if (!Number.isFinite(price) || price <= 0) return bars;
    const next = bars.slice();
    const last = next[next.length - 1];
    next[next.length - 1] = { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price };
    return next;
  }, [bars, livePrice]);
  const closes = displayBars.map((bar) => bar.close);
  const path = pathFor(closes, 1000, 260);
  const first = closes[0] ?? 0;
  const last = closes[closes.length - 1] ?? 0;
  const delta = first > 0 ? ((last / first) - 1) * 100 : 0;

  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5" aria-labelledby="arena-chart-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="arena-chart-title" className="font-black">{asset}/USDT · {isFa ? "نمودار بازار" : "Market chart"}</h2>
          <p className="mt-1 text-xs font-bold text-slate-400">{isFa ? "تاریخچه سروری؛ قیمت زنده از authority اجرای آرنا" : "Server history; live price comes from Arena execution authority"}</p>
        </div>
        <div className="flex flex-wrap gap-1" aria-label={isFa ? "بازه نمودار" : "Chart resolution"}>
          {RESOLUTIONS.map((item) => <button key={item} type="button" onClick={() => setResolution(item)} aria-pressed={resolution === item} className={`rounded-lg px-2.5 py-1.5 text-xs font-black ${resolution === item ? "bg-cyan-300 text-slate-950" : "bg-white/5 text-slate-300"}`}>{item}</button>)}
        </div>
      </div>
      {state === "loading" && <div className="grid h-64 place-items-center text-slate-400"><LoaderCircle className="h-6 w-6 animate-spin" aria-label={isFa ? "در حال بارگذاری نمودار" : "Loading chart"} /></div>}
      {state === "error" && <div className="grid h-64 place-items-center rounded-2xl border border-amber-300/20 bg-amber-400/5 text-center"><div><AlertTriangle className="mx-auto h-6 w-6 text-amber-300" /><p className="mt-3 text-sm font-bold">{isFa ? "تاریخچه بازار موقتاً در دسترس نیست؛ اجرای معامله همچنان فقط با قیمت معتبر سرور انجام می‌شود." : "Market history is temporarily unavailable. Trading remains protected by server-authoritative prices."}</p><button type="button" onClick={() => setRefresh((value) => value + 1)} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-black"><RefreshCw className="h-3.5 w-3.5" />{isFa ? "تلاش دوباره" : "Retry"}</button></div></div>}
      {state === "ready" && <div>
        <div className="mb-2 flex items-end justify-between"><strong className="text-xl">{last.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong><span className={`text-xs font-black ${delta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{delta >= 0 ? "+" : ""}{delta.toFixed(2)}%</span></div>
        <svg viewBox="0 0 1000 260" role="img" aria-label={isFa ? `نمودار قیمت ${asset}` : `${asset} price chart`} className="h-64 w-full overflow-visible">
          <path d={path} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" className="text-cyan-300" />
        </svg>
      </div>}
    </section>
  );
}
