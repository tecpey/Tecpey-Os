"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Clock3, ExternalLink, Search, ShieldCheck, XCircle } from "lucide-react";

type Locale="fa"|"en";
type Stage="plan"|"gather"|"synthesize"|"verify"|"report";
type Freshness="current"|"day"|"week"|"month"|"historical";
type Run={id:string;question:string;locale:Locale;requestedFreshness:Freshness;state:string;degradedReason:string|null;createdAt:string;cancelledAt:string|null;completedAt:string|null};
type HistoryState={locale:Locale;runs:Run[]|null;error:boolean};
type Source={id:string;url:string;publisher:string|null;domain:string|null;title:string|null;retrievedAt:string;publishedAt:string|null;locale:string|null;sourceChannel:"public_web"|"connected_private"|"social_x"|"other"};
type Claim={id:string;reportSection:string;normalizedText:string;claimType:"externally_factual"|"synthesis"|"opinion"|"unresolved";freshnessClass:"live"|"day"|"week"|"month"|"historical"|"not_applicable";confidenceRationale:string|null;sourceIds:string[]};
type Conflict={id:string;summary:string;resolutionState:"unresolved"|"partially_resolved"|"resolved";claimIds:string[]};
type Artifact={id:string;runId:string;version:number;status:"draft"|"final";report:Record<string,unknown>;sourceCount:number;citedSourceCount:number;finalizedAt:string|null;createdAt:string;sources:Source[];claims:Claim[];conflicts:Conflict[]};

const stageForState=(state:string):Stage =>
 state==="gathering"?"gather":state==="synthesizing"?"synthesize":state==="verifying"?"verify":
 state==="reporting"||state==="completed"?"report":"plan";
const cancellable=(state:string)=>["planned","gathering","synthesizing","verifying","reporting"].includes(state);

const copy={
 fa:{
  eyebrow:"پژوهش عمیق تک‌پی",title:"از سؤال تا گزارشِ قابل بررسی",lead:"هر ادعای بیرونی باید به منبع متصل باشد؛ اختلاف شواهد و ناشناخته‌ها پنهان نمی‌شوند.",
  question:"سؤال پژوهش",placeholder:"مثلاً اثر یک رویداد بر بازار را با منابع مستقل بررسی کن…",start:"شروع پژوهش",starting:"در حال ایجاد پژوهش…",cancel:"لغو پژوهش",cancelling:"در حال لغو…",
  stages:["برنامه","گردآوری","ترکیب","راستی‌آزمایی","گزارش"],truth:"قرارداد حقیقت منبع",
  truthText:"منابع، زمان بازیابی، تازگی و ارتباط هر استناد با ادعا حفظ می‌شود. محتوای شبکه‌های اجتماعی به‌تنهایی مرجع مستقل یک ادعای واقعی نیست.",
  evidence:"ساختار گزارش",known:"آنچه می‌دانیم",conflict:"شواهد متعارض",unknown:"ناشناخته‌ها",demoClaim:"گزارش نهایی ادعاهای قابل بررسی را کنار استناد مرتبط نمایش می‌دهد.",demoSource:"منبع نمونه",
  status:"وضعیت مرجع",statusText:"ایجاد و لغو پژوهش فقط از API احرازشده و tenant-bound انجام می‌شود.",freshness:"بازه تازگی",empty:"پژوهش جدید هنوز شروع نشده است.",
  history:"تاریخچه پژوهش",historyLoading:"در حال دریافت تاریخچه معتبر…",historyUnavailable:"تاریخچه پژوهش در دسترس نیست.",noHistory:"هنوز پژوهشی ثبت نشده است.",
  created:"پژوهش با موفقیت ثبت شد.",cancelled:"پژوهش لغو شد.",retry:"تلاش دوباره",openReport:"مشاهده گزارش",reportLoading:"در حال دریافت گزارش معتبر…",reportUnavailable:"گزارش معتبر در دسترس نیست.",noArtifact:"برای این اجرا هنوز گزارش ثبت نشده است.",sources:"منابع",consulted:"منابع بررسی‌شده",cited:"منابع استنادشده",retrieved:"بازیابی",confidence:"منطق اطمینان",closeReport:"بستن گزارش",sourcePublished:"انتشار",sourceChannel:"نوع منبع",sourceChannels:{public_web:"وب عمومی",connected_private:"منبع خصوصی متصل",social_x:"روایت اجتماعی / X",other:"سایر"},unsafeSource:"نشانی منبع قابل بازکردن نیست",noClaims:"هنوز ادعایی در این گزارش ثبت نشده است.",noConflicts:"تعارض ثبت‌شده‌ای وجود ندارد.",unknownClaims:"ناشناخته‌ها و موارد حل‌نشده",noUnknowns:"مورد حل‌نشده‌ای ثبت نشده است.",claimTypes:{externally_factual:"ادعای واقعی",synthesis:"ترکیب و تحلیل",opinion:"دیدگاه",unresolved:"حل‌نشده"},resolutionStates:{unresolved:"حل‌نشده",partially_resolved:"تا حدی حل‌شده",resolved:"حل‌شده"},freshnessClasses:{live:"زنده",day:"روز",week:"هفته",month:"ماه",historical:"تاریخی",not_applicable:"نامرتبط"},freshnessOptions:{current:"اکنون / تازه‌ترین",day:"۲۴ ساعت",week:"۷ روز",month:"۳۰ روز",historical:"تاریخی"},errors:{deep_research_pro_entitlement_required:"این قابلیت به دسترسی Pro معتبر نیاز دارد.",deep_research_entitlement_authority_unavailable:"مرجع اشتراک موقتاً در دسترس نیست.",deep_research_authority_unavailable:"مرجع امنیتی پژوهش موقتاً در دسترس نیست.",forbidden:"مجوز این عملیات تأیید نشد.",unauthorized:"برای ادامه دوباره وارد حساب شوید.",default:"عملیات انجام نشد. دوباره تلاش کنید."}
 },
 en:{
  eyebrow:"TecPey Deep Research",title:"From question to inspectable report",lead:"Every external factual claim must stay attached to evidence; conflicts and unknowns remain visible.",
  question:"Research question",placeholder:"For example, examine a market event using independent sources…",start:"Start research",starting:"Creating research…",cancel:"Cancel research",cancelling:"Cancelling…",
  stages:["Plan","Gather","Synthesize","Verify","Report"],truth:"Source truth contract",
  truthText:"Sources preserve retrieval time, freshness and claim-level citation links. Social evidence alone cannot satisfy an independent factual-source requirement.",
  evidence:"Report structure",known:"What is known",conflict:"Conflicting evidence",unknown:"Unknowns",demoClaim:"Final reports keep inspectable claims adjacent to their supporting citations.",demoSource:"Example source",
  status:"Authority status",statusText:"Research creation and cancellation are authenticated, tenant-bound API operations.",freshness:"Freshness window",empty:"No new research has been started yet.",
  history:"Research history",historyLoading:"Loading authoritative history…",historyUnavailable:"Research history is unavailable.",noHistory:"No research runs have been recorded yet.",
  created:"Research run created.",cancelled:"Research run cancelled.",retry:"Retry",openReport:"View report",reportLoading:"Loading authoritative report…",reportUnavailable:"The authoritative report is unavailable.",noArtifact:"No report artifact has been recorded for this run yet.",sources:"Sources",consulted:"Sources consulted",cited:"Sources cited",retrieved:"Retrieved",confidence:"Confidence rationale",closeReport:"Close report",sourcePublished:"Published",sourceChannel:"Source type",sourceChannels:{public_web:"Public web",connected_private:"Connected private source",social_x:"Social narrative / X",other:"Other"},unsafeSource:"Source URL cannot be opened safely",noClaims:"No claims have been recorded in this report yet.",noConflicts:"No evidence conflicts are recorded.",unknownClaims:"Unknowns and unresolved items",noUnknowns:"No unresolved items are recorded.",claimTypes:{externally_factual:"Factual claim",synthesis:"Synthesis",opinion:"Opinion",unresolved:"Unresolved"},resolutionStates:{unresolved:"Unresolved",partially_resolved:"Partially resolved",resolved:"Resolved"},freshnessClasses:{live:"Live",day:"Day",week:"Week",month:"Month",historical:"Historical",not_applicable:"Not applicable"},freshnessOptions:{current:"Current / latest",day:"24 hours",week:"7 days",month:"30 days",historical:"Historical"},errors:{deep_research_pro_entitlement_required:"A valid Pro entitlement is required for this capability.",deep_research_entitlement_authority_unavailable:"Subscription authority is temporarily unavailable.",deep_research_authority_unavailable:"Research security authority is temporarily unavailable.",forbidden:"This operation was not authorized.",unauthorized:"Sign in again to continue.",default:"The operation could not be completed. Please retry."}
 }
} as const;

function idempotencyKey(prefix:string){return `${prefix}-${crypto.randomUUID()}`;}

function safeExternalSourceUrl(value:string):string|null {
 try {
  const url=new URL(value);
  return url.protocol==="https:" || url.protocol==="http:" ? url.href : null;
 } catch {
  return null;
 }
}
function AuthoritativeReport({locale,state,onClose}:{locale:Locale;state:{runId:string|null;artifact:Artifact|null;loading:boolean;error:boolean};onClose:()=>void}){
 const t=copy[locale],isFa=locale==="fa";
 const artifact=state.artifact;
 if(state.loading)return <section className="mt-6 rounded-[32px] border border-slate-200 bg-white/90 p-6 dark:border-white/10 dark:bg-white/[0.055]" aria-labelledby="authoritative-report"><ReportHeader title={t.evidence} close={t.closeReport} onClose={onClose}/><p role="status" className="mt-4">{t.reportLoading}</p></section>;
 if(state.error)return <section className="mt-6 rounded-[32px] border border-slate-200 bg-white/90 p-6 dark:border-white/10 dark:bg-white/[0.055]" aria-labelledby="authoritative-report"><ReportHeader title={t.evidence} close={t.closeReport} onClose={onClose}/><p role="alert" className="mt-4 rounded-2xl border border-rose-300/30 bg-rose-300/10 p-4 font-bold">{t.reportUnavailable}</p></section>;
 if(!artifact)return <section className="mt-6 rounded-[32px] border border-slate-200 bg-white/90 p-6 dark:border-white/10 dark:bg-white/[0.055]" aria-labelledby="authoritative-report"><ReportHeader title={t.evidence} close={t.closeReport} onClose={onClose}/><p role="status" className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 font-bold">{t.noArtifact}</p></section>;
 const unresolvedClaims=artifact.claims.filter(claim=>claim.claimType==="unresolved");
 const substantiveClaims=artifact.claims.filter(claim=>claim.claimType!=="unresolved");
 return <section className="mt-6 rounded-[32px] border border-slate-200 bg-white/90 p-6 dark:border-white/10 dark:bg-white/[0.055]" aria-labelledby="authoritative-report">
  <ReportHeader title={t.evidence} close={t.closeReport} onClose={onClose}/>
  <div className="mt-5 space-y-5">
   <div className="flex flex-wrap gap-3 text-xs font-black"><span className="rounded-full border px-3 py-2" dir="ltr">{artifact.status} · v{artifact.version}</span><span className="rounded-full border px-3 py-2">{t.consulted}: {artifact.sourceCount}</span><span className="rounded-full border px-3 py-2">{t.cited}: {artifact.citedSourceCount}</span></div>
   {substantiveClaims.length?<div className="grid gap-4">{substantiveClaims.map(claim=><article key={claim.id} className="rounded-2xl border border-slate-200 p-5 dark:border-white/10"><div className="flex flex-wrap gap-2 text-xs font-black"><span className="rounded-full border px-2 py-1">{t.claimTypes[claim.claimType]}</span><span className="rounded-full border px-2 py-1">{t.freshnessClasses[claim.freshnessClass]}</span></div><p className="mt-3 font-bold leading-8">{claim.normalizedText}</p>{claim.confidenceRationale?<p className="mt-3 text-sm text-[color:var(--tp-muted)]"><strong>{t.confidence}: </strong>{claim.confidenceRationale}</p>:null}<div className="mt-4 flex flex-wrap gap-2">{claim.sourceIds.map(sourceId=>{const source=artifact.sources.find(item=>item.id===sourceId);if(!source)return null;const safeUrl=safeExternalSourceUrl(source.url);const meta=<><span>{source.title||source.publisher||source.domain||t.sources}</span><span className="rounded-full border px-2 py-1 text-xs">{t.sourceChannels[source.sourceChannel]}</span><span className="text-xs font-bold text-[color:var(--tp-muted)]">{t.retrieved}: <time dateTime={source.retrievedAt}>{new Date(source.retrievedAt).toLocaleString(isFa?"fa-IR":"en-US")}</time>{source.publishedAt?<> · {t.sourcePublished}: <time dateTime={source.publishedAt}>{new Date(source.publishedAt).toLocaleString(isFa?"fa-IR":"en-US")}</time></>:null}</span></>;return safeUrl?<a key={sourceId} href={safeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-cyan-400/30 px-3 py-2 text-sm font-black text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-cyan-300">{meta}<ExternalLink className="h-4 w-4" aria-hidden/></a>:<span key={sourceId} role="note" title={t.unsafeSource} className="inline-flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-black">{meta}<span className="sr-only">{t.unsafeSource}</span></span>;})}</div></article>)}</div>:<p className="rounded-2xl border p-4 text-sm font-bold text-[color:var(--tp-muted)]">{t.noClaims}</p>}
   <section><h3 className="font-black">{t.unknownClaims}</h3>{unresolvedClaims.length?<div className="mt-3 grid gap-3">{unresolvedClaims.map(claim=><article key={claim.id} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10"><span className="text-xs font-black">{t.freshnessClasses[claim.freshnessClass]}</span><p className="mt-2 font-bold">{claim.normalizedText}</p>{claim.confidenceRationale?<p className="mt-2 text-sm text-[color:var(--tp-muted)]">{claim.confidenceRationale}</p>:null}</article>)}</div>:<p className="mt-3 text-sm font-bold text-[color:var(--tp-muted)]">{t.noUnknowns}</p>}</section>
   <section><h3 className="font-black">{t.conflict}</h3>{artifact.conflicts.length?<div className="mt-3 grid gap-3">{artifact.conflicts.map(conflict=><article key={conflict.id} className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4"><div className="text-xs font-black">{t.resolutionStates[conflict.resolutionState]}</div><p className="mt-2 font-bold">{conflict.summary}</p></article>)}</div>:<p className="mt-3 text-sm font-bold text-[color:var(--tp-muted)]">{t.noConflicts}</p>}</section>
  </div>
 </section>;
}
function ReportHeader({title,close,onClose}:{title:string;close:string;onClose:()=>void}){
 return <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="authoritative-report" className="text-xl font-black">{title}</h2><button type="button" onClick={onClose} className="min-h-11 rounded-xl border px-4 font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">{close}</button></div>;
}

export function DeepResearchWorkspace({locale}:{locale:Locale}){
 const t=copy[locale],isFa=locale==="fa";
 const [question,setQuestion]=useState("");
 const [freshness,setFreshness]=useState<Freshness>("current");
 const [history,setHistory]=useState<HistoryState>({locale,runs:null,error:false});
 const [busy,setBusy]=useState<string|null>(null);
 const [notice,setNotice]=useState<{kind:"ok"|"error";text:string}|null>(null);
 const [artifactState,setArtifactState]=useState<{runId:string|null;artifact:Artifact|null;loading:boolean;error:boolean}>({runId:null,artifact:null,loading:false,error:false});
 const runs=history.locale===locale?history.runs:null;
 const historyError=history.locale===locale?history.error:false;
 const stages=useMemo(()=>["plan","gather","synthesize","verify","report"] as Stage[],[]);
 const activeRun=runs?.find(run=>cancellable(run.state))??null;
 const stage=activeRun?stageForState(activeRun.state):"plan";

 const loadHistory=useCallback(async(signal?:AbortSignal)=>{
  try{
   const response=await fetch("/api/deep-research?limit=20",{cache:"no-store",signal});
   const body=await response.json().catch(()=>null);
   if(!response.ok||!body?.ok||!Array.isArray(body.runs))throw new Error("history_unavailable");
   if(!signal?.aborted)setHistory({locale,runs:body.runs as Run[],error:false});
  }catch(error){
   if(!signal?.aborted && !(error instanceof DOMException&&error.name==="AbortError"))setHistory({locale,runs:null,error:true});
  }
 },[locale]);

 useEffect(()=>{
  const controller=new AbortController();
  const timer=window.setTimeout(()=>{void loadHistory(controller.signal);},0);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[loadHistory]);

 const errorText=(body:unknown)=>{
  const code=body&&typeof body==="object"&&"error" in body?String((body as {error?:unknown}).error??""):"";
  return (t.errors as Record<string,string>)[code]??t.errors.default;
 };

 async function startResearch(){
  const normalized=question.trim();
  if(!normalized||busy)return;
  setBusy("create");setNotice(null);
  try{
   const response=await fetch("/api/deep-research",{method:"POST",cache:"no-store",headers:{"content-type":"application/json","idempotency-key":idempotencyKey("research-create")},body:JSON.stringify({question:normalized,locale,requestedFreshness:freshness})});
   const body=await response.json().catch(()=>null);
   if(!response.ok||!body?.ok){setNotice({kind:"error",text:errorText(body)});return;}
   setQuestion("");setNotice({kind:"ok",text:t.created});await loadHistory();
  }catch{setNotice({kind:"error",text:t.errors.default});}
  finally{setBusy(null);}
 }

 async function loadArtifact(runId:string){
  if(artifactState.loading)return;
  setArtifactState({runId,artifact:null,loading:true,error:false});
  try{
   const response=await fetch(`/api/deep-research?runId=${encodeURIComponent(runId)}`,{cache:"no-store"});
   const body=await response.json().catch(()=>null);
   if(!response.ok||!body?.ok){setArtifactState({runId,artifact:null,loading:false,error:true});return;}
   setArtifactState({runId,artifact:(body.artifact??null) as Artifact|null,loading:false,error:false});
  }catch{setArtifactState({runId,artifact:null,loading:false,error:true});}
 }

 async function cancelResearch(runId:string){
  if(busy)return;
  setBusy(runId);setNotice(null);
  try{
   const response=await fetch("/api/deep-research",{method:"DELETE",cache:"no-store",headers:{"content-type":"application/json","idempotency-key":idempotencyKey("research-cancel")},body:JSON.stringify({runId})});
   const body=await response.json().catch(()=>null);
   if(!response.ok||!body?.ok){setNotice({kind:"error",text:errorText(body)});return;}
   setNotice({kind:"ok",text:t.cancelled});await loadHistory();
  }catch{setNotice({kind:"error",text:t.errors.default});}
  finally{setBusy(null);}
 }

 return <main className="min-h-screen bg-[color:var(--tp-bg)] text-[color:var(--tp-text)]" dir={isFa?"rtl":"ltr"}>
  <section className="px-4 py-10 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl">
   <header className="rounded-[36px] border border-cyan-300/15 bg-[#06111f] p-6 shadow-[0_30px_100px_rgba(34,211,238,.12)] sm:p-8 lg:p-10">
    <p className="text-sm font-black text-cyan-300">{t.eyebrow}</p><h1 className="mt-3 max-w-4xl text-balance text-4xl font-black leading-tight text-white sm:text-5xl">{t.title}</h1>
    <p className="mt-4 max-w-3xl text-base font-bold leading-8 text-slate-300">{t.lead}</p>
    <ol className="mt-7 grid gap-2 sm:grid-cols-5" aria-label={isFa?"مراحل پژوهش":"Research stages"}>{stages.map((item,i)=><li key={item} aria-current={item===stage?"step":undefined} className={`min-h-11 rounded-2xl border px-3 py-3 text-center text-xs font-black ${item===stage?"border-cyan-300/60 bg-cyan-300/15 text-cyan-100":"border-white/10 bg-white/5 text-slate-400"}`}>{i+1}. {t.stages[i]}</li>)}</ol>
   </header>

   {notice?<div role={notice.kind==="error"?"alert":"status"} className={`mt-5 rounded-2xl border p-4 text-sm font-black ${notice.kind==="error"?"border-rose-300/30 bg-rose-300/10":"border-emerald-300/30 bg-emerald-300/10"}`}>{notice.text}</div>:null}

   <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
    <section className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.055]" aria-labelledby="research-question">
     <div className="flex items-center gap-3"><Search className="h-6 w-6 text-cyan-500" aria-hidden/><h2 id="research-question" className="text-xl font-black">{t.question}</h2></div>
     <label className="sr-only" htmlFor="deep-research-question">{t.question}</label>
     <textarea id="deep-research-question" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={12000} rows={6} placeholder={t.placeholder} className="mt-5 w-full resize-y rounded-2xl border border-slate-300 bg-transparent p-4 text-base font-semibold leading-7 outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:border-white/15"/>
     <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="min-w-52 flex-1 text-sm font-black">{t.freshness}<select value={freshness} onChange={e=>setFreshness(e.target.value as Freshness)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 font-bold dark:border-white/15"><option value="current">{t.freshnessOptions.current}</option><option value="day">{t.freshnessOptions.day}</option><option value="week">{t.freshnessOptions.week}</option><option value="month">{t.freshnessOptions.month}</option><option value="historical">{t.freshnessOptions.historical}</option></select></label>
      <button type="button" onClick={startResearch} disabled={!question.trim()||busy!==null} className="min-h-11 rounded-2xl bg-cyan-800 px-5 py-3 text-sm font-black text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">{busy==="create"?t.starting:t.start}</button>
     </div>
     <div className="mt-3 text-xs font-bold text-[color:var(--tp-muted)]" dir="ltr">{question.length.toLocaleString("en-US")} / 12,000</div>
    </section>
    <aside className="space-y-5">
     <section className="rounded-[30px] border border-cyan-300/20 bg-cyan-500/10 p-5"><ShieldCheck className="h-7 w-7 text-cyan-300" aria-hidden/><h2 className="mt-3 text-xl font-black">{t.truth}</h2><p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{t.truthText}</p></section>
     <section className="rounded-[30px] border border-slate-200 bg-white/90 p-5 dark:border-white/10 dark:bg-white/[0.055]"><Clock3 className="h-6 w-6 text-cyan-500" aria-hidden/><h2 className="mt-3 font-black">{t.status}</h2><p className="mt-2 text-sm font-bold text-[color:var(--tp-muted)]">{t.statusText}</p></section>
    </aside>
   </div>

   <section className="mt-6 rounded-[32px] border border-slate-200 bg-white/90 p-6 dark:border-white/10 dark:bg-white/[0.055]" aria-labelledby="research-history">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="research-history" className="text-xl font-black">{t.history}</h2>{historyError?<button type="button" onClick={()=>void loadHistory()} className="min-h-11 rounded-xl border px-4 text-sm font-black">{t.retry}</button>:null}</div>
    {historyError?<p role="status" className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold">{t.historyUnavailable}</p>:runs===null?<p role="status" className="mt-4 text-sm font-bold text-[color:var(--tp-muted)]">{t.historyLoading}</p>:runs.length===0?<p className="mt-4 text-sm font-bold text-[color:var(--tp-muted)]">{t.noHistory}</p>:<ul className="mt-4 grid gap-3">{runs.map(run=><li key={run.id} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
     <div className="flex flex-wrap items-start justify-between gap-3"><p className="max-w-3xl font-black leading-7">{run.question}</p><span className="rounded-full border border-cyan-300/25 px-3 py-1 text-xs font-black" dir="ltr">{run.state}</span></div>
     <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-[color:var(--tp-muted)]"><time dateTime={run.createdAt} dir="ltr">{new Date(run.createdAt).toLocaleString(isFa?"fa-IR":"en-US")}</time><span>{t.freshnessOptions[run.requestedFreshness]}</span>{run.state==="completed"?<button type="button" onClick={()=>void loadArtifact(run.id)} disabled={artifactState.loading} className="min-h-11 rounded-xl border border-cyan-300/30 px-3 font-black text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-50 dark:text-cyan-300">{artifactState.loading&&artifactState.runId===run.id?t.reportLoading:t.openReport}</button>:null}{cancellable(run.state)?<button type="button" onClick={()=>void cancelResearch(run.id)} disabled={busy!==null} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-300/30 px-3 text-rose-700 disabled:opacity-50 dark:text-rose-300"><XCircle className="h-4 w-4" aria-hidden/>{busy===run.id?t.cancelling:t.cancel}</button>:null}</div>
     {run.degradedReason?<p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs font-bold">{run.degradedReason}</p>:null}
    </li>)}</ul>}
   </section>

   {artifactState.runId ? <AuthoritativeReport
    locale={locale}
    state={artifactState}
    onClose={()=>setArtifactState({runId:null,artifact:null,loading:false,error:false})}
   /> : null}

   <section className="mt-6 rounded-[32px] border border-slate-200 bg-white/90 p-6 dark:border-white/10 dark:bg-white/[0.055]" aria-labelledby="evidence-preview">
    <div className="flex items-center gap-3"><BookOpenCheck className="h-6 w-6 text-cyan-500" aria-hidden/><h2 id="evidence-preview" className="text-xl font-black">{t.evidence}</h2></div>
    <div className="mt-5 grid gap-4 md:grid-cols-3">{[t.known,t.conflict,t.unknown].map((label,i)=><article key={label} className="rounded-2xl border border-slate-200 p-5 dark:border-white/10"><h3 className="font-black">{label}</h3><p className="mt-3 text-sm font-bold leading-7 text-[color:var(--tp-muted)]">{t.demoClaim}</p>{i===0?<span className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-400/30 px-3 py-2 text-sm font-black text-cyan-600 dark:text-cyan-300">{t.demoSource}<ExternalLink className="h-4 w-4" aria-hidden/></span>:null}</article>)}</div>
   </section>
  </div></section>
 </main>;
}
