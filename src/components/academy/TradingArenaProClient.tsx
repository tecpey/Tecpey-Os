"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  Loader2,
  NotebookPen,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import TradingViewChart from "@/components/TradingViewChart";
import {
  formatArenaBalance,
  type ArenaAccount,
  type ArenaAttempt,
  type ArenaDecision,
  type ArenaDecisionSummary,
} from "@/lib/trading-arena-account";

type Locale = "fa" | "en";
type Side = "buy" | "sell";
type OrderType = "market" | "limit" | "stop";
type ArenaLoadStatus = "idle" | "loading" | "ready" | "error";

type ArenaResponse = {
  ok?: boolean;
  error?: string;
  account?: ArenaAccount;
  attempts?: ArenaAttempt[];
  activeAttempt?: ArenaAttempt | null;
  trades?: ArenaDecision[];
  summary?: ArenaDecisionSummary;
  executionMode?: "decision_journal";
};

const EMPTY_SUMMARY: ArenaDecisionSummary = {
  count: 0,
  discipline: 0,
  avgRisk: 0,
  riskFlags: 0,
  journalQuality: 0,
  decisionReadiness: 0,
  realizedWinRate: null,
  mentorSnapshot: {
    strongestSignal: "insufficient_data",
    warning: null,
    nextAction: "record_first_decision",
  },
};

const symbols = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA"];
const emotionOptionsFa = ["آرام", "مردد", "هیجان‌زده", "ترسیده", "انتقام‌جو"];
const emotionOptionsEn = ["Calm", "Unsure", "Excited", "Fearful", "Revenge mode"];

function mentorReview(risk: number, emotion: string, isFa: boolean) {
  if (risk > 3) {
    return isFa
      ? "ریسک این تصمیم بالاتر از استاندارد تمرینی است. حجم یا حد ابطال را بازبینی کن."
      : "Risk is above the training standard. Review size or invalidation.";
  }
  if (/انتقام|Revenge/i.test(emotion)) {
    return isFa
      ? "نشانه‌های معامله انتقامی دیده می‌شود. ده دقیقه توقف و مرور ژورنال پیشنهاد می‌شود."
      : "Revenge-trading signals detected. Pause and review your journal.";
  }
  if (risk <= 1) {
    return isFa
      ? "ریسک کنترل‌شده است. دلیل ورود، حد ابطال و سناریوی خروج را دقیق ثبت کن."
      : "Risk is controlled. Document entry, invalidation and exit clearly.";
  }
  return isFa
    ? "این تصمیم برای بررسی منتور آماده است؛ انضباط ریسک و منطق ورود ارزیابی می‌شود."
    : "This decision is ready for Mentor review of risk discipline and entry logic.";
}

export function TradingArenaProClient({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const [checked, setChecked] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [loadStatus, setLoadStatus] = useState<ArenaLoadStatus>("idle");
  const [reloadToken, setReloadToken] = useState(0);
  const [account, setAccount] = useState<ArenaAccount | null>(null);
  const [attempts, setAttempts] = useState<ArenaAttempt[]>([]);
  const [activeAttempt, setActiveAttempt] = useState<ArenaAttempt | null>(null);
  const [trades, setTrades] = useState<ArenaDecision[]>([]);
  const [summary, setSummary] = useState<ArenaDecisionSummary>(EMPTY_SUMMARY);

  const [symbol, setSymbol] = useState("BTC");
  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [risk, setRisk] = useState(2);
  const [size, setSize] = useState(1_000);
  const [entryReason, setEntryReason] = useState("");
  const [emotion, setEmotion] = useState(isFa ? emotionOptionsFa[0] : emotionOptionsEn[0]);
  const [plan, setPlan] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/academy-student-profile", {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "profile_load_failed");
        if (controller.signal.aborted) return;
        setProfileReady(Boolean(data?.profile?.display_name));
        setDisplayName(data?.profile?.display_name || "");
      })
      .catch(() => {
        if (!controller.signal.aborted) setProfileReady(false);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecked(true);
      });
    return () => controller.abort();
  }, []);

  const applyArenaResponse = useCallback((data: ArenaResponse) => {
    if (data.account) setAccount(data.account);
    if (Array.isArray(data.attempts)) setAttempts(data.attempts);
    setActiveAttempt(data.activeAttempt ?? null);
    if (Array.isArray(data.trades)) setTrades(data.trades.slice(0, 100));
    if (data.summary) setSummary(data.summary);
  }, []);

  useEffect(() => {
    if (!profileReady) return;
    const controller = new AbortController();
    setLoadStatus("loading");
    setSaveError(null);

    void fetch("/api/trading-arena", {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as ArenaResponse;
        if (!response.ok || !data.ok || !data.account) {
          throw new Error(data.error || `arena_load_failed:${response.status}`);
        }
        if (controller.signal.aborted) return;
        applyArenaResponse(data);
        setLoadStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadStatus("error");
      });

    return () => controller.abort();
  }, [applyArenaResponse, profileReady, reloadToken]);

  const mentorNote = useMemo(() => mentorReview(risk, emotion, isFa), [risk, emotion, isFa]);

  async function submitTrade() {
    if (!entryReason.trim() || !plan.trim() || saving || loadStatus !== "ready") return;
    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/trading-arena", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          symbol,
          side,
          orderType,
          size,
          risk,
          entryReason: entryReason.trim().slice(0, 600),
          emotion,
          plan: plan.trim().slice(0, 600),
          locale,
        }),
      });
      const data = await response.json().catch(() => ({})) as ArenaResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error || `arena_save_failed:${response.status}`);
      }

      applyArenaResponse(data);
      setEntryReason("");
      setPlan("");
      window.dispatchEvent(new Event("tecpey-academy-progress-updated"));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "arena_save_failed");
    } finally {
      setSaving(false);
    }
  }

  if (!checked || (profileReady && loadStatus === "loading")) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white" dir={isFa ? "rtl" : "ltr"}>
        <div className="mx-auto max-w-3xl rounded-[32px] border border-cyan-300/20 bg-white/5 p-8 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" />
          <p className="mt-4 font-black">{isFa ? "در حال بازیابی حساب Arena از سرور…" : "Restoring your Arena account from the server…"}</p>
        </div>
      </main>
    );
  }

  if (!profileReady) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-12 text-white" dir={isFa ? "rtl" : "ltr"}>
        <section className="mx-auto max-w-3xl rounded-[38px] border border-amber-300/25 bg-amber-400/10 p-8 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-amber-200" />
          <h1 className="mt-4 text-3xl font-black">{isFa ? "Arena بعد از ساخت پروفایل آکادمی فعال می‌شود" : "Arena unlocks after your Academy profile"}</h1>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-200">
            {isFa ? "برای ذخیره کامل حساب، فرصت‌ها، ژورنال و حافظه منتور، ابتدا هویت آکادمی خود را بساز." : "Create your Academy identity so the platform can persist your account, attempts, journal and Mentor memory."}
          </p>
          <Link href={isFa ? "/academy/onboarding" : "/en/academy/onboarding"} className="mt-6 inline-flex rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-black text-white">
            {isFa ? "ساخت پروفایل آکادمی" : "Create Academy profile"}
          </Link>
        </section>
      </main>
    );
  }

  if (loadStatus === "error" || !account || !activeAttempt) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-12 text-white" dir={isFa ? "rtl" : "ltr"}>
        <section className="mx-auto max-w-3xl rounded-[38px] border border-rose-300/25 bg-rose-400/10 p-8 text-center" role="alert">
          <Database className="mx-auto h-12 w-12 text-rose-200" />
          <h1 className="mt-4 text-3xl font-black">{isFa ? "حساب Arena از سرور بازیابی نشد" : "Arena account could not be restored"}</h1>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-200">
            {isFa ? "برای حفاظت از تاریخچه تو، هیچ نسخه جعلی در مرورگر ساخته نشد. اتصال را بررسی و دوباره تلاش کن." : "To protect your history, no fake browser copy was created. Check connectivity and retry."}
          </p>
          <button type="button" onClick={() => setReloadToken((value) => value + 1)} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-rose-400/20 px-6 py-3 text-sm font-black text-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300">
            <RefreshCw className="h-4 w-4" /> {isFa ? "تلاش دوباره" : "Retry"}
          </button>
        </section>
      </main>
    );
  }

  const attemptsRemaining = account.attemptsRemaining;
  const accountBalance = formatArenaBalance(activeAttempt.cashBalance || account.availableBalance);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.16),transparent_34%),#020617] px-4 py-8 text-white sm:px-6 lg:px-8" dir={isFa ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-[34px] border border-cyan-300/20 bg-white/[0.055] p-5 shadow-[0_26px_90px_rgba(34,211,238,.12)] lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
                <Database className="h-4 w-4" /> {isFa ? "حساب Arena متصل به سرور" : "Server-backed Arena account"}
              </div>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">{isFa ? `${displayName || "دانشجو"}، اتاق تمرین تو آماده است` : `${displayName || "Student"}, your practice room is ready`}</h1>
              <p className="mt-3 max-w-4xl text-sm font-bold leading-8 text-slate-300">
                {isFa ? "سرمایه مجازی و سه فرصت این دوره در حساب تو ثبت شده‌اند. این صفحه فعلاً تصمیم و ژورنال را ثبت می‌کند؛ اجرای موقعیت و PnL در موتور معاملاتی server-side بعدی فعال می‌شود." : "Your virtual capital and three cycle attempts are stored in your account. This screen currently records decisions and journal entries; server-side position execution and PnL follow in the next engine slice."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-[28px] border border-white/10 bg-slate-950/50 p-3 text-center sm:grid-cols-4">
              <div><p className="text-2xl font-black">${accountBalance}</p><p className="text-[11px] font-bold text-slate-400">{isFa ? "سرمایه مجازی" : "Virtual capital"}</p></div>
              <div><p className="text-2xl font-black">{attemptsRemaining}/{account.attemptsTotal}</p><p className="text-[11px] font-bold text-slate-400">{isFa ? "فرصت باقی‌مانده" : "Attempts left"}</p></div>
              <div><p className="text-2xl font-black">{summary.decisionReadiness}</p><p className="text-[11px] font-bold text-slate-400">{isFa ? "آمادگی تصمیم" : "Decision readiness"}</p></div>
              <div><p className="text-2xl font-black">{summary.discipline}</p><p className="text-[11px] font-bold text-slate-400">{isFa ? "انضباط" : "Discipline"}</p></div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-300">
            {attempts.map((attempt) => (
              <span key={attempt.id} className={`rounded-full border px-3 py-1.5 ${attempt.status === "active" ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/5"}`}>
                {isFa ? `فرصت ${attempt.attemptNumber}` : `Attempt ${attempt.attemptNumber}`} · {attempt.status}
              </span>
            ))}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="overflow-hidden rounded-[34px] border border-cyan-300/15 bg-slate-950 shadow-2xl shadow-black/30">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3">
              <div className="flex flex-wrap gap-2">
                {symbols.map((item) => (
                  <button key={item} type="button" onClick={() => setSymbol(item)} className={`rounded-2xl px-4 py-2 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-cyan-400 ${symbol === item ? "bg-cyan-500 text-white" : "bg-white/5 text-slate-200 hover:bg-white/10"}`}>
                    {item}/USDT
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs font-black text-slate-300"><Clock3 className="h-4 w-4 text-cyan-300" /> {isFa ? "چارت آموزشی مارکت" : "Educational market chart"}</div>
            </div>
            <div className="h-[650px]"><TradingViewChart symbol={symbol} /></div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-[34px] border border-white/10 bg-white/[0.06] p-5">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black">{isFa ? "ثبت تصمیم تمرینی" : "Record practice decision"}</h2><WalletCards className="h-6 w-6 text-cyan-300" /></div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["buy", "sell"] as Side[]).map((item) => <button type="button" key={item} onClick={() => setSide(item)} className={`rounded-2xl px-4 py-3 text-sm font-black focus:outline-none focus:ring-2 focus:ring-cyan-400 ${side === item ? (item === "buy" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white") : "bg-white/5 text-slate-200"}`}>{item === "buy" ? (isFa ? "خرید تمرینی" : "Demo buy") : (isFa ? "فروش تمرینی" : "Demo sell")}</button>)}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["market", "limit", "stop"] as OrderType[]).map((item) => <button type="button" key={item} onClick={() => setOrderType(item)} className={`rounded-2xl px-3 py-2 text-xs font-black focus:outline-none focus:ring-2 focus:ring-cyan-400 ${orderType === item ? "bg-cyan-500 text-white" : "bg-white/5 text-slate-300"}`}>{item.toUpperCase()}</button>)}
              </div>
              <label className="mt-4 block text-xs font-black text-slate-300">{isFa ? "حجم تصمیم USDT" : "Decision size USDT"}</label>
              <input type="number" min={10} max={Number(activeAttempt.cashBalance)} value={size} onChange={(event) => setSize(Math.max(10, Number(event.target.value || 0)))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold outline-none focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/20" />
              <label className="mt-4 block text-xs font-black text-slate-300">{isFa ? "ریسک روی سرمایه" : "Risk on equity"}: {risk}%</label>
              <input type="range" min="0.5" max="8" step="0.5" value={risk} onChange={(event) => setRisk(Number(event.target.value))} className="mt-3 w-full" />
              <label className="mt-4 block text-xs font-black text-slate-300">{isFa ? "حالت احساسی" : "Emotion state"}</label>
              <select value={emotion} onChange={(event) => setEmotion(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold outline-none focus:border-cyan-300/50">
                {(isFa ? emotionOptionsFa : emotionOptionsEn).map((item) => <option key={item}>{item}</option>)}
              </select>
              <label className="mt-4 block text-xs font-black text-slate-300">{isFa ? "چرا این تصمیم را می‌گیری؟" : "Why this decision?"}</label>
              <textarea value={entryReason} onChange={(event) => setEntryReason(event.target.value)} rows={3} maxLength={600} className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold outline-none focus:border-cyan-300/50" placeholder={isFa ? "ساختار بازار، نقطه ابطال و شواهد ورود…" : "Market structure, invalidation and entry evidence…"} />
              <label className="mt-4 block text-xs font-black text-slate-300">{isFa ? "برنامه ریسک و خروج" : "Risk and exit plan"}</label>
              <textarea value={plan} onChange={(event) => setPlan(event.target.value)} rows={3} maxLength={600} className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold outline-none focus:border-cyan-300/50" placeholder={isFa ? "حد ابطال، حد ضرر و سناریوی خروج…" : "Invalidation, stop loss and exit scenario…"} />
              <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-xs font-bold leading-6 text-cyan-50"><Bot className="mb-2 h-4 w-4 text-cyan-200" />{mentorNote}</div>
              {saveError && (
                <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-400/10 p-3 text-xs font-bold leading-6 text-rose-100" role="alert">
                  {isFa ? "ثبت روی سرور انجام نشد؛ نوشته‌های فرم حفظ شده‌اند. دوباره تلاش کن." : "Server save failed; your form was preserved. Retry when ready."}
                </div>
              )}
              <button type="button" onClick={submitTrade} disabled={saving || !entryReason.trim() || !plan.trim()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-cyan-500 to-violet-500 px-5 py-4 text-sm font-black text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cyan-300">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {isFa ? "ثبت امن در حساب و ارسال برای منتور" : "Save to account and send to Mentor"}
              </button>
            </div>

            <div className="rounded-[34px] border border-white/10 bg-white/[0.06] p-5">
              <h3 className="text-lg font-black">{isFa ? "Order Book آموزشی" : "Educational order book"}</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-black">
                <div className="space-y-2">{[1, 2, 3, 4, 5].map((index) => <div key={index} className="flex justify-between rounded-xl bg-rose-500/10 px-3 py-2 text-rose-200"><span>{(64200 + index * 22).toLocaleString()}</span><span>{(0.42 + index / 10).toFixed(2)}</span></div>)}</div>
                <div className="space-y-2">{[1, 2, 3, 4, 5].map((index) => <div key={index} className="flex justify-between rounded-xl bg-emerald-500/10 px-3 py-2 text-emerald-200"><span>{(64100 - index * 18).toLocaleString()}</span><span>{(0.35 + index / 12).toFixed(2)}</span></div>)}</div>
              </div>
              <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-[11px] font-bold leading-5 text-amber-100">{isFa ? "این دفتر سفارش نمای آموزشی است و هنوز موقعیت یا PnL واقعی شبیه‌ساز ایجاد نمی‌کند." : "This is an educational view and does not yet create a simulated position or realized PnL."}</p>
            </div>
          </aside>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-[34px] border border-white/10 bg-white/[0.055] p-5">
            <div className="flex items-center justify-between"><h2 className="text-2xl font-black">{isFa ? "ژورنال تصمیم‌های دانشجو" : "Student decision journal"}</h2><NotebookPen className="h-6 w-6 text-cyan-300" /></div>
            <div className="mt-5 space-y-3">
              {trades.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-6 text-center text-sm font-bold leading-7 text-slate-300">{isFa ? "هنوز تصمیمی ثبت نشده. اولین سناریو را با دلیل، احساس و برنامه ریسک ثبت کن." : "No decision yet. Record the first scenario with reason, emotion and risk plan."}</div>
              ) : trades.map((trade) => (
                <article key={trade.id} className="rounded-3xl border border-white/10 bg-slate-950/45 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-lg font-black">{trade.symbol}/USDT · {trade.side.toUpperCase()} · {trade.orderType.toUpperCase()}</p><span className={`rounded-full px-3 py-1 text-xs font-black ${trade.risk <= 2 ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-100"}`}>{trade.risk}% Risk</span></div>
                  <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{trade.entryReason}</p>
                  <p className="mt-2 text-xs font-bold leading-6 text-slate-400">{isFa ? "برنامه:" : "Plan:"} {trade.plan}</p>
                  <p className="mt-2 rounded-2xl bg-cyan-400/10 p-3 text-xs font-bold leading-6 text-cyan-100">{trade.mentorNote}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="rounded-[34px] border border-white/10 bg-white/[0.055] p-5">
            <h2 className="text-2xl font-black">{isFa ? "نظارت زنده منتور" : "Live Mentor supervision"}</h2>
            <div className="mt-5 space-y-3">
              <div className="rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-4"><TrendingUp className="h-5 w-5 text-emerald-300" /><p className="mt-3 text-sm font-black">{isFa ? `کیفیت ژورنال فعلی: ${summary.journalQuality} از ۱۰۰` : `Current journal quality: ${summary.journalQuality}/100`}</p></div>
              <div className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-4"><AlertTriangle className="h-5 w-5 text-amber-300" /><p className="mt-3 text-sm font-black">{isFa ? `${summary.riskFlags} هشدار رفتاری در ${summary.count} تصمیم ثبت شده است.` : `${summary.riskFlags} behavior warnings across ${summary.count} decisions.`}</p></div>
              <div className="rounded-3xl border border-rose-300/20 bg-rose-400/10 p-4"><TrendingDown className="h-5 w-5 text-rose-300" /><p className="mt-3 text-sm font-black">{isFa ? "Win rate تا زمان ثبت معاملات بسته‌شده و PnL واقعی نمایش داده نمی‌شود." : "Win rate remains unavailable until closed simulated trades and realized PnL exist."}</p></div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
