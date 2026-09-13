"use client";

import { ImageIcon, Newspaper } from "lucide-react";

export function NewsArticleHeroMedia({
  articleUrl,
  sourceName,
  title,
  locale,
}: {
  articleUrl: string;
  sourceName: string;
  title: string;
  locale: "fa" | "en";
}) {
  const isFa = locale === "fa";
  const thumbnailUrl = `/crypto-news/media?article=${encodeURIComponent(articleUrl)}`;

  return (
    <figure className="mt-7 overflow-hidden rounded-[28px] border border-cyan-300/15 bg-slate-950">
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-slate-950 via-cyan-950 to-slate-900 sm:aspect-[21/9]">
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <div className="flex flex-col items-center gap-3 text-white/70">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <Newspaper className="h-8 w-8" />
            </div>
            <span className="text-xs font-black">{sourceName}</span>
          </div>
        </div>
        <img
          src={thumbnailUrl}
          alt={title}
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover object-center"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/85 to-transparent" />
        <div className="absolute bottom-4 start-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/70 px-3 py-1.5 text-[11px] font-black text-white backdrop-blur-md">
          <ImageIcon className="h-3.5 w-3.5" />
          {isFa ? `تصویر منبع، در صورت مجاز بودن · ${sourceName}` : `Source media when rights permit · ${sourceName}`}
        </div>
      </div>
      <figcaption className="border-t border-white/10 bg-slate-950 px-4 py-3 text-[11px] font-bold leading-6 text-slate-300">
        {isFa
          ? "نمایش تصویر تابع سیاست رسانه‌ای منبع است؛ در نبود مجوز یا تصویر معتبر، تک‌پی fallback امن نمایش می‌دهد."
          : "Media display follows the source-rights authority. TecPey shows a safe fallback when licensed/attributed media is unavailable."}
      </figcaption>
    </figure>
  );
}
