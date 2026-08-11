import Link from "next/link";
import Image from "next/image";
import { BrainCircuit, CheckCircle2, LineChart, LockKeyhole, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import {
  academyMasterySeasonPrinciples,
  academyMasterySeasons,
  allowedMasteryRankingInputs,
  forbiddenMasteryRankingInputs,
  recommendAcademyMasterySeasons,
} from "@/data/academyMasterySeasons";
import { AcademyMasterySeasonsClientStatus } from "./AcademyMasterySeasonsClientStatus";

type Locale = "fa" | "en";

const kindLabel: Record<string, { fa: string; en: string }> = {
  repair: { fa: "ترمیم ضعف", en: "Repair" },
  "market-update": { fa: "آموزش روز", en: "Market update" },
  "arena-discipline": { fa: "نظم آرنا", en: "Arena discipline" },
  "cohort-league": { fa: "لیگ هم‌سطح", en: "Peer league" },
};

const kindIcon = {
  repair: ShieldCheck,
  "market-update": LineChart,
  "arena-discipline": BrainCircuit,
  "cohort-league": Trophy,
};

export function AcademyMasterySeasonsShowcase({ locale = "fa" }: { locale?: Locale }) {
  const isFa = locale === "fa";
  const recommended = recommendAcademyMasterySeasons(
    {
      completedTerms: 7,
      weakConceptTags: ["risk", "position-sizing", "security"],
      arenaRiskFlags: ["fomo", "journal"],
      marketInterestTags: ["market-news", "tools"],
    },
    3,
  );

  return (
    <div dir={isFa ? "rtl" : "ltr"} className={isFa ? "text-right" : "text-left"}>
      <section className="relative overflow-hidden px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,.18),transparent_32%),radial-gradient(circle_at_20%_20%,rgba(37,99,235,.14),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-700 dark:text-cyan-200">
              <Sparkles className="h-4 w-4" />
              {isFa ? "TecPey Infinite Academy" : "TecPey Infinite Academy"}
            </div>
            <h1 className="mt-6 text-4xl font-black leading-tight text-slate-950 dark:text-white sm:text-6xl">
              {isFa ? "آکادمی تمام نمی‌شود؛ وارد Season رشد می‌شوی" : "Academy does not end; it becomes your growth season"}
            </h1>
            <p className="mt-5 max-w-3xl text-base font-bold leading-8 text-slate-600 dark:text-slate-300">
              {isFa
                ? "بعد از ۷ ترم اصلی، تک‌پی برای هر کاربر فصل‌های اختصاصی می‌سازد: ترمیم ضعف‌ها، آموزش اتفاقات مهم روز، تمرین نظم در Trading Arena و رقابت سالم با کاربران هم‌سطح."
                : "After the 7 core terms, TecPey creates personalized seasons for each learner: weak-area repair, current market learning, Trading Arena discipline and healthy peer-level competition."}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href={isFa ? "/academy/profile" : "/en/academy/profile"} className="rounded-2xl bg-cyan-500 px-6 py-4 text-center text-sm font-black text-white shadow-xl shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-400">
                {isFa ? "مشاهده مسیر یادگیری" : "View learning path"}
              </Link>
              <Link href={isFa ? "/academy/trading-arena" : "/en/academy/trading-arena"} className="rounded-2xl border border-cyan-300/25 bg-white/70 px-6 py-4 text-center text-sm font-black text-slate-900 backdrop-blur transition hover:bg-white dark:bg-white/10 dark:text-cyan-100 dark:hover:bg-white/15">
                {isFa ? "تمرین در Trading Arena" : "Practice in Trading Arena"}
              </Link>
            </div>
          </div>

          <aside className="rounded-[36px] border border-cyan-300/20 bg-slate-950 p-6 text-white shadow-[0_30px_110px_rgba(34,211,238,.16)]">
            <div className="mx-auto grid h-44 w-44 place-items-center rounded-full border border-cyan-300/20 bg-[radial-gradient(circle,rgba(34,211,238,.20),transparent_65%)]">
              <Image
                src="/images/brand/tp-progress-core.png"
                alt="TecPey TP Progress Core"
                width={118}
                height={177}
                className="h-[118px] w-auto drop-shadow-[0_18px_45px_rgba(34,211,238,.45)]"
                priority
              />
            </div>
            <h2 className="mt-6 text-center text-2xl font-black">{isFa ? "TP Progress Core" : "TP Progress Core"}</h2>
            <p className="mt-3 text-center text-sm font-bold leading-7 text-slate-300">
              {isFa
                ? "نشان تک‌پی با ترم‌ها، Seasonها، نظم آرنا و رتبه‌های سالم کامل‌تر می‌شود."
                : "The TecPey mark evolves through terms, seasons, Arena discipline and healthy ranking."}
            </p>
          </aside>
        </div>
      </section>

      <section className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
          {academyMasterySeasonPrinciples.map((item) => (
            <article key={item.titleEn} className="rounded-[30px] border border-cyan-200 bg-white/90 p-6 shadow-sm dark:border-cyan-300/15 dark:bg-white/[0.055]">
              <CheckCircle2 className="h-6 w-6 text-cyan-500" />
              <h2 className="mt-4 text-xl font-black text-slate-950 dark:text-white">{isFa ? item.titleFa : item.titleEn}</h2>
              <p className="mt-3 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{isFa ? item.textFa : item.textEn}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-xs font-black text-cyan-600 dark:text-cyan-300">{isFa ? "Season Catalog" : "Season Catalog"}</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950 dark:text-white">{isFa ? "چه فصل‌هایی ساخته می‌شود؟" : "What seasons can TecPey create?"}</h2>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {academyMasterySeasons.map((season) => {
              const Icon = kindIcon[season.kind];
              return (
                <article key={season.id} className="rounded-[30px] border border-slate-200 bg-white/92 p-5 shadow-[0_18px_55px_rgba(15,23,42,.08)] dark:border-white/10 dark:bg-white/[0.055]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-700 dark:text-cyan-100">{isFa ? kindLabel[season.kind].fa : kindLabel[season.kind].en}</span>
                    <Icon className="h-6 w-6 text-cyan-500" />
                  </div>
                  <h3 className="mt-4 text-lg font-black leading-8 text-slate-950 dark:text-white">{isFa ? season.titleFa : season.titleEn}</h3>
                  <p className="mt-3 text-sm font-bold leading-7 text-slate-600 dark:text-slate-300">{isFa ? season.summaryFa : season.summaryEn}</p>
                  <p className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-xs font-black leading-6 text-cyan-800 dark:border-cyan-300/15 dark:bg-cyan-300/10 dark:text-cyan-100">
                    {isFa ? season.unlockFa : season.unlockEn}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="rounded-[34px] border border-emerald-300/20 bg-emerald-500/10 p-6">
            <p className="text-xs font-black text-emerald-700 dark:text-emerald-200">{isFa ? "نمونه پیشنهاد هوشمند" : "Sample recommendation"}</p>
            <h2 className="mt-3 text-2xl font-black text-slate-950 dark:text-white">{isFa ? "اگر کاربر ترم ۷ را تمام کرده اما در ریسک و ژورنال ضعف دارد" : "If a Term 7 graduate is weak in risk and journaling"}</h2>
            <div className="mt-5 grid gap-3">
              {recommended.map((season) => (
                <div key={season.id} className="rounded-2xl border border-white/10 bg-white/70 p-4 dark:bg-white/[0.07]">
                  <h3 className="font-black text-slate-950 dark:text-white">{isFa ? season.titleFa : season.titleEn}</h3>
                  <p className="mt-2 text-xs font-bold leading-6 text-slate-600 dark:text-slate-300">{isFa ? season.cadenceFa : season.cadenceEn}</p>
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-[34px] border border-rose-300/20 bg-rose-500/10 p-6">
            <div className="flex items-center gap-3">
              <LockKeyhole className="h-6 w-6 text-rose-500" />
              <h2 className="text-2xl font-black text-slate-950 dark:text-white">{isFa ? "قانون رنکینگ امن" : "Safe ranking rule"}</h2>
            </div>
            <p className="mt-4 text-sm font-bold leading-8 text-slate-600 dark:text-slate-300">
              {isFa
                ? "رتبه باید انگیزه بسازد، نه رفتار پرریسک. سود واقعی، حجم معامله، پول واریزی، اهرم و سرعت خام هرگز ورودی رتبه‌بندی نیستند."
                : "Ranking must motivate learning, not risky behavior. Real profit, trade volume, deposits, leverage and raw speed are never ranking inputs."}
            </p>
            <div className="mt-5 grid gap-3">
              <p className="text-xs font-black text-emerald-700 dark:text-emerald-200">{isFa ? "مجاز" : "Allowed"}</p>
              <div className="flex flex-wrap gap-2">
                {allowedMasteryRankingInputs.slice(0, 5).map((item) => (
                  <span key={item} className="rounded-full bg-emerald-500/15 px-3 py-2 text-xs font-black text-emerald-700 dark:text-emerald-100">{item}</span>
                ))}
              </div>
              <p className="mt-3 text-xs font-black text-rose-700 dark:text-rose-200">{isFa ? "ممنوع" : "Forbidden"}</p>
              <div className="flex flex-wrap gap-2">
                {forbiddenMasteryRankingInputs.slice(0, 5).map((item) => (
                  <span key={item} className="rounded-full bg-rose-500/15 px-3 py-2 text-xs font-black text-rose-700 dark:text-rose-100">{item}</span>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>

      <AcademyMasterySeasonsClientStatus locale={locale} />
    </div>
  );
}
