"use client";

import Image from "next/image";
import Link from "next/link";
import { Award, BadgeCheck, Download, ExternalLink, GraduationCap, QrCode, Share2, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

type Locale = "fa" | "en";
type Certificate = { id: string; course_title: string; term_number: number; score: number; student_name: string; public_student_id: string; issued_at: string; status: string };
type EligibleTerm = { term: number; score: number };


export function AcademyCertificatesClient({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [eligibleTerms, setEligibleTerms] = useState<EligibleTerm[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [certificateResponse, progressResponse] = await Promise.all([
        fetch("/api/academy-certificates", { cache: "no-store" }),
        fetch(`/api/academy-term-progress?locale=${locale}`, { cache: "no-store" }).catch(() => null),
      ]);
      const data = await certificateResponse.json();
      const progressData = progressResponse?.ok ? await progressResponse.json() : null;
      setCertificates(Array.isArray(data?.certificates) ? data.certificates : []);
      const terms = Array.isArray(progressData?.terms) ? progressData.terms : [];
      setEligibleTerms(terms.filter((item: { term_number?: number; score?: number; status?: string }) => item.status === "passed").map((item: { term_number?: number; score?: number }) => ({ term: Number(item.term_number), score: Number(item.score) || 100 })));
    } catch {
      setCertificates([]);
      setEligibleTerms([]);
    } finally { setLoading(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const issue = async (term: number, _score: number) => {
    setIssuing(term);
    setMessage("");
    try {
      const response = await fetch("/api/academy-certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termNumber: term }),
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        setMessage(isFa ? "برای صدور رسمی، ابتدا حساب آکادمی را کامل و ذخیره کن." : "Complete and save your academy account before official issuance.");
        return;
      }
      await load();
      setMessage(isFa ? "گواهی رسمی با موفقیت صادر شد." : "Official certificate issued successfully.");
    } catch {
      setMessage(isFa ? "صدور گواهی در حال حاضر انجام نشد. چند دقیقه بعد دوباره تلاش کن." : "Certificate issuance is unavailable right now. Please try again shortly.");
    } finally { setIssuing(null); }
  };

  const hasCerts = certificates.length > 0;

  return (
    <main className="min-h-screen bg-[color:var(--tp-bg)] px-4 py-10 text-[color:var(--tp-text)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="overflow-hidden rounded-[38px] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.25),transparent_34%),linear-gradient(145deg,#06111f,#111827)] p-6 text-white shadow-[0_30px_90px_rgba(34,211,238,.14)] lg:p-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100"><ShieldCheck className="h-4 w-4" /> TecPey Verified Certificates</div>
              <h1 className="mt-5 text-3xl font-black leading-tight sm:text-5xl">{isFa ? "مدارک قابل استعلام آکادمی تک‌پی" : "Verified TecPey Academy Certificates"}</h1>
              <p className="mt-4 max-w-3xl text-sm font-bold leading-8 text-slate-300">
                {isFa ? "فقط گواهی‌هایی که در پرونده رسمی آکادمی ثبت شده باشند با شناسه یکتا، QR قابل اسکن و صفحه استعلام عمومی نمایش داده می‌شوند." : "Only certificates recorded in the official academy profile are shown with a unique ID, scannable QR and public verification page."}
              </p>
            </div>
            <div className="rounded-[30px] border border-white/10 bg-white/10 p-5 text-center">
              <GraduationCap className="mx-auto h-12 w-12 text-cyan-200" />
              <p className="mt-3 text-3xl font-black">{loading ? "…" : certificates.length}</p>
              <p className="mt-2 text-xs font-bold text-slate-300">{isFa ? "گواهی رسمی ثبت‌شده" : "official certificates"}</p>
            </div>
          </div>
        </section>

        {message ? <section className="rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-4 text-sm font-black leading-7">{message}</section> : null}

        {!hasCerts ? (
          <section className="rounded-[34px] border border-slate-200 bg-white/90 p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
            <Award className="mx-auto h-14 w-14 text-cyan-500" />
            <h2 className="mt-4 text-2xl font-black">{isFa ? "هنوز گواهی رسمی در پرونده تو ثبت نشده" : "No official certificate is recorded yet"}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-bold leading-8 text-[color:var(--tp-muted)]">{isFa ? "بعد از تکمیل حساب و ثبت قبولی آزمون در پرونده آموزشی تک‌پی، گواهی قابل استعلام به‌صورت رسمی صادر می‌شود." : "After completing your account and officially passing a term assessment in TecPey, a verifiable certificate can be issued."}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Link href={isFa ? "/academy/profile" : "/en/academy/profile"} className="inline-flex rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-black text-white">{isFa ? "تکمیل و ذخیره حساب" : "Complete account"}</Link>
              <Link href={isFa ? "/academy/term-1" : "/en/academy/term-1"} className="inline-flex rounded-2xl border border-cyan-300/30 px-6 py-3 text-sm font-black">{isFa ? "ادامه ترم‌ها" : "Continue terms"}</Link>
            </div>
            {eligibleTerms.length ? (
              <div className="mx-auto mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
                {eligibleTerms.map((item) => (
                  <button key={item.term} onClick={() => issue(item.term, item.score)} disabled={issuing === item.term} className="rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-4 py-3 text-xs font-black disabled:opacity-60">
                    {issuing === item.term ? (isFa ? "در حال بررسی…" : "Checking…") : (isFa ? `درخواست صدور رسمی ترم ${item.term}` : `Request official Term ${item.term}`)}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : (
          <section className="grid gap-5 lg:grid-cols-2">
            {certificates.map((cert) => (
              <article key={cert.id} className="overflow-hidden rounded-[34px] border border-cyan-300/20 bg-white/95 shadow-[0_24px_70px_rgba(15,23,42,.10)] dark:bg-white/[0.06]">
                <div className="border-b border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.16),transparent_30%)] p-6">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black text-cyan-600 dark:text-cyan-200">{cert.id}</p><h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{cert.course_title}</h2><p className="mt-2 text-sm font-bold text-[color:var(--tp-muted)]">{isFa ? `ترم ${cert.term_number} آکادمی تک‌پی` : `TecPey Academy Term ${cert.term_number}`}</p></div><BadgeCheck className="h-8 w-8 shrink-0 text-emerald-500" /></div>
                </div>
                <div className="grid gap-5 p-6 md:grid-cols-[1fr_170px] md:items-center">
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-[color:var(--tp-muted)]">{isFa ? "صادر شده برای" : "Issued to"}</p><p className="text-xl font-black text-slate-950 dark:text-white">{cert.student_name}</p>
                    <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"><p className="text-xs font-bold text-[color:var(--tp-muted)]">{isFa ? "امتیاز" : "Score"}</p><p className="mt-1 text-lg font-black">{cert.score}/100</p></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"><p className="text-xs font-bold text-[color:var(--tp-muted)]">TecPey ID</p><p className="mt-1 text-sm font-black">{cert.public_student_id}</p></div></div>
                    <div className="flex flex-wrap gap-2 pt-2"><Link href={`/verify/${cert.id}`} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-xs font-black text-white"><ExternalLink className="h-4 w-4" /> {isFa ? "استعلام" : "Verify"}</Link><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/30 px-4 py-3 text-xs font-black"><Download className="h-4 w-4" /> {isFa ? "چاپ / PDF" : "Print / PDF"}</button><button onClick={() => navigator.share?.({ title: cert.course_title, url: `${location.origin}/verify/${cert.id}` })} className="inline-flex items-center gap-2 rounded-2xl border border-violet-300/30 px-4 py-3 text-xs font-black"><Share2 className="h-4 w-4" /> {isFa ? "اشتراک" : "Share"}</button></div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-3 text-center dark:border-white/10 dark:bg-white/90"><Image src={`/api/academy-certificates/qr/${cert.id}`} alt="certificate verification QR" className="mx-auto h-36 w-36" width={144} height={144} unoptimized /><p className="mt-2 flex items-center justify-center gap-1 text-[10px] font-black text-slate-700"><QrCode className="h-3 w-3" /> QR Verification</p></div>
                </div>
              </article>
            ))}
          </section>
        )}

        <section className="rounded-[34px] border border-amber-300/20 bg-amber-400/10 p-6"><div className="flex gap-3"><Sparkles className="h-6 w-6 text-amber-500" /><p className="text-sm font-black leading-8">{isFa ? "این مدرک توصیه مالی، مجوز معامله یا تضمین سود نیست؛ نشانه تکمیل موفق یک مسیر آموزشی و قابل استعلام در آکادمی تک‌پی است." : "This certificate is not financial advice, a trading license or profit guarantee; it verifies successful completion of a TecPey Academy learning path."}</p></div></section>
      </div>
    </main>
  );
}
