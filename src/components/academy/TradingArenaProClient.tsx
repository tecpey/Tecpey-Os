"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, Bot, CheckCircle2, Clock3, Loader2, NotebookPen, ShieldCheck, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import TradingViewChart from "@/components/TradingViewChart";

type Locale = "fa" | "en";
type Side = "buy" | "sell";
type OrderType = "market" | "limit" | "stop";
type Trade = {
  id: string;
  symbol: string;
  side: Side;
  orderType: OrderType;
  size: number;
  risk: number;
  entryReason: string;
  emotion: string;
  plan: string;
  mentorNote: string;
  at?: string;
  createdAt?: string;
  disciplineScore?: number;
  riskFlag?: boolean;
};

type ArenaSummary = {
  count: number;
  discipline: number;
  avgRisk: number;
  riskFlags: number;
  journalQuality: number;
  winRate: number;
  mentorSnapshot?: { nextAction?: string; warning?: string | null; strongestSignal?: string };
};

const symbols = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA"];
const emotionOptionsFa = ["آرام", "مردد", "هیجان‌زده", "ترسیده", "انتقام‌جو"];
const emotionOptionsEn = ["Calm", "Unsure", "Excited", "Fearful", "Revenge mode"];

function mentorReview(risk: number, emotion: string, isFa: boolean) {
  if (risk > 3) return isFa ? "ریسک این تصمیم بالاتر از استاندارد تمرینی است. قبل از ثبت، حجم معامله را کاهش بده یا حد ضرر را دقیق‌تر کن." : "Risk is above the training standard. Reduce size or define invalidation more clearly before submitting.";
  if (/انتقام|Revenge/i.test(emotion)) return isFa ? "نشانه‌های معامله انتقامی دیده می‌شود. ۱۰ دقیقه توقف، مرور ژورنال و سپس تصمیم مجدد پیشنهاد می‌شود." : "Revenge trading signals detected. Pause 10 minutes, review journal, then decide again.";
  if (risk <= 1) return isFa ? "ریسک کنترل‌شده است. حالا دلیل ورود، حد ابطال و سناریوی خروج را با دقت ثبت کن." : "Risk is controlled. Now document entry reason, invalidation and exit scenario clearly.";
  return isFa ? "تصمیم قابل بررسی است. منتور این معامله را با تمرکز روی انضباط ریسک و دلیل ورود ذخیره می‌کند." : "Decision is reviewable. Mentor stores it with focus on risk discipline and entry logic.";
}

export function TradingArenaProClient({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const [checked, setChecked] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [symbol, setSymbol] = useState("BTC");
  const [side, setSide] = useState<Side>("buy");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [risk, setRisk] = useState(2);
  const [size, setSize] = useState(1000);
  const [entryReason, setEntryReason] = useState("");
  const [emotion, setEmotion] = useState(isFa ? emotionOptionsFa[0] : emotionOptionsEn[0]);
  const [plan, setPlan] = useState("");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [summary, setSummary] = useState<ArenaSummary>({ count: 0, discipline: 0, avgRisk: 0, riskFlags: 0, journalQuality: 0, winRate: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/academy-student-profile", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const ready = Boolean(data?.profile?.display_name);
        const name = data?.profile?.display_name || "";
        setProfileReady(ready);
        setDisplayName(name);
      })
      .catch(() => setProfileReady(false))
      .finally(() => setChecked(true));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!profileReady) return;
    let active = true;
    fetch("/api/trading-arena", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!active || !data?.ok) return;
        if (Array.isArray(data.trades)) setTrades(data.trades.slice(0, 50));
        if (data.summary) setSummary(data.summary);
      })
      .catch(() => {
        try {
          const stored = JSON.parse(localStorage.getItem("tecpey-trading-arena-trades") || "[]");
          if (Array.isArray(stored)) setTrades(stored.slice(0, 30));
        } catch {}
      });
    return () => { active = false; };
  }, [profileReady]);

  useEffect(() => {
    try { localStorage.setItem("tecpey-trading-arena-trades", JSON.stringify(trades.slice(0, 30))); } catch {}
  }, [trades]);

  const mentorNote = useMemo(() => mentorReview(risk, emotion, isFa), [risk, emotion, isFa]);
  const winRate = summary.winRate || (trades.length ? Math.min(88, 48 + Math.round(trades.filter((t) => t.risk <= 2).length / trades.length * 30)) : 0);
  const discipline = summary.discipline || (trades.length ? Math.round(trades.reduce((sum, t) => sum + Math.max(0, 100 - t.risk * 18), 0) / trades.length) : 0);

  async function submitTrade() {
    if (!entryReason.trim() || !plan.trim() || saving) return;
    setSaving(true);
    const trade: Trade = {
      id: crypto.randomUUID(), symbol, side, orderType, size, risk, entryReason: entryReason.trim().slice(0, 420), emotion, plan: plan.trim().slice(0, 420), mentorNote, at: new Date().toISOString()
    };
    try {
      const response = await fetch("/api/trading-arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...trade, locale }),
      });
      const data = await response.json();
      if (data?.ok) {
        if (Array.isArray(data.trades)) setTrades(data.trades.slice(0, 50));
        else setTrades((items) => [data.trade || trade, ...items].slice(0, 50));
        if (data.summary) setSummary(data.summary);
        setEntryReason("");
        setPlan("");
        window.dispatchEvent(new Event("tecpey-academy-progress-updated"));
        return;
      }
      throw new Error(data?.error || "arena_save_failed");
    } catch {
      setTrades((items) => [trade, ...items].slice(0, 30));
      setEntryReason("");
      setPlan("");
    } finally {
      setSaving(false);
    }
  }

  if (!checked) {
    return <main className="min-h-screen bg-slate-950 p-8 text-white"><div className="mx-auto max-w-3xl rounded-[32px] border border-cyan-300/20 bg-white/5 p-8 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-300" /><p className="mt-4 font-black">{isFa ? "در حال آماده‌سازی اتاق معامله…" : "Preparing trading arena…"}</p></div></main>;
  }

  if (!profileReady) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-12 text-white" dir={isFa ? "rtl" : "ltr"}>
        <section className="mx-auto max-w-3xl rounded-[38px] border border-amber-300/25 bg-amber-400/10 p-8 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-amber-200" />
          <h1 className="mt-4 text-3xl font-black">{isFa ? "اتاق معامله بعد از ساخت پروفایل آکادمی فعال می‌شود" : "Trading arena unlocks after academy profile"}</h1>
          <p className="mt-4 text-sm font-bold leading-8 text-slate-200">{isFa ? "برای اینکه منتور بتواند تصمیم‌ها، ژورنال، ریسک و رفتار معاملاتی تو را تحلیل کند، اول باید هویت آکادمی ساخته شود." : "Create your academy identity first so the mentor can analyze decisions, journal, risk and trading behavior."}</p>
          <Link href={isFa ? "/academy/onboarding" : "/en/academy/onboarding"} className="mt-6 inline-flex rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-black text-white">{isFa ? "ساخت پروفایل آکادمی" : "Create academy profile"}</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.16),transparent_34%),#020617] px-4 py-8 text-white sm:px-6 lg:px-8" dir={isFa ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-[34px] border border-cyan-300/20 bg-white/[0.055] p-5 shadow-[0_26px_90px_rgba(34,211,238,.12)] lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100"><BarChart3 className="h-4 w-4" /> {isFa ? "TecPey Trading Arena" : "TecPey Trading Arena"}</div>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">{isFa ? `${displayName || "دانشجو"}، این اتاق تمرین واقعی توست` : `${displayName || "Student"}, this is your real practice room`}</h1>
              <p className="mt-3 max-w-4xl text-sm font-bold leading-8 text-slate-300">{isFa ? "چارت پیشرفته، کیف تمرینی، ژورنال تصمیم و نظارت منتور در یک محیط واحد. اینجا با پول واقعی معامله نمی‌کنی؛ رفتار تصمیم‌گیری و مدیریت ریسک خودت را می‌سنجی." : "Advanced chart, demo wallet, decision journal and mentor supervision in one room. No real money; measure decision behavior and risk discipline."}</p>
            </div>
            <div className="grid grid-cols-4 gap-2 rounded-[28px] border border-white/10 bg-slate-950/50 p-3 text-center">
              <div><p className="text-2xl font-black">$100K</p><p className="text-[11px] font-bold text-slate-400">{isFa ? "کیف تمرینی" : "Demo wallet"}</p></div>
              <div><p className="text-2xl font-black">{winRate}%</p><p className="text-[11px] font-bold text-slate-400">Win rate</p></div>
              <div><p className="text-2xl font-black">{discipline}</p><p className="text-[11px] font-bold text-slate-400">{isFa ? "انضباط" : "Discipline"}</p></div>
              <div><p className="text-2xl font-black">{summary.avgRisk || 0}%</p><p className="text-[11px] font-bold text-slate-400">{isFa ? "ریسک میانگین" : "Avg risk"}</p></div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="overflow-hidden rounded-[34px] border border-cyan-300/15 bg-slate-950 shadow-2xl shadow-black/30">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3">
              <div className="flex flex-wrap gap-2">
                {symbols.map((item) => <button key={item} onClick={() => setSymbol(item)} className={`rounded-2xl px-4 py-2 text-xs font-black transition ${symbol === item ? "bg-cyan-500 text-white" : "bg-white/5 text-slate-200 hover:bg-white/10"}`}>{item}/USDT</button>)}
              </div>
              <div className="flex items-center gap-2 text-xs font-black text-slate-300"><Clock3 className="h-4 w-4 text-cyan-300" /> {isFa ? "چارت پیشرفته با داده مارکت‌برد" : "Advanced chart with market-board data"}</div>
            </div>
            <div className="h-[650px]"><TradingViewChart symbol={symbol} /></div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-[34px] border border-white/10 bg-white/[0.06] p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-black">{isFa ? "ثبت تصمیم تمرینی" : "Practice order"}</h2>
                <WalletCards className="h-6 w-6 text-cyan-300" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(["buy", "sell"] as Side[]).map((item) => <button key={item} onClick={() => setSide(item)} className={`rounded-2xl px-4 py-3 text-sm font-black ${side === item ? (item === "buy" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white") : "bg-white/5 text-slate-200"}`}>{item === "buy" ? (isFa ? "خرید تمرینی" : "Demo buy") : (isFa ? "فروش تمرینی" : "Demo sell")}</button>)}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["market", "limit", "stop"] as OrderType[]).map((item) => <button key={item} onClick={() => setOrderType(item)} className={`rounded-2xl px-3 py-2 text-xs font-black ${orderType === item ? "bg-cyan-500 text-white" : "bg-white/5 text-slate-300"}`}>{item.toUpperCase()}</button>)}
              </div>
              <label className="mt-4 block text-xs font-black text-slate-300">{isFa ? "حجم تمرینی USDT" : "Demo size USDT"}</label>
              <input type="number" value={size} onChange={(e) => setSize(Math.max(10, Number(e.target.value || 0)))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold outline-none" />
              <label className="mt-4 block text-xs font-black text-slate-300">{isFa ? "ریسک روی سرمایه" : "Risk on equity"}: {risk}%</label>
              <input type="range" min="0.5" max="8" step="0.5" value={risk} onChange={(e) => setRisk(Number(e.target.value))} className="mt-3 w-full" />
              <label className="mt-4 block text-xs font-black text-slate-300">{isFa ? "حالت احساسی" : "Emotion state"}</label>
              <select value={emotion} onChange={(e) => setEmotion(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold outline-none">
                {(isFa ? emotionOptionsFa : emotionOptionsEn).map((item) => <option key={item}>{item}</option>)}
              </select>
              <label className="mt-4 block text-xs font-black text-slate-300">{isFa ? "چرا وارد این معامله می‌شوی؟" : "Why this entry?"}</label>
              <textarea value={entryReason} onChange={(e) => setEntryReason(e.target.value)} rows={3} className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold outline-none" placeholder={isFa ? "مثلاً شکست مقاومت، پولبک، واگرایی…" : "Breakout, pullback, divergence…"} />
              <label className="mt-4 block text-xs font-black text-slate-300">{isFa ? "برنامه ریسک و خروج" : "Risk and exit plan"}</label>
              <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={3} className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold outline-none" placeholder={isFa ? "حد ابطال، حد ضرر، برداشت سود…" : "Invalidation, stop loss, take profit…"} />
              <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-xs font-bold leading-6 text-cyan-50"><Bot className="mb-2 h-4 w-4 text-cyan-200" />{mentorNote}</div>
              <button onClick={submitTrade} disabled={saving || !entryReason.trim() || !plan.trim()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-cyan-500 to-violet-500 px-5 py-4 text-sm font-black text-white disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {isFa ? "ثبت در ژورنال و ارسال برای منتور" : "Save journal and send to mentor"}
              </button>
            </div>

            <div className="rounded-[34px] border border-white/10 bg-white/[0.06] p-5">
              <h3 className="text-lg font-black">{isFa ? "Order Book آموزشی" : "Educational order book"}</h3>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-black">
                <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="flex justify-between rounded-xl bg-rose-500/10 px-3 py-2 text-rose-200"><span>{(64200+i*22).toLocaleString()}</span><span>{(0.42+i/10).toFixed(2)}</span></div>)}</div>
                <div className="space-y-2">{[1,2,3,4,5].map((i) => <div key={i} className="flex justify-between rounded-xl bg-emerald-500/10 px-3 py-2 text-emerald-200"><span>{(64100-i*18).toLocaleString()}</span><span>{(0.35+i/12).toFixed(2)}</span></div>)}</div>
              </div>
              <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-[11px] font-bold leading-5 text-amber-100">{isFa ? "این دفتر سفارش برای تمرین رفتار بازار است و سفارش واقعی ثبت نمی‌کند." : "This order book trains market behavior and never places real orders."}</p>
            </div>
          </aside>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-[34px] border border-white/10 bg-white/[0.055] p-5">
            <div className="flex items-center justify-between"><h2 className="text-2xl font-black">{isFa ? "ژورنال معامله دانشجو" : "Student trade journal"}</h2><NotebookPen className="h-6 w-6 text-cyan-300" /></div>
            <div className="mt-5 space-y-3">
              {trades.length === 0 ? <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-6 text-center text-sm font-bold leading-7 text-slate-300">{isFa ? "هنوز معامله‌ای ثبت نکرده‌ای. اولین تصمیم تمرینی را با دلیل، احساس و برنامه ریسک ثبت کن." : "No trade yet. Save your first practice decision with reason, emotion and risk plan."}</div> : trades.map((trade) => (
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
            <h2 className="text-2xl font-black">{isFa ? "نظارت زنده منتور" : "Live mentor supervision"}</h2>
            <div className="mt-5 space-y-3">
              <div className="rounded-3xl border border-emerald-300/20 bg-emerald-400/10 p-4"><TrendingUp className="h-5 w-5 text-emerald-300" /><p className="mt-3 text-sm font-black">{isFa ? "قانون طلایی: هر تصمیم باید دلیل ورود و حد ابطال داشته باشد." : "Golden rule: every decision needs entry reason and invalidation."}</p></div>
              <div className="rounded-3xl border border-amber-300/20 bg-amber-400/10 p-4"><AlertTriangle className="h-5 w-5 text-amber-300" /><p className="mt-3 text-sm font-black">{isFa ? "ریسک بالاتر از ۳٪ به عنوان هشدار رفتاری ثبت می‌شود." : "Risk above 3% is saved as a behavior warning."}</p></div>
              <div className="rounded-3xl border border-rose-300/20 bg-rose-400/10 p-4"><TrendingDown className="h-5 w-5 text-rose-300" /><p className="mt-3 text-sm font-black">{isFa ? "بعد از چند ضرر متوالی، منتور الگوی معامله انتقامی را بررسی می‌کند." : "After repeated losses, mentor checks revenge trading patterns."}</p></div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
