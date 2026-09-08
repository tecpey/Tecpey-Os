"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type IranMarketRow = {
  source: string;
  btcIrt: number;
  usdtIrt: number;
  impliedBtcUsdt: number;
  premiumPercent: number;
};

type IranMarketPayload = {
  ok: true;
  reference: {
    source: string;
    market: "BTCUSDT";
    price: number;
  };
  local: IranMarketRow[];
  summary: {
    lowestPremiumPercent: number;
    highestPremiumPercent: number;
    sourcesAvailable: number;
    sourcesRequested: number;
  };
  provenance: {
    provider: string;
    method: string;
    observedAt: string;
    note: string;
  };
};

const copy = {
  fa: {
    eyebrow: "هوش بازار ایران",
    title: "مقایسه قیمت ایران با بازار جهانی",
    description:
      "قیمت بیت‌کوین تومانی هر منبع با نرخ تتر همان بازار نرمال می‌شود تا اختلاف واقعی با BTC/USDT جهانی قابل مقایسه باشد.",
    reference: "مرجع جهانی",
    sources: "منابع فعال",
    premium: "اختلاف با مرجع",
    implied: "BTC/USDT ضمنی",
    btcIrt: "BTC/IRT",
    usdtIrt: "USDT/IRT",
    updated: "آخرین دریافت تک‌پی",
    unavailable: "داده بازار ایران فعلاً در دسترس نیست.",
    retry: "تلاش دوباره",
    note:
      "اختلاف قیمت صرفاً داده تحلیلی و آموزشی است و به معنی امکان آربیتراژ یا سود تضمین‌شده نیست.",
  },
  en: {
    eyebrow: "Iran Market Intelligence",
    title: "Iran vs global market pricing",
    description:
      "Each local BTC/IRT price is normalized by that market’s USDT/IRT rate so the implied BTC/USDT can be compared with the global reference.",
    reference: "Global reference",
    sources: "Active sources",
    premium: "Reference gap",
    implied: "Implied BTC/USDT",
    btcIrt: "BTC/IRT",
    usdtIrt: "USDT/IRT",
    updated: "TecPey fetch time",
    unavailable: "Iran market data is temporarily unavailable.",
    retry: "Try again",
    note:
      "Price gaps are informational and educational only; they do not imply executable arbitrage or guaranteed profit.",
  },
} as const;

async function loadIranMarketIntelligence(): Promise<IranMarketPayload> {
  const response = await fetch("/api/markets?source=iran", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as IranMarketPayload | null;
  if (!response.ok || !payload || payload.ok !== true || !Array.isArray(payload.local)) {
    throw new Error("iran_market_intelligence_unavailable");
  }
  return payload;
}

function sourceLabel(source: string): string {
  return source
    .replace(/_spot$/u, "")
    .replace(/_/gu, " ")
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

export default function IranMarketIntelligence() {
  const locale = useLocale();
  const isFa = locale.toLowerCase().startsWith("fa");
  const text = isFa ? copy.fa : copy.en;
  const numberLocale = isFa ? "fa-IR" : "en-US";

  const query = useQuery({
    queryKey: ["iran-market-intelligence"],
    queryFn: loadIranMarketIntelligence,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });

  const number = (value: number, maximumFractionDigits = 2) =>
    new Intl.NumberFormat(numberLocale, {
      maximumFractionDigits,
    }).format(value);

  const usd = (value: number) =>
    new Intl.NumberFormat(numberLocale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);

  if (query.isError) {
    return (
      <section className="px-4 pb-3 md:px-8" aria-live="polite">
        <div className="mx-auto max-w-[1480px] rounded-2xl border border-primary/15 bg-[var(--card-1)]/70 p-5 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-foreground">{text.title}</p>
              <p className="mt-1 text-xs font-bold text-muted">{text.unavailable}</p>
            </div>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="inline-flex items-center gap-2 rounded-xl border border-primary/25 px-3 py-2 text-xs font-black text-primary transition hover:bg-primary/10"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              {text.retry}
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!query.data) {
    return (
      <section className="px-4 pb-3 md:px-8" aria-hidden="true">
        <div className="mx-auto h-44 max-w-[1480px] animate-pulse rounded-2xl border border-primary/10 bg-[var(--card-1)]/60" />
      </section>
    );
  }

  const data = query.data;
  const observedAt = new Date(data.provenance.observedAt);
  const observedLabel = Number.isFinite(observedAt.getTime())
    ? new Intl.DateTimeFormat(numberLocale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(observedAt)
    : "—";

  return (
    <section className="px-4 pb-4 md:px-8" aria-labelledby="iran-market-intelligence-title">
      <div className="mx-auto max-w-[1480px] overflow-hidden rounded-3xl border border-primary/15 bg-[var(--card-1)]/75 shadow-[0_20px_80px_-48px_rgba(29,120,255,0.55)] backdrop-blur-xl">
        <div className="border-b border-primary/10 px-5 py-5 md:px-7">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-2 flex items-center gap-2 text-xs font-black text-primary">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <span>{text.eyebrow}</span>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                  Bitycle
                </span>
              </div>
              <h2 id="iran-market-intelligence-title" className="text-xl font-black text-foreground md:text-2xl">
                {text.title}
              </h2>
              <p className="mt-2 text-xs font-semibold leading-6 text-muted md:text-sm">
                {text.description}
              </p>
            </div>

            <div className="grid min-w-[280px] grid-cols-2 gap-2">
              <div className="rounded-2xl border border-primary/10 bg-black/5 p-3 dark:bg-white/[0.025]">
                <p className="text-[10px] font-black uppercase tracking-wide text-muted">{text.reference}</p>
                <p className="mt-1 text-base font-black tabular-nums text-foreground">{usd(data.reference.price)}</p>
                <p className="mt-1 truncate text-[10px] font-bold text-muted">{sourceLabel(data.reference.source)}</p>
              </div>
              <div className="rounded-2xl border border-primary/10 bg-black/5 p-3 dark:bg-white/[0.025]">
                <p className="text-[10px] font-black uppercase tracking-wide text-muted">{text.sources}</p>
                <p className="mt-1 text-base font-black tabular-nums text-foreground">
                  {number(data.summary.sourcesAvailable, 0)} / {number(data.summary.sourcesRequested, 0)}
                </p>
                <p className="mt-1 text-[10px] font-bold text-muted">{text.updated}: {observedLabel}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-3">
          {data.local.map((market) => {
            const positive = market.premiumPercent >= 0;
            const GapIcon = positive ? ArrowUpRight : ArrowDownRight;
            return (
              <article
                key={market.source}
                className="rounded-2xl border border-primary/10 bg-black/[0.025] p-4 transition hover:border-primary/25 dark:bg-white/[0.025]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-foreground">{sourceLabel(market.source)}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-muted">{text.implied}</p>
                  </div>
                  <div className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black tabular-nums ${positive ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}>
                    <GapIcon className="size-3.5" aria-hidden="true" />
                    {positive ? "+" : ""}{number(market.premiumPercent)}%
                  </div>
                </div>

                <p className="mt-3 text-lg font-black tabular-nums text-foreground">{usd(market.impliedBtcUsdt)}</p>

                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-primary/10 px-3 py-2">
                    <dt className="font-bold text-muted">{text.btcIrt}</dt>
                    <dd className="mt-1 truncate font-black tabular-nums text-foreground" title={String(market.btcIrt)}>{number(market.btcIrt, 0)}</dd>
                  </div>
                  <div className="rounded-xl border border-primary/10 px-3 py-2">
                    <dt className="font-bold text-muted">{text.usdtIrt}</dt>
                    <dd className="mt-1 font-black tabular-nums text-foreground">{number(market.usdtIrt, 0)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>

        <div className="border-t border-primary/10 px-5 py-3 text-[10px] font-bold leading-5 text-muted md:px-7">
          {text.note}
        </div>
      </div>
    </section>
  );
}
