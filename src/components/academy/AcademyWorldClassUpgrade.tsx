import Link from "next/link";
import { academyCartaxSectionsFa, academyScalePlanFa, academySimulatorBacklogFa, academyTrustLanguageFa, academyValueChainFa } from "@/data/academyWorldClassPlan";
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";

export function AcademyWorldClassUpgrade() {
  return (
    <section className="px-4 pb-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="overflow-hidden rounded-[38px] border border-cyan-300/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,.20),transparent_34%),linear-gradient(145deg,#020617,#0f172a)] p-6 shadow-[0_30px_110px_rgba(34,211,238,.14)] lg:p-8">
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
                <Sparkles className="h-4 w-4" /> مسیر حرفه‌ای آکادمی تک‌پی
              </div>
              <h2 className="mt-5 text-3xl font-black leading-tight text-white sm:text-5xl">تک‌پی فقط آموزش نمی‌دهد؛ استعداد قابل اعتماد می‌سازد</h2>
              <p className="mt-5 max-w-4xl text-sm font-bold leading-8 text-slate-300">
                در آکادمی تک‌پی، یادگیری فقط خواندن چند مقاله نیست. مسیر از آموزش پایه شروع می‌شود، با آزمون و تمرین ادامه پیدا می‌کند و دانشجویان منظم و واجد شرایط می‌توانند برای دوره‌های تخصصی آنلاین یا حضوری وارد مرحله بررسی شوند.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/academy/profile" className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-400">مشاهده پرونده یادگیری</Link>
                <Link href="/academy/simulator" className="rounded-2xl border border-cyan-300/25 bg-white/10 px-5 py-3 text-sm font-black text-cyan-100 transition hover:bg-white/15">تمرین تصمیم‌گیری بازار</Link>
                <Link href="/academy/specialized-program" className="rounded-2xl border border-amber-300/25 bg-amber-300/10 px-5 py-3 text-sm font-black text-amber-100 transition hover:bg-amber-300/15">دوره تخصصی و مسیر دعوت</Link>
              </div>
            </div>
            <div className="rounded-[32px] border border-white/10 bg-white/[0.06] p-5">
              <p className="text-xs font-black text-cyan-200">مسیر رشد دانشجو</p>
              <div className="mt-4 space-y-3">
                {academyValueChainFa.map((item, index) => (
                  <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-3 text-sm font-bold leading-7 text-slate-200">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-xs font-black text-white">{index + 1}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[34px] border border-amber-300/25 bg-amber-300/10 p-6">
          <h2 className="text-2xl font-black text-white">{academyTrustLanguageFa.title}</h2>
          <p className="mt-4 text-sm font-bold leading-8 text-amber-50">{academyTrustLanguageFa.text}</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-[34px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">پرونده یادگیری از شروع آکادمی</h2>
            <p className="mt-3 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">از روز اول، پیشرفت آموزشی، آزمون‌ها، تمرین‌ها، نشان‌ها و آمادگی شما در یک پرونده منظم دیده می‌شود تا مسیر بعدی روشن باشد.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {academyCartaxSectionsFa.map((section) => {
                const Icon = section.icon;
                return (
                  <article key={section.title} className="rounded-[26px] border border-cyan-200 bg-cyan-50 p-5 dark:border-cyan-300/15 dark:bg-cyan-500/10">
                    <Icon className="h-6 w-6 text-cyan-600 dark:text-cyan-300" />
                    <h3 className="mt-3 font-black text-slate-950 dark:text-white">{section.title}</h3>
                    <ul className="mt-3 space-y-2">
                      {section.items.map((item) => <li key={item} className="flex gap-2 text-xs font-bold leading-6 text-slate-600 dark:text-slate-300"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-cyan-500" />{item}</li>)}
                    </ul>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-[34px] border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">تمرین بازار؛ از سناریو تا تصمیم مسئولانه</h2>
            <p className="mt-3 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">در این بخش، دانشجو ابتدا با سناریوهای آموزشی تمرین می‌کند و در مراحل پیشرفته با داده بازار، کیف تمرینی، ژورنال و بازخورد آموزشی دقیق‌تر روبه‌رو می‌شود.</p>
            <div className="mt-5 space-y-4">
              {academySimulatorBacklogFa.map((phase) => {
                const Icon = phase.icon;
                return (
                  <article key={phase.phase} className="rounded-[26px] border border-violet-200 bg-violet-50 p-5 dark:border-violet-300/15 dark:bg-violet-500/10">
                    <div className="flex items-center gap-3"><Icon className="h-6 w-6 text-violet-600 dark:text-violet-300" /><span className="rounded-full bg-violet-500 px-3 py-1 text-xs font-black text-white">{phase.phase}</span></div>
                    <h3 className="mt-3 font-black text-slate-950 dark:text-white">{phase.title}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {phase.items.map((item) => <span key={item} className="rounded-full bg-white px-3 py-2 text-xs font-black text-violet-700 dark:bg-white/10 dark:text-violet-100">{item}</span>)}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <section className="rounded-[34px] border border-cyan-300/15 bg-slate-950 p-6 shadow-[0_24px_90px_rgba(15,23,42,.20)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black text-cyan-300">زیرساخت پایدار تک‌پی</p>
              <h2 className="mt-2 text-2xl font-black text-white">آمادگی برای رشد تعداد کاربران</h2>
            </div>
            <Link href="/academy/readiness" className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-100">
              چک‌لیست آمادگی <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {academyScalePlanFa.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-[26px] border border-white/10 bg-white/[0.055] p-5">
                  <Icon className="h-6 w-6 text-cyan-200" />
                  <h3 className="mt-3 font-black text-white">{item.title}</h3>
                  <p className="mt-3 text-sm font-bold leading-7 text-slate-300">{item.text}</p>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
