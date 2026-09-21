import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  BookOpenCheck,
  CircleAlert,
  Clock3,
  FileSearch,
  Gauge,
  Layers3,
  Radio,
  ShieldCheck,
} from "lucide-react";

type Locale = "fa" | "en";

export function MarketIntelligenceOverview({ locale }: { locale: Locale }) {
  const isFa = locale === "fa";
  const root = isFa ? "" : "/en";
  const academy = isFa ? "/academy" : "/en/academy";

  const pillars = [
    {
      Icon: BarChart3,
      title: isFa ? "داده بازار" : "Market data",
      text: isFa
        ? "قیمت، حجم، مارکت‌کپ و نقدشوندگی برای ساخت زمینه؛ نه برای تبدیل یک عدد به تصمیم خرید یا فروش."
        : "Price, volume, market cap and liquidity build context; a number is never converted into a buy or sell decision.",
      href: `${root}/markets`,
      label: isFa ? "مشاهده بازار" : "Open markets",
      state: isFa ? "فعال" : "Live",
    },
    {
      Icon: FileSearch,
      title: isFa ? "پژوهش منبع‌دار" : "Source-grounded research",
      text: isFa
        ? "زیرساخت پژوهش عمومی چندمرحله‌ای وجود دارد، اما اجرای Premium فقط با entitlement معتبر سمت سرور باز می‌شود."
        : "Multi-step public research infrastructure exists, but premium execution unlocks only with a valid server-side entitlement.",
      href: `${academy}/account#pro`,
      label: isFa ? "وضعیت Pro" : "Pro status",
      state: isFa ? "قفل سروری" : "Server gated",
    },
    {
      Icon: Radio,
      title: isFa ? "خبر و روایت اجتماعی" : "News & social narratives",
      text: isFa
        ? "خبر، وب و گفت‌وگوهای عمومی می‌توانند یک روایت را توضیح دهند؛ محبوبیت یا تکرار یک ادعا جای شواهد مستقل را نمی‌گیرد."
        : "News, web and public conversation can explain a narrative; popularity or repetition never substitutes for independent evidence.",
      href: `${root}/crypto-news`,
      label: isFa ? "اخبار رمزارز" : "Crypto news",
      state: isFa ? "سطح عمومی فعال" : "Public surface live",
    },
    {
      Icon: BookOpenCheck,
      title: isFa ? "معنای آموزشی" : "Learning meaning",
      text: isFa
        ? "خروجی خوب باید بگوید کاربر چه مفهومی را بهتر بفهمد، چه چیزی را بررسی کند و کدام عدم‌قطعیت هنوز باز است."
        : "A useful output explains what to learn, what to verify next and which uncertainty remains unresolved.",
      href: `${academy}/ai-guide`,
      label: isFa ? "گفت‌وگو با منتور" : "Talk to Mentor",
      state: isFa ? "فعال" : "Live",
    },
  ];

  const contract = [
    [isFa ? "منابع" : "Sources", isFa ? "ادعاهای پژوهشی باید به منبع قابل پیگیری متصل باشند." : "Research claims should connect to traceable sources."],
    [isFa ? "اعتماد" : "Confidence", isFa ? "اطمینان باید از کیفیت و همگرایی شواهد بیاید، نه لحن مطمئن مدل." : "Confidence should come from evidence quality and convergence, not confident model tone."],
    [isFa ? "شواهد متعارض" : "Conflicting evidence", isFa ? "دیدگاه یا داده مخالف پنهان نمی‌شود؛ اختلاف مهم بخشی از خروجی است." : "Material counter-evidence is not hidden; disagreement is part of the output."],
    [isFa ? "تازگی" : "Freshness", isFa ? "اطلاعات زمان‌حساس بدون زمان به‌روزرسانی، برای تصمیم‌گیری معتبر نیست." : "Time-sensitive information without an update time is not decision-grade."],
  ] as const;

  return (
    <main
      dir={isFa ? "rtl" : "ltr"}
      className="min-h-screen bg-[color:var(--tp-bg)] px-4 pb-24 pt-14 text-white sm:px-6 lg:px-8"
    >
      <section className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[40px] border border-cyan-300/15 bg-[radial-gradient(circle_at_80%_0%,rgba(34,211,238,.16),transparent_34%),radial-gradient(circle_at_10%_20%,rgba(139,92,246,.12),transparent_30%),rgba(255,255,255,.045)] p-6 shadow-2xl shadow-cyan-950/20 sm:p-9 lg:p-12">
          <div className="relative max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[.08] px-3 py-2 text-xs font-semibold text-cyan-100">
              <Gauge className="h-4 w-4" aria-hidden="true" />
              TECPEY MARKET INTELLIGENCE
            </div>
            <h1 className="mt-5 text-3xl font-bold leading-tight sm:text-5xl">
              {isFa ? "از «چه اتفاقی افتاد؟» تا «چه چیزی واقعاً می‌دانیم؟»" : "From “what happened?” to “what do we actually know?”"}
            </h1>
            <p className="mt-5 max-w-3xl text-sm font-medium leading-8 text-slate-300 sm:text-base">
              {isFa
                ? "این فضا برای کنار هم گذاشتن داده بازار، خبر، روایت عمومی و زمینه آموزشی طراحی شده است. تک‌پی از Market Intelligence برای آموزش و بهترشدن کیفیت پرسش و تحلیل استفاده می‌کند؛ نه تولید سیگنال خرید و فروش یا وعده بازده."
                : "This surface brings market data, news, public narratives and learning context together. TecPey uses Market Intelligence to improve questions and analysis—not to generate buy/sell signals or promised returns."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[.07] px-3 py-2 text-emerald-100">{isFa ? "آموزش‌محور" : "Learning first"}</span>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-2 text-cyan-100">{isFa ? "شواهد‌محور" : "Evidence aware"}</span>
              <span className="rounded-full border border-violet-300/20 bg-violet-300/[.07] px-3 py-2 text-violet-100">{isFa ? "عدم‌قطعیت آشکار" : "Uncertainty visible"}</span>
            </div>
          </div>
        </div>

        <section className="mt-6 grid gap-4 md:grid-cols-2" aria-label={isFa ? "لایه‌های هوشمندی بازار" : "Market intelligence layers"}>
          {pillars.map(({ Icon, title, text, href, label, state }) => (
            <article key={title} className="rounded-[30px] border border-white/10 bg-white/[.035] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[.07] text-cyan-200"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span className="rounded-full border border-white/10 bg-slate-950/40 px-2.5 py-1 text-[11px] font-semibold text-slate-300">{state}</span>
              </div>
              <h2 className="mt-4 text-lg font-bold">{title}</h2>
              <p className="mt-2 text-sm font-medium leading-7 text-slate-300">{text}</p>
              <Link href={href} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-cyan-200 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                {label}<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-[34px] border border-white/10 bg-slate-950/35 p-6 sm:p-8" aria-labelledby="intelligence-contract-title">
          <div className="flex items-center gap-3 text-cyan-200"><ShieldCheck className="h-5 w-5" aria-hidden="true" /><p className="text-xs font-semibold">{isFa ? "قرارداد اعتماد" : "Trust contract"}</p></div>
          <h2 id="intelligence-contract-title" className="mt-2 text-2xl font-bold">{isFa ? "هر تحلیل قابل‌دفاع چهار سؤال را جواب می‌دهد" : "Every defensible analysis answers four questions"}</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {contract.map(([title, text]) => (
              <article key={title} className="rounded-[24px] border border-white/10 bg-white/[.03] p-4">
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm font-medium leading-7 text-slate-400">{text}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[.055] p-4 text-sm leading-7 text-amber-100">
            <CircleAlert className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>{isFa ? "اگر منبع، زمان یا شواهد متعارض در دسترس نباشد، تک‌پی باید محدودیت را نشان دهد؛ نبود داده با «اطمینان پایین» یا یک حدس جایگزین نمی‌شود." : "If sources, timestamps or counter-evidence are unavailable, TecPey should show the limitation; missing data is not replaced by a low-confidence guess."}</p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_.8fr]">
          <article className="rounded-[30px] border border-white/10 bg-white/[.035] p-6">
            <div className="flex items-center gap-3 text-violet-200"><Layers3 className="h-5 w-5" aria-hidden="true" /><p className="text-xs font-semibold">{isFa ? "مسیر Pro Research" : "Pro Research path"}</p></div>
            <h2 className="mt-2 text-xl font-bold">{isFa ? "زیرساخت آماده؛ entitlement هنوز تعیین‌کننده است" : "Infrastructure exists; entitlement remains authoritative"}</h2>
            <p className="mt-3 text-sm font-medium leading-7 text-slate-300">{isFa ? "مسیریابی پژوهش عمومی، citation و کنترل egress در backend وجود دارد. تا زمانی که authority اشتراک Pro اجازه ندهد، اجرای Premium باید قفل بماند؛ تغییر UI یا client state مجوز محسوب نمی‌شود." : "Public-research routing, citations and egress controls exist in the backend. Premium execution stays locked until Pro subscription authority permits it; UI or client state is never authorization."}</p>
            <Link href={`${academy}/account#pro`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-violet-200 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{isFa ? "مشاهده نقشه قابلیت‌های Pro" : "View the Pro capability map"}<ArrowUpRight className="h-4 w-4" aria-hidden="true"/></Link>
          </article>
          <article className="rounded-[30px] border border-white/10 bg-white/[.035] p-6">
            <div className="flex items-center gap-3 text-slate-300"><Clock3 className="h-5 w-5" aria-hidden="true" /><p className="text-xs font-semibold">{isFa ? "Freshness" : "Freshness"}</p></div>
            <h2 className="mt-2 text-xl font-bold">{isFa ? "زمان بخشی از داده است" : "Time is part of the data"}</h2>
            <p className="mt-3 text-sm font-medium leading-7 text-slate-300">{isFa ? "قیمت و خبر ماهیت زمان‌حساس دارند. هر insight زنده باید زمان جمع‌آوری یا به‌روزرسانی خودش را همراه داشته باشد؛ این صفحه برای داده‌ای که timestamp معتبر ندارد عدد زنده جعل نمی‌کند." : "Prices and news are time-sensitive. Every live insight should carry its collection or update time; this page does not invent live numbers when a governed timestamp is unavailable."}</p>
          </article>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`${root}/markets`} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition-colors motion-reduce:transition-none hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            {isFa ? "باز کردن بازار" : "Open markets"}<ArrowUpRight className="h-4 w-4" aria-hidden="true"/>
          </Link>
          <Link href={academy} className="inline-flex min-h-12 items-center rounded-2xl border border-white/15 bg-white/[.04] px-5 py-3 text-sm font-bold text-white transition-colors motion-reduce:transition-none hover:bg-white/[.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            {isFa ? "بازگشت به آکادمی" : "Back to Academy"}
          </Link>
        </div>
      </section>
    </main>
  );
}
