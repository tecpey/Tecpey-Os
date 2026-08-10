import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, Newspaper, ShieldAlert, Sparkles } from "lucide-react";
import {
  getNewsDetailDisplayMeta,
  type NewsHubPageModel,
} from "@/lib/news-detail-pages";
import { getNewsImpactDetailPath } from "@/lib/news-impact-history";

function toolLabel(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function CanonicalNewsImpactHub({ model }: { model: NewsHubPageModel }) {
  const isFa = model.locale === "fa";
  const items = model.items.slice(0, 8);

  return (
    <section
      dir={isFa ? "rtl" : "ltr"}
      className="bg-[color:var(--tp-bg)] px-4 pb-12 sm:px-6 lg:px-8"
      aria-labelledby={`${model.locale}-canonical-news-impact-heading`}
    >
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[34px] border border-cyan-300/15 bg-slate-950 p-6 text-white shadow-2xl shadow-cyan-500/10 lg:p-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-100">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {isFa ? "تاریخچه قابل audit خبرهای اثرگذار" : "Auditable impact history"}
              </div>
              <h2 id={`${model.locale}-canonical-news-impact-heading`} className="mt-5 text-3xl font-black leading-tight sm:text-4xl">
                {isFa ? "خبرهایی که واقعاً روی اولویت کوین‌ها و ابزارها اثر گذاشته‌اند" : "News that actually changes coin and tool priority"}
              </h2>
              <p className="mt-4 text-sm font-bold leading-8 text-slate-300">
                {isFa
                  ? "این بخش از همان evidence history تغذیه می‌شود که صفحه کوین، ابزار، schema و sitemap از آن استفاده می‌کنند؛ بنابراین رشد محتوا قابل توضیح و قابل بازبینی می‌ماند."
                  : "This section is powered by the same evidence history used by coin pages, tool pages, schema and sitemap, keeping content growth explainable and reviewable."}
              </p>
            </div>
            <div className="rounded-[26px] border border-cyan-300/15 bg-white/[0.06] p-4 text-sm font-black text-cyan-100">
              <span className="block text-3xl text-white">{model.items.length}</span>
              <span>{isFa ? "خبر canonical ثبت‌شده" : "canonical news records"}</span>
            </div>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-2">
            {items.map((item) => {
              const meta = getNewsDetailDisplayMeta(item, model.locale);
              const href = getNewsImpactDetailPath(item);
              return (
                <article key={item.id} className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100">
                      <Newspaper className="h-4 w-4" aria-hidden="true" />
                      {meta.toneLabel}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-100">
                      <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                      {isFa ? `اثر ${item.impactScore}/10` : `Impact ${item.impactScore}/10`}
                    </span>
                  </div>

                  <h3 className="mt-4 text-xl font-black leading-8 text-white">
                    <Link href={href} className="transition hover:text-cyan-100">
                      {item.title}
                    </Link>
                  </h3>
                  <p className="mt-3 line-clamp-3 text-sm font-bold leading-7 text-slate-300">{item.summary}</p>

                  <div className="mt-4 grid gap-3 text-xs font-black text-slate-300 sm:grid-cols-2">
                    <time dateTime={item.publishedAt} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                      <Clock3 className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                      {isFa ? "انتشار: " : "Published: "}
                      {meta.publishedLabel}
                    </time>
                    <time dateTime={item.recordedAt} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                      <Clock3 className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                      {isFa ? "ثبت: " : "Recorded: "}
                      {meta.recordedLabel}
                    </time>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.relatedCoinSymbols.map((symbol) => (
                      <span key={symbol} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-black text-cyan-100">
                        {symbol}
                      </span>
                    ))}
                    {item.relatedToolSlugs.slice(0, 4).map((slug) => (
                      <span key={slug} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-slate-200">
                        {toolLabel(slug)}
                      </span>
                    ))}
                  </div>

                  <Link
                    href={href}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                  >
                    {isFa ? "مشاهده صفحه خبر" : "Open news detail"}
                    {isFa ? <ArrowLeft className="h-4 w-4" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                  </Link>
                </article>
              );
            })}
          </div>

          <p className="mt-6 rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-bold leading-7 text-amber-50">
            {isFa
              ? "یادآوری تک‌پی: این خبرها برای آموزش و زمینه بازار هستند، نه توصیه مالی، سیگنال خرید/فروش یا وعده سود."
              : "TecPey reminder: these records are educational market context, not financial advice, buy/sell signals or profit promises."}
          </p>
        </div>
      </div>
    </section>
  );
}
