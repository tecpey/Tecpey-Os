"use client";

import { academySpecializedTracks, specializedProgramCriteriaEn, specializedProgramCriteriaFa } from "@/data/academySpecializedProgram";
import { Award, CalendarCheck2, CheckCircle2, ClipboardList, GraduationCap, Loader2, Send, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";

type Locale = "fa" | "en";
type Status = "idle" | "loading" | "success" | "error";

const PRIVACY_NOTICE_VERSION = "academy-leads-2026-07";

export function AcademySpecializedProgram({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const submissionId = useRef<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", city: "", mode: "online", track: academySpecializedTracks[0].id, note: "" });

  const selectedTrack = useMemo(() => academySpecializedTracks.find((item) => item.id === form.track) || academySpecializedTracks[0], [form.track]);
  const criteria = isFa ? specializedProgramCriteriaFa : specializedProgramCriteriaEn;
  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!consent) {
      setStatus("error");
      setMessage(isFa ? "برای ثبت درخواست، تأیید اطلاعیه حریم خصوصی لازم است." : "Privacy notice consent is required to submit this request.");
      return;
    }
    setStatus("loading");
    setMessage("");
    submissionId.current ||= `academy-specialized-${crypto.randomUUID()}`;
    const payload = {
      ...form,
      locale,
      source: "academy-specialized-program",
      submissionId: submissionId.current,
      consent: true,
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    };
    try {
      const res = await fetch("/api/academy-specialized-lead", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": submissionId.current,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("lead-submit-failed");
      submissionId.current = null;
      setStatus("success");
      setMessage(isFa ? "درخواست شما ثبت شد. تیم آکادمی تک‌پی پس از بررسی آمادگی، برای هماهنگی دوره تخصصی با شما تماس می‌گیرد." : "Your request was saved. TecPey Academy will review readiness and contact you about the specialized cohort.");
    } catch {
      setStatus("error");
      setMessage(isFa ? "ثبت درخواست کامل نشد و اطلاعات شخصی شما در مرورگر ذخیره نشد. لطفاً دوباره تلاش کنید." : "Submission did not complete and your personal data was not saved in this browser. Please retry.");
    }
  };

  return (
    <main className="min-h-screen bg-[color:var(--tp-bg)] text-[color:var(--tp-text)]">
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <section className="overflow-hidden rounded-[40px] border border-cyan-300/20 bg-[#06111f] p-7 shadow-[0_35px_120px_rgba(34,211,238,.14)] lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
                  <GraduationCap className="h-4 w-4" /> {isFa ? "مرحله بعد از مسیر پایه" : "Next step after foundation"}
                </div>
                <h1 className="mt-5 text-balance text-4xl font-black leading-[1.2] text-white sm:text-5xl">
                  {isFa ? "دعوت به دوره تخصصی آکادمی تک‌پی" : "Invitation to TecPey Academy Specialized Program"}
                </h1>
                <p className="mt-5 max-w-4xl text-base font-bold leading-9 text-slate-300">
                  {isFa
                    ? "دانشجویی که تمام ترم‌های پایه، ارزیابی نهایی و تمرین‌های سناریویی را کامل کند، می‌تواند برای دوره تخصصی حضوری یا آنلاین آکادمی تک‌پی درخواست ثبت‌نام بدهد. این مرحله برای آموزش عمیق‌تر، تمرین کنترل‌شده و دریافت بازخورد انسانی/هوشمند طراحی شده است. دانشجویان برتر و واجد شرایط می‌توانند وارد مرحله بررسی برای همکاری، فرصت‌های شغلی مرتبط یا سرمایه تمرینی/معاملاتی آینده تک‌پی شوند؛ این یک دعوت مشروط است، نه سیگنال، نه وعده سود و نه تضمین نتیجه مالی."
                    : "Learners who complete the foundation terms, final assessment and scenario practice can apply for TecPey Academy's specialized in-person or online program. This stage is for deeper education, structured practice and mentor feedback; not signals, profit promises or guaranteed financial outcomes."}
                </p>
                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  {[{ icon: ClipboardList, fa: "بررسی آمادگی", en: "Readiness review" }, { icon: Users, fa: "گروه حضوری/آنلاین", en: "Online/in-person cohort" }, { icon: ShieldCheck, fa: "آموزش ریسک‌محور", en: "Risk-first education" }, { icon: Award, fa: "مسیر دعوت استعدادها", en: "Talent invitation path" }].map((item) => {
                    const Icon = item.icon;
                    return <div key={item.en} className="rounded-3xl border border-white/10 bg-white/[0.06] p-5"><Icon className="h-6 w-6 text-cyan-200" /><p className="mt-3 text-sm font-black text-white">{isFa ? item.fa : item.en}</p></div>;
                  })}
                </div>
              </div>
              <aside className="rounded-[32px] border border-amber-300/20 bg-amber-400/10 p-6">
                <Award className="h-9 w-9 text-amber-200" />
                <h2 className="mt-4 text-2xl font-black text-white">{isFa ? "شرایط ورود به لیست بررسی" : "Eligibility checklist"}</h2>
                <ul className="mt-4 space-y-3">
                  {criteria.map((item) => <li key={item} className="flex gap-2 text-sm font-bold leading-7 text-amber-50"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-amber-200" />{item}</li>)}
                </ul>
              </aside>
            </div>
          </section>

          <section className="mt-8 grid gap-5 lg:grid-cols-3">
            {academySpecializedTracks.map((track) => (
              <article key={track.id} className="rounded-[34px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
                <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">{isFa ? track.durationFa : track.durationEn}</p>
                <h2 className="mt-3 text-2xl font-black leading-9 text-slate-950 dark:text-white">{isFa ? track.titleFa : track.titleEn}</h2>
                <p className="mt-3 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">{isFa ? track.outcomeFa : track.outcomeEn}</p>
                <div className="mt-4 rounded-2xl bg-cyan-500/10 p-4 text-sm font-black leading-7 text-cyan-700 dark:text-cyan-100">{isFa ? track.formatFa : track.formatEn}</div>
                <h3 className="mt-5 font-black text-slate-950 dark:text-white">{isFa ? "ماژول‌ها" : "Modules"}</h3>
                <ul className="mt-3 space-y-2">
                  {(isFa ? track.modulesFa : track.modulesEn).map((item) => <li key={item} className="text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">• {item}</li>)}
                </ul>
              </article>
            ))}
          </section>

          <section className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_430px]">
            <div className="rounded-[34px] border border-slate-200 bg-white/90 p-6 dark:border-white/10 dark:bg-white/[0.055]">
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">{isFa ? "این مرحله دقیقاً چه مشکلی را حل می‌کند؟" : "What problem does this stage solve?"}</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {(isFa
                  ? ["تبدیل دانش پایه به تمرین واقعی و قابل بازبینی", "کاهش تصمیم‌های هیجانی با تمرین‌های سناریویی", "تشخیص ضعف‌های شخصی قبل از ورود جدی‌تر", "آماده‌سازی کاربر برای مسیر حرفه‌ای، همکاری یا سرمایه تمرینی به‌صورت مشروط و قابل ارزیابی"]
                  : ["Turn foundation knowledge into reviewable practice", "Reduce emotional decisions through scenario drills", "Identify personal weaknesses before deeper exposure", "Prepare users for advanced learning without profit promises"]
                ).map((item) => <div key={item} className="rounded-3xl border border-cyan-300/20 bg-cyan-500/10 p-5 text-sm font-bold leading-8 text-slate-700 dark:text-slate-200"><CheckCircle2 className="mb-3 h-5 w-5 text-cyan-500" />{item}</div>)}
              </div>
            </div>

            <form onSubmit={submit} className="rounded-[34px] border border-cyan-300/25 bg-slate-950 p-6 shadow-[0_30px_100px_rgba(34,211,238,.12)]">
              <CalendarCheck2 className="h-8 w-8 text-cyan-200" />
              <h2 className="mt-4 text-2xl font-black text-white">{isFa ? "درخواست ورود به لیست ثبت‌نام" : "Apply for the registration list"}</h2>
              <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{isFa ? "پس از بررسی آمادگی آموزشی، برای هماهنگی زمان، فرمت و ظرفیت دوره با شما تماس گرفته می‌شود." : "After readiness review, the Academy team will contact you about schedule, format and cohort capacity."}</p>
              <div className="mt-5 grid gap-3">
                <input value={form.name} onChange={(e) => update("name", e.target.value)} required placeholder={isFa ? "نام و نام خانوادگی" : "Full name"} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500" />
                <input value={form.phone} onChange={(e) => update("phone", e.target.value)} required placeholder={isFa ? "شماره تماس" : "Phone"} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500" />
                <input value={form.email} onChange={(e) => update("email", e.target.value)} placeholder={isFa ? "ایمیل (اختیاری)" : "Email (optional)"} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500" />
                <input value={form.city} onChange={(e) => update("city", e.target.value)} placeholder={isFa ? "شهر" : "City"} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500" />
                <select value={form.track} onChange={(e) => update("track", e.target.value)} className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none">
                  {academySpecializedTracks.map((track) => <option key={track.id} value={track.id}>{isFa ? track.titleFa : track.titleEn}</option>)}
                </select>
                <select value={form.mode} onChange={(e) => update("mode", e.target.value)} className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none">
                  <option value="online">{isFa ? "آنلاین" : "Online"}</option>
                  <option value="in-person">{isFa ? "حضوری" : "In-person"}</option>
                  <option value="either">{isFa ? "هر دو برایم مناسب است" : "Either works"}</option>
                </select>
                <textarea value={form.note} onChange={(e) => update("note", e.target.value)} placeholder={isFa ? "توضیح کوتاه درباره هدف شما از دوره تخصصی" : "Briefly describe your goal for the specialized program"} rows={4} className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold leading-7 text-white outline-none placeholder:text-slate-500" />
                <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs font-bold leading-6 text-slate-300">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4" />
                  <span>{isFa ? "با ثبت این فرم، با پردازش امن اطلاعات تماس برای بررسی درخواست دوره و پیگیری مرتبط موافقت می‌کنم." : "I consent to secure processing of my contact data for reviewing and following up on this program request."}</span>
                </label>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-xs font-bold leading-6 text-slate-300">
                  {isFa ? `مسیر انتخابی: ${selectedTrack.titleFa}. این ثبت‌نام به معنی پذیرش قطعی، استخدام یا دریافت سرمایه نیست؛ درخواست شما برای بررسی ظرفیت، آمادگی و شایستگی ثبت می‌شود.` : `Selected track: ${selectedTrack.titleEn}. This is not guaranteed admission; it registers your request for capacity and readiness review.`}
                </div>
                <button disabled={status === "loading" || !consent} type="submit" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-5 py-4 text-sm font-black text-white transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60">
                  {status === "loading" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  {isFa ? "ثبت درخواست بررسی" : "Submit review request"}
                </button>
                {message ? <p className={`rounded-2xl p-4 text-sm font-bold leading-7 ${status === "success" ? "bg-emerald-500/10 text-emerald-100" : "bg-amber-500/10 text-amber-100"}`}>{message}</p> : null}
              </div>
            </form>
          </section>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={isFa ? "/academy/final-assessment" : "/en/academy/final-assessment"} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white dark:bg-white dark:text-slate-950">{isFa ? "بازگشت به ارزیابی نهایی" : "Back to final assessment"}</Link>
            <Link href={isFa ? "/academy/mentor-coach" : "/en/academy/mentor-coach"} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-700 dark:text-cyan-200">{isFa ? "مشورت با Mentor" : "Ask the Mentor"}</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
