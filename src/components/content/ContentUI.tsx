
import Link from "next/link";
import { NeonIcon } from "@/components/tecpey/NeonIcon";
import { ArrowLeft, BookOpen, CheckCircle2, Clock3, Search, ShieldCheck, Sparkles } from "lucide-react";

export function ContentShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 pt-24 text-slate-950 dark:bg-slate-950 dark:text-white">
      {children}
    </main>
  );
}

export function ContentHero({
  eyebrow,
  title,
  description,
  ctaHref = "/academy",
  ctaLabel = "مشاهده آکادمی",
}: {
  eyebrow: string;
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  const secondaryHref = ctaHref === "/markets" ? "/academy" : "/markets";
  const secondaryLabel = ctaHref === "/markets" ? "آموزش قبل از خرید" : "مشاهده قیمت‌ها";
  return (
    <section className="relative isolate overflow-hidden px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(6,182,212,.24),transparent_32%),radial-gradient(circle_at_15%_25%,rgba(37,99,235,.16),transparent_30%)]" />
      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-500">
            <Sparkles className="h-4 w-4" />
            {eyebrow}
          </div>
          <h1 className="mt-6 text-balance text-4xl font-black leading-[1.18] tracking-tight sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-pretty text-base leading-8 text-slate-600 dark:text-slate-300 sm:text-lg">
            {description}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href={ctaHref} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5">
              {ctaLabel}
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <Link href={secondaryHref} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-6 py-4 text-sm font-black text-slate-900 backdrop-blur transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10">
              {secondaryLabel}
              <Search className="h-5 w-5 text-cyan-500" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TrustStrip() {
  const items = [
    { icon: BookOpen, title: "راهنمای ساده و قابل‌فهم", desc: "قبل از خرید، کاربرد و نکات مهم هر رمزارز را روشن بخوانید" },
    { icon: ShieldCheck, title: "ریسک‌ها و نکات امنیتی", desc: "با ریسک، شبکه انتقال، کارمزد و نکات نگهداری آشنا شوید" },
    { icon: Clock3, title: "کمک به تصمیم‌گیری سریع‌تر", desc: "پاسخ‌های کوتاه و کاربردی برای سوالات قبل از معامله" },
  ];
  return (
    <section className="px-4 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            <item.icon className="h-7 w-7 text-cyan-500" />
            <h3 className="mt-4 text-lg font-black">{item.title}</h3>
            <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ArticleCard({
  href,
  title,
  description,
  meta,
}: {
  href: string;
  title: string;
  description: string;
  meta?: string;
}) {
  return (
    <Link href={href} className="group block h-full rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-white/5">
      {meta && <p className="text-xs font-black text-cyan-500">{meta}</p>}
      <h3 className="mt-3 text-xl font-black leading-8 text-slate-950 dark:text-white">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">{description}</p>
      <div className="mt-5 inline-flex items-center gap-2 text-sm font-black text-cyan-500">
        {title.includes("تتر") ? "آشنایی با تتر" : title.includes("بیت") ? "راهنمای خرید بیت‌کوین" : title.includes("تون") ? "بررسی تون‌کوین" : title.includes("اتریوم") ? "بررسی اتریوم" : "راهنمای این رمزارز"}
        <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" />
      </div>
    </Link>
  );
}

export function FaqList({ faqs }: { faqs: { q: string; a: string }[] }) {
  return (
    <div className="space-y-3">
      {faqs.map((item) => (
        <div key={item.q} className="rounded-3xl border border-slate-200 bg-white/80 p-5 dark:border-white/10 dark:bg-white/5">
          <h3 className="flex items-start gap-2 text-base font-black">
            <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-500" />
            {item.q}
          </h3>
          <p className="mt-3 text-sm leading-8 text-slate-600 dark:text-slate-300">{item.a}</p>
        </div>
      ))}
    </div>
  );
}

export function SeoNote() {
  return (
    <div className="rounded-[32px] border border-cyan-400/20 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.18),transparent_35%),linear-gradient(145deg,#07111f,#0f172a)] p-6 text-white shadow-xl shadow-cyan-500/10">
      <h3 className="text-xl font-black">یادداشت مهم تک‌پی</h3>
      <p className="mt-3 text-sm leading-8 text-white/72">
        این محتوا برای آموزش و تصمیم‌گیری آگاهانه نوشته شده و توصیه مالی قطعی نیست. بازار رمزارز پرنوسان است و هر کاربر باید متناسب با شرایط مالی، ریسک‌پذیری و دانش خود تصمیم بگیرد.
      </p>
    </div>
  );
}
