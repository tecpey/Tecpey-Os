"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Clock3, ExternalLink, Search, ShieldCheck } from "lucide-react";

type Locale="fa"|"en";
type Stage="plan"|"gather"|"synthesize"|"verify"|"report";
type Run={id:string;question:string;locale:Locale;requestedFreshness:string;state:string;degradedReason:string|null;createdAt:string;cancelledAt:string|null;completedAt:string|null};

const copy={
 fa:{
  eyebrow:"پژوهش عمیق تک‌پی",title:"از سؤال تا گزارشِ قابل بررسی",lead:"هر ادعای بیرونی باید به منبع متصل باشد؛ اختلاف شواهد و ناشناخته‌ها پنهان نمی‌شوند.",
  question:"سؤال پژوهش",placeholder:"مثلاً اثر یک رویداد بر بازار را با منابع مستقل بررسی کن…",start:"شروع پژوهش",
  stages:["برنامه","گردآوری","ترکیب","راستی‌آزمایی","گزارش"],truth:"قرارداد حقیقت منبع",
  truthText:"منابع، زمان بازیابی، تازگی و ارتباط هر استناد با ادعا حفظ می‌شود. محتوای شبکه‌های اجتماعی به‌تنهایی مرجع مستقل یک ادعای واقعی نیست.",
  evidence:"نمونه ساختار گزارش",known:"آنچه می‌دانیم",conflict:"شواهد متعارض",unknown:"ناشناخته‌ها",
  demoClaim:"گزارش نهایی ادعاهای قابل بررسی را کنار استناد مرتبط نمایش می‌دهد.",demoSource:"منبع نمونه",
  status:"وضعیت مرجع",statusText:"این نما authority تولید نمی‌کند؛ ایجاد و لغو پژوهش فقط از API احرازشده و tenant-bound انجام می‌شود.",
  freshness:"تازگی منبع",freshnessValue:"نمایش کنار هر منبع حساس به زمان",empty:"پژوهش جدید هنوز شروع نشده است.",history:"تاریخچه پژوهش",historyLoading:"در حال دریافت تاریخچه معتبر…",historyUnavailable:"تاریخچه پژوهش در دسترس نیست.",noHistory:"هنوز پژوهشی ثبت نشده است."
 },
 en:{
  eyebrow:"TecPey Deep Research",title:"From question to inspectable report",lead:"Every external factual claim must stay attached to evidence; conflicts and unknowns remain visible.",
  question:"Research question",placeholder:"For example, examine a market event using independent sources…",start:"Start research",
  stages:["Plan","Gather","Synthesize","Verify","Report"],truth:"Source truth contract",
  truthText:"Sources preserve retrieval time, freshness and claim-level citation links. Social evidence alone cannot satisfy an independent factual-source requirement.",
  evidence:"Report structure preview",known:"What is known",conflict:"Conflicting evidence",unknown:"Unknowns",
  demoClaim:"Final reports keep inspectable claims adjacent to their supporting citations.",demoSource:"Example source",
  status:"Authority status",statusText:"This view creates no authority; research creation and cancellation are authenticated, tenant-bound API operations.",
  freshness:"Source freshness",freshnessValue:"Shown beside time-sensitive evidence",empty:"No new research has been started yet.",history:"Research history",historyLoading:"Loading authoritative history…",historyUnavailable:"Research history is unavailable.",noHistory:"No research runs have been recorded yet."
 }
} as const;

export function DeepResearchWorkspace({locale}:{locale:Locale}){
 const t=copy[locale], isFa=locale==="fa";
 const [question,setQuestion]=useState("");
 const [stage]=useState<Stage>("plan");
 const [runs,setRuns]=useState<Run[]|null>(null);
 const [historyError,setHistoryError]=useState(false);
 const stages=useMemo(()=>["plan","gather","synthesize","verify","report"] as Stage[],[]);
 useEffect(()=>{
  const controller=new AbortController();
  setRuns(null); setHistoryError(false);
  fetch("/api/deep-research?limit=20",{cache:"no-store",signal:controller.signal})
   .then(async response=>{const body=await response.json().catch(()=>null);if(!response.ok||!body?.ok||!Array.isArray(body.runs))throw new Error("history_unavailable");return body.runs as Run[];})
   .then(value=>{if(!controller.signal.aborted)setRuns(value);})
   .catch(()=>{if(!controller.signal.aborted)setHistoryError(true);});
  return ()=>controller.abort();
 },[locale]);
 return <main className="min-h-screen bg-[color:var(--tp-bg)] text-[color:var(--tp-text)]" dir={isFa?"rtl":"ltr"}>
  <section className="px-4 py-10 sm:px-6 lg:px-8">
   <div className="mx-auto max-w-7xl">
    <header className="rounded-[36px] border border-cyan-300/15 bg-[#06111f] p-6 shadow-[0_30px_100px_rgba(34,211,238,.12)] sm:p-8 lg:p-10">
     <p className="text-sm font-black text-cyan-300">{t.eyebrow}</p>
     <h1 className="mt-3 max-w-4xl text-balance text-4xl font-black leading-tight text-white sm:text-5xl">{t.title}</h1>
     <p className="mt-4 max-w-3xl text-base font-bold leading-8 text-slate-300">{t.lead}</p>
     <ol className="mt-7 grid gap-2 sm:grid-cols-5" aria-label={isFa?"مراحل پژوهش":"Research stages"}>
      {stages.map((item,i)=><li key={item} aria-current={item===stage?"step":undefined} className={`min-h-11 rounded-2xl border px-3 py-3 text-center text-xs font-black ${item===stage?"border-cyan-300/60 bg-cyan-300/15 text-cyan-100":"border-white/10 bg-white/5 text-slate-400"}`}>{i+1}. {t.stages[i]}</li>)}
     </ol>
    </header>

    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
     <section className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.055]" aria-labelledby="research-question">
      <div className="flex items-center gap-3"><Search className="h-6 w-6 text-cyan-500" aria-hidden/><h2 id="research-question" className="text-xl font-black">{t.question}</h2></div>
      <label className="sr-only" htmlFor="deep-research-question">{t.question}</label>
      <textarea id="deep-research-question" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={12000} rows={6} placeholder={t.placeholder}
       className="mt-5 w-full resize-y rounded-2xl border border-slate-300 bg-transparent p-4 text-base font-semibold leading-7 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-white/15" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
       <span className="text-xs font-bold text-[color:var(--tp-muted)]" dir="ltr">{question.length.toLocaleString("en-US")} / 12,000</span>
       <button type="button" disabled className="min-h-11 rounded-2xl bg-cyan-800 px-5 py-3 text-sm font-black text-white opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed" aria-describedby="research-empty">{t.start}</button>
      </div>
      <p id="research-empty" className="mt-4 rounded-2xl border border-dashed border-cyan-300/25 bg-cyan-300/5 p-4 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{t.empty}</p>
     </section>

     <aside className="space-y-5">
      <section className="rounded-[30px] border border-cyan-300/20 bg-cyan-500/10 p-5">
       <ShieldCheck className="h-7 w-7 text-cyan-300" aria-hidden/><h2 className="mt-3 text-xl font-black text-white">{t.truth}</h2>
       <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{t.truthText}</p>
      </section>
      <section className="rounded-[30px] border border-slate-200 bg-white/90 p-5 dark:border-white/10 dark:bg-white/[0.055]">
       <Clock3 className="h-6 w-6 text-cyan-500" aria-hidden/><h2 className="mt-3 font-black">{t.freshness}</h2><p className="mt-2 text-sm font-bold text-[color:var(--tp-muted)]">{t.freshnessValue}</p>
      </section>
     </aside>
    </div>

    <section className="mt-6 rounded-[32px] border border-slate-200 bg-white/90 p-6 dark:border-white/10 dark:bg-white/[0.055]" aria-labelledby="research-history">
     <h2 id="research-history" className="text-xl font-black">{t.history}</h2>
     {historyError?<p role="status" className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold">{t.historyUnavailable}</p>
      :runs===null?<p role="status" className="mt-4 text-sm font-bold text-[color:var(--tp-muted)]">{t.historyLoading}</p>
      :runs.length===0?<p className="mt-4 text-sm font-bold text-[color:var(--tp-muted)]">{t.noHistory}</p>
      :<ul className="mt-4 grid gap-3">{runs.map(run=><li key={run.id} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
       <div className="flex flex-wrap items-start justify-between gap-3"><p className="max-w-3xl font-black leading-7">{run.question}</p><span className="rounded-full border border-cyan-300/25 px-3 py-1 text-xs font-black" dir="ltr">{run.state}</span></div>
       <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold text-[color:var(--tp-muted)]"><time dateTime={run.createdAt} dir="ltr">{new Date(run.createdAt).toLocaleString(isFa?"fa-IR":"en-US")}</time><span dir="ltr">{run.requestedFreshness}</span></div>
       {run.degradedReason?<p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs font-bold">{run.degradedReason}</p>:null}
      </li>)}</ul>}
    </section>

    <section className="mt-6 rounded-[32px] border border-slate-200 bg-white/90 p-6 dark:border-white/10 dark:bg-white/[0.055]" aria-labelledby="evidence-preview">
     <div className="flex items-center gap-3"><BookOpenCheck className="h-6 w-6 text-cyan-500" aria-hidden/><h2 id="evidence-preview" className="text-xl font-black">{t.evidence}</h2></div>
     <div className="mt-5 grid gap-4 md:grid-cols-3">
      {[t.known,t.conflict,t.unknown].map((label,i)=><article key={label} className="rounded-2xl border border-slate-200 p-5 dark:border-white/10">
       <h3 className="font-black">{label}</h3><p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{t.demoClaim}</p>
       {i===0?<a href="https://example.com" onClick={e=>e.preventDefault()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-400/30 px-3 py-2 text-sm font-black text-cyan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-cyan-300" aria-label={t.demoSource}>{t.demoSource}<ExternalLink className="h-4 w-4" aria-hidden/></a>:null}
      </article>)}
     </div>
    </section>

    <section className="mt-6 rounded-[28px] border border-emerald-300/20 bg-emerald-500/10 p-5" aria-live="polite">
     <h2 className="font-black text-emerald-700 dark:text-emerald-200">{t.status}</h2><p className="mt-2 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{t.statusText}</p>
    </section>
   </div>
  </section>
 </main>;
}
