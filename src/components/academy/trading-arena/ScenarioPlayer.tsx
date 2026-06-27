"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle,
  ChevronRight,
  Info,
  Shield,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import {
  loadArenaState,
  saveArenaState,
  executeMarketBuy,
  closePosition,
  processPriceTick,
  computeUnrealizedPnl,
  type TradingArenaState,
  type Asset,
} from "@/lib/trading-arena";
import {
  SCENARIOS,
  DIFFICULTY_LABEL,
  type Scenario,
} from "@/lib/trading-scenarios";

// ─── Mini price chart ─────────────────────────────────────────────────────────

function PriceSparkline({ prices, stepIndex }: { prices: number[]; stepIndex: number }) {
  const visible = prices.slice(0, stepIndex + 1);
  if (visible.length < 2) return null;
  const min = Math.min(...visible);
  const max = Math.max(...visible);
  const range = max - min || 1;
  const W = 240; const H = 60;
  const pts = visible
    .map((p, i) => {
      const x = (i / (visible.length - 1)) * W;
      const y = H - ((p - min) / range) * H;
      return `${x},${y}`;
    })
    .join(" ");
  const lastPrice = visible[visible.length - 1] ?? 0;
  const firstPrice = visible[0] ?? 0;
  const up = lastPrice >= firstPrice;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full" aria-label="نمودار قیمت سناریو" role="img">
      <polyline points={pts} fill="none" stroke={up ? "#34d399" : "#f87171"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Scenario card ────────────────────────────────────────────────────────────

function ScenarioCard({ scenario, progress, onStart }: {
  scenario: Scenario;
  progress: string | undefined;
  onStart: () => void;
}) {
  const diffColor = scenario.difficulty === "beginner" ? "text-emerald-300" : scenario.difficulty === "intermediate" ? "text-amber-300" : "text-red-300";
  const passed = progress === "passed";
  const failed = progress === "failed";
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-black ${diffColor}`}>{DIFFICULTY_LABEL[scenario.difficulty]}</span>
            <span className="text-xs font-bold text-slate-600">·</span>
            <span className="text-xs font-bold text-slate-500">{scenario.estimatedMinutes} دقیقه</span>
          </div>
          <h3 className="font-black">{scenario.title}</h3>
          <p className="mt-1 text-xs font-bold leading-6 text-slate-400">{scenario.objective}</p>
          <div className="mt-3 rounded-xl bg-slate-800/60 p-2.5">
            <p className="text-xs font-bold text-slate-400">مفهوم: <span className="text-cyan-200">{scenario.concept}</span></p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {passed && <div className="flex items-center gap-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-xs font-black text-emerald-300"><CheckCircle className="h-3 w-3" /> قبول</div>}
          {failed && <div className="flex items-center gap-1 rounded-full bg-red-400/20 px-2 py-0.5 text-xs font-black text-red-300"><XCircle className="h-3 w-3" /> رد</div>}
        </div>
      </div>
      <button
        onClick={onStart}
        className="mt-4 w-full rounded-2xl border border-cyan-300/20 bg-cyan-400/5 py-2.5 text-sm font-black text-cyan-200 hover:bg-cyan-400/10 focus:outline-none focus:ring-2 focus:ring-cyan-400"
        aria-label={`شروع سناریو: ${scenario.title}`}
      >
        {progress === "passed" ? "بازی دوباره" : progress === "failed" ? "تلاش مجدد" : "شروع سناریو"} <ChevronRight className="inline h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Active scenario ──────────────────────────────────────────────────────────

type ScenarioPhase = "briefing" | "trading" | "result";

function ActiveScenario({ scenario, arenaState, onUpdate, onExit }: {
  scenario: Scenario;
  arenaState: TradingArenaState;
  onUpdate: (state: TradingArenaState) => void;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<ScenarioPhase>("briefing");
  const [stepIndex, setStepIndex] = useState(0);
  const [scenarioState, setScenarioState] = useState<TradingArenaState>({
    ...arenaState,
    balance: scenario.initialBalance,
    initialBalance: scenario.initialBalance,
    openPositions: [],
    closedTrades: [],
    pendingOrders: [],
    totalRealizedPnl: 0,
    lastTradeAt: null,
    lastLossAt: null,
  });
  const [passed, setPassed] = useState<boolean | null>(null);
  const [usdt, setUsdt] = useState("");
  const [sl, setSl] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentPrice = scenario.priceSequence[stepIndex] ?? scenario.startPrice;

  // Advance price on a timer during trading phase
  useEffect(() => {
    if (phase !== "trading") return;
    intervalRef.current = setInterval(() => {
      setStepIndex((i) => {
        const next = i + 1;
        if (next >= scenario.priceSequence.length) {
          clearInterval(intervalRef.current!);
          // End of sequence — evaluate
          return next - 1;
        }
        return next;
      });
    }, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [phase, scenario.priceSequence.length]);

  // Check SL/TP on each step
  useEffect(() => {
    if (phase !== "trading") return;
    const prices = { BTC: currentPrice, ETH: currentPrice } as Record<Asset, number>;
    const updated = processPriceTick(scenarioState, prices);
    if (updated !== scenarioState) setScenarioState(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Check win/loss conditions
  useEffect(() => {
    if (phase !== "trading") return;
    const isLast = stepIndex >= scenario.priceSequence.length - 1;

    // Check failure: revenge trade flag in recent trades
    const revengeDetected = scenarioState.closedTrades.some((t) => t.mentorFlags.includes("revenge-trade"));
    if (scenario.failureCriteria.type === "revenge-trade" && revengeDetected) {
      endScenario(false); return;
    }

    // Check failure: pnl-pct
    if (scenario.failureCriteria.type === "pnl-pct") {
      const threshold = scenario.failureCriteria.value ?? -8;
      const pnlPct = (scenarioState.totalRealizedPnl / scenarioState.initialBalance) * 100;
      if (pnlPct <= threshold) { endScenario(false); return; }
    }

    // Check success: no-trade
    if (scenario.successCriteria.type === "no-trade" && isLast) {
      endScenario(scenarioState.closedTrades.length === 0 && scenarioState.openPositions.length === 0);
      return;
    }

    // End of sequence
    if (isLast) {
      evaluateAtEnd();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, scenarioState]);

  const evaluateAtEnd = () => {
    const { successCriteria, failureCriteria } = scenario;

    if (successCriteria.type === "pnl-positive") {
      endScenario(scenarioState.totalRealizedPnl > 0);
    } else if (successCriteria.type === "pnl-pct") {
      const threshold = successCriteria.value ?? 0;
      const pnlPct = (scenarioState.totalRealizedPnl / scenarioState.initialBalance) * 100;
      endScenario(pnlPct >= threshold);
    } else if (successCriteria.type === "stop-loss-set") {
      const allHadSL = scenarioState.closedTrades.every((t) => t.hadStopLoss);
      const anyTrade = scenarioState.closedTrades.length > 0;
      endScenario(anyTrade && allHadSL);
    } else if (failureCriteria.type === "no-stop-loss") {
      const anyNoSL = scenarioState.closedTrades.some((t) => !t.hadStopLoss);
      endScenario(!anyNoSL && scenarioState.closedTrades.length > 0);
    } else {
      endScenario(scenarioState.totalRealizedPnl >= 0);
    }
  };

  const endScenario = (didPass: boolean) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPassed(didPass);
    setPhase("result");

    // Update main arena scenario progress
    const newArenaState: TradingArenaState = {
      ...arenaState,
      scenarioProgress: {
        ...arenaState.scenarioProgress,
        [scenario.id]: didPass ? "passed" : "failed",
      },
    };
    saveArenaState(newArenaState);
    onUpdate(newArenaState);
  };

  const handleBuy = () => {
    const usdtNum = parseFloat(usdt);
    const slNum = parseFloat(sl) || null;
    if (usdtNum < 10 || usdtNum > scenarioState.balance) return;
    const result = executeMarketBuy(scenarioState, scenario.targetAsset, usdtNum, currentPrice, {
      stopLoss: slNum ?? undefined,
      scenarioId: scenario.id,
    });
    if (result.ok) setScenarioState(result.state);
    setUsdt(""); setSl("");
  };

  const handleClose = (positionId: string) => {
    const pos = scenarioState.openPositions.find((p) => p.id === positionId);
    if (!pos) return;
    const result = closePosition(scenarioState, positionId, currentPrice, "manual");
    if (result) setScenarioState(result.state);
  };

  const progress = ((stepIndex + 1) / scenario.priceSequence.length) * 100;
  const priceChange = currentPrice - scenario.startPrice;
  const priceChangePct = (priceChange / scenario.startPrice) * 100;
  const up = priceChange >= 0;

  if (phase === "briefing") {
    return (
      <div className="rounded-[28px] border border-white/10 bg-slate-900 p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-cyan-300 mb-1">{DIFFICULTY_LABEL[scenario.difficulty]}</p>
            <h2 className="text-xl font-black">{scenario.title}</h2>
          </div>
          <button onClick={onExit} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:text-white" aria-label="بستن">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4">
          <p className="text-xs font-black text-cyan-300 mb-1.5">هدف سناریو</p>
          <p className="text-sm font-bold leading-7 text-slate-200">{scenario.objective}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4">
          <p className="text-xs font-black text-slate-400 mb-1.5">وضعیت بازار</p>
          <p className="text-sm font-bold leading-7 text-slate-300">{scenario.marketContext}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-800/40 p-3">
            <p className="text-xs font-bold text-slate-500">موجودی سناریو</p>
            <p className="mt-1 font-black">${scenario.initialBalance.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-slate-800/40 p-3">
            <p className="text-xs font-bold text-slate-500">دارایی هدف</p>
            <p className="mt-1 font-black">{scenario.targetAsset}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div>
              <p className="text-xs font-black text-amber-300 mb-1">راهنما</p>
              <p className="text-sm font-bold text-amber-200">{scenario.successHint}</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setPhase("trading")}
          className="w-full rounded-2xl bg-cyan-500 py-3.5 text-sm font-black text-white hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300"
        >
          شروع سناریو ←
        </button>
      </div>
    );
  }

  if (phase === "result") {
    const { mentorFeedback, dnaImpact } = scenario;
    return (
      <div className="rounded-[28px] border border-white/10 bg-slate-900 p-6 space-y-5">
        <div className="text-center">
          {passed ? (
            <><Award className="mx-auto h-12 w-12 text-amber-300 mb-3" /><h2 className="text-2xl font-black text-emerald-300">موفق شدید!</h2></>
          ) : (
            <><XCircle className="mx-auto h-12 w-12 text-red-300 mb-3" /><h2 className="text-2xl font-black text-red-300">شکست در سناریو</h2></>
          )}
        </div>
        <div className={`rounded-2xl border p-5 ${passed ? "border-emerald-400/30 bg-emerald-400/5" : "border-red-400/30 bg-red-400/5"}`}>
          <p className="font-black mb-2">{passed ? mentorFeedback.passHeadline : mentorFeedback.failHeadline}</p>
          <p className="text-sm font-bold leading-7 text-slate-300">{passed ? mentorFeedback.passBody : mentorFeedback.failBody}</p>
        </div>
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4">
          <div className="flex items-start gap-2">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
            <div>
              <p className="text-xs font-black text-cyan-300 mb-1">درس کلیدی</p>
              <p className="text-sm font-bold leading-7 text-cyan-200">{mentorFeedback.keyLesson}</p>
            </div>
          </div>
        </div>
        {/* DNA impact */}
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">تأثیر بر Trading DNA</p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(dnaImpact).map(([dim, val]) => {
              if (val === 0) return null;
              const label: Record<string, string> = {
                discipline: "انضباط", patience: "صبر", risk_management: "مدیریت ریسک",
                fomo_risk: "FOMO", revenge_risk: "انتقام", decision_quality: "تصمیم",
              };
              const positive = (val > 0 && passed) || (val < 0 && !passed);
              const displayVal = passed ? val : -Math.abs(val);
              return (
                <div key={dim} className={`rounded-xl border p-2.5 text-center ${positive ? "border-emerald-400/20 bg-emerald-400/5" : "border-red-400/20 bg-red-400/5"}`}>
                  <p className={`text-sm font-black ${positive ? "text-emerald-300" : "text-red-300"}`}>
                    {displayVal > 0 ? "+" : ""}{displayVal}
                  </p>
                  <p className="text-[10px] font-bold text-slate-500">{label[dim] ?? dim}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setPassed(null);
              setStepIndex(0);
              setScenarioState({ ...arenaState, balance: scenario.initialBalance, initialBalance: scenario.initialBalance, openPositions: [], closedTrades: [], pendingOrders: [], totalRealizedPnl: 0, lastTradeAt: null, lastLossAt: null });
              setPhase("briefing");
            }}
            className="flex-1 rounded-2xl border border-white/10 py-3 text-sm font-black text-slate-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            تلاش مجدد
          </button>
          <button
            onClick={onExit}
            className="flex-1 rounded-2xl bg-cyan-500 py-3 text-sm font-black text-white hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            بازگشت به سناریوها
          </button>
        </div>
      </div>
    );
  }

  // Trading phase
  const canBuy = scenario.allowedActions.includes("buy");
  const canClose = scenario.allowedActions.includes("close");

  return (
    <div className="space-y-4">
      {/* Price display */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs font-black text-slate-500">{scenario.targetAsset}/USDT</p>
            <p className="text-3xl font-black">${currentPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
            <div className={`flex items-center gap-1 mt-1 text-sm font-black ${up ? "text-emerald-300" : "text-red-300"}`}>
              {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {up ? "+" : ""}{priceChangePct.toFixed(2)}٪ از شروع
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-slate-500">موجودی</p>
            <p className="font-black">${scenarioState.balance.toFixed(0)}</p>
          </div>
        </div>
        <PriceSparkline prices={scenario.priceSequence} stepIndex={stepIndex} />
        {/* Progress bar */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-cyan-500 transition-all duration-500" style={{ width: `${progress}%` }} role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} />
        </div>
        <p className="mt-1 text-center text-xs font-bold text-slate-600">مرحله {stepIndex + 1} از {scenario.priceSequence.length}</p>
      </div>

      {/* Safety + objective reminder */}
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-2.5">
        <p className="text-xs font-bold text-amber-200"><Info className="inline h-3 w-3 mr-1" />{scenario.objective}</p>
      </div>

      {/* Trade controls */}
      {canBuy && (
        <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-5">
          <p className="mb-3 text-xs font-black uppercase tracking-widest text-slate-500">معامله</p>
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-black text-slate-400">مبلغ (USDT)</label>
            <input
              type="number"
              value={usdt}
              onChange={(e) => setUsdt(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              placeholder={`موجودی: $${scenarioState.balance.toFixed(0)}`}
            />
          </div>
          <div className="mb-4">
            <label className="mb-1.5 flex items-center gap-1 text-xs font-black text-emerald-300">
              <Shield className="h-3 w-3" /> حد ضرر (پیشنهادی)
            </label>
            <input
              type="number"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
              placeholder={`مثلاً ${(currentPrice * 0.97).toFixed(0)}`}
            />
          </div>
          <button
            onClick={handleBuy}
            disabled={!parseFloat(usdt) || parseFloat(usdt) > scenarioState.balance}
            className="w-full rounded-2xl bg-emerald-500 py-3 text-sm font-black text-white hover:bg-emerald-400 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-emerald-300"
          >
            خرید {scenario.targetAsset}
          </button>
        </div>
      )}

      {/* Open positions in scenario */}
      {scenarioState.openPositions.length > 0 && canClose && (
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">موقعیت‌های باز</p>
          {scenarioState.openPositions.map((pos) => {
            const pnl = computeUnrealizedPnl(pos, currentPrice);
            const positive = pnl >= 0;
            return (
              <div key={pos.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex-1">
                  <p className="text-sm font-black">{pos.asset} — {pos.usdtValue.toFixed(0)} USDT</p>
                  <p className="text-xs font-bold text-slate-500">ورود: ${pos.entryPrice.toFixed(0)}</p>
                  {pos.stopLoss && <p className="text-[10px] font-bold text-emerald-400">SL: ${pos.stopLoss.toFixed(0)}</p>}
                  {!pos.stopLoss && <p className="text-[10px] font-bold text-amber-300">بدون حد ضرر</p>}
                </div>
                <div className="text-right">
                  <p className={`text-sm font-black ${positive ? "text-emerald-300" : "text-red-300"}`}>
                    {positive ? "+" : ""}${Math.abs(pnl).toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={() => handleClose(pos.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-red-400/30 bg-red-400/10 text-red-300 hover:bg-red-400/20"
                  aria-label="بستن موقعیت"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Wait / hold instruction */}
      {!canBuy && scenario.allowedActions.includes("wait") && (
        <div className="rounded-[24px] border border-white/10 bg-slate-800/40 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-300 mb-3" />
          <p className="font-black text-amber-200">مشاهده کنید — اقدام نکنید</p>
          <p className="mt-2 text-sm font-bold leading-7 text-slate-400">{scenario.successHint}</p>
        </div>
      )}

      {/* Scenario closed trades */}
      {scenarioState.closedTrades.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">معاملات بسته شده</p>
          {scenarioState.closedTrades.slice(0, 3).map((trade) => (
            <div key={trade.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 mb-2">
              {trade.pnl >= 0 ? <TrendingUp className="h-4 w-4 text-emerald-300 shrink-0" /> : <TrendingDown className="h-4 w-4 text-red-300 shrink-0" />}
              <div className="flex-1">
                <p className="text-sm font-black">{trade.asset}</p>
                <p className="text-xs font-bold text-slate-500">${trade.entryPrice.toFixed(0)} → ${trade.exitPrice.toFixed(0)} · {trade.closureReason === "stop-loss" ? "SL" : trade.closureReason === "take-profit" ? "TP" : "دستی"}</p>
              </div>
              <p className={`text-sm font-black ${trade.pnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {trade.pnl >= 0 ? "+" : ""}${Math.abs(trade.pnl).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Scenarios Page ──────────────────────────────────────────────────────

export function ScenarioList() {
  const [arenaState, setArenaState] = useState<TradingArenaState | null>(null);
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);

  useEffect(() => {
    setArenaState(loadArenaState());
  }, []);

  if (!arenaState) {
    return <div className="flex h-64 items-center justify-center text-sm font-bold text-slate-500">در حال بارگذاری...</div>;
  }

  if (activeScenario) {
    return (
      <div dir="rtl">
        <button onClick={() => setActiveScenario(null)} className="mb-4 flex items-center gap-1 text-xs font-black text-slate-400 hover:text-white focus:outline-none">
          <ChevronRight className="h-3 w-3 rotate-180" /> بازگشت به سناریوها
        </button>
        <ActiveScenario
          scenario={activeScenario}
          arenaState={arenaState}
          onUpdate={(s) => setArenaState(s)}
          onExit={() => setActiveScenario(null)}
        />
      </div>
    );
  }

  const passed = SCENARIOS.filter((s) => arenaState.scenarioProgress[s.id] === "passed").length;
  const total = SCENARIOS.length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">سناریوهای آموزشی</h1>
          <p className="mt-1 text-sm font-bold text-slate-400">تمرین رفتاری در موقعیت‌های واقعی بازار</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10">
          <span className="text-sm font-black text-amber-300">{passed}/{total}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-[24px] border border-white/10 bg-slate-900/60 p-4">
        <div className="mb-2 flex justify-between text-xs font-black">
          <span className="text-slate-400">پیشرفت سناریوها</span>
          <span className="text-cyan-300">{passed} از {total}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all" style={{ width: `${(passed / total) * 100}%` }} />
        </div>
      </div>

      {/* Safety banner */}
      <div className="flex items-start gap-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs font-bold text-amber-200">تمام سناریوها شبیه‌سازی‌شده هستند. هیچ پولی درگیر نیست. هدف یادگیری رفتار، نه کسب سود است.</p>
      </div>

      {/* Scenario cards */}
      <div className="space-y-4">
        {SCENARIOS.map((scenario) => (
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            progress={arenaState.scenarioProgress[scenario.id]}
            onStart={() => setActiveScenario(scenario)}
          />
        ))}
      </div>

      <Link href="/academy/trading-arena" className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-white">
        <ChevronRight className="h-3 w-3 rotate-180" /> بازگشت به آرنای اصلی
      </Link>
    </div>
  );
}
