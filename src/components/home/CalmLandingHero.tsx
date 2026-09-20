import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  LineChart,
  Newspaper,
  ShieldCheck,
} from "lucide-react";
import styles from "./calm-entry.module.css";

/** Calm, product-led hierarchy grounded in TecPey's own design system. */
export function CalmLandingHero({ locale = "fa" }: { locale?: "fa" | "en" }) {
  const fa = locale === "fa";
  const prefix = fa ? "" : "/en";
  const Arrow = fa ? ArrowLeft : ArrowRight;

  const productRows = fa
    ? [
        { icon: BookOpen, label: "آکادمی", value: "۷ ترم پایه + رشد بی‌پایان" },
        { icon: BrainCircuit, label: "منتور هوشمند", value: "راهنمای آموزشی زمینه‌محور" },
        { icon: LineChart, label: "تریدینگ آرنا", value: "۱۰۰٬۰۰۰ دلار سرمایهٔ مجازی" },
        { icon: Newspaper, label: "هوش بازار", value: "خبر، کوین و ابزار در یک زمینه" },
      ]
    : [
        { icon: BookOpen, label: "Academy", value: "7 foundation terms + continuous growth" },
        { icon: BrainCircuit, label: "AI Mentor", value: "Context-aware learning guidance" },
        { icon: LineChart, label: "Trading Arena", value: "$100,000 virtual capital" },
        { icon: Newspaper, label: "Market intelligence", value: "News, coins and tools in context" },
      ];

  return (
    <section data-home-section="hero" className={styles.hero} dir={fa ? "rtl" : "ltr"}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>
          {fa ? "تک‌پی، نقطه امن ورود به بازار رمزارز" : "TecPey · Learn before you risk capital"}
        </p>
        <h1>
          {fa
            ? "قبل از سرمایه واقعی، دانش و مهارت واقعی بساز."
            : "Build real skill before you risk real capital."}
        </h1>
        <p className={styles.description}>
          {fa
            ? "آکادمی رایگان، منتور آموزشی، تریدینگ آرنا با سرمایه مجازی و هوش بازار؛ یک مسیر پیوسته برای فهمیدن، تمرین کردن و مدیریت ریسک."
            : "Free Academy, an educational AI Mentor, virtual-capital Trading Arena and market intelligence—one connected path to understand, practice and manage risk."}
        </p>

        <div className={styles.actions}>
          <Link className={styles.primary} href={`${prefix}/academy`}>
            {fa ? "شروع آکادمی رایگان" : "Start Free Academy"}
            <Arrow size={18} aria-hidden="true" />
          </Link>
          <Link className={styles.secondary} href={`${prefix}/academy/ai-guide`}>
            {fa ? "گفتگو با منتور هوشمند" : "Talk to AI Mentor"}
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-[color:var(--tp-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-[color:var(--tp-primary)]" aria-hidden="true" />
            {fa ? "آموزش و تمرین؛ نه وعده سود" : "Education and practice—not return promises"}
          </span>
          <span>{fa ? "فارسی و انگلیسی" : "Persian and English"}</span>
        </div>
      </div>

      <figure className={styles.visual} aria-label={fa ? "نمای سیستم یادگیری تک‌پی" : "TecPey learning system preview"}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,.22),transparent_34%),radial-gradient(circle_at_90%_85%,rgba(37,99,235,.28),transparent_38%)]" aria-hidden="true" />
        <div className="relative flex h-full flex-col p-4 pb-16 sm:p-6 sm:pb-16">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[.16em] text-cyan-200/80">TecPey OS</p>
              <p className="mt-1 text-sm font-black text-white">
                {fa ? "مسیر امروز تو" : "Your learning path today"}
              </p>
            </div>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[10px] font-black text-emerald-200">
              {fa ? "آموزشی" : "LEARNING"}
            </span>
          </div>

          <div className="mt-3 grid flex-1 content-center gap-2.5">
            {productRows.map((item, index) => (
              <div
                key={item.label}
                className="grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-3 backdrop-blur"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200">
                  <item.icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-black text-white">{item.label}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-400 sm:text-[11px]">
                    {item.value}
                  </span>
                </span>
                <span className="text-[10px] font-black tabular-nums text-cyan-200/80">
                  {new Intl.NumberFormat(fa ? "fa-IR" : "en-US").format(index + 1)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <figcaption>
          {fa
            ? "یاد بگیر → بپرس → تمرین کن → تصمیم را بازبینی کن"
            : "Learn → ask → practice → review the decision"}
        </figcaption>
      </figure>
    </section>
  );
}
