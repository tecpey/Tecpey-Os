"use client";

import { useState } from "react";
import { ImageIcon, Newspaper } from "lucide-react";
import type { NewsArchivePresentationItem } from "@/services/news/archive-presentation-authority";

type MediaItem = Pick<NewsArchivePresentationItem, "sourceName" | "thumbnailUrl" | "thumbnailAlt" | "thumbnailPolicy" | "thumbnailAttributionRequired">;

export function NewsCardMedia({ item, isFa }: { item: MediaItem; isFa: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const permitted = item.thumbnailPolicy === "licensed" || item.thumbnailPolicy === "official_attribution";
  const governedUrl = permitted && item.thumbnailUrl?.startsWith("/crypto-news/media?article=") ? item.thumbnailUrl : null;
  const showImage = Boolean(governedUrl && failedUrl !== governedUrl);

  return (
    <span className="relative block aspect-[16/9] w-full overflow-hidden rounded-[22px] border border-cyan-300/15 bg-gradient-to-br from-slate-950 via-cyan-950 to-slate-900" data-news-media={showImage ? "source" : "fallback"}>
      <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <span className="flex flex-col items-center gap-2 text-center text-white/70">
          <Newspaper className="h-6 w-6" />
          <span className="max-w-[80%] text-xs font-black tracking-wide">{item.sourceName}</span>
        </span>
      </span>
      {showImage && governedUrl && (
        // Native media preserves the governed redirect and handles failed source images.
        // eslint-disable-next-line @next/next/no-img-element -- #643: governed same-origin source media requires native fallback handling.
        <img src={governedUrl} alt={item.thumbnailAlt} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover object-center" onError={() => setFailedUrl(governedUrl)} />
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/80 to-transparent" />
      <span className="absolute bottom-2 start-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/90 px-2 py-1 text-xs font-black text-white"><ImageIcon className="h-3 w-3" aria-hidden="true" />{showImage ? (isFa ? "تصویر مجاز منبع" : "Governed source media") : (isFa ? "نمای امن تک‌پی" : "TecPey safe fallback")}</span>
        {showImage && item.thumbnailAttributionRequired && <span className="rounded-full border border-white/15 bg-slate-950/90 px-2 py-1 text-xs font-black text-white">{isFa ? `اعتبار تصویر: ${item.sourceName}` : `Media: ${item.sourceName}`}</span>}
      </span>
    </span>
  );
}
