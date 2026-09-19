"use client";

import Link from "next/link";
import { ArenaMarketChart } from "./ArenaMarketChart";
import { resolveArenaAccessGate } from "@/lib/arena-access-state";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Flame,
  Info,
  LoaderCircle,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Target,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  arenaUiError,
  parseArenaExecutionSnapshot,
  resolveArenaCommandIdentity,
  shouldApplyArenaSnapshot,
  type ArenaExecutionCommand,
  type ArenaExecutionSnapshot,
  type ArenaPendingCommandIdentity,
} from "@/lib/trading-arena-client";
import {
  ARENA_EXECUTION_MAX_RISK_RATE,
  ARENA_EXECUTION_WARNING_RISK_RATE,
  ARENA_EXECUTION_MAX_PORTFOLIO_STOP_RISK_RATE,
  ARENA_EXECUTION_MAX_DRAWDOWN_RATE,
  computeArenaPortfolioRiskTelemetry,
  computeArenaDrawdownRate,
  type ArenaClosedTradeV2,
  type ArenaExecutionAsset,
  type ArenaExecutionMentorFlag,
  type ArenaOpenPositionV2,
  type ArenaPendingOrderV2,
} from "@/lib/trading-arena-execution-v2";

const ENDPOINT = "/api/trading-arena/execution";
const POLL_MS = 20_000;
const FEE_RATE = 0.001;

type EmotionalState = "calm" | "neutral" | "confident" | "anxious" | "fearful" | "greedy";
type LoadState = "loading" | "ready" | "profile" | "login" | "error";
type ArenaLocale = "fa" | "en";

type TradeDraft = {
  asset: ArenaExecutionAsset;
  orderType: "market" | "limit";
  quoteAmount: string;
  limitPrice: string;
  stopLoss: string;
  takeProfit: string;
};

type JournalPlan = {
  preTradePlan: string;
  emotionalState: EmotionalState;
};

const EMOTIONS: EmotionalState[] = ["calm", "neutral", "confident", "anxious", "fearful", "greedy"];
const EMOTION_LABEL: Record<ArenaLocale, Record<EmotionalState, string>> = {
  fa: {
    calm: "آرام",
    neutral: "خنثی",
    confident: "مطمئن",
    anxious: "نگران",
    fearful: "ترسیده",
    greedy: "طمعکار",
  },
  en: {
    calm: "Calm",
    neutral: "Neutral",
    confident: "Confident",
    anxious: "Anxious",
    fearful: "Fearful",
    greedy: "Greedy",
  },
};

const FLAG_LABEL: Record<ArenaLocale, Record<ArenaExecutionMentorFlag, string>> = {
  fa: {
    "no-stop-loss": "بدون حد ضرر",
    "over-risk": "ریسک بالا",
    "impulse-entry": "ورود شتاب‌زده",
    "revenge-trade": "معامله انتقامی",
    "fomo-entry": "ورود FOMO",
    "good-discipline": "انضباط مناسب",
    "proper-sizing": "حجم مناسب",
    "target-hit": "هدف محقق شد",
  },
  en: {
    "no-stop-loss": "No stop-loss",
    "over-risk": "High allocation",
    "impulse-entry": "Impulse entry",
    "revenge-trade": "Revenge trade",
    "fomo-entry": "FOMO entry",
    "good-discipline": "Good discipline",
    "proper-sizing": "Proper sizing",
    "target-hit": "Target reached",
  },
};

function number(value: string | number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function usd(value: string | number, digits = 2): string {
  return `$${number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function signedUsd(value: string | number): string {
  const parsed = number(value);
  return `${parsed >= 0 ? "+" : "-"}${usd(Math.abs(parsed))}`;
}

function percent(
  value: string | number,
  locale: ArenaLocale,
  signed = false,
): string {
  const parsed = number(value) * 100;
  const sign = signed && parsed > 0 ? "+" : "";
  const formatted = parsed.toLocaleString(locale === "fa" ? "fa-IR" : "en-US", {
    maximumFractionDigits: 2,
  });
  return locale === "fa" ? `${sign}${formatted}٪` : `${sign}${formatted}%`;
}

function dateTime(value: string, locale: ArenaLocale): string {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function decimalInput(value: string): string | null {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(normalized)) return null;
  return number(normalized) > 0 ? normalized : null;
}

function eventMessage(
  eventType: string | null,
  replay: boolean,
  locale: ArenaLocale,
): string | null {
  if (replay) {
    return locale === "fa"
      ? "پاسخ معتبر درخواست قبلی بازیابی شد؛ هیچ فرمانی دوباره اجرا نشد."
      : "The authoritative result of the previous request was restored; no command was executed twice.";
  }
  const messages: Record<ArenaLocale, Record<string, string>> = {
    fa: {
      "arena.market_position_opened": "موقعیت با قیمت معتبر سرور باز شد.",
      "arena.limit_order_placed": "سفارش محدود در دفتر سروری آرنا ثبت شد.",
      "arena.position_closed": "موقعیت با قیمت معتبر سرور بسته شد.",
      "arena.limit_order_cancelled": "سفارش لغو و وجه رزروشده آزاد شد.",
      "arena.market_refreshed": "بازار، سفارش‌ها و حدود حفاظتی با قیمت سرور به‌روزرسانی شدند.",
    },
    en: {
      "arena.market_position_opened": "The position was opened using the server-authoritative price.",
      "arena.limit_order_placed": "The limit order was recorded in the server-side Arena order book.",
      "arena.position_closed": "The position was closed using the server-authoritative price.",
      "arena.limit_order_cancelled": "The order was cancelled and its reserved cash was released.",
      "arena.market_refreshed": "Market data, orders and protective levels were refreshed from server authority.",
    },
  };
  return eventType ? messages[locale][eventType] ?? null : null;
}

function JournalModal({
  busy,
  locale,
  onSubmit,
  onSkip,
  onClose,
}: {
  busy: boolean;
  locale: ArenaLocale;
  onSubmit: (plan: JournalPlan) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const isFa = locale === "fa";
  const [plan, setPlan] = useState("");
  const [emotion, setEmotion] = useState<EmotionalState>("neutral");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="arena-plan-title" dir={isFa ? "rtl" : "ltr"}>
      <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 id="arena-plan-title" className="text-lg font-black">{isFa ? "برنامه پیش از معامله" : "Pre-trade plan"}</h3>
            <p className="mt-1 text-xs font-bold text-slate-400">{isFa ? "این داده همراه فرمان معتبر سرور ثبت و برای تحلیل رفتاری استفاده می‌شود." : "This evidence is recorded with the authoritative server command for behavioural analysis."}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl p-2 text-slate-300 hover:bg-white/5 hover:text-white disabled:opacity-40" aria-label={isFa ? "بستن" : "Close"}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mb-1.5 block text-xs font-black text-slate-400" htmlFor="arena-plan">{isFa ? "دلیل ورود و شرط ابطال تحلیل" : "Entry rationale and invalidation condition"}</label>
        <textarea
          id="arena-plan"
          value={plan}
          onChange={(event) => setPlan(event.target.value.slice(0, 1_500))}
          rows={4}
          disabled={busy}
          className="w-full resize-none rounded-2xl border border-white/10 bg-slate-800 p-3 text-sm font-bold leading-7 text-slate-200 placeholder:text-slate-300 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 disabled:opacity-60"
          placeholder={isFa ? "چرا وارد می‌شوم؟ کدام نشانه تحلیل را باطل می‌کند؟" : "Why am I entering? What evidence would invalidate the setup?"}
        />

        <p className="mb-2 mt-4 text-xs font-black text-slate-400">{isFa ? "حالت احساسی" : "Emotional state"}</p>
        <div className="flex flex-wrap gap-2">
          {EMOTIONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setEmotion(item)}
              disabled={busy}
              aria-pressed={emotion === item}
              className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${emotion === item ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-200" : "border-white/10 text-slate-400 hover:text-white"} disabled:opacity-50`}
            >
              {EMOTION_LABEL[locale][item]}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onSubmit({ preTradePlan: plan.trim(), emotionalState: emotion })}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-800 py-3 text-sm font-black text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {isFa ? "ثبت برنامه و ارسال امن" : "Save plan and submit securely"}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="rounded-2xl border border-white/10 py-3 text-sm font-black text-slate-400 hover:text-white disabled:opacity-50"
          >
            {isFa ? "ادامه بدون توضیح" : "Continue without a note"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TradeForm({
  snapshot,
  busy,
  locale,
  selectedAsset,
  onSelectedAsset,
  onCommand,
}: {
  snapshot: ArenaExecutionSnapshot;
  busy: boolean;
  locale: ArenaLocale;
  selectedAsset: ArenaExecutionAsset;
  onSelectedAsset: (asset: ArenaExecutionAsset) => void;
  onCommand: (command: ArenaExecutionCommand) => Promise<boolean>;
}) {
  const isFa = locale === "fa";
  const [draft, setDraft] = useState<TradeDraft>({
    asset: selectedAsset,
    orderType: "market",
    quoteAmount: "",
    limitPrice: "",
    stopLoss: "",
    takeProfit: "",
  });
  const [showJournal, setShowJournal] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);

  const quote = number(draft.quoteAmount);
  const cash = number(snapshot.state.cashBalance);
  const equity = number(snapshot.projectedEquity || snapshot.state.equity);
  const allocationRate = equity > 0 ? quote / equity : 0;
  const warningRisk = allocationRate > number(ARENA_EXECUTION_WARNING_RISK_RATE);
  const exceedsServerRisk = allocationRate > number(ARENA_EXECUTION_MAX_RISK_RATE);
  const selectedPrice = snapshot.market ? number(snapshot.market.prices[draft.asset]) : 0;
  const disabled = busy || snapshot.account.status !== "active" || snapshot.marketStatus !== "available" || !snapshot.market;

  const update = <K extends keyof TradeDraft>(key: K, value: TradeDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setValidation(null);
  };

  const validate = (): boolean => {
    const quoteAmount = decimalInput(draft.quoteAmount);
    if (!quoteAmount || number(quoteAmount) < 10) {
      setValidation(isFa ? "حداقل مبلغ معتبر معامله ۱۰ USDT است." : "The minimum valid trade amount is 10 USDT.");
      return false;
    }
    if (number(quoteAmount) > cash) {
      setValidation(isFa ? "مبلغ معامله از موجودی نقد بیشتر است." : "The trade amount exceeds available cash.");
      return false;
    }
    if (exceedsServerRisk) {
      setValidation(isFa ? "حجم معامله از سقف ۲۰٪ ارزش حساب بیشتر است." : "The trade allocation exceeds the 20% account-equity limit.");
      return false;
    }
    if (draft.orderType === "limit" && !decimalInput(draft.limitPrice)) {
      setValidation(isFa ? "برای سفارش محدود، قیمت معتبر وارد کنید." : "Enter a valid price for the limit order.");
      return false;
    }
    if (draft.stopLoss && !decimalInput(draft.stopLoss)) {
      setValidation(isFa ? "حد ضرر باید یک عدد مثبت معتبر باشد." : "The stop-loss must be a valid positive number.");
      return false;
    }
    if (draft.takeProfit && !decimalInput(draft.takeProfit)) {
      setValidation(isFa ? "حد سود باید یک عدد مثبت معتبر باشد." : "The take-profit must be a valid positive number.");
      return false;
    }
    return true;
  };

  const prepare = () => {
    if (validate()) setShowJournal(true);
  };

  const submit = async (plan: JournalPlan | null) => {
    if (!validate()) return;
    const quoteAmount = decimalInput(draft.quoteAmount) as string;
    const stopLoss = draft.stopLoss ? decimalInput(draft.stopLoss) ?? undefined : undefined;
    const takeProfit = draft.takeProfit ? decimalInput(draft.takeProfit) ?? undefined : undefined;
    const shared = {
      asset: draft.asset,
      quoteAmount,
      ...(stopLoss ? { stopLoss } : {}),
      ...(takeProfit ? { takeProfit } : {}),
      preTradePlan: plan?.preTradePlan ?? "",
      emotionalState: plan?.emotionalState ?? "",
    };
    const command: ArenaExecutionCommand = draft.orderType === "market"
      ? { type: "market_buy", ...shared }
      : {
          type: "limit_buy",
          ...shared,
          limitPrice: decimalInput(draft.limitPrice) as string,
        };
    const saved = await onCommand(command);
    if (!saved) return;
    setShowJournal(false);
    setDraft((current) => ({
      ...current,
      quoteAmount: "",
      limitPrice: "",
      stopLoss: "",
      takeProfit: "",
    }));
    setValidation(null);
  };

  return (
    <>
      {showJournal && (
        <JournalModal
          busy={busy}
          locale={locale}
          onSubmit={(plan) => void submit(plan)}
          onSkip={() => void submit(null)}
          onClose={() => !busy && setShowJournal(false)}
        />
      )}
      <section className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/10 lg:p-6" aria-labelledby="arena-order-title">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 id="arena-order-title" className="font-black">{isFa ? "ثبت فرمان تمرینی" : "Place a practice command"}</h2>
            <p className="mt-1 text-xs font-bold text-slate-300">{isFa ? "قیمت، کنترل ریسک و اجرا در سرور تعیین می‌شوند." : "Pricing, risk controls and execution are determined by the server."}</p>
          </div>
          <ShieldCheck className="h-5 w-5 text-cyan-300" />
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          {(["BTC", "ETH"] as ArenaExecutionAsset[]).map((asset) => (
            <button
              key={asset}
              type="button"
              onClick={() => { update("asset", asset); onSelectedAsset(asset); }}
              disabled={busy}
              aria-pressed={draft.asset === asset}
              className={`rounded-2xl border px-3 py-3 text-sm font-black transition ${draft.asset === asset ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-400 hover:border-white/20 hover:text-white"} disabled:opacity-50`}
            >
              {asset}<span className="mt-1 block text-xs font-bold text-slate-300">{snapshot.market ? usd(snapshot.market.prices[asset]) : (isFa ? "بدون قیمت" : "No price")}</span>
            </button>
          ))}
        </div>

        <div className="mb-4 flex rounded-2xl border border-white/10 bg-slate-950/50 p-1">
          {(["market", "limit"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => update("orderType", type)}
              disabled={busy}
              aria-pressed={draft.orderType === type}
              className={`flex-1 rounded-xl py-2 text-xs font-black ${draft.orderType === type ? "bg-slate-800 text-white" : "text-slate-300 hover:text-slate-300"}`}
            >
              {type === "market" ? (isFa ? "خرید بازار" : "Market buy") : (isFa ? "خرید محدود" : "Limit buy")}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black text-slate-400">
            {isFa ? "مبلغ (USDT)" : "Amount (USDT)"}
            <input
              type="text"
              inputMode="decimal"
              value={draft.quoteAmount}
              onChange={(event) => update("quoteAmount", event.target.value)}
              disabled={busy}
              placeholder={isFa ? "مثلاً 1000" : "For example, 1000"}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-sm font-black text-white placeholder:text-slate-300 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
            />
          </label>
          {draft.orderType === "limit" && (
            <label className="text-xs font-black text-slate-400">
              {isFa ? "قیمت محدود" : "Limit price"}
              <input
                type="text"
                inputMode="decimal"
                value={draft.limitPrice}
                onChange={(event) => update("limitPrice", event.target.value)}
                disabled={busy}
                placeholder={selectedPrice > 0 ? String(selectedPrice) : (isFa ? "قیمت ورود" : "Entry price")}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-sm font-black text-white placeholder:text-slate-300 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
              />
            </label>
          )}
          <label className="text-xs font-black text-slate-400">
            {isFa ? "حد ضرر (اختیاری)" : "Stop-loss (optional)"}
            <input
              type="text"
              inputMode="decimal"
              value={draft.stopLoss}
              onChange={(event) => update("stopLoss", event.target.value)}
              disabled={busy}
              placeholder={isFa ? "کمتر از قیمت ورود" : "Below the entry price"}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-sm font-black text-white placeholder:text-slate-300 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
            />
          </label>
          <label className="text-xs font-black text-slate-400">
            {isFa ? "حد سود (اختیاری)" : "Take-profit (optional)"}
            <input
              type="text"
              inputMode="decimal"
              value={draft.takeProfit}
              onChange={(event) => update("takeProfit", event.target.value)}
              disabled={busy}
              placeholder={isFa ? "بیشتر از قیمت ورود" : "Above the entry price"}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-sm font-black text-white placeholder:text-slate-300 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
            />
          </label>
        </div>

        {quote > 0 && (
          <div className={`mt-4 rounded-xl border px-3 py-2 text-xs font-bold ${warningRisk ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-white/10 bg-white/[0.03] text-slate-400"}`}>
            {isFa ? "تخصیص تقریبی" : "Estimated allocation"}: {percent(allocationRate, locale)} {isFa ? "از ارزش حساب" : "of account equity"}
            {warningRisk && (isFa ? " — بالاتر از آستانه آموزشی ۵٪" : " — above the 5% training threshold")}
          </div>
        )}
        {validation && <p className="mt-3 text-xs font-bold text-red-300" role="alert">{validation}</p>}
        {snapshot.marketStatus === "unavailable" && (
          <p className="mt-3 flex items-center gap-2 text-xs font-bold text-amber-300" role="status"><WifiOff className="h-4 w-4" /> {isFa ? "اجرای معامله تا بازگشت قیمت معتبر سرور متوقف است." : "Trading is paused until a server-authoritative price is restored."}</p>
        )}

        <button
          type="button"
          onClick={prepare}
          disabled={disabled}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-cyan-500 to-blue-600 py-3.5 text-sm font-black text-white shadow-lg shadow-cyan-500/10 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CircleDollarSign className="h-4 w-4" />}
          {busy ? (isFa ? "در حال ثبت فرمان..." : "Sending command...") : (isFa ? "بررسی برنامه و ارسال به سرور" : "Review plan and send to server")}
        </button>
      </section>
    </>
  );
}

function PositionCard({
  position,
  marketPrice,
  marketAvailable,
  busy,
  locale,
  onClose,
}: {
  position: ArenaOpenPositionV2;
  marketPrice: string | null;
  marketAvailable: boolean;
  busy: boolean;
  locale: ArenaLocale;
  onClose: () => void;
}) {
  const isFa = locale === "fa";
  const hasLivePrice = marketAvailable && Boolean(marketPrice);
  const liquidation = hasLivePrice && marketPrice
    ? number(position.quantity) * number(marketPrice) * (1 - FEE_RATE)
    : number(position.quoteCommitted);
  const pnl = liquidation - number(position.quoteCommitted);
  const pnlRate = number(position.quoteCommitted) > 0 ? pnl / number(position.quoteCommitted) : 0;
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-black">{position.asset}</span>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-black text-slate-300">LONG</span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-300">{isFa ? "ورود" : "Entry"} {usd(position.entryPrice)} · {dateTime(position.openedAt, locale)}</p>
        </div>
        <div className="text-left">
          <p className={`font-black ${hasLivePrice ? (pnl >= 0 ? "text-emerald-300" : "text-red-300") : "text-slate-300"}`}>{hasLivePrice ? signedUsd(pnl) : "—"}</p>
          <p className={`text-xs font-bold ${hasLivePrice ? (pnl >= 0 ? "text-emerald-400" : "text-red-400") : "text-slate-300"}`}>{hasLivePrice ? percent(pnlRate, locale, true) : (isFa ? "قیمت معتبر ناموجود" : "Authoritative price unavailable")}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-slate-400 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-900/70 p-2.5"><span className="block text-slate-300">{isFa ? "تعهد" : "Committed"}</span>{usd(position.quoteCommitted)}</div>
        <div className="rounded-xl bg-slate-900/70 p-2.5"><span className="block text-slate-300">{isFa ? "قیمت فعلی" : "Current price"}</span>{hasLivePrice && marketPrice ? usd(marketPrice) : (isFa ? "ناموجود" : "Unavailable")}</div>
        <div className="rounded-xl bg-slate-900/70 p-2.5"><span className="block text-slate-300">{isFa ? "حد ضرر" : "Stop-loss"}</span>{position.stopLoss ? usd(position.stopLoss) : (isFa ? "ثبت نشده" : "Not set")}</div>
        <div className="rounded-xl bg-slate-900/70 p-2.5"><span className="block text-slate-300">{isFa ? "حد سود" : "Take-profit"}</span>{position.takeProfit ? usd(position.takeProfit) : (isFa ? "ثبت نشده" : "Not set")}</div>
      </div>
      {position.preTradePlan && <p className="mt-3 rounded-xl border border-cyan-300/10 bg-cyan-400/5 p-3 text-xs font-bold leading-6 text-slate-300">{isFa ? "برنامه" : "Plan"}: {position.preTradePlan}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">{position.mentorFlags.map((flag) => <MentorFlag key={flag} flag={flag} locale={locale} />)}</div>
        <button type="button" onClick={onClose} disabled={busy || !hasLivePrice} className="rounded-xl border border-red-400/30 px-3 py-2 text-xs font-black text-red-300 hover:bg-red-400/10 disabled:opacity-40">{isFa ? "بستن با قیمت سرور" : "Close at server price"}</button>
      </div>
    </article>
  );
}

function PendingOrderCard({ order, busy, locale, onCancel }: { order: ArenaPendingOrderV2; busy: boolean; locale: ArenaLocale; onCancel: () => void }) {
  const isFa = locale === "fa";
  return (
    <article className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <Clock3 className="h-5 w-5 text-amber-300" />
      <div className="min-w-0 flex-1">
        <p className="font-black">{order.asset} · {isFa ? "خرید محدود" : "Limit buy"} @ {usd(order.limitPrice)}</p>
        <p className="mt-1 text-xs font-bold text-slate-300">{isFa ? "رزرو" : "Reserved"} {usd(order.quoteReserved)} · {dateTime(order.createdAt, locale)}</p>
      </div>
      <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:border-red-400/30 hover:text-red-300 disabled:opacity-40">{isFa ? "لغو سفارش" : "Cancel order"}</button>
    </article>
  );
}

function MentorFlag({ flag, locale }: { flag: ArenaExecutionMentorFlag; locale: ArenaLocale }) {
  const positive = flag === "good-discipline" || flag === "proper-sizing" || flag === "target-hit";
  return <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${positive ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-300"}`}>{FLAG_LABEL[locale][flag]}</span>;
}

function ClosedTradeRow({ trade, locale }: { trade: ArenaClosedTradeV2; locale: ArenaLocale }) {
  const isFa = locale === "fa";
  const pnl = number(trade.realizedPnl);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
      {pnl >= 0 ? <ArrowUpRight className="h-5 w-5 text-emerald-300" /> : <ArrowDownRight className="h-5 w-5 text-red-300" />}
      <div className="min-w-0 flex-1">
        <p className="font-black">{trade.asset} · {trade.closureReason === "manual" ? (isFa ? "بسته‌شدن دستی" : "Manual close") : trade.closureReason === "stop-loss" ? (isFa ? "حد ضرر" : "Stop-loss") : (isFa ? "حد سود" : "Take-profit")}</p>
        <p className="mt-1 text-xs font-bold text-slate-300">{usd(trade.entryPrice)} → {usd(trade.exitPrice)} · {dateTime(trade.closedAt, locale)}</p>
      </div>
      <div className="text-left"><p className={`font-black ${pnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>{signedUsd(pnl)}</p><p className="text-xs font-bold text-slate-300">{percent(trade.realizedPnlRate, locale, true)}</p></div>
    </div>
  );
}

export function TradingArenaExecutionClient({ locale = "fa" }: { locale?: ArenaLocale }) {
  const isFa = locale === "fa";
  const [selectedAsset, setSelectedAsset] = useState<ArenaExecutionAsset>("BTC");
  const [snapshot, setSnapshot] = useState<ArenaExecutionSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<ArenaExecutionCommand["type"] | null>(null);
  const mountedRef = useRef(true);
  const snapshotRef = useRef<ArenaExecutionSnapshot | null>(null);
  const sequenceRef = useRef(0);
  const lastAppliedSequenceRef = useRef(0);
  const commandLockRef = useRef(false);
  const pendingCommandRef = useRef<ArenaPendingCommandIdentity | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applySnapshot = useCallback((incoming: ArenaExecutionSnapshot, responseSequence: number) => {
    if (!mountedRef.current) return false;
    const decision = shouldApplyArenaSnapshot({
      current: snapshotRef.current,
      incoming,
      responseSequence,
      lastAppliedSequence: lastAppliedSequenceRef.current,
    });
    if (!decision.apply) return false;
    lastAppliedSequenceRef.current = decision.nextSequence;
    snapshotRef.current = incoming;
    setSnapshot(incoming);
    setLoadState("ready");
    return true;
  }, []);

  const loadSnapshot = useCallback(async (options?: { quiet?: boolean }) => {
    const sequence = ++sequenceRef.current;
    if (!options?.quiet && !snapshotRef.current) setLoadState("loading");
    try {
      const response = await fetch(ENDPOINT, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => ({})) as { error?: unknown };
      if (!response.ok) {
        if (!mountedRef.current) return false;
        const code = typeof body.error === "string" ? body.error : undefined;
        setError(arenaUiError(code, response.status, locale));
        if (response.status === 401) {
          snapshotRef.current = null;
          setSnapshot(null);
          setLoadState(resolveArenaAccessGate(code, response.status));
        } else {
          setLoadState("error");
        }
        return false;
      }
      const parsed = parseArenaExecutionSnapshot(body);
      if (!parsed) throw new Error("arena_snapshot_invalid");
      const applied = applySnapshot(parsed, sequence);
      if (applied) {
        setError(null);
        if (!options?.quiet) setNotice(null);
      }
      return applied;
    } catch {
      if (!mountedRef.current) return false;
      setError(arenaUiError("arena_execution_unavailable", undefined, locale));
      if (!snapshotRef.current) setLoadState("error");
      return false;
    }
  }, [applySnapshot, locale]);

  const sendCommand = useCallback(async (
    action: ArenaExecutionCommand,
    options?: { quiet?: boolean },
  ): Promise<boolean> => {
    const current = snapshotRef.current;
    if (!current) return false;
    if (commandLockRef.current) {
      if (!options?.quiet) setError(isFa ? "آرنا در حال همگام‌سازی یک فرمان معتبر است؛ چند لحظه بعد دوباره ارسال کنید." : "Arena is synchronizing an authoritative command. Try again in a moment.");
      return false;
    }
    const identityDecision = resolveArenaCommandIdentity({
      pending: pendingCommandRef.current,
      attemptId: current.activeAttempt.id,
      revision: current.revision,
      action,
    });
    if (identityDecision.kind === "blocked") {
      if (!options?.quiet) {
        setError(isFa ? "نتیجه فرمان قبلی هنوز قطعی نشده است. ابتدا همان فرمان با شناسه امن قبلی بازیابی می‌شود." : "The previous command is not final yet. Arena will first recover it with the same safe command identity.");
      }
      return false;
    }
    const identity = identityDecision.identity;
    pendingCommandRef.current = identity;
    commandLockRef.current = true;
    const sequence = ++sequenceRef.current;
    if (!options?.quiet) {
      setBusyAction(action.type);
      setError(null);
      setNotice(null);
    }
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "idempotency-key": identity.idempotencyKey,
        },
        body: JSON.stringify({
          expectedRevision: identity.expectedRevision,
          idempotencyKey: identity.idempotencyKey,
          action,
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: unknown };
      const authoritative = parseArenaExecutionSnapshot(body);
      if (authoritative) applySnapshot(authoritative, sequence);
      if (!response.ok) {
        const code = typeof body.error === "string" ? body.error : undefined;
        const definitiveFailure = response.status < 500 || code === "revision_conflict" || code === "idempotency_key_reused";
        if (definitiveFailure) pendingCommandRef.current = null;
        if (code === "arena_price_feed_unavailable" && mountedRef.current) {
          setSnapshot((existing) => {
            if (!existing) return existing;
            const unavailable = { ...existing, marketStatus: "unavailable" as const };
            snapshotRef.current = unavailable;
            return unavailable;
          });
        }
        if (!options?.quiet || code === "revision_conflict" || code === "arena_price_feed_unavailable") {
          setError(arenaUiError(code, response.status, locale));
        }
        return false;
      }
      if (!authoritative) throw new Error("arena_snapshot_invalid");
      pendingCommandRef.current = null;
      const message = eventMessage(authoritative.eventType, authoritative.idempotentReplay, locale);
      if (!options?.quiet && message) setNotice(message);
      return true;
    } catch {
      if (!options?.quiet) setError(arenaUiError("arena_execution_unavailable", undefined, locale));
      return false;
    } finally {
      commandLockRef.current = false;
      if (mountedRef.current && !options?.quiet) setBusyAction(null);
    }
  }, [applySnapshot, isFa, locale]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!snapshot) return;
    const hasLiveCommands = snapshot.state.openPositions.length > 0 || snapshot.state.pendingOrders.length > 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || commandLockRef.current) return;
      const pending = pendingCommandRef.current;
      if (pending && pending.attemptId === snapshot.activeAttempt.id) {
        void sendCommand(pending.action, { quiet: true });
        return;
      }
      if (pending) pendingCommandRef.current = null;
      if (hasLiveCommands) void sendCommand({ type: "refresh_market" }, { quiet: true });
      else void loadSnapshot({ quiet: true });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadSnapshot, sendCommand, snapshot]);

  const stats = useMemo(() => {
    const trades = snapshot?.state.closedTrades ?? [];
    const wins = trades.filter((trade) => number(trade.realizedPnl) > 0).length;
    const disciplined = trades.filter((trade) => !trade.mentorFlags.includes("no-stop-loss")).length;
    const average = trades.length
      ? trades.reduce((sum, trade) => sum + number(trade.realizedPnlRate), 0) / trades.length
      : 0;
    return {
      total: trades.length,
      winRate: trades.length ? wins / trades.length : 0,
      disciplineRate: trades.length ? disciplined / trades.length : 0,
      average,
    };
  }, [snapshot]);

  if (loadState === "loading") {
    return <div className="flex min-h-[420px] items-center justify-center"><div className="text-center"><LoaderCircle className="mx-auto h-8 w-8 animate-spin text-cyan-300" /><p className="mt-3 text-sm font-black text-slate-400">{isFa ? "در حال بازیابی حساب معتبر آرنا..." : "Restoring your authoritative Arena account..."}</p></div></div>;
  }

  if ((loadState === "profile" || loadState === "login") && !snapshot) {
    const needsLogin = loadState === "login";
    return (
      <div className="mx-auto max-w-xl rounded-[28px] border border-amber-300/25 bg-amber-400/10 p-8 text-center" dir={isFa ? "rtl" : "ltr"}>
        <ShieldCheck className="mx-auto h-11 w-11 text-amber-200" />
        <h1 className="mt-4 text-xl font-bold">{isFa ? (needsLogin ? "برای ادامه تمرین وارد شوید" : "پروفایل آموزشی را بررسی کنید") : (needsLogin ? "Sign in to continue practising" : "Review your Academy profile")}</h1>
        <p role="status" className="mt-3 text-sm leading-7 text-slate-300">{isFa ? (needsLogin ? "برای دسترسی به تمرین‌ها و سابقه خود، ورود به حساب آکادمی لازم است." : "برای اتصال آرنا به مسیر یادگیری، اطلاعات پروفایل را بررسی و ذخیره کنید.") : (needsLogin ? "Sign in to your Academy account to access practice and history." : "Review and save your profile so Arena can connect to your learning journey.")}</p>
        <Link href={needsLogin ? (isFa ? "/academy/login?redirect=%2Facademy%2Ftrading-arena" : "/en/academy/login?redirect=%2Fen%2Facademy%2Ftrading-arena") : (isFa ? "/academy/onboarding" : "/en/academy/onboarding")} className="mt-5 inline-flex min-h-12 items-center rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-200">{isFa ? (needsLogin ? "ورود به آکادمی" : "بررسی پروفایل") : (needsLogin ? "Sign in to Academy" : "Review profile")}</Link>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-xl rounded-[28px] border border-white/10 bg-slate-900/70 p-8 text-center" dir={isFa ? "rtl" : "ltr"}>
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-300" />
        <h1 className="mt-4 text-xl font-black">{isFa ? "آرنا در دسترس نیست" : "Arena is unavailable"}</h1>
        <p className="mt-3 text-sm font-bold leading-7 text-slate-400">{error ?? arenaUiError("arena_execution_unavailable", undefined, locale)}</p>
        <button type="button" onClick={() => void loadSnapshot()} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-cyan-800 px-5 py-3 text-sm font-black text-white"><RefreshCw className="h-4 w-4" /> {isFa ? "تلاش دوباره" : "Try again"}</button>
      </div>
    );
  }

  const market = snapshot.market;
  const cash = number(snapshot.state.cashBalance);
  const equity = number(snapshot.projectedEquity);
  const initial = number(snapshot.state.initialBalance);
  const equityDelta = equity - initial;
  const equityRate = initial > 0 ? equityDelta / initial : 0;
  const portfolioRiskTelemetry = computeArenaPortfolioRiskTelemetry(snapshot.state);
  const portfolioStopRisk = number(portfolioRiskTelemetry.definedStopRisk);
  const portfolioRiskRate = equity > 0 ? portfolioStopRisk / equity : 0;
  const portfolioRiskLimit = number(ARENA_EXECUTION_MAX_PORTFOLIO_STOP_RISK_RATE);
  const portfolioRiskRemaining = Math.max(0, portfolioRiskLimit - portfolioRiskRate);
  const drawdownRate = number(computeArenaDrawdownRate(snapshot.state));
  const drawdownLimit = number(ARENA_EXECUTION_MAX_DRAWDOWN_RATE);
  const drawdownRemaining = Math.max(0, drawdownLimit - drawdownRate);
  const drawdownCircuitOpen = drawdownRate >= drawdownLimit;
  const dailyLoss = number(snapshot.state.dailyLoss.realizedLoss);
  const dailyRealizedPnl = number(snapshot.state.dailyLoss.realizedPnl);
  const dailyLossRate = initial > 0 ? dailyLoss / initial : 0;
  const dailyLossComplete = snapshot.state.dailyLoss.complete;
  const riskCircuitOpen = drawdownCircuitOpen;
  const recentFlags = [...new Set(snapshot.state.closedTrades.slice(0, 10).flatMap((trade) => trade.mentorFlags))];
  const busy = busyAction !== null;
  const arenaBasePath = isFa
    ? "/academy/trading-arena"
    : "/en/academy/trading-arena";

  const manualRefresh = () => {
    const hasLiveCommands = snapshot.state.openPositions.length > 0 || snapshot.state.pendingOrders.length > 0;
    if (hasLiveCommands) void sendCommand({ type: "refresh_market" });
    else void loadSnapshot();
  };

  return (
    <div className="space-y-6" dir={isFa ? "rtl" : "ltr"}>
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5">
        <Info className="h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs font-black text-amber-200">{isFa ? "سرمایه، قیمت و معاملات کاملاً شبیه‌سازی‌شده‌اند؛ هیچ سفارش واقعی ارسال نمی‌شود." : "Capital, prices and trades are fully simulated; no real order is ever submitted."}</p>
      </div>

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-2xl font-black sm:text-3xl">{isFa ? "آرنای معاملاتی" : "TecPey Trading Arena"}</h1><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-black text-emerald-300">SERVER V2</span></div>
          <p className="mt-1 text-sm font-bold text-slate-400">{isFa ? "تمرین تصمیم‌گیری با سرمایه مجازی ۱۰۰٬۰۰۰ دلاری و سه فرصت کنترل‌شده" : "Practise disciplined decisions with $100,000 in virtual capital and three governed attempts"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={manualRefresh} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:text-white disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${busyAction === "refresh_market" ? "animate-spin" : ""}`} /> {isFa ? "به‌روزرسانی" : "Refresh"}</button>
          <Link href={`${arenaBasePath}/scenarios`} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:text-white">{isFa ? "سناریوها" : "Scenarios"} <ChevronRight className={`h-3 w-3 ${isFa ? "rotate-180" : ""}`} /></Link>
          <Link href={`${arenaBasePath}/journal`} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:text-white"><BookOpen className="h-3.5 w-3.5" /> {isFa ? "ژورنال سروری" : "Server journal"}</Link>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={isFa ? "خلاصه حساب آرنا" : "Arena account summary"}>
        <div className="rounded-[24px] border border-white/10 bg-slate-900/70 p-5"><p className="text-xs font-black text-slate-300">{isFa ? "موجودی نقد" : "Available cash"}</p><p className="mt-2 text-2xl font-black tabular-nums">{usd(cash)}</p><p className="mt-1 text-xs font-bold text-slate-300">{isFa ? "رزرو سفارش" : "Order reserve"}: {usd(snapshot.state.reservedBalance)}</p></div>
        <div className={`rounded-[24px] border p-5 ${equityDelta >= 0 ? "border-emerald-400/20 bg-emerald-400/5" : "border-red-400/20 bg-red-400/5"}`}><p className="text-xs font-black text-slate-300">{isFa ? "ارزش لحظه‌ای حساب" : "Live account equity"}</p><p className="mt-2 text-2xl font-black tabular-nums">{usd(equity)}</p><p className={`mt-1 text-xs font-black ${equityDelta >= 0 ? "text-emerald-300" : "text-red-300"}`}>{equityDelta >= 0 ? <ArrowUpRight className="inline h-3.5 w-3.5" /> : <ArrowDownRight className="inline h-3.5 w-3.5" />} {signedUsd(equityDelta)} · {percent(equityRate, locale, true)}</p></div>
        <div className="rounded-[24px] border border-white/10 bg-slate-900/70 p-5"><p className="text-xs font-black text-slate-300">{isFa ? "فرصت فعال" : "Active attempt"}</p><p className="mt-2 text-2xl font-black">{snapshot.activeAttempt.attemptNumber} {isFa ? "از" : "of"} {snapshot.account.attemptsTotal}</p><p className="mt-1 text-xs font-bold text-slate-300">{isFa ? "باقی‌مانده" : "Remaining"}: {snapshot.account.attemptsRemaining}</p></div>
        <div className="rounded-[24px] border border-white/10 bg-slate-900/70 p-5"><p className="text-xs font-black text-slate-300">{isFa ? "نسخه معتبر" : "Authoritative revision"}</p><p className="mt-2 text-2xl font-black tabular-nums">r{snapshot.revision}</p><p className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-300"><ServerCog className="h-3.5 w-3.5" /> PostgreSQL authority</p></div>
      </section>

      <section className={`rounded-[24px] border p-5 ${riskCircuitOpen ? "border-red-400/30 bg-red-400/5" : "border-white/10 bg-slate-900/70"}`} aria-labelledby="arena-risk-telemetry">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="arena-risk-telemetry" className="text-xs font-black uppercase tracking-widest text-slate-300">{isFa ? "مرکز کنترل ریسک" : "Risk control center"}</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">{isFa ? "محاسبات از state معتبر سرور انجام می‌شوند." : "Metrics are derived from the authoritative server state."}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${riskCircuitOpen ? "bg-red-400/10 text-red-200" : "bg-emerald-400/10 text-emerald-200"}`}>
            {riskCircuitOpen ? (isFa ? "افزایش ریسک متوقف" : "Risk increase paused") : (isFa ? "در محدوده حفاظتی" : "Within guardrails")}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><p className="text-[11px] font-black text-slate-400">{isFa ? "اوج ارزش حساب" : "Peak equity"}</p><p className="mt-1 text-lg font-black tabular-nums">{usd(snapshot.state.peakEquity)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><p className="text-[11px] font-black text-slate-400">{isFa ? "افت از اوج" : "Current drawdown"}</p><p className="mt-1 text-lg font-black tabular-nums">{percent(drawdownRate, locale)}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{isFa ? `تا توقف: ${percent(drawdownRemaining, locale)}` : `To circuit: ${percent(drawdownRemaining, locale)}`}</p></div>
          <div className={`rounded-2xl border p-3 ${dailyLossComplete ? "border-white/10 bg-black/10" : "border-amber-400/30 bg-amber-400/5"}`}><p className="text-[11px] font-black text-slate-400">{isFa ? "زیان ناخالص تحقق‌یافته امروز (UTC)" : "Gross realized loss today (UTC)"}</p><p className="mt-1 text-lg font-black tabular-nums">{dailyLossComplete ? <>{usd(dailyLoss)} · {percent(dailyLossRate, locale)}<span className="mt-1 block text-xs font-bold text-slate-400">{isFa ? `P&L خالص: ${signedUsd(dailyRealizedPnl)}` : `Net P&L: ${signedUsd(dailyRealizedPnl)}`}</span></> : (isFa ? "داده روزانه ناقص" : "Incomplete daily data")}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{!dailyLossComplete ? (isFa ? "snapshot قدیمی است؛ صفر به‌عنوان زیان قطعی فرض نمی‌شود." : "Legacy snapshot: zero is not treated as authoritative loss data.") : (isFa ? "تلومتری آموزشی؛ هنوز هیچ سقف روزانه اجرایی برای آن تصویب نشده است." : "Training telemetry; no governed daily execution limit is active yet.")}</p></div>
          <div className={`rounded-2xl border p-3 ${portfolioRiskTelemetry.fullyStopDefined ? "border-white/10 bg-black/10" : "border-amber-400/30 bg-amber-400/5"}`}><p className="text-[11px] font-black text-slate-400">{isFa ? "ریسک برنامه‌ریزی‌شده پرتفوی" : "Planned portfolio risk"}</p><p className="mt-1 text-lg font-black tabular-nums">{portfolioRiskTelemetry.fullyStopDefined ? `${usd(portfolioStopRisk)} · ${percent(portfolioRiskRate, locale)}` : (isFa ? "نامحدود / تعریف‌نشده" : "Unbounded / undefined")}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{portfolioRiskTelemetry.fullyStopDefined ? (isFa ? `ظرفیت باقی‌مانده: ${percent(portfolioRiskRemaining, locale)}` : `Remaining budget: ${percent(portfolioRiskRemaining, locale)}`) : (isFa ? `${portfolioRiskTelemetry.unprotectedPositions} موقعیت و ${portfolioRiskTelemetry.unprotectedPendingOrders} سفارش بدون حد ضرر · ${usd(portfolioRiskTelemetry.unboundedExposure)} اکسپوژر بدون حفاظت` : `${portfolioRiskTelemetry.unprotectedPositions} position(s) and ${portfolioRiskTelemetry.unprotectedPendingOrders} order(s) without a stop · ${usd(portfolioRiskTelemetry.unboundedExposure)} unprotected exposure`)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/10 p-3"><p className="text-[11px] font-black text-slate-400">{isFa ? "سقف‌های آموزشی" : "Training guardrails"}</p><p className="mt-1 text-sm font-black">{isFa ? `پرتفوی ${percent(portfolioRiskLimit, locale)} · افت ${percent(drawdownLimit, locale)}` : `Portfolio ${percent(portfolioRiskLimit, locale)} · Drawdown ${percent(drawdownLimit, locale)}`}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{isFa ? "بستن موقعیت و لغو سفارش همیشه مجاز می‌ماند." : "Closing positions and cancelling orders remain available."}</p></div>
        </div>
      </section>

      <section className={`rounded-2xl border p-4 ${snapshot.marketStatus === "available" ? "border-cyan-300/15 bg-cyan-400/5" : "border-amber-400/25 bg-amber-400/5"}`} aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">{snapshot.marketStatus === "available" ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <WifiOff className="h-4 w-4 text-amber-300" />}<p className="text-xs font-black text-slate-300">{snapshot.marketStatus === "available" ? (isFa ? "قیمت معتبر سرور فعال است" : "Server-authoritative pricing is active") : (isFa ? "قیمت معتبر سرور در دسترس نیست؛ فرمان‌های قیمت‌محور متوقف‌اند" : "Server-authoritative pricing is unavailable; price-dependent commands are paused")}</p></div>
          {market && <p className="text-[11px] font-bold text-slate-300">{market.source} · {dateTime(market.observedAt, locale)}</p>}
        </div>
        {market && <div className="mt-3 flex gap-4 text-sm font-black"><span>BTC {usd(market.prices.BTC)}</span><span>ETH {usd(market.prices.ETH)}</span></div>}
      </section>

      <ArenaMarketChart
        asset={selectedAsset}
        livePrice={market?.prices[selectedAsset] ?? null}
        locale={locale}
      />

      {error && <div className="flex items-start gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-bold leading-7 text-red-200" role="alert"><AlertTriangle className="mt-1 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div className="flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-200" role="status"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.35fr)]">
        <TradeForm snapshot={snapshot} busy={busy} locale={locale} selectedAsset={selectedAsset} onSelectedAsset={setSelectedAsset} onCommand={sendCommand} />

        <div className="space-y-6">
          <section aria-labelledby="arena-open-positions">
            <div className="mb-3 flex items-center justify-between"><h2 id="arena-open-positions" className="text-xs font-black uppercase tracking-widest text-slate-300">{isFa ? "موقعیت‌های باز" : "Open positions"}</h2><span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-black text-slate-400">{snapshot.state.openPositions.length}</span></div>
            {snapshot.state.openPositions.length > 0 ? <div className="space-y-3">{snapshot.state.openPositions.map((position) => <PositionCard key={position.id} position={position} marketPrice={market?.prices[position.asset] ?? null} marketAvailable={snapshot.marketStatus === "available"} busy={busy} locale={locale} onClose={() => void sendCommand({ type: "close_position", positionId: position.id, reason: "manual" })} />)}</div> : <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm font-bold text-slate-300">{isFa ? "موقعیت بازی وجود ندارد." : "There are no open positions."}</div>}
          </section>

          {snapshot.state.pendingOrders.length > 0 && <section aria-labelledby="arena-pending-orders"><div className="mb-3 flex items-center justify-between"><h2 id="arena-pending-orders" className="text-xs font-black uppercase tracking-widest text-slate-300">{isFa ? "سفارش‌های در انتظار" : "Pending orders"}</h2><span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-black text-slate-400">{snapshot.state.pendingOrders.length}</span></div><div className="space-y-3">{snapshot.state.pendingOrders.map((order) => <PendingOrderCard key={order.id} order={order} busy={busy} locale={locale} onCancel={() => void sendCommand({ type: "cancel_order", orderId: order.id })} />)}</div></section>}
        </div>
      </div>

      {recentFlags.length > 0 && <section className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5" aria-labelledby="arena-mentor-signals"><div className="mb-3 flex items-center gap-2"><Target className="h-5 w-5 text-violet-300" /><h2 id="arena-mentor-signals" className="font-black">{isFa ? "سیگنال‌های رفتاری ثبت‌شده" : "Recorded behavioural signals"}</h2></div><div className="flex flex-wrap gap-2">{recentFlags.map((flag) => <MentorFlag key={flag} flag={flag} locale={locale} />)}</div></section>}

      {stats.total > 0 && <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={isFa ? "آمار معاملات بسته‌شده" : "Closed-trade statistics"}><div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center"><p className="text-xl font-black">{stats.total}</p><p className="text-xs font-bold text-slate-300">{isFa ? "معامله بسته" : "Closed trades"}</p></div><div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center"><p className="text-xl font-black text-emerald-300">{percent(stats.winRate, locale)}</p><p className="text-xs font-bold text-slate-300">{isFa ? "نرخ برد" : "Win rate"}</p></div><div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center"><p className="text-xl font-black text-cyan-300">{percent(stats.disciplineRate, locale)}</p><p className="text-xs font-bold text-slate-300">{isFa ? "ثبت حد ضرر" : "Stop-loss discipline"}</p></div><div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center"><p className={`text-xl font-black ${stats.average >= 0 ? "text-emerald-300" : "text-red-300"}`}>{percent(stats.average, locale, true)}</p><p className="text-xs font-bold text-slate-300">{isFa ? "میانگین بازده" : "Average return"}</p></div></section>}

      <section aria-labelledby="arena-recent-trades">
        <div className="mb-3 flex items-center justify-between"><h2 id="arena-recent-trades" className="text-xs font-black uppercase tracking-widest text-slate-300">{isFa ? "معاملات اخیر" : "Recent trades"}</h2><Link href={`${arenaBasePath}/journal`} className="text-xs font-black text-cyan-300 hover:underline">{isFa ? "مشاهده ژورنال سروری" : "View server journal"}</Link></div>
        {snapshot.state.closedTrades.length > 0 ? <div className="space-y-2">{snapshot.state.closedTrades.slice(0, 5).map((trade) => <ClosedTradeRow key={trade.id} trade={trade} locale={locale} />)}</div> : <div className="rounded-[24px] border border-dashed border-white/10 p-8 text-center"><Flame className="mx-auto h-8 w-8 text-slate-700" /><p className="mt-3 font-black text-slate-300">{isFa ? "هنوز معامله بسته‌شده‌ای وجود ندارد." : "No trades have been closed yet."}</p><p className="mt-1 text-sm font-bold text-slate-300">{isFa ? "فرمان‌ها پس از تأیید سرور در همین بخش ظاهر می‌شوند." : "Commands appear here after server confirmation."}</p></div>}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4 text-[11px] font-bold text-slate-300"><span>{isFa ? "دوره حساب تا" : "Account cycle ends"} {dateTime(snapshot.account.cycleEndsAt, locale)}</span><span>{isFa ? "آخرین وضعیت" : "Latest state"}: {dateTime(snapshot.state.updatedAt, locale)}</span></footer>
    </div>
  );
}
