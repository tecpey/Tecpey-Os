"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Clock3,
  FileClock,
  LoaderCircle,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Target,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  arenaUiError,
  parseArenaExecutionSnapshot,
  shouldApplyArenaSnapshot,
  type ArenaExecutionSnapshot,
} from "@/lib/trading-arena-client";
import type {
  ArenaClosedTradeV2,
  ArenaExecutionMentorFlag,
  ArenaOpenPositionV2,
  ArenaPendingOrderV2,
} from "@/lib/trading-arena-execution-v2";

const ENDPOINT = "/api/trading-arena/execution";

const FLAG_LABEL: Record<ArenaExecutionMentorFlag, string> = {
  "no-stop-loss": "بدون حد ضرر",
  "over-risk": "ریسک بالا",
  "impulse-entry": "ورود شتاب‌زده",
  "revenge-trade": "معامله انتقامی",
  "fomo-entry": "ورود FOMO",
  "good-discipline": "انضباط مناسب",
  "proper-sizing": "حجم مناسب",
  "target-hit": "هدف محقق شد",
};

function number(value: string | number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function usd(value: string | number): string {
  return `$${number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function percent(value: string | number): string {
  const parsed = number(value) * 100;
  return `${parsed >= 0 ? "+" : ""}${parsed.toLocaleString("fa-IR", { maximumFractionDigits: 2 })}٪`;
}

function faDateTime(value: string): string {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Flag({ flag }: { flag: ArenaExecutionMentorFlag }) {
  const positive = flag === "good-discipline" || flag === "proper-sizing" || flag === "target-hit";
  return <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${positive ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-amber-400/20 bg-amber-400/10 text-amber-300"}`}>{FLAG_LABEL[flag]}</span>;
}

function OpenEvidence({ position }: { position: ArenaOpenPositionV2 }) {
  return (
    <article className="rounded-[24px] border border-cyan-300/15 bg-cyan-400/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-black">{position.asset} · موقعیت باز</p><p className="mt-1 text-xs font-bold text-slate-500">{faDateTime(position.openedAt)} · ورود {usd(position.entryPrice)}</p></div>
        <span className="rounded-full border border-cyan-300/20 px-2.5 py-1 text-xs font-black text-cyan-300">{usd(position.quoteCommitted)} تعهد</span>
      </div>
      {position.preTradePlan ? <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 p-4"><p className="text-xs font-black text-slate-500">برنامه پیش از معامله</p><p className="mt-2 text-sm font-bold leading-7 text-slate-300">{position.preTradePlan}</p></div> : <p className="mt-4 text-xs font-bold text-slate-500">برای این موقعیت برنامه متنی ثبت نشده است.</p>}
      <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-black text-slate-400">حالت: {position.emotionalState || "ثبت نشده"}</span>{position.mentorFlags.map((flag) => <Flag key={flag} flag={flag} />)}</div>
    </article>
  );
}

function PendingEvidence({ order }: { order: ArenaPendingOrderV2 }) {
  return (
    <article className="rounded-[24px] border border-amber-400/20 bg-amber-400/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{order.asset} · سفارش محدود در انتظار</p><p className="mt-1 text-xs font-bold text-slate-500">{faDateTime(order.createdAt)} · هدف ورود {usd(order.limitPrice)}</p></div><Clock3 className="h-5 w-5 text-amber-300" /></div>
      <p className="mt-4 text-sm font-bold text-slate-300">وجه رزروشده: {usd(order.quoteReserved)}</p>
      {order.preTradePlan && <p className="mt-3 rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-sm font-bold leading-7 text-slate-300">برنامه: {order.preTradePlan}</p>}
    </article>
  );
}

function ClosedEvidence({ trade }: { trade: ArenaClosedTradeV2 }) {
  const pnl = number(trade.realizedPnl);
  const reason = trade.closureReason === "manual" ? "بستن دستی" : trade.closureReason === "stop-loss" ? "فعال‌شدن حد ضرر" : "فعال‌شدن حد سود";
  return (
    <article className="rounded-[24px] border border-white/10 bg-slate-900/65 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">{pnl >= 0 ? <ArrowUpRight className="mt-0.5 h-5 w-5 text-emerald-300" /> : <ArrowDownRight className="mt-0.5 h-5 w-5 text-red-300" />}<div><p className="font-black">{trade.asset} · {reason}</p><p className="mt-1 text-xs font-bold text-slate-500">{faDateTime(trade.openedAt)} تا {faDateTime(trade.closedAt)}</p></div></div>
        <div className="text-left"><p className={`font-black ${pnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>{pnl >= 0 ? "+" : "-"}{usd(Math.abs(pnl))}</p><p className="text-xs font-bold text-slate-500">{percent(trade.realizedPnlRate)}</p></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-slate-400 sm:grid-cols-4"><div className="rounded-xl bg-slate-950/40 p-3"><span className="block text-slate-600">ورود</span>{usd(trade.entryPrice)}</div><div className="rounded-xl bg-slate-950/40 p-3"><span className="block text-slate-600">خروج</span>{usd(trade.exitPrice)}</div><div className="rounded-xl bg-slate-950/40 p-3"><span className="block text-slate-600">تعهد</span>{usd(trade.quoteCommitted)}</div><div className="rounded-xl bg-slate-950/40 p-3"><span className="block text-slate-600">کارمزد</span>{usd(trade.totalFee)}</div></div>
      <div className="mt-4 flex flex-wrap gap-2">{trade.mentorFlags.length > 0 ? trade.mentorFlags.map((flag) => <Flag key={flag} flag={flag} />) : <span className="text-xs font-bold text-slate-600">برچسب رفتاری ثبت نشده است.</span>}</div>
    </article>
  );
}

export function JournalView() {
  const [snapshot, setSnapshot] = useState<ArenaExecutionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const snapshotRef = useRef<ArenaExecutionSnapshot | null>(null);
  const sequenceRef = useRef(0);
  const lastAppliedSequenceRef = useRef(0);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const responseSequence = ++sequenceRef.current;
    setLoading(true);
    try {
      const response = await fetch(ENDPOINT, { method: "GET", credentials: "include", cache: "no-store", headers: { Accept: "application/json" } });
      const body = await response.json().catch(() => ({})) as { error?: unknown };
      if (!response.ok) {
        if (!mountedRef.current) return;
        setError(arenaUiError(typeof body.error === "string" ? body.error : undefined, response.status));
        return;
      }
      const parsed = parseArenaExecutionSnapshot(body);
      if (!parsed) throw new Error("arena_snapshot_invalid");
      const decision = shouldApplyArenaSnapshot({ current: snapshotRef.current, incoming: parsed, responseSequence, lastAppliedSequence: lastAppliedSequenceRef.current });
      if (decision.apply && mountedRef.current) {
        lastAppliedSequenceRef.current = decision.nextSequence;
        snapshotRef.current = parsed;
        setSnapshot(parsed);
        setError(null);
      }
    } catch {
      if (mountedRef.current) setError(arenaUiError("arena_execution_unavailable"));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const closed = snapshot?.state.closedTrades ?? [];
    const wins = closed.filter((trade) => number(trade.realizedPnl) > 0).length;
    const riskFlags = closed.filter((trade) => trade.mentorFlags.some((flag) => ["over-risk", "revenge-trade", "fomo-entry", "impulse-entry"].includes(flag))).length;
    return { closed: closed.length, wins, riskFlags };
  }, [snapshot]);

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-black sm:text-3xl">ژورنال معاملاتی سروری</h1><ShieldCheck className="h-5 w-5 text-emerald-300" /></div><p className="mt-1 text-sm font-bold text-slate-400">شواهد اجرای آرنا از حساب و state معتبر PostgreSQL</p></div>
        <div className="flex gap-2"><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:text-white disabled:opacity-40"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> تازه‌سازی</button><Link href="/academy/trading-arena" className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-400 hover:text-white"><ChevronRight className="h-3 w-3 rotate-180" /> آرنا</Link></div>
      </header>

      <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/5 p-4"><div className="flex items-start gap-3"><ServerCog className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" /><div><p className="font-black text-cyan-100">این صفحه دیگر از حافظه مرورگر به‌عنوان منبع داده نمی‌خواند.</p><p className="mt-1 text-xs font-bold leading-6 text-slate-400">موقعیت‌ها، سفارش‌ها و معاملات بسته‌شده مستقیماً از Backend V2 بازیابی می‌شوند. ویرایش بازتاب پس از معامله در Phase B با API اختصاصی و cross-device اضافه می‌شود.</p></div></div></div>

      {error && <div className="flex items-start gap-3 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-bold text-red-200" role="alert"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {loading && !snapshot && <div className="flex min-h-[300px] items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-cyan-300" /></div>}

      {snapshot && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="خلاصه ژورنال"><div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center"><p className="text-xl font-black">{snapshot.state.openPositions.length}</p><p className="text-xs font-bold text-slate-500">موقعیت باز</p></div><div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center"><p className="text-xl font-black">{snapshot.state.pendingOrders.length}</p><p className="text-xs font-bold text-slate-500">سفارش در انتظار</p></div><div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-center"><p className="text-xl font-black text-emerald-300">{stats.closed ? Math.round((stats.wins / stats.closed) * 100) : 0}٪</p><p className="text-xs font-bold text-slate-500">نرخ برد بسته‌شده</p></div><div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-center"><p className="text-xl font-black text-amber-300">{stats.riskFlags}</p><p className="text-xs font-bold text-slate-500">معامله با هشدار رفتاری</p></div></section>

          {snapshot.state.openPositions.length > 0 && <section><div className="mb-3 flex items-center gap-2"><Target className="h-4 w-4 text-cyan-300" /><h2 className="text-xs font-black uppercase tracking-widest text-slate-500">برنامه‌های فعال</h2></div><div className="grid gap-4 lg:grid-cols-2">{snapshot.state.openPositions.map((position) => <OpenEvidence key={position.id} position={position} />)}</div></section>}

          {snapshot.state.pendingOrders.length > 0 && <section><div className="mb-3 flex items-center gap-2"><FileClock className="h-4 w-4 text-amber-300" /><h2 className="text-xs font-black uppercase tracking-widest text-slate-500">تصمیم‌های در انتظار اجرا</h2></div><div className="grid gap-4 lg:grid-cols-2">{snapshot.state.pendingOrders.map((order) => <PendingEvidence key={order.id} order={order} />)}</div></section>}

          <section><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-violet-300" /><h2 className="text-xs font-black uppercase tracking-widest text-slate-500">تاریخچه اجرای قطعی</h2></div><span className="text-xs font-black text-slate-600">{stats.closed} رکورد</span></div>{snapshot.state.closedTrades.length > 0 ? <div className="space-y-4">{snapshot.state.closedTrades.slice().reverse().map((trade) => <ClosedEvidence key={trade.id} trade={trade} />)}</div> : <div className="rounded-[24px] border border-dashed border-white/10 p-10 text-center"><BookOpen className="mx-auto h-8 w-8 text-slate-700" /><p className="mt-3 font-black text-slate-500">هنوز معامله بسته‌شده‌ای ثبت نشده است.</p><Link href="/academy/trading-arena" className="mt-4 inline-flex items-center gap-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-black text-slate-300">بازگشت به آرنا <ChevronRight className="h-4 w-4" /></Link></div>}</section>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4 text-[11px] font-bold text-slate-600"><span>Attempt #{snapshot.activeAttempt.attemptNumber} · revision {snapshot.revision}</span><span>آخرین state: {faDateTime(snapshot.state.updatedAt)}</span></footer>
        </>
      )}

      {!loading && !snapshot && <div className="rounded-[24px] border border-dashed border-white/10 p-10 text-center"><AlertTriangle className="mx-auto h-8 w-8 text-amber-300" /><p className="mt-3 font-black text-slate-400">ژورنال سروری بازیابی نشد.</p><button type="button" onClick={() => void load()} className="mt-4 rounded-xl bg-slate-800 px-4 py-2 text-sm font-black text-white">تلاش دوباره</button></div>}
    </div>
  );
}
