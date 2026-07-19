"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Database, Loader2, RefreshCw, ShieldCheck, Target, X } from "lucide-react";
import type { ArenaAccount, ArenaAttempt } from "@/lib/trading-arena-account";
import type { ArenaExecutionActionV2, ArenaExecutionAsset, ArenaExecutionStateV2, ArenaPriceSnapshot } from "@/lib/trading-arena-execution-v2";

type Payload = {
  error?: string;
  account?: ArenaAccount;
  attempts?: ArenaAttempt[];
  activeAttempt?: ArenaAttempt | null;
  state?: ArenaExecutionStateV2;
  revision?: number;
  market?: ArenaPriceSnapshot | null;
  projectedEquity?: string;
  marketStatus?: "available" | "unavailable";
  eventType?: string;
};

type Status = "loading" | "ready" | "profile" | "error";
type Mode = "market" | "limit";

const money = (value: string | number | null | undefined) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";
};

const validDecimal = (value: string) => /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value) && Number(value) > 0;

export function TradingArenaExecutionClient() {
  const [status, setStatus] = useState<Status>("loading");
  const [payload, setPayload] = useState<Payload>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<ArenaExecutionAsset>("BTC");
  const [mode, setMode] = useState<Mode>("market");
  const [amount, setAmount] = useState("1000");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [plan, setPlan] = useState("");
  const [emotion, setEmotion] = useState("آرام");

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/trading-arena/execution", { credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
      const data = await response.json().catch(() => ({})) as Payload;
      if (response.status === 401) return setStatus("profile");
      if (!response.ok || !data.account || !data.activeAttempt || !data.state || data.revision === undefined) throw new Error(data.error || `arena_load_failed:${response.status}`);
      setPayload(data);
      setStatus("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "arena_load_failed");
      setStatus("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const command = useCallback(async (action: ArenaExecutionActionV2) => {
    if (busy || payload.revision === undefined) return;
    setBusy(true);
    setError(null);
    const key = crypto.randomUUID();
    try {
      const response = await fetch("/api/trading-arena/execution", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ expectedRevision: payload.revision, idempotencyKey: key, action }),
      });
      const data = await response.json().catch(() => ({})) as Payload;
      if (response.status === 409 && data.error === "revision_conflict") {
        await load();
        throw new Error("نسخه حساب تغییر کرده بود؛ state تازه از سرور بازیابی شد.");
      }
      if (!response.ok || !data.state || data.revision === undefined) throw new Error(data.error || `arena_command_failed:${response.status}`);
      setPayload((current) => ({ ...current, ...data }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "arena_command_failed");
    } finally {
      setBusy(false);
    }
  }, [busy, load, payload.revision]);

  const submit = async () => {
    if (!validDecimal(amount) || (mode === "limit" && !validDecimal(limitPrice)) || (stopLoss && !validDecimal(stopLoss)) || (takeProfit && !validDecimal(takeProfit))) {
      setError("مقادیر سفارش معتبر نیستند.");
      return;
    }
    const common = { asset, quoteAmount: amount, ...(stopLoss ? { stopLoss } : {}), ...(takeProfit ? { takeProfit } : {}), preTradePlan: plan.trim(), emotionalState: emotion.trim() };
    await command(mode === "market" ? { type: "market_buy", ...common } : { type: "limit_buy", ...common, limitPrice });
  };

  const state = payload.state;
  const market = payload.market ?? state?.lastMarket ?? null;
  const risk = useMemo(() => {
    const equity = Number(payload.projectedEquity ?? state?.equity ?? 0);
    return equity > 0 ? (Number(amount) / equity) * 100 : 0;
  }, [amount, payload.projectedEquity, state?.equity]);

  if (status === "loading") return <div className="rounded-[32px] border border-cyan-300/20 bg-white/5 p-10 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" /><p className="mt-4 font-black">در حال بازیابی حساب Arena از سرور…</p></div>;
  if (status === "profile") return <div className="rounded-[32px] border border-amber-300/25 bg-amber-400/10 p-10 text-center"><ShieldCheck className="mx-auto h-12 w-12 text-amber-200" /><h1 className="mt-4 text-2xl font-black">ابتدا پروفایل آکادمی را کامل کن</h1><Link href="/academy/onboarding" className="mt-6 inline-flex rounded-2xl bg-cyan-500 px-6 py-3 font-black text-white">ساخت پروفایل</Link></div>;
  if (status === "error" || !state || !payload.account || !payload.activeAttempt) return <div className="rounded-[32px] border border-rose-300/25 bg-rose-400/10 p-10 text-center" role="alert"><Database className="mx-auto h-12 w-12 text-rose-200" /><h1 className="mt-4 text-2xl font-black">حساب Arena بازیابی نشد</h1><p className="mt-3 text-sm font-bold">{error}</p><button onClick={() => void load()} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-rose-300/15 px-6 py-3 font-black"><RefreshCw className="h-4 w-4" />تلاش دوباره</button></div>;

  return <div className="space-y-5" dir="rtl">
    <section className="rounded-[34px] border border-cyan-300/20 bg-white/[0.055] p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-xs font-black text-emerald-100"><Database className="h-4 w-4" />اجرای authoritative متصل به PostgreSQL</div><h1 className="mt-3 text-4xl font-black">Trading Arena</h1><p className="mt-3 max-w-3xl text-sm font-bold leading-7 text-slate-300">سفارش، موقعیت، موجودی و revision فقط از سرور می‌آیند؛ مرورگر state معاملاتی مستقلی ندارد.</p></div><button disabled={busy} onClick={() => void command({ type: "refresh_market" })} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 font-black disabled:opacity-50"><RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />به‌روزرسانی بازار</button></div></section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["سرمایه نقد", money(state.cashBalance)], ["ارزش حساب", money(payload.projectedEquity ?? state.equity)], ["فرصت باقی‌مانده", `${payload.account.attemptsRemaining}/${payload.account.attemptsTotal}`], ["Revision سرور", String(payload.revision)]].map(([label, value]) => <div key={label} className="rounded-[24px] border border-white/10 bg-slate-900/70 p-5"><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}</section>

    {error && <div className="flex items-start gap-3 rounded-2xl border border-rose-300/30 bg-rose-400/10 p-4 text-sm font-bold text-rose-100"><AlertTriangle className="h-5 w-5" /><span>{error}</span><button onClick={() => setError(null)} className="mr-auto"><X className="h-4 w-4" /></button></div>}

    <section className="grid gap-5 xl:grid-cols-[410px_1fr]">
      <div className="rounded-[30px] border border-white/10 bg-slate-900/75 p-5"><h2 className="text-xl font-black">ثبت سفارش</h2><div className="mt-4 grid grid-cols-2 gap-2">{(["BTC", "ETH"] as ArenaExecutionAsset[]).map((item) => <button key={item} onClick={() => setAsset(item)} className={`rounded-2xl border p-3 font-black ${asset === item ? "border-cyan-300/50 bg-cyan-400/15" : "border-white/10"}`}>{item}<span className="block text-xs text-slate-400">{money(market?.prices[item])}</span></button>)}</div><div className="mt-3 grid grid-cols-2 gap-2">{(["market", "limit"] as Mode[]).map((item) => <button key={item} onClick={() => setMode(item)} className={`rounded-xl p-2 text-sm font-black ${mode === item ? "bg-slate-700" : "bg-slate-950 text-slate-500"}`}>{item === "market" ? "بازار" : "محدود"}</button>)}</div>
      {[{ label: "مبلغ USDT", value: amount, set: setAmount }, ...(mode === "limit" ? [{ label: "قیمت محدود", value: limitPrice, set: setLimitPrice }] : []), { label: "حد ضرر", value: stopLoss, set: setStopLoss }, { label: "حد سود", value: takeProfit, set: setTakeProfit }].map((field) => <label key={field.label} className="mt-3 block text-xs font-black text-slate-400">{field.label}<input value={field.value} onChange={(event) => field.set(event.target.value)} inputMode="decimal" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none" /></label>)}
      <label className="mt-3 block text-xs font-black text-slate-400">برنامه قبل از معامله<textarea value={plan} onChange={(event) => setPlan(event.target.value.slice(0, 1500))} rows={3} className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none" /></label><label className="mt-3 block text-xs font-black text-slate-400">حالت احساسی<input value={emotion} onChange={(event) => setEmotion(event.target.value.slice(0, 120))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none" /></label><div className={`mt-4 rounded-xl border p-3 text-xs font-black ${risk > 5 ? "border-amber-300/30 bg-amber-400/10 text-amber-100" : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"}`}>اندازه معامله: {risk.toFixed(2)}٪ ارزش حساب</div><button disabled={busy || payload.marketStatus === "unavailable"} onClick={() => void submit()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-500 py-4 font-black disabled:opacity-50">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Target className="h-5 w-5" />}ارسال فرمان به سرور</button></div>

      <div className="space-y-5"><div className="rounded-[30px] border border-white/10 bg-slate-900/70 p-5"><h2 className="text-xl font-black">موقعیت‌های باز · {state.openPositions.length}</h2><div className="mt-4 space-y-3">{state.openPositions.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm font-bold text-slate-500">موقعیت بازی وجود ندارد.</p> : state.openPositions.map((position) => <div key={position.id} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-black">{position.asset} · {money(position.quoteCommitted)}</p><p className="text-xs text-slate-500">ورود: {money(position.entryPrice)}</p></div><button disabled={busy} onClick={() => void command({ type: "close_position", positionId: position.id, reason: "manual" })} className="rounded-xl border border-rose-300/25 bg-rose-400/10 px-4 py-2 text-xs font-black">بستن</button></div><div className="mt-3 flex flex-wrap gap-2">{position.mentorFlags.map((flag) => <span key={flag} className="rounded-full bg-violet-400/10 px-3 py-1 text-[11px] font-black text-violet-200">{flag}</span>)}</div></div>)}</div></div><div className="rounded-[30px] border border-white/10 bg-slate-900/70 p-5"><h2 className="text-xl font-black">سفارش‌های معلق · {state.pendingOrders.length}</h2><div className="mt-4 space-y-3">{state.pendingOrders.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm font-bold text-slate-500">سفارش معلقی وجود ندارد.</p> : state.pendingOrders.map((order) => <div key={order.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4"><div><p className="font-black">{order.asset} · {money(order.quoteReserved)}</p><p className="text-xs text-slate-500">قیمت: {money(order.limitPrice)}</p></div><button disabled={busy} onClick={() => void command({ type: "cancel_order", orderId: order.id })} className="rounded-xl border border-amber-300/25 bg-amber-400/10 px-4 py-2 text-xs font-black">لغو</button></div>)}</div></div></div>
    </section>
  </div>;
}
