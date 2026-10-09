"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { NewsArchivePresentationItem } from "@/services/news/archive-presentation-authority";
import { useFreshnessClock } from "@/hooks/useFreshnessClock";
import { isRecentNewsPublication } from "@/lib/news-published-at";
import { NewsCardMedia } from "./NewsCardMedia";
import styles from "./NewsHeadlineRail.module.css";

type Headline = Pick<NewsArchivePresentationItem,
  "archiveId" | "displayTitle" | "displayLead" | "sourceName" | "publishedAt" |
  "translationPending" | "publicSummaryAllowed" | "thumbnailUrl" | "thumbnailAlt" |
  "thumbnailPolicy" | "thumbnailAttributionRequired"
>;

function publicationLabel(publishedAt: string, now: number, isFa: boolean) {
  const published = Date.parse(publishedAt);
  if (!Number.isFinite(published)) return isFa ? "زمان انتشار نامعتبر" : "Publication time unavailable";
  if (!now) return isFa ? "در حال بررسی زمان انتشار" : "Checking publication time";
  if (published > now) return isFa ? "زمان انتشار در آینده است" : "Future publication timestamp";
  if (isRecentNewsPublication(publishedAt, now)) return isFa ? "انتشار در ۱۲ ساعت گذشته" : "Published within 12 hours";
  return isFa ? "انتشار قدیمی‌تر" : "Earlier publication";
}

export function NewsHeadlineRail({ items, totalCount, locale, id, onRead }: {
  items: Headline[];
  totalCount: number;
  locale: "fa" | "en";
  id: string;
  onRead: (index: number) => void;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const cardsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [active, setActive] = useState(0);
  const now = useFreshnessClock();
  const isFa = locale === "fa";
  const number = new Intl.NumberFormat(isFa ? "fa-IR" : "en-US");

  function reveal(index: number, exposeFocus = false) {
    const track = trackRef.current;
    const card = cardsRef.current[index];
    if (!track || !card) return;
    // Focus must reveal the whole card vertically as well as in the RTL/LTR strip.
    // CSS scroll margins reserve fixed shell chrome and the position label.
    if (exposeFocus) card.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    const viewport = track.getBoundingClientRect();
    const bounds = card.getBoundingClientRect();
    // Physical geometry avoids relying on browser-specific RTL scrollLeft signs.
    track.scrollBy({ left: bounds.left + bounds.width / 2 - viewport.left - viewport.width / 2, behavior: "instant" });
    setActive(index);
  }

  function observeScroll() {
    const track = trackRef.current;
    if (!track) return;
    const viewport = track.getBoundingClientRect();
    const center = viewport.left + viewport.width / 2;
    let closest = 0;
    let distance = Infinity;
    cardsRef.current.forEach((card, index) => {
      if (!card) return;
      const bounds = card.getBoundingClientRect();
      const candidate = Math.abs(bounds.left + bounds.width / 2 - center);
      if (candidate < distance) { closest = index; distance = candidate; }
    });
    setActive(closest);
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number;
    if (event.key === "Home") target = 0;
    else if (event.key === "End") target = items.length - 1;
    else if (event.key === "ArrowRight") target = index + (isFa ? -1 : 1);
    else if (event.key === "ArrowLeft") target = index + (isFa ? 1 : -1);
    else return;
    event.preventDefault();
    target = Math.max(0, Math.min(items.length - 1, target));
    cardsRef.current[target]?.focus({ preventScroll: true });
    reveal(target, true);
  }

  return (
    <nav id={id} className={styles.rail} aria-label={isFa ? "مرور تیترهای خبر" : "News headlines"}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.heading}>{isFa ? "مرور تیترها" : "Browse the headlines"}</h2>
          <p className={styles.description}>{isFa ? `${number.format(items.length)} تیتر از ${number.format(totalCount)} خبر؛ آرشیو کامل در ادامه است.` : `${number.format(items.length)} headlines from ${number.format(totalCount)} stories; the complete archive follows.`}</p>
        </div>
        <div className={styles.controls}>
          <button type="button" aria-label={isFa ? "تیتر قبلی" : "Previous headline"} aria-controls={`${id}-track`} aria-disabled={active === 0} onClick={() => active > 0 && reveal(active - 1)}>
            {isFa ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
          </button>
          <button type="button" aria-label={isFa ? "تیتر بعدی" : "Next headline"} aria-controls={`${id}-track`} aria-disabled={active === items.length - 1} onClick={() => active < items.length - 1 && reveal(active + 1)}>
            {isFa ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          </button>
        </div>
      </div>
      <ul id={`${id}-track`} ref={trackRef} className={styles.track} onScroll={observeScroll}>
        {items.map((item, index) => (
          <li key={item.archiveId} className={styles.card}>
            <button id={`${id}-card-${index}`} ref={node => { cardsRef.current[index] = node; }} type="button" className={styles.read} data-current={active === index} aria-label={isFa ? `خواندن خبر: ${item.displayTitle}` : `Read story: ${item.displayTitle}`} aria-describedby={`${id}-media-${index} ${id}-context-${index} ${id}-freshness-${index} ${id}-summary-${index}`} onFocus={event => reveal(index, event.currentTarget.matches(":focus-visible"))} onKeyDown={event => navigate(event, index)} onClick={() => onRead(index)}>
              <NewsCardMedia id={`${id}-media-${index}`} item={item} isFa={isFa} />
              <span id={`${id}-context-${index}`} className={styles.metadata}><bdi>{item.sourceName}</bdi><time dateTime={item.publishedAt}>{Number.isFinite(Date.parse(item.publishedAt)) ? new Intl.DateTimeFormat(isFa ? "fa-IR" : "en-US", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" }).format(new Date(item.publishedAt)) : "—"}</time></span>
              <span id={`${id}-freshness-${index}`} className={styles.freshness}>{publicationLabel(item.publishedAt, now, isFa)}</span>
              <span className={styles.title} dir={isFa && item.translationPending && item.publicSummaryAllowed ? "ltr" : undefined}>{item.displayTitle}</span>
              <span id={`${id}-summary-${index}`} className={styles.summary} dir={isFa && item.translationPending && item.publicSummaryAllowed ? "ltr" : undefined}>{item.displayLead}</span>
              <span className={styles.action}>{isFa ? "خواندن این خبر" : "Read this story"}<span aria-hidden="true">{isFa ? "←" : "→"}</span></span>
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.position} role="status" aria-live="polite" aria-atomic="true">{isFa ? `تیتر ${number.format(active + 1)} از ${number.format(items.length)}` : `Headline ${number.format(active + 1)} of ${number.format(items.length)}`}</p>
    </nav>
  );
}
