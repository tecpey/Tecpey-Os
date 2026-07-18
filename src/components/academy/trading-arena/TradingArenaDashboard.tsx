"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Database,
  Flame,
  Info,
  Loader2,
  RefreshCw,
  Shield,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  computeUnrealizedPnl,
  computeNetEquity,
  computeArenaStats,
  WARNING_RISK_PCT,
  type TradingArenaState,
  type OpenPosition,
  type ClosedTrade,
  type Asset,
} from "@/lib/trading-arena";
import {
  ArenaExecutionError,
  fetchArenaExecutionState,
  mutateArenaExecutionState,
  type ArenaExecutionSnapshot,
} from "@/lib/trading-arena-client";

type EmotionalState = "calm" | "neutral" | "confident" | "anxious" | "fearful" | "greedy";
type PreTradePlan = { preTradePlan: string; emotionalState: EmotionalState };

// ─── Simulated price hook ─────────────────────────────────────────────────────

const SEED_PRICES: Record<Asset, number> = { BTC: 65_000, ETH: 3_500 };
const VOLATILITY = 0.0012; // ±0.12% per tick

function useSimulatedPrices() {
  const [prices, setPrices] = useState<Record<Asset, number>>(SEED_PRICES);
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setPrices((prev) => ({
        BTC: Math.max(prev.BTC * 0.5, prev.BTC * (1 + (Math.random() - 0.5) * 2 * VOLATILITY)),
        ETH: Math.max(prev.ETH * 0.5, prev.ETH * (1 + (Math.random() - 0.5) * 2 * VOLATILITY)),
      }));
      setTicks((t) => t + 1);
    }, 2000);
    return () => clearInterval(id);
  }, []);
  return { prices, ticks };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString("fa-IR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtUSD(n: number) {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}٪`;
}

// ─── Pre-trade journal modal ──────────────────────────────────────────────────

interface JournalModalProps {
  onSubmit: (plan: { preTradePlan: string; emotionalState: EmotionalState }) => void;
  onSkip: () => void;
}

function JournalModal({ onSubmit, onSkip }: JournalModalProps) {
  const [plan, setPlan] = useState("");
  const [emotion, setEmotion] = useState<EmotionalState>("neutral");
  const EMOTIONS: EmotionalState[] = ["calm", "neutral", "confident", "anxious", "fearful", "greedy"];
  const EMOTION_FA: Record<EmotionalState, string> = {
    calm: "آرام", neutral: "خنثی", confident: "مطمئن",
    anxious: "نگران", fearful: "ترسیده", greedy: "طمعکار",
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="برنامه معامله">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-slate-900 p-6">
        <h3 className="mb-1 font-black text-lg">برنامه قبل از معامله</h3>
        <p className="mb-4 text-sm font-bold text-slate-400">اختیاری — ولی به یادگیری کمک می‌کند</p>
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-black text-slate-400">چرا وارد این معامله می‌شوید؟</label>
          <textarea
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-slate-800 p-3 text-sm font-bold text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            placeholder="دلیل ورود، سطح حمایت، تحلیل..."
            aria-label="دلیل ورود به معامله"
          />
        </div>
        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-black text-slate-400">حالت احساسی شما</label>
          <div className="flex flex-wrap gap-2">
            {EMOTIONS.map((e) => (
              <button
                key={e}
                onClick={() => setEmotion(e)}
                className={`rounded-full border px-3 py-1 text-xs font-black transition-all ${emotion === e ? "border-cyan-300/50 bg-cyan-400/20 text-cyan-200" : "border-white/10 text-slate-400 hover:text-white"}`}
                aria-pressed={emotion === e}
              >
                {EMOTION_FA[e]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => onSubmit({ preTradePlan: plan, emotionalState: emotion })}
            className="flex-1 rounded-2xl bg-cyan-500 py-3 text-sm font-black text-white hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            ثبت و ادامه
          </button>
          <button
            onClick={onSkip}
            className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            رد کردن
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Trade form ───────────────────────────────────────────────────────────────

interface TradeFormProps {
  prices: Record<Asset, number>;
  balance: number;
  disabled: boolean;
  onBuy: (
    asset: Asset,
    usdt: number,
    orderType: "market" | "limit",
    limitPrice: number,
    sl: number | null,
    tp: number | null,
    plan: PreTradePlan | null,
  ) => Promise<boolean>;
}

function TradeForm({ prices, balance, disabled, onBuy }: TradeFormProps) {
  const [asset, setAsset] = useState<Asset>("BTC");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [usdt, setUsdt] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [showJournal, setShowJournal] = useState(false);

  const usdtNum = parseFloat(usdt) || 0;
  const riskPct = balance > 0 ? usdtNum / balance : 0;
  const overRisk = riskPct > WARNING_RISK_PCT;

  const handleSubmit = () => {
    if (usdtNum <= 0 || disabled) return;
    setShowJournal(true);
  };

  const executeWithPlan = async (plan: PreTradePlan | null) => {
    setShowJournal(false);
    const slNum = parseFloat(sl) || null;
    const tpNum = parseFloat(tp) || null;
    const limitNum = parseFloat(limitPrice) || prices[asset];
    const saved = await onBuy(asset, usdtNum, orderType, limitNum, slNum, tpNum, plan);
    if (!saved) return;
    setUsdt("");
    setSl("");
    setTp("");
    setLimitPrice("");
  };

  return (
    <>
      {showJournal && (
        <JournalModal
          onSubmit={(plan) => void executeWithPlan(plan)}
          onSkip={() => void executeWithPlan(null)}
        />
      )}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        {/* Asset + order type */}
        <div className="mb-4 flex gap-2">
          {(["BTC", "ETH"] as Asset[]).map((a) => (
            <button
              key={a}
              onClick={() => setAsset(a)}
              className={`flex-1 rounded-2xl border py-2.5 text-sm font-black transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400 ${asset === a ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-400 hover:text-white"}`}
              aria-pressed={asset === a}
            >
              {a} — {fmtUSD(prices[a])}
            </button>
          ))}
        </div>
        <div className="mb-4 flex rounded-2xl border border-white/10 bg-slate-800/40 p-1">
          {(["market", "limit"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`flex-1 rounded-xl py-2 text-xs font-black transition-all focus:outline-none focus:ring-2 focus:ring-cyan-400 ${orderType === t ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
              aria-pressed={orderType === t}
            >
              {t === "market" ? "بازار" : "محدود"}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-black text-slate-400">مبلغ (USDT)</label>
          <input
            type="number"
            min="10"
            max={balance}
            value={usdt}
            onChange={(e) => setUsdt(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 placeholder-slate-600 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
            placeholder="حداقل ۱۰ USDT"
            aria-label="مبلغ معامله به USDT"
          />
          {usdtNum > 0 && (
            <p className={`mt-1 text-xs font-bold ${overRisk ? "text-amber-300" : "text-slate-500"}`}>
              ریسک: {(riskPct * 100).toFixed(1)}٪ موجودی {overRisk && "⚠️ بالاتر از ۵٪ توصیه شده"}
            </p>
          )}
        </div>

        {/* Limit price */}
        {orderType === "limit" && (
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-black text-slate-400">قیمت محدود (USDT)</label>
            <input
              type="number"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 placeholder-slate-600 focus:border-cyan-300/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
              placeholder={`${prices[asset].toFixed(0)}`}
              aria-label="قیمت محدود"
            />
          </div>
        )}

        {/* SL / TP */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 flex items-center gap-1 text-xs font-black text-emerald-300">
              <Shield className="h-3 w-3" /> حد ضرر
            </label>
            <input
              type="number"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm font-black text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
              placeholder="پیشنهادی"
              aria-label="حد ضرر"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-black text-slate-400">حد سود</label>
            <input
              type="number"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm font-black text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
              placeholder="اختیاری"
              aria-label="حد سود"
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={disabled || usdtNum < 10 || usdtNum > balance}
          className="w-full rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white hover:bg-emerald-400 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          aria-label="خرید / ورود به معامله"
        >
          خرید / Long ↑
        </button>
        {!sl && usdtNum > 0 && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <p className="text-xs font-bold text-amber-200">بدون حد ضرر. توصیه می‌شود همیشه حد ضرر تنظیم کنید.</p>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Open position row ────────────────────────────────────────────────────────

function PositionRow({ pos, currentPrice, onClose }: { pos: OpenPosition; currentPrice: number; onClose: () => void }) {
  const pnl = computeUnrealizedPnl(pos, currentPrice);
  const pnlPct = (pnl / pos.usdtValue) * 100;
  const positive = pnl >= 0;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black">{pos.asset}</span>
          {!pos.stopLoss && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-black text-amber-300">بدون SL</span>}
        </div>
        <div className="mt-1 flex gap-3 text-xs font-bold text-slate-500">
          <span>ورود: {fmtUSD(pos.entryPrice)}</span>
          <span>الان: {fmtUSD(currentPrice)}</span>
          <span>{fmtUSD(pos.usdtValue)}</span>
        </div>
        {pos.stopLoss && <p className="mt-0.5 text-[10px] font-bold text-emerald-400">SL: {fmtUSD(pos.stopLoss)}</p>}
      </div>
      <div className="text-right">
        <p className={`text-sm font-black ${positive ? "text-emerald-300" : "text-red-300"}`}>
          {positive ? "+" : ""}{fmtUSD(pnl)}
        </p>
        <p className={`text-xs font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}>
          {fmtPct(pnlPct)}
        </p>
      </div>
      <button
        onClick={onClose}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/20 focus:outline-none focus:ring-2 focus:ring-red-400"
        aria-label={`بستن موقعیت ${pos.asset}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Trade history row ────────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: ClosedTrade }) {
  const positive = trade.pnl >= 0;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${positive ? "bg-emerald-400/10" : "bg-red-400/10"}`}>
        {positive ? <TrendingUp className="h-4 w-4 text-emerald-300" /> : <TrendingDown className="h-4 w-4 text-red-300" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-black">{trade.asset}</span>
          {trade.closureReason === "stop-loss" && <span className="text-[10px] font-black text-amber-300">SL</span>}
          {trade.closureReason === "take-profit" && <span className="text-[10px] font-black text-emerald-300">TP</span>}
        </div>
        <p className="text-xs font-bold text-slate-500">
          {fmtUSD(trade.entryPrice)} → {fmtUSD(trade.exitPrice)}
        </p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-black ${positive ? "text-emerald-300" : "text-red-300"}`}>
          {positive ? "+" : ""}{fmtUSD(trade.pnl)}
        </p>
        <p className={`text-xs font-bold ${positive ? "text-emerald-400" : "text-red-400"}`}>
          {fmtPct(trade.pnlPct)}
        </p>
      </div>
    </div>
  );
}

// ─── Mentor flag summary ──────────────────────────────────────────────────────

function MentorFlagBadge({ flag }: { flag: string }) {
  const warn = flag === "no-stop-loss" || flag === "over-risk" || flag === "revenge-trade" || flag === "fomo-entry";
  const LABELS: Record<string, string> = {
    "no-stop-loss": "بدون حد ضرر",
    "over-risk": "ریسک بیش از حد",
    "impulse-entry": "ورود تکانشی",
    "revenge-trade": "معامله انتقامی",
    "fomo-entry": "FOMO",
    "good-discipline": "انضباط خوب",
    "target-hit": "هدف محقق شد",
    "proper-sizing": "اندازه مناسب",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${warn ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"}`}>
      {LABELS[flag] ?? flag}
    </span>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function TradingArenaDashboard() {
  const [snapshot, setSnapshot] = useState<ArenaExecutionSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const { prices, ticks } = useSimulatedPrices();
  const mutationInFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    setError("");
    void fetchArenaExecutionState(controller.signal)
      .then(setSnapshot)
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [reloadToken]);

  const applyAction = useCallback(async (
    action: Parameters<typeof mutateArenaExecutionState>[0],
  ): Promise<boolean> => {
    if (!snapshot || mutationInFlight.current) return false;
    mutationInFlight.current = true;
    setMutating(true);
    setError("");
    try {
      const next = await mutateArenaExecutionState(action, snapshot.revision);
      setSnapshot(next);
      return true;
    } catch (cause) {
      if (cause instanceof ArenaExecutionError) {
        if (cause.code === "revision_conflict" && cause.snapshot?.account && cause.snapshot.attempts && typeof cause.snapshot.revision === "number") {
          setSnapshot({
            account: cause.snapshot.account,
            attempts: cause.snapshot.attempts,
            activeAttempt: cause.snapshot.activeAttempt ?? null,
            state: cause.snapshot.state ?? null,
            revision: cause.snapshot.revision,
          });
          setError("نسخه جدیدتری از Arena روی دستگاه دیگری ثبت شده بود. وضعیت سرور بازیابی شد؛ دوباره اقدام کنید.");
        } else if (cause.code === "arena_attempts_exhausted") {
          setError("هر سه فرصت این دوره مصرف شده‌اند. برای ادامه باید دوره اشتراک بعدی فعال شود.");
          setReloadToken((value) => value + 1);
        } else if (cause.code === "arena_no_active_attempt") {
          setError("فرصت فعال برای این دوره وجود ندارد.");
          setReloadToken((value) => value + 1);
        } else {
          setError("ثبت تراکنشی روی سرور انجام نشد. هیچ تغییر محلی یا جعلی ایجاد نشد؛ دوباره تلاش کنید.");
        }
      } else {
        setError("ارتباط با Arena برقرار نشد. وضعیت حساب شما روی سرور محفوظ است.");
      }
      return false;
    } finally {
      mutationInFlight.current = false;
      setMutating(false);
    }
  }, [snapshot]);

  const arenaState = snapshot?.state ?? null;

  useEffect(() => {
    if (!arenaState || ticks === 0 || mutationInFlight.current) return;
    if (arenaState.openPositions.length === 0 && arenaState.pendingOrders.length === 0) return;
    void applyAction({ type: "price_tick", prices });
  }, [applyAction, arenaState, prices, ticks]);

  const handleBuy = useCallback(async (
    asset: Asset,
    usdt: number,
    orderType: "market" | "limit",
    limitPrice: number,
    sl: number | null,
    tp: number | null,
    plan: PreTradePlan | null,
  ) => {
    if (orderType === "market") {
      return applyAction({
        type: "market_buy",
        asset,
        usdtAmount: usdt,
        marketPrice: prices[asset],
        stopLoss: sl ?? undefined,
        takeProfit: tp ?? undefined,
        preTradePlan: plan?.preTradePlan,
        emotionalState: plan?.emotionalState,
      });
    }
    return applyAction({
      type: "limit_order",
      asset,
      usdtAmount: usdt,
      limitPrice,
      stopLoss: sl ?? undefined,
      takeProfit: tp ?? undefined,
      preTradePlan: plan?.preTradePlan,
      emotionalState: plan?.emotionalState,
    });
  }, [applyAction, prices]);

  const handleClose = useCallback(async (positionId: string) => {
    const position = arenaState?.openPositions.find((item) => item.id === positionId);
    if (!position) return;
    await applyAction({
      type: "close_position",
      positionId,
      exitPrice: prices[position.asset],
      reason: "manual",
    });
  }, [applyAction, arenaState, prices]);

  const handleCancelOrder = useCallback(async (orderId: string) => {
    await applyAction({ type: "cancel_order", orderId });
  }, [applyAction]);

  const handleNextAttempt = useCallback(async () => {
    const advanced = await applyAction("start_next_attempt");
    if (advanced) setConfirmReset(false);
  }, [applyAction]);

  if (!snapshot && !loadError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm font-bold text-slate-500">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-300" />
        در حال بازیابی وضعیت Arena از PostgreSQL…
      </div>
    );
  }

  if (loadError || !snapshot) {
    return (
      <div className="rounded-[28px] border border-rose-400/25 bg-rose-400/10 p-8 text-center" role="alert">
        <Database className="mx-auto h-10 w-10 text-rose-200" />
        <h2 className="mt-4 text-xl font-black text-rose-100">وضعیت Arena از سرور بازیابی نشد</h2>
        <p className="mt-2 text-sm font-bold leading-7 text-slate-300">
          هیچ نسخه محلی ساخته نشده و تاریخچه حساب شما دست‌نخورده است.
        </p>
        <button
          type="button"
          onClick={() => setReloadToken((value) => value + 1)}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-rose-400/20 px-5 py-3 text-sm font-black text-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300"
        >
          <RefreshCw className="h-4 w-4" /> تلاش دوباره
        </button>
      </div>
    );
  }

  if (!arenaState || !snapshot.activeAttempt || snapshot.account.status !== "active") {
    return (
      <div className="rounded-[28px] border border-amber-400/25 bg-amber-400/10 p-8 text-center" role="status">
        <Shield className="mx-auto h-10 w-10 text-amber-200" />
        <h2 className="mt-4 text-2xl font-black text-amber-100">فرصت فعال Arena وجود ندارد</h2>
        <p className="mt-3 text-sm font-bold leading-7 text-slate-300">
          {snapshot.account.attemptsRemaining === 0
            ? "سه فرصت این دوره مصرف شده‌اند. شروع دوره بعدی باید از مسیر اشتراک انجام شود."
            : "وضعیت فرصت‌ها از سرور قابل بازیابی نیست؛ دوباره تلاش کنید."}
        </p>
        <button
          type="button"
          onClick={() => setReloadToken((value) => value + 1)}
          className="mt-5 rounded-2xl border border-amber-300/30 px-5 py-3 text-sm font-black text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
        >
          تازه‌سازی حساب
        </button>
      </div>
    );
  }

  const stats = computeArenaStats(arenaState);
  const equity = computeNetEquity(arenaState, prices);
  const equityPnl = equity - arenaState.initialBalance;
  const equityPct = (equityPnl / arenaState.initialBalance) * 100;
  const recentFlags = arenaState.closedTrades.slice(0, 5).flatMap((trade) => trade.mentorFlags);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5">
        <Info className="h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs font-black text-amber-200">معامله شبیه‌سازی‌شده و server-side — برای یادگیری، نه سرمایه‌گذاری واقعی</p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black">آرنای معاملاتی</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">تمرین رفتار، مدیریت ریسک و اجرای معامله با state تراکنشی سرور</p>
          <p className="mt-2 text-xs font-black text-cyan-200">
            فرصت فعال {snapshot.activeAttempt.attemptNumber} از {snapshot.account.attemptsTotal} · {snapshot.account.attemptsRemaining} فرصت باقی‌مانده
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/academy/trading-arena/scenarios" className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400">
            سناریوها <ChevronRight className="h-3 w-3" />
          </Link>
          <Link href="/academy/trading-arena/journal" className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400">
            <BookOpen className="h-3.5 w-3.5" /> ژورنال
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">موجودی نقد فعال</p>
          <p className="mt-2 text-3xl font-black tabular-nums">${fmt(arenaState.balance, 2)}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">شروع هر فرصت: ${fmt(arenaState.initialBalance, 0)}</p>
        </div>
        <div className={`rounded-[24px] border p-5 ${equityPnl >= 0 ? "border-emerald-400/20 bg-emerald-400/5" : "border-red-400/20 bg-red-400/5"}`}>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">ارزش لحظه‌ای</p>
          <p className="mt-2 text-xl font-black">${fmt(equity, 0)}</p>
          <p className={`mt-1 text-xs font-black ${equityPnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>
            {equityPnl >= 0 ? <ArrowUpRight className="inline h-3 w-3" /> : <ArrowDownRight className="inline h-3 w-3" />}
            {fmtPct(equityPct)}
          </p>
        </div>
        <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">معاملات بسته</p>
          <p className="mt-2 text-xl font-black">{stats.totalTrades}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">Win: {(stats.winRate * 100).toFixed(0)}٪</p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-bold leading-7 text-red-200" role="alert">
          {error}
        </div>
      )}

      <TradeForm prices={prices} balance={arenaState.balance} disabled={mutating} onBuy={handleBuy} />

      {arenaState.openPositions.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">موقعیت‌های باز</p>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-black text-slate-400">{arenaState.openPositions.length}</span>
          </div>
          <div className="space-y-2">
            {arenaState.openPositions.map((position) => (
              <PositionRow
                key={position.id}
                pos={position}
                currentPrice={prices[position.asset]}
                onClose={() => void handleClose(position.id)}
              />
            ))}
          </div>
        </div>
      )}

      {arenaState.pendingOrders.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">سفارش‌های محدود در انتظار</p>
          <div className="space-y-2">
            {arenaState.pendingOrders.map((order) => (
              <div key={order.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="flex-1">
                  <p className="text-sm font-black">{order.asset} — محدود @ {fmtUSD(order.limitPrice)}</p>
                  <p className="text-xs font-bold text-slate-500">{fmtUSD(order.usdtValue)} USDT</p>
                </div>
                <span className="text-xs font-black text-amber-300">در انتظار اجرا</span>
                <button
                  type="button"
                  disabled={mutating}
                  onClick={() => void handleCancelOrder(order.id)}
                  className="rounded-xl border border-red-400/30 px-3 py-1.5 text-xs font-black text-red-300 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  لغو
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentFlags.length > 0 && (
        <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">تحلیل منتور — معاملات اخیر</p>
          <div className="flex flex-wrap gap-2">
            {[...new Set(recentFlags)].map((flag) => <MentorFlagBadge key={flag} flag={flag} />)}
          </div>
          {recentFlags.includes("no-stop-loss") && <p className="mt-3 text-sm font-bold text-amber-200">⚠️ برخی معاملات بدون حد ضرر بسته شدند. این یکی از مهم‌ترین اشتباهات در معامله‌گری است.</p>}
          {recentFlags.includes("revenge-trade") && <p className="mt-2 text-sm font-bold text-red-200">🔴 الگوی معامله انتقامی شناسایی شد. بعد از ضرر، قبل از معامله بعدی توقف کنید.</p>}
        </div>
      )}

      {stats.totalTrades >= 2 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-center">
            <p className="text-lg font-black text-emerald-300">{(stats.stopLossRate * 100).toFixed(0)}٪</p>
            <p className="text-xs font-bold text-slate-400">با حد ضرر</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-center">
            <p className={`text-lg font-black ${stats.avgPnlPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtPct(stats.avgPnlPct)}</p>
            <p className="text-xs font-bold text-slate-400">میانگین P&L</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 text-center">
            <p className="text-lg font-black text-cyan-300">{stats.scenariosPassed}</p>
            <p className="text-xs font-bold text-slate-400">سناریو پاس</p>
          </div>
        </div>
      )}

      {arenaState.closedTrades.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">معاملات اخیر</p>
            <Link href="/academy/trading-arena/journal" className="text-xs font-black text-cyan-300 hover:underline">مشاهده همه</Link>
          </div>
          <div className="space-y-2">
            {arenaState.closedTrades.slice(0, 5).map((trade) => <TradeRow key={trade.id} trade={trade} />)}
          </div>
        </div>
      )}

      {arenaState.openPositions.length === 0 && arenaState.closedTrades.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-white/10 p-8 text-center">
          <Flame className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className="font-black text-slate-400">هنوز معامله‌ای نزده‌اید</p>
          <p className="mt-1 text-sm font-bold text-slate-600">با سناریوهای راهنما شروع کنید یا مستقیم معامله کنید.</p>
          <Link href="/academy/trading-arena/scenarios" className="mt-4 inline-flex items-center gap-1 rounded-2xl bg-cyan-500/20 px-4 py-2 text-sm font-black text-cyan-300 hover:bg-cyan-500/30">
            شروع از سناریو اول <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="pt-2">
        {confirmReset ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-400/20 bg-red-400/5 p-4">
            <p className="flex-1 text-xs font-bold leading-6 text-red-200">
              این کار فرصت فعال را ناموفق می‌بندد و فرصت بعدی را با ۱۰۰٬۰۰۰ دلار تازه فعال می‌کند. قابل بازگشت نیست.
            </p>
            <button
              type="button"
              disabled={mutating}
              onClick={() => void handleNextAttempt()}
              className="rounded-xl border border-red-400/40 px-3 py-1.5 text-xs font-black text-red-300 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-red-400"
            >
              مصرف این فرصت و شروع بعدی
            </button>
            <button type="button" onClick={() => setConfirmReset(false)} className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-black text-slate-400">لغو</button>
          </div>
        ) : (
          <button
            type="button"
            disabled={mutating || snapshot.account.attemptsRemaining <= 0}
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs font-black text-slate-500 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <RefreshCw className="h-3 w-3" /> پایان فرصت و شروع فرصت بعدی
          </button>
        )}
      </div>
    </div>
  );
}
