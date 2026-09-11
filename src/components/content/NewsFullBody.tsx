import type { ContentLocale } from "@/lib/content-growth";
import { getNewsDetailBodyFromAuthority } from "@/lib/news-detail-body-authority";

export async function NewsFullBody({
  sourceUrl,
  locale,
}: {
  sourceUrl: string;
  locale: ContentLocale;
}) {
  // Full English publisher text is evidence, not TecPey-owned copy. Keep it
  // off the public surface unless a separate publication-rights authority is
  // introduced. Persian uses the governed TecPey editorial rendering.
  if (locale === "en") return null;

  const authority = await getNewsDetailBodyFromAuthority(sourceUrl, locale);
  if (!authority) return null;

  const coverageLabel = authority.sourceCoverage === "article_full"
    ? "شواهد کامل مقاله ناشر"
    : authority.sourceCoverage === "feed_full"
      ? "شواهد کامل فید ناشر"
      : "شواهد خلاصه ناشر";

  return (
    <section
      className="mt-8 rounded-[28px] border border-cyan-300/15 bg-white/70 p-5 dark:bg-white/[0.04] lg:p-6"
      data-news-body-coverage={authority.sourceCoverage}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black text-[color:var(--tp-text)]">متن و جزئیات خبر</h2>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-700 dark:text-cyan-100">
          {coverageLabel}
        </span>
      </div>
      <div className="mt-5 space-y-5 text-base font-medium leading-9 text-[color:var(--tp-muted)]">
        {authority.paragraphs.map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 32)}`}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}
